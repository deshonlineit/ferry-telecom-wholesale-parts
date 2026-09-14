---
name: Smart-search semantic qualifiers
description: How multilingual qualifiers such as with frame and without frame must remain exact opposites in catalogue search.
---

Treat supplier-language qualifiers as semantic intent, not as independent loose synonyms. A search for “without frame” must require an explicit frameless phrase; “with frame” must reject frameless titles.

**Why:** Expanding the short word “no” as a normal substring synonym also matched unrelated text and allowed assembled-with-frame products into a frameless query.

**How to apply:** When adding multilingual product terminology with opposite meanings, recognize the complete phrase first, skip its connector token in generic term matching, and apply an explicit positive or negative product predicate. Test both sides with paired fixtures.