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

        //AN INPUT HAS NO PRESS, so what is guarded is the value being changed.
        //The ring is the same; the lock is not, because an input has nowhere to
        //put one without eating the field.
        Input: wrapInput(plain.Input),

        useGuarded: useGuarded,
        wrap: wrap
    };

    function wrapInput(Control) {
        function GuardedInput(props) {
            var { guard, onChange, onRefused, className, ...rest } = props;
            var on = useGuarded(guard);

            if (!guard) return React.createElement(Control, props);

            async function change(event) {
                var said = await may(guard, event);

                if (!said.allowed) {
                    if (onRefused) return onRefused(said);
                    return console.warn('[may] ' + guard + ': ' + said.why);
                }

                if (onChange) onChange(event);
            }

            return React.createElement(Control, Object.assign({}, rest, {
                className: [className, on ? 'is-guarded' : null].filter(Boolean).join(' ') || undefined,
                onChange: change
            }));
        }

        GuardedInput.displayName = 'Guarded(Input)';
        return GuardedInput;
    }
};
