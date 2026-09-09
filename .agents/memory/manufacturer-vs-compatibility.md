---
name: Manufacturer versus compatibility
description: Keeps the catalogue maker brand independent from the device brands and models a product fits.
---

`products.brand_id` is strictly the product manufacturer. Device names,
taxonomy categories, and model links establish compatibility only and must
never assign or overwrite the manufacturer.

**Why:** A compatibility import relabelled thousands of third-party and generic
parts as Apple, so Brand=Apple showed Joyroom, PanzerGlass, and unrelated tools.
Correcting manufacturer labels also exposed a title-link reconciler that wrongly
depended on manufacturer and removed valid model compatibility.

**How to apply:** Infer manufacturer only from explicit maker evidence such as a
reliable maker name or SKU convention; use Universal when the maker is unknown.
Match model names across all device brands, store them through product-model
links, and regression-test manufacturer filtering separately from compatible
device-brand/model browsing.