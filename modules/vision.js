// vision.js - Hand tracking and pointing geometry
import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";
import { playChirp, speak } from './audio.js';

let handLandmarker;
let isInitialized = false;

export async function initVision() {
  try {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
    );
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numHands: 1
    });
    isInitialized = true;
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

export function detectFingerPointer(videoElement, videoTime, canvasW, canvasH) {
  if (!isInitialized) return null;
  
  const results = handLandmarker.detectForVideo(videoElement, videoTime);
  
  if (results.landmarks && results.landmarks.length > 0) {
    const hand = results.landmarks[0]; // First hand detected
    
    // Index finger tip is 8, PIP joint is 6
    const tip = hand[8];
    const pip = hand[6];
    
    // We calculate a vector from PIP -> TIP to guess where they are pointing
    const dx = tip.x - pip.x;
    const dy = tip.y - pip.y;
    
    // Extrapolate pointing 20% across the screen
    let targetX = tip.x + (dx * 1.5);
    let targetY = tip.y + (dy * 1.5);
    
    // Clamp to screen bounds
    targetX = Math.max(0, Math.min(1, targetX));
    targetY = Math.max(0, Math.min(1, targetY));
    
    // Define an ROI around the target (e.g. 45% of screen width)
    const roiSize = 0.45; 
    let tX = targetX - (roiSize/2);
    let tY = targetY - (roiSize/2);
    
    // Return pixel coords
    return {
      landmarks: hand,
      fingerTip: {x: tip.x * canvasW, y: tip.y * canvasH },
      target: { x: targetX * canvasW, y: targetY * canvasH },
      roiRect: {
        x: Math.max(0, tX * canvasW),
        y: Math.max(0, tY * canvasH),
        width: roiSize * canvasW,
        height: roiSize * canvasH
      }
    };
  }
  return null;
}
