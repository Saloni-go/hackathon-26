// content.js - Complete Neuro-Inclusive Web Extension with Safe Messaging
console.log('Neuro-Inclusive content script loaded v2.0');

let currentSettings = {
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
  sensoryAutoBlocker: false
};

let readingRulerElement = null;
let observer = null;
let animationObserver = null;
let cognitiveScoreDisplay = null;
let learnedOverrides = {};
let layoutStabilizerObserver = null;

const TRACKED_FEATURES = [
  'dyslexicFont',
  'softColors',
  'removeDistractions',
  'readingRuler',
  'removeAnimations',
  'simplifyText',
  'jargonExplainer',
  'toneDecoder',
  'bionicReading',
  'sensoryAutoBlocker'
];

// ========== LRU CACHE (REUSABLE) ==========
// Small, dependency-free LRU cache with safe string keys.
class LRUCache {
  constructor(maxSize = 100) {
    this.maxSize = Math.max(1, maxSize);
    this.map = new Map();
  }

  normalizeKey(key) {
    const safe = String(key ?? '').trim();
    return safe.length > 200 ? safe.slice(0, 200) : safe;
  }

  get(key) {
    const safeKey = this.normalizeKey(key);
    if (!this.map.has(safeKey)) return undefined;
    const value = this.map.get(safeKey);
    this.map.delete(safeKey);
    this.map.set(safeKey, value);
    return value;
  }

  set(key, value) {
    const safeKey = this.normalizeKey(key);
    if (this.map.has(safeKey)) this.map.delete(safeKey);
    this.map.set(safeKey, value);
    if (this.map.size > this.maxSize) {
      const oldestKey = this.map.keys().next().value;
      this.map.delete(oldestKey);
    }
  }

  has(key) {
    return this.map.has(this.normalizeKey(key));
  }

  clear() {
    this.map.clear();
  }
}

// Example usage: cache expensive DOM context detection.
const siteContextCache = new LRUCache(20);

// ========== SAFE MESSAGING UTILITY ==========

function safeSendMessage(message, callback) {
  try {
    chrome.runtime.sendMessage(message, (response) => {
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

// ========== DEBOUNCE + BATCHED OBSERVER UTILITIES ==========
// Debouncing helps avoid reacting to every micro-mutation, which keeps pages smooth.
function debounce(fn, delay = 150) {
  let timerId = null;
  return (...args) => {
    if (timerId) clearTimeout(timerId);
    timerId = setTimeout(() => fn(...args), delay);
  };
}

function extractAddedElementRoots(mutations, maxNodes = 40) {
  const candidates = [];
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        candidates.push(node);
      }
    });
  });

  if (candidates.length === 0) return [];
  const limited = candidates.slice(0, maxNodes);

  // Remove duplicates and subtrees to avoid rescanning the same region.
  const unique = [];
  for (const node of limited) {
    if (unique.some(existing => existing.contains(node))) continue;
    for (let i = unique.length - 1; i >= 0; i--) {
      if (node.contains(unique[i])) unique.splice(i, 1);
    }
    unique.push(node);
  }

  return unique;
}

function createBatchedMutationObserver({
  delay = 150,
  maxMutations = 150,
  maxNodes = 40,
  onBatch
}) {
  let pending = [];
  const flush = debounce(() => {
    if (pending.length === 0) return;
    const mutations = pending.slice(0, maxMutations);
    pending = [];
    const roots = extractAddedElementRoots(mutations, maxNodes);
    if (roots.length === 0) return;
    onBatch?.({ mutations, roots });
  }, delay);

  const observer = new MutationObserver((mutations) => {
    if (!mutations || mutations.length === 0) return;
    pending.push(...mutations);
    flush();
  });

  return {
    observe(target, options) {
      observer.observe(target, options);
    },
    disconnect() {
      observer.disconnect();
      pending = [];
    }
  };
}

// ========== PRIORITY QUEUE (LIGHTWEIGHT) ==========
// Processes higher-priority items first without external libraries.
class PriorityQueue {
  constructor() {
    this.items = [];
  }

  enqueue(item, priority = 0) {
    this.items.push({ item, priority });
    this.items.sort((a, b) => b.priority - a.priority);
  }

  dequeue() {
    return this.items.shift()?.item ?? null;
  }

  isEmpty() {
    return this.items.length === 0;
  }

  clear() {
    this.items = [];
  }
}

function isVisibleElement(element) {
  if (!element || !(element instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function scoreContentElement(element) {
  if (!element || !(element instanceof HTMLElement)) return -5;
  const tag = (element.tagName || '').toLowerCase();
  const text = (element.innerText || '').trim();
  if (!text) return -5;

  let score = 0;
  if (isMainContent(element)) score += 6;
  if (isVisibleElement(element)) score += 4;
  if (/h1|h2|h3|h4|h5|h6/.test(tag)) score += 4;
  if (tag === 'p' || tag === 'li') score += 3;
  if (element.closest('article')) score += 3;

  const classHint = (element.className || '').toLowerCase();
  const idHint = (element.id || '').toLowerCase();
  if (/footer|comment|sidebar|aside|nav|menu/.test(classHint + idHint)) score -= 6;

  if (text.length > 40) score += 1;
  if (text.length > 160) score += 1;

  return score;
}

function collectCandidateElements(root) {
  if (!root) return [];
  return Array.from(root.querySelectorAll('article, section, p, li, h1, h2, h3, h4, h5, h6, aside, footer'));
}

// ========== INITIALIZATION ==========

chrome.storage.local.get(
  ['dyslexicFont', 'softColors', 'themeMode', 'themePalette', 'removeDistractions', 'readingRuler', 'removeAnimations', 'simplifyText', 'jargonExplainer', 'toneDecoder', 'cognitiveScoring', 'analyticsEnabled', 'bionicReading', 'sensoryAutoBlocker', 'cinemaFocus'],
  (result) => {
    currentSettings.dyslexicFont = result.dyslexicFont || false;
    currentSettings.softColors = result.softColors || false;
    currentSettings.themeMode = result.themeMode === 'dark' ? 'dark' : 'light';
    currentSettings.themePalette = result.themePalette || (currentSettings.themeMode === 'dark' ? 'softCharcoal' : 'creamSepia');
    currentSettings.removeDistractions = result.removeDistractions || false;
    currentSettings.readingRuler = result.readingRuler || false;
    currentSettings.removeAnimations = result.removeAnimations || false;
    currentSettings.simplifyText = result.simplifyText || false;
    currentSettings.jargonExplainer = result.jargonExplainer || false;
    currentSettings.toneDecoder = result.toneDecoder || false;
    currentSettings.cognitiveScoring = result.cognitiveScoring !== false;
    currentSettings.analyticsEnabled = result.analyticsEnabled !== false;
    currentSettings.bionicReading = result.bionicReading || false;
    currentSettings.sensoryAutoBlocker = result.sensoryAutoBlocker || false;
    currentSettings.cinemaFocus = result.cinemaFocus || false;

    applyAllModifications();

    if (currentSettings.simplifyText) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => simplifyPageWithAI());
      } else {
        simplifyPageWithAI();
      }
    }

    if (!currentSettings.readingRuler) {
      removeReadingRuler();
    }

    refreshLearnedPreferences();

    if (currentSettings.cognitiveScoring) {
      setTimeout(() => calculateAndDisplayCognitiveScore(), 1500);
    }
  }
);

// Safe message listener
try {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
      if (request.action === 'settingsUpdated') {
        const previousSettings = { ...currentSettings };
        currentSettings = { ...currentSettings, ...request.settings };
        recordFeatureOverrides(previousSettings, currentSettings);
        applyAllModifications();
        if (!previousSettings.simplifyText && currentSettings.simplifyText) {
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => simplifyPageWithAI());
          } else {
            simplifyPageWithAI();
          }
        }
        if (!currentSettings.readingRuler) {
          removeReadingRuler();
        }
        sendResponse({ success: true });
      }



      if (request.action === 'simplifyPageWithAI') {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => simplifyPageWithAI());
        } else {
          simplifyPageWithAI();
        }
        sendResponse({ success: true });
      }

      if (request.action === 'enableCorrectionMode') {
        enableCorrectionMode();
        sendResponse({ success: true });
      }

      return true;

    } catch (e) {
      console.warn('Message handler error:', e);
      sendResponse({ success: false, error: e.message });
      return true;
    }
  });
} catch (e) {
  console.warn('Failed to add message listener:', e);
}

// ========== MAIN APPLY FUNCTION ==========

function applyAllModifications() {
  runMasterOrchestrator().catch((error) => {
    console.warn('Master Orchestrator failed, falling back to safe defaults:', error);
    try { removeDyslexiaFont(); } catch (e) { }
    try { removeSoftColors(); } catch (e) { }
    try { stopDistractionObserver(); } catch (e) { }
    try { removeReadingRuler(); } catch (e) { }
    try { stopAnimationObserver(); } catch (e) { }
    try { removeStructuredLayout(); } catch (e) { }
  });
}

async function runAgentLoop() {
  const context = detectSiteContext();
  const settings = await getEnabledSettingsFromStorage();
  const userGoal = settings.userIntent || '';

  const payload = {
    context: {
      pageType: context.pageType,
      signals: context.signals,
      hostname: context.hostname,
      textLength: (document.body?.innerText || '').trim().length
    },
    settings,
    userGoal
  };

  const planResult = await new Promise((resolve) => {
    safeSendMessage({ action: 'inferGoalPlan', payload }, (response, error) => {
      if (error || !response?.success) {
        resolve({ error: response?.error || error?.message || 'Unknown error' });
        return;
      }
      resolve(response.plan || null);
    });
  });

  if (!planResult || planResult.error) {
    console.warn('Agent loop failed:', planResult?.error || 'No plan');
    return;
  }

  const { goal, actions } = planResult;
  const safeActions = Array.isArray(actions) ? actions.slice(0, 3) : [];
  const applied = await applyAgentActions(safeActions);

  chrome.storage.local.set({
    userIntent: goal || userGoal,
    agentLastRun: {
      goal: goal || userGoal,
      actions: safeActions,
      applied,
      timestamp: Date.now()
    }
  });
}

async function applyAgentActions(actions = []) {
  const updates = {};
  const applied = [];

  actions.forEach((action) => {
    if (!action || action.type !== 'set_feature') return;
    const feature = action.feature;
    const enabled = action.enabled;
    if (typeof enabled !== 'boolean') return;
    if (!TRACKED_FEATURES.includes(feature) && !['softColors', 'removeAnimations', 'simplifyText', 'jargonExplainer', 'toneDecoder', 'readingRuler', 'removeDistractions'].includes(feature)) {
      return;
    }
    updates[feature] = enabled;
    applied.push({ feature, enabled });
  });

  if (Object.keys(updates).length === 0) return [];

  await new Promise((resolve) => chrome.storage.local.set(updates, resolve));
  currentSettings = { ...currentSettings, ...updates };
  applyAllModifications();
  if (updates.simplifyText) simplifyPageWithAI();
  if (updates.readingRuler === false) removeReadingRuler();

  return applied;
}

function getEnabledSettingsFromStorage() {
  return new Promise((resolve) => {
    const keys = [
      'dyslexicFont', 'softColors', 'themeMode', 'themePalette',
      'removeDistractions', 'readingRuler', 'removeAnimations',
      'simplifyText', 'jargonExplainer', 'toneDecoder', 'cognitiveScoring', 'analyticsEnabled',
      'userIntent', 'bionicReading', 'sensoryAutoBlocker', 'cinemaFocus'
    ];
    chrome.storage.local.get(keys, (result) => {
      const settings = {
        dyslexicFont: result.dyslexicFont || false,
        softColors: result.softColors || false,
        themeMode: result.themeMode === 'dark' ? 'dark' : 'light',
        themePalette: result.themePalette || 'creamSepia',
        removeDistractions: result.removeDistractions || false,
        readingRuler: result.readingRuler || false,
        removeAnimations: result.removeAnimations || false,
        simplifyText: result.simplifyText || false,
        jargonExplainer: result.jargonExplainer || false,
        toneDecoder: result.toneDecoder || false,
        cognitiveScoring: result.cognitiveScoring !== false,
        analyticsEnabled: result.analyticsEnabled !== false,
        userIntent: result.userIntent || '',
        bionicReading: result.bionicReading || false,
        sensoryAutoBlocker: result.sensoryAutoBlocker || false,
        cinemaFocus: result.cinemaFocus || false
      };

      resolve(mergeLearnedOverrides(settings));
    });
  });
}

// ===== Feedback Loop Agent (learned preferences) =====

function mergeLearnedOverrides(settings) {
  if (!learnedOverrides || typeof learnedOverrides !== 'object') return settings;
  const merged = { ...settings };
  for (const [feature, overrideValue] of Object.entries(learnedOverrides)) {
    if (typeof settings[feature] === 'boolean') {
      merged[feature] = overrideValue;
    }
  }
  return merged;
}

function getPageCategory() {
  try {
    return detectSiteContext().pageType || 'generic';
  } catch (e) {
    return 'generic';
  }
}

function refreshLearnedPreferences() {
  const hostname = window.location.hostname;
  if (!hostname) return;
  const pageCategory = getPageCategory();
  safeSendMessage(
    { action: 'getLearnedPreferences', hostname, pageCategory, currentSettings },
    (response) => {
      if (!response?.success || !response.overrides) return;
      learnedOverrides = response.overrides || {};
      applyAllModifications();
    }
  );
}

function recordFeatureOverrides(previousSettings, nextSettings) {
  const hostname = window.location.hostname;
  if (!hostname) return;
  const pageCategory = getPageCategory();

  TRACKED_FEATURES.forEach((feature) => {
    const before = previousSettings[feature];
    const after = nextSettings[feature];
    if (typeof before === 'boolean' && typeof after === 'boolean' && before !== after) {
      safeSendMessage({
        action: 'recordFeatureOverride',
        hostname,
        pageCategory,
        feature,
        enabled: after
      });
    }
  });
}

function detectCurrentSiteType() {
  return detectSiteContext().pageType;
}

// ========== CONTEXT MONITOR ===========

