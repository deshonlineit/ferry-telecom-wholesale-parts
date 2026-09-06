const fs = require('fs');
let js = fs.readFileSync('artifacts/parts-store/native/public/assets/admin-shell.js', 'utf8');

js = js.replace(/<nav class="admin-nav">/, `
                    <div class="admin-staff-identity" style="padding: 0 0.5rem 1rem 0.5rem; color: #94a3b8; font-size: 0.875rem;">
                        \${window.Core.user ? window.Core.escapeHtml(window.Core.user.name) : 'Staff'}
                    </div>
                    <nav class="admin-nav">`);

fs.writeFileSync('artifacts/parts-store/native/public/assets/admin-shell.js', js);
