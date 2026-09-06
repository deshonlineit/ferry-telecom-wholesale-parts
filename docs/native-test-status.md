# Native PHP testomgeving — voortgang en grenzen

## Omgeving

De nieuwe versie staat afzonderlijk onder `/test-shop/`. De oude prototypebroncode en live website zijn niet vervangen. De nieuwe applicatie gebruikt PHP 8.4, MySQL 8.4, HTML, eigen CSS en native JavaScript. Er zijn geen applicatieframeworks, Composer/npm-runtimepackages of externe fonts toegevoegd aan deze versie.

De native service is uitsluitend een ontwikkel-/testomgeving. De productie-build is bewust geblokkeerd; dit is geen publicatieklare webshop.

## B2B-tabel en direct bestellen — 6 september 2026

- Homepage, catalogus en gerelateerde producten gebruiken compacte producttabellen: foto, naam/SKU, bronkenmerken en compatibiliteit, voorraad, eigen klantprijs/valuta, aantal en direct toevoegen bij elkaar. Gasten zien aanmeldlinks; alleen actieve klanten krijgen bestelknoppen. Er is geen reviewbron geïmporteerd: de tabel vermeldt expliciet `Geen reviewgegevens`.
- De zichtbare blauwe MENU-knop opent het echte assortiment met onderdeelcategorieën, apparaatfamilies en alle chronologische modellen. Familie-/modellinks gebruiken compatibiliteit, nooit een afgeleid productmerkfilter.
- Header- en homepagezoekvelden tonen vanaf drie tekens lichte AJAX-productsuggesties met aantallen en direct toevoegen. Twee tekens versturen geen productzoekaanvraag. De zware volledige resultatenlijst verandert bij verzenden of filterkeuze, niet meer na iedere toetsaanslag.
- Toevoegen verhoogt bestaande aantallen, zonder onderbrekende modal of productdetailbezoek. Verzoeken worden in de browser na elkaar verwerkt; de server vergrendelt de klant en controleert het uiteindelijke aantal, minimum, voorraad en actuele prijs vóór de transactie wordt opgeslagen. De bestaande absolute winkelwagenbewerking blijft behouden.
- De productzoeker gebruikt een interactieve dialoog: ArrowDown verplaatst echte focus naar een productlink, Tab bereikt aantal/toevoegen, Enter bij het aantal voegt toe, Escape sluit en herstelt zoekfocus zonder opnieuw te openen.
- Technisch: 34 HTTP-asserties geslaagd, waaronder gelijktijdig/herhaald toevoegen, minimum/voorraad, gastprivacy, metadatavelden, bestaande SET-functionaliteit en rollback bij ongeldige valuta. Eén gemeten zoekaanvraag duurde 47,1 ms; de volledige API-regressie 2,338 seconden. Checksums bevestigen ongewijzigde oorspronkelijke voorraad en bestellingen; alle API-fixtures zijn opgeruimd.
- De gedeelde echte browserbestanden registreren nog steeds 27 routes; afzonderlijke regressies controleren de zoekgrens, late antwoorden, inactieve klanten, echte keyboardfocus, wachtrij, foutafhandeling en MENU-initialisatie/toggle.
- Ingelogde browsercontrole bevestigt direct toevoegen uit tabel/zoeker, oplopende aantallen en badge, geen modal, en toetsenbordbestelling. De mobiele producttabel heeft geen horizontale pagina-overloop: 375 px inhoud bij 375 px beschikbare breedte, bereikbare bestelknoppen en een eerste product op circa 460 px hoogte. De gewone gasttabel is vastgelegd in `screenshots/native-b2b-table-home.jpg`.
- De definitieve MENU-controle bevestigt de volledige iPhone-reeks: iPhone 17 Pro Max geeft 11 passende onderdelen; iPhone 5 geeft 22 passende onderdelen. Terug, opnieuw openen, Escape, buiten klikken en focusherstel werken ook mobiel. Niet-actieve panelen zijn inert en verborgen voor hulptechnologie.
- Na een gerichte kleine-schermcorrectie past ook de ingelogde productzoeker op 320 px: documentbreedte 305/305 px, popup 265 px breed, volledig zichtbare knop van 118 px zonder tekstafsnijding. Visueel verborgen aantallabels blijven beschikbaar voor hulptechnologie; de knop overlapt geen product- of prijsinformatie.
- De afsluitende controle via dezelfde native databaseverbinding bevestigt volledige opruiming van de eigen testklant, winkelwagen, testproduct, groepsprijs en modelkoppeling. Totalen zijn hersteld naar 7.858 producten, 23.561 groepsprijzen en de oorspronkelijke acht bestellingen. Reeds bestaande oudere test-/importrecords zijn bewust behouden.
- Geen live hosting, echte orders, betalingen, mail of bestaande voorraad gewijzigd. Dit blijft uitsluitend `/test-shop/`.

## EUR-prijsbeheer en landafhankelijke valuta — 6 september 2026

