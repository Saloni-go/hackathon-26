// background.js - Service worker with Safe Messaging
console.log('Neuro-Inclusive Web service worker started');

// ========== SAFE MESSAGING UTILITY ==========

function safeSendMessage(tabId, message, callback) {
  try {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('Extension context lost:', chrome.runtime.lastError.message);
        if (callback) callback(null, chrome.runtime.lastError);
        return;
      }
      if (callback) callback(response, null);
    });
  } catch (e) {
    console.warn('Send message failed:', e);
    if (callback) callback(null, e);
  }
}

function safeSendToAllTabs(message) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.url && !tab.url.startsWith('chrome://')) {
        safeSendMessage(tab.id, message);
      }
    });
  });
}

// ========== CACHE MANAGEMENT ==========
const aiCache = new Map();
const CACHE_MAX_SIZE = 100;
const JARGON_CACHE_MAX_SIZE = 200;
const jargonCache = new Map();
const TONE_CACHE_MAX_SIZE = 200;
const toneCache = new Map();
const ANALYTICS_KEY = 'neuro_analytics';

// ========== KNOWLEDGE MANAGER ==========
const KNOWLEDGE_KEYS = {
  jargonCache: 'km_jargon_cache',
  sitePrefs: 'km_site_prefs',
  userOverrides: 'km_user_overrides',
  modelPrefs: 'km_model_prefs',
  tempCache: 'km_temp_cache'
};

