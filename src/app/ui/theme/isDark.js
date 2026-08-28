//WHAT A SWATCH PAINTED, RATHER THAN WHAT IT WAS ASKED TO PAINT.
//
//Eight of the twenty-eight bootswatch designs are dark whatever they are asked
//for, so `mode` -- the setting -- and what is actually on screen are two facts.
//This is how the second one is decided: read the body's own background and ask
//which half of the world it is in.
//
//ANYTHING CHOOSING A COLOUR READS THE ANSWER. ../xterm, ../litegraph and
//../editor all paint themselves from it, so being wrong here is a terminal
//painted for light mode sitting as a white rectangle in a dark window.
//
//A MODULE BECAUSE IT COULD NOT BE ASKED ANYTHING. It was a closure inside the
//theme's setup function, and the only test that could reach it ran against
//whatever swatch happened to be on -- `default`, which is light, and light under
//any formula. Its own sabotage said so by surviving: the weighting was replaced
//with a plain average and every check still passed.
//
//Same cut as ../../core/bridge/isTop.js and ../../core/dataDir/places.js.

//WEIGHTED, NOT AVERAGED, and the weights are the ITU-R BT.601 luma coefficients
//-- the eye reads green as far brighter than blue at the same value.
//
//AVERAGING IS THE OBVIOUS WRONG ANSWER and it disagrees where it matters: pure
//green is `light` weighted and `dark` averaged, and a swatch built on a green
//ground would flip sides. It is the kind of mistake that looks like a
//simplification.
module.exports = function isDark(colour) {
    var parts = String(colour).match(/[0-9]+(\.[0-9]+)?/g);

    //NOT A COLOUR IS NOT DARK. `getComputedStyle` answers `transparent` or an
    //empty string before a stylesheet has arrived, and guessing dark there would
    //paint the whole shell for a page that has not decided yet.
    if (!parts || parts.length < 3) return false;

    return (parts[0] * 299 + parts[1] * 587 + parts[2] * 114) / 1000 < 128;
};
