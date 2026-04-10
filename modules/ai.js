// ai.js - Tesseract OCR & Scene Fallback
import { speak, playChirp } from './audio.js';

let isProcessing = false;

// Mock Scene Captioning (since running a visual language model in-browser is too heavy for mobile)
async function describeSceneMock(confidence) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve("Unable to read clear text. Looks like a complex object or scenery.");
    }, 1000);
  });
}

// Extract image data from canvas bounded by the ROI rectangle
function getCroppedImage(canvasCtx, canvasWidth, canvasHeight, roi) {
  // Create a temporary canvas
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = roi.width;
  cropCanvas.height = roi.height;
  const cropCtx = cropCanvas.getContext('2d');
  
  // Extract pixels
  const imgData = canvasCtx.getImageData(roi.x, roi.y, roi.width, roi.height);
  cropCtx.putImageData(imgData, 0, 0);
  
  return cropCanvas.toDataURL('image/png');
}

export async function processROI(videoCanvasCtx, canvasW, canvasH, bboxRect) {
  if (isProcessing) return; // Prevent overlapping heavy AI tasks
  isProcessing = true;
  
  playChirp('process');
  
  // 1. Get cropped image
  const imgDataURI = getCroppedImage(videoCanvasCtx, canvasW, canvasH, bboxRect);
  
  try {
    // 2. Run Tesseract.js (Available via global CDN script in HTML)
    // Tesseract is heavy, it spins up web workers.
    const result = await document.TesseractRecognize(imgDataURI);
    
    let text = result.data.text.trim();
    let confidence = result.data.confidence;
    
    // Decision logic
    if (text.length > 2 && confidence > 60) {
      // Good OCR read
      speak(`Text detected: ${text}`, true);
    } else {
      // Fallback to Scene Captioning 
      speak("Processing scene description...", true);
      const caption = await describeSceneMock(confidence);
      speak(caption, true);
    }
  } catch (err) {
    console.error("AI processing error", err);
  } finally {
    isProcessing = false;
  }
}
