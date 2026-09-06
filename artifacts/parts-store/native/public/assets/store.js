const esc = window.Core.escapeHtml;

const categoryGroups = [
    { title: "Onderdelen", keywords: ['screen', 'batter', 'charg', 'camera', 'hous', 'flex', 'audio', 'adhes'] },
    { title: "Gereedschap & Accessoires", keywords: ['tool', 'protect', 'accessor', 'other'] }
];

window.App.groupCategories = function(cats) {
    const parts = [];
    const supplies = [];
    const sorted = window.App.sortCategories(cats);
    sorted.forEach(c => {
        const s = (c.slug || c.name).toLowerCase();
        let isPart = false;
        for (let kw of categoryGroups[0].keywords) {
            if (s.includes(kw)) { isPart = true; break; }
        }
        if (isPart) parts.push(c);
        else supplies.push(c);
    });
    return { parts, supplies };
};

window.App.canOrderProduct = function(p) {
    return Boolean(window.Core.user) && window.Core.user.role !== 'staff' && p.price_cents !== null && p.stock >= p.minimum_quantity;
};

window.App.renderProductCard = function(p) {
    const isStaff = window.Core.user && window.Core.user.role === 'staff';
    const canBuy = window.App.canOrderProduct(p);
    
    let stockClass = p.stock > 10 ? 'stock-ok' : (p.stock > 0 ? 'stock-low' : 'stock-out');
    let stockText = p.stock > 0 ? `${p.stock} op voorraad` : 'Niet op voorraad';

    return `
        <div class="part-card">
            ${p.image_url ? `
                <button type="button" class="part-img-link part-photo-preview" data-photo-url="${esc(p.image_url)}" data-photo-name="${esc(p.name)}" aria-label="Foto van ${esc(p.name)} vergroten">
                    <img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy">
                </button>
            ` : `
                <div class="part-img-link part-no-photo" aria-label="Geen foto beschikbaar">
                    <div class="img-placeholder"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg></div>
                </div>
            `}
            <div class="part-main">
                <div class="part-meta">
                    <span class="part-sku" title="SKU">${esc(p.sku)}</span>
                    ${p.quality ? `<span class="part-quality">${esc(p.quality)}</span>` : ''}
                    ${p.part_type?.name ? `<span class="part-type-badge">${esc(p.part_type.name)}</span>` : ''}
                </div>
                <h3 class="part-name"><a href="${window.APP_BASE}products/${p.id}">${esc(p.name)}</a></h3>
                <div class="part-stock ${stockClass}">
                    <span class="status-dot"></span>${stockText}
                </div>
                ${p.stock > 0 && p.stock < p.minimum_quantity ? `<small class="text-muted">Minimale afname ${p.minimum_quantity}; onvoldoende voorraad</small>` : ''}
            </div>
            <div class="part-buy-area">
                <div class="part-price">
                    ${p.price_cents !== null ? window.Core.formatMoney(p.price_cents) : `<a href="${window.APP_BASE}login" class="login-for-price">Prijs na inloggen</a>`}
                </div>
                ${canBuy ? `
                <div class="part-action">
                    <input type="number" id="qty-${p.id}" value="${p.minimum_quantity}" min="${p.minimum_quantity}" max="${p.stock}" class="part-qty form-control" aria-label="Aantal">
                    <button type="button" class="btn btn-primary part-add-btn" onclick="window.App.addToCartWithQty(${p.id}, parseInt(this.parentElement.querySelector('input').value, 10))" aria-label="${esc(p.name)} toevoegen aan winkelwagen" title="Aan winkelwagen toevoegen">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    </button>
                </div>
                ` : (isStaff ? '<span class="text-muted small font-weight-bold">Beheer</span>' : '')}
            </div>
        </div>
    `;
};

