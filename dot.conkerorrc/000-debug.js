

function jsdump(str) {
    dumpln(str);
    //Components.classes['@mozilla.org/consoleservice;1']
    //      .getService(Components.interfaces.nsIConsoleService)
    //    .logStringMessage(str);
}

function _simple_obj_dump(obj) {
    for(var i in obj) {
        jsdump(i + " / " + typeof(obj[i]));
    }
}

function _dump_obj(obj) {
    jsdump("------ dump start ------");
    for (var i in obj) {
        try {
            jsdump(i + ' : ' + obj[i]+"\n");
        } catch (e) {
            jsdump("Error for: i=" + i + "/" + e);
        }
    }
    jsdump("------ dump end   ------");
}
