// JSON Merge Patch (RFC 7386), condiviso tra server e browser.
//
// Regole:
//  - se la patch non è un oggetto (stringa, numero, booleano, array) sostituisce il valore;
//  - se è un oggetto, ogni chiave viene applicata ricorsivamente;
//  - una chiave con valore null viene rimossa dal documento.
//
// Le liste del modello (personas, stories, agents, ...) sono oggetti indicizzati
// per id: così due persone che modificano due schede diverse — o due campi diversi
// della stessa scheda — producono patch che non si sovrascrivono a vicenda.

export function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Applica `patch` a `target` e restituisce il risultato.
 * Non modifica gli argomenti: restituisce sempre un nuovo valore.
 */
export function mergePatch(target, patch) {
  if (!isPlainObject(patch)) return clone(patch);
  const result = isPlainObject(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete result[key];
    else result[key] = mergePatch(result[key], value);
  }
  return result;
}

/** Copia profonda di un valore JSON. */
export function clone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

/**
 * Costruisce una patch minima che imposta `value` al percorso `path`
 * (es. ['personas', 'p_ab12', 'nome']) → { personas: { p_ab12: { nome: value } } }.
 */
export function patchFromPath(path, value) {
  const root = {};
  let node = root;
  path.forEach((key, i) => {
    if (i === path.length - 1) node[key] = value;
    else node = node[key] = {};
  });
  return root;
}