- Actuele beheerroute: `/test-shop/admin/prices`. Inkoop, basisverkoopprijs en expliciete klantgroepsprijzen worden in EUR beheerd. Onbekende inkoopkosten blijven leeg; groepsprijzen kunnen expliciet worden gewist om de basisprijs te erven.
- De prijstabel ondersteunt meerdere wijzigingen tegelijk, Excel-plakken met decimale komma's, geselecteerde-rijbewerkingen en een voorbeeld vóór prijsaanpassing van alle gefilterde producten. Opslaan is atomair en controleert prijsversies. CSV-import vraagt een preview en weigert verouderde bevestigingen.
- Afleverland CH gebruikt CHF; andere landen EUR. De landkeuze is beschikbaar in de winkel, het adresboek en checkout. Checkout berekent opnieuw op basis van het echte afleveradres en vereist een nieuwe bevestiging wanneer een prijs, aantal, land of koers verandert.
- De eigenaar koos automatische ECB-referentiekoersen. Bij ingebruikname is de officiële koers van 4 september 2026 opgehaald: 1 EUR = 0,9405 CHF. Een afzonderlijk proces controleert ieder uur de officiële bron; de webserver kan nog steeds niet naar buiten verbinden. Weekenden gebruiken de laatst gepubliceerde koers. Een koers ouder dan zeven dagen wordt niet gebruikt voor nieuwe conversies.
- 7.858 opgeslagen testproductprijzen en 23.561 groepsprijzen zijn eenmalig naar afzonderlijke EUR-velden omgerekend. Controles vóór/na bevestigen dat alle oorspronkelijke CHF-bronbedragen en de bedragen/valuta van de acht bestaande bestellingen gelijk zijn gebleven. Er zijn geen inkoopkosten verzonnen.
- Facturen en creditnota's gebruiken de opgeslagen bestelvaluta; financiële totalen blijven gescheiden per valuta. Geen omrekening van historische documenten en geen wijziging van belastingpercentages.
- Technische controles: 19 ECB-parsercontroles; EUR/CHF-, afrondings-, klantgroep-, privacy-, quote- en verouderde-koerscontroles; 22 HTTP-integratiecontroles in 2,49 seconden; gezamenlijke uitvoering van browserbestanden en registratie van 27 routes. De HTTP-fixtures zijn volledig opgeruimd. De gewone winkel is visueel gecontroleerd in `screenshots/native-currency-storefront.jpg`.
- Ingelogde browsercontrole bevestigt meerdere prijswijzigingen met één save, productbewerking en +10% over alle gefilterde producten, inclusief 12,75 → 14,03 EUR. De definitieve controles bevestigen dat getypte `5,25` na opslaan/herladen 525 cent blijft, en dat Excel-plakken lege kosten ongemoeid laat, groepsprijzen met `-` wist en onbekende SKU's zichtbaar meldt.
- De klantcontrole bevestigt 13,50 EUR voor Nederland tegenover 12,70 CHF voor Zwitserland, adresgestuurde checkout en een synthetische EUR-bestelling met een geldige PDF. Een vertraagde offerteaanvraag bevestigt dat de bestelknop direct uitgeschakeld wordt en de oude token wordt gewist; na afhandeling stemmen header, sessie en offerte overeen. Op 390 px heeft ook de gevulde mobiele bestelgeschiedenis geen horizontale pagina-overloop (375 px inhoud / 375 px beschikbare breedte); de tabel zelf kan intern scrollen.
- Alle browserfixtures zijn verwijderd. De afsluitende databasecontrole telt opnieuw 7.858 producten, 23.561 groepsprijzen en uitsluitend de acht oorspronkelijke CHF-bestellingen; de totale legacy CHF-product- en groepsbedragen zijn onveranderd. Geldinvoer en het wachten op offertes hebben bovendien regressietests die de echte gedeelde scripts respectievelijk vertraagde antwoorden gebruiken.
- Geen live hosting, echte bestellingen, betalingen, mail of externe voorraad aangepast. Dit blijft een geïsoleerde testomgeving.

## Directe toegang tot de testwinkel — 6 september 2026

- De gewone ontwikkelstartpagina verwijst nu met een niet-gecachete tijdelijke redirect naar `/test-shop/`. Ook HEAD-verzoeken en meegegeven categorie-/familiefilters blijven correct.
- De React-prototypehomepage blijft bewust beschikbaar via `/?prototype=1`; de bestaande overige prototypepaden zijn niet gewijzigd. Deze wijziging geldt alleen voor de ontwikkelserver, niet voor de live hosting.
- De exacte externe testwinkel-URL is in verse Chromium- en echte WebKit-contexten gecontroleerd: HTTP 200, zichtbare categorieën en acht productkaarten met afbeeldingen, zonder paginafouten of mislukte verzoeken. De gemelde witte pagina is in die controles niet gereproduceerd; er is geen browserblokkade vastgesteld.
- `native/bin/qa-preview-entry.cjs` controleert de startredirect, filterbehoud, prototypebereikbaarheid, native HTML en productrespons. Alle controles slagen. `screenshots/direct-shop-entry.jpg` toont de winkel na openen van de hoofdroute.
- Een concrete syntaxisfout uit een samengevoegde API-route is minimaal hersteld en een achtergebleven oud API-proces is gestopt. De beheerde API bouwt en start weer; de afzonderlijke API-typecheck meldt nog 47 fouten in andere samengevoegde schema-/routeonderdelen. Dat oudere prototype is hiermee niet volledig gevalideerd.
- Geen live bestanden, hostinginstellingen, prijzen, valuta, bestellingen of voorraad gewijzigd.

## Compacte weergave zonder jaarblokken — 6 september 2026

De eigenaar heeft de te grote koppen, ronde categorieblokken, hoge familiekaarten en jaargroepen afgewezen. De actuele weergave vervangt daarom de ruim opgezette presentatie hieronder:

- Startpagina en catalogus tonen één vlakke modellenlijst, zonder jaarkoppen of jaarsecties. Sortering van nieuw naar oud blijft intern behouden; jaartallen die onderdeel zijn van een officiële modelnaam blijven staan.
- Op 1024×900 pixels zijn alle 46 iPhone-modellen voor LCD tegelijk zichtbaar, in zes kolommen met acht rijen, vóór de productresultaten. De modelknoppen zijn op desktop circa 34 pixels hoog in plaats van grote kaarten.
- De kop is nu eenvoudig “Onderdelen”, naast één zoekveld. Categorieën en toestelfamilies zijn compacte tekstknoppen; aantallen staan als kleine badges met een toegankelijk onderdeel-label.
- Modelnamen blijven volledig leesbaar. De familie-overzichten zijn niet afgekapt, verborgen achter een menu of in een interne scrolbox geplaatst.
- Op mobiel passen de keuzes in twee kolommen met grotere aanraakvlakken. De smalle categorieband kan horizontaal worden verschoven; de pagina zelf blijft binnen het scherm.
- Productkaarten en overige koppen zijn compacter; de originele foto's, beschikbaarheid en gastprijsafscherming blijven behouden.

De homepage- en cataloguscontroles slagen, inclusief live zoeken, modelklik, filterbehoud, keyboardbediening en bescherming tegen verouderde antwoorden. De gezamenlijke uitvoering van alle 26 routes en 17 snelle-modelzoekscenario's slagen eveneens. Nieuwe regressies bewaken een vlakke lijst zonder jaarsecties én de ongewijzigde chronologische modelvolgorde.

Visueel gecontroleerd in `screenshots/compact-models-desktop.jpg`, `screenshots/compact-models-mobile.jpg` en `screenshots/compact-storefront.jpg`. Geen backend-, prijs-, valuta-, voorraad- of bestelwijzigingen in deze correctie; de volledige kooproute is hiervoor niet opnieuw uitgevoerd.

## Volledige toestelfamilies, echte catalogfoto's en winkelontwerp — eerdere versie, 6 september 2026

Deze uitwerking vervangt de eerdere beperkte modelselectie bij bladeren. De limiet van zes geldt alleen nog voor live zoeksuggesties, niet voor een gekozen toestelfamilie.

