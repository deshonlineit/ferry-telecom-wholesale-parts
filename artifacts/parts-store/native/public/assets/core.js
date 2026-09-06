window.APP_BASE = window.APP_BASE || '/test-shop/';
const API_BASE = window.APP_BASE + 'api';

window.Core = {
    csrf: '',
    user: null,
    capabilities: {},
    currency: 'CHF',
    cart: { items: [], total_cents: 0 },
    
    async fetch(url, options = {}) {
        const reqOptions = { ...options };
        reqOptions.headers = reqOptions.headers || {};
        
        if (reqOptions.method && reqOptions.method !== 'GET') {
            reqOptions.headers['X-CSRF-Token'] = this.csrf;
            if (!(reqOptions.body instanceof FormData)) {
                reqOptions.headers['Content-Type'] = reqOptions.headers['Content-Type'] || 'application/json';
            }
        }
        reqOptions.credentials = 'include';
        
        if (reqOptions.body && typeof reqOptions.body === 'object' && !(reqOptions.body instanceof FormData)) {
            reqOptions.body = JSON.stringify(reqOptions.body);
        }

        const res = await fetch(`${API_BASE}${url}`, reqOptions);
        let data;
        const contentType = res.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
            data = await res.json().catch(() => ({}));
        } else {
            if (res.ok) return await res.blob();
            data = {};
        }
        
        if (!res.ok) {
            throw new Error(data.error || `HTTP error ${res.status}`);
        }
        return data;
    },
    
    async init() {
        try {
            const data = await this.fetch('/session');
            this.csrf = data.csrf;
            this.user = data.user;
            this.capabilities = data.capabilities;
            this.currency = data.currency || 'CHF';
            
            await this.refreshCart();
            this.renderNav();
        } catch(e) {
            document.body.innerHTML = `<div class="container mt-4"><div class="alert error">Kritieke fout bij laden applicatie: ${this.escapeHtml(e.message)}</div></div>`;
        }
    },
    
    async refreshCart() {
        if (this.user && this.user.role === 'staff') return;
        if (!this.user) {
            this.cart = { items: [], total_cents: 0 };
            this.updateCartCount();
            return;
        }
        try {
            const data = await this.fetch('/cart');
            this.cart = data || { items: [], total_cents: 0 };
            this.updateCartCount();
        } catch(e) {
            console.error('Failed to load cart', e);
        }
    },

    updateCartCount() {
        const badges = document.querySelectorAll('.cart-badge');
        const count = this.cart.items ? this.cart.items.reduce((a,b) => a + b.quantity, 0) : 0;
        badges.forEach(badge => {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'flex' : 'none';
        });
    },

    formatMoney(cents) {
        if (typeof cents !== 'number') return '';
        return (cents / 100).toFixed(2) + ' ' + this.currency;
    },

    renderNav() {
        const nav = document.getElementById('user-nav');
        if (!nav) return;
        
        const count = this.cart.items ? this.cart.items.reduce((a,b)=>a+b.quantity,0) : 0;
        let html = '';
        
        if (this.user) {
            html += `<a href="${window.APP_BASE}account" class="nav-link">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                <span class="nav-text">Mijn Account</span>
            </a>`;
            
            if (this.user.role === 'staff') {
                html += `<a href="${window.APP_BASE}admin" class="nav-link text-danger">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
                    <span class="nav-text">Beheer</span>
                </a>`;
            } else {
                html += `<a href="${window.APP_BASE}cart" class="nav-link nav-cart">
                    <div class="cart-icon-wrapper">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
                        <span class="cart-badge" style="display:${count > 0 ? 'flex' : 'none'}">${count}</span>
                    </div>
                    <span class="nav-text">Winkelwagen</span>
                </a>`;
            }
            
            html += `<a href="#" onclick="window.App.logout(); return false;" class="nav-link text-muted">Uitloggen</a>`;
        } else {
            html += `<a href="${window.APP_BASE}login" class="nav-link">Inloggen</a>`;
            html += `<a href="${window.APP_BASE}register" class="btn btn-primary btn-sm ml-2">Klant worden</a>`;
        }
        
        nav.innerHTML = html;
    },

    escapeHtml(unsafe) {
        if (!unsafe) return '';
        return (unsafe+'').replace(/[&<"']/g, function(m) {
            switch (m) {
                case '&': return '&amp;';
                case '<': return '&lt;';
                case '"': return '&quot;';
                case "'": return '&#039;';
            }
        });
    },

    renderPagination(currentPage, totalPages, searchParams, basePath) {
        if (totalPages <= 1) return '';
        currentPage = parseInt(currentPage, 10);
        let html = `<nav class="pagination" aria-label="Paginatie">`;
        
        if (currentPage > 1) {
            searchParams.set('page', currentPage - 1);
            html += `<a href="${basePath}?${searchParams.toString()}" class="page-link prev" aria-label="Vorige">&lsaquo;</a>`;
        }
        
        const pages = [];
        const maxPages = 7;
        if (totalPages <= maxPages) {
            for (let i=1; i<=totalPages; i++) pages.push(i);
        } else {
            pages.push(1);
            if (currentPage > 3) pages.push('...');
            let start = Math.max(2, currentPage - 1);
            let end = Math.min(totalPages - 1, currentPage + 1);
            if (currentPage === 1) end = 3;
            if (currentPage === totalPages) start = totalPages - 2;
            for (let i=start; i<=end; i++) pages.push(i);
            if (currentPage < totalPages - 2) pages.push('...');
            pages.push(totalPages);
        }
        
        pages.forEach(p => {
            if (p === '...') {
                html += `<span class="page-ellipsis">&hellip;</span>`;
            } else {
                searchParams.set('page', p);
                html += `<a href="${basePath}?${searchParams.toString()}" class="page-link ${p === currentPage ? 'active' : ''}" aria-current="${p === currentPage ? 'page' : 'false'}">${p}</a>`;
            }
        });
        
        if (currentPage < totalPages) {
            searchParams.set('page', currentPage + 1);
            html += `<a href="${basePath}?${searchParams.toString()}" class="page-link next" aria-label="Volgende">&rsaquo;</a>`;
        }
        
        html += `</nav>`;
        return html;
    }
};

