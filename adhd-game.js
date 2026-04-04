// adhd-game.js - Gamified ADHD Screening with AI Judging

let currentGameIndex = 0;
let scores = [];
let gameStartTime = Date.now();
let timerInterval = null;
let gameResults = [];

// Performance tracking
let mouseMovements = [];
let fidgetCount = 0;
let reactionTimes = [];

const games = [
  {
    id: 1,
    title: "📋 The Project Completion Challenge",
    instruction: "Complete all 5 steps of this project. Click each step to mark it done!",
    question: "Testing task completion and follow-through",
    type: "completion",
    render: () => `
      <div class="focus-game">
        <div class="task-progress">
          <div class="task-fill" id="taskFill"></div>
        </div>
        <div class="task-steps" id="taskSteps">
          <div class="task-step" data-step="0">
            <div class="task-check">⬜</div>
            <span>📝 Step 1: Outline the project plan</span>
          </div>
          <div class="task-step" data-step="1">
            <div class="task-check">⬜</div>
            <span>🔍 Step 2: Research required materials</span>
          </div>
          <div class="task-step" data-step="2">
            <div class="task-check">⬜</div>
            <span>✍️ Step 3: Write the first draft</span>
          </div>
          <div class="task-step" data-step="3">
            <div class="task-check">⬜</div>
            <span>✅ Step 4: Review and edit</span>
          </div>
          <div class="task-step" data-step="4">
            <div class="task-check">⬜</div>
            <span>🎉 Step 5: Submit final project</span>
          </div>
        </div>
        <div class="feedback" id="completionFeedback"></div>
      </div>
    `,
    init: () => {
      let completedSteps = 0;
      const totalSteps = 5;
      let startTime = Date.now();
      const taskFill = document.getElementById('taskFill');
      const feedback = document.getElementById('completionFeedback');
      
      function updateProgress() {
        const percent = (completedSteps / totalSteps) * 100;
        taskFill.style.width = `${percent}%`;
      }
      
      document.querySelectorAll('.task-step').forEach(step => {
        step.onclick = () => {
          if (!step.classList.contains('completed')) {
            step.classList.add('completed');
            const checkDiv = step.querySelector('.task-check');
            if (checkDiv) checkDiv.textContent = '✅';
            completedSteps++;
            updateProgress();
            
            if (completedSteps === totalSteps) {
              const completionTime = (Date.now() - startTime) / 1000;
              let score = 0;
              let judgment = '';
              
              if (completionTime < 15) {
                score = 3;
                judgment = '🏆 Excellent focus! Completed all steps quickly!';
              } else if (completionTime < 30) {
                score = 2;
                judgment = '👍 Good completion time';
              } else if (completionTime < 60) {
                score = 1;
                judgment = '🤔 Took longer than average to complete';
              } else {
                score = 0;
                judgment = '⚠️ Significant difficulty with task completion (common with ADHD)';
              }
              
              scores[currentGameIndex] = score;
              gameResults[currentGameIndex] = { score, completionTime, judgment };
              
              feedback.innerHTML = `${judgment}<br>⏱️ Completion time: ${completionTime.toFixed(1)} seconds`;
              feedback.style.color = score >= 2 ? '#00b894' : '#fdcb6e';
              document.getElementById('nextBtn').style.display = 'block';
            }
          }
        };
      });
    }
  },
  {
    id: 2,
    title: "📦 The Organization Challenge",
    instruction: "Drag and drop items into the correct categories!",
    question: "Testing executive function and organization",
    type: "organization",
    render: () => `
      <div class="org-game">
        <div class="sort-items" id="sortItems">
          <div class="sort-item" data-category="work">📄 Report</div>
          <div class="sort-item" data-category="personal">🏠 Grocery list</div>
          <div class="sort-item" data-category="work">📊 Spreadsheet</div>
          <div class="sort-item" data-category="personal">📅 Birthday reminder</div>
          <div class="sort-item" data-category="work">📧 Email draft</div>
          <div class="sort-item" data-category="personal">💡 Personal idea</div>
        </div>
        <div class="sort-zones">
          <div class="sort-zone" data-zone="work">💼 WORK</div>
          <div class="sort-zone" data-zone="personal">🏠 PERSONAL</div>
        </div>
        <div class="feedback" id="orgFeedback"></div>
      </div>
    `,
    init: () => {
      let placedItems = 0;
      let mistakes = 0;
      let startTime = Date.now();
      const totalItems = 6;
      const feedback = document.getElementById('orgFeedback');
      
      document.querySelectorAll('.sort-item').forEach(item => {
        let isPlaced = false;
        
        item.onclick = () => {
          if (isPlaced) return;
          
          // Highlight to show which zone to drag to
          const zones = document.querySelectorAll('.sort-zone');
          zones.forEach(zone => {
            zone.style.transform = 'scale(1.02)';
            setTimeout(() => zone.style.transform = '', 300);
          });
        };
        
        // Simple click-to-zone logic (since drag-drop is complex)
        document.querySelectorAll('.sort-zone').forEach(zone => {
          zone.onclick = () => {
            if (isPlaced) return;
            
            const expectedCategory = item.dataset.category;
            const selectedZone = zone.dataset.zone;
            
            if (expectedCategory === selectedZone) {
              item.classList.add('placed');
              item.style.background = '#00b894';
              placedItems++;
              isPlaced = true;
              feedback.innerHTML = '✅ Correct!';
              feedback.style.color = '#00b894';
            } else {
              mistakes++;
              feedback.innerHTML = '❌ Wrong category!';
              feedback.style.color = '#e74c3c';
              setTimeout(() => {
                if (feedback) feedback.innerHTML = '';
              }, 1000);
            }
            
            if (placedItems === totalItems) {
              const completionTime = (Date.now() - startTime) / 1000;
              const accuracy = ((totalItems - mistakes) / totalItems) * 100;
              
              let score = 0;
              let judgment = '';
              
              if (accuracy === 100 && completionTime < 20) {
                score = 3;
                judgment = '🏆 Excellent organizational skills!';
              } else if (accuracy >= 80 && completionTime < 40) {
                score = 2;
                judgment = '👍 Good organization ability';
              } else if (accuracy >= 60) {
                score = 1;
                judgment = '🤔 Below average organization';
              } else {
                score = 0;
                judgment = '⚠️ Significant difficulty with organization (common with ADHD)';
              }
              
              scores[currentGameIndex] = score;
              gameResults[currentGameIndex] = { score, accuracy, mistakes, judgment };
              
              feedback.innerHTML = `${judgment}<br>📊 ${Math.round(accuracy)}% accuracy | ${mistakes} mistakes`;
              feedback.style.color = score >= 2 ? '#00b894' : '#fdcb6e';
              document.getElementById('nextBtn').style.display = 'block';
            }
          };
        });
      });
    }
  },
  {
    id: 3,
    title: "📅 The Memory Appointment Test",
    instruction: "Remember these 5 appointments!",
    question: "Testing working memory for obligations",
    type: "memory",
    render: () => `
      <div class="memory-game">
        <div id="appointmentsList" style="background: #1a1a2e; padding: 20px; border-radius: 16px; margin: 20px 0;">
          <p>📅 Monday: Doctor at 10am</p>
          <p>📅 Tuesday: Meeting at 2pm</p>
          <p>📅 Wednesday: Call mom at 6pm</p>
          <p>📅 Thursday: Gym at 8am</p>
          <p>📅 Friday: Project deadline</p>
        </div>
        <button id="hideBtn" class="response-btn">Hide Appointments - Test Memory</button>
        <div id="recallArea" style="display: none; margin: 20px 0;">
          <input type="text" id="recallInput" class="math-input" placeholder="Type appointments you remember (separate with commas)" style="width: 100%;">
          <button id="submitRecall" class="response-btn">Check Memory</button>
        </div>
        <div class="feedback" id="memoryFeedback"></div>
      </div>
    `,
    init: () => {
      let startTime = null;
      const appointments = [
        "Monday: Doctor at 10am",
        "Tuesday: Meeting at 2pm", 
        "Wednesday: Call mom at 6pm",
        "Thursday: Gym at 8am",
        "Friday: Project deadline"
      ];
      
      const hideBtn = document.getElementById('hideBtn');
      const recallArea = document.getElementById('recallArea');
      const appointmentsList = document.getElementById('appointmentsList');
      
      hideBtn.onclick = () => {
        startTime = Date.now();
        appointmentsList.style.display = 'none';
        recallArea.style.display = 'block';
        hideBtn.disabled = true;
      };
      
      document.getElementById('submitRecall').onclick = () => {
        const recallTime = (Date.now() - startTime) / 1000;
        const answer = document.getElementById('recallInput').value.toLowerCase();
        const feedback = document.getElementById('memoryFeedback');
        
        let recalledCount = 0;
        for (const apt of appointments) {
          const keywords = apt.toLowerCase().split(':')[1] || apt.toLowerCase();
          if (answer.includes(keywords.substring(0, 15))) {
            recalledCount++;
          }
        }
        
        const accuracy = (recalledCount / appointments.length) * 100;
        let score = 0;
        let judgment = '';
        
        if (accuracy >= 80 && recallTime < 30) {
          score = 3;
          judgment = '🏆 Excellent memory for appointments!';
        } else if (accuracy >= 60) {
          score = 2;
          judgment = '👍 Good memory recall';
        } else if (accuracy >= 40) {
          score = 1;
          judgment = '🤔 Below average memory for obligations';
        } else {
          score = 0;
          judgment = '⚠️ Significant difficulty remembering appointments (common with ADHD)';
        }
        
        scores[currentGameIndex] = score;
        gameResults[currentGameIndex] = { score, accuracy, recalledCount, recallTime, judgment };
        
        feedback.innerHTML = `${judgment}<br>📊 Recalled ${recalledCount}/${appointments.length} (${Math.round(accuracy)}%) in ${recallTime.toFixed(1)}s`;
        feedback.style.color = score >= 2 ? '#00b894' : '#fdcb6e';
        document.getElementById('nextBtn').style.display = 'block';
      };
    }
  },
  {
    id: 4,
    title: "⏰ The Procrastination Test",
    instruction: "Complete the task. Avoid distractions!",
    question: "Testing task avoidance and procrastination",
    type: "procrastination",
    render: () => `
      <div class="procrastination-game">
        <div class="task-progress">
          <div class="task-fill" id="procrastFill"></div>
        </div>
        <div id="mainTask" class="task-step" style="margin: 20px 0; cursor: pointer;">
          <div class="task-check">⬜</div>
          <span>📝 WRITE A 100-WORD ESSAY (Click to start)</span>
        </div>
        <div class="distraction-buttons" id="distractions">
          <button class="distraction-btn" data-distraction="social">📱 Check Social Media</button>
          <button class="distraction-btn" data-distraction="video">🎬 Watch a Video</button>
          <button class="distraction-btn" data-distraction="snack">🍿 Get a Snack</button>
        </div>
        <div class="feedback" id="procrastFeedback"></div>
        <textarea id="essayInput" style="display: none; width: 100%; height: 150px; background: #2d2d44; color: white; padding: 10px; border-radius: 12px; margin: 10px 0;"></textarea>
        <button id="submitEssay" style="display: none;" class="response-btn">Submit Essay</button>
      </div>
    `,
    init: () => {
      let startTime = null;
      let distractionCount = 0;
      let taskStarted = false;
      let taskCompleted = false;
      const feedback = document.getElementById('procrastFeedback');
      const taskBtn = document.getElementById('mainTask');
      const essayArea = document.getElementById('essayInput');
      const submitBtn = document.getElementById('submitEssay');
      const procrastFill = document.getElementById('procrastFill');
      
      taskBtn.onclick = () => {
        if (!taskStarted) {
          taskStarted = true;
          startTime = Date.now();
          taskBtn.style.background = '#6c5ce7';
          essayArea.style.display = 'block';
          submitBtn.style.display = 'block';
          feedback.innerHTML = '⏱️ Timer started! Focus on your essay...';
          
          // Track procrastination
          const interval = setInterval(() => {
            if (!taskCompleted && taskStarted) {
              const elapsed = (Date.now() - startTime) / 1000;
              const percent = Math.min((elapsed / 60) * 100, 100);
              procrastFill.style.width = `${percent}%`;
            }
          }, 1000);
        }
      };
      
      document.querySelectorAll('.distraction-btn').forEach(btn => {
        btn.onclick = () => {
          if (taskStarted && !taskCompleted) {
            distractionCount++;
            feedback.innerHTML = `⚠️ Distraction taken! Count: ${distractionCount}`;
            feedback.style.color = '#fdcb6e';
          }
        };
      });
      
      submitBtn.onclick = () => {
        const essay = essayArea.value;
        const wordCount = essay.trim().split(/\s+/).length;
        const completionTime = (Date.now() - startTime) / 1000;
        taskCompleted = true;
        
        let score = 0;
        let judgment = '';
        
        if (distractionCount === 0 && wordCount >= 100 && completionTime < 180) {
          score = 3;
          judgment = '🏆 Excellent focus! No distractions!';
        } else if (distractionCount <= 1 && wordCount >= 80) {
          score = 2;
          judgment = '👍 Good task completion with minimal distractions';
        } else if (distractionCount <= 3 && wordCount >= 60) {
          score = 1;
          judgment = '🤔 Moderate procrastination detected';
        } else {
          score = 0;
          judgment = '⚠️ High procrastination and task avoidance (common with ADHD)';
        }
        
        scores[currentGameIndex] = score;
        gameResults[currentGameIndex] = { score, distractionCount, wordCount, completionTime, judgment };
        
        feedback.innerHTML = `${judgment}<br>📊 ${distractionCount} distractions | ${wordCount} words | ${(completionTime/60).toFixed(1)} min`;
        feedback.style.color = score >= 2 ? '#00b894' : '#fdcb6e';
        document.getElementById('nextBtn').style.display = 'block';
      };
    }
  },
  {
    id: 5,
    title: "🖱️ The Fidget Tracker",
    instruction: "Sit still and watch the circle for 30 seconds. We'll track your mouse movement!",
    question: "Testing physical hyperactivity and fidgeting",
    type: "fidget",
    render: () => `
      <div class="fidget-game">
        <div class="fidget-area" id="fidgetArea">
          <div style="text-align: center; padding: 60px; font-size: 48px;">🎯</div>
          <div id="fidgetInstructions">Keep your mouse as still as possible for 30 seconds</div>
        </div>
        <div class="feedback" id="fidgetFeedback"></div>
        <button id="startFidgetTest" class="response-btn">Start Test</button>
      </div>
    `,
    init: () => {
      let testActive = false;
      let mousePositions = [];
      let startTime = null;
      const feedback = document.getElementById('fidgetFeedback');
      const startBtn = document.getElementById('startFidgetTest');
      const area = document.getElementById('fidgetArea');
      
      function trackMouse(e) {
        if (testActive) {
          mousePositions.push({ x: e.clientX, y: e.clientY, time: Date.now() });
        }
      }
      
      startBtn.onclick = () => {
        testActive = true;
        mousePositions = [];
        startTime = Date.now();
        document.addEventListener('mousemove', trackMouse);
        startBtn.disabled = true;
        startBtn.textContent = 'Testing... 30 seconds';
        feedback.innerHTML = '⏱️ Keep still! Tracking mouse movement...';
        
        setTimeout(() => {
          testActive = false;
          document.removeEventListener('mousemove', trackMouse);
          const duration = 30;
          
          // Calculate fidget score based on mouse movement
          let totalMovement = 0;
          for (let i = 1; i < mousePositions.length; i++) {
            const dx = mousePositions[i].x - mousePositions[i-1].x;
            const dy = mousePositions[i].y - mousePositions[i-1].y;
            totalMovement += Math.sqrt(dx*dx + dy*dy);
          }
          
          const movementsPerSecond = mousePositions.length / duration;
          let score = 0;
          let judgment = '';
          
          if (totalMovement < 500 && movementsPerSecond < 2) {
            score = 3;
            judgment = '🏆 Excellent stillness! No fidgeting detected.';
          } else if (totalMovement < 2000 && movementsPerSecond < 5) {
            score = 2;
            judgment = '👍 Mild fidgeting, within normal range';
          } else if (totalMovement < 5000) {
            score = 1;
            judgment = '🤔 Moderate fidgeting detected';
          } else {
            score = 0;
            judgment = '⚠️ High fidgeting/hyperactivity detected (common with ADHD)';
          }
          
          scores[currentGameIndex] = score;
          gameResults[currentGameIndex] = { score, totalMovement, movementsPerSecond, judgment };
          
          feedback.innerHTML = `${judgment}<br>📊 ${Math.round(totalMovement)}px movement | ${movementsPerSecond.toFixed(1)} movements/sec`;
          feedback.style.color = score >= 2 ? '#00b894' : '#fdcb6e';
          document.getElementById('nextBtn').style.display = 'block';
        }, 30000);
      };
    }
  },
  {
    id: 6,
    title: "⚡ The Hyperactivity Reaction Test",
    instruction: "Click as FAST as you can when the box turns GREEN!",
    question: "Testing hyperactivity and impulsivity",
    type: "reaction",
    render: () => `
      <div class="hyper-game">
        <div id="reactionBox" class="reaction-test waiting" style="cursor: pointer;">
          <div style="font-size: 48px;">⬜</div>
          <div>Waiting for green...</div>
        </div>
        <div class="feedback" id="reactionFeedback"></div>
        <button id="startReactionTest" class="response-btn">Start Test</button>
      </div>
    `,
    init: () => {
      let testActive = false;
      let waitingForGreen = false;
      let greenStartTime = null;
      let reactionTimes = [];
      let currentRound = 0;
      let prematureClicks = 0;
      const totalRounds = 5;
      const feedback = document.getElementById('reactionFeedback');
      const startBtn = document.getElementById('startReactionTest');
      const box = document.getElementById('reactionBox');
      
      function showGreen() {
        waitingForGreen = true;
        box.classList.remove('waiting');
        box.classList.add('active');
        box.style.background = '#00b894';
        box.innerHTML = '<div style="font-size: 48px;">🟢</div><div>CLICK NOW!</div>';
        greenStartTime = Date.now();
      }
      
      function nextRound() {
        if (currentRound >= totalRounds) {
          const avgReaction = reactionTimes.reduce((a,b) => a + b, 0) / reactionTimes.length;
          let score = 0;
          let judgment = '';
          
          if (avgReaction < 300 && prematureClicks === 0) {
            score = 3;
            judgment = '🏆 Excellent impulse control and fast reactions!';
          } else if (avgReaction < 500 && prematureClicks <= 1) {
            score = 2;
            judgment = '👍 Good reaction time, mild impulsivity';
          } else if (avgReaction < 800 || prematureClicks <= 3) {
            score = 1;
            judgment = '🤔 Below average impulse control';
          } else {
            score = 0;
            judgment = '⚠️ High impulsivity/hyperactivity detected (common with ADHD)';
          }
          
          scores[currentGameIndex] = score;
          gameResults[currentGameIndex] = { score, avgReaction, prematureClicks, judgment };
          
          feedback.innerHTML = `${judgment}<br>📊 Avg reaction: ${avgReaction.toFixed(0)}ms | Premature clicks: ${prematureClicks}`;
          feedback.style.color = score >= 2 ? '#00b894' : '#fdcb6e';
          document.getElementById('nextBtn').style.display = 'block';
          return;
        }
        
        currentRound++;
        const randomDelay = Math.random() * 3000 + 1000;
        setTimeout(showGreen, randomDelay);
      }
      
      box.onclick = () => {
        if (!testActive) return;
        
        if (waitingForGreen) {
          const reactionTime = Date.now() - greenStartTime;
          reactionTimes.push(reactionTime);
          waitingForGreen = false;
          box.classList.remove('active');
          box.classList.add('waiting');
          box.style.background = '#e74c3c';
          box.innerHTML = '<div style="font-size: 48px;">✅</div><div>Good!</div>';
          feedback.innerHTML = `Round ${currentRound}/${totalRounds}: ${reactionTime}ms`;
          
          setTimeout(nextRound, 1000);
        } else {
          // Premature click
          prematureClicks++;
          feedback.innerHTML = `⚠️ Too early! Wait for GREEN. (${prematureClicks} premature clicks)`;
          feedback.style.color = '#e74c3c';
        }
      };
      
      startBtn.onclick = () => {
        testActive = true;
        startBtn.disabled = true;
        reactionTimes = [];
        prematureClicks = 0;
        currentRound = 0;
        feedback.innerHTML = 'Test started! Wait for green...';
        nextRound();
      };
    }
  }
];

