'use strict';

/**
 * KnowledgeSearch — Carbon Core v4
 *
 * Chunk-based knowledge retrieval backed by knowledge_chunks + FTS5.
 * Wraps the v4 SQLite schema (schema-v4.sql) with a clean class API.
 *
 * Compatible with:
 *   - Raw better-sqlite3 Database instance (api-server-v4.js default)
 *   - db-adapter wrapper (detected via .type property)
 *
 * Usage:
 *   const ks = new KnowledgeSearch(db);
 *   await ks.autoIngest();
 *   const results = await ks.search('cold email', { domain: 'sales', limit: 5 });
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

// ── DB Helper ───────────────────────────────────────────────────────────
// Normalizes between raw better-sqlite3 (synchronous) and db-adapter (may be async).

function _all(db, sql, params = []) {
  // db-adapter has a .type property ('sqlite' | 'postgres')
  if (db.type === 'sqlite' || db.type === 'postgres') {
    return Promise.resolve(db.all(sql, params));
  }
  // Raw better-sqlite3 — synchronous, spread params
  return Promise.resolve(db.prepare(sql).all(...params));
}

function _get(db, sql, params = []) {
  if (db.type === 'sqlite' || db.type === 'postgres') {
    return Promise.resolve(db.get(sql, params));
  }
  return Promise.resolve(db.prepare(sql).get(...params) || null);
}

function _run(db, sql, params = []) {
  if (db.type === 'sqlite' || db.type === 'postgres') {
    return Promise.resolve(db.run(sql, params));
  }
  return Promise.resolve(db.prepare(sql).run(...params));
}

// ── KnowledgeSearch ─────────────────────────────────────────────────────

class KnowledgeSearch {
  /**
   * @param {object} db - Better-sqlite3 Database instance or db-adapter wrapper.
   */
  constructor(db) {
    this.db = db;
  }

  // ── Public API ──────────────────────────────────────────────────────

  /**
   * Search knowledge chunks. Tries FTS5 first, falls back to LIKE scan.
   *
   * @param {string} query
   * @param {{ domain?: string, limit?: number, minScore?: number }} [opts]
   * @returns {Promise<Array<{ id, source_file, domain, title, content, score, snippet }>>}
   */
  async search(query, opts = {}) {
    const { domain, limit = 10, minScore = 0.1 } = opts;
    const cap = Math.min(limit, 50);

    // FTS5 attempt
    try {
      const ftsRows = await this._ftsSearch(query, domain, cap);
      if (ftsRows.length > 0) return ftsRows;
    } catch (_e) {
      // FTS5 not ready or query malformed — fall through
    }

    // LIKE fallback
    return this._likeSearch(query, domain, cap);
  }

  /**
   * Ingest all .md files under dirPath into knowledge_chunks.
   *
   * @param {string} dirPath
   * @param {string} domain
   * @returns {Promise<{ filesIndexed: number, chunksCreated: number, domain: string }>}
   */
  async ingestDirectory(dirPath, domain) {
    if (!fs.existsSync(dirPath)) {
      console.warn(`[knowledge-search] ingestDirectory: path not found: ${dirPath}`);
      return { filesIndexed: 0, chunksCreated: 0, domain };
    }

    const mdFiles = _walkMarkdown(dirPath);
    let filesIndexed = 0;
    let chunksCreated = 0;

    for (const filePath of mdFiles) {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const title = _extractTitle(raw, filePath);
        const chunks = _splitChunks(raw);

        for (let i = 0; i < chunks.length; i++) {
          const id = crypto.createHash('sha1').update(`${filePath}:${i}`).digest('hex');
          await _run(
            this.db,
            `INSERT OR REPLACE INTO knowledge_chunks
               (id, source_file, domain, title, tags, content, chunk_index, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, filePath, domain, title, '', chunks[i], i, Date.now()],
          );
          chunksCreated++;
        }
        filesIndexed++;
      } catch (e) {
        console.error(`[knowledge-search] Failed to ingest ${filePath}: ${e.message}`);
      }
    }

    return { filesIndexed, chunksCreated, domain };
  }

  /**
   * Auto-ingest on first run (empty knowledge_chunks table).
   * Sources:
   *   - rawgrowth-os/knowledge/ → domain 'knowledge'
   *   - rawclaw-platform/skills/active/ → domain 'skills'
   *
   * Paths are resolved relative to this file (core/v4/knowledge-search.js)
   * so ../../Raw/ points to /OmniFlow/Raw/.
   */
  async autoIngest() {
    try {
      const row = await _get(this.db, 'SELECT COUNT(*) AS count FROM knowledge_chunks', []);
      const count = row ? (row.count || 0) : 0;

      if (count > 0) {
        console.log(`[knowledge-search] Index already populated (${count} chunks) — skipping auto-ingest`);
        return;
      }

      console.log('[knowledge-search] Empty index — running auto-ingest...');

      const rawRoot = path.resolve(__dirname, '../../Raw');

      const knowledgePath = path.join(rawRoot, 'rawgrowth-os', 'knowledge');
      if (fs.existsSync(knowledgePath)) {
        const result = await this.ingestDirectory(knowledgePath, 'knowledge');
        console.log(`[knowledge-search] rawgrowth-os: ${result.filesIndexed} files, ${result.chunksCreated} chunks`);
      } else {
        console.log(`[knowledge-search] rawgrowth-os knowledge not found at ${knowledgePath}`);
      }

      const skillsPath = path.join(rawRoot, 'rawclaw-platform', 'skills', 'active');
      if (fs.existsSync(skillsPath)) {
        const result = await this.ingestDirectory(skillsPath, 'skills');
        console.log(`[knowledge-search] rawclaw skills: ${result.filesIndexed} files, ${result.chunksCreated} chunks`);
      } else {
        console.log(`[knowledge-search] rawclaw skills not found at ${skillsPath}`);
      }
    } catch (e) {
      console.error(`[knowledge-search] autoIngest error: ${e.message}`);
    }
  }

  /**
   * Get all chunks for a domain.
   * @param {string} domain
   * @returns {Promise<Array>}
   */
  async getByDomain(domain) {
    return _all(this.db, 'SELECT * FROM knowledge_chunks WHERE domain = ?', [domain]);
  }

  /**
   * List all domains with chunk counts.
   * @returns {Promise<Array<{ domain: string, count: number }>>}
   */
  async listDomains() {
    return _all(
      this.db,
      'SELECT domain, COUNT(*) AS count FROM knowledge_chunks GROUP BY domain ORDER BY count DESC',
      [],
    );
  }

  /**
   * Find chunks similar to a given chunk ID.
   * Extracts keywords from the source chunk, searches the same domain.
   *
   * @param {string} chunkId
   * @param {number} [limit=5]
   * @returns {Promise<Array>}
   */
  async getSimilar(chunkId, limit = 5) {
    const chunk = await _get(
      this.db,
      'SELECT * FROM knowledge_chunks WHERE id = ?',
      [chunkId],
    );
    if (!chunk) return [];

    // Extract meaningful keywords from title + first 300 chars of content
    const text = `${chunk.title} ${chunk.content.slice(0, 300)}`;
    const keywords = _extractKeywords(text).slice(0, 3);
    if (keywords.length === 0) return [];

    const query = keywords.join(' ');
    const results = await this.search(query, { domain: chunk.domain, limit: limit + 1 });
    return results.filter(r => r.id !== chunkId).slice(0, limit);
  }

  // ── Private ─────────────────────────────────────────────────────────

  async _ftsSearch(query, domain, limit) {
    let sql, params;

    if (domain) {
      sql = `
        SELECT kc.id, kc.source_file, kc.domain, kc.title, kc.tags,
               kc.content, kc.chunk_index, fts.rank AS score
        FROM   knowledge_chunks_fts fts
        JOIN   knowledge_chunks kc ON kc.rowid = fts.rowid
        WHERE  fts MATCH ?
          AND  kc.domain = ?
        ORDER  BY fts.rank
        LIMIT  ?
      `;
      params = [query, domain, limit];
    } else {
      sql = `
        SELECT kc.id, kc.source_file, kc.domain, kc.title, kc.tags,
               kc.content, kc.chunk_index, fts.rank AS score
        FROM   knowledge_chunks_fts fts
        JOIN   knowledge_chunks kc ON kc.rowid = fts.rowid
        WHERE  fts MATCH ?
        ORDER  BY fts.rank
        LIMIT  ?
      `;
      params = [query, limit];
    }

    const rows = await _all(this.db, sql, params);
    return rows.map(row => ({
      id:          row.id,
      source_file: row.source_file,
      domain:      row.domain,
      title:       row.title,
      content:     row.content,
      score:       Math.abs(row.score || 0),
      snippet:     _snippet(row.content, query),
    }));
  }

  async _likeSearch(query, domain, limit) {
    const like = `%${query}%`;
    let sql, params;

    if (domain) {
      sql = `
        SELECT * FROM knowledge_chunks
        WHERE (content LIKE ? OR title LIKE ?) AND domain = ?
        LIMIT ?
      `;
      params = [like, like, domain, limit];
    } else {
      sql = `
        SELECT * FROM knowledge_chunks
        WHERE content LIKE ? OR title LIKE ?
        LIMIT ?
      `;
      params = [like, like, limit];
    }

    const rows = await _all(this.db, sql, params);
    return rows.map(row => ({
      id:          row.id,
      source_file: row.source_file,
      domain:      row.domain,
      title:       row.title,
      content:     row.content,
      score:       1.0,
      snippet:     _snippet(row.content, query),
    }));
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Extract first 200 chars of content containing the query term.
 */
function _snippet(content, query) {
  if (!content) return '';
  const lower    = content.toLowerCase();
  const qLower   = query.toLowerCase().split(/\s+/)[0] || query.toLowerCase();
  const idx      = lower.indexOf(qLower);
  if (idx === -1) return content.slice(0, 200).trim();
  const start    = Math.max(0, idx - 60);
  const end      = Math.min(content.length, start + 200);
  const snippet  = content.slice(start, end).trim();
  return start > 0 ? `...${snippet}` : snippet;
}

const STOPWORDS = new Set([
  'a','an','the','is','in','of','to','and','or','but','for','on','at','by',
  'it','its','be','as','are','was','were','has','have','had','do','does',
  'did','so','if','not','this','that','with','from','up','we','you','he',
  'she','they','his','her','our','your','can','will','all','any','more',
  'also','than','then','what','how','when',
]);

/**
 * Extract meaningful keywords (len > 4, not stopwords).
 */
function _extractKeywords(text) {
  const words = text.toLowerCase().split(/[\s\W]+/);
  return [...new Set(words.filter(w => w.length > 4 && !STOPWORDS.has(w)))];
}

/**
 * Recursively collect .md file paths under a directory.
 */
function _walkMarkdown(dirPath) {
  const results = [];
  if (!fs.existsSync(dirPath)) return results;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(..._walkMarkdown(full));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Extract H1 title or fall back to filename.
 */
function _extractTitle(content, filePath) {
  const match = content.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim();
  return path.basename(filePath, '.md');
}

/**
 * Split markdown content into ~500-token chunks.
 * Splits on ## headings first; then word-count if section is too long.
 */
function _splitChunks(content) {
  // Split on ## headings (preserving the heading text by prepending it)
  const raw = content.split(/(?=^##\s)/m);
  const chunks = [];

  for (const section of raw) {
    if (!section.trim()) continue;

    const words = section.split(/\s+/);
    if (words.length <= 400) {
      chunks.push(section.trim());
    } else {
      // Subdivide long sections into 400-word windows
      for (let i = 0; i < words.length; i += 400) {
        const slice = words.slice(i, i + 400).join(' ').trim();
        if (slice) chunks.push(slice);
      }
    }
  }

  // Ensure at least one chunk
  if (chunks.length === 0 && content.trim()) {
    chunks.push(content.slice(0, 2000).trim());
  }

  return chunks;
}

// ── Exports ──────────────────────────────────────────────────────────────

module.exports = { KnowledgeSearch };
