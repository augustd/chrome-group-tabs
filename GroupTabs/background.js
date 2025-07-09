// Copyright (c) 2022 August Detlefsen. All rights reserved.
// Use of this source code is governed by an Apache-style license that can be
// found in the LICENSE file.

importScripts("local_storage.js");

const removedTabs = new Set();
const newTabs = new Set();


/**
 * Message dispatcher
 */
chrome.runtime.onMessage.addListener(
    async function(request, sender, sendResponse) {
      if (request.greeting == "log") {
        console.log(request);
        sendResponse({farewell: "logged"});
      } else if (request.greeting == "removeGroup") {
        removeGroup(request.pattern);
      } else if (request.greeting == "groupTabs") {
        groupTabs(request.pattern, request.windowId);
      }
    }
);

/**
 * Groups all tabs with URLs matching a pattern into the same window
 */
async function groupTabs(urlPattern, windowId) {
  console.log("groupTabs: " + urlPattern + " windowId: " + windowId);

  //check if we already have a window for this pattern
  await getTabWindow(urlPattern, windowId, async function(tabWindow){
    console.log("groupTabs: tabWindow: " + JSON.stringify(tabWindow));
    const urlsToGroup = await getObjectFromLocalStorage("urlsToGroup");

    //get the tabs that match the URL pattern
    chrome.tabs.query({url:urlPattern}, function(tabs) {
      if (tabWindow) {
        moveTabs(tabs, tabWindow);

        //focus the window
        chrome.windows.update(tabWindow.id,{focused:true});

      } else {
        //no existing window for this pattern so create a new window
        const tabId = (tabs.length > 0) ? tabs[0].id : null;
        chrome.windows.create({"tabId":tabId}, async function(window){
          console.log("window: " + JSON.stringify(window));

          //new windows are always created with a blank tab. If we have passed in a tab, remove the blank one
          /*
          if (tabId !== null) {
            window.tabs[0].remove();
          }
           */

          //remove the first element from the tabs array -it has already been added to the window
          //tabs.splice(0,1);
          console.log("tabs: " + JSON.stringify(tabs));

          moveTabs(tabs, window);
          console.log("moveTabs done");

          //focus the window
          chrome.windows.update(window.id,{focused:true});
          console.log("window focused");

          //remember the URL pattern and the new window it was grouped into
          urlsToGroup.push({"urlPattern":urlPattern,"window":window.id});
          console.log("NEW urlsToGroup: ");
          console.log(urlsToGroup);
          await saveObjectInLocalStorage("urlsToGroup", urlsToGroup);
        });
      }

      console.log("urlsToGroup(2): ");
      console.log(urlsToGroup);
    });
  });
}

async function removeGroup(urlPattern) {
  console.log("removeGroup(" + urlPattern + ")");
  const urlsToGroup = await getObjectFromLocalStorage("urlsToGroup");
  let newUrls = urlsToGroup.filter(function(el) {
    console.log("el: " + JSON.stringify(el));
    return el.urlPattern != urlPattern;
  });
  await saveObjectInLocalStorage("urlsToGroup", newUrls);
  console.log("removeGroup() output: ");
  console.log(newUrls);
}

/**
 * Gets the window that a particular tab should be grouped into:
 *
 * 1. If a window exists for the passed match rule the callback is executed on that window
 * 2. If there is an existing match rule but the window no longer exists a new window will be created
 * 3. Otherwise return null
 */
