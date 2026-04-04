// autism-game.js - Game logic

let currentGameIndex = 0;
let scores = [];
let gameStartTime = Date.now();
let timerInterval = null;
let currentGame = null;
let gameResults = [];

// The 5 Gamified Challenges (simplified to work)
const games = [
  {
    id: 1,
    title: "🔊 The Sound Detective",
    instruction: "Play the sound and pick the correct pitch.",
    question: "Identify the pitch you heard",
    type: "sound",
    render: () => `
      <div class="sound-game">
        <div class="sound-wave" id="soundWave">
          <div class="sound-bar"></div><div class="sound-bar"></div><div class="sound-bar"></div>
          <div class="sound-bar"></div><div class="sound-bar"></div><div class="sound-bar"></div>
        </div>
        <button class="sound-button" id="playSoundBtn" type="button">🔊</button>
        <div class="response-buttons" id="soundOptions">
          <button class="response-btn" data-sound="high" type="button">🔊 High pitch</button>
          <button class="response-btn" data-sound="low" type="button">🔉 Low pitch</button>
        </div>
        <div class="feedback" id="soundFeedback"></div>
        <button class="next-btn" id="nextBtn" style="display: none;">Continue →</button>
      </div>
    `,
    init: () => {
      let soundStartTime = null;
      const btn = document.getElementById('playSoundBtn');
      const feedback = document.getElementById('soundFeedback');
      const soundOptions = document.getElementById('soundOptions');
      const nextBtn = document.getElementById('nextBtn');
      const correctSound = 'high';

      if (btn) {
        btn.onclick = () => {
          soundStartTime = Date.now();
          const bars = document.querySelectorAll('.sound-bar');
          bars.forEach((bar, i) => {
            setTimeout(() => {
              bar.style.height = (30 + Math.random() * 40) + 'px';
              bar.classList.add('active');
              setTimeout(() => {
                bar.style.height = '30px';
                bar.classList.remove('active');
              }, 200);
            }, i * 50);
          });
          try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = 880;
            gain.gain.value = 0.2;
            osc.start();
            gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.5);
            osc.stop(audioCtx.currentTime + 0.5);
          } catch(e) { console.log('Audio not supported'); }
        };
      }

      if (soundOptions) {
        soundOptions.onclick = (event) => {
          const option = event.target.closest('.response-btn');
          if (!option) return;

          const chosenPitch = option.dataset.sound;
          const reactionTime = soundStartTime ? Date.now() - soundStartTime : 5000;
          let score = 0;
          let judgment = '';

          document.querySelectorAll('#soundOptions .response-btn').forEach(b => b.style.background = '#2d2d44');
          option.style.background = '#6c5ce7';

          if (chosenPitch === correctSound) {
            score = reactionTime < 2000 ? 3 : (reactionTime < 4000 ? 2 : 1);
            judgment = '✅ Correct!';
          } else {
            score = 0;
            judgment = '❌ Incorrect pitch';
          }

          scores[currentGameIndex] = score;

          if (feedback) {
            feedback.innerHTML = `${judgment} <br>⏱️ ${(reactionTime/1000).toFixed(2)}s`;
            feedback.style.color = score >= 2 ? '#00b894' : '#fdcb6e';
          }

          if (nextBtn) nextBtn.style.display = 'block';
          if (score > 0) {
            setTimeout(() => {
              if (scores[currentGameIndex] !== undefined) {
                currentGameIndex++;
                renderGame();
              }
            }, 1200);
          }
        };
      }
    }
  },
  {
    id: 2,
    title: "😊 The Emotion Reader",
    instruction: "What is this person feeling?",
    question: "Pick the correct emotion",
    type: "emotion",
    render: () => `
      <div>
        <div style="text-align: center; font-size: 80px; margin: 20px;" id="emotionFace">😊</div>
        <div class="emotion-grid" id="emotionGrid">
          <div class="emotion-card" data-emotion="happy"><span class="emotion-name">Happy</span></div>
          <div class="emotion-card" data-emotion="sad"><span class="emotion-name">Sad</span></div>
          <div class="emotion-card" data-emotion="angry"><span class="emotion-name">Angry</span></div>
          <div class="emotion-card" data-emotion="surprised"><span class="emotion-name">Surprised</span></div>
          <div class="emotion-card" data-emotion="scared"><span class="emotion-name">Scared</span></div>
          <div class="emotion-card" data-emotion="confused"><span class="emotion-name">Confused</span></div>
        </div>
        <div class="feedback" id="emotionFeedback"></div>
        <button class="next-btn" id="nextBtn" style="display: none;">Continue →</button>
      </div>
    `,
    init: () => {
      const emotions = [
        { key: 'happy', emoji: '😊' },
        { key: 'sad', emoji: '😢' },
        { key: 'angry', emoji: '😠' },
        { key: 'surprised', emoji: '😲' },
        { key: 'scared', emoji: '😨' },
        { key: 'confused', emoji: '🤔' }
      ];
      const target = emotions[Math.floor(Math.random() * emotions.length)];
      const faceEl = document.getElementById('emotionFace');
      const feedback = document.getElementById('emotionFeedback');
      const startTime = Date.now();
      if (faceEl) faceEl.textContent = target.emoji;
      const nextBtn = document.getElementById('nextBtn');

      let answered = false;
      document.querySelectorAll('.emotion-card').forEach(card => {
        card.onclick = () => {
          if (answered) return;
          answered = true;
          const selected = card.dataset.emotion;
          const reactionTime = Date.now() - startTime;
          let score = 0;
          let judgment = '';

          if (selected === target.key) {
            if (reactionTime < 2000) {
              score = 3;
              judgment = '🏆 Correct and fast!';
            } else if (reactionTime < 4000) {
              score = 2;
              judgment = '👍 Correct, good reaction time';
            } else {
              score = 1;
              judgment = '✅ Correct, but slower';
            }
            card.style.background = '#00b894';
          } else {
            score = 0;
            judgment = '❌ Incorrect emotion';
            card.style.background = '#e74c3c';
            const correct = document.querySelector(`.emotion-card[data-emotion="${target.key}"]`);
            if (correct) correct.style.background = '#00b894';
          }

          scores[currentGameIndex] = score;
          gameResults[currentGameIndex] = { score, reactionTime, judgment, target: target.key };
          if (feedback) {
            feedback.innerHTML = `${judgment}<br>⏱️ ${(reactionTime/1000).toFixed(2)}s`;
            feedback.style.color = score >= 2 ? '#00b894' : '#fdcb6e';
          }

          document.querySelectorAll('.emotion-card').forEach(btn => {
            btn.style.pointerEvents = 'none';
            btn.style.opacity = '0.7';
          });

          if (nextBtn) nextBtn.style.display = 'block';
          if (score > 0) {
            setTimeout(() => {
              if (scores[currentGameIndex] !== undefined) {
                currentGameIndex++;
                renderGame();
              }
            }, 1200);
          }
        };
      });
    },
    cleanup: () => {
      if (window.emotionInterval) clearInterval(window.emotionInterval);
    }
  },
  {
    id: 3,
    title: "📖 Story Understanding",
    instruction: "Read the story and answer the question",
    question: "Select the correct reason",
    type: "story",
    render: () => `
      <div>
        <div class="story-box">
          <div class="story-text">🐭 A little mouse found a big piece of cheese. As he was about to eat it, a cat appeared. The mouse said "This cheese is too big for me. Would you like to share?" The cat smiled and said "How kind of you!"</div>
          <div class="story-question">❓ Why did the mouse offer to share the cheese?</div>
          <div class="story-options" id="storyOptions">
            <button class="story-option" data-story-value="0">He was being generous</button>
            <button class="story-option" data-story-value="1">He was scared of the cat</button>
            <button class="story-option" data-story-value="2">He wanted a friend</button>
            <button class="story-option" data-story-value="3">The cheese was too big</button>
          </div>
        </div>
        <div class="feedback" id="storyFeedback"></div>
        <button class="next-btn" id="nextBtn" style="display: none;">Continue →</button>
      </div>
    `,
    init: () => {
      let storyAnswered = false;
      const correctValue = 1;
      const startTime = Date.now();
      const feedback = document.getElementById('storyFeedback');
      document.querySelectorAll('.story-option').forEach(btn => {
        btn.onclick = () => {
          if (!storyAnswered) {
            storyAnswered = true;
            const value = parseInt(btn.dataset.storyValue, 10);
            const reactionTime = Date.now() - startTime;
            let score = 0;
            let judgment = '';
            if (value === correctValue) {
              if (reactionTime < 3000) {
                score = 3;
                judgment = '🏆 Correct and fast!';
              } else if (reactionTime < 6000) {
                score = 2;
                judgment = '👍 Correct, good reaction time';
              } else {
                score = 1;
                judgment = '✅ Correct, but slower';
              }
              btn.style.background = '#00b894';
            } else {
              score = 0;
              judgment = '❌ Incorrect answer';
              btn.style.background = '#e74c3c';
              const correct = document.querySelector(`.story-option[data-story-value="${correctValue}"]`);
              if (correct) correct.style.background = '#00b894';
            }

            scores[currentGameIndex] = score;
            gameResults[currentGameIndex] = { score, reactionTime, judgment };
            if (feedback) {
              feedback.innerHTML = `${judgment}<br>⏱️ ${(reactionTime/1000).toFixed(2)}s`;
              feedback.style.color = score >= 2 ? '#00b894' : '#fdcb6e';
            }

            document.querySelectorAll('.story-option').forEach(option => {
              option.disabled = true;
              option.style.opacity = '0.7';
            });

            const nextBtn = document.getElementById('nextBtn');
            if (nextBtn) nextBtn.style.display = 'block';
            if (score > 0) {
              setTimeout(() => {
                if (scores[currentGameIndex] !== undefined) {
                  currentGameIndex++;
                  renderGame();
                }
              }, 1200);
            }
          }
        };
      });
    }
  },
  {
    id: 4,
    title: "🎨 Pattern Recognition",
    instruction: "Find the odd one out!",
    question: "Pick the odd pattern",
    type: "pattern",
    render: () => `
      <div>
        <div class="pattern-grid" id="patternGrid">
          <div class="pattern-card" data-pattern="normal"><div class="pattern-symbols">★ ★ ★ ★</div></div>
          <div class="pattern-card" data-pattern="normal"><div class="pattern-symbols">★ ★ ★ ★</div></div>
          <div class="pattern-card" data-pattern="odd"><div class="pattern-symbols">★ ★ ◆ ★</div></div>
          <div class="pattern-card" data-pattern="normal"><div class="pattern-symbols">★ ★ ★ ★</div></div>
          <div class="pattern-card" data-pattern="normal"><div class="pattern-symbols">★ ★ ★ ★</div></div>
          <div class="pattern-card" data-pattern="normal"><div class="pattern-symbols">★ ★ ★ ★</div></div>
        </div>
        <div class="feedback" id="patternFeedback"></div>
        <button class="next-btn" id="nextBtn" style="display: none;">Continue →</button>
      </div>
    `,
    init: () => {
      let patternFound = false;
      const startTime = Date.now();
      const feedback = document.getElementById('patternFeedback');
      document.querySelectorAll('.pattern-card').forEach(card => {
        card.onclick = () => {
          if (!patternFound) {
            patternFound = true;
            const reactionTime = Date.now() - startTime;
            let score = 0;
            let judgment = '';
            if (card.dataset.pattern === 'odd') {
              if (reactionTime < 2000) {
                score = 3;
                judgment = '🏆 Correct and fast!';
              } else if (reactionTime < 5000) {
                score = 2;
                judgment = '👍 Correct, good reaction time';
              } else {
                score = 1;
                judgment = '✅ Correct, but slower';
              }
              card.style.background = '#00b894';
              card.style.transform = 'scale(1.05)';
            } else {
              score = 0;
              judgment = '❌ Incorrect pattern';
              card.style.background = '#e74c3c';
              const odd = document.querySelector('.pattern-card[data-pattern="odd"]');
              if (odd) odd.style.background = '#00b894';
            }

            scores[currentGameIndex] = score;
            gameResults[currentGameIndex] = { score, reactionTime, judgment };
            if (feedback) {
              feedback.innerHTML = `${judgment}<br>⏱️ ${(reactionTime/1000).toFixed(2)}s`;
              feedback.style.color = score >= 2 ? '#00b894' : '#fdcb6e';
            }

            document.querySelectorAll('.pattern-card').forEach(btn => {
              btn.style.pointerEvents = 'none';
              btn.style.opacity = '0.7';
            });

            const nextBtn = document.getElementById('nextBtn');
            if (nextBtn) nextBtn.style.display = 'block';
            if (score > 0) {
              setTimeout(() => {
                if (scores[currentGameIndex] !== undefined) {
                  currentGameIndex++;
                  renderGame();
                }
              }, 1200);
            }
          }
        };
      });
    }
  },
  {
    id: 5,
    title: "🎯 Focus Challenge",
    instruction: "Click the target as fast as you can",
    question: "Find the target symbol",
    type: "simple",
    render: () => `
      <div style="text-align: center; padding: 40px;">
        <div style="font-size: 20px; margin-bottom: 12px;">Tap the 🎯 target</div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; max-width: 240px; margin: 0 auto;" id="focusGrid">
          <button class="response-btn" data-focus="false">⭐</button>
          <button class="response-btn" data-focus="false">🌙</button>
          <button class="response-btn" data-focus="false">⚡</button>
          <button class="response-btn" data-focus="false">🍀</button>
          <button class="response-btn" data-focus="true">🎯</button>
          <button class="response-btn" data-focus="false">🔥</button>
          <button class="response-btn" data-focus="false">🎵</button>
          <button class="response-btn" data-focus="false">🌟</button>
          <button class="response-btn" data-focus="false">💡</button>
        </div>
        <div class="feedback" id="focusFeedback"></div>
        <button class="next-btn" id="nextBtn" style="display: none;">Continue →</button>
      </div>
    `,
    init: () => {
      let answered = false;
      const startTime = Date.now();
      let mistakes = 0;
      const feedback = document.getElementById('focusFeedback');

      document.querySelectorAll('#focusGrid .response-btn').forEach(btn => {
        btn.onclick = () => {
          if (answered) return;
          const isTarget = btn.dataset.focus === 'true';
          if (!isTarget) {
            mistakes++;
            btn.style.background = '#e74c3c';
            return;
          }

          answered = true;
          const reactionTime = Date.now() - startTime;
          let score = 0;
          let judgment = '';
          if (mistakes === 0 && reactionTime < 2000) {
            score = 3;
            judgment = '🏆 Perfect focus!';
          } else if (mistakes <= 1 && reactionTime < 4000) {
            score = 2;
            judgment = '👍 Good focus';
          } else if (mistakes <= 2) {
            score = 1;
            judgment = '🤔 Some distractions';
          } else {
            score = 0;
            judgment = '⚠️ Many distractions';
          }

          btn.style.background = '#00b894';
          scores[currentGameIndex] = score;
          gameResults[currentGameIndex] = { score, reactionTime, mistakes, judgment };
          if (feedback) {
            feedback.innerHTML = `${judgment}<br>⏱️ ${(reactionTime/1000).toFixed(2)}s | ❌ ${mistakes} mistakes`;
            feedback.style.color = score >= 2 ? '#00b894' : '#fdcb6e';
          }

          document.querySelectorAll('#focusGrid .response-btn').forEach(option => {
            option.disabled = true;
            option.style.opacity = '0.7';
          });

          const nextBtn = document.getElementById('nextBtn');
          if (nextBtn) nextBtn.style.display = 'block';
          if (score > 0) {
            setTimeout(() => {
              if (scores[currentGameIndex] !== undefined) {
                currentGameIndex++;
                renderGame();
              }
            }, 1200);
          }
        };
      });
    }
  }
];

