const fs = require('fs');
let css = fs.readFileSync('artifacts/parts-store/native/public/assets/backoffice.css', 'utf8');

css = css.replace(/background-color: #0ea5e9;\n    color: #ffffff;/,
`background-color: #0284c7;
    color: #ffffff;`);

fs.writeFileSync('artifacts/parts-store/native/public/assets/backoffice.css', css);
