// ai.js - Tesseract OCR & Scene Fallback
import { speak, playChirp } from './audio.js';
import { sendBleText } from './ble.js';
import { addBrailleStream } from './ui.js';

let isProcessing = false;

// Extract image data from canvas bounded by the ROI rectangle
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
  if (isProcessing) return; 
  isProcessing = true;
  
  playChirp('process');
  
  const cropCanvas = getCroppedImage(videoCanvasCtx, canvasW, canvasH, bboxRect);
  const imgDataURI = cropCanvas.toDataURL('image/png');
  
  try {
    const result = await document.TesseractRecognize(imgDataURI);
    let text = result.data.text.trim();
    let confidence = result.data.confidence;
    
    if (text.length > 2 && confidence > 60) {
      speak(`Text detected: ${text}`, true);
      
      let payload = text.substring(0, 20).toUpperCase();
      sendBleText(payload);
      addBrailleStream(payload);
      
    } else if (cocoModel) {
      // Fallback: Use COCO-SSD over the FULL frame to prevent hallucinations, 
      // then spatially match the object closest to the finger vector (bboxRect center)
      const predictions = await cocoModel.detect(videoCanvasCtx.canvas);
      
      const pointerX = bboxRect.x + (bboxRect.width / 2);
      const pointerY = bboxRect.y + (bboxRect.height / 2);
      
      let bestObj = null;
      let minDistance = Infinity;

      predictions.forEach(pred => {
         if (pred.score > 0.4) {
            const [x, y, w, h] = pred.bbox;
            const objCenterX = x + w/2;
            const objCenterY = y + h/2;
            const dist = Math.sqrt(Math.pow(pointerX - objCenterX, 2) + Math.pow(pointerY - objCenterY, 2));
            
            // Prioritize objects that the pointer explicitly lands directly inside of
            if (pointerX >= x && pointerX <= x+w && pointerY >= y && pointerY <= y+h) {
                bestObj = pred;
                minDistance = 0; // Absolute hit
            } else if (dist < minDistance && dist < (canvasW * 0.4)) {
                // Secondary fallback: Closest object within range
                bestObj = pred;
                minDistance = dist;
            }
         }
      });
      
      if (bestObj) {
         let objName = bestObj.class.toUpperCase();
         speak(`Detected: ${objName}`, true);
         sendBleText(objName);
         addBrailleStream(objName);
      } else {
         speak("No objects clearly identified.", true);
      }
    }
  } catch (err) {
    console.error("AI processing error", err);
  } finally {
    isProcessing = false;
  }
}
