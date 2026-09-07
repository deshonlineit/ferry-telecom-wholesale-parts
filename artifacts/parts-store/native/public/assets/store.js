const esc = window.Core.escapeHtml;

const categoryGroups = [
    { title: "Parts", keywords: ['screen', 'batter', 'charg', 'camera', 'hous', 'flex', 'audio', 'adhes'] },
    { title: "Tools & Accessories", keywords: ['tool', 'protect', 'accessor', 'other'] }
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
    return image?.url || '';
};

window.App.renderProductCard = function(p) {
    const isStaff = window.Core.user && window.Core.user.role === 'staff';
    const canBuy = window.App.canOrderProduct(p);
    
    let stockClass = p.stock > 0 ? 'stock-ok' : 'stock-out';
    let stockText = p.stock > 0 ? `${p.stock} in stock` : 'Out of stock';

    let srcSetAttr = '';
    if (p.image_url && p.image_url.includes('-1280w.webp')) {
        const base = p.image_url.replace('-1280w.webp', '');
        srcSetAttr = `srcset="${base}-320w.webp 320w, ${base}-640w.webp 640w, ${base}-1280w.webp 1280w" sizes="(max-width: 768px) 150px, 300px"`;
    }

    return `
        <div class="part-card">
            ${p.image_url ? `
                <button type="button" class="part-img-link part-photo-preview" data-photo-url="${esc(p.image_url)}" data-photo-name="${esc(p.name)}" aria-label="Enlarge photo of ${esc(p.name)}">
                    <img src="${esc(p.image_url)}" ${srcSetAttr} alt="${esc(p.name)}" loading="lazy">
                </button>
            ` : `
                <div class="part-img-link part-no-photo" aria-label="No photo available">
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
                    ${stockText} <span class="part-sku" title="SKU">· ${esc(p.sku)}</span>
                </div>
                ${p.stock > 0 && p.stock < p.minimum_quantity ? `<small class="text-danger mt-1 d-block" style="color: #ff3b30; font-weight: 500;">Minimum quantity ${p.minimum_quantity}</small>` : ''}
            </div>
            <div class="part-buy-area">
                <div class="part-price">
                    ${p.price_cents !== null ? window.Core.formatMoney(p.price_cents) : `<a href="${window.APP_BASE}login" class="login-for-price">Sign in for prices</a>`}
                </div>
                ${canBuy ? `
                <div class="part-action">
                    <input type="number" id="qty-${p.id}" value="${p.minimum_quantity}" min="${p.minimum_quantity}" max="${p.stock}" class="part-qty form-control" aria-label="Quantity">
                    <button type="button" class="btn btn-primary part-add-btn" onclick="window.App.addToCartWithQty(${p.id}, Number(this.parentElement.querySelector('input').value), this)" aria-label="Add" title="Add to cart">
                        Add
                    </button>
                </div>
                ` : (isStaff ? '<span class="text-muted small font-weight-bold">Manage</span>' : '')}
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
        <button type="button" class="gallery-thumb" data-gallery-index="${idx}" aria-label="Show photo ${idx + 1} of ${allImages.length}">
            <img src="${esc(window.App.thumbnailUrl(img))}" alt="Thumbnail ${idx + 1} of ${esc(p.name)}" loading="lazy">
        </button>
    `).join('');

    const modelsHtml = data.models && data.models.length ? `
        <div class="product-section mt-4 pt-4 border-top">
            <h4 class="section-heading mb-3">Compatible models</h4>
            <div class="model-tags">
                ${data.models.map(m => `<span class="model-tag">${esc(m.name)}</span>`).join('')}
            </div>
        </div>
    ` : '';
    
    const relatedHtml = data.related && data.related.length ? `
        <div class="section-title mt-5">
            <h2>Related products</h2>
        </div>
        ${window.App.renderProductTable(data.related)}
    ` : '';

    const isStaff = window.Core.user && window.Core.user.role === 'staff';
    const canBuy = window.App.canOrderProduct(p);
    
    window.App.currentImageIndex = 0;

    root.innerHTML = `
        <div class="breadcrumb mb-4">
            <a href="${window.APP_BASE}catalog" class="btn-link" style="color: var(--apple-muted); font-size: 0.9375rem; font-weight: 500;">&larr; Catalogue</a>
        </div>
        
        <div class="product-detail-layout">
            <div class="product-gallery">
                ${allImages.length ? `
                    <button type="button" class="main-image-container part-photo-preview" data-photo-images="${esc(JSON.stringify(allImages))}" data-photo-name="${esc(p.name)}" aria-label="Enlarge photo of ${esc(p.name)}" title="Click to enlarge" style="position: relative;">
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
                    <span class="part-sku" title="SKU" style="color: var(--apple-muted); font-size: 0.875rem; font-weight: 500;">· ${esc(p.sku)}</span>
                </div>
                
                <h1 class="product-title-lg mb-2">${esc(p.name)}</h1>
                
                <div class="product-stock-status ${p.stock > 0 ? 'stock-ok' : 'stock-out'} mb-4">
                    <span class="status-dot"></span>
                    ${p.stock > 0 ? `${p.stock} in stock` : 'Out of stock'}
                </div>
                
                ${p.stock > 0 && p.stock < p.minimum_quantity ? `<div class="alert warning mb-4">Minimum quantity: ${p.minimum_quantity} units. Only ${p.stock} are currently available, so this part cannot be ordered at present.</div>` : ''}
                <div class="product-price-lg mb-4">
                    ${p.price_cents !== null ? window.Core.formatMoney(p.price_cents) : `<a href="${window.APP_BASE}login" class="login-for-price">Sign in for prices</a>`}
                </div>
                
                ${canBuy ? `
                    <div class="purchase-box mb-4">
                        <div class="purchase-controls">
                            <input type="number" id="pd-qty" value="${p.minimum_quantity}" min="${p.minimum_quantity}" max="${p.stock}" class="form-control qty-input" style="width: 100px; text-align: center;">
                            <button type="button" class="btn btn-primary flex-1" style="font-weight: 600;" onclick="window.App.addToCartWithQty(${p.id}, Number(document.getElementById('pd-qty').value), this)">
                                Add to cart
                            </button>
                        </div>
                        ${p.minimum_quantity > 1 ? `<div class="qty-hint mt-3 text-muted small" style="font-weight: 500;">Minimum quantity: ${p.minimum_quantity} units</div>` : ''}
                    </div>
                ` : (isStaff ? '<div class="alert warning mb-4">Staff members cannot place orders.</div>' : (!window.Core.user ? '<div class="alert warning mb-4"><a href="'+window.APP_BASE+'login">Sign in</a> to order this product.</div>' : ''))}
                
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
        root.innerHTML = `<div class="container mt-4"><div class="alert warning">You must <a href="${window.APP_BASE}login">sign in</a> to view your cart.</div></div>`;
        return;
    }
    await window.Core.refreshCart();
    const cart = window.Core.cart;
    const cartCurrency = cart.currency || window.Core.currency;

    if (!cart.items || cart.items.length === 0) {
        root.innerHTML = `
            <div class="page-header mb-4"><h1>Cart</h1></div>
            <div class="empty-state card">
                <div class="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg></div>
                <h3>Your cart is empty</h3>
                <p class="text-muted mt-2">Add products from the catalogue.</p>
                <a href="${window.APP_BASE}catalog" class="btn btn-primary mt-4">View catalogue</a>
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
                    ${minQty > 1 ? `<span class="line-item-min">Min ${minQty}</span>` : ''}
                    ${item.stock >= item.quantity ? `<span class="line-item-stock${item.stock <= 5 ? ' low' : ''}">${item.stock} in stock</span>` : ''}
                </div>
            </div>
            <div class="line-item-unit">${money(item.price_cents)}</div>
            <div class="line-item-qty">
                <div class="stepper">
                    <button type="button" class="stepper-btn" aria-label="One fewer" ${item.quantity <= minQty ? 'disabled' : ''} onclick="window.App.updateCartItem(${item.product_id}, ${Math.max(minQty, item.quantity - 1)})">&minus;</button>
                    <input type="number" value="${item.quantity}" min="${minQty}" max="${item.stock}" class="stepper-input" aria-label="Quantity for ${esc(item.name)}" onchange="window.App.updateCartItem(${item.product_id}, this.value)">
                    <button type="button" class="stepper-btn" aria-label="One more" ${item.quantity >= item.stock ? 'disabled' : ''} onclick="window.App.updateCartItem(${item.product_id}, ${item.quantity + 1})">+</button>
                </div>
            </div>
            <div class="line-item-total">${money(item.total_cents)}</div>
            <button type="button" class="line-item-remove" aria-label="Remove ${esc(item.name)}" onclick="window.App.updateCartItem(${item.product_id}, 0)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"></path></svg>
            </button>
            ${item.stock < item.quantity ? `<div class="line-item-alert">Stock changed — only ${item.stock} available</div>` : ''}
        </article>
    `;
    }).join('');

    const noteIcon = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4M12 8h.01"></path></svg>';
    const notice = window.Core.currencyNotice(cart);

    root.innerHTML = `
        <section class="order-flow">
            <header class="order-flow-head">
                <h1>Cart</h1>
                <p class="order-flow-sub"><strong>${cart.items.length}</strong> product${cart.items.length === 1 ? '' : 's'} · delivery to <strong>${esc(cart.country || window.Core.country)}</strong> · billed in <strong>${esc(cartCurrency)}</strong></p>
            </header>
            <div class="order-grid">
                <div class="order-main">
                    <div class="line-items">
                        <div class="line-items-head">
                            <span></span>
                            <span>Product</span>
                            <span class="num">Unit price</span>
                            <span>Quantity</span>
                            <span class="num">Total</span>
                            <span></span>
                        </div>
                        ${itemsHtml}
                    </div>
                    <div class="order-main-foot">
                        <a href="${window.APP_BASE}catalog" class="order-link">&larr; Continue shopping</a>
                        <button type="button" class="order-link danger" onclick="window.App.clearCart()">Empty cart</button>
                    </div>
                </div>
                <aside class="order-rail">
                    <div class="summary-panel">
                        <h2 class="summary-title">Order summary</h2>
                        <dl class="summary-lines">
                            <div class="summary-line"><dt>Subtotal</dt><dd>${money(cart.subtotal_cents)}</dd></div>
                            <div class="summary-line"><dt>Shipping</dt>${cart.shipping_cents === 0 ? '<dd class="is-free">Free</dd>' : `<dd>${money(cart.shipping_cents)}</dd>`}</div>
                            <div class="summary-line"><dt>VAT</dt><dd>${money(cart.tax_cents)}</dd></div>
                        </dl>
                        <div class="summary-rule"></div>
                        <div class="summary-total"><span>Total</span><strong>${money(cart.total_cents)}</strong></div>
                        <a href="${window.APP_BASE}checkout" class="summary-cta">Checkout &rarr;</a>
                        <p class="currency-context-note ${notice ? 'error' : ''}">${esc(notice || `Delivery ${cart.country || window.Core.country} · billed in ${cartCurrency}`)}</p>
                    </div>
                    <ul class="rail-notes">
                        <li>${noteIcon}<span>Shipping and VAT follow the delivery country on your address.</span></li>
                        <li>${noteIcon}<span>Test environment: no real orders, stock or payments.</span></li>
                    </ul>
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
        if(confirm('Are you sure you want to empty the cart?')) {
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
            addrHtml = `<div class="alert warning">You have not saved any addresses yet. <a href="${window.APP_BASE}account/addresses">Add an address first</a>.</div>`;
        } else {
            // One address is preselected: the default when there is one, otherwise the first.
            // The radio group and the .selected outline must agree on exactly that card.
            const preselected = addresses.find(a => a.is_default) || addresses[0];
            addrHtml = addresses.map((a) => `
                <label class="address-card ${a.id === preselected.id ? 'selected' : ''}">
                    <input type="radio" name="address_choice" value="${a.id}" ${a.id === preselected.id ? 'checked' : ''}>
                    <div class="address-header mb-2">
                        <strong>${esc(a.label || 'Address')}</strong>
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

        const checkoutCurrency = cartRes.currency || window.Core.currency;
        const checkoutMoney = (cents) => window.Core.formatMoney(cents, checkoutCurrency);
        const railIcon = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4M12 8h.01"></path></svg>';

        root.innerHTML = `
            <section class="order-flow">
                <header class="order-flow-head">
                    <h1>Checkout</h1>
                    <p class="order-flow-sub">Delivery, payment and notes — the total re-quotes while you edit.</p>
                </header>

                <div class="order-grid">
                    <div class="order-main">
                        <form id="checkout-form" class="checkout-steps" onsubmit="event.preventDefault(); window.App.submitCheckout(this);">
                            <input type="hidden" name="idempotency_key" value="${idem}">
                            <input type="hidden" name="quote_token" value="">

                            <div class="checkout-step">
                                <div class="step-header">
                                    <div class="step-number">1</div>
                                    <h3>Delivery address</h3>
                                </div>
                                <div class="address-grid">
                                    ${addrHtml}
                                    <label class="address-card address-card-new ${addresses.length === 0 ? 'selected' : ''}">
                                        <input type="radio" name="address_choice" value="new" ${addresses.length === 0 ? 'checked' : ''}>
                                        <div class="address-header">
                                            <strong>Different delivery address</strong>
                                            <svg class="check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                        </div>
                                        <div class="text-muted text-sm mt-1">Enter a one-off address for this order.</div>
                                    </label>
                                </div>
                                <div id="checkout-address-fields" class="checkout-address-fields mt-3" ${addresses.length ? 'hidden' : ''}>
                                    <div class="form-group"><label>Address label</label><input class="form-control" name="address_label" placeholder="E.g. office"></div>
                                    <div class="grid-cols-2">
                                        <div class="form-group"><label>Name</label><input class="form-control" name="address_name"></div>
                                        <div class="form-group"><label>Company</label><input class="form-control" name="address_company"></div>
                                    </div>
                                    <div class="form-group"><label>Street and building number</label><input class="form-control" name="address_line1"></div>
                                    <div class="form-group"><label>Address line 2</label><input class="form-control" name="address_line2"></div>
                                    <div class="grid-cols-2">
                                        <div class="form-group"><label>Postcode</label><input class="form-control" name="address_postal_code"></div>
                                        <div class="form-group"><label>Town/city</label><input class="form-control" name="address_city"></div>
                                    </div>
                                    <div class="form-group mb-0"><label>Delivery country</label><select class="form-control" name="address_country">${window.BuyerCurrency.options(window.Core.country)}</select></div>
                                </div>
                                <div class="mt-3">
                                    <a href="${window.APP_BASE}account/addresses" class="order-link">Manage saved addresses</a>
                                </div>
                            </div>

                            <div class="checkout-step">
                                <div class="step-header">
                                    <div class="step-number">2</div>
                                    <h3>Payment method</h3>
                                </div>
                                <div class="payment-grid">
                                    <label class="payment-card selected">
                                        <input type="radio" name="payment_method" value="test_invoice" checked onchange="document.querySelectorAll('.payment-card').forEach(c=>c.classList.remove('selected')); this.closest('.payment-card').classList.add('selected');">
                                        <div class="address-header">
                                            <strong>On account (Test)</strong>
                                            <svg class="check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                        </div>
                                        <div class="text-muted text-sm mt-1">Pay later by invoice (approved accounts only).</div>
                                    </label>
                                    <label class="payment-card">
                                        <input type="radio" name="payment_method" value="test_card" onchange="document.querySelectorAll('.payment-card').forEach(c=>c.classList.remove('selected')); this.closest('.payment-card').classList.add('selected');">
                                        <div class="address-header">
                                            <strong>Credit card (Test)</strong>
                                            <svg class="check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                        </div>
                                        <div class="text-muted text-sm mt-1">Pay immediately in the secure test environment.</div>
                                    </label>
                                </div>
                            </div>

                            <div class="checkout-step">
                                <div class="step-header">
                                    <div class="step-number">3</div>
                                    <h3>Notes <span class="step-optional">optional</span></h3>
                                </div>
                                <div class="form-group mb-0">
                                    <textarea name="notes" class="form-control" rows="3" placeholder="Reference or note for this order..."></textarea>
                                </div>
                            </div>
                        </form>
                    </div>

                    <aside class="order-rail">
                        <div class="summary-panel">
                            <h2 class="summary-title">Order summary</h2>
                            <div id="checkout-quote-status" class="summary-status">Calculating quote…</div>
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
                                    <div class="summary-line"><dt>Subtotal</dt><dd>${checkoutMoney(cartRes.subtotal_cents)}</dd></div>
                                    <div class="summary-line"><dt>Shipping</dt>${cartRes.shipping_cents === 0 ? '<dd class="is-free">Free</dd>' : `<dd>${checkoutMoney(cartRes.shipping_cents)}</dd>`}</div>
                                    <div class="summary-line"><dt>VAT</dt><dd>${checkoutMoney(cartRes.tax_cents)}</dd></div>
                                </dl>
                                <div class="summary-rule"></div>
                                <div class="summary-total"><span>Total</span><strong>${checkoutMoney(cartRes.total_cents)}</strong></div>
                                <p class="currency-context-note">Delivery ${esc(cartRes.country || window.Core.country)} · billed in ${esc(checkoutCurrency)}</p>
                            </div>
                            <button id="checkout-submit" form="checkout-form" type="submit" class="summary-cta" disabled>Place order &rarr;</button>
                        </div>
                        <ul class="rail-notes">
                            <li>${railIcon}<span>The amounts are re-quoted for the selected address before the order is placed.</span></li>
                            <li>${railIcon}<span>Test environment: no real orders, stock or payments.</span></li>
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
            root.querySelector('#checkout-summary').innerHTML = `
                <div class="summary-items">
                    ${(quote.items || []).map(item => `<div class="summary-item"><span class="summary-item-name"><span class="summary-item-qty">${item.quantity}&times;</span>${esc(item.name)}</span><span class="summary-item-value">${window.Core.formatMoney(item.total_cents, currency)}</span></div>`).join('')}
                </div>
                <dl class="summary-lines">
                    <div class="summary-line"><dt>Subtotal</dt><dd>${window.Core.formatMoney(quote.subtotal_cents, currency)}</dd></div>
                    <div class="summary-line"><dt>Shipping</dt>${quote.shipping_cents === 0 ? '<dd class="is-free">Free</dd>' : `<dd>${window.Core.formatMoney(quote.shipping_cents, currency)}</dd>`}</div>
                    <div class="summary-line"><dt>VAT</dt><dd>${window.Core.formatMoney(quote.tax_cents, currency)}</dd></div>
                </dl>
                <div class="summary-rule"></div>
                <div class="summary-total"><span>Total</span><strong>${window.Core.formatMoney(quote.total_cents, currency)}</strong></div>
                <p class="currency-context-note ${notice ? 'error' : ''}">Delivery ${esc(country)} · billed in ${esc(currency)}${notice ? ` · ${esc(notice)}` : ''}</p>
            `;
            quoteStatus.className = `summary-status ${notice ? 'error' : ''}`;
            quoteStatus.textContent = message || notice || 'Quote is up to date.';
        };

        const applyAuthoritativeQuote = (quote, message = '') => {
            const country = quote.country || quote.delivery_country || checkoutAddressPayload()?.address?.country;
            window.Core.updateCurrencyContext({...quote, country});
            window.Core.renderNav();
            renderCheckoutQuote(quote, message);
        };

        const requestQuote = async (sequence = quoteGate.begin()) => {
            quoteStatus.className = 'summary-status';
            quoteStatus.textContent = 'Calculating quote…';
            const addressPayload = checkoutAddressPayload();
            if (!addressPayload) {
                quoteStatus.textContent = 'Enter the full delivery address first.';
                return;
            }
            try {
                const response = await window.Core.fetch('/checkout/quote', {method: 'POST', body: addressPayload});
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
            quoteStatus.textContent = 'Calculating quote…';
            quoteTimer = setTimeout(() => requestQuote(sequence), 180);
        };

        form.querySelectorAll('[name="address_choice"]').forEach(input => input.addEventListener('change', () => {
            root.querySelectorAll('.address-card').forEach(card => card.classList.remove('selected'));
            input.closest('.address-card')?.classList.add('selected');
            addressFields.hidden = input.value !== 'new';
            scheduleQuote();
        }));
        addressFields.querySelectorAll('input, select').forEach(input => input.addEventListener('input', scheduleQuote));
        requestQuote();

        window.App.submitCheckout = async (form) => {
            const addressPayload = checkoutAddressPayload();
            if (!addressPayload) return alert('Select or enter a full delivery address');
            if (!form.quote_token.value) return alert('Wait until the quote has been calculated');
            const acceptedToken = form.quote_token.value;
            const data = {
                ...addressPayload,
                quote_token: acceptedToken,
                idempotency_key: form.idempotency_key.value,
                payment_method: form.payment_method.value,
                notes: form.notes.value
            };
            
            const btn = submitButton;
            const checkoutSequence = quoteGate.begin();
            btn.textContent = 'Placing order...';
            
            try {
                const res = await window.Core.fetch('/checkout', { method: 'POST', body: data });
                await window.Core.refreshCart();
                window.Router.navigate(window.APP_BASE + 'account/orders?success=' + res.order.id);
            } catch(e) {
                if (!quoteGate.isCurrent(checkoutSequence)) {
                    btn.textContent = 'Place order →';
                    return;
                }
                if (e.status === 409) {
                    const rawChangedQuote = e.data?.quote || e.data?.current_quote || e.data?.cart || (e.data?.quote_token ? e.data : null);
                    const changedQuote = rawChangedQuote
                        ? {...rawChangedQuote, quote_token: e.data?.quote_token || rawChangedQuote.quote_token}
                        : null;
                    if (changedQuote) {
                        applyAuthoritativeQuote(changedQuote, 'The amounts have changed. Review the new quote and click again to place your order.');
                        quoteGate.succeed(checkoutSequence, changedQuote.quote_token, !window.Core.currencyNotice(changedQuote));
                    } else {
                        await requestQuote();
                        quoteStatus.className = 'summary-status error';
                        quoteStatus.textContent = 'The amounts have changed. Review the new quote and then click again.';
                    }
                } else {
                    alert(e.message);
                    quoteGate.succeed(checkoutSequence, acceptedToken);
                }
                btn.textContent = 'Place order →';
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
                    <img src="${window.APP_BASE}assets/logo.svg?v=${window.LOGO_V || ''}" alt="Ferry Telecom" class="mb-3" style="height:32px">
                    <h2>Sign in</h2>
                    <p class="text-muted">Welcome back to the test environment.</p>
                </div>
                <form id="login-form" class="auth-form">
                    <div class="form-group">
                        <label class="form-label">Email address</label>
                        <input type="email" name="email" class="form-control" autocomplete="username" required autofocus>
                    </div>
                    <div class="form-group">
                        <label class="form-label d-flex justify-between">
                            Password
                            <a href="${window.APP_BASE}forgot" class="auth-link text-sm">Forgotten?</a>
                        </label>
                        <input type="password" name="password" class="form-control" autocomplete="current-password" required>
                    </div>
                    <button type="submit" class="btn btn-primary btn-block btn-lg mt-4">Sign in</button>
                </form>
                <div id="login-error" class="alert error mt-4" style="display:none;"></div>
                <div class="auth-footer mt-4 text-center text-sm text-muted">
                    Not a customer yet? <a href="${window.APP_BASE}register" class="font-weight-bold">Apply for an account</a>
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
                    <img src="${window.APP_BASE}assets/logo.svg?v=${window.LOGO_V || ''}" alt="Ferry Telecom" class="mb-3" style="height:32px">
                    <h2>Become a customer</h2>
                    <p class="text-muted">Apply for an account with our wholesale business.</p>
                </div>
                <form id="register-form" class="auth-form">
                    <div class="grid-cols-2 gap-3">
                        <div class="form-group">
                            <label class="form-label">Name</label>
                            <input type="text" name="name" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Company name</label>
                            <input type="text" name="company" class="form-control" required>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Email address</label>
                        <input type="email" name="email" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Password</label>
                        <input type="password" name="password" class="form-control" required minlength="8">
                        <small class="text-muted mt-1 d-block">At least 8 characters.</small>
                    </div>
                    <button type="submit" class="btn btn-primary btn-block btn-lg mt-4">Apply for an account</button>
                </form>
                <div id="reg-error" class="alert error mt-4" style="display:none;"></div>
                <div id="reg-success" class="alert success mt-4" style="display:none;">
                    <h4>Application received!</h4>
                    <p class="mt-1">We will verify your company details. This is a test environment, so you can now sign in with your details.</p>
                    <a href="${window.APP_BASE}login" class="btn btn-outline btn-sm mt-3">Go to sign in</a>
                </div>
                <div class="auth-footer mt-4 text-center text-sm text-muted">
                    Already registered? <a href="${window.APP_BASE}login" class="font-weight-bold">Sign in</a>
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
                    <h2>Forgotten your password?</h2>
                    <p class="text-muted">Enter your email address to receive a reset link.</p>
                </div>
                <form id="forgot-form" class="auth-form">
                    <div class="form-group">
                        <label class="form-label">Email address</label>
                        <input type="email" name="email" class="form-control" required autofocus>
                    </div>
                    <button type="submit" class="btn btn-primary btn-block btn-lg mt-4">Request reset link</button>
                </form>
                <div id="forgot-msg" class="alert mt-4" style="display:none;"></div>
                <div class="auth-footer mt-4 text-center text-sm">
                    <a href="${window.APP_BASE}login" class="text-muted">&larr; Back to sign in</a>
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
            msg.innerHTML = 'If this email address is recognised, a reset link has been sent to the internal test inbox.';
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
                    <h2>New password</h2>
                    <p class="text-muted">Choose a new, secure password.</p>
                </div>
                <form id="reset-form" class="auth-form">
                    <input type="hidden" name="token" value="${esc(token)}">
                    <div class="form-group">
                        <label class="form-label">New password</label>
                        <input type="password" name="password" class="form-control" required minlength="8" autofocus>
                    </div>
                    <button type="submit" class="btn btn-primary btn-block btn-lg mt-4">Save and sign in</button>
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
