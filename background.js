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
const TONE_CACHE_MAX_SIZE = 200;
const toneCache = new Map();
const ANALYTICS_KEY = 'neuro_analytics';

// ========== LRU CACHE (REUSABLE) ==========
// Small, dependency-free LRU cache with safe string keys and TTL.
class LRUCache {
  constructor(maxSize = 100, defaultTtlMs = 3600000) {
    this.maxSize = Math.max(1, maxSize);
    this.defaultTtlMs = defaultTtlMs;
    this.map = new Map();
  }

  normalizeKey(key) {
    const safe = String(key ?? '').trim();
    return safe.length > 200 ? safe.slice(0, 200) : safe;
  }

  _isExpired(entry) {
    return entry.expiresAt && entry.expiresAt < Date.now();
  }

  get(key) {
    const safeKey = this.normalizeKey(key);
    if (!this.map.has(safeKey)) return undefined;

    const entry = this.map.get(safeKey);
    if (this._isExpired(entry)) {
      this.map.delete(safeKey);
      return undefined;
    }

    this.map.delete(safeKey);
    this.map.set(safeKey, entry);
    return entry.value;
  }

  set(key, value, ttlMs = null) {
    const safeKey = this.normalizeKey(key);
    const expiresAt = Date.now() + (ttlMs || this.defaultTtlMs);
    const entry = { value, expiresAt };

    if (this.map.has(safeKey)) this.map.delete(safeKey);
    this.map.set(safeKey, entry);

    this._cleanExpired();

    if (this.map.size > this.maxSize) {
      const oldestKey = this.map.keys().next().value;
      this.map.delete(oldestKey);
    }
  }

  _cleanExpired() {
    const now = Date.now();
    for (const [key, entry] of this.map) {
      if (entry.expiresAt < now) {
        this.map.delete(key);
      }
    }
  }

  has(key) {
    const safeKey = this.normalizeKey(key);
    if (!this.map.has(safeKey)) return false;

    const entry = this.map.get(safeKey);
    if (this._isExpired(entry)) {
      this.map.delete(safeKey);
      return false;
    }
    return true;
  }

  clear() {
    this.map.clear();
  }

  getTTL(key) {
    const safeKey = this.normalizeKey(key);
    const entry = this.map.get(safeKey);
    if (!entry || this._isExpired(entry)) return 0;
    return entry.expiresAt - Date.now();
  }
}

// Example usage: cache jargon explanations in-memory with LRU eviction.
const jargonCache = new LRUCache(JARGON_CACHE_MAX_SIZE, 86400000);
const aiHelperCache = new LRUCache(120, 300000);

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
    analyticsEnabled: true,
    bionicReading: false,
    sensoryAutoBlocker: false,
    cinemaFocus: false
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
  chrome.alarms.create('neuro_break_reminder', { periodInMinutes: 10 });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('neuro_break_reminder', { periodInMinutes: 10 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== 'neuro_break_reminder') return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs?.[0];
    if (!tab?.id || !tab.url || tab.url.startsWith('chrome://')) return;
    safeSendMessage(tab.id, { action: 'showMeditationBreak' });
  });
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

// ========== GEMINI QUEUE + RETRY ==========
class FastQueue {
  constructor() {
    this.items = [];
    this.head = 0;
    this.tail = 0;
  }

  enqueue(item) {
    this.items[this.tail++] = item;
  }

  dequeue() {
    if (this.head === this.tail) return null;
    const item = this.items[this.head];
    this.items[this.head] = null;
    this.head++;

    if (this.head === this.tail) {
      this.items = [];
      this.head = 0;
      this.tail = 0;
    }
    return item;
  }

  size() {
    return this.tail - this.head;
  }

  isEmpty() {
    return this.size() === 0;
  }
}

let geminiRateLimitedUntil = 0;
const geminiQueue = new FastQueue();
let geminiBusy = false;

function processGeminiQueue() {
  if (geminiBusy) return;
  if (geminiQueue.isEmpty()) return;

  const next = geminiQueue.dequeue();
  if (!next) return;

  geminiBusy = true;
  Promise.resolve()
    .then(next.fn)
    .then(next.resolve)
    .catch(next.reject)
    .finally(() => {
      setTimeout(() => {
        geminiBusy = false;
        processGeminiQueue();
      }, 1000);
    });
}

