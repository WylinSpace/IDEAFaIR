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
      // Fallback: Use COCO-SSD to detect objects over the cropped pointer vector area!
      const predictions = await cocoModel.detect(cropCanvas);
      
      // Filter the best confident prediction
      const best = predictions.sort((a,b) => b.score - a.score)[0];
      
      if (best && best.score > 0.4) {
         let objName = best.class.toUpperCase();
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