window.Router = {
    routes: [],
    add(pattern, handler) {
        if (typeof pattern === 'string') {
            pattern = new RegExp('^' + pattern.replace(/:[^\s/]+/g, '([\\w-]+)') + '$');
        }
        this.routes.push({ pattern, handler });
    },
    navigate(path) {
        history.pushState({}, '', path);
        this.route();
        window.scrollTo(0, 0);
    },
    async route() {
        this.renderVersion = (this.renderVersion || 0) + 1;
        const renderVersion = this.renderVersion;
        window.UI.closeModal();
        window.UI.closeGallery();
        let path = location.pathname;
        if (path.startsWith(window.APP_BASE)) {
            path = path.substring(window.APP_BASE.length);
        }
        if (!path) path = '';
        
        if (path.startsWith('admin') && window.Core.user && window.Core.user.role === 'staff') {
            document.body.setAttribute('data-area', 'admin');
        } else {
            document.body.removeAttribute('data-area');
        }

        const qs = location.search;
        const mount = document.getElementById('app-root');
        const root = document.createElement('div');
        root.className = 'route-content';
        mount.replaceChildren(root);
        root.innerHTML = '<div class="page-loader"><div class="spinner"></div></div>';
        
        for (const {pattern, handler} of this.routes) {
            const match = path.match(pattern);
            if (match) {
                try {
                    await handler(match, root, new URLSearchParams(qs));
                } catch(err) {
                    if (renderVersion !== this.renderVersion) return;
                    root.innerHTML = `
                        <div class="alert error mt-4">
                            <h3>Er is een fout opgetreden</h3>
                            <p>${window.Core.escapeHtml(err.message)}</p>
                            <button onclick="window.Router.route()" class="btn btn-outline btn-sm mt-2">Opnieuw proberen</button>
                        </div>
                    `;
                }
                return;
            }
        }
        root.innerHTML = `
            <div class="empty-state mt-4">
                <h2>404 - Pagina niet gevonden</h2>
                <p>De opgevraagde pagina bestaat niet.</p>
                <a href="${window.APP_BASE}catalog" class="btn btn-primary mt-4">Terug naar assortiment</a>
            </div>
        `;
    }
};