function renderGame() {
  const container = document.getElementById('gameContent');
  const progress = (currentGameIndex / games.length) * 100;
  const progressFill = document.getElementById('progressFill');
  const scoreDisplay = document.getElementById('scoreDisplay');
  
  if (progressFill) progressFill.style.width = `${progress}%`;
  if (scoreDisplay) scoreDisplay.textContent = `⚡ Score: ${scores.filter(s => s !== undefined).length}/${games.length}`;
  
  if (currentGameIndex >= games.length) {
    showResults();
    return;
  }
  
  const currentGame = games[currentGameIndex];
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
    <button class="next-btn" id="nextBtn" style="display: none;">Continue →</button>
  `;
  
  if (currentGame.init) currentGame.init();
  
  const nextBtn = document.getElementById('nextBtn');
  if (nextBtn) {
    nextBtn.onclick = () => {
      if (scores[currentGameIndex] !== undefined) {
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
  let riskLevel = percentage <= 30 ? 'Low Risk' : (percentage <= 60 ? 'Moderate Risk' : 'High Risk');
  
  const recommendations = [];
  if (percentage > 40) recommendations.push('🚫 Enable "Remove Distractions" mode');
  if (percentage > 50) recommendations.push('📏 Use Reading Ruler for focus');
  if (percentage > 60) recommendations.push('⏸️ Enable "Stop Animations"');
  if (percentage > 70) recommendations.push('🤖 Try AI Text Simplification');
  recommendations.push('🎯 Use Focus Mode for deep work');
  
  const container = document.getElementById('gameContent');
  container.innerHTML = `
    <div class="result-screen">
      <div class="result-score-circle" style="background: ${color};">${Math.round(percentage)}%</div>
      <div class="game-title">${level} ADHD Indicators (${riskLevel})</div>
      <div class="recommendation-list">
        ${recommendations.map(rec => `<div class="rec-item"><span class="rec-icon">✨</span><span class="rec-text">${rec}</span></div>`).join('')}
      </div>
      <button class="next-btn" id="applyBtn">✨ Apply AI-Recommended Settings</button>
    </div>
  `;
  
  const applyBtn = document.getElementById('applyBtn');
  if (applyBtn) {
    applyBtn.onclick = () => {
      const settings = {
        removeDistractions: percentage > 30,
        readingRuler: percentage > 40,
        removeAnimations: percentage > 50,
        simplifyText: percentage > 60,
        softColors: percentage > 40,
        jargonExplainer: percentage > 30,
        dyslexicFont: false
      };
      chrome.storage.local.set({ onboardingCompleted: true, userProfile: { adhd: percentage }, ...settings }, () => {
        window.close();
      });
    };
  }
}

timerInterval = setInterval(() => {
  const elapsed = Math.floor((Date.now() - gameStartTime) / 1000);
  const timerEl = document.getElementById('timer');
  if (timerEl) timerEl.textContent = `⏱️ ${elapsed}s`;
}, 1000);

renderGame();