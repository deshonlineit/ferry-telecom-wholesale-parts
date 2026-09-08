const esc = window.Core.escapeHtml;
const t = (key, values) => window.I18n.t(key, values);

const categoryGroups = [
    { title: "Parts", keywords: ['screen', 'batter', 'charg', 'camera', 'hous', 'flex', 'audio', 'adhes', 'other'] },
    { title: "Tools & Accessories", keywords: ['tool', 'protect', 'accessor'] }
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
    return window.B2BOrdering.canOrder() && p.price_cents !== null && p.stock >= p.minimum_quantity;
};

window.App.thumbnailUrl = function(image) {
    if (image?.variants) {
        return image.variants['320'] || image.variants[320] || image.url;
    }
    const url = image?.url || '';
    return url.includes('-1280w.webp') ? url.replace('-1280w.webp', '-320w.webp') : url;
};

window.App.renderProductCard = function(p) {
    const isStaff = window.Core.user && window.Core.user.role === 'staff';
    const canBuy = window.App.canOrderProduct(p);
    
    let stockClass = p.stock > 0 ? 'stock-ok' : 'stock-out';
    let stockText = p.stock > 0 ? `${window.I18n.number(p.stock)} ${window.I18n.t('inStock').toLocaleLowerCase()}` : window.I18n.t('outOfStock');

    let srcSetAttr = '';
    if (p.image_url && p.image_url.includes('-1280w.webp')) {
        const base = p.image_url.replace('-1280w.webp', '');
        srcSetAttr = `srcset="${base}-320w.webp 320w, ${base}-640w.webp 640w, ${base}-1280w.webp 1280w" sizes="(max-width: 768px) 150px, 300px"`;
    }

    return `
        <div class="part-card">
            ${p.image_url ? `
                <button type="button" class="part-img-link part-photo-preview" data-photo-url="${esc(p.image_url)}" data-photo-name="${esc(p.name)}" aria-label="${esc(t('enlargePhoto', {name: p.name}))}">
                    <img src="${esc(window.App.thumbnailUrl({url: p.image_url}))}" ${srcSetAttr} alt="${esc(p.name)}" loading="lazy" decoding="async">
                </button>
            ` : `
                <div class="part-img-link part-no-photo" aria-label="${t('noPhoto')}">
                    <div class="img-placeholder"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg></div>
                </div>
            `}
            <div class="part-main">
                <div class="part-meta">
                    ${p.quality ? `<span class="part-quality">${esc(p.quality)}</span>` : ''}
                    ${p.part_type?.name ? `<span class="part-type-badge">${esc(p.part_type.name)}</span>` : ''}
                </div>
                <h3 class="part-name"><a href="${window.APP_BASE}products/${p.id}">${esc(p.name)}</a></h3>
                <div class="part-stock ${stockClass}">
                    <span class="status-dot"></span>
                    ${stockText} <span class="part-sku" title="${t('sku')}">· ${esc(p.sku)}</span>
                </div>
                ${p.stock > 0 && p.stock < p.minimum_quantity ? `<small class="text-danger mt-1 d-block" style="color: #ff3b30; font-weight: 500;">${t('minimumQuantity', {count: window.I18n.number(p.minimum_quantity)})}</small>` : ''}
            </div>
            <div class="part-buy-area">
                <div class="part-price">
                    ${p.price_cents !== null ? window.Core.formatMoney(p.price_cents) : (window.Core.user ? t('unavailable') : `<a href="${window.APP_BASE}login" class="login-for-price">${t('signInPrices')}</a>`)}
                </div>
                ${canBuy ? `
                <div class="part-action">
                    <input type="number" id="qty-${p.id}" value="${p.minimum_quantity}" min="${p.minimum_quantity}" max="${p.stock}" class="part-qty form-control" aria-label="${t('quantity')}">
                    <button type="button" class="btn btn-primary part-add-btn" onclick="window.App.addToCartWithQty(${p.id}, Number(this.parentElement.querySelector('input').value), this)" aria-label="${t('add')}" title="${t('addToCart')}">
                        ${window.I18n.t('add')}
                    </button>
                </div>
                ` : (isStaff ? `<span class="text-muted small font-weight-bold">${t('manage')}</span>` : '')}
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
    
    const responseImages = Array.isArray(data.images) ? data.images : [];
    const coverImage = responseImages.find(img => img.url === p.image_url);
    const allImages = p.image_url ? [coverImage || {url: p.image_url}] : [];
    if (responseImages.length) {
        responseImages.forEach(img => {
            if (!allImages.find(i => i.url === img.url)) {
                allImages.push(img);
            }
        });
    }

    const thumbnailsHtml = allImages.map((img, idx) => `
        <button type="button" class="gallery-thumb" data-gallery-index="${idx}" aria-label="${esc(t('showPhoto', {current: idx + 1, total: allImages.length}))}">
            <img src="${esc(window.App.thumbnailUrl(img))}" alt="${esc(t('thumbnailPhoto', {current: idx + 1, name: p.name}))}" loading="lazy">
        </button>
    `).join('');

    const modelsHtml = data.models && data.models.length ? `
        <div class="product-section mt-4 pt-4 border-top">
            <h4 class="section-heading mb-3">${t('compatibleModels')}</h4>
            <div class="model-tags">
                ${data.models.map(m => `<span class="model-tag">${esc(m.name)}</span>`).join('')}
            </div>
        </div>
    ` : '';
    
    const relatedHtml = data.related && data.related.length ? `
        <div class="section-title mt-5">
            <h2>${t('relatedProducts')}</h2>
        </div>
        ${window.App.renderProductTable(data.related)}
    ` : '';

    const isStaff = window.Core.user && window.Core.user.role === 'staff';
    const canBuy = window.App.canOrderProduct(p);
    
    window.App.currentImageIndex = 0;

    root.innerHTML = `
        <div class="breadcrumb mb-4">
            <a href="${window.APP_BASE}catalog" class="btn-link" style="color: var(--apple-muted); font-size: 0.9375rem; font-weight: 500;">&larr; ${t('catalogue')}</a>
        </div>
        
        <div class="product-detail-layout">
            <div class="product-gallery">
                ${allImages.length ? `
                    <button type="button" class="main-image-container part-photo-preview" data-photo-images="${esc(JSON.stringify(allImages))}" data-photo-name="${esc(p.name)}" aria-label="${esc(t('enlargePhoto', {name: p.name}))}" title="${t('clickToEnlarge')}" style="position: relative;">
                        <img id="main-img" src="${esc(allImages[0].url)}" alt="${esc(p.name)}" style="max-width: 100%; max-height: 100%; object-fit: contain; filter: drop-shadow(0 20px 40px rgba(0,0,0,0.05)); mix-blend-mode: multiply;">
                        <div class="zoom-hint" style="position: absolute; bottom: 1rem; right: 1rem; background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); padding: 0.5rem; border-radius: 50%; color: #1d1d1f;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg></div>
                    </button>
                    ${allImages.length > 1 ? `<div class="gallery-thumbnails mt-3">${thumbnailsHtml}</div>` : ''}
                ` : `
                    <div class="main-image-container no-image">
                        <div class="img-placeholder"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg></div>
                    </div>
                `}
            </div>
            
            <div class="product-info">
                <div class="product-meta mb-3" style="display: flex; gap: 0.5rem; align-items: center;">
                    ${p.quality ? `<span class="part-quality">${esc(p.quality)}</span>` : ''}
                    ${p.part_type?.name ? `<span class="part-type-badge">${esc(p.part_type.name)}</span>` : ''}
                    <span class="part-sku" title="${t('sku')}" style="color: var(--apple-muted); font-size: 0.875rem; font-weight: 500;">· ${esc(p.sku)}</span>
                </div>
                
                <h1 class="product-title-lg mb-2">${esc(p.name)}</h1>
                
                <div class="product-stock-status ${p.stock > 0 ? 'stock-ok' : 'stock-out'} mb-4">
                    <span class="status-dot"></span>
                    ${p.stock > 0 ? t('stockCount', {count: window.I18n.number(p.stock)}) : t('outOfStock')}
                </div>
                
                ${p.stock > 0 && p.stock < p.minimum_quantity ? `<div class="alert warning mb-4">${t('minimumUnavailable', {minimum: window.I18n.number(p.minimum_quantity), stock: window.I18n.number(p.stock)})}</div>` : ''}
                <div class="product-price-lg mb-4">
                    ${p.price_cents !== null ? window.Core.formatMoney(p.price_cents) : (window.Core.user ? t('unavailable') : `<a href="${window.APP_BASE}login" class="login-for-price">${t('signInPrices')}</a>`)}
                </div>
                
                ${canBuy ? `
                    <div class="purchase-box mb-4">
                        <div class="purchase-controls">
                            <input type="number" id="pd-qty" value="${p.minimum_quantity}" min="${p.minimum_quantity}" max="${p.stock}" class="form-control qty-input" style="width: 100px; text-align: center;">
                            <button type="button" class="btn btn-primary flex-1" style="font-weight: 600;" onclick="window.App.addToCartWithQty(${p.id}, Number(document.getElementById('pd-qty').value), this)">
                                ${t('addToCart')}
                            </button>
                        </div>
                        ${p.minimum_quantity > 1 ? `<div class="qty-hint mt-3 text-muted small" style="font-weight: 500;">${t('minimumQuantityUnits', {count: window.I18n.number(p.minimum_quantity)})}</div>` : ''}
                    </div>
                ` : (isStaff ? `<div class="alert warning mb-4">${t('staffCannotOrder')}</div>` : (!window.Core.user ? `<div class="alert warning mb-4"><a href="${window.APP_BASE}login">${t('signIn')}</a> ${t('signInToOrder')}</div>` : ''))}
                
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
        root.innerHTML = `<div class="container mt-4"><div class="alert warning">${t('must')} <a href="${window.APP_BASE}login">${t('signIn').toLocaleLowerCase()}</a> ${t('toViewCart')}</div></div>`;
        return;
    }
    await window.Core.refreshCart();
    const cart = window.Core.cart;
    const cartCurrency = cart.currency || window.Core.currency;

    if (!cart.items || cart.items.length === 0) {
        root.innerHTML = `
            <div class="page-header mb-4"><h1>${t('cart')}</h1></div>
            <div class="empty-state card">
                <div class="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg></div>
                <h3>${t('cartEmpty')}</h3>
                <p class="text-muted mt-2">${t('addProductsCatalogue')}</p>
                <a href="${window.APP_BASE}catalog" class="btn btn-primary mt-4">${t('viewCatalogue')}</a>
            </div>
        `;
        return;
    }

    const money = (cents) => window.Core.formatMoney(cents, cartCurrency);
    const itemsHtml = cart.items.map(item => {
        // The API refuses quantities below the product minimum, so the stepper stops there.
        const minQty = Math.max(1, Number(item.minimum_quantity) || 1);
        return `
        <article class="line-item">
            <a href="${window.APP_BASE}products/${item.product_id}" class="line-item-thumb" tabindex="-1" aria-hidden="true">
                ${item.image_url ? `<img src="${esc(item.image_url)}" alt="">` : `<div class="img-placeholder"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg></div>`}
            </a>
            <div class="line-item-body">
                <a href="${window.APP_BASE}products/${item.product_id}" class="line-item-name">${esc(item.name)}</a>
                <div class="line-item-tags">
                    <span class="line-item-sku">${esc(item.sku)}</span>
                    ${minQty > 1 ? `<span class="line-item-min">${t('minCount', {count: window.I18n.number(minQty)})}</span>` : ''}
                    ${item.stock >= item.quantity ? `<span class="line-item-stock${item.stock <= 5 ? ' low' : ''}">${t('stockCount', {count: window.I18n.number(item.stock)})}</span>` : ''}
                </div>
            </div>
            <div class="line-item-unit">${money(item.price_cents)}</div>
            <div class="line-item-qty">
                <div class="stepper">
                    <button type="button" class="stepper-btn" aria-label="${t('oneFewer')}" ${item.quantity <= minQty ? 'disabled' : ''} onclick="window.App.updateCartItem(${item.product_id}, ${Math.max(minQty, item.quantity - 1)})">&minus;</button>
                    <input type="number" value="${item.quantity}" min="${minQty}" max="${item.stock}" class="stepper-input" tabindex="0" aria-label="${esc(t('quantityFor', {name: item.name}))}" onchange="window.App.updateCartItem(${item.product_id}, this.value)">
                    <button type="button" class="stepper-btn" aria-label="${t('oneMore')}" ${item.quantity >= item.stock ? 'disabled' : ''} onclick="window.App.updateCartItem(${item.product_id}, ${item.quantity + 1})">+</button>
                </div>
            </div>
            <div class="line-item-total">${money(item.total_cents)}</div>
            <button type="button" class="line-item-remove" aria-label="${esc(t('removeItem', {name: item.name}))}" onclick="window.App.updateCartItem(${item.product_id}, 0)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"></path></svg>
            </button>
            ${item.stock < item.quantity ? `<div class="line-item-alert">${t('stockChanged', {count: window.I18n.number(item.stock)})}</div>` : ''}
        </article>
    `;
    }).join('');

    const noteIcon = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4M12 8h.01"></path></svg>';
    const notice = window.Core.currencyNotice(cart);

    root.innerHTML = `
        <section class="order-flow">
            <nav class="order-progress" aria-label="${esc(t('checkoutProgress'))}">
                <ol>
                    <li class="active" aria-current="step"><span>1</span><strong>${t('cartStep')}</strong></li>
                    <li><span>2</span><strong>${t('addressShippingStep')}</strong></li>
                    <li><span>3</span><strong>${t('paymentStep')}</strong></li>
                </ol>
            </nav>
            <header class="order-flow-head">
                <div>
                    <h1>${t('cart')}</h1>
                    <p class="order-flow-intro">${t('cartReview')}</p>
                </div>
                <p class="order-flow-sub">${t('cartContext', {count: window.I18n.number(cart.items.length), country: esc(cart.country || window.Core.country), currency: esc(cartCurrency)})}</p>
            </header>
            <div class="order-grid">
                <div class="order-main">
                    <div class="line-items">
                        <div class="line-items-head">
                            <span></span>
                            <span>${t('product')}</span>
                            <span class="num">${t('unitPriceExVat')}</span>
                            <span>${t('quantity')}</span>
                            <span class="num">${t('lineTotalExVat')}</span>
                            <span></span>
                        </div>
                        ${itemsHtml}
                    </div>
                    <div class="order-main-foot">
                        <a href="${window.APP_BASE}catalog" class="order-link">&larr; ${t('continueShopping')}</a>
                        <button type="button" class="order-link danger" onclick="window.App.clearCart()">${t('emptyCart')}</button>
                    </div>
                </div>
                <aside class="order-rail">
                    <div class="summary-panel">
                        <h2 class="summary-title">${t('orderSummary')}</h2>
                        <dl class="summary-lines">
                            <div class="summary-line"><dt>${t('subtotalExVat')}</dt><dd>${money(cart.subtotal_cents)}</dd></div>
                            <div class="summary-line"><dt>${t('shippingExVat')}</dt><dd>${money(cart.shipping_cents)}</dd></div>
                            <div class="summary-line"><dt>${t('vat')}</dt><dd>${money(cart.tax_cents)}</dd></div>
                        </dl>
                        <div class="summary-rule"></div>
                        <div class="summary-total"><span>${t('totalInclVat')}</span><strong>${money(cart.total_cents)}</strong></div>
                        <a href="${window.APP_BASE}checkout" class="summary-cta">${t('checkout')} &rarr;</a>
                        <p class="currency-context-note ${notice ? 'error' : ''}">${esc(notice || t('deliveryBilled', {country: cart.country || window.Core.country, currency: cartCurrency}))}</p>
                        <ul class="rail-notes">
                            <li>${noteIcon}<span>${t('shippingVatNote')}</span></li>
                            <li>${noteIcon}<span>${t('testEnvironmentNote')}</span></li>
                        </ul>
                    </div>
                </aside>
            </div>
        </section>
    `;

    window.App.updateCartItem = async (productId, qty) => {
        try {
            await window.Core.fetch('/cart', { method: 'POST', body: { product_id: productId, quantity: parseInt(qty,10) } });
            window.Router.route();
        } catch(e) { alert(e.message); }
    };
    
    window.App.clearCart = async () => {
        if(confirm(t('emptyCartConfirm'))) {
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
            addrHtml = `<div class="alert warning">${t('noSavedAddresses')} <a href="${window.APP_BASE}account/addresses">${t('addAddressFirst')}</a>.</div>`;
        } else {
            // One address is preselected: the default when there is one, otherwise the first.
            // The radio group and the .selected outline must agree on exactly that card.
            const preselected = addresses.find(a => a.is_default) || addresses[0];
            addrHtml = addresses.map((a) => {
                const compact = addresses.length === 1;
                const addressText = [
                    a.company || a.name,
                    a.company ? a.name : '',
                    a.line1,
                    a.line2 || '',
                    `${a.postal_code} ${a.city}`,
                    a.country
                ].filter(Boolean).map(esc).join(' · ');
                return `
                <label class="address-card ${compact ? 'address-card-compact' : ''} ${a.id === preselected.id ? 'selected' : ''}">
                    <input type="radio" name="address_choice" value="${a.id}" data-country="${esc(a.country)}" ${a.id === preselected.id ? 'checked' : ''}>
                    <div class="address-header ${compact ? '' : 'mb-2'}">
                        <strong>${esc(a.label || t('address'))}</strong>
                        <svg class="check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </div>
                    ${compact ? `<div class="compact-address-line">${addressText}</div>` : `<div class="text-sm">
                        ${a.company ? `<div>${esc(a.company)}</div>` : ''}
                        <div>${esc(a.name)}</div>
                        <div>${esc(a.line1)}</div>
                        ${a.line2 ? `<div>${esc(a.line2)}</div>` : ''}
                        <div>${esc(a.postal_code)} ${esc(a.city)}</div>
                        <div class="text-muted mt-1">${esc(a.country)}</div>
                    </div>`}
                </label>
            `}).join('');
        }

        const idem = Math.random().toString(36).substring(2);

        const checkoutCurrency = cartRes.currency || window.Core.currency;
        const checkoutMoney = (cents) => window.Core.formatMoney(cents, checkoutCurrency);
        const railIcon = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4M12 8h.01"></path></svg>';

        root.innerHTML = `
            <section class="order-flow">
                <header class="order-flow-head">
                    <h1>${t('checkout')}</h1>
                    <p class="order-flow-sub">${t('checkoutIntro')}</p>
                </header>

                <div class="order-grid">
                    <div class="order-main">
                        <form id="checkout-form" class="checkout-steps" onsubmit="event.preventDefault(); window.App.submitCheckout(this);">
                            <input type="hidden" name="idempotency_key" value="${idem}">
                            <input type="hidden" name="quote_token" value="">

                            <div class="checkout-step">
                                <div class="step-header">
                                    <div class="step-number">1</div>
                                    <h3>${t('deliveryAddress')}</h3>
                                </div>
                                <div class="address-grid ${addresses.length === 1 ? 'address-grid-single' : ''}">
                                    ${addrHtml}
                                    <label class="address-card address-card-new ${addresses.length === 1 ? 'address-card-new-inline' : ''} ${addresses.length === 0 ? 'selected' : ''}">
                                        <input type="radio" name="address_choice" value="new" ${addresses.length === 0 ? 'checked' : ''}>
                                        <div class="address-header">
                                            <strong>${t('differentDeliveryAddress')}</strong>
                                            <svg class="check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                        </div>
                                        ${addresses.length === 1 ? '' : `<div class="text-muted text-sm mt-1">${t('oneOffAddress')}</div>`}
                                    </label>
                                </div>
                                <div id="checkout-address-fields" class="checkout-address-fields mt-3" ${addresses.length ? 'hidden' : ''}>
                                    <div class="form-group"><label>${t('addressLabel')}</label><input class="form-control" name="address_label" placeholder="${t('addressLabelExample')}"></div>
                                    <div class="grid-cols-2">
                                        <div class="form-group"><label>${t('name')}</label><input class="form-control" name="address_name"></div>
                                        <div class="form-group"><label>${t('company')}</label><input class="form-control" name="address_company"></div>
                                    </div>
                                    <div class="form-group"><label>${t('streetBuilding')}</label><input class="form-control" name="address_line1"></div>
                                    <div class="form-group"><label>${t('addressLine2')}</label><input class="form-control" name="address_line2"></div>
                                    <div class="grid-cols-2">
                                        <div class="form-group"><label>${t('postcode')}</label><input class="form-control" name="address_postal_code"></div>
                                        <div class="form-group"><label>${t('townCity')}</label><input class="form-control" name="address_city"></div>
                                    </div>
                                    <div class="form-group mb-0"><label>${t('deliveryCountry')}</label><select class="form-control" name="address_country">${window.BuyerCurrency.options(window.Core.country)}</select></div>
                                </div>
                                <div class="mt-3">
                                    <a href="${window.APP_BASE}account/addresses" class="order-link">${t('manageSavedAddresses')}</a>
                                </div>
                            </div>

                            <div class="checkout-step">
                                <div class="step-header">
                                    <div class="step-number">2</div>
                                    <h3>${t('shippingMethod')}</h3>
                                </div>
                                <div id="checkout-shipping-methods" class="payment-grid"></div>
                            </div>

                            <div class="checkout-step">
                                <div class="step-header">
                                    <div class="step-number">3</div>
                                    <h3>${t('paymentMethod')}</h3>
                                </div>
                                <div id="checkout-payment-methods" class="payment-grid"></div>
                            </div>

                            <div class="checkout-step">
                                <div class="step-header">
                                    <div class="step-number">4</div>
                                    <h3>${t('notes')} <span class="step-optional">${t('optional')}</span></h3>
                                </div>
                                <div class="form-group mb-0">
                                    <textarea name="notes" class="form-control" rows="3" placeholder="${t('orderNotePlaceholder')}"></textarea>
                                </div>
                            </div>
                        </form>
                    </div>

                    <aside class="order-rail">
                        <div class="summary-panel">
                            <h2 class="summary-title">${t('orderSummary')}</h2>
                            <div id="checkout-quote-status" class="summary-status">${t('calculatingQuote')}</div>
                            <div id="checkout-summary">
                                <div class="summary-items">
                                    ${cartRes.items.map(item => `
                                        <div class="summary-item">
                                            <span class="summary-item-name"><span class="summary-item-qty">${item.quantity}&times;</span>${esc(item.name)}</span>
                                            <span class="summary-item-value">${checkoutMoney(item.total_cents)}</span>
                                        </div>
                                    `).join('')}
                                </div>
                                <dl class="summary-lines">
                                    <div class="summary-line"><dt>${t('subtotal')}</dt><dd>${checkoutMoney(cartRes.subtotal_cents)}</dd></div>
                                    <div class="summary-line"><dt>${t('shipping')}</dt>${cartRes.shipping_cents === 0 ? `<dd class="is-free">${t('free')}</dd>` : `<dd>${checkoutMoney(cartRes.shipping_cents)}</dd>`}</div>
                                    <div class="summary-line"><dt>${t('vat')}</dt><dd>${checkoutMoney(cartRes.tax_cents)}</dd></div>
                                </dl>
                                <div class="summary-rule"></div>
                                <div class="summary-total"><span>${t('total')}</span><strong>${checkoutMoney(cartRes.total_cents)}</strong></div>
                                <p class="currency-context-note">${t('deliveryBilled', {country: esc(cartRes.country || window.Core.country), currency: esc(checkoutCurrency)})}</p>
                            </div>
                            <button id="checkout-submit" form="checkout-form" type="submit" class="summary-cta" disabled>${t('placeOrder')} &rarr;</button>
                        </div>
                        <ul class="rail-notes">
                            <li>${railIcon}<span>${t('requoteNote')}</span></li>
                            <li>${railIcon}<span>${t('testEnvironmentNote')}</span></li>
                        </ul>
                    </aside>
                </div>
            </section>
        `;

        const form = root.querySelector('#checkout-form');
        const submitButton = root.querySelector('#checkout-submit');
        const quoteStatus = root.querySelector('#checkout-quote-status');
        const addressFields = root.querySelector('#checkout-address-fields');
        const quoteGate = window.BuyerCurrency.createQuoteGate(submitButton, form.quote_token);
        let quoteTimer = null;

        const selectedDeliveryCountry = () => {
            const selected = form.querySelector('[name="address_choice"]:checked');
            return selected?.value === 'new'
                ? form.address_country.value
                : selected?.dataset.country || window.Core.country;
        };
        // The quote is the authority for payment availability.  Do not infer an
        // entitlement from country or a stale cart: grants may change at any time.
        const renderPaymentMethods = (methods = []) => {
            const container = root.querySelector('#checkout-payment-methods');
            if (!container) return;
            const byCode = new Map((methods || []).map(method => [method.code || method.method, method]));
            const codes = ['stripe', 'pay_later', 'swiss_qr_invoice'];
            const current = container.querySelector('[name="payment_method"]:checked')?.value;
            const choices = codes.map(code => {
                const response = byCode.get(code);
                if (response?.hidden) return '';
                const enabled = Boolean(response && response.enabled !== false && response.available !== false);
                const label = t({stripe: 'stripe', pay_later: 'payLater', swiss_qr_invoice: 'swissQrInvoice'}[code]);
                const help = response?.reason || response?.message ||
                    (enabled ? t({stripe: 'stripeHelp', pay_later: 'payLaterHelp', swiss_qr_invoice: 'swissQrInvoiceHelp'}[code]) : t('paymentUnavailable'));
                return `<label class="payment-card ${enabled ? '' : 'disabled'}" data-payment-code="${code}">
                    <input type="radio" name="payment_method" value="${code}" ${enabled ? '' : 'disabled'} aria-describedby="payment-help-${code}">
                    <div class="address-header"><strong>${label}</strong>
                    ${enabled ? '<svg class="check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}</div>
                    <div id="payment-help-${code}" class="text-muted text-sm mt-1">${esc(help)}</div>
                </label>`;
            }).join('');
            container.innerHTML = choices || `<div class="alert warning">${t('noPaymentMethods')}</div>`;
            const inputs = [...container.querySelectorAll('[name="payment_method"]:not(:disabled)')];
            const selected = inputs.find(input => input.value === current) || inputs[0];
            if (selected) {
                selected.checked = true;
                selected.closest('.payment-card')?.classList.add('selected');
            }
            inputs.forEach(input => input.addEventListener('change', () => {
                container.querySelectorAll('.payment-card').forEach(card => card.classList.remove('selected'));
                input.closest('.payment-card')?.classList.add('selected');
            }));
        };
        const shippingLabelKey = code => ({
            swiss_post_priority: 'swissPostPriority',
            swiss_post_saturday: 'swissPostSaturday',
            pickup: 'pickup',
            ups_standard: 'upsStandard',
            ups_express: 'upsExpress'
        })[code] || 'shipping';
        const shippingHelpKey = code => ({
            swiss_post_priority: 'swissPostPriorityHelp',
            swiss_post_saturday: 'swissPostSaturdayHelp',
            pickup: 'pickupHelp',
            ups_standard: 'upsStandardHelp',
            ups_express: 'upsExpressHelp'
        })[code] || 'shippingVatNote';
        const renderShippingMethods = (methods = [], selectedCode = '') => {
            const container = root.querySelector('#checkout-shipping-methods');
            if (!container) return;
            container.innerHTML = methods.map((method, index) => {
                const selected = method.code === selectedCode || (!selectedCode && index === 0);
                return `<label class="payment-card ${selected ? 'selected' : ''}">
                    <input type="radio" name="shipping_method" value="${esc(method.code)}" ${selected ? 'checked' : ''}>
                    <div class="address-header">
                        <strong>${t(shippingLabelKey(method.code))}</strong>
                        <span>${window.Core.formatMoney(method.amount_cents, method.currency)}</span>
                    </div>
                    <div class="text-muted text-sm mt-1">${t(shippingHelpKey(method.code))}</div>
                </label>`;
            }).join('');
            container.querySelectorAll('[name="shipping_method"]').forEach(input => input.addEventListener('change', () => {
                container.querySelectorAll('.payment-card').forEach(card => card.classList.remove('selected'));
                input.closest('.payment-card')?.classList.add('selected');
                scheduleQuote();
            }));
        };

        const checkoutAddressPayload = () => {
            const choice = form.querySelector('[name="address_choice"]:checked')?.value;
            if (!choice) return null;
            if (choice !== 'new') return {address_id: Number.parseInt(choice, 10)};
            const address = {
                label: form.address_label.value.trim(),
                name: form.address_name.value.trim(),
                company: form.address_company.value.trim(),
                line1: form.address_line1.value.trim(),
                line2: form.address_line2.value.trim(),
                postal_code: form.address_postal_code.value.trim(),
                city: form.address_city.value.trim(),
                country: form.address_country.value
            };
            if (!address.label || !address.name || !address.line1 || !address.postal_code || !address.city || !address.country) return null;
            return {address};
        };

        const renderCheckoutQuote = (quote, message = '') => {
            const currency = quote.currency || window.Core.currency;
            const country = quote.country || quote.delivery_country || checkoutAddressPayload()?.address?.country || window.Core.country;
            const notice = window.Core.currencyNotice(quote);
            renderShippingMethods(quote.shipping_methods || [], quote.shipping_method?.code || '');
            renderPaymentMethods(quote.payment_methods || []);
            root.querySelector('#checkout-summary').innerHTML = `
                <div class="summary-items">
                    ${(quote.items || []).map(item => `<div class="summary-item"><span class="summary-item-name"><span class="summary-item-qty">${item.quantity}&times;</span>${esc(item.name)}</span><span class="summary-item-value">${window.Core.formatMoney(item.total_cents, currency)}</span></div>`).join('')}
                </div>
                <dl class="summary-lines">
                    <div class="summary-line"><dt>${t('subtotalExVat')}</dt><dd>${window.Core.formatMoney(quote.subtotal_cents, currency)}</dd></div>
                    <div class="summary-line"><dt>${t('shippingExVat')}</dt><dd>${window.Core.formatMoney(quote.shipping_cents, currency)}</dd></div>
                    <div class="summary-line"><dt>${t('vat')}</dt><dd>${window.Core.formatMoney(quote.tax_cents, currency)}</dd></div>
                </dl>
                <div class="summary-rule"></div>
                <div class="summary-total"><span>${t('totalInclVat')}</span><strong>${window.Core.formatMoney(quote.total_cents, currency)}</strong></div>
                <p class="currency-context-note ${notice ? 'error' : ''}">${t('deliveryBilled', {country: esc(country), currency: esc(currency)})}${notice ? ` · ${esc(notice)}` : ''}</p>
            `;
            quoteStatus.className = `summary-status ${notice ? 'error' : ''}`;
            quoteStatus.textContent = message || notice || t('quoteUpToDate');
        };

        const applyAuthoritativeQuote = (quote, message = '') => {
            const country = quote.country || quote.delivery_country || checkoutAddressPayload()?.address?.country;
            window.Core.updateCurrencyContext({...quote, country});
            window.Core.renderNav();
            renderCheckoutQuote(quote, message);
        };

        const requestQuote = async (sequence = quoteGate.begin()) => {
            quoteStatus.className = 'summary-status';
            quoteStatus.textContent = t('calculatingQuote');
            const addressPayload = checkoutAddressPayload();
            if (!addressPayload) {
                quoteStatus.textContent = t('enterFullAddress');
                return;
            }
            try {
                const selectedShipping = form.querySelector('[name="shipping_method"]:checked')?.value;
                const response = await window.Core.fetch('/checkout/quote', {
                    method: 'POST',
                    body: {...addressPayload, ...(selectedShipping ? {shipping_method: selectedShipping} : {})}
                });
                if (!quoteGate.isCurrent(sequence)) return;
                const quote = response.cart ? {...response.cart, quote_token: response.quote_token || response.cart.quote_token} : response;
                applyAuthoritativeQuote(quote);
                quoteGate.succeed(sequence, quote.quote_token, !window.Core.currencyNotice(quote));
            } catch (error) {
                if (!quoteGate.fail(sequence)) return;
                quoteStatus.className = 'summary-status error';
                quoteStatus.textContent = error.message;
            }
        };

        const scheduleQuote = () => {
            clearTimeout(quoteTimer);
            const sequence = quoteGate.begin();
            quoteStatus.className = 'summary-status';
            quoteStatus.textContent = t('calculatingQuote');
            quoteTimer = setTimeout(() => requestQuote(sequence), 180);
        };

        form.querySelectorAll('[name="address_choice"]').forEach(input => input.addEventListener('change', () => {
            root.querySelectorAll('.address-card').forEach(card => card.classList.remove('selected'));
            input.closest('.address-card')?.classList.add('selected');
            addressFields.hidden = input.value !== 'new';
            renderShippingMethods();
            scheduleQuote();
        }));
        addressFields.querySelectorAll('input, select').forEach(input => input.addEventListener('input', () => {
            if (input.name === 'address_country') {
                renderShippingMethods();
            }
            scheduleQuote();
        }));
        renderPaymentMethods(cartRes.payment_methods || []);
        renderShippingMethods(cartRes.shipping_methods || [], cartRes.shipping_method?.code || '');
        requestQuote();

        window.App.submitCheckout = async (form) => {
            const addressPayload = checkoutAddressPayload();
            if (!addressPayload) return alert(t('selectFullAddress'));
            if (!form.quote_token.value) return alert(t('waitQuote'));
            const shippingMethod = form.querySelector('[name="shipping_method"]:checked')?.value;
            if (!shippingMethod) return alert(t('selectShippingMethod'));
            const acceptedToken = form.quote_token.value;
            const data = {
                ...addressPayload,
                quote_token: acceptedToken,
                idempotency_key: form.idempotency_key.value,
                payment_method: form.querySelector('[name="payment_method"]:checked')?.value,
                shipping_method: shippingMethod,
                notes: form.notes.value
            };
            
            const btn = submitButton;
            const checkoutSequence = quoteGate.begin();
            btn.textContent = t('placingOrder');
            
            try {
                const res = await window.Core.fetch('/checkout', { method: 'POST', body: data });
                await window.Core.refreshCart();
                if (data.payment_method === 'stripe') {
                    const redirect = res.payment_bridge_url || res.payment?.bridge_url || res.payment?.redirect_url ||
                        res.stripe_checkout_url || res.checkout_url;
                    if (!redirect) throw new Error(t('stripeRedirectMissing'));
                    const target = new URL(redirect, window.location.origin);
                    const isLocalBridge = target.origin === window.location.origin;
                    const isStripeCheckout = target.protocol === 'https:' && target.hostname === 'checkout.stripe.com';
                    if (!isLocalBridge && !isStripeCheckout) throw new Error(t('unsafePaymentRedirect'));
                    window.location.assign(target.href);
                    return;
                }
                window.Router.navigate(window.APP_BASE + 'account/orders?success=' + res.order.id);
            } catch(e) {
                if (!quoteGate.isCurrent(checkoutSequence)) {
                    btn.textContent = `${t('placeOrder')} →`;
                    return;
                }
                if (e.status === 409) {
                    const rawChangedQuote = e.data?.quote || e.data?.current_quote || e.data?.cart || (e.data?.quote_token ? e.data : null);
                    const changedQuote = rawChangedQuote
                        ? {...rawChangedQuote, quote_token: e.data?.quote_token || rawChangedQuote.quote_token}
                        : null;
                    if (changedQuote) {
                        applyAuthoritativeQuote(changedQuote, t('amountsChangedReview'));
                        quoteGate.succeed(checkoutSequence, changedQuote.quote_token, !window.Core.currencyNotice(changedQuote));
                    } else {
                        await requestQuote();
                        quoteStatus.className = 'summary-status error';
                        quoteStatus.textContent = t('amountsChanged');
                    }
                } else {
                    alert(e.message);
                    quoteGate.succeed(checkoutSequence, acceptedToken);
                }
                btn.textContent = `${t('placeOrder')} →`;
            }
        };

    } catch(e) {
        root.innerHTML = `<div class="alert error">${esc(e.message)}</div>`;
    }
});
window.Router.add(/^login$/, async (match, root) => {
    root.innerHTML = `
        <div class="auth-wrapper">
            <div class="auth-card auth-card-login card">
                <div class="auth-header auth-login-header text-center">
                    <img src="${window.APP_BASE}?asset=brand-logo&v=${window.LOGO_V || ''}" alt="Ferry Telecom" class="auth-brand-logo">
                    <h2>${t('signIn')}</h2>
                    <p class="text-muted">${t('welcomeTest')}</p>
                </div>
                <form id="login-form" class="auth-form">
                    <div class="form-group">
                        <label class="form-label">${t('emailAddress')}</label>
                        <input type="email" name="email" class="form-control" autocomplete="username" required autofocus>
                    </div>
                    <div class="form-group">
                        <label class="form-label d-flex justify-between">
                            ${t('password')}
                            <a href="${window.APP_BASE}forgot" class="auth-link text-sm">${t('forgotten')}</a>
                        </label>
                        <input type="password" name="password" class="form-control" autocomplete="current-password" required>
                    </div>
                    <button type="submit" class="btn btn-primary btn-block btn-lg auth-submit">${t('signIn')}</button>
                </form>
                <div id="login-error" class="alert error mt-4" style="display:none;"></div>
                <div class="auth-footer auth-login-footer text-center text-sm text-muted">
                    ${t('notCustomerYet')} <a href="${window.APP_BASE}register" class="font-weight-bold">${t('applyAccount')}</a>
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
    const registrationCopy = {
        en: {contact:'Contact person',contactHint:'Who should we contact about this account?',business:'Business details',businessHint:'We supply verified repair and resale businesses.',billing:'Billing address',billingHint:'Your country determines currency and registration requirements.',phone:'Business phone',website:'Website (optional)',activity:'Main business activity',choose:'Choose an activity',repair:'Repair shop',reseller:'Reseller / retailer',refurbisher:'Refurbisher',wholesaler:'Wholesaler',education:'Education / training',other:'Other',country:'Country',street:'Street',number:'Number',addition:'Address addition (optional)',postcode:'Postal code',city:'City',swissUid:'Swiss UID',otherTax:'VAT or company registration number',swissHelp:'Swiss businesses must provide their UID in CHE-123.456.789 format. Swiss orders are invoiced in CHF.',otherHelp:'Swiss rules do not apply. Provide the VAT or company registration number used in your country; orders are invoiced in EUR.',newsletter:'Send me useful product and stock updates',terms:'I confirm this is a business application and accept the terms and privacy policy.',required:'Required fields are marked with *.',already:'Already registered?',signIn:'Sign in'},
        nl: {contact:'Contactpersoon',contactHint:'Met wie kunnen wij contact opnemen over dit account?',business:'Bedrijfsgegevens',businessHint:'Wij leveren aan gecontroleerde reparatie- en wederverkoopbedrijven.',billing:'Factuuradres',billingHint:'Uw land bepaalt de valuta en registratievereisten.',phone:'Zakelijk telefoonnummer',website:'Website (optioneel)',activity:'Hoofdactiviteit',choose:'Kies een activiteit',repair:'Reparatiebedrijf',reseller:'Wederverkoper / winkel',refurbisher:'Refurbisher',wholesaler:'Groothandel',education:'Onderwijs / opleiding',other:'Anders',country:'Land',street:'Straat',number:'Huisnummer',addition:'Toevoeging (optioneel)',postcode:'Postcode',city:'Plaats',swissUid:'Zwitsers UID-nummer',otherTax:'Btw- of handelsregisternummer',swissHelp:'Zwitserse bedrijven moeten hun UID opgeven als CHE-123.456.789. Zwitserse bestellingen worden in CHF gefactureerd.',otherHelp:'Zwitserse regels zijn niet van toepassing. Vul het btw- of handelsregisternummer van uw land in; bestellingen worden in EUR gefactureerd.',newsletter:'Stuur mij nuttige product- en voorraadupdates',terms:'Ik bevestig dat dit een zakelijke aanvraag is en accepteer de voorwaarden en het privacybeleid.',required:'Verplichte velden zijn gemarkeerd met *.',already:'Al geregistreerd?',signIn:'Inloggen'},
        de: {contact:'Kontaktperson',contactHint:'Wen dürfen wir zu diesem Konto kontaktieren?',business:'Unternehmensdaten',businessHint:'Wir beliefern geprüfte Reparatur- und Wiederverkaufsunternehmen.',billing:'Rechnungsadresse',billingHint:'Ihr Land bestimmt Währung und Registrierungsanforderungen.',phone:'Geschäftliche Telefonnummer',website:'Website (optional)',activity:'Haupttätigkeit',choose:'Tätigkeit wählen',repair:'Reparaturbetrieb',reseller:'Händler / Einzelhandel',refurbisher:'Refurbisher',wholesaler:'Großhandel',education:'Bildung / Schulung',other:'Andere',country:'Land',street:'Straße',number:'Hausnummer',addition:'Adresszusatz (optional)',postcode:'Postleitzahl',city:'Ort',swissUid:'Schweizer UID',otherTax:'USt.- oder Handelsregisternummer',swissHelp:'Schweizer Unternehmen müssen ihre UID im Format CHE-123.456.789 angeben. Schweizer Bestellungen werden in CHF fakturiert.',otherHelp:'Schweizer Regeln gelten nicht. Geben Sie die USt.- oder Handelsregisternummer Ihres Landes an; Bestellungen werden in EUR fakturiert.',newsletter:'Produkt- und Bestandsupdates erhalten',terms:'Ich bestätige den geschäftlichen Antrag und akzeptiere AGB und Datenschutzrichtlinie.',required:'Pflichtfelder sind mit * markiert.',already:'Bereits registriert?',signIn:'Anmelden'},
        fr: {contact:'Personne de contact',contactHint:'Qui pouvons-nous contacter au sujet de ce compte ?',business:'Informations sur l’entreprise',businessHint:'Nous fournissons les entreprises vérifiées de réparation et de revente.',billing:'Adresse de facturation',billingHint:'Votre pays détermine la devise et les exigences d’immatriculation.',phone:'Téléphone professionnel',website:'Site web (facultatif)',activity:'Activité principale',choose:'Choisissez une activité',repair:'Atelier de réparation',reseller:'Revendeur / détaillant',refurbisher:'Reconditionneur',wholesaler:'Grossiste',education:'Enseignement / formation',other:'Autre',country:'Pays',street:'Rue',number:'Numéro',addition:'Complément d’adresse (facultatif)',postcode:'Code postal',city:'Ville',swissUid:'IDE suisse',otherTax:'N° TVA ou d’immatriculation',swissHelp:'Les entreprises suisses doivent fournir leur IDE au format CHE-123.456.789. Les commandes suisses sont facturées en CHF.',otherHelp:'Les règles suisses ne s’appliquent pas. Indiquez le numéro de TVA ou d’immatriculation de votre pays ; les commandes sont facturées en EUR.',newsletter:'Recevoir les actualités produits et stocks',terms:'Je confirme qu’il s’agit d’une demande professionnelle et j’accepte les conditions et la politique de confidentialité.',required:'Les champs obligatoires sont marqués d’un *.',already:'Déjà inscrit ?',signIn:'Se connecter'},
        it: {contact:'Persona di contatto',contactHint:'Chi possiamo contattare per questo account?',business:'Dati aziendali',businessHint:'Forniamo aziende verificate di riparazione e rivendita.',billing:'Indirizzo di fatturazione',billingHint:'Il paese determina valuta e requisiti di registrazione.',phone:'Telefono aziendale',website:'Sito web (facoltativo)',activity:'Attività principale',choose:'Scegli un’attività',repair:'Centro riparazioni',reseller:'Rivenditore / negozio',refurbisher:'Ricondizionatore',wholesaler:'Grossista',education:'Istruzione / formazione',other:'Altro',country:'Paese',street:'Via',number:'Numero',addition:'Aggiunta indirizzo (facoltativa)',postcode:'CAP',city:'Città',swissUid:'IDI svizzero',otherTax:'Partita IVA o numero registro imprese',swissHelp:'Le aziende svizzere devono indicare l’IDI nel formato CHE-123.456.789. Gli ordini svizzeri sono fatturati in CHF.',otherHelp:'Le regole svizzere non si applicano. Indica la partita IVA o il numero del registro imprese del tuo paese; gli ordini sono fatturati in EUR.',newsletter:'Inviatemi aggiornamenti utili su prodotti e scorte',terms:'Confermo che si tratta di una richiesta aziendale e accetto termini e informativa sulla privacy.',required:'I campi obbligatori sono contrassegnati con *.',already:'Già registrato?',signIn:'Accedi'}
    };
    const r = registrationCopy[window.I18n?.locale] || registrationCopy.en;
    root.innerHTML = `
        <div class="auth-wrapper registration-wrapper">
            <div class="auth-card registration-card card">
                <div class="auth-header registration-header text-center">
                    <img src="${window.APP_BASE}?asset=brand-logo&v=${window.LOGO_V || ''}" alt="Ferry Telecom" class="auth-brand-logo">
                    <h2>${t('becomeCustomer')}</h2>
                    <p class="text-muted">${t('registerIntro')}</p>
                    <small>${r.required}</small>
                </div>
                <form id="register-form" class="auth-form">
                    <section class="registration-section">
                        <div class="registration-section-heading"><span>1</span><div><h3>${r.contact}</h3><p>${r.contactHint}</p></div></div>
                        <div class="registration-grid">
                            <label class="registration-field"><span>${t('name')} *</span><input type="text" name="name" class="form-control" autocomplete="name" required></label>
                            <label class="registration-field"><span>${t('emailAddress')} *</span><input type="email" name="email" class="form-control" autocomplete="email" required></label>
                            <label class="registration-field"><span>${r.phone} *</span><input type="tel" name="phone" class="form-control" autocomplete="tel" required></label>
                            <label class="registration-field"><span>${t('password')} *</span><input type="password" name="password" class="form-control" autocomplete="new-password" required minlength="12"><small>${t('passwordMinimum')}</small></label>
                        </div>
                    </section>
                    <section class="registration-section">
                        <div class="registration-section-heading"><span>2</span><div><h3>${r.business}</h3><p>${r.businessHint}</p></div></div>
                        <div class="registration-grid">
                            <label class="registration-field"><span>${t('companyName')} *</span><input type="text" name="company" class="form-control" autocomplete="organization" required></label>
                            <label class="registration-field"><span>${r.activity} *</span><select name="business_activity" class="form-control" required><option value="">${r.choose}</option><option value="repair_shop">${r.repair}</option><option value="reseller">${r.reseller}</option><option value="refurbisher">${r.refurbisher}</option><option value="wholesaler">${r.wholesaler}</option><option value="education">${r.education}</option><option value="other">${r.other}</option></select></label>
                            <label class="registration-field registration-span-2"><span>${r.website}</span><input type="url" name="website" class="form-control" placeholder="https://" autocomplete="url"></label>
                        </div>
                    </section>
                    <section class="registration-section">
                        <div class="registration-section-heading"><span>3</span><div><h3>${r.billing}</h3><p>${r.billingHint}</p></div></div>
                        <div class="registration-grid registration-address-grid">
                            <label class="registration-field registration-span-2"><span>${r.country} *</span><select name="country" class="form-control" required>${window.BuyerCurrency.options('CH')}</select></label>
                            <label class="registration-field registration-street"><span>${r.street} *</span><input type="text" name="street" class="form-control" autocomplete="address-line1" required></label>
                            <label class="registration-field"><span>${r.number} *</span><input type="text" name="house_number" class="form-control" required></label>
                            <label class="registration-field"><span>${r.addition}</span><input type="text" name="address_addition" class="form-control" autocomplete="address-line2"></label>
                            <label class="registration-field"><span>${r.postcode} *</span><input type="text" name="postal_code" class="form-control" autocomplete="postal-code" required></label>
                            <label class="registration-field registration-city"><span>${r.city} *</span><input type="text" name="city" class="form-control" autocomplete="address-level2" required></label>
                            <label class="registration-field registration-span-2 registration-tax-field"><span id="registration-tax-label">${r.swissUid} *</span><input type="text" name="tax_registration_number" class="form-control" placeholder="CHE-123.456.789" required><small id="registration-country-help" class="registration-country-help swiss">${r.swissHelp}</small></label>
                        </div>
                    </section>
                    <div class="registration-consents">
                        <label><input type="checkbox" name="newsletter_opt_in"> <span>${r.newsletter}</span></label>
                        <label><input type="checkbox" name="terms_accepted" required> <span>${r.terms} *</span></label>
                    </div>
                    <button type="submit" class="btn btn-primary btn-block btn-lg registration-submit">${t('applyAccount')}</button>
                </form>
                <div id="reg-error" class="alert error mt-4" style="display:none;"></div>
                <div id="reg-success" class="alert success mt-4" style="display:none;">
                    <h4>${t('applicationReceived')}</h4>
                    <p class="mt-1">${t('applicationReceivedCopy')}</p>
                    <a href="${window.APP_BASE}login" class="btn btn-outline btn-sm mt-3">${t('goSignIn')}</a>
                </div>
                <div class="auth-footer registration-footer text-center text-sm text-muted">
                    ${r.already} <a href="${window.APP_BASE}login" class="font-weight-bold">${r.signIn}</a>
                </div>
            </div>
        </div>
    `;
    const form = document.getElementById('register-form');
    const syncCountryRules = () => {
        const swiss = form.country.value === 'CH';
        document.getElementById('registration-tax-label').textContent = `${swiss ? r.swissUid : r.otherTax} *`;
        const help = document.getElementById('registration-country-help');
        help.textContent = swiss ? r.swissHelp : r.otherHelp;
        help.classList.toggle('swiss', swiss);
        form.tax_registration_number.placeholder = swiss ? 'CHE-123.456.789' : '';
    };
    form.country.addEventListener('change', syncCountryRules);
    syncCountryRules();
    form.onsubmit = async (e) => {
        e.preventDefault();
        try {
            await window.Core.fetch('/auth/register', {
                method: 'POST',
                body: {
                    name: e.target.name.value,
                    company: e.target.company.value,
                    email: e.target.email.value,
                    password: e.target.password.value,
                    phone: e.target.phone.value,
                    website: e.target.website.value,
                    business_activity: e.target.business_activity.value,
                    country: e.target.country.value,
                    street: e.target.street.value,
                    house_number: e.target.house_number.value,
                    address_addition: e.target.address_addition.value,
                    postal_code: e.target.postal_code.value,
                    city: e.target.city.value,
                    tax_registration_number: e.target.tax_registration_number.value,
                    newsletter_opt_in: e.target.newsletter_opt_in.checked,
                    terms_accepted: e.target.terms_accepted.checked
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
                    <h2>${t('forgotPassword')}</h2>
                    <p class="text-muted">${t('forgotPasswordCopy')}</p>
                </div>
                <form id="forgot-form" class="auth-form">
                    <div class="form-group">
                        <label class="form-label">${t('emailAddress')}</label>
                        <input type="email" name="email" class="form-control" required autofocus>
                    </div>
                    <button type="submit" class="btn btn-primary btn-block btn-lg mt-4">${t('requestReset')}</button>
                </form>
                <div id="forgot-msg" class="alert mt-4" style="display:none;"></div>
                <div class="auth-footer mt-4 text-center text-sm">
                    <a href="${window.APP_BASE}login" class="text-muted">&larr; ${t('backSignIn')}</a>
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
            msg.textContent = t('resetSent');
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
                    <h2>${t('newPassword')}</h2>
                    <p class="text-muted">${t('newPasswordCopy')}</p>
                </div>
                <form id="reset-form" class="auth-form">
                    <input type="hidden" name="token" value="${esc(token)}">
                    <div class="form-group">
                        <label class="form-label">${t('newPassword')}</label>
                        <input type="password" name="password" class="form-control" required minlength="8" autofocus>
                    </div>
                    <button type="submit" class="btn btn-primary btn-block btn-lg mt-4">${t('saveSignIn')}</button>
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
