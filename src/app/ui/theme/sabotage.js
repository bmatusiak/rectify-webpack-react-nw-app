//WHAT WOULD BREAK THIS PLUGIN, AND WHICH SUITE SHOULD NOTICE.
//
//THIS IS THE ONE PLUGIN WHERE A BREAK IS VISIBLE, which sounds like it needs
//less of this and does not. Twenty-eight swatches ship here and nobody looks at
//more than one or two: a rule that is wrong in `slate` and right in `default` is
//a bug that reaches somebody else's screen and never yours.
//
//AND `showing` IS NOT A LOOK, IT IS A FACT ANYTHING PAINTING A COLOUR READS.
//Eight of the bootswatch designs are dark whatever they are asked for, so the
//setting and the answer differ -- and ../xterm, ../litegraph and ../editor all
//choose their own colours from it. Get that wrong and a terminal painted for
//light mode is a white rectangle in a dark window.

//---- WHAT IS NOT BROKEN HERE, AND WHY ------------------------------------
//
//`showing`, `modeLocked` AND THE WAIT FOR A STYLESHEET are all about a swatch
//that will not honour the mode it was asked for -- and on `default`, which is
//what the app under test wears, there is no such disagreement. Every entry for
//them survived: the code was broken and every check passed, because none of them
//were ever wearing a swatch that could tell the difference.
//
//AND THE SUITE CANNOT PUT ONE ON. It shares one live window with every other
//test in it, four of which measure colours -- so a swatch changed halfway
//through is a page they never asked for. The attempt failed the sidebar contrast
//check at 1.51:1, twice, on a state nobody had set up; and restoring it is not a
//matter of putting the name back, because asking for a stylesheet does not
//remove the one already applied.
//
//IT IS COVERED WHERE IT COSTS NOTHING. `npm run drive -- --swatches` wears all
//twenty-eight in turn, in a window of its own, and measures each -- which is
//where the eight dark-only designs actually get exercised, and how the sidebar
//was found unreadable on thirteen of them. Entries that cannot fail are worse
//than absent ones: they teach people to read past a red line.

module.exports = [
    //---- what the page really is -------------------------------------------
    {
        //NOT A COLOUR IS NOT DARK. `getComputedStyle` answers `transparent` or
        //an empty string before a stylesheet has arrived, and guessing dark
        //there paints the whole shell for a page that has not decided yet.
        what: 'a page that has not decided yet is painted dark',
        file: 'isDark.js',
        check: 'ui/theme/node',
        find: '    if (!parts || parts.length < 3) return false;',
        replace: '    if (!parts || parts.length < 3) return true;'
    },

    {
        //THE BRIGHTNESS RULE ITSELF. Weighted for how the eye reads a colour --
        //flatten it to an average and the greens and blues swap sides, which
        //means several swatches would report the wrong half of themselves.
        //IT BREAKS ./isDark.js AND NOT ./window.js, and that is the finding.
        //The rule was a closure in the setup function and this survived: the
        //only test that could reach it ran against whatever swatch happened to
        //be on -- `default`, which is light under any formula anybody would
        //write. Now the node suite feeds it pure green, where the two answers
        //disagree, in a millisecond and with no window.
        what: 'brightness is averaged rather than weighted, so swatches swap sides',
        file: 'isDark.js',
        check: 'ui/theme/node',
        find: '    return (parts[0] * 299 + parts[1] * 587 + parts[2] * 114) / 1000 < 128;',
        replace: '    return (parts[0] + parts[1] + parts[2]) / 3 < 128;'
    },

    //---- and the stylesheet it is all measured through ---------------------
    {
        //THE LINK GOES FIRST IN `head`, BEFORE ANYTHING style-loader PUT THERE.
        //Appended instead, the swatch comes last and its
        //`.text-body-secondary { ... !important }` beats the kit's own
        //corrections on source order alone -- same specificity, same
        //importance, later wins. That is how the sidebar became unreadable on
        //thirteen of the twenty-eight.
        what: 'the swatch is appended, so it overrules the kit that corrects it',
        file: 'window.js',
        check: 'ui/theme/window',
        find: '    document.head.insertBefore(link, document.head.firstChild);',
        replace: '    document.head.appendChild(link);'
    },
    {
        //A NAME NOBODY SHIPS FALLS BACK TO `default` rather than to a link with
        //nothing behind it. An href that 404s leaves the page wearing whatever
        //it had, silently -- and `swatch` then names something that is not on
        //screen.
        what: 'a swatch nobody ships is set anyway, leaving a dead stylesheet',
        file: 'window.js',
        check: 'ui/theme/window',
        find: "        if (!swatches[name]) name = 'default';",
        replace: '        //sabotaged'
    },

    //---- and the icons, which are read rather than listed ------------------
    {
        //HANDED OUT FROZEN, so a caller that sorts or splices it in place cannot
        //edit what every other caller is about to read. A page that renders all
        //of them maps over this array.
        what: 'the icon list is handed out for anybody to edit',
        file: 'window.js',
        check: 'ui/theme/window',
        find: '    var icons = Object.freeze((bootstrapSVG.match(/<symbol[^>]+id="([^"]+)"/g) || [])',
        replace: '    var icons = ((bootstrapSVG.match(/<symbol[^>]+id="([^"]+)"/g) || [])'
    }
];
