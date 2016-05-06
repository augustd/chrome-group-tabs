// Copyright (c) 2016 August Detlefsen. All rights reserved.
// Use of this source code is governed by an Apache-style license that can be
// found in the LICENSE file.

/**
 * Get the current URL.
 *
 * @param {function(string)} callback - called when the URL of the current tab
 *   is found.
 */
function getCurrentTabUrl(callback) {
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
  getCurrentTabUrl(function(domain) {
    
    var urlPattern = "*://" + domain + "/*";
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
  });
});
