//WHAT WOULD BREAK THIS PLUGIN, AND WHICH SUITE SHOULD NOTICE.
//
//THIS DECIDES WHERE EVERYTHING LANDS. The state, the secrets, the record, the
//cache, the decisions and now the snapshots are all under one path this file
//works out -- so a mistake here does not break one plugin, it moves all of them
//at once, and every one of them keeps working while it does.
//
//THE PROFILE IS THE SHARP EDGE. `--profile=test` exists so a run can be kept
//apart from somebody's real data, and the failure mode is not an error: it is
//the test run quietly writing into the app's own directory and the person
//finding out later. ../../../profile.js says exactly that, which is why it
//throws rather than falling back -- and two of the entries below are about that
//refusal staying a refusal.

module.exports = [
    //---- the profile, which is the whole reason to be careful --------------
    {
        //THE ONE THAT LOSES SOMEBODY'S WORK. A profile that is asked for and
        //then ignored means `--profile=test` writes into the real data
        //directory, and nothing anywhere says so -- the app starts, the paths
        //look right, and the wrong world is being written to.
        //IT BREAKS ./places.js AND NOT ./main.js, and that is the finding. This
        //was inline in main.js and the entry survived: the app under test runs
        //with NO profile, so the branch never executed and nothing could see it.
        //Now it is a rule, and the node suite answers in a millisecond with no
        //app and no window.
        what: 'a profile is asked for and everything lands in the app own directory anyway',
        file: 'places.js',
        check: 'core/dataDir/node',
        find: '    return profile ? path.join(root, PROFILES, profile) : root;',
        replace: '    return root;'
    },
    {
        //THE FOLDER NAMED TWICE. ../../../profile.js owns the layout and this
        //asks it, so the boot that validates a name and the code that builds the
        //path cannot come to differ -- writing it out is the drift starting, and
        //it would put profiles somewhere the boot cannot list.
        //
        //THIS SURVIVED TOO, and for a worse reason: the in-app test required
        //`../../../profile` ITSELF to get the folder name, so it compared a
        //constant to itself. It asks the code now.
        what: 'the profiles folder is named here instead of asked for',
        file: 'places.js',
        check: 'core/dataDir/node',
        find: "var PROFILES = require('../../../profile').FOLDER;",
        replace: "var PROFILES = 'profiles';"
    },
    {
        //A NAME THAT IS NOT A NAME, FALLING BACK INSTEAD OF REFUSING. This is
        //the failure ../../../profile.js exists to prevent, in its own words:
        //"falling back would write this run's data into the app's own". A
        //`--profile=../../somewhere` that quietly becomes "no profile" is how a
        //test run eats what somebody was working on.
        what: 'a profile name that is a path falls back rather than refusing',
        file: '../../../profile.js',
        check: 'profile',
        find: '    if (!NAME.test(name)) {',
        replace: '    if (false) {'
    },
    {
        //A DENY LIST IS A LIST SOMEBODY HAS TO HAVE GOT RIGHT. The rule is an
        //allow list on purpose -- there is no reading of `../` that is a
        //profile -- and loosening it to "anything without a slash" lets a
        //backslash through on the one platform where that is also a separator.
        what: 'the name rule stops being an allow list',
        file: '../../../profile.js',
        check: 'profile',
        find: 'var NAME = /^[a-z0-9][a-z0-9._-]*$/i;',
        replace: 'var NAME = /^[^/]+$/;'
    },
    {
        //THE LAST FLAG WINS, so `--profile=test --no-profile` is a decision
        //rather than a puzzle. Taking the first instead means a flag added to a
        //command line is silently ignored, which is the one behaviour nobody
        //debugs because nobody suspects it.
        what: 'the first profile flag wins instead of the last',
        file: '../../../profile.js',
        check: 'profile',
        find: "        if (text == '--no-profile') answer = false;\n        else if (text.indexOf('--profile=') === 0) answer = text.slice('--profile='.length);",
        replace: "        if (answer !== null) return;\n        if (text == '--no-profile') answer = false;\n        else if (text.indexOf('--profile=') === 0) answer = text.slice('--profile='.length);"
    },

    //---- and reading a path versus making one ------------------------------
    {
        //READING A PATH MUST NOT CREATE A DIRECTORY. `dataDir.at('x')` in a log
        //line would otherwise leave a folder behind as a side effect of
        //describing one -- and the folders that appear would be named after
        //whatever somebody happened to mention.
        what: 'asking where something would go creates it',
        file: 'main.js',
        check: 'core/dataDir/main',
        restart: true,
        find: '            at: function (/* ...parts */) {\n                return path.join.apply(path, [dir].concat([].slice.call(arguments)));',
        replace: '            at: function (/* ...parts */) {\n                var made = path.join.apply(path, [dir].concat([].slice.call(arguments)));\n                fs.mkdirSync(made, { recursive: true });\n                return made;'
    },
    {
        //AND MAKING ONE HAS TO ACTUALLY MAKE IT. Without this every plugin that
        //writes a file carries the same mkdirSync -- and the one that forgets
        //does not fail at boot, it fails the first time somebody saves
        //something.
        what: 'ensure does not make the directory it promises',
        file: 'main.js',
        check: 'core/dataDir/main',
        restart: true,
        find: '                fs.mkdirSync(where, { recursive: true });\n                return where;',
        replace: '                return where;'
    },

    //---- and saying honestly which world this is ---------------------------
    {
        //NULL WHEN THERE IS NONE, RATHER THAN A WORD MEANING NONE. A screen
        //saying `profile: default` invites somebody to go looking for a
        //directory called default, and there is not one.
        what: 'no profile is reported as a profile called something',
        file: 'main.js',
        check: 'core/dataDir/main',
        restart: true,
        find: '    var profile = app.profile || null;',
        replace: "    var profile = app.profile || 'default';"
    },
    {
        //NONE HAVE EVER BEEN USED IS NOT AN ERROR. A profile is created by being
        //asked for, so the folder does not exist until one has been -- and a
        //throw here would take out whatever screen was listing them.
        //IT SURVIVED BECAUSE THE FOLDER HAPPENS TO EXIST on this machine -- a
        //profile was used here once, so `readdirSync` never threw and the catch
        //never ran. The node suite points at a directory that really is not
        //there, which is the state a fresh install is in.
        what: 'having no profiles yet is an error rather than an empty list',
        file: 'places.js',
        check: 'core/dataDir/node',
        find: '    } catch (e) {\n        return [];\n    }',
        replace: '    } catch (e) {\n        throw e;\n    }'
    }
];
