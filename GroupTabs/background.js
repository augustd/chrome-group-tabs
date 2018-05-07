// Copyright (c) 2016 August Detlefsen. All rights reserved.
// Use of this source code is governed by an Apache-style license that can be
// found in the LICENSE file.

var urlsToGroup = [];
var alwaysGroup = true;
var newTabs     = [];

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
function groupTabs(urlPattern) {
  console.log("groupTabs: " + urlPattern);

  //check if we already have a window for this pattern
  getTabWindow(urlPattern, function(tabWindow){
    console.log("groupTabs: tabWindow: " + JSON.stringify(tabWindow));

    //get the tabs that match the URL pattern
    chrome.tabs.query({url:urlPattern}, function(tabs) {
      if (tabWindow) {
        moveTabs(tabs, tabWindow);

        //focus the window
        chrome.windows.update(tabWindow.id,{focused:true});

      } else {
        //no existing window for this pattern so create a new window
        var tabId = (tabs.length > 0) ? tabs[0].id : null;
        chrome.windows.create({"tabId":tabId}, function(window){

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
          chrome.storage.local.set({"urlsToGroup":urlsToGroup});
          console.log("urlsToGroup: " + JSON.stringify(urlsToGroup));
        });
      }

      console.log("urlsToGroup(2): " + JSON.stringify(urlsToGroup));  });
  });
}

function removeGroup(urlPattern) {
    chrome.storage.local.get({urlsToGroup: []}, function(items) {
      console.log("removeGroup(" + urlPattern + ")");
      var newUrls = items.urlsToGroup.filter(function(el) {
        console.log("el: " + JSON.stringify(el));
        return el.urlPattern != urlPattern;
      });

      chrome.storage.local.set({"urlsToGroup":newUrls});
      console.log("removeGroup(): " + JSON.stringify(newUrls));
    });
}

/**
 * Gets the window that a particular tab should be grouped into:
 *
 * 1. If a window exists for the passed match rule the callback is executed on that window
 * 2. If there is an existing match rule but the window no longer exists a new window will be created
 * 3. Otherwise return null
 */
function getTabWindow(tabUrl, callback) {
  console.log("getTabWindow: " + tabUrl);

  //are we dealing with a new regex?


  var match = false;
  for (var i = 0; i < urlsToGroup.length; i++) {
    var rule = urlsToGroup[i];
    console.log("rule: " + JSON.stringify(rule));
    if (matchRuleShort(tabUrl, rule.urlPattern)) {
      //the new tab URL matches an existing group.
      console.log("MATCH!");
      match = true;
      //check that the window still exists
      chrome.windows.get(rule.window, {populate:true}, function(foundWindow){
        if (foundWindow) {
          console.log("FOUND! " + foundWindow);
          callback(foundWindow);
        } else {
          //create a new window with the new tab
          chrome.windows.create({}, function(newWindow){ //"tabId":tab.id
            console.log("CREATED NEW! " + JSON.stringify(newWindow));

            //reassign the group pattern to the new window
            rule.window = newWindow.id
            chrome.storage.local.set({"urlsToGroup":urlsToGroup});

            callback(newWindow);
          });
        }
      });
      break;
    }
  }

  if (!match) {
    callback(null);
  }
}

/**
 * Move an array of tabs to a destination window
 */
function moveTabs(tabs, destination) {
  for (var i = 0; i < tabs.length; i++) {
    var tab = tabs[i];
    chrome.tabs.move(tab.id, {windowId:destination.id,index:-1});
  }
}

/**
 * Shorthand function to match a wildcard (*) string
 */
function matchRuleShort(str, rule) {
  return new RegExp("^" + rule.split("*").join(".*") + "$").test(str);
}

/**
 * Click handler action for the main extension button.
 *
 * Causes all tabs from the current domain to be grouped into one window
 */
/*
chrome.browserAction.onClicked.addListener(function() {
  getCurrentTabDomain(function(domain) {
    var urlPattern = "*://" + domain + "/*";
    groupTabs(urlPattern);
  });
});
*/