- Op de startpagina en in de catalogus werkt **LCD & schermen → iPhone / iPad / Samsung Galaxy / overige aanwezige families → alle bijbehorende modellen**.
- Er zijn 291 positief gekoppelde modellen: 47 iPhone, 39 iPad, 160 Samsung, 22 Pixel, 16 Apple Watch en 7 MacBook. Aantallen worden aangepast aan de gekozen onderdelencategorie en overige filters.
- De volledige lijst is op expliciete releasejaarmetadata gesorteerd, over alle toestelreeksen heen. Er zijn 290 bekende jaartoewijzingen; de meerjarige MacBook-alias A1534 blijft onder “Jaar onbekend”. Er worden geen releasemaanden verzonnen.
- Alle jaargroepen blijven open, inclusief oudere modellen en modellen met maar één onderdeel. Er is geen interne scrolbox, inklapmenu of paginering voor deze lijst.
- De bestaande live modelzoeker blijft behouden. Een expliciete familiekeuze blijft ook met resterende onderdeelzoekwoorden alle positief getelde modellen tonen. Familie wisselen verwijdert een verouderde modelkeuze; een nieuwe modelzoekopdracht verwijdert een verouderde familie.
- Categorie, overige filters en browsergeschiedenis blijven behouden. Een toestelfamilie wordt via compatibiliteitskoppelingen gefilterd en legt nooit stilzwijgend een productmerk op.
- Na een expliciete modelkeuze wordt het bijgewerkte productresultaat gefocust en in beeld gebracht.

### Werkelijke foto's

De oude import beperkte de fotolijst tot uitgelichte producten. De volledige export is nu op exact bestaande SKU's gekoppeld; bronproduct-ID's zijn niet als native product-ID gebruikt. Er is niet opnieuw geseed.

- Van **44 naar 7.778 producten met foto**: 7.734 toegevoegd, afkomstig van 6.342 unieke toegestane bron-URL's.
- Nul download-/importfouten; nul ontbrekende beeldvarianten of geschoonde originelen. Alle 7.778 hebben lokale WebP-varianten van 320, 640 en 1280 pixels.
- De vijf genoemde voorbeelden zijn afzonderlijk gecontroleerd: `IPH15PL06`, `IPH15PL46`, `IPH15PL42`, `IPH15PRM06`, `IPH15PRM43`.
- Voor 73 echte bronartikelen ontbreekt een foto. Alle bijbehorende bronpagina's zijn gecontroleerd: 68 tonen alleen een generieke “Awaiting product image”-afbeelding; 5 verwijzen naar de homepage zonder verifieerbaar product. Geen van deze afbeeldingen is als echte productfoto overgenomen.
- Daarnaast hebben 7 lokale QA-artikelen geen bijbehorende exportregel, waarvan 5 actief en 2 inactief. Deze bestaande testgegevens zijn niet verwijderd of aangepast.
- Dekking: 98,98% van alle 7.858 native records; 99,07% van de 7.851 actieve, export-gekoppelde artikelen.
- SHA-256-vergelijkingen bevestigen dat alle beschermde productvelden behalve `image_url` en alle groepsprijzen identiek zijn gebleven; ook voorraadtellingen zijn ongewijzigd.

De download- en importstappen zijn hervatbaar. De downloader valideert iedere manifest-URL opnieuw, gebruikt uitsluitend HTTPS naar de toegestane eigen uploadpaden en volgt geen redirects. Bestandsinhoud, bestandsgrootte en pixels blijven gevalideerd; echte AVIF-bronbeelden worden alleen in de CLI-voorbewerking geconverteerd, niet door de webuploadbeveiliging te versoepelen.

Rapporten staan onder `artifacts/parts-store/native/storage/`: `catalog-photo-final-report.json`, `catalog-photo-download-report.json`, `catalog-photo-missing-source-report.json` en `catalog-photo-import-manifest.json`. Het volledige aanvullende bronpaginaonderzoek staat in `.local/research/catalog-photo-remaining-source-audit-20260906.json`.

### Ontwerp en controles

Het klantgedeelte heeft een nieuwe visuele hiërarchie, grote echte productfoto's, duidelijke categorie- en familiekeuzes, open jaargroepen en samenhangende product-, formulier-, winkelmand- en checkoutoppervlakken. Het zoeken blijft rechtstreeks werken. Medewerkersschermen worden expliciet van de winkelstijlen uitgesloten; financiële en bestelregels zijn niet gewijzigd. Een aanvankelijke mobiele overflow, te kleine foto's en conflicterende oude CSS-regels zijn tijdens de visuele controle hersteld.

Geslaagd: gedeelde uitvoering van de 26 native routes, homepage- en categoriezoektests, 17 snelle-modelzoektests, 15 filter-URL-tests, zoek- en route-racecontroles, expliciete chronologieregressies, PHP/JavaScript-syntaxis en diffcontrole. Daarnaast slagen 15 bron-URL-beveiligingsgevallen en de validatie van alle 7.778 bestaande manifestbronnen.

De grote native mediaverzameling is uitgesloten van de bestandsbewaking van het aparte prototype, nadat die de gedeelde watcherlimiet raakte. Dit is uitsluitend een ontwikkelconfiguratiegrens; React-applicatiegedrag, PostgreSQL en productie-instellingen zijn niet gewijzigd. De native service en de aparte webpreview zijn schoon gestart.

De laatste browserronde bevestigde onder meer:

- LCD → iPhone toont 46 bijbehorende modellen, met jaargroepen 2025–2012 zonder interne scrolbox. iPhone 15 Plus kiezen geeft de 11 bijbehorende onderdelen; teruggaan herstelt dezelfde filters.
- Wisselen naar iPad/Samsung behoudt LCD en verwijdert de oude modelkeuze. `13 Pro` en `S23` geven tijdens typen de juiste modelkeuzes zonder verouderde familie of Apple Watch-suggestie. Wegnavigeren tijdens zoeken wordt niet ongedaan gemaakt door een laat antwoord.
- Gasten zien geen prijzen. Een echte lokale foto werd circa 325×325 pixels weergegeven; vergroten en sluiten werkten.
- Met de geïsoleerde klant zijn één voorradig artikel op minimumaantal, winkelmandtotalen, checkoutvelden en accountschermen gecontroleerd. Er is geen bestelling geplaatst. De winkelmand is daarna exact naar de eerdere lege staat teruggebracht.
- Op 390 en 320 pixels werkten familiekeuze, modelkeuze en de ingelogde productlijst zonder horizontale pagina-overflow. De eerste geselecteerde productkaart stond respectievelijk rond Y=499 en Y=428.
- De browserronde vond nog overflow in een lange mobiele producttitel en onduidelijke catalogusopmaak. Deze zijn met begrensde grids, passende mobiele typografie, afzonderlijke modelaantallen en volwaardige familiekaarten hersteld. Ook de mobiele gastheader overlapt niet meer. De gerichte schermafbeeldingen na die CSS-correcties bevestigen de passende productpagina op 320 pixels en de catalogus op 390 pixels; de hele browserronde is niet opnieuw uitgevoerd.
- Een hoverkleur die op een gekozen familie leek is gescheiden van de echte geselecteerde toestand. Er waren geen applicatiefouten of mislukte native API-aanvragen tijdens de browserronde.

Actuele visuele controles: `screenshots/storefront-final-desktop.jpg`, `screenshots/storefront-final-mobile.jpg`, `screenshots/storefront-product-mobile-fixed.jpg` en `screenshots/storefront-catalog-mobile-fixed.jpg`.

