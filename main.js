// main.js - Entry point
import { initVision, detectFingerPointer } from './modules/vision.js';
import { processROI } from './modules/ai.js';
import { speak, playChirp } from './modules/audio.js';
import { connectBLE, disconnectBLE, sendBleData } from './modules/ble.js';
import { initUI, isPointerFeatureActive, updateStatus, updateMapSimulator } from './modules/ui.js';

const video = document.getElementById('videoElement');
const canvas = document.getElementById('overlayCanvas');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startCameraBtn');
const stopBtn = document.getElementById('stopCameraBtn');
const bleBtn = document.getElementById('bleConnectBtn');

let isDetecting = false;
let animationId = null;
let lastVideoTime = -1;
let cocoModel = null;
let emptyGrid = new Uint8Array(15);
let handCooldown = 0; 
let isHunting = false;
let isAiBusy = false;
let huntStartTime = 0; 

async function initApp() {
  try {
    initUI();
    updateStatus("Loading AI Models...");
    speak("Loading AI models. Please wait.");

    await initVision();
    updateStatus("Vision Loaded...");
    
    try {
      cocoModel = await cocoSsd.load({ base: 'mobilenet_v2' });
      updateStatus("COCO Loaded...");
    } catch(e) { console.error("COCO Load Error", e); }

    try {
      const worker = await Tesseract.createWorker('eng');
      document.TesseractRecognize = async (img) => await worker.recognize(img);
      updateStatus("Tesseract Loaded...");
    } catch(e) { console.error("Tesseract Init Error", e); }

    updateStatus("Models Ready. Press Start");
    speak("System ready.");
    startBtn.disabled = false;
  } catch (err) {
    updateStatus("CRITICAL ERROR: " + err.message);
    document.getElementById('statusOverlay').style.color = "red";
  }
}

window.addEventListener('error', function(e) {
    const lbl = document.getElementById('statusOverlay');
    if (lbl) { lbl.innerText = "JS ERROR: " + e.message; lbl.style.color="red"; lbl.style.background="white"; }
});

startBtn.addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = stream;
    video.onloadeddata = () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      isDetecting = true;
      startBtn.disabled = true;
      stopBtn.disabled = false;
      detectFrame();
      updateStatus("Camera Active");
      speak("Camera started.");
    };
  } catch (err) { speak("Camera error."); }
});

stopBtn.addEventListener('click', () => {
  isDetecting = false;
  if(animationId) cancelAnimationFrame(animationId);
  video.srcObject.getTracks().forEach(t => t.stop());
  ctx.clearRect(0,0, canvas.width, canvas.height);
  startBtn.disabled = false;
  stopBtn.disabled = true;
  updateStatus("Camera Stopped");
});

window.addEventListener('ble-disconnected', () => {
  bleBtn.innerText = "Connect ESP32"; bleBtn.className = "btn primary";
});

bleBtn.addEventListener('click', async () => {
  if (bleBtn.innerText === "Disconnect") {
    disconnectBLE();
    bleBtn.innerText = "Connect ESP32"; bleBtn.className = "btn primary";
  } else {
    bleBtn.innerText = "Connecting...";
    const success = await connectBLE();
    if (success) {
      bleBtn.innerText = "Disconnect"; bleBtn.className = "btn secondary";
    } else {
      bleBtn.innerText = "Connect ESP32";
    }
  }
});

async function detectFrame() {
  if (!isDetecting) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (isPointerFeatureActive()) {
    // ---- MODE 1: Pointer Reader & Object Detection Fallback ----
    updateMapSimulator(emptyGrid); // Clear Web UI map
    
    if (video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      const pointerResult = detectFingerPointer(video, lastVideoTime, canvas.width, canvas.height);
      
      if (pointerResult) {
        ctx.fillStyle = '#10b981';
        for(let lm of pointerResult.landmarks) {
          ctx.beginPath(); ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 4, 0, 2*Math.PI); ctx.fill();
        }
        
        ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 3;
        ctx.strokeRect(pointerResult.roiRect.x, pointerResult.roiRect.y, pointerResult.roiRect.width, pointerResult.roiRect.height);

        ctx.strokeStyle = '#f59e0b'; ctx.beginPath();
        ctx.moveTo(pointerResult.fingerTip.x, pointerResult.fingerTip.y);
        ctx.lineTo(pointerResult.target.x, pointerResult.target.y);
        ctx.stroke();

        const now = Date.now();
        
        // Only attempt to start/continue hunting if Cooldown has expired and AI engine is free.
        if (now > handCooldown && !isAiBusy) {
           if (!isHunting) {
              isHunting = true;
              huntStartTime = now;
              speak("Scanning...", true);
              playChirp('hand');
           }
           
           if (now - huntStartTime > 7000) {
              // 7 second timeout to avoid indefinite battery drain
              speak("Nothing clearly identified.", true);
              isHunting = false;
              handCooldown = now + 4000; // Cooldown before trying again
           } else {
              isAiBusy = true;
              updateStatus("Hunting (>60% Confidence)...");
              
              processROI(ctx, canvas.width, canvas.height, pointerResult.roiRect, cocoModel).then(successFound => {
                 if (successFound) {
                     isHunting = false;
                     handCooldown = Date.now() + 6000; // 6 seconds cooldown so they can read the Braille!
                     updateStatus("Object Identified!");
                 }
                 isAiBusy = false; // Free up the engine for the next frame if it failed!
              });
           }
        }
      } else {
        // Finger lost from screen
        if (isHunting && !isAiBusy) {
           isHunting = false;
           updateStatus("Finger Lost. Camera Active");
        }
      }
    }
    sendBleData(emptyGrid);
  } else {
    // ---- MODE 2: Obstacle Grid Navigation ----
    if (cocoModel) {
      const predictions = await cocoModel.detect(video);
      const newGrid = new Uint8Array(15);
      
      predictions.forEach(pred => {
        if (pred.score < 0.4) return;
        const [x, y, w, h] = pred.bbox;
        
        ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = '#3b82f6'; ctx.fillText(pred.class, x, y - 5);

        const hRatio = h / video.videoHeight;
        const xCenter = x + w/2;
        let col = Math.floor(xCenter / (video.videoWidth/5));
        if(col > 4) col = 4; if(col < 0) col = 0;

        let row = hRatio > 0.6 ? 2 : (hRatio > 0.3 ? 1 : 0);
        let intensity = row + 1;
        const idx = (row * 5) + col;
        if (intensity > newGrid[idx]) newGrid[idx] = intensity;
      });
      
      updateMapSimulator(newGrid); // Visually pulse browser grid overlay!
      sendBleData(newGrid);
    }
  }
  animationId = requestAnimationFrame(detectFrame);
}

// Global bootstrap
window.onload = initApp;
