var deciding = require('./deciding');

//---------------------------------------------------------------------------
//ASKING THE PERSON, IN THE PAGE THEY ARE LOOKING AT.
//
//TWO JOBS, AND THEY ARE DIFFERENT. This half puts the question on screen and
//answers it; ./main.js decides what the answer means and writes it down. The
//page never holds a decision, because the page is the thing being driven.
//
//---- it does not use the theme, and that is on purpose --------------------
//
//../../ui/theme is a slot you are expected to replace, and a permission prompt
//that can be replaced is not one. This draws its own, out of plain dom and the
//swatch's own bootstrap classes -- so it survives a theme that failed to load,
//a theme somebody swapped, and a page whose react tree came down. ../../../
//overlay.js makes the same call for the same reason.
//
//IT IS ALSO WHY core DOES NOT CONSUME ui HERE. That direction is backwards
//everywhere else in the app and would be worse in this file than in any other.
//
//---- who the question is for ----------------------------------------------
//
//A PERSON PRESSING A GUARDED CONTROL IS NOT ASKED ANYTHING. Their press is the
//consent -- they are sitting there and they meant it. A dialog confirming what
//somebody just did is the kind people learn to click through without reading,
//and one of those is worth less than none.
//
//THE DIALOG IS FOR EVERYTHING ELSE: the command line, an MCP tool, a model
//driving the window. That is what a guarded control is FOR -- not to slow a
//person down, but to give an outside caller a way to ASK rather than either
//being refused outright or helping itself.
//
//`event.isTrusted` IS WHAT TELLS THEM APART, and a page cannot forge it: false
//for every event javascript constructs, which is what ../../remote/window.js
//builds to drive this app.
//
//SO THE LOCK MEANS "SOMETHING OUTSIDE HAS TO ASK ABOUT THIS", not "you need
//permission". It tells a person what the control is protected FROM.
//
//AND ONLY A PERSON MAY ANSWER THE DIALOG, which is what stops a driven click
//raising a question and a second driven click answering it. Refusing is the one
//thing anything may do -- see `answer` below.
//---------------------------------------------------------------------------

