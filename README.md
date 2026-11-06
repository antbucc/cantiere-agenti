# AIM-PRO Lab

Strumento del progetto europeo AIM-PRO (*AI Literacy for Multidisciplinary Professional Readiness and Outreach*).

Strumento di lavoro per le Task Force del corso di due giornate su AI literacy e agenti AI.
Ogni gruppo compila, capitolo per capitolo, la propria parte di un libro collettivo di casi d'uso;
il docente vede tutti i gruppi, gestisce la lavagna e scarica il libro intero.

- **Backend:** Node.js + Express + SQLite (better-sqlite3)
- **Frontend:** HTML/CSS/JS vanilla, nessun build step
- **Tempo reale:** Server-Sent Events; salvataggio automatico con JSON merge patch a livello di campo

## Installazione

Serve Node.js 18.17 o successivo (consigliato 20 o 22).

```bash
npm install
cp .env.example .env      # poi modificate i codici!
npm run seed              # facoltativo: crea la Task Force "Esempio · Onboarding"
npm start
```

Aprite http://localhost:3000 e inserite il codice del corso.

## Avvio in aula (rete locale)

1. Collegate il portatile alla stessa rete Wi-Fi degli studenti.
2. `npm start`: il terminale mostra gli indirizzi, per esempio `rete locale: http://192.168.1.23:3000`.
3. Scrivete alla lavagna (o proiettate) l'indirizzo e il **codice del corso**.
4. Se il sistema operativo lo chiede, consentite a Node di accettare connessioni in entrata.

Note pratiche:

- Se la porta 3000 è occupata: `PORT=3100 npm start`.
- Alcune reti (eduroam, Wi-Fi per ospiti) isolano i dispositivi tra loro: in quel caso usate l'hotspot del telefono o un piccolo router.
- I font (Poppins, Roboto Mono) arrivano da Google Fonts. Senza internet l'app funziona lo stesso, con i font di sistema.
- Ogni gruppo può lavorare da più computer insieme: i campi si salvano dopo 800 ms di pausa, e gli altri vedono le modifiche in pochi istanti. Due persone che scrivono nello **stesso** campo nello stesso momento vedranno vincere l'ultima che salva. Campi diversi non si sovrascrivono mai.

## Deploy su Railway

Il repository contiene un `Dockerfile` e un `railway.json`: Railway costruisce l'immagine con Docker invece di Railpack.
Così il build non scarica strumenti da GitHub, che a volte risponde con errori 504, e l'immagine include LaTeX per il PDF.

