/*
  File: helpers/validate.js
  Project: Asignment 2 https://github.com/jonathan-annett/pirple2
  Synopsis: helper validation functions
  Used By:  
*/

/*
Copyright 2018 Jonathan Annett

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var lib = module.exports = {};
const dns = require('dns');

// calls cb with true or false depending on if domain is a valid domain
// (first call does dns lookup then caches result)
lib._domain_cache = {};
lib._domain = function(domain, force, cb) {
    if (typeof force === 'function') {
        cb = force;
        force = false;
    }
    var cache = lib._domain_cache;
    if (!force && typeof cache[domain] === 'boolean') return cb(cache[domain]);

    dns.lookup(domain, {
        hints: dns.ADDRCONFIG,
        all: true
    }, function(err, address) {
        cb((cache[domain] = !err && typeof address === 'object' && address.length > 0));
    });
};

lib.email = function(obj, cb) {
    if (typeof obj === 'object') {

        if (typeof obj.email === 'string') {

            // use regex to see if email "looks ok"
            var re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

            if (re.test(obj.email)) {

                var parts = obj.email.split('@');
                if (parts.length == 2) {

                    // now see if the email is a valid domain
                    var domain = parts[1];

                    return /*<-- defer callback*/ lib._domain(domain, function(domain_is_valid) {
                        var result = domain_is_valid ? obj.email : false;
                        return typeof cb === 'function' ? cb(result) : result;
                    });

                }
            }
        }
    }

    return typeof cb === 'function' ? cb(false) : false;

};

const alphas = 'qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM';
const numerics = '0123456789';
const alphanumerics = alphas + numerics;

lib._is_instr = function(str, inside, cb) {

    var result = typeof str === 'string' && typeof inside === 'string' && str.length > 0;

    if (result) {
        for (var i = 0; i < str.length; i++) {
            if (inside.indexOf(str.charAt(i)) < 0) {
                result = false;
                break;
            }
        }
    }

    return typeof cb === 'function' ? cb(result) : result;
}

lib._alpha = function(str, cb) {
    return lib._is_instr(str, alphas, cb);
};

lib._numeric = function(str, cb) {
    return lib._is_instr(str, numerics, cb);
};

lib._alphanumeric = function(str, cb) {
    return lib._is_instr(str, alphanumerics, cb);
};

// must be at least 2 space separated name parts (eg "John Smith" or "John David Smith")
// first and last name part must be alpha
// if more than 2 name parts are specified, last name part can be alphanumeric eg "Winston Davies the 3rd" or "John Smith 2"
lib.name = function(obj, cb) {
    var result = false;

    if (typeof obj === 'object') {

        if (typeof obj.name === 'string') {

            // remove spaces at beginning and end
            var trimmed = obj.name.trim();

            if (trimmed.length > 0) {

                // remove double spaces inside the name
                while (trimmed.indexOf('  ') >= 0) {
                    trimmed = trimmed.split('  ').join(' ');
                }

                // separate each name
                var names = trimmed.split(' ');

                if (names.length == 2) {

                    if (lib._alpha(names[0]) && lib._alpha(names[1])) {
                        result = trimmed;
                    }

                    return typeof cb === 'function' ? cb(result) : result;
                }

                if (names.length > 2) {

                    result = trimmed;

                    for (var i = 0; i < names.length; i++) {
                        var nm = names[i];
                        if (!lib[i < names.length - 1 ? '_alpha' : '_alphanumeric'](nm)) {
                            result = false;
                            break;
                        }
                    }
                }

            }
        }

    }

    return typeof cb === 'function' ? cb(result) : result;
};

// basic street address validation:
// at least 3 terms
// terms nust be alpha or numeric (not alpha numeric)
// at least one of the terms must be numeric


lib.street_address = function(obj, cb) {

    var result = false;

    if (typeof obj === 'object') {

        if (typeof obj.street_address === 'string') {

            // remove spaces at beginning and end
            var trimmed = obj.street_address.trim();

            if (trimmed.length > 0) {

                // remove double spaces inside the name
                while (trimmed.indexOf('  ') >= 0) {
                    trimmed = trimmed.split('  ').join(' ');
                }

                // separate each name
                var words = trimmed.split(' ');

                if (words.length > 2) {

                    for (var i = 0; i < words.length; i++) {
                        var word = words[i];

                        if (lib._numeric(word)) {
                            result = trimmed;
                            continue;
                        }

                        if (lib._alpha(word)) {
                            continue;
                        } else {
                            result = false;
                            break;
                        }
                    }


                }
            }
        }

    }

    return typeof cb === 'function' ? cb(result) : result;

};


// obj = payload from upload request
// validates name,street_addresss using validation rules
// calls cb(false) if any aspect of required fields are missing or invalid
// calls cb() with a new object of cleaned up user input (eg trimmed etc) with just the required fields
// DOES NOT CHECK IF USER EXISTS IN FILE SYSTEM - caller must do this in the callback
lib.new_user = function(obj, cb) {


    lib.email(obj, function(email) {

        if (!email) return cb(false);

        lib.street_address(obj, function(street_address) {

            if (!street_address) return cb(false);

            lib.name(obj, function(name) {

                if (!name) return cb(false);

                return cb({
                    name: name,
                    email: email,
                    street_address: street_address
                });

            });
        });
    });
};

// assumes caller has prevalidated the email as beloging to an existing user
// assumes update contains payload from update request
// assumes user contains currently stored user data
// validates that email address matches the existning user data
// then validates name and street address according to validation rules
// calls cb(false) if 
// -- any of the above assumptions prove to be false
// -- neither street_address or name are supplied in update
// -- one or other of the required fields are invalid
// otherwise, upates the user object and calls cb with it
// DOES NOT INTERACT WITH FILE SYSTEM AT ALL. caller and cb must do that.
lib.update_user = function(update, user, cb) {

    if (typeof update === 'object' && typeof user === 'object' && typeof update.email === 'string' && update.email === user.email &&

    (update.street_address || update.name)) {

        lib.street_address(update, function(street_address) {

            if (update.street_address && !street_address) {
                return cb(false);
            }

            lib.name(update, function(name) {

                if (update.name && !name) {
                    return cb(false);
                }

                if (street_address) {
                    user.street_address = street_address;
                }

                if (name) {
                    user.name = name;
                }

                return cb(user);

            });

        });

    } else {
        return cb(false);
    }
};



if (process.mainModule === module) {
 
    lib.new_user({
        email: 'some.user@gmail.com',
        street_address: '14 nowhere place',
        name: 'some user'
    }, function(test1){
        
        lib.new_user({
            email: 'bad email address',
            street_address: '14 nowhere place',
            name: 'some user'
        }, function(test2){
            
            lib.new_user({
                email: 'some.user@gmail.com',
                street_address: 'my house',
                name: 'some user'
            }, function(test3){
                
                lib.new_user({
                    email: 'some.user@gmail.com',
                    street_address: '14 nowhere place',
                    name: 'Jim'
                }, function(test4){
                    
                    console.log([test1,test2,test3,test4])
                    
                });
                
                
            });
            
            
            
        });
        
    });

 


}