(function () {
    'use strict';

    const pages = {
        'returns-service': {
            kicker: 'Orders & service',
            title: 'Return & Service Policy',
            intro: 'A clear B2B process for delivery issues, defective parts and approved returns.',
            body: `
                <section><h2>1. Business purchases only</h2>
                    <p>Ferry Telecom AG supplies verified repair and resale businesses. Swiss law does not provide a general cooling-off or change-of-mind right for online purchases. Confirmed orders cannot be returned merely because an item is no longer required, was ordered incorrectly, cannot be resold or is available elsewhere at a different price.</p>
                </section>
                <section><h2>2. Check the delivery promptly</h2>
                    <p>Inspect the shipment, quantities, product identity and visible condition as soon as reasonably possible after delivery. Report missing, wrong, transport-damaged or visibly defective items through the order’s return function within <strong>5 business days</strong>. Hidden defects must be reported immediately after discovery and within the applicable warranty period.</p>
                </section>
                <section><h2>3. Request an RMA first</h2>
                    <ol><li>Open the relevant order in your account and submit a return request.</li><li>State the SKU, quantity and precise fault, and provide clear photos or test results where requested.</li><li>Wait for written RMA approval and return instructions.</li><li>Package approved goods safely and include the RMA reference.</li></ol>
                    <p>Unannounced or unapproved returns may be refused and sent back at the customer’s cost.</p>
                </section>
                <section><h2>4. Conditions for assessment</h2>
                    <p>Keep serial labels, supplier markings and protective films intact until testing is complete. Parts should be tested before permanent installation whenever technically possible. Returned goods must be complete and protected against transport and electrostatic damage.</p>
                    <p>Claims may be rejected where inspection shows installation damage, torn flex cables, bent connectors, pressure or impact damage, liquid or corrosion, incorrect voltage, soldering or modification, contamination, removed identification, normal wear, or use outside the stated specification.</p>
                </section>
                <section><h2>5. Outcome and costs</h2>
                    <p>If Ferry Telecom confirms a defect for which it is responsible, Ferry Telecom may choose to repair, replace or credit the affected product. Cash refunds are not automatic. Installation, diagnostic, removal, reinstallation, downtime and other consequential costs are not reimbursed to the extent permitted by law.</p>
                    <p>The customer pays return shipping initially. Reasonable standard return shipping may be credited when the claim is accepted. Assessment normally begins after receipt and may take up to 10 business days.</p>
                </section>
                <section><h2>6. Exceptional commercial returns</h2>
                    <p>Ferry Telecom may, without obligation, approve an unused and resaleable item as a commercial exception. Approval, any restocking deduction and transport costs are confirmed in writing before return. This does not create a continuing right of return.</p>
                </section>`
        },
        'terms-conditions': {
            kicker: 'Legal',
            title: 'Terms & Conditions',
            intro: 'Terms for business customers purchasing repair parts and supplies from Ferry Telecom AG.',
            body: `
                <section><h2>1. Scope</h2><p>These terms apply to all offers, orders and deliveries by Ferry Telecom AG to business customers. Conflicting customer terms apply only if accepted by Ferry Telecom in writing. Product-specific written terms and the order confirmation take priority over these general terms.</p></section>
                <section><h2>2. Account and product information</h2><p>Accounts are intended for professional repair, refurbishment and resale businesses. Customers must provide accurate company information and protect account access. Catalogue descriptions, compatibility data, images and stock indications are prepared carefully but are not a binding offer. The SKU, quality label and written specification shown in the accepted order determine what is supplied.</p></section>
                <section><h2>3. Order and contract</h2><p>Before submitting an order, the customer can review and correct products, quantities, addresses, shipping and payment information. Submitting the order is a binding offer. An automated receipt confirms transmission only. The contract is concluded when Ferry Telecom expressly accepts the order or dispatches the goods. Ferry Telecom may reject or limit an order, including because of stock, pricing error, account status or compliance concerns.</p></section>
                <section><h2>4. Prices and payment</h2><p>Prices are shown in the indicated currency and with the VAT treatment stated at checkout. Shipping and other charges are shown before the order is submitted. Payment is due using the agreed method and term. Ferry Telecom may suspend delivery, withdraw credit terms or require advance payment for overdue or higher-risk accounts.</p></section>
                <section><h2>5. Delivery, risk and title</h2><p>Delivery dates are estimates unless expressly guaranteed in writing. Partial delivery is permitted where reasonable. Risk passes to the business customer when the goods are handed to the carrier. Ferry Telecom retains title to delivered goods until all amounts due for them have been paid and may register that retention where permitted.</p></section>
                <section><h2>6. Returns, defects and warranty</h2><p>The <a href="${window.APP_BASE}returns-service">Return & Service Policy</a> and <a href="${window.APP_BASE}quality-warranty">Quality and warranty</a> page form part of these terms. There is no general change-of-mind return right. The customer must inspect and notify defects as described there.</p></section>
                <section><h2>7. Liability</h2><p>To the extent permitted by law, Ferry Telecom is not liable for indirect or consequential loss, lost profit, lost data, customer claims, installation or removal costs, or business interruption. Liability for ordinary negligence is excluded. Liability that cannot lawfully be excluded, including for intent or gross negligence, remains unaffected.</p></section>
                <section><h2>8. Force majeure</h2><p>Ferry Telecom is not responsible for delay or non-performance caused by events outside its reasonable control, including carrier interruption, supplier failure, customs action, power or network failure, epidemic, natural event, labour dispute or government measure.</p></section>
                <section><h2>9. Data and intellectual property</h2><p>Personal data is handled according to the <a href="${window.APP_BASE}privacy-policy">Privacy Policy</a>. Store content, photographs, catalogues and trademarks may not be copied or commercially reused without permission, except as required to resell an item lawfully purchased from Ferry Telecom.</p></section>
                <section><h2>10. Law and venue</h2><p>Swiss substantive law applies, excluding conflict-of-law rules and the UN Convention on Contracts for the International Sale of Goods. The courts at the registered seat of Ferry Telecom AG have exclusive jurisdiction, subject to any mandatory venue.</p></section>`
        },
        'privacy-policy': {
            kicker: 'Data protection',
            title: 'Privacy Policy',
            intro: 'How Ferry Telecom AG handles personal data in this B2B store under the Swiss Federal Act on Data Protection.',
            body: `
                <section><h2>1. Controller</h2><address><strong>Ferry Telecom AG</strong><br>Industriestrasse 8<br>6203 Sempach Station, Switzerland<br><a href="mailto:info@ferrytelecom.com">info@ferrytelecom.com</a><br>CHE-254.271.185 MWST</address></section>
                <section><h2>2. Data we process</h2><p>We process business contact and account details, login and security data, billing and delivery addresses, tax or registration identifiers, orders, payments and invoices, support and return communications, uploaded claim evidence, product and search interactions needed to operate the store, and technical records such as IP address, browser information and security logs.</p></section>
                <section><h2>3. Why we use it</h2><p>We use personal data to review business applications, provide and secure accounts, quote and fulfil orders, calculate prices and taxes, process payments, deliver goods, handle returns and support, meet accounting and legal duties, prevent misuse, and improve the reliability of the store. Marketing messages are sent only where permitted and can be stopped at any time.</p></section>
                <section><h2>4. Recipients and service providers</h2><p>Data is shared only where needed with hosting and database providers, payment providers (including Stripe or Wallee when the selected method uses them), warehouse and fulfilment systems (including Picqer when active), carriers, professional advisers and public authorities with a lawful request. Payment providers receive the information needed to process and reconcile payment; Ferry Telecom does not store full card details.</p></section>
                <section><h2>5. International transfers</h2><p>Some providers may process data outside Switzerland. Where the destination does not provide an adequate level of protection, Ferry Telecom uses an applicable legal safeguard, such as recognised standard contractual clauses, or another lawful exception.</p></section>
                <section><h2>6. Cookies</h2><p>The store uses essential session, security, language and preference storage required for login, cart operation and fraud prevention. No advertising or cross-site tracking cookies are used unless separately disclosed and, where required, consented to.</p></section>
                <section><h2>7. Retention</h2><p>Data is retained only as long as needed for the stated purpose and legal claims. Order, invoice and accounting records are generally retained for 10 years where Swiss record-keeping law requires it. Account and support data is removed or anonymised when no longer needed, subject to legal retention and legitimate evidence requirements.</p></section>
                <section><h2>8. Your rights</h2><p>Subject to the conditions of applicable law, you may request information about your personal data, correction, deletion, delivery or transfer of data, or object to particular processing. Contact <a href="mailto:info@ferrytelecom.com">info@ferrytelecom.com</a>. Identity may be verified before a request is completed. You may also contact the Swiss Federal Data Protection and Information Commissioner.</p></section>
                <section><h2>9. Security and updates</h2><p>Ferry Telecom uses proportionate technical and organisational safeguards, but no system can guarantee absolute security. This notice may be updated when processing or legal requirements change. The current version is published here.</p></section>`
        },
        'quality-warranty': {
            kicker: 'Product support',
            title: 'Quality and warranty',
            intro: 'What our quality descriptions mean in practice and how a valid B2B warranty claim is handled.',
            body: `
                <section><h2>1. Agreed quality</h2><p>The product page and accepted order identify the agreed SKU, compatibility, condition and quality label. Quality tiers describe construction, source or expected performance; they do not make different technologies identical. Cosmetic or technical characteristics disclosed for a tier are not defects.</p></section>
                <section><h2>2. Warranty period</h2><p>Unless a different period is stated on the product page, quotation or invoice, Ferry Telecom provides a <strong>3-month warranty from delivery</strong> for defects that existed when risk passed to the customer. This contractual warranty replaces the default warranty remedies to the extent permitted for a B2B transaction. Fraudulently concealed defects and rights that cannot legally be excluded remain unaffected.</p></section>
                <section><h2>3. Test before installation</h2><p>Professional customers must inspect and function-test parts before permanent installation whenever technically possible. Confirm connector alignment, display, touch, image, charging, audio and sensor functions relevant to the part. Do not remove final protective films, apply adhesive, fold flex cables sharply or complete sealing until testing succeeds.</p></section>
                <section><h2>4. What is covered</h2><p>A reproducible material or manufacturing defect that prevents the product from meeting the agreed written specification may be covered. Compatibility is covered only for the exact device model or identifier stated in the listing or order.</p></section>
                <section><h2>5. What is not covered</h2><ul><li>Incorrect ordering, undocumented compatibility assumptions or customer preference.</li><li>Installation damage, torn or creased flex cables, bent pins, pressure marks, broken glass or damaged seals.</li><li>Liquid, corrosion, dirt, electrostatic discharge, overheating, incorrect power, soldering or modification.</li><li>Normal wear, consumable life, cosmetic characteristics disclosed by the quality tier, or faults caused by another component.</li><li>Labour, diagnosis, removal, reinstallation, customer compensation, data loss or business interruption.</li></ul></section>
                <section><h2>6. Remedy</h2><p>After inspection of an approved RMA, Ferry Telecom decides whether a valid claim is resolved by repair, equivalent replacement or credit of the affected product value. A replacement does not restart or extend the original warranty period unless mandatory law requires otherwise.</p></section>
                <section><h2>7. Make a claim</h2><p>Use the return function from the relevant order and follow the <a href="${window.APP_BASE}returns-service">Return & Service Policy</a>. Do not send goods before receiving RMA approval.</p></section>`
        },
        'quality-options': {
            kicker: 'Buying guide',
            title: 'Quality options',
            intro: 'Use the quality label together with the product specification—not as a substitute for checking the exact part.',
            body: `
                <section><h2>Original and Service Pack</h2><p><strong>Original</strong> identifies a part represented as originating from the device brand or its authorised supply chain. <strong>Service Pack</strong> generally indicates brand service-channel packaging. Packaging, included accessories and regional sourcing can vary; the individual listing controls.</p></section>
                <section><h2>Pulled and Refurbished</h2><p><strong>Pulled</strong> is a previously used original component recovered from a device and tested for resale; minor signs of prior use may be present. <strong>Refurbished</strong> uses a recovered original core that has been restored, for example with replacement outer glass. Refurbishment materials and appearance can differ from a new original assembly.</p></section>
                <section><h2>Premium and OEM-labelled</h2><p><strong>Premium</strong> identifies a selected compatible tier intended to offer stronger specifications than standard aftermarket stock. <strong>OEM</strong> is a supplier or market designation and does not by itself mean device-brand-authorised. A product is represented as brand-original only where the listing expressly says Original or Service Pack.</p></section>
                <section><h2>Soft OLED and Hard OLED</h2><p><strong>Soft OLED</strong> uses a flexible OLED substrate and generally more closely matches the construction and fit of many original OLED assemblies. <strong>Hard OLED</strong> uses a rigid substrate; it can be cost-effective but may differ in thickness, durability, bezel or impact resistance. Exact brightness, refresh, colour and sensor support depend on the listed product.</p></section>
                <section><h2>Incell, LCD and compatible assemblies</h2><p><strong>Incell</strong> and other compatible LCD assemblies replace an OLED or LCD using a different display construction. They may differ in thickness, power consumption, colour, viewing angle, brightness, bezel and device messages. Labels such as JK identify a supplier or product line, not an Apple or Samsung authorisation.</p></section>
                <section><h2>Aftermarket and Standard</h2><p><strong>Aftermarket</strong> or <strong>Standard</strong> describes a compatible third-party part where no higher tier is promised. Construction, finish and service life may differ from an original part while still meeting the written specification for that SKU.</p></section>
                <section><h2>Choose and verify</h2><p>Match the exact model, generation, connector and regional variant before ordering. Product-specific wording takes priority over this general guide. If a required feature is not stated, ask before ordering rather than assuming it is included.</p></section>`
        }
    };

    const aliases = {
        'return-service-policy': 'returns-service',
        'quality-and-warranty-of-parts-for-iphone-ipad': 'quality-warranty',
        'quality-options-for-parts': 'quality-options'
    };

    const links = [
        ['returns-service', 'Returns & service'],
        ['terms-conditions', 'Terms'],
        ['privacy-policy', 'Privacy'],
        ['quality-warranty', 'Warranty'],
        ['quality-options', 'Quality options']
    ];

    window.Router.add(/^(returns-service|return-service-policy|terms-conditions|privacy-policy|quality-warranty|quality-and-warranty-of-parts-for-iphone-ipad|quality-options|quality-options-for-parts)$/, (match, root) => {
        const slug = aliases[match[1]] || match[1];
        const page = pages[slug];
        document.title = `${page.title} | Ferry Telecom`;
        root.innerHTML = `
            <article class="legal-page">
                <header class="legal-hero">
                    <p class="legal-kicker">${page.kicker}</p>
                    <h1>${page.title}</h1>
                    <p>${page.intro}</p>
                    <div class="legal-meta"><span>B2B</span><span>Swiss law</span><span>Last updated 15 September 2026</span></div>
                </header>
                <nav class="legal-page-nav" aria-label="Customer service policies">
                    ${links.map(([href, label]) => `<a href="${window.APP_BASE}${href}"${href === slug ? ' aria-current="page"' : ''}>${label}</a>`).join('')}
                </nav>
                <div class="legal-layout">
                    <div class="legal-content">${page.body}</div>
                    <aside class="legal-contact">
                        <h2>Questions?</h2>
                        <p>Contact us before ordering if a specification or quality level is unclear.</p>
                        <a href="mailto:info@ferrytelecom.com">info@ferrytelecom.com</a>
                        <hr>
                        <strong>Ferry Telecom AG</strong>
                        <address>Industriestrasse 8<br>6203 Sempach Station<br>Switzerland</address>
                        <small>CHE-254.271.185 MWST</small>
                    </aside>
                </div>
            </article>`;
    });
})();