async function getTabWindow(tabUrl, windowId, callback) {
  console.log("getTabWindow: " + tabUrl + " windowId: " + windowId);

  if (windowId) windowId = parseInt(windowId); //needs to be a number for chrome.tabs.get

  //are we dealing with a new regex?
  let match = false;
  const urlsToGroup = await getObjectFromLocalStorage("urlsToGroup");
  console.log("urlsToGroup:");
  console.log(urlsToGroup);
  for (let i = 0; i < urlsToGroup.length; i++) {
    const rule = urlsToGroup[i];
    console.log("rule: " + JSON.stringify(rule));
    if (matchRuleShort(tabUrl, rule.urlPattern)) {
      //the new tab URL matches an existing group.
      console.log("MATCH!");
      match = true;

      //if we have a new window ID passed in, use that
      if (windowId) {
        console.log("Setting windowId to: " + windowId);
        rule.window = windowId;
        console.log("updated rule: ");
        console.log(rule);
        console.log("urlsToGroup:");
        console.log(urlsToGroup);

        await saveObjectInLocalStorage("urlsToGroup", urlsToGroup);
      }

      //check that the window still exists
      console.log("checking for existing window for rule: ");
      console.log(rule);
      if (rule.window === undefined) {
        rule.window = 0;  //handle default case
      }
      chrome.windows.get(rule.window, {populate:true}, function(foundWindow){
        if (foundWindow) {
          console.log("FOUND! " + foundWindow);
          callback(foundWindow);
        } else {
          //create a new window with the new tab
          chrome.windows.create({}, async function(newWindow){ //"tabId":tab.id
            console.log("CREATED NEW! " + JSON.stringify(newWindow));

            //reassign the group pattern to the new window
            rule.window = newWindow.id
            await saveObjectInLocalStorage("urlsToGroup", urlsToGroup);
            callback(newWindow);
          });
        }
      });
    }
  }

  //no matching rule was found
  if (!match) {
    console.log("No match to existing rule");
    //if we have a new window ID passed in, try to use that
    if (windowId) {
      //check that the window still exists
      console.log("checking whether window " + windowId + " exists");
      chrome.windows.get(windowId, {populate: true}, async function(foundWindow) {
        if (foundWindow) {
          console.log("Existing window FOUND! " + foundWindow);
          callback(foundWindow);

          //associate the pattern with the new window
          let rule = new Object();
          rule.urlPattern = tabUrl;
          rule.window = windowId;
          urlsToGroup.push(rule);
          await saveObjectInLocalStorage("urlsToGroup", urlsToGroup);

        } else {
          //window does not exist, return null and a new window will be created
          console.log("Window " + windowId + " DOES NOT exist");
          callback(null);
        }
      });
    } else {
      //windowId not passed, return null and a new window will be created
      console.log("windowId is null");
      callback(null);
    }
  }
}

/**
 * Move an array of tabs to a destination window
 */
function moveTabs(tabs, destination) {
  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i];
    if (tab.pinned) {
      continue; //skip pinned tabs
    }
    chrome.tabs.move(tab.id, {windowId:destination.id,index:-1});
  }
}

/**
 * Shorthand function to match a wildcard (*) string
 */
function matchRuleShort(str, rule) {
  return new RegExp("^" + rule.split("*").join(".*") + "$").test(str);
}

async function notFoundWindow(tab, rule, urlsToGroup) {
  console.log("NOT foundWindow: rule: ");
  console.log(rule);
  //create a new window with the new tab
  chrome.windows.create({"tabId": tab.id, width:rule.width, height:rule.height, top:rule.top, left:rule.left}, async function (newWindow) {
    console.log("New window created: " + newWindow.id + " rule: " + JSON.stringify(rule));

    //reassign the group pattern to the new window
    rule.window = newWindow.id

    console.log("NEW urlsToGroup: ");
    console.log(urlsToGroup);
    await saveObjectInLocalStorage("urlsToGroup", urlsToGroup);

    //focus the newly created tab
    console.log("about to call focusTab from within NOT foundWindow");
    tab.windowId = newWindow.id;
    tab.index = 0;
    focusTab(tab);
  });
}

/**
 * Add a listener for tab update events
 */
