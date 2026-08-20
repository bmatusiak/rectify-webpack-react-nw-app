//hands, to go with the eyes that `capture` gave.
//
//the window half is the only place that can touch the document, so the actual
//clicking happens here and the rest of the plugin is plumbing to reach it.
//
//deliberately not an `eval` channel. one would have been three lines and would
//have answered every question this plugin will ever be asked -- and would also
//have handed anything that can open a local socket the run of the app, which is
//the exact thing nwjc was for. so: verbs, and only these.

plugin.consumes = ['io'];
plugin.provides = [];
async function plugin(imports, register) {
    var io = imports.io;

    //the server picks which view to talk to, and there can be more than one:
    //`open in browser` makes a second. this is how it tells them apart.
    function hello() {
        io.emit('remote:hello', {
            //set by src/app/window/main.js on the url it opens. not sniffable
            //from in here: the user agent is an ordinary chrome one and there
            //is no node in this context to ask.
            app: new URLSearchParams(location.search).get('view') === 'app',
            title: document.title,
            href: location.href
        });
    }
    hello();
    io.on('connect', hello);//a server reload drops every socket and they come back
    io.on('remote:who', hello);//and the answer to that can arrive before it is up

    function answer(fn) {
        return function (data, ack) {
            if (typeof ack != 'function') return;//nobody is waiting
            try { ack(fn(data || {})); }
            catch (e) { ack({ error: (e && e.message) || String(e) }); }
        };
    }

    io.on('remote:click', answer(click));
    io.on('remote:fill', answer(fill));
    io.on('remote:read', answer(read));

    await register(null, {
        onDestroy: function () {
            io.off('connect', hello);
            io.off('remote:who', hello);
            io.off('remote:click'); io.off('remote:fill'); io.off('remote:read');
        }
    });
}

//---- finding it ----------------------------------------------------------

//three ways to say which element, tried in that order. a css selector first,
//because it is exact; then the visible text, because "the button that says
//Ping" is how people think about a screen; then a point, which is the only one
//of the three that respects what is on top.
function locate(data) {
    if (data.selector) {
        var el = null;
        try { el = document.querySelector(data.selector); }
        catch (e) { el = null; }//not valid css, so it was probably meant as text
        if (el) return { el: el, found: 'selector' };

        var byText = text(data.selector);
        if (byText) return { el: byText, found: 'text' };

        throw new Error('nothing matches "' + data.selector + '", as a selector or as text');
    }

    if (data.text) {
        var t = text(data.text);
        if (!t) throw new Error('nothing reads "' + data.text + '"');
        return { el: t, found: 'text' };
    }

    if (typeof data.x == 'number' && typeof data.y == 'number') {
        var hit = document.elementFromPoint(data.x, data.y);
        if (!hit) throw new Error('nothing is at ' + data.x + ',' + data.y);
        return { el: hit, found: 'point' };
    }

    throw new Error('say which: a selector, {"text":"..."} or {"x":0,"y":0}');
}

//only things a person could click or type into, so the word System in a
//heading does not win over the System in the sidebar
var CLICKABLE = 'button, a, input, select, textarea, label, summary, [role=button], [role=tab], [role=option], .btn, .nav-link, .list-group-item, .dropdown-item';

function text(wanted) {
    var want = String(wanted).trim().toLowerCase();
    var all = Array.prototype.slice.call(document.querySelectorAll(CLICKABLE));

    var exact = all.filter(function (el) { return label(el) == want; });
    if (exact.length) return only(exact, wanted);

    var partial = all.filter(function (el) { return label(el).indexOf(want) >= 0; });
    return partial.length ? only(partial, wanted) : null;
}

//a screen can easily say the same word twice -- the demo has a `light` button
//variant and a Light mode toggle -- and picking one of them silently is how
//you end up clicking a thing you never named and believing you clicked the
//other. matching more than one is an answer, and the answer is which ones.
function only(list, wanted) {
    var seen = list.filter(function (el) {
        var box = el.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
    });

    var use = seen.length ? seen : list;
    if (use.length == 1) return use[0];

    throw new Error('"' + wanted + '" matches ' + use.length + ': ' +
        use.slice(0, 6).map(function (el) { return describe(el).element; }).join(', ') +
        (use.length > 6 ? ', ...' : '') + '. name one with a css selector');
}

function label(el) {
    return String(el.textContent || el.value || el.getAttribute('aria-label') || '')
        .replace(/\s+/g, ' ').trim().toLowerCase();
}

//a bootstrap app keeps whole pages in the dom with display:none on them, and
//clicking one of those does nothing anybody can see
function visible(list) {
    for (var i = 0; i < list.length; i++) {
        var box = list[i].getBoundingClientRect();
        if (box.width > 0 && box.height > 0) return list[i];
    }
    return null;
}

var FORM = /^(SELECT|INPUT|TEXTAREA)$/;

function describe(el) {
    var name = el.tagName.toLowerCase();
    if (el.id) name += '#' + el.id;
    else if (el.className && typeof el.className == 'string')
        name += '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.');

    //a select's textContent is every option run together, which reads as
    //gibberish. what a form control is called is what it is labelled.
    var said = FORM.test(el.tagName)
        ? String(el.getAttribute('aria-label') || el.placeholder || el.name || el.type || '')
        : String(el.textContent || '');

    said = said.replace(/\s+/g, ' ').trim();
    return { element: name, text: said.length > 60 ? said.slice(0, 57) + '...' : said };
}

