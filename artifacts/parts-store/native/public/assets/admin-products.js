// admin-products.js - full product editing

(function initWorkbenchProducts() {
    window.Workbench = window.Workbench || {};
})();

window.Router.add(/^admin\/products\/(new|\d+)$/, async (match, root) => {
    if (!window.Core.user || window.Core.user.role !== 'staff') return window.Router.navigate(window.APP_BASE);
    
    const isNew = match[1] === 'new';
    const id = isNew ? null : match[1];

    let p = { sku:'', name:'', description:'', category_id:'', brand_id:'', quality:'', stock:0, list_price_eur_cents:null, purchase_price_eur_cents:null, pricing_version:0, minimum_quantity:1, featured:0 };
    let groupPrices = [];
    let images = [];
    let modelIds = [];

    const [catalogData, custData] = await Promise.all([
        window.Core.fetch('/catalog'),
        window.Core.fetch('/admin/customers')
    ]);
    const groups = custData.groups || [];

    if (!isNew) {
        const pData = await window.Core.fetch(`/admin/products/${id}`);
        p = pData.product;
        groupPrices = pData.group_prices || [];
        images = pData.images || [];
        modelIds = pData.model_ids || [];
    }

    const esc = window.Core.escapeHtml;

    const catsHtml = catalogData.categories.map(c => `<option value="${c.id}" ${c.id == p.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    const brandsHtml = catalogData.brands.map(b => `<option value="${b.id}" ${b.id == p.brand_id ? 'selected' : ''}>${esc(b.name)}</option>`).join('');
    
    const groupPricesHtml = groups.map(g => {
        const existing = groupPrices.find(gp => gp.group_id === g.id);
        const val = existing && existing.price_eur_cents != null ? (existing.price_eur_cents / 100).toFixed(2) : '';
        return `
            <div class="form-group" style="margin-bottom:0.75rem;">
                <label style="font-size:0.75rem;">Price for ${esc(g.name)} (EUR)</label>
                <input type="text" inputmode="decimal" name="gp_eur_${g.id}" value="${val}" class="form-control" placeholder="Standard price if blank">
            </div>
        `;
    }).join('');

    const modelsHtml = catalogData.models.map(m => `
        <label class="model-check-item">
            <input type="checkbox" name="models[]" value="${m.id}" ${modelIds.includes(m.id) ? 'checked' : ''}>
            <span style="font-size:0.875rem;">${esc(m.name)}</span>
        </label>
    `).join('');

    let coverUrl = p.image_url || '';
    const renderImages = currentImages => {
        const displayImages = coverUrl && !currentImages.some(img => img.url === coverUrl)
            ? [{id: null, url: coverUrl, legacy: true}, ...currentImages]
            : currentImages;
        return displayImages.map(img => `
            <div style="position:relative; display:inline-block; border:1px solid var(--wb-border-light); padding:0.25rem; border-radius:var(--wb-radius); margin-right:0.5rem; margin-bottom:0.5rem; background:var(--wb-bg);">
                <img src="${esc(img.url)}" style="height:100px; width:100px; object-fit:contain; display:block;">
                ${img.legacy
                    ? '<span class="text-muted" style="display:block; max-width:100px; font-size:0.6875rem; text-align:center;">Existing main image</span>'
                    : `<button type="button" class="btn btn-sm btn-danger action-del-img" data-id="${img.id}" data-url="${esc(img.url)}" aria-label="Remove image" style="position:absolute; top:-5px; right:-5px; padding:0; width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:var(--wb-shadow-sm)">&times;</button>`}
            </div>
        `).join('') || '<p class="text-muted" style="font-size:0.875rem;">No images yet.</p>';
    };

    const content = `
        <div class="page-header">
            <h1>${isNew ? 'Add New Product' : 'Edit Product: ' + esc(p.sku)}</h1>
            <div class="page-actions">
                <a href="${window.APP_BASE}admin/products" class="btn btn-outline">&larr; Back to overview</a>
                ${!isNew ? `<button type="button" class="btn btn-danger action-del-product">Archive Product</button>` : ''}
            </div>
        </div>
        
        <form id="admin-product-form">
            <div class="grid-cols-2" style="align-items:start">
                <div>
                    <div class="card" style="margin-bottom:1.5rem">
                        <h3 class="form-section-title">Basic Information</h3>
                        <div class="grid-cols-2">
                            <div class="form-group">
                                <label>SKU (Part Number)</label>
                                <input type="text" name="sku" value="${esc(p.sku)}" class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label>Quality (Grade)</label>
                                <input type="text" name="quality" value="${esc(p.quality)}" class="form-control" placeholder="e.g. OEM, AAA">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Product Name</label>
                            <input type="text" name="name" value="${esc(p.name)}" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label>Detailed Description <span class="text-muted">(optional)</span></label>
                            <textarea name="description" class="form-control" rows="5">${esc(p.description)}</textarea>
                        </div>
                        
                        <details class="wb-details" ${p.category_id || p.brand_id ? 'open' : ''}>
                            <summary>Categorisation (Brand & Category)</summary>
                            <div class="wb-details-content grid-cols-2">
                                <div class="form-group" style="margin-bottom:0">
                                    <label>Category</label>
                                    <select name="category_id" class="form-control"><option value="">-- None --</option>${catsHtml}</select>
                                </div>
                                <div class="form-group" style="margin-bottom:0">
                                    <label>Brand</label>
                                    <select name="brand_id" class="form-control"><option value="">-- None --</option>${brandsHtml}</select>
                                </div>
                            </div>
                        </details>
                    </div>
                </div>

                <div>
                    <div class="card" style="margin-bottom:1.5rem">
                        <h3 class="form-section-title">Stock & Logistics</h3>
                        <div class="grid-cols-2">
                            <div class="form-group">
                                <label>Current Stock</label>
                                <input type="number" name="stock" value="${p.stock}" class="form-control" min="0" step="1" required>
                            </div>
                            <div class="form-group">
                                <label>Minimum Order Quantity</label>
                                <input type="number" name="minimum_quantity" value="${p.minimum_quantity}" min="1" class="form-control" required>
                            </div>
                        </div>
                        <div class="form-group" style="margin-bottom:0;">
                            <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
                                <input type="checkbox" name="featured" value="1" ${p.featured ? 'checked' : ''}> Featured (on homepage)
                            </label>
                        </div>
                    </div>
                    
                    <div class="card" style="margin-bottom:1.5rem">
                        <h3 class="form-section-title">Price Management (EUR)</h3>
                        <input type="hidden" name="pricing_version" value="${p.pricing_version}">
                        <div class="form-group">
                            <label>Purchase Price / Cost (EUR)</label>
                            <input type="text" inputmode="decimal" name="purchase_price_eur" value="${p.purchase_price_eur_cents != null ? (p.purchase_price_eur_cents / 100).toFixed(2) : ''}" class="form-control" placeholder="Unknown">
                        </div>
                        <div class="form-group">
                            <label>Base Selling Price (EUR)</label>
                            <input type="text" inputmode="decimal" name="list_price_eur" value="${p.list_price_eur_cents != null ? (p.list_price_eur_cents / 100).toFixed(2) : ''}" class="form-control" required>
                        </div>
                        <details class="wb-details" ${groupPrices.length > 0 ? 'open' : ''} style="margin-bottom:0;">
                            <summary>Specific B2B Group Prices (EUR)</summary>
                            <div class="wb-details-content">
                                ${groupPricesHtml}
                            </div>
                        </details>
                    </div>
                </div>
            </div>

            <div class="grid-cols-2" style="align-items:start">
                <div class="card" style="margin-bottom:1.5rem">
                    <h3 class="form-section-title">Compatible Models</h3>
                    <p style="font-size:0.875rem; color:var(--wb-text-muted); margin-bottom:1rem;">Select the devices this part is suitable for.</p>
                    <div style="max-height:300px; overflow-y:auto; border:1px solid var(--wb-border-light); padding:0.5rem; border-radius:var(--wb-radius); background:var(--wb-surface);">
                        ${modelsHtml || '<div class="text-muted">No models available.</div>'}
                    </div>
                </div>
                
                ${!isNew ? `
                <div class="card" style="margin-bottom:1.5rem">
                    <h3 class="form-section-title">Images</h3>
                    <div class="admin-product-images">${renderImages(images)}</div>
                    <div class="form-section" style="border-top:1px solid var(--wb-border-light); margin-top:1.5rem; padding-top:1.5rem; padding-bottom:0; margin-bottom:0; border-bottom:none;">
                        <label>Upload New Images</label>
                        <div style="display:flex; gap:0.5rem; align-items:center; margin-top:0.5rem; flex-wrap:wrap;">
                            <input type="file" id="img-upload" accept="image/jpeg,image/png,image/webp" multiple class="form-control" style="flex:1; min-width:220px">
                            <button type="button" class="btn btn-outline action-upload-img">Upload</button>
                        </div>
                        <div class="image-upload-progress" role="status" aria-live="polite" style="margin-top:0.75rem;"></div>
                    </div>
                </div>
                ` : '<div class="alert warning" style="margin-bottom:1.5rem;">Save the product before adding images.</div>'}
            </div>

            <div class="card" style="display:flex; justify-content:flex-end; padding:1.5rem; background:var(--wb-bg)">
                <button type="submit" class="btn product-submit" style="padding:0.75rem 2rem; font-size:1rem;">${isNew ? 'Create Product' : 'Save Changes'}</button>
            </div>
        </form>
    `;

    const fullHtml = window.Admin.layout(content, 'products');

    root.innerHTML = fullHtml;

    const updateImageGallery = currentImages => {
        images = currentImages;
        const container = root.querySelector('.admin-product-images');
        if (!container) return;
        container.innerHTML = renderImages(images);
        bindImageDeleteHandlers();
    };

    const bindImageDeleteHandlers = () => {
        root.querySelectorAll('.action-del-img').forEach(deleteButton => deleteButton.addEventListener('click', async event => {
            if (!confirm('Permanently remove this image?')) return;
            const target = event.currentTarget;
            try {
                const response = await window.Core.fetch(`/admin/images/${target.dataset.id}`, { method: 'DELETE' });
                if (target.dataset.url === coverUrl) {
                    coverUrl = response.images?.[0]?.url || '';
                }
                updateImageGallery(response.images || []);
                window.Workbench.toast('Image removed', 'success');
            } catch (error) {
                window.Workbench.toast(error.message, 'error');
            }
        }));
    };

    document.getElementById('admin-product-form').onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);

        const parseFormCents = (val, fieldName) => {
            if (!val) return null;
            const c = window.Workbench.parseCentsStrict(val);
            if (Number.isNaN(c)) throw new Error("Invalid amount entered for " + fieldName);
            return c;
        };

        const listPriceEurCents = parseFormCents(fd.get('list_price_eur'), 'base selling price');
        if (listPriceEurCents === null) {
            window.Workbench.toast('Base selling price is required', 'error');
            return;
        }

        const payload = {
            sku: fd.get('sku'), name: fd.get('name'), description: fd.get('description'),
            category_id: fd.get('category_id') ? parseInt(fd.get('category_id'), 10) : null,
            brand_id: fd.get('brand_id') ? parseInt(fd.get('brand_id'), 10) : null,
            quality: fd.get('quality'), stock: parseInt(fd.get('stock'), 10),
            list_price_eur_cents: listPriceEurCents,
            purchase_price_eur_cents: parseFormCents(fd.get('purchase_price_eur'), 'purchase price'),
            pricing_version: fd.get('pricing_version') ? parseInt(fd.get('pricing_version'), 10) : 0,
            minimum_quantity: parseInt(fd.get('minimum_quantity'), 10),
            featured: fd.get('featured') ? 1 : 0
        };

        const gps = [];
        groups.forEach(g => {
            const val = fd.get(`gp_eur_${g.id}`);
            if (val !== '') {
                gps.push({ group_id: g.id, price_eur_cents: parseFormCents(val, `group price ${g.name}`) });
            } else {
                gps.push({ group_id: g.id, price_eur_cents: null });
            }
        });
        payload.group_prices = gps;
        payload.model_ids = fd.getAll('models[]').map(m => parseInt(m, 10));
        const btn = e.target.querySelector('.product-submit');
        btn.disabled = true;
        btn.textContent = 'Saving...';
        try {
            if (isNew) {
                const res = await window.Core.fetch('/admin/products', { method: 'POST', body: payload });
                window.Workbench.toast('Product created', 'success');
                window.Router.navigate(`${window.APP_BASE}admin/products/${res.product.id}`);
            } else {
                await window.Core.fetch(`/admin/products/${id}`, { method: 'PATCH', body: payload });
                window.Workbench.toast('Product saved', 'success');
                window.Router.route(); 
            }
        } catch(err) { window.Workbench.toast(err.message, 'error'); btn.disabled = false; btn.textContent = isNew ? 'Create Product' : 'Save Changes'; }
    };

    if (!isNew) {
        const delBtn = root.querySelector('.action-del-product');
        if (delBtn) delBtn.addEventListener('click', async () => {
            if (!confirm('Are you sure you want to archive this product? The order history will remain intact.')) return;
            try {
                await window.Core.fetch(`/admin/products/${id}`, { method: 'DELETE' });
                window.Workbench.toast('Product archived', 'success');
                window.Router.navigate(window.APP_BASE + 'admin/products');
            } catch(err) { window.Workbench.toast(err.message, 'error'); btn.disabled = false; btn.textContent = isNew ? 'Create Product' : 'Save Changes'; }
        });

        const upBtn = root.querySelector('.action-upload-img');
        if (upBtn) upBtn.addEventListener('click', async () => {
            const input = document.getElementById('img-upload');
            const files = [...input.files];
            if (!files.length) return window.Workbench.toast('Select one or more files first', 'warning');
            const progress = root.querySelector('.image-upload-progress');
            const results = files.map(file => ({file, state: 'waiting', error: ''}));
            const renderProgress = () => {
                progress.innerHTML = results.map((result, index) => `
                    <div class="image-upload-result ${result.state}" data-upload-index="${index}">
                        <span>${esc(result.file.name)}</span>
                        <strong>${result.state === 'waiting' ? 'Waiting' : result.state === 'uploading' ? 'Uploading…' : result.state === 'success' ? 'Saved' : esc(result.error)}</strong>
                    </div>
                `).join('');
            };
            upBtn.disabled = true;
            input.disabled = true;
            renderProgress();
            for (const result of results) {
                result.state = 'uploading';
                renderProgress();
                const fd = new FormData();
                fd.append('file', result.file);
                try {
                    const response = await window.Core.fetch(`/admin/products/${id}/images`, { method: 'POST', body: fd });
                    updateImageGallery(response.images || images);
                    result.state = 'success';
                } catch (error) {
                    result.state = 'error';
                    result.error = error.message || 'Upload failed';
                }
                renderProgress();
            }
            const successes = results.filter(result => result.state === 'success').length;
            const failures = results.length - successes;
            upBtn.disabled = false;
            input.disabled = false;
            input.value = '';
            if (failures) {
                window.Workbench.toast(`${successes} saved, ${failures} failed. Successful uploads have been retained.`, 'error');
            } else {
                window.Workbench.toast(`${successes} image${successes === 1 ? '' : 's'} uploaded`, 'success');
            }
        });

        bindImageDeleteHandlers();
    }
});