function detectSiteContext() {
  const cacheKey = `${window.location.hostname}${window.location.pathname}:${document.body?.innerText?.length || 0}`;
  const cached = siteContextCache.get(cacheKey);
  if (cached) return cached;

  const signals = [];
  const hostname = window.location.hostname || '';
  const host = hostname.toLowerCase();
  const path = (window.location.pathname || '').toLowerCase();

  // Heuristic: common news/blog/document pages include articles and long-form content.
  const articleElement = document.querySelector('article, [role="article"], .post, .entry-content');
  if (articleElement) signals.push('article-element');

  // Heuristic: documentation sites often use markdown renderers and doc-specific containers.
  if (document.querySelector('main .markdown-body, .documentation, [class*="doc"], [id*="doc"]')) {
    signals.push('documentation-container');
  }

  // Heuristic: long paragraphs typically indicate reading-oriented pages.
  const longParagraph = Array.from(document.querySelectorAll('p')).some(p => (p.innerText || '').trim().length > 280);
  if (longParagraph) signals.push('long-paragraph');

  // Heuristic: video players imply media-focused experiences.
  if (document.querySelector('video, [class*="player"], [id*="player"], [class*="video"], [data-player]')) {
    signals.push('video-player');
  }

  // Heuristic: timelines and comment feeds usually show social or community pages.
  if (document.querySelector('[role="feed"], .timeline, .comment, .comments, [class*="feed"], [id*="feed"]')) {
    signals.push('feed-or-comments');
  }

  // Heuristic: product and price patterns suggest shopping intent.
  const pricePattern = /\$\s?\d+|₹\s?\d+|€\s?\d+|£\s?\d+/.test(document.body?.innerText || '');
  const commercePattern = /product|cart|checkout|shop|store|price/.test(host + path);
  if (pricePattern || commercePattern) signals.push('commerce-signals');

  // Weighted scoring keeps logic readable and easy to extend.
  const scores = {
    article: 0,
    video: 0,
    social: 0,
    documentation: 0,
    shopping: 0,
    generic: 0.2
  };

  if (signals.includes('article-element')) scores.article += 0.35;
  if (signals.includes('long-paragraph')) scores.article += 0.25;
  if (signals.includes('documentation-container')) scores.documentation += 0.6;
  if (signals.includes('video-player')) scores.video += 0.6;
  if (signals.includes('feed-or-comments')) scores.social += 0.45;
  if (signals.includes('commerce-signals')) scores.shopping += 0.6;

  // Host-based hints for common platforms.
  if (/youtube|vimeo|twitch|netflix/.test(host)) scores.video += 0.35;
  if (/facebook|instagram|twitter|x\.com|reddit|discord/.test(host)) scores.social += 0.35;
  if (/docs|developer|api|readthedocs|github\.io/.test(host)) scores.documentation += 0.25;
  if (/amazon|ebay|shop|store|walmart|etsy/.test(host)) scores.shopping += 0.35;

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [pageType, confidence] = sorted[0];

  const context = {
    pageType,
    hostname,
    confidence: Math.min(1, Math.max(0.1, Number(confidence.toFixed(2)))),
    signals
  };

  siteContextCache.set(cacheKey, context);
  return context;
}

function inferUserIntent(siteType, settingsFromStorage) {
  const explicitIntent = (settingsFromStorage.userIntent || '').toLowerCase().trim();
  if (explicitIntent) return explicitIntent;

  const query = new URLSearchParams(window.location.search || '').get('q') || '';
  const title = (document.title || '').toLowerCase();
  const textHint = `${query} ${title}`.toLowerCase();

  if (/learn|guide|tutorial|docs|how to/.test(textHint) || siteType === 'documentation') return 'learning';
  if (/news|article|blog|read/.test(textHint) || siteType === 'article') return 'reading';
  if (/buy|price|deal|product/.test(textHint) || siteType === 'commerce') return 'shopping';
  if (settingsFromStorage.simplifyText || settingsFromStorage.jargonExplainer) return 'comprehension';
  return 'general-browsing';
}

// ========== INTENT ANALYZER ===========

function detectUserIntent(siteContext) {
  const reasons = [];
  const title = (document.title || '').toLowerCase();
  const url = `${window.location.hostname}${window.location.pathname}`.toLowerCase();

  // Heuristic: editors, docs, and code blocks imply focused work or study.
  const hasEditor = !!document.querySelector('[contenteditable="true"], textarea, [role="textbox"], .monaco-editor, .CodeMirror');
  if (hasEditor) reasons.push('editor-or-textbox');

  const hasCodeBlocks = !!document.querySelector('pre code, .highlight, .code, [class*="code"], [class*="syntax"]');
  if (hasCodeBlocks) reasons.push('code-blocks');

  // Heuristic: long-form content suggests study/reading.
  const textLength = (document.body?.innerText || '').trim().length;
  if (textLength > 4000) reasons.push('long-form-text');

  // Heuristic: video players or entertainment keywords signal relaxing.
  const hasVideo = !!document.querySelector('video, [class*="player"], [id*="player"], [class*="video"]');
  if (hasVideo) reasons.push('video-player');

  const entertainmentPattern = /movie|music|playlist|stream|watch|gaming|fun|meme/.test(title + url);
  if (entertainmentPattern) reasons.push('entertainment-keywords');

  // Heuristic: chats and feeds indicate casual browsing or social time.
  const hasChat = !!document.querySelector('[aria-label*="chat" i], [class*="chat"], [id*="chat"], [role="log"]');
  if (hasChat) reasons.push('chat-ui');

  const hasFeed = !!document.querySelector('[role="feed"], .timeline, [class*="feed"], [id*="feed"]');
  if (hasFeed) reasons.push('feed-ui');

  // Lightweight scoring for intent inference.
  const scores = { work: 0, study: 0, browse: 0, relax: 0 };

  if (hasEditor) scores.work += 0.45;
  if (hasCodeBlocks) scores.work += 0.2;
  if (siteContext.pageType === 'documentation') scores.study += 0.45;
  if (textLength > 4000) scores.study += 0.3;
  if (siteContext.pageType === 'article') scores.study += 0.2;
  if (hasFeed || hasChat) scores.browse += 0.35;
  if (siteContext.pageType === 'social') scores.browse += 0.3;
  if (hasVideo) scores.relax += 0.45;
  if (entertainmentPattern) scores.relax += 0.25;
  if (siteContext.pageType === 'video') scores.relax += 0.2;

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [intent, confidence] = sorted[0];

  return {
    intent,
    confidence: Math.min(1, Math.max(0.1, Number(confidence.toFixed(2)))),
    reasons
  };
}

function getFilteringProfile(intent) {
  const profiles = {
    work: {
      removeDistractions: true,
      removeAnimations: true,
      readingRuler: false,
      jargonExplainer: false,
      simplifyText: false,
      structuredLayout: false
    },
    study: {
      removeDistractions: true,
      removeAnimations: false,
      readingRuler: true,
      jargonExplainer: true,
      simplifyText: true,
      structuredLayout: true
    },
    browse: {
      removeDistractions: false,
      removeAnimations: false,
      readingRuler: false,
      jargonExplainer: false,
      simplifyText: false,
      structuredLayout: false
    },
    relax: {
      removeDistractions: false,
      removeAnimations: false,
      readingRuler: false,
      jargonExplainer: false,
      simplifyText: false,
      structuredLayout: false
    }
  };

  return profiles[intent] || profiles.browse;
}

function runFeatureSafely(summary, featureName, enabled, onEnable, onDisable) {
  const decision = { feature: featureName, enabled: !!enabled, executed: false, error: null };
  try {
    if (enabled) {
      if (typeof onEnable === 'function') onEnable();
      decision.executed = true;
    } else if (typeof onDisable === 'function') {
      onDisable();
      decision.executed = true;
    }
  } catch (error) {
    decision.error = error?.message || 'Unknown error';
  }
  summary.decisions.push(decision);
}

// ========== FOCUS GUARD (ADHD SUPPORT) ===========

function logFocusGuardDecision(summary, message, data = {}) {
  summary.decisions.push({ feature: 'focus-guard', message, data, timestamp: Date.now() });
  console.log('[FocusGuard]', message, data);
}

// Skim detector state (in-memory only)
const SKIM_DETECTOR_CONFIG = {
  speedThresholdPxPerSec: 2200,
  directionFlipThreshold: 3,
  sampleWindowMs: 2500,
  cooldownMs: 9000,
  minScrollDelta: 120
};

let skimDetectorState = {
  lastY: window.scrollY,
  lastTime: Date.now(),
  directionFlips: 0,
  sampleStart: Date.now(),
  cooldownUntil: 0,
  active: false
};

function startSkimDetector() {
  if (skimDetectorState.active) return;
  skimDetectorState.active = true;

  window.addEventListener('scroll', () => {
    const now = Date.now();
    const currentY = window.scrollY;
    const deltaY = currentY - skimDetectorState.lastY;
    const deltaTime = now - skimDetectorState.lastTime;
    if (Math.abs(deltaY) < SKIM_DETECTOR_CONFIG.minScrollDelta || deltaTime === 0) {
      skimDetectorState.lastY = currentY;
      skimDetectorState.lastTime = now;
      return;
    }

    const speed = Math.abs(deltaY) / (deltaTime / 1000);
    const direction = Math.sign(deltaY);
    const prevDirection = Math.sign(skimDetectorState.lastY - (skimDetectorState.lastY - deltaY));

    if (direction !== 0 && prevDirection !== 0 && direction !== prevDirection) {
      skimDetectorState.directionFlips += 1;
    }

    const sampleAge = now - skimDetectorState.sampleStart;
    if (sampleAge > SKIM_DETECTOR_CONFIG.sampleWindowMs) {
      skimDetectorState.sampleStart = now;
      skimDetectorState.directionFlips = 0;
    }

    const isErratic = skimDetectorState.directionFlips >= SKIM_DETECTOR_CONFIG.directionFlipThreshold;
    const isFast = speed >= SKIM_DETECTOR_CONFIG.speedThresholdPxPerSec;
    const inCooldown = now < skimDetectorState.cooldownUntil;

    if (!inCooldown && (isErratic || isFast)) {
      skimDetectorState.cooldownUntil = now + SKIM_DETECTOR_CONFIG.cooldownMs;
      try {
        createReadingRuler();
      } catch (e) {
        // fallback: show a subtle prompt
        showNotification('Need help staying on track? Try the reading ruler.', 'loading');
      }
    }

    skimDetectorState.lastY = currentY;
    skimDetectorState.lastTime = now;
  }, { passive: true });
}

function ensureDistractionStyles() {
  if (document.getElementById('neuro-distraction-style')) return;
  const style = document.createElement('style');
  style.id = 'neuro-distraction-style';
  style.textContent = `
    .neuro-hidden-distraction {
      display: none !important;
      visibility: hidden !important;
    }
  `;
  document.head.appendChild(style);
}

function isProtectedElement(element) {
  if (!element) return false;
  const tag = (element.tagName || '').toLowerCase();
  if (['main', 'article', 'nav', 'header', 'footer'].includes(tag)) return true;
  if (element.getAttribute('role') === 'main') return true;
  if (isMainContent(element)) return true;
  return false;
}

function runDistractionHunter(siteContext) {
  const summary = {
    hiddenCount: 0,
    hiddenSelectors: [],
    warnings: []
  };

  try {
    ensureDistractionStyles();

    const baseSelectors = [
      '.sidebar', '.right-rail', '.left-rail', '[class*="sidebar"]',
      '[class*="recommend" i]', '[id*="recommend" i]',
      '[class*="trending" i]', '[id*="trending" i]',
      '[class*="promo" i]', '[id*="promo" i]',
      '[class*="pop" i]', '[id*="popup" i]', '[class*="modal" i]', '[class*="overlay" i]',
      '[class*="floating" i]', '[class*="sticky" i]',
      '[class*="ad" i]', '[id*="ad" i]', '.adsbygoogle',
      '[class*="recommendation" i]', '[id*="recommendation" i]',
      '[class*="related" i]', '[id*="related" i]',
      '[class*="autoplay" i]', '[id*="autoplay" i]',
      '[class*="sponsor" i]', '[id*="sponsor" i]'
    ];

    const keywordHints = ['trending', 'recommended', 'suggested', 'sponsored', 'ad', 'promo', 'upsell', 'related'];

    baseSelectors.forEach((selector) => {
      let elements = [];
      try {
        elements = Array.from(document.querySelectorAll(selector));
      } catch (e) {
        summary.warnings.push(`Invalid selector: ${selector}`);
        return;
      }

      elements.forEach((element) => {
        if (isProtectedElement(element)) return;
        const text = (element.innerText || '').toLowerCase();
        const hasKeyword = keywordHints.some(keyword => text.includes(keyword));

        if (hasKeyword || /ad|promo|sponsor/.test(element.className + element.id)) {
          element.classList.add('neuro-hidden-distraction');
          summary.hiddenCount += 1;
          if (!summary.hiddenSelectors.includes(selector)) {
            summary.hiddenSelectors.push(selector);
          }
        }
      });
    });
  } catch (error) {
    summary.warnings.push(error?.message || 'Distraction hunter failed');
  }

  return summary;
}

function runSkimDetector(summary) {
  try {
    const headings = Array.from(document.querySelectorAll('h1, h2, h3'));
    if (headings.length === 0) {
      logFocusGuardDecision(summary, 'Skim detector skipped', { reason: 'no-headings' });
      return;
    }
    headings.forEach((heading) => {
      heading.style.scrollMarginTop = '12px';
    });
    startSkimDetector();
    logFocusGuardDecision(summary, 'Skim detector active', { headings: headings.length });
  } catch (error) {
    logFocusGuardDecision(summary, 'Skim detector failed', { error: error?.message || 'Unknown error' });
  }
}

// ========== EXECUTIVE FUNCTION AIDE: TASK ANCHOR ===========

const TASK_ANCHOR_ID = 'neuro-task-anchor';
const TASK_ANCHOR_STYLE_ID = 'neuro-task-anchor-style';
const TASK_ANCHOR_DISMISS_KEY = 'neuroTaskAnchorDismissed';

function createTaskAnchor(message = 'Stay with this page') {
  if (sessionStorage.getItem(TASK_ANCHOR_DISMISS_KEY) === 'true') return;
  if (document.getElementById(TASK_ANCHOR_ID)) return;

  if (!document.getElementById(TASK_ANCHOR_STYLE_ID)) {
    const style = document.createElement('style');
    style.id = TASK_ANCHOR_STYLE_ID;
    style.textContent = `
      #${TASK_ANCHOR_ID} {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 1000002;
        background: rgba(26, 26, 46, 0.92);
        border: 1px solid rgba(108, 92, 231, 0.3);
        border-radius: 12px;
        padding: 10px 12px;
        font-family: system-ui, sans-serif;
        font-size: 12px;
        color: #f2f2f7;
        box-shadow: 0 8px 18px rgba(0,0,0,0.25);
        max-width: 220px;
        pointer-events: auto;
      }
      #${TASK_ANCHOR_ID} .anchor-title {
        font-weight: 600;
        margin-bottom: 4px;
      }
      #${TASK_ANCHOR_ID} .anchor-actions {
        display: flex;
        justify-content: flex-end;
        gap: 6px;
        margin-top: 6px;
      }
      #${TASK_ANCHOR_ID} button {
        background: transparent;
        border: none;
        color: #c8c8d8;
        cursor: pointer;
        font-size: 11px;
      }
      #${TASK_ANCHOR_ID} button:hover {
        color: #ffffff;
      }
    `;
    document.head.appendChild(style);
  }

  const anchor = document.createElement('div');
  anchor.id = TASK_ANCHOR_ID;
  anchor.innerHTML = `
    <div class="anchor-title">Task Anchor</div>
    <div class="anchor-message">${message}</div>
    <div class="anchor-actions">
      <button type="button" id="neuro-anchor-dismiss">Dismiss</button>
    </div>
  `;

  document.body.appendChild(anchor);

  const dismissBtn = document.getElementById('neuro-anchor-dismiss');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      sessionStorage.setItem(TASK_ANCHOR_DISMISS_KEY, 'true');
      removeTaskAnchor();
    });
  }
}

function updateTaskAnchor(message) {
  const anchor = document.getElementById(TASK_ANCHOR_ID);
  if (!anchor) {
    createTaskAnchor(message);
    return;
  }
  const msgEl = anchor.querySelector('.anchor-message');
  if (msgEl) msgEl.textContent = message;
}

function removeTaskAnchor() {
  document.getElementById(TASK_ANCHOR_ID)?.remove();
}

