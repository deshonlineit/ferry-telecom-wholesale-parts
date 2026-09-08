# Offline compatibility import

## Provenance policy

- Test catalog only. The importer reads the fixed local WooCommerce CSV and the isolated native database; it makes no remote calls and reads no other database.
- Products are matched only by the CSV `sku` to the existing native `products.sku`.
- Compatibility comes only from model-shaped values explicitly present in `tax:product_tag`, or from model leaf categories below an exact device/manufacturer branch (`APPLE PARTS`, `SAMSUNG PARTS`, `GOOGLE PIXEL PARTS`, `XIAOMI PARTS`, Huawei P/Mate/Y/Nova branches, or `HONOR Series`).
- Pipe and top-level comma separators are supported; commas inside parentheses remain part of a label. Every accepted candidate is linked through `product_models`; there is no primary model and no occurrence threshold.
- Generic manufacturers, model families such as `Mi Series`, campaign tags, qualities, accessories, and part-type category leaves are not interpreted as models. Titles are not mined for compatibility. A tag that contradicts the row's one exact category manufacturer is skipped rather than reported as verified.
- A product brand is updated only when accepted model evidence has one manufacturer, or (when no model was accepted) one exact category manufacturer. Conflicting manufacturers leave the existing product brand unchanged.

## Last local run

| Measure | Count |
|---|---:|
| Existing native products | 10815 |
| CSV data rows read | 12273 |
| CSV rows matched by exact SKU | 10777 |
| CSV rows with SKU absent from native catalog | 1456 |
| Repeated matched SKU rows merged | 0 |
| Structurally irregular CSV rows padded/truncated | 11700 |
| Accepted many-to-many links | 8745 |
| Products with at least one accepted model | 6609 |
| Distinct accepted models | 547 |
| Links supported by tags | 136 |
| Links supported by model leaf categories | 8739 |
| Links supported by both sources | 130 |
| Products without conservative model evidence | 4206 |
| Non-model/ambiguous tag occurrences skipped | 3092 |
| Model-shaped tags conflicting with one exact category manufacturer skipped | 342 |
| Recognized manufacturer branches with non-model/ambiguous leaves skipped | 679 |
| Category branches outside the model-source policy skipped | 4512 |
| Products with conflicting exact manufacturer evidence | 3 |
| Product brand assignments refreshed from exact evidence | 6724 |
| Prior unreferenced model records removed | 63 |

## Limitations

The counts above describe evidence available in the export, not guaranteed physical fit. Combined or unusually worded labels are retained only when the source itself declares them as a model-shaped tag/leaf; the importer does not split them into guessed devices. Products in generic accessory/family branches, products represented only by vague tags, and native SKUs absent from the export intentionally remain without compatibility links.
