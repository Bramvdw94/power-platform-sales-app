# Een CRM bouwen als functioneel consultant, met Claude

> **Voor de PowerPoint-skill:** één `##` per dia. Per dia staan: **Op de dia** (maximaal 5 korte bullets), **Visual** (bestand in `afbeeldingen/`, of een omschrijving), **Spreektekst** en **Tijd**. Taal: Nederlands. Geen bedrijfsstijl in dit bestand; die komt uit de huisstijl-skill. Afbeeldingen zijn 1600x900 (diagrammen) of 1440x900 / 390x844 (schermen, 2x resolutie). De demovideo staat in `video/demo-sales-app.mp4`.

**Doel van de sessie:** de collega's onthouden één zin: *"Als functioneel consultant kun je een echte, geteste bedrijfsapp op Power Platform bouwen door zelf de beslissingen te nemen (specs, regels, prioriteiten), terwijl Claude de code schrijft."*

**Publiek:** Nederlandse Dynamics-consultants. Kennen D365 Sales en Power Platform goed, weinig kennis van Claude Code of code apps.

**Planning (totaal ca. 30 min):**

| # | Onderdeel | Minuten |
|---|---|---|
| 1-2 | Opening en de app in één blik | 2 |
| 3-4 | Werkwijze en skills (incl. 4b Matt Pocock) | 5 |
| 5-9 | Het proces (wayfinder, grilling, prototype, spec, issues, cirkel, voorbeeld) | 7 |
| 10 | Kwaliteit en tests | 2 |
| 11-13 | De app: techniek, v1, v2, v3 | 4 |
| 14-15 | Functioneel consultant + grenzen/kosten | 2 |
| 16 | Overgang naar demo | 0,5 |
| Demo | Live (of video) | 10 |
| 17 | Afsluiting en Q&A | 3 |

---

## 1. Titel: een Dynamics 365 Sales-alternatief, gebouwd door een consultant

**Op de dia**
- Een sales-app op Power Platform
- Gebouwd met Claude, aangestuurd door een functioneel consultant
- Wat werkte, wat niet, en hoe jullie het zelf kunnen proberen

**Visual:** `afbeeldingen/04-opportunity-process.png` als achtergrond of rechterhelft.

**Spreektekst:** Ik laat vandaag zien hoe ik in een paar weken een werkende sales-app heb gebouwd die lijkt op wat wij dagelijks implementeren in D365 Sales. Niet omdat het een product wordt, maar om uit te zoeken wat een functioneel consultant tegenwoordig zelf kan. Het gaat vooral over de werkwijze; de app is het bewijs.

**Tijd:** 1 min

---

## 2. Waarom dit project

**Op de dia**
- Doel: een alternatief voor D365 Sales
- Motivatie: lagere licentiekosten en een eenvoudigere UI
- Eerst voor mijn eigen team of één klant
- Oefenproject, maar met professionele standaarden
- Front-end: Power Apps code app. Data: Dataverse

**Visual:** `afbeeldingen/02-pipeline.png` (Pipeline-bord).

**Spreektekst:** D365 Sales is breed, maar voor een klein salesteam vaak zwaar en duur. Ik wilde weten hoe ver je komt met alleen Dataverse en een eigen front-end. Het is een oefenproject, maar ik behandel het alsof het ooit serieus wordt: nette architectuur, tests, vaste taal. "Oefenen" mag de lat niet verlagen.

**Tijd:** 1 min

---

## 3. Mijn werkwijze: telefoon, Claude Project, PC met Claude Code

**Op de dia**
- Telefoon: Claude-app voor beslissingen en voortgang
- Claude Project: een thread per taak, met geheugen
- PC met Claude Code: git, pac, pa, Dataverse CLI
- GitHub voor code, Issues en CI
- Ik beslis en review. Claude bouwt

**Visual:** `afbeeldingen/A-werkwijze.png`

**Spreektekst:** Het grootste deel doe ik vanaf mijn telefoon. In een Claude Project start ik per taak een thread: een onderzoek, een uitvraag of een bouwticket. Die threads onthouden beslissingen. Voor werk dat op mijn eigen omgeving moet draaien, zoals solutions importeren of deployen, gebruikt Claude een PC waarop Claude Code staat, met git, pac, pa en de Dataverse CLI al ingelogd. Ik zit dus niet de hele dag achter een scherm; ik krijg een melding als ik iets moet beslissen.

**Tijd:** 2 min

---

## 4. Skills: herbruikbare werkwijzen

