---
name: Native shop theme CSS specificity
description: Why new stylesheets in the isolated PHP shop need an extra class on headings and links, and how to tell when the theme is winning.
---

The storefront theme scopes its base typography through a body-level `:not(:has(...))`
guard, so every new component rule must carry an equally specific prefix — one extra
class is not enough on its own, and stylesheet order cannot rescue a weaker selector.

**Why:** the `:has()` argument counts towards specificity, so those theme rules outrank
plain single-class rules for headings, links and buttons. The failure is silent and
usually only shows on dark panels (dark text on a dark background, theme-blue links
where a light colour was intended), which is why it survives a stylesheet review.

**How to apply:** match the theme's own prefix on every rule of a new component,
including the ones inside media queries — a scoped base rule plus an unscoped mobile
override silently drops the override. Then check the rendered page, not the stylesheet,
before declaring it done.

Inverted panels need the prefix on their links too, not just their headings.

**Why:** an anchor styled as a filled call-to-action keeps the theme's link colour, so the
label reads as washed-out rather than obviously broken, and a button element next to it
looks correct — the mixed result hides the cause. A heading on the same panel disappears
outright, which is easier to spot but has the same origin.

**How to apply:** for every inverted surface, prefix the heading rule and the anchor rule
(including its hover state), and confirm the computed colour in the browser rather than
trusting that the panel's own colour declarations won.
