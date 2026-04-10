// ble.js - Two-way Bluetooth connecting arrays and buttons
import { speak } from './audio.js';
import { toggleAccessibleMode, toggleFeatureMode } from './ui.js';

const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const CHAR_TX_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8'; // write to ESP (Grid array)
const CHAR_TXT_UUID= '87654321-1234-5678-1234-56789abcdef0'; // Write Text to ESP (Braille strings)
const CHAR_RX_UUID = '12345678-1234-5678-1234-56789abcdef0'; // Read/Notify from ESP (Buttons)

let bleDevice = null;
let txChar = null;
let txTextChar = null;
let rxChar = null;
let lastUpdate = 0;

export async function connectBLE() {
  try {
    speak("Scanning for Vibro Nav belt.", true);
    bleDevice = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: 'VibroNav' }],
      optionalServices: [SERVICE_UUID]
    });

    bleDevice.addEventListener('gattserverdisconnected', onDisconnect);

    const server = await bleDevice.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);
    
    // Get TX Characteristic -> to send 15 pin grid data
    txChar = await service.getCharacteristic(CHAR_TX_UUID);
    
    // Get TX Characteristic -> to send raw Strings for Braille interpretation
    txTextChar = await service.getCharacteristic(CHAR_TXT_UUID);

    // Get RX Characteristic -> to listen to hardware buttons
    rxChar = await service.getCharacteristic(CHAR_RX_UUID);
    await rxChar.startNotifications();
    rxChar.addEventListener('characteristicvaluechanged', handleEspNotification);
    
    speak("Belt connected successfully.", true);
    return true;
  } catch (error) {
    console.error("BLE Error:", error);
    speak("Bluetooth connection failed.");
    return false;
  }
}

export function disconnectBLE() {
  if (bleDevice && bleDevice.gatt.connected) {
    bleDevice.gatt.disconnect();
  }
}

export function sendBleData(gridData) {
  if (!txChar) return;
  const now = Date.now();
  if (now - lastUpdate > 100) {
    txChar.writeValueWithoutResponse(gridData).catch(()=>{});
    lastUpdate = now;
  }
}

export function sendBleText(textPayload) {
  if (!txTextChar) return;
  console.log("Sending BLE Braille Stream:", textPayload);
  const encoder = new TextEncoder();
  const data = encoder.encode(textPayload);
  // Send the string as a UInt8 packet
  txTextChar.writeValueWithoutResponse(data).catch((e)=>console.error("BLE TXT Err:", e));
}

function onDisconnect() {
  speak("Belt disconnected.", true);
  txChar = null;
  txTextChar = null;
  rxChar = null;
  window.dispatchEvent(new Event('ble-disconnected'));
}

function handleEspNotification(event) {
  const value = event.target.value;
  const decoder = new TextDecoder('utf-8');
  const msg = decoder.decode(value);
  
  if (msg.includes("BTN1")) {
    toggleAccessibleMode();
  } else if (msg.includes("BTN2")) {
    toggleFeatureMode();
  }
}
