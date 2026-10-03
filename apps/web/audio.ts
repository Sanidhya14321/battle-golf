export class GolfAudio {
  private ctx: AudioContext | null = null;
  private samples = new Map<string, AudioBuffer>();
  private started = false;
  private footTime = 0;
  private alternate = false;
  muted = false;
  volume = 0.7;
  sfx = 0.8;
  music = 0.25;
  private musicGain?: GainNode;
  private loop?: AudioBufferSourceNode;
  async activate() {
    this.ctx ??= new AudioContext();
    await this.ctx.resume();
    if (this.started) return;
    this.started = true;
    const files: Record<string, string> = {
      swing: "strike.ogg",
      step1: "step1.ogg",
      step2: "step2.ogg",
      hit: "hit.ogg",
      pickup: "pickup.ogg",
      checkpoint: "pickup.ogg",
      explosion: "explosion.wav",
      club: "swish.wav",
      respawn: "splash.wav",
      freeze: "swish.wav",
      finish: "finish.wav",
    };
    await Promise.all(
      Object.entries(files).map(async ([name, file]) => {
        try {
          const r = await fetch("/assets/audio/" + file);
          if (r.ok)
            this.samples.set(
              name,
              await this.ctx!.decodeAudioData(await r.arrayBuffer()),
            );
        } catch {}
      }),
    );
    try {
      const r = await fetch("/assets/audio/clubhouse-loop.wav");
      if (r.ok) {
        const buffer = await this.ctx.decodeAudioData(await r.arrayBuffer());
        this.loop = this.ctx.createBufferSource();
        this.loop.buffer = buffer;
        this.loop.loop = true;
        this.musicGain = this.ctx.createGain();
        this.loop.connect(this.musicGain).connect(this.ctx.destination);
        this.setVolumes();
        this.loop.start();
      }
    } catch {}
  }
  setVolumes() {
    if (this.musicGain)
      this.musicGain.gain.value = this.muted ? 0 : this.volume * this.music;
  }
  play(kind: string, gain = 1) {
    if (this.muted || !this.ctx) return;
    const buffer = this.samples.get(kind);
    if (!buffer) return;
    const source = this.ctx.createBufferSource(),
      volume = this.ctx.createGain();
    source.buffer = buffer;
    source.playbackRate.value =
      kind === "swing" ? 0.94 + Math.random() * 0.12 : 1;
    volume.gain.value = this.volume * this.sfx * gain;
    source.connect(volume).connect(this.ctx.destination);
    source.start();
  }
  footsteps(dt: number, speed: number, grounded: boolean) {
    if (!grounded || speed < 0.5) {
      this.footTime = 0;
      return;
    }
    this.footTime += dt;
    if (this.footTime > (0.32 * 6) / Math.max(speed, 3)) {
      this.footTime = 0;
      this.alternate = !this.alternate;
      this.play(this.alternate ? "step1" : "step2", 0.3);
    }
  }
  dispose() {
    void this.ctx?.close();
    this.samples.clear();
  }
}
