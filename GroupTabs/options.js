// Restores state using the preferences stored in chrome.storage.
// generates list of windows and tabs
async function restore_options() {
  const urlsToGroup = await getObjectFromLocalStorage("urlsToGroup");

  const patterns = document.getElementById('patterns');
  urlsToGroup.forEach(function(pattern){
    const patternUI = document.createElement('div');
    patternUI.className = "pattern";
      //patternUI.textContent = pattern.urlPattern;
      patternUI.innerHTML = '<div class="title">' + pattern.urlPattern + '</div><div class="reload"></div><div class="close"></div>';
      patternUI.setAttribute("winId", pattern.window);
      $(patternUI).click(function(){
        chrome.windows.update(parseInt($(this).attr('winid')),{focused:true});
      });
      $(patternUI).hover(function(){
        $(this).find( ".close" ).show().click(function() {
          //remove grouping for this pattern
          chrome.runtime.sendMessage({greeting: "removeGroup", pattern: pattern.urlPattern}, function (response) {});
          if ($(this).parent().parent().children().length > 1) {
            $(this).parent().remove(); //remove the one tab UI
          } else {
            $(this).parent().parent().remove(); //remove the whole window UI
          }
        });
        $(this).find( ".reload" ).show().click(function() {
          //regroup this pattern
          groupTabs(pattern.urlPattern);
        });
      },function(){
        $(this).find( ".close" ).hide();
        $(this).find( ".reload" ).hide();
      });

      patterns.appendChild(patternUI);
    });

    //populate the UI with a list of all windows
    var windowsUI = document.getElementById('windows');
    chrome.windows.getCurrent(function(currentWindow){
      chrome.windows.getAll({'populate':true},function(winArray) {

        //sort the current window on top
        winArray.sort(function(a,b) {
          if (a.id == currentWindow.id) return -1;

          return 1;
        });
        for (var i = 0; i < winArray.length; i++) {
          var window = winArray[i];

          var winUI = document.createElement('div');
          winUI.className = "win";
          winUI.setAttribute("winId", window.id);

          var groupUrl = getUrlByWindowId(urlsToGroup, window.id);
          if (groupUrl) {
            winUI.innerHTML = '<div class="winTitle">Grouped Window - pattern: ' + groupUrl.urlPattern + '</div>';
          }

          for (var j = 0; j < window.tabs.length; j++) {
            var tab = window.tabs[j];
            var tabUI = document.createElement('div');

            tabUI.className = "tab";
            tabUI.setAttribute("tabId", tab.id);
            tabUI.setAttribute("winId", window.id);
            tabUI.setAttribute("url", tab.url);
            tabUI.setAttribute("title", tab.title);
            console.log(tab);
            //this renders the actual tab
            tabUI.innerHTML = '<img src="' + tab.favIconUrl + '" class="fav"><div class="title">' + tab.title + '</div><div class="copy"></div><div class="reload"></div><div class="close"></div>';

            $(tabUI).hover(function(){
              $(this).find( ".close" ).show().click(function() {
                chrome.tabs.remove(parseInt($(this).parent().attr('tabid')));
                if ($(this).parent().parent().children().length > 1) {
                  $(this).parent().remove(); //remove the one tab UI
                } else {
                  $(this).parent().parent().remove(); //remove the whole window UI
                }
              });
              $(this).find( ".reload" ).show().click(function() {
                chrome.tabs.reload(parseInt($(this).parent().attr('tabid')));
              });
              $(this).find( ".copy" ).show().click(async function(event) {
                //make sure this even does not propagate: that could cause us to lose focus on this tab
                //(e.g. swtiching to the clicked tab) and then the content script won't work.
                event.stopPropagation();

                //get the title and URL of teh selected page to create the link
                const title = $(this).parent().attr("title");
                const url = $(this).parent().attr("url");

                await sendCopyMessage(title, url);
              });
            },function(){
              $(this).find( ".close" ).hide();
              $(this).find( ".reload" ).hide();
              $(this).find( ".copy" ).hide();
            });

            $(tabUI).click(function(){
              console.log("tabUI clicked");
              chrome.windows.update(parseInt($(this).attr('winid')),{focused:true});
              chrome.tabs.update(parseInt($(this).attr('tabid')), {selected:true});
            });

            winUI.appendChild(tabUI);
          }

          windowsUI.appendChild(winUI);
        }
        setTimeout(function(){$("#windows").slideDown(50)}, 50); //prevent window initial scroll bug
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

async function renderWindow(windowId) {
  let windowsUI = document.getElementById('windows');
  const winUI = document.createElement('div');
  winUI.className = "win";
  winUI.setAttribute("winId", windowId);

  const urlsToGroup = await getObjectFromLocalStorage("urlsToGroup");

  const groupUrl = getUrlByWindowId(urlsToGroup, windowId);
  if (groupUrl) {
    winUI.innerHTML = '<div class="winTitle">Grouped Window - pattern: ' + groupUrl.urlPattern + '</div>';
  }
  windowsUI.appendChild(winUI);
}

function renderTab(tab, position) {
  const tabUI = document.createElement('div');

  tabUI.className = "tab";
  tabUI.setAttribute("tabId", tab.id);
  tabUI.setAttribute("winId", tab.windowId);
  tabUI.setAttribute("url", tab.url);
  tabUI.setAttribute("title", tab.title);
  tabUI.innerHTML = '<div class="title"><img src="' + tab.favIconUrl + '" style="fav">' + tab.title + '</div><div class="reload"></div><div class="close"></div>';
  $(tabUI).click(function(){
    chrome.windows.update(parseInt($(this).attr('winid')),{focused:true});
    chrome.tabs.update(parseInt($(this).attr('tabid')), {selected:true});
  });

  $(tabUI).hover(function(){
    $(this).find( ".close" ).show().click(function(event) {
      chrome.tabs.remove(parseInt($(this).parent().attr('tabid')));
      if ($(this).parent().parent().children().length > 1) {
        $(this).parent().remove(); //remove the one tab UI
      } else {
        $(this).parent().parent().remove(); //remove the whole window UI
      }
      event.stopPropagation();
    });
    $(this).find( ".reload" ).show().click(function() {
      chrome.tabs.reload(parseInt($(this).parent().attr('tabid')));
    });
  },function(){
    $(this).find( ".close" ).hide();
    $(this).find( ".reload" ).hide();
  });

  //insert the new tab at the specified position
  if (Number.isInteger(position)) {
    //account for extra div in grouped windows
    if ($(".win[winId='" + tab.windowId + "'] > div.winTitle")) position++;

    if (position === 0) {
       $(".win[winId='" + tab.windowId + "']").prepend(tabUI);
    } else {
      $(".win[winId='" + tab.windowId + "'] > div:nth-child(" + (position) + ")").after(tabUI);
    }
  } else {
    //no position specified, just add at the end
    $(".win[winId='" + tab.windowId + "']").append(tabUI);
  }

}

$(document).ready(function(){
  restore_options();

  $('#patterns-toggle').click(function(e){
    $("#patterns").toggle();
    $(this).toggleClass("shown").toggleClass("collapsed");
  });

  $('#windows-toggle').click(function(e){
    $("#windows, #search").toggle();
    $(this).toggleClass("collapsed").toggleClass("shown");
  });

  $('.tab').click(function(e) {
    chrome.windows.update(this.winid,{focused:true});
    chrome.tabs.update(this.tabid, {selected:true});
  });

  $('#groupThis').click(function(){
    getCurrentTabDomain(function(domain) {
      var urlPattern = "*://" + domain + "/*";
      chrome.runtime.sendMessage({greeting: "groupTabs", pattern: urlPattern}, function (response) {});
    });
  });

  $('#groupRegexShow').click(function(){
    $('#groupRegexForm').toggle();
  });

  //handle Custom group actions
  $('#groupRegexForm').submit(function(event) {
    event.preventDefault();
    const inputPattern = $('#groupRegexInput').val();
    const windowId = $('#windowId').val();
    console.log("Handler for .submit() called." + inputPattern);
    chrome.runtime.sendMessage({greeting: "groupTabs", pattern: inputPattern, "windowId": windowId}, function (response) {});
  });

  $('#search-criteria').on('change', function() {
    var val = $(this).val();
    $('.win').children(':not(:icontains(' + val + '))').hide().parent().hide();
    $('.win').children(':icontains(' + val + ')').show().parent().show();
  }).on('keyup', function() {
    $(this).change();
  }).focus();

  $.expr[":"].icontains = $.expr.createPseudo(function(arg) {
    return function (elem) {
      var elemAttrUrl = $(elem).attr('url');
      var elemAttrTitle = $(elem).attr('title');
      var elemAttrUrlContains = false;
      if (elemAttrUrl) {
        elemAttrUrlContains = elemAttrUrl.toUpperCase().indexOf(arg.toUpperCase()) >= 0;
      }
      var elemAttrTitleContains = false;
      if (elemAttrTitle) {
        elemAttrTitleContains = elemAttrTitle.toUpperCase().indexOf(arg.toUpperCase()) >= 0;
      }
      return elemAttrUrlContains || elemAttrTitleContains;
    };
  });

  chrome.tabs.onRemoved.addListener(function(tabId, removeInfo) {
    $(".tab[tabId='" + tabId + "']").remove();
  });

  chrome.windows.onRemoved.addListener(function(windowId) {
    $(".win[winId='" + windowId + "']").remove();
  });

  chrome.windows.onCreated.addListener(function(window){
    renderWindow(window.id);
  });

  chrome.tabs.onCreated.addListener(function(tab){
    renderTab(tab);
  });

  chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    $(".tab[tabId='" + tabId + "']").find(".title").text(tab.title);
  });

  chrome.tabs.onDetached.addListener(function(tabId, detachInfo){
    $(".tab[tabId='" + tabId + "']").remove();
  });

  chrome.tabs.onAttached.addListener(function(tabId, attachInfo){
    chrome.tabs.get(tabId, function(tab){
      console.log('tab attached at position: ' + attachInfo.newPosition);
      renderTab(tab, attachInfo.newPosition);
    });
  });
});
