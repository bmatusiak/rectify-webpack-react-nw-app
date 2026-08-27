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

    function wrap(Control, options) {
        options = options || {};

        function Guarded(props) {
            var { guard, onClick, onRefused, className, icon, ...rest } = props;
            var on = useGuarded(guard);

            if (!guard) return React.createElement(Control, props);

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
                className: [className, on ? 'is-guarded' : null].filter(Boolean).join(' ') || undefined,

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

    return {
        Button: wrap(plain.Button),

        //AN INPUT IS GUARDED BY BEING READ-ONLY UNTIL SOMEBODY OPENS IT, which
        //is not what guarding a button does -- see wrapInput below for why
        //guarding its onChange was the obvious wrong answer.
        Input: wrapInput(plain.Input),

        useGuarded: useGuarded,
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
            var { guard, onChange, onRefused, onUnlocked, className, ...rest } = props;

            var on = useGuarded(guard);
            var [open, setOpen] = useState(false);

            if (!guard) return React.createElement(Control, props);

            var locked = on && !open;

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

                setOpen(true);
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
                    setOpen(true);
                    if (onUnlocked) onUnlocked(said);
                }

                if (onChange) onChange(event);
            }

            return React.createElement(Control, Object.assign({}, rest, {
                className: [className, on ? 'is-guarded' : null].filter(Boolean).join(' ') || undefined,

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
