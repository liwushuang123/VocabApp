# VocabApp — Product & Technical Documentation

---

## 1. Product Requirements Document (PRD)

### Vision

VocabApp is a mobile-first vocabulary learning app that turns reading into an active learning experience. Instead of studying word lists in isolation, users learn new English words in context — by reading real PDFs or articles, tapping unfamiliar words, and saving them for review later.

### Target Users

- Chinese-speaking learners of English
- Students, professionals, or anyone reading English-language books, papers, or articles
- Users who want vocabulary study integrated into their reading habit, not separate from it

### Core Features

**1. PDF & Article Reader**
- Upload and read PDF books directly in the app
- Paste article text for quick reading sessions
- Reading progress is saved automatically per book

**2. Tap-to-Translate**
- Long-press (mobile) or double-click (desktop) any word while reading
- Instantly see the Chinese translation and English definition
- Hear pronunciation with one tap

**3. Vocabulary Management**
- Save words to a personal vocabulary list with one tap
- Each saved word includes: Chinese translation, English definition, example sentence, and audio
- Organize words as "Learning", "Learned", or "Difficult"
- Search and filter saved words

**4. Spaced Repetition Review**
- Flashcard-based review sessions using the SM-2 algorithm
- The app schedules when each word should be reviewed next, based on how well the user remembers it
- Three difficulty ratings per review: Hard, Neutral, Easy
- Words the user struggles with are shown more frequently

**5. Bookshelf**
- Library of uploaded PDFs with cover page thumbnails
- Tracks current page and last-read date per book
- Delete books when finished

### User Journey

```
Sign Up → Upload a PDF or paste an article
       → Read and tap unfamiliar words
       → See instant translation + definition
       → Save words to vocabulary list
       → Review saved words with flashcards
       → Words gradually move from "Learning" to "Learned"
```

### Success Metrics

- Words saved per reading session
- Review completion rate
- Percentage of words progressing from "Learning" to "Learned"
- Return rate (users coming back to read and review)

---

## 2. Technical Architecture Overview

### How the System Works (Non-Technical Summary)

VocabApp is built as a web application that works in any modern browser and is optimized for phones, tablets, and desktops. There is no separate mobile app to install — users access it through their browser, and it behaves like a native app.

The system has four main parts:

```
┌─────────────────────────────────────────────────────────┐
│                    USER'S BROWSER                       │
│                                                         │
│   ┌──────────┐  ┌──────────┐  ┌───────────┐            │
│   │  PDF     │  │ Vocab    │  │ Flashcard │            │
│   │  Reader  │  │ Manager  │  │ Review    │            │
│   └────┬─────┘  └────┬─────┘  └─────┬─────┘            │
│        │              │              │                   │
│        └──────────────┼──────────────┘                   │
│                       │                                  │
└───────────────────────┼──────────────────────────────────┘
                        │
            ┌───────────┼───────────────┐
            │     APPLICATION SERVER    │
            │      (Next.js)            │
            │                           │
            │  ┌─────────────────────┐  │
            │  │  Translation API    │  │
            │  │  ┌───────────────┐  │  │
            │  │  │ MyMemory API  │◄─┼──┼── Online translation service
            │  │  │  (primary)    │  │  │
            │  │  └───────┬───────┘  │  │
            │  │          │ fallback  │  │
            │  │  ┌───────▼───────┐  │  │
            │  │  │ CC-CEDICT     │  │  │   Built-in offline dictionary
            │  │  │ + Overrides   │  │  │   (100K+ words)
            │  │  └───────────────┘  │  │
            │  └─────────────────────┘  │
            └───────────┬───────────────┘
                        │
            ┌───────────▼───────────────┐
            │        SUPABASE           │
            │   (Cloud Backend)         │
            │                           │
            │  ┌─────────┐ ┌─────────┐  │
            │  │  Auth   │ │Database │  │  User accounts, saved words,
            │  │         │ │         │  │  books, reading progress
            │  └─────────┘ └─────────┘  │
            │  ┌─────────────────────┐  │
            │  │   File Storage      │  │  Uploaded PDF files
            │  └─────────────────────┘  │
            └───────────────────────────┘
```

### The Four Main Parts

**1. The Reading Engine**
When a user opens a PDF, the app uses a library called PDF.js (built by Mozilla, the makers of Firefox) to render the document. On top of the visible page, there's an invisible text layer that makes individual words selectable. This is what allows users to tap on a word and look it up — the app detects which word was tapped, highlights it, and shows a "Look up" button.

