    /* global app */
     
    app.init = function() {
        app.init.generate_api_stubs(["user", "token", "cart", "menu", "order", "html"]);
        app.init.generate_templates();
        app.init.interceptFormSubmits();
        app.init.interceptButtonLinks();
        app.init.localStorage();
    };


    // auto generate the api tool stubs
    // this creates app.api.(user,token,cart,menu,order).(get,post,put,delete) etc
    app.init.generate_api_stubs = function(paths) {
        paths.forEach(function(path) {
            app.api[path] = {};
        });
        paths.forEach(function(path) {
            app.api[path].post = function(data, cb) {
                return app.api.request(path, data, cb);
            };
        });
        paths.pop(); //html
        paths.forEach(function(path) {
            app.api[path].get = function(params, cb) {
                if (typeof params === 'function') return app.api.request(path, params);
                return app.api.request(path, undefined, {
                    method: "GET",
                    params: params
                }, cb);
            };
        });
        paths.pop(); //menu
        paths.forEach(function(path) {
            app.api[path].put = function(data, cb) {
                return app.api.request(path, data, {
                    method: "PUT"
                }, cb);
            };
        });
        paths.forEach(function(path) {
            app.api[path].delete = function(params, cb) {
                if (typeof params === 'function') return app.api.request(path, undefined, {
                    method: "DELETE"
                }, params);
                return app.api.request(path, undefined, {
                    method: "DELETE",
                    params: params
                }, cb);
            };
        });
    };



    // auto generate the template generators
    // creates app.templates.PATH.OPERATION(data,context, cb)
    app.init.generate_templates = function() {

        app.templates = {};
        app.template_links = {};
        var templateCache = {};
        var header_template_;
        var title_template_;

        var extract_title = function(html) {
            // search within html for <title></title> pattern

            var scan = html.toLowerCase();
            var pos = scan.indexOf("<title");
            if (pos >= 0) {

                while (scan.charAt(pos) !== '>') pos++;

                scan = scan.substr(++pos);
                html = html.substr(pos);
                pos = scan.indexOf("</title");
                if (pos >= 0) {
                    return html.substr(0, pos);
                }
            }
            return false;
        };

        var get_title_template = function(cb) {
            // on first call, hit server for the _header html chunk, and extract title format from it.
            // on subsequent calls return the cached title format.
            if (title_template_ === undefined) {
                return app.api.html.post({
                    formId: "_header",
                    variables: {}
                },

                function(code, data) {
                    if (code == 200) {
                        header_template_ = data.rawHtml;
                        title_template_ = extract_title(header_template_);
                        return cb(title_template_);
                    } else {
                        return cb(false);
                    }
                });
            }

            return cb(title_template_);
        };

        var exit_200 = function(formId, pageInfo, cb) {

            // replace the page contents with newly rendered html 
            document.querySelector("div.content").innerHTML = pageInfo.cookedHtml;

            // save the formId for future record
            app.config.appState = formId;

            // get the template for the document title from the header template
            get_title_template(function(title_temp) {

                // render the document title using variables from page
                app.helpers.mergeVariables(title_temp, pageInfo.variables, '', function(title) {

                    // set the document title
                    document.title = title;

                    app.init.interceptFormSubmits();

                    if (typeof cb === 'function') {
                        cb(200, pageInfo.cookedHtml);
                    }

                });

            });

        };

        var exit_err = function(code, err, cb) {
            if (typeof cb === 'function') {
                cb(code, {
                    Error: err
                });
            }
        };

        var make_array_template = function(formId, path, op) {
            // extends array template function to allow arrayed delivery
            app.templates[path][op].array = function(array, context, cb) {

                if (typeof context === 'function') {
                    cb = context;
                    context = {};
                } else {
                    if (typeof array === 'function') {
                        cb = array;
                        array = {};
                    }
                }


                var exit_arrayed = function() {
                    app.helpers.mergeVariableArray(templateCache[formId].rawHtml, array, '', function(html) {
                        exit_200(
                        formId, {
                            cookedHtml: html,
                            variables: templateCache[formId].variables
                        },
                        cb);
                    });
                };

                if (templateCache[formId]) {

                    exit_arrayed();

                } else {

                    // request html template for 
                    return app.api.html.post({
                        formId: formId,
                        variables: {},
                        handler: path,
                        operation: op,
                        context: context
                    },

                    function(code, pageInfo) {
                        if (code == 200) {
                            templateCache[formId] = pageInfo;
                            exit_arrayed();
                        } else {
                            exit_err(code, "error: http code " + code, cb);
                        }
                    });
                }
            };
        };

        var make_template = function(path, op, path_alias, arrayed, var_getter) {

            var linkpath = path_alias || path;
            // camelcase "account","create" --> accountCreate
            var formId = linkpath.toLowerCase() + op.substr(0, 1).toUpperCase() + op.substr(1).toLowerCase();

            app.templates[path] = app.templates[path] || {};


            //
            app.templates[path][op] = function(variables, cb) {

                switch (typeof variables) {
                    case 'function': 
                        // eg app.templates.user.create(function(){...})
                        cb = variables;
                        variables = {};
                        break;
                    case 'undefined' :
                        // eg app.templates.user.create()
                        if (typeof var_getter==='function') {
                            variables = var_getter();
                        }    
                        break;
                }

                if (templateCache[formId]) {

                    app.helpers.mergeVariables(templateCache[formId].rawHtml, variables, '', function(html) {

                        exit_200(formId, {
                            cookedHtml: html,
                            variables: templateCache[formId].variables
                        }, cb);

                    });

                } else {

                    return app.api.html.post({
                        formId: formId,
                        variables: variables,
                        handler: path,
                        operation: op
                    },

                    function(code, pageInfo) {
                        if (code == 200) {
                            templateCache[formId] = pageInfo;
                            exit_200(formId, pageInfo, cb);
                        } else {
                            if ([403, 401].indexOf(code) >= 0) {
                                // log the user out
                                app.logout("session/create");
        
                            } else {
                                exit_err(code, "error: http error " + code, cb);
                            }
                        }
                    });

                }
            };

            if (arrayed) {
                make_array_template(formId, path, op);
            }

            app.template_links[linkpath + "/" + op] = app.templates[path][op];
        };

        make_template("user", "create", "account");
        make_template("user", "edit", "account");
        make_template("user", "deleted", "account");
        make_template("token", "create", "session", false, function (){ 
            if (app.config.sessionToken && app.config.sessionToken. email) {
                return {email : app.config.sessionToken.email}
            }
            return {}
        });
        make_template("token", "deleted", "session");
        make_template("menu", "list", undefined, true);
        make_template("menu", "view");
        make_template("menu", "create");
        make_template("menu", "edit");
        make_template("cart", "view", undefined, true);
        make_template("cart", "checkout");
        make_template("order", "complete");
        make_template("order", "failed");
        make_template("order", "list", undefined, true);
        make_template("order", "view");

    };



    // app.interceptFormSubmits attaches a generic callback to prevent default form submit
    // and use our own javascript AJAX style submit without losing current browser page.
    app.init.interceptFormSubmits = function() {

        var onFormSubmit = function(e) {

            // Stop the form from submitting
            e.preventDefault();

            // pull in formId,path & method from form object.
            var formId = this.id,
                path = app.helpers.resolve_uri(this.action),
                method = this.method.toLowerCase();

            // Hide any messages currently shown due to a previous error.
            ["formError", "formSuccess"].forEach(function(el) {
                var sel = "#" + formId + " ." + el;
                if (document.querySelector(sel)) {
                    document.querySelector(sel).style.display = 'none';
                }
            });

            // submit the form data using API
            app.submitFormData(formId, app.helpers.resolve_uri(path).substr(4), method, function(code, responsePayload, payload) {
                // Display an error on the form if needed
                if (code !== 200) {

                    if ([403, 401].indexOf(code) >= 0) {
                        // log the user out
                        app.logout("account/deleted");

                    } else {

                        // Try to get the error from the api, or set a default error message
                        var error = typeof(responsePayload.Error) == 'string' ? responsePayload.Error : 'An error has occured, please try again';

                        // Set the formError field with the error text
                        document.querySelector("#" + formId + " .formError").innerHTML = error;

                        // Show (unhide) the form error field on the form
                        document.querySelector("#" + formId + " .formError").style.display = 'block';
                    }
                } else {
                    // If successful, send to form response processor
                    var processor = app.after_submit[formId] || app.after_submit._generic;
                    processor(responsePayload, payload, formId);

                }
            });

        };

        var captureFormSubmit = function(form) {
            form.addEventListener("submit", onFormSubmit)
        };

        document.querySelectorAll("form").forEach(captureFormSubmit);
    };


    // set 
    app.init.interceptButtonLinks = function() {
        document.querySelectorAll("li a").forEach(function(el) {

            var buttonId = el.id,
                uri = app.helpers.resolve_uri(el.href),
                clickHandler = app.buttons[buttonId] || app.buttons[uri];

            if (buttonId && typeof uri === "string" && typeof clickHandler === 'function') {

                if (uri === "#") {

                    return el.addEventListener("click", function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        clickHandler();
                    });

                }
            }

            var templateHandler = app.template_links[uri];
            if (typeof templateHandler === "function") {
                clickHandler = app.buttons[uri];
                if (typeof clickHandler === "function") {
                    el.addEventListener("click", function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        templateHandler(function() {
                            clickHandler();
                        });
                    });
                }

            }



        });
    };


    app.init.localStorage = function() {
        var tokenString = localStorage.getItem('token');
        if (typeof(tokenString) == 'string') {
            try {
                var token = JSON.parse(tokenString);
                app.config.sessionToken = token;
                if (typeof(token) == 'object') {
                    if (token.id) {
                        // attempt to extend token
                        app.api.token.put({token:token.id},function(code,token){
                            if (code==200) {
                                 // session extended ok - must be logged in
                                 app.config.sessionToken = token;
                                 app.setLoggedInClass(true);    
                            } else {
                                // session extend faild - can't have been logged in, or has expired
                                 app.config.sessionToken.id=false;
                                 app.setLoggedInClass(false);
                            }
                            var tokenString = JSON.stringify(app.config.sessionToken);
                            localStorage.setItem('token',tokenString);
                        });
                        
                    } else {
                        // been logged in before, but not anymore
                        app.setLoggedInClass(false);
                        app.templates.token.create({email:token.email});
                    }
                } else {
                    // never been logged in
                    app.setLoggedInClass(false);
                    app.templates.user.create();
                }
            } catch (e) {
                // corrupt or never been logged in
                app.config.sessionToken = false;
                app.setLoggedInClass(false);
            }
        }
    };

 