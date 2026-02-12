/**
 * Build a reverse English→Chinese lookup dictionary from CC-CEDICT.
 *
 * CC-CEDICT format: Traditional Simplified [pinyin] /English def 1/English def 2/
 *
 * We extract English words from definitions and map them back to Chinese translations.
 * Output: public/dict/en-zh.json — a JSON object { "word": { zh, def, pinyin } }
 *
 * Scoring strategy (higher = better):
 *   - Exact match bonus reduced (+40) to avoid archaic single-char dominance
 *   - Definition starts with the word (+30)
 *   - Single-word definition matching target (+25)
 *   - 2-character Chinese strongly preferred (+30) — most natural in modern Chinese
 *   - 3-character Chinese preferred (+20)
 *   - 4-character Chinese (chengyu/compounds) (+10)
 *   - 1-character Chinese heavily penalized (-80) — often literary/archaic
 *   - Archaic/variant/surname entries filtered out entirely
 *   - Non-CJK translations filtered out
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

// Patterns that indicate archaic, variant, surname, or low-quality entries
const skipPatterns = [
  /\barchaic\b/i,
  /\bold variant\b/i,
  /\bvariant of\b/i,
  /\bsee [A-Z\u4e00-\u9fff]/,  // "see X" cross-references
  /\bsurname\b/i,
  /\babbr\.\s*(for|of)\b/i,
  /\bused in\b/i,
  /\bplace name\b/i,
  /\bcounty in\b/i,
  /\bprovince\b/i,
  /\bdistrict in\b/i,
  /\btownship in\b/i,
  /\bcity in\b/i,
  /\bhistorical\b/i,
  /\bobsolete\b/i,
  /\bdialect\b/i,
  /\bliterary\b/i,
  /\bclassical\b/i,
  /\bBuddhism\b/i,
  /\bBuddhist\b/i,
  /\bSanskrit\b/i,
  /\bTaoism\b/i,
  /\bTaoist\b/i,
  /\bConfuci/i,
  /\bslang\b/i,
  /\bInternet slang\b/i,
  /\bcolloquial\b/i,
  /\bvulgar\b/i,
  /\bderogatory\b/i,
  /\boffensive\b/i,
  /\btaboo\b/i,
  /\berhua variant\b/i,
  /\bTw\b/,           // Taiwan-specific variant marker
  /\bJapanese\b/i,
  /\bKorean\b/i,
  /\bVietnamese\b/i,
  /\bCantonese\b/i,
  /\bMinnan\b/i,
  /\bHokkien\b/i,
  /\bname of\b/i,     // "name of a place/person"
  /\bsame as\b/i,
];

/**
 * Check if a Chinese string contains only valid CJK characters.
 * Filters out entries that are Latin letters, digits, or symbols.
 */
function isValidChinese(zh) {
  return /^[\u4e00-\u9fff\u3400-\u4dbf]+$/.test(zh);
}

/**
 * Check if a definition indicates an archaic, variant, or low-quality entry.
 */
function shouldSkipDef(def) {
  return skipPatterns.some(p => p.test(def));
}

/**
 * Score a candidate translation for a given English word.
 * Higher score = better translation.
 */
function scoreCandidate(word, entry, def) {
  let score = 0;
  const cleanDef = def.toLowerCase().replace(/\([^)]*\)/g, '').trim();
  const zhLen = entry.simplified.length;

  // Exact match: the entire definition is exactly the word (reduced from 100)
  if (cleanDef === word) {
    score += 40;
  }
  // Single-word definition that matches
  else if (cleanDef.split(/\s+/).length === 1 && cleanDef === word) {
    score += 25;
  }
  // Definition starts with the word (e.g., "run" matches "run; to jog")
  else if (cleanDef.startsWith(word + ' ') || cleanDef.startsWith(word + ';') || cleanDef.startsWith(word + ',')) {
    score += 30;
  }
  // "to <word>" pattern — very common in CEDICT (e.g., "to control")
  else if (cleanDef === 'to ' + word || cleanDef.startsWith('to ' + word + ' ') || cleanDef.startsWith('to ' + word + ';')) {
    score += 28;
  }

  // Strongly prefer 2-character Chinese words (most natural in modern Chinese)
  if (zhLen === 2) {
    score += 30;
  } else if (zhLen === 1) {
    // Single characters are very often literary/classical — heavy penalty
    score -= 80;
  } else if (zhLen === 3) {
    score += 20;
  } else if (zhLen === 4) {
    // 4-char can be chengyu (idioms) — still useful
    score += 10;
  } else if (zhLen >= 5) {
    // Long compounds are usually too specific
    score -= 5;
  }

  // Prefer shorter definitions (less ambiguous, more direct translations)
  score -= Math.min(def.length, 50) * 0.2;

  return score;
}

for (const entry of entries) {
  // Skip entries that aren't valid Chinese characters (filters %, A, B, 3P, etc.)
  if (!isValidChinese(entry.simplified)) continue;

  for (const def of entry.defs) {
    // Skip classifier/measure word entries and very long definitions
    if (def.startsWith('CL:') || def.length > 100) continue;

    // Skip archaic, variant, surname, geographic, and low-quality entries
    if (shouldSkipDef(def)) continue;

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

// Apply curated overrides — these always win over auto-generated entries
const overridesFile = path.join(__dirname, '..', 'public', 'dict', 'overrides.json');
if (fs.existsSync(overridesFile)) {
  const overrides = JSON.parse(fs.readFileSync(overridesFile, 'utf-8'));
  let overrideCount = 0;
  for (const [word, entry] of Object.entries(overrides)) {
    dict[word] = entry;
    overrideCount++;
  }
  console.log(`Applied ${overrideCount} curated overrides`);
}

// Write output
fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, JSON.stringify(dict));

const sizeKB = Math.round(fs.statSync(outputFile).size / 1024);
console.log(`Written to ${outputFile} (${sizeKB} KB)`);
