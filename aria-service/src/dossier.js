'use strict';

const { query } = require('./services/db');
const modelClient = require('./services/model-client');

/**
 * Dossier — document vault with AI summarization and context injection.
 * Files are stored with extracted text and AI summaries in PostgreSQL.
 */

async function addFile(clientId, filename, extractedText, filePath) {
  // Generate AI summary
  let aiSummary = '';
  try {
    const result = await modelClient.chat([
      {
        role: 'system',
        content: 'You are a document analyst. Summarize documents concisely in 2-3 sentences, highlighting key business facts.',
      },
      {
        role: 'user',
        content: `Summarize this document:\n\nFilename: ${filename}\n\n${extractedText.substring(0, 3000)}`,
      },
    ]);
    aiSummary = result.response;
  } catch (e) {
    aiSummary = 'Summary unavailable';
  }

  const result = await query(
    `INSERT INTO aria_dossier_files (id, client_id, filename, extracted_text, ai_summary, file_path, uploaded_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
     RETURNING *`,
    [clientId, filename, extractedText, aiSummary, filePath]
  );
  return result.rows[0];
}

async function getClientFiles(clientId, limit = 20) {
  const result = await query(
    `SELECT id, client_id, filename, ai_summary, file_path, uploaded_at
     FROM aria_dossier_files
     WHERE client_id = $1
     ORDER BY uploaded_at DESC
     LIMIT $2`,
    [clientId, limit]
  );
  return result.rows;
}

async function getFile(fileId) {
  const result = await query(
    'SELECT * FROM aria_dossier_files WHERE id = $1',
    [fileId]
  );
  return result.rows[0] || null;
}

async function deleteFile(fileId) {
  await query('DELETE FROM aria_dossier_files WHERE id = $1', [fileId]);
}

async function searchFiles(clientId, queryText, limit = 5) {
  const result = await query(
    `SELECT id, filename, ai_summary, file_path, uploaded_at,
       CASE
         WHEN extracted_text ILIKE $2 THEN 3
         WHEN ai_summary ILIKE $2 THEN 2
         WHEN filename ILIKE $2 THEN 1
         ELSE 0
       END AS match_score
     FROM aria_dossier_files
     WHERE client_id = $1
       AND (extracted_text ILIKE $2 OR ai_summary ILIKE $2 OR filename ILIKE $2)
     ORDER BY match_score DESC, uploaded_at DESC
     LIMIT $3`,
    [clientId, `%${queryText}%`, limit]
  );
  return result.rows;
}

async function enhanceMissionContext(clientId, goal, existingContext) {
  const relevantFiles = await searchFiles(clientId, goal, 5);

  if (relevantFiles.length === 0) {
    return { enhanced: false, context: existingContext };
  }

  const fileContext = relevantFiles.map(f => `- ${f.filename}: ${f.ai_summary}`).join('\n');

  const enhancedContext = `RELEVANT DOCUMENTS:\n${fileContext}\n\nORIGINAL CONTEXT:\n${existingContext}`;

  return {
    enhanced: true,
    context: enhancedContext,
    files: relevantFiles,
  };
}

module.exports = { addFile, getClientFiles, getFile, deleteFile, searchFiles, enhanceMissionContext };
