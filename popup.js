// popup.js - Complete Working Version (No Blank Page)
console.log('Popup script loaded');

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM ready - looking for elements');
  
  // Get all elements
  const onboardingPanel = document.getElementById('onboardingPanel');
  const mainPanel = document.getElementById('mainPanel');
  const startBtn = document.getElementById('startBtn');
  const skipBtn = document.getElementById('skipBtn');
  const saveBtn = document.getElementById('saveBtn');
  const resetBtn = document.getElementById('resetBtn');
  const backBtn = document.getElementById('backBtn');
  const onboardStatus = document.getElementById('onboardStatus');
  const mainStatus = document.getElementById('mainStatus');
  
  // Sliders
  const adhdSlider = document.getElementById('adhdSlider');
  const dyslexiaSlider = document.getElementById('dyslexiaSlider');
  const autismSlider = document.getElementById('autismSlider');
  const adhdValue = document.getElementById('adhdValue');
  const dyslexiaValue = document.getElementById('dyslexiaValue');
  const autismValue = document.getElementById('autismValue');
  
  // Checkboxes
  const dyslexicFontChk = document.getElementById('dyslexicFont');
  const softColorsChk = document.getElementById('softColors');
  const removeDistractionsChk = document.getElementById('removeDistractions');
  const readingRulerChk = document.getElementById('readingRuler');
  const removeAnimationsChk = document.getElementById('removeAnimations');
  const simplifyTextChk = document.getElementById('simplifyText');
  const jargonExplainerChk = document.getElementById('jargonExplainer');
  
  console.log('Elements found:', {
    startBtn: !!startBtn,
    skipBtn: !!skipBtn,
    saveBtn: !!saveBtn
  });
  
  function showStatus(msg, isMain = false) {
    const statusElement = isMain ? mainStatus : onboardStatus;
    if (statusElement) {
      statusElement.textContent = msg;
      setTimeout(() => { if (statusElement) statusElement.textContent = ''; }, 3000);
    }
    console.log('Status:', msg);
  }
  
  // Update slider displays
  if (adhdSlider && adhdValue) {
    adhdSlider.addEventListener('input', () => { adhdValue.textContent = adhdSlider.value; });
  }
  if (dyslexiaSlider && dyslexiaValue) {
    dyslexiaSlider.addEventListener('input', () => { dyslexiaValue.textContent = dyslexiaSlider.value; });
  }
  if (autismSlider && autismValue) {
    autismSlider.addEventListener('input', () => { autismValue.textContent = autismSlider.value; });
  }
  
  // Calculate settings from profile
  function calculateSettingsFromProfile(profile) {
    const adhd = parseInt(profile.adhd);
    const dyslexia = parseInt(profile.dyslexia);
    const autism = parseInt(profile.autism);
    
    return {
      dyslexicFont: dyslexia > 30,
      softColors: autism > 40 || adhd > 50,
      removeDistractions: adhd > 40 || autism > 30,
      readingRuler: adhd > 60,
      removeAnimations: autism > 50 || adhd > 40,
      simplifyText: adhd > 50 || dyslexia > 60,
      jargonExplainer: dyslexia > 40 || adhd > 30
    };
  }
  
  // Apply settings to current tab (safe version - won't crash)
  function applySettingsToTab(settings) {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs && tabs.length > 0 && tabs[0].id && tabs[0].url && !tabs[0].url.startsWith('chrome://')) {
        try {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'settingsUpdated',
            settings: settings
          }, (response) => {
            if (chrome.runtime.lastError) {
              // This is fine - content script not loaded yet
              console.log('Content script not ready, settings saved for next page load');
            } else {
              console.log('Settings applied to current tab');
            }
          });
        } catch(e) {
          console.log('Could not send to tab:', e.message);
        }
      } else {
        console.log('No active web page to apply settings');
      }
    });
  }
  
  // Load settings into checkboxes
  function loadSettingsIntoUI() {
    chrome.storage.local.get([
      'dyslexicFont', 'softColors', 'removeDistractions',
      'readingRuler', 'removeAnimations', 'simplifyText', 'jargonExplainer'
    ], (result) => {
      if (dyslexicFontChk) dyslexicFontChk.checked = result.dyslexicFont || false;
      if (softColorsChk) softColorsChk.checked = result.softColors || false;
      if (removeDistractionsChk) removeDistractionsChk.checked = result.removeDistractions || false;
      if (readingRulerChk) readingRulerChk.checked = result.readingRuler || false;
      if (removeAnimationsChk) removeAnimationsChk.checked = result.removeAnimations || false;
      if (simplifyTextChk) simplifyTextChk.checked = result.simplifyText || false;
      if (jargonExplainerChk) jargonExplainerChk.checked = result.jargonExplainer || false;
      console.log('UI loaded with settings:', result);
    });
  }
  
  // START BUTTON
  if (startBtn) {
    startBtn.onclick = () => {
      console.log('🔥 START BUTTON CLICKED!');
      showStatus('Saving your preferences...');
      
      const adhd = adhdSlider ? adhdSlider.value : 50;
      const dyslexia = dyslexiaSlider ? dyslexiaSlider.value : 50;
      const autism = autismSlider ? autismSlider.value : 50;
      
      const settings = calculateSettingsFromProfile({ adhd, dyslexia, autism });
      console.log('Calculated settings:', settings);
      
      chrome.storage.local.set({
        onboardingCompleted: true,
        userProfile: { adhd, dyslexia, autism },
        ...settings
      }, () => {
        console.log('Settings saved to storage');
        showStatus('✓ Settings saved!');
        
        // Switch panels - THIS IS THE FIX: don't try to send message immediately
        if (onboardingPanel) onboardingPanel.classList.add('hidden');
        if (mainPanel) mainPanel.classList.remove('hidden');
        
        // Update checkboxes
        if (dyslexicFontChk) dyslexicFontChk.checked = settings.dyslexicFont;
        if (softColorsChk) softColorsChk.checked = settings.softColors;
        if (removeDistractionsChk) removeDistractionsChk.checked = settings.removeDistractions;
        if (readingRulerChk) readingRulerChk.checked = settings.readingRuler;
        if (removeAnimationsChk) removeAnimationsChk.checked = settings.removeAnimations;
        if (simplifyTextChk) simplifyTextChk.checked = settings.simplifyText;
        if (jargonExplainerChk) jargonExplainerChk.checked = settings.jargonExplainer;
        
        // Apply to tab (won't crash even if fails)
        applySettingsToTab(settings);
      });
    };
  }
  
  // SKIP BUTTON
  if (skipBtn) {
    skipBtn.onclick = () => {
      console.log('🔥 SKIP BUTTON CLICKED!');
      showStatus('Skipping to manual settings');
      
      chrome.storage.local.set({ onboardingCompleted: true }, () => {
        if (onboardingPanel) onboardingPanel.classList.add('hidden');
        if (mainPanel) mainPanel.classList.remove('hidden');
        loadSettingsIntoUI();
      });
    };
  }
  
  // SAVE BUTTON
  if (saveBtn) {
    saveBtn.onclick = () => {
      console.log('🔥 SAVE BUTTON CLICKED!');
      
      const settings = {
        dyslexicFont: dyslexicFontChk ? dyslexicFontChk.checked : false,
        softColors: softColorsChk ? softColorsChk.checked : false,
        removeDistractions: removeDistractionsChk ? removeDistractionsChk.checked : false,
        readingRuler: readingRulerChk ? readingRulerChk.checked : false,
        removeAnimations: removeAnimationsChk ? removeAnimationsChk.checked : false,
        simplifyText: simplifyTextChk ? simplifyTextChk.checked : false,
        jargonExplainer: jargonExplainerChk ? jargonExplainerChk.checked : false
      };
      
      chrome.storage.local.set(settings, () => {
        showStatus('✓ Settings saved!', true);
        applySettingsToTab(settings);
      });
    };
  }
  
  // RESET BUTTON
  if (resetBtn) {
    resetBtn.onclick = () => {
      console.log('🔥 RESET BUTTON CLICKED!');
      
      const defaults = {
        dyslexicFont: false, softColors: false, removeDistractions: false,
        readingRuler: false, removeAnimations: false, simplifyText: false, jargonExplainer: false
      };
      
      if (dyslexicFontChk) dyslexicFontChk.checked = false;
      if (softColorsChk) softColorsChk.checked = false;
      if (removeDistractionsChk) removeDistractionsChk.checked = false;
      if (readingRulerChk) readingRulerChk.checked = false;
      if (removeAnimationsChk) removeAnimationsChk.checked = false;
      if (simplifyTextChk) simplifyTextChk.checked = false;
      if (jargonExplainerChk) jargonExplainerChk.checked = false;
      
      chrome.storage.local.set(defaults, () => {
        showStatus('✓ Reset to defaults', true);
        applySettingsToTab(defaults);
      });
    };
  }
  
  // BACK BUTTON
  if (backBtn) {
    backBtn.onclick = () => {
      console.log('🔥 BACK BUTTON CLICKED!');
      chrome.storage.local.set({ onboardingCompleted: false }, () => {
        if (mainPanel) mainPanel.classList.add('hidden');
        if (onboardingPanel) onboardingPanel.classList.remove('hidden');
      });
    };
  }
  
  // Check initial state
  chrome.storage.local.get(['onboardingCompleted'], (result) => {
    console.log('Initial onboarding status:', result.onboardingCompleted);
    
    if (result.onboardingCompleted === true) {
      if (onboardingPanel) onboardingPanel.classList.add('hidden');
      if (mainPanel) mainPanel.classList.remove('hidden');
      loadSettingsIntoUI();
    } else {
      if (onboardingPanel) onboardingPanel.classList.remove('hidden');
      if (mainPanel) mainPanel.classList.add('hidden');
    }
  });
});

console.log('popup.js finished loading');