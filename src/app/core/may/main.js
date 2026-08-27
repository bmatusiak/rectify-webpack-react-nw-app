var deciding = require('./deciding');

//---------------------------------------------------------------------------
//WHAT THIS APP IS ALLOWED TO DO, AND WHO SAID SO.
//
//THE CODE PROPOSES AND A PERSON DECIDES. A plugin says `may.declare('serve')` --
//that is the app's opinion that opening a port is somebody's decision to make --
//and it stands until a person answers. Nothing here decides anything on its own.
//
//IT GUARDS A CAPABILITY, NOT A CONTROL, and that is the whole difference from
//the app this idea came from. Over there a guard is keyed on the WORDS ON A
//BUTTON and enforced by the driver declining to press a purple one, which its
//own file admits leaves a hole: "a control outside the kit is a control the
//guard cannot see". A plain <button>, a renamed label, or anything calling the
//action directly walks past it.
//
//Here the doing goes through `may`. A control outside the theme can only fail to
//LOOK guarded; it cannot do the thing.
//
//---- why it lives in main -------------------------------------------------
//
//The node half is rebuilt on every save, so answers kept there would be
//forgotten by every edit -- and "for this run" would mean "until you next press
//ctrl-s", which is not what anybody agreed to.
//
//AND THE WINDOW CANNOT OWN WHAT GUARDS THE WINDOW. The thing being driven is not
//the thing to ask whether a drive is allowed.
//
//---- what it cannot do ----------------------------------------------------
//
//IT DOES NOT PROTECT AGAINST A SHELL. Anything that can run `node` in this
//folder can edit the code that calls `may` at all. What it protects is the app's
//own surface -- the control socket, the MCP tools, the driven window -- from
//being used to do things nobody agreed to, which is the realistic case now that
//a model can reach all three.
//---------------------------------------------------------------------------