//---- doing it ------------------------------------------------------------

//not element.click(). that fires one event, and half of bootstrap is listening
//for the ones around it -- dropdowns close on pointerdown, carousels drag on
//mousedown. this is the sequence a mouse actually produces.
function press(el) {
    el.scrollIntoView({ block: 'center', inline: 'center' });

    var box = el.getBoundingClientRect();
    var x = box.left + box.width / 2;
    var y = box.top + box.height / 2;

    fire(el, 'pointerdown', x, y);
    fire(el, 'mousedown', x, y);
    try { el.focus({ preventScroll: true }); } catch (e) { /* not focusable */ }
    fire(el, 'pointerup', x, y);
    fire(el, 'mouseup', x, y);
    fire(el, 'click', x, y);

    return { x: Math.round(x), y: Math.round(y) };
}

function fire(el, type, x, y) {
    var pointer = type.indexOf('pointer') === 0 && typeof PointerEvent == 'function';
    var init = {
        bubbles: true, cancelable: true, composed: true, view: window,
        clientX: x, clientY: y, screenX: x, screenY: y,
        button: 0, buttons: type.indexOf('down') > 0 ? 1 : 0,
        detail: type == 'click' ? 1 : 0
    };
    if (pointer) { init.pointerId = 1; init.pointerType = 'mouse'; init.isPrimary = true; }
    el.dispatchEvent(new (pointer ? PointerEvent : MouseEvent)(type, init));
}

function click(data) {
    var hit = locate(data);
    var where = press(hit.el);
    return { found: hit.found, at: where, clicked: describe(hit.el) };
}

function fill(data) {
    var hit = locate(data);
    var el = hit.el;

    if (el.type == 'checkbox' || el.type == 'radio') {
        var want = data.value === undefined ? !el.checked
            : !(data.value === false || data.value === 'false' || data.value === 0 || data.value === '');
        //clicking rather than assigning, because that is the path react hears
        if (el.checked !== want) press(el);
        return { found: hit.found, filled: describe(el), checked: el.checked };
    }

    var value = data.value === undefined ? '' : String(data.value);

    if (el.tagName == 'SELECT') {
        var options = Array.prototype.slice.call(el.options).map(function (o) { return o.value; });
        if (options.indexOf(value) < 0) throw new Error(
            '"' + value + '" is not one of its options. it has: ' + options.join(', '));
    }

    set(el, value);
    return { found: hit.found, filled: describe(el), value: el.value };
}

//react remembers the last value it wrote and drops any change event whose value
//it believes it already knows about, so assigning el.value moves the input on
//screen and nothing else. going through the prototype's own setter moves the
//value react is tracking along with it.
function set(el, value) {
    var descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
    if (descriptor && descriptor.set) descriptor.set.call(el, value);
    else el.value = value;

    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
}

function read(data) {
    if (data.selector) {
        var many = [];
        try { many = Array.prototype.slice.call(document.querySelectorAll(data.selector)); }
        catch (e) { many = []; }

        //asking about a class that matches nine things should say so rather
        //than quietly answering about the first
        if (many.length > 1) return {
            found: 'selector', count: many.length,
            items: many.slice(0, 25).map(describe)
        };
    }

    var hit = locate(data);
    var seen = describe(hit.el);
    return {
        found: hit.found, count: 1,
        element: seen.element, text: seen.text,
        value: hit.el.value === undefined ? null : hit.el.value,
        checked: hit.el.checked === undefined ? null : hit.el.checked,
        visible: !!visible([hit.el]),
        contrast: contrast(hit.el)
    };
}

module.exports = plugin;

//---- is it readable ------------------------------------------------------

//a screenshot shows you that a heading is hard to read. this says by how much,
//which is the difference between an opinion and a bug report. the ratio is
//wcag's: 4.5 is the floor for body text, 3 for large text.
function contrast(el) {
    var style = getComputedStyle(el);
    var fg = channels(style.color);
    var bg = behind(el);
    if (!fg || !bg) return null;

    var a = luminance(fg), b = luminance(bg);
    var ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

    return {
        color: style.color,
        background: bg.source,
        ratio: Math.round(ratio * 100) / 100,
        readable: ratio >= 4.5
    };
}

//the nearest ancestor that actually paints something, because a transparent
//background is not the colour the text sits on
function behind(el) {
    for (var node = el; node; node = node.parentElement) {
        var colour = channels(getComputedStyle(node).backgroundColor);
        if (colour && colour[3] > 0) { colour.source = getComputedStyle(node).backgroundColor; return colour; }
    }
    var body = channels(getComputedStyle(document.body).backgroundColor);
    if (body) body.source = getComputedStyle(document.body).backgroundColor;
    return body;
}

function channels(colour) {
    var text = String(colour);
    var parts = text.match(/[0-9.]+/g);
    if (!parts || parts.length < 3) return null;

    //rgb() counts to 255 and color(srgb ...) counts to 1. reading one as the
    //other makes every mixed colour look nearly black, which is how a
    //perfectly good subtitle measured 20.9 against white.
    var scale = /^color\(/.test(text) ? 255 : 1;

    return [+parts[0] * scale, +parts[1] * scale, +parts[2] * scale,
        parts.length > 3 ? +parts[3] : 1];
}

function luminance(rgb) {
    var v = rgb.slice(0, 3).map(function (c) {
        c = c / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
