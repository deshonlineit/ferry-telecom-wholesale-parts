const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync, spawn} = require('node:child_process');

const chromium = process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium';
const baseUrl = (process.env.HEADER_ZOOM_BASE_URL || 'http://127.0.0.1:8080/test-shop/').replace(/\/?$/, '/');
const outputDir = path.resolve(__dirname, 'failures', 'header-browser-zoom');
const viewport = {width: 320, height: 800};
const scale = 2;

fs.rmSync(outputDir, {recursive: true, force: true});

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForDebugger(port) {
    let lastError;
    for (let attempt = 0; attempt < 80; attempt += 1) {
        try {
            const response = await fetch(`http://127.0.0.1:${port}/json/version`);
            if (response.ok) return response.json();
        } catch (error) {
            lastError = error;
        }
        await delay(100);
    }
    throw new Error(`Chromium debugging endpoint did not become ready: ${lastError?.message || 'timeout'}`);
}

function connectCdp(webSocketUrl) {
    const socket = new WebSocket(webSocketUrl);
    let sequence = 0;
    const pending = new Map();

    socket.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (!message.id) return;
        const request = pending.get(message.id);
        if (!request) return;
        pending.delete(message.id);
        if (message.error) request.reject(new Error(message.error.message));
        else request.resolve(message.result);
    });

    const opened = new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, {once: true});
        socket.addEventListener('error', () => reject(new Error('Could not connect to Chromium')), {once: true});
    });

    return {
        async send(method, params = {}, sessionId) {
            await opened;
            const id = ++sequence;
            socket.send(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}));
            return new Promise((resolve, reject) => pending.set(id, {resolve, reject}));
        },
        close() {
            socket.close();
        }
    };
}

function sendBrowserZoomKey(windowId, key) {
    execFileSync('xdotool', ['key', '--window', windowId, '--clearmodifiers', key], {
        env: {...process.env, DISPLAY: process.env.DISPLAY || ':0'},
        stdio: 'ignore'
    });
}

async function applyBrowserZoom(cdp, sessionId, browserPid) {
    const displayEnv = {...process.env, DISPLAY: process.env.DISPLAY || ':0'};
    let windowId = '';
    for (let attempt = 0; attempt < 50 && !windowId; attempt += 1) {
        try {
            windowId = execFileSync('xdotool', ['search', '--onlyvisible', '--pid', String(browserPid)], {
                env: displayEnv,
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore']
            }).trim().split(/\s+/)[0];
        } catch {}
        if (!windowId) await delay(100);
    }
    assert(windowId, 'Could not find the Chromium window used for browser zoom');
    execFileSync('xdotool', ['windowactivate', '--sync', windowId], {env: displayEnv, stdio: 'ignore'});
    await delay(500);

    const readMetrics = () => evaluate(cdp, sessionId,
        `({devicePixelRatio, scale: visualViewport.scale, innerWidth, visualWidth: visualViewport.width})`);
    let metrics = await readMetrics();
    assert(Math.abs(metrics.devicePixelRatio - 1) < 0.01,
        `Fresh Chromium profile should start at 100% zoom, got devicePixelRatio ${metrics.devicePixelRatio}`);

    for (let step = 0; step < 10; step += 1) {
        const previousRatio = metrics.devicePixelRatio;
        sendBrowserZoomKey(windowId, 'ctrl+equal');
        let changed = false;
        for (let poll = 0; poll < 100; poll += 1) {
            await delay(50);
            metrics = await readMetrics();
            if (metrics.devicePixelRatio > previousRatio + 0.01) {
                changed = true;
                break;
            }
        }
        assert(changed,
            `Chromium did not process browser zoom step ${step + 1} within 5 seconds (devicePixelRatio ${previousRatio})`);
        if (Math.abs(metrics.devicePixelRatio - scale) < 0.01) return metrics;
        assert(metrics.devicePixelRatio < scale,
            `Browser zoom skipped past 200% (devicePixelRatio ${metrics.devicePixelRatio})`);
    }
    throw new Error('Chromium did not reach 200% browser zoom');
}

