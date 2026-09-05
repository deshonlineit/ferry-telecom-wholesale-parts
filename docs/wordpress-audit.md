# Ferry Telecom — eerste technische inventarisatie

Onderzocht op 6 september 2026. Dit rapport beschrijft een geauthenticeerde, alleen-lezen broncode-inventarisatie en beperkte openbare pagina-inspectie. Het is geen volledige functionele test, beveiligingsscan of databasecontrole.

## 1. Conclusie

De bestaande omgeving is meer dan een standaard WooCommerce-webshop. Bedrijfslogica zit in plugins, een uitgebreid child theme, een maatwerk-retoursysteem en afzonderlijke integraties. Alleen producten en categorieën exporteren zou wezenlijke functies missen.

Core PHP, MySQL en vanilla JavaScript blijven het gevraagde doel. De vervanging moet echter expliciet ook retouren/creditnota's, klantadressen, groepsprijzen, documenten en koppelingen afdekken. De huidige broncode gebruikt voor enkele van die functies externe libraries; een library-vrije vervanging moet eerst aantoonbaar dezelfde vereiste resultaten leveren.

De volledige aanpak en acceptatiecriteria staan in `docs/rebuild-plan.md`.

## 2. Werkwijze en grenzen

- Hostingtoegang werkt via HTTPS met certificaatcontrole.
- Alleen bestandslijsten en gerichte broncode-structuur zijn via de hosting-API gelezen.
- Plugin-/themanamen, functies, hooks, afhankelijkheden en veldnamen zijn onderzocht; geheimen en complete ruwe bronbestanden zijn niet in het rapport opgenomen.
- Geen `wp-config.php`/`.env`-bestanden, klantbestanden, facturen, logs, gegevens-exports of backups gelezen. Eventuele geheime waarden in onderzochte applicatiecode zijn niet als uitvoer getoond.
- Geen bestanden, instellingen, databasegegevens, orders, voorraden of webhookregistraties gewijzigd.
- Geen betaalacties, testorders, retourinzendingen of klantmails uitgevoerd.
- Aanvullend zijn alleen database-metadata en de gedocumenteerde schema-export bekeken. Die export bevatte alleen database-definities, geen tabellen of rijen; dit bewijst niet dat de databases leeg zijn.
- Aanwezige broncode bewijst niet dat een functie actief is of momenteel correct werkt.
- Frontend-verwijzingen en publieke API-registratie geven aanvullende aanwijzingen, maar vervangen de actieve instellingen en functionele tests niet.

## 3. Onderdelen van de omgeving

| Onderdeel | Waargenomen | Betekenis voor herbouw |
| --- | --- | --- |
| Hoofdwebshop | WordPress/WooCommerce, 39 pluginmappen, Martfury met child theme | Inventariseren op bedrijfsfunctie; niet één-op-één plugins kopiëren |
| Maatwerk child theme | Centrale functions.php van 57.941 bytes plus losse modules | Belangrijke regels zitten buiten plugins |
| Retouren | RMA-modules binnen het child theme | Eigen gegevens, statusovergangen en creditnota's meenemen |
| Picqer-service | Los PHP-eindpunt en classes voor payloads, labels en responses | Bestaand labelcontract behouden; niet verwarren met de volledige voorraadsynchronisatie |
| Tweede-site/Shopify-koppelingen | Product-/prijsdoorzetting en apart fulfillmentscript | Andere verkoopkanalen kunnen afhankelijk zijn van de huidige webshop |
| Schermeninkoop | Eigen WordPress-installatie met TablePress-maatwerk | Afzonderlijke inhoud, prijstabellen, synchronisatie en PDF-export onderzoeken |

### Bronpaden

Alle paden hieronder zijn relatief aan de website-documentroot:
- `wp-content/themes/martfury-child/`
- `picqer.ferrytelecom.com/`
- `api.ferrytelecom.com/shopify/`
- `sellscreens.ferrytelecom.com/wp-content/`

## 4. Functionele inventaris

### A. Catalogus, zoeken en bestellen

**Aangetroffen in code**
- Maatwerk voor productkwaliteitfilters, voorraadweergave, SKU/zoekopdrachten en prijsweergave.
- Minimum-bestelhoeveelheden en afscherming van prijzen/winkelwagen voor gasten.
- Aangepaste checkoutvelden, bestelnotities en winkelwagenweergave.
- Theme-code voor onder meer quick view, productmedia, zoom, gerelateerde producten, wishlist/compare en aanbiedingen.

**Aanvullend openbaar waargenomen**
- Frontend-assets van zoek-, menu-, usability-, currency- en wholesale-registrationcomponenten.
- Publieke API-namespaces voor WooCommerce, wholesale, order forms, lead capture en shipment tracking.

**Nog verifiëren**
- Welke themefuncties daadwerkelijk ingeschakeld zijn en welke vereiste plugins beschikbaar zijn.
- Exacte kwaliteitslabels, aantallenregels, zoekprioriteiten en gastrechten.
- Werkelijke categorie-/modelcompatibiliteit en productvarianten.

