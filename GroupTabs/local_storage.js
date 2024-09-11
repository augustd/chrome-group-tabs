/**
 * Retrieve object from Chrome's Local Storage Area
 * @param {string} key
 */
const getObjectFromLocalStorage = async function(key) {
    return new Promise((resolve, reject) => {
        try {
            chrome.storage.local.get(key, function(value) {
                console.log("getObjectFromLocalStorage: " + key);
                console.log(value[key]);
                console.log("type: " + (typeof value[key]));
                if (typeof value[key] === "object") {
                    console.log("getObjectFromLocalStorage (typeof value[key] === \"object\"): " + key);
                    console.log(value[key]);
                    resolve(value[key]);
                } else if (value[key]) {
                    const output = JSON.parse(value[key]);
                    console.log("getObjectFromLocalStorage (value[key]): " + key);
                    console.log(output);
                    resolve(output);
                } else if ("urlsToGroup" === key) {
                    console.log("getObjectFromLocalStorage (\"urlsToGroup\" === key): " + key);
                    resolve([]);
                } else {
                    console.log("getObjectFromLocalStorage: " + key);
                    resolve({});
                }
            });
        } catch (ex) {
            reject(ex);
        }
    });
};

/**
 * Save Object in Chrome's Local Storage Area
 * @param {*} obj
 */
const saveObjectInLocalStorage = async function(key, value) {
    return new Promise((resolve, reject) => {
        try {
            const valueString = JSON.stringify(value);

            console.log("saveObjectInLocalStorage: " + key + "=" + valueString);

            chrome.storage.local.set({[key]:valueString}, function() {
                resolve();
            });
        } catch (ex) {
            reject(ex);
        }
    });
};