async function evaluate(cdp, sessionId, expression, awaitPromise = true) {
    const result = await cdp.send('Runtime.evaluate', {
        expression,
        awaitPromise,
        returnByValue: true
    }, sessionId);
    if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    }
    return result.result.value;
}

async function waitForHeader(cdp, sessionId) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        const ready = await evaluate(cdp, sessionId,
            `Boolean(window.Core && document.querySelector('.logo img')?.complete && document.querySelector('#user-nav'))`);
        if (ready) return;
        await delay(100);
    }
    throw new Error('Application header did not become ready');
}

const personaScript = persona => `(() => {
    window.Core.user = ${persona === 'guest' ? 'null' : JSON.stringify({
        id: persona === 'staff' ? 7 : 42,
        role: persona
    })};
    window.Core.cart = {items: [], total_cents: 0};
    window.Core.renderNav();
    window.Core.syncHeaderViewport();
    return {
        persona: ${JSON.stringify(persona)},
        zoomed: document.body.hasAttribute('data-header-zoomed'),
        scale: window.visualViewport?.scale,
        width: window.visualViewport?.width,
        innerWidth: window.innerWidth,
        devicePixelRatio: window.devicePixelRatio,
        zoomMediaQuery: matchMedia('(max-width: 240px)').matches
    };
})()`;

const geometryScript = `(() => {
    const isVisible = selector => {
        const element = document.querySelector(selector);
        return element && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
    };
    const selectors = {
        logo: ['.app-header .logo'],
        accountActions: Array.from(document.querySelectorAll('#user-nav > a, #user-nav > button')).map(
            (_, index) => \`#user-nav > :nth-child(\${index + 1})\`
        ),
        search: isVisible('#search-input')
            ? ['#search-input', '.search-submit']
            : ['.page-search-jump']
    };
    const visual = {
        left: window.visualViewport.offsetLeft,
        top: window.visualViewport.offsetTop,
        right: window.visualViewport.offsetLeft + window.visualViewport.width,
        bottom: window.visualViewport.offsetTop + window.visualViewport.height
    };
    const inspect = (selector, focus) => {
        const element = document.querySelector(selector);
        if (!element) return {selector, missing: true};
        if (focus) element.focus({preventScroll: true});
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const outline = focus && style.outlineStyle !== 'none'
            ? (parseFloat(style.outlineWidth) || 0) + (parseFloat(style.outlineOffset) || 0)
            : 0;
        return {
            selector,
            focused: !focus || document.activeElement === element,
            rect: {
                left: rect.left - outline,
                top: rect.top - outline,
                right: rect.right + outline,
                bottom: rect.bottom + outline,
                width: rect.width,
                height: rect.height
            }
        };
    };
    return {
        visual,
        elements: [
            ...selectors.logo.map(selector => inspect(selector, false)),
            ...selectors.accountActions.map(selector => inspect(selector, true)),
            ...selectors.search.map(selector => inspect(selector, true))
        ]
    };
})()`;

function assertGeometry(persona, geometry) {
    assert(geometry.elements.length >= 4, `${persona}: expected logo, account actions and search controls`);
    for (const item of geometry.elements) {
        assert(!item.missing, `${persona}: missing ${item.selector}`);
        assert(item.focused, `${persona}: ${item.selector} could not receive keyboard focus`);
        assert(item.rect.width > 0 && item.rect.height > 0, `${persona}: ${item.selector} is not visibly rendered`);
        assert(item.rect.left >= geometry.visual.left - 0.5,
            `${persona}: ${item.selector} clips the Visual Viewport at the left`);
        assert(item.rect.right <= geometry.visual.right + 0.5,
            `${persona}: ${item.selector} clips the Visual Viewport at the right`);
        assert(item.rect.top >= geometry.visual.top - 0.5,
            `${persona}: ${item.selector} clips the Visual Viewport at the top`);
        assert(item.rect.bottom <= geometry.visual.bottom + 0.5,
            `${persona}: ${item.selector} clips the Visual Viewport at the bottom`);
    }
}

