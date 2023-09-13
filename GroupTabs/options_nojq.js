// Restores state using the preferences stored in chrome.storage.
// generates list of windows and tabs
async function restore_options() {
  const urlsToGroup = await getObjectFromLocalStorage("urlsToGroup");

  const patterns = document.getElementById('patterns');
  urlsToGroup.forEach(function (pattern) {
    const patternUI = document.createElement('div');
    patternUI.classList.add("pattern", "visible");
    //patternUI.textContent = pattern.urlPattern;
    patternUI.innerHTML = '<div class="title">' + pattern.urlPattern + '</div><div class="reload"></div><div class="close"></div>';
    patternUI.setAttribute("winId", pattern.window);
    patternUI.addEventListener("click", function () {
      chrome.windows.update(parseInt(pattern.window), {focused: true});
    });
    //add to DOM
    patterns.appendChild(patternUI);

    //add event listeners for sub elements
    patternUI.querySelector(".close").addEventListener("click", function () {
      //remove grouping for this pattern
      chrome.runtime.sendMessage({greeting: "removeGroup", pattern: pattern.urlPattern}, function (response) {
      });

      //remove pattern from list in UI
      if (patternUI.parentElement.children.length > 1) {
        patternUI.remove(); //remove the one tab UI
      } else {
        patternUI.parentElement.remove(); //remove the whole window UI
      }
    });

    patternUI.querySelector(".reload").addEventListener("click", function () {
      groupTabs(pattern.urlPattern);
    });

  });

  //populate the UI with a list of all windows
  const windowsUI = document.getElementById('windows');
  chrome.windows.getCurrent(function (currentWindow) {
    chrome.windows.getAll({'populate': true}, function (winArray) {

      //sort the current window on top
      winArray.sort(function (a, b) {
        if (a.id == currentWindow.id) return -1;

        return 1;
      });
      for (var i = 0; i < winArray.length; i++) {
        const window = winArray[i];

        const winUI = document.createElement('div');
        winUI.className = "win";
        winUI.setAttribute("winId", window.id);

        const groupUrl = getUrlByWindowId(urlsToGroup, window.id);
        if (groupUrl) {
          winUI.innerHTML = '<div class="winTitle">Grouped Window - pattern: ' + groupUrl.urlPattern + '</div>';
        }

        for (var j = 0; j < window.tabs.length; j++) {
          const tab = window.tabs[j];
          const tabUI = document.createElement('div');

          tabUI.classList.add("tab", "visible");
          tabUI.setAttribute("tabId", tab.id);
          tabUI.setAttribute("winId", window.id);
          tabUI.setAttribute("url", tab.url);
          tabUI.setAttribute("title", tab.title);
          console.log(tab);
          //this renders the actual tab
          if (tab.favIconUrl) {
            tabUI.innerHTML = '<img src="' + tab.favIconUrl + '" class="fav">';
          } else {
            tabUI.innerHTML = '<div class="fav">';
          }
          tabUI.innerHTML += '<div class="title">' + tab.title + '</div><div class="copy"></div><div class="reload"></div><div class="close"></div>';

          tabUI.addEventListener("click", function(){
            console.log("tabUI clicked");
            chrome.windows.update(window.id,{focused:true});
            chrome.tabs.update(tab.id, {selected:true});
          });

          tabUI.querySelector(".close").addEventListener("click", function (event) {
            chrome.tabs.remove(tab.id);
            if (tabUI.parentElement.children.length > 1) {
              tabUI.remove(); //remove the one tab UI
            } else {
              tabUI.parentElement.remove(); //remove the whole window UI
            }
            event.stopPropagation();
          });

          tabUI.querySelector(".reload").addEventListener("click", function () {
            chrome.tabs.reload(tab.id);
          });

          tabUI.querySelector(".copy").addEventListener("click", async function (event) {
            //make sure this even does not propagate: that could cause us to lose focus on this tab
            //(e.g. swtiching to the clicked tab) and then the content script won't work.
            event.stopPropagation();

            //get the title and URL of the selected page to create the link
            await sendCopyMessage(tab.title, tab.url);
          });

          winUI.appendChild(tabUI);
        }

        windowsUI.appendChild(winUI);
      }
    });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const sendCopyMessage = function(title, url) {
  chrome.runtime.sendMessage({greeting: "log", message: "about to send copy message", "title": title, "url": url}, function (response) {});

  //close the popup window so we can get focus on the tab that contains the content script
  //sleep for a moment to ensure the window is closed
  //thanks to Gursev Singh Kalra for figuring this part out
  window.close();
  sleep(100);

  chrome.runtime.sendMessage({greeting: "log", message: "window closed"}, function (response) {});

  //get focus on the current tab (the tab must be focused for navigator.clipboard.write to work
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    //send message tothe content script to perform the copy
    chrome.tabs.sendMessage(tabs[0].id, {greeting: "copy", title: title, url: url}, function(response) {
      console.log(response);
    });
  });
}

function getUrlByWindowId(urls, winId) {
  var array = urls.filter(function(urls){ return urls.window === winId; });
  return array[0];
}

var ready = (callback) => {
  if (document.readyState !== "loading") callback();
  else document.addEventListener("DOMContentLoaded", callback);
}

ready(() => {
  console.log("ready");
  restore_options().then(() => {
      document.querySelectorAll(".close").forEach(function(item) {
        item.addEventListener("click", function() {
          console.log("close");
          const tabId = parseInt(item.parentElement.getAttribute('tabid'));
          console.log("close tab: " + tabId);
          chrome.tabs.remove(tabId);
          if (item.parentElement.parentElement.children.length > 1) {
            item.parentElement.remove(); //remove the one tab UI
          } else {
            item.parentElement.parentElement.remove(); //remove the whole window UI
          }
        });
      });

  });

  document.getElementById("patterns-toggle").addEventListener("click", function() {
    if (document.getElementById("patterns-toggle").classList.contains("shown")) {
      document.getElementById("patterns-toggle").classList.replace("shown", "collapsed");
      document.getElementById("patterns").classList.replace("visible","hidden");
    } else {
      document.getElementById("patterns-toggle").classList.replace("collapsed", "shown");
      document.getElementById("patterns").classList.replace("hidden","visible");
    }
  });

  document.getElementById("windows-toggle").addEventListener("click", function() {
    if (document.getElementById("windows-toggle").classList.contains("shown")) {
      document.getElementById("windows-toggle").classList.replace("shown", "collapsed");
      document.getElementById("search").classList.replace("visible","hidden");
      document.getElementById("windows").classList.replace("visible","hidden");
    } else {
      document.getElementById("windows-toggle").classList.replace("collapsed", "shown");
      document.getElementById("search").classList.replace("hidden","visible");
      document.getElementById("windows").classList.replace("hidden","visible");
    }
  });

  document.getElementById("groupThis").addEventListener("click", function(){
    getCurrentTabDomain(function(domain) {
      var urlPattern = "*://" + domain + "/*";
      chrome.runtime.sendMessage({greeting: "groupTabs", pattern: urlPattern}, function (response) {});
    });
  });

  document.getElementById("groupRegexShow").addEventListener("click", function(){
    document.getElementById("groupRegexForm").classList.toggle("visible");
  });

  //handle Custom group actions
  document.getElementById("groupRegexFormSubmit").addEventListener("click", function(event){
    event.preventDefault();
    const inputPattern = document.getElementById('groupRegexInput').value;
    const windowId = document.getElementById('windowId').value;
    console.log("Handler for .submit() called." + inputPattern);
    chrome.runtime.sendMessage({greeting: "groupTabs", pattern: inputPattern, "windowId": windowId}, function (response) {});  });

  //handle tab search actions
  const searchCriteria = document.getElementById("search-criteria");
  searchCriteria.addEventListener("change", function() {
    const searchString = searchCriteria.value;

    document.querySelectorAll(".win").forEach(function(win) {
      const tabArray = Array.from(win.children);
      tabArray.forEach((child) => {
        const textContent = (child.textContent || child.innerText).toLowerCase();
        const tabUrl = (child.getAttribute("url") || '').toLowerCase();


        // Check if the text content contains the search string
        if (textContent.includes(searchString) || tabUrl.includes(searchString)) {
          child.classList.add("visible"); // Show matching elements
        } else {
          child.classList.remove("visible"); // Hide non-matching elements
        }
      });
    })
  });
  searchCriteria.addEventListener("keyup", function (){
    const event = new Event("change");
    searchCriteria.dispatchEvent(event);
  });
  searchCriteria.focus(); //focus by default so we can start typing right away

  //handle removed tabs
  chrome.tabs.onRemoved.addListener(function(tabId, removeInfo) {
    document.querySelectorAll(".tab[tabId='" + tabId + "']").forEach((item) => item.remove());
  });

  //handle updated tabs
  chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    document.querySelectorAll(".tab[tabId='" + tabId + "']").forEach((item) => item.querySelector(".title").innerText = tab.title);
  });

  //handle tab detach events
  chrome.tabs.onDetached.addListener(function(tabId, detachInfo){
    document.querySelectorAll(".tab[tabId='" + tabId + "']").forEach((item) => item.remove());
  });

  //handle removed windows
  chrome.windows.onRemoved.addListener(function(windowId) {
    document.querySelectorAll(".win[winId='" + windowId + "']").forEach((item) => item.remove());
  });

  chrome.tabs.onAttached.addListener(function(tabId, attachInfo){
    chrome.tabs.get(tabId, function(tab){
      console.log('tab attached at position: ' + attachInfo.newPosition);
      renderTab(tab, attachInfo.newPosition);
    });
  });
});