const KnowledgeManager = (() => {
  const limits = {
    jargon: 200,
    sitePrefs: 200,
    overrides: 200,
    temp: 200
  };

  const defaultTtlMs = {
    jargon: 1000 * 60 * 60 * 24 * 14,
    temp: 1000 * 60 * 60
  };

  const now = () => Date.now();

  const getStorage = (keys) => new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => resolve(result));
  });

  const setStorage = (payload) => new Promise((resolve) => {
    chrome.storage.local.set(payload, () => resolve());
  });

  const pruneExpired = (mapObj) => {
    let changed = false;
    const current = now();
    for (const [key, entry] of Object.entries(mapObj || {})) {
      if (entry?.expiresAt && entry.expiresAt <= current) {
        delete mapObj[key];
        changed = true;
      }
    }
    return changed;
  };

  const trimToLimit = (mapObj, limit) => {
    const entries = Object.entries(mapObj || {});
    if (entries.length <= limit) return false;
    entries.sort((a, b) => (a[1]?.updatedAt || 0) - (b[1]?.updatedAt || 0));
    const removeCount = entries.length - limit;
    for (let i = 0; i < removeCount; i++) {
      delete mapObj[entries[i][0]];
    }
    return true;
  };

  const getMap = async (key) => {
    const result = await getStorage([key]);
    return result[key] || {};
  };

  const setMap = async (key, mapObj) => {
    await setStorage({ [key]: mapObj });
  };

  const cleanKey = (value) => (value || '').toLowerCase().replace(/[^a-z0-9._-]/g, '');

  const buildTempKey = (input) => simpleHash(String(input || '')).slice(0, 64);

  return {
    async getJargonDefinition(word) {
      const clean = cleanKey(word);
      if (!clean) return null;
      const mapObj = await getMap(KNOWLEDGE_KEYS.jargonCache);
      const changed = pruneExpired(mapObj);
      if (changed) await setMap(KNOWLEDGE_KEYS.jargonCache, mapObj);
      return mapObj[clean]?.definition || null;
    },
    async setJargonDefinition(word, definition, ttlMs = defaultTtlMs.jargon) {
      const clean = cleanKey(word);
      if (!clean || !definition) return;
      const mapObj = await getMap(KNOWLEDGE_KEYS.jargonCache);
      mapObj[clean] = {
        definition: String(definition).slice(0, 160),
        updatedAt: now(),
        expiresAt: now() + ttlMs
      };
      trimToLimit(mapObj, limits.jargon);
      await setMap(KNOWLEDGE_KEYS.jargonCache, mapObj);
    },
    async getSitePreferences(hostname) {
      const clean = cleanKey(hostname);
      if (!clean) return {};
      const mapObj = await getMap(KNOWLEDGE_KEYS.sitePrefs);
      return mapObj[clean]?.preferences || {};
    },
    async setSitePreferences(hostname, preferences) {
      const clean = cleanKey(hostname);
      if (!clean || !preferences) return;
      const mapObj = await getMap(KNOWLEDGE_KEYS.sitePrefs);
      mapObj[clean] = {
        preferences: { ...(mapObj[clean]?.preferences || {}), ...preferences },
        updatedAt: now()
      };
      trimToLimit(mapObj, limits.sitePrefs);
      await setMap(KNOWLEDGE_KEYS.sitePrefs, mapObj);
    },
    async addUserOverride(entry) {
      if (!entry || !entry.feature) return;
      const result = await getStorage([KNOWLEDGE_KEYS.userOverrides]);
      const list = Array.isArray(result[KNOWLEDGE_KEYS.userOverrides])
        ? result[KNOWLEDGE_KEYS.userOverrides]
        : [];
      list.push({
        feature: String(entry.feature).slice(0, 40),
        action: String(entry.action || 'override').slice(0, 40),
        reason: String(entry.reason || '').slice(0, 120),
        timestamp: now()
      });
      if (list.length > limits.overrides) list.splice(0, list.length - limits.overrides);
      await setStorage({ [KNOWLEDGE_KEYS.userOverrides]: list });
    },
    async getUserOverrides(limit = 50) {
      const result = await getStorage([KNOWLEDGE_KEYS.userOverrides]);
      const list = Array.isArray(result[KNOWLEDGE_KEYS.userOverrides])
        ? result[KNOWLEDGE_KEYS.userOverrides]
        : [];
      return list.slice(-limit).reverse();
    },
    async getModelPreferences() {
      const result = await getStorage([KNOWLEDGE_KEYS.modelPrefs]);
      return result[KNOWLEDGE_KEYS.modelPrefs] || {};
    },
    async setModelPreferences(preferences) {
      if (!preferences) return;
      const existing = await this.getModelPreferences();
      await setStorage({
        [KNOWLEDGE_KEYS.modelPrefs]: { ...existing, ...preferences, updatedAt: now() }
      });
    },
    async getTempResult(key) {
      const clean = cleanKey(key) || buildTempKey(key);
      const mapObj = await getMap(KNOWLEDGE_KEYS.tempCache);
      const changed = pruneExpired(mapObj);
      if (changed) await setMap(KNOWLEDGE_KEYS.tempCache, mapObj);
      return mapObj[clean]?.value ?? null;
    },
    async setTempResult(key, value, ttlMs = defaultTtlMs.temp) {
      const clean = cleanKey(key) || buildTempKey(key);
      const mapObj = await getMap(KNOWLEDGE_KEYS.tempCache);
      mapObj[clean] = {
        value,
        updatedAt: now(),
        expiresAt: now() + ttlMs
      };
      trimToLimit(mapObj, limits.temp);
      await setMap(KNOWLEDGE_KEYS.tempCache, mapObj);
    }
  };
})();

// ========== FEEDBACK LOOP AGENT (SITE-SPECIFIC LEARNING) ==========
// Stores per-site feature overrides so the extension avoids unwanted features.
// Conservative: learned preferences only disable features that are globally enabled.
const FEEDBACK_PREFS_KEY = 'feedback_site_prefs';
const FEEDBACK_CONFIDENCE_THRESHOLD = 0.6;

function ensureSiteEntry(store, hostname) {
  if (!store[hostname]) {
    store[hostname] = {
      updatedAt: Date.now(),
      features: {}
    };
  }
  return store[hostname];
}

function ensureFeatureEntry(siteEntry, feature) {
  if (!siteEntry.features[feature]) {
    siteEntry.features[feature] = {
      enabledCount: 0,
      disabledCount: 0,
      lastAction: null,
      lastUpdated: Date.now(),
      pageCategories: {}
    };
  }
  return siteEntry.features[feature];
}

function updateCategoryEntry(featureEntry, pageCategory) {
  if (!pageCategory) return null;
  if (!featureEntry.pageCategories[pageCategory]) {
    featureEntry.pageCategories[pageCategory] = {
      enabledCount: 0,
      disabledCount: 0,
      lastAction: null,
      lastUpdated: Date.now()
    };
  }
  return featureEntry.pageCategories[pageCategory];
}

