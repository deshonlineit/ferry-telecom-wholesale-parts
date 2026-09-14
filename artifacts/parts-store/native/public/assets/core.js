window.APP_BASE = window.APP_BASE || '/test-shop/';
const API_BASE = window.APP_BASE + 'api';

window.Core = {
    csrf: '',
    user: null,
    capabilities: {},
    currency: 'CHF',
    country: 'CH',
    exchangeRate: null,
    pricingReady: true,
    cart: { items: [], total_cents: 0 },

    syncHeaderViewport() {
        const viewport = window.visualViewport;
        if (!viewport) return;
        const zoomedMobile = viewport.scale >= 1.75 && viewport.width <= 240;
        document.body.toggleAttribute('data-header-zoomed', zoomedMobile);
        if (zoomedMobile) {
            document.documentElement.style.setProperty('--header-visual-width', `${viewport.width}px`);
        } else {
            document.documentElement.style.removeProperty('--header-visual-width');
        }
    },
    
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
            const error = new Error(data.error || data.message || `HTTP error ${res.status}`);
            error.status = res.status;
            error.data = data;
            error.code = data.code || data.error_code || null;
            const translationKey = window.I18n?.errorKey(error.code);
            if (translationKey) error.message = window.I18n.t(translationKey);
            error.response = res;
            throw error;
        }
        return data;
    },

    updateCurrencyContext(data = {}) {
        const context = {...data, ...(data.context || {}), ...(data.currency_context || {})};
        const country = context.country || context.delivery_country;
        if (country) this.country = String(country).toUpperCase();
        if (context.currency) this.currency = context.currency;
        if (Object.prototype.hasOwnProperty.call(context, 'exchange_rate')) this.exchangeRate = context.exchange_rate;
        if (Object.prototype.hasOwnProperty.call(context, 'pricing_ready')) this.pricingReady = Boolean(context.pricing_ready);
    },
    
    async init() {
        this.syncHeaderViewport();
        window.visualViewport?.addEventListener('resize', () => this.syncHeaderViewport());
        try {
            const data = await this.fetch('/session');
            this.csrf = data.csrf;
            this.user = data.user;
            this.capabilities = data.capabilities;
            this.updateCurrencyContext(data);
            this.renderNav();
            this.refreshCart();
        } catch(e) {
            document.body.innerHTML = `<div class="container mt-4"><div class="alert error">The application failed to load: ${this.escapeHtml(e.message)}</div></div>`;
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
            this.updateCurrencyContext(data || {});
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

    formatMoney(cents, currency = this.currency) {
        if (typeof cents !== 'number') return '';
        return window.I18n ? window.I18n.formatMoney(cents, currency) : (cents / 100).toFixed(2) + ' ' + currency;
    },

    currencyNotice(context = this) {
        const rate = context.exchange_rate || context.exchangeRate;
        if ((context.currency || this.currency) !== 'CHF') return '';
        if (!rate || rate.status === 'unavailable') return window.I18n.t('currencyUnavailable', {currency: context.currency || this.currency});
        if (rate.status === 'stale') return window.I18n.t('currencyStale', {currency: context.currency || this.currency});
        return '';
    },

    renderNav() {
        const nav = document.getElementById('user-nav');
        const count = this.cart.items ? this.cart.items.reduce((a,b)=>a+b.quantity,0) : 0;
        let html = '';

        if (nav && this.user) {
            html += `<a href="${window.APP_BASE}account" class="nav-link nav-icon-action nav-account-action" aria-label="${window.I18n.t('account')}" title="${window.I18n.t('account')}">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            </a>`;
            
            if (this.user.role === 'staff') {
                html += `<a href="${window.APP_BASE}admin" class="nav-link text-danger">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
                    <span class="nav-text">Backoffice</span>
                </a>`;
            } else {
                html += `<a href="${window.APP_BASE}quick-order" class="nav-link nav-icon-action nav-quick-order-action" aria-label="${window.I18n.t('quickOrder')}" title="${window.I18n.t('quickOrder')}">
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="13 2 4 14 12 14 11 22 20 10 12 10 13 2"></polyline></svg>
                </a>`;
                html += `<a href="${window.APP_BASE}cart" class="nav-link nav-cart" aria-label="${window.I18n.t('cart')}" title="${window.I18n.t('cart')}">
                    <div class="cart-icon-wrapper">
                        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
                        <span class="cart-badge" style="display:${count > 0 ? 'flex' : 'none'}">${count}</span>
                    </div>
                    <span class="nav-text">${window.I18n.t('cart')}</span>
                </a>`;
            }
            
            html += `<button type="button" onclick="window.App.logout()" class="nav-link nav-icon-action nav-signout-action" aria-label="${window.I18n.t('signOut')}" title="${window.I18n.t('signOut')}">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 17l5-5-5-5"></path><path d="M15 12H3"></path><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"></path></svg>
            </button>`;
        } else if (nav) {
            html += `<a href="${window.APP_BASE}login" class="nav-link nav-signin" aria-label="${window.I18n.t('signIn')}">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                <span>${window.I18n.t('signIn')}</span>
            </a>`;
            html += `<a href="${window.APP_BASE}register" class="btn btn-primary btn-sm">${window.I18n.t('becomeCustomer')}</a>`;
        }
        
        if (nav) nav.innerHTML = html;
        this.renderFooterAccountLinks();
    },

    renderFooterAccountLinks() {
        const footerLinks = document.getElementById('footer-account-links');
        if (!footerLinks) return;

        const accountLinks = this.user
            ? `<a href="${window.APP_BASE}account">${window.I18n.t('account')}</a>
               <a href="${window.APP_BASE}account/orders">${window.I18n.t('footerOrderHistory')}</a>
               <a href="${window.APP_BASE}account/returns">${window.I18n.t('footerReturns')}</a>
               <a href="${window.APP_BASE}cart">${window.I18n.t('cart')}</a>
               <a href="${window.APP_BASE}" onclick="window.App.logout(); return false;">${window.I18n.t('signOut')}</a>`
            : `<a href="${window.APP_BASE}login">${window.I18n.t('signIn')}</a>
               <a href="${window.APP_BASE}register">${window.I18n.t('requestAccount')}</a>
               <a href="${window.APP_BASE}cart">${window.I18n.t('cart')}</a>`;

        footerLinks.innerHTML = `<h4 data-i18n="footerAccount">${window.I18n.t('footerAccount')}</h4>${accountLinks}`;
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
        let html = `<nav class="pagination" aria-label="${window.I18n.t('pagination')}">`;
        
        if (currentPage > 1) {
            searchParams.set('page', currentPage - 1);
            html += `<a href="${basePath}?${searchParams.toString()}" class="page-link prev" aria-label="${window.I18n.t('previous')}">&lsaquo;</a>`;
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
            html += `<a href="${basePath}?${searchParams.toString()}" class="page-link next" aria-label="${window.I18n.t('next')}">&rsaquo;</a>`;
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
    hasRoute(path) {
        const destination = new URL(path, location.origin);
        let routePath = destination.pathname;
        if (routePath.startsWith(window.APP_BASE)) {
            routePath = routePath.substring(window.APP_BASE.length);
        }
        return this.routes.some(({pattern}) => {
            pattern.lastIndex = 0;
            return pattern.test(routePath);
        });
    },
    navigate(path) {
        if (window.I18n?.explicit) {
            const destination = new URL(path, location.origin);
            destination.searchParams.set('lang', window.I18n.locale);
            path = destination.pathname + destination.search;
        }
        if (!this.hasRoute(path)) {
            window.location.assign(path);
            return;
        }
        history.pushState({}, '', path);
        this.route();
        // Refining an already visible catalogue should not throw the customer
        // back to the top of the page.
        const nextPath = new URL(path, location.origin).pathname.replace(window.APP_BASE, '');
        if (!(nextPath === 'catalog' && document.querySelector('#app-root [data-catalog-shell]'))) window.scrollTo(0, 0);
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

        // An admin URL is also the entry point for staff. Sending an
        // unauthenticated visitor to the storefront hid the login path and
        // made /admin appear broken. Route every non-staff session to sign-in;
        // the login handler sends a successful staff login back to /admin.
        if (path.startsWith('admin') && (!window.Core.user || window.Core.user.role !== 'staff')) {
            const loginPath = window.APP_BASE + 'login';
            if (location.pathname !== loginPath) {
                return this.navigate(loginPath);
            }
        }

        // Keep header search mode stable while asynchronous route content loads.
        // Inferring this from page descendants caused a visible full-search flash
        // between removing the homepage and mounting the catalogue.
        document.body.setAttribute('data-header-search', path === '' || path === 'catalog' ? 'compact' : 'full');
        
        if (path.startsWith('admin') && window.Core.user && window.Core.user.role === 'staff') {
            document.body.setAttribute('data-area', 'admin');
        } else {
            document.body.removeAttribute('data-area');
        }

        const qs = location.search;
        const mount = document.getElementById('app-root');
        // The catalogue owns its refresh state.  Reusing this mount keeps the
        // sidebar and the previous rows in place while its next query arrives.
        const catalogRefresh = path === 'catalog' && mount.querySelector?.('[data-catalog-shell]');
        const root = catalogRefresh ? mount.firstElementChild : document.createElement('div');
        if (!catalogRefresh) {
            root.className = 'route-content';
            mount.replaceChildren(root);
            root.innerHTML = '<div class="page-loader"><div class="spinner"></div></div>';
        }
        
        for (const {pattern, handler} of this.routes) {
            const match = path.match(pattern);
            if (match) {
                try {
                    await handler(match, root, new URLSearchParams(qs));
                    window.I18n?.localize(root);
                } catch(err) {
                    if (renderVersion !== this.renderVersion) return;
                    root.innerHTML = `
                        <div class="alert error mt-4">
                            <h3>${window.I18n.t('errorTitle')}</h3>
                            <p>${window.Core.escapeHtml(err.message)}</p>
                            <button onclick="window.Router.route()" class="btn btn-outline btn-sm mt-2">${window.I18n.t('retry')}</button>
                        </div>
                    `;
                }
                return;
            }
        }
        root.innerHTML = `
            <div class="empty-state mt-4">
                <h2>404 — ${window.I18n.t('pageNotFound')}</h2>
                <p>${window.I18n.t('pageMissing')}</p>
                <a href="${window.APP_BASE}catalog" class="btn btn-primary mt-4">${window.I18n.t('backCatalogue')}</a>
            </div>
        `;
        window.I18n?.localize(root);
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
            'flex': 50,
            'audio': 60,
            'adhesive': 70,
            'housing': 80,
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
        window.I18n?.init();
        const sessionReady = window.Core.init();
        window.Core.ready = sessionReady;
        window.StoreMenu.init();
        const path = location.pathname.startsWith(window.APP_BASE)
            ? location.pathname.substring(window.APP_BASE.length)
            : location.pathname.replace(/^\/+/, '');
        if (path === 'catalog') {
            await window.Router.route();
            return;
        }
        await sessionReady;
        await window.Router.route();
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
        return window.B2BOrdering.searchInput(val, owner);
    },

    handleSearchKeydown(event) {
        return window.B2BOrdering.searchKeydown(event);
    },

    handleSearchFocus(owner = 'search-input') {
        if (this.restoringSearchFocus) return;
        if (owner !== (this.searchOwner || 'search-input')) window.UI.closeSuggestions();
        this.searchOwner = owner;
        const input = document.getElementById(owner);
        if (input && input.value.trim()) {
            this.handleSearchInput(input.value, owner);
        }
    },

    renderSuggestions(data, query) {
        return window.B2BOrdering.renderSuggestions(data, query);
    },

    async addToCartWithQty(id, qty, button) {
        return window.B2BOrdering.quickAdd(id, qty, button);
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
                    <button type="button" class="modal-close" aria-label="Close">&times;</button>
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
        if (el) {
            el.style.display = 'none';
            el.classList.remove('search-popout-enter', 'has-more-below');
            el.parentElement?.classList.remove('search-popout-active');
            if (el._searchOrigin) {
                const {parent, next} = el._searchOrigin;
                if (parent?.isConnected) parent.insertBefore(el, next?.parentNode === parent ? next : null);
                delete el._searchOrigin;
            }
        }
        document.body.classList.remove('search-popout-mobile-open');
        input?.closest('[data-search-root]')?.classList.remove('search-popout-active');
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
                    <div class="photo-preview-tools" aria-label="Zoom controls">
                        <button type="button" class="photo-preview-zoom-out" aria-label="Zoom out">&minus;</button>
                        <output class="photo-preview-zoom-level" aria-live="polite">Fit</output>
                        <button type="button" class="photo-preview-zoom-in" aria-label="Zoom in">&plus;</button>
                        <button type="button" class="photo-preview-zoom-reset">Fit</button>
                    </div>
                    <button type="button" class="photo-preview-close gallery-close" aria-label="Close photo preview">&times;</button>
                </header>
                <div class="photo-preview-content gallery-content">
                    <button type="button" class="photo-preview-nav gallery-nav prev" aria-label="Previous photo">&lsaquo;</button>
                    <figure class="photo-preview-figure">
                        <img class="photo-preview-image gallery-img" alt="">
                    </figure>
                    <button type="button" class="photo-preview-nav gallery-nav next" aria-label="Next photo">&rsaquo;</button>
                </div>
            </div>
        `;

        const title = dialog.querySelector('.photo-preview-title');
        const counter = dialog.querySelector('.photo-preview-counter');
        const image = dialog.querySelector('.photo-preview-image');
        const figure = dialog.querySelector('.photo-preview-figure');
        const prevButton = dialog.querySelector('.photo-preview-nav.prev');
        const nextButton = dialog.querySelector('.photo-preview-nav.next');
        const zoomOutButton = dialog.querySelector('.photo-preview-zoom-out');
        const zoomInButton = dialog.querySelector('.photo-preview-zoom-in');
        const zoomResetButton = dialog.querySelector('.photo-preview-zoom-reset');
        const zoomLevel = dialog.querySelector('.photo-preview-zoom-level');
        const productName = options.title || window.I18n.t('product');
        const zoomSteps = [1, 1.5, 2, 3, 4];
        let zoomIndex = 0;
        let dragging = false;
        let dragX = 0;
        let dragY = 0;
        let scrollLeft = 0;
        let scrollTop = 0;
        title.textContent = productName;

        const applyZoom = (keepCenter = true) => {
            const oldWidth = Math.max(1, figure.scrollWidth);
            const oldHeight = Math.max(1, figure.scrollHeight);
            const centerX = figure.scrollLeft + figure.clientWidth / 2;
            const centerY = figure.scrollTop + figure.clientHeight / 2;
            const zoom = zoomSteps[zoomIndex];
            image.style.width = zoom === 1 ? '' : `${zoom * 100}%`;
            image.style.height = zoom === 1 ? '' : 'auto';
            image.style.maxWidth = zoom === 1 ? '100%' : 'none';
            image.style.maxHeight = zoom === 1 ? '100%' : 'none';
            figure.classList.toggle('is-zoomed', zoom > 1);
            zoomOutButton.disabled = zoomIndex === 0;
            zoomInButton.disabled = zoomIndex === zoomSteps.length - 1;
            zoomResetButton.disabled = zoomIndex === 0;
            zoomLevel.value = zoom === 1 ? 'Fit' : `${Math.round(zoom * 100)}%`;
            if (!keepCenter || zoom === 1) {
                figure.scrollTo(0, 0);
                return;
            }
            requestAnimationFrame(() => {
                figure.scrollLeft = centerX * (figure.scrollWidth / oldWidth) - figure.clientWidth / 2;
                figure.scrollTop = centerY * (figure.scrollHeight / oldHeight) - figure.clientHeight / 2;
            });
        };
        const resetZoom = () => {
            zoomIndex = 0;
            applyZoom(false);
        };
        const changeZoom = delta => {
            const nextZoom = Math.max(0, Math.min(zoomSteps.length - 1, zoomIndex + delta));
            if (nextZoom === zoomIndex) return;
            zoomIndex = nextZoom;
            applyZoom();
        };
        const render = () => {
            resetZoom();
            image.src = images[currentIndex].url;
            image.alt = images.length > 1
                ? `${productName}, photo ${currentIndex + 1} of ${images.length}`
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
        dialog._cleanup = cleanup;
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
            } else if (e.key === '+' || e.key === '=') {
                e.preventDefault();
                changeZoom(1);
            } else if (e.key === '-') {
                e.preventDefault();
                changeZoom(-1);
            } else if (e.key === '0') {
                e.preventDefault();
                resetZoom();
            }
        };

        dialog.querySelector('.photo-preview-close').addEventListener('click', close);
        prevButton.addEventListener('click', prev);
        nextButton.addEventListener('click', next);
        zoomOutButton.addEventListener('click', () => changeZoom(-1));
        zoomInButton.addEventListener('click', () => changeZoom(1));
        zoomResetButton.addEventListener('click', resetZoom);
        figure.addEventListener('pointerdown', event => {
            if (zoomIndex === 0 || event.button !== 0) return;
            dragging = true;
            dragX = event.clientX;
            dragY = event.clientY;
            scrollLeft = figure.scrollLeft;
            scrollTop = figure.scrollTop;
            figure.classList.add('is-dragging');
            figure.setPointerCapture(event.pointerId);
        });
        figure.addEventListener('pointermove', event => {
            if (!dragging) return;
            figure.scrollLeft = scrollLeft - (event.clientX - dragX);
            figure.scrollTop = scrollTop - (event.clientY - dragY);
        });
        const stopDragging = event => {
            if (!dragging) return;
            dragging = false;
            figure.classList.remove('is-dragging');
            if (figure.hasPointerCapture(event.pointerId)) figure.releasePointerCapture(event.pointerId);
        };
        figure.addEventListener('pointerup', stopDragging);
        figure.addEventListener('pointercancel', stopDragging);
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
            else if (item._cleanup) item._cleanup();
            else item.remove();
        });
    }
};

document.addEventListener('click', (e) => {
    if (!e.target.closest('#global-search, [data-search-root]')) {
        window.UI.closeSuggestions();
    }
});
