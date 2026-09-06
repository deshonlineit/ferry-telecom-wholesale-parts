const fs = require('fs');
let js = fs.readFileSync('artifacts/parts-store/native/public/assets/core.js', 'utf8');

js = js.replace(/showModal\(title, contentHtml\) {[\s\S]*?return overlay;\n    },/,
`showModal(title, contentHtml, options = {}) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = \`
            <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="modal-title-\${Date.now()}">
                <div class="modal-header">
                    <h2 id="modal-title-\${Date.now()}">\${window.Core.escapeHtml(title)}</h2>
                    <button type="button" class="modal-close" aria-label="Sluiten">&times;</button>
                </div>
                <div class="modal-body">\${contentHtml}</div>
            </div>
        \`;
        
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
    },`);

js = js.replace(/closeModal\(overlay\) {[\s\S]*?if\(overlay && overlay\.parentNode\) overlay\.parentNode\.removeChild\(overlay\);\n    },/,
`closeModal(overlay) {
        if (!overlay) {
            document.querySelectorAll('.modal-overlay').forEach(item => this.closeModal(item));
            return;
        }
        if (overlay._cleanup) overlay._cleanup();
        if(overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    },`);

fs.writeFileSync('artifacts/parts-store/native/public/assets/core.js', js);
