# core/secret

**Something worth keeping, kept so that having the file is not enough.**

| file | provides | consumes |
|---|---|---|
| `main.js` | `secret` | `dataDir` |
| `server.js` | `secret` | `app` |

Plus `seal.js`, which has no `provides`: the sealing itself.

```js
secret.keep('github', token);   //-> { sealed, path }
secret.read('github', null);    //the value, or the fallback if none was kept
secret.sealed('github');        //is what is on disk really ciphertext
secret.can                      //could this machine seal anything at all
```

```
secret.forget(name)  secret.names()  secret.where
secret.seal(v) / secret.open(v) / secret.isSealed(v)   for a file you own
```

## what it protects against, and what it does not

**Not somebody running as you on this machine.** Nothing on a single-user desktop
can, and pretending otherwise is how a false sense of safety gets built.

It protects against the file being read **somewhere else**: copied into a backup,
synced to a cloud folder, pulled off the disk, handed over in a support bundle,
or picked up by a process running as another account or as an administrator.
That is the realistic threat for a credential on a workstation, and a plain file
loses to all of it.

| platform | how |
|---|---|
| Windows | **DPAPI**. The key is derived from your account *by the operating system*, so there is no key of ours to store — and a key stored next to the thing it encrypts is not encryption, it is filing |
| everywhere else | **the file's own permissions**, which are real on those systems |

**Nothing is pretended.** `keep()` reports `sealed`, and `sealed(name)` reads the
file back — so a caller can tell *protected at rest* from *merely not readable by
others* rather than assuming the stronger one. That is the difference between a
plugin that does less on a platform and one that lies about it.

## the payload never touches a command line

This is the one place it differs from the implementation it was modelled on,
and it is not a style preference.

**On Windows any process can read any other process's command line** — this
repo's own `tools/profile-tests.js` does exactly that to find leftover test runs.
So a secret passed to PowerShell as an argument is a secret published to every
process on the machine for as long as the spawn lives, which would undo the
entire point of sealing it.

It goes over **stdin**. Not a temporary file either: cleartext on disk, however
briefly, is cleartext on disk — and if the process dies between writing and
deleting, it stays there.

`node.test.js` checks this by reading the source, because the spawn is over in
milliseconds and racing it would be a test that passes whenever the machine is
busy.

## the mechanism, not the policy

This seals a value and gives it back. Deciding **what** is worth sealing, when to
ask for it, and what to do when it is gone is the app's business — and that is
where an app's real logic lives.

The line matters: a credential *manager* would not belong in `core`, and this
does. See the two questions in [CLAUDE.md](../../../../CLAUDE.md) about what
belongs here at all.

## it is the pair to state

| | | |
|---|---|---|
| [`state`](../state/) | the app's own things | plain json, readable |
| **`secret`** | the ones worth protecting | sealed where it can be |

Both live under [`dataDir`](../dataDir/). **The difference is not importance, it
is whether having the file should be enough** — and a value in the wrong one is
either needlessly awkward or needlessly exposed.

## the details that are not arbitrary

**A mark says a file is ciphertext.** Without it, a file written before any of
this existed — or by hand, or on another platform — would be fed to the
decryptor and fail as **corruption** rather than as *"this one was never
sealed"*.

**A sealed file on the wrong machine is not damage.** DPAPI's key belongs to one
account on one machine, so opening it elsewhere throws a sentence saying exactly
that. Which saves somebody an afternoon.

**A missing secret and an unopenable one are different answers**, and it matters
more here than anywhere else: *there is nothing kept* invites writing a new one,
and *this was sealed by another account* invites finding out whose. So `read`
falls back for the first and throws for the second.

**Mode 0600 on the way in**, which is the whole protection where sealing is not
available and still worth having where it is. `writeFileSync` only applies a mode
when it **creates** the file, which is why `keep` writes a fresh path and renames
rather than writing over the old one.

**Written beside and moved into place**, the same as [state](../state/) — a
reader that opens a half-written file gets the fallback, and for a credential
that is a silent total loss dressed as a first run.

## the server half refuses

Harder than the others, and for a third reason on top of theirs.
[log](../log/) carries on, because losing a log line costs a line.
[state](../state/) refuses, because state at a plausible wrong path is state the
next start will not find. This refuses because **a stand-in that quietly wrote
cleartext would look exactly like success.**

`can` still answers — with `false`, which is the truth.

## nothing in this scaffold uses it yet

That is deliberate, and worth saying rather than leaving to be discovered.

The obvious candidate is [ipc](../ipc/)'s auth token, which is written to
`os.tmpdir()` in cleartext today. It was left alone on purpose: it is
regenerated every launch and already `0600`, so the threat sealing addresses is
weak for it — and unsealing spawns PowerShell, which every `cli` call would then
pay for. That is a decision to take deliberately, not a tidy-up.
