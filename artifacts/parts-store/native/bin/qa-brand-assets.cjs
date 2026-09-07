const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

let count = 0;
function check(name, run) {
    run();
    count += 1;
    console.log(`PASS: ${name}`);
}

const mark = read('public/assets/mark.svg');
const shell = read('public/index.php');
const store = read('public/assets/store.js');

// The icon PNG is rendered from mark.svg by bin/build-brand-icon.sh: the 64 unit
// artwork is drawn 150px wide on a white 180px canvas with a 15px margin.
const ICON_SIZE = 180;
const ICON_MARGIN = 15;
const ICON_SCALE = 150 / 64;
const toIcon = value => Math.round(ICON_MARGIN + value * ICON_SCALE);

function rects(svg) {
    return [...svg.matchAll(/<rect ([^>]*)\/>/g)].map(match => {
        const attrs = Object.fromEntries(
            [...match[1].matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]),
        );
        return {
            x: Number(attrs.x || 0),
            y: Number(attrs.y || 0),
            width: Number(attrs.width),
            height: Number(attrs.height),
            rx: Number(attrs.rx || 0),
            fill: attrs.fill,
            transform: attrs.transform || '',
            raw: match[1],
        };
    });
}

check('the icon mark stays square so browser and home-screen icons are not distorted', () => {
    assert.match(mark, /width="64" height="64" viewBox="0 0 64 64"/);
});

check('the visible lockup is the supplied Ferry Telecom PNG, not recreated artwork', () => {
    assert.match(shell, /src\/assets\/ferry-logo\.png/);
    assert.match(shell, /Content-Type: image\/png/);
    const supplied = fs.readFileSync(path.join(root, '../src/assets/ferry-logo.png'));
    const uploaded = fs.readFileSync(path.join(root, '../../../attached_assets/ferrytelecom-logo_1788731448807.png'));
    assert.deepEqual(supplied, uploaded, 'the public logo source must stay byte-for-byte identical to the supplied artwork');
});

