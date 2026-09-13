(function() {
    const esc = window.Core.escapeHtml;
    const t = (key, values) => window.I18n.t(key, values);

    window.App = window.App || {};

    function fallbackThumbnail(product) {
        const descriptor = `${product.part_type?.name || ''} ${product.name || ''}`.toLocaleLowerCase();
        let kind = 'part';
        let icon = '<path d="M8 3h8v3h3v12h-3v3H8v-3H5V6h3z"/><path d="M9 9h6v6H9z"/>';

        if (/adhesive|tape|sticker|seal/.test(descriptor)) {
            kind = 'adhesive';
            icon = '<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M8 6h8M8 18h8"/><path d="M9 9h6v6H9z" stroke-dasharray="1.5 1.5"/>';
        } else if (/battery|accu/.test(descriptor)) {
            kind = 'battery';
            icon = '<rect x="6" y="5" width="12" height="16" rx="2"/><path d="M10 2h4v3M9 10h6M12 8v4"/>';
        } else if (/middle frame|housing|back glass|back cover|rear glass/.test(descriptor)) {
            kind = 'housing';
            icon = '<rect x="5" y="2.5" width="14" height="19" rx="3"/><circle cx="9" cy="7" r="1.5"/><circle cx="14" cy="7" r="1.5"/><path d="M8 18h8"/>';
        } else if (/camera/.test(descriptor)) {
            kind = 'camera';
            icon = '<path d="M4 8h4l1.5-2h5L16 8h4v10H4z"/><circle cx="12" cy="13" r="3.5"/>';
        } else if (/speaker|earpiece|audio/.test(descriptor)) {
            kind = 'audio';
            icon = '<path d="M5 10h4l5-4v12l-5-4H5z"/><path d="M17 9c1 1 1 5 0 6M19 7c2 2 2 8 0 10"/>';
        } else if (/charging|charge port|connector|usb/.test(descriptor)) {
            kind = 'connector';
            icon = '<path d="M8 4v5M16 4v5M6 9h12v4a6 6 0 0 1-12 0z"/><path d="M12 19v3"/>';
        } else if (/flex|cable|wireless|nfc/.test(descriptor)) {
            kind = 'cable';
            icon = '<path d="M5 6h5v5H5zM14 13h5v5h-5zM10 8.5h2a4 4 0 0 1 4 4V13"/>';
        } else if (/screen|lcd|oled|display/.test(descriptor)) {
            kind = 'display';
            icon = '<rect x="5" y="2.5" width="14" height="19" rx="3"/><path d="M9 18h6"/>';
        }

        return `<svg data-fallback-kind="${kind}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>`;
    }

    window.App.observeCatalogImages = function(root = document) {
        const images = [...root.querySelectorAll('img[data-catalog-src]')];
        if (!images.length) return;
        const load = image => {
            image.src = image.dataset.catalogSrc;
            image.removeAttribute('data-catalog-src');
        };
        if (!('IntersectionObserver' in window)) {
            images.forEach(load);
            return;
        }
        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                observer.unobserve(entry.target);
                load(entry.target);
            });
        }, {rootMargin: '240px 0px'});
        images.forEach(image => observer.observe(image));
    };

    window.App.renderProductTable = function(products, options = {}) {
        if (!products || !products.length) {
            return `<div class="b2b-empty">${t('noResults')}</div>`;
        }

        const rows = products.map((p, index) => {
            const canBuy = window.App.canOrderProduct(p);
            const isStaff = window.Core.user && window.Core.user.role === 'staff';
            
            // In stock is in stock: green with the exact count, red only at zero.
            let stockClass = p.stock > 0 ? 'b2b-stock-ok' : 'b2b-stock-out';
            let stockText = p.stock > 0 ? `${window.I18n.number(p.stock)} ${t('inStock').toLocaleLowerCase()}` : t('outOfStock');

            const thumb = window.App.thumbnailUrl ? window.App.thumbnailUrl({url: p.image_url}) : p.image_url;
            
            const priceDisplay = p.price_cents !== null 
                ? window.Core.formatMoney(p.price_cents, p.currency) 
                : (window.Core.user
                    ? `<span class="b2b-staff-note">${t('unavailable')}</span>`
                    : `<a href="${window.APP_BASE}login" class="b2b-login-link">${t('signInPrices')}</a>`);

            let modelsStr = (p.models || []).map(m => m.name).join(', ');
            let fullModelsStr = modelsStr;
            if (modelsStr.length > 55) modelsStr = modelsStr.substring(0, 52) + '...';
            const immediateImage = index < 4;
            const imageSource = immediateImage
                ? `src="${esc(thumb)}"`
                : `src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-catalog-src="${esc(thumb)}"`;

            return `
                <tr class="b2b-row" data-product-row data-product-id="${p.id}">
                    <td class="col-img">
                        ${p.image_url ? 
                            `<a href="${window.APP_BASE}products/${p.id}" class="b2b-img-wrap"><img ${imageSource} alt="${esc(p.name)}" loading="${immediateImage ? 'eager' : 'lazy'}" decoding="async" fetchpriority="${index < 2 ? 'high' : 'low'}" width="64" height="64"></a>` :
                            `<a href="${window.APP_BASE}products/${p.id}" class="b2b-img-wrap no-img" aria-label="${esc(t('noImage'))}" title="${esc(t('noImage'))}">${fallbackThumbnail(p)}</a>`
                        }
                    </td>
                    <td class="col-product">
                        <div class="b2b-prod-title"><a href="${window.APP_BASE}products/${p.id}">${esc(p.name)}</a></div>
                        <div class="b2b-prod-meta">
                            <span class="b2b-sku" title="SKU">${esc(p.sku)}</span>
                            ${p.quality ? `<span class="b2b-badge quality" title="${t('quality')}">${esc(p.quality)}</span>` : ''}
                            ${p.part_type?.name ? `<span class="b2b-badge type">${esc(p.part_type.name)}</span>` : ''}
                        </div>
                        ${modelsStr ? `<div class="b2b-prod-models" title="${esc(fullModelsStr)}">${esc(modelsStr)}</div>` : ''}
                    </td>
                    <td class="col-stock">
                        <div class="b2b-stock-indicator ${stockClass}">
                            <span class="b2b-dot"></span>${stockText}
                        </div>
                        ${p.stock > 0 && p.stock < p.minimum_quantity ? `<div class="b2b-min-qty-warn">${t('minQuantity', {count: window.I18n.number(p.minimum_quantity)})}</div>` : ''}
                    </td>
                    <td class="col-price">
                        <div class="b2b-price">${priceDisplay}</div>
                    </td>
                    <td class="col-order">
                        ${canBuy ? `
                            <div class="b2b-order-controls">
                                <input type="number" class="b2b-qty-input" value="${p.minimum_quantity}" min="${p.minimum_quantity}" max="${p.stock}" aria-label="${t('quantity')}">
                                <button type="button" class="b2b-add-btn" onclick="if(this.previousElementSibling.reportValidity()) window.App.addToCartWithQty(${p.id}, Number(this.previousElementSibling.value), this)" aria-label="${t('add')} ${esc(p.name)}" title="${t('addToCart')}">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
                                </button>
                            </div>
                            <div class="b2b-row-feedback" aria-live="polite"></div>
                        ` : (isStaff ? `<span class="b2b-staff-note">${t('manageAccount')}</span>` : (!window.Core.user ? `<a href="${window.APP_BASE}login" class="b2b-login-link" style="font-size:0.875rem;">${t('signInOrder')}</a>` : `<span class="b2b-staff-note">${t(window.Core.user.status !== 'active' ? 'accountInactive' : 'unavailable')}</span>`))}
                    </td>
                </tr>
            `;
        }).join('');

        return `
            <div class="b2b-products">
                ${options.headerHtml ? `<div class="b2b-products-toolbar">${options.headerHtml}</div>` : ''}
                <table class="b2b-table">
                    <thead>
                        <tr>
                            <th class="col-img"><span class="sr-only">${t('noImage')}</span></th>
                            <th class="col-product">${options.productHeaderHtml || t('productSpecifications')}</th>
                            <th class="col-stock">${t('stock')}</th>
                            <th class="col-price">${t('price')}</th>
                            <th class="col-order">${t('order')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
        `;
    };

})();