(function () {
    const O = window.B2BOrdering = {
        queue: Promise.resolve(),
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
            if ([...query].length < 3) {
                window.UI.closeSuggestions();
                return;
            }
            O.searchMessage('Producten zoeken…');
            app.searchTimer = setTimeout(async () => {
                app.searchAbort = new AbortController();
                try {
                    const data = await window.Core.fetch(`/search/products?q=${encodeURIComponent(query)}&limit=8`, {signal: app.searchAbort.signal});
                    if (sequence === app.searchSequence) O.renderSuggestions(data, query);
                } catch (error) {
                    if (sequence === app.searchSequence && error.name !== 'AbortError') {
                        O.searchMessage('Zoeken is niet gelukt. Typ opnieuw om het nogmaals te proberen.', true);
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
            if (!data.products?.length) {
                O.searchMessage(`Geen producten gevonden voor “${query}”. Probeer een SKU, model of onderdeel.`);
                return;
            }
            const esc = window.Core.escapeHtml;
            const owner = window.App.searchOwner || 'search-input';
            container.classList.add('b2b-search-results');
            container.setAttribute('role', 'dialog');
            container.setAttribute('aria-label', 'Producten direct bestellen');
            input.setAttribute('aria-haspopup', 'dialog');
            input.removeAttribute('aria-activedescendant');
            window.App.searchIndex = -1;
            container.innerHTML = `<div class="suggestion-group-title">Direct bestellen <span>${data.products.length} producten</span></div>` +
                data.products.map((product, index) => {
                    const minimum = Math.max(1, Number(product.minimum_quantity) || 1);
                    const available = Number(product.stock) >= minimum && product.price_cents !== null;
                    const orderable = O.canOrder() && available;
                    const inputId = `${owner}-quantity-${product.id}`;
                    const info = [product.sku, product.quality, product.brand_name].filter(Boolean).join(' · ');
                    return `<div class="b2b-suggestion" data-product-row="${product.id}">
                        <a id="${owner}-option-${index}" class="b2b-suggestion-link" data-search-option href="${window.APP_BASE}products/${product.id}">
                            ${product.image_url ? `<img src="${esc(product.image_url)}" alt="" loading="lazy" width="44" height="44">` : '<span class="img-placeholder" aria-label="Geen productfoto"></span>'}
                            <span class="b2b-suggestion-info"><strong>${esc(product.name)}</strong><small>${esc(info)}</small><small>${Number(product.stock) > 0 ? `${Number(product.stock)} op voorraad` : 'Niet op voorraad'}</small></span>
                        </a>
                        <div class="b2b-suggestion-price">${product.price_cents === null ? 'Login voor prijs' : esc(window.Core.formatMoney(product.price_cents, product.currency))}</div>
                        <div class="b2b-suggestion-order">
                            ${orderable ? `<label class="sr-only" for="${inputId}">Aantal ${esc(product.name)}</label><input id="${inputId}" aria-label="Aantal ${esc(product.sku)}" type="number" inputmode="numeric" min="${minimum}" max="${Number(product.stock)}" step="1" value="${minimum}"><button type="button" class="b2b-add btn btn-primary btn-sm" data-quick-add="${product.id}" aria-label="${esc(product.name)} toevoegen">Toevoegen</button>`
                                : !window.Core.user ? `<a href="${window.APP_BASE}login" class="btn btn-outline btn-sm">Inloggen</a>`
                                : `<span class="text-muted">${available ? 'Niet bestelbaar' : 'Niet beschikbaar'}</span>`}
                        </div>
                        <span class="b2b-row-feedback" role="status" aria-live="polite"></span>
                    </div>`;
                }).join('') +
                `<a href="${window.APP_BASE}catalog?q=${encodeURIComponent(query)}" class="suggestion-footer" data-search-option>${data.has_more ? 'Bekijk alle resultaten' : 'Bekijk deze producten in de tabel'} &rarr;</a>`;
            container.querySelectorAll('[data-quick-add]').forEach(button => {
                button.addEventListener('click', event => {
                    event.preventDefault();
                    event.stopPropagation();
                    const quantity = button.parentElement.querySelector('input');
                    if (quantity.reportValidity()) O.quickAdd(Number(button.dataset.quickAdd), Number(quantity.value), button);
                });
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
                tell('Log in met een actief klantaccount om te bestellen.', true);
                return null;
            }
            if (!Number.isInteger(Number(id)) || !Number.isInteger(Number(quantity)) || Number(quantity) < 1) {
                tell('Vul een geldig geheel aantal in.', true);
                return null;
            }
            if (button) {
                button.dataset.pending = 'true';
                button.disabled = true;
                button.setAttribute('aria-busy', 'true');
            }
            tell('Toevoegen…');
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
                tell(`Toegevoegd · ${item?.quantity ?? quantity} in uw winkelwagen`);
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