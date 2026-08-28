var React = require('react');
var { useState, useEffect } = React;

//---------------------------------------------------------------------------
//A CONTROL WHOSE PRESS IS SOMEBODY'S TO MAKE.
//
//`<Button guard="serve">` PAINTS FROM THE REGISTRY AND ACTS THROUGH IT, which
//is the whole reason this file exists rather than a `variant="guarded"`. The
//mark and the refusal are the same fact: a developer cannot draw the lock
//without the gate, or gate without drawing it.
//
//The app this idea came from warns about exactly the gap that would leave:
//"the colour is only honest because of that refusal; a mark saying 'you cannot
//press this' on something a model can press is worse than no mark at all".
//
//---- why the mark is a shape ----------------------------------------------
//
//That app owns one theme and can reserve a hue. This ships twenty-eight it does
//not own, and FIVE ALREADY SPEND A PURPLE -- measured: cosmo and materia on
//`info`, pulse on `primary`, simplex on `danger`, and vapor's primary is
//#6f42c1, which is the exact colour there would be to reserve.
//
//So a lock and a ring say it. They are true in all twenty-eight by
//construction, they survive a swatch added next year, they survive
//colour-blindness, and they are legible in the greyscale of a screenshot --
//which matters, because `npm run drive --shots` writes pngs that end up in bug
//reports.
//
//`--bs-guarded` IS STILL A NAMED COLOUR, and it colours the ring and the glyph.
//A ring is not a field of colour, so a swatch that also spends purple does not
//collide with it -- which is what makes one token enough for every swatch.
//
//---- and a control outside this file ---------------------------------------
//
//A plain <button> can still be written, and it will not look guarded. What it
//cannot do is the thing: the capability is gated in main, so the worst an
//unmarked control achieves is a refusal the person did not see coming. That is
//the failure this design chooses to have, and it is the safe one -- theirs has
//it the other way round.
//---------------------------------------------------------------------------

