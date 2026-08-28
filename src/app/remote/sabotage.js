//WHAT WOULD BREAK THIS PLUGIN, AND WHICH SUITE SHOULD NOTICE.
//
//THIS IS THE DOOR THE OUTSIDE COMES THROUGH TO THE PAGE. `core/may` can be
//perfectly correct and this is where it is actually applied to a click -- so
//every entry here is a way of touching something nobody agreed to, and none of
//them make anything crash.
//
//IT HAD NO sabotage.js AND NO GUARD TEST AT ALL until the stance work, which is
//how the gap was found: the whole of `refusedFor` -- the feature whose commit
//message says a guarded control is opaque to the driver -- had nothing watching
//it. The tests in ./window.test.js under "a control the driver may not touch"
//were written alongside this file, and every entry below names one.

//---- WHAT IS NOT BROKEN HERE, AND WHY --------------------------------------
//
//THE CLOSED STANCE IS NOT IN THIS LIST. `unreachable` returns null the moment
//`may.closed()` is false, and every machine this is developed on runs an open
//build -- so an entry for it would be broken on purpose and every check would
//pass, which teaches people to read past a red line.
//
//IT IS COVERED WHERE IT CAN ACTUALLY FAIL. The rule itself is
//`../core/may/stance.js`, asked both ways by `core/may/node` in a millisecond;
//the wiring is exercised by `npm run drive -- --package` and by the by-hand
//loop -- `"app": { "open": false }` in package.json, `npm run restart`, and
//then `node src/cli.js click` on something that is not inside a marked region.
//
//AN UNNAMED MARK IS WHAT THE TESTS USE, and that is not a shortcut. A named
//guard raises a real dialog in the window and leaves it there for two minutes,
//which wedges every suite after it -- the failure `core/selftest/suites.js`
//grew a 30s per-test timeout for. An unnamed one is refused without asking
//anybody, so it reaches the mark, the lookup and all three verbs and leaves
//nothing on screen.

module.exports = [
    //---- the mark, and reading it ------------------------------------------
    {
        //`closest`, NOT `matches`. The mark may be on the control or on a
        //region around it, and a rule that only looked at the element itself
        //would cover a guarded button and miss a guarded panel -- which is the
        //form the stance marks take, so the two would disagree about the same
        //markup.
        what: 'a mark on a region around the control is not seen',
        file: 'window.js',
        check: 'remote/window',
        find: "    return el && el.closest ? el.closest('.is-guarded') : null;",
        replace: "    return el && el.matches && el.matches('.is-guarded') ? el : null;"
    },
    {
        //A MARK THAT CANNOT BE NAMED IS A COMMENT. Waving it through is the
        //tempting reading -- there is nothing to ask about, so why refuse --
        //and it makes `class="is-guarded"` on its own mean nothing at all.
        what: 'a mark that names no capability is waved through',
        file: 'window.js',
        check: 'remote/window',
        find: "            return 'that control is marked guarded and does not say what by, so nothing can ask '",
        replace: "            return null; return 'unused '"
    },

    //---- and the three verbs it is applied to ------------------------------
    //
    //WIRED ONE AT A TIME IS HOW ONE OF THEM ENDS UP WITHOUT IT, which is not a
    //worry: `read` was exactly that, and the value of a password field a person
    //had unlocked came back over the wire with no dialog and no record.
    {
        what: 'a press is allowed without the guard being asked',
        file: 'window.js',
        check: 'remote/window',
        find: '    var no = (shut ? shut(hit.el) : null) || (permit ? await permit(hit.el) : null);\n    if (no) return refused(no);\n\n    var where = press(hit.el);',
        replace: '    var where = press(hit.el);'
    },
    {
        //ASKED AFTER THE VALUE IS IN RATHER THAN BEFORE. A field that has been
        //written to and is then refused has been written to -- the refusal is a
        //sentence about something that already happened.
        what: 'a field is filled first and refused afterwards',
        file: 'window.js',
        check: 'remote/window',
        find: '    var no = (shut ? shut(el) : null) || (permit ? await permit(el) : null);\n    if (no) return refused(no);',
        replace: '    var no = null;'
    },
    {
        //THE VERB THE HOLE WAS IN. `read` answered with `el.value` for anything
        //at all, and the lock was on the one field where reading IS the risk.
        what: 'a guarded value is handed back to whatever asked',
        file: 'window.js',
        check: 'remote/window',
        find: '        var no = permit ? await permit(hit.el) : null;\n        if (no) return refused(no);',
        replace: '        var no = null;'
    },

    {
        //THE ONE THING WITHHELD IN EITHER STANCE. A rule rather than a mark,
        //because a mark is forgettable and this one was forgotten -- measured,
        //`read "#f-plain"` handed back `hunter2` from an ordinary password
        //field in a development build.
        what: 'a password field hands its value over the wire again',
        file: 'window.js',
        check: 'remote/window',
        find: "    return el && el.type === 'password'",
        replace: '    return el && false'
    },

    //---- and saying so ------------------------------------------------------
    {
        //A REFUSAL THAT PRINTS NOTHING AND EXITS 0 READS EXACTLY LIKE SUCCESS,
        //and that is measured rather than argued: `node src/cli.js click` on a
        //guarded control was silent and successful until this line existed.
        //Anything reading exit codes -- tools/drive.js first -- counted a
        //refusal as a pass.
        what: 'a refusal is dropped on the floor by the terminal',
        file: 'cli.js',
        check: 'remote/cli',
        find: '            if (out.refused) throw new Error(out.refused);',
        replace: '            //sabotaged'
    }
];
