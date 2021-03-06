/*
  Simple Content-Policy management for Conkeror.
  It uses mozilla's storage service.

  (C) Copyright 2014-2015 thorkill
  BSD License
*/

require("buffer.js");
require("content-policy.js");
require("content-buffer.js");
require("completers.js");
require("http-request-hook.js");
require("window.js");

Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/FileUtils.jsm");

// runtime copy of the db
// we need it because contentPolicy.shouldLoad can not be blocked
var content_policy_jscript_actions = ({});

var content_policy_blocked_js = {};
var content_policy_accepted_js = {};

let csp_db_accepted_js = {};

var csp_debug = true;
var dbConn = initDB();

var csp_blacklist = [/\/(plugins|widgets)\/like.php/, /\/(plugins|widgets)\/likebox.php/, /www\.google\-analytics\.com\//, /s\.amazon\-adsystem\.com\//, /facebook\.com\/sharer\.php/];

function httpHeaderWalker(aBump) {
    jsdump(aBump);
}

var httpRequestObserver =
    {
        observe: function(subject, topic, data)
        {
            if (!subject)
                return;

            if (!content_policy_listener.enabled) {
                return;
            }

            var httpChannel = subject.QueryInterface(Ci.nsIHttpChannel);
            if ( httpChannel instanceof Ci.nsIHttpChannel === false ) {
                return;
            }

            var window = get_recent_conkeror_window();
            var B = window.buffers.current;

            var ctxt_host = uri2basedomain(B.current_uri);

            if (!ctxt_host) {
                _dump_obj(window.buffers.current.current_uri);
            }

            if (csp_debug)
                jsdump(" observe: " + ctxt_host + " ->->-> " + subject.name + " / " + subject.contentType + " / " + topic + " / " + subject.isNoCacheResponse());

            var _subjectURI = make_uri(subject.name);

            for (var i in csp_blacklist) {
                var patt = csp_blacklist[i];
                if (patt.test(_subjectURI.spec)) {
                    jsdump("Blocking: " + _subjectURI.spec + " on patter: " + patt);
                    httpChannel.cancel(Components.results.NS_BINDING_ABORTED);
                    return;
                }
            }

            if (!B.csp_rejected_js)
                B.csp_rejected_js = [];

            if ((!subject.contentType != "application/x-javascript") && (subject.contentType != "text/html") && (subject.contentType != "text/css"))
                return;

            // default - block all scripts
            var csp_value = "script-src 'none';";
            //csp_value = "default-src 'none';"

            var host = _subjectURI.host;

            if (host in csp_db_accepted_js) {
                csp_value = "script-src 'self' 'unsafe-inline' 'unsafe-eval' ";
                for(var i in csp_db_accepted_js[host]) {
                    csp_value += " " + csp_db_accepted_js[host][i];
                    B.csp_accepted_js[csp_db_accepted_js[host][i]] = true;
                }
                csp_value += ";";
            } else {
                B.csp_rejected_js[host] = true;
            }
            //csp_value += "style-src 'self'; "
            //csp_value += "img-src 'self'; "

            if (csp_debug)
                jsdump(host + " / " + csp_value);

            httpChannel.setResponseHeader("Content-Security-Policy", csp_value, true);
        }
    };

//observer_service.addObserver(httpRequestObserver, "http-on-modify-request", false);
observer_service.addObserver(httpRequestObserver, "http-on-examine-response", false);

// content policy
function block_sniff (content_type, content_location, request_origin, context, mime_type_guess) {
    return content_policy_accept;
    //return content_policy_reject;
}

function block_flash (content_type, content_location, request_origin, context, mime_type_guess) {
    var Y = content_policy_accept, N = content_policy_reject;
    var action = ({ "homestarrunner.com":Y }
                  [content_location.host] || N);

    //if (action == N)
    //    jsdump("blocked content: "+content_type+" : "+content_location.spec);

    return action;
}

function block_image (content_type, content_location) {
    var Y = content_policy_accept, N = content_policy_reject;

    var action = ({ "homestarrunner.com" : N }
                  [content_location.host] || Y);

    //if (action == N)
    //    jsdump("blocked content: "+content_type+" : "+content_location.spec);

    return action;
}

// reload permissions on whitelist/blacklist
function _reload_permissions() {
    content_policy_jscript_actions = ({});
    get_permissions(init_permissions);
    get_csp_permissions(_csp_set_policy);
}

// callback function which fills the
// action-list
function init_permissions(host, value) {
    //jsdump("Adding: "+host +" : " + value);
    if (value == 't')
        content_policy_jscript_actions[host] = content_policy_accept;
    else
        content_policy_jscript_actions[host] = content_policy_reject;
}

// here we handle the javascript content filtering
function block_script (content_type, content_location, request_origin, context, mime_type_guess) {
    var Y = content_policy_accept, N = content_policy_reject;

    var action = (content_policy_jscript_actions[content_location.host] || N);
    //jsdump(content_type + " : " + content_location.host + " : "+ action + " / " + request_origin.host);

    //if (action == N)
    //    jsdump("blocked JS: "+content_location.spec);

    return action;
}

// 1
//content_policy_bytype_table.other = block_sniff;
// 2
//content_policy_bytype_table.script = block_script;
// 3
//content_policy_bytype_table.image = block_image;
// 4
//content_policy_bytype_table.stylesheet = block_sniff;
// 5
// content_policy_bytype_table.object = block_flash;
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
    jsdump("Load content-policy rules");
    var r = dbConn.createStatement("SELECT host, allowjs FROM permissions");

    let tempval = r.executeAsync({
        handleResult: function(aResultSet) {
            for(let row = aResultSet.getNextRow();
                row;
                row = aResultSet.getNextRow()) {
                var host = row.getResultByName("host");
                var value = row.getResultByName("allowjs");
                aCallBack(host, value);
            }
        },

        handleError: function(aError) {
            jsdump("Error: " + aError.message);
            return false;
        },

        handleCompletion: function(aReason) {
            if (aReason != Components.interfaces.mozIStorageStatementCallback.REASON_FINISHED)
                jsdump("Query canceled or aborted!");
            return false;
        }
    });
    r.finalize();
    //closeDB(dbConn);
    return tempval;
}