async function saveSitePreference(hostname, feature, enabled, pageCategory = '') {
  if (!hostname || !feature) return;
  const cleanHost = hostname.toLowerCase();
  const result = await new Promise((resolve) => {
    chrome.storage.local.get([FEEDBACK_PREFS_KEY], (stored) => resolve(stored[FEEDBACK_PREFS_KEY] || {}));
  });

  const siteEntry = ensureSiteEntry(result, cleanHost);
  const featureEntry = ensureFeatureEntry(siteEntry, feature);
  const categoryEntry = updateCategoryEntry(featureEntry, pageCategory);

  if (enabled) {
    featureEntry.enabledCount += 1;
    if (categoryEntry) categoryEntry.enabledCount += 1;
  } else {
    featureEntry.disabledCount += 1;
    if (categoryEntry) categoryEntry.disabledCount += 1;
  }

  featureEntry.lastAction = enabled ? 'enabled' : 'disabled';
  featureEntry.lastUpdated = Date.now();
  if (categoryEntry) {
    categoryEntry.lastAction = featureEntry.lastAction;
    categoryEntry.lastUpdated = Date.now();
  }

  siteEntry.updatedAt = Date.now();

  chrome.storage.local.set({ [FEEDBACK_PREFS_KEY]: result });
}

async function getSitePreference(hostname, feature, pageCategory = '') {
  if (!hostname || !feature) return null;
  const cleanHost = hostname.toLowerCase();
  const store = await new Promise((resolve) => {
    chrome.storage.local.get([FEEDBACK_PREFS_KEY], (stored) => resolve(stored[FEEDBACK_PREFS_KEY] || {}));
  });

  const siteEntry = store[cleanHost];
  if (!siteEntry?.features?.[feature]) return null;
  const featureEntry = siteEntry.features[feature];

  const categoryEntry = pageCategory ? featureEntry.pageCategories?.[pageCategory] : null;
  const base = categoryEntry && (categoryEntry.enabledCount + categoryEntry.disabledCount) >= 2
    ? categoryEntry
    : featureEntry;

  const total = base.enabledCount + base.disabledCount;
  if (total < 2) return null;
  const enabled = base.enabledCount >= base.disabledCount;
  const confidence = Math.abs(base.enabledCount - base.disabledCount) / total;

  return {
    enabled,
    confidence,
    total,
    lastAction: base.lastAction || null
  };
}

async function applyLearnedPreferences(hostname, pageCategory = '', currentSettings = {}) {
  const overrides = {};
  if (!hostname) return overrides;

  const trackedFeatures = Object.keys(currentSettings || {}).filter(key => typeof currentSettings[key] === 'boolean');

  for (const feature of trackedFeatures) {
    const preference = await getSitePreference(hostname, feature, pageCategory);
    if (!preference) continue;

    // Conservative: only disable if user repeatedly disabled on this site.
    if (currentSettings[feature] === true && preference.enabled === false && preference.confidence >= FEEDBACK_CONFIDENCE_THRESHOLD) {
      overrides[feature] = false;
    }
  }

  return overrides;
}

// ========== RAG LIBRARIAN (LIGHTWEIGHT LOCAL RETRIEVAL) ==========
// Stores short explanation history and reuses it when similar queries appear.
// Privacy: only stores short snippets and no full page content or HTML.
const RAG_LIBRARIAN_KEY = 'rag_librarian_history';
const RAG_LIBRARIAN_LIMIT = 300;
const RAG_CONFIDENCE_THRESHOLD = 0.35;