function runExecutiveFunctionAide(summary) {
  try {
    const formInputs = document.querySelectorAll('input, textarea, [contenteditable="true"]');
    if (formInputs.length === 0) {
      logFocusGuardDecision(summary, 'Executive aide skipped', { reason: 'no-inputs' });
      return;
    }
    formInputs.forEach((input) => {
      if (!input.getAttribute('data-neuro-exec-aide')) {
        input.setAttribute('data-neuro-exec-aide', 'true');
        input.style.outline = '2px solid rgba(108,92,231,0.3)';
        input.style.outlineOffset = '2px';
      }
    });
    updateTaskAnchor('Focus target: reading');
    logFocusGuardDecision(summary, 'Executive aide active', { inputs: formInputs.length });
  } catch (error) {
    logFocusGuardDecision(summary, 'Executive aide failed', { error: error?.message || 'Unknown error' });
  }
}

function runFocusGuard(siteContext, intent, settings, summary) {
  if (!siteContext || !settings) {
    logFocusGuardDecision(summary, 'Focus guard skipped', { reason: 'missing-context-or-settings' });
    return;
  }

  const isRelevantIntent = ['work', 'study', 'browse'].includes(intent.intent);
  const isSupportedPage = ['article', 'documentation', 'generic', 'shopping'].includes(siteContext.pageType);

  if (!isRelevantIntent || !isSupportedPage) {
    logFocusGuardDecision(summary, 'Focus guard not activated', {
      intent: intent.intent,
      pageType: siteContext.pageType
    });
    return;
  }

  if (settings.removeDistractions) {
    const distractionSummary = runDistractionHunter(siteContext);
    logFocusGuardDecision(summary, 'Distraction hunter complete', distractionSummary);
  }

  if (intent.intent === 'study' || intent.intent === 'work') {
    runSkimDetector(summary);
  }

  if (intent.intent === 'work') {
    runExecutiveFunctionAide(summary);
  }
}

// ========== SENSORY SHIELD (AUTISM SUPPORT) ===========

function runLayoutStabilizer(summary) {
  const localSummary = summary || { enabled: [], warnings: [] };
  try {
    const styleId = 'neuro-layout-stabilizer-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        * { scroll-behavior: auto !important; }
        img, video, iframe { max-width: 100% !important; height: auto !important; }
        .neuro-stabilized-media { transition: none !important; }
        .neuro-sticky-guard { contain: layout paint !important; }
      `;
      document.head.appendChild(style);
    }

    const CONFIG = {
      minMediaHeight: 180,
      minEmbedHeight: 240,
      maxObservationNodes: 30,
      observerThrottleMs: 250,
      aboveFoldMultiplier: 1.2
    };

    const reserveSpaceForMedia = (element, minHeight) => {
      if (!element || element.classList.contains('neuro-stabilized-media')) return;
      if (element.hasAttribute('width') || element.style.height) return;
      const rect = element.getBoundingClientRect();
      const width = rect.width || element.clientWidth || 0;
      if (width === 0) return;
      const estimatedHeight = Math.max(minHeight, Math.round(width * 0.56));
      element.style.minHeight = `${estimatedHeight}px`;
      element.classList.add('neuro-stabilized-media');
    };

    const stabilizeInitialMedia = () => {
      const elements = document.querySelectorAll('img, video, iframe, embed, object');
      elements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.top > window.innerHeight * CONFIG.aboveFoldMultiplier) return;
        const isEmbed = ['iframe', 'embed', 'object'].includes((el.tagName || '').toLowerCase());
        reserveSpaceForMedia(el, isEmbed ? CONFIG.minEmbedHeight : CONFIG.minMediaHeight);
      });
    };

    const stabilizeStickyElements = () => {
      const candidates = Array.from(document.querySelectorAll('header, nav, [class*="sticky"], [class*="fixed"], [id*="sticky"], [id*="fixed"]'));
      candidates.forEach((element) => {
        if (isProtectedElement(element)) return;
        const style = window.getComputedStyle(element);
        if (!['fixed', 'sticky'].includes(style.position)) return;
        const rect = element.getBoundingClientRect();
        if (rect.top > 20 || rect.height < 40) return;
        element.style.minHeight = `${Math.max(rect.height, 40)}px`;
        element.classList.add('neuro-sticky-guard');
      });
    };

    stabilizeInitialMedia();
    stabilizeStickyElements();

    if (layoutStabilizerObserver) layoutStabilizerObserver.disconnect();
    layoutStabilizerObserver = createBatchedMutationObserver({
      delay: CONFIG.observerThrottleMs,
      maxNodes: CONFIG.maxObservationNodes,
      onBatch: ({ roots }) => {
        if (!roots || roots.length === 0) return;
        roots.forEach((node) => {
          const rect = node.getBoundingClientRect?.();
          if (!rect || rect.top > window.innerHeight * CONFIG.aboveFoldMultiplier) return;

          const tag = (node.tagName || '').toUpperCase();
          if (['IMG', 'VIDEO', 'IFRAME', 'EMBED', 'OBJECT'].includes(tag)) {
            const isEmbed = ['IFRAME', 'EMBED', 'OBJECT'].includes(tag);
            reserveSpaceForMedia(node, isEmbed ? CONFIG.minEmbedHeight : CONFIG.minMediaHeight);
          }

          node.querySelectorAll?.('img, video, iframe, embed, object').forEach((media) => {
            const isEmbed = ['IFRAME', 'EMBED', 'OBJECT'].includes((media.tagName || '').toUpperCase());
            reserveSpaceForMedia(media, isEmbed ? CONFIG.minEmbedHeight : CONFIG.minMediaHeight);
          });
        });
      }
    });
    layoutStabilizerObserver.observe(document.body, { childList: true, subtree: true });
    localSummary.enabled.push('layoutStabilizer');
  } catch (error) {
    localSummary.warnings.push(error?.message || 'Layout stabilizer failed');
  }

  return localSummary;
}

function stopLayoutStabilizerObserver() {
  if (layoutStabilizerObserver) {
    layoutStabilizerObserver.disconnect();
    layoutStabilizerObserver = null;
  }
}

function runVisualHarmonizer(summary) {
  const localSummary = summary || { enabled: [], warnings: [] };
  try {
    const styleId = 'neuro-visual-harmonizer-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .neuro-harmonize {
          background-color: var(--neuro-harmonize-bg) !important;
          border: 1px solid var(--neuro-harmonize-border) !important;
          border-radius: 12px !important;
        }
        .neuro-harmonize h1,
        .neuro-harmonize h2,
        .neuro-harmonize h3,
        .neuro-harmonize h4,
        .neuro-harmonize p,
        .neuro-harmonize li,
        .neuro-harmonize span:not([class*="icon"]):not([class*="emoji"]) {
          color: var(--neuro-harmonize-text) !important;
        }
        .neuro-harmonize a { color: var(--neuro-harmonize-link) !important; }
        .neuro-harmonize img,
        .neuro-harmonize svg,
        .neuro-harmonize canvas,
        .neuro-harmonize video,
        .neuro-harmonize pre,
        .neuro-harmonize code {
          filter: none !important;
        }
      `;
      document.head.appendChild(style);
    }

    if (currentSettings.softColors) {
      applySoftColors();
    }

    const paletteMap = {
      creamSepia: { bg: '#F5EEDC', border: '#D6C7A8', text: '#332C2B', link: '#5B4BC4' },
      sageGreen: { bg: '#D1E8E2', border: '#A7C6BC', text: '#2C3531', link: '#3A5A50' },
      softCharcoal: { bg: '#1A1A2E', border: '#3B3B5C', text: '#E0E0E0', link: '#A9B8FF' }
    };

    const selected = paletteMap[currentSettings.themePalette] || (currentSettings.themeMode === 'dark' ? paletteMap.softCharcoal : paletteMap.creamSepia);
    document.documentElement.style.setProperty('--neuro-harmonize-bg', selected.bg);
    document.documentElement.style.setProperty('--neuro-harmonize-border', selected.border);
    document.documentElement.style.setProperty('--neuro-harmonize-text', selected.text);
    document.documentElement.style.setProperty('--neuro-harmonize-link', selected.link);

    const parseColor = (color) => {
      const match = color.match(/rgba?\(([^)]+)\)/i);
      if (!match) return null;
      const parts = match[1].split(',').map(v => parseFloat(v.trim()));
      return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
    };

    const luminance = ({ r, g, b }) => {
      const toLinear = (v) => {
        const val = v / 255;
        return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
    };

    const contrastRatio = (fg, bg) => {
      const l1 = luminance(fg) + 0.05;
      const l2 = luminance(bg) + 0.05;
      return l1 > l2 ? l1 / l2 : l2 / l1;
    };

    const candidates = Array.from(document.querySelectorAll('section, article, main, div, aside'));
    const maxScan = 180;
    let harmonized = 0;

    candidates.slice(0, maxScan).forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.height < 120 || rect.width < 260) return;
      if (rect.top > window.innerHeight * 1.5) return;

      const tag = (el.tagName || '').toLowerCase();
      if (['nav', 'header', 'footer', 'aside'].includes(tag)) return;
      if (el.querySelector('canvas, video, svg, pre, code')) return;

      const styles = window.getComputedStyle(el);
      const bg = parseColor(styles.backgroundColor);
      const fg = parseColor(styles.color);
      if (!bg || !fg || bg.a === 0) return;

      const ratio = contrastRatio(fg, bg);
      const intenseBackground = luminance(bg) < 0.08 || luminance(bg) > 0.92;

      if (ratio > 7 || intenseBackground) {
        el.classList.add('neuro-harmonize');
        harmonized += 1;
      }
    });

    localSummary.enabled.push('visualHarmonizer');
    localSummary.harmonizedCount = harmonized;
  } catch (error) {
    localSummary.warnings.push(error?.message || 'Visual harmonizer failed');
  }

  return localSummary;
}

let motionSilencerObserver = null;

function startMotionSilencer() {
  const styleId = 'neuro-motion-silencer-style';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      * {
        animation-duration: 0s !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0s !important;
        scroll-behavior: auto !important;
      }
      [style*="parallax" i],
      [class*="parallax" i],
      [data-parallax],
      [data-scroll],
      [style*="background-attachment: fixed" i] {
        background-attachment: initial !important;
        transform: none !important;
      }
      video[autoplay],
      video[loop],
      video[muted][autoplay] {
        animation: none !important;
      }
      img[src$=".gif" i],
      img[src*=".gif?" i] {
        animation: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  document.querySelectorAll('video, audio').forEach(media => {
    try { media.pause(); } catch (e) { }
  });

  if (motionSilencerObserver) motionSilencerObserver.disconnect();
  motionSilencerObserver = createBatchedMutationObserver({
    delay: 150,
    maxNodes: 40,
    onBatch: ({ roots }) => {
      roots.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO') {
          try { node.pause(); } catch (e) { }
        }
        node.querySelectorAll?.('video, audio').forEach(media => {
          try { media.pause(); } catch (e) { }
        });
      });
    }
  });
  motionSilencerObserver.observe(document.body, { childList: true, subtree: true });
}

function stopMotionSilencer() {
  document.getElementById('neuro-motion-silencer-style')?.remove();
  if (motionSilencerObserver) {
    motionSilencerObserver.disconnect();
    motionSilencerObserver = null;
  }
}

function runMotionSilencer(summary) {
  const localSummary = summary || { enabled: [], warnings: [] };
  try {
    if (currentSettings.removeAnimations) {
      startMotionSilencer();
      localSummary.enabled.push('motionSilencer');
    } else {
      stopMotionSilencer();
      localSummary.warnings.push('Remove animations disabled; motion silencer skipped');
    }
  } catch (error) {
    localSummary.warnings.push(error?.message || 'Motion silencer failed');
  }
  return localSummary;
}

function runSensoryShield(siteContext, settings) {
  const summary = { enabled: [], warnings: [], pageType: siteContext?.pageType || 'unknown' };

  if (!settings) {
    summary.warnings.push('Missing settings');
    return summary;
  }

  const isRelevantPage = ['article', 'documentation', 'generic', 'shopping'].includes(siteContext?.pageType);
  if (!isRelevantPage) {
    summary.warnings.push('Page type not suitable for sensory shield');
    return summary;
  }

  runLayoutStabilizer(summary);
  runVisualHarmonizer(summary);
  runMotionSilencer(summary);

  return summary;
}

// ========== LITERACY ALLY (DYSLEXIA SUPPORT) ===========