De bestaande brede producttekstzoeker is niet herschreven: vóór een expliciete modelkeuze kan een losse term nog ruimere productmatches opleveren. De modelzoeker en expliciete model-/familiefilters zijn wel afzonderlijk gecontroleerd.

## Rustigere winkel en korte modelselectie — eerdere versie, 6 september 2026

De winkelweergave heeft een neutralere achtergrond, heldere systeemtypografie, rustigere knoppen en vernieuwde product-/catalogusoppervlakken. De nieuwe algemene winkelstijlen sluiten de medewerkersomgeving expliciet uit. Er zijn geen externe fonts of andere runtime-afhankelijkheden toegevoegd.

- Startpagina en categoriezoeker tonen maximaal zes modellen tegelijk. Verder typen verfijnt de selectie; ook modellen met één gekoppeld onderdeel blijven vindbaar.
- Zoekvormen zoals `13 Pro`, `S23` en `iPhone13ProMax` worden ondersteund. Exacte uitvoeringen staan vóór varianten; woorden en cijfergroepen blijven gescheiden zodat `S23` niet als `Series 2 - 38mm` wordt gelezen.
- Het modelpaneel blijft open. Op de startpagina blijft één live zoekveld; de knop “Ander model” brengt de focus terug naar datzelfde veld.
- Modelkeuze behoudt onderdeel-/zoekfilters en legt geen productmerk op. Ambigue Enter-invoer in de categoriezoeker focust de keuzelijst in plaats van stilzwijgend een uitvoering te selecteren.
- Geen wijzigingen aan backendregels, prijzen, valuta, voorraad of live diensten. De bestaande productzoekopdracht en productvolgorde zijn behouden.

Gerichte codecontroles voor de homepage, categoriezoeker, 17 modelzoekscenario's, filter-URL's en gedeelde uitvoering van de 26 native routes zijn geslaagd. PHP-syntaxis en diffcontrole zijn eveneens geslaagd.

Browsercontrole op desktop en mobiel is geslaagd, zowel als gast als met de geïsoleerde testklant. `13 Pro` gaf twee modelkeuzes in de juiste volgorde; model kiezen, product openen/teruggaan, LCD verfijnen en de open categoriezoeker behielden hun context. `S23` plus het gekozen Galaxy S23-model gaf 20 onderdelen met zichtbare klantprijzen. Er zijn geen winkelwagen-, voorraad-, bestel- of betaalacties uitgevoerd.

Bij 390×844 px begon de eerste productrij op Y=787,48 px; de modelknoppen maten 144,5×76,5 px. Bij zowel 390 als 320 px was er geen horizontale pagina-overflow en bleven modelnamen leesbaar. Bij 320 px begon de eerste rij pas op Y=863,48 px, dus daar blijft een kleine verticale scroll nodig. Geen applicatiefouten aangetroffen. De eerste poging tot de extra klantcontrole gebruikte in de testinstructie het verkeerde globale object; met de bestaande correcte loginfunctie slaagde de controle zonder een authenticatiewijziging.

De brede producttekstzoeker is bewust niet herzien: zonder modelkeuze kan `S23` nog een ruimer productresultaat bevatten. De vernieuwde modelkeuze zelf bevat deze onjuiste toestelmatch niet; expliciete Galaxy S23-selectie beperkt de resultaten tot de bestaande koppelingen van dat model.

## Startpagina: direct zoeken zonder formulierstappen — 6 september 2026

De startpagina heeft één zoekveld. Tijdens het typen verschijnen de werkelijke producten direct op dezelfde pagina; er hoeft geen zoekknop te worden ingedrukt. Er is geen verplichte merkkeuze, reeks keuzelijsten of apart zoekvenster meer.

- Alternatief zonder typen: **LCD & schermen → iPhone 13**. Beide knoppen werken meteen; de modellen blijven open en kunnen zonder heropenen worden gewijzigd.
- Het model en de categorie verfijnen de bestaande zoekterm. Een nieuw getypte zoekopdracht verwijdert het vorige toestel-/merkfilter zodat bijvoorbeeld een nieuwe telefoon niet op het oude toestel vastloopt; de gekozen onderdelencategorie blijft behouden.
- Alleen bestaande, positief getelde modelkoppelingen worden aangeboden, ook wanneer er maar één product beschikbaar is. Het gekozen model staat vooraan en lange modelnamen blijven volledig leesbaar.
- De URL bewaart de zoekterm en selectie. Product openen en teruggaan, vernieuwen, selectie wissen en expliciet opnieuw proberen na een fout zijn ondersteund.
- Verouderde antwoorden kunnen nieuwere resultaten niet overschrijven. Tijdens bijwerken kunnen oude productrijen niet per ongeluk worden aangeklikt.
- “Alles” bevat het volledige actieve assortiment, niet ongemerkt alleen uitgelichte artikelen. De bestaande productvolgorde blijft gehandhaafd.

Nieuwe gerichte controles dekken automatisch zoeken, actuele antwoorden, querybehoud, reset, fout/retry, routeverlaten, rendering en één-productmodellen. Bestaande controles voor de gedeelde scripts/26 routes, algemene zoeksuggesties, categorie/modelnavigatie en navigatieraces slagen eveneens. Alleen de geïsoleerde PHP-testinterface is aangepast; geen live acties of wijzigingen aan voorraad, prijzen of productkoppelingen.

Gastcontrole vanaf de echte homepage geslaagd op desktop en mobiel: resultaten verschenen door alleen te typen, LCD → iPhone 13 vroeg precies twee klikken, een ander model één klik, en er hoefde niets geopend, bevestigd of gesloten te worden. Ook een product openen/teruggaan en een lege zoekopdracht herstellen zijn gecontroleerd. Mobiel bleef de eerste productrij binnen het scherm en was er geen horizontale pagina-overflow. Geen browserfouten aangetroffen.

## Onderdeel kiezen → direct modellen filteren — 6 september 2026

Op categoriepagina's en bij zoekresultaten staat nu een open modelkeuze vóór de producten. Na bijvoorbeeld **Displays & touchscreens / LCD & schermen** kan de klant meteen een model aanklikken, via merk beperken of de modelnaam typen. Een extra filtervenster is niet nodig.

- De modellen en aantallen komen uit dezelfde context als de productlijst: categorie, eventuele onderdeelsoort, zoekterm, voorraad en kwaliteit.
- Een modelkeuze behoudt onder meer `q=iphone lcd`, categorie en sortering, en begint op de eerste pagina. Er wordt niet ongemerkt naar alle onderdelen overgeschakeld.
- Er wordt geen productmerk uit de toestelnaam afgeleid. Alleen een expliciete merkkeuze stelt het merkfilter in; die keuze verwijdert een eerder model.
- Na selectie klapt het modelpaneel in zodat de producten naar boven komen. De samenvatting opent het opnieuw om van model te wisselen.
- Modellen met één gekoppeld product blijven beschikbaar. Bij nul passende koppelingen wordt dat uitgelegd; er worden geen modellen of compatibiliteiten verzonnen.
- Alle modelnamen blijven doorzoekbaar. De compacte lijst kan intern scrollen; merkkeuze en modelzoekveld blijven ook op mobiel rechtstreeks beschikbaar.

