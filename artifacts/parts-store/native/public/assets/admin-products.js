// admin-products.js - full product editing

(function initWorkbenchProducts() {
    window.Workbench = window.Workbench || {};
})();

window.Router.add(/^admin\/products\/(new|\d+)$/, async (match, root) => {
    if (!window.Core.user || window.Core.user.role !== 'staff') return window.Router.navigate(window.APP_BASE);
    
    const isNew = match[1] === 'new';
    const id = isNew ? null : match[1];

    let p = { sku:'', name:'', description:'', category_id:'', brand_id:'', quality:'', stock:0, list_price_cents:0, minimum_quantity:1, featured:0 };
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
        const val = existing ? existing.price_cents : '';
        return `
            <div class="form-group" style="margin-bottom:0.75rem;">
                <label style="font-size:0.75rem;">Prijs voor ${esc(g.name)} (centen)</label>
                <input type="number" name="gp_${g.id}" value="${val}" class="form-control" placeholder="Standaardprijs als leeg">
            </div>
        `;
    }).join('');

    const modelsHtml = catalogData.models.map(m => `
        <label class="model-check-item">
            <input type="checkbox" name="models[]" value="${m.id}" ${modelIds.includes(m.id) ? 'checked' : ''}>
            <span style="font-size:0.875rem;">${esc(m.name)}</span>
        </label>
    `).join('');

    const imgsHtml = images.map(img => `
        <div style="position:relative; display:inline-block; border:1px solid var(--wb-border-light); padding:0.25rem; border-radius:var(--wb-radius); margin-right:0.5rem; margin-bottom:0.5rem; background:var(--wb-bg);">
            <img src="${esc(img.url)}" style="height:100px; width:100px; object-fit:contain; display:block;">
            <button type="button" class="btn btn-sm btn-danger action-del-img" data-id="${img.id}" style="position:absolute; top:-5px; right:-5px; padding:0; width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:var(--wb-shadow-sm)">&times;</button>
        </div>
    `).join('');

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
                                <input type="number" name="stock" value="${p.stock}" class="form-control" required>
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
                        <h3 class="form-section-title">Prijsbeheer</h3>
                        <div class="form-group">
                            <label>Inkoopprijs / Standaardprijs (in centen)</label>
                            <input type="number" name="list_price_cents" value="${p.list_price_cents}" class="form-control" required>
                        </div>
                        <details class="wb-details" ${groupPrices.length > 0 ? 'open' : ''} style="margin-bottom:0;">
                            <summary>Specifieke B2B Groepsprijzen</summary>
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
                    <div>${imgsHtml || '<p class="text-muted" style="font-size:0.875rem;">Nog geen afbeeldingen.</p>'}</div>
                    <div class="form-section" style="border-top:1px solid var(--wb-border-light); margin-top:1.5rem; padding-top:1.5rem; padding-bottom:0; margin-bottom:0; border-bottom:none;">
                        <label>Nieuwe Afbeelding Uploaden</label>
                        <div style="display:flex; gap:0.5rem; align-items:center; margin-top:0.5rem;">
                            <input type="file" id="img-upload" accept="image/*" class="form-control" style="flex:1">
                            <button type="button" class="btn btn-outline action-upload-img">Uploaden</button>
                        </div>
                    </div>
                </div>
                ` : '<div class="alert warning" style="margin-bottom:1.5rem;">Sla het product eerst op om afbeeldingen te kunnen toevoegen.</div>'}
            </div>

            <div class="card" style="display:flex; justify-content:flex-end; padding:1.5rem; background:var(--wb-bg)">
                <button type="submit" class="btn" style="padding:0.75rem 2rem; font-size:1rem;">${isNew ? 'Product Aanmaken' : 'Wijzigingen Opslaan'}</button>
            </div>
        </form>
    `;

    const fullHtml = `
    <div class="layout-sidebar">
        <aside>
            <div class="card admin-card-danger">
                <h3 class="form-section-title" style="color:var(--wb-danger); margin-top:0.5rem; margin-bottom:1rem;">Beheer (Staff)</h3>
                <div class="sidebar-nav">
                    <a href="${window.APP_BASE}admin">Dashboard</a>
                    <a href="${window.APP_BASE}admin/products" class="active">Producten</a>
                    <a href="${window.APP_BASE}admin/orders">Bestellingen</a>
                    <a href="${window.APP_BASE}admin/customers">Klanten</a>
                    <a href="${window.APP_BASE}admin/returns">Retouren</a>
                    <a href="${window.APP_BASE}admin/buyback">Buyback</a>
                </div>
            </div>
        </aside>
        <div>${content}</div>
    </div>`;

    root.innerHTML = fullHtml;

    document.getElementById('admin-product-form').onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const payload = {
            sku: fd.get('sku'), name: fd.get('name'), description: fd.get('description'),
            category_id: fd.get('category_id') ? parseInt(fd.get('category_id'), 10) : null,
            brand_id: fd.get('brand_id') ? parseInt(fd.get('brand_id'), 10) : null,
            quality: fd.get('quality'), stock: parseInt(fd.get('stock'), 10),
            list_price_cents: parseInt(fd.get('list_price_cents'), 10),
            minimum_quantity: parseInt(fd.get('minimum_quantity'), 10),
            featured: fd.get('featured') ? 1 : 0
        };

        const gps = [];
        groups.forEach(g => {
            const val = fd.get(`gp_${g.id}`);
            if (val) gps.push({ group_id: g.id, price_cents: parseInt(val, 10) });
        });
        payload.group_prices = gps;
        payload.model_ids = fd.getAll('models[]').map(m => parseInt(m, 10));

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
        } catch(err) { window.Workbench.toast(err.message, 'error'); }
    };

    if (!isNew) {
        const delBtn = root.querySelector('.action-del-product');
        if (delBtn) delBtn.addEventListener('click', async () => {
            if (!confirm('Weet u zeker dat u dit product wilt archiveren? Orderhistorie blijft intact.')) return;
            try {
                await window.Core.fetch(`/admin/products/${id}`, { method: 'DELETE' });
                window.Workbench.toast('Product gearchiveerd', 'success');
                window.Router.navigate(window.APP_BASE + 'admin/products');
            } catch(err) { window.Workbench.toast(err.message, 'error'); }
        });

        const upBtn = root.querySelector('.action-upload-img');
        if (upBtn) upBtn.addEventListener('click', async () => {
            const input = document.getElementById('img-upload');
            if (!input.files[0]) return window.Workbench.toast('Kies eerst een bestand', 'warning');
            const fd = new FormData();
            fd.append('file', input.files[0]);
            try {
                await window.Core.fetch(`/admin/products/${id}/images`, { method: 'POST', body: fd });
                window.Workbench.toast('Afbeelding geüpload', 'success');
                window.Router.route();
            } catch(err) { window.Workbench.toast(err.message, 'error'); }
        });

        root.querySelectorAll('.action-del-img').forEach(btn => btn.addEventListener('click', async (e) => {
            if (!confirm('Afbeelding definitief verwijderen?')) return;
            try {
                await window.Core.fetch(`/admin/images/${e.currentTarget.dataset.id}`, { method: 'DELETE' });
                window.Workbench.toast('Afbeelding verwijderd', 'success');
                window.Router.route();
            } catch(err) { window.Workbench.toast(err.message, 'error'); }
        }));
    }
});
