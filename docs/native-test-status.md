# Native PHP testomgeving — voortgang en grenzen

## Omgeving

De nieuwe versie staat afzonderlijk onder `/test-shop/`. De oude prototypebroncode en live website zijn niet vervangen. De nieuwe applicatie gebruikt PHP 8.4, MySQL 8.4, HTML, eigen CSS en native JavaScript. Er zijn geen applicatieframeworks, Composer/npm-runtimepackages of externe fonts toegevoegd aan deze versie.

De native service is uitsluitend een ontwikkel-/testomgeving. De productie-build is bewust geblokkeerd; dit is geen publicatieklare webshop.

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