function normalizeTokens(text) {
  const clean = (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return [];
  return clean.split(' ').filter(token => token.length > 2).slice(0, 40);
}

function scoreTokenOverlap(tokensA, tokensB) {
  if (!tokensA.length || !tokensB.length) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

async function getRagHistory() {
  return new Promise((resolve) => {
    chrome.storage.local.get([RAG_LIBRARIAN_KEY], (result) => {
      resolve(Array.isArray(result[RAG_LIBRARIAN_KEY]) ? result[RAG_LIBRARIAN_KEY] : []);
    });
  });
}

async function saveExplanationHistory(type, inputText, resultPayload, metadata = {}) {
  if (!type || !inputText || !resultPayload) return;
  const tokens = normalizeTokens(inputText);
  if (!tokens.length) return;

  const history = await getRagHistory();
  history.push({
    type: String(type),
    inputSnippet: String(inputText).slice(0, 180),
    result: resultPayload,
    tokens,
    metadata,
    updatedAt: Date.now()
  });

  if (history.length > RAG_LIBRARIAN_LIMIT) {
    history.splice(0, history.length - RAG_LIBRARIAN_LIMIT);
  }

  chrome.storage.local.set({ [RAG_LIBRARIAN_KEY]: history });
}

async function retrieveSimilarExplanation(type, inputText) {
  const tokens = normalizeTokens(inputText);
  if (!tokens.length) return null;

  const history = await getRagHistory();
  let best = null;
  let bestScore = 0;

  for (const entry of history) {
    if (entry.type !== type || !Array.isArray(entry.tokens)) continue;
    const score = scoreTokenOverlap(tokens, entry.tokens);
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  if (best && bestScore >= RAG_CONFIDENCE_THRESHOLD) {
    return { result: best.result, score: bestScore, metadata: best.metadata };
  }
  return null;
}

// ========== SETTINGS MANAGEMENT ==========

chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed/updated:', details.reason);
  
  const defaultSettings = {
    dyslexicFont: false,
    softColors: false,
    themeMode: 'light',
    themePalette: 'creamSepia',
    removeDistractions: false,
    readingRuler: false,
    removeAnimations: false,
    simplifyText: false,
    jargonExplainer: false,
    toneDecoder: false,
    cognitiveScoring: true,
    analyticsEnabled: true
  };
  
  chrome.storage.local.get(Object.keys(defaultSettings), (result) => {
    const toSet = {};
    for (const key in defaultSettings) {
      if (result[key] === undefined) {
        toSet[key] = defaultSettings[key];
      }
    }
    
    if (Object.keys(toSet).length > 0) {
      chrome.storage.local.set(toSet);
    }
  });
  
  initializeAnalytics();
});

function initializeAnalytics() {
  chrome.storage.local.get([ANALYTICS_KEY], (result) => {
    if (!result[ANALYTICS_KEY]) {
      const initialAnalytics = {
        totalSessions: 0,
        totalPagesSimplified: 0,
        totalJargonHovers: 0,
        averageCognitiveScore: [],
        featureUsage: {
          dyslexicFont: 0,
          softColors: 0,
          removeDistractions: 0,
          readingRuler: 0,
          removeAnimations: 0,
          simplifyText: 0,
          jargonExplainer: 0,
          toneDecoder: 0
        },
        lastReset: Date.now()
      };
      chrome.storage.local.set({ [ANALYTICS_KEY]: initialAnalytics });
    }
  });
}

// ========== AI TEXT SIMPLIFICATION ==========

try {
  importScripts('config.js');
} catch (e) {
  console.warn('Config not loaded. Run build:config to generate config.js.');
}

const HF_API_TOKEN = self.__ENV?.HF_API_TOKEN || '';
const HF_API_URL = self.__ENV?.HF_API_URL || 'https://api-inference.huggingface.co/models/facebook/bart-large-cnn';
const GEMINI_API_KEY = self.__ENV?.GEMINI_API_KEY || '';
const GEMINI_MODEL = self.__ENV?.GEMINI_MODEL || 'gemini-1.5-flash';
const GEMINI_API_URL = self.__ENV?.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta/models';

// ========== MODEL SELECTOR ==========
// Picks a fast/local path vs. stronger cloud model based on task complexity.
function chooseModelForTask(taskType, payload = {}) {
  const text = (payload.text || payload.word || '').trim();
  const context = (payload.context || '').trim();
  const totalLength = text.length + context.length;
  const hasGemini = Boolean(GEMINI_API_KEY);
  const hasHf = Boolean(HF_API_TOKEN);

  const isShort = totalLength <= 180;
  const isMedium = totalLength > 180 && totalLength <= 500;
  const isLong = totalLength > 500;

  if (taskType === 'jargon_definition') {
    if (isShort) {
      return { provider: 'local', model: 'heuristic-v1', reason: 'short jargon definition request' };
    }
    return hasGemini
      ? { provider: 'gemini', model: GEMINI_MODEL, reason: 'longer jargon needs nuance' }
      : { provider: 'local', model: 'heuristic-v1', reason: 'cloud unavailable' };
  }

  if (taskType === 'tone_detection') {
    if (isShort || isMedium) {
      return { provider: 'local', model: 'heuristic-v1', reason: 'short tone snippet' };
    }
    return hasGemini
      ? { provider: 'gemini', model: GEMINI_MODEL, reason: 'long tone analysis needs nuance' }
      : { provider: 'local', model: 'heuristic-v1', reason: 'cloud unavailable' };
  }

  if (taskType === 'simplify_text') {
    if (isLong && hasGemini) {
      return { provider: 'gemini', model: GEMINI_MODEL, reason: 'long text simplification' };
    }
    if (hasHf) {
      return { provider: 'huggingface', model: HF_API_URL, reason: 'fast summarization model' };
    }
    return hasGemini
      ? { provider: 'gemini', model: GEMINI_MODEL, reason: 'fallback to cloud' }
      : { provider: 'local', model: 'heuristic-v1', reason: 'no model available' };
  }

  return hasGemini
    ? { provider: 'gemini', model: GEMINI_MODEL, reason: 'default cloud path' }
    : { provider: 'local', model: 'heuristic-v1', reason: 'default local path' };
}

async function simplifyTextWithHuggingFace(text) {
  const response = await fetch(HF_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${HF_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      inputs: text,
      parameters: { max_length: 500, min_length: 100, do_sample: false }
    })
  });

  if (!response.ok) throw new Error(`API returned ${response.status}`);
  const data = await response.json();
  return data[0]?.summary_text || text;
}

