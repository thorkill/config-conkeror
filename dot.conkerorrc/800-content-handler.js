require("content-handler.js");

content_handlers.set("application/pdf", content_handler_open_default_viewer);
external_content_handlers.set("application/pdf", "xpdf");
