// WebAudio Procedural Sound Engine for LEGO Brick Snaps, Pops, and Physics Clatter

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.lastSnapTime = 0;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  /**
   * Crisp ABS plastic LEGO brick click/snap sound
   * @param {number} volumeScale - 0.1 to 1.0
   * @param {number} pitchShift - layer or brick size pitch variation
   */
  playBrickSnap(volumeScale = 1.0, pitchShift = 1.0) {
    if (!this.enabled) return;
    const nowMs = performance.now();
    // Rate-limit to max ~38 clicks/sec during high-speed builds so audio stays clean
    if (nowMs - this.lastSnapTime < 26) return;
    this.lastSnapTime = nowMs;

    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    // 1. Short high-frequency plastic transient click
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';

    const baseFreq = 950 * Math.max(0.75, Math.min(1.35, pitchShift)) + (Math.random() * 80 - 40);
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.032);

    gain.gain.setValueAtTime(0.18 * volumeScale, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.038);

    // 2. Secondary hollow stud resonance "tock"
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1750 * pitchShift, now + 0.006);
    osc2.frequency.exponentialRampToValueAtTime(520, now + 0.028);

    gain2.gain.setValueAtTime(0.09 * volumeScale, now + 0.006);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    osc2.connect(gain2);
    gain2.connect(this.ctx.destination);
    osc2.start(now + 0.006);
    osc2.stop(now + 0.032);
  }

  playBrickRemove() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(680, now + 0.06);

    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  playExplosion() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // Low boom + cascade of plastic clatters
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.45);

    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.5);

    // Scatter clatter clicks
    for (let i = 0; i < 14; i++) {
      setTimeout(() => {
        this.playBrickSnap(0.55, 0.8 + Math.random() * 0.5);
      }, 45 + i * 35 + Math.random() * 40);
    }
  }
}
