# AIM-PRO Lab — immagine per Railway (o qualsiasi host Docker).
#
# Con un Dockerfile Railway non usa Railpack: niente download di strumenti da
# GitHub durante il build. L'immagine contiene:
#   - l'app Node (better-sqlite3 compilato a parte);
#   - LaTeX per il PDF (ARG WITH_LATEX=0 per un'immagine più leggera);
#   - Ollama, solo CPU, per la Guida socratica con un modello open: si attiva
#     con la variabile MODELLO_INTEGRATO (es. qwen2.5:7b), altrimenti resta spento.
#
# Base Ubuntu 24.04: è la stessa dell'immagine ufficiale di Ollama, così le sue
# librerie funzionano senza sorprese.

# --- 1. Dipendenze Node (better-sqlite3 è un modulo nativo) -------------------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- 2. Ollama senza le librerie per GPU (su Railway non ci sono GPU) ----------
FROM ollama/ollama:0.34.4 AS ollama
RUN rm -rf /usr/lib/ollama/cuda* /usr/lib/ollama/rocm* /usr/lib/ollama/*vulkan* /usr/lib/ollama/*cuda* /usr/lib/ollama/*hip*

FROM node:22-bookworm-slim AS node

# --- 3. Immagine finale ---------------------------------------------------------
FROM ubuntu:24.04
ARG WITH_LATEX=1
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates libgomp1 libopenblas0 libvulkan1 \
 && if [ "$WITH_LATEX" = "1" ]; then \
      apt-get install -y --no-install-recommends \
        latexmk texlive-latex-base texlive-latex-recommended texlive-latex-extra \
        texlive-lang-italian texlive-fonts-recommended lmodern; \
    fi \
 && rm -rf /var/lib/apt/lists/* /usr/share/doc/*

COPY --from=node /usr/local/bin/node /usr/local/bin/node
# anche npm, per poter lanciare «npm run seed» dalla shell del servizio
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx
COPY --from=ollama /usr/bin/ollama /usr/bin/ollama
COPY --from=ollama /usr/lib/ollama /usr/lib/ollama

# Verifica durante il build: Node parte e Ollama ha tutte le sue librerie.
RUN node --version && npm --version \
 && missing=$(for f in /usr/bin/ollama $(find /usr/lib/ollama -type f); do \
      LD_LIBRARY_PATH=/usr/lib/ollama ldd "$f" 2>/dev/null | grep "not found" | sed "s|^|$f: |"; done) \
 && if [ -n "$missing" ]; then echo "Librerie mancanti per Ollama:"; echo "$missing"; exit 1; fi \
 && echo "Ollama (solo CPU) pronto da usare."

WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Se manca un pacchetto LaTeX il build si ferma qui, con il nome del file mancante.
RUN if [ "$WITH_LATEX" = "1" ]; then node scripts/check-latex.js; else echo "LaTeX non installato: PDF disattivato"; fi
EXPOSE 3000
CMD ["node", "server/index.js"]
