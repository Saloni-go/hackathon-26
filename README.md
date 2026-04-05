# 🧠 Neuro-Inclusive Web

> AI-powered cognitive accessibility for ADHD, Autism/Sensory, and Dyslexia — as a Chrome extension.

Neuro-Inclusive Web transforms any webpage into a lower-cognitive-load, personalized reading experience. It combines gamified self-assessment, intelligent DOM modification, and Google Gemini AI to auto-configure accessibility settings tailored to each user's neurodivergent profile.

---

## Table of Contents

1. [Features](#features)
2. [Repository Structure](#repository-structure)
3. [How It Works](#how-it-works)
4. [Configuration & Environment Variables](#configuration--environment-variables)
5. [Setup & Installation](#setup--installation)
6. [Usage Examples](#usage-examples)
7. [Security Considerations](#security-considerations)
8. [Known Issues](#known-issues)
9. [Contributing](#contributing)
10. [License](#license)

---

## Features

| Feature | Shortcut | Description |
|---|---|---|
| 🤖 AI Text Simplification | — | Rewrites dense paragraphs into bullet points via Gemini |
| 📚 Jargon Explainer | — | Hover a complex word for a ≤20-word plain-English definition |
| 📖 Dyslexia-Friendly Font | `Ctrl+Shift+D` | Accessible font with improved spacing |
| 📏 Reading Ruler | `Ctrl+Shift+R` | Line-following overlay to reduce tracking errors |
| 👀 Bionic Reading | — | Bolds first letters to guide eye movement |
| 🎨 Soft Colors / Theme | `Ctrl+Shift+C` | Reduces contrast; 4 palettes across light/dark modes |
| 🧹 Remove Distractions | `Ctrl+Shift+H` | Hides ads, sidebars, and popups |
| 🎞️ Remove Animations | — | Stops CSS animations and autoplay |
| 🛑 Sensory Auto-Blocker | — | Pauses autoplay video/audio to prevent sensory overload |
| 🎭 Cinema Focus Mode | — | Elevates main content, dims the periphery |
| 🔊 Text-to-Speech | — | Reads whole page / headings / selected text aloud |
| 🎯 Focus Goal Sticky Note | — | Draggable, persistent note on every page |
| ✨ Cross-Tab AI Analysis | — | Ask a question across multiple open tabs simultaneously |
| ⏰ Break Reminder | — | Prompts a 1-minute meditation break every 10 minutes |

### Gamified Self-Assessment

Three mini-app screeners estimate where accessibility aids are most needed:

- **🎨 Autism (Sensory Quest)** — sound detection, pattern recognition, sensory preference tests
- **📖 Dyslexia** — direction/coordination test (optional camera), letter reversal, reading speed
- **⚡ ADHD Focus Quest** — task completion, organization, memory, procrastination resistance, fidget tracking, reaction time

Scores are automatically converted into a recommended accessibility preset.

---

## Repository Structure

```
hackathon-26/
├── manifest.json          # Extension config: permissions, shortcuts, entry points
├── package.json           # Node metadata; single script: build:config
│
├── background.js          # Service worker — all AI calls, caching, message routing
├── content.js             # Injected into every page — applies DOM modifications
├── popup.html             # Extension popup UI (onboarding + settings panels)
├── popup.js               # Popup logic: sliders, checkboxes, TTS, tab analyzer
├── popup.css              # Popup styling
├── utils.js               # (Reserved — currently empty)
│
├── adhd-game.html         # ADHD screening shell
├── adhd-game.js           # 6-game ADHD assessment logic
├── autism-game.html       # Autism/sensory screening shell
├── autism-game.js         # Sensory preference/detection game logic
├── dyslexia-game.html     # Dyslexia screening shell
├── dyslexia-game.js       # Reading/letter confusion game logic
│
├── icons/                 # Extension icons (16×16, 48×48, 128×128 PNG)
│
├── .gitignore             # Ignores /.env, /config.js, node_modules/
└── README.md              # This file
```

### Component Roles

**`background.js`** — The service worker and brain of the extension. Handles all Gemini and HuggingFace API calls, implements LRU caching, a RAG (Retrieval-Augmented Generation) librarian backed by `chrome.storage.local`, a site-specific feedback/learning system, a Gemini request queue with circuit-breaker rate-limiting, analytics, and the full message-passing router.

**`content.js`** — Injected at `document_end` on every web page. Reads settings from storage and applies/removes DOM modifications for every feature: dyslexia font, soft colors, reading ruler, bionic reading, distraction removal, animation blocking, cinema focus, jargon hover tooltips, cognitive score overlay, meditation break overlay, goal sticky note, and text-to-speech.

**`popup.html` / `popup.js`** — Two-panel popup. Onboarding has sliders (ADHD/Dyslexia/Autism 0–100) and game launch buttons. Settings panel has all feature checkboxes, theme controls, TTS mode, and the multi-tab AI analyzer.

**`*-game.js`** — Self-contained game logic. Each runs 5–6 mini-challenges, computes a percentage score, and writes `onboardingCompleted`, `userProfile`, and auto-calculated settings to `chrome.storage.local`.

---

## How It Works

### Startup
1. Extension loads → `background.js` service worker starts.
2. `chrome.runtime.onInstalled` writes default settings to `chrome.storage.local`, initialises analytics, and sets a 10-minute break alarm.
3. The RAG cache loads from persistent storage.

### Page Load
1. `content.js` injected at `document_end`.
2. Reads all settings, then calls `applyAllModifications()`.
3. If text simplification is on, calls `simplifyPageWithAI()`.
4. Optionally auto-simplifies if page reading level exceeds the user's preferred reading age (via Gemini).
5. Applies any site-specific learned preferences.
6. Renders the goal sticky note and cognitive complexity score.

### AI Text Simplification
```
content.js
  → chrome.runtime.sendMessage({ action: 'simplifyText', text })
  → background.js checks aiCache
  → GEMINI_API_KEY present?
      Yes → POST generativelanguage.googleapis.com/.../gemini-1.5-flash:generateContent
      No  → mockSimplify() [local word-replacement fallback]
  → sendResponse({ simplifiedText })
  → content.js replaces paragraph DOM nodes
```

### Jargon Explanation
```
content.js hover event
  → sendMessage({ action: 'defineJargon', word, context })
  → background.js checks KnowledgeManager cache → RAG history → in-memory LRU
  → POST Gemini API → ≤20-word definition
  → cache result → show tooltip
```

### Cross-Tab Analysis
```
popup.js "Analyze" click
  → sendMessage({ action: 'analyzeTabs', tabIds, query })
  → background.js collects tab summaries via content.js
  → Xenova all-MiniLM-L6-v2 embeds query + paragraphs (cosine similarity)
  → top-5 most relevant paragraphs → Gemini answer
```

### Keyboard Shortcuts
```
Ctrl+Shift+D / C / H / R
  → background.js toggles setting in chrome.storage.local
  → broadcasts settingsUpdated to all tabs
  → content.js reapplies modifications
```

---

## Configuration & Environment Variables

All variables are injected at build time into a generated `config.js` file loaded by the service worker. They must **never** be committed to source control.

| Variable | Default | Description |
|---|---|---|
| `GEMINI_API_KEY` | `''` | **Required** — Google Gemini API key (primary AI path) |
| `GEMINI_MODEL` | `gemini-1.5-flash` | Gemini model to use |
| `GEMINI_API_URL` | `https://generativelanguage.googleapis.com/v1beta/models` | Gemini base URL |
| `HF_API_TOKEN` | `''` | HuggingFace Inference API token (optional fallback for summarisation) |
| `HF_API_URL` | `https://api-inference.huggingface.co/models/facebook/bart-large-cnn` | HuggingFace BART endpoint |

**Model selection logic:**
- `jargon_definition` → always Gemini if key present
- `tone_detection` (short/medium text) → local heuristic; long text → Gemini
- `simplify_text` → Gemini → HuggingFace → local `mockSimplify()`

---

## Setup & Installation

### Prerequisites

- Google Chrome (or any Chromium-based browser)
- Node.js (for the config build step)
- A [Google Gemini API key](https://aistudio.google.com/) — free tier available
- *(Optional)* A [HuggingFace API token](https://huggingface.co/settings/tokens)

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/Saloni-go/hackathon-26.git
cd hackathon-26

# 2. Install dependencies
npm install

# 3. Create your .env file
cat > .env << 'EOF'
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-1.5-flash
GEMINI_API_URL=https://generativelanguage.googleapis.com/v1beta/models
HF_API_TOKEN=your_huggingface_token_here
HF_API_URL=https://api-inference.huggingface.co/models/facebook/bart-large-cnn
EOF

# 4. Generate config.js (reads .env, writes config.js for the service worker)
npm run build:config

# 5. Load in Chrome
#    chrome://extensions → Enable "Developer mode" → "Load unpacked" → select this folder
```

### Reloading After Changes

1. Go to `chrome://extensions`
2. Click the reload ↺ button on the Neuro-Inclusive Web card
3. Reload any open tabs where the content script needs to re-inject

---

## Usage Examples

### Running the Onboarding Assessment

1. Click the extension icon → the onboarding popup appears.
2. Set the **Dyslexia**, **ADHD**, and **Autism/Sensory** sliders to reflect your needs (0–100).
3. Click **✨ Start Browsing** — the extension auto-configures settings based on your profile.
4. Or click any game button (🎨 Autism / 📖 Dyslexia / ⚡ ADHD) to run a gamified screener that sets your profile automatically.

### Manual Settings

Click the extension icon → **Accessibility Settings** panel:

- Toggle individual features on/off
- Choose **Theme Mode** (Light/Dark) and **Color Palette**
- Use **💾 Save All Settings** to persist and apply to the current tab

### Keyboard Shortcuts

```
Ctrl+Shift+D  (Mac: Cmd+Shift+D)  →  Toggle Dyslexia-Friendly Font
Ctrl+Shift+C  (Mac: Cmd+Shift+C)  →  Toggle Soft Colors
Ctrl+Shift+H  (Mac: Cmd+Shift+H)  →  Toggle Remove Distractions
Ctrl+Shift+R  (Mac: Cmd+Shift+R)  →  Toggle Reading Ruler
```

### Theme Palettes

| Palette | Background | Text | Best for |
|---|---|---|---|
| Cream / Sepia | `#F5EEDC` | `#332C2B` | Dyslexia — reduces harsh contrast |
| Sage Green | `#D1E8E2` | `#2C3531` | Calming — anxiety & focus support |
| Soft Charcoal | `#1A1A2E` | `#E0E0E0` | Autism — lowers sensory input (dark) |
| Deep Navy | `#0F172A` | `#CBD5E1` | High focus in low-light (dark) |

### Cross-Tab AI Analysis

1. Open several articles in separate tabs.
2. In the popup → **Actions → Compare Open Tabs**.
3. Select the tabs, type a question (e.g. *"What are the main differences between these articles?"*), click **✨ Analyze**.
4. The extension collects text summaries, ranks paragraphs by semantic similarity, and asks Gemini to answer.

---

## Security Considerations

- **API keys are embedded in the extension package.** `config.js` is gitignored and not committed, but the key is visible to anyone who inspects the unpacked extension or service worker sources. For production deployment, consider routing AI calls through a server-side proxy.
- **`GEMINI_API_KEY` is passed as a URL query parameter** (`?key=...`), which will appear in network request logs.
- The `.env` file is gitignored — secrets will not be accidentally committed. ✅
- **Rate limiting:** A circuit breaker blocks Gemini calls for 60 seconds after a 429/quota error. A serial request queue with a 1-second inter-request delay prevents parallel API hammering.
- **Privacy:** The RAG librarian stores only 180-character text snippets — no full page content is persisted.
- **Permissions:** The extension requests `<all_urls>` (necessary for accessibility on all sites) and `tabs` + `scripting` (needed for cross-tab analysis).

---

## Known Issues

| Issue | Details |
|---|---|
| `scripts/build-config.js` is missing | `npm run build:config` will fail — the build script is not committed. You must create or restore `scripts/build-config.js` to generate `config.js`. |
| `.env.example` not committed | Referenced in the original README but absent from the repo. Create `.env` manually using the variable table above. |
| Xenova embeddings not bundled | `@xenova/transformers` is not in `package.json` and no bundler config exists. Cross-tab analysis falls back gracefully to heuristic paragraph selection. |
| `utils.js` is empty | The file exists but contains no code. |
| No test suite | There are no automated tests or CI configuration. |

---

## Contributing

1. Fork the repository and create a feature branch from `main`.
2. Follow the existing code style — vanilla JavaScript, no framework, Chrome MV3 conventions.
3. **Never commit API keys.** Always use the `.env` + `build:config` pattern.
4. Test manually in Chrome with Developer Mode before opening a pull request.
5. Describe the accessibility impact of your change in the PR description.

---

## License

No `LICENSE` file is currently present in this repository. The licensing terms are unspecified. Contact the repository owner ([@Saloni-go](https://github.com/Saloni-go)) before reusing or distributing this code.