async function simplifyTextWithGemini(text) {
  const url = `${GEMINI_API_URL}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: `Simplify this text for easier reading while keeping meaning.\n\n${text}` }]
        }
      ]
    })
  });

  if (!response.ok) throw new Error(`Gemini API returned ${response.status}`);
  const data = await response.json();
  const candidate = data.candidates?.[0]?.content?.parts?.map(part => part.text).join('') || '';
  return candidate || text;
}

async function analyzeDomWithGemini(html) {
  if (!GEMINI_API_KEY) throw new Error('Missing Gemini API key');
  const url = `${GEMINI_API_URL}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: `You are a cognitive accessibility expert. Analyze the provided HTML. Identify the CSS selectors for the most important navigation and the primary reading material. Identify clutter that causes sensory overload. Return ONLY valid JSON.\n\nIdentify the main navigation container, the primary content area, and list any distracting elements like ads or sidebars. Return JSON with keys navSelector, mainContentSelector, distractions (array).\n\nHTML:\n${html}` }]
        }
      ]
    })
  });

  if (!response.ok) throw new Error(`Gemini API returned ${response.status}`);
  const data = await response.json();
  const raw = data.candidates?.[0]?.content?.parts?.map(part => part.text).join('') || '';
  if (!raw) throw new Error('Gemini returned empty response');
  const jsonStart = raw.indexOf('{');
  const jsonEnd = raw.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) throw new Error('Gemini did not return JSON');
  const jsonText = raw.slice(jsonStart, jsonEnd + 1);
  return JSON.parse(jsonText);
}

