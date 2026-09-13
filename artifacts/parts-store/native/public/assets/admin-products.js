// admin-products.js - full product editing

(function initWorkbenchProducts() {
    window.Workbench = window.Workbench || {};
})();

window.Router.add(/^admin\/products\/(new|\d+)$/, async (match, root) => {
    if (!window.Core.user || window.Core.user.role !== 'staff') return window.Router.navigate(window.APP_BASE);
    
    const isNew = match[1] === 'new';
    const id = isNew ? null : match[1];

    let p = { sku:'', name:'', description:'', category_id:'', brand_id:'', quality:'', stock:0, purchase_price_eur_cents:null, pricing_version:0, minimum_quantity:1, featured:0, publication_status:'draft' };
    let groupPrices = [];
    let images = [];
    let modelIds = [];
    let latestImageReport = null;

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
        latestImageReport = pData.latest_image_report || null;
    }

    const esc = window.Core.escapeHtml;

    const catsHtml = catalogData.categories.map(c => `<option value="${c.id}" ${c.id == p.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    const brandsHtml = catalogData.brands.map(b => `<option value="${b.id}" ${b.id == p.brand_id ? 'selected' : ''}>${esc(b.name)}</option>`).join('');
    
    let allModels = catalogData.models || [];
    const renderModels = (filter) => {
        const lowerFilter = filter.toLowerCase();
        let html = '';
        const sorted = allModels.slice().sort((a,b) => {
            const aChecked = modelIds.includes(a.id);
            const bChecked = modelIds.includes(b.id);
            if (aChecked && !bChecked) return -1;
            if (!aChecked && bChecked) return 1;
            return a.name.localeCompare(b.name);
        });

        sorted.forEach(m => {
            if (lowerFilter && !m.name.toLowerCase().includes(lowerFilter)) return;
            html += `
                <label class="model-item">
                    <input type="checkbox" name="models[]" value="${m.id}" ${modelIds.includes(m.id) ? 'checked' : ''}>
                    <span>${esc(m.name)}</span>
                </label>
            `;
        });
        if (!html) html = '<div style="padding:0.5rem; font-size:0.8125rem; color:#64748b;">No matching models</div>';
        return html;
    };

    let coverUrl = p.image_url || '';
    const renderImages = currentImages => {
        const displayImages = coverUrl && !currentImages.some(img => img.url === coverUrl)
            ? [{id: null, url: coverUrl, legacy: true}, ...currentImages]
            : currentImages;
        if (displayImages.length === 0) {
            return '<p style="margin:0; font-size:0.875rem; color:#64748b;">No images yet.</p>';
        }
        return `
            <div class="image-gallery">
                ${displayImages.map(img => `
                    <div class="image-item" style="padding-bottom:2.25rem;">
                        <img src="${esc(img.url)}" alt="">
                        ${img.legacy ? '<div style="position:absolute; top:0; left:0; right:0; background:rgba(0,0,0,0.5); color:#fff; font-size:0.65rem; text-align:center; padding:0.125rem;">Legacy cover</div>'
                            : `<button type="button" class="image-item-del action-del-img" data-id="${img.id}" data-url="${esc(img.url)}" aria-label="Remove image">&times;</button>`}
                        <button type="button" class="btn btn-sm btn-outline action-hide-incorrect-img" data-id="${img.id ?? ''}" data-url="${esc(img.url)}" style="position:absolute;left:0;right:0;bottom:0;width:100%;border-radius:0;">Foto klopt niet</button>
                    </div>
                `).join('')}
            </div>
        `;
    };

    const content = `
        <div class="editor-page-header">
            <h1 class="editor-page-title">${isNew ? 'Create Product' : 'Edit Product: ' + esc(p.sku)}</h1>
            <div class="page-actions">
                <a href="${window.APP_BASE}admin/products" class="btn btn-outline">Discard</a>
                ${!isNew ? `<button type="button" class="btn btn-danger action-del-product">Archive</button>` : ''}
            </div>
        </div>
        
        <form id="admin-product-form">
            <div class="product-editor-layout">
                <div class="editor-main">
                    <div class="editor-card">
                        <div class="editor-card-header">
                            <h3>General Information</h3>
                        </div>
                        <div class="editor-card-body">
                            <div class="editor-grid-2">
                                <div class="editor-form-group">
                                    <label>SKU (Part Number)</label>
                                    <input type="text" name="sku" value="${esc(p.sku)}" class="editor-input" required>
                                </div>
                                <div class="editor-form-group">
                                    <label>Product Name</label>
                                    <input type="text" name="name" value="${esc(p.name)}" class="editor-input" required>
                                </div>
                            </div>
                            <div class="editor-grid-2" style="margin-top:1rem;">
                                <div class="editor-form-group">
                                    <label>Category</label>
                                    <select name="category_id" class="editor-input">
                                        <option value="">-- None --</option>
                                        ${catsHtml}
                                    </select>
                                </div>
                                <div class="editor-form-group">
                                    <label>Brand</label>
                                    <select name="brand_id" class="editor-input">
                                        <option value="">-- None --</option>
                                        ${brandsHtml}
                                    </select>
                                </div>
                            </div>
                            <div class="editor-form-group" style="margin-top:1rem;">
                                <label>Quality Grade</label>
                                <input type="text" name="quality" value="${esc(p.quality)}" class="editor-input" placeholder="e.g. OEM, Refurbished">
                            </div>
                            <div class="editor-form-group" style="margin-top:1rem;">
                                <label>Description</label>
                                <textarea name="description" class="editor-input" rows="4">${esc(p.description)}</textarea>
                            </div>
                        </div>
                    </div>

                    <div class="editor-card">
                        <div class="editor-card-header">
                            <h3>Pricing</h3>
                        </div>
                        <div class="editor-card-body">
                            <input type="hidden" name="pricing_version" value="${p.pricing_version}">
                            <div class="editor-form-group" style="max-width: 250px;">
                                <label>Purchase Price (Cost)</label>
                                <div class="input-with-prefix">
                                    <span class="input-prefix">EUR</span>
                                    <input type="text" inputmode="decimal" name="purchase_price_eur" value="${p.purchase_price_eur_cents != null ? (p.purchase_price_eur_cents / 100).toFixed(2) : ''}" placeholder="0.00">
                                </div>
                            </div>
                            <hr style="border:0; border-top:1px solid var(--wb-border); margin:1.5rem 0;">
                            <div class="editor-form-group">
                                <label>Customer Group Prices</label>
                                <p class="editor-help-text" style="margin-bottom: 1rem;">Every customer group needs its own explicit price before this product can be published.</p>
                                <div class="pricing-grid">
                                    ${groups.map(g => {
                                        const existing = groupPrices.find(gp => gp.group_id === g.id);
                                        const val = existing && existing.price_eur_cents != null ? (existing.price_eur_cents / 100).toFixed(2) : '';
                                        return `
                                            <label>${esc(g.name)}</label>
                                            <div class="input-with-prefix">
                                                <span class="input-prefix">EUR</span>
                                                <input type="text" inputmode="decimal" name="gp_eur_${g.id}" value="${val}" placeholder="0.00">
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                            </div>
                        </div>
                    </div>

                    ${!isNew ? `
                    <div class="editor-card">
                        <div class="editor-card-header">
                            <h3>Images</h3>
                        </div>
                        <div class="editor-card-body">
                            ${latestImageReport ? `
                            <div style="margin-bottom:1.25rem; padding:0.875rem 1rem; border:1px solid #fbbf24; border-radius:6px; background:#fffbeb;">
                                <div style="font-size:0.75rem; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; color:#92400e; margin-bottom:0.375rem;">Laatste fotomelding</div>
                                <div style="font-size:0.875rem; color:#451a03; white-space:pre-wrap;">${esc(latestImageReport.reason || 'Geen reden vastgelegd.')}</div>
                                <div style="font-size:0.75rem; color:#78716c; margin-top:0.5rem;">
                                    ${esc(latestImageReport.staff?.name || 'Onbekende medewerker')} · ${esc(new Date(latestImageReport.created_at).toLocaleString())}
                                </div>
                            </div>
                            ` : ''}
                            <div class="admin-product-images" style="margin-bottom:1.5rem;">${renderImages(images)}</div>

                            <label class="image-upload-area" id="drop-zone" for="img-upload">
                                <div style="margin-bottom:0.5rem; color:#0f172a;">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin:0 auto; display:block; margin-bottom:0.5rem;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                                    <strong>Click to upload</strong> or drag and drop<br>
                                    <span style="font-size:0.75rem; color:#64748b; font-weight:normal;">PNG, JPG, WEBP</span>
                                </div>
                                <input type="file" id="img-upload" accept="image/jpeg,image/png,image/webp" multiple style="display:none;">
                            </label>
                            <div class="image-upload-progress" role="status" aria-live="polite" style="margin-top:0.75rem;"></div>
                        </div>
                    </div>
                    ` : `
                    <div class="editor-card">
                        <div class="editor-card-header">
                            <h3>Images</h3>
                        </div>
                        <div class="editor-card-body">
                            <div style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:6px; padding:2rem; text-align:center;">
                                <p style="margin:0; font-size:0.875rem; color:#64748b;">Save the product to enable image uploads.</p>
                            </div>
                        </div>
                    </div>
                    `}
                </div>

                <div class="editor-sidebar">
                    <div class="editor-card">
                        <div class="editor-card-header">
                            <h3>Publication</h3>
                        </div>
                        <div class="editor-card-body">
                            <div class="editor-form-group">
                                <label>Status</label>
                                <select name="publication_status" class="editor-input">
                                    <option value="draft" ${p.publication_status !== 'visible' ? 'selected' : ''}>Draft</option>
                                    <option value="visible" ${p.publication_status === 'visible' ? 'selected' : ''}>Visible (Published)</option>
                                </select>
                                <div class="editor-help-text">Publishing requires SKU, name, category, brand, and a price for every customer group.</div>
                            </div>
                            <hr style="border:0; border-top:1px solid var(--wb-border); margin:1rem 0;">
                            <label class="checkbox-card">
                                <input type="checkbox" name="featured" value="1" ${p.featured ? 'checked' : ''}>
                                <div class="checkbox-card-content">
                                    <span class="checkbox-card-title">Featured</span>
                                    <span class="checkbox-card-desc">Highlight on homepage</span>
                                </div>
                            </label>
                        </div>
                    </div>

                    <div class="editor-card">
                        <div class="editor-card-header">
                            <h3>Inventory</h3>
                        </div>
                        <div class="editor-card-body">
                            <div class="editor-grid-2">
                                <div class="editor-form-group">
                                    <label>Stock</label>
                                    <input type="number" name="stock" value="${p.stock}" class="editor-input" min="0" step="1" required>
                                </div>
                                <div class="editor-form-group">
                                    <label>Min. Qty</label>
                                    <input type="number" name="minimum_quantity" value="${p.minimum_quantity}" min="1" class="editor-input" required>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="editor-card">
                        <div class="editor-card-header">
                            <h3>Compatible Models</h3>
                        </div>
                        <div class="editor-card-body" style="padding: 1rem;">
                            <div class="models-selector">
                                <div class="models-search">
                                    <input type="text" id="model-search" placeholder="Search models...">
                                </div>
                                <div class="models-list" id="models-list">
                                    ${renderModels('')}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="editor-sticky-footer">
                <div style="font-size:0.875rem; color:var(--wb-text-muted);">
                    ${isNew ? 'New product will be saved as draft initially if publication requirements are not met.' : 'Last saved: just now'}
                </div>
                <button type="submit" class="btn btn-primary product-submit" style="padding:0.625rem 2rem; font-weight:600; border:none;">
                    ${isNew ? 'Create Product' : 'Save Changes'}
                </button>
            </div>
        </form>
    `;

    const fullHtml = window.Admin.layout(content, 'products');

    root.innerHTML = fullHtml;

    const list = document.getElementById('models-list');
    const search = document.getElementById('model-search');
    if (list && search) {
        list.addEventListener('change', (e) => {
            if (e.target.matches('input[type="checkbox"]')) {
                const id = parseInt(e.target.value, 10);
                if (e.target.checked) {
                    if (!modelIds.includes(id)) modelIds.push(id);
                } else {
                    modelIds = modelIds.filter(i => i !== id);
                }
            }
        });
        search.addEventListener('input', (e) => {
            list.innerHTML = renderModels(e.target.value);
        });
    }

    const updateImageGallery = currentImages => {
        images = currentImages;
        const container = root.querySelector('.admin-product-images');
        if (!container) return;
        container.innerHTML = renderImages(images);
        bindImageDeleteHandlers();
        bindIncorrectImageHandlers();
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

    const bindIncorrectImageHandlers = () => {
        root.querySelectorAll('.action-hide-incorrect-img').forEach(button => button.addEventListener('click', async event => {
            const target = event.currentTarget;
            const reason = prompt('Waarom klopt deze foto niet?');
            if (reason === null) return;
            if (!reason.trim()) {
                window.Workbench.toast('Vul een reden in.', 'error');
                return;
            }
            target.disabled = true;
            try {
                const response = await window.Core.fetch(`/admin/products/${id}/images/hide`, {
                    method: 'POST',
                    body: { image_id: target.dataset.id ? parseInt(target.dataset.id, 10) : null, url: target.dataset.url, reason: reason.trim() }
                });
                if (target.dataset.url === coverUrl) coverUrl = '';
                updateImageGallery(response.images || []);
                window.Workbench.toast('Foto verborgen; product staat klaar voor fotocontrole.', 'success');
            } catch (error) {
                target.disabled = false;
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

        const payload = {
            sku: fd.get('sku'), name: fd.get('name'), description: fd.get('description'),
            category_id: fd.get('category_id') ? parseInt(fd.get('category_id'), 10) : null,
            brand_id: fd.get('brand_id') ? parseInt(fd.get('brand_id'), 10) : null,
            quality: fd.get('quality'), stock: parseInt(fd.get('stock'), 10),
            purchase_price_eur_cents: parseFormCents(fd.get('purchase_price_eur'), 'purchase price'),
            pricing_version: fd.get('pricing_version') ? parseInt(fd.get('pricing_version'), 10) : 0,
            minimum_quantity: parseInt(fd.get('minimum_quantity'), 10),
            featured: fd.get('featured') ? 1 : 0,
            publication_status: fd.get('publication_status')
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
        payload.model_ids = modelIds;
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
    bindIncorrectImageHandlers();

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

        const input = document.getElementById('img-upload');
        if (input) {
            const handleUpload = async (filesArray) => {
                if (!filesArray.length) return;
                const progress = root.querySelector('.image-upload-progress');
                const results = filesArray.map(file => ({file, state: 'waiting', error: ''}));
                const renderProgress = () => {
                    progress.innerHTML = results.map((result, index) => `
                        <div class="image-upload-result ${result.state}" data-upload-index="${index}" style="font-size:0.8125rem; padding:0.375rem 0; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between;">
                            <span style="color:#334155; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-right:1rem;">${esc(result.file.name)}</span>
                            <strong style="color:${result.state === 'error' ? '#ef4444' : result.state === 'success' ? '#10b981' : '#64748b'}">${result.state === 'waiting' ? 'Waiting' : result.state === 'uploading' ? 'Uploading…' : result.state === 'success' ? 'Saved' : esc(result.error)}</strong>
                        </div>
                    `).join('');
                };
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
                input.disabled = false;
                input.value = '';
                const successes = results.filter(result => result.state === 'success').length;
                const failures = results.length - successes;
                if (failures) {
                    window.Workbench.toast(`${successes} saved, ${failures} failed.`, 'error');
                } else if (successes > 0) {
                    window.Workbench.toast(`${successes} image${successes === 1 ? '' : 's'} uploaded`, 'success');
                }
            };

            input.addEventListener('change', () => handleUpload([...input.files]));

            const dropZone = document.getElementById('drop-zone');
            if (dropZone) {
                dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.style.borderColor = '#0284c7'; dropZone.style.background = '#f0f9ff'; });
                dropZone.addEventListener('dragleave', e => { e.preventDefault(); dropZone.style.borderColor = ''; dropZone.style.background = ''; });
                dropZone.addEventListener('drop', e => {
                    e.preventDefault();
                    dropZone.style.borderColor = ''; dropZone.style.background = '';
                    if (e.dataTransfer.files.length) handleUpload([...e.dataTransfer.files]);
                });
            }
        }

        bindImageDeleteHandlers();
    }
});
