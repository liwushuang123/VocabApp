/**
 * Build a reverse English→Chinese lookup dictionary from CC-CEDICT.
 *
 * CC-CEDICT format: Traditional Simplified [pinyin] /English def 1/English def 2/
 *
 * We extract English words from definitions and map them back to Chinese translations.
 * Output: public/dict/en-zh.json — a JSON object { "word": "中文 (Chinese)" }
 *
 * For each English word found in a definition, we store the simplified Chinese character
 * and the full English definition. We prefer shorter/simpler Chinese entries (more common words).
 */

const fs = require('fs');
const path = require('path');

const inputFile = process.argv[2] || '/tmp/cedict_ts.u8';
const outputFile = path.join(__dirname, '..', 'public', 'dict', 'en-zh.json');

const raw = fs.readFileSync(inputFile, 'utf-8');
const lines = raw.split('\n');

// Parse CEDICT entries
const entries = [];
for (const line of lines) {
  if (line.startsWith('#') || line.trim() === '') continue;

  // Format: Traditional Simplified [pinyin] /def1/def2/
  // Traditional and Simplified can contain any non-space chars OR be multi-part
  const bracketIdx = line.indexOf('[');
  const slashIdx = line.indexOf('/');
  if (bracketIdx === -1 || slashIdx === -1) continue;

  const beforeBracket = line.substring(0, bracketIdx).trim();
  const parts = beforeBracket.split(/\s+/);
  if (parts.length < 2) continue;

  const simplified = parts[parts.length - 1]; // last part before [pinyin]
  const defsRaw = line.substring(slashIdx + 1, line.lastIndexOf('/'));
  const defs = defsRaw.split('/').map(d => d.trim()).filter(Boolean);

  entries.push({ simplified, defs });
}

console.log(`Parsed ${entries.length} CEDICT entries`);

// Build reverse lookup: English word → { zh, def }
// Strategy: for each definition, extract meaningful English words
// Prefer entries where the Chinese is shorter (more common/basic words)
const dict = {};

// Common English stop words to skip
const stopWords = new Set([
  'a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'is', 'it', 'as',
  'or', 'by', 'be', 'do', 'for', 'and', 'but', 'not', 'with', 'from',
  'that', 'this', 'was', 'are', 'has', 'had', 'have', 'been', 'were',
  'also', 'used', 'one', 'two', 'see', 'i.e', 'e.g', 'etc', 'abbr',
  'lit', 'fig', 'variant', 'old', 'also', 'same',
]);

for (const entry of entries) {
  for (const def of entry.defs) {
    // Skip classifier/measure word entries and very long definitions
    if (def.startsWith('CL:') || def.length > 100) continue;

    // Extract English words from the definition
    const words = def
      .toLowerCase()
      .replace(/\([^)]*\)/g, '') // remove parenthetical notes
      .replace(/[^a-z\s-]/g, ' ')  // keep only letters, spaces, hyphens
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));

    for (const word of words) {
      // Skip if it's just a hyphenated fragment
      if (word.startsWith('-') || word.endsWith('-')) continue;

      const existing = dict[word];
      if (!existing) {
        // First time seeing this word
        dict[word] = { zh: entry.simplified, def };
      } else if (entry.simplified.length < existing.zh.length) {
        // Prefer shorter Chinese (usually more common/basic)
        dict[word] = { zh: entry.simplified, def };
      } else if (
        entry.simplified.length === existing.zh.length &&
        def.toLowerCase() === word // exact single-word definition is best
      ) {
        dict[word] = { zh: entry.simplified, def };
      }
    }

    // Also store the full definition phrase if it's short (1-3 words)
    const cleanDef = def.toLowerCase().replace(/[^a-z\s]/g, '').trim();
    if (cleanDef.split(/\s+/).length <= 3 && cleanDef.length > 2) {
      const existing = dict[cleanDef];
      if (!existing || entry.simplified.length < existing.zh.length) {
        dict[cleanDef] = { zh: entry.simplified, def };
      }
    }
  }
}

console.log(`Built reverse dictionary with ${Object.keys(dict).length} English entries`);

// Write output
fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, JSON.stringify(dict));

const sizeKB = Math.round(fs.statSync(outputFile).size / 1024);
console.log(`Written to ${outputFile} (${sizeKB} KB)`);
