(function initAdminShell() {
    window.Admin = window.Admin || {};
    window.Admin.setMobileMenu = open => {
        const sidebar = document.getElementById('admin-sidebar');
        const toggle = document.querySelector('.admin-mobile-menu-toggle');
        if (sidebar) sidebar.classList.toggle('open', Boolean(open));
        if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') window.Admin.setMobileMenu(false);
    });
    window.Admin.layout = (content, activeRoute) => {
        return `
            <div class="admin-shell">
                <button type="button" class="admin-mobile-menu-toggle" aria-expanded="false" aria-controls="admin-sidebar" onclick="window.Admin.setMobileMenu(this.getAttribute('aria-expanded') !== 'true');">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                    <span>${{
                        'dashboard': 'Dashboard', 'products': 'Products', 'orders': 'Orders', 'invoices': 'Invoices', 'customers': 'Customers', 'returns': 'Returns', 'settings': 'Settings', 'diagnostics': 'Diagnostics', 'integrations': 'Integrations', 'audit': 'Audit Log'
                    }[activeRoute] || 'Administration Menu'}</span>
                </button>
                <aside id="admin-sidebar" class="admin-sidebar">
                    <div class="admin-brand">
                        <img src="${window.APP_BASE}assets/logo-light.svg" alt="Ferry Telecom">
                        <div class="admin-test-badge">Test administration</div>
                    </div>
                    
                    <div class="admin-staff-identity">
                        ${window.Core.user ? window.Core.escapeHtml(window.Core.user.name) : 'Staff'}
                    </div>
                    <nav class="admin-nav" onclick="if(event.target.closest('a')) window.Admin.setMobileMenu(false);">
                        <div class="admin-nav-group">Overview</div>
                        <a href="${window.APP_BASE}admin" class="${activeRoute === 'dashboard' ? 'active' : ''}" ${activeRoute === 'dashboard' ? 'aria-current="page"' : ''}>Dashboard</a>
                        <div class="admin-nav-group">Catalogue</div>
                        <a href="${window.APP_BASE}admin/products" class="${activeRoute === 'products' ? 'active' : ''}" ${activeRoute === 'products' ? 'aria-current="page"' : ''}>Products</a>
                        <a href="${window.APP_BASE}admin/prices" class="${activeRoute === 'prices' ? 'active' : ''}" ${activeRoute === 'prices' ? 'aria-current="page"' : ''}>EUR Prices</a>
                        <div class="admin-nav-group">Commerce</div>
                        <a href="${window.APP_BASE}admin/orders" class="${activeRoute === 'orders' ? 'active' : ''}" ${activeRoute === 'orders' ? 'aria-current="page"' : ''}>Orders</a>
                        <a href="${window.APP_BASE}admin/invoices" class="${activeRoute === 'invoices' ? 'active' : ''}" ${activeRoute === 'invoices' ? 'aria-current="page"' : ''}>Invoices</a>
                        <a href="${window.APP_BASE}admin/customers" class="${activeRoute === 'customers' ? 'active' : ''}" ${activeRoute === 'customers' ? 'aria-current="page"' : ''}>Customers</a>
                        <a href="${window.APP_BASE}admin/returns" class="${activeRoute === 'returns' ? 'active' : ''}" ${activeRoute === 'returns' ? 'aria-current="page"' : ''}>Returns</a>
                        <div class="admin-nav-group">System</div>
                        <a href="${window.APP_BASE}admin/settings" class="${activeRoute === 'settings' ? 'active' : ''}" ${activeRoute === 'settings' ? 'aria-current="page"' : ''}>Settings</a>
                        <a href="${window.APP_BASE}admin/diagnostics" class="${activeRoute === 'diagnostics' ? 'active' : ''}" ${activeRoute === 'diagnostics' ? 'aria-current="page"' : ''}>Diagnostics</a>
                        <a href="${window.APP_BASE}admin/integrations" class="${activeRoute === 'integrations' ? 'active' : ''}" ${activeRoute === 'integrations' ? 'aria-current="page"' : ''}>Integrations</a>
                        <a href="${window.APP_BASE}admin/audit" class="${activeRoute === 'audit' ? 'active' : ''}" ${activeRoute === 'audit' ? 'aria-current="page"' : ''}>Audit Log</a>
                    </nav>
                    <div class="admin-nav-bottom">
                        <a href="${window.APP_BASE}" class="admin-nav-link"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg> View Shop</a>
                        <button type="button" onclick="window.App.logout();" class="admin-nav-link admin-nav-btn text-danger"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg> Sign out</button>
                    </div>
                </aside>
                <div class="admin-main">
                    ${content}
                </div>
            </div>
        `;
    };
})();
