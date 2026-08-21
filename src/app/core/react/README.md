# react

`createRoot`, and nothing else.

| file | provides | consumes |
|---|---|---|
| `window.js` | `react` | — |

```
react.root    the root over #root, ready to .render()
```

A handful of lines, and a plugin rather than a call in `src/window.js`, for one
reason: **the root has to be one thing.** Two `createRoot` calls on the same
element is a react warning and a second tree, and a service is how the container
guarantees there is only ever one.

It consumes nothing, so it is available to whatever is rendered first. The demo
takes it; a replacement UI takes it the same way.
