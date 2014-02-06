/*
  Implements features related to history management.

  (C) Copyright 2014 thorkill
  BSD License
*/

require("history.js");
require("services.js");

function history_forget_this_host(buffer) {
    var currentURI = make_uri(buffer.display_uri_string);
    nav_history_service.removePagesFromHost(currentURI.host, true);
}

function history_clear () {
    var history = Cc["@mozilla.org/browser/nav-history-service;1"]
            .getService(Ci.nsIBrowserHistory);
                history.removeAllPages();
}

interactive("history-clear",
            "Clear the history.",
            history_clear);

interactive("history-forget-this-host",
            "Clear the history for host in current buffer.",
            function (I) {
                history_forget_this_host(I.buffer);
            });