Bronnen: child-theme `functions.php`, `product-filter/product-filter.php`, `inc/frontend/woocommerce.php`, `woocommerce/cart/cart.php`.

### B. Klantgroepen, prijzen en registratie

**Aangetroffen**
- Wholesale Prices en Premium, Lead Capture en Wholesale Order Form zijn aanwezig.
- Child-theme-aanpassingen voor registratie, gebruikersrollen, prijsweergave en accountnavigatie.
- Premium-pluginmodules voor rolafhankelijke prijzen, betaalmethoden, verzending, belasting en bestelvoorwaarden.

**Vereiste vervanging**
- Klantgoedkeuring, toegewezen groepen en de daadwerkelijk gebruikte prijsregels.
- Alleen de eigen klantprijs tonen, ook in API-antwoorden en caches.
- Snelle bestelinterface en rolafhankelijke voorwaarden waar actief.

**Nog verifiëren**
- Actieve instellingen en exacte uitzonderingen. Een pluginmodule voor automatische rolwijziging bewijst niet dat die gebruikt wordt; bestaande projectafspraken over handmatige groepstoewijzing blijven leidend totdat de live regels zijn vastgesteld.

### C. Meerdere adressen en orderhistorie

**Aangetroffen**
- `WC_Multi_Address` met factuur-/afleveradressen, bijnamen, primaire adressen, selecteren en verwijderen.
- Account-adresboek en checkoutintegratie.
- Orderfilters op datum en status.

**Vereiste vervanging**
- Adresboek als echte gegevensstructuur, inclusief bestaande adreslimieten en standaardadresregels.
- Historische orderadressen onveranderlijk bewaren, los van latere adresboekwijzigingen.

Bronnen: `lib/multi-address/class-wc-multi-address.php`, `lib/my-address-book.php`, `lib/functions/extra-functions.php`.

### D. Retouren en creditnota's

**Aangetroffen**
- Eigen Returns-accountonderdeel.
- Retourartikelen toevoegen, aanpassen, verwijderen en indienen.
- Statussen, beslissingen, afwijzingen, bedragen en creditcontroles.
- Klant-/beheerdermails, kosten-/btw-berekeningen en maatwerk retourtabel.
- Beheerweergave met bulkacties.

**Vereiste vervanging**
- Volledige RMA-cyclus, inclusief gegevensmigratie, eigendomscontrole, bedragen, btw, documenten en communicatie.

**Controlepunt**
- De structuur toont ook anonieme AJAX-registraties voor meerdere RMA-acties. Dit is een aanleiding om autorisatie, order-eigendom en CSRF-bescherming gericht te controleren, geen bewezen kwetsbaarheid: eventuele controles in de volledige aanroepketen zijn nog niet vastgesteld.

Bronnen: `rma/rma-main.php`, `rma/rma-functions.php`, `rma/rma-ajax.php`, `rma/rma-db.php`, `rma/rma-backend.php`, `rma/new-rma-template.php`.

### E. Betaling, facturen, documenten en valuta

**Aanwezige componenten**
- Stripe-gateway en betalen-op-factuur.
- PDF-facturen/pakbonnen met uitbreidingen.
- F4 QR Invoices for WooCommerce.
- Shipment Tracking en Order Status Manager.
- Currency Switcher en een Auto Currency Switcher.
- SMTP, e-maillogging en product-/order-/klantimport-export.

Aanwezigheid bewijst geen actieve betaalmethode, valuta of bankafstemming. Die instellingen zijn nog niet ingezien.

**Belangrijk voor de eis zonder libraries**
- De QR-invoice-component declareert `sprain/swiss-qr-bill` en `genkgo/camt`.
- Mogelijke Swiss QR-bill- en CAMT-processen moeten op werkelijk gebruik worden gecontroleerd.
- Factuurnummers, btw, kredietbedragen, printerformaten, betaalreferenties en boekhoudkundige aansluiting mogen bij vervanging niet veranderen zonder expliciete afspraak.

Bronnen: pluginmappen, `wc-invoice-gateway/wc-invoice-gateway.php`, `f4-qr-invoices-for-woocommerce-pro/composer.json`.

### F. Picqer en overige koppelingen

**Aangetroffen**
- `picqer-shipment.php` met bronverwijzingen naar `Config`, `PicqerPayload`, `LabelRenderer`, `ResponseBuilder` en logging.
- `LabelRenderer::renderA6` en response-opbouw voor labels/configuratie.
- `composer.json` met `dompdf/dompdf`.
- Een los Shopify `auto_fulfill.php` met HTTP-/fulfillmentlogica.
- Child-theme productupdates en importacties die SKU-/prijsgegevens naar een tweede site doorzetten.

**Nog niet vastgesteld**
- Hoe de volledige voorraad-/ordersynchronisatie is geconfigureerd.
- Actieve Picqer-webhooks, warehouses, triggers, retries en eigenaarschap van voorraad/prijzen.
- Of elk aangetroffen script nog live wordt aangeroepen.
- Afhankelijkheden en actuele instellingen van het tweede verkoopkanaal.

