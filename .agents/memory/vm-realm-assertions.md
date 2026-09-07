---
name: vm-realm assertions in QA scripts
description: Why deepStrictEqual fails on two identical-looking arrays when one comes from a node:vm context, and how the browser-script QA harnesses avoid it.
---

Data pulled out of a `node:vm` context carries that context's own `Array`/`Object`
prototypes. `assert.deepStrictEqual` compares prototypes, so two arrays that
serialise to byte-identical JSON still fail, and the diff output is useless
because both sides print the same.

**Why:** the browser-script QA runners load the shop's classic scripts into a vm
context and then assert on values the scripts produced, so every such comparison
crosses a realm boundary.

**How to apply:** copy vm values into this realm before asserting —
`Array.from(vmArray, mapper)`, `[...vmArray]`, or compare `.join(',')`. When an
assertion fails with identical-looking actual/expected, suspect the realm before
suspecting the data.

The same harnesses also need a `document` stub with `addEventListener` in the vm
context; a picker or menu that binds document-level handlers is otherwise
untestable, and recording those handlers is what makes "no listener piles up per
re-render" assertable without a browser.
