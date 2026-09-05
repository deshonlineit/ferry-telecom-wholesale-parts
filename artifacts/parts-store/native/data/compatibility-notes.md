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
| Existing native products | 7854 |
| CSV data rows read | 12213 |
| CSV rows matched by exact SKU | 7851 |
| CSV rows with SKU absent from native catalog | 4322 |
| Repeated matched SKU rows merged | 0 |
| Structurally irregular CSV rows padded/truncated | 0 |
| Accepted many-to-many links | 4446 |
| Products with at least one accepted model | 3851 |
| Distinct accepted models | 291 |
| Links supported by tags | 109 |
| Links supported by model leaf categories | 4440 |
| Links supported by both sources | 103 |
| Products without conservative model evidence | 4003 |
| Non-model/ambiguous tag occurrences skipped | 2517 |
| Model-shaped tags conflicting with one exact category manufacturer skipped | 285 |
| Recognized manufacturer branches with non-model/ambiguous leaves skipped | 82 |
| Category branches outside the model-source policy skipped | 4316 |
| Products with conflicting exact manufacturer evidence | 0 |
| Product brand assignments refreshed from exact evidence | 3921 |
| Prior unreferenced model records removed | 0 |

## Limitations

The counts above describe evidence available in the export, not guaranteed physical fit. Combined or unusually worded labels are retained only when the source itself declares them as a model-shaped tag/leaf; the importer does not split them into guessed devices. Products in generic accessory/family branches, products represented only by vague tags, and native SKUs absent from the export intentionally remain without compatibility links.