async function defineJargonWithGemini(word, context) {
  const cacheKey = `${word}`.toLowerCase();
  const storedDefinition = await KnowledgeManager.getJargonDefinition(cacheKey);
  if (storedDefinition) return storedDefinition;
  const ragHit = await retrieveSimilarExplanation('jargon', word);
  if (ragHit?.result?.definition) return ragHit.result.definition;
  const selection = chooseModelForTask('jargon_definition', { word, context });
  if (selection.provider === 'local' || !GEMINI_API_KEY) {
    return `Complex term meaning "${word}"`;
  }
  if (jargonCache.has(cacheKey)) {
    return jargonCache.get(cacheKey);
  }
  const url = `${GEMINI_API_URL}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const primaryPayload = {
    contents: [
      {
        parts: [{ text: `You are a reading-accessibility assistant. Explain the given word in very simple terms (<= 20 words). Return ONLY a short plain-text definition.\n\nWord: ${word}\nContext: ${context || ''}\nExplain simply.` }]
      }
    ]
  };

  let definition = `Complex term meaning "${word}"`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(primaryPayload)
    });

    if (!response.ok) throw new Error(`Gemini API returned ${response.status}`);
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.map(part => part.text).join('') || '';
    definition = text.trim() || definition;
  } catch (error) {
    definition = `Complex term meaning "${word}"`;
  }

  if (jargonCache.size >= JARGON_CACHE_MAX_SIZE) {
    const firstKey = jargonCache.keys().next().value;
    jargonCache.delete(firstKey);
  }
  jargonCache.set(cacheKey, definition);
  KnowledgeManager.setJargonDefinition(cacheKey, definition);
  saveExplanationHistory('jargon', word, { definition });
  return definition;
}

function getToneFallback(text) {
  const clean = (text || '').trim();
  if (!clean) {
    return { tone: 'literal', explanation: 'No text provided.' };
  }
  const lower = clean.toLowerCase();
  const hasExclamation = /!/.test(clean);
  const allCaps = clean.length > 8 && clean === clean.toUpperCase();
  const urgentWords = /asap|urgent|immediately|right away|now|important|deadline/.test(lower);
  const aggressiveWords = /idiot|stupid|shut up|nonsense|ridiculous|hate|angry|furious/.test(lower);
  const supportiveWords = /you can|you've got|we can|hang in|proud of|great job|support|thanks/.test(lower);
  const sarcasticMarkers = /yeah right|sure,? (jan)?|as if|totally|\/s/.test(lower);
  const formalMarkers = /therefore|furthermore|moreover|hence|however|consequently|regarding/.test(lower);
  const casualMarkers = /lol|lmk|btw|gonna|wanna|kinda|yeah|hey|:\)/.test(lower);

  if (aggressiveWords || (allCaps && hasExclamation)) {
    return { tone: 'aggressive', explanation: 'Harsh wording or intensity suggests aggression.' };
  }
  if (urgentWords || (hasExclamation && /please/.test(lower))) {
    return { tone: 'urgent', explanation: 'Direct urgency cues imply time pressure.' };
  }
  if (supportiveWords) {
    return { tone: 'supportive', explanation: 'Encouraging language suggests support.' };
  }
  if (sarcasticMarkers) {
    return { tone: 'sarcastic', explanation: 'Markers like “yeah right” imply sarcasm.' };
  }
  if (formalMarkers) {
    return { tone: 'formal', explanation: 'Formal connectors and structure suggest formality.' };
  }
  if (casualMarkers) {
    return { tone: 'casual', explanation: 'Informal words and tone suggest casual speech.' };
  }
  return { tone: 'literal', explanation: 'Neutral phrasing suggests a literal tone.' };
}

async function analyzeToneWithGemini(text, context) {
  if (!GEMINI_API_KEY) throw new Error('Missing Gemini API key');
  const cacheKey = simpleHash(`${text}::${context || ''}`);
  if (toneCache.has(cacheKey)) return toneCache.get(cacheKey);

  const url = `${GEMINI_API_URL}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const payload = {
    contents: [
      {
        parts: [
          {
            text: `You are a tone classifier. Analyze the text and return ONLY JSON with keys tone and explanation.\nTones: literal, formal, casual, sarcastic, urgent, aggressive, supportive.\nKeep explanation to one short sentence.\n\nText: ${text}\nContext: ${context || ''}`
          }
        ]
      }
    ]
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error(`Gemini API returned ${response.status}`);
  const data = await response.json();
  const raw = data.candidates?.[0]?.content?.parts?.map(part => part.text).join('') || '';
  const jsonStart = raw.indexOf('{');
  const jsonEnd = raw.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) throw new Error('Gemini did not return JSON');
  const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
  const result = {
    tone: parsed.tone || 'literal',
    explanation: parsed.explanation || 'Neutral phrasing suggests a literal tone.'
  };

  if (toneCache.size >= TONE_CACHE_MAX_SIZE) {
    const firstKey = toneCache.keys().next().value;
    toneCache.delete(firstKey);
  }
  toneCache.set(cacheKey, result);
  return result;
}

