// ui.js - Handling DOM, Accessibility Toggles, and State Cache
import { speak } from './audio.js';

let isAccessibilityMode = localStorage.getItem('mode_accessibility') === 'true';
let isPointerMode = localStorage.getItem('mode_feature') === 'pointer'; // pointer vs grid

export function initUI() {
  applyAccessibilityMode(isAccessibilityMode);
  updateStatus(`Feature: ${isPointerMode ? "Pointer Reading" : "Obstacle Grid"}`);
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
}

export function isPointerFeatureActive() {
  return isPointerMode;
}

export function updateStatus(msg) {
  const lbl = document.getElementById('statusOverlay');
  if (lbl) lbl.innerText = msg;
}

function applyAccessibilityMode(enabled) {
  const body = document.body;
  
  if (enabled) {
    body.classList.add('a11y-mode');
    document.querySelectorAll('.btn').forEach(b => {
      b.setAttribute('aria-pressed', 'true');
    });
  } else {
    body.classList.remove('a11y-mode');
    document.querySelectorAll('.btn').forEach(b => {
      b.setAttribute('aria-pressed', 'false');
    });
  }
}