function runTypographicEngine(summary) {
  const localSummary = summary || { enabled: [], warnings: [] };
  try {
    const styleId = 'neuro-typographic-engine-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        /* Dyslexia-friendly typography: improve spacing and line height */
        *:not(pre):not(code):not(kbd):not(samp):not(svg):not(path):not([class*="icon"]):not([class*="emoji"]) {
          font-family: 'OpenDyslexic', 'Atkinson Hyperlegible', 'Comic Neue', 'Segoe UI', Arial, sans-serif !important;
          letter-spacing: 0.04em !important;
          word-spacing: 0.08em !important;
          line-height: 1.65 !important;
        }
        p, li, .text-content {
          font-size: 18px !important;
          margin-bottom: 1.1em !important;
        }
        h1 { font-size: 1.9em !important; }
        h2 { font-size: 1.6em !important; }
        h3 { font-size: 1.35em !important; }
      `;
      document.head.appendChild(style);
    }

    if (currentSettings.readingRuler) createReadingRuler();
    localSummary.enabled.push('typographicEngine');
  } catch (error) {
    localSummary.warnings.push(error?.message || 'Typographic engine failed');
  }
  return localSummary;
}

function runJargonTranslator(summary) {
  try {
    initJargonExplainer();
    summary.enabled.push('jargonTranslator');
  } catch (error) {
    summary.warnings.push(error?.message || 'Jargon translator failed');
  }
}

function runToneDecoder(summary, siteContext) {
  try {
    const isReadingPage = ['article', 'documentation', 'generic'].includes(siteContext?.pageType);
    if (!isReadingPage) {
      summary.warnings.push('Tone decoder skipped for non-reading page');
      return;
    }
    initToneDecoder();
    summary.enabled.push('toneDecoder');
  } catch (error) {
    summary.warnings.push(error?.message || 'Tone decoder failed');
  }
}

function runLiteracyAlly(siteContext, settings) {
  const summary = { enabled: [], warnings: [], pageType: siteContext?.pageType || 'unknown' };

  if (!settings) {
    summary.warnings.push('Missing settings');
    return summary;
  }

  if (settings.dyslexicFont || settings.readingRuler) {
    runTypographicEngine(summary);
  }

  if (settings.jargonExplainer) {
    runJargonTranslator(summary);
  }

  return summary;
}

async function runMasterOrchestrator() {
  const summary = {
    siteType: 'unknown',
    userIntent: 'general-browsing',
    enabledSettings: {},
    decisions: [],
    timestamp: Date.now()
  };

  if (!document || !document.body) {
    summary.decisions.push({ feature: 'bootstrap', enabled: true, executed: false, error: 'Document body unavailable' });
    return summary;
  }

  const settingsFromStorage = await getEnabledSettingsFromStorage();
  currentSettings = { ...currentSettings, ...settingsFromStorage };

  const context = detectSiteContext();
  const siteType = context.pageType === 'generic' ? 'general-content' : context.pageType;
  const userIntent = detectUserIntent(context);
  const filteringProfile = getFilteringProfile(userIntent.intent);

  summary.siteType = siteType;
  summary.userIntent = userIntent.intent;
  summary.intentProfile = filteringProfile;
  summary.context = context;
  summary.enabledSettings = { ...settingsFromStorage };

  const shouldUseStructuredLayout =
    (settingsFromStorage.removeDistractions || settingsFromStorage.simplifyText || settingsFromStorage.softColors) &&
    ['article', 'documentation', 'general-content'].includes(siteType);

  const shouldUseJargonExplainer =
    settingsFromStorage.jargonExplainer &&
    ['study', 'browse'].includes(userIntent.intent);

  runFeatureSafely(summary, 'dyslexicFont', settingsFromStorage.dyslexicFont, applyDyslexiaFont, removeDyslexiaFont);
  runFeatureSafely(summary, 'softColors', settingsFromStorage.softColors, applySoftColors, removeSoftColors);

  runFeatureSafely(
    summary,
    'removeDistractions',
    settingsFromStorage.removeDistractions,
    () => {
      removeDistractions();
      startDistractionObserver();
    },
    () => {
      stopDistractionObserver();
    }
  );

  runFeatureSafely(summary, 'readingRuler', settingsFromStorage.readingRuler, createReadingRuler, removeReadingRuler);

  runFeatureSafely(
    summary,
    'removeAnimations',
    settingsFromStorage.removeAnimations,
    () => {
      removeAnimations();
      startAnimationObserver();
    },
    () => {
      stopAnimationObserver();
    }
  );

  runFeatureSafely(summary, 'jargonExplainer', shouldUseJargonExplainer, initJargonExplainer, null);
  runFeatureSafely(summary, 'toneDecoder', settingsFromStorage.toneDecoder, initToneDecoder, removeToneDecoder);
  runFeatureSafely(summary, 'structuredLayout', shouldUseStructuredLayout, applyStructuredLayout, removeStructuredLayout);
  runFeatureSafely(summary, 'bionicReading', settingsFromStorage.bionicReading, applyBionicReading, removeBionicReading);
  runFeatureSafely(summary, 'sensoryAutoBlocker', settingsFromStorage.sensoryAutoBlocker, applySensoryAutoBlocker, removeSensoryAutoBlocker);
  runFeatureSafely(summary, 'cinemaFocus', settingsFromStorage.cinemaFocus, applyCinemaFocus, removeCinemaFocus);

  runFocusGuard(context, userIntent, settingsFromStorage, summary);

  const sensorySummary = runSensoryShield(context, settingsFromStorage);
  summary.decisions.push({ feature: 'sensory-shield', ...sensorySummary });

  const literacySummary = runLiteracyAlly(context, settingsFromStorage);
  summary.decisions.push({ feature: 'literacy-ally', ...literacySummary });

  console.log('Master Orchestrator summary:', summary);
  return summary;
}

// ========== 1. DYSLEXIA FONT ==========

function applyDyslexiaFont() {
  let style = document.getElementById('neuro-dyslexic-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'neuro-dyslexic-style';
    document.head.appendChild(style);
  }
  style.textContent = `
    *:not(pre):not(code):not(var) {
      font-family: 'OpenDyslexic', 'Comic Sans MS', 'Comic Neue', 'Atkinson Hyperlegible', sans-serif !important;
      letter-spacing: 0.05em !important;
      word-spacing: 0.1em !important;
      line-height: 1.6 !important;
    }
    p, li, .text-content { font-size: 18px !important; margin-bottom: 1.2em !important; }
    h1 { font-size: 1.8em !important; }
    h2 { font-size: 1.5em !important; }
    h3 { font-size: 1.3em !important; }
  `;
}

function removeDyslexiaFont() {
  document.getElementById('neuro-dyslexic-style')?.remove();
}

// ========== 2. SOFT COLORS ==========

function applySoftColors() {
  const neuroPalettes = {
    creamSepia: {
      mode: 'light',
      background: '#F5EEDC',
      text: '#332C2B',
      surface: '#EFE5CF',
      border: '#C9B99A',
      link: '#5B4BC4'
    },
    sageGreen: {
      mode: 'light',
      background: '#D1E8E2',
      text: '#2C3531',
      surface: '#C4DED7',
      border: '#98B8AF',
      link: '#3A5A50'
    },
    softCharcoal: {
      mode: 'dark',
      background: '#1A1A2E',
      text: '#E0E0E0',
      surface: '#252542',
      border: '#3B3B5C',
      link: '#A9B8FF'
    },
    deepNavy: {
      mode: 'dark',
      background: '#0F172A',
      text: '#CBD5E1',
      surface: '#1E293B',
      border: '#334155',
      link: '#93C5FD'
    }
  };

  const fallbackPaletteKey = currentSettings.themeMode === 'dark' ? 'softCharcoal' : 'creamSepia';
  const selected = neuroPalettes[currentSettings.themePalette] || neuroPalettes[fallbackPaletteKey];
  const palette = selected.mode === currentSettings.themeMode ? selected : neuroPalettes[fallbackPaletteKey];

  let style = document.getElementById('neuro-colors-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'neuro-colors-style';
    document.head.appendChild(style);
  }
  style.textContent = `
    html, body, .main-content, article, main {
      background-color: ${palette.background} !important;
      color: ${palette.text} !important;
    }
    a {
      color: ${palette.link} !important;
      text-decoration: underline !important;
    }
    a:hover {
      filter: brightness(0.92) !important;
    }
    button, .button, input, textarea, select {
      background-color: ${palette.surface} !important;
      border-color: ${palette.border} !important;
      color: ${palette.text} !important;
    }
    p, li, span:not(.special), label, h1, h2, h3, h4, h5, h6 {
      color: ${palette.text} !important;
    }
    div, section, article { background-color: transparent !important; }
  `;
}

function removeSoftColors() {
  document.getElementById('neuro-colors-style')?.remove();
}

function getCleanDOM() {
  const clone = document.body.cloneNode(true);
  const noise = clone.querySelectorAll('script, style, svg, noscript, iframe');
  noise.forEach(el => el.remove());
  const allElements = clone.querySelectorAll('*');
  allElements.forEach(el => {
    if (el.children.length === 0 && el.textContent.trim() === '') {
      el.remove();
    }
  });
  return clone.innerHTML;
}

// ========== STRUCTURED WEBSITE LAYOUT ==========

function applyStructuredLayout() {
  let style = document.getElementById('neuro-structured-layout-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'neuro-structured-layout-style';
    document.head.appendChild(style);
  }

  document.body.classList.add('neuro-structured-page');

  const mainContent = findMainContent();
  if (mainContent) {
    document.querySelectorAll('.neuro-main-container').forEach(el => {
      if (el !== mainContent) el.classList.remove('neuro-main-container');
    });

    mainContent.classList.add('neuro-main-container');
    mainContent.setAttribute('data-neuro-main-container', 'true');

    // Turn meaningful direct children into readable blocks/cards
    Array.from(mainContent.children).forEach((child) => {
      if (!child || child.id === 'neuro-topbar') return;

      const tag = (child.tagName || '').toLowerCase();
      const text = (child.innerText || '').trim();

      const goodBlock =
        ['section', 'article', 'div', 'p', 'ul', 'ol', 'blockquote'].includes(tag) &&
        text.length > 60;

      if (goodBlock) {
        child.classList.add('neuro-content-block');
      }
    });
  }

  style.textContent = `
    body.neuro-structured-page {
      padding-top: 12px !important;
      line-height: 1.7 !important;
      scroll-behavior: smooth !important;
    }

    body.neuro-structured-page main,
    body.neuro-structured-page article,
    body.neuro-structured-page [role="main"],
    body.neuro-structured-page .main-content,
    body.neuro-structured-page #content,
    body.neuro-structured-page #main-content,
    body.neuro-structured-page .post-content,
    body.neuro-structured-page .entry-content {
      max-width: 960px !important;
      margin-left: auto !important;
      margin-right: auto !important;
      padding-left: 20px !important;
      padding-right: 20px !important;
    }

    body.neuro-structured-page .neuro-main-container {
      max-width: 960px !important;
      margin: 20px auto !important;
      padding: 8px 20px 40px 20px !important;
      border-radius: 20px !important;
    }

    body.neuro-structured-page h1 {
      font-size: 2rem !important;
      line-height: 1.2 !important;
      margin: 0 0 18px 0 !important;
      padding: 16px 18px !important;
      border-radius: 18px !important;
      background: rgba(108, 92, 231, 0.10) !important;
      border: 1px solid rgba(108, 92, 231, 0.18) !important;
    }

    body.neuro-structured-page h2,
    body.neuro-structured-page h3 {
      margin-top: 24px !important;
      margin-bottom: 12px !important;
      padding: 10px 14px !important;
      border-radius: 14px !important;
      background: rgba(108, 92, 231, 0.06) !important;
      border-left: 4px solid #6c5ce7 !important;
    }

    body.neuro-structured-page p,
    body.neuro-structured-page li {
      max-width: 75ch !important;
      font-size: 1.02rem !important;
      margin-bottom: 1em !important;
    }

    body.neuro-structured-page img,
    body.neuro-structured-page video,
    body.neuro-structured-page table,
    body.neuro-structured-page pre,
    body.neuro-structured-page blockquote {
      border-radius: 16px !important;
      overflow: hidden !important;
      margin-top: 16px !important;
      margin-bottom: 16px !important;
    }

    body.neuro-structured-page .neuro-content-block {
      background: rgba(255, 255, 255, 0.04) !important;
      border: 1px solid rgba(108, 92, 231, 0.10) !important;
      border-radius: 18px !important;
      padding: 16px 18px !important;
      margin: 14px 0 !important;
      box-shadow: 0 8px 24px rgba(0,0,0,0.06) !important;
    }

    body.neuro-structured-page section,
    body.neuro-structured-page article section,
    body.neuro-structured-page [role="region"] {
      border-radius: 18px !important;
    }

    body.neuro-structured-page aside,
    body.neuro-structured-page .sidebar,
    body.neuro-structured-page .right-rail,
    body.neuro-structured-page .left-rail {
      display: none !important;
    }

  `;
}

function removeStructuredLayout() {
  document.body.classList.remove('neuro-structured-page');
  document.getElementById('neuro-structured-layout-style')?.remove();

  document.querySelectorAll('.neuro-main-container').forEach(el => {
    el.classList.remove('neuro-main-container');
    el.removeAttribute('data-neuro-main-container');
  });

  document.querySelectorAll('.neuro-content-block').forEach(el => {
    el.classList.remove('neuro-content-block');
  });
}

function applyFocusMode(mainContentSelector, distractionSelectors) {
  if (!document.getElementById('neuro-focus-mode-style')) {
    const style = document.createElement('style');
    style.id = 'neuro-focus-mode-style';
    style.textContent = `
      .focus-mode {
        outline: 2px solid rgba(108,92,231,0.35);
        outline-offset: 6px;
        border-radius: 6px;
      }
    `;
    document.head.appendChild(style);
  }

  if (mainContentSelector) {
    const mainEl = document.querySelector(mainContentSelector);
    if (mainEl) {
      mainEl.classList.add('focus-mode');
      mainEl.setAttribute('data-neuro-main', 'true');
    }
  }

  if (Array.isArray(distractionSelectors)) {
    distractionSelectors.forEach(selector => {
      try {
        document.querySelectorAll(selector).forEach(el => {
          el.style.display = 'none';
          el.setAttribute('data-neuro-hidden', 'true');
        });
      } catch (e) { }
    });
  }
}

async function analyzePageStructure() {
  try {
    const cleanedHTML = getCleanDOM();
    if (!cleanedHTML || cleanedHTML.length < 50) {
      throw new Error('DOM content is empty');
    }
    const maxLength = 200000;
    if (cleanedHTML.length > maxLength) {
      throw new Error('DOM too large for analysis');
    }

    const response = await new Promise((resolve, reject) => {
      safeSendMessage({ action: 'analyzePageStructure', html: cleanedHTML }, (result, error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      });
    });

    if (!response?.success || !response.data) {
      throw new Error(response?.error || 'AI analysis failed');
    }

    const { navSelector, mainContentSelector, distractions } = response.data;
    applyFocusMode(mainContentSelector, distractions);
    return { navSelector, mainContentSelector, distractions };
  } catch (error) {
    console.warn('analyzePageStructure error:', error);
    return { error: error.message };
  }
}

// ========== 3. REMOVE DISTRACTIONS ==========

// ========== 3. REMOVE DISTRACTIONS ==========

const distractionSelectors = [
  '.ad', '.ads', '.advertisement', '.ad-wrapper', '.adsbygoogle',
  '.popup', '.modal', '.overlay', '.newsletter', '.cookie-notice',
  'aside', '.sidebar', '.right-rail', '.left-rail',
  '.related', '.recommend', '.more-articles', '.you-might-like',
  '.social-share', '.share-buttons', '.comments-section', '#comments',
  '.fixed-header', '.fixed-footer', '.intercom'
];

function getMainContentElement() {
  const candidates = [
    'main',
    'article',
    '[role="main"]',
    '#main',
    '#content',
    '#app',
    '#root',
    '.main',
    '.content',
    '.main-content',
    '.post-content',
    '.article-content'
  ];

  for (const selector of candidates) {
    const el = document.querySelector(selector);
    if (el && el.offsetWidth > 0 && el.offsetHeight > 0 && (el.innerText || '').trim().length > 200) {
      return el;
    }
  }

  // fallback: biggest visible text-heavy container
  const all = Array.from(document.querySelectorAll('div, section, article, main'));
  let best = null;
  let bestScore = -1;

  for (const el of all) {
    const text = (el.innerText || '').trim().length;
    const rect = el.getBoundingClientRect();
    const score = text + rect.width * rect.height * 0.001;
    if (text > 200 && rect.width > 300 && rect.height > 200 && score > bestScore) {
      best = el;
      bestScore = score;
    }
  }

  return best;
}

function isMainContent(element) {
  const mainElement = getMainContentElement();
  return !!(mainElement && (mainElement === element || mainElement.contains(element)));
}

function shouldHideElement(el) {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (isMainContent(el)) return false;

  const text = (el.innerText || '').trim().length;
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);

  // never hide huge likely-main containers
  if (rect.width > window.innerWidth * 0.6 && rect.height > window.innerHeight * 0.5) {
    return false;
  }

  // never hide body/html/app roots
  const tag = el.tagName.toLowerCase();
  if (['html', 'body', 'main', 'article'].includes(tag)) return false;
  if (el.id === 'app' || el.id === 'root') return false;

  // likely popup / floating clutter
  const zIndex = parseInt(style.zIndex, 10);
  if (
    (style.position === 'fixed' || style.position === 'absolute') &&
    !Number.isNaN(zIndex) &&
    zIndex > 1000
  ) {
    return true;
  }

  // likely side clutter
  if (text < 500 && rect.width < window.innerWidth * 0.35) {
    return true;
  }

  return false;
}

function removeDistractions() {
  const mainElement = getMainContentElement();

  distractionSelectors.forEach(selector => {
    try {
      document.querySelectorAll(selector).forEach(el => {
        if (!mainElement || isMainContent(el)) return;
        if (!shouldHideElement(el)) return;

        el.style.display = 'none';
        el.setAttribute('data-neuro-hidden', 'true');
      });
    } catch (e) {
      console.warn('removeDistractions selector failed:', selector, e);
    }
  });

  hideHighDistractionElements();
}

function hideHighDistractionElements() {
  document.querySelectorAll('div, section, aside').forEach(el => {
    if (el.hasAttribute('data-neuro-hidden') || isMainContent(el)) return;
    if (!shouldHideElement(el)) return;

    el.style.display = 'none';
    el.setAttribute('data-neuro-hidden', 'true');
  });
}

// ========== 4. READING RULER ==========

function createReadingRuler() {
  if (readingRulerElement) return;

  readingRulerElement = document.createElement('div');
  readingRulerElement.id = 'neuro-reading-ruler';
  readingRulerElement.innerHTML = `<div class="ruler-line"></div><div class="ruler-controls"><button class="ruler-up">▲</button><button class="ruler-down">▼</button></div>`;

  const style = document.createElement('style');
  style.textContent = `
    #neuro-reading-ruler { position: fixed; left: 0; right: 0; z-index: 999999; pointer-events: none; }
    #neuro-reading-ruler .ruler-line { position: absolute; left: 0; right: 0; height: 3px; background: rgba(108,92,231,0.5); transition: top 0.1s ease; }
    #neuro-reading-ruler .ruler-controls { position: absolute; right: 10px; top: -15px; display: flex; gap: 5px; pointer-events: auto; }
    #neuro-reading-ruler .ruler-controls button { width: 24px; height: 24px; background: #6c5ce7; color: white; border: none; border-radius: 4px; cursor: pointer; }
  `;

  document.head.appendChild(style);
  document.body.appendChild(readingRulerElement);

  const rulerLine = readingRulerElement.querySelector('.ruler-line');
  const rulerUp = readingRulerElement.querySelector('.ruler-up');
  const rulerDown = readingRulerElement.querySelector('.ruler-down');

  if (!rulerLine) return;

  let currentLineHeight = window.scrollY + 200;

  const updateRulerPosition = () => {
    try {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
        const rect = selection.getRangeAt(0).getBoundingClientRect();
        currentLineHeight = rect.top + window.scrollY;
      } else {
        currentLineHeight = window.scrollY + 200;
      }
      readingRulerElement.style.top = (currentLineHeight - 15) + 'px';
      rulerLine.style.top = '15px';
    } catch (e) { }
  };

  if (rulerUp) rulerUp.addEventListener('click', () => { currentLineHeight -= 30; readingRulerElement.style.top = (currentLineHeight - 15) + 'px'; });
  if (rulerDown) rulerDown.addEventListener('click', () => { currentLineHeight += 30; readingRulerElement.style.top = (currentLineHeight - 15) + 'px'; });

  window.addEventListener('scroll', updateRulerPosition);
  document.addEventListener('mousemove', (e) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      currentLineHeight = e.clientY + window.scrollY;
      readingRulerElement.style.top = (currentLineHeight - 15) + 'px';
    }
  });
  updateRulerPosition();
}

function removeReadingRuler() {
  if (readingRulerElement) { readingRulerElement.remove(); readingRulerElement = null; }
}

// ========== 5. REMOVE ANIMATIONS ==========

function removeAnimations() {
  let style = document.getElementById('neuro-no-animations');
  if (!style) {
    style = document.createElement('style');
    style.id = 'neuro-no-animations';
    document.head.appendChild(style);
  }
  style.textContent = `*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important;}`;
  document.querySelectorAll('video, audio').forEach(media => media.pause());
}

function startAnimationObserver() {
  if (animationObserver) animationObserver.disconnect();
  animationObserver = createBatchedMutationObserver({
    delay: 150,
    maxNodes: 40,
    onBatch: ({ roots }) => {
      if (!currentSettings.removeAnimations) return;
      roots.forEach(root => {
        if (['VIDEO', 'AUDIO'].includes(root.tagName)) {
          if (!root.hasAttribute('data-neuro-paused')) { root.pause(); root.setAttribute('data-neuro-paused', 'true'); }
        }
        root.querySelectorAll?.('video, audio').forEach(media => {
          if (!media.hasAttribute('data-neuro-paused')) { media.pause(); media.setAttribute('data-neuro-paused', 'true'); }
        });
      });
    }
  });
  animationObserver.observe(document.body, { childList: true, subtree: true });
}

function stopAnimationObserver() {
  if (animationObserver) { animationObserver.disconnect(); animationObserver = null; }
  document.getElementById('neuro-no-animations')?.remove();
}

// ========== 6. COGNITIVE LOAD SCORING ==========

async function calculateAndDisplayCognitiveScore() {
  try {
    const score = await calculateCognitiveLoad();

    // Safe message send
    safeSendMessage({ action: 'saveCognitiveScore', score: score.score });

    if (!cognitiveScoreDisplay) {
      cognitiveScoreDisplay = document.createElement('div');
      cognitiveScoreDisplay.id = 'neuro-cognitive-score';
      cognitiveScoreDisplay.style.cssText = `
        position: fixed; bottom: 20px; left: 20px; z-index: 1000000;
        background: rgba(26,26,46,0.95); backdrop-filter: blur(8px);
        padding: 8px 14px; border-radius: 20px; font-family: system-ui, sans-serif;
        font-size: 12px; color: white; border-left: 3px solid #6c5ce7;
        cursor: help; transition: all 0.3s ease; box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      `;
      cognitiveScoreDisplay.onclick = () => showDetailedCognitiveReport(score);
      document.body.appendChild(cognitiveScoreDisplay);
    }

    const scoreColor = score.score < 40 ? '#00b894' : (score.score < 70 ? '#fdcb6e' : '#e74c3c');
    cognitiveScoreDisplay.innerHTML = `🧠 Cognitive Load: <span style="color:${scoreColor}; font-weight:bold;">${score.score}</span>/${score.max}<span style="font-size:10px; margin-left:5px;">ⓘ</span>`;
  } catch (e) {
    console.log('Cognitive scoring error:', e);
  }
}

async function calculateCognitiveLoad() {
  const elements = document.querySelectorAll('*');
  const viewportArea = window.innerWidth * window.innerHeight;

  const visualDensity = Math.min((elements.length * 10000) / viewportArea, 100);

  const colors = new Set();
  const sampleSize = Math.min(100, elements.length);
  for (let i = 0; i < sampleSize; i++) {
    const styles = window.getComputedStyle(elements[i]);
    colors.add(styles.color);
    colors.add(styles.backgroundColor);
  }
  const colorVariance = Math.min(colors.size * 5, 100);

  let motionCount = 0;
  for (const el of elements) {
    if (window.getComputedStyle(el).animation !== 'none') motionCount++;
  }
  const motionAmount = Math.min(motionCount * 5, 100);

  const paragraphs = document.querySelectorAll('p');
  let textComplexity = 0;
  for (const p of paragraphs) {
    const text = p.innerText;
    const words = text.split(/\s+/).length;
    const sentences = text.split(/[.!?]+/).length;
    if (sentences > 0) {
      const avgWordLength = text.replace(/\s/g, '').length / words;
      const complexity = Math.min((avgWordLength - 4) * 20, 100);
      textComplexity = (textComplexity + Math.max(0, complexity)) / 2;
    }
  }

  let depth = 0;
  let current = document.activeElement;
  while (current && current !== document.body) { depth++; current = current.parentElement; }
  const navigationDepth = Math.min(depth * 10, 100);

  const weights = { visualDensity: 0.25, colorVariance: 0.20, motionAmount: 0.20, textComplexity: 0.25, navigationDepth: 0.10 };
  const totalScore = Math.round(
    visualDensity * weights.visualDensity +
    colorVariance * weights.colorVariance +
    motionAmount * weights.motionAmount +
    textComplexity * weights.textComplexity +
    navigationDepth * weights.navigationDepth
  );

  return {
    score: totalScore,
    max: 100,
    level: totalScore < 40 ? 'Low' : (totalScore < 70 ? 'Medium' : 'High'),
    breakdown: { visualDensity, colorVariance, motionAmount, textComplexity, navigationDepth }
  };
}

function showDetailedCognitiveReport(score) {
  const existing = document.getElementById('neuro-cognitive-report');
  if (existing) existing.remove();

  const report = document.createElement('div');
  report.id = 'neuro-cognitive-report';
  report.innerHTML = `
    <div style="position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); z-index:1000002; background:#1a1a2e; border-radius:16px; padding:20px; max-width:400px; width:90%; box-shadow:0 20px 40px rgba(0,0,0,0.4); border:1px solid #6c5ce7; font-family:system-ui,sans-serif; color:#eee;">
      <h3 style="margin:0 0 15px 0; color:#6c5ce7;">🧠 Cognitive Load Report</h3>
      <div style="margin-bottom:15px;"><span style="font-size:36px; font-weight:bold;">${score.score}</span><span style="color:#888;">/100</span> - <span style="color:${score.score < 40 ? '#00b894' : (score.score < 70 ? '#fdcb6e' : '#e74c3c')}">${score.level} Load</span></div>
      <div style="margin-bottom:12px;"><div style="display:flex; justify-content:space-between;"><span>Visual Density</span><span>${Math.round(score.breakdown.visualDensity)}%</span></div><div style="height:4px; background:#2d2d44; border-radius:2px;"><div style="width:${score.breakdown.visualDensity}%; height:4px; background:#6c5ce7; border-radius:2px;"></div></div></div>
      <div style="margin-bottom:12px;"><div style="display:flex; justify-content:space-between;"><span>Color Variance</span><span>${Math.round(score.breakdown.colorVariance)}%</span></div><div style="height:4px; background:#2d2d44; border-radius:2px;"><div style="width:${score.breakdown.colorVariance}%; height:4px; background:#6c5ce7; border-radius:2px;"></div></div></div>
      <div style="margin-bottom:12px;"><div style="display:flex; justify-content:space-between;"><span>Motion/Animations</span><span>${Math.round(score.breakdown.motionAmount)}%</span></div><div style="height:4px; background:#2d2d44; border-radius:2px;"><div style="width:${score.breakdown.motionAmount}%; height:4px; background:#6c5ce7; border-radius:2px;"></div></div></div>
      <div style="margin-bottom:12px;"><div style="display:flex; justify-content:space-between;"><span>Text Complexity</span><span>${Math.round(score.breakdown.textComplexity)}%</span></div><div style="height:4px; background:#2d2d44; border-radius:2px;"><div style="width:${score.breakdown.textComplexity}%; height:4px; background:#6c5ce7; border-radius:2px;"></div></div></div>
      <button id="close-report" style="width:100%; padding:10px; background:#6c5ce7; border:none; border-radius:8px; color:white; cursor:pointer; margin-top:10px;">Close</button>
    </div>
  `;
  document.body.appendChild(report);
  document.getElementById('close-report').onclick = () => report.remove();
}

// ========== 7. AI TEXT SIMPLIFICATION ==========

function findMainContent() {
  const selectors = ['article', 'main', '[role="main"]', '.post-content', '.article-content', '.entry-content', '#content', '.main-content'];
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.innerText.trim().length > 500) return element;
  }

  let maxText = 0, best = null;
  document.querySelectorAll('div, section, main, article').forEach(el => {
    const textLen = el.innerText.trim().length;
    const isBad = /nav|menu|sidebar|footer|header|aside|widget|comment/i.test((el.className || '') + (el.id || ''));
    if (!isBad && textLen > maxText && textLen > 300) { maxText = textLen; best = el; }
  });
  return best || document.body;
}

async function simplifyPageWithAI() {
  const mainContent = findMainContent();
  if (!mainContent) {
    showNotification('Could not find content', 'error');
    return;
  }

  // Target all meaningful text blocks
  const textElements = mainContent.querySelectorAll('p, li, blockquote');
  showNotification('AI is restructuring page in batches...', 'loading');

  const elements = Array.from(textElements).filter(el => (el.innerText || '').trim().length >= 60);

  const BATCH_SIZE = 10;
  for (let i = 0; i < elements.length; i += BATCH_SIZE) {
    const chunk = elements.slice(i, i + BATCH_SIZE);
    const originalTexts = chunk.map(el => (el.innerText || '').trim());

    // Call AI for this batch to ensure 1:1 restructuring
    const response = await new Promise((resolve) => {
      safeSendMessage({ action: 'simplifyTextBatch', texts: originalTexts }, (result) => resolve(result));
    });

    if (response?.success && response.simplifiedTexts) {
      chunk.forEach((el, index) => {
        const rawText = response.simplifiedTexts[index] || originalTexts[index];
        const originalText = originalTexts[index];

        // SPLIT the AI text into an array of bullets
        const bulletPoints = rawText
          .split(/\n/)
          .map(line => line.replace(/^[-•*]\s*/, '').trim())
          .filter(line => line.length > 0);

        const expandedPoints = [];
        bulletPoints.forEach(point => {
          const sentences = splitIntoSentences(point);
          if (sentences.length <= 1) {
            expandedPoints.push(point);
            return;
          }
          sentences.forEach(sentence => expandedPoints.push(sentence));
        });

        // CLEAR the original element and turn it into a list container
        el.innerHTML = '';
        el.classList.add('neuro-simplified-container');

        const list = document.createElement('ul');
        list.style.listStyle = 'none';
        list.style.padding = '0';
        list.style.margin = '0';

        expandedPoints.forEach(point => {
          const li = document.createElement('li');
          li.innerHTML = `<span style="color:#6c5ce7; margin-right:8px;">•</span>${point}`;
          li.style.marginBottom = '8px';
          li.style.display = 'block';
          list.appendChild(li);
        });

        el.appendChild(list);

        // Add the Restore/Original button at the bottom
        addRestoreButtonToElement(el, originalText);

        // Apply visual styling to the parent container
        el.style.backgroundColor = 'rgba(108,92,231,0.05)';
        el.style.borderLeft = '4px solid #6c5ce7';
        el.style.padding = '15px';
        el.style.borderRadius = '12px';
        el.setAttribute('data-neuro-simplified', 'true');
      });
    }
  }
  showNotification('✓ Page restructured into bullets!', 'success');
}

function splitIntoSentences(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const sentences = [];
  let buffer = '';
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    buffer += char;
    if (char === '.' || char === '!' || char === '?') {
      const next = clean[i + 1] || '';
      if (next === ' ' || next === '') {
        const trimmed = buffer.trim();
        if (trimmed) sentences.push(trimmed);
        buffer = '';
      }
    }
  }
  const remainder = buffer.trim();
  if (remainder) sentences.push(remainder);
  return sentences;
}
// Replace applyBasicSimplification with more aggressive version
function applyBasicSimplification(textToSimplify) {
  for (const item of textToSimplify) {
    let text = item.text;
    let originalLength = text.length;

    // Step 1: Extract key sentences
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 15);

    // Step 2: Take only the most important sentences (max 5)
    let keySentences = [];
    if (sentences.length <= 3) {
      keySentences = sentences;
    } else {
      // First sentence (usually main idea)
      keySentences.push(sentences[0]);
      // Middle sentence (context)
      if (sentences.length > 3) {
        keySentences.push(sentences[Math.floor(sentences.length / 2)]);
      }
      // Last sentence (conclusion)
      keySentences.push(sentences[sentences.length - 1]);
    }

    // Step 3: Aggressive word simplification
    const replacements = {
      'utilize': 'use', 'implement': 'use', 'additional': 'more',
      'purchase': 'buy', 'numerous': 'many', 'facilitate': 'help',
      'terminate': 'end', 'demonstrate': 'show', 'consequently': 'so',
      'nevertheless': 'but', 'furthermore': 'also', 'approximately': 'about',
      'significant': 'big', 'substantial': 'large', 'however': 'but',
      'therefore': 'so', 'moreover': 'also', 'nevertheless': 'still',
      'subsequent': 'next', 'prior to': 'before', 'in order to': 'to',
      'due to': 'because of', 'as well as': 'and', 'in addition to': 'plus',
      'a number of': 'some', 'a variety of': 'many', 'a lack of': 'no',
      'in the event that': 'if', 'on the other hand': 'but',
      'as a result': 'so', 'in conclusion': 'in short', 'to summarize': 'in short'
    };

    let simplifiedText = '';
    for (const sentence of keySentences) {
      let processed = sentence.trim();
      for (const [complex, simple] of Object.entries(replacements)) {
        const regex = new RegExp(`\\b${complex}\\b`, 'gi');
        processed = processed.replace(regex, simple);
      }
      // Remove passive voice
      processed = processed.replace(/\b(was|were|been|being)\s+(\w+ed)\b/gi, '$2');
      // Shorten
      if (processed.length > 100) {
        processed = processed.substring(0, 97) + '...';
      }
      simplifiedText += processed + '\n\n';
    }

    // Step 4: Convert to bullet points
    const bulletPoints = simplifiedText.split('\n\n').filter(p => p.trim());
    let finalText = '';
    for (let i = 0; i < bulletPoints.length; i++) {
      if (i === 0) {
        finalText += `📌 ${bulletPoints[i]}\n\n`;
      } else if (i === bulletPoints.length - 1 && bulletPoints.length > 2) {
        finalText += `✅ ${bulletPoints[i]}`;
      } else {
        finalText += `• ${bulletPoints[i]}\n\n`;
      }
    }

    // Apply to element with visual styling
    item.element.innerHTML = finalText;
    item.element.classList.add('neuro-simplified');
    item.element.style.backgroundColor = 'rgba(108,92,231,0.08)';
    item.element.style.borderLeft = '4px solid #6c5ce7';
    item.element.style.padding = '12px 16px';
    item.element.style.borderRadius = '12px';
    item.element.style.marginBottom = '16px';
    item.element.style.fontSize = '16px';
    item.element.style.lineHeight = '1.5';
    item.element.setAttribute('data-neuro-simplified', 'true');

    // Add a "Show Original" button next to simplified text
    addRestoreButtonToElement(item.element, item.text);
  }
}

function addRestoreButtonToElement(element, originalText) {
  // Don't add if button already exists for this element
  if (element.querySelector('.neuro-restore-btn')) return;

  const restoreBtn = document.createElement('button');
  restoreBtn.className = 'neuro-restore-btn';
  restoreBtn.innerHTML = '↺ Original';
  restoreBtn.style.cssText = `
    display: inline-block;
    margin-left: 12px;
    padding: 2px 8px;
    font-size: 11px;
    background: #2d2d44;
    color: #aaa;
    border: none;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s;
  `;
  restoreBtn.onmouseenter = () => { restoreBtn.style.background = '#6c5ce7'; restoreBtn.style.color = 'white'; };
  restoreBtn.onmouseleave = () => { restoreBtn.style.background = '#2d2d44'; restoreBtn.style.color = '#aaa'; };

  let isOriginal = false;
  restoreBtn.onclick = (e) => {
    e.stopPropagation();
    if (isOriginal) {
      // Show simplified again - need to regenerate
      element.innerHTML = element.innerHTML.replace(originalText, '');
      restoreBtn.innerHTML = '↺ Original';
    } else {
      // Store current simplified text
      const currentText = element.innerText;
      element.setAttribute('data-neuro-simplified-text', currentText);
      element.innerText = originalText;
      restoreBtn.innerHTML = '✨ Simplified';
    }
    isOriginal = !isOriginal;
  };

  element.style.position = 'relative';
  element.appendChild(restoreBtn);
}

// ========== NOTIFICATION FUNCTION ==========

function showNotification(message, type) {
  const existing = document.getElementById('neuro-notification');
  if (existing) existing.remove();

  const colors = { loading: '#6c5ce7', success: '#00b894', error: '#e74c3c' };
  const notification = document.createElement('div');
  notification.id = 'neuro-notification';
  notification.style.cssText = `position:fixed; bottom:80px; right:20px; z-index:1000000; padding:12px 20px; border-radius:8px; background:${colors[type] || '#6c5ce7'}; color:white; font-family:system-ui,sans-serif; font-size:14px; animation:slideIn 0.3s ease; box-shadow:0 4px 12px rgba(0,0,0,0.15);`;
  notification.textContent = message;
  document.body.appendChild(notification);
  if (type !== 'loading') setTimeout(() => notification.remove(), 3000);
}

// ========== 8. JARGON EXPLAINER ==========

// ========== 8. JARGON EXPLAINER (GEMINI-POWERED) ==========

const jargonCache = new Map();  // Cache for definitions to avoid repeated API calls
const jargonPending = new Map(); // Track in-flight requests
let jargonObserver = null;
let jargonScanTimeout = null;
const JARGON_HOVER_DELAY_MS = 400;
const JARGON_MAX_INFLIGHT = 2;
let jargonInFlight = 0;

// Clean word for caching
function cleanWord(word) {
  return word.toLowerCase().replace(/[^a-z]/g, '');
}

// Check if a word might be jargon (heuristic - fast filtering before API call)
function isLikelyJargon(word) {
  if (!word || word.length < 5) return false;

  const clean = cleanWord(word);
  if (clean.length < 5) return false;

  // Common words that are definitely not jargon
  const commonWords = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'with', 'have', 'this',
    'that', 'from', 'they', 'will', 'would', 'could', 'should', 'about', 'there',
    'their', 'which', 'what', 'when', 'where', 'who', 'whom', 'such', 'these',
    'those', 'then', 'than', 'into', 'upon', 'under', 'over', 'after', 'before',
    'above', 'below', 'between', 'through', 'during', 'without', 'within', 'along',
    'following', 'including', 'according', 'because', 'therefore', 'however',
    'meanwhile', 'nevertheless', 'furthermore', 'consequently', 'accordingly',
    'hello', 'thank', 'please', 'sorry', 'yes', 'no', 'maybe', 'always', 'never',
    'sometimes', 'usually', 'often', 'rarely', 'quickly', 'slowly', 'carefully',
    'happily', 'sadly', 'loudly', 'quietly', 'brightly', 'darkly', 'softly', 'hardly'
  ]);

  if (commonWords.has(clean)) return false;

  // Words that are likely jargon: longer words or technical-looking
  return clean.length > 6 || /^(re|de|un|in|im|dis|pre|post|anti|pro|sub|super|inter|intra|multi|poly|bio|geo|hydro|thermo|psycho|neuro)/.test(clean);
}

// Get definition from Gemini API
async function getGeminiDefinition(word, context = '') {
  const clean = cleanWord(word);
  if (!clean) return null;

  // Check cache first
  if (jargonCache.has(clean)) {
    console.log(`Jargon cache hit: ${clean}`);
    return jargonCache.get(clean);
  }

  // Check if already fetching
  if (jargonPending.has(clean)) {
    console.log(`Waiting for pending request: ${clean}`);
    return jargonPending.get(clean);
  }

  // Create promise for this request
  const requestPromise = new Promise((resolve) => {
    console.log(`Fetching Gemini definition for: ${clean}`);
    safeSendMessage({ action: 'defineJargon', word: clean, context }, (response, error) => {
      if (error || !response?.success || !response?.definition) {
        const detail = response?.error || error?.message || 'Unknown error';
        resolve(`Error: ${detail}`);
        return;
      }
      resolve(response.definition);
    });
  });

  // Store the promise to avoid duplicate requests
  jargonPending.set(clean, requestPromise);

  // Wait for the definition and cache it
  const definition = await requestPromise;
  jargonCache.set(clean, definition);
  jargonPending.delete(clean);

  // Limit cache size
  if (jargonCache.size > 300) {
    const firstKey = jargonCache.keys().next().value;
    jargonCache.delete(firstKey);
  }

  return definition;
}

// Generate a fallback definition when API is unavailable
function generateFallbackDefinition(word) {
  const clean = cleanWord(word);

  // Simple heuristics for common patterns
  if (clean.endsWith('tion') || clean.endsWith('sion')) {
    return `"${word}" - the act or result of doing something`;
  }
  if (clean.endsWith('ing')) {
    return `"${word}" - the process of ${clean.slice(0, -3)}ing`;
  }
  if (clean.endsWith('er') || clean.endsWith('or')) {
    return `"${word}" - a person or thing that does something`;
  }
  if (clean.endsWith('able') || clean.endsWith('ible')) {
    return `"${word}" - capable of being done`;
  }
  if (clean.startsWith('re')) {
    return `"${word}" - to do again or go back`;
  }
  if (clean.startsWith('un')) {
    return `"${word}" - not or opposite of`;
  }
  if (clean.startsWith('pre')) {
    return `"${word}" - before or earlier`;
  }

  return `"${word}" - a specific term. Hover for AI definition (needs API key)`;
}

// Show tooltip with definition
let activeTooltip = null;
let tooltipTimeout = null;

function showJargonTooltip(word, definition, x, y, isLoading = false) {
  // Remove existing tooltip
  if (activeTooltip) {
    activeTooltip.remove();
    activeTooltip = null;
  }

  const tooltip = document.createElement('div');
  tooltip.id = 'neuro-jargon-tooltip';

  if (isLoading) {
    tooltip.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="animation: spin 1s linear infinite;">🔄</span>
        <span>Looking up "${word}"...</span>
      </div>
    `;
  } else {
    tooltip.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
        <span style="font-size:16px;">📖</span>
        <strong style="color:#6c5ce7;">${escapeHtml(word)}</strong>
      </div>
      <div style="font-size:12px; line-height:1.4;">${escapeHtml(definition)}</div>
      <div style="font-size:10px; color:#888; margin-top:6px;">🤖 AI-powered definition</div>
    `;
  }

  tooltip.style.cssText = `
    position: fixed;
    left: ${Math.min(x + 10, window.innerWidth - 300)}px;
    top: ${y - 10}px;
    z-index: 1000001;
    background: #1a1a2e;
    color: #eee;
    border-radius: 12px;
    padding: 12px 16px;
    max-width: 300px;
    min-width: 180px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.3);
    border-left: 4px solid #6c5ce7;
    font-family: system-ui, sans-serif;
    font-size: 13px;
    animation: fadeIn 0.2s ease;
    pointer-events: none;
    backdrop-filter: blur(8px);
  `;

  document.body.appendChild(tooltip);
  activeTooltip = tooltip;

  // Auto-hide after 8 seconds
  if (tooltipTimeout) clearTimeout(tooltipTimeout);
  tooltipTimeout = setTimeout(() => {
    if (activeTooltip) {
      activeTooltip.remove();
      activeTooltip = null;
    }
  }, 8000);
}

function hideJargonTooltip() {
  if (tooltipTimeout) clearTimeout(tooltipTimeout);
  if (activeTooltip) {
    activeTooltip.remove();
    activeTooltip = null;
  }
}

// Helper to escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function (m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

// Scan page and wrap jargon words
function scanJargonInRoot(root) {
  if (!root || !currentSettings.jargonExplainer) return;

  console.log('Scanning for jargon words...');

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      // Skip if already processed or inside script/style
      if (node.parentElement?.classList?.contains('neuro-jargon-word')) return NodeFilter.FILTER_REJECT;
      if (node.parentElement?.tagName === 'SCRIPT') return NodeFilter.FILTER_REJECT;
      if (node.parentElement?.tagName === 'STYLE') return NodeFilter.FILTER_REJECT;
      if (node.parentElement?.tagName === 'CODE') return NodeFilter.FILTER_REJECT;
      if (node.parentElement?.tagName === 'PRE') return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const textNodes = [];
  while (walker.nextNode()) {
    if (textNodes.length < 800) textNodes.push(walker.currentNode);
  }

  console.log(`Found ${textNodes.length} text nodes to scan`);

  textNodes.forEach(node => {
    const text = node.textContent;
    if (!text || text.length < 30) return;

    // Split into words, preserving spaces and punctuation
    const words = text.split(/(\s+|[.,!?;:()\[\]{}"'])/);
    let modified = false;
    let jargonWordsFound = [];

    for (let i = 0; i < words.length; i++) {
      const token = words[i];
      if (!token || !token.trim()) continue;

      // Check if this token might be a word (contains letters)
      if (/[a-zA-Z]/.test(token)) {
        const clean = token.toLowerCase().replace(/[^a-z]/g, '');
        if (clean.length >= 5 && isLikelyJargon(clean)) {
          jargonWordsFound.push({ token, clean, index: i });
        }
      }
    }

    // Process found jargon words
    for (const { token, clean, index } of jargonWordsFound) {
      const span = document.createElement('span');
      span.className = 'neuro-jargon-word';
      span.textContent = token;
      span.style.borderBottom = '2px dotted #6c5ce7';
      span.style.cursor = 'help';
      span.style.display = 'inline';
      span.style.transition = 'background-color 0.2s';
      span.setAttribute('data-jargon-word', clean);

      let definitionLoaded = false;
      let currentDefinition = null;
      let hoverTimer = null;

      span.addEventListener('mouseenter', () => {
        if (hoverTimer) clearTimeout(hoverTimer);
        hoverTimer = setTimeout(async () => {
          const rect = span.getBoundingClientRect();

          if (jargonInFlight >= JARGON_MAX_INFLIGHT) {
            showJargonTooltip(clean, 'Too many requests. Try again in a moment.', rect.left, rect.top, false);
            return;
          }

          jargonInFlight += 1;
          showJargonTooltip(clean, 'Fetching definition...', rect.left, rect.top, true);

          try {
            const context = getContextForWord(span);
            const definition = await getGeminiDefinition(clean, context);

            if (!definitionLoaded) {
              definitionLoaded = true;
              currentDefinition = definition;
              showJargonTooltip(clean, definition, rect.left, rect.top, false);
            }

            safeSendMessage({ action: 'trackJargonHover' });
          } finally {
            jargonInFlight = Math.max(0, jargonInFlight - 1);
          }
        }, JARGON_HOVER_DELAY_MS);
      });

      span.addEventListener('mouseleave', () => {
        if (hoverTimer) {
          clearTimeout(hoverTimer);
          hoverTimer = null;
        }
        hideJargonTooltip();
      });

      words[index] = span;
      modified = true;
    }

    if (modified) {
      const fragment = document.createDocumentFragment();
      words.forEach(item => {
        if (typeof item === 'string') {
          fragment.appendChild(document.createTextNode(item));
        } else {
          fragment.appendChild(item);
        }
      });
      node.parentNode.replaceChild(fragment, node);
    }
  });

  console.log('Jargon scan complete');
}

// Get surrounding text for better context
function getContextForWord(element) {
  const parent = element.parentElement;
  if (!parent) return '';

  // Get up to 100 characters before and after
  const text = parent.innerText || '';
  const wordText = element.textContent;
  const wordIndex = text.indexOf(wordText);

  if (wordIndex === -1) return '';

  const start = Math.max(0, wordIndex - 60);
  const end = Math.min(text.length, wordIndex + wordText.length + 60);
  let context = text.substring(start, end);

  // Clean up context
  context = context.replace(/\s+/g, ' ').trim();

  return context;
}

// Initialize jargon explainer
function initJargonExplainer() {
  if (!currentSettings.jargonExplainer) return;

  console.log('Initializing Gemini-powered Jargon Explainer...');

  // Debounce scanning to avoid performance issues
  if (jargonScanTimeout) clearTimeout(jargonScanTimeout);

  jargonScanTimeout = setTimeout(() => {
    const mainContent = findMainContent();
    if (mainContent) {
      scanJargonInRoot(mainContent);
    } else {
      scanJargonInRoot(document.body);
    }
    startJargonObserver();
  }, 1500);
}

function startJargonObserver() {
  if (jargonObserver) jargonObserver.disconnect();

  jargonObserver = new MutationObserver((mutations) => {
    // Debounce observer to avoid excessive scanning
    if (jargonScanTimeout) clearTimeout(jargonScanTimeout);

    jargonScanTimeout = setTimeout(() => {
      if (!currentSettings.jargonExplainer) return;

      // Check if new content was added
      let hasNewContent = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          hasNewContent = true;
          break;
        }
      }

      if (hasNewContent) {
        if (jargonObserver) jargonObserver.disconnect();
        const mainContent = findMainContent();
        scanJargonInRoot(mainContent || document.body);
        jargonObserver.observe(document.body, { childList: true, subtree: true });
      }
    }, 1000);
  });

  jargonObserver.observe(document.body, { childList: true, subtree: true });
}

function stopJargonObserver() {
  if (jargonObserver) {
    jargonObserver.disconnect();
    jargonObserver = null;
  }
  if (jargonScanTimeout) clearTimeout(jargonScanTimeout);
}

// Also add spin animation for loading state
if (!document.getElementById('neuro-jargon-spin-style')) {
  const spinStyle = document.createElement('style');
  spinStyle.id = 'neuro-jargon-spin-style';
  spinStyle.textContent = `
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(spinStyle);
}

