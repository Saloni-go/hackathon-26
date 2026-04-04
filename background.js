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
const ANALYTICS_KEY = 'neuro_analytics';

// ========== SETTINGS MANAGEMENT ==========

chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed/updated:', details.reason);
  
  const defaultSettings = {
    dyslexicFont: false,
    softColors: false,
    removeDistractions: false,
    readingRuler: false,
    removeAnimations: false,
    simplifyText: false,
    jargonExplainer: false,
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
          jargonExplainer: 0
        },
        lastReset: Date.now()
      };
      chrome.storage.local.set({ [ANALYTICS_KEY]: initialAnalytics });
    }
  });
}

// ========== AI TEXT SIMPLIFICATION ==========

const HF_API_TOKEN = '';
const HF_API_URL = 'https://api-inference.huggingface.co/models/facebook/bart-large-cnn';

async function simplifyTextWithAI(text, retryCount = 0) {
  const textHash = simpleHash(text);
  
  if (aiCache.has(textHash)) {
    console.log('AI: Cache hit');
    return aiCache.get(textHash);
  }
  
  if (!HF_API_TOKEN) {
    const mockResult = mockSimplify(text);
    cacheResult(textHash, mockResult);
    return mockResult;
  }
  
  try {
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
    const simplified = data[0]?.summary_text || text;
    cacheResult(textHash, simplified);
    
    trackPageSimplification();
    
    return simplified;
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
  
  if (request.action === 'trackJargonHover') {
    trackJargonHover();
    sendResponse({ success: true });
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
  
  sendResponse({ success: true });
});