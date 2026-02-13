# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Convention

For every project, write a detailed FORWS.md file that explains the whole project in plain language. Explain the technical architecture, the structure of the codebase and how the various parts are connected, the technologies used, why we made these technical decisions, and lessons I can learn from it (this should include the bugs we ran into and how we fixed them, potential pitfalls and how to avoid them in the future, new technologies used, how good engineers think and work, best practices, etc). It should be very engaging to read; don't make it sound like boring technical documentation/textbook. Where appropriate, use analogies and anecdotes to make it more understandable and memorable.

## Commands

```bash
npm run dev          # Start dev server (localhost:3000)
npm run build        # Production build
npm run start        # Run production server
npm run build-dict   # Rebuild Chinese dictionary from CC-CEDICT (downloads from mdbg.net, parses, applies overrides)
```

No test framework is configured. No linter command beyond `npx eslint`.

## Architecture

**Stack:** Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4 + Supabase + react-pdf (PDF.js)

**What it does:** A reading-first vocabulary app for Chinese speakers learning English. Users read PDFs/articles in the app, tap unfamiliar words to get instant Chinese translations, save words, and review them via SM-2 spaced repetition flashcards.

### Three-layer translation system (`app/api/translate/route.ts`)

1. **MyMemory API** (online, primary) — purpose-built English→Chinese translation
2. **CC-CEDICT dictionary** (offline fallback) — 100K+ entries loaded from `public/dict/en-zh.json`
3. **Hand-curated overrides** (`public/dict/overrides.json`) — 600+ verified translations baked into the dictionary at build time

The dictionary JSON is built on demand via `npm run build-dict`. The overrides exist because reversing CC-CEDICT (Chinese→English → English→Chinese) produces wrong translations for common words (e.g., "control" → 乂). Always keep overrides up to date when adding new common words.

### Auth middleware pattern (`middleware.ts` → `lib/supabase/middleware.ts`)

Every request goes through middleware. Protected routes (`/vocab`, `/bookshelf`, `/read`) redirect unauthenticated users to `/login?redirectTo=<original-path>`. Auth pages redirect authenticated users to `/`. This is centralized — individual pages don't check auth.

### PDF word selection (`components/pdf/PdfViewer.tsx`)

The most complex component. Uses PDF.js text layer for selectable text over rendered canvas. Touch handling is zone-based: left 20% = prev page, right 20% = next page, center = controls toggle (tap) or word selection (400ms long-press). Browser native selection UI is suppressed via CSS; custom green highlights are drawn instead.

### SM-2 review engine (`lib/spaced-repetition/sm2.ts`)

43-line implementation of SM-2 with a simplified 3-button scale: Hard (quality=1), Neutral (quality=3), Easy (quality=5). The `words` table stores SM-2 state (`repetitions`, `ease_factor`, `interval_days`, `next_review_at`) alongside word data. Review page at `app/vocab/review/page.tsx` maps SM-2 camelCase output to Supabase snake_case columns.

### Supabase data model

- **`words`** table: word, translation, definition, example, audio_url, SM-2 state fields, category ("learning"/"learned"/"difficult")
- **`books`** table: title, pdf_storage_path, current_page, total_pages, last_read_at
- PDFs stored in Supabase Storage; `books` table holds path pointers
- All services in `lib/services/` use browser-side Supabase client (`lib/supabase/client.ts`)
- Server-side client (`lib/supabase/server.ts`) used in API routes and middleware

### Path alias

`@/*` maps to project root (configured in `tsconfig.json`). Use `@/lib/...`, `@/components/...`, etc.

## Gotchas

- **PDF.js canvas stub:** `next.config.ts` aliases `canvas` to `./empty-module.ts` because PDF.js imports the Node `canvas` package for SSR, which can't be bundled. Don't remove this alias.
- **PdfViewer is client-only:** It's dynamically imported with `ssr: false` because PDF.js requires browser APIs. Don't try to server-render it.
- **Dictionary rebuild required:** `public/dict/en-zh.json` starts empty. Run `npm run build-dict` to populate it. The overrides in `overrides.json` are applied during this build step.
- **Duplicate word handling:** `createWord()` in `lib/services/words.ts` catches Postgres unique constraint error (code `23505`) and throws a user-friendly message.