function runGeminiQueued(fn) {
  return new Promise((resolve, reject) => {
    geminiQueue.enqueue({ fn, resolve, reject });
    processGeminiQueue();
  });
}

function isRateLimitError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('quota') || message.includes('rate') || message.includes('429');
}

async function callGeminiWithRetry(fn) {
  if (Date.now() < geminiRateLimitedUntil) {
    throw new Error('Gemini API is currently rate limited (Circuit Broken)');
  }
  try {
    return await fn();
  } catch (error) {
    if (isRateLimitError(error)) {
      console.warn('Gemini rate limit hit. Breaking circuit for 60 seconds.');
      geminiRateLimitedUntil = Date.now() + 60000;
    }
    throw error;
  }
}

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
    if (hasGemini) {
      return { provider: 'gemini', model: GEMINI_MODEL, reason: 'prefer gemini for jargon definitions' };
    }
    return { provider: 'local', model: 'heuristic-v1', reason: 'cloud unavailable' };
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
    if (hasGemini) {
      return { provider: 'gemini', model: GEMINI_MODEL, reason: 'prefer gemini for full-detail simplification' };
    }
    if (hasHf) {
      return { provider: 'huggingface', model: HF_API_URL, reason: 'fallback summarization model' };
    }
    return { provider: 'local', model: 'heuristic-v1', reason: 'no model available' };
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

