# Native PHP testomgeving — voortgang en grenzen

## Omgeving

De nieuwe versie staat afzonderlijk onder `/test-shop/`. De oude prototypebroncode en live website zijn niet vervangen. De nieuwe applicatie gebruikt PHP 8.4, MySQL 8.4, HTML, eigen CSS en native JavaScript. Er zijn geen applicatieframeworks, Composer/npm-runtimepackages of externe fonts toegevoegd aan deze versie.

De native service is uitsluitend een ontwikkel-/testomgeving. De productie-build is bewust geblokkeerd; dit is geen publicatieklare webshop.

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

## Vernieuwd ontwerp en vindbaarheid

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

De service is na de laatste codewijzigingen opnieuw gestart; de opstartlog is schoon. Het eigen beheerwachtwoord moet via de beveiligde invoer worden ingesteld voordat de eigenaar met `staff@test.invalid` kan inloggen. Dit mag niet het wachtwoord van de live site zijn.