Controle: de nieuwe JavaScript-tests bevestigen URL-behoud, echte route-integratie vóór de producten, zoeken, toetsenbordbediening, lege resultaten en escaping. Tien alleen-lezen API-controles vergelijken modelaantallen met de werkelijke schermproducten, ook met merk/voorraad en met de zoekterm “iPhone LCD”. Daarnaast slagen 30 bestaande navigatie-/modelzoekchecks en de gezamenlijke controle van 26 routes. Er zijn geen catalogusindelingen, modelkoppelingen, voorraad of klantgegevens gewijzigd.

Een afzonderlijke gastcontrole in de browser bevestigde de volledige route van de homepagecategorie naar Apple → iPhone 13 → iPhone 13 Mini, behoud na vernieuwen, zoeken op “iPhone LCD” met zes passende schermproducten, en herstel via de terugknop. Op 390×844 blijft de modelkeuze direct zichtbaar en bruikbaar zonder popup of horizontale pagina-overflow. Geen browserfouten aangetroffen.

## Afzonderlijke beheeromgeving — 6 september 2026

Het beheer onder `/test-shop/admin` gebruikt een eigen, afgeschermde indeling met een gedeeld menu voor dashboard, producten, bestellingen, facturen, klanten, retouren en bestaande beheerfuncties. De winkelzoekbalk, winkelmand en klantenfooter horen niet bij dit beheerscherm. Staff wordt vanuit het accountscherm naar het dashboard geleid; “Bekijk winkel” schakelt bewust terug naar de winkelweergave. De testadministratie blijft herkenbaar.

- **Alle producten:** actief, gearchiveerd of alles; zoeken, filters, sortering en paginering. Archiveren bewaart de historie; een expliciete herstelactie maakt een product weer actief.
- **Snel wijzigen:** voorraad, basisverkoopprijs en uitgelicht vanuit de lijst. Volledige bewerking behoudt modellen, afbeeldingen en groepsprijzen. Prijzen worden in CHF ingevoerd; de API blijft gehele centen gebruiken. Snel wijzigen raakt groepsprijzen niet.
- **Facturen & betalingen:** zoeken op bestelling/klant, filteren op betaalstatus, sorteren, PDF openen en lokaal ontvangen bedragen, vervaldatum en controlemelding vastleggen.
- **Statussen:** te controleren, openstaand, deels betaald, achterstallig, betaald en geannuleerd. Kleuren worden altijd vergezeld van tekst. “Alle onbetaalde” omvat bevestigde openstaande, deels betaalde en achterstallige facturen.
- **Betrouwbare bedragen:** historische facturen zonder betaalregistratie blijven te controleren. Ze tellen niet mee als bevestigde openstaande schuld. Er worden geen betalingstermijnen verondersteld. Bestaande credits verlagen het verschuldigde bedrag; annulering verwijdert geen eerder geregistreerde ontvangst.
- **Beheersbare wijzigingen:** expliciet opslaan, verplichte toelichting, auditlog en versiecontrole bij financiële wijzigingen. Een verouderde versie geeft een conflict, geen stille overschrijving.
- Het dashboard toont werkelijke lokale aantallen en links naar onbetaalde, achterstallige en nog te controleren facturen.

De financiële registratie is handmatige **lokale testadministratie**: geen bankkoppeling, incasso, betalingsuitvoering, terugbetaling of automatische herinnering. Er is geen publieke beheer-demo toegevoegd. De nieuwe tabel wordt uitsluitend via een idempotente, additieve lokale migratie aangemaakt.

### Technische controle

53 HTTP-integratiecontroles zijn geslaagd, waaronder gast-/klantafscherming, CSRF, productherstel, versieconflicten, ongeldige datums/bedragen, onbekende/deels betaalde/achterstallige/betaalde facturen, credits en annulering. Daarnaast slagen de gezamenlijke klassieke-scriptcontrole met 26 routes, financiële invoer-/escaping-/pagineringchecks, route-race- en beheermoduschecks en de bestaande foto-/koopbaarheidschecks.

De ingelogde browsercontrole op desktop en 390×844 mobiel bevestigde opslaan/herladen van voorraad en CHF-prijzen, behoud van groepsprijzen bij snel wijzigen, gerichte groepsprijsbewerking, archiveren/herstellen en de factuurreeks te controleren → achterstallig → deels betaald → betaald. De normale staff-login landt rechtstreeks op `/admin`; het bijgewerkte echte formulier heeft daarnaast een regressietest voor staff, klant en foutmeldingen. De product-API bevestigde onafhankelijk de opgeslagen groepsprijzen. Geen horizontale pagina-overflow; de factuurdialog blijft binnen het mobiele scherm, scrollt intern en herstelt na Escape de focus. De winkelweergave blijft afzonderlijk. Er zijn geen applicatiefouten aangetroffen.

Het dashboard gebruikt de volledige lage-voorraadtelling, niet de lengte van de lijst met maximaal twintig voorbeelden, en benoemt het totale bestelaantal als totaal. Een renderregressietest controleert deze betekenissen en het onderscheid tussen geannuleerde bestellingen en gearchiveerde producten. De tijdelijke browseraccounts zijn na afloop geblokkeerd; uitsluitend hun eigen testontvangst is teruggenomen, hun synthetische bestelling afgesloten en hun product gearchiveerd. De auditgeschiedenis blijft behouden.

## Actuele onderdelenzoeker — 6 september 2026

De nieuwste catalogus heeft een direct modelzoekveld, compacte categorie- en onderdeeltypekeuzes, directe merk-/kwaliteits-/voorraadfilters en een aanvullend filtervenster. De oude grote zijbalk is verwijderd. “Wat zoekt u?” blijft op de startpagina staan.

