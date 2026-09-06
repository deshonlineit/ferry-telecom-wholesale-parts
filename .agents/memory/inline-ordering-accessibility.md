---
name: Inline-ordering accessibility
description: Why product search with quantity and add controls uses a nonmodal dialog with real focus.
---

Treat product suggestions that contain quantity inputs and purchase buttons as an interactive results dialog, not a plain listbox whose options only select a value.

**Why:** A visual arrow-key highlight does not announce a selected item to assistive technology. Conversely, forcing rich rows into listbox options obscures their nested interactive controls. Fast ordering needs both result navigation and normal keyboard access to quantity/add controls.

**How to apply:** Move real focus into result links on ArrowDown, preserve Tab and numeric-input keyboard behavior, let Enter in the quantity field activate its row's add control, and restore input focus on Escape without starting another search. Keep the search field's ARIA popup type consistent with the rendered popup.