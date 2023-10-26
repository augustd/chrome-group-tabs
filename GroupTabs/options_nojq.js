// Restores state using the preferences stored in chrome.storage.
// generates list of windows and tabs
async function restore_options() {
  const urlsToGroup = await getObjectFromLocalStorage("urlsToGroup");

  const patterns = document.getElementById('patterns');
  urlsToGroup.forEach(function (pattern) {
    const patternUI = document.createElement('div');
    patternUI.classList.add("pattern", "visible");

    const title = document.createElement('div');
    title.classList.add('title');
    title.textContent = pattern.urlPattern;

    const reload = document.createElement('div');
    reload.classList.add('reload');

    const close = document.createElement('div');
    close.classList.add('close');

    const edit = document.createElement('div');
    edit.classList.add('edit');

    patternUI.appendChild(title);
    patternUI.appendChild(edit);
    patternUI.appendChild(reload);
    patternUI.appendChild(close);

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
      chrome.runtime.sendMessage({greeting: "groupTabs", pattern: pattern.urlPattern}, function (response) {
      });
    });

    patternUI.querySelector(".edit").addEventListener("click", function (event) {
      event.stopPropagation();

      const groupRegexForm = document.getElementById("groupRegexForm");
      const groupRegexInput = document.getElementById("groupRegexInput");
      const windowIdInput = document.getElementById("windowId");

      const titleElement = patternUI.querySelector(".title");

      // Populate the form inputs with data
      groupRegexInput.value = titleElement.textContent;
      windowIdInput.value = patternUI.getAttribute("winid");

      // Make the form visible
      groupRegexForm.style.display = "block";
    });

  });

  //populate the UI with a list of all windows
  const windowsUI = document.getElementById('windows');
  let windowCount = 0;
  let tabCount = 0;

  chrome.windows.getCurrent(function (currentWindow) {
    chrome.windows.getAll({'populate': true}, function (winArray) {

      //sort the current window on top
      winArray.sort(function (a, b) {
        if (a.id == currentWindow.id) return -1;

        return 1;
      });
      for (let i = 0; i < winArray.length; i++) {
        const window = winArray[i];
        windowCount++;

        const winUI = document.createElement('div');
        winUI.className = "win";
        winUI.setAttribute("winId", window.id);

        windowsUI.appendChild(winUI);

        const groupUrl = getUrlByWindowId(urlsToGroup, window.id);
        if (groupUrl) {
          const winTitle = document.createElement('div');
          winTitle.classList.add('winTitle');
          winTitle.textContent = 'Grouped Window - pattern: ' + groupUrl.urlPattern;

          winUI.appendChild(winTitle);
        }

        for (let j = 0; j < window.tabs.length; j++) {
          const tab = window.tabs[j];
          tabCount++;

          const tabUI = document.createElement('div');
          tabUI.classList.add("tab", "visible");
          tabUI.setAttribute("tabId", tab.id);
          tabUI.setAttribute("winId", window.id);
          tabUI.setAttribute("url", tab.url);
          tabUI.setAttribute("title", tab.title);
          console.log(tab);

          //this renders the actual tab
          if (tab.favIconUrl) {
            const favIcon = document.createElement('img');
            favIcon.setAttribute('src', tab.favIconUrl);
            favIcon.classList.add('fav');
            tabUI.appendChild(favIcon);
          } else {
            const favDiv = document.createElement('div');
            favDiv.classList.add('fav');
            tabUI.appendChild(favDiv);
          }

          const title = document.createElement('div');
          title.classList.add('title');
          title.textContent = tab.title;
          tabUI.appendChild(title);

          const copy = document.createElement('div');
          copy.classList.add('copy');
          tabUI.appendChild(copy);

          const reload = document.createElement('div');
          reload.classList.add('reload');
          tabUI.appendChild(reload);

          const close = document.createElement('div');
          close.classList.add('close');
          tabUI.appendChild(close);

          tabUI.addEventListener("click", function(){
            console.log("tabUI clicked");
            chrome.windows.update(window.id,{focused:true});
            chrome.tabs.update(tab.id, {selected:true});
          });

          close.addEventListener("click", function (event) {
            chrome.tabs.remove(tab.id);
            if (tabUI.parentElement.children.length > 1) {
              tabUI.remove(); //remove the one tab UI
            } else {
              tabUI.parentElement.remove(); //remove the whole window UI
            }
            event.stopPropagation();
          });

          reload.addEventListener("click", function () {
            chrome.tabs.reload(tab.id);
          });

          copy.addEventListener("click", async function (event) {
            //make sure this event does not propagate: that could cause us to lose focus on this tab
            //(e.g. swtiching to the clicked tab) and then the content script won't work.
            event.stopPropagation();

            //get the title and URL of the selected page to create the link
            await sendCopyMessage(tab.title, tab.url);
          });

          winUI.appendChild(tabUI);
        }

      }

      //populate a message containing the count of windows and tabs.
      document.getElementById("windowCount").innerText = windowCount;
      document.getElementById("tabCount").innerText = tabCount;
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
  const array = urls.filter(function (urls) {
    return urls.window === winId;
  });
  return array[0];
}

const ready = (callback) => {
  if (document.readyState !== "loading") callback();
  else document.addEventListener("DOMContentLoaded", callback);
};

ready(() => {
  console.log("ready");
  restore_options();

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
      const urlPattern = "*://" + domain + "/*";
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
    const searchString = searchCriteria.value.toLowerCase();

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

/**
 * Parses the domain name from the URL of the current tab.
 *
 * @param {function(string)} callback - called when the domain of the current tab
 *   is found.
 */
function getCurrentTabDomain(callback) {
  const queryInfo = {
    active: true,
    currentWindow: true
  };

  chrome.tabs.query(queryInfo, function(tabs) {
    // A window can only have one active tab at a time, so the array consists of
    // exactly one tab.
    const tab = tabs[0];

    // Get the tab URL
    const url = new URL(tab.url);

    //get the domain from the URL
    const domain = url.host;

    callback(domain);
  });
}