async function saveFailureScreenshot(cdp, sessionId, persona) {
    fs.mkdirSync(outputDir, {recursive: true});
    const capture = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false
    }, sessionId);
    const destination = path.join(outputDir, `${persona}-320px-200pct.png`);
    fs.writeFileSync(destination, Buffer.from(capture.data, 'base64'));
    return destination;
}

async function main() {
    const port = 9200 + Math.floor(Math.random() * 500);
    const profile = path.join('/tmp', `header-browser-zoom-${process.pid}`);
    const browser = spawn(chromium, [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--window-size=640,800',
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profile}`,
        'about:blank'
    ], {stdio: ['ignore', 'ignore', 'pipe']});
    let stderr = '';
    browser.stderr.on('data', chunk => { stderr += chunk; });
    let cdp;

    try {
        const debuggerInfo = await waitForDebugger(port);
        cdp = connectCdp(debuggerInfo.webSocketDebuggerUrl);
        const {targetId} = await cdp.send('Target.createTarget', {url: 'about:blank'});
        const {sessionId} = await cdp.send('Target.attachToTarget', {targetId, flatten: true});
        await cdp.send('Page.enable', {}, sessionId);
        await cdp.send('Runtime.enable', {}, sessionId);
        await cdp.send('Emulation.setDeviceMetricsOverride', {
            width: viewport.width,
            height: viewport.height,
            deviceScaleFactor: 0,
            mobile: false,
            screenWidth: viewport.width,
            screenHeight: viewport.height
        }, sessionId);
        await cdp.send('Page.navigate', {url: baseUrl}, sessionId);
        await waitForHeader(cdp, sessionId);
        const browserZoom = await applyBrowserZoom(cdp, sessionId, browser.pid);
        assert.strictEqual(browserZoom.scale, 1,
            '200% browser zoom must keep Visual Viewport scale at 1 (not emulate pinch zoom)');
        assert(Math.abs(browserZoom.innerWidth - viewport.width / scale) < 1,
            `200% browser zoom should reflow a ${viewport.width}px viewport to ${viewport.width / scale}px CSS width`);

        for (const persona of ['guest', 'customer', 'staff']) {
            try {
                const state = await evaluate(cdp, sessionId, personaScript(persona));
                assert(!state.zoomed, `${persona}: browser zoom must not use the pinch-only header attribute`);
                assert.strictEqual(state.scale, 1, `${persona}: browser zoom must retain Visual Viewport scale 1`);
                assert(Math.abs(state.devicePixelRatio - scale) < 0.01,
                    `${persona}: expected 200% browser zoom, got devicePixelRatio ${state.devicePixelRatio}`);
                assert(state.zoomMediaQuery,
                    `${persona}: 200% browser zoom did not activate the <=240px reflow media query`);
                assert(Math.abs(state.innerWidth - viewport.width / scale) < 1,
                    `${persona}: expected ${viewport.width / scale}px layout width, got ${state.innerWidth}`);
                const geometry = await evaluate(cdp, sessionId, geometryScript);
                assertGeometry(persona, geometry);
                console.log(`PASS ${persona}: ${geometry.elements.length} header elements and focus rings fit ` +
                    `${Math.round(geometry.visual.right - geometry.visual.left)}x${Math.round(geometry.visual.bottom - geometry.visual.top)} Visual Viewport`);
            } catch (error) {
                const screenshot = await saveFailureScreenshot(cdp, sessionId, persona);
                const currentGeometry = await evaluate(cdp, sessionId, geometryScript).catch(() => null);
                error.message += `\nGeometry: ${JSON.stringify(currentGeometry, null, 2)}`;
                error.message += `\nFailure screenshot: ${screenshot}`;
                throw error;
            }
        }
    } catch (error) {
        if (stderr.trim()) error.message += `\nChromium stderr:\n${stderr.slice(-2000)}`;
        throw error;
    } finally {
        cdp?.close();
        browser.kill('SIGTERM');
        if (browser.exitCode === null) {
            await Promise.race([
                new Promise(resolve => browser.once('exit', resolve)),
                delay(2000)
            ]);
        }
        fs.rmSync(profile, {recursive: true, force: true, maxRetries: 5, retryDelay: 100});
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});