**2. The Translation System**
When a user looks up a word, the app tries to translate it through a multi-step process:
- **First**, it asks an online translation service (MyMemory) for the Chinese translation — this is a service purpose-built for translation and handles most words accurately.
- **If that fails** (e.g., no internet), it falls back to a built-in dictionary based on CC-CEDICT, a well-known open-source Chinese-English dictionary containing over 100,000 entries. On top of this, a hand-curated list of 600+ common words ensures frequently-used vocabulary always gets an accurate translation.
- **In parallel**, it also fetches the English definition and pronunciation from a free English dictionary service.

**3. The Vocabulary System**
Saved words are stored in a cloud database (Supabase). Each word is tagged with review scheduling data so the app knows when to show it again. Words are categorized as "Learning", "Learned", or "Difficult" based on the user's review performance.

**4. The Review Engine**
The flashcard review system uses the SM-2 spaced repetition algorithm — the same method used by popular apps like Anki. It works on a simple principle: words you remember well are shown less frequently, while words you struggle with appear more often. Over time, this moves words from short-term memory into long-term memory with minimal study time.

### Technology Choices

| Component | Technology | Why |
|-----------|-----------|-----|
| App framework | Next.js + React | Fast, works on all devices, supports both frontend and backend in one codebase |
| PDF rendering | PDF.js (react-pdf) | Industry-standard PDF engine, enables text selection over rendered pages |
| Database & Auth | Supabase | Open-source backend with built-in user accounts, database, and file storage |
| Styling | Tailwind CSS | Enables responsive design across phone, tablet, and desktop |
| Translation | MyMemory API + CC-CEDICT | Free, reliable, with offline fallback |
| Review algorithm | SM-2 | Proven spaced repetition method, used in most flashcard apps |

---

## 3. Challenges and How They Were Solved

### Challenge 1: Word Selection Across Mobile and Desktop

**The Problem:**
Selecting a single word while reading sounds simple, but it works completely differently on phones versus computers. On desktop, users expect to double-click a word. On mobile, a single tap might mean "flip the page" or "show controls" — there's no obvious gesture for "select this word." Additionally, the browser's built-in text selection behavior (long-press menus, copy/paste popups) interfered with the app's word lookup experience.

