# Matrik

Lokal webbapp för familjens recept i Google Sheets och tryckbara matkort. Namnet uttalas **ma-TRIK** och anspelar på att vara rik på mat. Google Sheet är datakällan. Appen lagrar OAuth-token lokalt i `.local/token.json` och lägger inte recept, bilder eller exporter i repot.

## Kom igång (Linux)

Kräver Node.js 22 eller senare och ett Google-konto med åtkomst till receptarket och bildmappen.

1. Skapa ett projekt i [Google Cloud Console](https://console.cloud.google.com/). Aktivera **Google Sheets API** och **Google Drive API**.
2. Konfigurera OAuth consent screen. Vid testläge: lägg till ditt Google-konto som testanvändare.
3. Skapa en OAuth-klient av typen **Web application**. Lägg till exakt `http://127.0.0.1:4173/auth/callback` som authorized redirect URI. Google accepterar loopback för lokal utveckling.
4. Kopiera `.env.example` till `.env`. Fyll i `GOOGLE_SPREADSHEET_ID` och `GOOGLE_DRIVE_FOLDER_ID` från adresserna till ditt ark och din bildmapp. Fyll i `GOOGLE_CLIENT_ID` och `GOOGLE_CLIENT_SECRET`. Alternativt kan du lägga nedladdad OAuth JSON i `credentials/` och ange dess absoluta sökväg med `GOOGLE_CREDENTIALS_FILE`.
5. Kör första gången:

```bash
npm install
./start-matrik.sh
```

Senare räcker det att köra `./start-matrik.sh` från projektmappen. Skriptet startar servern och öppnar rätt adress i webbläsaren. Om Matrik redan körs öppnar det den befintliga sidan. Vid ny start väljer skriptet installerad Node.js 22 via nvm om terminalen annars använder en äldre systemversion. Avsluta en server som skriptet startat med Ctrl+C i terminalen. Välj **Logga in med Google** och godkänn Sheets/Drive-åtkomst vid första starten. Om port 5173 används väljer Vite nästa lediga port. API-servern körs bara på `127.0.0.1:4173`. Du kan fortfarande använda `npm run dev` om du vill starta utan att öppna webbläsaren. För en färdig lokal byggning: `npm run build && npm start`, öppna sedan `http://127.0.0.1:4173`.

## Första kontrollen med M007

1. Öppna **M007 Tacos** i receptlistan. Kontrollera att namn, recept och de relationella ingredienserna kommer från Sheet.
2. Ändra exempelvis kortnamn eller en mängd. Båda kortsidorna uppdateras cirka 600 ms efter sista ändringen utan export eller Google-skrivning.
   Klicka på en kortsida för att se den större. I den förstorade vyn kan du växla mellan fram- och baksida och stänga med Escape. **Visa bleed**, **Visa trycklinjer** och **Visa kortgrafik** är oberoende granskningsval. När kortgrafiken är dold ser du enbart fotografiet med samma utsnitt. **Spara bild som PNG** och **Kopiera bild som PNG** följer förhandsvisningen. De vanliga knapparna under **Tryckfiler** innehåller alltid kortgrafiken och aldrig trycklinjer.
   Under **Inställningar** i sidomenyn kan du jämföra de tre framsidorna: semitransparent panel, text på bilden och svag lokal toning. Semitransparent panel är standardvalet. Inställningen gäller alla rätter, används också i PNG- och PDF-export och sparas i webbläsaren, utan ny kolumn i Google Sheet.
3. Välj **Spara i Sheet**. Läs om sidan eller kontrollera Google Sheet för att se att ändringen finns kvar.
4. Lägg till en förberedelse, fyll i typ, ledtid, tidpunktstyp och instruktion och spara. Kontrollera att en ny rad med M007 finns i `Rätt-förberedelser`. Testa även att ändra, inaktivera och ta bort raden. `Har förberedelser` i `Rätter` är en beräknad hjälpkolumn och uppdateras av Sheet när en aktiv förberedelse finns.
5. Exportera framsida, baksida eller A4 proof. Standardprofilen ger PNG i 822 × 1122 px och ett kort med 63 × 88 mm trim samt 3,175 mm utfall per sida. A4 proof placerar korten i faktisk fysisk storlek, på två sidor om en bred egen profil inte får plats sida vid sida; skriv ut i 100 %, utan sidanspassning.
6. Under kortförhandsvisningen finns **Bildvarianter** och **Beskärning för kortet**. Lägg till en bild som ny Drive-fil eller välj en befintlig variant. Valet sparas direkt i Google Sheet. Beskärningspanelen visar hela originalet och en ram för full exportyta inklusive bleed. Dra ramen, zooma med reglage/scrollhjul eller finjustera med piltangenterna. Den inre streckade ramen visar trimytan. DPI visas utifrån originalpixlarna och zoomning stannar innan upplösningen blir otillräcklig.

## Sheet-format och beteende

### Veckoplan och inköpslista

Öppna **Veckoplan** i sidomenyn, välj en eller flera av rätterna och ställ in portioner för varje tillfälle. Samma rätt kan läggas till flera gånger med olika portionsantal. Under **Ingredienser och val** kan du välja ett granskat alternativ och slå på valfria ingredienser. Alternativets egen mängd, enhet, skalning och inköpsuppgifter används direkt. Tillagningsanpassningen visas vid valet. Äldre alternativ som bara finns som fritext erbjuds inte som val förrän mängd och tillagning har granskats. För hamburgare växlar rå potatis och standardvalet frysta pommes automatiskt så att bara ett tillbehör hamnar i listan. **Visa inköpslistan** hoppar direkt till den summerade listan på mobil.

Kortets ingredienstabell visar endast standardråvaran. Det påverkar inte vilka granskade alternativ som kan väljas i veckoplanen. `Rätt-ingrediensalternativ` är en valfri Sheet-flik med kolumnerna `Rätt-ID`, `Standard-ingrediens-ID`, `Alternativ-ingrediens-ID`, `Basmängd`, `Enhet`, `Skalningstyp`, `Avrundning`, `Inköpsenhet`, `Förpackningsstorlek`, `Inköpsnotering`, `Tillagningsanpassning` och `Valbar`. En rad får `Valbar = Ja` först när alternativets mängd och metod är kontrollerade. Alternativets ingrediens-ID måste finnas i `Ingredienser`; standard-ID:t måste finnas i receptets relationer. Ändra eller ta inte bort en standardrelation med registrerade alternativ via receptredigeraren utan att först migrera alternativraderna kontrollerat.

Inköpslistan omfattar alla valda recept och alla deras ingrediensrader. Gemensamma varor summeras när namn och enheter är jämförbara; g/kg och ml/cl/dl/l/msk/tsk kan räknas om. Hela enheter avrundas för varje recept före summering. Om arket har en entydig numerisk förpackningsstorlek visas ett beräknat antal förpackningar; annars visas behovet i receptets enhet tillsammans med inköpsenhet och inköpsnotering, utan gissat förpackningsantal. Varje vara visar vilka rätter mängden kommer från.

Veckoval och portionsantal sparas endast i den aktuella webbläsarens lokala lagring. Recept och ingrediensrelationer hämtas alltid från Google Sheet. Den gamla fliken `Veckoplan` och dess formler läses inte av den nya vyn och ändras inte. Veckoval synkas därför inte mellan enheter. Listan är ett planeringsunderlag; kontrollera skafferiet och faktiska förpackningsstorlekar inför inköp.

Appen läser flikarna `Rätter`, `Ingredienser`, `Rätt-ingredienser`, `Taggar` och `Rätt-förberedelser`. Kolumner kopplas via arkets faktiska rubriker. Den aktuella fliken `Rätt-förberedelser` behöver `Förberedelse-ID`, `Rätt-ID`, `Typ`, `Ledtid (min)`, `Tidpunktstyp`, `Instruktion`, `Villkor`, `Prioritet`, `Aktiv` och `Anteckning`. Valen i dess rullistor hämtas direkt från Sheets datavalidering. Appen skapar inga egna kolumner när valfria fält saknas. Okända kolumner ändras inte.

Varje förberedelse är en egen rad kopplad till rätten via `Rätt-ID`. Nya rader får ett ledigt förberedelse-ID; borttagna rader töms helt. Förberedelserna är separata från `Total tid (min)` och påverkar ännu inte kortlayouten. `Rätter.Har förberedelser` visas som skrivskyddat värde från Sheet och skrivs aldrig av appen. Taggar läses från `Rätter.Taggar` eller från fliken `Taggar`; när rätten saknar egen taggkolumn sparas de i `Taggar`. Bild-ID skrivs som Drive-länk i `Bildlänk`.

### Bildvarianter och beskärning

Fliken `Rätt-bilder` innehåller en rad per bildvariant: `Rätt-ID`, `Variant-ID`, `Drive-fil-ID`, `Vald`, `Bredd px`, `Höjd px`, `Beskärning JSON`, `Beskrivning`. Vid första bilduppladdningen eller bildvalet skapar servern en fullständig säkerhetskopia i Drive och en privat snapshot under `.local/image-variants/backups/`. Därefter skapas fliken med de befintliga bildfilerna som valda `original`-varianter. Befintliga receptceller, formler och Drive-filer ändras inte av migrationen. Den valda variantens fil-ID speglas även till `Rätter.Bildlänk` vid byte, så äldre läsare fortsätter fungera. För M007, vars Bildlänk kan vara tom, hämtas den äldre ID-baserade Drive-bilden vid migrationen.

Beskärningen lagras som normaliserad rektangel per variant. Tom beskärning använder exakt den tidigare centrerade SVG-cover-metoden. Framside, preview-PNG, vanlig PNG/PDF och batch-export använder samma SVG-bildtransform. Bildval och beskärning sparas i Sheet, inte i webbläsarens lokala lagring. Bildredigeraren kräver minst 300 verkliga effektiva foto-ppi över hela bleed-ytan, oberoende av exportens 800 ppi. Zoom och förflyttning begränsas av fotokravet. En bild med för låg upplösning kan visas men inte beskäras eller tryckexporteras med den profilen. Den vanliga tryckexporten innehåller alltid namnplatta, text och QR-kod även när `Visa kortgrafik` är avmarkerad i previewn.

Sparning använder en revisionskontroll. Om någon ändrat rätten i Sheet sedan den öppnades får du ett konfliktfel och behöver ladda om. Nya ingredienser får nästa lediga ID med samma prefix och sifferbredd som registret. Ändringar i ingredienslistan skrivs till `Rätt-ingredienser`; borttagna relationer avaktiveras genom att ID-fälten töms. Google-data är alltid källa vid omladdning.

Kortens framsida och baksida byggs från samma SVG-funktion i preview och export. QR-koden innehåller receptets M- eller D-ID. Recepttyp väljer matkortets mörka tema eller dessertkortets hallonrosa tema i både preview och export. Valideringen stoppar export när ingredienslistan eller instruktionen inte ryms och visar varningar för lång titel eller saknad bild. Personspecifik och fast mängd behålls mellan portionstalen; proportionell mängd skalas och `Hela enheter` avrundas uppåt.

## Tryckprofiler

Välj **Poker** eller **Tarot** vid receptets övre kant. Valet sparas i webbläsaren och används av preview, beskärning, enskild export och hela kortlekens export. Poker är fortsatt standard, med oförändrad design: 63 × 88 mm trim och 2192 × 2992 px vid 800 ppi. Tarot följer MPC:s exakta 2,75 × 4,75 tum (69,85 × 120,65 mm) och exporteras i 2400 × 4000 px vid 800 ppi. Båda har 3,175 mm bleed per sida och 3,175 mm safe area innanför trim. MPC:s dokumenterade [tarotmått och bleed](https://www.makeplayingcards.com/design/design-your-own-tarot-cards.html) samt [minimum 897 × 1497 px för tarot och 822 × 1122 px för poker](https://www.makeplayingcards.com/pops/faq-photo.html) är separata från Matriks exportupplösning.

Tarot använder samma recept, foto, teman och QR-generering som poker, men en global layout med större text. Under **Bildvarianter → Beskärning för kortet** får tarot ett eget utsnitt. Pokerbeskärningen ligger kvar i `Rätt-bilder.Beskärning JSON`; tarot sparas i kolumn I, `Beskärning tarot JSON`. Vid första tarotbeskärningen tas en fullständig Sheet-säkerhetskopia och kolumnen läggs till. Ett tomt tarotutsnitt ger centrerad beskärning och påverkar aldrig pokervärdet. I **Inställningar → Tryckprofil** kan du även skapa en egen profil; den sparas endast i webbläsaren.

Källfotot kontrolleras fortsatt separat från kortets 800 ppi. Pokerns minimikrav är oförändrat 300 effektiv foto-ppi. Fyrtio av de nu valda fotona har uttryckliga, variant- och måttbundna tarotundantag: 31 kring 296–297 ppi, sju kring 289,6 ppi och två kring 262,4 ppi (D003 och D010). Undantagen syns i beskärningspanelen och exportmanifestet; de gäller inte nya eller utbytta varianter. Källfotografierna skalas inte upp för att påstå högre detaljupplösning. Kontrollera särskilt D003 och D010 i ett fysiskt provtryck om tarot väljs.

Slutlig tryckexport innehåller aldrig tryckzoner eller skärlinjer. **Visa bleed** väljer mellan färdigt trimområde och hela exportytan. **Visa trycklinjer** visar trim- och safe-area-markeringar oberoende av bleed. Preview-PNG sparar eller kopierar just det visade läget. Matbilden och bakgrunderna täcker hela exportytan. Textpanelen, texten och QR-rutan på framsidan placeras innanför safe area.

### Hela kortleken för tryck

Installera `zbarimg` (på Debian/Ubuntu: paketet `zbar-tools`) för automatisk QR-kontroll och `zip` för nedladdning av ett helt paket från appen. Klicka **Hela kortleken** under tryckfiler för att generera ett privat paket med valt format och hämta ZIP när det är klart. Alternativt kör `npm run print:deck -- --format poker --out .local/print/poker` eller `npm run print:deck -- --format tarot --out .local/print/tarot`; `--expected 62` kan läggas till som extra antalskontroll. Välj en ny utdatakatalog per körning. Alla aktiva recept tas med automatiskt. Varje kort får en framsida och baksida med samma ordningsnummer och ID, plus `manifest.json` med format, bildbeskärning, effektiv foto-ppi, kontrollsummor och eventuella tarotundantag samt `checklista.csv`. Exporten stoppar vid saknad bild, otillräcklig fotoupplösning utan undantag, layoutfel, oläslig QR-kod eller ändringar i arket under körningen. Korten rasteriseras direkt från SVG och originalbilder i formatets slutliga pixlar. Förhandsgranska och provskriv i 100 % före beställning.

## Recepttyper och veckoplan

Receptsamlingen kan filtreras på **Maträtter**, **Desserter** eller **Alla recept**. Maträtter är standardläget. Recept-ID:n som börjar på `M` behandlas som Maträtt och `D` som Dessert; en eventuell kolumn `Recepttyp` i `Rätter` läses också. Nuvarande Google Sheet saknar den kolumnen, och ingen schemamigrering behövs för att lägga till D-recept. Samma ingrediensregister, relationer, taggar, förberedelser och bildlänkar används för båda typerna.

Recept med status `Arkiverad` döljs i vanlig bläddring, nya veckoplaner och tryckexport. Den tidigare arkiverade M039-rätten är borttagen och ID M039 tillhör nu Kåldolmar. Äldre länkar och QR-koder med M039 leder därför till Kåldolmar. Vid första start efter bytet sparas en kopia av den lokala veckoplanen i `matrik.weekPlan.beforeM039Reassignment`; gamla M039-tillfällen tas bort ur den aktiva planen och M051-tillfällen flyttas till M039. QR-koden innehåller bara recept-ID:t och öppnar inte appen automatiskt i en vanlig kameraskanner. Veckoplanen lagras fortsatt i webbläsarens `matrik.weekPlan`. Varje tillfälle har ett eget ID, dag, recept, portionsantal och ingrediensval. Du kan lägga till samma recept flera gånger, flytta ett tillfälle till en annan dag, byta dess recept eller ta bort bara det tillfället. Äldre sparade tillfällen utan dag blir **Ej schemalagt** och behåller sina portioner och val. Alla tillfällen bidrar till samma inköpslista, som summerar kompatibla varor från maträtter och desserter.

## Säker receptimport

Importen använder det aktuella Google Sheet som enda bestående receptkälla. Ett receptförslag är en tillfällig JSON-fil med `version: 1` och `recipes`, där varje rätt har namn, 4 basportioner, aktiv/total tid, fullständigt recept, kortrecept, taggar och ingredienser med mängd, enhet, skalning och avrundning. Alternativa råvaror anges som `alternatives` på en ingrediensrad. Förslagsfiler och rapporter måste ligga i den Git-ignorerade `.local/`-mappen; lägg inte recept, credentials eller bilder i Git.

Kör `npm run import:dry -- .local/import/recipes.json` för att läsa arket och skapa två lokala rapporter: en med varje föreslagen celländring och en läsbar receptsamling. Kommandot ändrar **ingenting** i Sheet eller Drive. Ange `"type": "Dessert"` på dessertförslag; importen tilldelar nästa lediga D-ID. Maträtter får M-ID. Ett angivet `id` måste matcha den säkra tilldelningen. Importen kontrollerar ID-krockar och namnlikheter samt återanvänder kända ingredienser. Om två olika rätter får en möjlig namnträff kan förslaget ange `distinctFrom: ["M005"]` efter manuell granskning; ett okänt ID eller en annan möjlig dubblett stoppar fortfarande importen. Befintliga ingrediensrelationer skyddas som standard. Med `mode: "replace"` på ett recept kan mängder och andra värden i relationerna uppdateras när ingrediensernas namn och ordning är desamma; borttagning och namnbyte kräver manuell granskning.

Först efter granskning kan en plan tillämpas med `npm run import:apply -- .local/import/recipes.json --confirm PLAN-ID`. Kommandot läser arket på nytt och kräver exakt samma plan-ID, skapar en säkerhetskopia av hela arket i Drive och en privat lokal snapshot innan det skriver. Saknade portionsformler på **nya tomma rader** tas med som egna celländringar i dry-run och kopieras från en befintlig formelmall med fasta referenser bevarade. Befintliga formler och andra ifyllda celler skrivs inte över. Därefter verifieras att samma import ger noll nya receptändringar. Bildimport ingår inte i detta flöde. Bilduppladdning i redigeraren skapar en ny Drive-fil och lägger till den som ny bildvariant; befintliga bildfiler skrivs inte över. `Kortrecept` läggs till som en kolumn i `Rätter` först vid en godkänd import om den saknas.

Källkoden finns på [github.com/Clox/matrik](https://github.com/Clox/matrik) och den lokala projektmappen heter `matrik`. En lokal kompatibilitetslänk från den tidigare sökvägen `matrika` kan finnas kvar för äldre verktygsinställningar. Google Cloud-projektets tekniska ID `matrika-514800` är oföränderligt; dess visningsnamn och OAuth-appens namn är Matrik.

Tallriksikonen används som favicon (`public/favicon.svg`) och som större märke i appen (`public/brand-mark.svg`). De tidigare ikonförslagen kan jämföras på `/favicon-ideas.html` när appen körs lokalt.

## Säkerhet och lokal data

Drive-bilder lagras automatiskt i `.local/image-cache/`. Vid varje bildförfrågan kontrollerar servern Drive-filens version och hämtar om bilden när den har ändrats. Webbläsaren återanvänder oförändrade bilder med ETag. Bilduppladdning via Matrik rensar motsvarande lokal cache direkt. Receptdata hämtas fortfarande från Google Sheets som tidigare. Cachen kan raderas när appen är avstängd; den byggs upp igen vid behov.

`.env`, `credentials/`, `.local/`, exporter och bildfiler ignoreras av Git. API-servern lyssnar endast på loopback, och ändringar kräver en lokal CSRF-nyckel. OAuth-token sparas med filrättighet `0600`. Kör inte appen som en publik server. Kontrollera `git status` innan du committar och lägg aldrig in familjedata eller genererade kort manuellt.

## Tester

`npm test` provar Sheet-mappning inklusive förberedelser, mängdskalning, kortvalidering och PNG-rendering i tryckstorlek. `npm run build` kontrollerar frontend. Ett riktigt end-to-end-test mot Google kräver dina privata OAuth-uppgifter och tillgång till arket; de följer inte med repot.