plugin.consumes = ['io'];
plugin.provides = ['may'];
async function plugin(imports, register) {
    var io = imports.io;

    //WHAT THE CODE PROPOSED, MIRRORED. `asks` has to answer without waiting --
    //it is read while a button is being painted -- so main sends the list and
    //this keeps it. A button that had to await an answer to know its own shape
    //would flash unguarded first, which is the one frame that matters.
    var guarded = {};
    var watchers = [];

    function apply(said) {
        guarded = {};
        ((said && said.guards) || []).forEach(function (one) { guarded[one.name] = one; });
        watchers.slice().forEach(function (fn) { try { fn(); } catch (e) { /* a watcher must not stop the rest */ } });
    }

    io.on('may:guards', apply);

    //AND ASKED FOR ONCE, RATHER THAN ONLY WAITED FOR.
    //
    //Main sends the list when a page connects, which is before this plugin has
    //finished setting up -- so the first one went to nobody, `asks` answered
    //false for everything, and every guarded control painted itself plain. The
    //press was still refused, which is the failure being the safe way round and
    //is not a reason to leave it.
    io.emit('may:list', {}, apply);

    function asks(name) { return !!guarded[name]; }

    //WHAT HAS ALREADY BEEN ANSWERED, so a page can say so next to a control --
    //and so anything that wants to know whether a question would be raised can
    //find out without raising one.
    function answered(name) { return (guarded[name] && guarded[name].answer) || null; }

    //THE GUARDED THINGS NOBODY HAS DECIDED YET. Its own suite needs this: a test
    //that wants to see the dialog has to pick something that would still raise
    //one, and `serve` having been answered once left it asking about nothing.
    function undecided() {
        return Object.keys(guarded).filter(function (name) { return !guarded[name].answer; }).sort();
    }

    //---- did a person do this ---------------------------------------------
    //
    //ASKED IN ONE PLACE, BY BOTH THINGS THAT NEED IT: the press that raises the
    //question and the press that answers it. It was written twice, and the
    //second copy could be broken with nothing noticing -- there is no way to
    //drive a prompt into existence to test it, because getting one to appear
    //requires the very press this refuses. Its own sabotage found that by
    //surviving.
    //
    //ONE FUNCTION MEANS THE TEST THAT COVERS THE BUTTON COVERS THE DIALOG, which
    //is the only way the dialog is coverable at all.
    //
    //`event.isTrusted` IS THE BROWSER'S OWN AND A PAGE CANNOT FORGE IT. False
    //for everything javascript dispatches -- see ../../remote/window.js:186,
    //which is what drives this app.
    function personPressed(event) { return !!(event && event.isTrusted); }

    //---- the prompt -------------------------------------------------------

    var ID = 'may-asking';

    function close() {
        var box = document.getElementById(ID);
        if (box && box.parentNode) box.parentNode.removeChild(box);
    }

    function prompt(name, about) {
        return new Promise(function (resolve) {
            close();

            var box = document.createElement('div');
            box.id = ID;
            box.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;' +
                'align-items:center;justify-content:center;background:rgba(0,0,0,.5)';

            var card = document.createElement('div');
            card.className = 'card shadow';
            card.style.cssText = 'max-width:32rem;margin:1rem';

            var body = document.createElement('div');
            body.className = 'card-body';

            var title = document.createElement('h5');
            title.className = 'card-title d-flex align-items-center gap-2';
            title.textContent = 'Allow ' + name + '?';

            var lead = document.createElement('p');
            lead.className = 'text-body-secondary mb-3';
            lead.textContent = about || 'Something asked to do this, and it is yours to decide.';

            var row = document.createElement('div');
            row.className = 'd-flex flex-wrap gap-2';

            //THE ORDER IS LEAST TO MOST, so the easy press is the small answer.
            //A dialog whose first button is "always" is a dialog that teaches
            //people to grant everything.
            var WORDS = {
                once: 'Just this once',
                run: 'For this run',
                always: 'Always',
                never: 'Never'
            };

            //SAYING NO IS THE ONE THING ANYTHING MAY DO.
            //
            //Every answer that ALLOWS needs a person, or a driven click could
            //raise the question and a second driven click could answer it --
            //the prompt would be the way around the prompt.
            //
            //REFUSING IS SAFE FROM ANYBODY, and making it so is not just a
            //convenience. A dialog only a person can dismiss is a dialog that
            //sits over the app until somebody comes back -- a driven run wedged
            //on a modal, with the thing it asked about not happening either way.
            function answer(said, safe) {
                return function (event) {
                    if (!safe && !personPressed(event)) return;

                    close();
                    resolve(said);
                };
            }

            deciding.ANSWERS.forEach(function (said) {
                var button = document.createElement('button');

                button.type = 'button';
                button.className = 'btn btn-sm ' + (said === 'never' ? 'btn-outline-danger'
                    : said === 'always' ? 'btn-primary' : 'btn-outline-secondary');
                button.textContent = WORDS[said];
                button.addEventListener('click', answer(said));

                row.appendChild(button);
            });

            //NOT AN ANSWER, AND NOT RECORDED. "Not now" is how the question goes
            //away without deciding anything -- and it is the one control here
            //that anything may press, because refusing can only make the app do
            //less than it was asked to.
            var away = document.createElement('button');

            away.type = 'button';
            away.className = 'btn btn-sm btn-link text-body-secondary ms-auto';
            away.textContent = 'Not now';
            away.addEventListener('click', answer(null, true));

            row.appendChild(away);

            body.appendChild(title);
            body.appendChild(lead);
            body.appendChild(row);
            card.appendChild(body);
            box.appendChild(card);
            document.body.appendChild(box);
        });
    }

    //MAIN ASKS AND THIS ANSWERS. The ack is how the answer gets back, which
    //../bridge/wire.js has carried all along.
    io.on('may:ask', async function (said, ack) {
        if (typeof ack != 'function') return;

        var answer = await prompt(said && said.name, said && said.about);
        ack({ answer: answer });
    });

    //---- and asking on behalf of a press ----------------------------------

    function may(name, event) {
        //A PERSON DID IT, SO IT HAPPENS. No round trip and no dialog: the press
        //IS the consent, and asking somebody to confirm what they just did is
        //how a prompt becomes something people click through unread.
        //
        //IT DOES NOT CONSULT A STORED `never` EITHER, and that is deliberate. A
        //`never` is an answer about what OUTSIDE callers may do; it was never a
        //promise to stop the person who set it from using their own app.
        if (personPressed(event)) {
            return Promise.resolve({ allowed: true, why: 'you pressed it yourself' });
        }

        //AND EVERYTHING ELSE ASKS. This is the case the whole plugin is for: a
        //model, a tool, or the command line reaching into the window, which main
        //turns into a question for whoever is sitting in front of it.
        return new Promise(function (resolve) {
            io.emit('may:want', { name: name, trusted: false }, function (out) {
                resolve(out || { allowed: false, why: 'nothing answered' });
            });
        });
    }

    await register(null, {
        may: Object.assign(may, {
            asks: asks,
            answered: answered,
            undecided: undecided,

            //SO A CONTROL REPAINTS THE MOMENT A DECISION CHANGES, rather than
            //at the next render something else happens to cause.
            onChange: function (fn) {
                watchers.push(fn);
                return function () { watchers = watchers.filter(function (x) { return x !== fn; }); };
            },

            //A DECISION IS NEVER MADE HERE. It is made by answering the prompt,
            //which main put up and main records -- this exists so a caller that
            //reaches for it finds the sentence rather than nothing.
            decide: function () {
                return {
                    refused: 'a decision is made by answering the prompt, not by calling decide'
                };
            },

            ANSWERS: deciding.ANSWERS
        })
    });
}
module.exports = plugin;
