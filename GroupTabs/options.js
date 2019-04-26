var urlsToGroup;

// Restores state using the preferences stored in chrome.storage.
// generates list of windows and tabs
function restore_options() {
  chrome.storage.local.get({
    'urlsToGroup': []
  }, function(items) {

    urlsToGroup = items.urlsToGroup;

    var patterns = document.getElementById('patterns');
    items.urlsToGroup.forEach(function(pattern){
      var patternUI = document.createElement('div');
      patternUI.className = "pattern";
      //patternUI.textContent = pattern.urlPattern;
      patternUI.innerHTML = '<div class="title">' + pattern.urlPattern + '</div><div class="reload"></div><div class="close"></div>';
      $(patternUI).hover(function(){
        $(this).find( ".close" ).show().click(function() {
          //remove grouping for this pattern
          chrome.extension.getBackgroundPage().removeGroup(pattern.urlPattern);
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
    chrome.windows.getAll({'populate':true},function(winArray) {
      for (var i = 0; i < winArray.length; i++) {
        var window = winArray[i];
        var winUI = document.createElement('div');
        winUI.className = "win";
        winUI.setAttribute("winId", window.id);

        var groupUrl = getUrlByWindowId(items.urlsToGroup, window.id);
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
          tabUI.innerHTML = '<img src="' + tab.favIconUrl + '" class="fav"><div class="title">' + tab.title + '</div><div class="reload"></div><div class="close"></div>';
          $(tabUI).click(function(){
            chrome.windows.update(parseInt($(this).attr('winid')),{focused:true});
            chrome.tabs.update(parseInt($(this).attr('tabid')), {selected:true});
          });

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
          },function(){
            $(this).find( ".close" ).hide();
            $(this).find( ".reload" ).hide();
          });

          winUI.appendChild(tabUI);
        }

        windowsUI.appendChild(winUI);
      }
      setTimeout(function(){$("#windows").slideDown(50)}, 50); //prevent window initial scroll bug
    });
  });

}

function getUrlByWindowId(urls, winId) {
  var array = urls.filter(function(urls){ return urls.window === winId; });
  return array[0];
}

function renderWindow(windowId) {
  var windowsUI = document.getElementById('windows');
  var winUI = document.createElement('div');
  winUI.className = "win";
  winUI.setAttribute("winId", windowId);

  var groupUrl = getUrlByWindowId(urlsToGroup, windowId);
  if (groupUrl) {
    winUI.innerHTML = '<div class="winTitle">Grouped Window - pattern: ' + groupUrl.urlPattern + '</div>';
  }
  windowsUI.appendChild(winUI);
}

function renderTab(tab, position) {
  chrome.extension.getBackgroundPage().console.log('rendering new tab at position: ' + position);
  var tabUI = document.createElement('div');

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
    if ($('.win[winId=' + tab.windowId + '] > div.winTitle')) position++;

    if (position === 0) {
       $('.win[winId=' + tab.windowId + ']').prepend(tabUI);
    } else {
      $('.win[winId=' + tab.windowId + '] > div:nth-child(' + (position) + ')').after(tabUI);
    }
  } else {
    //no position specified, just add at the end
    $('.win[winId=' + tab.windowId + ']').append(tabUI);
  }

}

$(document).ready(function(){
  restore_options();

  $('.tab').click(function(e) {
    chrome.windows.update(this.winid,{focused:true});
    chrome.tabs.update(this.tabid, {selected:true});
  });

  $('#groupThis').click(function(){
    getCurrentTabDomain(function(domain) {
      var urlPattern = "*://" + domain + "/*";
      chrome.extension.getBackgroundPage().groupTabs(urlPattern);
    });
  });

  $('#groupRegexShow').click(function(){
    $('#groupRegexForm').toggle();
  });

  $('#groupRegexForm').submit(function(event) {
    event.preventDefault();
    chrome.extension.getBackgroundPage().console.log("Handler for .submit() called." + $('#groupRegexInput').val());
    chrome.extension.getBackgroundPage().groupTabs($('#groupRegexInput').val());
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
    $('.tab[tabId=' + tabId + ']').remove();
  });

  chrome.windows.onRemoved.addListener(function(windowId) {
    $('.win[winId=' + windowId + ']').remove();
  });

  chrome.windows.onCreated.addListener(function(window){
    renderWindow(window.id);
  });

  chrome.tabs.onCreated.addListener(function(tab){
    renderTab(tab);
  });

  chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    $('.tab[tabId=' + tabId + ']').find(".title").text(tab.title);
  });

  chrome.tabs.onDetached.addListener(function(tabId, detachInfo){
    $('.tab[tabId=' + tabId + ']').remove();
  });

  chrome.tabs.onAttached.addListener(function(tabId, attachInfo){
    chrome.tabs.get(tabId, function(tab){
      chrome.extension.getBackgroundPage().console.log('tab attached at position: ' + attachInfo.newPosition);
      renderTab(tab, attachInfo.newPosition);
    });
  });
});