function csp_prepare_groups(ctx, host, policy_type) {
    jsdump("csp_prepare_groups: " + ctx + ", " + host );
}

function _read_csp_hosts(_csp_set_policy) {
    jsdump("Load content-security-policy hosts");
    //var dbConn = initDB();
    var r = dbConn.createStatement("select * FROM csp_hosts");

    let tempval = r.executeAsync({
        handleResult: function(aResultSet) {
            for(let row = aResultSet.getNextRow();
                row;
                row = aResultSet.getNextRow()) {
                var id = row.getResultByName("id");
                var host = row.getResultByName("host");
                var shost = row.getResultByName("shost");
                var policy_type = row.getResultByName("policy_type");
                _csp_set_policy(id, host, shost, policy_type);
            }
        },

        handleError: function(aError) {
            jsdump("Error: " + aError.message);
            return false;
        },

        handleCompletion: function(aReason) {
            if (aReason != Components.interfaces.mozIStorageStatementCallback.REASON_FINISHED)
                jsdump("Query canceled or aborted!");
            return false;
        }
    });
    r.finalize();
    //closeDB(dbConn);
    return tempval;
}

function _csp_set_policy(id, host, shost, pt) {
    if (!csp_db_accepted_js[host])
        csp_db_accepted_js[host] = [];

    csp_db_accepted_js[host].push(shost);
}

function get_csp_permissions(_csp_set_policy) {
    csp_db_accepted_js = ({});
    _read_csp_hosts(_csp_set_policy);
}


function _csp_insert_host(host, shost, pt) {
    var r = dbConn.createStatement("INSERT OR REPLACE INTO csp_hosts (host,shost, policy_type) VALUES(:host, :shost, :policy_type)");
    r.params.host=host;
    r.params.shost=shost;
    r.params.policy_type=pt;
    r.executeAsync();
    r.finalize();
}

function _csp_delete_host(host, shost, pt) {
    var r = dbConn.createStatement("DELETE FROM csp_hosts WHERE host=:host AND shost = :shost AND policy_type = :policy_type");
    r.params.host=host;
    r.params.shost=shost;
    r.params.policy_type=pt;
    r.executeAsync();
    r.finalize();
}

