// Copyright (c) 2016 August Detlefsen. All rights reserved.
// Use of this source code is governed by an Apache-style license that can be
// found in the LICENSE file.

var urlsToGroup = [];
var alwaysGroup = false;

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
  var queryInfo = {
    url: urlPattern
  };
  
  chrome.tabs.query(queryInfo, function(tabs) {
    chrome.windows.create({tabId:tabs[0].id}, function(window){
      for (var i = 1; i < tabs.length; i++) {
        var tab = tabs[i];
        chrome.tabs.move(tab.id, {windowId:window.id,index:-1});
      }
      chrome.windows.update(window.id,{focused:true});
      
      //remember the URL pattern and teh window it was grouped into
      urlsToGroup.push({"urlPattern":urlPattern,"window":window.id});
    });
  });  
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
chrome.browserAction.onClicked.addListener(function() {
  getCurrentTabDomain(function(domain) {
    var urlPattern = "*://" + domain + "/*";
    groupTabs(urlPattern);
  });
});

/**
 * Add a listener for new tab events
 */
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (alwaysGroup) {
    for (var i = 0; i < urlsToGroup.length; i++) {
      var rule = urlsToGroup[i];
      if (matchRuleShort(changeInfo.url, rule.urlPattern)) {
        //the new tab URL matches an existing group.
        //open the new tab in the group window
        chrome.tabs.move(tab.id, {windowId:rule.window,index:-1});
        
        //focus the newly created tab
        chrome.windows.update(rule.window,{focused:true});
        chrome.tabs.update(tab.id, {selected:true});
      }
    }
  }
});

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
                              "type": "checkbox"});
});

/**
 * Click handler for context menu items.
 */
chrome.contextMenus.onClicked.addListener(function(info, tab) {
    if (info.menuItemId === "groupTabsContext") { 
      groupTabsContextOnClick(info, tab)
    } else if (info.menuItemId === "groupTabsAlways") {
      groupTabsAlwaysOnClick(info,tab);
    }
});

/**
 * Callback function activated when the context menu item is clicked
 */ 
function groupTabsContextOnClick(info, tab) {
  var regex = window.prompt('Enter URL regex to group (Use * for wildcard)', info.pageUrl);
  
  groupTabs(regex);  
}

/**
 * Callback function activated when the context menu item is clicked
 */ 
function groupTabsAlwaysOnClick(info, tab) {
  alwaysGroup = info.checked;
}