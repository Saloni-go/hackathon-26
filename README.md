# Neuro-Inclusive Web (Hackathon-26)

AI-powered cognitive accessibility Chrome extension for ADHD, Autism, and Dyslexia. Includes real-time page adaptations, text simplification, cross‑tab analysis, and game-based screening to auto‑tune accessibility settings.

## Tech Stack
- **Platform:** Chrome Extension (Manifest V3)
- **Frontend:** HTML, CSS, JavaScript
- **AI APIs:** Google Gemini, Hugging Face Inference API
- **Storage:** `chrome.storage.local`
- **Scheduling:** `chrome.alarms`

## AI & Intelligence Highlights
- **Agentic Orchestrator:** Context‑aware rule system that infers page type + user intent and applies the right accessibility tools dynamically.
- **RAG‑style Retrieval:** Cross‑tab summaries + paragraph ranking with cosine similarity; fallback heuristics if embeddings are unavailable.
- **Queue + Backoff:** Gemini requests are serialized with retries to reduce rate‑limit errors.
- **Caching Layer:** LRU caches with TTLs for jargon explanations, helper outputs, and AI responses.
- **Local Fallbacks:** Heuristic simplification and tone inference when AI is unavailable.

## Tools & Frameworks
- Chrome Extensions APIs (MV3 service worker + content scripts)
- Web Speech API (`speechSynthesis`, `SpeechRecognition` when available)
- Lightweight in‑memory caches and queueing

## Languages
- JavaScript
- HTML
- CSS

## Setup

### 1) Configure API keys
This extension reads Gemini + Hugging Face keys from a generated `config.js` file.

```bash
cp .env.example .env
```

Edit `.env` with your keys, then generate `config.js`:

```bash
npm run build:config
```

### 2) Load the extension in Chrome
1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `hackathon-26/` folder.
4. Reload the extension after any changes.

## Usage

### Screening Games
Open the extension popup → run ADHD/Dyslexia/Autism questionnaires. When you click **Apply Recommended Settings**, the results are saved and auto‑populate the manual settings panel.

### Manual Settings
Use the main panel to toggle reading, visual, and focus tools. Settings apply to the active tab and persist in storage.

### Text‑to‑Speech
In the popup, choose TTS mode (page/selection/heading) and press **Play**.

## Neuro‑Inclusive Themes
Enable `Soft Colors`, then choose:

- Theme mode: `Light` or `Dark`
- Palette: one of the mode‑compatible palettes

Available palettes:

- `Cream / Sepia` — `#F5EEDC` background, `#332C2B` text (dyslexia-friendly)
- `Sage Green` — `#D1E8E2` background, `#2C3531` text (calming)
- `Soft Charcoal` — `#1A1A2E` background, `#E0E0E0` text (low sensory load)
- `Deep Navy` — `#0F172A` background, `#CBD5E1` text (high focus in low light)

## Folder Structure

```
hackathon-26/
	background.js
	content.js
	popup.html
	popup.js
	popup.css
	adhd-game.html
	adhd-game.js
	autism-game.html
	autism-game.js
	dyslexia-game.html
	dyslexia-game.js
	manifest.json
	config.js
	scripts/
		build-config.js
	icons/
```

## Common Features
- Dyslexia‑friendly font, reading ruler, bionic reading
- Soft color themes and neuro‑inclusive palettes
- Remove distractions and stop animations
- TTS with heading/selection modes
- Jargon explanations and tone decoding
- Sticky goal note + focus guard
- Semantic layout restructuring and F‑pattern emphasis

## Major Features
- AI text simplification with caching and throttling
- Cross‑tab analysis with RAG‑style paragraph ranking (fallback available)
- Screening games for ADHD, Autism, Dyslexia that auto‑apply settings
- Meditation break reminders and wellness prompts

## AI‑Powered Feature Details
- **Agentic Assistance Loop:** Runs a lightweight decision cycle that inspects site context (article/docs/search), infers intent, and toggles features (e.g., distraction removal + simplification for dense reading).
- **Semantic Architect:** Converts long paragraphs into structured bullet blocks and cards for skimmability, with safe restore controls.
- **Linguistic Leveling:** Estimates reading complexity and auto‑simplifies if the page exceeds a user’s preferred reading age.
- **Jargon Explainer:** On‑hover definitions with caching and throttling to avoid repeated AI calls.
- **Tone Decoder:** Flags emotional tone and provides a neutral summary when helpful.
- **Cross‑Tab RAG:** Summarizes selected tabs, ranks relevant paragraphs, then asks Gemini to synthesize a cross‑tab answer.
- **AI Helper Widget:** Lightweight assistant for quick help prompts, cached for speed.

