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

Senare räcker det att köra `./start-matrik.sh` från projektmappen. Skriptet startar servern och öppnar rätt adress i webbläsaren. Om Matrik redan körs öppnar det den befintliga sidan. Avsluta en server som skriptet startat med Ctrl+C i terminalen. Välj **Logga in med Google** och godkänn Sheets/Drive-åtkomst vid första starten. Om port 5173 används väljer Vite nästa lediga port. API-servern körs bara på `127.0.0.1:4173`. Du kan fortfarande använda `npm run dev` om du vill starta utan att öppna webbläsaren. För en färdig lokal byggning: `npm run build && npm start`, öppna sedan `http://127.0.0.1:4173`.

## Första kontrollen med M007

1. Öppna **M007 Tacos** i receptlistan. Kontrollera att namn, recept och de relationella ingredienserna kommer från Sheet.
2. Ändra exempelvis kortnamn eller en mängd. Båda kortsidorna uppdateras cirka 600 ms efter sista ändringen utan export eller Google-skrivning.
   Klicka på en kortsida för att se den större. I den förstorade vyn kan du växla mellan fram- och baksida och stänga med Escape. **Visa tryckzoner** visar hela exportytan med tonad bleed-zon, trimgräns och safe area. Knapparna **Spara bild som PNG** och **Kopiera bild som PNG** följer visningen: utan zoner får du kortet beskuret vid trim, med zoner får du hela ytan inklusive markeringarna. Använd PNG-knapparna under **Tryckfiler** för rena filer som ska tryckas.
   Under **Inställningar** i sidomenyn kan du jämföra de tre framsidorna: semitransparent panel, text på bilden och svag lokal toning. Semitransparent panel är standardvalet. Inställningen gäller alla rätter, används också i PNG- och PDF-export och sparas i webbläsaren, utan ny kolumn i Google Sheet.
3. Välj **Spara i Sheet**. Läs om sidan eller kontrollera Google Sheet för att se att ändringen finns kvar.
4. Lägg till en förberedelse, fyll i typ, ledtid, tidpunktstyp och instruktion och spara. Kontrollera att en ny rad med M007 finns i `Rätt-förberedelser`. Testa även att ändra, inaktivera och ta bort raden. `Har förberedelser` i `Rätter` är en beräknad hjälpkolumn och uppdateras av Sheet när en aktiv förberedelse finns.
5. Exportera framsida, baksida eller A4 proof. Standardprofilen ger PNG i 822 × 1122 px och ett kort med 63 × 88 mm trim samt 3,175 mm utfall per sida. A4 proof placerar korten i faktisk fysisk storlek, på två sidor om en bred egen profil inte får plats sida vid sida; skriv ut i 100 %, utan sidanspassning.
6. Ladda upp en rättbild om M007 saknar bild. Den skickas till den konfigurerade Drive-mappen. Välj sedan **Spara i Sheet** för att koppla fil-ID till rätten.

## Sheet-format och beteende

### Veckoplan och inköpslista

Öppna **Veckoplan** i sidomenyn, välj en eller flera av rätterna och ställ in portioner för varje tillfälle. Samma rätt kan läggas till flera gånger med olika portionsantal. Under **Ingredienser och val** kan du välja råvara där receptet anger alternativ och slå på valfria ingredienser. För hamburgare växlar rå potatis och standardvalet frysta pommes automatiskt så att bara ett tillbehör hamnar i listan. **Visa inköpslistan** hoppar direkt till den summerade listan på mobil.

Inköpslistan omfattar alla valda recept och alla deras ingrediensrader. Gemensamma varor summeras när namn och enheter är jämförbara; g/kg och ml/cl/dl/l/msk/tsk kan räknas om. Hela enheter avrundas för varje recept före summering. Om arket har en entydig numerisk förpackningsstorlek visas ett beräknat antal förpackningar; annars visas behovet i receptets enhet tillsammans med inköpsenhet och inköpsnotering, utan gissat förpackningsantal. Varje vara visar vilka rätter mängden kommer från.

Veckoval och portionsantal sparas endast i den aktuella webbläsarens lokala lagring. Recept och ingrediensrelationer hämtas alltid från Google Sheet. Den gamla fliken `Veckoplan` och dess formler läses inte av den nya vyn och ändras inte. Veckoval synkas därför inte mellan enheter. Listan är ett planeringsunderlag; kontrollera skafferiet och faktiska förpackningsstorlekar inför inköp.

Appen läser flikarna `Rätter`, `Ingredienser`, `Rätt-ingredienser`, `Taggar` och `Rätt-förberedelser`. Kolumner kopplas via arkets faktiska rubriker. Den aktuella fliken `Rätt-förberedelser` behöver `Förberedelse-ID`, `Rätt-ID`, `Typ`, `Ledtid (min)`, `Tidpunktstyp`, `Instruktion`, `Villkor`, `Prioritet`, `Aktiv` och `Anteckning`. Valen i dess rullistor hämtas direkt från Sheets datavalidering. Appen skapar inga egna kolumner när valfria fält saknas. Okända kolumner ändras inte.

Varje förberedelse är en egen rad kopplad till rätten via `Rätt-ID`. Nya rader får ett ledigt förberedelse-ID; borttagna rader töms helt. Förberedelserna är separata från `Total tid (min)` och påverkar ännu inte kortlayouten. `Rätter.Har förberedelser` visas som skrivskyddat värde från Sheet och skrivs aldrig av appen. Taggar läses från `Rätter.Taggar` eller från fliken `Taggar`; när rätten saknar egen taggkolumn sparas de i `Taggar`. Bild-ID skrivs som Drive-länk i `Bildlänk`.

