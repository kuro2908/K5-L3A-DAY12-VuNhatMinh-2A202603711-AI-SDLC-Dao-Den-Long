// Tiny WebAudio synth: night ambience + sound effects, no audio files (see CREDITS.md).
export type Sfx = "pick" | "light" | "pulse" | "hit" | "jump" | "dash" | "win" | "lose" | "spawn" | "tick" | "charm" | "steal";

export class Audio3 {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private volume = 0.6;

  /** Must be called from a user gesture (browsers block audio before). */
  resume(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.startMusic();
    }
    void this.ctx.resume();
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  setMusic(on: boolean): void {
    if (this.music && this.ctx) this.music.gain.setTargetAtTime(on ? 0.16 : 0.04, this.ctx.currentTime, 0.4);
  }

  private startMusic(): void {
    const c = this.ctx!;
    this.music = c.createGain();
    this.music.gain.value = 0.04;
    this.music.connect(this.master!);
    // slow A-minor pad: three detuned triangle voices with a gentle tremolo
    for (const [f, d] of [[110, 0], [164.81, 4], [220, -3], [261.63, 2]] as [number, number][]) {
      const o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
      o.type = "triangle"; o.frequency.value = f; o.detune.value = d;
      g.gain.value = 0.25;
      lfo.frequency.value = 0.07 + Math.random() * 0.1; lg.gain.value = 0.12;
      lfo.connect(lg); lg.connect(g.gain);
      o.connect(g); g.connect(this.music);
      o.start(); lfo.start();
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.3, slideTo?: number, delay = 0): void {
    if (!this.ctx || !this.master) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol = 0.3, from = 2000, to = 300): void {
    if (!this.ctx || !this.master) return;
    const c = this.ctx, n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buf; f.type = "lowpass"; f.frequency.setValueAtTime(from, c.currentTime); f.frequency.exponentialRampToValueAtTime(to, c.currentTime + dur);
    g.gain.value = vol; s.connect(f); f.connect(g); g.connect(this.master); s.start();
  }

  play(s: Sfx): void {
    switch (s) {
      case "pick": this.tone(880, 0.12, "sine", 0.25, 1320); break;
      case "light": [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.5, "triangle", 0.25, undefined, i * 0.08)); break;
      case "pulse": this.tone(300, 0.45, "sine", 0.35, 900); this.noise(0.35, 0.15, 4000, 500); break;
      case "hit": this.noise(0.3, 0.5, 900, 100); this.tone(120, 0.3, "square", 0.25, 50); break;
      case "jump": this.tone(300, 0.15, "square", 0.12, 600); break;
      case "dash": this.noise(0.2, 0.25, 3000, 600); break;
      case "win": [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.6, "triangle", 0.3, undefined, i * 0.12)); break;
      case "lose": [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.6, "sawtooth", 0.15, undefined, i * 0.18)); break;
      case "spawn": this.tone(90, 0.5, "sawtooth", 0.2, 60); break;
      case "tick": this.tone(1000, 0.06, "square", 0.12); break;
      case "charm": this.tone(660, 0.3, "triangle", 0.3, 1320); break;
      case "steal": this.tone(500, 0.3, "triangle", 0.25, 200); break;
    }
  }
}
