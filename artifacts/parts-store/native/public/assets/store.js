const esc = window.Core.escapeHtml;

window.App.renderProductCard = function(p) {
    const isStaff = window.Core.user && window.Core.user.role === 'staff';
    const canBuy = !isStaff && p.price_cents !== null && p.stock > 0;
    
    let stockClass = p.stock > 10 ? 'stock-ok' : (p.stock > 0 ? 'stock-low' : 'stock-out');
    let stockText = p.stock > 10 ? 'Op voorraad' : (p.stock > 0 ? `Laatste ${p.stock} stuks` : 'Niet op voorraad');

    return `
        <div class="product-card">
            <a href="${window.APP_BASE}products/${p.id}" class="product-card-img">
                ${p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy">` : `<div class="img-placeholder">Geen foto</div>`}
            </a>
            <div class="product-card-body">
                <div class="product-card-meta">
                    <span class="sku">SKU: ${esc(p.sku)}</span>
                    ${p.quality ? `<span class="badge quality-badge">${esc(p.quality)}</span>` : ''}
                </div>
                <h3 class="product-title"><a href="${window.APP_BASE}products/${p.id}">${esc(p.name)}</a></h3>
                
                <div class="product-price-row">
                    <div class="price">
                        ${p.price_cents !== null ? window.Core.formatMoney(p.price_cents) : `<a href="${window.APP_BASE}login" class="login-for-price">Log in voor prijs</a>`}
                    </div>
                </div>
                <div class="stock-indicator ${stockClass}">
                    <span class="stock-dot"></span>${stockText}
                </div>
            </div>
            ${canBuy ? `
            <div class="product-card-action">
                <div class="qty-control">
                    <input type="number" id="qty-${p.id}" value="${p.minimum_quantity}" min="${p.minimum_quantity}" max="${p.stock}" class="form-control" aria-label="Aantal">
                </div>
                <button type="button" class="btn btn-primary" onclick="window.App.addToCartWithQty(${p.id}, parseInt(document.getElementById('qty-${p.id}').value, 10))" aria-label="Aan winkelwagen toevoegen">
                    Toevoegen
                </button>
            </div>
            ` : (isStaff ? '<div class="product-card-action"><span class="text-muted small">Beheerweergave</span></div>' : '')}
        </div>
    `;
};

window.App.toggleView = function(view) {
    localStorage.setItem('view_pref', view);
    const grid = document.querySelector('.product-container');
    if (grid) {
        grid.className = `product-container view-${view}`;
    }
    document.querySelectorAll('.view-toggle button').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.view-toggle button[data-view="${view}"]`);
    if (btn) btn.classList.add('active');
};