plugin.consumes = ['state', 'log', 'ipc', 'bridge'];
plugin.provides = ['may'];
async function plugin(imports, register) {
    var { state, ipc, bridge } = imports;
    var say = imports.log.on('may');

    //WHAT THE CODE PROPOSED. Not stored: it is a fact about the code that is
    //running, so a capability that stops being declared stops being guarded --
    //and one that is declared later is guarded from that moment, without anybody
    //editing a file. The app this came from stores its exceptions for exactly
    //this reason, and this is the same idea with the list on the other side.
    var declared = Object.create(null);

    //ANSWERED FOR THIS RUN, AND KEPT NOWHERE ELSE. That is the whole promise:
    //it goes when the process does.
    var forRun = Object.create(null);

    var doc = null;
    function kept() { return doc || (doc = state.doc('may')); }

    function stored() {
        var out;

        try { out = deciding.read(kept().read({})); }
        catch (e) { out = { decisions: {}, unreadable: (e && e.message) || String(e) }; }

        if (out.unreadable) {
            //SAID EVERY TIME IT IS READ, not once at startup. An app that fails
            //shut silently looks exactly like an app nobody has answered yet.
            say.warn('the decisions could not be read (' + out.unreadable
                + '), so nothing remembered is being trusted');
        }

        return out;
    }

    function asks(name) { return !!declared[name]; }

    function world(name) {
        var back = stored();
        var one = back.decisions[name];

        return {
            declared: asks(name),
            kept: one && one.answer,
            runwise: forRun[name],
            unreadable: back.unreadable
        };
    }

    //---- asking a person --------------------------------------------------
    //
    //THROUGH ../bridge, WHICH IS MAIN'S OWN WIRE TO THE PAGE. It carries acks,
    //so this can ask and wait -- and it works when the node half is not running,
    //which the socket the window uses for everything else does not.
    var asking = Object.create(null);

    function ask(name, about, seconds) {
        //ONE PROMPT PER CAPABILITY, however many callers are waiting. Two
        //dialogs for one question is a person answering the same thing twice
        //and a second answer nobody reads.
        if (asking[name]) return asking[name];

        var waiting = new Promise(function (resolve) {
            var done = false;

            function settle(answer) {
                if (done) return;
                done = true;
                delete asking[name];
                resolve(answer);
            }

            //A QUESTION NOBODY ANSWERS IS A NO, and it has to be, or a call that
            //arrives while nobody is at the screen waits for ever holding
            //whatever it was doing.
            var timer = setTimeout(function () {
                say.info('nobody answered about ' + name + ', so it was refused');
                settle(null);
            }, (seconds || 120) * 1000);

            if (timer && timer.unref) timer.unref();

            if (!bridge.attached) return settle(null);

            //`bridge.io.emit`, NOT `bridge.emit`. The fan-out is the thing that
            //talks to pages; the service around it carries `attached`,
            //`trouble` and the rest. Getting that wrong answered every guarded
            //call with "bridge.emit is not a function", which reads as the
            //plugin being broken rather than as a prompt that never went out.
            bridge.io.emit('may:ask', { name: name, about: about }, function (said) {
                clearTimeout(timer);
                settle(said && said.answer);
            });
        });

        asking[name] = waiting;
        return waiting;
    }

    //---- the answer -------------------------------------------------------

    async function may(name, options) {
        options = options || {};

        var from = options.from || { overTheWire: false };
        var out = deciding.verdict(name, world(name));

        if (!out.ask) {
            if (!out.allowed) say.warn('refused ' + name + ': ' + out.why);
            return out;
        }

        //ONLY A PERSON CAN BE ASKED, AND ONLY AT THE WINDOW. Everything else
        //gets the refusal with the reason -- which is an answer a caller can
        //show to whoever asked it.
        var answer = await ask(name, options.about || (declared[name] && declared[name].about));

        if (!answer) return { allowed: false, why: 'nobody allowed ' + name };

        //A PROMPT IS ANSWERED BY A PERSON AT THE WINDOW BY DEFINITION -- the
        //dialog is in the page and ../may/window.js will not answer one it did
        //not see a trusted press for. Recording it goes through the same door
        //everything else does, so there is one rule rather than two.
        var wrote = decide(name, answer, { window: true, trusted: true });
        if (wrote.refused) return { allowed: false, why: wrote.refused };

        say.good('allowed ' + name + ' (' + answer + ')'
            + (from.overTheWire ? ', asked for over the control socket' : ''));

        return { allowed: answer !== 'never', why: 'a person answered ' + answer, answer: answer };
    }

    //---- and writing one down ---------------------------------------------

    function decide(name, answer, from) {
        var no = deciding.mayDecide(from);
        if (no) { say.warn('a decision about ' + name + ' was refused: ' + no); return { refused: no }; }

        if (deciding.ANSWERS.indexOf(answer) < 0) {
            return { refused: '"' + answer + '" is not one of ' + deciding.ANSWERS.join(', ') };
        }

        if (answer === 'run' || answer === 'never') forRun[name] = answer === 'run' ? 'always' : 'never';
        if (answer === 'run') say.info(name + ' is allowed for the rest of this run');

        if (deciding.keeps(answer)) {
            var was = kept().read({});
            var decisions = (was && was.decisions) || {};

            decisions[name] = { answer: answer, at: new Date().toISOString() };
            kept().write({ decisions: decisions });

            say.good(name + ' is ' + answer);
        }

        return { decided: answer };
    }

    //---- and taking one back ----------------------------------------------
    //
    //`always` WITHOUT THIS IS A ONE-WAY DOOR. A person who allowed something
    //once and changed their mind had no way to say so -- which makes the easy
    //answer the dangerous one, and teaches people to never pick it.
    //
    //IT IS A DECISION LIKE ANY OTHER, so it goes through the same rule: only a
    //person at the window. Forgetting is not refusing -- what it does is put the
    //capability back to nobody having said, so the next outside caller asks.
    function forget(name, from) {
        var no = deciding.mayDecide(from);
        if (no) { say.warn('forgetting ' + name + ' was refused: ' + no); return { refused: no }; }

        delete forRun[name];

        var was = kept().read({});
        var decisions = (was && was.decisions) || {};

        if (decisions[name]) {
            delete decisions[name];
            kept().write({ decisions: decisions });
        }

        say.info(name + ' is back to nobody having said');
        return { forgotten: name };
    }

    //---- what a person has decided, for a screen --------------------------

    function decisions() {
        var back = stored();

        return Object.keys(declared).sort().map(function (name) {
            var one = back.decisions[name];

            return {
                name: name,
                about: declared[name].about || null,
                answer: (one && one.answer) || forRun[name] || null,
                remembered: !!one,
                unreadable: back.unreadable || null
            };
        });
    }

    //---- and the command line can look, but not decide --------------------

    var command = ipc.handle('may', function (data, source) {
        var said = data || {};

        if (said.decide) {
            //THE REFUSAL IS THE POINT OF THE COMMAND EXISTING. Leaving it out
            //would mean somebody at a terminal discovers the rule by it not
            //working; this way they are told where to go instead.
            var out = decide(said.decide, said.answer, source);
            return out.refused ? { refused: out.refused } : out;
        }

        return { decisions: decisions(), answers: deciding.ANSWERS };
    });

    //---- and the page's side of the conversation --------------------------
    //
    //THE WINDOW ASKS AND MAIN ANSWERS, which is the direction that matters: the
    //page is the thing being driven, so it holds no decisions and reaches none.
    //It sends whether the browser called the press trusted, and ./deciding.js
    //does the rest.
    //
    //`trusted` COMING FROM THE PAGE IS NOT A WEAKNESS HERE. A page that could
    //lie about it could equally call the capability's own code -- it is the
    //same javascript context. What this stops is the driver, which reaches the
    //page from OUTSIDE and can only dispatch events the browser marks
    //untrusted. See ../../remote/window.js:186.
    function published() {
        var back = stored();

        return Object.keys(declared).sort().map(function (name) {
            var one = back.decisions[name];

            //THE ANSWER TRAVELS WITH THE NAME, so the page can say "allowed
            //always" next to a control rather than only that it is guarded --
            //and so anything asking whether a question would even be raised can
            //tell without raising one.
            return {
                name: name,
                about: declared[name].about || null,
                answer: (one && one.answer) || forRun[name] || null
            };
        });
    }

    function tell(socket) {
        try { (socket || bridge.io).emit('may:guards', { guards: published() }); }
        catch (e) { /* the page is not there, which is not this plugin's problem */ }
    }

    bridge.io.on('connection', function (socket) {
        tell(socket);

        //ASKED FOR, AS WELL AS SENT. `tell` above fires the moment a page
        //connects, which is BEFORE ../may/window.js has finished setting up and
        //attached its listener -- so the first list went out to nobody and every
        //guarded control painted itself unguarded. The same race ../io/window.js
        //documents for the bridge, one plugin further along.
        socket.on('may:list', function (said, ack) {
            if (typeof ack == 'function') ack({ guards: published() });
        });

        socket.on('may:want', async function (said, ack) {
            if (typeof ack != 'function') return;

            var name = said && said.name;
            var out = await may(name, { from: { window: true, trusted: !!(said && said.trusted) } });

            ack(out);
        });
    });

    await register(null, {
        may: Object.assign(may, {
            //WHAT THE CODE PROPOSES. Called again for the same name replaces it,
            //because this half is loaded once but a plugin that reloads may
            //declare its capabilities again.
            declare: function (name, about) {
                declared[name] = { about: (about && about.about) || (typeof about === 'string' ? about : null) };
                return function () { delete declared[name]; };
            },

            asks: asks,
            decide: decide,
            forget: forget,
            decisions: decisions,
            ANSWERS: deciding.ANSWERS
        }),

        onDestroy: function () { command.remove(); }
    });
}
module.exports = plugin;
