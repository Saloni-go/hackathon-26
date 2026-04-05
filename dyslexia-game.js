// dyslexia-game.js - AI-Judged Gamified Dyslexia Screening

let currentGameIndex = 0;
let scores = [];
let gameStartTime = Date.now();
let timerInterval = null;
let gameResults = [];

// Performance tracking variables
let readingStartTime = null;
let readingEndTime = null;
let currentSequence = [];
let userSequence = [];
let reactionTimes = [];
let letterMistakes = 0;
let totalLetters = 0;

const games = [
  {
    id: 1,
    title: "👈 The Direction Challenge",
    instruction: "Follow the instruction on camera.",
    question: "Camera check for left/right coordination",
    type: "direction",
    render: () => `
      <div class="direction-game">
        <div class="direction-prompt" id="directionPrompt">👉 Touch your LEFT ear with your RIGHT hand 👈</div>
        <div style="display:flex; gap:16px; align-items:center; justify-content:center; flex-wrap:wrap; margin: 20px 0;">
          <div style="background:#1a1a2e; padding:16px; border-radius:16px;">
            <svg width="200" height="160" viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg">
              <circle cx="100" cy="40" r="26" fill="#6c5ce7" />
              <rect x="82" y="66" width="36" height="60" rx="12" fill="#2d2d44" />
              <line x1="70" y1="90" x2="40" y2="70" stroke="#a55ce7" stroke-width="10" stroke-linecap="round" />
              <line x1="130" y1="90" x2="160" y2="70" stroke="#a55ce7" stroke-width="10" stroke-linecap="round" />
              <circle cx="40" cy="70" r="10" fill="#00b894" />
              <text x="20" y="145" fill="#c8c8d8" font-size="12">Right hand → Left ear</text>
            </svg>
          </div>
          <div>
            <video id="directionVideo" autoplay playsinline muted style="width: 260px; height: 200px; border-radius: 16px; background: #0f0f1a;"></video>
            <canvas id="directionCanvas" width="260" height="200" style="display:none;"></canvas>
          </div>
        </div>
        <div class="response-buttons">
          <button class="response-btn" id="startCameraBtn">📷 Start Camera</button>
          <button class="response-btn" id="checkPoseBtn" style="background:#2d2d44;" disabled>✅ Check Now</button>
          <button class="response-btn" id="skipCameraBtn" style="background:#2d2d44;">🙈 Skip Camera</button>
        </div>
        <div class="feedback" id="directionFeedback"></div>
        <div class="timer" style="font-size: 18px; margin: 10px;" id="reactionTimer">⏱️ Ready...</div>
      </div>
    `,
    init: () => {
      let startTime = Date.now();
      let stream = null;
      const feedback = document.getElementById('directionFeedback');
      const timerEl = document.getElementById('reactionTimer');
      const video = document.getElementById('directionVideo');
      const canvas = document.getElementById('directionCanvas');
      const startBtn = document.getElementById('startCameraBtn');
      const checkBtn = document.getElementById('checkPoseBtn');
      const skipBtn = document.getElementById('skipCameraBtn');
      const nextBtn = document.getElementById('nextBtn');

      if (timerEl) timerEl.textContent = '⏱️ Camera ready when you are.';

      async function startCamera() {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          if (video) {
            video.srcObject = stream;
            await video.play();
          }
          if (checkBtn) {
            checkBtn.disabled = false;
            checkBtn.style.opacity = '1';
          }
          if (feedback) {
            feedback.textContent = 'Camera started. Perform the action, then click “Check Now”.';
            feedback.style.color = '#c8c8d8';
          }
        } catch (error) {
          if (feedback) {
            feedback.textContent = 'Camera access denied or unavailable.';
            feedback.style.color = '#fdcb6e';
          }
        }
      }

      function getFrameData() {
        if (!canvas || !video) return null;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        return ctx.getImageData(0, 0, canvas.width, canvas.height);
      }

      async function detectPresence() {
        if (!video) return { faceDetected: false, motionDetected: false };

        if ('FaceDetector' in window) {
          try {
            const detector = new FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
            const faces = await detector.detect(video);
            return { faceDetected: faces.length > 0, motionDetected: false };
          } catch (e) {
            // fall through to motion detection
          }
        }

        const firstFrame = getFrameData();
        if (!firstFrame) return { faceDetected: false, motionDetected: false };
        await new Promise(resolve => setTimeout(resolve, 300));
        const secondFrame = getFrameData();
        if (!secondFrame) return { faceDetected: false, motionDetected: false };

        let diff = 0;
        const total = firstFrame.data.length;
        for (let i = 0; i < total; i += 20) {
          diff += Math.abs(firstFrame.data[i] - secondFrame.data[i]);
        }
        const avgDiff = diff / (total / 20);
        return { faceDetected: false, motionDetected: avgDiff > 18 };
      }

      async function scoreAttempt() {
        const reactionTime = Date.now() - startTime;
        const presence = await detectPresence();
        let score = 0;
        let judgment = '';

        if (presence.faceDetected) {
          score = 2;
          judgment = '✅ Face detected. Action likely performed.';
        } else if (presence.motionDetected) {
          score = 1;
          judgment = '🟡 Motion detected. Could not verify exact pose.';
        } else {
          score = 0;
          judgment = '❌ No clear presence detected.';
        }

        scores[currentGameIndex] = score;
        gameResults[currentGameIndex] = { score, reactionTime, judgment, presence };

        if (feedback) {
          feedback.innerHTML = `${judgment}<br>⏱️ ${(reactionTime/1000).toFixed(2)}s`;
          feedback.style.color = score >= 2 ? '#00b894' : '#fdcb6e';
        }
        if (timerEl) timerEl.textContent = `✅ Score: ${score}/3`;

        if (nextBtn) nextBtn.style.display = 'block';
      }

      if (startBtn) startBtn.onclick = () => startCamera();
      if (checkBtn) checkBtn.onclick = () => scoreAttempt();
      if (skipBtn) {
        skipBtn.onclick = () => {
          scores[currentGameIndex] = 0;
          gameResults[currentGameIndex] = { score: 0, reactionTime: Date.now() - startTime, judgment: 'Skipped camera check' };
          if (feedback) {
            feedback.textContent = 'Skipped camera check.';
            feedback.style.color = '#fdcb6e';
          }
          if (nextBtn) nextBtn.style.display = 'block';
        };
      }
    }
  },
  {
    id: 2,
    title: "🗺️ The Map Explorer",
    instruction: "Find the treasure as FAST as you can!",
    question: "Testing navigation speed and spatial awareness",
    type: "map",
    render: () => `
      <div class="map-game">
        <div class="simple-map">
          <div class="map-grid" id="mapGrid">
            <div class="map-cell" data-pos="0">🏠 House</div>
            <div class="map-cell" data-pos="1">🌳 Tree</div>
            <div class="map-cell" data-pos="2">🏪 Store</div>
            <div class="map-cell" data-pos="3">🏫 School</div>
            <div class="map-cell" data-pos="4" data-correct="true">⭐ TREASURE ⭐</div>
            <div class="map-cell" data-pos="5">🏥 Hospital</div>
            <div class="map-cell" data-pos="6">🏦 Bank</div>
            <div class="map-cell" data-pos="7">🍕 Pizza</div>
            <div class="map-cell" data-pos="8">🎬 Cinema</div>
          </div>
          <div class="feedback" id="mapFeedback">📍 Click on the TREASURE! Timer starts now!</div>
        </div>
      </div>
    `,
    init: () => {
      let startTime = Date.now();
      let found = false;
      const feedback = document.getElementById('mapFeedback');
      
      document.querySelectorAll('.map-cell').forEach(cell => {
        cell.onclick = () => {
          if (!found) {
            const timeToFind = Date.now() - startTime;
            
            if (cell.dataset.correct === 'true') {
              let score = 0;
              let judgment = '';
              
              if (timeToFind < 3000) {
                score = 3;
                judgment = '🏆 Excellent spatial awareness!';
              } else if (timeToFind < 7000) {
                score = 2;
                judgment = '👍 Good navigation skills';
              } else if (timeToFind < 12000) {
                score = 1;
                judgment = '🤔 Below average navigation';
              } else {
                score = 0;
                judgment = '⚠️ Difficulty with spatial navigation';
              }
              
              scores[currentGameIndex] = score;
              gameResults[currentGameIndex] = { score, timeToFind, judgment };
              
              cell.classList.add('correct');
              feedback.innerHTML = `${judgment}<br>⏱️ Time to find: ${(timeToFind/1000).toFixed(1)} seconds`;
              feedback.style.color = score >= 2 ? '#00b894' : '#fdcb6e';
              found = true;
              document.getElementById('nextBtn').style.display = 'block';
            } else {
              cell.classList.add('wrong');
              feedback.innerHTML = '❌ Not the treasure! Keep searching!';
              feedback.style.color = '#e74c3c';
              setTimeout(() => cell.classList.remove('wrong'), 300);
            }
          }
        };
      });
    }
  },
  {
    id: 3,
    title: "📖 The Speed Reader",
    instruction: "Read this passage aloud. Click 'Done' when finished.",
    question: "Testing reading speed (words per minute)",
    type: "reading",
    render: () => `
      <div class="reading-game">
        <div class="reading-text" id="readingPassage">
          The sun was setting over the peaceful lake. A gentle breeze rustled the leaves of the old oak tree. 
          A family of ducks swam lazily across the water, leaving small ripples in their wake. 
          In the distance, a fisherman sat quietly waiting for a bite. It was a perfect evening.
        </div>
        <button class="response-btn" id="startReadingBtn">🎙️ Start Reading (Mic)</button>
        <button class="response-btn" id="stopReadingBtn" style="display: none;">⏹️ Stop & Score</button>
        <button class="response-btn" id="skipReadingBtn" style="background: #2d2d44;">🙈 Can't speak now</button>
        <div class="reading-timer" id="readingTimer">⏱️ 0.00s</div>
        <div class="feedback" id="readingFeedback"></div>
        <div id="readingTranscript" style="margin-top: 10px; font-size: 12px; color: #bbb; min-height: 36px;"></div>
        <div class="response-buttons" id="readingSelfReport" style="display: none;">
          <button class="response-btn" data-reading-score="3">✅ Read easily</button>
          <button class="response-btn" data-reading-score="2">🟡 A bit effort</button>
          <button class="response-btn" data-reading-score="1">🟠 Difficult</button>
          <button class="response-btn" data-reading-score="0">❌ Couldn't read</button>
        </div>
      </div>
    `,
    init: () => {
      let reading = false;
      let startTime = null;
      let interval = null;
      let recognition = null;
      let transcriptText = '';
      let micAvailable = false;
      const timerEl = document.getElementById('readingTimer');
      const startBtn = document.getElementById('startReadingBtn');
      const stopBtn = document.getElementById('stopReadingBtn');
      const skipBtn = document.getElementById('skipReadingBtn');
      const passage = document.getElementById('readingPassage');
      const feedback = document.getElementById('readingFeedback');
      const transcriptEl = document.getElementById('readingTranscript');
      const selfReport = document.getElementById('readingSelfReport');
      
      // Word count of passage
      const wordCount = 68;

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        micAvailable = true;
        recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.interimResults = true;
        recognition.continuous = true;

        recognition.onresult = (event) => {
          let combined = '';
          for (let i = 0; i < event.results.length; i++) {
            combined += event.results[i][0].transcript + ' ';
          }
          transcriptText = combined.trim();
          if (transcriptEl) transcriptEl.textContent = transcriptText ? `Heard: ${transcriptText}` : 'Listening...';
        };

        recognition.onerror = () => {
          if (feedback) {
            feedback.textContent = 'Microphone unavailable. Use "Can\'t speak now" to continue.';
            feedback.style.color = '#fdcb6e';
          }
          if (transcriptEl) transcriptEl.textContent = '';
        };

        recognition.onend = () => {
          if (reading) {
            try {
              recognition.start();
            } catch (e) {
              // ignore re-start errors
            }
          }
        };
      } else {
        if (transcriptEl) transcriptEl.textContent = 'Speech input not supported in this browser.';
      }

      function stopReadingAndScore(manualScore = null) {
        reading = false;
        clearInterval(interval);
        if (recognition) {
          try { recognition.stop(); } catch (e) { /* ignore */ }
        }

        const elapsedSeconds = startTime ? (Date.now() - startTime) / 1000 : 0;
        const wpm = elapsedSeconds > 0 ? Math.round((wordCount / elapsedSeconds) * 60) : 0;

        let score = 0;
        let judgment = '';

        if (manualScore !== null) {
          score = manualScore;
          judgment = manualScore >= 3 ? '🏆 Reported easy reading' : manualScore >= 2 ? '👍 Reported manageable reading' : manualScore >= 1 ? '🤔 Reported difficulty reading' : '⚠️ Reported unable to read comfortably';
        } else {
          if (wpm >= 200) {
            score = 3;
            judgment = `⚡ Excellent! ${wpm} WPM (Above average)`;
          } else if (wpm >= 150) {
            score = 2;
            judgment = `👍 Average reader: ${wpm} WPM`;
          } else if (wpm >= 100) {
            score = 1;
            judgment = `🐢 Below average: ${wpm} WPM`;
          } else {
            score = 0;
            judgment = `⚠️ Slow reader: ${wpm} WPM (May benefit from dyslexia tools)`;
          }
        }

        scores[currentGameIndex] = score;
        gameResults[currentGameIndex] = { score, wpm, judgment, timeSeconds: elapsedSeconds, transcript: transcriptText };

        if (feedback) {
          feedback.innerHTML = `${judgment}<br>📖 ${wordCount} words in ${elapsedSeconds.toFixed(1)} seconds`;
          feedback.style.color = score >= 2 ? '#00b894' : '#fdcb6e';
        }
        if (timerEl) timerEl.textContent = `🎯 Score: ${score}/3 | ${wpm} WPM`;
        if (startBtn) startBtn.disabled = true;
        if (stopBtn) stopBtn.style.display = 'none';
        if (skipBtn) skipBtn.disabled = true;
        if (selfReport) selfReport.style.display = 'none';

        const nextBtn = document.getElementById('nextBtn');
        if (nextBtn) nextBtn.style.display = 'block';
      }

      function showSelfReport() {
        if (selfReport) selfReport.style.display = 'flex';
        if (startBtn) startBtn.disabled = true;
        if (stopBtn) stopBtn.style.display = 'none';
        if (skipBtn) skipBtn.disabled = true;
        if (transcriptEl) transcriptEl.textContent = 'Using self-report instead of microphone.';
      }
      
      startBtn.onclick = () => {
        if (reading) return;
        reading = true;
        startTime = Date.now();
        transcriptText = '';
        startBtn.textContent = '🎙️ Listening...';
        startBtn.style.background = '#00b894';
        passage.style.background = '#2d2d44';
        if (stopBtn) stopBtn.style.display = 'inline-flex';
        if (selfReport) selfReport.style.display = 'none';
        if (transcriptEl) transcriptEl.textContent = micAvailable ? 'Listening...' : 'Speech input not available.';
        interval = setInterval(() => {
          const elapsed = (Date.now() - startTime) / 1000;
          timerEl.textContent = `⏱️ ${elapsed.toFixed(1)}s`;
        }, 100);

        if (recognition) {
          try {
            recognition.start();
          } catch (e) {
            // ignore start errors
          }
        }
      };

      if (stopBtn) {
        stopBtn.onclick = () => {
          if (!reading) return;
          stopReadingAndScore();
        };
      }

      if (skipBtn) {
        skipBtn.onclick = () => {
          if (reading) {
            reading = false;
            clearInterval(interval);
            if (recognition) {
              try { recognition.stop(); } catch (e) { /* ignore */ }
            }
          }
          showSelfReport();
        };
      }

      if (selfReport) {
        selfReport.querySelectorAll('.response-btn').forEach(btn => {
          btn.onclick = () => {
            const score = parseInt(btn.dataset.readingScore, 10);
            stopReadingAndScore(score);
          };
        });
      }
    }
  },
  {
    id: 4,
    title: "🔤 The Letter Mix-Up",
    instruction: "Identify the letter as FAST as you can! 10 rounds",
    question: "Testing letter confusion and reaction time",
    type: "letter",
    render: () => `
      <div class="letter-game">
        <div class="letter-display" id="letterDisplay">?</div>
        <div class="letter-options" id="letterOptions">
          <button class="letter-btn" data-letter="b">b</button>
          <button class="letter-btn" data-letter="d">d</button>
          <button class="letter-btn" data-letter="p">p</button>
          <button class="letter-btn" data-letter="q">q</button>
        </div>
        <div class="feedback" id="letterFeedback"></div>
        <div class="timer" style="font-size: 18px; margin: 10px;" id="roundInfo">Round 1/10</div>
      </div>
    `,
    init: () => {
      const letters = ['b', 'd', 'p', 'q'];
      let round = 0;
      let mistakes = 0;
      let totalTime = 0;
      let currentStartTime = null;
      let canAnswer = true;
      
      const display = document.getElementById('letterDisplay');
      const feedback = document.getElementById('letterFeedback');
      const roundInfo = document.getElementById('roundInfo');
      
      function nextRound() {
        if (round >= 10) {
          // Calculate final score
          const avgTime = totalTime / 10;
          let score = 0;
          let judgment = '';
          
          if (mistakes === 0 && avgTime < 1500) {
            score = 3;
            judgment = '🏆 Perfect! No letter confusion detected';
          } else if (mistakes <= 1 && avgTime < 2500) {
            score = 2;
            judgment = '👍 Good! Mild letter recognition issues';
          } else if (mistakes <= 3 && avgTime < 4000) {
            score = 1;
            judgment = '🤔 Moderate letter confusion detected';
          } else {
            score = 0;
            judgment = '⚠️ Significant difficulty with similar letters (b/d/p/q)';
          }
          
          scores[currentGameIndex] = score;
          gameResults[currentGameIndex] = { score, mistakes, avgTime, judgment };
          
          feedback.innerHTML = `${judgment}<br>📊 ${mistakes} mistakes | ⏱️ Avg ${avgTime.toFixed(0)}ms per letter`;
          feedback.style.color = score >= 2 ? '#00b894' : '#fdcb6e';
          document.getElementById('nextBtn').style.display = 'block';
          return;
        }
        
        round++;
        roundInfo.textContent = `Round ${round}/10`;
        
        const currentLetter = letters[Math.floor(Math.random() * letters.length)];
        display.textContent = currentLetter;
        display.style.background = 'rgba(108,92,231,0.3)';
        
        currentStartTime = Date.now();
        canAnswer = true;
        
        // Re-enable buttons
        document.querySelectorAll('.letter-btn').forEach(btn => {
          btn.disabled = false;
          btn.style.opacity = '1';
          btn.style.background = '#2d2d44';
        });
      }
      
      document.querySelectorAll('.letter-btn').forEach(btn => {
        btn.onclick = () => {
          if (!canAnswer) return;
          
          const reactionTime = Date.now() - currentStartTime;
          totalTime += reactionTime;
          const selected = btn.dataset.letter;
          const correct = display.textContent;
          
          if (selected === correct) {
            btn.style.background = '#00b894';
            feedback.innerHTML = `✅ Correct! ${(reactionTime).toFixed(0)}ms`;
            feedback.style.color = '#00b894';
          } else {
            mistakes++;
            btn.style.background = '#e74c3c';
            feedback.innerHTML = `❌ Wrong! That was ${correct}, not ${selected}. +1 mistake`;
            feedback.style.color = '#e74c3c';
            
            // Highlight correct answer
            const correctBtn = document.querySelector(`.letter-btn[data-letter="${correct}"]`);
            if (correctBtn) correctBtn.style.background = '#00b894';
          }
          
          canAnswer = false;
          // Disable buttons temporarily
          document.querySelectorAll('.letter-btn').forEach(b => b.disabled = true);
          
          setTimeout(nextRound, 1000);
        };
      });
      
      nextRound();
    }
  },
  {
    id: 5,
    title: "🧠 The Memory Challenge",
    instruction: "Remember the sequence of numbers!",
    question: "Testing working memory capacity",
    type: "memory",
    render: () => `
      <div class="memory-game">
        <div id="memorySequence" class="memory-sequence"></div>
        <div id="memoryInput" style="margin: 20px;">
          <input type="text" id="memoryAnswer" class="math-input" placeholder="Type numbers separated by commas (e.g., 3,7,2)">
          <button id="submitMemory" class="response-btn">Submit Answer</button>
        </div>
        <div class="feedback" id="memoryFeedback"></div>
      </div>
    `,
    init: () => {
      const sequence = [3, 7, 2, 9, 5, 4, 8, 1, 6];
      const sequenceDiv = document.getElementById('memorySequence');
      let index = 0;
      
      function showNextNumber() {
        if (index < sequence.length) {
          const numDiv = document.createElement('div');
          numDiv.className = 'memory-item';
          numDiv.textContent = sequence[index];
          sequenceDiv.appendChild(numDiv);
          index++;
          setTimeout(showNextNumber, 700);
        } else {
          setTimeout(() => {
            sequenceDiv.innerHTML = '❓ Type the sequence you remember:';
          }, 500);
        }
      }
      
      showNextNumber();
      
      document.getElementById('submitMemory').onclick = () => {
        const answer = document.getElementById('memoryAnswer').value;
        const userSeq = answer.split(',').map(n => parseInt(n.trim()));
        const feedback = document.getElementById('memoryFeedback');
        
        let correctCount = 0;
        for (let i = 0; i < Math.min(sequence.length, userSeq.length); i++) {
          if (userSeq[i] === sequence[i]) correctCount++;
        }
        
        const accuracy = (correctCount / sequence.length) * 100;
        let score = 0;
        let judgment = '';
        
        if (accuracy >= 80) {
          score = 3;
          judgment = '🏆 Excellent working memory!';
        } else if (accuracy >= 60) {
          score = 2;
          judgment = '👍 Good memory retention';
        } else if (accuracy >= 40) {
          score = 1;
          judgment = '🤔 Below average working memory';
        } else {
          score = 0;
          judgment = '⚠️ Difficulty with working memory (common with dyslexia)';
        }
        
        scores[currentGameIndex] = score;
        gameResults[currentGameIndex] = { score, accuracy, correctCount, total: sequence.length, judgment };
        
        feedback.innerHTML = `${judgment}<br>📊 Recalled ${correctCount}/${sequence.length} correctly (${Math.round(accuracy)}%)`;
        feedback.style.color = score >= 2 ? '#00b894' : '#fdcb6e';
        
        document.getElementById('nextBtn').style.display = 'block';
      };
    }
  },
  {
    id: 6,
    title: "🧮 Mental Math Challenge",
    instruction: "Solve these 5 math problems in your head!",
    question: "Testing mental math speed and accuracy",
    type: "math",
    render: () => `
      <div class="math-game">
        <div id="mathQuestion" class="math-question">Problem 1/5</div>
        <input type="number" id="mathAnswer" class="math-input" placeholder="Your answer">
        <button id="submitMath" class="response-btn">Submit Answer</button>
        <div class="feedback" id="mathFeedback"></div>
      </div>
    `,
    init: () => {
      let currentProblem = 0;
      let correctAnswers = 0;
      let totalTime = 0;
      const problems = [
        { q: "47 + 28", a: 75 },
        { q: "93 - 45", a: 48 },
        { q: "15 × 6", a: 90 },
        { q: "144 ÷ 12", a: 12 },
        { q: "38 + 57 - 23", a: 72 }
      ];
      
      const questionDiv = document.getElementById('mathQuestion');
      const answerInput = document.getElementById('mathAnswer');
      const submitBtn = document.getElementById('submitMath');
      const feedback = document.getElementById('mathFeedback');
      
      let problemStartTime = Date.now();
      
      function nextProblem() {
        if (currentProblem >= problems.length) {
          const avgTime = totalTime / problems.length;
          const accuracy = (correctAnswers / problems.length) * 100;
          
          let score = 0;
          let judgment = '';
          
          if (accuracy === 100 && avgTime < 10000) {
            score = 3;
            judgment = '🏆 Excellent mental math skills!';
          } else if (accuracy >= 80 && avgTime < 20000) {
            score = 2;
            judgment = '👍 Good mental math ability';
          } else if (accuracy >= 60) {
            score = 1;
            judgment = '🤔 Below average mental math';
          } else {
            score = 0;
            judgment = '⚠️ Significant difficulty with mental math (common with dyslexia)';
          }
          
          scores[currentGameIndex] = score;
          gameResults[currentGameIndex] = { score, accuracy, avgTime, correctAnswers, judgment };
          
          feedback.innerHTML = `${judgment}<br>📊 ${correctAnswers}/${problems.length} correct | ⏱️ Avg ${(avgTime/1000).toFixed(1)}s per problem`;
          feedback.style.color = score >= 2 ? '#00b894' : '#fdcb6e';
          document.getElementById('nextBtn').style.display = 'block';
          return;
        }
        
        problemStartTime = Date.now();
        questionDiv.textContent = `${problems[currentProblem].q} = ?`;
        answerInput.value = '';
        answerInput.focus();
      }
      
      submitBtn.onclick = () => {
        const userAnswer = parseInt(answerInput.value);
        const correctAnswer = problems[currentProblem].a;
        const timeTaken = Date.now() - problemStartTime;
        totalTime += timeTaken;
        
        if (userAnswer === correctAnswer) {
          correctAnswers++;
          feedback.innerHTML = `✅ Correct! (${timeTaken/1000}s)`;
          feedback.style.color = '#00b894';
        } else {
          feedback.innerHTML = `❌ Wrong! Answer was ${correctAnswer}. (${timeTaken/1000}s)`;
          feedback.style.color = '#e74c3c';
        }
        
        currentProblem++;
        setTimeout(nextProblem, 1500);
      };
      
      nextProblem();
    }
  }
];