1. **New Project → Deploy from GitHub repo** → scegliete questo repository.
2. **Variables** del servizio:
   - `CODICE_CORSO` e `CODICE_DOCENTE`: **obbligatorie**, senza l'app non parte;
   - `SEED_ESEMPIO=1`: facoltativa, crea la Task Force di esempio al primo avvio (solo se il database è vuoto);
   - `WITH_LATEX=0`: facoltativa, immagine più leggera e build più veloce, senza PDF sul server (resta l'export per Overleaf).
3. **Volume:** aggiungete un Volume al servizio, montato per esempio su `/data`. L'app lo trova da sola
   (`RAILWAY_VOLUME_MOUNT_PATH`) e ci mette il database. **Senza Volume i dati si cancellano a ogni deploy**:
   nel log compare un avviso.
4. **Networking → Generate Domain** per avere l'indirizzo pubblico (HTTPS).
5. Tenete **una sola replica**: database SQLite ed eventi in tempo reale stanno in un solo processo.

Il primo build richiede qualche minuto, perché installa TeX Live, e compila il libro di esempio per verificare che LaTeX funzioni.
L'healthcheck è su `/salute`.

**Guida socratica con Claude (Anthropic).** La via più veloce e affidabile, anche su Railway: basta la chiave API.

```
ANTHROPIC_API_KEY=sk-ant-...
```

La guida usa allora `claude-opus-5-5` (cambiabile con `CLAUDE_MODEL`) tramite l'SDK ufficiale, in streaming, con:
- `effort` basso (`CLAUDE_EFFORT=low`): per un tutor in chat conta la rapidità;
- il prompt di sistema in cache, quindi le richieste successive costano meno;
- il ripiego automatico (`fallbacks: "default"`): se il modello declina una richiesta per i suoi filtri di sicurezza,
  il server la rifà con il modello consigliato.

Le regole della guida e i controlli che la rendono non risolutiva sono gli stessi degli altri modelli. **Attenzione:** con Claude
i testi su cui lavora la guida (scenario, campo attivo, conversazione) vengono inviati ad Anthropic. Ditelo agli studenti, e
ricordate loro di non scrivere dati personali reali. Claude ha la precedenza su Ollama; con `SOCRATICO_PROVIDER=openai`
si torna a Ollama. Le «Bozze con AI» continuano a usare l'endpoint compatibile OpenAI (`AI_BASE_URL`), se c'è.

**Guida socratica su Railway con un modello open: la via più semplice (Ollama integrato).**
L'immagine dell'app contiene già Ollama (solo CPU). Basta **una variabile** nel servizio dell'app:

```
MODELLO_INTEGRATO=qwen2.5:7b
```

Al riavvio l'app:
1. avvia Ollama al proprio interno;
2. scarica il modello (4,7 GB, qualche minuto la prima volta) nel **Volume** dell'app, se ha almeno 6 GB liberi;
   altrimenti lo scarica sul disco del container, e lo riscarica a ogni riavvio;
3. lo carica in memoria;
4. si collega da sola, con `AI_BASE_URL`, `AI_MODEL` e `SOCRATICO_PROFILO=leggero` impostati in automatico.

Potete seguire l'avanzamento su **`https://<vostro-dominio>/salute`**:
`"fase": "download", "progresso": 45` … poi `"fase": "pronto"`. Fino ad allora la guida risponde in modalità di base.

Servono circa **8 GB di RAM** per il servizio. Se Ollama si ferma più volte, `/salute` lo segnala: di solito vuol dire che la RAM
non basta. Nel log del servizio le righe che iniziano con `[ollama]` raccontano cosa succede.

**In alternativa, un servizio Ollama separato.** La cartella [ollama/](ollama/) contiene un secondo servizio: Ollama con
`qwen2.5:7b`, raggiungibile solo dall'app sulla rete privata. È più pulito, perché app e modello si riavviano in modo
indipendente, ma richiede più configurazione:

1. Nel progetto: **+ Create → GitHub Repo** → lo stesso repository. Rinominate il servizio **`Ollama`**.
2. Nel servizio Ollama, **Settings**: Root Directory `/ollama`; Railway config file `/ollama/railway.json`;
   nessun dominio pubblico; almeno 8 GB di RAM; un Volume su `/root/.ollama` è facoltativo.
3. Nel servizio **dell'app**, **Variables** (senza `MODELLO_INTEGRATO`):
   ```
   AI_BASE_URL=http://${{Ollama.RAILWAY_PRIVATE_DOMAIN}}:11434/v1
   AI_MODEL=qwen2.5:7b
   SOCRATICO_PROFILO=leggero
   ```
4. Nel log del servizio Ollama aspettate `Ollama pronto con: qwen2.5:7b`.

**Cosa aspettarsi.** Su CPU, con il profilo `leggero` (prompt corto, stesse regole), una risposta richiede circa 10–30 secondi
(misurato solo CPU su un Mac M3; le vCPU di Railway possono essere più lente). Ollama risponde a un gruppo alla volta.
Il 7B scrive in un italiano meno curato del 14B: i controlli che rendono la guida non risolutiva sono gli stessi
e non dipendono dal modello.

| Opzione | Dove gira | Velocità | Qualità |
| --- | --- | --- | --- |
| `qwen2.5:14b`, profilo `completo` | Ollama sul portatile del docente (GPU), app in rete locale | 20–30 s | la migliore |
| `qwen2.5:7b`, profilo `leggero` | Ollama su Railway (integrato o servizio separato, CPU) | 10–30 s, un gruppo alla volta | buona |
| `llama3.2:3b`, profilo `leggero` | come sopra, con meno RAM | 5–15 s | sconsigliato: sbaglia i pareri |


## Server Linux dietro reverse proxy

```bash
HOST=127.0.0.1 PORT=3000 npm start      # oppure con systemd/pm2
```

Esempio nginx (anche sotto un sotto-percorso: tutti gli URL dell'app sono relativi):

```nginx
location /cantiere/ {
    proxy_pass http://127.0.0.1:3000/;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffering off;            # necessario per gli eventi in tempo reale (SSE)
    proxy_read_timeout 1h;
}
```

Servite il sito in HTTPS: i codici viaggiano negli header delle richieste.

## Variabili d'ambiente (`.env`)

| Variabile | Predefinito | Significato |
| --- | --- | --- |
| `CODICE_CORSO` | — (obbligatoria) | Codice che gli studenti inseriscono una volta; resta salvato nel loro browser |
| `CODICE_DOCENTE` | — (obbligatoria) | Codice per la lavagna, per eliminare Task Force e scaricare il libro intero. Vale anche come codice del corso |
| `PORT` | `3000` | Porta |
| `HOST` | `0.0.0.0` | Indirizzo di ascolto (`127.0.0.1` dietro un reverse proxy) |
| `DB_FILE` | `./data/cantiere.sqlite` (su Railway con Volume: `<volume>/cantiere.sqlite`) | File del database |
| `SEED_ESEMPIO` | — | `1` crea la Task Force di esempio all'avvio, solo se il database è vuoto |
| `AI_BASE_URL` | — | Attiva la Guida socratica e «Bozza con AI»: endpoint compatibile OpenAI, es. `http://localhost:11434/v1` (Ollama) |
| `AI_MODEL` | — | Nome del modello, es. `qwen2.5:14b` |
| `AI_API_KEY` | — | Facoltativa, per endpoint che la richiedono |
| `AI_TIMEOUT_MS` | `90000` | Tempo massimo di attesa della bozza |

I codici restano sul server: il frontend non li contiene. Ognuno li digita e il suo browser li ricorda.
Per far uscire tutti, cambiate `CODICE_CORSO` e riavviate.

### Bozza con AI (facoltativa)

Con `AI_BASE_URL` e `AI_MODEL` impostate, compare il pulsante **✨ Bozza con AI** su personas e user stories.
Il server manda al modello il contesto dello scenario e chiede un JSON con i campi della scheda.
**I campi già compilati non vengono sovrascritti.** Dopo l'uso compare il campo
«Cosa avete cambiato rispetto alla bozza», che finisce anche nell'export.

```bash
ollama pull llama3.2
AI_BASE_URL=http://localhost:11434/v1 AI_MODEL=llama3.2 npm start
```

## Backup del database

Tutti i dati stanno in `data/cantiere.sqlite`, più due file temporanei `-wal` e `-shm`.

- **Con il server fermo:** copiate la cartella `data/`.
- **Con il server acceso** (copia coerente):
  ```bash
  sqlite3 data/cantiere.sqlite ".backup 'backup-$(date +%F-%H%M).sqlite'"
  ```
  Su Linux potete metterlo in un cron ogni ora durante il corso.
- **Ripristino:** fermate il server, sostituite `data/cantiere.sqlite` con il backup, cancellate i file `-wal` e `-shm`, riavviate.

Anche l'export Markdown del libro intero è un buon backup leggibile: scaricatelo a fine giornata.

## Esportare: PDF, LaTeX per Overleaf, Markdown

Il libro mette in testa **agenti e workflow**:

| Parte | Contenuto |
| --- | --- |
| **I · Catalogo degli agenti** | Una scheda per ogni agente di ogni Task Force: ruolo, precondizioni, effetti, regole, modello, prompt corrente e storia delle versioni; in quali workflow è usato (anche da altre Task Force) |
| **II · I workflow** | Un capitolo per workflow: diagramma (TikZ nel PDF, Mermaid nel Markdown), come funziona passo per passo con i rimandi alle schede, verifica del grafo, risposte alle domande del progettista |
| **III, IV, … · Le Task Force** | Una parte per Task Force, in ordine di settore, con gli stessi 11 capitoli del percorso; i capitoli 5–7 rimandano alle Parti I e II invece di ripeterli |
| **Appendici** | A · Registro di tutti gli agenti (con i workflow in cui compaiono) · B · Lezioni apprese |

L'export della **singola Task Force** è invece autonomo: i capitoli 5–7 contengono le schede, i prompt e i diagrammi.

Dalla pagina **Esporta**, per la vostra parte e (con il codice docente) per il libro intero:

| Formato | Cosa contiene |
| --- | --- |
| **PDF** | Compilato sul server con la TeX Live installata (latexmk + pdfLaTeX). Il libro dell'esempio richiede circa 2 secondi; il risultato resta in memoria finché il contenuto non cambia |
| **Progetto Overleaf (.zip)** | `main.tex`, `preambolo.tex`, `parti/NN-task-force.tex` (una per gruppo), `appendici.tex`. Su Overleaf: *New Project → Upload Project* e caricate lo zip. Compilatore: pdfLaTeX, quello predefinito |
| **Apri in Overleaf** | Crea direttamente un progetto su overleaf.com, in un unico file `.tex`. Il contenuto lascia il computer solo con questo clic |
| **.tex (file unico)** | Lo stesso progetto in un solo file, da incollare in un progetto esistente |
| **Markdown** | Per wiki, pandoc, documenti condivisi |

Note sul LaTeX:

- **Etichette per i rimandi:** `part:catalogo`, `part:workflow`, `part:<task-force>`, `cap:<task-force>:<capitolo>`,
  `agente:<task-force>:<id>`, `wf:<task-force>:<id>`, `persona:<task-force>:<id>`, `app:registro`, `app:lezioni`.
  Le schede rimandano ai workflow in cui compaiono, i workflow rimandano alle schede, il registro alle schede.
- **Diagrammi:** TikZ, con le posizioni prese dal compositore; i nodi tratteggiati sono agenti presi dal catalogo di
  un'altra Task Force, le frecce tratteggiate sono frecce di ritorno.
- **Testo libero:** viene convertito in LaTeX sicuro (`% & _ # { } \`, virgolette, frecce…). Le emoji vengono tolte,
  perché pdfLaTeX si fermerebbe davanti a caratteri che non conosce.
- **Prompt:** sono in blocchi `Verbatim` che vanno a capo da soli (pacchetto `fvextra`).
- **Pacchetti usati:** tutti standard e presenti su Overleaf (`xltabular`, `fvextra`, `tcolorbox`, `tikz`, `titlesec`, `enumitem`, `hyperref`).
  Si compila anche con XeLaTeX e LuaLaTeX.

Senza TeX Live sul server il pulsante PDF non compare: si usa il progetto Overleaf.
Su Linux: `apt install latexmk texlive-latex-extra texlive-lang-italian`.

| Variabile | Predefinito | Significato |
| --- | --- | --- |
| `PDF` | `on` se c'è latexmk | `off` disattiva la compilazione sul server |
| `LATEX_ENGINE` | `pdflatex` | `pdflatex`, `lualatex` o `xelatex` |
| `PDF_TIMEOUT_MS` | `180000` | Tempo massimo per una compilazione |

Da riga di comando (sostituite il formato con `md`, `tex`, `zip` o `pdf`):

```bash
curl -H "X-Codice-Docente: IL_CODICE" http://localhost:3000/api/export/book.pdf -o libro.pdf
curl -H "X-Codice-Corso: IL_CODICE" http://localhost:3000/api/export/esempio-onboarding.zip -o parte.zip
```

## Guida socratica (LLM open)

In basso a destra c'è il pulsante **? Guida socratica**. Il numero accanto dice quanti passi mancano nel capitolo aperto.
La guida accompagna la Task Force **capitolo per capitolo e campo per campo**.

**Il pulsante c'è sempre**, anche senza un modello collegato. In quel caso la guida lavora in **modalità di base**
(etichetta gialla nel pannello): percorso guidato, schede dei campi, definizioni dal glossario, rifiuto con appiglio se le si
chiede di scrivere al posto del gruppo, e sempre una domanda per far ragionare. La stessa risposta di base arriva, con un avviso,
se il modello è configurato ma non risponde (per esempio mentre il servizio Ollama sta ancora scaricando il modello).

**Il percorso guidato** (in cima al pannello) mostra sempre il *prossimo passo* del capitolo, nell'ordine giusto:
- prima le **azioni** che creano la struttura (es. «manca una persona toccata ma non utente», «congelate la prima versione del prompt»);
- poi i **campi** da compilare, ognuno con la sua scheda: *a cosa serve* e *quando è buono*.

I pulsanti sono **Mostrami** (porta al campo o al pulsante giusto e lo evidenzia), **Ragioniamoci insieme** (apre il dialogo
su quel passo) e **Salta**. L'elenco completo dei passi è sotto la scheda. Quando un campo del percorso viene compilato,
la guida lo nota e propone un **parere critico** prima di passare al successivo.

**Le domande.** Se qualcosa non è chiaro, i gruppi chiedono, anche con le domande rapide come «Non capiamo cosa chiede
questo campo», «Parere su…» o «Spiegateci: …». La guida risponde in modo **corretto** perché il server le passa:
- il **glossario del corso** (definizioni ed esempi su casi diversi: precondizioni, criteri di accettazione, router, fasce dell'AI Act…);
- la **scheda del campo** attivo;
- lo stato del capitolo e i prossimi passi.

Se una domanda esce dal corso (cifre di sanzioni, norme, prezzi) lo dice e rimanda al docente, invece di inventare.

**Non risolutiva.** La guida spiega e valuta, ma non scrive il contenuto dei campi. Oltre alle regole del prompt ci sono controlli
deterministici, che valgono con qualsiasi modello:
1. **citazioni lunghe sul vostro caso:** una frase tra virgolette lunga che riguarda il caso del gruppo (molte parole in comune
   con il suo scenario) viene sostituita da «(questa parte la scrivete voi)». Restano le citazioni del testo del gruppo
   e gli esempi su casi diversi;
2. **soluzioni consegnate:** frasi come «ecco il testo…», «vi propongo…», «potreste scrivere:» o una riga che inizia con il nome
   del campo fermano la risposta, che viene sostituita da un rifiuto gentile con un appiglio preso dalla scheda del campo;
3. **«scrivetecelo voi»:** la richiesta di scrivere al posto del gruppo riceve subito quel rifiuto, senza nemmeno chiamare il modello;
4. **cifre di legge inventate:** frasi con importi di multe, sanzioni o articoli che non vengono dal materiale del gruppo sono
   sostituite da «chiedete al docente»;
5. **una sola domanda:** la risposta si chiude alla prima domanda, e la generazione viene interrotta.

Solo **le frasi scritte dal gruppo** hanno sotto il pulsante «↳ Inserisci», che le mette nel campo attivo.
C'è una conversazione per Task Force e per capitolo, che resta se ricaricate la pagina; non viene salvata sul server.

Dove modificare la guida:
- regole e intenti: [server/socratico.js](server/socratico.js) (`SYSTEM_PROMPT`, `INTENTS`);
- schede dei campi, glossario e ordine dei passi: [public/js/guida.js](public/js/guida.js) (`FIELD_GUIDE`, `GLOSSARIO`).

### Configurazione con Ollama (consigliata: tutto in locale, modelli open)

```bash
brew install ollama            # oppure https://ollama.com
ollama pull qwen2.5:14b        # Apache 2.0, buono in italiano, ~9 GB: portatile con 16+ GB di RAM
ollama pull llama3.1:8b        # alternativa più leggera, ~5 GB
```

Nel `.env`:

```bash
AI_BASE_URL=http://localhost:11434/v1
AI_MODEL=qwen2.5:14b
# SOCRATICO_MODEL=llama3.1:8b   # un modello diverso solo per la guida
# BOZZE_AI=off                  # per tenere solo la guida e spegnere «Bozza con AI»
```

**In aula, con più gruppi.** Su un Mac M3 con 24 GB e `qwen2.5:14b` la prima parola arriva dopo circa 5–20 secondi
(il primo messaggio di un capitolo è il più lento) e una risposta completa dopo circa 20–30 secondi. Ollama risponde a un gruppo alla volta:
con 6 gruppi che chiedono insieme, l'ultimo aspetta. Per migliorare:

```bash
OLLAMA_NUM_PARALLEL=3 OLLAMA_CONTEXT_LENGTH=8192 ollama serve   # più richieste in parallelo e contesto più lungo
```

poi nel `.env` impostate `SOCRATICO_CTX=8192`, così la guida ricorda più turni. Con molti gruppi conviene `llama3.1:8b`,
oppure Ollama (o vLLM) su un server con GPU: basta cambiare `AI_BASE_URL`.

| Variabile | Predefinito | Significato |
| --- | --- | --- |
| `SOCRATICO` | `on` | `off` nasconde la guida |
| `SOCRATICO_MODEL` | `AI_MODEL` | Modello usato dalla guida |
| `SOCRATICO_TEMPERATURE` | `0.3` | Variabilità delle risposte |
| `SOCRATICO_MAX_TOKENS` | `450` | Lunghezza massima di una risposta |
| `ANTHROPIC_API_KEY` | — | Guida socratica con Claude (ha la precedenza su Ollama) |
| `CLAUDE_MODEL` | `claude-opus-5-5` | Modello Claude della guida |
| `CLAUDE_EFFORT` | `low` | Quanto ragiona il modello: `low`, `medium`, `high` |
| `MODELLO_INTEGRATO` | — | Avvia Ollama dentro l'app con questo modello (es. `qwen2.5:7b`) e lo collega da solo |
| `SOCRATICO_PROFILO` | `completo` | `leggero` per modelli piccoli su CPU (es. Ollama su Railway): prompt più corto, stesse regole |
| `SOCRATICO_CTX` | `4096` | Contesto del modello in token. I turni vecchi vengono scartati per restarci dentro, le regole mai |
| `BOZZE_AI` | `on` | `off` spegne «Bozza con AI» su personas e storie |

## Capitolo 7 · Il compositore a grafo

I workflow si **disegnano**: nel Capitolo 7 c'è una tela con

- **tavolozza** a sinistra: ingresso, umano nel ciclo, uscita, gli agenti della Task Force e quelli **dal catalogo** delle altre
  Task Force (con ricerca). Un agente dal catalogo è usato *per riferimento*: nel grafo ha il bordo tratteggiato e, se il suo
  gruppo lo modifica, cambia anche qui. Per adattarlo lo si copia nel Capitolo 5;
- **tela** al centro: i nodi si trascinano; si collegano trascinando dal pallino a destra di un nodo fino al nodo successivo.
  Una freccia da A a B significa *gli effetti di A soddisfano le precondizioni di B*. Pulsanti «Disponi automaticamente»,
  «Adatta», zoom; il tasto Canc elimina ciò che è selezionato;
- **ispettore** a destra: cliccando una freccia mette fianco a fianco gli effetti del nodo di partenza e le precondizioni di
  quello d'arrivo («gli effetti coprono le precondizioni?»), e permette di dare una **condizione** (router) o di segnarla
  come **ritorno** (il critico che rimanda al produttore);
- sotto: la **verifica del grafo** (ingresso e uscita, ogni passo raggiunto dall'ingresso, almeno un umano, nessun ciclo
  nascosto, condizioni sulle uscite dei router, agenti esistenti), il **workflow in parole** e l'**elenco dei collegamenti**
  con i menu, per chi usa tastiera, telefono o lettore di schermo.

Ogni Task Force può avere **più workflow**. I workflow scritti con la versione precedente (elenco di passi) vengono
convertiti in grafo da soli, la prima volta che si apre il capitolo. Il Registro mostra in quali workflow compare ogni agente.

## Riusare gli agenti di altre Task Force

Mentre lavorano, i gruppi possono riusare gli agenti degli altri:

- dal **Registro**: pulsante «♻ Usa nel nostro capitolo» su ogni riga;
- dal **Capitolo 5 · Agenti**: «♻ Riusa un agente di un'altra Task Force».

Il riuso è una **copia con provenienza**, non un collegamento: il gruppo la adatta al proprio scenario, e le modifiche successive
del gruppo d'origine non la cambiano. La copia parte senza versioni congelate e chiede «Cosa avete adattato rispetto all'originale»:
finché il campo è vuoto il capitolo non arriva al 100%. Il gruppo d'origine vede in tempo reale «★ Riusato da N Task Force»
(utile anche per assegnare il badge *Mentore*). Origine, adattamento e «riusato da» compaiono nell'export e nel registro del libro.

## Gli esempi da mostrare in aula

`npm run seed` crea (o rigenera) due Task Force di esempio e non tocca le altre:

| Esempio | Stato | Cosa mostra |
| --- | --- | --- |
| **Esempio · Orientamento**, «Lo sportello che fa domande» (Formazione e scuola) | **Completo**: 11 capitoli al 100% | Sportello informazioni e orientamento di un centro di formazione. Workflow *combinazione* (router + produttore e critico) con due passi umani (*approva*, *decide*); un agente socratico (l'Orientatore); un agente **riusato** dallo Smistatore dell'Onboarding, con cosa è stato adattato; prompt con 1–3 versioni legate ai test; 12 test (9 passati, 2 parziali, 1 fallito, tutti poi corretti); fascia AI Act discussa al confine con l'alto rischio; persona «toccata ma non utente» nata da una bozza AI riscritta |
| **Esempio · Onboarding**, «Il primo mese senza panico» (Amministrazione e servizi) | **A metà**: 3 test, checklist etica parziale | Come appaiono avvisi, lacune e la Verifica finale di un lavoro in corso |

Suggerimento per la lezione: mostrate prima l'Orientamento dalla **Verifica finale** e dall'export **PDF** («ecco dove arriverete»),
poi l'Onboarding per far vedere cosa segnala l'app quando manca qualcosa.

Su Railway, con `SEED_ESEMPIO=1` gli esempi vengono creati al primo avvio, solo se il database è vuoto.

## Struttura

```
server/
  index.js     avvio, porta, indirizzi di rete, avviso se manca il Volume su Railway
  app.js       API Express, autenticazione con codici, SSE, export
  db.js        schema SQLite e merge patch transazionale
  export.js    parte e libro in Markdown (funzioni pure)
  latex.js     parte e libro in LaTeX: progetto per Overleaf
  pdf.js       compilazione del PDF con latexmk (coda e cache)
  ollama-integrato.js  Ollama dentro l'app (MODELLO_INTEGRATO): avvio, download, stato in /salute
  zip.js       archivio zip minimo per il progetto Overleaf
  ai.js        bozza con AI (endpoint compatibile OpenAI)
  socratico.js guida socratica: regole, intenti, contesto, filtri, streaming dal modello
  claude.js    Claude come modello della guida (SDK ufficiale @anthropic-ai/sdk)
public/
  index.html, css/style.css
  js/model.js     modello dati, etichette, completamento, verifica del piano (condiviso con il server)
  js/merge.js     JSON merge patch (condiviso con il server)
  js/store.js     stato, salvataggio con debounce, unione degli aggiornamenti remoti
  js/ui.js        helper DOM e campi legati al documento
  js/sections.js  i capitoli 1–11
  js/pages.js     Task Force, Verifica, Lavagna, Registro, Esporta
  js/guida.js     schede dei campi, glossario del corso, percorso guidato (condiviso con il server)
  js/grafo-core.js workflow a grafo: conversione, verifica, disposizione, Mermaid (condiviso con il server)
  js/grafo.js     compositore a grafo del Capitolo 7
  js/socratico.js pannello della guida socratica
  js/app.js       router, barra in alto, menu, login, eventi
scripts/seed.js   Task Force di esempio (scripts/esempi/ per l'esempio completo)
scripts/check-latex.js  verifica di LaTeX nel build Docker
Dockerfile, railway.json  deploy su Railway
ollama/           servizio Ollama per Railway (Dockerfile, avvio.sh, railway.json)
test/             node:test (merge patch, export Markdown e LaTeX/PDF, API, bozza AI, riuso, guida socratica)
```

### API

| Metodo | Percorso | Note |
| --- | --- | --- |
| `POST` | `/api/login` | `{codice}` → `{ruolo}` |
| `GET` | `/api/events` | SSE: `group`, `group-deleted`, `board` (codice in `?codice=`) |
| `GET/POST` | `/api/groups` | elenco / nuova Task Force `{name, settore, membri}` |
| `GET/PATCH` | `/api/groups/:id` | PATCH = JSON merge patch su `{name, data}` |
| `DELETE` | `/api/groups/:id` | docente |
| `GET` | `/api/board` · `PUT /api/board/:id` | lavagna; PUT solo docente |
| `GET` | `/api/agents` | registro di tutti gli agenti |
| `GET` | `/api/export/:id.{md,tex,zip,pdf}` · `/api/export/book.{md,tex,zip,pdf}` | `?download` per l'allegato; libro solo docente |
| `POST` | `/api/ai/draft` | `{groupId, kind: persona \| story, personaId?}` |
| `POST` | `/api/socratico` | `{groupId, section, intent: guida \| parere \| domanda \| libero, field: {path, label}, messages}` → testo in streaming |

Il codice si passa nell'header `X-Codice-Corso` (o `X-Codice-Docente`) oppure nella query `?codice=` / `?docente=`.

## Test

```bash
npm test
```
