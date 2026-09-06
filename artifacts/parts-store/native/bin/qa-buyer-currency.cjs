#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');

global.window = {Core: {escapeHtml: value => String(value)}};
require('../public/assets/buyer-currency.js');

const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return {promise, resolve};
};

(async () => {
    const button = {disabled: false};
    const token = {value: 'stale-token'};
    const gate = window.BuyerCurrency.createQuoteGate(button, token);

    const firstRequest = deferred();
    const firstSequence = gate.begin();
    const firstCompletion = firstRequest.promise.then(value =>
        gate.succeed(firstSequence, value.quote_token)
    );

    assert.equal(button.disabled, true, 'submit is disabled synchronously while the quote is pending');
    assert.equal(token.value, '', 'a pending quote clears the stale token synchronously');

    const secondRequest = deferred();
    const secondSequence = gate.begin();
    const secondCompletion = secondRequest.promise.then(value =>
        gate.succeed(secondSequence, value.quote_token)
    );

    firstRequest.resolve({quote_token: 'obsolete'});
    assert.equal(await firstCompletion, false, 'an obsolete response cannot win the race');
    assert.equal(button.disabled, true, 'obsolete completion cannot enable submit');
    assert.equal(token.value, '', 'obsolete completion cannot restore a token');

    secondRequest.resolve({quote_token: 'latest'});
    assert.equal(await secondCompletion, true);
    assert.equal(token.value, 'latest');
    assert.equal(button.disabled, false, 'only the successful latest quote enables submit');

    console.log('buyer currency deferred-quote QA passed');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});