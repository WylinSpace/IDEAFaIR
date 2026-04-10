// ui.js - Handling DOM, Simulators, and State
import { speak } from './audio.js';

let isAccessibilityMode = localStorage.getItem('mode_accessibility') === 'true';
let isPointerMode = localStorage.getItem('mode_feature') === 'pointer'; 

const brailleDict = {
  'A':0b000001, 'B':0b000011, 'C':0b001001, 'D':0b011001, 'E':0b010001,
  'F':0b001011, 'G':0b011011, 'H':0b010011, 'I':0b001010, 'J':0b011010,
  'K':0b000101, 'L':0b000111, 'M':0b001101, 'N':0b011101, 'O':0b010101,
  'P':0b001111, 'Q':0b011111, 'R':0b010111, 'S':0b001110, 'T':0b011110,
  'U':0b100101, 'V':0b100111, 'W':0b111010, 'X':0b101101, 'Y':0b111101, 'Z':0b110101
};

const mapCells = [];

export function initUI() {
  applyAccessibilityMode(isAccessibilityMode);
  updateStatus(`Feature: ${isPointerMode ? "Pointer Reading" : "Obstacle Grid"}`);
  
  // Init 15 grid slots
  const mk = document.getElementById('matrixGrid');
  if (mk) {
    for(let i=0; i<15; i++) {
        let d = document.createElement('div');
        d.className = 'grid-cell';
        d.dataset.val = '0';
        mk.appendChild(d);
        mapCells.push(d);
    }
  }
  
  updateSimCards();
}

export function updateMapSimulator(gridData) {
  for(let i=0; i<15; i++) {
     if (mapCells[i]) mapCells[i].dataset.val = gridData[i];
  }
}

// Braille string playback on Web UI (Mirrors ESP32 timing)
let webBrailleQueue = "";
let brailleLoopActive = false;

export function addBrailleStream(str) {
  webBrailleQueue += str + " ";
  if (!brailleLoopActive) loopBrailleWeb();
}

function loopBrailleWeb() {
  if (webBrailleQueue.length === 0) {
    brailleLoopActive = false;
    document.getElementById('brailleLetter').innerText = "-";
    for(let i=1; i<=6; i++) {
        document.getElementById('bdot'+i).classList.remove('active');
    }
    return;
  }
  
  brailleLoopActive = true;
  let c = webBrailleQueue[0].toUpperCase();
  webBrailleQueue = webBrailleQueue.substring(1);
  
  document.getElementById('brailleLetter').innerText = c;
  
  // Reset dots
  for(let i=1; i<=6; i++) {
     document.getElementById('bdot'+i).classList.remove('active');
  }
  
  if (brailleDict[c]) {
     let mask = brailleDict[c];
     if (mask & (1<<0)) document.getElementById('bdot1').classList.add('active'); // bit 0 -> dot 1
     if (mask & (1<<1)) document.getElementById('bdot2').classList.add('active');
     if (mask & (1<<2)) document.getElementById('bdot3').classList.add('active');
     if (mask & (1<<3)) document.getElementById('bdot4').classList.add('active');
     if (mask & (1<<4)) document.getElementById('bdot5').classList.add('active');
     if (mask & (1<<5)) document.getElementById('bdot6').classList.add('active');
  }
  
  setTimeout(loopBrailleWeb, 1000); // 1 second pulse
}

export function toggleAccessibleMode() {
  isAccessibilityMode = !isAccessibilityMode;
  localStorage.setItem('mode_accessibility', isAccessibilityMode);
  applyAccessibilityMode(isAccessibilityMode);
  speak(`Accessibility mode ${isAccessibilityMode ? 'ON' : 'OFF'}`, true);
}

export function toggleFeatureMode() {
  isPointerMode = !isPointerMode;
  localStorage.setItem('mode_feature', isPointerMode ? 'pointer' : 'grid');
  speak(`Switched to ${isPointerMode ? 'Reader' : 'Navigation'} mode`, true);
  updateStatus(`Feature: ${isPointerMode ? "Pointer Reading" : "Obstacle Grid"}`);
  updateSimCards();
}

export function isPointerFeatureActive() { return isPointerMode; }
export function updateStatus(msg) {
  const lbl = document.getElementById('statusOverlay');
  if (lbl) lbl.innerText = msg;
}

function updateSimCards() {
    const sm = document.getElementById('simMap');
    const sb = document.getElementById('simBraille');
    if (!sm || !sb) return;
    if (isPointerMode) {
        sb.classList.remove('hidden');
        sm.classList.add('hidden');
    } else {
        sm.classList.remove('hidden');
        sb.classList.add('hidden');
    }
}

function applyAccessibilityMode(enabled) {
  const body = document.body;
  if (enabled) {
    body.classList.add('a11y-mode');
  } else {
    body.classList.remove('a11y-mode');
  }
}
