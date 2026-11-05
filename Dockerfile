# AIM-PRO Lab — immagine per Railway (o qualsiasi host Docker).
#
# Con un Dockerfile Railway non usa Railpack: niente download di mise da GitHub
# durante il build, e possiamo installare LaTeX per il PDF.
#
# ARG WITH_LATEX=0 per un'immagine più leggera e un build più veloce (niente PDF
# sul server: resta l'export per Overleaf). Su Railway basta una variabile di
# servizio WITH_LATEX=0.

# --- 1. Dipendenze Node (better-sqlite3 è un modulo nativo) -------------------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# Strumenti per compilare better-sqlite3 se il binario precompilato non si scarica
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- 2. Immagine finale -------------------------------------------------------
FROM node:22-bookworm-slim
ARG WITH_LATEX=1
# Solo i pacchetti TeX che il libro usa davvero (xltabular, fvextra, tcolorbox,
# titlesec, enumitem, babel-italian, lmodern…)
RUN if [ "$WITH_LATEX" = "1" ]; then \
      apt-get update \
   && apt-get install -y --no-install-recommends \
        latexmk texlive-latex-base texlive-latex-recommended texlive-latex-extra \
        texlive-lang-italian texlive-fonts-recommended lmodern \
   && rm -rf /var/lib/apt/lists/* /usr/share/doc/*; \
    fi
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Verifica durante il build: se manca un pacchetto LaTeX il build si ferma qui,
# con il nome del file mancante, invece di fallire in aula.
RUN if [ "$WITH_LATEX" = "1" ]; then node scripts/check-latex.js; else echo "LaTeX non installato: PDF disattivato"; fi
EXPOSE 3000
CMD ["node", "server/index.js"]