## Agent & Sub‑Agent Map

### Agentic Orchestrator
- **`runMasterOrchestrator()`**: Central decision engine that reads site context + intent and applies the right tools.
	- **Focus Guard** (`runFocusGuard`)
		- **Task Anchor** (`createTaskAnchor`, `updateTaskAnchor`): sticky “stay on task” prompt.
		- **Skim Detector** (`startSkimDetector`, `runSkimDetector`): detects rapid skim patterns.
		- **Distraction Hunter** (`runDistractionHunter`): hides high‑distraction elements.
	- **Sensory Shield** (`runSensoryShield`)
		- **Layout Stabilizer** (`runLayoutStabilizer`): reduces layout shifts.
		- **Visual Harmonizer** (`runVisualHarmonizer`): lowers visual overload.
		- **Motion Silencer** (`runMotionSilencer`): disables heavy motion/animation.
	- **Literacy Ally** (`runLiteracyAlly`)
		- **Typographic Engine** (`runTypographicEngine`): dyslexia‑friendly typography.
		- **Jargon Translator** (`runJargonTranslator`): hover‑definitions with cache.
		- **Tone Decoder** (`runToneDecoder`): tone + sentiment hints.

### Agentic AI Loop (Autonomous Mode)
- **`maybeRunAgentLoop()` / `runAgentLoop()`**: AI planner that proposes accessibility actions.
	- **Goal Inference** (`inferGoalPlanWithGemini`)
	- **Prompt Interpreter** (`interpretAccessibilityPromptWithGemini`)
	- **Action Applier** (`applyAgentActions`)

### Semantic Architect
- **`analyzePageStructure()` → `applySemanticArchitectPlan()`**: structural rewrite for skimmable reading.
	- **Structured Layout** (`applyStructuredLayout`)
	- **Focus Mode** (`applyFocusMode`)

### Linguistic Leveling
- **`estimateReadingAgeWithGemini()`** + **`maybeAutoSimplifyByReadingAge()`**: auto‑simplify if reading age is too high.

### RAG Librarian (Memory/Retrieval)
- **`ragStore`** + **`retrieveSimilarExplanation()`**: reuses prior explanations to reduce repeated AI calls.
	- **Token Overlap Scorer** (`scoreTokenOverlap`)
	- **History Store** (`saveExplanationHistory`, `getRagHistory`)

### Cross‑Tab RAG Agent
- **`analyzeTabs()` / `analyzeTabsWithGemini()`**: multi‑tab reasoning with ranked paragraphs.
	- **Tab Summarizer** (`getTabSummary`)
	- **Paragraph Splitter** (`splitIntoParagraphs`)
	- **Embedding Scorer** (`getEmbedding`, `computeSimilarity`)
	- **Fallback Ranking** when embeddings are unavailable

## Project Structure
- `background.js`: Gemini queue, caching, alarms, cross‑tab analysis
- `content.js`: DOM transforms, TTS, focus tools, overlays
- `popup.html` / `popup.js` / `popup.css`: settings UI
- `adhd-game.*`, `dyslexia-game.*`, `autism-game.*`: screening games
- `config.js`: generated API config from `.env`

## Troubleshooting

### “Embedding pipeline unavailable”
Local embeddings require bundling `@xenova/transformers` for MV3. The system falls back to heuristic ranking when unavailable.

### Gemini rate limits (429)
Try fewer tabs, shorter queries, or wait a minute. The queue auto‑retries with backoff.

### TTS / Mic not working in games
Browser policies require a user click before audio/mic can start. Use the “Play Word” / “Start Reading” buttons.

## Security Notes
- Never commit real API keys to git.
- `config.js` is generated locally from `.env`.

## Development Scripts

```bash
npm run build:config
```

## License
Hackathon project. Add a license if you plan to distribute.