**Vereiste vervanging**
- Eerst een contract per koppeling: bron, bestemming, trigger, velden, authenticatie, foutafhandeling en eigenaar.
- Daarna gecontroleerde migratie zonder dubbele orders, labelaanvragen of voorraadmutaties.
- API-geheimen alleen server-side; gevonden credential-achtige codeconstructies verdienen configuratiereview. Waarden zijn niet weergegeven of bewaard in de bevindingen.

### G. Schermeninkoop

**Aangetroffen**
- Afzonderlijke WordPress-installatie met Kadence-child, pagebuildercomponenten en TablePress.
- `tablepress-api-parent` synchroniseert tabellen na opslaan naar een Ferry Telecom-service.
- `tablepress-user-actions` past tabeluitvoer aan.
- `pdf-generate.php` accepteert een tabel-ID en gebruikt WordPress plus Dompdf voor PDF-export.

**Nog niet vastgesteld**
- Live tabelinhoud, actieve prijslijsten, afnamestappen, formulieren en afhandeling van inzendingen.
- Of onderdelen in opgeslagen pagebuilderinhoud of een externe service zitten.

De geautomatiseerde openbare pagina-opvraag lukte niet via de gebruikte methoden. Dit is geen bewijs dat de site voor klanten offline is.

Bronnen: aparte Kadence-child en de twee TablePress-maatwerkplugins.

## 5. Eerste prestatiewaarneming

Een enkele niet-ingelogde HTML-opvraag van de homepage gaf:
- HTTP 200.
- 730.224 bytes HTML, circa 713 KiB.
- 33 unieke externe scriptbronnen in de HTML.
- 19 unieke stylesheetverwijzingen in de HTML.
- Circa 1,32 seconde voor die specifieke server-side opvraag.

“Externe scriptbron” betekent hier een apart scriptbestand; niet noodzakelijk een andere website. Dit is geen totaalmeting van browserverzoeken, JavaScript-uitvoering, mobiel laden of Core Web Vitals. De tijd is slechts één observatie.

In de rechtstreeks bekeken script-/stylesheetlinks werden geen externe fontproviders gevonden. Dat sluit fontaanvragen vanuit CSS, JavaScript of andere pagina's niet uit.

Concrete onderzoekspunten: omvangrijke menumarkup, globale assets die niet op elke pagina nodig zijn, compacte API-antwoorden, lazy loading van niet-zichtbare content en passende afbeeldingsformaten. Geen snelheidswinst claimen voordat oud en nieuw onder dezelfde omstandigheden zijn gemeten.

De screenshotdienst kon in deze ronde geen beeld ophalen. Er wordt daarom geen succesvolle visuele of mobiele verificatie geclaimd.

## 6. Aanpassingen aan het projectplan

1. RMA, creditnota's en meerdere adressen zijn onderdeel van de kerninventaris, niet vrijblijvende uitbreidingen.
2. De Picqer-labelservice moet apart van de voorraadsynchronisatie worden gespecificeerd.
3. Tweede-site product-/prijsupdates, Shopify-fulfillment en schermeninkoop krijgen afzonderlijke integratiecontracten.
4. PDF-/QR-functionaliteit krijgt een vroeg technisch bewijs voordat de huidige libraries worden vervangen.
5. Broncode-aanwezigheid, actieve configuratie en werkende gebruikersflow worden als drie verschillende bewijsniveaus geregistreerd.
6. De bestaande React/Node/PostgreSQL-prototypeomgeving en de live WordPress-omgeving blijven intact tijdens onderzoek en voorbereiding.
7. De hosting rapporteert MariaDB 11.4.13, niet Oracle MySQL. MariaDB is MySQL-compatibel maar niet identiek. Voor een strikt MySQL-doel moet een afzonderlijke geschikte databaseomgeving worden gekozen; de bestaande databases worden niet omgezet.

## 7. Nog nodig voor een volledige functionele inventaris

- Opgeschoonde database-export of apart toegestane alleen-lezen database-inspectie: actieve plugins/thema, relevante opties, schema, aantallen en bedrijfsmappings.
- Veilige klant- en beheerdoorloop op een testkopie: meerdere prijsgroepen, checkout, adressen, facturen en retouren.
- Picqer-/verzend-/betaalconfiguratie en geanonimiseerde voorbeeldberichten/documenten.
- Actuele PHP-versie, native extensies, cron/worker-mogelijkheden en herstelprocedure. De huidige database-engine is vastgesteld, maar nog geen volledige tabelstructuur of actieve bedrijfsconfiguratie.
- Vaststelling welke aanwezige functies werkelijk gebruikt worden, zonder ze op basis van vermoedens te verwijderen.

Tot die controle is uitgevoerd, is de conclusie: de belangrijkste technische onderdelen zijn zichtbaar en het herbouwplan is aangescherpt, maar volledige functionele gelijkwaardigheid is nog niet bewezen.