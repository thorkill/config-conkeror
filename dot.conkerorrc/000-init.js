
require("debug.js");

require("history.js");
require("clicks-in-new-buffer.js");
require("permission-manager.js");
require("new-tabs.js");

require("clicks-in-new-buffer.js");

url_completion_use_history = true;
url_completion_use_bookmarks = true;
can_kill_last_buffer = true;
download_buffer_automatic_open_target = OPEN_NEW_BUFFER_BACKGROUND;

editor_shell_command = "emacsclient";
url_remoting_fn = load_url_in_new_buffer;
open_download_buffer_automatically = OPEN_NEW_BUFFER;

// webjumps
define_webjump("kat", "http://kat.ph/usearch/%s");
define_webjump("imdb", "http://www.imdb.com/find?q=%s&s=all");

// extensions
user_pref("extensions.checkCompatibility", false);

// misc
url_remoting_fn = load_url_in_new_buffer;
// Set to either OPEN_NEW_BUFFER or OPEN_NEW_BUFFER_BACKGROUND
clicks_in_new_buffer_target = OPEN_NEW_BUFFER_BACKGROUND; // Now buffers open in background.

// Set to 0 = left mouse, 1 = middle mouse, 2 = right mouse
clicks_in_new_buffer_button = 2; //  Now right mouse follows links in new buffers.

// cookies
session_pref("network.cookie.lifetimePolicy", 1);
// 1 - 3th party not allowed
// 2 - no cookie storage
session_pref("network.cookie.cookieBehavior", 2);

function history_clear () {
    var history = Cc["@mozilla.org/browser/nav-history-service;1"]
            .getService(Ci.nsIBrowserHistory);
                history.removeAllPages();
}

interactive("history-clear",
            "Clear the history.",
            history_clear);

function org_remember(url, window) {
    var cmd_str = 'emacsclient -c --eval \'(th-org-remember-conkeror "' + url + '")\'';
    if (window != null) {
        window.minibuffer.message('Issuing ' + cmd_str);
    }
    shell_command_blind(cmd_str);
}

interactive("org-remember", "Remember the current url with org-remember",

function (I) {
  org_remember(I.buffer.display_URI_string, I.window);
});
