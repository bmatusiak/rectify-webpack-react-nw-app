var React = require('react');
var { useState, useCallback } = React;
var looksLike = require('../log/looks-like');

//the rule, and the reading and writing it guards -- everything here works
//against any store shaped like ../webStorage's, which is what lets a fake hold
//the states a running window will not.

//A REMEMBERED VALUE IS A PLACE, AND A PLACE IS SHORT. Four kilobytes is far
//more than any tab name, pane name or row name, and far less than anything
//somebody was reading. The number is not the rule -- it is the only part of the
//rule a machine can check, and ./README.md says so rather than letting this
//look like the whole of it.
var MOST = 4096;

//ONE KEY AT A TIME, WHICH IS NOT FUSS.
//
//../webStorage builds its object by defining a property PER KEY IT WAS GIVEN A
//DEFAULT FOR -- see the loop in its window.js. So a store asked for with `{}`
//has no properties at all, and every read off it comes back undefined however
//much is sitting in storage underneath. That is a store which saves faithfully
//and cannot load, and from the outside it reads as "nothing was ever saved":
//the value appears in the profile, and every restart still opens on page one.
//
//Naming the key as a default is what fixes it, and is also the documented
//shape -- the getter reads storage, so a value already there wins and the
//default is written only when there is nothing.
function pair(k, v) { var o = {}; o[k] = v; return o; }

module.exports = function Remembering(store, warn) {
    warn = warn || function () { };

    function slot(area, key, fallback) { return store(area, pair(key, fallback)); }

    //WHY THE RULE IS ENFORCED AND NOT MERELY WRITTEN DOWN. The app this came
    //from states it in a header -- only where somebody was looking, never what
    //they were looking at -- and nothing checks it, so the first person to keep
    //a token here would find out from a support bundle.
    //
    //NEITHER CHECK IS THE RULE. They are the two halves of it a machine can
    //see: a credential has shapes worth knowing, and content is long. A field
    //that is short, plain and secret still gets through, which is why the
    //sentence is in the README as well -- a check that pretended to be the whole
    //rule would be worse than this one, because it would be believed.
    function refuses(value) {
        var text;
        try { text = typeof value === 'string' ? value : JSON.stringify(value); }
        catch (e) { return 'that cannot be written down at all: ' + e.message; }

        if (text === undefined) return 'there is nothing there to keep';

        if (text.length > MOST) {
            return 'that is ' + text.length + ' characters, which is what somebody was looking '
                + 'AT rather than where they were looking';
        }

        //BROWSER STORAGE IS THE WRONG SHAPE FOR A SECRET, whatever the value
        //happens to be: readable by anything running in the page, kept in a
        //profile directory nobody thinks of as sensitive, and copied around by
        //whatever syncs profiles.
        if (looksLike.looksSecret(text)) {
            return 'that looks like a credential, and this store is readable by anything '
                + 'running in the page -- see core/secret';
        }

        return null;
    }

    //EVERY READ AND WRITE IS GUARDED, and it is not defensive habit: storage
    //genuinely throws, in private mode and on a full disk. A window that will
    //not open because it could not remember which tab was showing is a poor
    //trade for the convenience.
    function read(area, key, fallback) {
        try {
            var v = slot(area, key, fallback)[key];
            return v === undefined ? fallback : v;
        } catch (e) { return fallback; }
    }

    //ANSWERS WHETHER IT KEPT IT, rather than nothing. A refusal that is only a
    //console line is a refusal nothing can act on -- and the caller may want to
    //say so on screen instead of quietly carrying on.
    function write(area, key, value) {
        var no = refuses(value);

        if (no) {
            warn('remember: ' + area + '.' + key + ' was not kept -- ' + no);
            return false;
        }

        try { slot(area, key, value)[key] = value; return true; }
        catch (e) { return false; }
    }

    //A useState THAT SURVIVES A RESTART, and the same shape on purpose: a page
    //swapping one for the other should not have to change anything else around
    //it. That is also why a refused write still moves the state -- the pane
    //behaves as it would have with useState, and only the memory is lost.
    function use(area, key, fallback) {
        var [v, setV] = useState(function () { return read(area, key, fallback); });

        var set = useCallback(function (next) {
            setV(function (was) {
                var value = typeof next === 'function' ? next(was) : next;
                write(area, key, value);
                return value;
            });
        }, [area, key]);

        return [v, set];
    }

    return { use: use, read: read, write: write, refuses: refuses, MOST: MOST };
};
