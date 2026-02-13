# FOR CLAUDE — The VocabApp Field Guide

*Everything you need to understand this project, told like a story, not a textbook.*

---

## What Is This Thing?

Imagine you're a Chinese-speaking student trying to read an English novel. Every few sentences you hit an unfamiliar word. You pull out your phone, open a dictionary app, type the word in, read the translation, go back to your book... and by the time you've done this ten times, you've lost the thread of the story entirely.

VocabApp kills that friction. You upload a PDF or paste an article, read it right in the app, and when you see a word you don't know — you just *tap it*. Boom: Chinese translation, English definition, pronunciation. One more tap saves it to your personal word bank. Later, the app quizzes you on those words using a scientifically-proven flashcard system that spaces out reviews so you actually remember them long-term.

It's a reading app and a vocabulary trainer that share the same brain.

---

## The Architecture — How the Pieces Fit Together

Think of VocabApp like a restaurant. There's a **dining room** (what the user sees), a **kitchen** (the server that does the heavy lifting), and a **pantry** (the database where everything is stored).

### The Dining Room: Next.js + React Frontend

```
app/
├── page.tsx                    # Home / landing page
├── login/page.tsx              # Sign in
├── signup/page.tsx             # Create account
├── read/
│   ├── page.tsx                # Upload PDF or paste article
│   ├── [bookId]/page.tsx       # PDF reader (the star of the show)
│   └── article/page.tsx        # Article reader
├── bookshelf/page.tsx          # Your library of uploaded PDFs
└── vocab/
    ├── page.tsx                # Saved words list
    └── review/page.tsx         # Flashcard review session
```

Everything runs in the browser. The app is built with **Next.js 16** (App Router) and **React 19**. We use Next.js's file-based routing — each folder in `app/` maps directly to a URL. No React Router config to maintain; the filesystem *is* the router.

The UI is styled with **Tailwind CSS 4**, which lets us write responsive layouts inline. No separate CSS files, no naming conventions to argue about — just utility classes right on the elements. `className="text-2xl font-bold"` is the entire styling story for a heading.

### The Kitchen: API Routes + Translation Engine

The server-side brains live in `app/api/translate/route.ts`. When a user taps a word, here's what happens behind the scenes:

```
User taps "ephemeral"
         │
         ▼
   /api/translate?word=ephemeral
         │
         ├─── Step 1: Ask MyMemory API (online translation service)
         │    ✓ Returns "短暂的" → done!
         │    ✗ Failed? (no internet, rate limited, etc.)
         │
         ├─── Step 2: Look up CC-CEDICT dictionary (offline, bundled in the app)
         │    100K+ entries, with 600+ hand-curated overrides
         │    ✓ Found it → return translation
         │    ✗ Not found → return null
         │
         └─── Meanwhile (in the browser): fetch English definition
              from Free Dictionary API
```

This "try online first, fall back to offline" pattern is the translation system's secret weapon. A language learner on an airplane still gets translations. The quality degrades slightly (online translations are more natural), but the app never becomes useless.

### The Pantry: Supabase

**Supabase** is our entire backend — authentication, database, and file storage in one service. Think of it as "Firebase, but with a real PostgreSQL database underneath."

Three main tables:

| Table | What It Stores | Key Fields |
|-------|---------------|------------|
| `words` | Saved vocabulary | word, translation, definition, example, audio_url, SM-2 state (repetitions, ease_factor, interval_days, next_review_at), category |
| `books` | Uploaded PDFs | title, pdf_storage_path, current_page, total_pages, last_read_at |
| Users | Auth accounts | Handled automatically by Supabase Auth |

PDFs themselves live in **Supabase Storage** (an S3-like file bucket). The `books` table just stores a pointer (`pdf_storage_path`) to where the file lives.

---

## The Codebase — A Map

```
VocabApp/
│
├── app/                          # Next.js pages & API routes
│   └── api/translate/route.ts    # The translation endpoint
│
├── components/
│   ├── pdf/
│   │   ├── PdfViewer.tsx         # The PDF reader (most complex component)
│   │   └── WordPopup.tsx         # Translation popup when you tap a word
│   └── ui/
│       ├── BottomNav.tsx         # Mobile bottom navigation bar
│       └── LayoutShell.tsx       # Page layout wrapper
│
├── lib/
│   ├── services/
│   │   ├── words.ts              # CRUD for vocabulary (5 functions)
│   │   ├── books.ts              # CRUD for books (5 functions)
│   │   └── storage.ts            # PDF upload/download
│   ├── spaced-repetition/
│   │   └── sm2.ts                # The SM-2 algorithm (43 lines that power all reviews)
│   └── supabase/
│       ├── client.ts             # Browser-side Supabase client
│       ├── server.ts             # Server-side Supabase client
│       └── middleware.ts         # Auth checks on every request
│
├── public/dict/
│   ├── en-zh.json                # CC-CEDICT reverse dictionary (built on demand)
│   └── overrides.json            # 600+ hand-curated translations
│
├── scripts/
│   └── build-dict.js             # Downloads CEDICT, parses it, builds en-zh.json
│
├── middleware.ts                  # Next.js middleware entry point (auth gating)
├── next.config.ts                # Turbopack config (canvas stub for PDF.js)
└── package.json                  # Dependencies and scripts
```