window.Router.add(/^$/, async (match, root) => {
    root.innerHTML = '<div class="page-loader"><div class="spinner"></div></div>';
    try {
        const [catData, featData] = await Promise.all([
            window.Core.fetch('/catalog'),
            window.Core.fetch('/products?featured=1&limit=8')
        ]);
        
        window.App._heroModels = catData.models;
        
        let sortedCats = window.App.sortCategories(catData.categories);
        let catsHtml = sortedCats.slice(0, 8).map(c => `
            <a href="${window.APP_BASE}catalog?category=${c.id}" class="category-card has-image">
                <div class="category-img">
                    ${c.image_url ? `<img src="${esc(c.image_url)}" alt="">` : `<div class="img-placeholder">${window.App.getCategoryIcon(c.slug)}</div>`}
                </div>
                <div class="category-info">
                    <h3>${esc(c.name)}</h3>
                    <span class="count text-muted">${c.count} producten</span>
                </div>
            </a>
        `).join('');

        let prodsHtml = featData.products.length ? featData.products.map(p => window.App.renderProductCard(p)).join('') : '<p class="text-muted">Geen uitgelichte producten momenteel.</p>';

        root.innerHTML = `
            <div class="landing-hero" style="padding: 3rem 2rem; margin-bottom: 2rem;">
                <div class="landing-hero-content" style="max-width: 900px; margin: 0 auto;">
                    <h1 style="font-size: 2.25rem; margin-bottom: 0.5rem; text-align: left;">Vind het exacte onderdeel.</h1>
                    <p style="font-size: 1.125rem; color: rgba(255,255,255,0.9); margin-bottom: 2rem; text-align: left;">Direct zoeken in onze catalogus op merk, model en categorie.</p>
                    
                    <div class="hero-finder">
                        <div class="hero-finder-field">
                            <label>Merk</label>
                            <select id="hero-brand" class="form-control" onchange="window.App.updateHeroFinder(this.value)">
                                <option value="">Kies Merk...</option>
                                ${catData.brands.map(b => `<option value="${b.id}" ${b.count===0?'disabled':''}>${esc(b.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="hero-finder-field">
                            <label>Model</label>
                            <select id="hero-model" class="form-control" disabled>
                                <option value="">Kies Model...</option>
                            </select>
                        </div>
                        <div class="hero-finder-field">
                            <label>Onderdeel</label>
                            <select id="hero-cat" class="form-control">
                                <option value="">Alle Categorieën...</option>
                                ${sortedCats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                            </select>
                        </div>
                        <button onclick="window.App.submitHeroFinder()" class="btn btn-primary hero-finder-btn">Zoeken</button>
                    </div>
                </div>
            </div>
            
            <div class="section-title">
                <h2>Onderdelen</h2>
            </div>
            <div class="category-grid">
                ${catsHtml}
            </div>

            <div class="section-title mt-5">
                <h2>Uitgelicht</h2>
                <a href="${window.APP_BASE}catalog" class="btn btn-link">Bekijk alles &rarr;</a>
            </div>
            <div class="product-container view-grid">
                ${prodsHtml}
            </div>
        `;
    } catch(e) {
        root.innerHTML = `<div class="alert error">${esc(e.message)}</div>`;
    }
});


window.Router.add(/^catalog$/, async (match, root, qs) => {
    const searchParams = new URLSearchParams(qs);
    const q = searchParams.get('q') || '';
    const cat = searchParams.get('category') || '';
    const brand = searchParams.get('brand') || '';
    const model = searchParams.get('model') || '';
    const quality = searchParams.get('quality') || '';
    const stock = searchParams.get('stock') || '';
    const sort = searchParams.get('sort') || '';
    const page = searchParams.get('page') || '1';

    const [catalogData, productsData] = await Promise.all([
        window.Core.fetch('/catalog'),
        window.Core.fetch(`/products?q=${encodeURIComponent(q)}&category=${encodeURIComponent(cat)}&brand=${encodeURIComponent(brand)}&model=${encodeURIComponent(model)}&quality=${encodeURIComponent(quality)}&stock=${encodeURIComponent(stock)}&sort=${encodeURIComponent(sort)}&page=${page}`)
    ]);

    const buildUrl = (key, val) => {
        const p = new URLSearchParams(searchParams);
        if (val) p.set(key, val); else p.delete(key);
        if (key !== 'page') p.delete('page');
        return `${window.APP_BASE}catalog?${p.toString()}`;
    };

    let filters = [];
    if (q) filters.push({k:'q', l:`Zoek: ${q}`});
    if (cat) filters.push({k:'category', l:`Categorie: ${catalogData.categories.find(c=>c.id==cat)?.name || cat}`});
    if (brand) filters.push({k:'brand', l:`Merk: ${catalogData.brands.find(b=>b.id==brand)?.name || brand}`});
    if (model) filters.push({k:'model', l:`Model: ${catalogData.models.find(m=>m.id==model)?.name || model}`});
    if (quality) filters.push({k:'quality', l:`Type: ${quality}`});
    if (stock) filters.push({k:'stock', l:`Alleen op voorraad`});
    
    let activeFiltersHtml = filters.length ? `
        <div class="active-filters">
            ${filters.map(f => `
                <a href="${buildUrl(f.k, '')}" class="filter-chip">
                    ${esc(f.l)} <span class="remove">&times;</span>
                </a>
            `).join('')}
            <a href="${window.APP_BASE}catalog" class="btn btn-link btn-sm ml-2">Wissen</a>
        </div>
    ` : '';

    let sortedCats = window.App.sortCategories(catalogData.categories);
    let catsHtml = sortedCats.map(c => `
        <a href="${buildUrl('category', c.id)}" class="nav-item ${c.id == cat ? 'active' : ''}">
            <span class="nav-label">${esc(c.name)}</span>
            <span class="nav-count">${c.count}</span>
        </a>
    `).join('');

    let brandsHtml = catalogData.brands.map(b => {
        const countStr = b.count !== undefined ? ` (${b.count})` : '';
        const dis = b.count === 0 ? 'disabled' : '';
        return `<option value="${b.id}" ${b.id == brand ? 'selected' : ''} ${dis}>${esc(b.name)}${countStr}</option>`;
    }).join('');

    let filteredModels = brand ? catalogData.models.filter(m => m.brand_id == brand) : catalogData.models;
    let modelsHtml = filteredModels.map(m => {
        const countStr = m.count !== undefined ? ` (${m.count})` : '';
        const dis = m.count === 0 ? 'disabled' : '';
        return `<option value="${m.id}" ${m.id == model ? 'selected' : ''} ${dis}>${esc(m.name)}${countStr}</option>`;
    }).join('');

    let qualitiesHtml = catalogData.qualities.map(q_str => 
        `<option value="${esc(q_str)}" ${q_str == quality ? 'selected' : ''}>${esc(q_str)}</option>`
    ).join('');

    let prodsHtml = productsData.products.length ? 
        productsData.products.map(p => window.App.renderProductCard(p)).join('') : 
        '<div class="empty-state"><h3>Geen producten gevonden</h3><p class="text-muted mt-2">Probeer uw filters aan te passen of een andere zoekopdracht te gebruiken.</p></div>';

    const viewPref = localStorage.getItem('view_pref') || 'grid';
    
    root.innerHTML = `
        <div class="catalog-layout">
            <aside class="catalog-sidebar">
                <div class="sidebar-block">
                    <h3 class="sidebar-title">Categorieën</h3>
                    <nav class="sidebar-nav">
                        <a href="${buildUrl('category', '')}" class="nav-item ${!cat ? 'active' : ''}">
                            <span class="nav-label">Alle producten</span>
                        </a>
                        ${catsHtml}
                    </nav>
                </div>
                
                <div class="sidebar-block">
                    <h3 class="sidebar-title">Filters</h3>
                    <form onsubmit="event.preventDefault();" id="filter-form" class="filter-form">
                        <input type="hidden" name="q" value="${esc(q)}">
                        <input type="hidden" name="category" value="${esc(cat)}">
                        
                        <div class="form-group">
                            <label class="form-label">Merk</label>
                            <select name="brand" class="form-control" onchange="this.form.submitFilter()">
                                <option value="">Alle Merken</option>
                                ${brandsHtml}
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Model</label>
                            <select name="model" class="form-control" onchange="this.form.submitFilter()" ${!brand ? 'disabled title="Kies eerst een merk"' : ''}>
                                <option value="">Alle Modellen</option>
                                ${modelsHtml}
                            </select>
                        </div>
                        <details class="optional-section filter-extras" ${quality || stock ? 'open' : ''}>
                        <summary>Meer filters <span class="text-muted small">(optioneel)</span></summary>
                        <div class="form-group mt-3">
                            <label class="form-label">Type / Kwaliteit</label>
                            <select name="quality" class="form-control" onchange="this.form.submitFilter()">
                                <option value="">Alles tonen</option>
                                ${qualitiesHtml}
                            </select>
                        </div>
                        <div class="form-group mt-3">
                            <label class="check-label">
                                <input type="checkbox" name="stock" value="in_stock" ${stock === 'in_stock' ? 'checked' : ''} onchange="this.form.submitFilter()">
                                <span>Alleen op voorraad tonen</span>
                            </label>
                        </div>
                        </details>
                    </form>
                </div>
            </aside>
            
            <div class="catalog-main">
                <div class="catalog-header">
                    <div>
                        <h1 class="page-title">${q ? `Zoekresultaten voor "${esc(q)}"` : (cat ? `Categorie: ${catalogData.categories.find(c=>c.id==cat)?.name}` : 'Compleet Assortiment')}</h1>
                        <div class="results-count text-muted">${productsData.total} producten gevonden</div>
                    </div>
                    
                    <button type="button" class="btn btn-outline filter-toggle-btn mobile-only" onclick="document.querySelector('.catalog-sidebar').classList.toggle('open')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mr-2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                        Filters
                    </button>
                    
                    <div class="catalog-controls hidden-mobile">
                        <select class="form-control sort-select" aria-label="Sorteren" onchange="window.Router.navigate('${buildUrl('sort', '')}' + this.value)">
                            <option value="">Sorteer: Relevantie</option>
                            <option value="price_asc" ${sort === 'price_asc' ? 'selected' : ''}>Prijs: Laag naar Hoog</option>
                            <option value="price_desc" ${sort === 'price_desc' ? 'selected' : ''}>Prijs: Hoog naar Laag</option>
                            <option value="newest" ${sort === 'newest' ? 'selected' : ''}>Nieuwste eerst</option>
                        </select>
                        
                        <div class="view-toggle">
                            <button type="button" data-view="grid" onclick="window.App.toggleView('grid')" class="${viewPref === 'grid' ? 'active' : ''}" aria-label="Grid weergave">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                            </button>
                            <button type="button" data-view="list" onclick="window.App.toggleView('list')" class="${viewPref === 'list' ? 'active' : ''}" aria-label="Lijst weergave">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                            </button>
                        </div>
                    </div>
                </div>
                
                ${activeFiltersHtml}
                
                <div class="product-container view-${viewPref}">
                    ${prodsHtml}
                </div>
                
                <div class="pagination-container">
                    ${window.Core.renderPagination(productsData.page, productsData.pages, searchParams, window.APP_BASE + 'catalog')}
                </div>
            </div>
        </div>
    `;

    document.getElementById('filter-form').submitFilter = function() {
        const p = new URLSearchParams(searchParams);
        const fd = new FormData(this);
        p.delete('brand'); p.delete('model'); p.delete('quality'); p.delete('stock'); p.delete('page');
        for (let [k,v] of fd.entries()) {
            if (v && v !== 'undefined') p.set(k, v);
        }
        window.Router.navigate(window.APP_BASE + 'catalog?' + p.toString());
    };
});


window.Router.add(/^products\/(\d+)$/, async (match, root) => {
    const id = match[1];
    const data = await window.Core.fetch(`/products/${id}`);
    const p = data.product;
    
    const allImages = p.image_url ? [{url: p.image_url}] : [];
    if (data.images) {
        data.images.forEach(img => {
            if (!allImages.find(i => i.url === img.url)) {
                allImages.push({url: img.url, id: img.id});
            }
        });
    }

    const thumbnailsHtml = allImages.map((img, idx) => `
        <button type="button" class="gallery-thumb" onclick="document.getElementById('main-img').src='${esc(img.url)}'; window.App.currentImageIndex=${idx};">
            <img src="${esc(img.url)}" alt="Thumbnail ${idx + 1}">
        </button>
    `).join('');

    const modelsHtml = data.models && data.models.length ? `
        <div class="product-section mt-4">
            <h4>Compatibele Modellen</h4>
            <div class="model-tags mt-2">
                ${data.models.map(m => `<span class="model-tag">${esc(m.name)}</span>`).join('')}
            </div>
        </div>
    ` : '';
    
    const relatedHtml = data.related && data.related.length ? `
        <div class="section-title mt-5">
            <h2>Gerelateerde Producten</h2>
        </div>
        <div class="product-container view-grid">
            ${data.related.map(rp => window.App.renderProductCard(rp)).join('')}
        </div>
    ` : '';

    const isStaff = window.Core.user && window.Core.user.role === 'staff';
    const canBuy = !isStaff && p.price_cents !== null && p.stock > 0;
    
    window.App.currentImageIndex = 0;

    root.innerHTML = `
        <div class="breadcrumb mb-4">
            <a href="${window.APP_BASE}catalog" class="btn btn-link btn-sm pl-0 text-muted">&larr; Terug naar assortiment</a>
        </div>
        
        <div class="product-detail-layout">
            <div class="product-gallery">
                ${allImages.length ? `
                    <div class="main-image-container" onclick="window.UI.showGallery(${JSON.stringify(allImages).replace(/"/g, '&quot;')}, window.App.currentImageIndex)" role="button" tabindex="0" title="Klik om te vergroten">
                        <img id="main-img" src="${esc(allImages[0].url)}" alt="${esc(p.name)}">
                        <div class="zoom-hint"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg></div>
                    </div>
                    ${allImages.length > 1 ? `<div class="gallery-thumbnails mt-3">${thumbnailsHtml}</div>` : ''}
                ` : `
                    <div class="main-image-container no-image">
                        <div class="img-placeholder">Geen afbeelding beschikbaar</div>
                    </div>
                `}
            </div>
            
            <div class="product-info">
                <div class="product-meta mb-2">
                    <span class="sku">SKU: ${esc(p.sku)}</span>
                    ${p.quality ? `<span class="badge quality-badge ml-2">${esc(p.quality)}</span>` : ''}
                </div>
                <h1 class="product-title-lg mb-4">${esc(p.name)}</h1>
                
                <div class="product-price-lg mb-4">
                    ${p.price_cents !== null ? window.Core.formatMoney(p.price_cents) : `<a href="${window.APP_BASE}login" class="login-for-price">Log in voor uw prijs</a>`}
                </div>
                
                <div class="stock-status ${p.stock > 10 ? 'stock-ok' : (p.stock > 0 ? 'stock-low' : 'stock-out')} mb-4">
                    <span class="stock-dot"></span>
                    ${p.stock > 10 ? 'Ruim op voorraad' : (p.stock > 0 ? `Beperkte voorraad: nog ${p.stock} stuks` : 'Niet op voorraad')}
                </div>
                
                <div class="product-description mb-4">
                    ${esc(p.description).replace(/\n/g, '<br>')}
                </div>
                
                ${canBuy ? `
                    <div class="purchase-box">
                        <label for="pd-qty" class="form-label font-weight-bold">Aantal</label>
                        <div class="purchase-controls">
                            <input type="number" id="pd-qty" value="${p.minimum_quantity}" min="${p.minimum_quantity}" max="${p.stock}" class="form-control qty-input">
                            <button type="button" class="btn btn-primary btn-lg flex-1" onclick="window.App.addToCartWithQty(${p.id}, parseInt(document.getElementById('pd-qty').value, 10))">
                                Aan winkelwagen toevoegen
                            </button>
                        </div>
                        ${p.minimum_quantity > 1 ? `<div class="qty-hint mt-2 text-muted small">Minimale afname: ${p.minimum_quantity} stuks</div>` : ''}
                    </div>
                ` : (isStaff ? '<div class="alert warning mt-4">Als beheerder kunt u geen bestellingen plaatsen.</div>' : (!window.Core.user ? '<div class="alert mt-4"><a href="'+window.APP_BASE+'login">Log in</a> om dit product te bestellen.</div>' : ''))}
                
                ${modelsHtml}
            </div>
        </div>
        
        ${relatedHtml}
    `;
});


window.Router.add(/^cart$/, async (match, root) => {
    if (window.Core.user && window.Core.user.role === 'staff') return window.Router.navigate(window.APP_BASE + 'catalog');
    if (!window.Core.user) {
        root.innerHTML = `<div class="container mt-4"><div class="alert warning">U moet <a href="${window.APP_BASE}login">inloggen</a> om uw winkelwagen te bekijken.</div></div>`;
        return;
    }
    await window.Core.refreshCart();
    const cart = window.Core.cart;

    if (!cart.items || cart.items.length === 0) {
        root.innerHTML = `
            <div class="page-header mb-4"><h1>Winkelwagen</h1></div>
            <div class="empty-state card">
                <div class="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg></div>
                <h3>Uw winkelwagen is leeg</h3>
                <p class="text-muted mt-2">Voeg producten toe vanuit het assortiment.</p>
                <a href="${window.APP_BASE}catalog" class="btn btn-primary mt-4">Bekijk Assortiment</a>
            </div>
        `;
        return;
    }

    const itemsHtml = cart.items.map(item => `
        <div class="cart-item">
            <div class="cart-item-img">
                ${item.image_url ? `<img src="${esc(item.image_url)}" alt="">` : `<div class="img-placeholder"></div>`}
            </div>
            <div class="cart-item-details">
                <a href="${window.APP_BASE}products/${item.product_id}" class="cart-item-title">${esc(item.name)}</a>
                <div class="cart-item-meta mt-1">SKU: ${esc(item.sku)}</div>
                ${item.stock < item.quantity ? `<div class="alert danger small mt-2 p-2">Voorraad gewijzigd (max ${item.stock})</div>` : ''}
            </div>
            <div class="cart-item-price hidden-mobile">
                ${window.Core.formatMoney(item.price_cents)}
            </div>
            <div class="cart-item-qty">
                <input type="number" value="${item.quantity}" min="0" max="${item.stock}" class="form-control" aria-label="Aantal" onchange="window.App.updateCartItem(${item.product_id}, this.value)">
                <button type="button" class="btn btn-link text-danger btn-sm p-0 mt-1" onclick="window.App.updateCartItem(${item.product_id}, 0)">Verwijderen</button>
            </div>
            <div class="cart-item-total font-weight-bold">
                ${window.Core.formatMoney(item.total_cents)}
            </div>
        </div>
    `).join('');

    root.innerHTML = `
        <div class="page-header mb-4">
            <h1>Winkelwagen</h1>
            <span class="text-muted">${cart.items.length} product(en)</span>
        </div>
        <div class="commerce-layout">
            <div class="cart-main">
                <div class="cart-list card p-0">
                    <div class="cart-header hidden-mobile">
                        <div style="flex:1">Product</div>
                        <div style="width:120px">Prijs</div>
                        <div style="width:120px">Aantal</div>
                        <div style="width:120px; text-align:right">Totaal</div>
                    </div>
                    <div class="cart-items">
                        ${itemsHtml}
                    </div>
                </div>
                <div class="cart-actions mt-4">
                    <a href="${window.APP_BASE}catalog" class="btn btn-outline">&larr; Verder winkelen</a>
                    <button onclick="window.App.clearCart()" class="btn btn-link text-danger">Winkelwagen legen</button>
                </div>
            </div>
            <div class="cart-sidebar">
                <div class="summary-card card sticky-card">
                    <h3 class="mb-4">Besteloverzicht</h3>
                    <div class="summary-row">
                        <span class="text-muted">Subtotaal</span>
                        <span class="font-weight-bold">${window.Core.formatMoney(cart.subtotal_cents)}</span>
                    </div>
                    <div class="summary-row">
                        <span class="text-muted">Verzendkosten</span>
                        <span>${window.Core.formatMoney(cart.shipping_cents)}</span>
                    </div>
                    <div class="summary-row summary-border pb-4 mb-4" style="border-bottom:1px solid var(--border-light)">
                        <span class="text-muted">BTW</span>
                        <span>${window.Core.formatMoney(cart.tax_cents)}</span>
                    </div>
                    <div class="summary-row summary-total" style="font-size:1.25rem; font-weight:700;">
                        <span>Totaal</span>
                        <span class="text-primary">${window.Core.formatMoney(cart.total_cents)}</span>
                    </div>
                    <a href="${window.APP_BASE}checkout" class="btn btn-primary btn-block btn-lg mt-4">Afrekenen &rarr;</a>
                </div>
            </div>
        </div>
    `;

    window.App.updateCartItem = async (productId, qty) => {
        try {
            await window.Core.fetch('/cart', { method: 'POST', body: { product_id: productId, quantity: parseInt(qty,10) } });
            window.Router.route();
        } catch(e) { alert(e.message); }
    };
    
    window.App.clearCart = async () => {
        if(confirm('Weet u zeker dat u de winkelwagen wilt legen?')) {
            try {
                await window.Core.fetch('/cart', { method: 'DELETE' });
                window.Router.route();
            } catch(e) { alert(e.message); }
        }
    };
});


window.Router.add(/^checkout$/, async (match, root) => {
    if (!window.Core.user) return window.Router.navigate(window.APP_BASE + 'login');
    if (window.Core.user.role === 'staff') return window.Router.navigate(window.APP_BASE + 'catalog');
    
    try {
        const [cartRes, addrRes] = await Promise.all([
            window.Core.fetch('/cart'),
            window.Core.fetch('/addresses')
        ]);
        
        if (!cartRes.items || cartRes.items.length === 0) {
            return window.Router.navigate(window.APP_BASE + 'cart');
        }

        const addresses = addrRes.addresses;
        let addrHtml = '';
        if (addresses.length === 0) {
            addrHtml = `<div class="alert warning">U heeft nog geen adressen opgeslagen. <a href="${window.APP_BASE}account/addresses">Voeg eerst een adres toe</a>.</div>`;
        } else {
            addrHtml = addresses.map((a, i) => `
                <label class="address-card ${a.is_default || i === 0 ? 'selected' : ''}">
                    <input type="radio" name="address_id" value="${a.id}" ${a.is_default || i === 0 ? 'checked' : ''} onchange="document.querySelectorAll('.address-card').forEach(c=>c.classList.remove('selected')); this.closest('.address-card').classList.add('selected');">
                    <div class="address-details">
                        <div class="address-header">
                            <strong>${esc(a.label)}</strong>
                            <svg class="check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </div>
                        <div class="address-body mt-2 text-sm text-muted">
                            ${a.company ? `<div>${esc(a.company)}</div>` : ''}
                            <div>${esc(a.name)}</div>
                            <div>${esc(a.line1)} ${esc(a.line2)}</div>
                            <div>${esc(a.postal_code)} ${esc(a.city)}</div>
                            <div>${esc(a.country)}</div>
                        </div>
                    </div>
                </label>
            `).join('');
        }

        const stockWarning = cartRes.items.some(i => i.stock < i.quantity) 
            ? `<div class="alert danger mb-4">Let op: Voor sommige items is de voorraad gewijzigd. Verlaag het aantal in de <a href="${window.APP_BASE}cart">winkelwagen</a>.</div>` 
            : '';

        let currentIdempotencyKey = crypto.randomUUID();

        root.innerHTML = `
            <div class="page-header mb-4">
                <h1>Afrekenen</h1>
                <a href="${window.APP_BASE}cart" class="btn btn-link pl-0 text-muted">&larr; Terug naar winkelwagen</a>
            </div>
            ${stockWarning}
            <div class="commerce-layout">
                <div class="checkout-main">
                    <form id="checkout-form">
                        <div class="checkout-step card mb-4">
                            <div class="step-header">
                                <span class="step-number">1</span>
                                <h3>Kies Verzendadres</h3>
                            </div>
                            <div class="step-content">
                                <div class="address-grid">
                                    ${addrHtml}
                                </div>
                                ${addresses.length > 0 ? `<div class="mt-3"><a href="${window.APP_BASE}account/addresses" target="_blank" class="btn btn-outline btn-sm">Beheer adressen</a></div>` : ''}
                            </div>
                        </div>
                        
                        <div class="checkout-step card mb-4">
                            <div class="step-header">
                                <span class="step-number">2</span>
                                <h3>Betaalmethode</h3>
                            </div>
                            <div class="step-content">
                                <div class="payment-grid">
                                    <label class="payment-card selected">
                                        <input type="radio" name="payment_method" value="test_invoice" checked onchange="document.querySelectorAll('.payment-card').forEach(c=>c.classList.remove('selected')); this.closest('.payment-card').classList.add('selected');">
                                        <div class="payment-details">
                                            <strong>Op rekening (Test)</strong>
                                            <p class="text-muted small mt-1">Betaal achteraf na ontvangst van factuur.</p>
                                        </div>
                                    </label>
                                    <label class="payment-card">
                                        <input type="radio" name="payment_method" value="test_card" onchange="document.querySelectorAll('.payment-card').forEach(c=>c.classList.remove('selected')); this.closest('.payment-card').classList.add('selected');">
                                        <div class="payment-details">
                                            <strong>Creditcard (Test)</strong>
                                            <p class="text-muted small mt-1">Direct betalen via beveiligde test-omgeving.</p>
                                        </div>
                                    </label>
                                </div>
                            </div>
                        </div>
                        
                        <details class="checkout-step card mb-4 optional-section">
                            <summary class="step-header">
                                <h3>Opmerkingen <span class="text-muted font-weight-normal">(Optioneel)</span></h3>
                            </summary>
                            <div class="step-content">
                                <textarea name="notes" class="form-control" rows="3" placeholder="Interne referentie, pakbon instructie, etc..."></textarea>
                            </div>
                        </details>
                        
                        <div class="checkout-actions mt-4">
                            <button type="submit" class="btn btn-primary btn-lg btn-block" ${addresses.length === 0 || stockWarning ? 'disabled' : ''}>
                                Bestelling Definitief Plaatsen
                            </button>
                        </div>
                    </form>
                </div>
                
                <div class="cart-sidebar">
                    <div class="summary-card card sticky-card">
                        <h3 class="mb-4">Uw Bestelling</h3>
                        <div class="summary-items mb-4 pb-4" style="border-bottom:1px solid var(--border-light)">
                            ${cartRes.items.map(i => `
                                <div class="summary-item mb-2" style="display:flex; justify-content:space-between; font-size:0.875rem;">
                                    <div class="summary-item-name pr-2">
                                        <span class="text-muted font-weight-bold mr-1">${i.quantity}x</span> ${esc(i.name)}
                                    </div>
                                    <div class="font-weight-bold">${window.Core.formatMoney(i.total_cents)}</div>
                                </div>
                            `).join('')}
                        </div>
                        
                        <div class="summary-row">
                            <span class="text-muted">Subtotaal</span>
                            <span>${window.Core.formatMoney(cartRes.subtotal_cents)}</span>
                        </div>
                        <div class="summary-row">
                            <span class="text-muted">Verzendkosten</span>
                            <span>${window.Core.formatMoney(cartRes.shipping_cents)}</span>
                        </div>
                        <div class="summary-row summary-border pb-4 mb-4" style="border-bottom:1px solid var(--border-light)">
                            <span class="text-muted">BTW</span>
                            <span>${window.Core.formatMoney(cartRes.tax_cents)}</span>
                        </div>
                        <div class="summary-row summary-total" style="font-size:1.25rem; font-weight:700;">
                            <span>Totaal</span>
                            <span class="text-primary">${window.Core.formatMoney(cartRes.total_cents)}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('checkout-form').onsubmit = async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px;margin-right:8px;display:inline-block;vertical-align:middle;"></span> Verwerken...';
            const fd = new FormData(e.target);
            try {
                const res = await window.Core.fetch('/checkout', {
                    method: 'POST',
                    body: {
                        address_id: parseInt(fd.get('address_id'), 10),
                        payment_method: fd.get('payment_method'),
                        notes: fd.get('notes') || '',
                        idempotency_key: currentIdempotencyKey
                    }
                });
                try {
                    await window.Core.refreshCart();
                } catch(e) {}
                window.Router.navigate(window.APP_BASE + 'account/orders/' + res.order.id);
            } catch(err) {
                alert(err.message);
                btn.disabled = false;
                btn.innerHTML = 'Bestelling Definitief Plaatsen';
            }
        };

    } catch(err) {
        root.innerHTML = `<div class="alert error">${esc(err.message)}</div>`;
    }
});


window.Router.add(/^login$/, async (match, root) => {
    root.innerHTML = `
        <div class="auth-wrapper">
            <div class="auth-card card">
                <div class="auth-header mb-4 text-center">
                    <img src="${window.APP_BASE}assets/logo.svg" alt="Logo" class="mb-3" style="height:32px">
                    <h2>Inloggen</h2>
                    <p class="text-muted">Welkom terug bij de testomgeving.</p>
                </div>
                <form id="login-form" class="auth-form">
                    <div class="form-group">
                        <label class="form-label">E-mailadres</label>
                        <input type="email" name="email" class="form-control" autocomplete="username" required autofocus>
                    </div>
                    <div class="form-group">
                        <label class="form-label d-flex justify-between">
                            Wachtwoord
                            <a href="${window.APP_BASE}forgot" class="auth-link text-sm">Vergeten?</a>
                        </label>
                        <input type="password" name="password" class="form-control" autocomplete="current-password" required>
                    </div>
                    <button type="submit" class="btn btn-primary btn-block btn-lg mt-4">Inloggen</button>
                </form>
                <div id="login-error" class="alert error mt-4" style="display:none;"></div>
                <div class="auth-footer mt-4 text-center text-sm text-muted">
                    Nog geen klant? <a href="${window.APP_BASE}register" class="font-weight-bold">Account aanvragen</a>
                </div>
            </div>
        </div>
    `;
    document.getElementById('login-form').onsubmit = async (e) => {
        e.preventDefault();
        try {
            const data = await window.Core.fetch('/auth/login', {
                method: 'POST',
                body: { email: e.target.email.value, password: e.target.password.value }
            });
            window.Core.user = data.user;
            window.Core.csrf = data.csrf;
            window.location.href = window.APP_BASE;
        } catch(err) {
            const errDiv = document.getElementById('login-error');
            errDiv.textContent = err.message;
            errDiv.style.display = 'block';
        }
    };
});

window.Router.add(/^register$/, async (match, root) => {
    root.innerHTML = `
        <div class="auth-wrapper">
            <div class="auth-card card" style="max-width:500px;">
                <div class="auth-header mb-4 text-center">
                    <img src="${window.APP_BASE}assets/logo.svg" alt="Logo" class="mb-3" style="height:32px">
                    <h2>Klant worden</h2>
                    <p class="text-muted">Vraag een account aan voor onze groothandel.</p>
                </div>
                <form id="register-form" class="auth-form">
                    <div class="grid-cols-2 gap-3">
                        <div class="form-group">
                            <label class="form-label">Naam</label>
                            <input type="text" name="name" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Bedrijfsnaam</label>
                            <input type="text" name="company" class="form-control" required>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">E-mailadres</label>
                        <input type="email" name="email" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Wachtwoord</label>
                        <input type="password" name="password" class="form-control" required minlength="8">
                        <small class="text-muted mt-1 d-block">Minimaal 8 tekens.</small>
                    </div>
                    <button type="submit" class="btn btn-primary btn-block btn-lg mt-4">Account Aanvragen</button>
                </form>
                <div id="reg-error" class="alert error mt-4" style="display:none;"></div>
                <div id="reg-success" class="alert success mt-4" style="display:none;">
                    <h4>Aanvraag ontvangen!</h4>
                    <p class="mt-1">Wij zullen uw bedrijfsgegevens verifiëren. Dit is een testomgeving, dus u kunt nu inloggen met uw gegevens.</p>
                    <a href="${window.APP_BASE}login" class="btn btn-outline btn-sm mt-3">Naar inloggen</a>
                </div>
                <div class="auth-footer mt-4 text-center text-sm text-muted">
                    Al geregistreerd? <a href="${window.APP_BASE}login" class="font-weight-bold">Log in</a>
                </div>
            </div>
        </div>
    `;
    document.getElementById('register-form').onsubmit = async (e) => {
        e.preventDefault();
        try {
            await window.Core.fetch('/auth/register', {
                method: 'POST',
                body: {
                    name: e.target.name.value,
                    company: e.target.company.value,
                    email: e.target.email.value,
                    password: e.target.password.value
                }
            });
            e.target.style.display = 'none';
            document.getElementById('reg-success').style.display = 'block';
            document.getElementById('reg-error').style.display = 'none';
            document.querySelector('.auth-footer').style.display = 'none';
        } catch(err) {
            const errDiv = document.getElementById('reg-error');
            errDiv.textContent = err.message;
            errDiv.style.display = 'block';
        }
    };
});

window.Router.add(/^forgot$/, async (match, root) => {
    root.innerHTML = `
        <div class="auth-wrapper">
            <div class="auth-card card">
                <div class="auth-header mb-4 text-center">
                    <h2>Wachtwoord vergeten</h2>
                    <p class="text-muted">Vul uw e-mailadres in om een reset link te ontvangen.</p>
                </div>
                <form id="forgot-form" class="auth-form">
                    <div class="form-group">
                        <label class="form-label">E-mailadres</label>
                        <input type="email" name="email" class="form-control" required autofocus>
                    </div>
                    <button type="submit" class="btn btn-primary btn-block btn-lg mt-4">Reset Link Aanvragen</button>
                </form>
                <div id="forgot-msg" class="alert mt-4" style="display:none;"></div>
                <div class="auth-footer mt-4 text-center text-sm">
                    <a href="${window.APP_BASE}login" class="text-muted">&larr; Terug naar inloggen</a>
                </div>
            </div>
        </div>
    `;
    document.getElementById('forgot-form').onsubmit = async (e) => {
        e.preventDefault();
        try {
            await window.Core.fetch('/auth/forgot', { method: 'POST', body: { email: e.target.email.value } });
            const msg = document.getElementById('forgot-msg');
            msg.className = 'alert success mt-4';
            msg.innerHTML = 'Als dit e-mailadres bekend is, is er een reset link naar de interne test-inbox gestuurd.';
            msg.style.display = 'block';
            e.target.style.display = 'none';
        } catch(err) {
            const msg = document.getElementById('forgot-msg');
            msg.className = 'alert error mt-4';
            msg.textContent = err.message;
            msg.style.display = 'block';
        }
    };
});

window.Router.add(/^reset$/, async (match, root, qs) => {
    const searchParams = new URLSearchParams(qs);
    const token = searchParams.get('token') || '';
    root.innerHTML = `
        <div class="auth-wrapper">
            <div class="auth-card card">
                <div class="auth-header mb-4 text-center">
                    <h2>Nieuw Wachtwoord</h2>
                    <p class="text-muted">Kies een nieuw, veilig wachtwoord.</p>
                </div>
                <form id="reset-form" class="auth-form">
                    <input type="hidden" name="token" value="${esc(token)}">
                    <div class="form-group">
                        <label class="form-label">Nieuw Wachtwoord</label>
                        <input type="password" name="password" class="form-control" required minlength="8" autofocus>
                    </div>
                    <button type="submit" class="btn btn-primary btn-block btn-lg mt-4">Opslaan & Inloggen</button>
                </form>
                <div id="reset-msg" class="alert error mt-4" style="display:none;"></div>
            </div>
        </div>
    `;
    document.getElementById('reset-form').onsubmit = async (e) => {
        e.preventDefault();
        try {
            await window.Core.fetch('/auth/reset', { 
                method: 'POST', 
                body: { token: e.target.token.value, password: e.target.password.value } 
            });
            window.Router.navigate(window.APP_BASE + 'login');
        } catch(err) {
            const msg = document.getElementById('reset-msg');
            msg.textContent = err.message;
            msg.style.display = 'block';
        }
    };
});