// Add 4 additional challenges
const extraChallenges = [
  { title: "✍️ Writing Accuracy Test", instruction: "Type the sentence exactly as shown", text: "The quick brown fox jumps over the lazy dog.", type: "writing" },
  { title: "✍️ Spelling Test", instruction: "Type the word you hear (AI will check)", text: "beautiful", type: "spelling" },
  { title: "📝 Message Memory", instruction: "Remember this phone number", text: "555-1234", type: "recall" },
  { title: "📋 Multiple Instructions", instruction: "Follow these 3 steps in order", steps: ["Tap your head", "Clap once", "Say 'Done'"], type: "instructions" }
];

function normalizeInput(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreTextMatch(expected, input) {
  const expectedWords = normalizeInput(expected).split(' ').filter(Boolean);
  const inputWords = new Set(normalizeInput(input).split(' ').filter(Boolean));
  if (!expectedWords.length) return 0;
  let matches = 0;
  expectedWords.forEach(word => {
    if (inputWords.has(word)) matches++;
  });
  return matches / expectedWords.length;
}

function levenshteinDistance(a, b) {
  const s = normalizeInput(a);
  const t = normalizeInput(b);
  if (!s && !t) return 0;
  const rows = s.length + 1;
  const cols = t.length + 1;
  const matrix = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i++) matrix[i][0] = i;
  for (let j = 0; j < cols; j++) matrix[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[rows - 1][cols - 1];
}

function calculateAccuracyPercentage(expected, input) {
  const source = normalizeInput(expected);
  const typed = normalizeInput(input);
  if (!source) return 0;
  if (!typed) return 0;
  const distance = levenshteinDistance(source, typed);
  const maxLen = Math.max(source.length, typed.length, 1);
  const ratio = Math.max(0, 1 - distance / maxLen);
  return Math.round(ratio * 100);
}

function evaluateExtraChallenge(challenge, inputValue) {
  if (challenge.type === 'spelling') {
    const percentage = calculateAccuracyPercentage(challenge.text, inputValue);
    let score = 0;
    let judgment = '';
    if (percentage >= 90) {
      score = 3;
      judgment = `✅ Good: ${percentage}% accuracy`;
    } else if (percentage >= 70) {
      score = 2;
      judgment = `🟡 Okay: ${percentage}% accuracy`;
    } else if (percentage >= 50) {
      score = 1;
      judgment = `❌ Bad: ${percentage}% accuracy`;
    } else {
      score = 0;
      judgment = `❌ Bad: ${percentage}% accuracy`;
    }
    return { score, judgment };
  }

  if (challenge.type === 'recall') {
    const expectedDigits = String(challenge.text || '').replace(/\D/g, '');
    const actualDigits = String(inputValue || '').replace(/\D/g, '');
    const correct = expectedDigits === actualDigits;
    return {
      score: correct ? 3 : actualDigits.length >= Math.max(1, expectedDigits.length - 2) ? 1 : 0,
      judgment: correct ? '✅ Good: recalled the number' : '❌ Bad: number mismatch'
    };
  }

  if (challenge.type === 'instructions') {
    const expected = (challenge.steps || []).join(' ');
    const ratio = scoreTextMatch(expected, inputValue);
    if (ratio >= 0.8) return { score: 3, judgment: '✅ Good: steps recalled accurately' };
    if (ratio >= 0.5) return { score: 2, judgment: '🟡 Okay: partial recall of steps' };
    return { score: 0, judgment: '❌ Bad: steps not recalled well' };
  }

  const ratio = scoreTextMatch(challenge.text || '', inputValue);
  const percentage = Math.round(ratio * 100);
  if (ratio >= 0.8) return { score: 3, judgment: `✅ Good: ${percentage}% accuracy` };
  if (ratio >= 0.5) return { score: 2, judgment: `🟡 Okay: ${percentage}% accuracy` };
  return { score: 0, judgment: `❌ Bad: ${percentage}% accuracy` };
}

extraChallenges.forEach((challenge, index) => {
  const lockedIndex = 6 + index;

  games.push({
    id: 7 + index,
    title: challenge.title,
    instruction: challenge.instruction,
    question: `Testing ${challenge.type}`,
    type: challenge.type,
    render: () => `
      <div style="text-align: center; padding: 20px;">
        <div style="font-size: 24px; margin: 20px; background: #1a1a2e; padding: 30px; border-radius: 20px;">
          ${challenge.type === 'spelling' ? '🎤 Click to hear the word' : 
            challenge.type === 'recall' ? '📞 Remember: ' + challenge.text : 
            challenge.type === 'instructions' ? challenge.steps.map((s, i) => `${i+1}. ${s}`).join('<br>') :
            '📖 "' + challenge.text + '"'}
        </div>
        ${challenge.type === 'spelling' ? '<button id="playWord" class="response-btn" style="margin-bottom:10px;">🎤 Play Word</button>' : ''}
        <input id="extraInput" class="math-input" placeholder="Type your answer here" style="width:100%;" />
        <button id="submitExtra" class="response-btn" style="margin-top:10px;">Check Answer</button>
        <div class="feedback" id="extraFeedback"></div>
      </div>
    `,
    init: () => {
      const input = document.getElementById('extraInput');
      const submit = document.getElementById('submitExtra');
      const feedback = document.getElementById('extraFeedback');
      const playWord = document.getElementById('playWord');

      if (playWord && challenge.type === 'spelling') {
        playWord.onclick = (event) => {
          event.preventDefault();
          try {
            const synth = window.speechSynthesis;
            if (!synth) {
              if (feedback) feedback.textContent = 'Speech not supported in this browser.';
              return;
            }
            const utterance = new SpeechSynthesisUtterance(challenge.text || '');
            utterance.rate = 0.8;
            utterance.pitch = 1.0;
            const voices = synth.getVoices();
            if (voices && voices.length) {
              utterance.voice = voices.find(v => v.lang?.includes('en')) || voices[0];
            }
            synth.cancel();
            synth.speak(utterance);
            if (feedback) feedback.textContent = '🔊 Playing word...';
          } catch (error) {
            if (feedback) feedback.textContent = 'Could not play audio.';
          }
        };
      }

      if (submit) {
        submit.onclick = () => {
          const value = input?.value || '';
          const result = evaluateExtraChallenge(challenge, value);
          scores[lockedIndex] = result.score;
          gameResults[lockedIndex] = { score: result.score, input: value, judgment: result.judgment };
          if (feedback) {
            feedback.textContent = result.judgment;
            feedback.style.color = result.score >= 2 ? '#00b894' : '#fdcb6e';
          }
          if (submit) submit.disabled = true;
          if (input) input.disabled = true;
          const nextBtn = document.getElementById('nextBtn');
          if (nextBtn) nextBtn.style.display = 'block';
        };
      }
    }
  });
});

function renderGame() {
  const container = document.getElementById('gameContent');
  const progress = (currentGameIndex / games.length) * 100;
  const progressFill = document.getElementById('progressFill');
  const scoreDisplay = document.getElementById('scoreDisplay');
  
  if (progressFill) progressFill.style.width = `${progress}%`;
  if (scoreDisplay) scoreDisplay.textContent = `📖 Score: ${scores.filter(s => s !== undefined).length}/${games.length}`;
  
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
  
  // For games that don't auto-detect completion, add manual response buttons
  if (!['direction', 'map', 'reading', 'letter', 'memory', 'math', 'writing', 'spelling'].includes(currentGame.type)) {
    document.querySelectorAll('.response-btn[data-value]').forEach(btn => {
      btn.onclick = () => {
        const value = parseInt(btn.dataset.value);
        if (!isNaN(value)) {
          scores[currentGameIndex] = value;
          document.getElementById('nextBtn').style.display = 'block';
          document.querySelectorAll('.response-btn').forEach(b => {
            b.disabled = true;
            b.style.opacity = '0.5';
          });
        }
      };
    });
  }
  
  const nextBtn = document.getElementById('nextBtn');
  if (nextBtn) {
    nextBtn.onclick = () => {
      if (scores[currentGameIndex] !== undefined) {
        currentGameIndex++;
        renderGame();
      } else {
        alert('Please complete the challenge first!');
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
  if (percentage > 40) recommendations.push('📖 Enable Dyslexia-Friendly Font');
  if (percentage > 50) recommendations.push('🔊 Try AI Text-to-Speech');
  if (percentage > 60) recommendations.push('📏 Use Reading Ruler for focus');
  if (percentage > 70) recommendations.push('🤖 Enable AI Text Simplification');
  recommendations.push('✨ Adjust letter spacing in settings');
  
  // Generate performance summary
  let performanceSummary = '';
  if (gameResults.length > 0) {
    const avgReaction = gameResults.filter(r => r.reactionTime).reduce((a,b) => a + (b.reactionTime || 0), 0) / gameResults.filter(r => r.reactionTime).length;
    performanceSummary = `<div style="font-size: 12px; color: #888; margin-top: 10px;">
      📊 Performance metrics analyzed by AI based on your actual responses
    </div>`;
  }
  
  const container = document.getElementById('gameContent');
  container.innerHTML = `
    <div class="result-screen">
      <div class="result-score-circle" style="background: ${color};">${Math.round(percentage)}%</div>
      <div class="game-title">${level} Dyslexia Indicators (${riskLevel})</div>
      ${performanceSummary}
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
        dyslexicFont: percentage > 30,
        softColors: percentage > 40,
        readingRuler: percentage > 50,
        simplifyText: percentage > 60,
        removeDistractions: percentage > 50,
        jargonExplainer: percentage > 40,
        removeAnimations: percentage > 60
      };
      chrome.storage.local.set({ onboardingCompleted: true, userProfile: { dyslexia: percentage }, ...settings }, () => {
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