### How the Pieces Connect

Here's the data flow for the most important user action — **reading a PDF and saving a word**:

```
1. User opens /read/[bookId]
   └─ books.ts → getBook(id) → fetches book metadata from Supabase
   └─ storage.ts → getSignedUrl() → gets a temporary URL for the PDF file

2. PdfViewer.tsx renders the PDF
   └─ react-pdf → PDF.js renders pages as canvas + invisible text layer
   └─ Custom touch/click handlers detect word selection

3. User long-presses a word (mobile) or double-clicks (desktop)
   └─ getWordRangeAtPoint() uses caretRangeFromPoint browser API
   └─ Expands selection to full word boundaries
   └─ Draws green highlight rectangles over the word
   └─ Shows floating "Look up" button

4. User taps "Look up"
   └─ WordPopup.tsx opens
   └─ Fetches /api/translate?word=X (Chinese translation)
   └─ Fetches Free Dictionary API (English definition + audio)

5. User taps "Save"
   └─ words.ts → createWord() → inserts into Supabase with:
      { word, translation, definition, example, audio_url,
        repetitions: 0, ease_factor: 2.5, interval_days: 0,
        next_review_at: now(), category: "learning" }
```

And the **flashcard review** flow:

```
1. User opens /vocab/review
   └─ words.ts → getDueWords() → SELECT * WHERE next_review_at <= now()

2. Flashcard shows the word, user taps to reveal answer

3. User rates: Hard (1) / Neutral (3) / Easy (5)
   └─ sm2.ts computes new state:
      - Easy? Longer interval, higher ease factor
      - Hard? Reset to interval=1, ease drops
   └─ words.ts → updateWord() → persists new SM-2 state
   └─ Category updates: Easy→"learned", Hard→"difficult", Neutral→"learning"
```

---

## Technology Decisions — The "Why" Behind Every Choice

### Next.js 16 (App Router)

**Why not a plain React SPA?** Because we needed a server. The translation API can't run in the browser (it loads a 100K-entry dictionary into memory and makes server-to-server API calls). Next.js gives us frontend + backend in one codebase. The App Router's file-based routing means adding a new page is literally creating a new folder.

**Why not separate frontend + Express backend?** Deployment complexity. With Next.js, it's one thing to deploy, one thing to monitor, one URL to share.

### Supabase (instead of building our own backend)

Building auth, a database layer, and file storage from scratch would have tripled the project scope. Supabase gives us:
- **Auth** with email/password out of the box — no JWT implementation, no password hashing, no session management
- **PostgreSQL** with row-level security — the database enforces that users can only see their own data
- **Storage** for PDFs with signed URLs — files are private, temporary download links generated on demand

The tradeoff: vendor lock-in. But for a project this size, the speed gain is worth it.

### react-pdf (PDF.js wrapper)

There's really only one serious option for rendering PDFs in the browser: Mozilla's PDF.js. `react-pdf` wraps it in React components so we get `<Document>` and `<Page>` instead of imperative canvas manipulation. The key feature is the **text layer** — an invisible HTML overlay that makes words selectable.

One gotcha: PDF.js tries to import `canvas` (a Node.js package for server-side rendering). Since we only render PDFs in the browser, we stub it out:

```typescript
// next.config.ts
turbopack: {
  resolveAlias: {
    canvas: "./empty-module.ts",  // "No thanks, PDF.js, we don't need that"
  },
},
```

### SM-2 Spaced Repetition

The SM-2 algorithm is the beating heart of flashcard apps like Anki. In 43 lines of TypeScript, it decides when you should see each word again. The core idea:

- **First time you get a word right:** See it again tomorrow.
- **Second time right:** See it in 6 days.
- **After that:** The interval multiplies by your "ease factor" (starts at 2.5).
- **Got it wrong?** Back to square one — see it again tomorrow.

We simplified the traditional 6-button scale to 3 buttons (Hard / Neutral / Easy) because research on mobile UX shows that too many choices create decision fatigue. Three is enough for the algorithm to work; six makes users anxious about picking the "right" rating.