**Op de dia**
- **Power Platform skills:** code apps, Power Automate, model-driven en canvas
- **Dataverse skills:** verbinden, metadata, data, security, solutions
- **Matt Pocock skills:** wayfinder, grilling, prototype, research, TDD, code review
- Een skill is een beschreven werkwijze voor Claude

**Visual:** `afbeeldingen/E-skills.png`

**Spreektekst:** Een skill is een instructie-pakket: "zo doe je dit". De Power Platform- en Dataverse-skills komen van Microsoft en kennen de CLI's en patronen, bijvoorbeeld hoe je een tabel aan een code app koppelt. De Matt Pocock-skills gaan over werkwijze: eerst vragen stellen, dan een plan, dan bouwen met tests. Die zijn niet specifiek voor software; je kunt ze ook voor andere beslissingen gebruiken.

**Tijd:** 2 min

---

## 4b. Matt Pocock: echte engineering, geen vibe coding

**Op de dia**
- *"De basis van goed software bouwen telt meer dan ooit."*
- Kleine, aanpasbare skills die met elk model werken; jij houdt de regie (anders dan Spec-Kit of BMAD)
- Vier problemen met AI-agents, elk met een fix uit een klassiek boek:

| Probleem | Fix | Bij ons |
|---|---|---|
| De agent doet niet wat ik wil (*Pragmatic Programmer*) | Grilling: de agent vraagt jou eerst uit | Wayfinder-kaart en grilling (issue #3) |
| De agent praat te veel (Evans, *Domain-Driven Design*) | Eén woordenlijst en vastgelegde keuzes | GLOSSARY.md, ADR 0001-0003 |
| De code werkt niet (*"The rate of feedback is your speed limit"*) | Types, tests eerst (TDD), kleine stappen | Ruim 40 testbestanden, CI bij elke PR |
| Een grote modderbal (Beck; Ousterhout, *A Philosophy of Software Design*) | Elke dag aan het ontwerp werken, diepe modules | SalesGateway tussen app en data |

**Visual:** tabel met lijnen (native in de PowerPoint). Bron: github.com/mattpocock/skills

**Spreektekst:** Matt Pocock is bekend als TypeScript-docent (Total TypeScript) en schrijft nu over werken met AI-agents (AI Hero). Zijn repo heet "Skills for real engineers": echte engineering, geen vibe coding. Hij zet zich af tegen frameworks die het hele proces overnemen. Hij gaat uit van vier dingen die steeds misgaan, en elk antwoord komt uit een klassiek boek. Voor consultants is de eerste het herkenbaarst: een klant weet ook nooit precies wat hij wil. Dat is gewoon uitvraag.

**Tijd:** 1 min

---

## 5. Stap 1: Wayfinder, een kaart van beslissingen

**Op de dia**
- Begint met het doel: "een bouwbare spec voor v1"
- Maakt een kaart (GitHub issue) met beslispunten als tickets
- Elk ticket is onderzoek, uitvraag of prototype
- Voortgang: welke vragen zijn nog open?

**Visual:** screenshot van GitHub issue #2 "Map: v1 sales app spec" (maak live of vooraf; de link: github.com/Bramvdw94/power-platform-sales-app/issues/2).

**Spreektekst:** Ik begon niet met bouwen maar met een kaart. Wayfinder zet het doel neer en splitst het op in beslispunten: wat is een Lead-status, wat gebeurt er bij Qualify, wie mag wat? Elk punt is een GitHub-ticket. Dat dwingt me om eerst te bedenken wat ik wil, in plaats van Claude maar iets te laten verzinnen. Voor v1 waren dat 14 beslispunten. Let op: Claude doet voorstellen, ik besluit.

**Tijd:** 1,5 min

---

## 6. Stap 2: Grilling, vragen met een aanbeveling

**Op de dia**
- Claude stelt genummerde vragen
- Bij elke vraag staat een aanbeveling
- Ik antwoord "ja" of pas aan
- Voorbeeld: de levenscyclus van een Lead (#3)

**Visual:** tabel uit de oplossing van issue #3 (maak er een dia van):

| Status | Betekenis |
|---|---|
| Not Contacted | Aangemaakt, nog niemand benaderd |
| Working | Owner is in gesprek, beoordeelt de fit |
| Qualified | Qualify maakte een Opportunity. Definitief |
| Disqualified | Afgesloten zonder deal. Kan heropend worden |

Daarnaast: reden bij disqualify uit een vaste lijst (No budget, No need, Can't reach them, Chose a competitor, Duplicate, Other).

**Spreektekst:** Deze sessie is eigenlijk net als een goed intakegesprek. Claude vraagt: welke statussen, welke overgangen, wat leg je vast bij disqualify, mag je heropenen? Bij elke vraag geeft het een aanbeveling, in dit geval gebaseerd op de standaard-statussen van Salesforce. Ik hoefde vaak alleen "ja" te zeggen of een detail aan te passen. Zo zijn beslissingen snel genomen en blijven ze vastgelegd in het ticket. Dat is precies wat wij als consultants ook doen, alleen nu met een gesprekspartner die alles uitwerkt.

**Tijd:** 1,5 min

---

## 7. Stap 3: Prototype, drie varianten om uit te kiezen

**Op de dia**
- Voor schermen: eerst een prototype, dan pas bouwen
- Meestal drie varianten (A, B, C)
- Ik kies, of combineer: bij Forecast werd het variant D
- Prototypes worden nooit gemerged

**Visual:** `afbeeldingen/05-forecast.png` en `afbeeldingen/06-forecast-team.png` (het gekozen resultaat), plus een beschrijving van de varianten.

**Spreektekst:** Bij schermen is praten niet genoeg. Claude bouwt dan een prototype in de echte app, in het geheugen, met drie varianten naast elkaar. Voor de Forecast-pagina vond ik alle drie mooi en koos ik een combinatie. Ook voor de offerte-PDF bouwde Claude een prototype, en daar bedacht ik zelf een sjabloon-builder met drag-and-drop bij. Belangrijk: elk prototype wordt ook gecontroleerd in lichte en donkere modus, want formuliervelden waren in donkere modus in het begin onleesbaar.

**Tijd:** 1,5 min

---

## 7b. Visual: wat een prototype oplevert (optioneel, bij weinig tijd overslaan)

**Op de dia**
- Dezelfde app, twee thema's
- Lichte en donkere modus gecontroleerd op leesbaarheid

**Visual:** `afbeeldingen/04-opportunity-process.png` naast `afbeeldingen/12-dark-opportunity.png`

**Spreektekst:** Dit is dezelfde pagina in licht en donker. Dit soort feedback ("controleer dit voortaan altijd") sla ik op in het projectgeheugen, zodat elke volgende thread het meeneemt.

**Tijd:** 0,5 min (optioneel)

---

## 8. Stap 4: Spec en Issues, het hele proces is een cirkel

**Op de dia**
- Wayfinder → onderzoek, grilling, prototype → **spec** → **issues** → bouwen → deploy
- Per versie opnieuw: v1, v2, v3
- Spec = een GitHub issue met user stories
- Bouwtickets zijn sub-issues met afhankelijkheden

**Visual:** `afbeeldingen/B-proces-cirkel.png`

**Spreektekst:** Als alle beslispunten dicht zijn, schrijft Claude een spec: een issue met het probleem, de oplossing en user stories. Daaruit komen bouwtickets. Voor v1 waren dat 12 tickets, voor v2 ongeveer 16, en voor v3 staan er 32 klaar. Elk ticket krijgt zijn eigen thread, wordt gebouwd, getest en gedeployed. Daarna begint de cirkel opnieuw met een nieuwe kaart voor de volgende versie. De volgorde van tickets staat vast door "blocked by"-regels, dus ik hoef geen planning bij te houden.

**Tijd:** 1,5 min

---

## 8b. Voorbeeld: van kaart tot code, één spoor door GitHub

**Op de dia** (echte issues uit v1)
1. **Kaart** `/wayfinder`: #2 "Map: v1 sales app spec", met 14 beslispunten als sub-issues
2. **Beslispunten** `/grill-with-docs`, `/prototype`, `/research`: #3 grilling (status van een Lead), #7 prototype (pipelinebord), #8 research (Dataverse-security), #12 task (check in de omgeving)
3. **Spec** `/to-spec`: #23 "Spec: v1 sales app", geschreven uit de 14 gesloten beslispunten
4. **Bouwtickets** `/to-tickets`: #24 t/m #35 als sub-issues van #23, waaronder #31 "Build: Qualify"
5. **Code**: PR #49 bouwt Qualify en sluit #31

**Hoe het vastzit:** sub-issue van de kaart → besluit als comment in #3 en woordenlijst bijgewerkt → spec verwijst terug ("from the Lead lifecycle decision #3") → "Part of #23" → PR sluit het ticket.

**Visual:** vijf kolommen met pijlen (native in de PowerPoint).

**Spreektekst:** Laat ik één spoor volgen. Wayfinder maakt kaart #2 met alle open vragen. Bij #3 vroeg Claude hoe een Lead van nieuw naar gekwalificeerd gaat; mijn besluit staat als comment in het issue. Als alle 14 dicht zijn, schrijft /to-spec issue #23, en daarin staat letterlijk "from the Lead lifecycle decision #3". /to-tickets knipt de spec in bouwtickets; #31 is Qualify. Pull request #49 bouwt het en sluit het ticket. Vraagt een klant "waarom werkt Qualify zo?", dan klik ik van de code terug naar mijn besluit.

**Tijd:** 1 min

---

## 9. Het Matt Pocock-proces in het kort

**Op de dia**
1. Eerst begrijpen: research en grilling
2. Dan zien: prototype
3. Dan vastleggen: spec en issues
4. Dan bouwen: tests eerst (TDD), kleine stappen
5. Vaste taal: GLOSSARY.md en ADR's

**Visual:** screenshot van de repo-map: `GLOSSARY.md`, `docs/adr/`, `docs/agents/` (maak live), of tekstblok met de drie ADR-titels:
- 0001 Process engine: plug-in plus app-evaluatie
- 0002 Decision rules roepen Jev aan na het opslaan
- 0003 Approvals in een eigen tabel

**Spreektekst:** De kern: neem beslissingen vóór je bouwt, leg ze vast, en bouw in kleine, geteste stappen. De glossary is mijn favoriet: "Opportunity", niet "Deal" of "Sale". Elke thread leest hem, dus Claude gebruikt overal dezelfde woorden. Grote keuzes, zoals hoe de proces-engine draait, staan als ADR in de repo, met het waarom erbij.

**Tijd:** 1 min

---

## 10. Codekwaliteit en tests, een gevolg van dit proces

**Op de dia**
- Eén naad: de `SalesGateway` met een in-memory twin
- Pagina's getest zonder Dataverse
- Pure regels apart, ook C#-plug-in tests
- Rechten gecontroleerd als verschillende gebruikers
- CI: lint, typecheck en tests bij elke pull request

**Visual:** `afbeeldingen/D-kwaliteit.png`

**Spreektekst:** Omdat de spec vooraf beschrijft wat de app moet doen, kan Claude eerst een test schrijven en daarna de code. De app praat met data via één interface; in de tests zit daar een geheugenversie achter. Daardoor draait de hele app ook zonder omgeving, en dat gebruik ik straks voor de demovideo. In de repo staan ruim 40 testbestanden voor de app en een apart testproject voor de plug-ins. Voor beveiliging draaien check-scripts als Megan, Adele en Diego om te zien dat iedereen precies ziet wat hij mag zien.

**Tijd:** 2 min

---

## 11. De app en de techniek

**Op de dia**
- Power Apps code app: React, Vite, TypeScript, Tailwind
- Data in Dataverse: Account en Contact standaard, de rest eigen tabellen (prefix `vibe_`)
- Eén unmanaged solution "SalesApp"
- Eén generieke plug-in voor processen en business rules
- Desktop én telefoon, geen native app

**Visual:** `afbeeldingen/F-app-architectuur.png` en `afbeeldingen/10-phone-pipeline.png`

**Spreektekst:** Een code app is een gewone webapp in je eigen code, met Power Platform voor login, connectors en hosting. Voor ons is het interessant omdat je de volledige UI-vrijheid hebt, maar nog steeds op Dataverse en Entra-beveiliging draait. Let op: elke gebruiker heeft Power Apps Premium of een per-app licentie nodig. Dat is dus niet gratis, maar wel zonder D365 Sales-licentie.

**Tijd:** 1,5 min

---

## 12. Wat is er gebouwd: v1 en v2

**Op de dia**
- **v1:** Accounts, Contacts, Leads, Opportunities, Qualify, Pipeline-bord, activiteiten, beveiligingsrol
- **v2:** Proces-engine, business rules builder, Account-rollup, producten en offertes (PDF), dashboards en forecast
- Beide gedeployed in dev-salesapp
- Alles bijgehouden in GitHub Issues

**Visual:** `afbeeldingen/C-versies.png`

**Spreektekst:** v1 is de basis van elke sales-tool: leads, qualify, opportunities, een pipeline-bord en activiteiten, met één rol en een managerhiërarchie. v2 voegt de dingen toe waar D365 Sales sterk in is: een proces-engine met stappen en checks die managers zelf bouwen, business rules, producten met offertes en PDF-sjablonen, en een forecast met quota. Dat zie ik straks in de demo.

**Tijd:** 1,5 min

---

## 13. Gepland: v3, met Jev en Mistral

**Op de dia**
- Outlook en Teams (mail en afspraken, notificaties)
- Gebruiksgemak: opgeslagen views, import, verwijderen, duplicaten
- Proces-engine ronde 2: Approvals en **Decision rules met Jev**
- Forecast-diepgang, web lead capture, kortingen en Orders
- **AI-assist met Mistral:** samenvattingen en conceptmails
- Geen betaalde Azure: de dev-tenant heeft geen krediet

**Visual:** `afbeeldingen/C-versies.png` (rechterkolom) of tekst-dia.

**Spreektekst:** v3 staat als spec klaar (issue #168), met 32 bouwtickets. Twee dingen wil ik uitlichten. Jev is een goedkoop model dat alleen beslissingen neemt: "hoe heet is deze webshop-lead?", met een vast antwoord. Het draait na het opslaan en kan acties starten, en een mens kijkt mee als het onzeker is. Mistral schrijft: samenvatting van een account, concept-opvolgmail, voorstel voor de volgende stap. Beide alleen op verzoek. Waarom deze twee? De dev-tenant heeft geen Azure-krediet en ik koppel geen creditcard, dus het moet gratis of zeer goedkoop zijn. Jev kost ongeveer 0,006 cent per call ($0,042 per miljoen input-tokens, ca. 1.500 tokens per beslissing): 1.000 beslissingen per maand is zo'n 6 cent. Voor Mistral is er een gratis API-key, zonder creditcard. Let op: gratis verzoeken mag Mistral gebruiken om te trainen, dus alleen testdata. Een Test/Prod-pipeline staat bewust niet in v3.

**Tijd:** 1,5 min

---

## 14. Zo kan het ook als functioneel consultant

**Op de dia**
- Ik schrijf geen code; ik neem beslissingen
- Mijn gereedschap: vragen beantwoorden, schermen kiezen, specs lezen
- Eigen domeinkennis is de bottleneck, niet de techniek
- Review blijft mijn werk: klopt dit met hoe sales werkt?

**Visual:** tekst-dia met drie kolommen: *Wat ik doe* / *Wat Claude doet* / *Wat we samen doen*.

| Ik | Claude | Samen |
|---|---|---|
| Doel en scope | Onderzoek en alternatieven | Spec |
| Kiezen uit varianten | Prototypes en code | Review |
| Acceptatie | Tests en deploy | Demo en bijsturen |

**Spreektekst:** Het verrassende: de techniek is niet de bottleneck. Wat ik als consultant altijd al deed, zoals goede vragen stellen, scope bewaken en keuzes afwegen, is nu juist het werk. Ik controleer ook veel: bij elke deploy test ik met de demo-gebruikers.

**Tijd:** 1 min

---

## 15. Eerlijk: grenzen, kosten en risico's

**Op de dia**
- Claude kan fout zitten: tests en review blijven nodig
- Alleen dev-tenant, geen Test/Prod of pipeline
- Licenties: gebruikers hebben Power Apps Premium nodig
- AI-kosten: Jev een fractie van een cent per call, Mistral gratis met limieten
- Geen echte klantdata in dit project

**Visual:** geen of een simpele tabel.

**Spreektekst:** Dit is geen product. Het draait in één ontwikkelomgeving, zonder acceptatie en productie, en dat is een bewuste keuze voor deze fase. De app is niet bedoeld om klanten van D365 weg te halen. Wel heb ik in het proces veel geleerd over wat wel en niet werkt: zonder duidelijke spec bouwt Claude iets plausibels maar onjuists, met een spec en tests werkt het verrassend goed.

**Tijd:** 1 min

---

## 16. Overgang naar de demo

**Op de dia**
- Demo ongeveer 10 minuten
- Ingelogd als systeembeheerder in de live app (dev-salesapp)
- Voorbeelddata is fictief
- Plan B: dezelfde app in geheugenmodus, of de opgenomen video

**Visual:** `afbeeldingen/01-home.png`

**Spreektekst:** Ik laat nu de app zien. Alle data is fictief. Als de verbinding hapert, heb ik een versie die zonder omgeving draait en een opgenomen video.

**Tijd:** 0,5 min

---

# Demo (10 min)

**Voorbereiding:** de video `video/demo-sales-app.mp4` (ca. 1:50, met bijschriften en gemarkeerde elementen) is opgenomen op de app in geheugenmodus met fictieve data. Hij kan als plan B worden afgespeeld, of als intro (2 min) voordat je live gaat. Live demo's draaien tegen dev-salesapp of lokaal met `npm run dev:memory`.

| Min | Stap | Wat je laat zien | Wat je zegt |
|---|---|---|---|
| 0-1 | **Home** | "My work": taken, deals, KPI-tegels | "Dit ziet een verkoper bij het openen." |
| 1-2 | **Pipeline** | Bord en Funnel, gewogen waarde, sleep een kaart | "Net als in D365, maar lichter." |
| 2-4 | **Opportunity met proces** | Procesbalk, Key fields, "To move on", Guidance | "De manager bepaalt per stap wat nodig is." |
| 4-5 | **Business rule** | Waarschuwing "Next step is empty", vul in, weg | "Geen code: de manager bouwde deze regel zelf." |
| 5-6 | **Automation** | Processes en Business rules tabs | "Hier bouwt de manager ze." |
| 6-7 | **Offerte** | Producten, Quote templates, PDF-voorbeeld | "Eigen sjablonen, met drag-and-drop-blokken." |
| 7-8 | **Forecast** | Maand/kwartaal, Team, Quotas | "Commit, Best case en quota per verkoper." |
| 8-9 | **Beveiliging** | Wissel naar Adele (alleen eigen deals bewerken) en Diego (buiten het team) | "Iedereen leest, owner en manager bewerken." |
| 9-10 | **Teaser v3** | Een prototype van de Decision rule editor of de e-mail/Teams UI | "Dit is wat er nu aankomt." |

**Verwijs ook naar GitHub:** open 1 minuut issue #2 (kaart), #168 (spec v3) en een bouwticket, zodat men het papieren spoor ziet.

**Als iets misgaat:** zeg "dat is precies waarom er tests zijn", herlaad of speel de video af.

---

## 17. Wat nu? Probeer het zelf

**Op de dia**
1. Kies een klein probleem uit je eigen werk
2. Laat Claude je uitvragen (grilling), nog zonder te bouwen
3. Laat een prototype maken en kies
4. Schrijf de spec, bouw per ticket
5. Controleer altijd zelf met testgebruikers

**Visual:** `afbeeldingen/B-proces-cirkel.png` (klein) + QR/link naar de repo: github.com/Bramvdw94/power-platform-sales-app

**Spreektekst:** Wil je dit proberen? Begin klein. Je hoeft geen code te kunnen, maar wel te weten wat je wilt. Ik help graag met een eerste grilling-sessie.

**Tijd:** 2 min, daarna Q&A

---

## Q&A: verwachte vragen

- **Wat kost dit?** Claude-abonnement, Power Apps-licenties voor gebruikers en bijna niets aan AI: Jev ongeveer $0,00006 per call, Mistral via een gratis API-key. Geen Azure-abonnement.
- **Is dit veilig voor klantdata?** Nu alleen fictieve data. Voor echte data: rechten in Dataverse, secrets in plug-in-configuratie, verwerkersovereenkomst voor AI.
- **Waarom geen D365 Sales?** Dit is een experiment; D365 Sales heeft veel meer.
- **Kan een klant dit gebruiken?** Mogelijk, maar met Test/Prod, ALM en support nog niet.
- **Hoeveel tijd kostte het?** Zeg hier je eigen inschatting; ik heb dat niet gemeten.

---

## Bijlage: bestandsoverzicht

| Bestand | Gebruik |
|---|---|
| `afbeeldingen/A-werkwijze.png` | Dia 3 |
| `afbeeldingen/E-skills.png` | Dia 4 |
| `afbeeldingen/B-proces-cirkel.png` | Dia 8, 17 |
| `afbeeldingen/D-kwaliteit.png` | Dia 10 |
| `afbeeldingen/F-app-architectuur.png` | Dia 11 |
| `afbeeldingen/C-versies.png` | Dia 12-13 |
| `afbeeldingen/01-home.png` ... `12-dark-opportunity.png` | Schermafbeeldingen van de app (geheugenmodus, fictieve data) |
| `video/demo-sales-app.mp4` | Demovideo met bijschriften, ca. 1:50 |
| `video/maak-demovideo.mjs` | Script waarmee de video is opgenomen (Playwright), herbruikbaar |