for (const [name, svg] of [['mark', mark]]) {
    check(`the ${name} punches the F out instead of filling it white`, () => {
        assert.match(svg, /<mask id="ftFCut"[^>]*maskUnits="userSpaceOnUse"/);
        assert.match(svg, /mask="url\(#ftFCut\)"/);
        const body = svg.split('<mask')[1].split('</mask>')[0];
        assert.match(body, /<g fill="#000">/, 'the F strokes must be black inside the mask');
        assert.equal(rects(body).length, 4, 'one covering rect plus the three F strokes');
        assert.doesNotMatch(
            svg.split('</mask>')[1],
            /fill="#f{3,6}"/i,
            'a white filled F disappears wherever the logo is inverted, such as the dark footer',
        );
    });

    check(`the ${name} actually paints the diamond in the brand gradient`, () => {
        assert.match(svg, /<linearGradient id="ftBlue"[\s\S]*?stop-color="#[0-9a-f]{6}"[\s\S]*?stop-color="#[0-9a-f]{6}"[\s\S]*?<\/linearGradient>/i);
        const diamond = rects(svg).find(rect => rect.fill === 'url(#ftBlue)');
        assert.ok(diamond, 'the visible artwork must use the gradient, not a flat placeholder');
        assert.match(diamond.transform, /rotate\(45 32 32\)/, 'the mark is a diamond, not an upright tile');
        assert.equal(diamond.width, diamond.height, 'the diamond starts from a square');
        assert.ok(diamond.width >= 34, 'the diamond must fill the canvas, not shrink into a dot');
    });

    check(`the ${name} keeps every stroke of the F inside the diamond`, () => {
        const all = rects(svg);
        const diamond = all.find(rect => rect.fill === 'url(#ftBlue)');
        const cut = rects(svg.split('<mask')[1].split('</mask>')[0]).filter(rect => rect.width < 64);
        assert.equal(cut.length, 3, 'a spine and two arms');
        // A square rotated by 45 degrees is the set of points with |dx| + |dy| <= half its diagonal.
        const reach = (diamond.width * Math.SQRT2) / 2;
        for (const rect of cut) {
            for (const [x, y] of [
                [rect.x, rect.y],
                [rect.x + rect.width, rect.y],
                [rect.x, rect.y + rect.height],
                [rect.x + rect.width, rect.y + rect.height],
            ]) {
                const distance = Math.abs(x - 32) + Math.abs(y - 32);
                assert.ok(distance <= reach - 4, `the F corner ${x},${y} would touch or leave the diamond edge`);
            }
        }
        const spine = cut.reduce((tallest, rect) => (rect.height > tallest.height ? rect : tallest));
        for (const arm of cut.filter(rect => rect !== spine)) {
            assert.ok(arm.x <= spine.x + spine.width, 'each arm must stay attached to the spine');
            assert.ok(arm.y >= spine.y && arm.y + arm.height <= spine.y + spine.height, 'the arms sit along the spine');
            assert.ok(arm.width > arm.height, 'the arms read as horizontal strokes');
        }
        const left = Math.min(...cut.map(rect => rect.x));
        const right = Math.max(...cut.map(rect => rect.x + rect.width));
        assert.ok(Math.abs((left + right) / 2 - 32) <= 3, 'the F stays optically centred in the diamond');
    });

    check(`the ${name} renders from its own file without fetching anything`, () => {
        assert.doesNotMatch(svg, /<image\b/, 'an embedded bitmap would defeat the vector logo');
        assert.doesNotMatch(svg, /(?:xlink:)?href="(?!#)/, 'only internal references are allowed');
        assert.doesNotMatch(svg, /url\((?!#)/, 'no external fonts or images');
    });
}

check('the browser icon uses the square mark and the home-screen icon a real bitmap', () => {
    assert.match(shell, /rel="icon"[^>]*href="\/test-shop\/assets\/mark\.svg\?v=<\?= \$v_mark \?>"/);
    assert.match(shell, /rel="apple-touch-icon"[^>]*href="\/test-shop\/assets\/apple-touch-icon\.png\?v=<\?= \$v_icon \?>"/);
});

check('every page-shell logo reference is cache-busted', () => {
    const refs = shell.match(/src="[^"]*\?asset=brand-logo[^"]*"/g) || [];
    assert.equal(refs.length, 2, 'the header and the footer show the lockup');
    for (const ref of refs) assert.match(ref, /&amp;v=<\?= \$v_logo \?>"$/);
});

check('the login and register cards cache-bust the lockup as well', () => {
    const refs = store.match(/\?asset=brand-logo[^"`]*/g) || [];
    assert.ok(refs.length >= 2, 'both auth cards show the lockup');
    for (const ref of refs) assert.match(ref, /&v=\$\{window\.LOGO_V/);
    assert.match(shell, /window\.LOGO_V = '<\?= \$v_logo \?>'/, 'the shell must publish the version those cards use');
    assert.doesNotMatch(store, /alt="Logo"/, 'name the brand in alt text instead of the word logo');
});

check('the artwork carries the shop its own name only', () => {
    assert.match(shell, /ferry-logo\.png/);
    assert.match(mark, /<title>Ferry Telecom<\/title>/);
});

check('the rendered home-screen icon shows a blue diamond with a see-through F', () => {
    const icon = path.join(root, 'public/assets/apple-touch-icon.png');
    assert.ok(fs.existsSync(icon), 'run bin/build-brand-icon.sh after redrawing the mark');
    const cut = rects(mark.split('<mask')[1].split('</mask>')[0]).filter(rect => rect.width < 64);
    const spine = cut.reduce((tallest, rect) => (rect.height > tallest.height ? rect : tallest));
    const arm = cut.filter(rect => rect !== spine).reduce((widest, rect) => (rect.width > widest.width ? rect : widest));
    const samples = {
        corner: [4, 4],
        spine: [toIcon(spine.x + spine.width / 2), toIcon(spine.y + spine.height / 2)],
        arm: [toIcon(arm.x + arm.width - 2), toIcon(arm.y + arm.height / 2)],
        body: [toIcon(16), toIcon(32)],
    };
    const script = `$im = imagecreatefrompng("${icon}"); [$w, $h] = getimagesize("${icon}");
        $out = ["size" => "{$w}x{$h}"];
        foreach (json_decode('${JSON.stringify(samples)}', true) as $name => $point) {
            $rgb = imagecolorat($im, $point[0], $point[1]);
            $out[$name] = [($rgb >> 16) & 255, ($rgb >> 8) & 255, $rgb & 255];
        }
        echo json_encode($out);`;
    const pixels = JSON.parse(execFileSync('php', ['-r', script.replace(/\n\s+/g, ' ')], {encoding: 'utf8'}));
    assert.equal(pixels.size, `${ICON_SIZE}x${ICON_SIZE}`, 'home-screen icons are square bitmaps');
    const isWhite = ([r, g, b]) => r > 244 && g > 244 && b > 244;
    const isBrandBlue = ([r, g, b]) => b > 200 && r < 150 && b - r > 60;
    assert.ok(isWhite(pixels.corner), `the canvas around the diamond stays opaque white, got ${pixels.corner}`);
    assert.ok(isBrandBlue(pixels.body), `the diamond body must be brand blue, got ${pixels.body}`);
    assert.ok(isWhite(pixels.spine), `the F spine must be cut out of the diamond, got ${pixels.spine}`);
    assert.ok(isWhite(pixels.arm), `the F arm must be cut out of the diamond, got ${pixels.arm}`);
});

(async () => {
    const host = process.env.REPLIT_DEV_DOMAIN;
    if (host) {
        const expected = {'assets/mark.svg': /image\/svg\+xml/, '?asset=brand-logo': /image\/png/, 'assets/apple-touch-icon.png': /image\/png/};
        for (const [file, type] of Object.entries(expected)) {
            const response = await fetch(`https://${host}/test-shop/${file}`);
            assert.equal(response.status, 200, `${file} must be reachable`);
            assert.match(response.headers.get('content-type') || '', type);
            count += 1;
            console.log(`PASS: ${file} is served with the right type`);
        }
    }
    console.log(`${count} brand asset checks passed.`);
})().catch(error => { console.error(error); process.exit(1); });
