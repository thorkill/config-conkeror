
function jsdump(str) {
  Components.classes['@mozilla.org/consoleservice;1']
            .getService(Components.interfaces.nsIConsoleService)
            .logStringMessage(str);
}

function _dump_obj(obj) {
    for (var i in obj) {
        jsdump(i + ' : ' + obj[i]+"\n");
    }
}
