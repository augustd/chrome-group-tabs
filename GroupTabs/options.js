// Restores state using the preferences stored in chrome.storage.
// generates list of windows and tabs
function restore_options() {
  // Use default value color = 'red' and likesColor = true.
  chrome.storage.local.get({
    'urlsToGroup': []
  }, function(items) {
    
    var patterns = document.getElementById('patterns');
    items.urlsToGroup.forEach(function(pattern){
      var patternUI = document.createElement('div');
      patternUI.className = "pattern";
      patternUI.textContent = pattern.urlPattern;
      patterns.appendChild(patternUI);
    });

    //pupulate the UI with a list of all windows
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
          tabUI.innerHTML = tab.title + '<div class="reload"></div><div class="close"></div>';
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
    });
  });

}

function getUrlByWindowId(urls, winId) {
  var array = urls.filter(function(urls){ return urls.window === winId; });
  return array[0];
}

    $(document).ready(function(){
      restore_options();
        $('.tab').click(function(e) {
          chrome.windows.update(this.winid,{focused:true});
          chrome.tabs.update(this.tabid, {selected:true});
        });
        
        chrome.tabs.onRemoved.addListener(function(tabId, removeInfo) {
          $('.tab[tabId=' + tabId + ']').remove();
        });
        
        chrome.windows.onRemoved.addListener(function(windowId) {
          $('.win[winId=' + windowId + ']').remove();
        });
    });