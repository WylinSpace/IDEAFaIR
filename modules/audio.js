// audio.js - Central TTS Engine
let lastSpeechTime = 0;

export function speak(text, force = false) {
  const now = Date.now();
  // Prevent spamming; force overrides throttle
  if (force || (now - lastSpeechTime > 3000)) {
    // Stop ongoing speech
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.volume = 1.0;
    utterance.rate = 1.1; 
    
    window.speechSynthesis.speak(utterance);
    lastSpeechTime = now;
  }
}

export function playChirp(type) {
  // Mock functional audio cues for "Processing started", "Hand detected"
  // For web MVP, we use Web Audio API oscillator
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  
  if (type === 'hand') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } else if (type === 'process') {
    osc.type = 'square';
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  }
}
