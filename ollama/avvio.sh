#!/bin/sh
# Avvia Ollama, scarica il modello se non c'è ancora (nel Volume, se montato su
# /root/.ollama) e lo carica in memoria, così la prima domanda non aspetta.
set -e
ollama serve &
SERVER=$!
LOCALE=127.0.0.1:${OLLAMA_HOST##*:}   # stessa porta del server, via IPv4 locale

until OLLAMA_HOST=$LOCALE ollama list >/dev/null 2>&1; do sleep 1; done
echo "Ollama avviato."

for MODELLO in $(echo "$OLLAMA_MODEL" | tr ',' ' '); do
  if OLLAMA_HOST=$LOCALE ollama list | awk 'NR>1 {print $1}' | grep -qx "$MODELLO"; then
    echo "Modello $MODELLO già presente."
  else
    echo "Scarico $MODELLO (la prima volta richiede qualche minuto)…"
    OLLAMA_HOST=$LOCALE ollama pull "$MODELLO"
  fi
  echo "Carico $MODELLO in memoria…"
  OLLAMA_HOST=$LOCALE ollama run "$MODELLO" "Rispondi solo: pronto" >/dev/null 2>&1 || true
done
echo "Ollama pronto con: $OLLAMA_MODEL"

wait $SERVER