window.App = {
    searchAbort: null,
    
    sortCategories(cats) {
        const order = {
            'screens': 10,
            'batteries': 20,
            'charging': 30,
            'cameras': 40,
            'housing': 50,
            'flex': 60,
            'audio': 70,
            'adhesive': 80,
            'tools': 90,
            'protection': 100,
            'accessories': 110,
            'other': 120
        };
        const catWeight = (slug) => {
            if (!slug) return 200;
            const s = slug.toLowerCase();
            if (order[s] !== undefined) return order[s];
            for (let k in order) {
                if (s.includes(k)) return order[k];
            }
            return 200;
        };
        return [...cats].sort((a, b) => {
            const wa = catWeight(a.slug);
            const wb = catWeight(b.slug);
            if (wa !== wb) return wa - wb;
            return (b.count || 0) - (a.count || 0);
        });
    },

    getCategoryIcon(slug) {
        const s = (slug || '').toLowerCase();
        let path = '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>'; 
        if (s.includes('screen')) path = '<rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line>';
        else if (s.includes('batter')) path = '<rect x="2" y="7" width="16" height="10" rx="2" ry="2"></rect><line x1="22" y1="11" x2="22" y2="13"></line>';
        else if (s.includes('charg')) path = '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>';
        else if (s.includes('camera')) path = '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle>';
        else if (s.includes('hous')) path = '<rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line>';
        else if (s.includes('flex')) path = '<path d="M4 17h16M4 12h16M4 7h16"></path>';
        else if (s.includes('audio')) path = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>';
        else if (s.includes('adhes')) path = '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline>';
        else if (s.includes('tool')) path = '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>';
        else if (s.includes('protect')) path = '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>';
        return `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-muted); opacity:0.8">${path}</svg>`;
    },

    async init() {
        await window.Core.init();
        window.Router.route();
    },
    
    async logout() {
        try {
            await window.Core.fetch('/auth/logout', { method: 'POST' });
            window.location.href = window.APP_BASE;
        } catch(e) {
            alert(e.message);
        }
    },
    
    async demoLogin(persona) {
        try {
            const data = await window.Core.fetch('/auth/demo', { 
                method: 'POST', 
                body: { persona } 
            });
            window.Core.user = data.user;
            window.Core.csrf = data.csrf;
            window.location.href = window.APP_BASE;
        } catch(e) {
            alert(e.message);
        }
    },

    searchElements() {
        const owner = this.searchOwner || 'search-input';
        return {
            input: document.getElementById(owner),
            container: document.getElementById(owner === 'search-input' ? 'search-suggestions' : owner + '-suggestions')
        };
    },

    handleSearchInput(val, owner = 'search-input') {
        if (owner !== (this.searchOwner || 'search-input')) window.UI.closeSuggestions();
        this.searchOwner = owner;
        clearTimeout(this.searchTimer);
        if (this.searchAbort) this.searchAbort.abort();
        const sequence = this.searchSequence = (this.searchSequence || 0) + 1;
        if (val.trim().length < 2) {
            window.UI.closeSuggestions();
            return;
        }
        this.searchTimer = setTimeout(async () => {
            this.searchAbort = new AbortController();
            try {
                const res = await window.Core.fetch(`/search/suggestions?q=${encodeURIComponent(val)}`, {
                    signal: this.searchAbort.signal
                });
                if (sequence === this.searchSequence) this.renderSuggestions(res, val);
            } catch(e) {
                if (e.name !== 'AbortError') console.error('Search error', e);
            }
        }, 180);
    },

    handleSearchKeydown(event) {
        if (event.key === 'Escape') {
            event.preventDefault();
            window.UI.closeSuggestions();
            return;
        }
        const {container} = this.searchElements();
        if (!container || container.style.display === 'none') return;
        const options = [...container.querySelectorAll('a')];
        if (!options.length) return;
        if (event.key === 'Enter' && this.searchIndex >= 0) {
            event.preventDefault();
            const href = options[this.searchIndex]?.href;
            window.UI.closeSuggestions();
            if (href) window.Router.navigate(href);
            return;
        }
        if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
        event.preventDefault();
        const current = this.searchIndex ?? -1;
        this.searchIndex = current < 0
            ? (event.key === 'ArrowDown' ? 0 : options.length - 1)
            : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
        options.forEach((option, index) => {
            const active = index === this.searchIndex;
            option.classList.toggle('is-active', active);
            option.setAttribute('aria-selected', String(active));
        });
        event.currentTarget.setAttribute('aria-activedescendant', options[this.searchIndex].id);
        options[this.searchIndex].scrollIntoView({block: 'nearest'});
    },

    handleSearchFocus(owner = 'search-input') {
        if (owner !== (this.searchOwner || 'search-input')) window.UI.closeSuggestions();
        this.searchOwner = owner;
        const input = document.getElementById(owner);
        if (input && input.value.trim()) {
            this.handleSearchInput(input.value, owner);
        }
    },

    renderSuggestions(data, query) {
        const {container, input} = this.searchElements();
        const esc = window.Core.escapeHtml;
        if (!container) return;
        this.searchIndex = -1;
        input?.setAttribute('aria-expanded', 'true');
        input?.removeAttribute('aria-activedescendant');
        
        if (!data.products?.length && !data.categories?.length && !data.models?.length) {
            container.innerHTML = `<div class="suggestion-group"><div class="suggestion-empty">Geen resultaten gevonden voor "${esc(query)}"</div></div>`;
            container.style.display = 'block';
            return;
        }
        
        let html = '';
        if (data.categories && data.categories.length) {
            html += `<div class="suggestion-group">
                <div class="suggestion-group-title">Categorieën</div>
                ${data.categories.map(c => `<a href="${window.APP_BASE}catalog?category=${c.id}" class="suggestion-item"><span class="suggestion-text">${esc(c.name)}</span><span class="suggestion-meta badge">${c.count}</span></a>`).join('')}
            </div>`;
        }
        
        if (data.models && data.models.length) {
            html += `<div class="suggestion-group">
                <div class="suggestion-group-title">Modellen</div>
                ${data.models.map(m => `<a href="${window.APP_BASE}catalog?model=${m.id}" class="suggestion-item"><span class="suggestion-text">${esc(m.name)}</span><span class="suggestion-meta badge">${m.count}</span></a>`).join('')}
            </div>`;
        }
        
        if (data.products && data.products.length) {
            html += `<div class="suggestion-group">
                <div class="suggestion-group-title">Producten</div>
                ${data.products.map(p => `
                    <a href="${window.APP_BASE}products/${p.id}" class="suggestion-product">
                        <div class="suggestion-img">
                            ${p.image_url ? `<img src="${esc(p.image_url)}" alt="">` : `<div class="img-placeholder"></div>`}
                        </div>
                        <div class="suggestion-product-info">
                            <div class="suggestion-product-name">${esc(p.name)}</div>
                            <div class="suggestion-product-sku">SKU: ${esc(p.sku)}</div>
                        </div>
                        <div class="suggestion-product-price">
                            ${p.price_cents !== null ? window.Core.formatMoney(p.price_cents) : ''}
                        </div>
                    </a>
                `).join('')}
            </div>`;
        }
        
        html += `<a href="${window.APP_BASE}catalog?q=${encodeURIComponent(query)}" class="suggestion-footer">Bekijk alle ${data.total} resultaten &rarr;</a>`;
        container.innerHTML = html;
        container.querySelectorAll('a').forEach((option, index) => {
            option.id = (this.searchOwner || 'search-input') + '-option-' + index;
            option.setAttribute('role', 'option');
            option.setAttribute('aria-selected', 'false');
        });
        container.style.display = 'block';
    },

    async addToCartWithQty(id, qty) {
        try {
            await window.Core.fetch('/cart', { method: 'POST', body: { product_id: id, quantity: qty } });
            await window.Core.refreshCart();
            window.UI.showModal('Winkelwagen', `
                <div class="modal-success-content">
                    <div class="success-icon">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                    </div>
                    <h3 class="mt-4 mb-2 text-center">Toegevoegd aan winkelwagen</h3>
                    <p class="text-muted text-center mb-4">Het product is succesvol toegevoegd.</p>
                    <div class="modal-actions" style="display:flex; gap:1rem; justify-content:center;">
                        <button class="btn btn-outline" onclick="window.UI.closeModal(this.closest('.modal-overlay'))">Verder winkelen</button>
                        <a href="${window.APP_BASE}cart" class="btn btn-primary">Naar winkelwagen</a>
                    </div>
                </div>
            `);
        } catch(e) {
            alert(e.message);
        }
    }
};

