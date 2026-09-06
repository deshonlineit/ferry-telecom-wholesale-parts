(function() {
    const esc = window.Core.escapeHtml;

    window.App = window.App || {};

    window.App.renderProductTable = function(products) {
        if (!products || !products.length) {
            return `<div class="b2b-empty">Geen producten gevonden in deze weergave.</div>`;
        }

        const rows = products.map(p => {
            const canBuy = window.App.canOrderProduct(p);
            const isStaff = window.Core.user && window.Core.user.role === 'staff';
            
            let stockClass = p.stock > 10 ? 'b2b-stock-ok' : (p.stock > 0 ? 'b2b-stock-low' : 'b2b-stock-out');
            let stockText = p.stock > 0 ? (p.stock > 10 ? 'Op voorraad' : `${p.stock} op voorraad`) : 'Niet op voorraad';

            const thumb = window.App.thumbnailUrl ? window.App.thumbnailUrl({url: p.image_url}) : p.image_url;
            
            const priceDisplay = p.price_cents !== null 
                ? window.Core.formatMoney(p.price_cents, p.currency) 
                : `<a href="${window.APP_BASE}login" class="b2b-login-link">Log in voor prijs</a>`;

            let modelsStr = (p.models || []).map(m => m.name).join(', ');
            let fullModelsStr = modelsStr;
            if (modelsStr.length > 55) modelsStr = modelsStr.substring(0, 52) + '...';

            const reviewDisplay = p.review_summary ? esc(p.review_summary) : 'Geen reviewgegevens';

            return `
                <tr class="b2b-row" data-product-row data-product-id="${p.id}">
                    <td class="col-img">
                        ${p.image_url ? 
                            `<a href="${window.APP_BASE}products/${p.id}" class="b2b-img-wrap"><img src="${esc(thumb)}" alt="${esc(p.name)}" loading="lazy"></a>` :
                            `<div class="b2b-img-wrap no-img" aria-label="Geen afbeelding"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg></div>`
                        }
                    </td>
                    <td class="col-product">
                        <div class="b2b-prod-title"><a href="${window.APP_BASE}products/${p.id}">${esc(p.name)}</a></div>
                        <div class="b2b-prod-meta">
                            <span class="b2b-sku" title="SKU">${esc(p.sku)}</span>
                            ${p.quality ? `<span class="b2b-badge quality" title="Kwaliteit">${esc(p.quality)}</span>` : ''}
                            ${p.part_type?.name ? `<span class="b2b-badge type">${esc(p.part_type.name)}</span>` : ''}
                        </div>
                        ${modelsStr ? `<div class="b2b-prod-models" title="${esc(fullModelsStr)}">${esc(modelsStr)}</div>` : ''}
                    </td>
                    <td class="col-reviews">
                        <div class="b2b-reviews-empty">${reviewDisplay}</div>
                    </td>
                    <td class="col-stock">
                        <div class="b2b-stock-indicator ${stockClass}">
                            <span class="b2b-dot"></span>${stockText}
                        </div>
                        ${p.stock > 0 && p.stock < p.minimum_quantity ? `<div class="b2b-min-qty-warn">Min. afname: ${p.minimum_quantity}</div>` : ''}
                    </td>
                    <td class="col-price">
                        <div class="b2b-price">${priceDisplay}</div>
                    </td>
                    <td class="col-order">
                        ${canBuy ? `
                            <div class="b2b-order-controls">
                                <input type="number" class="b2b-qty-input" value="${p.minimum_quantity}" min="${p.minimum_quantity}" max="${p.stock}" aria-label="Aantal">
                                <button type="button" class="b2b-add-btn" onclick="if(this.previousElementSibling.reportValidity()) window.App.addToCartWithQty(${p.id}, Number(this.previousElementSibling.value), this)" aria-label="${esc(p.name)} toevoegen" title="Toevoegen aan winkelwagen">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
                                </button>
                            </div>
                            <div class="b2b-row-feedback" aria-live="polite"></div>
                        ` : (isStaff ? '<span class="b2b-staff-note">Beheer account</span>' : (!window.Core.user ? `<a href="${window.APP_BASE}login" class="b2b-login-link" style="font-size:0.875rem;">Inloggen om te bestellen</a>` : `<span class="b2b-staff-note">${window.Core.user.status !== 'active' ? 'Account niet actief' : 'Niet beschikbaar'}</span>`))}
                    </td>
                </tr>
            `;
        }).join('');

        return `
            <div class="b2b-products">
                <table class="b2b-table">
                    <thead>
                        <tr>
                            <th class="col-img"><span class="sr-only">Afbeelding</span></th>
                            <th class="col-product">Product & Eigenschappen</th>
                            <th class="col-reviews">Reviews</th>
                            <th class="col-stock">Voorraad</th>
                            <th class="col-price">Prijs</th>
                            <th class="col-order">Bestellen</th>
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