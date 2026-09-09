from pathlib import Path
import pymupdf

source = Path("attached_assets/0_31671-88177-09-Sep-2026_1788975289231.pdf")
output = Path(".agents/outputs/invoice-reference")
output.mkdir(parents=True, exist_ok=True)

document = pymupdf.open(source)
print(f"pages={document.page_count}")
for page_number, page in enumerate(document):
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(2, 2), alpha=False)
    pixmap.save(output / f"page-{page_number + 1}.png")
    print(f"page={page_number + 1} size={page.rect.width:.2f}x{page.rect.height:.2f}")
    for image_number, image in enumerate(page.get_images(full=True)):
        xref = image[0]
        extracted = document.extract_image(xref)
        target = output / f"page-{page_number + 1}-image-{image_number + 1}.{extracted['ext']}"
        target.write_bytes(extracted["image"])
        print(f"image={target} bytes={len(extracted['image'])}")
    for font_number, font in enumerate(page.get_fonts(full=True)):
        xref = font[0]
        name, extension, font_type, content = document.extract_font(xref)
        if not content:
            continue
        safe_name = "".join(character for character in name if character.isalnum() or character in "-_")
        target = output / f"{safe_name}.{extension}"
        if not target.exists():
            target.write_bytes(content)
            print(f"font={target} type={font_type} bytes={len(content)}")