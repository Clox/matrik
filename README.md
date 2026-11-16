# Matrika

Lokal webbapp för familjens recept i Google Sheets och tryckbara matkort. Google Sheet är datakällan. Appen lagrar endast OAuth-token lokalt i `.local/token.json` och lägger inte recept, bilder eller exporter i repot.

## Kom igång (Linux)

Kräver Node.js 22 eller senare och ett Google-konto med åtkomst till receptarket och bildmappen.

1. Skapa ett projekt i [Google Cloud Console](https://console.cloud.google.com/). Aktivera **Google Sheets API** och **Google Drive API**.
2. Konfigurera OAuth consent screen. Vid testläge: lägg till ditt Google-konto som testanvändare.
3. Skapa en OAuth-klient av typen **Web application**. Lägg till exakt `http://127.0.0.1:4173/auth/callback` som authorized redirect URI. Google accepterar loopback för lokal utveckling.
4. Kopiera `.env.example` till `.env`. Fyll i `GOOGLE_SPREADSHEET_ID` och `GOOGLE_DRIVE_FOLDER_ID` från adresserna till ditt ark och din bildmapp. Fyll i `GOOGLE_CLIENT_ID` och `GOOGLE_CLIENT_SECRET`. Alternativt kan du lägga nedladdad OAuth JSON i `credentials/` och ange dess absoluta sökväg med `GOOGLE_CREDENTIALS_FILE`.
5. Kör:

```bash
npm install
npm run dev
```

Öppna Vite-adressen som visas i terminalen (normalt `http://127.0.0.1:5173`), välj **Logga in med Google** och godkänn Sheets/Drive-åtkomst. Om 5173 används väljer Vite nästa lediga port. API-servern körs bara på `127.0.0.1:4173`. För en färdig lokal byggning: `npm run build && npm start`, öppna sedan `http://127.0.0.1:4173`.

## Första kontrollen med M007

1. Öppna **M007 Tacos** i receptlistan. Kontrollera att namn, recept och de relationella ingredienserna kommer från Sheet.
2. Ändra exempelvis kortnamn eller en mängd. Båda kortsidorna uppdateras cirka 600 ms efter sista ändringen utan export eller Google-skrivning.
   Klicka på en kortsida för att se den större. I den förstorade vyn kan du växla mellan fram- och baksida och stänga med Escape.
3. Välj **Spara i Sheet**. Läs om sidan eller kontrollera Google Sheet för att se att ändringen finns kvar.
4. Lägg till en förberedelse, fyll i typ, ledtid, tidpunktstyp och instruktion och spara. Kontrollera att en ny rad med M007 finns i `Rätt-förberedelser`. Testa även att ändra, inaktivera och ta bort raden. `Har förberedelser` i `Rätter` är en beräknad hjälpkolumn och uppdateras av Sheet när en aktiv förberedelse finns.
5. Exportera framsida, baksida eller A4 proof. PNG är 815 × 1110 px (69 × 94 mm vid 300 dpi). A4 proof placerar korten i faktisk fysisk storlek; skriv ut i 100 %, utan sidanspassning.
6. Ladda upp en rättbild om M007 saknar bild. Den skickas till den konfigurerade Drive-mappen. Välj sedan **Spara i Sheet** för att koppla fil-ID till rätten.

## Sheet-format och beteende

Appen läser flikarna `Rätter`, `Ingredienser`, `Rätt-ingredienser`, `Taggar` och `Rätt-förberedelser`. Kolumner kopplas via arkets faktiska rubriker. Den aktuella fliken `Rätt-förberedelser` behöver `Förberedelse-ID`, `Rätt-ID`, `Typ`, `Ledtid (min)`, `Tidpunktstyp`, `Instruktion`, `Villkor`, `Prioritet`, `Aktiv` och `Anteckning`. Valen i dess rullistor hämtas direkt från Sheets datavalidering. Appen skapar inga egna kolumner när valfria fält saknas. Okända kolumner ändras inte.

Varje förberedelse är en egen rad kopplad till rätten via `Rätt-ID`. Nya rader får ett ledigt förberedelse-ID; borttagna rader töms helt. Förberedelserna är separata från `Total tid (min)` och påverkar ännu inte kortlayouten. `Rätter.Har förberedelser` visas som skrivskyddat värde från Sheet och skrivs aldrig av appen. Taggar läses från `Rätter.Taggar` eller från fliken `Taggar`; när rätten saknar egen taggkolumn sparas de i `Taggar`. Bild-ID skrivs som Drive-länk i `Bildlänk`.

Sparning använder en revisionskontroll. Om någon ändrat rätten i Sheet sedan den öppnades får du ett konfliktfel och behöver ladda om. Nya ingredienser får nästa lediga ID med samma prefix och sifferbredd som registret. Ändringar i ingredienslistan skrivs till `Rätt-ingredienser`; borttagna relationer avaktiveras genom att ID-fälten töms. Google-data är alltid källa vid omladdning.

Kortens framsida och baksida byggs från samma SVG-funktion i preview och export. QR-koden innehåller rättens M-ID. Valideringen stoppar export när ingredienslistan eller instruktionen inte ryms och visar varningar för lång titel eller saknad bild. Personspecifik och fast mängd behålls mellan portionstalen; proportionell mängd skalas och `Hela enheter` avrundas uppåt.

## Säkerhet och lokal data

`.env`, `credentials/`, `.local/`, exporter och bildfiler ignoreras av Git. API-servern lyssnar endast på loopback, och ändringar kräver en lokal CSRF-nyckel. OAuth-token sparas med filrättighet `0600`. Kör inte appen som en publik server. Kontrollera `git status` innan du committar och lägg aldrig in familjedata eller genererade kort manuellt.

## Tester

`npm test` provar Sheet-mappning inklusive förberedelser, mängdskalning, kortvalidering och PNG-rendering i tryckstorlek. `npm run build` kontrollerar frontend. Ett riktigt end-to-end-test mot Google kräver dina privata OAuth-uppgifter och tillgång till arket; de följer inte med repot.
