// audio-generator.js - Tạo âm thanh cho GoMaster
class AudioGenerator {
  constructor() {
    this.audioContext = null;
    this.sounds = {};
    this.init();
  }

  init() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.generateSounds();
    } catch (error) {
      console.log('Web Audio API not supported');
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
      // Tạo âm "tock" ngắn với frequency decay
      const frequency = 800 * Math.exp(-t * 10);
      const envelope = Math.exp(-t * 15);
      data[i] = Math.sin(2 * Math.PI * frequency * t) * envelope * 0.3;
      
      // Thêm noise nhẹ để mô phỏng âm đá chạm bàn
      data[i] += (Math.random() - 0.5) * 0.1 * envelope;
    }

    return buffer;
  }

  // Tạo âm thanh bắt quân
  generateCaptureSound() {
    const duration = 0.4;
    const sampleRate = this.audioContext.sampleRate;
    const buffer = this.audioContext.createBuffer(1, duration * sampleRate, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      // Âm thanh phức tạp hơn cho việc bắt quân
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

  // Tạo âm thanh thành công
  generateSuccessSound() {
    const duration = 0.6;
    const sampleRate = this.audioContext.sampleRate;
    const buffer = this.audioContext.createBuffer(1, duration * sampleRate, sampleRate);
    const data = buffer.getChannelData(0);

    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const noteIndex = Math.floor(t * 5) % notes.length;
      const frequency = notes[noteIndex];
      const envelope = Math.max(0, 1 - t * 2);
      
      data[i] = Math.sin(2 * Math.PI * frequency * t) * envelope * 0.3;
    }

    return buffer;
  }

  // Tạo âm thanh gợi ý
  generateHintSound() {
    const duration = 0.3;
    const sampleRate = this.audioContext.sampleRate;
    const buffer = this.audioContext.createBuffer(1, duration * sampleRate, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const frequency = 1000 + Math.sin(t * 20) * 200; // Frequency modulation
      const envelope = Math.sin(t * Math.PI / duration);
      
      data[i] = Math.sin(2 * Math.PI * frequency * t) * envelope * 0.2;
    }

    return buffer;
  }

  generateSounds() {
    this.sounds = {
      stonePlace: this.generateStonePlaceSound(),
      capture: this.generateCaptureSound(),
      success: this.generateSuccessSound(),
      hint: this.generateHintSound()
    };
  }

  playSound(soundName) {
    if (!this.audioContext || !this.sounds[soundName]) return;

    const source = this.audioContext.createBufferSource();
    source.buffer = this.sounds[soundName];
    source.connect(this.audioContext.destination);
    source.start();
  }

  // Tạo file MP3 (cần thư viện bổ sung)
  async downloadAsMP3(soundName, filename) {
    if (!this.sounds[soundName]) return;

    // Chuyển đổi buffer thành WAV blob
    const wavBlob = this.bufferToWav(this.sounds[soundName]);
    
    // Tạo link download
    const url = URL.createObjectURL(wavBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `${soundName}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  bufferToWav(buffer) {
    const length = buffer.length;
    const arrayBuffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(arrayBuffer);
    const channels = 1;
    const sampleRate = buffer.sampleRate;

    // WAV header
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

    // Convert float samples to 16-bit PCM
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

// Tạo các file âm thanh
window.generateAudioFiles = () => {
  audioGen.downloadAsMP3('stonePlace', 'stone-place.wav');
  setTimeout(() => audioGen.downloadAsMP3('capture', 'capture.wav'), 500);
  setTimeout(() => audioGen.downloadAsMP3('success', 'success.wav'), 1000);
  setTimeout(() => audioGen.downloadAsMP3('hint', 'hint.wav'), 1500);
};