Sparning använder en revisionskontroll. Om någon ändrat rätten i Sheet sedan den öppnades får du ett konfliktfel och behöver ladda om. Nya ingredienser får nästa lediga ID med samma prefix och sifferbredd som registret. Ändringar i ingredienslistan skrivs till `Rätt-ingredienser`; borttagna relationer avaktiveras genom att ID-fälten töms. Google-data är alltid källa vid omladdning.

Kortens framsida och baksida byggs från samma SVG-funktion i preview och export. QR-koden innehåller rättens M-ID. Valideringen stoppar export när ingredienslistan eller instruktionen inte ryms och visar varningar för lång titel eller saknad bild. Personspecifik och fast mängd behålls mellan portionstalen; proportionell mängd skalas och `Hela enheter` avrundas uppåt.

## Tryckprofiler

Standard är **MakePlayingCards - 63 × 88 mm**: 3,175 mm bleed utanför trim och 3,175 mm safe area innanför trim, 300 DPI och 822 × 1122 px. Detta följer [MPC:s beskrivning av bleed och safe area](https://www.makeplayingcards.com/design/custom-blank-card.html) och deras [minsta bildstorlek för pokerkort](https://www.makeplayingcards.com/faq-photo.aspx). I **Inställningar → Tryckprofil** kan du välja standarden eller skapa **Egen profil** genom att ändra namn, trimstorlek, bleed, safe area, DPI och exportpixlar. Egna profiler sparas endast i webbläsaren och påverkar inte Google Sheet. Exportpixlar måste räcka för de fysiska måtten och vald DPI. På standardprofilen används MPC:s högre minimum.

Slutlig tryckexport innehåller aldrig tryckzoner eller skärlinjer. Med **Visa tryckzoner** av visar förhandsvisningen kortet beskuret vid trim, som färdig produkt. Med läget på visas hela exportytan inklusive bleed och markeringar. Preview-PNG sparar eller kopierar just det läget. Matbilden och bakgrunderna täcker hela exportytan. Textpanelen, texten och QR-rutan på framsidan placeras innanför safe area.

## Säker receptimport

Importen använder det aktuella Google Sheet som enda bestående receptkälla. Ett receptförslag är en tillfällig JSON-fil med `version: 1` och `recipes`, där varje rätt har namn, 4 basportioner, aktiv/total tid, fullständigt recept, kortrecept, taggar och ingredienser med mängd, enhet, skalning och avrundning. Alternativa råvaror anges som `alternatives` på en ingrediensrad. Förslagsfiler och rapporter måste ligga i den Git-ignorerade `.local/`-mappen; lägg inte recept, credentials eller bilder i Git.

Kör `npm run import:dry -- .local/import/recipes.json` för att läsa arket och skapa två lokala rapporter: en med varje föreslagen celländring och en läsbar receptsamling. Kommandot ändrar **ingenting** i Sheet eller Drive. Det matchar befintliga rätter på namn, tilldelar nya lediga M-ID:n först efter dubblettkontroll och återanvänder kända ingredienser. Om två olika rätter får en möjlig namnträff kan förslaget ange `distinctFrom: ["M005"]` efter manuell granskning; ett okänt ID eller en annan möjlig dubblett stoppar fortfarande importen. Befintliga ingrediensrelationer skyddas som standard. Med `mode: "replace"` på ett recept kan mängder och andra värden i relationerna uppdateras när ingrediensernas namn och ordning är desamma; borttagning och namnbyte kräver manuell granskning.

Först efter granskning kan en plan tillämpas med `npm run import:apply -- .local/import/recipes.json --confirm PLAN-ID`. Kommandot läser arket på nytt och kräver exakt samma plan-ID, skapar en säkerhetskopia av hela arket i Drive och en privat lokal snapshot innan det skriver. Saknade portionsformler på **nya tomma rader** tas med som egna celländringar i dry-run och kopieras från en befintlig formelmall med fasta referenser bevarade. Befintliga formler och andra ifyllda celler skrivs inte över. Därefter verifieras att samma import ger noll nya receptändringar. Bildimport ingår inte i detta flöde. `Kortrecept` läggs till som en kolumn i `Rätter` först vid en godkänd import; den befintliga appen visar då också ett separat redigeringsfält för kortversionen.

Källkoden finns på [github.com/Clox/matrik](https://github.com/Clox/matrik) och den lokala projektmappen heter `matrik`. En lokal kompatibilitetslänk från den tidigare sökvägen `matrika` kan finnas kvar för äldre verktygsinställningar. Google Cloud-projektets tekniska ID `matrika-514800` är oföränderligt; dess visningsnamn och OAuth-appens namn är Matrik.

Tallriksikonen används som favicon (`public/favicon.svg`) och som större märke i appen (`public/brand-mark.svg`). De tidigare ikonförslagen kan jämföras på `/favicon-ideas.html` när appen körs lokalt.

## Säkerhet och lokal data

`.env`, `credentials/`, `.local/`, exporter och bildfiler ignoreras av Git. API-servern lyssnar endast på loopback, och ändringar kräver en lokal CSRF-nyckel. OAuth-token sparas med filrättighet `0600`. Kör inte appen som en publik server. Kontrollera `git status` innan du committar och lägg aldrig in familjedata eller genererade kort manuellt.

## Tester

`npm test` provar Sheet-mappning inklusive förberedelser, mängdskalning, kortvalidering och PNG-rendering i tryckstorlek. `npm run build` kontrollerar frontend. Ett riktigt end-to-end-test mot Google kräver dina privata OAuth-uppgifter och tillgång till arket; de följer inte med repot.