module.exports = function makeGuarded(may, plain) {

    //WHETHER THIS NAME IS GUARDED, AS A FACT THAT CAN CHANGE WHILE THE PAGE IS
    //OPEN. Answering it once at mount would leave a control painted for a
    //decision somebody has since taken back.
    function useGuarded(name) {
        var [on, setOn] = useState(function () { return !!name && may.asks(name); });

        useEffect(function () {
            if (!name) return;

            setOn(may.asks(name));
            return may.onChange(function () { setOn(may.asks(name)); });
        }, [name]);

        return on;
    }

    //---- and the mark that means the opposite ------------------------------
    //
    //`open` SAYS A TOOL MAY USE THIS WITHOUT ASKING ANYBODY, which is only worth
    //saying in a build where that is unusual. In an open build everything is
    //reachable and a mark on three controls would read as "and nothing else",
    //which is the dangerous direction for a mark to be wrong in -- so it is
    //drawn only when the build is closed.
    //
    //NOT A HOOK AND NOT A SUBSCRIPTION. The stance is BUILD_OPEN, folded into
    //this bundle by webpack; it cannot change while the page is open, so there
    //is nothing to watch and nothing to re-render for.
    function closed() { return !!(may.closed && may.closed()); }

    //WHAT THE MARK IS, given both props. A control that is guarded AND open
    //shows GUARDED, and that is not a tie-break -- it is what the two words
    //mean. `open` is "a tool may use this without asking"; a guarded control
    //always asks. Drawing the open ring there would be the mark promising what
    //the mechanism does not do, which is the one thing this file exists to
    //avoid.
    function marks(guarded, open) {
        if (!closed() || !open || guarded) return null;
        return open;
    }

    function wrap(Control, options) {
        options = options || {};

        function Guarded(props) {
            var { guard, open, onClick, onRefused, className, icon, ...rest } = props;
            var on = useGuarded(guard);
            var reachable = marks(on, open);

            if (!guard) {
                //NOT `props`. Rendering the original would put `open` on the dom
                //as an attribute react does not know, and would drop the mark --
                //the two things this branch exists to get right.
                return React.createElement(Control, Object.assign({}, rest, {
                    className: [className, reachable ? 'is-open' : null].filter(Boolean).join(' ') || undefined,
                    'data-open': reachable || undefined,
                    icon: reachable && options.icon !== false ? 'robot' : icon,
                    onClick: onClick
                }));
            }

            async function press(event) {
                //ASKED WITH THE EVENT, NOT WITH A BOOLEAN. `may` reads
                //`isTrusted` off it before anything is awaited -- the browser's
                //own flag, false for everything javascript dispatches, which is
                //what ../../../remote/window.js builds to drive this app.
                var said = await may(guard, event);

                if (!said.allowed) {
                    if (onRefused) return onRefused(said);

                    //SAID OUT LOUD RATHER THAN SWALLOWED. A press that does
                    //nothing and explains nothing is the worst of the three
                    //possible outcomes.
                    return console.warn('[may] ' + guard + ': ' + said.why);
                }

                if (onClick) onClick(event);
            }

            return React.createElement(Control, Object.assign({}, rest, {
                className: [className, on ? 'is-guarded' : null, reachable ? 'is-open' : null]
                    .filter(Boolean).join(' ') || undefined,

                'data-open': reachable || undefined,

                //WHAT IT IS GUARDED BY, IN THE DOM.
                //
                //../../../remote refuses to read, fill or press a marked control
                //without asking -- and it cannot ask about a capability it
                //cannot name. The class says THAT something guards this; this
                //says WHICH, so the question raised names the thing a person is
                //actually agreeing to rather than "a guarded control".
                'data-guard': on ? guard : undefined,

                //THE LOCK REPLACES WHATEVER ICON WAS THERE. A control that is a
                //person's to press has one thing to say about itself first.
                icon: on && options.icon !== false ? 'lock-fill' : icon,

                onClick: press
            }));
        }

        //so a driven run and a person reading the markup both see which control
        //this is -- ../../../remote/window.js reports the element by name
        Guarded.displayName = 'Guarded(' + (Control.displayName || Control.name || 'Control') + ')';
        return Guarded;
    }

    //A REGION, WHICH IS THE UNIT THAT SURVIVES A YEAR.
    //
    //Marking each button one at a time is exactly as forgettable as marking each
    //guarded one, and it fails the dangerous way round: a button added to an
    //open panel next year is silently UNREACHABLE, and the way anybody finds out
    //is a tool that stopped working for a reason nothing prints.
    //
    //`../../../remote/window.js` READS IT WITH `closest`, so a region and a
    //single control are the same fact at two sizes and there is one rule in the
    //driver rather than two.
    //
    //A NAME, BECAUSE THE INVENTORY LISTS THESE. "3 open regions" is not an
    //answer to "what can a tool reach"; "status panel, log controls, restart" is.
    //An unnamed one still opens -- refusing would be a mark that quietly does
    //the opposite of what it says -- but it says so where somebody will see it.
    function Reachable(props) {
        var { name, as, className, children, ...rest } = props;

        if (!closed()) {
            return React.createElement(as || 'div', Object.assign({}, rest,
                { className: className || undefined }), children);
        }

        if (!name && typeof console != 'undefined') {
            console.warn('[may] a Reachable region has no name, so the Reachable page cannot '
                + 'list what it opens. Give it one.');
        }

        return React.createElement(as || 'div', Object.assign({}, rest, {
            className: [className, 'is-open', 'is-open-region'].filter(Boolean).join(' '),
            'data-open': name || 'unnamed'
        }), children);
    }

    return {
        Button: wrap(plain.Button),
        Reachable: Reachable,

        //AN INPUT IS GUARDED BY BEING READ-ONLY UNTIL SOMEBODY OPENS IT, which
        //is not what guarding a button does -- see wrapInput below for why
        //guarding its onChange was the obvious wrong answer.
        Input: wrapInput(plain.Input),

        useGuarded: useGuarded,

        //SO A PAGE CAN ASK WITHOUT KNOWING WHERE THE ANSWER LIVES, and so the
        //one place that decides whether a mark is drawn stays this file.
        closed: closed,

        wrap: wrap
    };

    //A GUARDED FIELD IS ONE AN OUTSIDE CALLER HAS TO ASK ABOUT, and a person
    //typing into it is not an outside caller. Clicking it opens it, with no
    //dialog: the click is the consent, the same as a press on a guarded button.
    //
    //SO WHAT THE LOCK MEANS HERE is "a tool cannot fill this without asking" --
    //which for a password field is the whole point of marking it.
    //
    //IT STARTS READ-ONLY SO THE MARK IS TRUE BEFORE ANYBODY TOUCHES IT, and one
    //trusted mousedown or keypress opens it for as long as the page lasts.
    //
    //READ-ONLY RATHER THAN DISABLED, because a disabled field cannot be clicked
    //-- so it could not be the thing you open it through -- and it is skipped by
    //the keyboard, which would put the guard in the way of anybody not using a
    //mouse.
    //
    //AND readOnly STOPS A PERSON, NOT A SCRIPT. Measured: with only the
    //attribute set, `node src/cli.js fill "#f-guarded" hunter2` put the value
    //straight in -- ../../../remote/window.js sets `.value` through the native
    //setter and dispatches an input event, which readOnly has nothing to say
    //about. So a change arriving while the field is shut goes through `may`
    //like any other outside request, and the person is asked.
    function wrapInput(Control) {
        function GuardedInput(props) {
            //`open` IS THE PROP AND `unlocked` IS THE STATE, which is why the
            //state was renamed rather than the prop. This field's "has somebody
            //touched it yet" flag was called `open`, and the mark that says a
            //tool may reach a control has to be spelled the same on an Input as
            //on a Button -- so the one that is nobody's interface gave way.
            var { guard, open, onChange, onRefused, onUnlocked, className, ...rest } = props;

            var on = useGuarded(guard);
            var [unlocked, setUnlocked] = useState(false);
            var reachable = marks(on, open);

            if (!guard) {
                return React.createElement(Control, Object.assign({}, rest, {
                    className: [className, reachable ? 'is-open' : null].filter(Boolean).join(' ') || undefined,
                    'data-open': reachable || undefined,
                    onChange: onChange
                }));
            }

            var locked = on && !unlocked;

            //A PERSON OPENS IT BY TOUCHING IT. `may` answers a trusted event
            //without asking anybody, so this is one round trip to nowhere and
            //then an open field.
            //
            //AN UNTRUSTED ONE IS NOT HANDLED HERE AT ALL -- a driven mousedown
            //should not raise a dialog just for pointing at a field. The
            //question belongs to the attempt to CHANGE it, below.
            async function unlock(event) {
                if (!locked || !event || !event.isTrusted) return;

                var said = await may(guard, event);
                if (!said.allowed) return;

                setUnlocked(true);
                if (onUnlocked) onUnlocked(said);
            }

            //`readOnly` STOPS A PERSON AND NOT A SCRIPT, which is the whole
            //reason this function is longer than it looks like it should be.
            //
            //MEASURED: with only `readOnly` set, `node src/cli.js fill
            //"#f-guarded" hunter2` put the value straight in. The driver does
            //not type -- ../../../remote/window.js sets `.value` through the
            //native setter and dispatches an input event, and readOnly has
            //nothing to say about that. The field looked locked and was not,
            //which is precisely the mark promising what the mechanism cannot
            //keep.
            //
            //SO A CHANGE ARRIVING WHILE IT IS LOCKED IS REFUSED, and because the
            //field is controlled by react, not calling `onChange` means the
            //value snaps back to what the page thinks it is on the next render.
            async function changed(event) {
                if (locked) {
                    //THE VALUE IS ALREADY IN THE DOM AND HAS TO GO BACK. React
                    //puts it back on the next render because the field is
                    //controlled and `onChange` was not called -- so what a
                    //refused fill leaves behind is the value the page had.
                    var said = await may(guard, event);

                    if (!said.allowed) {
                        if (onRefused) return onRefused(said);
                        return console.warn('[may] ' + guard + ': ' + said.why);
                    }

                    //ALLOWED, SO IT STAYS OPEN. A tool that asked and was told
                    //yes should not have to ask again for the next character.
                    setUnlocked(true);
                    if (onUnlocked) onUnlocked(said);
                }

                if (onChange) onChange(event);
            }

            return React.createElement(Control, Object.assign({}, rest, {
                className: [className, on ? 'is-guarded' : null, reachable ? 'is-open' : null]
                    .filter(Boolean).join(' ') || undefined,

                'data-open': reachable || undefined,

                //WHAT IT IS GUARDED BY -- see the button above. It stays on the
                //field after it has been unlocked, which is deliberate: a person
                //opening a password box does not thereby agree that anything
                //driving the window may read what they typed into it.
                'data-guard': on ? guard : undefined,

                readOnly: locked || rest.readOnly,

                //`onMouseDown` AND `onKeyDown`, so the field is reachable by
                //either. Both carry the event, which is where the browser keeps
                //its own word for whether a person did it.
                onMouseDown: unlock,
                onKeyDown: unlock,

                onChange: changed
            }));
        }

        GuardedInput.displayName = 'Guarded(Input)';
        return GuardedInput;
    }
};
