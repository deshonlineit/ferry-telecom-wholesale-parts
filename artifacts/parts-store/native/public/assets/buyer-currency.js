(function () {
    const codes = (`AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`).split(/\s+/);
    const fallback = {CH: 'Zwitserland', NL: 'Nederland', BE: 'België', DE: 'Duitsland', FR: 'Frankrijk', AT: 'Oostenrijk', LU: 'Luxemburg', IT: 'Italië', ES: 'Spanje', GB: 'Verenigd Koninkrijk', US: 'Verenigde Staten'};
    let displayNames = null;
    try {
        displayNames = new Intl.DisplayNames(['nl'], {type: 'region'});
    } catch (_) {}

    const countries = codes.map(code => ({
        code,
        name: displayNames?.of(code) || fallback[code] || code
    })).sort((a, b) => a.name.localeCompare(b.name, 'nl'));

    window.BuyerCurrency = {
        countries,
        options(selected = 'CH') {
            const value = String(selected || 'CH').toUpperCase();
            return countries.map(country =>
                `<option value="${country.code}" ${country.code === value ? 'selected' : ''}>${window.Core.escapeHtml(country.name)} (${country.code})</option>`
            ).join('');
        },
        currencyForCountry(country) {
            return String(country || '').toUpperCase() === 'CH' ? 'CHF' : 'EUR';
        },
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