**How It Was Solved:**
The app uses two separate input systems:
- **On mobile:** A long-press gesture (holding for 400ms) triggers word selection. The app tracks the touch position and duration — if the finger moves more than 10 pixels, it's treated as a scroll instead. The browser's native context menu and selection callout are suppressed so the app's own highlight and "Look up" button appear instead.
- **On desktop:** A double-click selects the word at the cursor position.
- **Both platforms:** After selection, the app draws custom green highlight rectangles over the selected word (calculated from the text layer's position data) and places a floating "Look up" button just above it.

The screen is also divided into invisible zones: tapping the left 20% of the screen goes to the previous page, the right 20% goes to the next page, and the center area toggles the page controls. This makes the single-tap gesture do something useful without conflicting with word selection.

### Challenge 2: PDF Text Layers and Selection Behavior

**The Problem:**
A PDF displayed in a browser is essentially an image — users can see the text, but they can't interact with it. To make individual words tappable, there needs to be an invisible layer of real text positioned precisely over the rendered PDF page. Getting this text layer aligned correctly, and making it work with the word selection system without showing ugly browser selection artifacts, was a significant challenge.

**How It Was Solved:**
The app uses PDF.js's built-in text layer feature, which creates transparent HTML text elements positioned over the PDF canvas. Custom CSS hides the browser's default selection highlight (the blue overlay) so users only see the app's custom green highlight. The native selection handles on mobile are preserved so users can adjust their selection if needed, but the surrounding browser UI (copy/paste menus, callout bubbles) is suppressed via CSS and JavaScript.

When a user taps a position, the app uses a browser API (`caretPositionFromPoint` / `caretRangeFromPoint`) to figure out exactly which word in the text layer was tapped, then expands the selection to cover the full word.

### Challenge 3: Making the UI Work on Phone, Tablet, and Desktop

**The Problem:**
The app needs to work well on devices ranging from a 4-inch phone screen to a 27-inch desktop monitor. PDF pages have fixed aspect ratios, navigation patterns differ between touch and mouse, and modern phones have notches and rounded corners that can hide content.

**How It Was Solved:**
- **PDF sizing:** The viewer dynamically calculates the optimal page width based on the device's screen dimensions and the PDF's aspect ratio. On tall phone screens, the page fills the width; on wide desktop screens, it's constrained to a readable width.
- **Safe areas:** The app accounts for phone notches and home indicator bars using CSS environment variables (`env(safe-area-inset-bottom)`), ensuring buttons and navigation are never hidden behind hardware features.
- **Navigation:** On mobile, the bottom navigation bar with four tabs (Read, Bookshelf, Vocab, Review) provides thumb-friendly access. The nav bar automatically hides during full-screen reading to maximize screen space.
- **Layout:** All screens use responsive grid layouts — vocabulary lists show in a single column on phones and two columns on tablets/desktops.

### Challenge 4: Chinese Dictionary Accuracy

**The Problem:**
The app originally relied solely on CC-CEDICT, a Chinese→English dictionary, used in reverse (English→Chinese). This produced many wrong translations because:
- Archaic single characters with simple definitions scored highest (e.g., "control" → 乂, a rare ancient character)
- Buddhist, literary, and domain-specific terms contaminated common words (e.g., "aggregates" → 五蕴, a Buddhist term)
- The reverse-lookup approach inherently produced semantic mismatches

**How It Was Solved:**
A three-layer strategy was implemented:

1. **Online translation first:** The app now queries a proper English→Chinese translation service (MyMemory API) as its primary source. Since this service is designed for translation (not dictionary lookup), it returns natural, modern Chinese for most words.

2. **Curated overrides:** A hand-verified dictionary of 600+ common English words with correct Chinese translations was created. These overrides always take priority when the dictionary is rebuilt, ensuring frequently-used vocabulary is never wrong.

3. **Smarter dictionary filtering:** The dictionary build process was improved with:
   - Heavy penalties for single-character results (-80 points)
   - Filters that skip entries tagged as archaic, Buddhist, literary, dialectal, surname-related, or geographic
   - Stronger rewards for 2-3 character modern Chinese words
   - Reduced exact-match bonuses to prevent obscure entries from dominating

---

## 4. Lessons Learned

### 1. "Reversing a dictionary" is not the same as "building a translation tool"

CC-CEDICT is an excellent Chinese→English dictionary, but using it backwards (English→Chinese) created fundamental accuracy problems. A word like "aggregate" appears in many CEDICT entries across different domains — and the most common English meaning rarely corresponds to the highest-scoring Chinese match. The lesson: when possible, use a tool designed for the exact job you need, rather than repurposing an adjacent tool. The final solution — using an actual translation API as primary, with the dictionary as a fallback — was both simpler and more accurate.

### 2. Touch interaction on mobile is much harder than it looks

What seems like a simple feature ("tap a word to look it up") requires handling a web of competing gestures: tap vs. long-press vs. scroll vs. page-flip vs. pinch-to-zoom. Every gesture the app wants to use must be carefully carved out from what the browser already does with touch input. The long-press approach (400ms threshold, 10px movement tolerance) emerged after iteration — it's long enough to feel intentional but short enough to not feel slow.

### 3. PDF text layers are powerful but fragile

PDF.js's text layer enables a reading experience that feels native, but it requires careful CSS management. The invisible text must be positioned precisely, browser selection behavior must be partially suppressed (highlight colors, context menus) while other parts are preserved (selection handles for adjustment). This is a case where small CSS details make the difference between an app that feels polished and one that feels broken.

### 4. Safe area handling is essential, not optional

On modern phones with notches, rounded corners, and gesture bars, content that touches the screen edges will be partially hidden. Adding safe area padding early prevents layout issues later and makes the app feel like it was built for mobile from the start, not adapted from desktop.

### 5. Offline fallbacks matter for educational apps

Language learners use vocabulary apps in varied environments — commutes, classrooms, planes — where internet connectivity isn't guaranteed. Having a built-in 100K-word dictionary as an offline fallback means the core feature (looking up a word while reading) always works, even without internet. The online API provides better accuracy when available, but the offline dictionary ensures the app is never useless.

### 6. Curated data beats algorithmic cleverness for common cases

No amount of scoring algorithm tuning could prevent all wrong translations from CEDICT's reverse lookup. A simple hand-curated list of 600 common words with verified translations solved more real-user problems than weeks of algorithm refinement. For educational apps where accuracy directly impacts trust, investing in curated data for the most-used cases pays off disproportionately.