// Replace the existing simplifyTextWithGemini function
async function simplifyTextWithGemini(text) {
  const url = `${GEMINI_API_URL}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const prompt = `You are a cognitive accessibility rewriter. 
TASK: Split the following paragraph into a detailed list of simple bullet points.

RULES:
1. DO NOT SUMMARIZE. Keep all the facts and details.
2. Break long sentences into multiple shorter bullets.
3. Use plain, direct language.
4. Output ONLY the bullets, one per line, starting with "•".
5. Do not include any introductory text.

Text to process:
${text}`;



  const response = await callGeminiWithRetry(() =>
    runGeminiQueued(() => fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 900,
          topP: 0.9
        }
      })
    }))
  );

  // 🔥 ADD THIS DEBUG BLOCK
  const rawText = await response.text();

  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    data = { rawText };
  }

  console.log("🔥 GEMINI DEBUG");
  console.log("Status:", response.status);
  console.log("Response:", data);

  // 👇 VERY IMPORTANT: THROW FULL ERROR
  if (!response.ok) {
    throw new Error(
      `Gemini Error ${response.status}: ${data?.error?.message || rawText
      }`
    );
  }
  const candidate = data.candidates?.[0]?.content?.parts?.map(part => part.text).join('') || '';
  return candidate || text;
}

// Replace the existing mockSimplify function with aggressive local simplification
function mockSimplify(text) {
  if (!text || text.length < 50) return text;

  const replacements = {
    'utilize': 'use',
    'implement': 'use',
    'additional': 'more',
    'purchase': 'buy',
    'numerous': 'many',
    'facilitate': 'help',
    'terminate': 'end',
    'demonstrate': 'show',
    'consequently': 'so',
    'nevertheless': 'but',
    'furthermore': 'also',
    'approximately': 'about',
    'significant': 'big',
    'substantial': 'large',
    'however': 'but',
    'therefore': 'so',
    'moreover': 'also',
    'subsequent': 'next',
    'prior to': 'before',
    'in order to': 'to',
    'due to the fact that': 'because',
    'for the purpose of': 'for',
    'with the exception of': 'except',
    'in the event that': 'if',
    'on the other hand': 'but',
    'as a result': 'so',
    'in addition': 'also',
    'first and foremost': 'first',
    'last but not least': 'finally',
    'at this point in time': 'now',
    'in the near future': 'soon',
    'a large number of': 'many',
    'a small number of': 'few',
    'the majority of': 'most',
    'a variety of': 'many',
    'in the process of': 'currently',
    'has the ability to': 'can',
    'is able to': 'can',
    'is required to': 'must',
    'it is possible that': 'maybe',
    'it is important to': 'remember to',
    'worth mentioning': 'note'
  };

  const sentences = text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  if (!sentences.length) return text;

  const simplifiedSentences = sentences.map((sentence) => {
    let simplified = sentence;
    for (const [complex, simple] of Object.entries(replacements)) {
      const regex = new RegExp(`\\b${complex}\\b`, 'gi');
      simplified = simplified.replace(regex, simple);
    }
    simplified = simplified.replace(/\b(was|were|been|being)\s+(\w+ed)\b/gi, '$2');
    return simplified.trim();
  }).filter(Boolean);

  return simplifiedSentences.map(sentence => `• ${sentence}`).join('\n');
}

async function analyzeDomWithGemini(html) {
  if (!GEMINI_API_KEY) throw new Error('Missing Gemini API key');
  const url = `${GEMINI_API_URL}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const response = await callGeminiWithRetry(() =>
    runGeminiQueued(() => fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: `You are a cognitive accessibility expert. Analyze the provided HTML. Identify the CSS selectors for the most important navigation and the primary reading material. Identify clutter that causes sensory overload. Return ONLY valid JSON.\n\nReturn JSON with keys:\n- navSelector: CSS selector for primary navigation\n- mainContentSelector: CSS selector for primary reading area\n- distractions: array of CSS selectors for clutter (ads, sidebars, popups)\n- fPatternTargets: array of CSS selectors for key elements to emphasize in the F-pattern\n- cardSelectors: array of CSS selectors for long unstructured blocks to wrap as cards\n\nKeep selectors short and stable. Return ONLY valid JSON.\n\nHTML:\n${html}` }]
          }
        ]
      })
    }))
  );

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
  const isPlaceholder = storedDefinition && storedDefinition.startsWith('Complex term meaning');
  if (storedDefinition && (!GEMINI_API_KEY || !isPlaceholder)) return storedDefinition;
  const ragHit = await retrieveSimilarExplanation('jargon', word);
  if (ragHit?.result?.definition && (!GEMINI_API_KEY || !ragHit.result.definition.startsWith('Complex term meaning'))) {
    return ragHit.result.definition;
  }
  const selection = chooseModelForTask('jargon_definition', { word, context });
  if (selection.provider === 'local' || !GEMINI_API_KEY) {
    throw new Error('Gemini unavailable for jargon definition');
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

  let definition = '';
  try {
    const response = await callGeminiWithRetry(() =>
      runGeminiQueued(() => fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(primaryPayload)
      }))
    );

    if (!response.ok) throw new Error(`Gemini API returned ${response.status}`);
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.map(part => part.text).join('') || '';
    definition = text.trim() || definition;
    if (!definition || definition.length < 5) {
      throw new Error('Empty definition from Gemini');
    }
  } catch (error) {
    console.warn('Gemini jargon lookup failed/rate-limited. Using fallback.', error);
    definition = `Context-dependent term (Fallback definition for: ${word})`;
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

  const response = await callGeminiWithRetry(() =>
    runGeminiQueued(() => fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }))
  );

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