chrome.tabs.onUpdated.addListener(async function(tabId, changeInfo, tab) {
  let ts = Date.now();
  let alwaysGroup = await getObjectFromLocalStorage("alwaysGroup");
  alwaysGroup = !!alwaysGroup;
  console.log("chrome.tabs.onUpdated: tabId: " + tabId + " status: " + changeInfo.status + " url: " + changeInfo.url + " tab: " + tab.url + " (" + ts + ")");
  console.log("alwaysGroup? " + alwaysGroup + " (" + ts + ")");
  console.log("newTabs? " + newTabs.has(tabId) + " (" + ts + ")");

  if (alwaysGroup &&
      newTabs.has(tabId) &&
      typeof changeInfo.url != 'undefined' &&
      !removedTabs.has(tabId)) {

    const urlsToGroup = await getObjectFromLocalStorage("urlsToGroup");

    //get a proper URL object
    const url = new URL(changeInfo.url);

    //google wraps every URL with its scraper, remove that
    let unwrappedUrl = url;
    console.log("url: host: " + url.host + " pathname: " + url.pathname);
    if (url.host === "www.google.com" && url.pathname === "/url") {
      const searchParams = url.searchParams;
      console.log("url: q: " + searchParams.get("q"));
      if (searchParams && searchParams.get("q")) {
        unwrappedUrl = new URL(searchParams.get("q"));
      }
    }

    console.log("Original URL:  " + url);
    console.log("Unwrapped URL: " + unwrappedUrl);

    //does this new URL match one of the URLs we are supposed to group?
    let rules = urlsToGroup.filter(rule => matchRuleShort(unwrappedUrl.href, rule.urlPattern));
    console.log("rules: " + JSON.stringify(rules) + " (" + ts + ")");
    if (rules.length < 1) return; //no matching rule for this URL, nothing to do

    //TODO: How do we distinguish between multiple match rules on the same domain? find the longest match rule?
    const rule = rules[0];
    //the new tab URL matches an existing group.
      console.log("match!" + " (" + ts + ")");

      //check that the window still exists
      if (typeof(rule.window) === 'undefined') {
        //we have a rule, but the rule does not have a window ID assigned to it
        notFoundWindow(tab, rule, urlsToGroup);
      } else {
        //TODO: Fix this ugly branching
        //TODO: implement windows.onRemoved to curate this list so we don't have to make this call
        //we have a rule with a window ID assigned, so get the window by ID
        chrome.windows.get(rule.window, {populate: true}, function (foundWindow) {
          console.log("foundWindow: " + JSON.stringify(foundWindow) + " (" + ts + ")");
          if (foundWindow) {
            //an existing window was found with that ID

            //Get URL to search for, excluding query params and fragment
            //Add wildcard to account for existing windows with parameters
            const searchUrl = unwrappedUrl.protocol + '//' + unwrappedUrl.host + unwrappedUrl.pathname + "*";

            //Look for existing tabs with the same URL
            console.log("chrome.tabs.query() params: " + searchUrl + " (" + ts + ")");
            chrome.tabs.query({"url": searchUrl, "windowId": foundWindow.id}, function (tabs) {
              console.log("chrome.tabs.query() result: (" + tabs.length + ")" + JSON.stringify(tabs) + " (" + ts + ")");
              tabs = tabs.filter(t => t.id !== tab.id);  //filter out the tab that is being updated
              console.log("chrome.tabs.query() filter result: (" + tabs.length + ")" + JSON.stringify(tabs) + " (" + ts + ")");

              //existing tabs found with same URL
              if (tabs.length > 0) { // && tabs[0].status === "complete") {
                for (let t = 0; t < tabs.length; t++) {
                  const foundTab = tabs[t];
                  console.log("checking foundTab in tabs: " + JSON.stringify(foundTab) + " (" + ts + ") t: " + t);
                  //remove existing tab and move new tab into old one's position
                  let tabIndex = foundTab.index;
                  let tabGroup = foundTab.groupId;
                  console.log("foundTab.group: " + tabGroup);
                  console.log("removing tab: " + foundTab.id + " (" + ts + ") t: " + t);
                  chrome.tabs.remove(foundTab.id, function () {
                    removedTabs.add(foundTab.id);
                  });
                  console.log("remove complete: " + foundTab.id + " (" + ts + ") t: " + t);

                  chrome.tabs.move(tab.id, {windowId: foundWindow.id, index: tabIndex}, function (movedTab) {
                    if (tabGroup && tabGroup >= 0) {
                      chrome.tabs.group({groupId:tabGroup, tabIds:[movedTab.id]});
                    }

                    console.log("about to call focusTab from within move(1)");
                    focusTab(movedTab);
                  });
                }

                refocusPreviousTab();

              } else if (tab.windowId === foundWindow.id) {
                //tab already exists, it is in the group window already, focus it
                console.log("about to call focusTab from within move(2)");
                focusTab(tab);

              } else {
                //open the new tab in the group window
                chrome.tabs.move(tab.id, {windowId: foundWindow.id, index: -1}, function (movedTab) {
                  //focus the newly created tab
                  console.log("about to call focusTab from within move(3)");
                  focusTab(movedTab);
                });

                refocusPreviousTab()
              }
            });

          } else {
            //no window was found with the specified ID
            console.error("notFoundWindow(2) called - this should not happen");
            console.error(tab);
            console.error(rule);
            console.error(urlsToGroup);
            notFoundWindow(tab, rule, urlsToGroup);
          } // END if (foundWindow)
        }); // END chrome.windows.get
      } // END if (typeof(rule.window) === 'undefined')
  }
});

