# Cantiere · Agenti al Lavoro

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
| `DB_FILE` | `./data/cantiere.sqlite` | File del database |
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

Nel libro ogni Task Force è una **Parte**, con gli stessi 11 **capitoli** del percorso (Capitolo 1 · Scenario …
Capitolo 11 · Competenze e lezioni), numerati da 1 in ogni parte. Le parti sono in ordine di settore; in appendice
ci sono il *Registro degli agenti* (A) e le *Lezioni apprese* (B).

Dalla pagina **Esporta**, per la vostra parte e (con il codice docente) per il libro intero:

| Formato | Cosa contiene |
| --- | --- |
| **PDF** | Compilato sul server con la TeX Live installata (latexmk + pdfLaTeX). Il libro dell'esempio richiede circa 2 secondi; il risultato resta in memoria finché il contenuto non cambia |
| **Progetto Overleaf (.zip)** | `main.tex`, `preambolo.tex`, `parti/NN-task-force.tex` (una per gruppo), `appendici.tex`. Su Overleaf: *New Project → Upload Project* e caricate lo zip. Compilatore: pdfLaTeX, quello predefinito |
| **Apri in Overleaf** | Crea direttamente un progetto su overleaf.com, in un unico file `.tex`. Il contenuto lascia il computer solo con questo clic |
| **.tex (file unico)** | Lo stesso progetto in un solo file, da incollare in un progetto esistente |
| **Markdown** | Per wiki, pandoc, documenti condivisi |

Note sul LaTeX:

- **Etichette per i rimandi:** `part:<task-force>`, `cap:<task-force>:<capitolo>` (es. `cap:esempio-onboarding:workflow`),
  `agente:<task-force>:<id>`, `persona:<task-force>:<id>`, `app:registro`, `app:lezioni`.
  Nel registro, il nome di ogni agente rimanda alla sua scheda, e le copie riusate rimandano all'originale.
- **Testo libero:** viene convertito in LaTeX sicuro (`% & _ # { } \`, virgolette, frecce…). Le emoji vengono tolte,
  perché pdfLaTeX si fermerebbe davanti a caratteri che non conosce.
- **Prompt:** sono in blocchi `Verbatim` che vanno a capo da soli (pacchetto `fvextra`).
- **Pacchetti usati:** tutti standard e presenti su Overleaf (`xltabular`, `fvextra`, `tcolorbox`, `titlesec`, `enumitem`, `hyperref`).
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

In basso a destra c'è il pulsante **? Guida socratica**. Apre un pannello che sa in quale capitolo siete e su quale campo
stavate scrivendo (l'ultimo in cui avete cliccato). La guida:

- **non scrive mai la soluzione**: fa una domanda alla volta, parte da ciò che avete già scritto e lo mette in discussione;
- **spiega i concetti** (precondizioni, criteri di accettazione, fasce dell'AI Act…) con esempi presi da casi *diversi* dal vostro;
- se insistete perché scriva lei la risposta, rifiuta e vi offre un appiglio;
- quando una vostra formulazione funziona ve lo dice, spiega perché e vi invita a scriverla.

Solo **le frasi scritte dal gruppo** hanno sotto il pulsante «↳ Inserisci in «campo»», che le mette nel campo (in fondo, se è già compilato).
Le risposte della guida non si possono inserire: è una scelta didattica. C'è una conversazione per Task Force e per capitolo,
che resta se ricaricate la pagina e sparisce quando chiudete il browser. Le conversazioni non vengono salvate sul server.

Il contesto (scenario, contenuto del capitolo, problemi rilevati, campo attivo) lo costruisce il server dal capitolo salvato.
Le regole della guida sono in [server/socratico.js](server/socratico.js) (`SYSTEM_PROMPT` e `SECTION_FOCUS`): modificatele lì.

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
(il primo messaggio di un capitolo è il più lento) e una risposta completa dopo circa 30–45 secondi. Ollama risponde a un gruppo alla volta:
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
| `SOCRATICO_TEMPERATURE` | `0.5` | Creatività delle domande |
| `SOCRATICO_MAX_TOKENS` | `450` | Lunghezza massima di una risposta |
| `SOCRATICO_CTX` | `4096` | Contesto del modello in token. I turni vecchi vengono scartati per restarci dentro, le regole mai |
| `BOZZE_AI` | `on` | `off` spegne «Bozza con AI» su personas e storie |

## Riusare gli agenti di altre Task Force

Mentre lavorano, i gruppi possono riusare gli agenti degli altri:

- dal **Registro**: pulsante «♻ Usa nel nostro capitolo» su ogni riga;
- dal **Capitolo 5 · Agenti**: «♻ Riusa un agente di un'altra Task Force».

Il riuso è una **copia con provenienza**, non un collegamento: il gruppo la adatta al proprio scenario, e le modifiche successive
del gruppo d'origine non la cambiano. La copia parte senza versioni congelate e chiede «Cosa avete adattato rispetto all'originale»:
finché il campo è vuoto il capitolo non arriva al 100%. Il gruppo d'origine vede in tempo reale «★ Riusato da N Task Force»
(utile anche per assegnare il badge *Mentore*). Origine, adattamento e «riusato da» compaiono nell'export e nel registro del libro.

## Il capitolo di esempio

`npm run seed` crea (o rigenera) la Task Force **Esempio · Onboarding**: uno studio professionale che inserisce nuovi assunti,
con tre agenti (Smistatore, Risponditore su procedure socratico, Registratore), un workflow a router con un passo umano
«informato», 3 test e una checklist etica compilata a metà. Usatelo per mostrare in aula com'è fatto un capitolo.
Lanciatelo a server fermo, oppure ricaricate la pagina dopo.

## Struttura

```
server/
  index.js     avvio, porta, indirizzi di rete
  app.js       API Express, autenticazione con codici, SSE, export
  db.js        schema SQLite e merge patch transazionale
  export.js    parte e libro in Markdown (funzioni pure)
  latex.js     parte e libro in LaTeX: progetto per Overleaf
  pdf.js       compilazione del PDF con latexmk (coda e cache)
  zip.js       archivio zip minimo per il progetto Overleaf
  ai.js        bozza con AI (endpoint compatibile OpenAI)
  socratico.js guida socratica: regole, contesto, streaming dal modello
public/
  index.html, css/style.css
  js/model.js     modello dati, etichette, completamento, verifica del piano (condiviso con il server)
  js/merge.js     JSON merge patch (condiviso con il server)
  js/store.js     stato, salvataggio con debounce, unione degli aggiornamenti remoti
  js/ui.js        helper DOM e campi legati al documento
  js/sections.js  i capitoli 1–11
  js/pages.js     Task Force, Verifica, Lavagna, Registro, Esporta
  js/socratico.js pannello della guida socratica
  js/app.js       router, barra in alto, menu, login, eventi
scripts/seed.js   capitolo di esempio
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
| `POST` | `/api/socratico` | `{groupId, section, field: {path, label}, messages}` → testo in streaming |

Il codice si passa nell'header `X-Codice-Corso` (o `X-Codice-Docente`) oppure nella query `?codice=` / `?docente=`.

## Test

```bash
npm test
```