async function analyzeToneWithAI(text, context) {
  const cacheKey = simpleHash(`${text}::${context || ''}`);
  if (toneCache.has(cacheKey)) return toneCache.get(cacheKey);

  const ragHit = await retrieveSimilarExplanation('tone', text);
  if (ragHit?.result?.tone) return ragHit.result;

  const selection = chooseModelForTask('tone_detection', { text, context });
  if (selection.provider === 'local' || !GEMINI_API_KEY) {
    const fallback = getToneFallback(text);
    toneCache.set(cacheKey, fallback);
    saveExplanationHistory('tone', text, fallback, { source: 'fallback' });
    return fallback;
  }

  try {
    const result = await analyzeToneWithGemini(text, context);
    saveExplanationHistory('tone', text, result);
    return result;
  } catch (error) {
    const fallback = getToneFallback(text);
    toneCache.set(cacheKey, fallback);
    saveExplanationHistory('tone', text, fallback, { source: 'error' });
    return fallback;
  }
}

async function simplifyTextWithAI(text, retryCount = 0) {
  const textHash = simpleHash(text);
  
  if (aiCache.has(textHash)) {
    console.log('AI: Cache hit');
    return aiCache.get(textHash);
  }
  
  if (!GEMINI_API_KEY && !HF_API_TOKEN) {
    const mockResult = mockSimplify(text);
    cacheResult(textHash, mockResult);
    return mockResult;
  }
  
  try {
    const selection = chooseModelForTask('simplify_text', { text });
    if (selection.provider === 'gemini' && GEMINI_API_KEY) {
      const simplified = await simplifyTextWithGemini(text);
      cacheResult(textHash, simplified);
      trackPageSimplification();
      return simplified;
    }

    if (selection.provider === 'huggingface' && HF_API_TOKEN) {
      const simplified = await simplifyTextWithHuggingFace(text);
      cacheResult(textHash, simplified);
      trackPageSimplification();
      return simplified;
    }

    if (GEMINI_API_KEY) {
      const simplified = await simplifyTextWithGemini(text);
      cacheResult(textHash, simplified);
      trackPageSimplification();
      return simplified;
    }

    if (HF_API_TOKEN) {
      const simplified = await simplifyTextWithHuggingFace(text);
      cacheResult(textHash, simplified);
      trackPageSimplification();
      return simplified;
    }

    const mockResult = mockSimplify(text);
    cacheResult(textHash, mockResult);
    return mockResult;
  } catch (error) {
    console.error('AI API error:', error);
    if (retryCount < 2) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return simplifyTextWithAI(text, retryCount + 1);
    }
    const fallbackResult = mockSimplify(text);
    cacheResult(textHash, fallbackResult);
    return fallbackResult;
  }
}

function mockSimplify(text) {
  let simplified = text;
  
  const simplifications = {
    'utilize': 'use', 'implement': 'use', 'additional': 'more',
    'purchase': 'buy', 'numerous': 'many', 'facilitate': 'help',
    'terminate': 'end', 'demonstrate': 'show', 'consequently': 'so',
    'nevertheless': 'but', 'furthermore': 'also', 'approximately': 'about',
    'significant': 'big', 'substantial': 'large', 'however': 'but',
    'therefore': 'so', 'moreover': 'also'
  };
  
  for (const [complex, simple] of Object.entries(simplifications)) {
    const regex = new RegExp(`\\b${complex}\\b`, 'gi');
    simplified = simplified.replace(regex, simple);
  }
  
  simplified = simplified.replace(/([.!?])\s+/g, '$1\n\n');
  
  if (simplified.length > 2000) simplified = simplified.substring(0, 2000) + '...';
  
  return simplified;
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString();
}

function cacheResult(hash, result) {
  if (aiCache.size >= CACHE_MAX_SIZE) {
    const firstKey = aiCache.keys().next().value;
    aiCache.delete(firstKey);
  }
  aiCache.set(hash, result);
}

// ========== ANALYTICS TRACKING ==========

function trackPageSimplification() {
  chrome.storage.local.get([ANALYTICS_KEY], (result) => {
    const analytics = result[ANALYTICS_KEY];
    if (analytics) {
      analytics.totalPagesSimplified++;
      chrome.storage.local.set({ [ANALYTICS_KEY]: analytics });
    }
  });
}

function trackFeatureUsage(feature) {
  chrome.storage.local.get([ANALYTICS_KEY], (result) => {
    const analytics = result[ANALYTICS_KEY];
    if (analytics && analytics.featureUsage[feature] !== undefined) {
      analytics.featureUsage[feature]++;
      chrome.storage.local.set({ [ANALYTICS_KEY]: analytics });
    }
  });
}