### Tailwind CSS 4

No CSS-in-JS runtime overhead, no styled-components, no CSS modules. Just utility classes. The entire app's styling is visible right in the JSX. This is a controversial choice — some people hate reading `className="flex items-center justify-between px-4 py-3"` — but for a solo/small-team project, the speed boost is real. No context-switching between files, no naming things.

---

## Challenges & Bugs — The War Stories

### The Great Dictionary Disaster

This was the biggest "oh no" moment of the project. The app originally used CC-CEDICT (a Chinese→English dictionary) in reverse as an English→Chinese lookup. Sounds reasonable, right?

Wrong. Catastrophically wrong.

Looking up "control" returned 乂 — a character so obscure that most Chinese native speakers have never seen it. "Aggregates" returned 五蕴 (a Buddhist concept). "Spring" returned a term for a type of ancient Chinese drum.

**Why it happened:** CC-CEDICT entries are `Chinese → English`. Reversing them creates a many-to-one mapping where the *simplest* English definition matches first — and the simplest definitions often belong to the most archaic characters.

**How we fixed it (three layers):**

1. **Switched to MyMemory API as primary** — an actual translation service designed for English→Chinese. This solved 95% of cases immediately.

2. **Hand-curated 600+ overrides** (`public/dict/overrides.json`) — for the most common English words, a human verified the correct Chinese translation. These override the dictionary when it's rebuilt.

3. **Smarter scoring in the dictionary build** — single-character results get an 80-point penalty, archaic/Buddhist/literary entries are filtered out, and 2-3 character modern Chinese words get bonus points.

**The lesson:** Don't flip a tool backwards and expect it to work. A Chinese→English dictionary is not an English→Chinese dictionary, just like a Spanish→English phrasebook doesn't help you speak Spanish.

### The Mobile Touch Minefield

"Let users tap a word to look it up." Sounds like a one-liner. It was weeks of work.

The problem: on a phone, a single touch can mean at least five different things — tap (flip page), long press (select word), swipe (scroll), double-tap (zoom), or press-and-drag (text selection). The browser has default behaviors for all of these, and they all fight with each other.

**The solution was zoning:**
- Left 20% of screen → previous page
- Right 20% → next page
- Center 60% → toggle page controls on tap, select word on long-press (400ms)

The 400ms long-press threshold was discovered through trial and error. 300ms felt accidental (triggered during normal scrolling). 500ms felt sluggish. 400ms was the Goldilocks zone.

We also had to suppress the browser's native text selection UI (the blue highlight, the copy/paste bubble, the selection handles) with CSS, then draw our own green highlight rectangles using position data from the PDF text layer. This is one of those places where the browser is actively working against you, and you have to override it piece by piece.

**The code that makes this work** lives in `components/pdf/PdfViewer.tsx` — it's the most complex component in the app, handling touch events, word detection, highlight rendering, page navigation, and popup positioning all in one file.

### The PDF.js Canvas Stub

PDF.js was designed to work in both browsers and Node.js. In Node, it uses the `canvas` npm package for server-side rendering. Next.js tries to bundle the server-side code, sees the `canvas` import, and panics because it's a native module that can't be bundled.

We don't need server-side PDF rendering — we only render PDFs in the browser. The fix is a one-liner that tells the bundler to replace `canvas` with an empty module:

```typescript
// next.config.ts — "Dear bundler, when PDF.js asks for canvas, give it nothing"
resolveAlias: { canvas: "./empty-module.ts" }
```

This is the kind of bug that takes hours to diagnose and one line to fix. The error message (`Can't resolve 'canvas'`) doesn't tell you *why* it's being imported or that you can safely stub it out.

### Authentication Middleware — The Bouncer Pattern

The auth system uses a middleware "bouncer" (`middleware.ts` + `lib/supabase/middleware.ts`) that checks every single request:

```
Every request → middleware runs
  ├── Is this a protected route? (/vocab, /bookshelf, /read)
  │   ├── User logged in? → pass through
  │   └── Not logged in? → redirect to /login?redirectTo=/original-path
  │
  └── Is this an auth page? (/login, /signup)
      ├── User already logged in? → redirect to home
      └── Not logged in? → pass through
```

The `redirectTo` query parameter is a small but important UX detail. If you try to visit `/vocab` while logged out, you get sent to `/login?redirectTo=/vocab`. After logging in, you land on `/vocab` — not the home page. The app remembers where you were trying to go.

---

## Lessons Learned — What Good Engineers Take Away

### 1. Use the right tool for the job (not the clever hack)