- Behuizingen worden uitsluitend op basis van de bestaande titels opgesplitst: **80 frame/chassis, 460 achterglas, 10 achter-/batterijcovers, 92 behuizingen met voorgemonteerde onderdelen, 0 expliciet complete behuizingen en 2 overige/ongespecificeerde producten**. Dit zijn aantallen in de huidige lokale testimport, geen live voorraadstanden.
- “Met voorgemonteerde onderdelen” is nadrukkelijk geen garantie dat een behuizing compleet is. De indeling verandert geen productrecords, prijzen, voorraad of modelcompatibiliteit.
- Het server-side `part`-filter blijft behouden bij modelkeuze, sortering en paginering. Een andere categorie wist het vorige onderdeeltype.
- Samengestelde zoektermen zoals `back cover glass`, `back glass`, `rear glass`, `achter glas` en `achterglas` gebruiken dezelfde precieze subtypefiltering. Extra modelwoorden beperken de resultaten nog steeds.
- Modelkeuze werkt direct met typen, pijltjestoetsen en Enter. Het modeloverzicht sorteert op aantal onderdelen of natuurlijke A–Z-volgorde.
- Een echte productfoto opent vanuit de lijst direct in een native dialoog, zonder navigatie naar de detailpagina. Producttitels blijven gewone detaillinks. Ontbrekende foto's blijven eerlijk gemarkeerd.

### Gecontroleerd

- **Ingelogde browsercontrole, desktop 1440 × 1000:** subtypekeuze, exacte modelkeuze vóór varianten, sorteren op naam/prijs met behoud van filters, een eerlijke nulresultaatcombinatie, categorie wisselen, A–Z-modelvolgorde, fotovergroting en gewone detailnavigatie.
- Het eerste product op de desktop-behuizingenpagina begint rond **y=425 px**. De directe modelkeuze vereist geen voorafgaand openen van een dialoog.
- Een beschikbare lijstfoto ging van circa **50 × 50 px naar 346 × 420 px**, zonder URL-wijziging. Enter opent, Escape sluit en de focus keert terug naar de fotoknop. De detailfoto gebruikt hetzelfde venster.
- **Mobiel 390 × 844:** geen horizontale pagina-overloop; leesbare kop; bewust horizontaal schuifbare categorie-/typerijen; onderdeeltype wijzigen via Alle filters; juiste resultaten na toepassen; fotovergroting volledig binnen het scherm.
- Geen browser-JavaScriptfouten. Er zijn tijdens deze controle geen winkelwagenwijzigingen, bestellingen, beheeringrepen of externe acties uitgevoerd.
- 15 navigatiechecks, 15 modelzoekerchecks, klassieke-scriptcontrole met 25 routes, zoek-/route-racechecks, 7 koopbaarheidsgevallen voor kaarten én details, foto-/escapingchecks, PHP-lint, PHP/SQL-classificatiepariteit en read-only HTTP-subtypechecks geslaagd.
- De laatste HTTP-meting over de ontwikkelproxy gaf circa **165 ms voor catalogusfacetten, 112 ms voor de glaszoekopdracht en 126 ms voor frames**. Dit zijn losse lokale testverzoeken, geen algemene snelheids- of productiegarantie.
- Browsercontrole signaleerde krappe titels op de startpagina. De kaartindeling is daarna beperkt aangepast: volledige titels, meegroeiende inhoud, aparte voorraadregel en meer ruimte voor prijs/hoeveelheid. Deze CSS-correctie is visueel gecontroleerd; de zoek- en kooplogica is daarbij niet gewijzigd.

De screenshots met `precision-` in `screenshots/` horen bij deze zoekerversie; eerdere `workbench-`-beelden tonen de vorige vormgeving. De ingelogde browsercontrole bevat daarnaast bewijs van de huidige desktop-/mobiele catalogus en fotovergroting.

## Testgegevens en veiligheidsgrenzen

- Productnamen, beschrijvingen en voorraadgetallen komen uit de reeds aanwezige offline productexport; ze worden niet live opgehaald of bijgewerkt.
- Klanten zijn fictieve testaccounts. Groepsprijzen zijn synthetische testprijzen, niet gekopieerde vertrouwelijke klanttarieven.
- Een beperkte selectie openbare productafbeeldingen is éénmalig gedownload en lokaal verwerkt. De webapp haalt geen externe afbeeldingen of productgegevens op.
- MySQL luistert alleen op een lokale Unix-socket; de applicatie kan geen andere databasehost instellen.
- De PHP-webserver erft geen hosting-, voorraad-, betaal- of mailgeheimen. Uitgaande netwerk-/mail-/procesfuncties en URL-filewrappers zijn geblokkeerd.
- Orders, betalingen, retouren, creditnota's, verzendingen en inkoopaanvragen zijn uitsluitend testadministratie.
- Berichten en integratiegebeurtenissen worden in een lokale opvangtabel vastgelegd. Er bestaat geen uitgaande verzender.
- Beheer is niet via een publieke demo-rol beschikbaar. Het beheeraccount vereist een eigen wachtwoord; synthetische QA-beheerders worden na tests geblokkeerd.

## Geïmplementeerde onderdelen

| Gebied | Aanwezig in deze testversie |
| --- | --- |
| Catalogus | Offline import, categorieën, merken, modellen, zoeken, filters, sortering en paginering |
| Klantprijzen | Server-side toegewezen groepsprijzen; gastprijzen verborgen |
| Account | Inloggen, registratie met goedkeuring, profiel, resetstroom via lokale testmailbox |
| Adressen | Meerdere adressen, bewerken, verwijderen, standaardadres en checkoutselectie |
| Bestellen | Winkelwagen, minimumaantallen, actuele testvoorraadcontrole, atomische checkout, idempotentie en ordersnapshots |
| Orderbeheer | Statussen, tracking, annulering met eenmalig herstel van lokale testvoorraad |
| Retouren | Eigen geleverde orderartikelen, hoeveelheidscontrole, beoordeling, credit en historie |
| Documenten | Werkelijke PDF-factuur, pakbon en creditnota met testmarkering, zonder PDF-library |
| Afbeeldingen | JPEG/PNG/WebP-validatie, private bron, automatische WebP-varianten en galerijbeheer |
| Productbeheer | Aanmaken/bewerken/archiveren, expliciete groepsprijzen, modelkoppelingen en CSV-preview/import |
| Klantbeheer | Goedkeuren/blokkeren en groepstoewijzing |
| Schermeninkoop | Testprijslijst, aanvragen, bedragen bij indiening vastleggen en statusbeheer |
| Controle | Dashboard, lage testvoorraad, instellingen, auditlog, lokale berichten en expliciete simulaties |

De eerste bronimport omvat 7.851 producten. Er zijn 44 catalogusafbeeldingen lokaal verwerkt. De conservatieve compatibiliteitsimport levert 4.446 koppelingen voor 3.851 bronproducten en 291 verschillende modelrecords; 426 producten hebben meer dan één model. Veel producten hebben nog geen betrouwbare modelinformatie. Zie `artifacts/parts-store/native/data/compatibility-notes.md`.

Testretourbeleid: alleen verzonden/afgeronde orders; beschadigde artikelen komen niet automatisch terug op voorraad. Een volledige goederenretour crediteert de goederen en de toegewezen goederen-btw, niet de verzendkosten of verzend-btw. Dit is een testregel, geen vaststelling van het huidige bedrijfsbeleid.