function renderGame() {
  const container = document.getElementById('gameContent');
  const progress = (currentGameIndex / games.length) * 100;
  const progressFill = document.getElementById('progressFill');
  const scoreDisplay = document.getElementById('scoreDisplay');
  
  if (progressFill) progressFill.style.width = `${progress}%`;
  if (scoreDisplay) scoreDisplay.textContent = `🎮 Score: ${scores.filter(s => s !== undefined).length}/${games.length}`;
  
  if (currentGameIndex >= games.length) {
    showResults();
    return;
  }
  
  currentGame = games[currentGameIndex];
  container.innerHTML = `
    <div class="game-header">
      <div class="game-icon">${currentGame.title.split(' ')[0]}</div>
      <div class="game-title">${currentGame.title}</div>
      <div class="game-subtitle">${currentGame.instruction}</div>
    </div>
    <div class="game-card">
      <p style="margin-bottom: 15px; font-size: 14px; opacity: 0.8;">📋 ${currentGame.question}</p>
      ${currentGame.render()}
    </div>
  `;
  
  if (currentGame.init) currentGame.init();
  
  const nextBtn = document.getElementById('nextBtn');
  if (nextBtn) {
    nextBtn.onclick = () => {
      if (scores[currentGameIndex] !== undefined) {
        if (currentGame.cleanup) currentGame.cleanup();
        currentGameIndex++;
        renderGame();
      }
    };
  }
}

