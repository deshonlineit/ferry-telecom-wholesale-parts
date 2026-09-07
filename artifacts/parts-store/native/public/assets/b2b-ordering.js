(function () {
    const O = window.B2BOrdering = {
        queue: Promise.resolve(),
        track(name, data = {}) {
            try {
                window.umami?.track(name, data);
            } catch (_) {
                // Search and ordering must never depend on analytics.
            }
        },
        canOrder() {
            const user = window.Core.user;
            return Boolean(user && user.role === 'customer' && user.status === 'active');
        },
        searchInput(value, owner = 'search-input') {
            const app = window.App;
            if (owner !== (app.searchOwner || 'search-input')) window.UI.closeSuggestions();
            app.searchOwner = owner;
            clearTimeout(app.searchTimer);
            app.searchAbort?.abort();
            const sequence = app.searchSequence = (app.searchSequence || 0) + 1;
            const query = value.trim();
            if (query === '') {
                window.UI.closeSuggestions();
                return;
            }
            O.searchMessage('Searching for products…');
            app.searchTimer = setTimeout(async () => {
                app.searchAbort = new AbortController();
                try {
                    const expanded = owner === 'home-search' || owner === 'catalog-smart-search';
                    const data = await window.Core.fetch(`/search/products?q=${encodeURIComponent(query)}&limit=${expanded ? 12 : 8}`, {signal: app.searchAbort.signal});
                    if (sequence === app.searchSequence) O.renderSuggestions(data, query);
                } catch (error) {
                    if (sequence === app.searchSequence && error.name !== 'AbortError') {
                        O.searchMessage('Search failed. Type again to retry.', true);
                    }
                }
            }, 150);
        },
        searchMessage(message, error = false) {
            const {container, input} = window.App.searchElements();
            if (!container || !input?.isConnected) return;
            container.innerHTML = `<div class="suggestion-empty${error ? ' text-danger' : ''}" role="status">${window.Core.escapeHtml(message)}</div>`;
            container.style.display = 'block';
            input.setAttribute('aria-expanded', 'true');
            input.removeAttribute('aria-activedescendant');
            window.App.searchIndex = -1;
        },
        renderSuggestions(data, query) {
            const {container, input} = window.App.searchElements();
            if (!container || !input?.isConnected) return;
            const owner = window.App.searchOwner || 'search-input';
            const smartSurface = true;
            const source = owner === 'home-search' ? 'homepage' : (owner === 'catalog-smart-search' ? 'catalogue' : 'header');
            const intent = data.intent || {kind: 'product', label: 'Product match'};
            if (smartSurface) {
                O.track(data.products?.length ? 'smart_search_results' : 'smart_search_zero_results', {
                    source,
                    intent: String(intent.kind || 'product'),
                    result_count: Number(data.products?.length || 0),
                    has_more: Boolean(data.has_more)
                });
            }
            if (!data.products?.length) {
                O.searchMessage('No matching products yet. Try a model, SKU, part name or a broader term.');
                return;
            }
            const esc = window.Core.escapeHtml;
            const partOptions = smartSurface && Array.isArray(data.part_options) && data.part_options.length > 1
                ? `<div class="smart-search-parts" aria-label="Choose a part type">
                    <p>What part do you need?</p>
                    <div class="smart-search-part-grid">${data.part_options.map(option => {
                        const params = new URLSearchParams({q: query, category: String(option.id)});
                        const thumbnail = option.image_url && window.App.thumbnailUrl
                            ? window.App.thumbnailUrl({url: option.image_url})
                            : option.image_url;
                        return `<a href="${window.APP_BASE}catalog?${params.toString()}" class="smart-search-part" data-search-option data-smart-part="${Number(option.id)}" data-smart-part-slug="${esc(option.slug)}">
                            <span class="smart-search-part-media">${thumbnail
                                ? `<img src="${esc(thumbnail)}" alt="" loading="lazy" decoding="async">`
                                : '<span class="img-placeholder" aria-hidden="true"></span>'}</span>
                            <span class="smart-search-part-copy"><strong>${esc(option.name)}</strong><small>${Number(option.count).toLocaleString('en-GB')} ${Number(option.count) === 1 ? 'part' : 'parts'}</small></span>
                            <span aria-hidden="true">→</span>
                        </a>`;
                    }).join('')}</div>
                </div>`
                : '';
            container.classList.add('b2b-search-results');
            container.setAttribute('role', 'dialog');
            container.setAttribute('aria-label', 'Order products directly');
            input.setAttribute('aria-haspopup', 'dialog');
            input.removeAttribute('aria-activedescendant');
            window.App.searchIndex = -1;
            container.innerHTML = `<div class="suggestion-group-title">Smart matches · fast order <span>${data.products.length} products</span></div>
                ${smartSurface ? `<div class="smart-search-context"><span class="smart-search-understood">Understood as <strong>${esc(intent.label || 'Product match')}</strong></span><span>Choose quantity</span><span>Add to cart</span></div>${partOptions}` : ''}` +
                data.products.map((product, index) => {
                    const minimum = Math.max(1, Number(product.minimum_quantity) || 1);
                    const available = Number(product.stock) >= minimum && product.price_cents !== null;
                    const orderable = O.canOrder() && available;
                    const inputId = `${owner}-quantity-${product.id}`;
                    const info = [product.sku, product.quality, product.brand_name].filter(Boolean).join(' · ');
                    const productThumb = product.image_url && window.App.thumbnailUrl
                        ? window.App.thumbnailUrl({url: product.image_url})
                        : product.image_url;
                    return `<div class="b2b-suggestion" data-product-row="${product.id}">
                        <a id="${owner}-option-${index}" class="b2b-suggestion-link" data-search-option data-smart-product="${product.id}" href="${window.APP_BASE}products/${product.id}">
                            ${productThumb ? `<img src="${esc(productThumb)}" alt="" loading="${index < 6 ? 'eager' : 'lazy'}" decoding="async" fetchpriority="${index < 6 ? 'high' : 'low'}" width="44" height="44">` : '<span class="img-placeholder" aria-label="No product photo"></span>'}
                            <span class="b2b-suggestion-info"><strong>${esc(product.name)}</strong><small>${esc(info)}</small><small>${Number(product.stock) > 0 ? `${Number(product.stock)} in stock` : 'Out of stock'}</small></span>
                        </a>
                        <div class="b2b-suggestion-price">${product.price_cents === null ? 'Sign in for prices' : esc(window.Core.formatMoney(product.price_cents, product.currency))}</div>
                        <div class="b2b-suggestion-order">
                            ${orderable ? `<label class="sr-only" for="${inputId}">Quantity of ${esc(product.name)}</label><input id="${inputId}" aria-label="Quantity of ${esc(product.sku)}" type="number" inputmode="numeric" min="${minimum}" max="${Number(product.stock)}" step="1" value="${minimum}"><button type="button" class="b2b-add btn btn-primary btn-sm" data-quick-add="${product.id}" aria-label="Add ${esc(product.name)}">Add</button>`
                                : !window.Core.user ? `<a href="${window.APP_BASE}login" class="btn btn-outline btn-sm">Sign in</a>`
                                : `<span class="text-muted">${available ? 'Cannot be ordered' : 'Unavailable'}</span>`}
                        </div>
                        <span class="b2b-row-feedback" role="status" aria-live="polite"></span>
                    </div>`;
                }).join('') +
                `<a href="${window.APP_BASE}catalog?q=${encodeURIComponent(query)}" class="suggestion-footer" data-search-option>${data.has_more ? 'View all results' : 'View these products in the table'} &rarr;</a>`;
            container.querySelectorAll('[data-quick-add]').forEach(button => {
                button.addEventListener('click', event => {
                    event.preventDefault();
                    event.stopPropagation();
                    const quantity = button.parentElement.querySelector('input');
                    if (quantity.reportValidity()) O.quickAdd(Number(button.dataset.quickAdd), Number(quantity.value), button);
                });
            });
            container.querySelectorAll('[data-smart-product]').forEach(link => {
                link.addEventListener('click', () => {
                    if (smartSurface) O.track('smart_search_product_opened', {
                        source,
                        intent: String(intent.kind || 'product'),
                        product_id: Number(link.dataset.smartProduct)
                    });
                });
            });
            container.querySelectorAll('[data-smart-part]').forEach(link => {
                link.addEventListener('click', () => O.track('smart_search_part_selected', {
                    source: 'homepage',
                    intent: String(intent.kind || 'product'),
                    category_id: Number(link.dataset.smartPart),
                    category: String(link.dataset.smartPartSlug || '')
                }));
            });
            container.onkeydown = event => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    window.UI.closeSuggestions();
                    O.focusSearchInput(input);
                } else if (event.key === 'Enter' && event.target.matches('.b2b-suggestion-order input')) {
                    event.preventDefault();
                    event.target.parentElement.querySelector('[data-quick-add]')?.click();
                } else if (['ArrowDown', 'ArrowUp'].includes(event.key) && event.target.matches('[data-search-option]')) {
                    event.preventDefault();
                    const options = [...container.querySelectorAll('[data-search-option]')];
                    const index = options.indexOf(event.target);
                    if (index === 0 && event.key === 'ArrowUp') {
                        O.focusSearchInput(input);
                    } else {
                        options[(index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length].focus();
                    }
                }
            };
            container.style.display = 'block';
            input.setAttribute('aria-expanded', 'true');
        },
        focusSearchInput(input) {
            window.App.restoringSearchFocus = true;
            input.focus({preventScroll: true});
            window.App.restoringSearchFocus = false;
        },
        searchKeydown(event) {
            const app = window.App;
            if (event.key === 'Escape') {
                event.preventDefault();
                window.UI.closeSuggestions();
                return;
            }
            const {container} = app.searchElements();
            if (!container || container.style.display === 'none') return;
            const options = [...container.querySelectorAll('[data-search-option]')];
            if (!options.length) return;
            if (event.key === 'Enter' && app.searchIndex >= 0) {
                event.preventDefault();
                event.stopPropagation();
                const href = options[app.searchIndex]?.href;
                window.UI.closeSuggestions();
                if (href) window.Router.navigate(href);
                return;
            }
            if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
            event.preventDefault();
            const current = app.searchIndex ?? -1;
            app.searchIndex = current < 0
                ? (event.key === 'ArrowDown' ? 0 : options.length - 1)
                : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
            options.forEach((option, index) => option.classList.toggle('is-active', index === app.searchIndex));
            options[app.searchIndex].focus({preventScroll: true});
            options[app.searchIndex].scrollIntoView({block: 'nearest'});
        },
        async quickAdd(id, quantity, button) {
            if (button?.dataset.pending === 'true') return null;
            const row = button?.closest('[data-product-row], .b2b-suggestion, .product-card, .product-detail');
            const feedback = row?.querySelector('.b2b-row-feedback');
            const tell = (message, failed = false) => {
                if (feedback) {
                    feedback.textContent = message;
                    feedback.classList.toggle('text-danger', failed);
                } else {
                    window.Workbench.toast(message, failed ? 'error' : 'success');
                }
            };
            if (!O.canOrder()) {
                tell('Sign in with an active customer account to order.', true);
                return null;
            }
            if (!Number.isInteger(Number(id)) || !Number.isInteger(Number(quantity)) || Number(quantity) < 1) {
                tell('Enter a valid whole quantity.', true);
                return null;
            }
            if (button) {
                button.dataset.pending = 'true';
                button.disabled = true;
                button.setAttribute('aria-busy', 'true');
            }
            tell('Adding…');
            const currencySequence = window.Core.countryChangeSequence;
            const request = O.queue.then(() => window.Core.fetch('/cart/quick-add', {
                method: 'POST', body: {product_id: Number(id), quantity: Number(quantity)}
            }));
            O.queue = request.catch(() => {});
            try {
                const cart = await request;
                window.Core.cart = cart;
                if (currencySequence === window.Core.countryChangeSequence) window.Core.updateCurrencyContext(cart);
                window.Core.updateCartCount();
                const item = cart.items.find(product => product.product_id === Number(id));
                tell(`Added · ${item?.quantity ?? quantity} in your cart`);
                if ((window.App.searchOwner || '') === 'home-search') {
                    O.track('smart_search_added_to_cart', {
                        source: 'homepage',
                        product_id: Number(id),
                        quantity: Number(quantity)
                    });
                }
                document.dispatchEvent(new CustomEvent('cart:updated', {detail: cart}));
                if (location.pathname === window.APP_BASE + 'cart') window.Router.route();
                return cart;
            } catch (error) {
                tell(error.message, true);
                return null;
            } finally {
                if (button) {
                    button.dataset.pending = 'false';
                    button.disabled = false;
                    button.removeAttribute('aria-busy');
                }
            }
        }
    };
})();