---
name: Smart-search pop-out feedback
description: Defines visual and interaction feedback for the shared smart-search result surface.
---

Smart-search results must open as a visually separate pop-out rather than
appearing to extend the page. Keep the result title, close action, strong
scrollbar, overflow instruction, and final “view all” action visible while the
customer browses. Mobile results take viewport priority over the site header.

Use an animated active-search border and short opening motion to make the
customer’s current context unmistakable. Respect reduced-motion preferences.

**Why:** customers did not recognize that the original flat result table was
scrollable or understand where search results began and ended.

**How to apply:** preserve the pop-out and scroll affordances across homepage,
header, and catalogue search. Keyboard focus must remain visibly highlighted,
and closing the surface must return focus and clear all active-search styling.

Global Smart Search and local catalogue refinement are separate concepts. Label
the header action as searching all products. When an exact device model is
selected, provide a search beside its results that preserves the model scope and
never opens global suggestions.