function csp_allow_js_host(host, shost) {
    jsdump("csp_allow_js_host: " + host + " >-> " + shost);
    _csp_insert_host(host, shost, 2);
}

function csp_block_js_host(host, shost) {
    jsdump("csp_block_js_host: " + host + " >-> " + shost);
    _csp_delete_host(host, shost, 2);
}

function allow_js_host(host) {

    if (host == null)
        return;

    var r = dbConn.createStatement("INSERT OR REPLACE INTO permissions (host, allowjs) VALUES(:host, 't')");
    r.params.host=host;
    r.executeAsync();
    r.finalize();
}

function deny_js_host(host) {

    if (host == null)
        return;

    var r = dbConn.createStatement("INSERT OR REPLACE INTO permissions (host, allowjs) VALUES(:host, 'f')");
    r.params.host=host;
    r.executeAsync();
    r.finalize();
}

function initDB() {
    let file = FileUtils.getFile("ProfD", ["cp_jscript.sqlite"]);
    let dbConn = Services.storage.openDatabase(file);

    if (!dbConn.tableExists("prefs")) {
        dbConn.executeSimpleSQL("CREATE TABLE prefs (pref TEXT UNIQUE NOT NULL, value TEXT)");
        var r = dbConn.createStatement("INSERT INTO prefs (pref, value) VALUES (:pref, :value)");
        r.params.pref="version";
        r.params.value="0.1";
        r.executeAsync();
        r.finalize();
    }

    if (!dbConn.tableExists("permissions")) {
        dbConn.executeSimpleSQL("CREATE TABLE permissions (host TEXT UNIQUE NOT NULL, allowjs BOOLEAN)");
    }

    if (!dbConn.tableExists("csp_hosts")) {
        dbConn.executeSimpleSQL("CREATE TABLE csp_hosts (id integer primary key autoincrement, host TEXT NOT NULL, shost TEXT NOT NULL, policy_type INTEGER NOT NULL)");
    }

    return dbConn;
}

function closeDB(dbConn) {
    if (dbConn)
        dbConn.asyncClose()
}
/* ---- end of db-part ---- */

function uri2basedomain(aURI) {
    try {
        var az = make_uri(aURI);
        return az.host;
    } catch (e) {
        return null;
    }
    return aURI;
}

// ContentPolicy JavaScript completer
// iterates over javascript resources and shows it's permissions
function cp_js_completer (buffer) {
    keywords(arguments,
             $completions = [],
             $get_string = identity,
             $get_description = constantly(""),
             $get_icon = null,
             $get_value = null);
    this._buffer = buffer;
    this.completions_src = arguments.$completions;
    this.get_icon = arguments.$get_icon;
    this.refresh();
}

cp_js_completer.prototype = {
    constructor: cp_js_completer,
    toString: function () "#<cp_js_completer>",
    completions_src: null,
    completions: null,
    get_string: function (x) { return x },
    get_description: function (x) {
        x = uri2basedomain(x);
        var n = content_policy_jscript_actions[x];
        if (n == 1)
            return x + ": whitelisted";
        else if (n == -1)
            return x + ": blacklisted";
        else
            return "";
    },
    get_icon: null,
    get_value: function (x) { return "value: " + x},
    complete: function (input, pos) {
        return new completions(this, this.completions);
    },
    refresh: function () {
        var data = [];

        var entries = this._buffer.document.getElementsByTagName('script');
        var _unique_scripts = {};

        for (i = 0 ; i < entries.length ; i++)
        {
            var src = entries[i].src;
            // this is the case where <script> is embedded into html code
            if (src == null || src == "")
                src = this._buffer.document.baseURI;

            if (_unique_scripts[src])
                continue;

            _unique_scripts[src] = true;
            data.push(src);
        }

        for (i in content_policy_blocked_js) {
            if (_unique_scripts[i] || content_policy_jscript_actions[i])
                continue;
            _unique_scripts[i] = true;
            data.push(i);
        }

        for (i in content_policy_accepted_js) {
            if (_unique_scripts[i] || content_policy_jscript_actions[i])
                continue;
            _unique_scripts[i] = true;
            data.push(i);
        }

        this.completions = data;
    }
};