window.App.toggleView = function(view) {
    try { localStorage.setItem('view_pref', view); } catch (_) {}
    const grid = document.querySelector('.product-container');
    if (grid) {
        grid.className = `product-container view-${view}`;
    }
    document.querySelectorAll('.view-toggle button').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.view-toggle button[data-view="${view}"]`);
    if (btn) btn.classList.add('active');
};


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
        <button type="button" class="gallery-thumb" data-gallery-index="${idx}" aria-label="Foto ${idx + 1} van ${allImages.length} tonen">
            <img src="${esc(img.url)}" alt="Miniatuur ${idx + 1} van ${esc(p.name)}">
        </button>
    `).join('');

    const modelsHtml = data.models && data.models.length ? `
        <div class="product-section mt-4 pt-4 border-top">
            <h4 class="section-heading mb-3">Compatibele Modellen</h4>
            <div class="model-tags">
                ${data.models.map(m => `<span class="model-tag">${esc(m.name)}</span>`).join('')}
            </div>
        </div>
    ` : '';
    
    const relatedHtml = data.related && data.related.length ? `
        <div class="section-title mt-5">
            <h2>Gerelateerde Producten</h2>
        </div>
        <div class="product-container view-list">
            ${data.related.map(rp => window.App.renderProductCard(rp)).join('')}
        </div>
    ` : '';

    const isStaff = window.Core.user && window.Core.user.role === 'staff';
    const canBuy = window.App.canOrderProduct(p);
    
    window.App.currentImageIndex = 0;

    root.innerHTML = `
        <div class="breadcrumb mb-4">
            <a href="${window.APP_BASE}catalog" class="btn btn-link btn-sm pl-0 text-muted">&larr; Terug naar assortiment</a>
        </div>
        
        <div class="product-detail-layout">
            <div class="product-gallery">
                ${allImages.length ? `
                    <button type="button" class="main-image-container part-photo-preview" data-photo-images="${esc(JSON.stringify(allImages))}" data-photo-name="${esc(p.name)}" aria-label="Foto van ${esc(p.name)} vergroten" title="Klik om te vergroten">
                        <img id="main-img" src="${esc(allImages[0].url)}" alt="${esc(p.name)}">
                        <div class="zoom-hint"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg></div>
                    </button>
                    ${allImages.length > 1 ? `<div class="gallery-thumbnails mt-3">${thumbnailsHtml}</div>` : ''}
                ` : `
                    <div class="main-image-container no-image">
                        <div class="img-placeholder"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg></div>
                    </div>
                `}
            </div>
            
            <div class="product-info">
                <div class="product-meta mb-3">
                    <span class="sku-large" title="SKU">${esc(p.sku)}</span>
                    ${p.quality ? `<span class="part-quality ml-3">${esc(p.quality)}</span>` : ''}
                    ${p.part_type?.name ? `<span class="part-type-badge ml-3">${esc(p.part_type.name)}</span>` : ''}
                </div>
                
                <h1 class="product-title-lg mb-2">${esc(p.name)}</h1>
                
                <div class="product-stock-status ${p.stock > 10 ? 'stock-ok' : (p.stock > 0 ? 'stock-low' : 'stock-out')} mb-4">
                    <span class="status-dot"></span>
                    ${p.stock > 10 ? 'Ruim op voorraad' : (p.stock > 0 ? `Laatste ${p.stock} stuks` : 'Niet op voorraad')}
                </div>
                
                ${p.stock > 0 && p.stock < p.minimum_quantity ? `<div class="alert warning mb-4">Minimale afname: ${p.minimum_quantity} stuks. Er zijn momenteel ${p.stock} beschikbaar; bestellen is daarom tijdelijk niet mogelijk.</div>` : ''}
                <div class="product-price-lg mb-4">
                    ${p.price_cents !== null ? window.Core.formatMoney(p.price_cents) : `<a href="${window.APP_BASE}login" class="login-for-price">Log in voor uw prijs</a>`}
                </div>
                
                ${canBuy ? `
                    <div class="purchase-box mb-4">
                        <div class="purchase-controls">
                            <input type="number" id="pd-qty" value="${p.minimum_quantity}" min="${p.minimum_quantity}" max="${p.stock}" class="form-control qty-input">
                            <button type="button" class="btn btn-primary btn-lg flex-1" onclick="window.App.addToCartWithQty(${p.id}, parseInt(document.getElementById('pd-qty').value, 10))">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mr-2"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
                                In Winkelwagen
                            </button>
                        </div>
                        ${p.minimum_quantity > 1 ? `<div class="qty-hint mt-2 text-muted small">Minimale afname: ${p.minimum_quantity} stuks</div>` : ''}
                    </div>
                ` : (isStaff ? '<div class="alert warning mb-4">Als beheerder kunt u geen bestellingen plaatsen.</div>' : (!window.Core.user ? '<div class="alert warning mb-4"><a href="'+window.APP_BASE+'login">Log in</a> om dit product te bestellen.</div>' : ''))}
                
                <div class="product-description text-muted">
                    ${esc(p.description).replace(/\n/g, '<br>')}
                </div>
                
                ${modelsHtml}
            </div>
        </div>
        
        ${relatedHtml}
    `;
});

