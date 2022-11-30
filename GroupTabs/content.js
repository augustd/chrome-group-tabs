chrome.runtime.onMessage.addListener( function(request, sender, sendResponse) {
    console.log("content.onMessage: " + JSON.stringify(request));
    if (request.greeting == "copy") {
        let text = request.title;

        if (!text) {
            text = request.url;
        }

        let a = document.createElement('a');
        a.setAttribute("href", request.url);
        a.innerText = text;
        console.log(a);

        const clipboardItem = new ClipboardItem({
            "text/plain": new Blob(
                [a.innerText],
                {type: "text/plain"}
            ),
            "text/html": new Blob(
                [a.outerHTML],
                {type: "text/html"}
            ),
        });
        console.log(clipboardItem);

        navigator.clipboard.write([clipboardItem]);
        sendResponse("Clipboard Updated");
    }
});