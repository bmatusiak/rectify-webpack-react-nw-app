//WHAT AN ANSWER MEANS, AND WHO IS ALLOWED TO GIVE ONE.
//
//A module rather than part of ./main.js because it is the half that must never
//be wrong and needs no app to be asked: given a stored decision, a caller and a
//clock, is this allowed. Everything else there is a file and a prompt.
//
//IT IS ALSO THE HALF THAT FAILS SHUT. A rule that decides correctly except when
//something is broken is a rule that decides incorrectly on the day it matters.

//WHAT A PERSON MAY ANSWER.
//
//FOUR AND NOT TWO, and the two extra are the ones people actually want. "Allow
//once" is the honest answer to a one-off, and a model that gets one press out of
//it has got exactly what was agreed. "For this run" is the answer to an
//afternoon's work, and it disappears when the app does -- which is a promise a
//stored answer cannot make.
//
//The app this came from has two states, guarded or not, and asks every time. So
//the only way to stop being asked is to stop being guarded, permanently, which
//is how a guard gets turned off for a reason that lasted ten minutes.
var ANSWERS = ['once', 'run', 'always', 'never'];

//AND WHICH OF THEM ARE WRITTEN DOWN. `once` is never stored -- storing it is a
//contradiction. `run` is held in memory by ./main.js and dies with the process,
//which is the whole of what it promises.
function keeps(answer) { return answer === 'always' || answer === 'never'; }

//---------------------------------------------------------------------------
//WHO MAY DECIDE, WHICH IS THE ONE RULE THE REST IS BUILT ON.
//
//A GUARD THE COMMAND LINE CAN REMOVE IS NOT A GUARD. It is a comment, one call
//away from nothing -- and every refusal downstream of it becomes a refusal you
//have to trust a model not to have unlocked first.
//
//SO: read from anywhere, set from nowhere but a person at the window. `from`
//comes from ../ipc, which stamps whether a call arrived over the wire, and from
//the window half, which stamps whether the browser called the press trusted.
//
//BOTH HALVES ARE NEEDED. Over the wire is not a person. But neither is a click
//that ../../remote/window.js dispatched -- and that one arrives by exactly the
//path a real press does, so nothing but `isTrusted` tells them apart.
//THERE IS EXACTLY ONE PATH TO YES, and everything else falls past it. Written
//the other way round -- refuse the cases you can name, allow the rest -- it let
//`{}` through: a caller that said nothing about where it came from was treated
//as a person at the window. Its own test found that, which is what a rule that
//fails shut has to be able to survive being written.
function mayDecide(from) {
    if (!from) return 'a decision has to come from somewhere, and this came from nowhere';

    if (from.overTheWire) {
        return 'a decision cannot be made over the control socket -- open the window and answer '
            + 'there. A guard the command line can remove is not a guard.';
    }

    if (from.window) {
        if (!from.trusted) {
            return 'that press was not a person\'s -- the browser marked it untrusted, which is '
                + 'what a driven click is. Press it yourself.';
        }

        return null;//a person, at the window, pressing it themselves
    }

    return 'a decision comes from a person at the window, and this did not say it was one';
}

//---------------------------------------------------------------------------
//AND WHETHER A PERSON JUST DID IT, WHICH IS THE SAME QUESTION.
//
//`mayDecide` ASKS "is this a person at the window", for the purpose of writing
//an answer down. This asks it for the purpose of doing the thing. There is no
//second rule here on purpose -- two conditions meaning "a person did this" is
//two places to get it wrong, and the one that drifts is whichever nobody reads.
//
//IT ALSO MEANS THE COVERAGE IS SHARED. Break the wire check or the trusted-press
//check and BOTH collapse together, which the sabotages above `mayDecide` already
//catch -- rather than a parallel copy that nothing was watching.
//
//WHY IT EXISTS AT ALL: ../may/window.js has always short-circuited a person's
//press, so main never saw the case -- every guarded thing until now ACTS in the
//page. A capability whose code lives in main has to come through main, and
//without this a person pressing a key got a dialog asking whether they had meant
//to press the key.
function personDid(from) { return mayDecide(from) === null; }

//---------------------------------------------------------------------------
//WHETHER SOMETHING MAY HAPPEN.
//
//`kept` is what was written down, `runwise` is what was answered for this run,
//and `unreadable` is the state where the file could not be read at all.
//
//THE ORDER IS THE DESIGN. A refusal beats an allowance, and the file being
//unreadable beats both: an app that cannot read its own decisions has no
//business acting on a remembered yes.
function verdict(name, world) {
    world = world || {};

    var declared = !!world.declared;
    if (!declared) return { allowed: true, why: 'nothing guards ' + name };

    //FAIL SHUT, AND SAY SO. The wrong answer in this direction costs somebody a
    //press; the wrong answer in the other is something nobody agreed to.
    if (world.unreadable) {
        return {
            allowed: false, ask: true,
            why: 'the decisions could not be read (' + world.unreadable + '), so nothing '
                + 'remembered is being trusted'
        };
    }

    if (world.kept === 'never') return { allowed: false, why: name + ' is never allowed' };
    if (world.kept === 'always') return { allowed: true, why: name + ' is always allowed' };

    if (world.runwise === 'never') return { allowed: false, why: name + ' was refused for this run' };
    if (world.runwise === 'always') return { allowed: true, why: name + ' was allowed for this run' };

    //NOTHING IS REMEMBERED, so somebody has to be asked. `ask` is not the same
    //as `allowed: false` -- one is a question and the other is an answer, and a
    //caller that treated them alike would refuse things nobody had refused.
    return { allowed: false, ask: true, why: 'nobody has said whether ' + name + ' is allowed' };
}

//---------------------------------------------------------------------------
//READING WHAT WAS WRITTEN DOWN.
//
//`{ decisions, unreadable }`. An unreadable file is not an empty one, and the
//difference is the whole of failing shut: empty means nobody has decided
//anything yet, which is ordinary. Unreadable means the answers exist and cannot
//be trusted, which is not.
function read(doc) {
    if (doc === null || doc === undefined) return { decisions: {}, unreadable: null };

    if (typeof doc !== 'object') {
        return { decisions: {}, unreadable: 'it is not a document' };
    }

    var found = doc.decisions;
    if (found === undefined) return { decisions: {}, unreadable: null };//nothing decided yet

    if (!found || typeof found !== 'object') {
        return { decisions: {}, unreadable: 'the decisions are not a set of answers' };
    }

    var kept = {};
    var bad = null;

    Object.keys(found).forEach(function (name) {
        var one = found[name];

        //A ROW THAT MAKES NO SENSE POISONS THE WHOLE FILE rather than being
        //skipped. Skipping it would quietly drop a `never` somebody set, which
        //is the one direction this must never fail in.
        if (!one || ANSWERS.indexOf(one.answer) < 0 || !keeps(one.answer)) {
            bad = bad || ('"' + name + '" has an answer this does not understand');
            return;
        }

        kept[name] = one;
    });

    if (bad) return { decisions: {}, unreadable: bad };
    return { decisions: kept, unreadable: null };
}

module.exports.ANSWERS = ANSWERS;
module.exports.keeps = keeps;
module.exports.mayDecide = mayDecide;
module.exports.personDid = personDid;
module.exports.verdict = verdict;
module.exports.read = read;
