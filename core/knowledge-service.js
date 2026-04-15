// Knowledge Base Service v2 — Carbon Core
// Ingests markdown files from knowledge/ directories.
// Keyword search with TF-IDF-like scoring. Category indexing.

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── Constants ────────────────────────────────────────────────────────

const VALID_CATEGORIES = new Set([
  'brand', 'sales', 'ops', 'content', 'strategy',
  'agents', 'skills', 'templates', 'frameworks',
]);

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'in', 'of', 'to', 'and', 'or', 'but',
  'for', 'on', 'at', 'by', 'it', 'its', 'be', 'as', 'are', 'was',
  'were', 'has', 'have', 'had', 'do', 'does', 'did', 'so', 'if',
  'not', 'this', 'that', 'with', 'from', 'up', 'we', 'you', 'he',
  'she', 'they', 'his', 'her', 'our', 'your', 'can', 'will', 'all',
  'any', 'more', 'also', 'than', 'then', 'what', 'how', 'when',
]);

// ── In-Memory Index ──────────────────────────────────────────────────

/** @type {Map<string, Object>} id → doc */
const index = new Map();

let _lastIndexed = null;

// ── DB Registration ──────────────────────────────────────────────────

let _saveDoc = null;
let _searchDocs = null;
let _getDocFromDb = null;

/**
 * Register persistent storage. Call after DB is ready to avoid circular imports.
 * @param {{ saveDoc: Function, searchDocs: Function, getDoc: Function }} fns
 */
function registerKnowledgeDb({ saveDoc, searchDocs, getDoc }) {
  _saveDoc = saveDoc;
  _searchDocs = searchDocs;
  _getDocFromDb = getDoc;
}

// ── Keyword Extraction ───────────────────────────────────────────────

/**
 * Extract meaningful keywords from text.
 * @param {string} text
 * @returns {string[]}
 */
function extractKeywords(text) {
  const words = text
    .toLowerCase()
    .split(/[\s\W]+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w) && /^[a-z]/.test(w));

  return [...new Set(words)];
}

// ── Title Extraction ─────────────────────────────────────────────────

/**
 * Extract the title from markdown content (first H1) or fall back to filename.
 * @param {string} content
 * @param {string} filePath
 * @returns {string}
 */
function extractTitle(content, filePath) {
  const match = content.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim();
  return path.basename(filePath, '.md');
}

// ── Document ID ──────────────────────────────────────────────────────

/**
 * Produce a stable ID from a file path.
 * @param {string} filePath
 * @returns {string}
 */
function docId(filePath) {
  return crypto.createHash('sha1').update(filePath).digest('hex');
}

// ── File Walker ──────────────────────────────────────────────────────

/**
 * Recursively collect all .md file paths under a directory.
 * @param {string} dirPath
 * @returns {string[]}
 */
function walkMarkdownFiles(dirPath) {
  const results = [];

  if (!fs.existsSync(dirPath)) return results;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkMarkdownFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(full);
    }
  }

  return results;
}

// ── Snippet Extraction ───────────────────────────────────────────────

/**
 * Return ~200 chars of content around the first occurrence of any query word.
 * @param {string} content
 * @param {string[]} queryWords
 * @returns {string}
 */
function extractSnippet(content, queryWords) {
  const lower = content.toLowerCase();
  let best = -1;

  for (const word of queryWords) {
    const idx = lower.indexOf(word);
    if (idx !== -1 && (best === -1 || idx < best)) {
      best = idx;
    }
  }

  if (best === -1) return content.slice(0, 200).trim();

  const start = Math.max(0, best - 60);
  const end = Math.min(content.length, start + 200);
  const snippet = content.slice(start, end).trim();

  return start > 0 ? `...${snippet}` : snippet;
}

// ── Score Calculator ─────────────────────────────────────────────────

/**
 * Score a document against query words.
 * Title matches are weighted 3x, content matches 1x.
 * @param {Object} doc
 * @param {string[]} queryWords
 * @returns {number}
 */
function scoreDoc(doc, queryWords) {
  const titleLower = doc.title.toLowerCase();
  const contentLower = doc.content.toLowerCase();
  let score = 0;

  for (const word of queryWords) {
    // Title occurrences
    let pos = titleLower.indexOf(word);
    while (pos !== -1) {
      score += 3;
      pos = titleLower.indexOf(word, pos + 1);
    }

    // Content occurrences
    pos = contentLower.indexOf(word);
    while (pos !== -1) {
      score += 1;
      pos = contentLower.indexOf(word, pos + 1);
    }
  }

  return score;
}

// ── Core Ingestion ───────────────────────────────────────────────────

/**
 * Ingest all .md files from a directory into the index under a given category.
 * @param {string} dirPath
 * @param {string} category
 * @returns {Promise<{ docs_added: number, errors: string[] }>}
 */
async function ingestDirectory(dirPath, category) {
  const normalizedCategory = VALID_CATEGORIES.has(category) ? category : 'content';
  const files = walkMarkdownFiles(dirPath);
  const errors = [];
  let docsAdded = 0;

  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const id = docId(filePath);
      const title = extractTitle(content, filePath);
      const keywords = extractKeywords(content);

      const doc = {
        id,
        category: normalizedCategory,
        path: filePath,
        title,
        content,
        keywords,
        indexed_at: Date.now(),
      };

      index.set(id, doc);

      if (_saveDoc) {
        try {
          _saveDoc(doc);
        } catch {
          // DB not ready — doc survives in memory
        }
      }

      docsAdded++;
    } catch (err) {
      errors.push(`${filePath}: ${err.message}`);
    }
  }

  _lastIndexed = Date.now();
  return { docs_added: docsAdded, errors };
}

