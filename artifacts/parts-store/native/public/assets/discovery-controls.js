/* Catalog navigation and device selection. Kept separate from buying flows. */
(function () {
    const escape = window.Core.escapeHtml;
    const allowed = ['q', 'category', 'part', 'brand', 'family', 'model', 'quality', 'stock', 'featured', 'sort', 'page', 'limit'];
    const getParams = value => new URLSearchParams(value instanceof URLSearchParams ? value.toString() : value || '');
    const D = window.Discovery = {
        buildUrl(params, changes = {}) {
            const next = getParams(params);
            for (const key of [...next.keys()]) if (!allowed.includes(key)) next.delete(key);
            for (const [key, value] of Object.entries(changes)) {
                if (!allowed.includes(key)) continue;
                if (value === '' || value === null || value === undefined || value === false) next.delete(key);
                else next.set(key, String(value));
            }
            if ('brand' in changes && String(changes.brand || '') !== String(getParams(params).get('brand') || '') && !('model' in changes)) next.delete('model');
            if ('family' in changes && String(changes.family || '') !== String(getParams(params).get('family') || '') && !('model' in changes)) next.delete('model');
            if ('category' in changes && !('part' in changes) && (!changes.category || String(changes.category) !== String(getParams(params).get('category') || ''))) next.delete('part');
            if (Object.keys(changes).some(key => key !== 'page')) next.delete('page');
            return window.APP_BASE + 'catalog' + (next.size ? '?' + next.toString() : '');
        },
        modelOptions(catalog, brand, selected = '') {
            return catalog.models.filter(model => (!brand || String(model.brand_id) === String(brand)) && (model.count > 0 || String(model.id) === String(selected)))
                .sort((a, b) => a.name.localeCompare(b.name, 'nl', {numeric: true}));
        },
        renderDeviceFields(catalog, params, prefix) {
            params = getParams(params);
            const brand = params.get('brand') || '';
            const model = catalog.models.find(item => String(item.id) === params.get('model'));
            const category = params.get('category') || '';
            return `<div class="device-fields">
                <div class="field"><label for="${prefix}-brand">Merk</label>
                    <select id="${prefix}-brand" name="brand" class="form-control"><option value="">Alle merken</option>
                    ${catalog.brands.filter(b => b.count > 0 || String(b.id) === brand).map(b => `<option value="${b.id}" ${String(b.id) === brand ? 'selected' : ''}>${escape(b.name)} (${b.count})</option>`).join('')}</select></div>
                <div class="field"><label id="${prefix}-model-label">Model</label>
                    <input type="hidden" name="model" value="${model?.id || ''}">
                    <details class="model-picker">
                        <summary class="form-control" aria-labelledby="${prefix}-model-label ${prefix}-model-caption"><span id="${prefix}-model-caption" class="model-caption">${escape(model?.name || 'Alle modellen')}</span><span aria-hidden="true">⌄</span></summary>
                        <div class="model-picker-popover">
                            <input class="form-control model-search" type="search" placeholder="Zoek bijvoorbeeld iPhone 13" aria-label="Model zoeken" autocomplete="off">
                            <div class="model-options">${D.renderModelOptions(catalog, brand, model?.id || '')}</div>
                            <p class="model-empty" hidden>Geen passend model. Probeer een andere zoekterm of pas de categorie aan.</p>
                        </div>
                    </details>
                </div>
                <div class="field"><label for="${prefix}-category">Onderdeel</label><select id="${prefix}-category" name="category" class="form-control"><option value="">Alle onderdelen</option>
                    ${window.App.sortCategories(catalog.categories).filter(c => c.count > 0 || String(c.id) === category).map(c => `<option value="${c.id}" ${String(c.id) === category ? 'selected' : ''}>${escape(c.name)} (${c.count})</option>`).join('')}
                </select></div>
                <div class="field part-type-field" ${!(catalog.part_types || []).some(type => !category || String(type.category_id) === category) ? 'hidden' : ''}><label for="${prefix}-part">Soort onderdeel</label><select id="${prefix}-part" name="part" class="form-control"><option value="">Alle soorten</option>${(catalog.part_types || []).filter(type => !category || String(type.category_id) === category).map(type => `<option value="${escape(type.id)}" ${type.id === params.get('part') ? 'selected' : ''}>${escape(type.name)} (${type.count})</option>`).join('')}</select></div>
            </div>`;
        },
        renderModelOptions(catalog, brand, selected) {
            return `<button type="button" class="model-option" data-model="" data-name="Alle modellen">Alle modellen</button>` +
                D.modelOptions(catalog, brand, selected).map(model => `<button type="button" class="model-option ${String(model.id) === String(selected) ? 'selected' : ''}" data-model="${model.id}" data-brand="${model.brand_id}" data-name="${escape(model.name)}"><span>${escape(model.name)}</span><small>${model.count}</small></button>`).join('');
        },
        bindDeviceFields(form, initialCatalog, {onChange} = {}) {
            let catalog = initialCatalog;
            let sequence = 0;
            const brand = form.elements.namedItem('brand');
            const model = form.elements.namedItem('model');
            const category = form.elements.namedItem('category');
            const part = form.elements.namedItem('part');
            const picker = form.querySelector('.model-picker');
            const search = form.querySelector('.model-search');
            const options = form.querySelector('.model-options');
            const caption = form.querySelector('.model-caption');
            const values = () => Object.fromEntries(new FormData(form));
            const filterModels = () => {
                const term = search.value.toLocaleLowerCase().replace(/\s/g, '');
                let visible = 0;
                options.querySelectorAll('[data-model]').forEach(button => {
                    const match = !term || button.dataset.name.toLocaleLowerCase().replace(/\s/g, '').includes(term);
                    button.hidden = !match;
                    if (match) visible++;
                });
                form.querySelector('.model-empty').hidden = visible > 0;
            };
            search.addEventListener('input', filterModels);
            search.addEventListener('keydown', event => {
                if (event.key === 'Enter') { event.preventDefault(); options.querySelector('button:not([hidden])')?.click(); }
                if (event.key === 'ArrowDown') { event.preventDefault(); options.querySelector('button:not([hidden])')?.focus(); }
            });
            picker.addEventListener('toggle', () => { if (picker.open) { search.value = ''; filterModels(); search.focus(); } });
            picker.addEventListener('keydown', event => {
                if (event.key === 'Escape') { event.preventDefault(); picker.open = false; picker.querySelector('summary').focus(); }
            });
            form.addEventListener('click', event => {
                const choice = event.target.closest('[data-model]');
                if (!choice) return;
                model.value = choice.dataset.model;
                if (choice.dataset.brand) brand.value = choice.dataset.brand;
                caption.textContent = choice.dataset.name;
                picker.open = false;
                picker.querySelector('summary').focus();
                model.dispatchEvent(new Event('change', {bubbles: true}));
            });
            form.addEventListener('change', async event => {
                if (event.target === category && part) part.value = '';
                if (event.target === brand) {
                    model.value = '';
                    caption.textContent = 'Alle modellen';
                    options.innerHTML = D.renderModelOptions(catalog, brand.value, '');
                }
                if (onChange && onChange(values()) === false) return;
                if (!['brand', 'model', 'category', 'part', 'quality', 'stock'].includes(event.target.name)) return;
                const version = ++sequence;
                const context = getParams(form.dataset.context || '');
                if (form.elements.namedItem('stock') && !form.elements.namedItem('stock').checked) context.delete('stock');
                for (const [key, value] of Object.entries(values())) {
                    if (!allowed.includes(key)) continue;
                    if (value) context.set(key, value); else context.delete(key);
                }
                try {
                    const next = await window.Core.fetch('/catalog?' + context.toString());
                    if (version !== sequence || !form.isConnected) return;
                    catalog = next;
                    options.innerHTML = D.renderModelOptions(catalog, brand.value, model.value);
                    filterModels();
                    const selectedCategory = category.value;
                    category.innerHTML = '<option value="">Alle onderdelen</option>' + window.App.sortCategories(next.categories)
                        .filter(c => c.count > 0 || String(c.id) === selectedCategory)
                        .map(c => `<option value="${c.id}" ${String(c.id) === selectedCategory ? 'selected' : ''}>${escape(c.name)} (${c.count})</option>`).join('');
                    if (part) {
                        const selectedPart = part.value;
                        const types = (next.part_types || []).filter(type => !selectedCategory || String(type.category_id) === selectedCategory);
                        part.innerHTML = '<option value="">Alle soorten</option>' + types.map(type => `<option value="${escape(type.id)}" ${type.id === selectedPart ? 'selected' : ''}>${escape(type.name)} (${type.count})</option>`).join('');
                        form.querySelector('.part-type-field').hidden = !types.length;
                    }
                } catch (error) {
                    if (form.isConnected) {
                        let notice = form.querySelector('.facet-error');
                        if (!notice) { notice = document.createElement('p'); notice.className = 'facet-error text-danger small'; form.appendChild(notice); }
                        notice.textContent = 'De beschikbare keuzes konden niet worden vernieuwd. U kunt uw selectie nog wel toepassen.';
                    }
                }
            });
        }
    };

    document.addEventListener('click', event => {
        document.querySelectorAll('.model-picker[open]').forEach(picker => {
            if (!picker.contains(event.target)) picker.open = false;
        });
    });

    window.Router.add(/^catalog$/, async (match, root, input) => {
        const renderVersion = window.Router.renderVersion;
        const params = getParams(input);
        const headerSearch = document.getElementById('search-input');
        if (headerSearch) headerSearch.value = params.get('q') || '';
        root.innerHTML = '<div class="page-loader" role="status"><div class="spinner"></div><p>Onderdelen ophalen…</p></div>';
        try {
            const [catalog, result] = await Promise.all([
                window.Core.fetch('/catalog?' + params.toString()),
                window.Core.fetch('/products?' + params.toString())
            ]);
            if (renderVersion !== window.Router.renderVersion) return;
            const part = (catalog.part_types || []).find(type => type.id === params.get('part'));
            const cat = catalog.categories.find(c => String(c.id) === (params.get('category') || String(part?.category_id || '')));
            const brand = catalog.brands.find(b => String(b.id) === params.get('brand'));
            const model = catalog.models.find(m => String(m.id) === params.get('model'));
            const family = (catalog.device_families || []).find(item => item.id === params.get('family'));
            if (model) window.FastFinder.remember(model);
            const query = params.get('q') || '';
            const categoryName = cat?.slug === 'housing' ? 'Behuizing & onderdelen' : cat?.name;
            const subject = part?.name || categoryName || 'Onderdelen';
            const title = model ? `${subject} voor ${model.name}` : (part?.name || categoryName || (query ? 'Zoekresultaten' : 'Alle onderdelen'));
            const showCategoryModels = Boolean(cat || part || query || family);
            const chips = [
                query && ['q', `“${query}”`], cat && ['category', categoryName], part && ['part', part.name], family && ['family', family.label], brand && ['brand', brand.name],
                model && ['model', model.name], params.get('quality') && ['quality', params.get('quality')],
                params.get('stock') && ['stock', params.get('stock') === 'out_of_stock' ? 'Tijdelijk uitverkocht' : 'Op voorraad'],
                params.get('featured') && ['featured', 'Uitgelicht']
            ].filter(Boolean);
            const removeLink = ([key, label]) => `<a class="filter-chip" href="${D.buildUrl(params, {[key]: ''})}" aria-label="${escape(label)} verwijderen">${escape(label)}<span aria-hidden="true">×</span></a>`;
            const filterForm = (prefix, mobile = false) => `<form class="discovery-filters" id="${prefix}-filters" data-context="${escape(params.toString())}">
                ${D.renderDeviceFields(catalog, params, prefix)}
                <details class="advanced-filters" ${params.get('quality') || params.get('stock') ? 'open' : ''}><summary>Meer filters <small>Optioneel</small></summary>
                    <div class="field"><label for="${prefix}-quality">Type / kwaliteit</label><select name="quality" id="${prefix}-quality" class="form-control"><option value="">Alle types</option>
                    ${[...new Set([...catalog.qualities, params.get('quality')].filter(Boolean))].map(q => `<option ${q === params.get('quality') ? 'selected' : ''} value="${escape(q)}">${escape(q)}</option>`).join('')}</select></div>
                    <label class="check-label"><input type="checkbox" name="stock" value="in_stock" ${params.get('stock') === 'in_stock' || params.get('stock') === '1' ? 'checked' : ''}> Alleen op voorraad</label>
                </details>
                ${mobile ? '<div class="filter-dialog-actions"><button type="button" class="btn btn-outline" data-reset-filters>Wissen</button><button type="submit" class="btn btn-primary">Resultaten bekijken</button></div>' : '<p class="filter-auto-hint">Uw selectie wordt direct toegepast.</p>'}
            </form>`;
            let view = 'list';
            try { view = localStorage.getItem('view_pref') || 'list'; } catch (_) {}
            if (!['grid', 'list'].includes(view)) view = 'list';
            const sort = params.get('sort') || (query ? 'relevance' : 'featured');
            const pages = result.pages;
            const page = result.page;
            const numbered = [...new Set([1, Math.max(1, page - 1), page, Math.min(pages, page + 1), pages])].sort((a, b) => a - b);
            const pagination = pages > 1 ? `<nav class="catalog-pagination" aria-label="Pagina's">${page > 1 ? `<a class="btn btn-outline" href="${D.buildUrl(params, {page: page - 1})}">Vorige</a>` : ''}${numbered.map((n, i) => `${i && n > numbered[i - 1] + 1 ? '<span>…</span>' : ''}<a class="btn ${n === page ? 'btn-primary' : 'btn-outline'}" ${n === page ? 'aria-current="page"' : ''} href="${D.buildUrl(params, {page: n})}">${n}</a>`).join('')}${page < pages ? `<a class="btn btn-outline" href="${D.buildUrl(params, {page: page + 1})}">Volgende</a>` : ''}</nav>` : '';
            const quickNames = {screens: 'LCD & schermen', batteries: 'Batterijen', charging: 'Laadpoorten', cameras: "Camera’s", housing: 'Behuizing & onderdelen', flex: 'Flexkabels', audio: 'Audio', adhesive: 'Adhesive'};
            const quickCategories = window.App.sortCategories(catalog.categories).filter(c => c.count > 0 || String(c.id) === params.get('category'));
            const partTypes = cat?.slug === 'housing' ? (catalog.part_types || []).filter(type => String(type.category_id) === String(cat.id)) : [];
            const typePicker = partTypes.length ? `<section class="part-type-picker" aria-label="Welk onderdeel heeft u nodig?"><div class="part-type-intro"><span>Welk onderdeel?</span><small>Niet alles is een complete behuizing.</small></div><nav class="part-type-options" aria-label="Soort behuizingsonderdeel"><a class="part-type-option ${!part ? 'active' : ''}" ${!part ? 'aria-current="page"' : ''} href="${D.buildUrl(params, {part: ''})}"><strong>Alles</strong><small>Alle uitvoeringen</small></a>${partTypes.map(type => `<a class="part-type-option ${type.id === part?.id ? 'active' : ''} ${type.count === 0 ? 'is-empty' : ''}" ${type.id === part?.id ? 'aria-current="page"' : ''} href="${D.buildUrl(params, {category: cat.id, part: type.id})}" title="${escape(type.description)}"><span><strong>${escape(type.name)}</strong><b>${type.count}</b></span><small>${escape(type.description)}</small></a>`).join('')}</nav></section>` : '';
            root.innerHTML = `<div class="catalog-breadcrumb"><a href="${window.APP_BASE}">Start</a><span>/</span><a href="${D.buildUrl('')}">Assortiment</a>${cat ? `<span>/</span><span>${escape(cat.name)}</span>` : ''}</div>
                <div class="catalog-heading"><div><span class="catalog-eyebrow">Precies het juiste onderdeel</span><h1>${escape(title)}</h1><p class="catalog-description">${result.total.toLocaleString('nl-NL')} ${result.total === 1 ? 'onderdeel' : 'onderdelen'}${query ? ` voor “${escape(query)}”` : ''}</p></div>${showCategoryModels ? '' : window.FastFinder.inline(params, model)}</div>
                <nav class="quick-categories" aria-label="Snel een onderdeel kiezen"><a class="quick-category ${!cat ? 'active' : ''}" ${!cat ? 'aria-current="page"' : ''} href="${D.buildUrl(params, {category: ''})}"><span>Alle onderdelen</span></a>${quickCategories.map(c => `<a class="quick-category ${c.id === cat?.id ? 'active' : ''}" ${c.id === cat?.id ? 'aria-current="page"' : ''} href="${D.buildUrl(params, {category: c.id, part: ''})}"><span>${escape(quickNames[c.slug] || c.name)}</span><small>${c.count}</small></a>`).join('')}</nav>
                ${typePicker}
                ${showCategoryModels ? window.CategoryModels.render(catalog, params, part?.name || categoryName || 'Uw zoekopdracht') : ''}
                <div class="catalog-layout">
                    <section class="catalog-main" data-catalog-results tabindex="-1" aria-label="Productresultaten">
                        <div class="catalog-refine-row">${showCategoryModels ? '' : `<label class="catalog-tool-field">Merk<select id="catalog-brand" class="form-control"><option value="">Alle merken</option>${catalog.brands.filter(b => b.count > 0 || String(b.id) === params.get('brand')).map(b => `<option value="${b.id}" ${String(b.id) === params.get('brand') ? 'selected' : ''}>${escape(b.name)}</option>`).join('')}</select></label>`}
                        <label class="catalog-tool-field">Kwaliteit<select id="quick-quality" class="form-control"><option value="">Alle kwaliteiten</option>${[...new Set([...catalog.qualities, params.get('quality')].filter(Boolean))].map(q => `<option value="${escape(q)}" ${q === params.get('quality') ? 'selected' : ''}>${escape(q)}</option>`).join('')}</select></label>
                        <button type="button" class="stock-shortcut ${params.get('stock') === 'in_stock' ? 'active' : ''}" data-stock-toggle aria-pressed="${params.get('stock') === 'in_stock'}">Op voorraad</button>
                        <button type="button" class="btn btn-outline" id="open-catalog-filters">Alle filters${chips.length ? ` (${chips.length})` : ''}</button></div>
                        ${chips.length ? `<div class="active-filters">${chips.map(removeLink).join('')}<a class="clear-filters" href="${D.buildUrl('')}">Wissen</a></div>` : ''}
                        <div class="catalog-toolbar"><span class="result-range">${result.total ? `${(page - 1) * (Number(params.get('limit')) || 24) + 1}–${Math.min(page * (Number(params.get('limit')) || 24), result.total)} van ${result.total.toLocaleString('nl-NL')}` : 'Geen resultaten'}</span>
                            <div class="catalog-sort"><label for="catalog-sort">Sorteren op</label><select id="catalog-sort" class="form-control">
                                <option value="${query ? 'relevance' : 'featured'}" ${['featured','relevance'].includes(sort) ? 'selected' : ''}>${query ? 'Beste overeenkomst' : 'Uitgelicht eerst'}</option>
                                <option value="name" ${sort === 'name' ? 'selected' : ''}>Naam A–Z</option><option value="newest" ${sort === 'newest' ? 'selected' : ''}>Laatst toegevoegd</option>
                                <option value="stock" ${sort === 'stock' ? 'selected' : ''}>Meeste voorraad</option>
                                ${window.Core.user ? `<option value="price_asc" ${sort === 'price_asc' ? 'selected' : ''}>Prijs laag–hoog</option><option value="price_desc" ${sort === 'price_desc' ? 'selected' : ''}>Prijs hoog–laag</option>` : ''}
                            </select></div>
                            <div class="view-toggle"><button type="button" data-view="grid" class="${view === 'grid' ? 'active' : ''}" aria-label="Rasterweergave" aria-pressed="${view === 'grid'}">▦</button><button type="button" data-view="list" class="${view === 'list' ? 'active' : ''}" aria-label="Lijstweergave" aria-pressed="${view === 'list'}">☰</button></div>
                        </div>
                        ${!window.Core.user ? `<div class="catalog-price-notice"><span>Uw eigen klantprijzen zien?</span><a href="${window.APP_BASE}login">Inloggen →</a></div>` : ''}
                        <div class="product-container view-${view}">${result.products.length ? result.products.map(p => window.App.renderProductCard(p)).join('') : `<div class="empty-state"><h2>${part ? 'Geen ' + escape(part.name.toLocaleLowerCase('nl')) + ' in deze selectie' : 'Geen onderdelen met deze combinatie'}</h2><p>${part ? escape(part.description) + ' Kies een ander model of bekijk de andere uitvoeringen.' : 'Haal een filter weg of probeer een andere zoekterm.'}</p><a class="btn btn-outline" href="${part ? D.buildUrl(params, {part: ''}) : D.buildUrl('')}">${part ? 'Andere uitvoeringen bekijken' : 'Bekijk alle onderdelen'}</a></div>`}</div>${pagination}
                    </section>
                </div>
                <dialog id="catalog-filter-dialog" class="filter-dialog"><div class="filter-dialog-heading"><h2>Verfijn uw selectie</h2><button type="button" class="btn-close" aria-label="Filters sluiten">×</button></div>${filterForm('mobile', true)}</dialog>
                <dialog id="device-finder-dialog" class="finder-dialog" aria-label="Een ander model kiezen"><button type="button" class="btn-close" data-close-finder aria-label="Modelkeuze sluiten">×</button><div data-finder-body></div></dialog>`;
            const apply = form => {
                const changes = Object.fromEntries(new FormData(form));
                if (!changes.stock) changes.stock = '';
                window.Router.navigate(D.buildUrl(params, changes));
            };
            for (const prefix of ['mobile']) {
                const form = document.getElementById(prefix + '-filters');
                D.bindDeviceFields(form, catalog, prefix === 'desktop' ? {onChange() { apply(form); return false; }} : {});
                form.addEventListener('submit', event => {
                    event.preventDefault();
                    document.getElementById('catalog-filter-dialog').close();
                    apply(form);
                });
            }
            document.getElementById('catalog-brand')?.addEventListener('change', event => window.Router.navigate(D.buildUrl(params, {brand: event.target.value})));
            window.CategoryModels.bind(root.querySelector('[data-category-models]'), catalog, params);
            if (D.focusResultsAfterModel) {
                D.focusResultsAfterModel = false;
                const results = root.querySelector('[data-catalog-results]');
                results.focus({preventScroll: true});
                results.scrollIntoView({block: 'start'});
            }
            document.getElementById('quick-quality').addEventListener('change', event => window.Router.navigate(D.buildUrl(params, {quality: event.target.value})));
            root.querySelector('[data-stock-toggle]').addEventListener('click', () => window.Router.navigate(D.buildUrl(params, {stock: params.get('stock') === 'in_stock' ? '' : 'in_stock'})));
            document.getElementById('catalog-sort').addEventListener('change', event => window.Router.navigate(D.buildUrl(params, {sort: event.target.value})));
            root.querySelectorAll('.view-toggle button').forEach(button => button.addEventListener('click', () => {
                window.App.toggleView(button.dataset.view);
                root.querySelectorAll('.view-toggle button').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
            }));
            const dialog = document.getElementById('catalog-filter-dialog');
            const opener = document.getElementById('open-catalog-filters');
            opener.addEventListener('click', () => dialog.showModal());
            dialog.querySelector('.btn-close').addEventListener('click', () => dialog.close());
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
            dialog.addEventListener('close', () => opener.focus());
            dialog.querySelector('[data-reset-filters]').addEventListener('click', () => {
                dialog.close();
                window.Router.navigate(D.buildUrl(''));
            });
            const finderDialog = root.querySelector('#device-finder-dialog');
            const finderOpener = root.querySelector('[data-change-device]');
            if (finderOpener) {
            let choicesPromise;
            const loadChoices = () => {
                if (!choicesPromise) {
                    const context = getParams(params);
                    ['model', 'brand', 'q', 'page'].forEach(key => context.delete(key));
                    choicesPromise = window.Core.fetch('/catalog?' + context.toString()).catch(error => { choicesPromise = null; throw error; });
                }
                return choicesPromise;
            };
            window.FastFinder.bindInline(root.querySelector('[data-inline-model]'), catalog, params, loadChoices);
            let finderReady = false;
            finderOpener.addEventListener('click', async () => {
                finderDialog.showModal();
                if (finderReady) return;
                finderReady = true;
                const body = finderDialog.querySelector('[data-finder-body]');
                body.innerHTML = '<div class="page-loader" role="status">Modellen ophalen…</div>';
                try {
                    const choices = await loadChoices();
                    if (!root.isConnected) return;
                    body.innerHTML = window.FastFinder.render(choices, params, 'catalog');
                    window.FastFinder.bind(body.querySelector('[data-fast-finder]'), choices, params);
                    finderReady = true;
                    if (finderDialog.open) body.querySelector('.finder-model-search input').focus();
                } catch (error) {
                    finderReady = false;
                    if (root.isConnected) body.innerHTML = `<p class="alert error">${escape(error.message)} Sluit dit venster en probeer opnieuw.</p>`;
                }
            });
            finderDialog.querySelector('[data-close-finder]').addEventListener('click', () => finderDialog.close());
            finderDialog.addEventListener('click', event => { if (event.target === finderDialog) finderDialog.close(); });
            finderDialog.addEventListener('close', () => finderOpener.focus());
            }
            root.querySelectorAll('.quick-categories, .part-type-options').forEach(rail => {
                const selected = rail.querySelector('[aria-current="page"]');
                if (selected && rail.scrollWidth > rail.clientWidth) {
                    rail.scrollLeft += selected.getBoundingClientRect().left - rail.getBoundingClientRect().left - 12;
                }
            });
        } catch (error) {
            if (renderVersion !== window.Router.renderVersion) return;
            root.innerHTML = `<div class="alert error" role="alert"><h2>Het assortiment kon niet worden geladen</h2><p>${escape(error.message)}</p><a class="btn btn-outline" href="${D.buildUrl('')}">Opnieuw proberen</a></div>`;
        }
    });
})();