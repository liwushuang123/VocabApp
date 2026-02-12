/**
 * Build a reverse English→Chinese lookup dictionary from CC-CEDICT.
 *
 * CC-CEDICT format: Traditional Simplified [pinyin] /English def 1/English def 2/
 *
 * We extract English words from definitions and map them back to Chinese translations.
 * Output: public/dict/en-zh.json — a JSON object { "word": { zh, def, pinyin } }
 *
 * Scoring strategy (higher = better):
 *   - Exact match: definition is exactly the target word (+100)
 *   - Definition starts with the word (+30)
 *   - Single-word definition matching target (+50)
 *   - 2-character Chinese preferred (+20) — most natural in modern Chinese
 *   - 1-character Chinese penalized (-15) — often literary/archaic
 *   - Shorter definitions preferred (less ambiguity)
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
  const bracketIdx = line.indexOf('[');
  const closeBracketIdx = line.indexOf(']');
  const slashIdx = line.indexOf('/');
  if (bracketIdx === -1 || closeBracketIdx === -1 || slashIdx === -1) continue;

  const beforeBracket = line.substring(0, bracketIdx).trim();
  const parts = beforeBracket.split(/\s+/);
  if (parts.length < 2) continue;

  const simplified = parts[parts.length - 1]; // last part before [pinyin]
  const pinyin = line.substring(bracketIdx + 1, closeBracketIdx).trim();
  const defsRaw = line.substring(slashIdx + 1, line.lastIndexOf('/'));
  const defs = defsRaw.split('/').map(d => d.trim()).filter(Boolean);

  entries.push({ simplified, pinyin, defs });
}

console.log(`Parsed ${entries.length} CEDICT entries`);

// Build reverse lookup: English word → { zh, def, pinyin }
const dict = {};

// Common English stop words to skip
const stopWords = new Set([
  'a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'is', 'it', 'as',
  'or', 'by', 'be', 'do', 'for', 'and', 'but', 'not', 'with', 'from',
  'that', 'this', 'was', 'are', 'has', 'had', 'have', 'been', 'were',
  'also', 'used', 'one', 'two', 'see', 'i.e', 'e.g', 'etc', 'abbr',
  'lit', 'fig', 'variant', 'old', 'also', 'same',
]);

/**
 * Score a candidate translation for a given English word.
 * Higher score = better translation.
 */
function scoreCandidate(word, entry, def) {
  let score = 0;
  const cleanDef = def.toLowerCase().replace(/\([^)]*\)/g, '').trim();
  const zhLen = entry.simplified.length;

  // Exact match: the entire definition is exactly the word
  if (cleanDef === word) {
    score += 100;
  }
  // Single-word definition that matches
  else if (cleanDef.split(/\s+/).length === 1 && cleanDef === word) {
    score += 50;
  }
  // Definition starts with the word (e.g., "run" matches "run; to jog")
  else if (cleanDef.startsWith(word + ' ') || cleanDef.startsWith(word + ';') || cleanDef.startsWith(word + ',')) {
    score += 30;
  }

  // Prefer 2-character Chinese words (most natural in modern Chinese)
  if (zhLen === 2) {
    score += 20;
  } else if (zhLen === 1) {
    // Single characters are often literary/classical — penalize slightly
    score -= 15;
  } else if (zhLen === 3) {
    score += 10;
  } else if (zhLen === 4) {
    // 4-char can be chengyu (idioms) — still useful but less common in speech
    score += 5;
  }

  // Prefer shorter definitions (less ambiguous, more direct translations)
  score -= Math.min(def.length, 50) * 0.2;

  return score;
}

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

      const candidateScore = scoreCandidate(word, entry, def);
      const existing = dict[word];

      if (!existing || candidateScore > existing._score) {
        dict[word] = {
          zh: entry.simplified,
          def,
          pinyin: entry.pinyin,
          _score: candidateScore,
        };
      }
    }

    // Also store the full definition phrase if it's short (1-3 words)
    const cleanDef = def.toLowerCase().replace(/[^a-z\s]/g, '').trim();
    if (cleanDef.split(/\s+/).length <= 3 && cleanDef.length > 2) {
      const candidateScore = scoreCandidate(cleanDef, entry, def);
      const existing = dict[cleanDef];
      if (!existing || candidateScore > existing._score) {
        dict[cleanDef] = {
          zh: entry.simplified,
          def,
          pinyin: entry.pinyin,
          _score: candidateScore,
        };
      }
    }
  }
}

// Remove internal scoring field before output
for (const key of Object.keys(dict)) {
  delete dict[key]._score;
}

console.log(`Built reverse dictionary with ${Object.keys(dict).length} English entries`);

// Write output
fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, JSON.stringify(dict));

const sizeKB = Math.round(fs.statSync(outputFile).size / 1024);
console.log(`Written to ${outputFile} (${sizeKB} KB)`);
