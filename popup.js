// popup.js - Settings UI logic

document.addEventListener('DOMContentLoaded', () => {
  // Get all setting checkboxes
  const settings = {
    dyslexicFont: document.getElementById('dyslexicFont'),
    softColors: document.getElementById('softColors'),
    removeDistractions: document.getElementById('removeDistractions'),
    readingRuler: document.getElementById('readingRuler'),
    removeAnimations: document.getElementById('removeAnimations'),
    simplifyText: document.getElementById('simplifyText')
  };
  
  const saveBtn = document.getElementById('saveBtn');
  const resetBtn = document.getElementById('resetBtn');
  const statusMsg = document.getElementById('statusMsg');
  
  // Load saved settings from Chrome storage
  chrome.storage.local.get(
    [
      'dyslexicFont', 
      'softColors', 
      'removeDistractions', 
      'readingRuler', 
      'removeAnimations', 
      'simplifyText'
    ],
    (result) => {
      settings.dyslexicFont.checked = result.dyslexicFont || false;
      settings.softColors.checked = result.softColors || false;
      settings.removeDistractions.checked = result.removeDistractions || false;
      settings.readingRuler.checked = result.readingRuler || false;
      settings.removeAnimations.checked = result.removeAnimations || false;
      settings.simplifyText.checked = result.simplifyText || false;
    }
  );
  
  // Save settings
  saveBtn.addEventListener('click', () => {
    const settingsToSave = {
      dyslexicFont: settings.dyslexicFont.checked,
      softColors: settings.softColors.checked,
      removeDistractions: settings.removeDistractions.checked,
      readingRuler: settings.readingRuler.checked,
      removeAnimations: settings.removeAnimations.checked,
      simplifyText: settings.simplifyText.checked
    };
    
    chrome.storage.local.set(settingsToSave, () => {
      statusMsg.textContent = '✓ Settings saved! Refresh page to apply.';
      setTimeout(() => {
        statusMsg.textContent = '';
      }, 2000);
      
      // Notify content script that settings changed
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'settingsUpdated',
          settings: settingsToSave
        });
      });
    });
  });
  
  // Reset all settings to default (off)
  resetBtn.addEventListener('click', () => {
    settings.dyslexicFont.checked = false;
    settings.softColors.checked = false;
    settings.removeDistractions.checked = false;
    settings.readingRuler.checked = false;
    settings.removeAnimations.checked = false;
    settings.simplifyText.checked = false;
    
    chrome.storage.local.set({
      dyslexicFont: false,
      softColors: false,
      removeDistractions: false,
      readingRuler: false,
      removeAnimations: false,
      simplifyText: false
    }, () => {
      statusMsg.textContent = '✓ Reset to defaults';
      setTimeout(() => {
        statusMsg.textContent = '';
      }, 1500);
      
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'settingsUpdated',
          settings: {
            dyslexicFont: false,
            softColors: false,
            removeDistractions: false,
            readingRuler: false,
            removeAnimations: false,
            simplifyText: false
          }
        });
      });
    });
  });
});