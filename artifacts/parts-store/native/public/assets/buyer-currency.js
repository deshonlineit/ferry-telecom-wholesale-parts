(function () {
    // We only deliver inside Europe, so the address forms offer a short, usable
    // list instead of the full ISO list of 247 countries. src/currency.php holds
    // the same list and enforces it; the two must stay in step.
    const NAMES = {
        AD: 'Andorra', AL: 'Albania', AT: 'Austria', BA: 'Bosnia and Herzegovina', BE: 'Belgium',
        BG: 'Bulgaria', CH: 'Switzerland', CY: 'Cyprus', CZ: 'Czechia', DE: 'Germany',
        DK: 'Denmark', EE: 'Estonia', ES: 'Spain', FI: 'Finland', FR: 'France',
        GB: 'United Kingdom', GR: 'Greece', HR: 'Croatia', HU: 'Hungary', IE: 'Ireland',
        IS: 'Iceland', IT: 'Italy', LI: 'Liechtenstein', LT: 'Lithuania', LU: 'Luxembourg',
        LV: 'Latvia', MC: 'Monaco', MD: 'Moldova', ME: 'Montenegro', MK: 'North Macedonia',
        MT: 'Malta', NL: 'Netherlands', NO: 'Norway', PL: 'Poland', PT: 'Portugal',
        RO: 'Romania', RS: 'Serbia', SE: 'Sweden', SI: 'Slovenia', SK: 'Slovakia',
        SM: 'San Marino', UA: 'Ukraine', VA: 'Vatican City', XK: 'Kosovo'
    };

    const currencyForCountry = country => (String(country || '').toUpperCase() === 'CH' ? 'CHF' : 'EUR');

    const countries = Object.keys(NAMES)
        .map(code => ({code, name: NAMES[code], currency: currencyForCountry(code)}))
        .sort((a, b) => a.name.localeCompare(b.name, 'en'));

    const byCode = new Map(countries.map(country => [country.code, country]));

    window.BuyerCurrency = {
        countries,
        options(selected = 'CH') {
            const value = String(selected || 'CH').toUpperCase();
            const escape = text => (window.Core ? window.Core.escapeHtml(text) : text);
            // An existing address outside Europe must not silently change country
            // the moment someone saves it, so that choice stays in the list.
            const list = byCode.has(value) || !/^[A-Z]{2}$/.test(value)
                ? countries
                : [{code: value, name: value, currency: currencyForCountry(value)}].concat(countries);
            return list.map(country =>
                `<option value="${country.code}" ${country.code === value ? 'selected' : ''}>${escape(country.name)} (${country.code})</option>`
            ).join('');
        },
        currencyForCountry,
        createQuoteGate(button, tokenInput) {
            let sequence = 0;
            return {
                begin() {
                    sequence += 1;
                    tokenInput.value = '';
                    button.disabled = true;
                    return sequence;
                },
                isCurrent(candidate) {
                    return candidate === sequence;
                },
                succeed(candidate, token, canSubmit = true) {
                    if (candidate !== sequence) return false;
                    tokenInput.value = token || '';
                    button.disabled = !token || !canSubmit;
                    return true;
                },
                fail(candidate) {
                    if (candidate !== sequence) return false;
                    tokenInput.value = '';
                    button.disabled = true;
                    return true;
                }
            };
        }
    };
})();
