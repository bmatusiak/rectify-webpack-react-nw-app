const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const held = require('../tools/held');

//WHICH nw PROCESSES BELONG TO THIS PROJECT.
//
//This is the half of the wedged-app message that can quietly be wrong: it parses
//a process listing, and a listing parsed slightly wrong names the wrong pid --
//which somebody is then going to end.
//
//IT IS ASKED ABOUT THE MACHINE IT IS RUNNING ON, so what it finds depends on
//whether the app is up. Every assertion here is about the SHAPE of the answer
//and about what must never be in it, not about a count.

test('it answers a list, whatever is running', () => {
    const found = held();

    assert.ok(Array.isArray(found), 'it did not answer a list');

    found.forEach((one) => {
        assert.equal(typeof one.pid, 'number');
        assert.ok(one.pid > 0, 'a pid of ' + one.pid);
        assert.ok(one.command.length > 0, 'a process with no command line');
    });
});

//THE WHOLE POINT, AND THE MISTAKE IT EXISTS TO AVOID. `Get-Process nw |
//Stop-Process` took an unrelated project down during this scaffold's
//development, and there is very likely another nw app on this machine right now.
test('everything it finds is under this project', () => {
    const root = path.resolve(__dirname, '..');

    held().forEach((one) => {
        assert.ok(one.command.indexOf(root) >= 0,
            'it named a process from somewhere else: ' + one.command.slice(0, 120));
    });
});

//A DIFFERENT CHECKOUT OF THE SAME SCAFFOLD IS A DIFFERENT APP, and a match on
//the program's name would call them one.
test('a different root finds nothing of ours', () => {
    const elsewhere = held(path.join(path.resolve(__dirname, '..'), 'no-such-folder-' + process.pid));
    assert.equal(elsewhere.length, 0, 'it matched ' + elsewhere.length + ' processes under a path that does not exist');
});

//A RENDERER IS NOT THE PROCESS HOLDING THE PROFILE. chromium starts one browser
//process and several children, and listing them all hands somebody five pids for
//one app.
test('the children are left out', () => {
    assert.equal(held.isChild('C:\\x\\nw.exe --type=renderer --user-data-dir=y'), true);
    assert.equal(held.isChild('C:\\x\\nw.exe --type=gpu-process'), true);
    assert.equal(held.isChild('C:\\x\\nw.exe C:\\x\\app'), false);

    held().forEach((one) => {
        assert.equal(held.isChild(one.command), false,
            'it named a child process: ' + one.command.slice(0, 120));
    });
});

//IT NEVER ENDS ANYTHING, and says how to look before you do. Nothing here can
//tell a wedged app from one somebody is using.
test('it says how to check a pid before ending it', () => {
    const check = held.howToCheck(1234);
    const end = held.howToEnd(1234);

    assert.ok(check.indexOf('1234') > 0, check);
    assert.ok(end.indexOf('1234') > 0, end);

    //the checking command must not be one that ends anything
    assert.equal(/stop-process|kill/i.test(check), false, 'the way to LOOK is a way to kill: ' + check);
});

//---- and the line that explains the whole thing ---------------------------

//THE LAUNCHER READS THE RAW LOG FOR THIS, NOT THE VIEWER'S LINES, and that is
//the entire fix rather than a detail.
//
//`tools/log.js` filters chromium talking about itself, which is right for `npm
//run log` and wrong for exactly one line: the handoff. So a launch that was
//handed to a wedged app printed
//
//    nothing obvious in nw.log -- read it with npm run log -- --all
//
//while nw.log held one line saying precisely what had happened. The two facts
//never met, and it cost two sessions.
test('the viewer filters the handoff line, which is why the launcher reads the raw log', () => {
    const viewer = require('../tools/log');
    const raw = 'Opening in existing browser session.' + String.fromCharCode(10);

    assert.equal(viewer.lines(raw).length, 0,
        'the viewer shows it now, so tools/nw.js could read the lines instead of the raw text');

    assert.ok(raw.indexOf('Opening in existing browser session') >= 0);
});

//AND THE LAUNCHER STILL LOOKS FOR IT. A rename on either side is a message that
//silently stops appearing, which returns this to the state it was found in.
test('tools/nw.js is still looking for that exact line', () => {
    const fs = require('node:fs');
    const path = require('node:path');

    const source = fs.readFileSync(path.join(__dirname, '..', 'tools', 'nw.js'), 'utf8');

    assert.ok(source.indexOf("'Opening in existing browser session'") > 0,
        'the launcher no longer matches the handoff line');

    //and it reads the raw text rather than the filtered lines
    assert.ok(source.indexOf('fresh.indexOf(HANDOFF)') > 0,
        'it is not matching against the raw log any more');
});
