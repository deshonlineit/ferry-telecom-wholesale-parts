# Sneller onderdelen vinden — ontwerpkeuzes

Onderzocht op 6 september 2026. Dit onderzoek betreft openbare webpagina's en schermafbeeldingen, niet de afgeschermde account- of bestelprocessen van andere leveranciers.

## Wat we hebben bekeken

| Referentie | Waarneembaar patroon | Keuze voor deze testwinkel |
| --- | --- | --- |
| [iFixit — Phone Parts](https://www.ifixit.com/en-gb/Parts/Phone) | Merken direct boven producten; onderdeeltypes met aantallen; onderscheid tussen productvarianten in de lijst. | Een directe modelingang en contextuele onderdeelknoppen. Variant/type, artikelnummer en voorraad staan bij elkaar. |
| [MobileSentrix Europe](https://www.mobilesentrix.eu/) | Merkgerichte hoofdnavigatie en prominente zoekbalk. Grote promotieblokken; de bekeken homepage toonde ook een regiokeuzemelding. | Wel directe navigatie en zoeken; geen promotiecarrousel of extra onderbreking vóór de onderdelenzoeker. |
| [Mobileparts.shop — onderdelen](https://www.mobileparts.shop/nl/artikelen/onderdelen) | Onderdelen, gereedschap en accessoires gescheiden; toestelmerken als ingang. Veel introductietekst vóór het assortiment. | De routes gescheiden houden, maar de apparaatkeuze direct bedienen zonder eerst commerciële uitleg te moeten lezen. |
| [Baymard — compatibility databases](https://baymard.com/blog/ecommerce-compatibility-databases) | Onderzoek bespreekt apparaatcompatibiliteit als doorslaggevende selectie en waarschuwt dat een merkfilter alleen onvoldoende is. | Bestaande specifieke modelkoppelingen gebruiken. Geen compatibiliteit afleiden uit een merk, generieke categorie of een verzonnen aanbeveling. |

De waarnemingen zijn input voor een eigen ontwerp, geen kopie van tekst, logo's, foto's of visuele identiteit van deze bedrijven. De Baymard-publicatie is oudere algemene gebruikersonderzoeksliteratuur, geen actuele snelheidsmeting van de genoemde leveranciers.

## Concrete toepassing

- “Wat zoekt u?” blijft de zoekingang voor een onderdeelnaam, model of artikelnummer.
- Een getoond model opent direct zijn catalogus. Vervolgens kiest de gebruiker het onderdeeltype zonder het model opnieuw te kiezen.
- Modelzoeken herkent bijvoorbeeld `iphone13` en plaatst de exacte iPhone 13 boven Pro-varianten.
- De modelwisselaar vervangt de oude apparaat-/zoekcontext, maar behoudt onderdeeltype en aanvullende filters.
- Globaal zoeken begint een nieuwe zoekopdracht; een eerder model mag die opdracht niet ongemerkt beperken.
- Desktopfilters worden direct toegepast. Mobiele filters worden eerst in een dialoog gekozen en daarna samen toegepast.
- Recent gekozen modellen worden uitsluitend als enkele model-ID's in deze browser bewaard. Wissen is zichtbaar beschikbaar.
- De standaardlijst legt de nadruk op naam, type, SKU, voorraad en bestellen. Dat werkt ook voor de vele bronproducten zonder foto; er zijn geen productbeelden verzonnen.
- Bij ontbrekende modelmetadata is zoeken in productnamen beschikbaar. Dat is nadrukkelijk geen garantie van technische compatibiliteit.
- De stijl gebruikt een donkere blauwgetinte kop, heldere zoekvlakken, eigen lokale merkelementen en systeemlettertypen. Er zijn geen frameworks of externe fonts toegevoegd.

## Beoordelingsgrens

Een primaire acceptatiecheck is de route vanaf de geladen startpagina naar iPhone 13-schermen: model aanklikken en “Schermen” kiezen, zonder extra toepasknop. De actuele browseruitkomst staat in `native-test-status.md`.

Dit bewijst geen algemene snelheidswinst voor iedere bezoeker, volledige cataloguscompatibiliteit of marktleiderschap. Alle functionele tests blijven beperkt tot `/test-shop/`, met fictieve klanten en zonder live transacties.