function trackJargonHover() {
  chrome.storage.local.get([ANALYTICS_KEY], (result) => {
    const analytics = result[ANALYTICS_KEY];
    if (analytics) {
      analytics.totalJargonHovers++;
      chrome.storage.local.set({ [ANALYTICS_KEY]: analytics });
    }
  });
}

function saveCognitiveScore(score) {
  chrome.storage.local.get([ANALYTICS_KEY], (result) => {
    const analytics = result[ANALYTICS_KEY];
    if (analytics) {
      analytics.averageCognitiveScore.push(score);
      if (analytics.averageCognitiveScore.length > 100) {
        analytics.averageCognitiveScore.shift();
      }
      chrome.storage.local.set({ [ANALYTICS_KEY]: analytics });
    }
  });
}

// ========== KEYBOARD SHORTCUTS ==========

chrome.commands.onCommand.addListener((command) => {
  const commandToSetting = {
    'toggle-dyslexic-font': 'dyslexicFont',
    'toggle-soft-colors': 'softColors',
    'toggle-remove-distractions': 'removeDistractions',
    'toggle-reading-ruler': 'readingRuler'
  };
  
  const settingKey = commandToSetting[command];
  if (settingKey) {
    chrome.storage.local.get([settingKey], (result) => {
      const currentValue = result[settingKey] || false;
      const newValue = !currentValue;
      const update = {};
      update[settingKey] = newValue;
      
      chrome.storage.local.set(update, () => {
        trackFeatureUsage(settingKey);
        safeSendToAllTabs({ action: 'settingsUpdated', settings: update });
      });
    });
  }
});

// ========== RAG INTEGRATION ==========

let ragStore = {
  cache: new Map(),
  add: function(original, simplified, domain) {
    const key = original.substring(0, 100);
    this.cache.set(key, { simplified, domain, votes: 0, timestamp: Date.now() });
    if (this.cache.size > 200) {
      const oldest = [...this.cache.entries()].sort((a,b) => a[1].timestamp - b[1].timestamp)[0];
      this.cache.delete(oldest[0]);
    }
    this.saveToStorage();
  },
  find: function(query, domain) {
    for (const [key, value] of this.cache) {
      if (query.toLowerCase().includes(key.toLowerCase()) && value.domain === domain) {
        value.votes++;
        return value.simplified;
      }
    }
    return null;
  },
  saveToStorage: function() {
    const cacheObj = {};
    for (const [k, v] of this.cache) {
      cacheObj[k] = v;
    }
    chrome.storage.local.set({ rag_cache: cacheObj });
  },
  loadFromStorage: function() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['rag_cache'], (result) => {
        if (result.rag_cache) {
          this.cache.clear();
          for (const [k, v] of Object.entries(result.rag_cache)) {
            this.cache.set(k, v);
          }
        }
        resolve();
      });
    });
  }
};

ragStore.loadFromStorage();

// ========== MESSAGE HANDLING ==========

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received:', request.action);
  
  if (request.action === 'getSettings') {
    chrome.storage.local.get(null, (settings) => {
      sendResponse(settings);
    });
    return true;
  }
  
  if (request.action === 'simplifyText') {
    simplifyTextWithAI(request.text)
      .then(simplified => sendResponse({ success: true, simplifiedText: simplified }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'analyzePageStructure') {
    analyzeDomWithGemini(request.html)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (request.action === 'trackJargonHover') {
    trackJargonHover();
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'defineJargon') {
    defineJargonWithGemini(request.word, request.context)
      .then(definition => sendResponse({ success: true, definition }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'analyzeTone') {
    analyzeToneWithAI(request.text, request.context)
      .then(result => sendResponse({ success: true, tone: result.tone, explanation: result.explanation }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (request.action === 'saveCognitiveScore') {
    saveCognitiveScore(request.score);
    sendResponse({ success: true });
    return true;
  }
  
  if (request.action === 'submitCorrection') {
    ragStore.add(request.original, request.correction, request.domain);
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'recordFeatureOverride') {
    saveSitePreference(request.hostname, request.feature, request.enabled, request.pageCategory)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'getLearnedPreferences') {
    applyLearnedPreferences(request.hostname, request.pageCategory, request.currentSettings)
      .then(overrides => sendResponse({ success: true, overrides }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  sendResponse({ success: true });
});