var deciding = require('./deciding');
var Stance = require('./stance');

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
async function plugin(imports, register, config) {
    var { state, ipc, bridge } = imports;
    var say = imports.log.on('may');

    //---- and the other half of it: what this build reaches at all ----------
    //
    //THE DECLARE/DECIDE MACHINERY ABOVE IS A DENY LIST, and every file in this
    //app that has met one says the same thing about them -- ../log, ../events
    //and ../../../profile.js each land on some version of "a deny list is a
    //list somebody has to have got right". Everything not marked is reachable,
    //and this app has twenty pages of controls with a handful marked.
    //
    //Measured, on this app's own demo: `node src/cli.js read "#f-plain"` handed
    //back `hunter2` from an unguarded password field, with no dialog and no
    //record. Not a bug in the guard -- the guard's premise.
    //
    //SO A CLOSED BUILD IS DEFAULT-DENY AND DOES NOT ASK. `once`/`run`/`always`
    //are for a capability somebody weighs up; a default-deny that raised a
    //dialog for every one of hundreds of controls would be answered `always` to
    //everything inside a week, and then it would be a deny list again with
    //extra steps. In a closed build the only way in is that somebody listed it
    //before shipping.
    //
    //BUILD_OPEN IS A CONSTANT AND ../../../stance.js DECIDED IT. Development is
    //open, a package is not, and the switch cannot be flipped by whoever runs
    //the app -- which matters more here than anywhere, because the thing being
    //shut off is the runtime.
    //`config.may.open`, NOT `config.open`. The third argument is the WHOLE of
    //src/config.js and every plugin indexes into it by the service it provides
    //-- ../events reads `config.events`, ../tray reads `config.tray`. Written
    //the short way this read `undefined`, which ./stance.js takes for "nobody
    //listed anything" and answers by reaching NOTHING: a closed build that
    //refuses its own open list, with no error anywhere. ../events/main.js
    //carries the same note because it made the same mistake, and there it went
    //unnoticed for as long as the defaults happened to agree.
    var mine = Stance.of(BUILD_OPEN, config && config.may && config.may.open);

    if (mine.unreadable) {
        //SAID WHETHER OR NOT IT IS BEING CONSULTED. An open build does not read
        //the list, so this is the only warning a developer gets before the
        //package they ship reaches nothing at all.
        say.warn('config.may.open could not be read (' + mine.unreadable + '), so a closed '
            + 'build would reach nothing' + (mine.open ? '. This build is open, so it is not '
                + 'being consulted -- but the package built from it would be' : ''));
    }

    say.info('this build is ' + (mine.open ? 'open: anything on the control socket may drive it'
        : 'closed: ' + mine.lists.commands.length + ' commands are reachable and nothing else'));

    //INSTALLED HERE RATHER THAN CHECKED IN ../ipc, because ../ipc cannot consume
    //this -- this consumes it. The hook is ../ipc's and the rule is ours, which
    //is the same cut as ../../remote/window.js being handed its `refusedFor`.
    var gate = ipc.gate(function (name) { return mine.reaches('commands', name); });

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

        //A PERSON'S OWN PRESS ANSWERS THE QUESTION, so nobody is asked about it.
        //
        //../may/window.js has always done this for a guarded control, which is
        //why main never saw the case: the page short-circuits a trusted press
        //and never emits `may:want` at all. But a capability whose CODE lives in
        //main -- ../../debug-snapshot is the first -- has to come through here,
        //and without this a person pressing ctrl+shift+D got a dialog asking
        //whether they had meant to press ctrl+shift+D.
        //
        //ONLY WHEN NOBODY HAS SAID, which is the one difference from the page's
        //version. `out.ask` is already false for a stored `never`, so this
        //answers an open question and does not overrule an answer somebody
        //already gave. A person who refused this last week should have to take
        //that back on purpose rather than by pressing the key again.
        //
        //AND IT ASKS ./deciding.js RATHER THAN TESTING `from` HERE. Written out
        //as `from.window && from.trusted` it was a SECOND definition of "a
        //person did this", sitting a few lines from the first -- and its own
        //sabotage run proved nothing was watching it, because every entry in the
        //list was about the original.
        if (deciding.personDid(from)) {
            return { allowed: true, why: 'you did it yourself' };
        }

        //AND ONLY A PERSON CAN BE ASKED, AT THE WINDOW. Everything else gets the
        //refusal with the reason -- which is an answer a caller can show to
        //whoever asked it.
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

        //AND EVERY PAGE IS TOLD. The window keeps a mirror so a control can be
        //painted without waiting -- a mirror nobody updates is a screen showing
        //an answer that is no longer the answer, which on this particular screen
        //is worse than showing nothing.
        tell();

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
        tell();

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

    //---- and what a tool can reach, for a screen --------------------------
    //
    //ONE ANSWER, USED BY EVERY SURFACE THAT SHOWS IT. The page, the ipc command
    //and the mirror the window keeps are three views of one fact, and three
    //places assembling it is three chances for the screen that is supposed to
    //say what a tool can reach to say something else.
    function reach() {
        //WHAT IS LISTED BUT NOT THERE. The only drift a list of names invites --
        //a command renamed and the entry left behind, promising something
        //reachable that does not exist. The other direction needs no help: a new
        //command is closed until somebody lists it.
        var here = ipc.commands();

        return {
            open: mine.open,
            closed: mine.closed,
            unreadable: mine.unreadable,
            lists: mine.lists,
            stale: { commands: mine.stale('commands', here) },

            //SO THE SCREEN CAN SAY "3 of 27" RATHER THAN JUST NAMING THREE. The
            //shape of what is shut is the reassurance; the names alone are only
            //half of it.
            counts: { commands: here.length }
        };
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

        //REFUSED FOR THE SAME REASON AND BY THE SAME LINE. Taking a guard back
        //from a terminal is `guardSet --off` by another name -- the exact move
        //this whole plugin exists to make impossible.
        if (said.forget) {
            var went = forget(said.forget, source);
            return went.refused ? { refused: went.refused } : went;
        }

        //THE STANCE COMES BACK WITH THE DECISIONS, so `node src/cli.js may` is
        //the whole inventory rather than half of it -- and `may` is on the
        //shipped open list precisely so a person at a terminal can still ask a
        //closed build what it allows. Reading that was never the risk.
        return { decisions: decisions(), answers: deciding.ANSWERS, reach: reach() };
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
                answer: (one && one.answer) || forRun[name] || null,

                //WRITTEN DOWN, OR ONLY TRUE UNTIL THIS PROCESS ENDS. The page
                //needs the difference to say it: "always" and "for this run"
                //look identical from `answer` alone, and a screen offering to
                //take back something that was never written would be offering
                //to undo nothing.
                remembered: !!one,
                at: (one && one.at) || null
            };
        });
    }

    function tell(socket) {
        try { (socket || bridge.io).emit('may:guards', { guards: published(), reach: reach() }); }
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
            if (typeof ack == 'function') ack({ guards: published(), reach: reach() });
        });

        socket.on('may:want', async function (said, ack) {
            if (typeof ack != 'function') return;

            var name = said && said.name;
            var out = await may(name, { from: { window: true, trusted: !!(said && said.trusted) } });

            ack(out);
        });

        //TAKING ONE BACK IS A DECISION, so it goes through the same door and the
        //same rule: the page says whether the browser called the press a
        //person's, and ./deciding.js is the only thing that reads it.
        //
        //IT IS NOT SAFE-FROM-ANYBODY THE WAY "Not now" IS, even though it can
        //only ever make the app do less. A driven run that could forget things
        //could clear a `never` -- and the next outside caller would be asked
        //about something a person had already refused, which is how a refusal
        //quietly becomes a question again.
        socket.on('may:forget', function (said, ack) {
            var out = forget(said && said.name, { window: true, trusted: !!(said && said.trusted) });
            if (typeof ack == 'function') ack(out);
        });
    });

    await register(null, {
        may: Object.assign(may, {
            //WHAT THE CODE PROPOSES. Called again for the same name replaces it,
            //because this half is loaded once but a plugin that reloads may
            //declare its capabilities again.
            declare: function (name, about) {
                declared[name] = { about: (about && about.about) || (typeof about === 'string' ? about : null) };
                tell();

                return function () { delete declared[name]; tell(); };
            },

            asks: asks,

            //THE OTHER HALF, AND IT IS NOT A QUESTION ANYBODY CAN ANSWER. `asks`
            //is "would this need consent"; this is "does this build reach that
            //at all", which was settled when the build was made. A caller gets
            //null or a sentence, the same shape ./deciding.js answers in.
            reaches: function (kind, name) { return mine.reaches(kind, name); },
            stale: function (kind, present) { return mine.stale(kind, present); },
            reach: reach,
            stance: mine.open ? 'open' : 'closed',

            decide: decide,
            forget: forget,
            decisions: decisions,
            ANSWERS: deciding.ANSWERS
        }),

        onDestroy: function () { command.remove(); gate.remove(); }
    });
}
module.exports = plugin;