document.addEventListener('click', e => {
    const a = e.target.closest('a');
    if (a && a.href && a.href.startsWith(location.origin) && !a.hasAttribute('target')) {
        const href = a.getAttribute('href');
        if (!href.startsWith('http') && !href.startsWith('/')) return;
        if (a.hasAttribute('download') || a.href.endsWith('.pdf')) return;
        
        e.preventDefault();
        window.Router.navigate(a.href);
    }
});

window.addEventListener('popstate', () => window.Router.route());

window.UI = {
    showModal(title, contentHtml, options = {}) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="modal-title-${Date.now()}">
                <div class="modal-header">
                    <h2 id="modal-title-${Date.now()}">${window.Core.escapeHtml(title)}</h2>
                    <button type="button" class="modal-close" aria-label="Sluiten">&times;</button>
                </div>
                <div class="modal-body">${contentHtml}</div>
            </div>
        `;
        
        const previousActiveElement = document.activeElement;
        
        const cleanup = () => {
            document.removeEventListener('keydown', keyHandler);
            if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
                previousActiveElement.focus();
            }
        };

        const close = () => {
            window.UI.closeModal(overlay);
            cleanup();
        };

        const keyHandler = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                close();
            }
        };

        document.body.appendChild(overlay);
        overlay.querySelector('.modal-close').onclick = close;
        overlay.addEventListener('click', e => { if(e.target === overlay) close(); });
        document.addEventListener('keydown', keyHandler);
        
        const focusable = overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusable.length) focusable[0].focus();
        
        overlay._cleanup = cleanup;
        return overlay;
    },
    
    closeModal(overlay) {
        if (!overlay) {
            document.querySelectorAll('.modal-overlay').forEach(item => this.closeModal(item));
            return;
        }
        if (overlay._cleanup) overlay._cleanup();
        if(overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    },
    
    closeSuggestions() {
        clearTimeout(window.App.searchTimer);
        window.App.searchAbort?.abort();
        window.App.searchSequence = (window.App.searchSequence || 0) + 1;
        window.App.searchIndex = -1;
        const {container: el, input} = window.App.searchElements();
        if (el) el.style.display = 'none';
        input?.setAttribute('aria-expanded', 'false');
        input?.removeAttribute('aria-activedescendant');
    },

    showGallery(images, initialIndex = 0, options = {}) {
        if (!images || !images.length) return;
        this.closeGallery();
        const validInitialIndex = Number.isInteger(initialIndex) ? initialIndex : 0;
        let currentIndex = Math.max(0, Math.min(validInitialIndex, images.length - 1));
        const opener = options.opener || document.activeElement;
        const previousOverflow = document.body.style.overflow;
        const dialog = document.createElement('dialog');
        const titleId = `photo-preview-title-${Date.now()}`;
        dialog.className = 'photo-preview-dialog';
        dialog.setAttribute('aria-labelledby', titleId);
        dialog.innerHTML = `
            <div class="photo-preview-shell">
                <header class="photo-preview-header gallery-toolbar">
                    <div class="photo-preview-heading">
                        <h2 class="photo-preview-title" id="${titleId}"></h2>
                        <span class="photo-preview-counter gallery-counter" aria-live="polite"></span>
                    </div>
                    <button type="button" class="photo-preview-close gallery-close" aria-label="Fotovoorbeeld sluiten">&times;</button>
                </header>
                <div class="photo-preview-content gallery-content">
                    <button type="button" class="photo-preview-nav gallery-nav prev" aria-label="Vorige foto">&lsaquo;</button>
                    <figure class="photo-preview-figure">
                        <img class="photo-preview-image gallery-img" alt="">
                    </figure>
                    <button type="button" class="photo-preview-nav gallery-nav next" aria-label="Volgende foto">&rsaquo;</button>
                </div>
            </div>
        `;

        const title = dialog.querySelector('.photo-preview-title');
        const counter = dialog.querySelector('.photo-preview-counter');
        const image = dialog.querySelector('.photo-preview-image');
        const prevButton = dialog.querySelector('.photo-preview-nav.prev');
        const nextButton = dialog.querySelector('.photo-preview-nav.next');
        const productName = options.title || 'Productfoto';
        title.textContent = productName;

        const render = () => {
            image.src = images[currentIndex].url;
            image.alt = images.length > 1
                ? `${productName}, foto ${currentIndex + 1} van ${images.length}`
                : productName;
            counter.textContent = images.length > 1 ? `${currentIndex + 1} / ${images.length}` : '';
            prevButton.disabled = currentIndex === 0;
            nextButton.disabled = currentIndex === images.length - 1;
        };
        const next = () => {
            if (currentIndex < images.length - 1) {
                currentIndex++;
                render();
            }
        };
        const prev = () => {
            if (currentIndex > 0) {
                currentIndex--;
                render();
            }
        };
        let cleanedUp = false;
        const cleanup = () => {
            if (cleanedUp) return;
            cleanedUp = true;
            document.removeEventListener('keydown', keyHandler);
            document.body.style.overflow = previousOverflow;
            dialog.remove();
            if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus();
        };
        const close = () => {
            if (dialog.open) dialog.close();
            else cleanup();
        };
        const keyHandler = (e) => {
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                next();
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                prev();
            }
        };

        dialog.querySelector('.photo-preview-close').addEventListener('click', close);
        prevButton.addEventListener('click', prev);
        nextButton.addEventListener('click', next);
        dialog.addEventListener('cancel', event => {
            event.preventDefault();
            close();
        });
        dialog.addEventListener('close', cleanup);
        dialog.addEventListener('click', event => {
            if (event.target !== dialog) return;
            const rect = dialog.getBoundingClientRect();
            const inside = event.clientX >= rect.left && event.clientX <= rect.right
                && event.clientY >= rect.top && event.clientY <= rect.bottom;
            if (!inside) close();
        });
        document.addEventListener('keydown', keyHandler);
        document.body.style.overflow = 'hidden';
        document.body.appendChild(dialog);
        render();
        dialog.showModal();
        dialog.querySelector('.photo-preview-close').focus();
        return dialog;
    },

    closeGallery(dialog) {
        const dialogs = dialog ? [dialog] : [...document.querySelectorAll('.photo-preview-dialog')];
        dialogs.forEach(item => {
            if (item.open && typeof item.close === 'function') item.close();
            else item.remove();
        });
    }
};

document.addEventListener('click', (e) => {
    if (!e.target.closest('#global-search, [data-search-root]')) {
        window.UI.closeSuggestions();
    }
});
