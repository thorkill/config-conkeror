/*
  Simple permission manager - CookieEater
  This module provides a function ce-show to you which
  includes all hostnames from which we accept cookies
  and those we dont. With tab you can access the
  completions which will give you a hint about current
  permissions (cookies) settngs for those domains.

  At the moment: We can only toggle between
  'Accept cookies for session' and 'deny action'.

  (C) Copyright 2014 thorkill
  BSD License
*/

require("permission-manager.js");

var cookie_eater_rejected_hosts = {};
var cookie_eater_accepted_hosts = {};

let os = Components.classes["@mozilla.org/observer-service;1"]
    .getService(Components.interfaces.nsIObserverService);
let pm = permission_manager;

let cookieEater = {

    observe : function(aSubject, aTopic, aData) {
        if (aTopic == "cookie-changed") {
            this._ce_cookie_changed(aSubject, aData);
        } else if (aTopic == "cookie-rejected") {
            this._ce_cookie_rejected(aSubject, aData);
        } else {
            //jsdump("Subject: " + aSubject + ", aTopic: "+ aTopic + ", aData" + aData);
            //_dump_obj(aSubject);
        }
    },

    _ce_cookie_changed: function (aSubject, aData) {
        if (aSubject instanceof Components.interfaces.nsICookie) {
            var host = aSubject.host.charAt(0) == "." ? aSubject.host.substring(1, aSubject.host.length) : aSubject.host;
            jsdump("cookie accepted for host: " + host);
            if (host in cookie_eater_accepted_hosts)
                return;

            cookie_eater_accepted_hosts[host] = true;
        }
     },

    _ce_cookie_rejected: function (aSubject, aData) {
        if (aSubject instanceof Components.interfaces.nsIURI) {
            jsdump("cookie rejected for host: " + aSubject.host);
            if (aSubject.host in cookie_eater_rejected_hosts)
                return;

            cookie_eater_rejected_hosts[aSubject.host] = true;
        }
    }
}

function init_cookie_eater(W) {
    os.addObserver(cookieEater, "cookie-changed", false);
    os.addObserver(cookieEater, "cookie-rejected", false);
    os.addObserver(cookieEater, "perm-changed", false);
}

add_hook("window_initialize_early_hook", init_cookie_eater);

function ce_completer(B) {
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

ce_completer.prototype = {
    constructor: ce_completer,
    toString: function () "#<ce_completer>",
    completions_src: null,
    completions: null,

    get_string: function (x) x,
    get_description: function (x) {
        perm = pm.testPermission(make_uri("http://" + x), "cookie");
        switch (perm) {
            case 0: return "not defined - default action";
            case 1: return "allowed to set cookies";
            case 2: return "no permission to set cookies";
            case 8: return "allowed for session";
        }
        return "here be dragons / perm : " + perm;
    },

    get_value: function (x) {
        return "value: " + x
    },
    complete: function (input, pos) {
        return new completions(this, this.completions);
    },

    refresh: function () {
        let data = [];
        for (i in cookie_eater_accepted_hosts) {
            data.push(i);
        }
        for (i in cookie_eater_rejected_hosts) {
            data.push(i);
        }
        this.completions = data;
    },
}

function ce_show (window, host) {
    perm = pm.testPermission(make_uri("http://" + host), "cookie");

    if (perm == 0 || perm == 2) {
        permission_manager.add(make_uri("http://" + host), "cookie", Ci.nsICookiePermission.ACCESS_SESSION);
        cookie_eater_accepted_hosts[host] = true;
        delete cookie_eater_rejected_hosts[host];
    } else {
        permission_manager.add(make_uri("http://" + host), "cookie", Ci.nsICookiePermission.DENY_ACTION);
        cookie_eater_rejected_hosts[host] = true;
        delete cookie_eater_accepted_hosts[host];
    }
}

interactive("ce-show",
            "Show and allow to toggle cookie permissions for hosts.",
            function (I) {
                ce_show(
                    I.window,
                    (yield I.minibuffer.read($prompt = "Toggle Cookie permissions for: ",
                                             $completer = new ce_completer(I.window.buffers.current))));
            });