## Nog geen volledige gelijkwaardigheid met de live omgeving

De aanwezigheid van schermen en lokale testflows bewijst niet dat alle bestaande bedrijfsregels zijn overgenomen. Onder meer nog vast te stellen of af te ronden:

- De actieve WordPress-instellingen, echte klantgoedkeurings-/prijs-/kortings-/valuta-/belasting- en verzendregels.
- Volledige modelcompatibiliteit: categorieën/tags zijn broninformatie, geen technische compatibiliteitsgarantie.
- Volledige productbeeldmigratie, varianten en de benodigde redirects/SEO-migratie.
- Echte Picqer-contracten voor voorraad, orders en labels; tweede-site/Shopify-overdracht en hun fout-/retry-/reconciliatieregels.
- De actieve betaalproviderflows, refunds, orderstatusmappings, documenten en boekhoudkoppelingen.
- Normconforme Swiss QR-bills/CAMT: een gewone PDF-factuur is daarvoor geen vervanging.
- Werkelijk gebruikte bulkbestel-, wishlist/compare-, vertaal- en overige thememogelijkheden.
- Productiehosting, backups/herstel, volledige migratieproef en formele functionele acceptatie.

Deze punten mogen niet stilzwijgend verdwijnen. De afzonderlijke testversie is een concrete bouwstap, niet de verklaring dat “alles af” is.

## Actueel: directe modelkeuze en eigen vormgeving — 6 september 2026

Het openbare referentieonderzoek en de ontwerpkeuzes staan in `parts-discovery-research.md`. De testwinkel heeft een nieuwe blauwgetinte kop, de behouden zoekingang “Wat zoekt u?”, directe modelknoppen en een compacter productoverzicht. De oude website is niet als visuele kopie gebruikt.

Een model opent zijn catalogus direct; de onderdeelknoppen houden het model vast. Compacte modelnamen worden herkend en exacte namen staan vóór gelijkende varianten. Een modelwissel behoudt onderdeeltype en extra filters, maar vervangt de oude apparaat-/zoekcontext. Globaal zoeken begint opnieuw. Desktopfilters werken direct; mobiel blijft de toepasknop bestaan. Recent gekozen modellen blijven lokaal beschikbaar en kunnen worden gewist. `/` en Ctrl/Cmd+K openen zoeken zonder normale tekstinvoer of dialogen over te nemen.

Verificatie van deze wijziging:

- 12 controles voor modelzoeken, URL-context, lokale opslag en sneltoetsen.
- 7 bestelbaarheidsgevallen in zowel kaart als detail, inclusief gasten, beheer en te weinig voorraad voor het minimum.
- 11 navigatiecontroles, gezamenlijke scriptuitvoering met 25 routes, zoek-/toetsenbordcontroles, late-routeantwoorden en PHP-syntax geslaagd.
- In de ingelogde desktopbrowser kostte de route vanaf de geladen startpagina naar **iPhone 13-schermen precies twee klikken** en leverde de juiste 13 testproducten op.
- Wisselen naar Galaxy S22 behield schermen, verwijderde iPhone 13 en gaf 8 testproducten. Directe merkwijziging verwijderde het oude model; sortering bleef behouden.
- Globaal zoeken op `iphone13 scherm` begon zonder oud merk/model/onderdeel. Escape behield de invoer. Recente modellen bleven na herladen staan en konden worden gewist.
- De mobiele modelwisselaar, filterdialoog, onderdeelkeuze en productregels werkten. Titel, voorraad, prijs en bestelbediening overlapten niet.
- Eén artikel is aan de synthetische klantwagen toegevoegd en daarna verwijderd. De succesmelding sloot bij navigatie; de wagen was weer leeg. Geen checkout of order uitgevoerd.
- De eerste mobiele controle vond een te brede homepage. De intrinsieke grid-/invoerbreedte en mobiele kop zijn hersteld. Een nieuwe schermafbeelding op 390 px toont de zoekknop en inhoud binnen de pagina.
- Geen JavaScriptfouten in deze browserronde. Gastprijzen zijn afzonderlijk visueel gecontroleerd; de uitgebreide browserronde gebruikte een bestaande synthetische klantsessie.

Actuele beelden: `screenshots/workbench-home-desktop.jpg`, `screenshots/workbench-home-mobile.jpg` en `screenshots/workbench-catalog-desktop.jpg`. Het browserrapport bevat aanvullend de ingelogde mobiele lijst, modeldialoog en herstelde lege winkelwagen.

## Eerdere basis: herbouw van de productzoeker — 6 september 2026

De voorgaande startpagina zette “Wat zoekt u?” centraal, met directe suggesties en daarnaast een optionele apparaatkeuze. De twaalf categorieën zijn gegroepeerd in reparatieonderdelen en gereedschap/accessoires. Modelkeuze is doorzoekbaar; categorieën, merken en modelaantallen worden afgestemd op de huidige zoekopdracht en filters. Bestaande bronkoppelingen blijven leidend: de zoekinterface maakt geen nieuwe technische compatibiliteitsclaims.

Het productoverzicht heeft afzonderlijke selectie- en sorteermogelijkheden, verwijderbare filterlabels, optionele extra filters en een echte mobiele filterdialoog. Sorteerkeuzes behouden zoekterm en filters, een gewijzigd merk wist het oude model en iedere filterwijziging begint weer op de eerste pagina. Gastprijzen blijven verborgen. Productkaarten respecteren de minimale bestelhoeveelheid. Iedere navigatie krijgt een eigen schermcontainer, zodat een laat productantwoord geen nieuwere pagina kan overschrijven.

Technische verificatie van deze herbouw:

- 329 controles op contextuele aantallen, filtercombinaties, behoud van modelinformatie en prijsprivacy.
- 29 bestaande HTTP-zoekcontroles opnieuw geslaagd.
- 11 controles op URL-opbouw, sorteren, paginering en afhankelijke modelkeuze.
- Gerichte controle: een vertraagd productantwoord overschrijft geen nieuwere catalogus.
- Gerichte controle: navigatie sluit de globale winkelwagenmelding.
- Gezamenlijke uitvoering van alle scripts met 25 vereiste routes, inclusief de startpagina.
- Bestaande controles voor zoekvertraging, late antwoorden, sluiten, toetsenbordbediening en ARIA-status opnieuw geslaagd.

De browsercontrole bevestigde zoeken en suggesties, de exacte iPhone 13-modelkeuze, behoud van filters bij sorteren, wissen van een oud model bij merkwijziging, paginering met terug/vooruit en behoud van lijstweergave na herladen. De mobiele filterdialoog is op 390 × 844 geopend, toegepast en met Escape gesloten zonder horizontale overflow.

