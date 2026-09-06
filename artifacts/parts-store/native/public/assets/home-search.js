(function () {
    const esc = window.Core.escapeHtml;
    const labels = {screens: 'LCD & schermen', batteries: 'Batterijen', charging: 'Laadpoorten', cameras: "Camera’s", housing: 'Behuizing & onderdelen', flex: 'Flexkabels', audio: 'Speakers & audio', adhesive: 'Adhesive', tools: 'Gereedschap', protection: 'Hoesjes & bescherming', accessories: 'Kabels & accessoires', other: 'Overige onderdelen'};
    const H = window.HomeSearch = {
        parameters(params, changes = {}) {
            return new URLSearchParams(window.Discovery.buildUrl(params, changes).split('?')[1] || '');
        },
        requests(params) {
            const products = new URLSearchParams(params);
            products.set('limit', '8');
            return ['/catalog?' + params.toString(), '/products?' + products.toString()];
        },
        controller(initial, io) {
            let params = H.parameters(initial);
            let sequence = 0, timer, abort;
            const run = async revision => {
                if (!io.active()) return;
                abort = new AbortController();
                try {
                    const data = await io.load(new URLSearchParams(params), abort.signal);
                    if (revision === sequence && io.active()) io.render(data, new URLSearchParams(params));
                } catch (error) {
                    if (revision === sequence && io.active() && error.name !== 'AbortError') io.error(error);
                }
            };
            const refresh = (immediate = true) => {
                clearTimeout(timer);
                abort?.abort();
                const revision = ++sequence;
                io.busy();
                if (immediate) return run(revision);
                timer = setTimeout(() => run(revision), io.delay ?? 220);
            };
            return {
                start: () => refresh(),
                change(changes, {typing = false} = {}) {
                    params = H.parameters(params, changes);
                    io.sync(new URLSearchParams(params), typing);
                    return refresh(!typing);
                },
                // A newly typed model must not remain constrained by the previous device.
                search(query) { return this.change({q: query.trim(), model: '', brand: '', family: ''}, {typing: true}); },
                reset() { params = new URLSearchParams(); io.sync(params, false); return refresh(); },
                current: () => new URLSearchParams(params)
            };
        },
        shell(params) {
            return `<section class="instant-home" aria-labelledby="instant-home-title">
                <div class="instant-intro">
                    <div class="intro-text">
                        <h1 id="instant-home-title">Onderdelen</h1>
                    </div>
                </div>

                <form class="instant-search" role="search" data-search-root>
                    <label for="home-search" class="instant-sr-only">Zoek direct in het assortiment</label>
                    <div class="search-input-container">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                        <input type="search" id="home-search" name="q" value="${esc(params.get('q') || '')}" placeholder="Wat zoekt u? Zoek product, SKU of model…" autocomplete="off" role="combobox" aria-autocomplete="list" aria-haspopup="dialog" aria-expanded="false" aria-controls="home-search-suggestions" aria-describedby="home-search-hint">
                    </div>
                    <div id="home-search-suggestions" class="search-suggestions b2b-search-results" role="dialog" aria-label="Producten direct bestellen" style="display:none;"></div>
                    <span class="instant-search-note" id="home-search-hint">Vanaf 3 tekens · direct toevoegen aan uw winkelwagen</span>
                </form>

                <div class="instant-categories-strip">
                    <div class="instant-category-options" role="group" aria-label="Onderdeel kiezen"></div>
                </div>

                <section class="instant-models" aria-label="Model kiezen" hidden>
                    <div class="instant-model-title">
                        <h2>Toestel en model</h2>
                        <div class="instant-model-meta">
                            <span data-home-model-count></span>
                            <button type="button" class="btn btn-outline" data-home-refine>Model zoeken</button>
                        </div>
                    </div>
                    <nav class="instant-family-options" data-home-family-options aria-label="Kies een toestelfamilie"></nav>
                    <p class="instant-model-help text-muted"></p>
                    <div class="instant-model-options" id="home-model-options" role="group" aria-label="Beschikbare modellen"></div>
                </section>

                <div class="instant-selection" aria-label="Gekozen filters"></div>

                <section class="instant-results" id="home-live-results" aria-busy="true" aria-label="Producten">
                    <div class="instant-results-heading">
                        <h2 data-home-heading tabindex="-1">Assortiment</h2>
                        <div data-home-status role="status" aria-live="polite" class="text-muted"></div>
                    </div>
                    <div data-home-error class="alert error" hidden></div>
                    <div class="b2b-products" data-home-products></div>
                    <div class="results-actions">
                        <a class="btn btn-outline instant-all-results" data-home-all href="${window.APP_BASE}catalog" hidden></a>
                    </div>
                </section>
            </section>`;
        },
        paint(root, data, params) {
            const [catalog, result] = data;
            const filtered = Boolean(params.toString());
            const categories = window.App.sortCategories(catalog.categories);
            const category = params.get('category') || '';
            const model = catalog.models.find(item => String(item.id) === params.get('model'));
            const query = window.FastFinder.modelQuery(params.get('q'));
            const family = params.get('family') || model?.family || '';
            const browseFamily = Boolean(family && (params.get('family') || !query));
            const searched = window.CategoryModels.shortlist(catalog, query, params.get('model'));
            const choices = browseFamily ? window.CategoryModels.familyModels(catalog, family) : searched.models;
            const modelTotal = browseFamily ? choices.length : searched.total;
            const currentFocus = document.activeElement;
            const focusKey = currentFocus?.dataset?.homeCategory !== undefined ? ['homeCategory', currentFocus.dataset.homeCategory]
                : currentFocus?.dataset?.homeModel !== undefined ? ['homeModel', currentFocus.dataset.homeModel] : null;
            root.querySelector('.instant-category-options').innerHTML = `<button type="button" data-home-category="" aria-pressed="${!category}">
                <div class="cat-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2v20M2 12h20"/></svg></div>
                <span>Alles</span>
            </button>` + categories
                .filter(item => Number(item.count) > 0 || String(item.id) === category)
                .map(item => {
                    let icon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>';
                    if (item.slug === 'batteries') icon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="16" height="12" rx="2" ry="2"/><line x1="22" y1="10" x2="22" y2="14"/><line x1="6" y1="12" x2="14" y2="12"/></svg>';
                    if (item.slug === 'screens') icon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>';
                    if (item.slug === 'charging') icon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>';
                    if (item.slug === 'cameras') icon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
                    if (item.slug === 'tools') icon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>';

                    return `<button type="button" data-home-category="${item.id}" aria-pressed="${String(item.id) === category}">
                        <div class="cat-icon">${icon}</div>
                        <span>${esc(labels[item.slug] || item.name)}</span>
                    </button>`;
                }).join('');
            const families = (catalog.device_families || []).filter(item => Number(item.count) > 0 || item.id === family);
            const showModels = Boolean(category || params.get('q') || model || family);
            root.querySelector('.instant-models').hidden = !showModels;
            root.querySelector('[data-home-family-options]').innerHTML = families.map(item => `<button type="button" data-home-family="${esc(item.id)}" aria-pressed="${item.id === family}"><strong>${esc(item.label)}</strong><small aria-label="${Number(item.count)} onderdelen" title="${Number(item.count)} onderdelen">${Number(item.count)}</small></button>`).join('');
            root.querySelector('[data-home-model-count]').textContent = family || query ? `${choices.length < modelTotal ? choices.length + ' van ' : ''}${modelTotal} ${modelTotal === 1 ? 'model' : 'modellen'}` : '';
            root.querySelector('.instant-model-help').textContent = query
                ? choices.length < modelTotal ? 'Typ verder om uw exacte model te vinden.' : 'Kies uw uitvoering voor de juiste onderdelen.'
                : family ? 'Alle modellen · van nieuw naar oud' : 'Kies een toestelfamilie of zoek direct op model.';
            root.querySelector('[data-home-refine]').textContent = model ? 'Ander model' : 'Model zoeken';
            root.querySelector('.instant-model-options').innerHTML = choices.map(item => `<button type="button" data-home-model="${item.id}" aria-pressed="${String(item.id) === params.get('model')}"><span>${esc(item.name)}</span><small aria-label="${Number(item.count)} onderdelen">${Number(item.count)}</small></button>`).join('');
            root.querySelector('.instant-selection').innerHTML = `${model ? `<button type="button" class="btn btn-outline" style="padding: 0.25rem 1rem; font-size: 0.875rem;" data-home-remove-model aria-label="Model ${esc(model.name)} verwijderen">${esc(model.name)} <span aria-hidden="true" style="margin-left: 0.25rem;">×</span></button>` : ''}${filtered ? `<button type="button" class="btn btn-outline" style="padding: 0.25rem 1rem; font-size: 0.875rem;" data-home-reset>Alles wissen</button>` : ''}`;
            root.querySelector('[data-home-heading]').textContent = filtered ? 'Gevonden onderdelen' : 'Assortiment';
            root.querySelector('[data-home-status]').textContent = `${result.total.toLocaleString('nl-NL')} ${result.total === 1 ? 'onderdeel' : 'onderdelen'}${params.get('q') ? ' voor “' + params.get('q') + '”' : ''}`;
            root.querySelector('[data-home-products]').innerHTML = result.products.length
                ? window.App.renderProductTable(result.products)
                : `<div class="instant-empty"><strong>Geen passende onderdelen gevonden.</strong><p>Probeer een andere zoekterm${filtered ? ' of wis uw selectie' : ''}.</p>${filtered ? '<button type="button" data-home-reset>Alles wissen</button>' : ''}</div>`;
            const all = root.querySelector('[data-home-all]');
            all.hidden = !result.products.length;
            all.href = window.Discovery.buildUrl(params);
            all.textContent = filtered ? `Bekijk alle ${result.total.toLocaleString('nl-NL')} onderdelen →` : 'Bekijk het volledige assortiment →';
            root.querySelector('[data-home-error]').hidden = true;
            root.querySelector('.instant-results').setAttribute('aria-busy', 'false');
            root.classList.remove('is-searching');
            if (focusKey) {
                const buttons = [...root.querySelectorAll('[data-home-category], [data-home-model]')];
                buttons.find(button => button.dataset[focusKey[0]] === focusKey[1])?.focus({preventScroll: true});
            }
        },
        mount(root, params, version) {
            root.innerHTML = H.shell(params);
            window.UI.closeSuggestions();
            const input = root.querySelector('#home-search');
            let currentCatalog;
            let focusResultsAfterModel = false;
            const controller = H.controller(params, {
                active: () => root.isConnected && version === window.Router.renderVersion,
                load: (selection, signal) => Promise.all(H.requests(selection).map(url => window.Core.fetch(url, {signal}))),
                sync(selection, typing) {
                    const url = window.APP_BASE + (selection.toString() ? '?' + selection.toString() : '');
                    if (url !== location.pathname + location.search) history[typing ? 'replaceState' : 'pushState']({}, '', url);
                },
                busy() {
                    root.classList.add('is-searching');
                    root.querySelector('.instant-results').setAttribute('aria-busy', 'true');
                    root.querySelector('[data-home-status]').textContent = 'Zoeken…';
                    root.querySelector('[data-home-products]').inert = true;
                    root.querySelector('[data-home-all]').inert = true;
                    root.querySelectorAll('[data-home-model]').forEach(button => { button.disabled = true; });
                },
                render(data, selection) {
                    currentCatalog = data[0];
                    H.paint(root, data, selection);
                    root.querySelector('[data-home-products]').inert = false;
                    root.querySelector('[data-home-all]').inert = false;
                    if (focusResultsAfterModel) {
                        focusResultsAfterModel = false;
                        const heading = root.querySelector('[data-home-heading]');
                        heading.focus({preventScroll: true});
                        heading.scrollIntoView({block: 'start'});
                    }
                },
                error() {
                    root.classList.remove('is-searching');
                    root.querySelector('[data-home-heading]').textContent = 'Zoeken niet gelukt';
                    root.querySelector('[data-home-status]').textContent = '';
                    root.querySelector('[data-home-products]').innerHTML = '';
                    root.querySelector('[data-home-all]').hidden = true;
                    root.querySelector('.instant-results').setAttribute('aria-busy', 'false');
                    const error = root.querySelector('[data-home-error]');
                    error.hidden = false;
                    error.innerHTML = '<p>De onderdelen konden niet worden opgehaald.</p><button type="button" data-home-retry>Opnieuw proberen</button>';
                }
            });
            input.addEventListener('input', () => {
                window.App.handleSearchInput(input.value, 'home-search');
                if (!input.value.trim()) controller.search('');
            });
            input.addEventListener('focus', () => window.App.handleSearchFocus('home-search'));
            input.addEventListener('keydown', event => window.App.handleSearchKeydown(event));
            root.addEventListener('keydown', event => {
                if (!event.target.hasAttribute('data-home-model')) return;
                const models = [...root.querySelectorAll('[data-home-model]:not(:disabled)')];
                const index = models.indexOf(event.target);
                if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(event.key) && models.length) {
                    event.preventDefault();
                    const delta = ['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1;
                    models[(index + delta + models.length) % models.length].focus();
                }
                if (event.key === 'Escape') { event.preventDefault(); input.focus(); }
            });
            root.querySelector('.instant-search').addEventListener('submit', event => {
                event.preventDefault();
                window.UI.closeSuggestions();
                controller.change({q: input.value.trim(), model: '', brand: '', family: ''});
            });
            root.addEventListener('click', event => {
                const target = event.target.closest('button');
                if (!target) return;
                if (target.hasAttribute('data-home-category')) controller.change({category: target.dataset.homeCategory});
                if (target.hasAttribute('data-home-family')) {
                    const selection = controller.current();
                    controller.change({family: target.dataset.homeFamily, model: '', q: window.CategoryModels.cleanFamilyQuery(currentCatalog, selection.get('q'))});
                }
                if (target.hasAttribute('data-home-model')) {
                    const model = currentCatalog?.models.find(item => String(item.id) === target.dataset.homeModel);
                    if (model) window.FastFinder.remember(model);
                    focusResultsAfterModel = true;
                    controller.change({model: target.dataset.homeModel});
                }
                if (target.hasAttribute('data-home-refine')) { input.focus(); input.select(); }
                if (target.hasAttribute('data-home-remove-model')) controller.change({model: ''});
                if (target.hasAttribute('data-home-reset')) { input.value = ''; controller.reset(); }
                if (target.hasAttribute('data-home-retry')) controller.start();
            });
            return controller.start();
        }
    };
})();