# Servizio Ollama per Railway: il modello open della Guida socratica, raggiungibile
# solo dall'app sulla rete privata di Railway (nessun dominio pubblico necessario).
#
# Railway non ha GPU: il modello gira su CPU. qwen2.5:7b (Apache 2.0) è il miglior
# compromesso tra qualità in italiano e velocità; serve un servizio con almeno 8 GB di RAM.
FROM ollama/ollama:0.34.4

# [::] = ascolta anche in IPv6, necessario per la rete privata di Railway
ENV OLLAMA_HOST=[::]:11434 \
    OLLAMA_MODEL=qwen2.5:7b \
    OLLAMA_KEEP_ALIVE=-1 \
    OLLAMA_NUM_PARALLEL=1 \
    OLLAMA_MAX_LOADED_MODELS=1 \
    OLLAMA_CONTEXT_LENGTH=4096

COPY avvio.sh /avvio.sh
RUN chmod +x /avvio.sh
EXPOSE 11434
ENTRYPOINT ["/avvio.sh"]
