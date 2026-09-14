/* Front page. Product listings themselves live on the shop and category pages. */
(function () {
    const esc = window.Core.escapeHtml;
    const count = value => window.I18n.number(Number(value || 0));
    const labels = slug => window.I18n.t(slug);
    const t = (key, values) => window.I18n.t(key, values);
    const icons = {
        screens: '<rect x="5" y="2" width="14" height="20" rx="2.5"/><line x1="10" y1="18.5" x2="14" y2="18.5"/>',
        batteries: '<rect x="2" y="7" width="16" height="10" rx="2.5"/><line x1="21.5" y1="10.5" x2="21.5" y2="13.5"/><line x1="6" y1="12" x2="13" y2="12"/>',
        charging: '<path d="M13 2 4 13.5h6.2L9.6 22 20 10.5h-6.4z"/>',
        cameras: '<path d="M22 19.5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2h3l1.7-2.5h6.6L17 6.5h3a2 2 0 0 1 2 2z"/><circle cx="12" cy="13.5" r="3.6"/>',
        housing: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M9 6h6"/><circle cx="12" cy="17" r="1.4"/>',
        flex: '<path d="M3 8h5.5a3 3 0 0 1 3 3v2a3 3 0 0 0 3 3H21"/><rect x="2" y="5.5" width="3" height="5" rx="1"/><rect x="19" y="13.5" width="3" height="5" rx="1"/>',
        audio: '<path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z"/><path d="M16 9a4.5 4.5 0 0 1 0 6"/><path d="M18.5 6.5a8 8 0 0 1 0 11"/>',
        adhesive: '<path d="M4 7.5h13a3.5 3.5 0 0 1 0 7H7a3.5 3.5 0 0 0 0 7h13"/>',
        tools: '<path d="M14.6 6.4a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>',
        protection: '<path d="M12 2.5 20 6v6c0 4.6-3.2 8.4-8 9.5-4.8-1.1-8-4.9-8-9.5V6z"/>',
        accessories: '<path d="M7 3.5v6a5 5 0 0 0 10 0v-6"/><path d="M9 3.5v3M15 3.5v3"/><path d="M12 14.5v6"/>',
        other: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v9M7.5 12h9"/>'
    };
    const familyOrder = ['iphone', 'samsung', 'ipad', 'watch', 'pixel', 'macbook'];
    const productSections = [
        {id: 'popular', mode: 'slider', kicker: 'popularKicker', title: 'popularProducts', query: 'featured=1&limit=8', filters: {featured: '1'}},
        {id: 'recent', mode: 'grid', kicker: 'recentKicker', title: 'recentProducts', query: 'sort=newest&limit=8', filters: {sort: 'newest'}},
        {id: 'iphone', mode: 'slider', kicker: 'iphoneKicker', title: 'bestSellingIphoneParts', query: 'family=iphone&sort=best_selling&limit=8', filters: {family: 'iphone'}},
        {id: 'samsung', mode: 'grid', kicker: 'samsungKicker', title: 'topSellingSamsungParts', query: 'family=samsung&sort=best_selling&limit=8', filters: {family: 'samsung'}},
        {id: 'screens', mode: 'slider', kicker: 'screensKicker', title: 'screenParts', query: 'category=1&sort=stock&limit=8', filters: {category: '1', sort: 'stock'}},
        {id: 'supplies', mode: 'grid', kicker: 'suppliesKicker', title: 'repairSupplies', query: 'department=supplies&sort=stock&limit=8', filters: {department: 'supplies', sort: 'stock'}}
    ];

    const L = window.HomeLanding = {
        icon(slug) {
            return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[slug] || icons.other}</svg>`;
        },
        arrow() {
            return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13"/><path d="m12 5 7 7-7 7"/></svg>';
        },
        catalogUrl(changes) {
            return window.Discovery.buildUrl(new URLSearchParams(), changes);
        },
        skeleton(items, className) {
            return Array.from({length: items}, () => `<div class="lp-skeleton ${className}" aria-hidden="true"></div>`).join('');
        },
        productSectionsShell() {
            return productSections.map(section => `<section class="lp-section lp-product-section" data-lp-product-section="${section.id}" aria-labelledby="lp-${section.id}-title">
                <header class="lp-section-head">
                    <div>
                        <p class="lp-kicker">${t(section.kicker)}</p>
                        <h2 id="lp-${section.id}-title">${t(section.title)}</h2>
                    </div>
                    <div class="lp-product-section-actions">
                        ${section.mode === 'slider' ? `<div class="lp-slider-controls" aria-label="${t('sliderControls')}">
                            <button type="button" data-lp-slider="-1" aria-label="${t('previousProducts')}">‹</button>
                            <button type="button" data-lp-slider="1" aria-label="${t('nextProducts')}">›</button>
                        </div>` : ''}
                        <a class="lp-section-link" href="${L.catalogUrl(section.filters)}">${t('viewAllProducts')} ${L.arrow()}</a>
                    </div>
                </header>
                <div class="${section.mode === 'slider' ? 'lp-product-slider' : 'lp-product-grid'}" data-lp-product-list>
                    ${L.skeleton(8, 'lp-skeleton-product')}
                </div>
            </section>`).join('');
        },
        shell() {
            return `<div class="lp">
                <section class="lp-hero" aria-labelledby="lp-hero-title">
                    <div class="lp-hero-mesh" aria-hidden="true"></div>
                    <div class="lp-hero-body">
                        <p class="lp-eyebrow">${t('heroEyebrow')}</p>
                        <h1 id="lp-hero-title">${t('heroTitle')}</h1>
                        <p class="lp-lead" data-lp-lead>${t('heroLead')}</p>
                        <form class="lp-search" role="search" data-search-root>
                            <label class="lp-sr-only" for="home-search">${t('searchCatalogueLabel')}</label>
                            <div class="lp-search-field">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7.5"/><path d="m21 21-4.3-4.3"/></svg>
                                <input type="search" id="home-search" name="q" placeholder="${t('smartSearchPrompt')}" aria-label="${t('smartSearchPrompt')}" autocomplete="off" role="combobox" aria-autocomplete="list" aria-haspopup="dialog" aria-expanded="false" aria-controls="home-search-suggestions" aria-describedby="home-search-hint">
                                <button type="submit" class="lp-search-submit">${t('smartSearch')}</button>
                            </div>
                            <div id="home-search-suggestions" class="search-suggestions b2b-search-results" role="dialog" aria-label="${t('orderDirectly')}" style="display:none;"></div>
                            <p class="lp-search-hint" id="home-search-hint"><strong>${t('writeYourWay')}</strong> ${t('smartSearchExplainer')} <span>${t('orderResults')}</span></p>
                        </form>
                        <nav class="lp-chips" data-lp-chips aria-label="${t('goDeviceFamily')}"></nav>
                        <dl class="lp-stats" data-lp-stats></dl>
                    </div>
                </section>

                <div class="lp-alert alert error" data-lp-error hidden role="alert"></div>

                <div class="lp-product-sections" data-lp-product-sections>${L.productSectionsShell()}</div>

                <section class="lp-section" aria-labelledby="lp-categories-title">
                    <header class="lp-section-head">
                        <div>
                            <p class="lp-kicker">${t('catalogue')}</p>
                            <h2 id="lp-categories-title">${t('chooseYourPart')}</h2>
                        </div>
                        <a class="lp-section-link" href="${window.APP_BASE}catalog">${t('shopCatalogue')} ${L.arrow()}</a>
                    </header>
                    <div class="lp-grid lp-categories" data-lp-categories>${L.skeleton(8, 'lp-skeleton-card')}</div>
                </section>

                <section class="lp-section" aria-labelledby="lp-devices-title">
                    <header class="lp-section-head">
                        <div>
                            <p class="lp-kicker">${t('devices')}</p>
                            <h2 id="lp-devices-title">${t('findDeviceParts')}</h2>
                        </div>
                    </header>
                    <div class="lp-devices">
                        <nav class="lp-families" data-lp-families aria-label="Device families">${L.skeleton(4, 'lp-skeleton-row')}</nav>
                        <aside class="lp-models" aria-labelledby="lp-models-title">
                            <h3 id="lp-models-title">${t('latestModels')}</h3>
                            <p class="lp-models-note">${t('modelsNote')}</p>
                            <div class="lp-model-chips" data-lp-models>${L.skeleton(6, 'lp-skeleton-chip')}</div>
                            <a class="lp-models-all" href="${window.APP_BASE}catalog" data-lp-models-all>${t('viewAllModels', {count: ''})} ${L.arrow()}</a>
                        </aside>
                    </div>
                </section>

                <section class="lp-method" aria-labelledby="lp-method-title">
                        <h2 id="lp-method-title" class="lp-sr-only">${t('howOrder')}</h2>
                    <ol class="lp-method-list">
                        <li><span class="lp-step">01</span><h3>${t('searchByModel')}</h3><p>${t('searchByModelCopy')}</p></li>
                        <li><span class="lp-step">02</span><h3>${t('checkStock')}</h3><p>${t('checkStockCopy')}</p></li>
                        <li><span class="lp-step">03</span><h3>${t('ownPrices')}</h3><p>${t('ownPricesCopy')}</p></li>
                        <li><span class="lp-step">04</span><h3>${t('orderOneStep')}</h3><p>${t('orderOneStepCopy')}</p></li>
                    </ol>
                </section>

                <section class="lp-cta" aria-labelledby="lp-cta-title">
                    <div>
                        <h2 id="lp-cta-title">${t('completeCatalogue')}</h2>
                        <p data-lp-cta-note>${t('catalogueInOnePlace')}</p>
                    </div>
                    <div class="lp-cta-actions">
                        <a class="lp-btn lp-btn-primary" href="${window.APP_BASE}catalog">${t('shopCatalogue')} ${L.arrow()}</a>
                        <a class="lp-btn lp-btn-ghost" href="${window.APP_BASE}login" data-lp-login>${t('signInPrices')}</a>
                    </div>
                </section>
            </div>`;
        },
        renderStats(catalog) {
            const models = (catalog.models || []).length;
            const categories = (catalog.categories || []).filter(item => Number(item.count) > 0).length;
            return [
                [count(catalog.total), t(Number(catalog.total) === 1 ? 'part' : 'parts')],
                [count(models), t(models === 1 ? 'model' : 'models')],
                [count(categories), t(categories === 1 ? 'category' : 'categories')]
            ].map(([value, label]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('');
        },
        renderChips(catalog) {
            return (catalog.device_families || [])
                .filter(item => Number(item.count) > 0)
                .sort((a, b) => Number(b.count) - Number(a.count))
                .slice(0, 4)
                .map(item => `<a href="${L.catalogUrl({family: item.id})}">${esc(item.label)}<small>${count(item.count)}</small></a>`)
                .join('');
        },
        renderCategories(catalog) {
            const categories = window.App.sortCategories(catalog.categories || []).filter(item => Number(item.count) > 0);
            if (!categories.length) return `<p class="lp-empty">${t('noCategories')}</p>`;
            return categories.map(item => `<a class="lp-category" href="${L.catalogUrl({category: item.id})}">
                <span class="lp-category-icon">${L.icon(item.slug)}</span>
                <span class="lp-category-name">${esc(window.I18n.dictionaries.en[item.slug] ? labels(item.slug) : item.name)}</span>
                <span class="lp-category-count">${count(item.count)} ${window.I18n.t(Number(item.count) === 1 ? 'part' : 'parts')}</span>
                <span class="lp-category-go" aria-hidden="true">${L.arrow()}</span>
            </a>`).join('');
        },
        renderFamilies(catalog) {
            const families = (catalog.device_families || []).filter(item => Number(item.count) > 0);
            if (!families.length) return `<p class="lp-empty">${t('noFamilies')}</p>`;
            const rank = item => {
                const index = familyOrder.indexOf(item.id);
                return index === -1 ? familyOrder.length : index;
            };
            return families.sort((a, b) => rank(a) - rank(b) || Number(b.count) - Number(a.count))
                .map(item => `<a class="lp-family" href="${L.catalogUrl({family: item.id})}">
                    <span class="lp-family-name">${esc(item.label)}</span>
                    <span class="lp-family-count">${count(item.count)} ${t(Number(item.count) === 1 ? 'part' : 'parts')}</span>
                    <span class="lp-family-go" aria-hidden="true">${L.arrow()}</span>
                </a>`).join('');
        },
        renderModels(catalog) {
            const models = (catalog.models || []).filter(item => Number(item.count) > 0)
                .slice()
                .sort((a, b) => Number(b.sort_order || 0) - Number(a.sort_order || 0) || a.name.localeCompare(b.name, 'en', {numeric: true}))
                .slice(0, 8);
            if (!models.length) return `<p class="lp-empty">${t('noModelsYet')}</p>`;
            return models.map(item => `<a class="lp-model-chip" href="${L.catalogUrl({model: item.id})}">${esc(item.name)}<small>${count(item.count)}</small></a>`).join('');
        },
        renderProducts(result) {
            const products = (result && result.products) || [];
            if (!products.length) return `<p class="lp-empty">${t('noProductsAvailable')}</p>`;
            return products.map(product => {
                const url = `${window.APP_BASE}products/${product.id}`;
                const stockClass = product.stock > 0 ? 'is-ok' : 'is-out';
                const stockText = product.stock > 0 ? `${count(product.stock)} ${t('inStock').toLocaleLowerCase()}` : t('outOfStock');
                const thumb = window.App.thumbnailUrl ? window.App.thumbnailUrl({url: product.image_url}) : product.image_url;
                const media = product.image_url
                    ? `<img src="${esc(thumb)}" alt="" loading="lazy" decoding="async" data-lp-normalize>`
                    : `<span class="lp-product-placeholder" aria-hidden="true">${L.icon('other')}</span>`;
                const price = product.price_cents !== null && product.price_cents !== undefined
                    ? `<span class="lp-product-price">${esc(window.Core.formatMoney(product.price_cents, product.currency))}</span>`
                    : (window.Core.user
                        ? `<span class="lp-product-login">${t('unavailable')}</span>`
                        : `<a class="lp-product-login" href="${window.APP_BASE}login">${t('signInPrices')}</a>`);
                const canBuy = typeof window.App.canOrderProduct === 'function' && window.App.canOrderProduct(product);
                const quantity = Math.max(1, Number(product.minimum_quantity) || 1);
                const action = canBuy
                    ? `<button type="button" class="lp-product-add" data-lp-add="${product.id}" data-lp-quantity="${quantity}" aria-label="${t('add')} ${esc(product.name)}">${t('addToCart')}</button>`
                    : '';
                const context = (product.models || []).map(model => model.name).join(', ') || product.category_name || '';
                return `<article class="lp-product">
                    <a class="lp-product-media" href="${url}" tabindex="-1" aria-hidden="true">${media}</a>
                    <div class="lp-product-body">
                        ${context ? `<p class="lp-product-context">${esc(context)}</p>` : ''}
                        <h3 class="lp-product-name"><a href="${url}">${esc(product.name)}</a></h3>
                        <p class="lp-product-meta"><span class="lp-product-sku">${esc(product.sku)}</span>${product.quality ? `<span class="lp-product-quality">${esc(product.quality)}</span>` : ''}</p>
                        <p class="lp-product-stock ${stockClass}"><span aria-hidden="true"></span>${stockText}</p>
                        <div class="lp-product-foot">${price}${action}</div>
                    </div>
                </article>`;
            }).join('');
        },
        normalizeProductImage(img) {
            if (!img?.naturalWidth || !img?.naturalHeight || !img.parentElement) return;
            const sampleSize = 112;
            const canvas = document.createElement('canvas');
            canvas.width = sampleSize;
            canvas.height = sampleSize;
            const context = canvas.getContext('2d', {willReadFrequently: true});
            if (!context) return;
            context.fillStyle = '#fff';
            context.fillRect(0, 0, sampleSize, sampleSize);
            context.drawImage(img, 0, 0, sampleSize, sampleSize);
            const pixels = context.getImageData(0, 0, sampleSize, sampleSize).data;
            const corners = [[2, 2], [sampleSize - 3, 2], [2, sampleSize - 3], [sampleSize - 3, sampleSize - 3]];
            const background = corners.reduce((rgb, [x, y]) => {
                const index = (y * sampleSize + x) * 4;
                return [rgb[0] + pixels[index], rgb[1] + pixels[index + 1], rgb[2] + pixels[index + 2]];
            }, [0, 0, 0]).map(value => value / corners.length);
            let left = sampleSize;
            let top = sampleSize;
            let right = -1;
            let bottom = -1;
            for (let y = 0; y < sampleSize; y++) {
                for (let x = 0; x < sampleSize; x++) {
                    const index = (y * sampleSize + x) * 4;
                    if (pixels[index + 3] < 32) continue;
                    const distance = Math.abs(pixels[index] - background[0])
                        + Math.abs(pixels[index + 1] - background[1])
                        + Math.abs(pixels[index + 2] - background[2]);
                    if (distance < 54) continue;
                    left = Math.min(left, x);
                    top = Math.min(top, y);
                    right = Math.max(right, x);
                    bottom = Math.max(bottom, y);
                }
            }
            if (right <= left || bottom <= top) return;
            const media = img.parentElement;
            const width = media.clientWidth;
            const height = media.clientHeight;
            if (!width || !height) return;
            const contain = Math.min(width / img.naturalWidth, height / img.naturalHeight);
            const imageWidth = img.naturalWidth * contain;
            const imageHeight = img.naturalHeight * contain;
            const contentLeft = (width - imageWidth) / 2 + (left / sampleSize) * imageWidth;
            const contentTop = (height - imageHeight) / 2 + (top / sampleSize) * imageHeight;
            const contentWidth = ((right - left + 1) / sampleSize) * imageWidth;
            const contentHeight = ((bottom - top + 1) / sampleSize) * imageHeight;
            const scale = Math.max(0.85, Math.min(2.35, width * 0.52 / contentWidth, height * 0.66 / contentHeight));
            const contentCenterX = contentLeft + contentWidth / 2;
            const contentCenterY = contentTop + contentHeight / 2;
            img.style.setProperty('--lp-image-scale', scale.toFixed(3));
            img.style.setProperty('--lp-image-x', `${(-(contentCenterX - width / 2) * scale).toFixed(1)}px`);
            img.style.setProperty('--lp-image-y', `${(-(contentCenterY - height / 2) * scale).toFixed(1)}px`);
            img.dataset.lpNormalized = 'true';
        },
        bindProductImages(root) {
            root.querySelectorAll('[data-lp-normalize]').forEach(img => {
                const normalize = () => L.normalizeProductImage(img);
                if (img.complete) normalize();
                else img.addEventListener('load', normalize, {once: true});
            });
        },
        paint(root, catalog) {
            const set = (selector, html) => {
                const node = root.querySelector(selector);
                if (node) node.innerHTML = html;
            };
            const total = count(catalog.total);
            const models = (catalog.models || []).length;
            set('[data-lp-stats]', L.renderStats(catalog));
            set('[data-lp-chips]', L.renderChips(catalog));
            set('[data-lp-categories]', L.renderCategories(catalog));
            set('[data-lp-families]', L.renderFamilies(catalog));
            set('[data-lp-models]', L.renderModels(catalog));
            const lead = root.querySelector('[data-lp-lead]');
            if (lead) lead.textContent = `${t('heroLead')} ${total} ${t('parts')} ${t('modelsOfTotal', {shown: count(models), total: count(models)})}.`;
            const modelsAll = root.querySelector('[data-lp-models-all]');
            if (modelsAll) modelsAll.firstChild.textContent = `${t('viewAllModels', {count: count(models)})} `;
            const note = root.querySelector('[data-lp-cta-note]');
            if (note) note.textContent = `${total} ${t('parts')} · ${t('filterProducts')}`;
            const login = root.querySelector('[data-lp-login]');
            if (login && window.Core.user) login.hidden = true;
        },
        failed(root, error) {
            const notice = root.querySelector('[data-lp-error]');
            if (!notice) return;
            notice.hidden = false;
            notice.innerHTML = `<p>${t('catalogueCouldNotLoad', {message: error.message || ''})}</p><button type="button" class="lp-btn lp-btn-ghost" data-lp-retry>${t('retry')}</button>`;
            root.querySelectorAll('[data-lp-categories], [data-lp-families], [data-lp-models]').forEach(node => { node.innerHTML = ''; });
        },
        slideProducts(track, direction) {
            if (track.dataset.sliding === 'true' || track.children.length < 2) return;
            const first = track.firstElementChild;
            const last = track.lastElementChild;
            const gap = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap) || 0;
            const step = first.getBoundingClientRect().width + gap;
            const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
            track.dataset.sliding = 'true';

            const finish = () => {
                track.style.transition = 'none';
                track.style.transform = '';
                track.dataset.sliding = 'false';
            };

            if (direction > 0) {
                if (reducedMotion) {
                    track.append(first);
                    finish();
                    return;
                }
                track.style.transition = 'transform 320ms cubic-bezier(.22,.61,.36,1)';
                track.style.transform = `translate3d(${-step}px,0,0)`;
                track.addEventListener('transitionend', () => {
                    track.append(first);
                    finish();
                }, {once: true});
                return;
            }

            track.prepend(last);
            track.style.transition = 'none';
            track.style.transform = `translate3d(${-step}px,0,0)`;
            track.getBoundingClientRect();
            if (reducedMotion) {
                finish();
                return;
            }
            requestAnimationFrame(() => {
                track.style.transition = 'transform 320ms cubic-bezier(.22,.61,.36,1)';
                track.style.transform = 'translate3d(0,0,0)';
                track.addEventListener('transitionend', finish, {once: true});
            });
        },
        bind(root) {
            const input = root.querySelector('#home-search');
            const form = root.querySelector('.lp-search');
            input.addEventListener('input', () => window.App.handleSearchInput(input.value, 'home-search'));
            input.addEventListener('focus', () => window.App.handleSearchFocus('home-search'));
            input.addEventListener('keydown', event => window.App.handleSearchKeydown(event));
            form.addEventListener('submit', event => {
                event.preventDefault();
                window.UI.closeSuggestions();
                window.Router.navigate(L.catalogUrl({q: input.value.trim()}));
            });
            root.addEventListener('click', event => {
                const add = event.target.closest('[data-lp-add]');
                if (add) {
                    window.App.addToCartWithQty(Number(add.dataset.lpAdd), Number(add.dataset.lpQuantity), add);
                    return;
                }
                if (event.target.closest('[data-lp-retry]')) L.load(root);
                const slider = event.target.closest('[data-lp-slider]');
                if (slider) {
                    const track = slider.closest('[data-lp-product-section]')?.querySelector('[data-lp-product-list]');
                    if (track) L.slideProducts(track, Number(slider.dataset.lpSlider));
                }
            });
        },
        loadSequence: 0,
        async load(root) {
            const version = window.Router.renderVersion;
            const sequence = ++L.loadSequence;
            // A retry starts a second read; only the newest attempt may paint.
            const stale = () => !root.isConnected || version !== window.Router.renderVersion || sequence !== L.loadSequence;
            const notice = root.querySelector('[data-lp-error]');
            if (notice) notice.hidden = true;
            const feedRequests = productSections.map(async section => {
                const container = root.querySelector(`[data-lp-product-section="${section.id}"] [data-lp-product-list]`);
                if (!container) return;
                try {
                    const result = await window.Core.fetch(`/products?${section.query}`);
                    if (stale()) return;
                    container.innerHTML = L.renderProducts(result);
                    L.bindProductImages(container);
                } catch (_) {
                    if (!stale()) container.innerHTML = `<p class="lp-empty">${t('productsCouldNotLoad')}</p>`;
                }
            });
            try {
                const catalog = await window.Core.fetch('/catalog');
                if (stale()) return;
                L.paint(root, catalog);
            } catch (error) {
                if (stale()) return;
                L.failed(root, error);
            }
            await Promise.allSettled(feedRequests);
        },
        mount(root) {
            root.innerHTML = L.shell();
            window.UI.closeSuggestions();
            L.bind(root);
            return L.load(root);
        }
    };
})();
