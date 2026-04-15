/**
 * Knowledge Importer — Carbon Core v2
 * Imports rawgrowth-os knowledge base into Carbon Core
 *
 * Scans markdown files from rawgrowth-os/knowledge/ directories
 * and indexes them into the knowledge_docs SQLite table.
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join, relative, extname, basename } from 'path';
import crypto from 'crypto';

// Default source path
const DEFAULT_SOURCE = '/Users/amaankhan/Desktop/OmniFlow/Raw/rawgrowth-os/knowledge';

// ── DB Registration ─────────────────────────────────────────────────

let _db = null;

export function registerKnowledgeDb(db) {
  _db = db;
}

// ── Import Functions ────────────────────────────────────────────────

/**
 * Import all markdown files from a knowledge base directory.
 * Maps subdirectories to categories.
 */
export function importKnowledgeBase(sourceDir = DEFAULT_SOURCE, options = {}) {
  if (!existsSync(sourceDir)) {
    return { imported: 0, skipped: 0, errors: [], error: `Source not found: ${sourceDir}` };
  }

  const results = { imported: 0, skipped: 0, errors: [], categories: {} };

  // Scan top-level dirs as categories
  const entries = readdirSync(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const category = entry.name;
    const categoryPath = join(sourceDir, category);
    const files = findMarkdownFiles(categoryPath);

    results.categories[category] = 0;

    for (const filePath of files) {
      try {
        const doc = parseMarkdownDoc(filePath, category, sourceDir);
        if (_db) upsertDoc(_db, doc);
        results.imported++;
        results.categories[category]++;
      } catch (e) {
        results.errors.push({ file: filePath, error: e.message });
        results.skipped++;
      }
    }
  }

  // Also scan root-level md files
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      try {
        const doc = parseMarkdownDoc(join(sourceDir, entry.name), 'general', sourceDir);
        if (_db) upsertDoc(_db, doc);
        results.imported++;
      } catch (e) {
        results.errors.push({ file: entry.name, error: e.message });
      }
    }
  }

  console.log(`[knowledge] Imported ${results.imported} docs (${results.skipped} skipped)`);
  return results;
}

/**
 * Search imported knowledge docs.
 */
export function searchKnowledge(query, category, limit = 10) {
  if (!_db) return [];

  try {
    if (category) {
      return _db.prepare(`
        SELECT * FROM knowledge_docs
        WHERE (title LIKE ? OR content LIKE ?) AND category = ?
        ORDER BY indexed_at DESC LIMIT ?
      `).all(`%${query}%`, `%${query}%`, category, limit);
    }
    return _db.prepare(`
      SELECT * FROM knowledge_docs
      WHERE title LIKE ? OR content LIKE ?
      ORDER BY indexed_at DESC LIMIT ?
    `).all(`%${query}%`, `%${query}%`, limit);
  } catch {
    return [];
  }
}

export function getImportStatus() {
  if (!_db) return { total: 0, by_category: {} };
  try {
    const total = _db.prepare('SELECT COUNT(*) as c FROM knowledge_docs').get()?.c || 0;
    const byCat = _db.prepare('SELECT category, COUNT(*) as c FROM knowledge_docs GROUP BY category').all();
    return { total, by_category: Object.fromEntries(byCat.map(r => [r.category, r.c])) };
  } catch {
    return { total: 0, by_category: {} };
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function findMarkdownFiles(dir) {
  const files = [];
  if (!existsSync(dir)) return files;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) files.push(...findMarkdownFiles(fullPath));
      else if (entry.isFile() && entry.name.endsWith('.md')) files.push(fullPath);
    }
  } catch { /* skip unreadable dirs */ }
  return files;
}

function parseMarkdownDoc(filePath, category, baseDir) {
  const content = readFileSync(filePath, 'utf-8');
  const relPath = relative(baseDir, filePath);

  // Extract YAML frontmatter
  const frontmatter = {};
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (fmMatch) {
    for (const line of fmMatch[1].split('\n')) {
      const [key, ...valueParts] = line.split(':');
      if (key && valueParts.length) frontmatter[key.trim()] = valueParts.join(':').trim().replace(/^"|"$/g, '');
    }
  }

  // Extract title from first H1 or filename
  const h1Match = content.match(/^#\s+(.+)$/m);
  const title = frontmatter.title || h1Match?.[1] || basename(filePath, '.md');

  // Extract keywords from tags or content
  const tags = frontmatter.tags ? String(frontmatter.tags).replace(/[\[\]"']/g, '').split(',').map(t => t.trim()).join(' ') : '';

  // Determine subcategory from path
  const pathParts = relPath.split('/');
  const subcategory = pathParts.length > 2 ? pathParts[1] : null;

  // Body (strip frontmatter)
  const body = fmMatch ? content.slice(fmMatch[0].length) : content;

  return {
    id: crypto.createHash('md5').update(filePath).digest('hex'),
    category,
    subcategory,
    file_path: relPath,
    title: title.slice(0, 200),
    content: body.slice(0, 50000), // Cap at 50KB
    keywords: tags,
    indexed_at: new Date().toISOString(),
  };
}

function upsertDoc(db, doc) {
  db.prepare(`
    INSERT OR REPLACE INTO knowledge_docs
      (id, category, subcategory, file_path, title, content, keywords, indexed_at)
    VALUES
      (@id, @category, @subcategory, @file_path, @title, @content, @keywords, @indexed_at)
  `).run(doc);
}
