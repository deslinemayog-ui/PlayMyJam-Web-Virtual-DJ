// AI DJ Voice Host Service
// Provides live club MC & radio host voiceovers for PlayMyJam Virtual DJ

export interface DJVoiceOptions {
  enabled: boolean;
  volume: number; // 0 to 1
  style: 'hype' | 'smooth';
}

const HYPE_INTRO_TEMPLATES = [
  "PlayMyJam in the mix! Up next, we're turning it up with {title} by {artist} — let's go!",
  "Big vibes right now! Switching gears on deck, get ready for {title} by {artist}!",
  "Make some noise! Dropping that fresh sound right here: {title} by {artist}!",
  "Keep that energy moving! We're rolling into {title} by {artist} — turn the bass up!",
  "Exclusive drop on PlayMyJam! Here comes {title} by {artist}!",
  "You're locked into PlayMyJam! Fresh track coming in hot — {title} by {artist}!"
];

const SMOOTH_INTRO_TEMPLATES = [
  "Smooth transition on deck. Next up, we have {title} by {artist}. Enjoy the groove.",
  "Keeping the rhythm alive with {title} by {artist}.",
  "You're listening to PlayMyJam. Coming in next is {title} by {artist}."
];

class AIDJVoiceService {
  private isSpeaking = false;
  private options: DJVoiceOptions = {
    enabled: true,
    volume: 0.9,
    style: 'hype'
  };

  public setOptions(newOptions: Partial<DJVoiceOptions>) {
    this.options = { ...this.options, ...newOptions };
  }

  public getOptions(): DJVoiceOptions {
    return { ...this.options };
  }

  public getIsSpeaking(): boolean {
    return this.isSpeaking;
  }

  /**
   * Generates a hype MC intro string for the upcoming song
   */
  public generateIntroScript(title: string, artist: string, style: 'hype' | 'smooth' = 'hype'): string {
    const cleanTitle = title || 'a new track';
    const cleanArtist = artist && artist !== 'Unknown' ? artist : 'an exclusive artist';
    const templates = style === 'smooth' ? SMOOTH_INTRO_TEMPLATES : HYPE_INTRO_TEMPLATES;
    const template = templates[Math.floor(Math.random() * templates.length)];
    return template.replace('{title}', cleanTitle).replace('{artist}', cleanArtist);
  }

  /**
   * Speaks the announcement using the browser's speech synthesis
   * with custom pitch, rate, and volume shaped for an energetic DJ MC.
   */
  public async speak(text: string, onStart?: () => void, onEnd?: () => void): Promise<void> {
    if (!this.options.enabled) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      console.warn('Speech synthesis not supported on this browser');
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.volume = this.options.volume;
      utterance.rate = 1.05; // Slightly faster for radio/club pacing
      utterance.pitch = 1.02; // Slightly energetic pitch

      // Pick the best available energetic English voice
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find(
        (v) =>
          v.lang.startsWith('en') &&
          (v.name.includes('Natural') ||
            v.name.includes('Daniel') ||
            v.name.includes('Google') ||
            v.name.includes('Samantha') ||
            v.name.includes('Alex'))
      ) || voices.find((v) => v.lang.startsWith('en')) || voices[0];

      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      utterance.onstart = () => {
        this.isSpeaking = true;
        onStart?.();
      };

      utterance.onend = () => {
        this.isSpeaking = false;
        onEnd?.();
        resolve();
      };

      utterance.onerror = (e) => {
        console.warn('AI DJ speech synthesis error:', e);
        this.isSpeaking = false;
        onEnd?.();
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    });
  }

  /**
   * Announces an upcoming track transition with audio ducking support
   */
  public async announceTrackTransition(
    nextSong: { title?: string; artist?: string },
    onDuckAudio?: (duck: boolean) => void
  ): Promise<void> {
    if (!this.options.enabled || !nextSong?.title) return;

    const script = this.generateIntroScript(
      nextSong.title,
      nextSong.artist || 'PlayMyJam Artist',
      this.options.style
    );

    // Duck the music volume slightly while the AI DJ talks
    onDuckAudio?.(true);

    await this.speak(
      script,
      undefined,
      () => {
        // Restore music volume when AI DJ finishes talking
        onDuckAudio?.(false);
      }
    );
  }
}

export const aiDJVoiceService = new AIDJVoiceService();
