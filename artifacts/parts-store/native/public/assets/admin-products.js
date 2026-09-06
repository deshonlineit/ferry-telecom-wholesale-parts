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
                <label style="font-size:0.75rem;">Prijs voor ${esc(g.name)} (EUR)</label>
                <input type="text" inputmode="decimal" name="gp_eur_${g.id}" value="${val}" class="form-control" placeholder="Standaardprijs als leeg">
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
                    ? '<span class="text-muted" style="display:block; max-width:100px; font-size:0.6875rem; text-align:center;">Bestaande hoofdfoto</span>'
                    : `<button type="button" class="btn btn-sm btn-danger action-del-img" data-id="${img.id}" data-url="${esc(img.url)}" aria-label="Afbeelding verwijderen" style="position:absolute; top:-5px; right:-5px; padding:0; width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:var(--wb-shadow-sm)">&times;</button>`}
            </div>
        `).join('') || '<p class="text-muted" style="font-size:0.875rem;">Nog geen afbeeldingen.</p>';
    };

    const content = `
        <div class="page-header">
            <h1>${isNew ? 'Nieuw Product Toevoegen' : 'Product Bewerken: ' + esc(p.sku)}</h1>
            <div class="page-actions">
                <a href="${window.APP_BASE}admin/products" class="btn btn-outline">&larr; Terug naar overzicht</a>
                ${!isNew ? `<button type="button" class="btn btn-danger action-del-product">Product Archiveren</button>` : ''}
            </div>
        </div>
        
        <form id="admin-product-form">
            <div class="grid-cols-2" style="align-items:start">
                <div>
                    <div class="card" style="margin-bottom:1.5rem">
                        <h3 class="form-section-title">Basisinformatie</h3>
                        <div class="grid-cols-2">
                            <div class="form-group">
                                <label>SKU (Artikelnummer)</label>
                                <input type="text" name="sku" value="${esc(p.sku)}" class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label>Kwaliteit (Grade)</label>
                                <input type="text" name="quality" value="${esc(p.quality)}" class="form-control" placeholder="Bijv. OEM, AAA">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Productnaam</label>
                            <input type="text" name="name" value="${esc(p.name)}" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label>Uitgebreide beschrijving <span class="text-muted">(optioneel)</span></label>
                            <textarea name="description" class="form-control" rows="5">${esc(p.description)}</textarea>
                        </div>
                        
                        <details class="wb-details" ${p.category_id || p.brand_id ? 'open' : ''}>
                            <summary>Categorisatie (Merk & Categorie)</summary>
                            <div class="wb-details-content grid-cols-2">
                                <div class="form-group" style="margin-bottom:0">
                                    <label>Categorie</label>
                                    <select name="category_id" class="form-control"><option value="">-- Geen --</option>${catsHtml}</select>
                                </div>
                                <div class="form-group" style="margin-bottom:0">
                                    <label>Merk</label>
                                    <select name="brand_id" class="form-control"><option value="">-- Geen --</option>${brandsHtml}</select>
                                </div>
                            </div>
                        </details>
                    </div>
                </div>

                <div>
                    <div class="card" style="margin-bottom:1.5rem">
                        <h3 class="form-section-title">Voorraad & Logistiek</h3>
                        <div class="grid-cols-2">
                            <div class="form-group">
                                <label>Actuele Voorraad</label>
                                <input type="number" name="stock" value="${p.stock}" class="form-control" min="0" step="1" required>
                            </div>
                            <div class="form-group">
                                <label>Minimum Bestelaantal</label>
                                <input type="number" name="minimum_quantity" value="${p.minimum_quantity}" min="1" class="form-control" required>
                            </div>
                        </div>
                        <div class="form-group" style="margin-bottom:0;">
                            <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
                                <input type="checkbox" name="featured" value="1" ${p.featured ? 'checked' : ''}> Uitgelicht (Featured op homepage)
                            </label>
                        </div>
                    </div>
                    
                    <div class="card" style="margin-bottom:1.5rem">
                        <h3 class="form-section-title">Prijsbeheer (EUR)</h3>
                        <input type="hidden" name="pricing_version" value="${p.pricing_version}">
                        <div class="form-group">
                            <label>Inkoopprijs / Cost (EUR)</label>
                            <input type="text" inputmode="decimal" name="purchase_price_eur" value="${p.purchase_price_eur_cents != null ? (p.purchase_price_eur_cents / 100).toFixed(2) : ''}" class="form-control" placeholder="Onbekend">
                        </div>
                        <div class="form-group">
                            <label>Basisverkoopprijs (EUR)</label>
                            <input type="text" inputmode="decimal" name="list_price_eur" value="${p.list_price_eur_cents != null ? (p.list_price_eur_cents / 100).toFixed(2) : ''}" class="form-control" required>
                        </div>
                        <details class="wb-details" ${groupPrices.length > 0 ? 'open' : ''} style="margin-bottom:0;">
                            <summary>Specifieke B2B Groepsprijzen (EUR)</summary>
                            <div class="wb-details-content">
                                ${groupPricesHtml}
                            </div>
                        </details>
                    </div>
                </div>
            </div>

            <div class="grid-cols-2" style="align-items:start">
                <div class="card" style="margin-bottom:1.5rem">
                    <h3 class="form-section-title">Compatibele Modellen</h3>
                    <p style="font-size:0.875rem; color:var(--wb-text-muted); margin-bottom:1rem;">Selecteer de toestellen waarvoor dit onderdeel geschikt is.</p>
                    <div style="max-height:300px; overflow-y:auto; border:1px solid var(--wb-border-light); padding:0.5rem; border-radius:var(--wb-radius); background:var(--wb-surface);">
                        ${modelsHtml || '<div class="text-muted">Geen modellen beschikbaar.</div>'}
                    </div>
                </div>
                
                ${!isNew ? `
                <div class="card" style="margin-bottom:1.5rem">
                    <h3 class="form-section-title">Afbeeldingen</h3>
                    <div class="admin-product-images">${renderImages(images)}</div>
                    <div class="form-section" style="border-top:1px solid var(--wb-border-light); margin-top:1.5rem; padding-top:1.5rem; padding-bottom:0; margin-bottom:0; border-bottom:none;">
                        <label>Nieuwe Afbeeldingen Uploaden</label>
                        <div style="display:flex; gap:0.5rem; align-items:center; margin-top:0.5rem; flex-wrap:wrap;">
                            <input type="file" id="img-upload" accept="image/jpeg,image/png,image/webp" multiple class="form-control" style="flex:1; min-width:220px">
                            <button type="button" class="btn btn-outline action-upload-img">Uploaden</button>
                        </div>
                        <div class="image-upload-progress" role="status" aria-live="polite" style="margin-top:0.75rem;"></div>
                    </div>
                </div>
                ` : '<div class="alert warning" style="margin-bottom:1.5rem;">Sla het product eerst op om afbeeldingen te kunnen toevoegen.</div>'}
            </div>

            <div class="card" style="display:flex; justify-content:flex-end; padding:1.5rem; background:var(--wb-bg)">
                <button type="submit" class="btn product-submit" style="padding:0.75rem 2rem; font-size:1rem;">${isNew ? 'Product Aanmaken' : 'Wijzigingen Opslaan'}</button>
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
            if (!confirm('Afbeelding definitief verwijderen?')) return;
            const target = event.currentTarget;
            try {
                const response = await window.Core.fetch(`/admin/images/${target.dataset.id}`, { method: 'DELETE' });
                if (target.dataset.url === coverUrl) {
                    coverUrl = response.images?.[0]?.url || '';
                }
                updateImageGallery(response.images || []);
                window.Workbench.toast('Afbeelding verwijderd', 'success');
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
            if (Number.isNaN(c)) throw new Error("Ongeldig bedrag ingevuld voor " + fieldName);
            return c;
        };

        const listPriceEurCents = parseFormCents(fd.get('list_price_eur'), 'Basisverkoopprijs');
        if (listPriceEurCents === null) {
            window.Workbench.toast('Basisverkoopprijs is verplicht', 'error');
            return;
        }

        const payload = {
            sku: fd.get('sku'), name: fd.get('name'), description: fd.get('description'),
            category_id: fd.get('category_id') ? parseInt(fd.get('category_id'), 10) : null,
            brand_id: fd.get('brand_id') ? parseInt(fd.get('brand_id'), 10) : null,
            quality: fd.get('quality'), stock: parseInt(fd.get('stock'), 10),
            list_price_eur_cents: listPriceEurCents,
            purchase_price_eur_cents: parseFormCents(fd.get('purchase_price_eur'), 'Inkoopprijs'),
            pricing_version: fd.get('pricing_version') ? parseInt(fd.get('pricing_version'), 10) : 0,
            minimum_quantity: parseInt(fd.get('minimum_quantity'), 10),
            featured: fd.get('featured') ? 1 : 0
        };

        const gps = [];
        groups.forEach(g => {
            const val = fd.get(`gp_eur_${g.id}`);
            if (val !== '') {
                gps.push({ group_id: g.id, price_eur_cents: parseFormCents(val, `Groepsprijs ${g.name}`) });
            } else {
                gps.push({ group_id: g.id, price_eur_cents: null });
            }
        });
        payload.group_prices = gps;
        payload.model_ids = fd.getAll('models[]').map(m => parseInt(m, 10));
        const btn = e.target.querySelector('.product-submit');
        btn.disabled = true;
        btn.textContent = 'Opslaan...';
        try {
            if (isNew) {
                const res = await window.Core.fetch('/admin/products', { method: 'POST', body: payload });
                window.Workbench.toast('Product aangemaakt', 'success');
                window.Router.navigate(`${window.APP_BASE}admin/products/${res.product.id}`);
            } else {
                await window.Core.fetch(`/admin/products/${id}`, { method: 'PATCH', body: payload });
                window.Workbench.toast('Product opgeslagen', 'success');
                window.Router.route(); 
            }
        } catch(err) { window.Workbench.toast(err.message, 'error'); btn.disabled = false; btn.textContent = isNew ? 'Product Aanmaken' : 'Wijzigingen Opslaan'; }
    };

    if (!isNew) {
        const delBtn = root.querySelector('.action-del-product');
        if (delBtn) delBtn.addEventListener('click', async () => {
            if (!confirm('Weet u zeker dat u dit product wilt archiveren? Orderhistorie blijft intact.')) return;
            try {
                await window.Core.fetch(`/admin/products/${id}`, { method: 'DELETE' });
                window.Workbench.toast('Product gearchiveerd', 'success');
                window.Router.navigate(window.APP_BASE + 'admin/products');
            } catch(err) { window.Workbench.toast(err.message, 'error'); btn.disabled = false; btn.textContent = isNew ? 'Product Aanmaken' : 'Wijzigingen Opslaan'; }
        });

        const upBtn = root.querySelector('.action-upload-img');
        if (upBtn) upBtn.addEventListener('click', async () => {
            const input = document.getElementById('img-upload');
            const files = [...input.files];
            if (!files.length) return window.Workbench.toast('Kies eerst één of meer bestanden', 'warning');
            const progress = root.querySelector('.image-upload-progress');
            const results = files.map(file => ({file, state: 'waiting', error: ''}));
            const renderProgress = () => {
                progress.innerHTML = results.map((result, index) => `
                    <div class="image-upload-result ${result.state}" data-upload-index="${index}">
                        <span>${esc(result.file.name)}</span>
                        <strong>${result.state === 'waiting' ? 'Wacht' : result.state === 'uploading' ? 'Bezig…' : result.state === 'success' ? 'Opgeslagen' : esc(result.error)}</strong>
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
                    result.error = error.message || 'Upload mislukt';
                }
                renderProgress();
            }
            const successes = results.filter(result => result.state === 'success').length;
            const failures = results.length - successes;
            upBtn.disabled = false;
            input.disabled = false;
            input.value = '';
            if (failures) {
                window.Workbench.toast(`${successes} opgeslagen, ${failures} mislukt. De geslaagde uploads blijven bewaard.`, 'error');
            } else {
                window.Workbench.toast(`${successes} afbeelding${successes === 1 ? '' : 'en'} geüpload`, 'success');
            }
        });

        bindImageDeleteHandlers();
    }
});
