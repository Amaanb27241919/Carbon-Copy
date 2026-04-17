/**
 * html-to-markdown.js — HTML → Markdown converter for Carbon Core v4
 *
 * Referenced from steipete/Demark (MIT, Swift-only) and conduit-mcp (TypeScript).
 * Since Demark requires Swift/WebKit, this module uses Node.js alternatives
 * with the same API surface, so it can be swapped later.
 *
 * Source: https://github.com/steipete/Demark
 *
 * Strategy (in order of availability):
 *   1. @mozilla/readability + turndown   (best accuracy, handles web pages)
 *   2. turndown alone                    (good for well-formed HTML)
 *   3. Regex strip fallback              (last resort, no deps)
 *
 * Install preferred deps:
 *   npm install turndown @mozilla/readability jsdom
 *
 * Usage:
 *   const { htmlToMarkdown, htmlPageToMarkdown } = require('./html-to-markdown');
 *
 *   // Convert a fragment
 *   const md = await htmlToMarkdown('<h1>Hello</h1><p>World</p>');
 *
 *   // Fetch a URL and convert to Markdown (for chunking/embedding)
 *   const md = await htmlPageToMarkdown('https://example.com/docs/api');
 */

'use strict';

// ---------------------------------------------------------------------------
// Core conversion
// ---------------------------------------------------------------------------

/**
 * Convert an HTML string to Markdown.
 *
 * @param {string} html
 * @param {{ headingStyle?: 'atx'|'setext', bulletMarker?: '-'|'*' }} [opts]
 * @returns {Promise<string>}
 */
async function htmlToMarkdown(html, opts = {}) {
  if (!html || typeof html !== 'string') return '';

  // Strategy 1: turndown (npm install turndown)
  try {
    const TurndownService = require('turndown');
    const td = new TurndownService({
      headingStyle:    opts.headingStyle ?? 'atx',
      bulletListMarker: opts.bulletMarker ?? '-',
      codeBlockStyle:  'fenced',
    });
    return td.turndown(html).trim();
  } catch (turndownErr) {
    if (turndownErr.code !== 'MODULE_NOT_FOUND') throw turndownErr;
  }

  // Strategy 2: regex strip (no deps — lossy but always available)
  return _regexStrip(html);
}

/**
 * Fetch a web page and convert it to clean Markdown.
 * Uses Mozilla Readability to extract the article body before converting.
 *
 * @param {string} url
 * @param {{ headingStyle?: 'atx'|'setext', timeout?: number }} [opts]
 * @returns {Promise<{ markdown: string, title: string, url: string }>}
 */
async function htmlPageToMarkdown(url, opts = {}) {
  const controller = new AbortController();
  const timeoutMs  = opts.timeout ?? 10_000;
  const timer      = setTimeout(() => controller.abort(), timeoutMs);

  let html;
  try {
    const res = await fetch(url, { signal: controller.signal });
    html = await res.text();
  } finally {
    clearTimeout(timer);
  }

  let title = '';
  let body  = html;

  // Try Readability for cleaner extraction
  try {
    const { JSDOM }       = require('jsdom');
    const { Readability } = require('@mozilla/readability');
    const dom     = new JSDOM(html, { url });
    const article = new Readability(dom.window.document).parse();
    if (article) {
      body  = article.content;
      title = article.title ?? '';
    }
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND') {
      // JSDOM/Readability available but failed — fall through to raw HTML
    }
  }

  const markdown = await htmlToMarkdown(body, opts);
  return { markdown, title, url };
}

// ---------------------------------------------------------------------------
// Internal: regex-based fallback (no deps)
// ---------------------------------------------------------------------------

function _regexStrip(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, t) => `${'#'.repeat(Number(n))} ${_stripTags(t)}\n\n`)
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, (_, t) => `**${_stripTags(t)}**`)
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi,         (_, t) => `*${_stripTags(t)}*`)
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi,     (_, t) => `\`${_stripTags(t)}\``)
    .replace(/<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => `[${_stripTags(text)}](${href})`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi,         (_, t) => `- ${_stripTags(t).trim()}\n`)
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi,           (_, t) => `${_stripTags(t).trim()}\n\n`)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function _stripTags(str) {
  return (str || '').replace(/<[^>]+>/g, '');
}

module.exports = { htmlToMarkdown, htmlPageToMarkdown };
