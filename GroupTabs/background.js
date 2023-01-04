// Copyright (c) 2022 August Detlefsen. All rights reserved.
// Use of this source code is governed by an Apache-style license that can be
// found in the LICENSE file.

var removedTabs = new Set();
var newTabs = new Set();

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
 * Parses the domain name from the URL of the current tab.
 *
 * @param {function(string)} callback - called when the domain of the current tab
 *   is found.
 */
function getCurrentTabDomain(callback) {
  var queryInfo = {
    active: true,
    currentWindow: true
  };

  chrome.tabs.query(queryInfo, function(tabs) {
    // A window can only have one active tab at a time, so the array consists of
    // exactly one tab.
    var tab = tabs[0];

    // Get the tab URL
    var url = tab.url;

    //get the domain from the URL
    var domain = url.match(/^[\w-]+:\/{2,}\[?([\w\.:-]+)\]?(?::[0-9]*)?/)[1];

    callback(domain);
  });
}

/**
 * Groups all tabs with URLs matching a pattern into the same window
 */
async function groupTabs(urlPattern, windowId) {
  console.log("groupTabs: " + urlPattern);

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
        var tabId = (tabs.length > 0) ? tabs[0].id : null;
        chrome.windows.create({"tabId":tabId}, async function(window){

          console.log("window: " + JSON.stringify(window));

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
  var match = false;
  const urlsToGroup = await getObjectFromLocalStorage("urlsToGroup");
  console.log("urlsToGroup:");
  console.log(urlsToGroup);
  for (var i = 0; i < urlsToGroup.length; i++) {
    var rule = urlsToGroup[i];
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
  for (var i = 0; i < tabs.length; i++) {
    var tab = tabs[i];
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
  console.log("NOT foundWindow");
  //create a new window with the new tab
  chrome.windows.create({"tabId": tab.id}, async function (newWindow) {
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
  console.log("chrome.tabs.onUpdated: tabId: " + tabId + " status: " + changeInfo.status + " url: " + changeInfo.url + " tab: " + tab.url + " (" + ts + ")");
  console.log("alwaysGroup? " + alwaysGroup + " (" + ts + ")");
  console.log("newTabs? " + newTabs.has(tabId) + " (" + ts + ")");

  if (alwaysGroup &&
      newTabs.has(tabId) &&
      typeof changeInfo.url != 'undefined' &&
      !removedTabs.has(tabId)) {

    const urlsToGroup = await getObjectFromLocalStorage("urlsToGroup");

      let rules = urlsToGroup.filter(rule => matchRuleShort(changeInfo.url, rule.urlPattern));
      console.log("rules: " + JSON.stringify(rules) + " (" + ts + ")");
      if (rules.length < 1) return; //no matching rule for this URL, nothing to do

      //TODO: How do we distinguish between multiple match rules on the same domain? find the longest match rule?
      var rule = rules[0];
      //the new tab URL matches an existing group.
      console.log("match!" + " (" + ts + ")");

      //check that the window still exists
      if (typeof(rule.window) === 'undefined') {
        notFoundWindow(tab, rule, urlsToGroup);
      } else {
        //TODO: Fix this ugly branching
        //TODO: implement windows.onRemoved to curate this list so we don't have to make this call
        chrome.windows.get(rule.window, {populate: true}, function (foundWindow) {
          console.log("foundWindow: " + JSON.stringify(foundWindow) + " (" + ts + ")");
          if (foundWindow) {
            //Check for whether the new URL matches an existing tab
            //separate fragment for proper search matching
            var searchUrl = changeInfo.url.split('#')[0];
            var searchFrag = changeInfo.url.split('#')[1];
            console.log("searchFrag: " + searchFrag + " (" + ts + ")");

            //TODO: how do we handle GET query params on the same URL? For example, ?ts=78123768

            //Look for existing tabs with the same URL
            console.log("chrome.tabs.query() params: " + searchUrl + " (" + ts + ")");
            chrome.tabs.query({"url": searchUrl, "windowId": foundWindow.id}, function (tabs) {
              console.log("chrome.tabs.query() result: (" + tabs.length + ")" + JSON.stringify(tabs) + " (" + ts + ")");
              tabs = tabs.filter(t => t.id != tab.id);  //filter out the tab that is being updated
              console.log("chrome.tabs.query() filter result: (" + tabs.length + ")" + JSON.stringify(tabs) + " (" + ts + ")");

              //existing tabs found with same URL
              if (tabs.length > 0) { // && tabs[0].status === "complete") {
                for (var t = 0; t < tabs.length; t++) {
                  var foundTab = tabs[t];
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
              } else if (tab.windowId == foundWindow.id) {
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
              }
            });

          } else {
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
  const alwaysGroup = await getObjectFromLocalStorage("alwaysGroup");
  if (alwaysGroup) {
    newTabs.add(tab.id);
  }
});

chrome.tabs.onRemoved.addListener(function(tabId) {
  let ts = Date.now();
  console.log("chrome.tabs.onRemoved: tabId: " + tabId + " (" + ts + ")");
  removedTabs.delete(tabId);
});

chrome.windows.onRemoved.addListener(async function(winId) {
  console.log("chrome.windows.onRemoved: winId: " + winId);
  //remember the URL pattern and the new window it was grouped into
  const urlsToGroup = await getObjectFromLocalStorage("urlsToGroup");

  for (var i = 0; i < urlsToGroup.length; i++) {
    if (urlsToGroup[i].windowId === winId) {
      delete urlsToGroup[i].windowId;
      break;
    }
  }
  console.log("NEW urlsToGroup: ");
  console.log(urlsToGroup);
  await saveObjectInLocalStorage("urlsToGroup", urlsToGroup);
  //})
});

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
  const originalAlwaysGroup = await getObjectFromLocalStorage("alwaysGroup");

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
      for (var j = 0; j < foundTabs.length; j++) {
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

  const alwaysGroup = await getObjectFromLocalStorage("alwaysGroup");

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
  var regex = window.prompt('Enter URL regex to group (Use * for wildcard)', pageUrl);
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

/**
 * Retrieve object from Chrome's Local Storage Area
 * @param {string} key
 */
const getObjectFromLocalStorage = async function(key) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.get(key, function(value) {
        console.log("getObjectFromLocalStorage: " + key);
        console.log(value[key]);
        console.log("type: " + (typeof value[key]));
        if (typeof value[key] === "object") {
          console.log(value[key]);
          resolve(value[key]);
        } else if (value[key]) {
          const output = JSON.parse(value[key]);
          console.log(output);
          resolve(output);
        } else {
          resolve({});
        }
      });
    } catch (ex) {
      reject(ex);
    }
  });
};

/**
 * Save Object in Chrome's Local Storage Area
 * @param {*} obj
 */
const saveObjectInLocalStorage = async function(key, value) {
  return new Promise((resolve, reject) => {
    try {
      const valueString = JSON.stringify(value);

      console.log("saveObjectInLocalStorage: " + key + "=" + valueString);

      chrome.storage.local.set({[key]:valueString}, function() {
        resolve();
      });
    } catch (ex) {
      reject(ex);
    }
  });
};