// ========== 8.5 TONE DECODER ==========

const toneCache = new Map();
const tonePending = new Map();
let toneDecoderEnabled = false;
let toneHoverTimer = null;
let lastToneTarget = null;

function initToneDecoder() {
  if (toneDecoderEnabled) return;
  toneDecoderEnabled = true;
  document.addEventListener('mouseup', handleToneSelection);
  document.addEventListener('mouseover', handleToneHover, true);
}

function removeToneDecoder() {
  toneDecoderEnabled = false;
  if (toneHoverTimer) clearTimeout(toneHoverTimer);
  document.removeEventListener('mouseup', handleToneSelection);
  document.removeEventListener('mouseover', handleToneHover, true);
  removeToneTooltip();
}

function handleToneSelection() {
  if (!toneDecoderEnabled) return;
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return;
  const text = selection.toString().trim();
  if (text.length < 6) return;
  if (!selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) return;

  const context = getToneContextFromNode(range.commonAncestorContainer);
  showToneTooltip('Analyzing…', 'Checking tone', rect.left, rect.top);

  requestToneAnalysis(text, context).then(result => {
    updateToneTooltip(result.tone, result.explanation, rect.left, rect.top);
  });
}

function handleToneHover(event) {
  if (!toneDecoderEnabled) return;
  const target = event.target;
  if (!target || target.closest('#neuro-tone-tooltip')) return;
  if (isEditableTarget(target)) return;

  const block = findToneBlock(target);
  if (!block) return;
  if (block === lastToneTarget) return;
  lastToneTarget = block;

  if (toneHoverTimer) clearTimeout(toneHoverTimer);
  toneHoverTimer = setTimeout(() => {
    const text = getToneBlockText(block);
    if (!text) return;
    const rect = block.getBoundingClientRect();
    if (!rect) return;
    const context = text.slice(0, 220);

    showToneTooltip('Analyzing…', 'Checking tone', rect.left, rect.top);
    requestToneAnalysis(text, context).then(result => {
      updateToneTooltip(result.tone, result.explanation, rect.left, rect.top);
    });
  }, 650);
}

