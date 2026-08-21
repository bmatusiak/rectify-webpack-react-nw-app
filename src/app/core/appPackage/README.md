# appPackage

What the app is called, and which version of it this is.

| file | provides | consumes |
|---|---|---|
| `server.js` | `appPackage` | `app` |
| `window.js` | `appPackage` | `io` |

```
appPackage.title  .name  .version  .description  .author  .license
```

A picked subset of `package.json`, so devDependencies do not ride along into the
bundle. On the node side it comes straight off the host; in the window there is
no node to read a file with, so it arrives on the socket handshake and this
hands it out.

## why it is its own plugin

It used to be registered by [io](../io/) alongside the socket, because in the
window that is how it arrives. The effect was that **wanting the app's title
meant consuming a socket** — a name and a version have nothing to do with a
transport.

So `io` keeps the handshake payload on the connection, and this reads it off
under its own name. Not one consumer changed, which is the sign it was the right
cut. **A service is one idea**; do not register something under a second name
because that is how it happens to arrive.