/**
 * Ingest all subdirectories of a vault path as categories.
 * Subdirectory names matching VALID_CATEGORIES get tagged accordingly.
 * Unknown subdirectory names fall back to "content".
 * @param {string} vaultPath
 * @returns {Promise<{ docs_added: number, errors: string[], categories_ingested: string[] }>}
 */
async function ingestKnowledgeVault(vaultPath) {
  if (!fs.existsSync(vaultPath)) {
    return { docs_added: 0, errors: [`Vault not found: ${vaultPath}`], categories_ingested: [] };
  }

  const entries = fs.readdirSync(vaultPath, { withFileTypes: true });
  const subdirs = entries.filter((e) => e.isDirectory());

  let totalAdded = 0;
  const allErrors = [];
  const categoriesIngested = [];

  for (const subdir of subdirs) {
    const category = VALID_CATEGORIES.has(subdir.name) ? subdir.name : 'content';
    const { docs_added, errors } = await ingestDirectory(
      path.join(vaultPath, subdir.name),
      category,
    );
    totalAdded += docs_added;
    allErrors.push(...errors);
    if (docs_added > 0) categoriesIngested.push(subdir.name);
  }

  // Ingest any .md files sitting directly at the vault root as "content"
  const rootFiles = entries.filter((e) => e.isFile() && e.name.endsWith('.md'));

  // Manual root-level .md ingestion (avoids re-walking subdirectories via ingestDirectory)
  for (const entry of rootFiles) {
    const filePath = path.join(vaultPath, entry.name);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const id = docId(filePath);
      const title = extractTitle(content, filePath);
      const keywords = extractKeywords(content);
      const doc = { id, category: 'content', path: filePath, title, content, keywords, indexed_at: Date.now() };
      index.set(id, doc);
      if (_saveDoc) { try { _saveDoc(doc); } catch {} }
      totalAdded++;
    } catch (err) {
      allErrors.push(`${filePath}: ${err.message}`);
    }
  }

  _lastIndexed = Date.now();
  return { docs_added: totalAdded, errors: allErrors, categories_ingested: categoriesIngested };
}

// ── Auto-Ingest ──────────────────────────────────────────────────────

/**
 * Attempt to ingest from <cwd>/knowledge-vault if it exists.
 * Called automatically on module load. Errors are swallowed silently.
 */
async function autoIngest() {
  const vaultPath = path.join(process.cwd(), 'knowledge-vault');
  if (fs.existsSync(vaultPath)) {
    try {
      await ingestKnowledgeVault(vaultPath);
    } catch {
      // Non-fatal — index starts empty
    }
  }
}

// Kick off auto-ingest without blocking module exports
autoIngest();

// ── Search ───────────────────────────────────────────────────────────

/**
 * Search the index for documents matching a query string.
 * @param {string} query
 * @param {{ limit?: number, category?: string|null }} [options={}]
 * @returns {{ results: Array<{ doc: Object, score: number, snippet: string }>, query: string, total: number }}
 */
function search(query, options = {}) {
  const { limit = 10, category = null } = options;
  const queryWords = extractKeywords(query);

  if (queryWords.length === 0) {
    return { results: [], query, total: 0 };
  }

  // Collect candidates from in-memory index
  let candidates = [...index.values()];

  // Merge DB results if registered
  if (_searchDocs) {
    try {
      const dbDocs = _searchDocs(query, { category }) || [];
      for (const dbDoc of dbDocs) {
        if (!index.has(dbDoc.id)) {
          candidates.push(dbDoc);
        }
      }
    } catch {
      // DB not available — use memory only
    }
  }

  // Filter by category
  if (category) {
    candidates = candidates.filter((d) => d.category === category);
  }

  // Score and filter
  const scored = candidates
    .map((doc) => ({ doc, score: scoreDoc(doc, queryWords) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const results = scored.map(({ doc, score }) => ({
    doc,
    score,
    snippet: extractSnippet(doc.content, queryWords),
  }));

  return { results, query, total: results.length };
}

// ── Point Lookups ────────────────────────────────────────────────────

/**
 * Retrieve a single document by ID. Checks memory then DB.
 * @param {string} id
 * @returns {Object|null}
 */
function getDocument(id) {
  if (index.has(id)) return index.get(id);

  if (_getDocFromDb) {
    try {
      return _getDocFromDb(id) ?? null;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Return a count of indexed docs per category.
 * @returns {{ [category: string]: number }}
 */
function getCategories() {
  const counts = {};
  for (const doc of index.values()) {
    counts[doc.category] = (counts[doc.category] ?? 0) + 1;
  }
  return counts;
}

/**
 * Return all docs, optionally filtered by category.
 * @param {{ category?: string|null }} [options={}]
 * @returns {{ docs: Object[], total: number }}
 */
function getAllDocs(options = {}) {
  const { category = null } = options;
  let docs = [...index.values()];
  if (category) {
    docs = docs.filter((d) => d.category === category);
  }
  return { docs, total: docs.length };
}

/**
 * Return high-level stats about the index.
 * @returns {{ total_docs: number, categories: Object, last_indexed: number|null }}
 */
function getStats() {
  return {
    total_docs: index.size,
    categories: getCategories(),
    last_indexed: _lastIndexed,
  };
}

/**
 * Wipe the in-memory index. Does not touch the registered DB.
 */
function clearIndex() {
  index.clear();
  _lastIndexed = null;
}

// ── Exports ──────────────────────────────────────────────────────────

module.exports = {
  ingestDirectory,
  ingestKnowledgeVault,
  search,
  getDocument,
  getCategories,
  getAllDocs,
  getStats,
  clearIndex,
  registerKnowledgeDb,
  autoIngest,
};