async function inferGoalPlanWithGemini(payload = {}) {
  if (!GEMINI_API_KEY) throw new Error('Missing Gemini API key');
  const url = `${GEMINI_API_URL}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const context = payload.context || {};
  const settings = payload.settings || {};
  const userGoal = payload.userGoal || '';

  const prompt = `You are a cognitive accessibility planner.
Infer a user goal from the page context and produce a short plan.

Rules (use these to infer the goal if userGoal is empty):
- article/docs/long paragraphs -> read
- social feed/clutter/many distractions -> focus
- short overview page -> skim
- visually noisy/many banners/shopping -> calm

Return ONLY JSON with keys:
goal: one of [read, focus, skim, calm]
actions: array of 1-3 items.

Allowed actions (only these):
- {"type":"set_feature","feature":"simplifyText|readingRuler|removeDistractions|removeAnimations|softColors|toneDecoder|jargonExplainer","enabled":true|false}

Context:
${JSON.stringify({ context, settings, userGoal })}`;

  const response = await callGeminiWithRetry(() =>
    runGeminiQueued(() => fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 350,
          topP: 0.9
        }
      })
    }))
  );

  if (!response.ok) throw new Error(`Gemini API returned ${response.status}`);
  const data = await response.json();
  const raw = data.candidates?.[0]?.content?.parts?.map(part => part.text).join('') || '';
  const jsonStart = raw.indexOf('{');
  const jsonEnd = raw.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) throw new Error('Gemini did not return JSON');
  return JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
}

async function interpretAccessibilityPromptWithGemini(prompt) {
  if (!GEMINI_API_KEY) {
    throw new Error('Missing Gemini API key');
  }

  const cacheKey = String(prompt || '').trim().toLowerCase();
  if (cacheKey && aiHelperCache.has(cacheKey)) {
    return aiHelperCache.get(cacheKey);
  }

  const url = `${GEMINI_API_URL}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const instruction = `You are an accessibility assistant for a browser extension.

Interpret the user's request and return ONLY valid JSON.

Allowed keys:
- dyslexicFont: boolean
- softColors: boolean
- removeDistractions: boolean
- readingRuler: boolean
- removeAnimations: boolean
- simplifyText: boolean
- jargonExplainer: boolean
- toneDecoder: boolean
- themeMode: "light" or "dark"

Rules:
- Only include keys that should change.
- If the user asks for darker / less bright / less glare, prefer {"softColors": true, "themeMode": "dark"}.
- If the user asks for focus or fewer things on screen, prefer {"removeDistractions": true, "removeAnimations": true}.
- If the user asks for easier reading, prefer {"dyslexicFont": true, "simplifyText": true}.
- Return JSON only. No markdown. No explanation.

User request:
${prompt}`;

  const response = await callGeminiWithRetry(() =>
    runGeminiQueued(() => fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: instruction }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 250,
          topP: 0.9
        }
      })
    }))
  );

  const rawText = await response.text();
  let data;

  try {
    data = JSON.parse(rawText);
  } catch {
    data = { rawText };
  }

  if (!response.ok) {
    throw new Error(data?.error?.message || `Gemini API returned ${response.status}`);
  }

  const raw = data.candidates?.[0]?.content?.parts?.map(part => part.text).join('') || '';
  const jsonStart = raw.indexOf('{');
  const jsonEnd = raw.lastIndexOf('}');

  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error('Gemini did not return JSON');
  }

  const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));

  const allowedKeys = new Set([
    'dyslexicFont',
    'softColors',
    'removeDistractions',
    'readingRuler',
    'removeAnimations',
    'simplifyText',
    'jargonExplainer',
    'toneDecoder',
    'themeMode'
  ]);

  const updates = {};
  for (const [key, value] of Object.entries(parsed || {})) {
    if (!allowedKeys.has(key)) continue;
    if (key === 'themeMode') {
      if (value === 'light' || value === 'dark') updates[key] = value;
      continue;
    }
    if (typeof value === 'boolean') updates[key] = value;
  }

  if (cacheKey) aiHelperCache.set(cacheKey, updates);
  return updates;
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

async function estimateReadingAgeWithGemini(text) {
  if (!GEMINI_API_KEY) throw new Error('Missing Gemini API key');
  const url = `${GEMINI_API_URL}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const prompt = `You are a reading-level assessor. Estimate the reading age for the following text. Return ONLY JSON with keys age and grade.\n\nRules:\n- age: number (approximate reading age in years)\n- grade: number (approximate US grade level)\n- If text is too short, return age 0 and grade 0.\n\nText:\n${text}`;

  const response = await callGeminiWithRetry(() =>
    runGeminiQueued(() => fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 200, topP: 0.9 }
      })
    }))
  );

  if (!response.ok) throw new Error(`Gemini API returned ${response.status}`);
  const data = await response.json();
  const raw = data.candidates?.[0]?.content?.parts?.map(part => part.text).join('') || '';
  const jsonStart = raw.indexOf('{');
  const jsonEnd = raw.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) throw new Error('Gemini did not return JSON');
  const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
  return {
    age: Number(parsed.age) || 0,
    grade: Number(parsed.grade) || 0
  };
}

async function simplifyTextBatchWithGemini(texts) {
  if (Date.now() < geminiRateLimitedUntil) throw new Error('Circuit broken');
  if (!GEMINI_API_KEY) throw new Error('No API key');

  const url = `${GEMINI_API_URL}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const prompt = `You are a cognitive accessibility rewriter.
TASK: You will receive a compiled JSON array containing paragraphs of text.
Simplify each paragraph into direct bullet points. Keep all facts.
Return ONLY a valid JSON array of strings, where each string represents the transformed bullet points for that paragraph, in the exact same order.
INPUT:
${JSON.stringify(texts)}`;

  const response = await runGeminiQueued(() => fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1 }
    })
  }));

  if (!response.ok) {
    geminiRateLimitedUntil = Date.now() + 60000;
    throw new Error(`Gemini API returned ${response.status}`);
  }

  const data = await response.json();
  const raw = data.candidates?.[0]?.content?.parts?.map(part => part.text).join('') || '';
  const jsonStart = raw.indexOf('[');
  const jsonEnd = raw.lastIndexOf(']');
  if (jsonStart === -1 || jsonEnd === -1) throw new Error('No JSON array returned');
  return JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
}

