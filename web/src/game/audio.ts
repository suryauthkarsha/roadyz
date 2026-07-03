import { AUDIO_URLS, SfxName } from "./assets";

/**
 * Lightweight HTMLAudio manager: looping music + ambience beds and
 * fire-and-forget SFX cloned from preloaded elements.
 */
class GameAudio {
  private unlocked = false;
  private muted = false;
  private bgm: HTMLAudioElement | null = null;
  private ambience: HTMLAudioElement | null = null;
  private sfxCache = new Map<SfxName, HTMLAudioElement>();

  /** Must be called from a user gesture (Play button). */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    this.bgm = new Audio(AUDIO_URLS.theme);
    this.bgm.loop = true;
    this.bgm.volume = 0.45;
    this.ambience = new Audio(AUDIO_URLS.ambience);
    this.ambience.loop = true;
    this.ambience.volume = 0.28;
    (Object.keys(AUDIO_URLS) as (keyof typeof AUDIO_URLS)[]).forEach((key) => {
      if (key === "theme" || key === "ambience" || !AUDIO_URLS[key]) return;
      const el = new Audio(AUDIO_URLS[key]);
      el.preload = "auto";
      this.sfxCache.set(key as SfxName, el);
    });
  }

  startRunAudio(): void {
    if (!this.unlocked || this.muted) return;
    this.bgm?.play().catch(() => undefined);
    this.ambience?.play().catch(() => undefined);
  }

  stopMusic(): void {
    this.bgm?.pause();
    if (this.bgm) this.bgm.currentTime = 0;
  }

  duckMusic(): void {
    if (this.bgm) this.bgm.volume = 0.18;
  }

  restoreMusic(): void {
    if (this.bgm) {
      this.bgm.volume = 0.45;
      this.bgm.playbackRate = 1;
    }
  }

  /** Badge Rush tempo lift — subtle playbackRate nudge on the music bed. */
  setMusicRate(rate: number): void {
    if (this.bgm) this.bgm.playbackRate = rate;
  }

  play(name: SfxName, options?: { volume?: number; rate?: number }): void {
    if (!this.unlocked || this.muted) return;
    const base = this.sfxCache.get(name);
    if (!base) return;
    const el = base.cloneNode(true) as HTMLAudioElement;
    el.volume = options?.volume ?? 0.7;
    if (options?.rate) el.playbackRate = options.rate;
    el.play().catch(() => undefined);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.bgm?.pause();
      this.ambience?.pause();
    } else {
      this.bgm?.play().catch(() => undefined);
      this.ambience?.play().catch(() => undefined);
    }
  }

  isMuted(): boolean {
    return this.muted;
  }
}

export const audio = new GameAudio();