/**
 * Add a listener for new tab events
 */
chrome.tabs.onCreated.addListener(function(tabId, changeInfo, tab) {
  console.log("chrome.tabs.onCreated");
  if (alwaysGroup) {
    newTabs.push(tabId.id);
  }
});

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  console.log("chrome.tabs.onUpdated: status: " + changeInfo.status + " url: " + changeInfo.url);
  if (alwaysGroup) {
    console.log("alwaysGroup");
    //only group new tabs
    if (newTabs.indexOf(tabId) > -1) {
      chrome.storage.local.get({urlsToGroup: []}, function(items) {
        urlsToGroup = items.urlsToGroup;
        for (var i = 0; i < urlsToGroup.length; i++) {
          var rule = urlsToGroup[i];

          //TODO: How do we distinguish between multiple match rules on the same domain? find the longest match rule?


          if (matchRuleShort(changeInfo.url, rule.urlPattern)) {
            //the new tab URL matches an existing group.
            console.log("match");

            //check that the window still exists
            chrome.windows.get(rule.window, {populate:true}, function(foundWindow){
              if (foundWindow) {
                console.log("foundWindow: " + foundWindow.id);
                //Check for whether the new URL matches an existing tab
                var searchUrl = changeInfo.url.split('#')[0];  //remove fragment for proper search matching

                //TODO: how do we handle GET query params on the same URL? For example, ?ts=78123768

                chrome.tabs.query({"url":searchUrl,"windowId":foundWindow.id},function(tabs){
                  console.log("chrome.tabs.query: " + JSON.stringify(tabs));
                  if (tabs.length > 0 && tabs[0].status === "complete") {
                    //focus the existing tab with the same URL
                    //TODO: Make this configurable
                    focusTab(foundWindow, tabs[0]);

                    //reload to pick up new changes
                    chrome.tabs.reload(tabs[0].id);

                    //no need for the new tab
                    chrome.tabs.remove(tab.id);

                  } else {
                    //open the new tab in the group window
                    chrome.tabs.move(tab.id, {windowId:foundWindow.id,index:-1});

                    //focus the newly created tab
                    focusTab(foundWindow, tab);
                  }
                });

              } else {
                console.log("NOT foundWindow");
                //create a new window with the new tab
                chrome.windows.create({"tabId":tab.id}, function(newWindow){
                  console.log("New window created: " + newWindow.id);
                  //reassign the group pattern to the new window
                  rule.window = newWindow.id
                  console.log(JSON.stringify(urlsToGroup));
                  chrome.storage.local.set({"urlsToGroup":urlsToGroup});

                  //focus the newly created tab
                  focusTab(newWindow, tab);
                });
              }
            });
            break;
          }
        }
      });

      //this is no longer a new tab
      newTabs.splice(newTabs.indexOf(tab.id), 1);
    }
  }
});

/**
 * Give focus to a particular tab
 */
function focusTab(window, tab) {
  chrome.windows.update(window.id,{focused:true});
  chrome.tabs.update(tab.id, {selected:true});
}

/**
 * Add context menus at startup:
 * - Allow selecting partial URLs with wildcard
 * - Checkbox to determine whether to always group new tabs that match
 */
chrome.runtime.onInstalled.addListener(function() {
  chrome.contextMenus.create({"title": "Specify Tab URLs to Group",
                              "contexts":["all"],
                              "id": "groupTabsContext"});
  chrome.contextMenus.create({"title": "Always Group New Tabs",
                              "contexts":["all"],
                              "id": "groupTabsAlways",
                              "type": "checkbox",
                              "checked": alwaysGroup});
});

/**
 * Click handler for context menu items.
 */
chrome.contextMenus.onClicked.addListener(function(info, tab) {
    if (info.menuItemId === "groupTabsContext") {
      groupTabsContextOnClick(info.pageUrl, tab)
    } else if (info.menuItemId === "groupTabsAlways") {
      groupTabsAlwaysOnClick(info,tab);
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
function groupTabsAlwaysOnClick(info, tab) {
  alwaysGroup = info.checked;
}