The dictionary reversal story is a perfect example. We had a Chinese→English dictionary and *cleverly* reversed it. Clever solutions feel good to write but often produce subtle, hard-to-debug failures. The "boring" solution — using an actual translation API — worked immediately and accurately.

**Takeaway:** Before building something clever, check if someone's already built the boring version. They usually have, and it usually works better.

### 2. Touch interaction is a minefield of competing gestures

Every touch gesture you add to a mobile web app is carved out of gestures the browser already owns. Long-press competes with context menus. Swipe competes with scroll. Double-tap competes with zoom. You're not adding gestures to a blank canvas — you're *negotiating territory* with the browser.

**Takeaway:** Test on real devices early. The iOS simulator and Chrome DevTools touch emulation lie to you in subtle ways.

### 3. The "fallback pattern" is underrated

The translation system's `try online → fall back to offline` pattern is simple but powerful. It means the app gracefully degrades instead of breaking. This pattern applies broadly:

- API call fails? Use cached data.
- Cloud service is down? Use local storage.
- Premium feature expired? Degrade to basic functionality.

**Takeaway:** Always ask "what happens when this fails?" and build a fallback, even a crappy one. An imperfect offline dictionary beats a loading spinner.

### 4. Curated data > clever algorithms (for the common case)

600 hand-picked translations fixed more real-user problems than weeks of algorithm tuning on the dictionary scoring system. The Pareto principle is brutally real: 80% of lookups are for the same few hundred common words. Nail those, and most users never see a bad translation.

**Takeaway:** Before optimizing the general case, solve the specific cases your users actually hit. A lookup table is embarrassingly simple and embarrassingly effective.

### 5. Auth middleware saves you from yourself

Putting auth checks in middleware (rather than in each page component) means you can't accidentally forget to protect a route. It's the difference between "every page is public unless you remember to add a guard" and "every page is guarded unless you explicitly make it public."

**Takeaway:** Security-by-default beats security-by-remembering.

### 6. PDF text layers are a hidden gem

Most developers think of PDFs as images. PDF.js's text layer turns them into interactive documents. But the text layer is invisible HTML positioned over the canvas, which means your CSS has to be precise, and any browser text selection behavior you don't explicitly suppress will create visual artifacts.

**Takeaway:** Powerful abstractions (like PDF text layers) often come with a "hidden tax" of CSS and event handling that the docs don't mention. Budget time for it.

### 7. The SM-2 algorithm is simpler than you think

The entire review engine is 43 lines of TypeScript. The math is two formulas from a 1987 paper. Yet it powers billion-dollar products (Anki, SuperMemo). The hard part isn't the algorithm — it's the UX around it: how many buttons, what labels, how to show progress, when to schedule sessions.

**Takeaway:** Don't be intimidated by "algorithm" in the requirements. Read the paper. It's probably simpler than you expect. The engineering challenge is usually in the surrounding system, not the algorithm itself.

### 8. Vendor lock-in is a feature, not just a risk

Supabase handles auth, database, and file storage. Yes, migrating away would be painful. But choosing Supabase meant we *didn't* have to:
- Set up a PostgreSQL server
- Implement JWT-based auth
- Build a file upload service
- Write database migration scripts
- Set up row-level security policies from scratch

For an MVP or a small-team project, the productivity gain outweighs the lock-in risk. You can always migrate later — if you have users. And you won't have users if you spend three months building infrastructure.

**Takeaway:** Pick the tool that lets you ship. Worry about migration when you have the problem of having too many users.

---

## Quick Reference — Commands and Scripts

```bash
npm run dev          # Start dev server (localhost:3000)
npm run build        # Production build
npm run start        # Run production server
npm run build-dict   # Rebuild the Chinese dictionary from CC-CEDICT
                     # (downloads from mdbg.net, parses, applies overrides)
```

## Key Files to Read First

If you're new to this codebase, read these in order:

1. **`app/api/translate/route.ts`** (60 lines) — The translation endpoint. Shows the online→offline fallback pattern.
2. **`lib/spaced-repetition/sm2.ts`** (43 lines) — The entire review algorithm. Surprisingly short.
3. **`lib/services/words.ts`** (100 lines) — CRUD for vocabulary. Shows the Supabase data model.
4. **`app/vocab/review/page.tsx`** (183 lines) — The flashcard UI. Shows how SM-2 integrates with React state.
5. **`components/pdf/PdfViewer.tsx`** — The PDF reader. The most complex component — touch handling, text selection, highlights.
6. **`lib/supabase/middleware.ts`** (54 lines) — Auth protection. The "bouncer" that guards every route.

---

*Built with Next.js 16, React 19, Supabase, PDF.js, Tailwind CSS 4, and a healthy respect for the complexity of touch events.*
