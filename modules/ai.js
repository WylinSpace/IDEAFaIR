// ai.js - Tesseract OCR & COCO Fallback (Hunting Mode)
import { speak, playChirp } from './audio.js';
import { sendBleText } from './ble.js';
import { addBrailleStream } from './ui.js';

function getCroppedImage(canvasCtx, canvasW, canvasH, roi) {
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = roi.width;
  cropCanvas.height = roi.height;
  const cropCtx = cropCanvas.getContext('2d');
  
  const imgData = canvasCtx.getImageData(roi.x, roi.y, roi.width, roi.height);
  cropCtx.putImageData(imgData, 0, 0);
  
  return cropCanvas;
}

export async function processROI(videoCanvasCtx, canvasW, canvasH, bboxRect, cocoModel) {
  const cropCanvas = getCroppedImage(videoCanvasCtx, canvasW, canvasH, bboxRect);
  const imgDataURI = cropCanvas.toDataURL('image/png');
  
  try {
    const result = await document.TesseractRecognize(imgDataURI);
    let text = result.data.text.trim();
    let confidence = result.data.confidence;
    
    // Check OCR Confidence
    if (text.length >= 2 && confidence > 60) {
      speak(`Text detected: ${text}`, true);
      let payload = text.substring(0, 20).toUpperCase();
      sendBleText(payload);
      addBrailleStream(payload);
      return true; // Success!
    } 
    
    if (cocoModel) {
      // Check Object detection Confidence specifically on the Finger CROP box
      const predictions = await cocoModel.detect(cropCanvas);
      
      // Filter predictions natively by highest score first
      const best = predictions.sort((a,b) => b.score - a.score)[0];
      
      if (best && best.score > 0.60) { // Enforce user-requested 60% threshold
         let objName = best.class.toUpperCase();
         speak(`Detected: ${objName}`, true);
         sendBleText(objName);
         addBrailleStream(objName);
         return true; // Success!
      }
    }
  } catch (err) {
    console.error("AI processing error", err);
  }
  
  // Return false if nothing >60% was found, forcing the main loop to grab a new picture!
  return false; 
}
