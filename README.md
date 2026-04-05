# hackathon-26
big code google

## Environment Setup

This extension reads the Gemini + Hugging Face API settings from a generated `config.js` file.

1) Copy `.env.example` to `.env` and add your token:

```bash
cp .env.example .env
```

2) Build the config file:

```bash
npm run build:config
```

3) Reload the extension in Chrome.

### Gemini Settings

Set these in `.env`:

- `GEMINI_API_KEY`
- `GEMINI_MODEL` (default `gemini-1.5-flash`)
- `GEMINI_API_URL` (default `https://generativelanguage.googleapis.com/v1beta/models`)

## Neuro-Inclusive Themes

In popup settings, enable `Soft Colors`, then choose:

- Theme mode: `Light` or `Dark`
- Palette: one of the mode-compatible palettes

Available palettes:

- `Cream / Sepia` — `#F5EEDC` background, `#332C2B` text (dyslexia-friendly)
- `Sage Green` — `#D1E8E2` background, `#2C3531` text (calming)
- `Soft Charcoal` — `#1A1A2E` background, `#E0E0E0` text (low sensory load)
- `Deep Navy` — `#0F172A` background, `#CBD5E1` text (high focus in low light)
