/*
  Simple Content-Policy management for Conkeror.
  It uses mozilla's storage service.

  (C) Copyright 2014 thorkill
  BSD License
*/

require("debug.js");
require("content-policy");

Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/FileUtils.jsm");

// runtime copy of the db
// we need it because contentPolicy.shouldLoad can not be blocked
content_policy_jscript_actions = ({});

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

// reload permissions on whitelist/blacklist
function _reload_permissions() {
    content_policy_jscript_actions = ({});
    get_permissions(init_permissions);
}

// callback function which fills the
// action-list
function init_permissions(host, value) {
    dumpln("Adding: "+host +" : " + value);
    if (value == 't')
        content_policy_jscript_actions[host] = content_policy_accept;
    else
        content_policy_jscript_actions[host] = content_policy_reject;
}

// here we handle the javascript content filtering
function block_script (content_type, content_location) {
    var Y = content_policy_accept, N = content_policy_reject;

    var action = (content_policy_jscript_actions[content_location.host] || N);

    if (action == N)
        dumpln("blocked JS: "+content_location.spec);

    return action;
}

// 1
//content_policy_bytype_table.other = block_sniff;
// 2
content_policy_bytype_table.script = block_script;
// 3
//content_policy_bytype_table.image = block_image;
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




/* ---- start of db-part ---- */

function get_permissions(aCallBack) {
    dumpln("Load content-policy rules");
    dbConn = initDB();
    var r = dbConn.createStatement("SELECT host ,allowjs FROM permissions");

    let tempval = r.executeAsync({
        handleResult: function(aResultSet) {
            for(let row = aResultSet.getNextRow();
                row;
                row = aResultSet.getNextRow()) {
                host = row.getResultByName("host");
                value = row.getResultByName("allowjs");
                aCallBack(host, value);
            }
        },

        handleError: function(aError) {
            dumpln("Error: " + aError.message);
            return false;
        },

        handleCompletion: function(aReason) {
            if (aReason != Components.interfaces.mozIStorageStatementCallback.REASON_FINISHED)
                dumpln("Query canceled or aborted!");
            return false;
        }
    });
    closeDB();
    return tempval;
}

function allow_js_host(host) {
    dumpln("whitelist: " + host);
    dbConn = initDB();
    var r = dbConn.createStatement("INSERT OR REPLACE INTO permissions (host, allowjs) VALUES(:host, 't')");
    r.params.host=host;
    r.executeAsync();
    closeDB();
}

function deny_js_host(host) {
    dumpln("blacklist: " + host);
    dbConn = initDB();
    var r = dbConn.createStatement("INSERT OR REPLACE INTO permissions (host, allowjs) VALUES(:host, 'f')");
    r.params.host=host;
    r.executeAsync();
    closeDB();
}

function initDB() {
    let file = FileUtils.getFile("ProfD", ["cp_jscript.sqlite"]);
    let dbConn = Services.storage.openDatabase(file); // Will also create the file if it does not exist

    if (!dbConn.tableExists("permissions")) {
        dumpln("Tables not found");
        dbConn.executeSimpleSQL("CREATE TABLE permissions (host text unique, allowjs boolean)");
    }

    return dbConn;
}

function closeDB(dbConn) {
    if (dbConn)
        dbConn.close()
}
/* ---- end of db-part ---- */

interactive("blacklist-js", "Blacklists current URI for javascript usage.",
            function(I) {
                deny_js_host(I.buffer.current_uri.host);
                _reload_permissions();
            });

interactive("whitelist-js", "Whitelists current URI for javascript usage.",
            function(I) {
                allow_js_host(I.buffer.current_uri.host);
                _reload_permissions();
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


/**
 * Define some hooks
 */
add_hook("content_policy_hook", content_policy_bytype);
add_hook("mode_line_hook", mode_line_adder(content_policy_status_widget));
add_hook("init_hook", get_permissions(init_permissions));