function showResults() {
  const totalScore = scores.reduce((a, b) => a + b, 0);
  const maxScore = scores.length * 3;
  const percentage = (totalScore / maxScore) * 100;
  
  let level = percentage <= 30 ? 'Low' : (percentage <= 60 ? 'Moderate' : 'High');
  let color = percentage <= 30 ? '#00b894' : (percentage <= 60 ? '#fdcb6e' : '#e74c3c');
  
  const recommendations = [];
  if (percentage > 50) recommendations.push('🎨 Enable Soft Colors mode');
  if (percentage > 60) recommendations.push('🚫 Turn on Remove Distractions');
  if (percentage > 70) recommendations.push('📏 Use Reading Ruler for focus');
  if (percentage > 80) recommendations.push('⏸️ Enable Stop Animations');
  recommendations.push('🤖 Try AI Text Simplification');
  
  const container = document.getElementById('gameContent');
  container.innerHTML = `
    <div class="result-screen">
      <div class="result-score-circle" style="background: ${color};">${Math.round(percentage)}%</div>
      <div class="game-title">${level} Sensitivity Profile</div>
      <div class="recommendation-list">
        ${recommendations.map(rec => `<div class="rec-item"><span class="rec-icon">✨</span><span class="rec-text">${rec}</span></div>`).join('')}
      </div>
      <button class="next-btn" id="applyBtn">✨ Apply Recommended Settings</button>
    </div>
  `;
  
  const applyBtn = document.getElementById('applyBtn');
  if (applyBtn) {
    applyBtn.onclick = () => {
      const settings = {
        softColors: percentage > 40,
        removeDistractions: percentage > 30,
        readingRuler: percentage > 50,
        removeAnimations: percentage > 60,
        simplifyText: percentage > 50,
        jargonExplainer: percentage > 40,
        dyslexicFont: false
      };
      chrome.storage.local.set({ onboardingCompleted: true, userProfile: { autism: percentage }, ...settings }, () => {
        window.close();
      });
    };
  }
}

// Start timer
timerInterval = setInterval(() => {
  const elapsed = Math.floor((Date.now() - gameStartTime) / 1000);
  const timerEl = document.getElementById('timer');
  if (timerEl) timerEl.textContent = `⏱️ ${elapsed}s`;
}, 1000);

// Start game
renderGame();