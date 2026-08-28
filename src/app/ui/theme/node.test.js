const { test } = require('node:test');
const assert = require('node:assert');

const isDark = require('./isDark');

//WHICH HALF OF THE WORLD A COLOUR IS IN, asked without a window.
//
//THIS COULD NOT BE ASKED AT ALL BEFORE. It was a closure inside the theme's
//setup function, and the only test that could reach it ran against whatever
//swatch happened to be on -- `default`, which is light, and light under any
//formula anybody might write. Its own sabotage said so by surviving: the
//weighting was replaced with a plain average and every check still passed.
//
//IT MATTERS BECAUSE OTHER PLUGINS PAINT FROM THE ANSWER. ../xterm, ../litegraph
//and ../editor choose their own colours from `theme.showing`, so being wrong is
//a terminal painted for light mode sitting as a white rectangle in a dark
//window.

test('black is dark and white is not', () => {
    assert.equal(isDark('rgb(0, 0, 0)'), true);
    assert.equal(isDark('rgb(255, 255, 255)'), false);
});

//THE ONE THAT SEPARATES THE RIGHT RULE FROM THE OBVIOUS ONE.
//
//The eye reads green as far brighter than blue at the same value, which is what
//the BT.601 weights say. Averaging the three channels instead is the
//simplification somebody reaches for, and it DISAGREES here: pure green is light
//weighted (149.7) and dark averaged (85).
//
//A swatch built on a green ground would flip sides, and everything painting from
//`showing` would flip with it.
test('green is light, which an average would get backwards', () => {
    assert.equal(isDark('rgb(0, 255, 0)'), false,
        'green came back dark, so the channels are being averaged rather than weighted');

    //and the other two are the way round the weights say
    assert.equal(isDark('rgb(0, 0, 255)'), true, 'blue came back light');
    assert.equal(isDark('rgb(255, 0, 0)'), true, 'red came back light');
});

//THE REAL SWATCHES, at the two ends of what ships. `slate` and `darkly` are dark
//designs; `default` and `flatly` are not.
test('the grounds real swatches paint are read the way they look', () => {
    assert.equal(isDark('rgb(34, 34, 34)'), true, 'a near-black ground read as light');
    assert.equal(isDark('rgb(48, 62, 74)'), true, 'slate read as light');
    assert.equal(isDark('rgb(248, 249, 250)'), false, 'an off-white ground read as dark');
});

//NOT A COLOUR IS NOT DARK. `getComputedStyle` answers `transparent` or an empty
//string before a stylesheet has arrived, and guessing dark there would paint the
//whole shell for a page that has not decided yet.
test('something that is not a colour is not dark', () => {
    assert.equal(isDark('transparent'), false);
    assert.equal(isDark(''), false);
    assert.equal(isDark(null), false);
    assert.equal(isDark(undefined), false);
    assert.equal(isDark('rgb(0)'), false, 'one number was taken for a colour');
});

//AN ALPHA CHANNEL IS A FOURTH NUMBER AND MUST NOT BECOME A THIRD. `rgba(0, 0, 0,
//0.5)` is still black; reading the alpha as blue would make it lighter the more
//transparent it got.
test('an alpha channel does not change which half it is in', () => {
    assert.equal(isDark('rgba(0, 0, 0, 0.5)'), true);
    assert.equal(isDark('rgba(255, 255, 255, 0.5)'), false);
});
