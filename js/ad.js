// audio-generator.js - Tạo âm thanh cho GoMaster
class AudioGenerator {
  constructor() {
    this.audioContext = null;
    this.sounds = {}; // Lazy-load sounds
    this.init();
  }

  init() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (error) {
      console.error('Web Audio API not supported:', error);
    }
  }

  // Tạo âm thanh đặt quân cờ
  generateStonePlaceSound() {
    const duration = 0.2;
    const sampleRate = this.audioContext.sampleRate;
    const buffer = this.audioContext.createBuffer(1, duration * sampleRate, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const frequency = 800 * Math.exp(-t * 10);
      const envelope = Math.exp(-t * 15);
      data[i] = Math.sin(2 * Math.PI * frequency * t) * envelope * 0.3;
      data[i] += (Math.random() - 0.5) * 0.1 * envelope;
    }

    return buffer;
  }

  // Tạo âm thanh bắt quân (giữ nguyên)
  generateCaptureSound() {
    const duration = 0.4;
    const sampleRate = this.audioContext.sampleRate;
    const buffer = this.audioContext.createBuffer(1, duration * sampleRate, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const freq1 = 600 * Math.exp(-t * 5);
      const freq2 = 400 * Math.exp(-t * 8);
      const envelope = Math.exp(-t * 8);
      
      data[i] = (
        Math.sin(2 * Math.PI * freq1 * t) * 0.4 +
        Math.sin(2 * Math.PI * freq2 * t) * 0.3 +
        (Math.random() - 0.5) * 0.2
      ) * envelope * 0.4;
    }

    return buffer;
  }

  // Tạo âm thanh thành công (cải thiện để mượt hơn)
  generateSuccessSound() {
    const duration = 0.6;
    const sampleRate = this.audioContext.sampleRate;
    const buffer = this.audioContext.createBuffer(1, duration * sampleRate, sampleRate);
    const data = buffer.getChannelData(0);

    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    const noteDuration = duration / notes.length;
    
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const noteIndex = Math.floor(t / noteDuration);
      const localT = t % noteDuration;
      const frequency = notes[noteIndex % notes.length];
      const envelope = Math.max(0, 1 - localT / noteDuration); // Fade out mỗi note
      
      data[i] = Math.sin(2 * Math.PI * frequency * t) * envelope * 0.3;
    }

    return buffer;
  }

  // Tạo âm thanh gợi ý (giữ nguyên)
  generateHintSound() {
    const duration = 0.3;
    const sampleRate = this.audioContext.sampleRate;
    const buffer = this.audioContext.createBuffer(1, duration * sampleRate, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const frequency = 1000 + Math.sin(t * 20) * 200;
      const envelope = Math.sin(t * Math.PI / duration);
      
      data[i] = Math.sin(2 * Math.PI * frequency * t) * envelope * 0.2;
    }

    return buffer;
  }

  // Lazy-load sound nếu chưa có
  getSound(soundName) {
    if (!this.sounds[soundName]) {
      switch (soundName) {
        case 'stonePlace': this.sounds[soundName] = this.generateStonePlaceSound(); break;
        case 'capture': this.sounds[soundName] = this.generateCaptureSound(); break;
        case 'success': this.sounds[soundName] = this.generateSuccessSound(); break;
        case 'hint': this.sounds[soundName] = this.generateHintSound(); break;
        default: console.error('Unknown sound:', soundName); return null;
      }
    }
    return this.sounds[soundName];
  }

  playSound(soundName) {
    if (!this.audioContext) return;
    const buffer = this.getSound(soundName);
    if (!buffer) return;

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);
    source.start();
  }

  // Download dưới dạng WAV (đổi tên hàm cho chính xác)
  downloadAsWAV(soundName, filename) {
    const buffer = this.getSound(soundName);
    if (!buffer) return;

    const wavBlob = this.bufferToWav(buffer);
    
    const url = URL.createObjectURL(wavBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `${soundName}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Hàm chuyển buffer sang WAV (giữ nguyên, nhưng thêm comment)
  bufferToWav(buffer) {
    const length = buffer.length;
    const arrayBuffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(arrayBuffer);
    const channels = 1;
    const sampleRate = buffer.sampleRate;

    // WAV header (giữ nguyên code gốc)
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * 2, true);

    const channelData = buffer.getChannelData(0);
    let offset = 44;
    for (let i = 0; i < length; i++) {
      const sample = Math.max(-1, Math.min(1, channelData[i]));
      view.setInt16(offset, sample * 0x7FFF, true);
      offset += 2;
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }
}

// Khởi tạo và sử dụng
const audioGen = new AudioGenerator();

// Tạo các file âm thanh (sử dụng async để download lần lượt)
window.generateAudioFiles = async () => {
  try {
    audioGen.downloadAsWAV('stonePlace', 'stone-place.wav');
    await new Promise(resolve => setTimeout(resolve, 500)); // Delay để tránh lỗi browser
    audioGen.downloadAsWAV('capture', 'capture.wav');
    await new Promise(resolve => setTimeout(resolve, 500));
    audioGen.downloadAsWAV('success', 'success.wav');
    await new Promise(resolve => setTimeout(resolve, 500));
    audioGen.downloadAsWAV('hint', 'hint.wav');
  } catch (error) {
    console.error('Error generating audio files:', error);
  }
};