chrome.tabs.onCreated.addListener(async function(tab) {
  let alwaysGroup = await getObjectFromLocalStorage("alwaysGroup");
  alwaysGroup = !!alwaysGroup;
  if (alwaysGroup) {
    newTabs.add(tab.id);
  }
});

chrome.tabs.onRemoved.addListener(function(tabId) {
  let ts = Date.now();
  console.log("chrome.tabs.onRemoved: tabId: " + tabId + " (" + ts + ")");
  removedTabs.delete(tabId);

  // Remove the closed tab's ID from the history
  tabHistory = tabHistory.filter(id => id !== tabId);

  console.log("Updated tab history:", tabHistory);
});

chrome.windows.onRemoved.addListener(async function(winId) {
  console.log("chrome.windows.onRemoved: winId: " + winId);
  //remember the URL pattern and the new window it was grouped into
  const urlsToGroup = await getObjectFromLocalStorage("urlsToGroup");

  for (let i = 0; i < urlsToGroup.length; i++) {
    if (urlsToGroup[i].window === winId) {
      delete urlsToGroup[i].window;
      break;
    }
  }
  console.log("NEW urlsToGroup: ");
  console.log(urlsToGroup);
  await saveObjectInLocalStorage("urlsToGroup", urlsToGroup);
  //})

  //get the tabs that were in the window and remove them from the tab history
  chrome.tabs.query({ windowId: winId }, (tabs) => {
    tabs.forEach((tab) => {
      // Remove tab ID from tabHistory
      tabHistory = tabHistory.filter(tabId => tabId !== tab.id);
    });
    console.log(`Tabs from window ${winId} removed from tab history`);
  });

});

let tabHistory = []; // Queue to store the history of active tabs
let currentTabIndex = -1; // To track the current tab index in the history
const MAX_HISTORY_SIZE = 50; // Limit the queue size

// Function to add a tab to the history queue
function addToTabHistory(tabId) {
  // Don't add the tab if it's already the most recent one in the history
  if (tabHistory[currentTabIndex] === tabId) {
    return; // Tab is already the current tab, no need to add it again
  }

  // Clear forward history if we're navigating to a new tab
  if (tabHistory[currentTabIndex] !== tabId) {
    tabHistory = tabHistory.slice(0, currentTabIndex + 1);  // Keep only history up to current tab
  }

  // Add the new active tab to the history
  tabHistory.push(tabId);

  // Enforce the maximum history size
  if (tabHistory.length > MAX_HISTORY_SIZE) {
    tabHistory.shift();  // Remove the oldest tab from the history
  }

  // Update the index to the latest tab
  currentTabIndex = tabHistory.length - 1;

  console.log(`Updated index: ${currentTabIndex} tab history: ${tabHistory}`);
}

// Listen for tab activation
chrome.tabs.onActivated.addListener((activeInfo) => {
  console.log("Tab activated:", activeInfo.tabId);
  addToTabHistory(activeInfo.tabId);
});

// Listen for window focus changes
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    console.log("No focused window.");
    return;
  }

  // Get the active tab in the focused window
  chrome.tabs.query({ active: true, windowId: windowId }, (tabs) => {
    if (tabs.length > 0) {
      const activeTab = tabs[0];
      console.log("Window focus changed. Active tab:", activeTab.id);
      addToTabHistory(activeTab.id);
    }
  });
});