function cp_js_show (window, message) {
    //jsdump("cp_js_show: " + message);
    var host = uri2basedomain(message);

    if (host in content_policy_jscript_actions) {
        if (content_policy_jscript_actions[host] == content_policy_accept)
            deny_js_host(host);
        else
            allow_js_host(host);
    }  else {
        // default is to whitelist a host
        // just because I do not permit JS per default
        allow_js_host(host);
    }
    _reload_permissions();
}

function csp_js_completer (buffer) {
    keywords(arguments,
             $completions = [],
             $get_string = identity,
             $get_description = constantly(""),
             $get_icon = null,
             $get_value = null);
    this._buffer = buffer;
    this.completions_src = arguments.$completions;
    this.get_icon = arguments.$get_icon;
    this.refresh();
}

csp_js_completer.prototype = {
    constructor: csp_js_completer,
    toString: function () "#<csp_js_completer>",
    completions_src: null,
    completions: null,
    get_string: function (x) { return x },
    get_description: function (x) {
        let x1 = uri2basedomain(x);
        if (x1)
            x = x1
        if (this._buffer.csp_accepted_js[x])
            return x + ": whitelisted";
        else if (this._buffer.csp_rejected_js[x])
            return x + ": rejected";
        else
            return "";
    },
    get_icon: null,
    get_value: function (x) { return "value: " + x},
    complete: function (input, pos) {
        return new completions(this, this.completions);
    },
    refresh: function () {
        var data = [];

        var entries = this._buffer.document.getElementsByTagName('script');
        var _unique_scripts = {};

        for (i = 0 ; i < entries.length ; i++)
        {
            var src = entries[i].src;
            // this is the case where <script> is embedded into html code
            if (src == null || src == "")
                src = this._buffer.document.baseURI;

            if (_unique_scripts[src])
                continue;

            _unique_scripts[src] = true;
            data.push(src);
        }

        if (this._buffer.csp_accepted_js) {
            for (var z in this._buffer.csp_accepted_js) {
                if (_unique_scripts[z])
                    continue;
                _unique_scripts[z] = true;
                data.push(z);
            }
        }

        if (this._buffer.csp_rejected_js) {
            for (var z in this._buffer.csp_rejected_js) {
                if (_unique_scripts[z])
                    continue;
                _unique_scripts[z] = true;
                data.push(z);
            }
        }

        this.completions = data;
    }
};

function csp_js_show (window, message) {
    var buffer = window.buffers.current;
    var host = uri2basedomain(message);
    var ctxt_host = uri2basedomain(buffer.current_uri);
    jsdump("csp_js_show: " + message + " / " + ctxt_host + " -> " + host);
    if (buffer.csp_accepted_js[host]) {
        csp_block_js_host(ctxt_host, host);
    }
    else
        csp_allow_js_host(ctxt_host, host);
    buffer.csp_accepted_js = [];
    buffer.csp_block_js_host = [];
    _reload_permissions();
}

interactive("cp-js-show",
            "Show JavaScript content of current buffer with information from content policy DB.",
            function (I) {
                cp_js_show(
                    I.window,
                    (yield I.minibuffer.read($prompt = "Toggle CP-JS for: ",
                                             $completer = new cp_js_completer(I.window.buffers.current))));
            });

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

interactive("csp-allow-js", "Whitelists current URI for javascript usage.",
            function(I) {
                csp_js_show(
                    I.window,
                    (yield I.minibuffer.read($prompt = "CSP-JS in context of " + uri2basedomain(I.window.buffers.current.current_uri) + ": ",
                                             $completer = new csp_js_completer(I.window.buffers.current))));
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

function csp_init_buffer(B) {
    if (!B.csp_rejected_js)
        B.csp_rejected_js = {};

    if (!B.csp_accepted_js)
        B.csp_accepted_js = {};

}

/**
 * Define some hooks
 */
add_hook("content_policy_hook", content_policy_bytype);
add_hook("mode_line_hook", mode_line_adder(content_policy_status_widget));
add_hook("init_hook", get_permissions(init_permissions));
add_hook("init_hook", get_csp_permissions(_csp_set_policy));
add_hook("create_buffer_hook", csp_init_buffer);
