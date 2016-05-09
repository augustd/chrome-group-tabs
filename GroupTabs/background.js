// Copyright (c) 2016 August Detlefsen. All rights reserved.
// Use of this source code is governed by an Apache-style license that can be
// found in the LICENSE file.

/**
 * Parses the domain name from the URL of the current tab.
 *
 * @param {function(string)} callback - called when the domain of the current tab
 *   is found.
 */
function getCurrentTabDomain(callback) {
  // Query filter to be passed to chrome.tabs.query - see
  // https://developer.chrome.com/extensions/tabs#method-query
  var queryInfo = {
    active: true,
    currentWindow: true
  };

  chrome.tabs.query(queryInfo, function(tabs) {
    // chrome.tabs.query invokes the callback with a list of tabs that match the
    // query. When the popup is opened, there is certainly a window and at least
    // one tab, so we can safely assume that |tabs| is a non-empty array.
    // A window can only have one active tab at a time, so the array consists of
    // exactly one tab.
    var tab = tabs[0];

    // A tab is a plain object that provides information about the tab.
    // See https://developer.chrome.com/extensions/tabs#type-Tab
    var url = tab.url;
    
    //get the domain
    var domain = url.match(/^[\w-]+:\/{2,}\[?([\w\.:-]+)\]?(?::[0-9]*)?/)[1];

    callback(domain);
  });
}
  
chrome.browserAction.onClicked.addListener(function() {
  getCurrentTabDomain(function(domain) {
    var urlPattern = "*://" + domain + "/*";
    groupTabs(urlPattern);
  });
});

/**
 * Groups all tabs with URLs matching a pattern
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
    });
  });  
}

/**
 * Add a context menu at startup to allow selecting partial URLs to group
 */
chrome.runtime.onInstalled.addListener(function() {
  var id = chrome.contextMenus.create({"title": "Specify Tab URLs to Group",
                                       "contexts":["all"],
                                       "id": "groupTabsContext"});
});

chrome.contextMenus.onClicked.addListener(function(info, tab) {
    if (info.menuItemId === "groupTabsContext") { 
        groupTabsContextOnClick(info, tab)
    }
});

/**
 * Callback function activated when the context menu item is clicked
 */ 
function groupTabsContextOnClick(info, tab) {
  console.log("info: " + JSON.stringify(info));
  console.log("tab: " + JSON.stringify(tab));
  
  var regex = window.prompt('Enter URL regex to group (Use * for wildcard)', info.pageUrl);
  
  groupTabs(regex);  
}