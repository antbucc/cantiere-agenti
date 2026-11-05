// Accesso al database SQLite (better-sqlite3, sincrono).
// Un documento JSON per gruppo; le colonne settore e membri sono una copia
// dei campi del documento, utile per ordinare e per l'export.

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { mergePatch, isPlainObject } from '../public/js/merge.js';
import { emptyDoc, newId } from '../public/js/model.js';

/**
 * Dove sta il database: DB_FILE se impostato; altrimenti nel Volume di Railway,
 * se c'è (Railway imposta RAILWAY_VOLUME_MOUNT_PATH); altrimenti ./data/.
 */
export function defaultDbFile(env = process.env) {
  if (env.DB_FILE) return env.DB_FILE;
  if (env.RAILWAY_VOLUME_MOUNT_PATH) return path.join(env.RAILWAY_VOLUME_MOUNT_PATH, 'cantiere.sqlite');
  return path.join(process.cwd(), 'data', 'cantiere.sqlite');
}

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL'); // letture e scritture concorrenti senza blocchi
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS groups (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      settore    TEXT NOT NULL DEFAULT '',
      membri     TEXT NOT NULL DEFAULT '',
      data       TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS board (
      group_id  TEXT PRIMARY KEY REFERENCES groups(id) ON DELETE CASCADE,
      tappe     INTEGER NOT NULL DEFAULT 0,
      quiz      INTEGER NOT NULL DEFAULT 0,
      revisione INTEGER NOT NULL DEFAULT 0,
      consiglio INTEGER NOT NULL DEFAULT 0,
      badges    TEXT NOT NULL DEFAULT '[]'
    );
  `);
  return new Store(db);
}

const now = () => new Date().toISOString();

function rowToGroup(r) {
  return r && {
    id: r.id, name: r.name, settore: r.settore, membri: r.membri,
    data: JSON.parse(r.data), created_at: r.created_at, updated_at: r.updated_at,
  };
}

function rowToBoard(r) {
  return {
    group_id: r.group_id,
    punti: { tappe: r.tappe, quiz: r.quiz, revisione: r.revisione, consiglio: r.consiglio },
    badges: JSON.parse(r.badges),
  };
}

class Store {
  constructor(db) {
    this.db = db;
    this.q = {
      all: db.prepare('SELECT * FROM groups ORDER BY created_at'),
      get: db.prepare('SELECT * FROM groups WHERE id = ?'),
      byName: db.prepare('SELECT * FROM groups WHERE name = ?'),
      insert: db.prepare(`INSERT INTO groups (id, name, settore, membri, data, created_at, updated_at)
                          VALUES (@id, @name, @settore, @membri, @data, @created_at, @updated_at)`),
      update: db.prepare(`UPDATE groups SET name=@name, settore=@settore, membri=@membri, data=@data, updated_at=@updated_at
                          WHERE id=@id`),
      del: db.prepare('DELETE FROM groups WHERE id = ?'),
      boardAll: db.prepare('SELECT * FROM board'),
      boardEnsure: db.prepare('INSERT OR IGNORE INTO board (group_id) VALUES (?)'),
      boardGet: db.prepare('SELECT * FROM board WHERE group_id = ?'),
      boardSet: db.prepare(`UPDATE board SET tappe=@tappe, quiz=@quiz, revisione=@revisione, consiglio=@consiglio, badges=@badges
                            WHERE group_id=@group_id`),
    };
    // La patch è applicata dentro una transazione: lettura + merge + scrittura atomiche.
    this.patchGroup = db.transaction(this._patchGroup.bind(this));
  }

  listGroups() { return this.q.all.all().map(rowToGroup); }
  getGroup(id) { return rowToGroup(this.q.get.get(id)); }
  getGroupByName(name) { return rowToGroup(this.q.byName.get(name)); }

  createGroup({ name, settore = '', membri = '', data, id }) {
    const doc = data || emptyDoc({ settore, membri });
    const g = {
      id: id || newId('g'), name, settore: doc.settore || '', membri: doc.membri || '',
      data: JSON.stringify(doc), created_at: now(), updated_at: now(),
    };
    this.q.insert.run(g);
    this.q.boardEnsure.run(g.id);
    return this.getGroup(g.id);
  }

  /**
   * Applica una JSON merge patch alla risorsa { name, data }.
   * Esempio: { data: { personas: { p_1: { nome: 'Giulia' } } } }
   */
  _patchGroup(id, patch) {
    const cur = this.getGroup(id);
    if (!cur) return null;
    if (!isPlainObject(patch)) throw new Error('La patch deve essere un oggetto JSON');
    const next = mergePatch({ name: cur.name, data: cur.data }, patch);
    const data = isPlainObject(next.data) ? next.data : {};
    const name = typeof next.name === 'string' && next.name.trim() ? next.name.trim() : cur.name;
    this.q.update.run({
      id, name,
      settore: String(data.settore || ''), membri: String(data.membri || ''),
      data: JSON.stringify(data), updated_at: now(),
    });
    return this.getGroup(id);
  }

  deleteGroup(id) { return this.q.del.run(id).changes > 0; }

  listBoard() { return this.q.boardAll.all().map(rowToBoard); }

  setBoard(groupId, { punti = {}, badges }) {
    this.q.boardEnsure.run(groupId);
    const cur = rowToBoard(this.q.boardGet.get(groupId));
    const p = { ...cur.punti };
    for (const k of Object.keys(p)) if (punti[k] !== undefined) p[k] = Math.max(-999, Math.min(999, parseInt(punti[k], 10) || 0));
    this.q.boardSet.run({
      group_id: groupId, ...p,
      badges: JSON.stringify(Array.isArray(badges) ? badges : cur.badges),
    });
    return rowToBoard(this.q.boardGet.get(groupId));
  }
}
