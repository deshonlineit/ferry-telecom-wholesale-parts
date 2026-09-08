import pymupdf
src='attached_assets/31628-88208-07-Sep-2026_1788816367465.pdf'
doc=pymupdf.open(src)
print('pages', doc.page_count)
for i, page in enumerate(doc):
    pix=page.get_pixmap(matrix=pymupdf.Matrix(2,2), alpha=False)
    out=f'.agents/outputs/qr-source/page-{i+1}.png'
    pix.save(out)
    print(out)
