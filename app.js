// UI Elements
const video = document.getElementById('videoElement');
const canvas = document.getElementById('overlayCanvas');
const ctx = canvas.getContext('2d');
const statusOverlay = document.getElementById('statusOverlay');
const matrixContainer = document.getElementById('matrixGrid');

// Buttons
const connectBtn = document.getElementById('bleConnectBtn');
const testAudioBtn = document.getElementById('testAudioBtn');
const startCameraBtn = document.getElementById('startCameraBtn');
const stopCameraBtn = document.getElementById('stopCameraBtn');

// State
let model = null;
let isDetecting = false;
let animationId = null;
let lastSpeechTime = 0;

// BLE State
let bleDevice = null;
let bleCharacteristic = null;
const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const CHAR_UUID    = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';
let lastGridUpdate = 0;

// Initialize grid visualization
const COLS = 5;
const ROWS = 3;
let currentGrid = new Uint8Array(15);
const cells = [];

for (let i = 0; i < 15; i++) {
  const div = document.createElement('div');
  div.className = 'grid-cell';
  div.dataset.val = '0';
  div.innerText = '0';
  matrixContainer.appendChild(div);
  cells.push(div);
}

// Speech Utility
function speak(text, force = false) {
  const now = Date.now();
  // Throttle speech to once every 4 seconds unless forced
  if (force || now - lastSpeechTime > 4000) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.volume = 1;
    utterance.rate = 1.1;
    speechSynthesis.speak(utterance);
    lastSpeechTime = now;
  }
}

// Load Model
async function initApp() {
  try {
    statusOverlay.innerText = "Loading AI Model...";
    speak("Initializing system. Loading AI model.");
    model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
    statusOverlay.innerText = "Model Ready. Press Start.";
    speak("Model ready.");
  } catch (err) {
    console.error(err);
    statusOverlay.innerText = "Error loading model!";
    speak("Error loading AI model. Please check connection.");
  }
}

// Camera Functions
async function startCamera() {
  if (!model) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false
    });
    video.srcObject = stream;
    
    video.onloadeddata = () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      isDetecting = true;
      detectFrame();
      startCameraBtn.disabled = true;
      stopCameraBtn.disabled = false;
      statusOverlay.innerText = "Camera Active - Detecting";
      speak("Camera started. Detection active.");
    };
  } catch (err) {
    console.error(err);
    speak("Error accessing camera. Please grant permissions.");
    statusOverlay.innerText = "Camera Error";
  }
}

function stopCamera() {
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(t => t.stop());
  }
  isDetecting = false;
  if (animationId) cancelAnimationFrame(animationId);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  startCameraBtn.disabled = false;
  stopCameraBtn.disabled = true;
  statusOverlay.innerText = "Camera Stopped";
  speak("Detection stopped.");
  resetGrid();
}

// Main Detection Loop
async function detectFrame() {
  if (!isDetecting) return;
  
  const predictions = await model.detect(video);
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const newGrid = new Uint8Array(15);
  let hasUrgent = false;

  predictions.forEach(pred => {
    // [x, y, width, height]
    const [x, y, w, h] = pred.bbox;
    
    // Draw Box
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, w, h);
    
    // Draw Label
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(x, y - 24, ctx.measureText(pred.class).width + 20, 24);
    ctx.fillStyle = 'white';
    ctx.font = '16px sans-serif';
    ctx.fillText(`${pred.class} (${Math.round(pred.score * 100)}%)`, x + 5, y - 5);

    // Filter relevant objects (ignoring background noise)
    if (pred.score > 0.4) {
      // Proximity logic
      const heightRatio = h / video.videoHeight;
      const xCenter = x + (w / 2);
      
      // Determine column (0-4)
      const colWidth = video.videoWidth / 5;
      let col = Math.floor(xCenter / colWidth);
      if (col > 4) col = 4;
      if (col < 0) col = 0;

      let row = 0; // 0: Far, 1: Mid, 2: Near
      let intensity = 0; // 1, 2, 3
      
      if (heightRatio > 0.6) {
        row = 2; // Near
        intensity = 3;
        hasUrgent = true;
      } else if (heightRatio > 0.3) {
        row = 1; // Mid
        intensity = 2;
      } else {
        row = 0; // Far
        intensity = 1;
      }

      const index = (row * 5) + col;
      // Take the max intensity if multiple objects occupy the same grid slot
      if (intensity > newGrid[index]) {
        newGrid[index] = intensity;
      }
    }
  });

  updateGridUI(newGrid);
  sendBleData(newGrid);

  if (hasUrgent) {
    speak("Warning, near object!");
  }

  animationId = requestAnimationFrame(detectFrame);
}

function updateGridUI(newGrid) {
  for (let i = 0; i < 15; i++) {
    if (currentGrid[i] !== newGrid[i]) {
      currentGrid[i] = newGrid[i];
      cells[i].dataset.val = newGrid[i];
      cells[i].innerText = newGrid[i];
    }
  }
}

function resetGrid() {
  const empty = new Uint8Array(15);
  updateGridUI(empty);
  sendBleData(empty);
}

// BLE Communication
async function connectBle() {
  try {
    speak("Scanning for Vibro Nav belt.", true);
    bleDevice = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: 'VibroNav' }],
      optionalServices: [SERVICE_UUID]
    });

    bleDevice.addEventListener('gattserverdisconnected', () => {
      speak("Belt disconnected.", true);
      connectBtn.innerText = "Connect ESP32";
      connectBtn.classList.remove('secondary');
      connectBtn.classList.add('primary');
      bleCharacteristic = null;
    });

    const server = await bleDevice.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);
    bleCharacteristic = await service.getCharacteristic(CHAR_UUID);
    
    speak("Belt connected successfully.", true);
    connectBtn.innerText = "Disconnect";
    connectBtn.classList.remove('primary');
    connectBtn.classList.add('secondary');

  } catch (error) {
    console.error("BLE Error:", error);
    speak("Bluetooth connection failed.");
  }
}

function sendBleData(gridData) {
  if (!bleCharacteristic) return;
  
  const now = Date.now();
  // Throttle BLE writes to 10Hz (100ms) to prevent congestion
  if (now - lastGridUpdate > 100) {
    // Catch errors silently so it doesn't crash the loop
    bleCharacteristic.writeValueWithoutResponse(gridData).catch(e => console.warn(e));
    lastGridUpdate = now;
  }
}

// Event Listeners
startCameraBtn.addEventListener('click', startCamera);
stopCameraBtn.addEventListener('click', stopCamera);
testAudioBtn.addEventListener('click', () => speak("Audio system operational.", true));

connectBtn.addEventListener('click', () => {
  if (bleDevice && bleDevice.gatt.connected) {
    bleDevice.gatt.disconnect();
  } else {
    connectBle();
  }
});

// Start
initApp();
