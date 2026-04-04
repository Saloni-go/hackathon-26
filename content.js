// content.js - Complete Neuro-Inclusive Web Extension with Safe Messaging
console.log('Neuro-Inclusive content script loaded v2.0');

let currentSettings = {
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

let readingRulerElement = null;
let observer = null;
let animationObserver = null;
let cognitiveScoreDisplay = null;

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

// ========== INITIALIZATION ==========

chrome.storage.local.get(
  ['dyslexicFont', 'softColors', 'removeDistractions', 'readingRuler', 'removeAnimations', 'simplifyText', 'jargonExplainer', 'cognitiveScoring', 'analyticsEnabled'],
  (result) => {
    currentSettings.dyslexicFont = result.dyslexicFont || false;
    currentSettings.softColors = result.softColors || false;
    currentSettings.removeDistractions = result.removeDistractions || false;
    currentSettings.readingRuler = result.readingRuler || false;
    currentSettings.removeAnimations = result.removeAnimations || false;
    currentSettings.simplifyText = result.simplifyText || false;
    currentSettings.jargonExplainer = result.jargonExplainer || false;
    currentSettings.cognitiveScoring = result.cognitiveScoring !== false;
    currentSettings.analyticsEnabled = result.analyticsEnabled !== false;
    
    applyAllModifications();
    
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
        currentSettings = { ...currentSettings, ...request.settings };
        applyAllModifications();
        sendResponse({ success: true });
      }
      
      if (request.action === 'simplifyPageWithAI') {
        simplifyPageWithAI();
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
  if (currentSettings.dyslexicFont) applyDyslexiaFont();
  else removeDyslexiaFont();
  
  if (currentSettings.softColors) applySoftColors();
  else removeSoftColors();
  
  if (currentSettings.removeDistractions) {
    removeDistractions();
    startDistractionObserver();
  } else stopDistractionObserver();
  
  if (currentSettings.readingRuler) createReadingRuler();
  else removeReadingRuler();
  
  if (currentSettings.removeAnimations) {
    removeAnimations();
    startAnimationObserver();
  } else stopAnimationObserver();
  
  if (currentSettings.jargonExplainer) initJargonExplainer();
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
  let style = document.getElementById('neuro-colors-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'neuro-colors-style';
    document.head.appendChild(style);
  }
  style.textContent = `
    body, .main-content, article, main { background-color: #fdf6e3 !important; color: #2c3e50 !important; }
    a { color: #6c5ce7 !important; text-decoration: underline !important; }
    a:hover { color: #5b4bc4 !important; }
    button, .button, input, textarea { background-color: #eee8d5 !important; border-color: #93a1a1 !important; color: #2c3e50 !important; }
    p, li, span:not(.special) { color: #3a4a5a !important; }
    div, section, article { background-color: transparent !important; }
  `;
}

function removeSoftColors() {
  document.getElementById('neuro-colors-style')?.remove();
}

// ========== 3. REMOVE DISTRACTIONS ==========

const distractionSelectors = [
  '[class*="ad"]', '[id*="ad"]', '[class*="advertisement"]', '.ad-wrapper', '.adsbygoogle',
  '[class*="popup"]', '[id*="popup"]', '[class*="modal"]', '[class*="overlay"]', '.newsletter', '.cookie-notice',
  'aside', '.sidebar', '[class*="sidebar"]', '.right-rail', '.left-rail',
  '[class*="related"]', '[class*="recommend"]', '.more-articles', '.you-might-like',
  '.social-share', '.share-buttons', '.comments-section', '#comments',
  '.sticky', '.fixed-header', '.fixed-footer', '[class*="chat"]', '[class*="intercom"]'
];

function removeDistractions() {
  distractionSelectors.forEach(selector => {
    try {
      document.querySelectorAll(selector).forEach(el => {
        if (!isMainContent(el)) {
          el.style.display = 'none';
          el.setAttribute('data-neuro-hidden', 'true');
        }
      });
    } catch(e) {}
  });
  hideHighDistractionElements();
}

function isMainContent(element) {
  const mainSelectors = ['main', 'article', '.main-content', '#main-content', '.post-content', '#content'];
  for (const selector of mainSelectors) {
    const mainElement = document.querySelector(selector);
    if (mainElement && (mainElement === element || mainElement.contains(element))) return true;
  }
  return false;
}

function hideHighDistractionElements() {
  document.querySelectorAll('div, section, aside').forEach(el => {
    if (el.hasAttribute('data-neuro-hidden') || isMainContent(el)) return;
    const style = window.getComputedStyle(el);
    const zIndex = parseInt(style.zIndex);
    if (zIndex > 1000 && (style.position === 'fixed' || style.position === 'absolute')) {
      el.style.display = 'none';
      el.setAttribute('data-neuro-hidden', 'true');
    }
  });
}

function startDistractionObserver() {
  if (observer) observer.disconnect();
  observer = new MutationObserver(() => setTimeout(() => removeDistractions(), 100));
  observer.observe(document.body, { childList: true, subtree: true });
}

function stopDistractionObserver() {
  if (observer) { observer.disconnect(); observer = null; }
  document.querySelectorAll('[data-neuro-hidden]').forEach(el => {
    el.style.display = '';
    el.removeAttribute('data-neuro-hidden');
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
    } catch(e) {}
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
  animationObserver = new MutationObserver(() => {
    document.querySelectorAll('video, audio').forEach(media => {
      if (!media.hasAttribute('data-neuro-paused')) { media.pause(); media.setAttribute('data-neuro-paused', 'true'); }
    });
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
  } catch(e) {
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
      <div style="margin-bottom:15px;"><span style="font-size:36px; font-weight:bold;">${score.score}</span><span style="color:#888;">/100</span> - <span style="color:${score.score<40?'#00b894':(score.score<70?'#fdcb6e':'#e74c3c')}">${score.level} Load</span></div>
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
    showNotification('Could not find content on this page', 'error'); 
    return; 
  }
  
  const textElements = mainContent.querySelectorAll('p, li');
  if (textElements.length === 0) { 
    showNotification('No text found to simplify', 'error'); 
    return; 
  }
  
  const textToSimplify = [];
  for (const el of textElements) {
    if (el.innerText.trim().length > 80) textToSimplify.push({ element: el, text: el.innerText });
  }
  
  let combinedText = textToSimplify.map(t => t.text).join(' ');
  if (combinedText.length > 2500) combinedText = combinedText.substring(0, 2500);
  
  showNotification('AI is simplifying this page...', 'loading');
  
  // Safe message send
  safeSendMessage({ action: 'simplifyText', text: combinedText }, (response, error) => {
    if (error) {
      showNotification('AI service unavailable. Using basic simplification.', 'error');
      applyBasicSimplification(textToSimplify);
    } else if (response?.success) {
      const chunks = response.simplifiedText.split(/(?<=[.!?])\s+/);
      let chunkIndex = 0;
      for (let i = 0; i < textToSimplify.length && chunkIndex < chunks.length; i++) {
        if (chunks[chunkIndex]?.trim()) {
          textToSimplify[i].element.innerText = chunks[chunkIndex].trim();
          textToSimplify[i].element.style.backgroundColor = 'rgba(108,92,231,0.05)';
          textToSimplify[i].element.style.borderLeft = '3px solid #6c5ce7';
          textToSimplify[i].element.style.paddingLeft = '12px';
          textToSimplify[i].element.setAttribute('data-neuro-simplified', 'true');
          textToSimplify[i].element.setAttribute('data-neuro-original', textToSimplify[i].text.substring(0, 500));
        }
        chunkIndex++;
      }
      showNotification('✓ Page simplified!', 'success');
    } else {
      showNotification('Using basic simplification', 'error');
      applyBasicSimplification(textToSimplify);
    }
  });
}

function applyBasicSimplification(textToSimplify) {
  const replacements = { 'utilize':'use', 'implement':'use', 'additional':'more', 'purchase':'buy', 'numerous':'many', 'facilitate':'help', 'terminate':'end', 'demonstrate':'show', 'consequently':'so', 'nevertheless':'but', 'furthermore':'also', 'approximately':'about', 'significant':'big', 'substantial':'large' };
  for (const item of textToSimplify) {
    let text = item.text;
    for (const [complex, simple] of Object.entries(replacements)) {
      text = text.replace(new RegExp(`\\b${complex}\\b`, 'gi'), simple);
    }
    item.element.innerText = text;
    item.element.style.backgroundColor = 'rgba(108,92,231,0.05)';
    item.element.style.borderLeft = '3px solid #6c5ce7';
    item.element.style.paddingLeft = '12px';
    item.element.setAttribute('data-neuro-simplified', 'true');
  }
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

const jargonDictionary = {
  'algorithm': 'A step-by-step recipe to solve a problem',
  'api': 'A way for programs to talk to each other',
  'cache': 'Temporary storage for quick access',
  'database': 'Organized collection of information',
  'encryption': 'Scrambling data so only authorized people can read it',
  'latency': 'Delay before data transfer begins',
  'server': 'A computer that provides services to other computers',
  'syntax': 'Rules for writing code correctly',
  'leverage': 'Use something to maximum advantage',
  'synergy': 'Working together for better results',
  'paradigm': 'A typical example or pattern',
  'revenue': 'Money coming in',
  'diagnosis': 'Identifying a disease from symptoms',
  'chronic': 'Long-lasting or recurring',
  'acute': 'Sudden and severe but short',
  'jurisdiction': 'Official power to make legal decisions',
  'plaintiff': 'Person who brings a lawsuit',
  'defendant': 'Person being sued',
  'quantitative': 'Related to numbers',
  'qualitative': 'Related to qualities',
  'hypothesis': 'An educated guess to test',
  'empirical': 'Based on observation, not theory'
};

function isJargonWord(word) {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (clean.length < 5) return false;
  if (jargonDictionary[clean]) return true;
  const common = ['the','and','for','are','but','not','you','with','have','this','that','from','they','will','would','could','should','about','there','their','which'];
  return clean.length > 8 && !common.includes(clean);
}

function getDefinition(word) {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  return jargonDictionary[clean] || `Complex term meaning "${clean}"`;
}

function initJargonExplainer() {
  setTimeout(() => {
    const mainContent = findMainContent();
    if (!mainContent) return;
    
    const walker = document.createTreeWalker(mainContent, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (node.parentElement?.classList?.contains('neuro-jargon-word')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    
    textNodes.forEach(node => {
      const words = node.textContent.split(/(\s+)/);
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        if (word?.trim() && isJargonWord(word.trim())) {
          const cleanWord = word.trim().replace(/[^a-z]/gi, '');
          const definition = getDefinition(cleanWord);
          const span = document.createElement('span');
          span.className = 'neuro-jargon-word';
          span.textContent = word;
          span.style.borderBottom = '2px dotted #6c5ce7';
          span.style.cursor = 'help';
          span.addEventListener('mouseenter', (e) => {
            const rect = span.getBoundingClientRect();
            showJargonTooltip(cleanWord, definition, rect.left, rect.top);
            // Safe message send
            safeSendMessage({ action: 'trackJargonHover' });
          });
          words[i] = span;
        }
      }
      const fragment = document.createDocumentFragment();
      words.forEach(item => fragment.appendChild(typeof item === 'string' ? document.createTextNode(item) : item));
      node.parentNode.replaceChild(fragment, node);
    });
  }, 1000);
}

function showJargonTooltip(word, definition, x, y) {
  const existing = document.getElementById('neuro-jargon-tooltip');
  if (existing) existing.remove();
  
  const tooltip = document.createElement('div');
  tooltip.id = 'neuro-jargon-tooltip';
  tooltip.innerHTML = `<strong style="color:#6c5ce7;">📖 ${word}</strong><br>${definition}`;
  tooltip.style.cssText = `position:fixed; left:${x+10}px; top:${y-10}px; z-index:1000001; background:#1a1a2e; color:#eee; border-radius:12px; padding:12px 16px; max-width:280px; box-shadow:0 8px 24px rgba(0,0,0,0.3); border-left:4px solid #6c5ce7; font-family:system-ui,sans-serif; font-size:13px; animation:fadeIn 0.2s ease;`;
  document.body.appendChild(tooltip);
  setTimeout(() => tooltip.remove(), 4000);
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
  `;
  document.head.appendChild(animStyle);
}

// ========== CLEANUP ==========
window.addEventListener('beforeunload', () => {
  if (observer) observer.disconnect();
  if (animationObserver) animationObserver.disconnect();
});