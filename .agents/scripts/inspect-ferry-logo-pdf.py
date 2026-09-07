from pathlib import Path

import fitz

source = Path("attached_assets/ferrytelecom-logo_1788774201059.pdf")
output = Path(".agents/outputs/ferry-logo-reference.png")
output.parent.mkdir(parents=True, exist_ok=True)

document = fitz.open(source)
page = document[0]
pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=True)
pixmap.save(output)

print(f"pages={document.page_count}")
print(f"page={page.rect.width}x{page.rect.height}")
print(f"images={len(page.get_images(full=True))}")
print(output)