document.addEventListener('click', (event) => {
    const thumbnail = event.target.closest('.gallery-thumb[data-gallery-index]');
    if (thumbnail) {
        const gallery = thumbnail.closest('.product-gallery');
        const opener = gallery?.querySelector('.part-photo-preview[data-photo-images]');
        const mainImage = gallery?.querySelector('#main-img');
        if (!opener || !mainImage) return;
        try {
            const images = JSON.parse(opener.dataset.photoImages);
            const index = Number.parseInt(thumbnail.dataset.galleryIndex, 10);
            if (!Number.isInteger(index) || !images[index]?.url) return;
            mainImage.src = images[index].url;
            opener.dataset.photoIndex = String(index);
            window.App.currentImageIndex = index;
        } catch (_) {
            return;
        }
        return;
    }

    const opener = event.target.closest('.part-photo-preview');
    if (!opener) return;

    let images = [];
    if (opener.dataset.photoImages) {
        try {
            images = JSON.parse(opener.dataset.photoImages);
        } catch (_) {
            return;
        }
    } else if (opener.dataset.photoUrl) {
        images = [{url: opener.dataset.photoUrl}];
    }

    const initialIndex = Number.parseInt(opener.dataset.photoIndex || '0', 10);
    window.UI.showGallery(images, Number.isInteger(initialIndex) ? initialIndex : 0, {
        title: opener.dataset.photoName || '',
        opener
    });
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
                ${item.image_url ? `<img src="${esc(item.image_url)}" alt="">` : `<div class="img-placeholder"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg></div>`}
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
                    <div class="address-header mb-2">
                        <strong>${esc(a.label || 'Adres')}</strong>
                        <svg class="check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </div>
                    <div class="text-sm">
                        ${a.company ? `<div>${esc(a.company)}</div>` : ''}
                        <div>${esc(a.name)}</div>
                        <div>${esc(a.line1)}</div>
                        ${a.line2 ? `<div>${esc(a.line2)}</div>` : ''}
                        <div>${esc(a.postal_code)} ${esc(a.city)}</div>
                        <div class="text-muted mt-1">${esc(a.country)}</div>
                    </div>
                </label>
            `).join('');
        }

        const idem = Math.random().toString(36).substring(2);

        root.innerHTML = `
            <div class="page-header mb-4">
                <h1>Afrekenen</h1>
            </div>
            
            <div class="commerce-layout">
                <div class="checkout-main">
                    <form id="checkout-form" onsubmit="event.preventDefault(); window.App.submitCheckout(this);">
                        <input type="hidden" name="idempotency_key" value="${idem}">
                        
                        <div class="card p-0 mb-4">
                            <div class="checkout-step">
                                <div class="step-header">
                                    <div class="step-number">1</div>
                                    <h3>Verzendadres</h3>
                                </div>
                                <div class="address-grid">
                                    ${addrHtml}
                                </div>
                                <div class="mt-3">
                                    <a href="${window.APP_BASE}account/addresses" class="btn btn-outline btn-sm">Nieuw adres toevoegen</a>
                                </div>
                            </div>
                        </div>

                        <div class="card p-0 mb-4">
                            <div class="checkout-step">
                                <div class="step-header">
                                    <div class="step-number">2</div>
                                    <h3>Betaalmethode</h3>
                                </div>
                                <div class="payment-grid">
                                    <label class="payment-card selected">
                                        <input type="radio" name="payment_method" value="test_invoice" checked onchange="document.querySelectorAll('.payment-card').forEach(c=>c.classList.remove('selected')); this.closest('.payment-card').classList.add('selected');">
                                        <div class="address-header">
                                            <strong>Op Rekening (Test)</strong>
                                            <svg class="check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                        </div>
                                        <div class="text-muted text-sm mt-1">Betaal achteraf via factuur (alleen voor goedgekeurde accounts).</div>
                                    </label>
                                    <label class="payment-card">
                                        <input type="radio" name="payment_method" value="test_card" onchange="document.querySelectorAll('.payment-card').forEach(c=>c.classList.remove('selected')); this.closest('.payment-card').classList.add('selected');">
                                        <div class="address-header">
                                            <strong>Creditcard (Test)</strong>
                                            <svg class="check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                        </div>
                                        <div class="text-muted text-sm mt-1">Direct betalen via veilige testomgeving.</div>
                                    </label>
                                </div>
                            </div>
                        </div>

                        <div class="card p-0 mb-4">
                            <div class="checkout-step">
                                <div class="step-header">
                                    <div class="step-number">3</div>
                                    <h3>Opmerkingen</h3>
                                </div>
                                <div class="form-group mb-0">
                                    <textarea name="notes" class="form-control" rows="3" placeholder="Referentie of opmerking voor deze bestelling..."></textarea>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>

                <div class="checkout-sidebar">
                    <div class="summary-card card sticky-card">
                        <h3 class="mb-4">Besteloverzicht</h3>
                        <div class="summary-items mb-4 pb-4" style="border-bottom:1px solid var(--border-light)">
                            ${cartRes.items.map(item => `
                                <div class="summary-row" style="align-items:flex-start">
                                    <span class="text-muted pr-2">${item.quantity}x ${esc(item.name)}</span>
                                    <span>${window.Core.formatMoney(item.total_cents)}</span>
                                </div>
                            `).join('')}
                        </div>
                        <div class="summary-row">
                            <span class="text-muted">Subtotaal</span>
                            <span class="font-weight-bold">${window.Core.formatMoney(cartRes.subtotal_cents)}</span>
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
                        <button form="checkout-form" type="submit" class="btn btn-primary btn-block btn-lg mt-4" ${addresses.length===0?'disabled':''}>Bestelling Plaatsen &rarr;</button>
                    </div>
                </div>
            </div>
        `;

        window.App.submitCheckout = async (form) => {
            const fd = new FormData(form);
            const data = Object.fromEntries(fd.entries());
            if (!data.address_id) return alert('Selecteer een verzendadres');
            
            const btn = form.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.textContent = 'Bezig met plaatsen...';
            
            try {
                const res = await window.Core.fetch('/checkout', { method: 'POST', body: data });
                await window.Core.refreshCart();
                window.Router.navigate(window.APP_BASE + 'account/orders?success=' + res.order.id);
            } catch(e) {
                alert(e.message);
                btn.disabled = false;
                btn.textContent = 'Bestelling Plaatsen →';
            }
        };

    } catch(e) {
        root.innerHTML = `<div class="alert error">${esc(e.message)}</div>`;
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
            window.location.href = window.APP_BASE + (data.user?.role === 'staff' ? 'admin' : '');
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
