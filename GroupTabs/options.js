// Saves options to chrome.storage.sync.
function save_options() {
  var color = document.getElementById('color').value;
  var likesColor = document.getElementById('like').checked;
  chrome.storage.local.set({
    favoriteColor: color,
    likesColor: likesColor
  }, function() {
    // Update status to let user know options were saved.
    var status = document.getElementById('status');
    status.textContent = 'Options saved.';
    setTimeout(function() {
      status.textContent = '';
    }, 750);
  });
}

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
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
    alert(JSON.stringify(items.urlsToGroup));
    //alert(patterns);
    //patterns.textContent = JSON.stringify(items.urlsToGroup);
    
    //pupulate the UI with a list of all windows
    var windowsUI = document.getElementById('windows');
    chrome.windows.getAll({'populate':true},function(winArray) {
      //alert("winArray 1 " + JSON.stringify(winArray));

      for (var i = 0; i < winArray.length; i++) {
        var window = winArray[i];
        var winUI = document.createElement('div');
        var windowId = window.id;
        winUI.className = "win";
        
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
            //alert('tabUI click');
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
            console.log("out");
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

//document.addEventListener('DOMContentLoaded', restore_options);
document.getElementById('save').addEventListener('click', save_options);

    $(document).ready(function(){
      alert('ready');
      restore_options();
      alert("set");
        $('.tab').click(function(e) {
          alert(e.winid + "," + e.tabid);
          chrome.windows.update(this.winid,{focused:true});
          chrome.tabs.update(this.tabid, {selected:true});
        });
    });