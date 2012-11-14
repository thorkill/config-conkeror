
require("content-policy");
require("history.js");
require("clicks-in-new-buffer.js");
require("permission-manager.js");
require("new-tabs.js");

require("clicks-in-new-buffer.js");

url_completion_use_history = true;
url_completion_use_bookmarks = true;
can_kill_last_buffer = true;
download_buffer_automatic_open_target = OPEN_NEW_BUFFER_BACKGROUND;

editor_shell_command = "urxvt -e emacs -nw --no-desktop";
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


// content policy
function block_sniff (content_type, content_location) {
    dumpln("block sniff: " + content_type + " : " + content_location.spec);
    return content_policy_accept;
}

function block_flash (content_type, content_location) {
    var Y = content_policy_accept, N = content_policy_reject;

    var action = ({ "homestarrunner.com":Y }
                  [content_location.host] || N);

    if (action == N)
        dumpln("blocked content: "+content_type+" : "+content_location.spec);

    return action;
}

function block_image (content_type, content_location) {
    var Y = content_policy_accept, N = content_policy_reject;

    var action = ({ "homestarrunner.com" : N }
                  [content_location.host] || Y);

    if (action == N)
        dumpln("blocked content: "+content_type+" : "+content_location.spec);

    return action;
}

function block_script (content_type, content_location) {
    var Y = content_policy_accept, N = content_policy_reject;

    var action = ({ "pastebin.com" : Y,
                    "www.wetteronline.de": Y,
                    "wetter.com": Y,
                    "doodle.com": Y,
                    "duckduckgo.com": Y,
                    "builder.duckduckgo.com": Y,}
                  [content_location.host] || N);

    if (action == N)
        dumpln("blocked JS: "+content_location.spec);

    return action;
}

// 1
//content_policy_bytype_table.other = block_sniff;
// 2
content_policy_bytype_table.script = block_script;
// 3
//content_policy_bytype_table.image = block_sniff;
// 4
//content_policy_bytype_table.stylesheet = block_sniff;
// 5
content_policy_bytype_table.object = block_flash;
// 6
//content_policy_bytype_table.document = block_sniff;
// 7
//content_policy_bytype_table.subdocument = block_sniff;
// 9
//content_policy_bytype_table.xbl = block_sniff;
// 10
//content_policy_bytype_table.ping = block_sniff;
// 11
//content_policy_bytype_table.xmlhttprequest = block_sniff;
// 12
//content_policy_bytype_table.object_subrequest = block_sniff;
// 13
//content_policy_bytype_table.dtd = block_sniff;
// 14
//content_policy_bytype_table.font = block_sniff;
// 15
//content_policy_bytype_table.media = block_sniff;

add_hook("content_policy_hook", content_policy_bytype);

// passwords
session_pref("signon.rememberSignons", true);
session_pref("signon.expireMasterPassword", false);
session_pref("signon.SignonFileName", "signons.txt");
// cookies
session_pref("network.cookie.lifetimePolicy", 1);
session_pref("network.cookie.cookieBehavior", 1);

function history_clear () {
    var history = Cc["@mozilla.org/browser/nav-history-service;1"]
            .getService(Ci.nsIBrowserHistory);
                history.removeAllPages();
}

interactive("history-clear",
            "Clear the history.",
            history_clear);

Cc["@mozilla.org/login-manager;1"].getService(Ci.nsILoginManager); // init

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


/**
 * content_policy_status_widget shows if the content policy is enabled.
 */
function content_policy_status_widget (window) {
    this.class_name = "content-policy-status-widget";
    text_widget.call(this, window);
    // Update only if something happens ...
    this.add_hook("select_buffer_hook");
    this.add_hook("create_buffer_hook");
    this.add_hook("kill_buffer_hook");
    this.add_hook("move_buffer_hook");
    this.add_hook("current_content_buffer_location_change_hook");
    this.add_hook("current_content_buffer_focus_change_hook");
    this.add_hook("current_special_buffer_generated_hook");
}

content_policy_status_widget.prototype = {
    constructor: content_policy_status_widget,
    __proto__: text_widget.prototype,
    update: function () {
        if (content_policy_listener.enabled)
            this.view.text = ("[+]");
        else
            this.view.text = ("[-]");
    }
};

add_hook("mode_line_hook", mode_line_adder(content_policy_status_widget));