function refocusPreviousTab() {
  if (tabHistory.length < 2) {
    console.log("No previous tab to refocus.");
    return; // Not enough history to refocus
  }

  // Get the second-to-last tab ID
  const previousActiveTabId = tabHistory[tabHistory.length - 2];

  // Refocus the previous tab
  chrome.tabs.update(previousActiveTabId, { active: true }, () => {
    console.log("Refocused to previous tab:", previousActiveTabId);
  });
}

// Function to go back to the previous tab
async function navigateBack() {
  // If there's not enough history or we're already at the start of the history, return
  if (currentTabIndex <= 0 || tabHistory.length < 2) {
    return; // Not enough history to navigate back
  }

  // Decrement the index to go to the previous tab
  currentTabIndex--;

  const previousTabId = tabHistory[currentTabIndex];

  if (previousTabId) {
    chrome.tabs.update(previousTabId, { active: true }, (tab) => {
      chrome.windows.update(tab.windowId, { focused: true });
      console.log("Navigated back to tab:", previousTabId);
    });
  }
}

async function navigateForward() {
  if (currentTabIndex >= tabHistory.length - 1 || tabHistory.length < 2) {
    return; // No tab to navigate forward to
  }

  // Increment the index to get the next tab
  currentTabIndex++;

  const nextTabId = tabHistory[currentTabIndex];

  if (nextTabId) {
    chrome.tabs.update(nextTabId, { active: true }, (tab) => {
      chrome.windows.update(tab.windowId, { focused: true });
      console.log("Navigated forward to tab:", nextTabId);
    });
  }
}

// Function to simulate "Command+[" behavior
chrome.commands.onCommand.addListener((command) => {
  if (command === "navigate_back") {
    navigateBack();
  } else if (command === "navigate_forward") {
    navigateForward();
  }
});

chrome.windows.onBoundsChanged.addListener( async function(window) {
  console.log("chrome.windows.onBoundsChanged: winId: " + window.id);

  //get the list of URLs to group
  const urlsToGroup = await getObjectFromLocalStorage("urlsToGroup");

  //is the newly resized window one of the ones we care about?
  for (let i = 0; i < urlsToGroup.length; i++) {
    if (urlsToGroup[i].window === window.id) {
      urlsToGroup[i].top = window.top;
      urlsToGroup[i].left = window.left;
      urlsToGroup[i].height = window.height;
      urlsToGroup[i].width = window.width;

      console.log("NEW urlsToGroup: ");
      console.log(urlsToGroup);
      await saveObjectInLocalStorage("urlsToGroup", urlsToGroup);

      break;
    }
  }
})

/**
 * Give focus to a particular tab
 */
function focusTab(tab) {
  console.log("focusTab("+ tab.windowId +", " + JSON.stringify(tab) + ")");
  chrome.windows.update(tab.windowId,{focused:true}, function(window) {
    chrome.tabs.highlight({windowId:tab.windowId, tabs:tab.index});

    //this is no longer a new tab
    newTabs.delete(tab.id);
  });
}

