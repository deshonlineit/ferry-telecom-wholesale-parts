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
                search(query) { return this.change({q: query.trim(), model: '', brand: ''}, {typing: true}); },
                reset() { params = new URLSearchParams(); io.sync(params, false); return refresh(); },
                current: () => new URLSearchParams(params)
            };
        },
        shell(params) {
            return `<section class="instant-home" aria-labelledby="instant-home-title">
                <div class="instant-intro"><div><h1 id="instant-home-title">Wat zoekt u?</h1><p>Typ een onderdeel, model of SKU. De producten verschijnen meteen.</p></div><a href="${window.APP_BASE}catalog">Volledig assortiment →</a></div>
                <form class="instant-search" role="search">
                    <label for="home-search" class="instant-sr-only">Zoek direct in het assortiment</label>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/></svg>
                    <input type="search" id="home-search" name="q" value="${esc(params.get('q') || '')}" placeholder="Bijvoorbeeld iPhone 13 LCD…" autocomplete="off" aria-controls="home-live-results">
                    <span class="instant-search-note">Zoekt terwijl u typt</span>
                </form>
                <div class="instant-categories"><span class="instant-label">Of kies een onderdeel</span><div class="instant-category-options" role="group" aria-label="Onderdeel kiezen"></div></div>
                <section class="instant-models" aria-label="Model kiezen" hidden>
                    <div class="instant-model-title"><span class="instant-label">Welk model? <small>Alleen als u wilt verfijnen</small></span><span data-home-model-count></span></div>
                    <div class="instant-model-options" role="group" aria-label="Beschikbare modellen"></div>
                </section>
                <div class="instant-selection" aria-label="Gekozen filters"></div>
                <section class="instant-results" id="home-live-results" aria-busy="true" aria-label="Producten">
                    <div class="instant-results-heading"><h2 data-home-heading>Producten ophalen…</h2><span data-home-status role="status" aria-live="polite"></span></div>
                    <div data-home-error hidden></div><div class="product-container view-list" data-home-products></div>
                    <a class="instant-all-results" data-home-all href="${window.APP_BASE}catalog" hidden></a>
                </section>
            </section>`;
        },
        paint(root, data, params) {
            const [catalog, result] = data;
            const filtered = Boolean(params.toString());
            const categories = window.App.sortCategories(catalog.categories);
            const category = params.get('category') || '';
            const model = catalog.models.find(item => String(item.id) === params.get('model'));
            const search = (params.get('q') || '').toLocaleLowerCase('nl').replace(/[^a-z0-9]/g, '');
            const score = item => String(item.id) === params.get('model') ? 1000
                : search.includes(item.name.toLocaleLowerCase('nl').replace(/[^a-z0-9]/g, '')) ? item.name.length : 0;
            const choices = window.CategoryModels.options(catalog).sort((a, b) => score(b) - score(a));
            const currentFocus = document.activeElement;
            const focusKey = currentFocus?.dataset?.homeCategory !== undefined ? ['homeCategory', currentFocus.dataset.homeCategory]
                : currentFocus?.dataset?.homeModel !== undefined ? ['homeModel', currentFocus.dataset.homeModel] : null;
            root.querySelector('.instant-category-options').innerHTML = `<button type="button" data-home-category="" aria-pressed="${!category}">Alles</button>` + categories
                .filter(item => Number(item.count) > 0 || String(item.id) === category)
                .map(item => `<button type="button" data-home-category="${item.id}" aria-pressed="${String(item.id) === category}">${esc(labels[item.slug] || item.name)}</button>`).join('');
            const showModels = Boolean(category || params.get('q') || model);
            root.querySelector('.instant-models').hidden = !showModels;
            root.querySelector('[data-home-model-count]').textContent = choices.length ? `${choices.length} modellen` : 'Geen gekoppelde modellen in deze selectie';
            root.querySelector('.instant-model-options').innerHTML = choices.map(item => `<button type="button" data-home-model="${item.id}" aria-pressed="${String(item.id) === params.get('model')}"><span>${esc(item.name)}</span><small aria-label="${Number(item.count)} onderdelen">${Number(item.count)}</small></button>`).join('');
            root.querySelector('.instant-model-options').scrollTop = 0;
            root.querySelector('.instant-selection').innerHTML = `${model ? `<button type="button" data-home-remove-model aria-label="Model ${esc(model.name)} verwijderen">${esc(model.name)} <span aria-hidden="true">×</span></button>` : ''}${filtered ? '<button type="button" data-home-reset>Alles wissen</button>' : ''}`;
            root.querySelector('[data-home-heading]').textContent = filtered ? 'Gevonden onderdelen' : 'Onderdelen';
            root.querySelector('[data-home-status]').textContent = `${result.total.toLocaleString('nl-NL')} ${result.total === 1 ? 'onderdeel' : 'onderdelen'}${params.get('q') ? ' voor “' + params.get('q') + '”' : ''}`;
            root.querySelector('[data-home-products]').innerHTML = result.products.length
                ? result.products.map(product => window.App.renderProductCard(product)).join('')
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
                    H.paint(root, data, selection);
                    root.querySelector('[data-home-products]').inert = false;
                    root.querySelector('[data-home-all]').inert = false;
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
            input.addEventListener('input', () => controller.search(input.value));
            root.querySelector('.instant-search').addEventListener('submit', event => { event.preventDefault(); controller.change({q: input.value.trim(), model: '', brand: ''}); });
            root.addEventListener('click', event => {
                const target = event.target.closest('button');
                if (!target) return;
                if (target.hasAttribute('data-home-category')) controller.change({category: target.dataset.homeCategory});
                if (target.hasAttribute('data-home-model')) controller.change({model: target.dataset.homeModel});
                if (target.hasAttribute('data-home-remove-model')) controller.change({model: ''});
                if (target.hasAttribute('data-home-reset')) { input.value = ''; controller.reset(); }
                if (target.hasAttribute('data-home-retry')) controller.start();
            });
            return controller.start();
        }
    };
})();