function isEditableTarget(element) {
  if (!element) return false;
  if (element.isContentEditable) return true;
  return /input|textarea|select/i.test(element.tagName || '');
}

function findToneBlock(element) {
  const block = element.closest('p, li, blockquote, article, section, div');
  if (!block) return null;
  const text = (block.innerText || '').trim();
  if (text.length < 30) return null;
  if (/nav|menu|footer|header|aside|comment|sidebar/i.test(block.className || '')) return null;
  return block;
}

function getToneBlockText(element) {
  const text = (element.innerText || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if (text.length < 30) return null;
  return text.length > 420 ? text.slice(0, 420) : text;
}

function getToneContextFromNode(node) {
  const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  if (!element) return '';
  const block = findToneBlock(element);
  return block ? (getToneBlockText(block) || '') : '';
}

function requestToneAnalysis(text, context = '') {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return Promise.resolve({ tone: 'literal', explanation: 'No text available.' });
  const cacheKey = clean.toLowerCase().slice(0, 240);
  if (toneCache.has(cacheKey)) return Promise.resolve(toneCache.get(cacheKey));
  if (tonePending.has(cacheKey)) return tonePending.get(cacheKey);

  const requestPromise = new Promise((resolve) => {
    safeSendMessage(
      { action: 'analyzeTone', text: clean.slice(0, 800), context: context.slice(0, 400) },
      (response, error) => {
        if (error || !response?.success) {
          resolve({ tone: 'literal', explanation: 'Unable to analyze tone right now.' });
          return;
        }
        resolve({
          tone: response.tone || 'literal',
          explanation: response.explanation || 'Neutral phrasing suggests a literal tone.'
        });
      }
    );
  }).then((result) => {
    toneCache.set(cacheKey, result);
    tonePending.delete(cacheKey);
    return result;
  });

  tonePending.set(cacheKey, requestPromise);
  return requestPromise;
}

function showToneTooltip(tone, explanation, x, y) {
  const existing = document.getElementById('neuro-tone-tooltip');
  if (existing) existing.remove();

  const tooltip = document.createElement('div');
  tooltip.id = 'neuro-tone-tooltip';
  tooltip.innerHTML = `<strong style="color:#a29bfe;">🗣️ Tone: ${tone}</strong><div style="margin-top:4px; color:#dfe6ff;">${explanation}</div>`;
  tooltip.style.cssText = `position:fixed; left:${x + 10}px; top:${Math.max(y - 12, 10)}px; z-index:1000001; background:rgba(24, 24, 36, 0.95); color:#eef; border-radius:10px; padding:10px 12px; max-width:260px; box-shadow:0 6px 18px rgba(0,0,0,0.25); border-left:3px solid #a29bfe; font-family:system-ui,sans-serif; font-size:12.5px; animation:fadeIn 0.2s ease;`;
  document.body.appendChild(tooltip);
  setTimeout(() => tooltip.remove(), 3800);
}

function updateToneTooltip(tone, explanation, x, y) {
  const tooltip = document.getElementById('neuro-tone-tooltip');
  if (!tooltip) {
    showToneTooltip(tone, explanation, x, y);
    return;
  }
  tooltip.innerHTML = `<strong style="color:#a29bfe;">🗣️ Tone: ${tone}</strong><div style="margin-top:4px; color:#dfe6ff;">${explanation}</div>`;
  tooltip.style.left = `${x + 10}px`;
  tooltip.style.top = `${Math.max(y - 12, 10)}px`;
}

function removeToneTooltip() {
  document.getElementById('neuro-tone-tooltip')?.remove();
}

// ========== 9. USER CORRECTION MODE ==========

let correctionMode = false;

function enableCorrectionMode() {
  correctionMode = true;
  showNotification('Click on any simplified text to edit it', 'loading');
  document.addEventListener('click', correctionClickListener);
  addCorrectionExitButton();
}

function correctionClickListener(e) {
  const target = e.target;
  if (target.hasAttribute('data-neuro-simplified')) {
    const original = target.getAttribute('data-neuro-original') || target.innerText;
    const current = target.innerText;

    const correction = prompt('Edit the simplified text (or keep as is):', current);
    if (correction && correction !== current) {
      target.innerText = correction;
      target.style.backgroundColor = 'rgba(0, 184, 148, 0.1)';
      target.style.borderLeftColor = '#00b894';

      const domain = window.location.hostname;
      // Safe message send
      safeSendMessage({
        action: 'submitCorrection',
        original: original,
        correction: correction,
        domain: domain
      });

      showNotification('✓ Correction saved! AI will learn from this.', 'success');
    }
  }
}

function addCorrectionExitButton() {
  const existing = document.getElementById('correction-exit');
  if (existing) existing.remove();

  const exitBtn = document.createElement('button');
  exitBtn.id = 'correction-exit';
  exitBtn.innerHTML = '✓ Exit Correction Mode';
  exitBtn.style.cssText = `
    position: fixed; bottom: 80px; right: 20px; z-index: 1000000;
    background: #00b894; color: white; border: none;
    padding: 8px 16px; border-radius: 20px; font-family: system-ui;
    font-size: 12px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  `;
  exitBtn.onclick = () => {
    correctionMode = false;
    document.removeEventListener('click', correctionClickListener);
    exitBtn.remove();
    showNotification('Correction mode disabled', 'success');
  };
  document.body.appendChild(exitBtn);
}

// ========== FOCUS INDICATORS ==========

function addFocusIndicators() {
  if (document.getElementById('neuro-focus-style')) return;
  const style = document.createElement('style');
  style.id = 'neuro-focus-style';
  style.textContent = `:focus-visible{outline:3px solid #6c5ce7!important;outline-offset:2px!important;background-color:rgba(108,92,231,0.1)!important;}`;
  document.head.appendChild(style);
}

addFocusIndicators();

window.addEventListener('load', () => {
  if (currentSettings.removeDistractions) {
    setTimeout(() => {
      analyzePageStructure();
    }, 400);
  }
});

// ========== ANIMATION STYLES ==========

if (!document.getElementById('neuro-animation-style')) {
  const animStyle = document.createElement('style');
  animStyle.id = 'neuro-animation-style';
  animStyle.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-5px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .neuro-simplified {
      transition: background-color 180ms ease, border-color 180ms ease, color 180ms ease, transform 180ms ease;
      will-change: background-color, border-color, color, transform;
    }
  `;
  document.head.appendChild(animStyle);
}

// ========== AI HELPER WIDGET ==========

function inferSettingsFromPrompt(prompt) {
  const text = prompt.toLowerCase();

  if (text.includes('reset') || text.includes('default')) {
    return {
      dyslexicFont: false,
      softColors: false,
      removeDistractions: false,
      readingRuler: false,
      removeAnimations: false,
      simplifyText: false,
      jargonExplainer: false
    };
  }

  const rules = {
    dyslexicFont: {
      on: ['dyslexia', 'dyslexic', 'readable font', 'font'],
      off: ['disable dyslexia', 'disable dyslexic', 'disable font', 'turn off font']
    },
    softColors: {
      on: ['soft colors', 'reduce glare', 'bright', 'sensory', 'calm colors'],
      off: ['disable soft colors', 'turn off colors']
    },
    removeDistractions: {
      on: ['distraction', 'ads', 'popups', 'remove distractions', 'focus mode'],
      off: ['disable distractions', 'turn off distractions']
    },
    readingRuler: {
      on: ['reading ruler', 'line focus', 'focus line'],
      off: ['disable ruler', 'turn off ruler']
    },
    removeAnimations: {
      on: ['animation', 'motion', 'stop gifs', 'reduce motion'],
      off: ['allow animations', 'turn on animations']
    },
    simplifyText: {
      on: ['simplify', 'simple', 'easy to read', 'summarize'],
      off: ['disable simplify', 'turn off simplify']
    },
    jargonExplainer: {
      on: ['jargon', 'definitions', 'explain terms'],
      off: ['disable jargon', 'turn off jargon']
    }
  };

  const updates = {};
  Object.entries(rules).forEach(([key, rule]) => {
    if (rule.off.some(term => text.includes(term))) {
      updates[key] = false;
      return;
    }
    if (rule.on.some(term => text.includes(term))) {
      updates[key] = true;
    }
  });

  return updates;
}

function applySettingsFromPrompt(prompt) {
  return new Promise((resolve) => {
    safeSendMessage({ action: 'aiHelperInterpret', prompt }, (response, error) => {
      if (error || !response?.success || !response?.updates) {
        const fallback = inferSettingsFromPrompt(prompt);
        if (!fallback || Object.keys(fallback).length === 0) {
          resolve({
            success: false,
            message: response?.error || 'Could not understand your request.'
          });
          return;
        }

        currentSettings = { ...currentSettings, ...fallback };
        chrome.storage.local.set(fallback, () => {
          applyAllModifications();
          resolve({
            success: true,
            message: 'Applied changes using fallback rules.'
          });
        });
        return;
      }

      const updates = response.updates;
      currentSettings = { ...currentSettings, ...updates };

      chrome.storage.local.set(updates, () => {
        applyAllModifications();
        resolve({
          success: true,
          message: response.message || 'Applied AI-suggested changes.'
        });
      });
    });
  });
}

function createAIAssistant() {
  if (document.getElementById('neuro-ai-widget')) return;

  const style = document.createElement('style');
  style.textContent = `
    #neuro-ai-widget { position: fixed; bottom: 24px; right: 24px; z-index: 1000002; font-family: system-ui, sans-serif; }
    #neuro-ai-button { width: 52px; height: 52px; border-radius: 26px; border: none; background: #6c5ce7; color: #fff; font-size: 20px; cursor: pointer; box-shadow: 0 6px 18px rgba(0,0,0,0.3); }
    #neuro-ai-panel { position: fixed; bottom: 90px; right: 24px; width: 320px; background: #1a1a2e; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 16px; color: #eee; box-shadow: 0 10px 30px rgba(0,0,0,0.35); display: none; }
    #neuro-ai-panel header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    #neuro-ai-panel header h4 { margin: 0; font-size: 14px; color: #fff; }
    #neuro-ai-close { background: transparent; border: none; color: #aaa; cursor: pointer; font-size: 16px; }
    #neuro-ai-input { width: 100%; min-height: 80px; border-radius: 10px; border: 1px solid #2d2d44; background: #0f0f1a; color: #eee; padding: 10px; font-size: 13px; resize: vertical; }
    #neuro-ai-actions { display: flex; gap: 8px; margin-top: 10px; }
    #neuro-ai-actions button { flex: 1; border: none; border-radius: 10px; padding: 8px; cursor: pointer; font-size: 12px; }
    #neuro-ai-apply { background: #6c5ce7; color: #fff; }
    #neuro-ai-speak { background: #2d2d44; color: #eee; }
    #neuro-ai-clear { background: #2d2d44; color: #eee; }
    #neuro-ai-status { margin-top: 8px; font-size: 11px; color: #c8c8d8; }
  `;
  document.head.appendChild(style);

  const widget = document.createElement('div');
  widget.id = 'neuro-ai-widget';
  widget.innerHTML = `
    <button id="neuro-ai-button">🤖</button>
    <div id="neuro-ai-panel">
      <header>
        <h4>AI Helper</h4>
        <button id="neuro-ai-close">✕</button>
      </header>
      <textarea id="neuro-ai-input" placeholder="Describe your issue (e.g., remove distractions, simplify text, calmer colors)"></textarea>
      <div id="neuro-ai-actions">
        <button id="neuro-ai-speak">🎙️ Speak</button>
        <button id="neuro-ai-clear">Clear</button>
        <button id="neuro-ai-apply">Apply</button>
      </div>
      <div id="neuro-ai-status"></div>
    </div>
  `;

  document.body.appendChild(widget);

  const button = document.getElementById('neuro-ai-button');
  const panel = document.getElementById('neuro-ai-panel');
  const closeBtn = document.getElementById('neuro-ai-close');
  const input = document.getElementById('neuro-ai-input');
  const speakBtn = document.getElementById('neuro-ai-speak');
  const clearBtn = document.getElementById('neuro-ai-clear');
  const applyBtn = document.getElementById('neuro-ai-apply');
  const status = document.getElementById('neuro-ai-status');

  let recognition = null;
  let isListening = false;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onresult = (event) => {
      let combined = '';
      for (let i = 0; i < event.results.length; i++) {
        combined += event.results[i][0].transcript + ' ';
      }
      if (input) input.value = combined.trim();
    };
    recognition.onend = () => {
      if (isListening) {
        try { recognition.start(); } catch (e) { /* ignore */ }
      }
    };
  } else if (status) {
    status.textContent = 'Speech input not supported in this browser.';
  }

  button.onclick = () => {
    panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
  };
  closeBtn.onclick = () => { panel.style.display = 'none'; };
  clearBtn.onclick = () => {
    if (input) input.value = '';
    if (status) status.textContent = '';
  };

  speakBtn.onclick = () => {
    if (!recognition) return;
    if (!isListening) {
      isListening = true;
      speakBtn.textContent = '⏹️ Stop';
      if (status) status.textContent = 'Listening...';
      try { recognition.start(); } catch (e) { /* ignore */ }
    } else {
      isListening = false;
      speakBtn.textContent = '🎙️ Speak';
      if (status) status.textContent = 'Stopped listening.';
      try { recognition.stop(); } catch (e) { /* ignore */ }
    }
  };

  applyBtn.onclick = async () => {
    const prompt = input.value.trim();
    if (!prompt) {
      status.textContent = 'Please describe what you want changed.';
      return;
    }

    status.textContent = 'Thinking...';

    try {
      const result = await applySettingsFromPrompt(prompt);
      status.textContent = result.message || (result.success ? 'Done.' : 'Could not apply changes.');
    } catch (e) {
      status.textContent = e.message || 'Something went wrong.';
    }
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createAIAssistant);
} else {
  createAIAssistant();
}

// ===== REMOVE EMOJIS =====
let emojiObserver = null;

function removeEmojis() {
  const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  textNodes.forEach(node => {
    if (node.textContent && emojiRegex.test(node.textContent)) {
      node.textContent = node.textContent.replace(emojiRegex, '');
    }
  });
}

function startEmojiObserver() {
  if (emojiObserver) emojiObserver.disconnect();
  emojiObserver = new MutationObserver(() => removeEmojis());
  emojiObserver.observe(document.body, { childList: true, subtree: true });
}

function stopEmojiObserver() {
  if (emojiObserver) {
    emojiObserver.disconnect();
    emojiObserver = null;
  }
}

// ===== COLLAPSE SIDEBARS & EXTRACT CONTENT =====
function collapseSidebars() {
  const sidebarSelectors = [
    'aside', '.sidebar', '[class*="sidebar"]', '[id*="sidebar"]',
    '.right-rail', '.left-rail', '.side-panel', '[class*="side-bar"]',
    '.menu-sidebar', '.navigation-sidebar', '.widget-area'
  ];

  const mainContent = findMainContent();
  if (!mainContent || mainContent === document.body) return;

  let peripheralContainer = document.getElementById('neuro-peripheral-container');
  if (!peripheralContainer) {
    peripheralContainer = document.createElement('div');
    peripheralContainer.id = 'neuro-peripheral-container';
    peripheralContainer.style.cssText = `
      margin-top: 40px;
      padding: 20px;
      border-top: 2px dashed #6c5ce7;
      background: rgba(108, 92, 231, 0.05);
      border-radius: 8px;
    `;
    peripheralContainer.innerHTML = '<h3 style="color:#6c5ce7; margin-top:0;">📌 Extracted Peripheral Content</h3>';
    mainContent.appendChild(peripheralContainer);
  }

  sidebarSelectors.forEach(selector => {
    try {
      document.querySelectorAll(selector).forEach(el => {
        // Skip if this is actually the main content itself or it contains the main content!
        if (el === mainContent || el.contains(mainContent) || mainContent.contains(el)) return;

        if (!el.hasAttribute('data-sidebar-extracted')) {
          el.setAttribute('data-sidebar-extracted', 'true');

          // Identify useful content inside sidebar (links, paragraphs, headings)
          const clone = el.cloneNode(true);
          // Strip out absolute positioning or fixed layout on the clone
          clone.style.position = 'static';
          clone.style.width = '100%';
          clone.style.display = 'block';

          peripheralContainer.appendChild(clone);

          // Completely hide the original sidebar safely
          el.style.setProperty('display', 'none', 'important');
          el.style.setProperty('width', '0', 'important');
        }
      });
    } catch (e) { }
  });
}

// ===== FOCUS CIRCLE =====
let focusCircleElement = null;
let currentFocusColor = null;

function createFocusCircle(color) {
  if (focusCircleElement) focusCircleElement.remove();

  focusCircleElement = document.createElement('div');
  focusCircleElement.id = 'neuro-focus-circle';
  focusCircleElement.style.cssText = `
    position: fixed;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 3px solid ${color};
    background: rgba(${hexToRgb(color)}, 0.1);
    pointer-events: none;
    z-index: 999999;
    transition: all 0.05s ease;
    box-shadow: 0 0 10px ${color};
    left: -20px;
    top: -20px;
  `;
  document.body.appendChild(focusCircleElement);

  document.addEventListener('mousemove', (e) => {
    if (focusCircleElement) {
      focusCircleElement.style.left = (e.clientX - 20) + 'px';
      focusCircleElement.style.top = (e.clientY - 20) + 'px';
    }
  });
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '108, 92, 231';
}

function removeFocusCircle() {
  if (focusCircleElement) {
    focusCircleElement.remove();
    focusCircleElement = null;
  }
}

// ===== BACKGROUND PATTERN =====
let patternStyle = null;

function applyBackgroundPattern(pattern) {
  if (patternStyle) patternStyle.remove();

  if (pattern === 'none') return;

  patternStyle = document.createElement('style');
  patternStyle.id = 'neuro-bg-pattern';

  const patterns = {
    dots: `radial-gradient(circle at 2px 2px, rgba(108,92,231,0.1) 1px, transparent 1px)`,
    lines: `repeating-linear-gradient(45deg, rgba(108,92,231,0.05) 0px, rgba(108,92,231,0.05) 2px, transparent 2px, transparent 8px)`,
    grid: `repeating-linear-gradient(0deg, rgba(108,92,231,0.08) 0px, rgba(108,92,231,0.08) 1px, transparent 1px, transparent 20px), repeating-linear-gradient(90deg, rgba(108,92,231,0.08) 0px, rgba(108,92,231,0.08) 1px, transparent 1px, transparent 20px)`
  };

  if (patterns[pattern]) {
    patternStyle.textContent = `body { background-image: ${patterns[pattern]}; background-size: 20px 20px; }`;
    document.head.appendChild(patternStyle);
  }
}

// ===== CUSTOM BACKGROUND COLOR =====
let bgColorStyle = null;

function applyCustomBackgroundColor(color) {
  if (bgColorStyle) bgColorStyle.remove();

  bgColorStyle = document.createElement('style');
  bgColorStyle.id = 'neuro-bg-color';
  bgColorStyle.textContent = `body, .main-content, article, main { background-color: ${color} !important; }`;
  document.head.appendChild(bgColorStyle);
}

// ===== ZOOM LEVEL =====
function applyZoomLevel(zoom) {
  document.body.style.zoom = `${zoom}%`;
}

// ===== MESSAGE HANDLERS FOR NEW FEATURES =====
// Add these to your existing chrome.runtime.onMessage.addListener

// Inside the message listener, add:
if (request.action === 'updateFocusCircle') {
  if (request.color === 'off') {
    removeFocusCircle();
  } else {
    createFocusCircle(request.color);
  }
  sendResponse({ success: true });
}

if (request.action === 'updateBackgroundColor') {
  applyCustomBackgroundColor(request.color);
  sendResponse({ success: true });
}

if (request.action === 'updateBackgroundPattern') {
  applyBackgroundPattern(request.pattern);
  sendResponse({ success: true });
}

// Add to applyAllModifications():
if (currentSettings.removeEmojis) {
  removeEmojis();
  startEmojiObserver();
} else {
  stopEmojiObserver();
}

if (currentSettings.collapseSidebars) {
  collapseSidebars();
}

if (currentSettings.focusCircleColor && currentSettings.focusCircleColor !== 'off') {
  createFocusCircle(currentSettings.focusCircleColor);
} else {
  removeFocusCircle();
}

if (currentSettings.customBgColor) {
  applyCustomBackgroundColor(currentSettings.customBgColor);
}

if (currentSettings.bgPattern && currentSettings.bgPattern !== 'none') {
  applyBackgroundPattern(currentSettings.bgPattern);
}

if (currentSettings.zoomLevel) {
  applyZoomLevel(currentSettings.zoomLevel);
}

// ========== CLEANUP ==========
window.addEventListener('beforeunload', () => {
  if (observer) observer.disconnect();
  if (animationObserver) animationObserver.disconnect();
});

// ========== 11. BIONIC READING (ADHD/Dyslexia Focus) ==========

const bionicWordCache = new Map();

function applyBionicReading() {
  if (document.getElementById('bionic-reading-style')) return;
  const style = document.createElement('style');
  style.id = 'bionic-reading-style';
  style.textContent = `
    .bionic-bold {
      font-weight: 700 !important;
      opacity: 1 !important;
    }
    .bionic-rest {
      opacity: 0.8 !important;
      font-weight: 400 !important;
    }
  `;
  document.head.appendChild(style);

  const textNodes = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  let node;
  const skipTags = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'NOSCRIPT', 'TEXTAREA']);
  while ((node = walk.nextNode())) {
    if (!skipTags.has(node.parentNode.tagName) && node.nodeValue.trim().length > 0) {
      textNodes.push(node);
    }
  }

  textNodes.forEach(textNode => {
    if (textNode.parentNode && textNode.parentNode.hasAttribute('data-bionic')) return;
    const words = textNode.nodeValue.split(/(\s+)/);
    const fragment = document.createDocumentFragment();
    let changed = false;

    words.forEach(word => {
      // Small words or non-letters skip transformation
      if (!/^[A-Za-z]+$/.test(word) || word.length < 2) {
        fragment.appendChild(document.createTextNode(word));
        return;
      }

      changed = true;
      const lowerWord = word.toLowerCase();

      // DS/Algo Polish: O(1) Hash Map Memoization for DOM creation
      if (bionicWordCache.has(lowerWord)) {
        const cachedNode = bionicWordCache.get(lowerWord).cloneNode(true);
        // Retain original word casing dynamically
        const bLen = cachedNode.childNodes[0].textContent.length;
        cachedNode.childNodes[0].textContent = word.substring(0, bLen);
        cachedNode.childNodes[1].textContent = word.substring(bLen);
        fragment.appendChild(cachedNode);
        return;
      }

      // First-time mathematical breakdown & DOM building
      const bLetterCount = Math.ceil(word.length / 2);
      const boldPart = word.substring(0, bLetterCount);
      const restPart = word.substring(bLetterCount);

      const span = document.createElement('span');
      span.setAttribute('data-bionic', 'true');

      const bSpan = document.createElement('span');
      bSpan.className = 'bionic-bold';
      bSpan.textContent = boldPart;

      const rSpan = document.createElement('span');
      rSpan.className = 'bionic-rest';
      rSpan.textContent = restPart;

      span.appendChild(bSpan);
      span.appendChild(rSpan);

      // Index reference pure lowered text struct into Memory Map
      bionicWordCache.set(lowerWord, span.cloneNode(true));

      fragment.appendChild(span);
    });

    if (changed) {
      textNode.parentNode.replaceChild(fragment, textNode);
    }
  });
}

function removeBionicReading() {
  const style = document.getElementById('bionic-reading-style');
  if (style) style.remove();
  document.querySelectorAll('[data-bionic="true"]').forEach(el => {
    if (el.parentNode) {
      el.parentNode.replaceChild(document.createTextNode(el.textContent), el);
    }
  });
}

// ========== 12. SENSORY AUTO-BLOCKER (Autism overload prevention) ==========

function applySensoryAutoBlocker() {
  document.querySelectorAll('video, audio').forEach(media => {
    if (!media.hasAttribute('controls')) {
      media.setAttribute('controls', 'true');
    }
    if (media.autoplay || !media.paused) {
      media.pause();
      media.autoplay = false;
      const overlay = document.createElement('div');
      overlay.className = 'sensory-blocker-overlay';
      overlay.textContent = 'Autoplay Blocked (Click to Play)';
      overlay.style.cssText = 'position: absolute; top:0; left:0; width:100%; height:100%; display:flex; align-items:center; justify-content:center; background: rgba(0,0,0,0.6); color: white; cursor: pointer; z-index: 1000; font-family: sans-serif;';
      if (media.parentNode && window.getComputedStyle(media.parentNode).position === 'static') {
        media.parentNode.style.position = 'relative';
      }
      media.parentNode?.insertBefore(overlay, media);
      overlay.addEventListener('click', () => {
        media.play();
        overlay.remove();
      });
    }
  });
}

function removeSensoryAutoBlocker() {
  document.querySelectorAll('.sensory-blocker-overlay').forEach(el => el.remove());
}

// ========== 13. CINEMA FOCUS (Structured Foreground layout) ==========

function applyCinemaFocus() {
  const mainContent = findMainContent();
  if (!mainContent || mainContent === document.body) return; // Fallback if no specific content

  // Build the overlay
  let overlay = document.getElementById('cinema-focus-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'cinema-focus-overlay';
    // Deep dark backdrop to blur/hide peripheral content
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(10, 10, 15, 0.85);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      z-index: 2147483000;
      pointer-events: auto; /* absorbs random clicks */
      transition: all 0.3s ease;
    `;
    document.body.appendChild(overlay);

    // Allow clicking the overlay to temporarily dismiss
    overlay.addEventListener('click', () => {
      removeCinemaFocus();
    });
  }

  // Elevate the main content
  mainContent.setAttribute('data-original-zindex', window.getComputedStyle(mainContent).zIndex);
  mainContent.setAttribute('data-original-position', window.getComputedStyle(mainContent).position);
  mainContent.setAttribute('data-original-bg', window.getComputedStyle(mainContent).backgroundColor);

  mainContent.classList.add('cinema-focus-active');
  const contentBg = (currentSettings.themeMode === 'dark') ? '#1A1A2E' : '#F5EEDC';

  mainContent.style.setProperty('position', 'relative', 'important');
  mainContent.style.setProperty('z-index', '2147483001', 'important'); // Just above the overlay
  mainContent.style.setProperty('background-color', contentBg, 'important');
  mainContent.style.setProperty('box-shadow', '0 0 40px rgba(0,0,0,0.5)', 'important');
  mainContent.style.setProperty('border-radius', '12px', 'important');
  mainContent.style.setProperty('padding', '20px', 'important');
}

function removeCinemaFocus() {
  const overlay = document.getElementById('cinema-focus-overlay');
  if (overlay) overlay.remove();

  const mainContent = document.querySelector('.cinema-focus-active');
  if (mainContent) {
    mainContent.classList.remove('cinema-focus-active');
    mainContent.style.position = mainContent.getAttribute('data-original-position') || '';
    mainContent.style.zIndex = mainContent.getAttribute('data-original-zindex') || '';
    mainContent.style.backgroundColor = mainContent.getAttribute('data-original-bg') || '';
    mainContent.style.boxShadow = '';
    mainContent.style.borderRadius = '';
    mainContent.style.padding = '';
  }
}