Met een ingelogde synthetische klant zijn oplopende eigen klantprijzen, toevoegen aan de winkelwagen, de mobiele winkelwagen en een echte lokale fotogalerij gecontroleerd. Alleen het toegevoegde testartikel is verwijderd; er is geen bestelling geplaatst. De eerste browserronde vond dat Escape de zoektekst wiste, dat de winkelwagenmelding na navigatie bleef staan en dat mobiele lijstkaarten te smal waren. Alle drie zijn hersteld en gericht opnieuw met succes gecontroleerd. De zoektekst bleef `iphone13`, de winkelwagen had na navigatie nul overliggende meldingen en de mobiele titel, voorraad, prijs en bestelknoppen stonden aantoonbaar uit elkaar.

Tijdens één herlaadactie meldde de browser een mislukte achtergrondophaling van de winkelwagen. De daaropvolgende directe winkelwagenroute en alle toevoegen-/verwijderencontroles slaagden. De laatste serverlog bevat geen PHP-fouten.

Visueel bewijs: `screenshots/discovery-home-desktop.jpg` en `screenshots/discovery-catalog-desktop.jpg`; daarnaast zijn mobiele dialoog-, lijst- en winkelwagenbeelden vastgelegd in het browserrapport.

Deze controles veranderen niets aan de hierboven beschreven beperkingen ten opzichte van de live winkel. De onderstaande browserresultaten onder “Eerdere vormgeving” zijn historische nulmetingen en geen bewijs voor deze herbouw.

## Eerdere vormgeving en vindbaarheid

De winkel, accountschermen en beheeromgeving zijn opnieuw vormgegeven met dezelfde native stack. De startpagina begint met een merk/model/onderdeelzoeker. Reparatiecategorieën staan vóór accessoires; kaarten gebruiken lokale productfoto's of categorie-iconen en echte aantallen. Zoekresultaten ondersteunen actieve filterchips, lijst/rasterweergave en mobiele filters. Minder gebruikte filters, checkoutopmerkingen en aanvullende account-/beheerinstellingen zijn inklapbaar. Een uitgebreide productbeschrijving is optioneel; noodzakelijke product- en bestelvalidatie blijft behouden.

De zoekfunctie ondersteunt compacte modelnamen, artikelnummers en Nederlandse onderdeeltermen. Suggesties bevatten echte producten, categorieën en modellen. Modeltermen blijven bij elkaar zodat bijvoorbeeld “iPhone 13” niet alleen wegens de cijfers in een willekeurig artikelnummer matcht. “Scherm” wordt niet als categorie-alias voor “bescherming” gebruikt. Gastprijzen blijven verborgen en ingelogde klanten krijgen uitsluitend hun eigen toegewezen prijzen. Suggesties zijn met pijltjestoetsen, Enter en Escape bedienbaar; vertraagde antwoorden kunnen geen nieuwere of gesloten resultaten overschrijven.

Controles van dit ontwerp:

- 29 HTTP-zoekcontroles geslaagd, inclusief gecombineerde filters, compacte modelnamen, categorie-aliases, artikelnummers, kleine modelgroepen, paginering, gastprivacy en prijssortering per klantgroep.
- Gezamenlijke scriptuitvoering met 24 vereiste routes geslaagd. Een nieuwe botsende helperdeclaratie is verholpen vóór de browsercontrole.
- Gerichte JavaScriptcontroles geslaagd voor debouncing, late antwoorden, sluiten/wissen, korte zoekopdrachten, toetsenbordselectie en ARIA-status.
- De ingelogde desktopbrowser doorliep de modelzoeker, suggesties, filters, lijst/raster, fotogalerij, winkelwagen, één testbestelling met lege opmerkingen, orderherladen en een echte PDF-download.
- De privé-beheerbrowser maakte een product aan via het nieuwe formulier, controleerde de numerieke editorroute en opgeslagen waarden, sloeg tracking op zonder statuswijziging en opende retouren en de lokale berichtenopvang. De tijdelijke QA-accounts zijn daarna geblokkeerd.
- Op 390 px werkten de modelzoeker, catalogus en productpagina zonder horizontale overflow. De mobiele winkelwagen bleek ondanks een passende paginabreedte intern overlappende inhoud te hebben; die rij is vervangen door een expliciete tweerijige gridindeling. De gerichte hercontrole slaagde: titel/SKU en aantal/verwijderen hebben niet-overlappende posities, aantal wijzigen van 1 naar 2 rekent correct door en legen werkt. Er waren geen applicatiefouten in de browserconsole.
- Het voor de formuliercontrole gemaakte synthetische product is na afloop gearchiveerd, zodat het niet tussen de bronproducten in de openbare testcatalogus blijft staan.

Deze controle betreft de afzonderlijke testwinkel, niet de live website of echte integraties. Oudere controles hieronder zijn de functionele nulmeting van vóór het nieuwe ontwerp.

## Controle

Een codecontrole heeft onder andere de publieke staff-demo geweigerd en de retourberekening aangescherpt op status, exact rekenen en cumulatieve belastingtoewijzing. De native API-integratietest staat in `artifacts/parts-store/native/bin/qa-http.py`; 40 controles zijn geslaagd, waaronder eigen-prijsisolatie, CSRF, eigendom van orders/adressen/documenten, checkout-herhaling, gewijzigde voorraad, annulering, deelretouren, echte PDF's, WebP, CSV-preview/import en lokale gebeurtenisopvang. Een gevonden fout in de pakbon is vóór die geslaagde controle opgelost. Browsercontrole wordt op de nieuwe testomgeving uitgevoerd, niet op de live winkel.

De ingelogde browsercontrole heeft zoeken, productdetail, winkelwagen, checkout, orderbevestiging/-historie na herladen, een echte PDF-download, privé-beheerderslogin, orderverzending en een opgeslagen klantretour doorlopen. Beheer voor producten/klanten, retourlijst, inkoop, berichten, audit en instellingen is bekeken.

De browsercontrole vond een dubbele JavaScript-declaratie die een beheermodule blokkeerde, een ontbrekende staff-detailroute voor retouren en een mobiel overlopende productindeling. Deze zijn hersteld. De gezamenlijke uitvoering van de zes scripts en 24 route-registraties is gecontroleerd; vier gerichte HTTP-controles bevestigen daarna staff-toegang en afscherming van retourdetails. De gerepareerde mobiele productindeling is afzonderlijk met een schermafbeelding gecontroleerd. De volledige kooproute is niet opnieuw op mobiel doorlopen.

De service is na de laatste codewijzigingen opnieuw gestart; de opstartlog is schoon. Het privé-beheeraccount `staff@test.invalid` is via de beveiligde wachtwoordinvoer geconfigureerd. Login met het ingestelde wachtwoord, behoud van de staff-sessie, toegang tot het beheerdashboard en uitloggen zijn gecontroleerd. Gasttoegang en de publieke staff-demo blijven geweigerd. Dit account staat los van de live website; gebruik daarvoor nooit hetzelfde wachtwoord.