async function startup(){
  console.log("startup");

  //what was the previous state of alwaysGroup?
  let originalAlwaysGroup = await getObjectFromLocalStorage("alwaysGroup");
  originalAlwaysGroup = !!originalAlwaysGroup; //ensure it is a boolean
  console.log("Original alwaysGroup:");
  console.log(originalAlwaysGroup);


  //disable grouping for now
  await saveObjectInLocalStorage("alwaysGroup", false);

  //get the set of domains to group
  const urlsToGroup = await getObjectFromLocalStorage("urlsToGroup");

  for (let i = 0; i < urlsToGroup.length; i++) {
    let urlToGroup = urlsToGroup[i];
    console.log(urlToGroup);
    console.log({url:urlToGroup.urlPattern});

    //see if we already have a window that matches and assign it to the group
    chrome.tabs.query({url:urlToGroup.urlPattern}, async function(foundTabs) {
      //count the window IDs for each found tab. Window with greatest frequency becomes the new group window
      console.log("startup: urlPattern: " + urlToGroup.urlPattern + " foundTabs: " + JSON.stringify(foundTabs));
      let winMap = new Map();
      for (let j = 0; j < foundTabs.length; j++) {
        let foundTab = foundTabs[j];
        let count = winMap.get(foundTab.windowId);
        count = (count) ? count : 0;
        winMap.set(foundTab.windowId, count+1);
      }
      let winMapSorted = new Map([...winMap.entries()].sort((a, b) => b[1] - a[1]));
      let foundWindowId = winMapSorted.keys().next().value;
      urlToGroup.window = foundWindowId;
      console.log("sorted. foundWindowId: " + foundWindowId);

      urlsToGroup[i] = urlToGroup;
      console.log("NEW urlsToGroup: ");
      console.log(urlsToGroup);
      await saveObjectInLocalStorage("urlsToGroup", urlsToGroup);
    });
  }

  //make sure it worked
  const finalUrlsToGroup = await getObjectFromLocalStorage("urlsToGroup");
  console.log("FINAL urlsToGroup: ");
  console.log(finalUrlsToGroup);

  //set alwaysGroup back to its original state
  await saveObjectInLocalStorage("alwaysGroup", originalAlwaysGroup);
}

/**
 * Run the startup function
 */
chrome.runtime.onStartup.addListener(async function() {
  console.log("onStartup");
  //wait for startup to complete
  startup().then(async function() {
    console.log("runStartup complete");
    //enable auto grouping only after startup completes
    //await saveObjectInLocalStorage("alwaysGroup", true);
  });
});

/**
 * Add context menus at startup:
 * - Allow selecting partial URLs with wildcard
 * - Checkbox to determine whether to always group new tabs that match
 */
chrome.runtime.onInstalled.addListener(async function() {
  console.log("onInstalled");
  //const alwaysGroup = false;
  //await saveObjectInLocalStorage("alwaysGroup", alwaysGroup);

  await startup().then(async function() {
    console.log("runStartup complete");
  });

  let alwaysGroup = await getObjectFromLocalStorage("alwaysGroup");
  alwaysGroup = !!alwaysGroup;
  console.log("alwaysGroup from local:")
  console.log(alwaysGroup);

  chrome.contextMenus.create({"title": "Copy Link to this page",
                              "contexts":["all"],
                              "id": "copyLink"});
  chrome.contextMenus.create({"title": "Specify Tab URLs to Group",
                              "contexts":["all"],
                              "id": "groupTabsContext"});
  chrome.contextMenus.create({"title": "Always Group New Tabs",
                              "contexts":["all"],
                              "id": "groupTabsAlways",
                              "type": "checkbox",
                              "checked": alwaysGroup});

  //enable auto grouping only after startup completes
  //await saveObjectInLocalStorage("alwaysGroup", true);
});

/**
 * Click handler for context menu items.
 */
chrome.contextMenus.onClicked.addListener(function(info, tab) {
    if (info.menuItemId === "groupTabsContext") {
      groupTabsContextOnClick(info.pageUrl, tab)
    } else if (info.menuItemId === "groupTabsAlways") {
      groupTabsAlwaysOnClick(info,tab);
    } else if (info.menuItemId === "copyLink") {
      copyLink(info.pageUrl, tab);
    }
});

/**
 * Callback function activated when the context menu item is clicked
 */
function groupTabsContextOnClick(pageUrl, tab) {
  const regex = window.prompt('Enter URL regex to group (Use * for wildcard)', pageUrl);
  if (regex) groupTabs(regex);
}

/**
 * Callback function activated when the context menu item is clicked
 */
async function groupTabsAlwaysOnClick(info, tab) {
  const alwaysGroup = info.checked;
  await saveObjectInLocalStorage("alwaysGroup", alwaysGroup);
}

/**
 * Callback function activated when the context menu item is clicked
 */
async function copyLink(url, tab) {

  const title = tab.title;

  console.log("about to send copy message. title: " + title + " url: " + url);
  chrome.tabs.sendMessage(tab.id, {greeting: "copy", title: title, url: url}, function(response) {
    console.log(response);
  });
}