async function simplifyTextBatchWithAI(texts) {
  if (!GEMINI_API_KEY || Date.now() < geminiRateLimitedUntil) {
    return texts.map(t => mockSimplify(t));
  }
  try {
    const batched = await simplifyTextBatchWithGemini(texts);
    trackPageSimplification();
    return batched;
  } catch (error) {
    console.error('Batch AI API error/Rate Limited:', error);
    return texts.map(t => mockSimplify(t));
  }
}

async function simplifyTextWithAI(text) {
  const textHash = simpleHash(text);

  if (aiCache.has(textHash)) {
    console.log('AI: Cache hit');
    return aiCache.get(textHash);
  }

  if (!GEMINI_API_KEY) {
    const mockResult = mockSimplify(text);
    cacheResult(textHash, mockResult);
    return mockResult;
  }

  try {
    const simplified = await simplifyTextWithGemini(text);
    cacheResult(textHash, simplified);
    trackPageSimplification();
    return simplified;
  } catch (error) {
    console.error('AI API error/Rate Limited:', error);
    const fallbackResult = mockSimplify(text);
    cacheResult(textHash, fallbackResult);
    return fallbackResult;
  }
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
  add: function (original, simplified, domain) {
    const key = simpleHash(String(original || ''));
    if (this.cache.has(key)) {
        this.cache.delete(key);
    }
    this.cache.set(key, { simplified, domain, votes: 0, timestamp: Date.now() });
    if (this.cache.size > 200) {
      // O(1) cache eviction using Map's native insertion-order iterator
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    this.saveToStorage();
  },
  find: function (query, domain) {
    const key = simpleHash(String(query || ''));
    const entry = this.cache.get(key);
    if (entry && entry.domain === domain) {
      entry.votes++;
      return entry.simplified;
    }
    return null;
  },
  saveToStorage: function () {
    const cacheObj = {};
    for (const [k, v] of this.cache) {
      cacheObj[k] = v;
    }
    chrome.storage.local.set({ rag_cache: cacheObj });
  },
  loadFromStorage: function () {
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

  if (request.action === 'simplifyTextBatch') {
    simplifyTextBatchWithAI(request.texts)
      .then(simplifiedTexts => sendResponse({ success: true, simplifiedTexts }))
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
    if (!GEMINI_API_KEY) {
      sendResponse({ success: false, error: 'Missing GEMINI_API_KEY' });
      return true;
    }
    defineJargonWithGemini(request.word, request.context)
      .then(definition => sendResponse({ success: true, definition }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'inferGoalPlan') {
    inferGoalPlanWithGemini(request.payload)
      .then(plan => sendResponse({ success: true, plan }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'aiHelperInterpret') {
    (async () => {
      try {
        const updates = await interpretAccessibilityPromptWithGemini(request.prompt || '');
        sendResponse({
          success: true,
          updates,
          message: Object.keys(updates).length
            ? 'Applied changes based on your request.'
            : 'I understood the request, but no setting changes were needed.'
        });
      } catch (error) {
        sendResponse({
          success: false,
          error: error.message || 'AI helper failed'
        });
      }
    })();

    return true;
  }

  if (request.action === 'analyzeTone') {
    analyzeToneWithAI(request.text, request.context)
      .then(result => sendResponse({ success: true, tone: result.tone, explanation: result.explanation }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'estimateReadingAge') {
    estimateReadingAgeWithGemini(request.text)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }))
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