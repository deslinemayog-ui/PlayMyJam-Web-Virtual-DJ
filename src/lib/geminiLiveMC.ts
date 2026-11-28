import type { AIMCAccent, AIMCEnergy, AIMCVoiceName } from '@/lib/playServerApi';

export interface GeminiLiveSessionConfig {
  apiKey: string;
  djName: string;
  mcName: string;
  aboutLive: string;
  accent: AIMCAccent;
  voiceName: AIMCVoiceName;
  energy: AIMCEnergy;
}

export interface GeminiLiveTurnCallbacks {
  onFirstAudio?: (firstAudioMs: number) => void;
  onTranscriptDelta?: (fullTranscript: string) => void;
  onError?: (error: string) => void;
}

export interface GeminiLiveTurnResult {
  transcript: string;
  firstAudioMs: number;
  totalMs: number;
  modelUsed: string;
  receivedAudio: boolean;
}

const LIVE_MODELS = [
  'models/gemini-3.1-flash-live-preview',
  'models/gemini-3.8-live',
  'models/gemini-2.5-flash-native-audio-latest',
];

const MAX_TURNS_PER_SESSION = 10;
const IDLE_SLEEP_MS = 2 * 60 * 1000; // Auto-sleep idle WebSocket after 2 minutes of silence

const ACCENT_DIRECTIONS: Record<AIMCAccent, string> = {
  zim:
    'Always speak in a warm, energetic, authentic Zimbabwean English accent from Harare like a real live club DJ hype MC on the microphone! Naturally sprinkle tasteful Zimbabwean flavor like "Ehhh!", "Haaa!", "Shaa!", "Big up!", "Moto!", "Pamberi!", "Bho here!" without overdoing it so everyone understands.',
  sa:
    'Always speak in a vibrant South African Johannesburg Amapiano club MC accent with natural flavor like "Eish!", "Sharp sharp!", "Awe!", "Yoh!", "Groove is on!".',
  jamaican:
    'Always speak in an energetic Jamaican dancehall sound-system selector/MC accent with expressions like "Big up!", "Pull up!", "Bless up!", "Massive!".',
  us_club:
    'Always speak in a high-energy American nightclub DJ hype MC voice ("Yo!", "Let\'s go!", "Make some noise!").',
  uk_club:
    'Always speak in a charismatic London UK club MC accent ("Big up!", "Oi oi!", "Locked in!").',
};

const ENERGY_DIRECTIONS: Record<AIMCEnergy, string> = {
  hype: 'High-energy, hyped, upbeat nightclub MC delivery with punchy rhythm.',
  radio: 'Smooth, confident, charismatic FM radio DJ host delivery.',
  chill: 'Warm, relaxed, friendly lounge host delivery.',
};

function buildLiveSystemInstruction(cfg: GeminiLiveSessionConfig): string {
  const accentDir = ACCENT_DIRECTIONS[cfg.accent] || ACCENT_DIRECTIONS.zim;
  const energyDir = ENERGY_DIRECTIONS[cfg.energy] || ENERGY_DIRECTIONS.hype;
  const djName = (cfg.djName || 'the DJ').slice(0, 50);
  const mcName = (cfg.mcName || 'MC Tino').slice(0, 40);
  const aboutLive = (
    cfg.aboutLive ||
    'Here we play nonstop club hits and take live song requests when viewers drop a gift!'
  ).slice(0, 320);

  return [
    `You are ${mcName}, the live real-time AI MC hosting a TikTok LIVE DJ session for DJ ${djName}.`,
    accentDir,
    `Delivery style: ${energyDir}`,
    `What this live is about: ${aboutLive}`,
    `Strict live-MC rules:`,
    `- Respond IMMEDIATELY in voice as the live MC — NEVER explain what you are doing, NEVER say "Sure" or "Okay", NEVER read stage directions.`,
    `- Keep every shoutout super punchy: 1 to 2 short sentences (maximum 25 words) so it rides cleanly over the DJ beat.`,
    `- Never repeat the exact same opening phrase twice in a row — keep every welcome, comment reply, and gift shoutout fresh and spontaneous.`,
    `- When answering viewer comments/questions, mention the viewer by name, react naturally to what they wrote (or answer accurately using the current track/live rules), and keep the party energy high.`,
  ].join('\n');
}

function getConfigFingerprint(cfg: GeminiLiveSessionConfig): string {
  return JSON.stringify([
    cfg.apiKey,
    cfg.djName,
    cfg.mcName,
    cfg.aboutLive,
    cfg.accent,
    cfg.voiceName,
    cfg.energy,
  ]);
}

function decodeBase64Pcm16ToFloat32(base64: string): Float32Array {
  const binary = window.atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const sampleCount = Math.floor(len / 2);
  const floats = new Float32Array(sampleCount);
  const view = new DataView(bytes.buffer, bytes.byteOffset, sampleCount * 2);
  for (let i = 0; i < sampleCount; i++) {
    floats[i] = view.getInt16(i * 2, true) / 32768;
  }
  return floats;
}

/**
 * Persistent real-time Gemini Live Native Audio (`BidiGenerateContent`) MC streamer.
 * Keeps a warm WebSocket open so viewer comments, joins, and gifts begin speaking
 * in ~0.7 seconds via gapless 24 kHz Web Audio PCM playback.
 */
export class GeminiLiveMCClient {
  private ws: WebSocket | null = null;
  private isReady = false;
  private configFingerprint = '';
  private lastConfig: GeminiLiveSessionConfig | null = null;
  private activeModel = LIVE_MODELS[0];
  private connectPromise: Promise<void> | null = null;
  private turnCount = 0;
  private idleSleepTimer: ReturnType<typeof setTimeout> | null = null;
  private onConnectionStateChange?: (connected: boolean, model?: string) => void;

  // Web Audio real-time 24 kHz PCM streamer
  private audioCtx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private activeSources = new Set<AudioBufferSourceNode>();
  private nextPlayTime = 0;
  private volume = 0.95;

  // Current turn state
  private activeTurn: {
    startedAt: number;
    firstAudioMs: number;
    receivedAudio: boolean;
    transcript: string;
    turnComplete: boolean;
    callbacks?: GeminiLiveTurnCallbacks;
    resolve: (res: GeminiLiveTurnResult) => void;
    reject: (err: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  } | null = null;

  constructor(onConnectionStateChange?: (connected: boolean, model?: string) => void) {
    this.onConnectionStateChange = onConnectionStateChange;
  }

  public setVolume(volPercent: number): void {
    this.volume = Math.max(0.1, Math.min(1, (Number(volPercent) || 95) / 100));
    if (this.gainNode && this.audioCtx && this.audioCtx.state !== 'closed') {
      this.gainNode.gain.setTargetAtTime(this.volume, this.audioCtx.currentTime, 0.02);
    }
  }

  public isConnected(): boolean {
    return this.isReady && this.ws?.readyState === WebSocket.OPEN;
  }

  private ensureAudioContext(): AudioContext {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtx({ sampleRate: 24000 });
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = this.volume;
      this.gainNode.connect(this.audioCtx.destination);
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  private stopScheduledAudio(): void {
    for (const src of this.activeSources) {
      try {
        src.onended = null;
        src.stop();
        src.disconnect();
      } catch {
        // ignore already stopped
      }
    }
    this.activeSources.clear();
    this.nextPlayTime = 0;
  }

  private clearIdleSleepTimer(): void {
    if (this.idleSleepTimer) {
      clearTimeout(this.idleSleepTimer);
      this.idleSleepTimer = null;
    }
  }

  private scheduleIdleSleep(): void {
    this.clearIdleSleepTimer();
    this.idleSleepTimer = setTimeout(() => {
      this.idleSleepTimer = null;
      if (!this.activeTurn && this.ws) {
        this.disconnect();
      }
    }, IDLE_SLEEP_MS);
  }

  private maybeFinishActiveTurn(): void {
    const turn = this.activeTurn;
    if (!turn || !turn.turnComplete) return;
    if (this.activeSources.size > 0) return;

    clearTimeout(turn.timeoutId);
    this.activeTurn = null;
    this.turnCount += 1;

    turn.resolve({
      transcript: turn.transcript.trim(),
      firstAudioMs: turn.firstAudioMs,
      totalMs: Date.now() - turn.startedAt,
      modelUsed: this.activeModel,
      receivedAudio: turn.receivedAudio,
    });

    // Credit Protection #1: Auto-reset session every 10 turns so conversation history never snowballs
    if (this.turnCount >= MAX_TURNS_PER_SESSION && this.lastConfig) {
      const cfgToRefresh = this.lastConfig;
      this.disconnect();
      // Quietly pre-warm a fresh zero-history WebSocket in the background
      this.ensureConnected(cfgToRefresh).catch(() => {});
    } else {
      // Credit Protection #2: Auto-sleep WebSocket after 2 minutes of silence
      this.scheduleIdleSleep();
    }
  }

  private schedulePcmChunk(base64Data: string, mimeType?: string): void {
    const ctx = this.ensureAudioContext();
    if (!this.gainNode) return;

    const rateMatch = String(mimeType || '').match(/rate=(\d+)/i);
    const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
    const floats = decodeBase64Pcm16ToFloat32(base64Data);
    if (floats.length === 0) return;

    const buffer = ctx.createBuffer(1, floats.length, sampleRate);
    buffer.copyToChannel(floats, 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gainNode);

    const now = ctx.currentTime;
    // Small 45ms jitter cushion on the very first chunk so streaming playback stays glitch-free
    const startTime = Math.max(now + 0.045, this.nextPlayTime);
    this.nextPlayTime = startTime + buffer.duration;

    this.activeSources.add(source);
    source.onended = () => {
      this.activeSources.delete(source);
      try {
        source.disconnect();
      } catch {
        // ignore
      }
      this.maybeFinishActiveTurn();
    };
    source.start(startTime);
  }

  private connectWithModel(cfg: GeminiLiveSessionConfig, model: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(cfg.apiKey)}`;
      const ws = new WebSocket(wsUrl);
      let settled = false;

      const setupTimeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          try {
            ws.close();
          } catch {
            // ignore
          }
          reject(new Error(`Gemini Live setup timed out (${model})`));
        }
      }, 9000);

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            setup: {
              model,
              generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: {
                      voiceName: cfg.voiceName || 'Fenrir',
                    },
                  },
                },
              },
              outputAudioTranscription: {},
              systemInstruction: {
                parts: [{ text: buildLiveSystemInstruction(cfg) }],
              },
            },
          })
        );
      };

      ws.onmessage = async (event) => {
        let rawText = '';
        try {
          if (typeof event.data === 'string') {
            rawText = event.data;
          } else if (event.data instanceof Blob) {
            rawText = await event.data.text();
          } else if (event.data instanceof ArrayBuffer) {
            rawText = new TextDecoder().decode(event.data);
          }
        } catch {
          return;
        }
        if (!rawText) return;

        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(rawText);
        } catch {
          return;
        }

        if (msg.setupComplete && !settled) {
          settled = true;
          clearTimeout(setupTimeout);
          this.ws = ws;
          this.isReady = true;
          this.turnCount = 0;
          this.activeModel = model;
          this.scheduleIdleSleep();
          this.onConnectionStateChange?.(true, model);
          resolve();
          return;
        }

        const serverContent = msg.serverContent as
          | {
              modelTurn?: {
                parts?: Array<{
                  text?: string;
                  inlineData?: { mimeType?: string; data?: string };
                }>;
              };
              outputTranscription?: { text?: string };
              turnComplete?: boolean;
              interrupted?: boolean;
            }
          | undefined;

        if (!serverContent || !this.activeTurn) return;

        if (serverContent.interrupted) {
          this.stopScheduledAudio();
          return;
        }

        const parts = serverContent.modelTurn?.parts || [];
        for (const part of parts) {
          if (part.inlineData?.data) {
            if (!this.activeTurn.receivedAudio) {
              this.activeTurn.receivedAudio = true;
              this.activeTurn.firstAudioMs = Date.now() - this.activeTurn.startedAt;
              this.activeTurn.callbacks?.onFirstAudio?.(this.activeTurn.firstAudioMs);
            }
            this.schedulePcmChunk(part.inlineData.data, part.inlineData.mimeType);
          }
        }

        if (serverContent.outputTranscription?.text) {
          this.activeTurn.transcript += serverContent.outputTranscription.text;
          this.activeTurn.callbacks?.onTranscriptDelta?.(this.activeTurn.transcript.trim());
        }

        if (serverContent.turnComplete) {
          this.activeTurn.turnComplete = true;
          this.maybeFinishActiveTurn();
        }
      };

      ws.onclose = (ev) => {
        clearTimeout(setupTimeout);
        if (!settled) {
          settled = true;
          reject(new Error(`Gemini Live closed (${ev.code}${ev.reason ? `: ${ev.reason}` : ''})`));
          return;
        }
        if (this.ws === ws) {
          this.ws = null;
          this.isReady = false;
          this.onConnectionStateChange?.(false);
        }
        if (this.activeTurn) {
          const turn = this.activeTurn;
          clearTimeout(turn.timeoutId);
          this.activeTurn = null;
          if (turn.receivedAudio) {
            // Audio already streamed — let remaining scheduled buffers play out cleanly
            turn.turnComplete = true;
            turn.resolve({
              transcript: turn.transcript.trim(),
              firstAudioMs: turn.firstAudioMs,
              totalMs: Date.now() - turn.startedAt,
              modelUsed: this.activeModel,
              receivedAudio: true,
            });
          } else {
            turn.reject(new Error('Gemini Live connection closed before speaking.'));
          }
        }
      };

      ws.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(setupTimeout);
          reject(new Error(`Gemini Live WebSocket error (${model})`));
        }
      };
    });
  }

  public async ensureConnected(cfg: GeminiLiveSessionConfig): Promise<void> {
    if (!cfg.apiKey) {
      throw new Error('Missing Gemini API key');
    }

    this.lastConfig = cfg;
    const nextFingerprint = getConfigFingerprint(cfg);
    if (this.isConnected() && this.configFingerprint === nextFingerprint) {
      this.scheduleIdleSleep();
      return;
    }

    if (this.configFingerprint !== nextFingerprint) {
      this.disconnect();
      this.configFingerprint = nextFingerprint;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = (async () => {
      let lastError: Error | null = null;
      for (const model of LIVE_MODELS) {
        try {
          await this.connectWithModel(cfg, model);
          return;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
        }
      }
      throw lastError || new Error('Could not connect to Gemini Live Audio.');
    })();

    try {
      await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  public async speakPrompt(
    cfg: GeminiLiveSessionConfig,
    promptText: string,
    callbacks?: GeminiLiveTurnCallbacks
  ): Promise<GeminiLiveTurnResult> {
    // Prime Web Audio immediately on call
    this.clearIdleSleepTimer();
    this.ensureAudioContext();
    await this.ensureConnected(cfg);

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Gemini Live WebSocket is not open.');
    }

    // Cancel any leftover audio from a previous turn
    this.stopScheduledAudio();

    return new Promise<GeminiLiveTurnResult>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (this.activeTurn) {
          const t = this.activeTurn;
          this.activeTurn = null;
          this.stopScheduledAudio();
          if (t.receivedAudio) {
            resolve({
              transcript: t.transcript.trim(),
              firstAudioMs: t.firstAudioMs,
              totalMs: Date.now() - t.startedAt,
              modelUsed: this.activeModel,
              receivedAudio: true,
            });
          } else {
            // Drop stalled socket so next call reconnects cleanly
            this.disconnect();
            reject(new Error('Gemini Live voice timed out waiting for audio.'));
          }
        }
      }, 18000);

      this.activeTurn = {
        startedAt: Date.now(),
        firstAudioMs: 0,
        receivedAudio: false,
        transcript: '',
        turnComplete: false,
        callbacks,
        resolve,
        reject,
        timeoutId,
      };

      this.ws!.send(
        JSON.stringify({
          clientContent: {
            turns: [{ role: 'user', parts: [{ text: promptText }] }],
            turnComplete: true,
          },
        })
      );
    });
  }

  public stopSpeaking(): void {
    this.stopScheduledAudio();
    if (this.activeTurn) {
      const turn = this.activeTurn;
      clearTimeout(turn.timeoutId);
      this.activeTurn = null;
      turn.resolve({
        transcript: turn.transcript.trim(),
        firstAudioMs: turn.firstAudioMs,
        totalMs: Date.now() - turn.startedAt,
        modelUsed: this.activeModel,
        receivedAudio: turn.receivedAudio,
      });
    }
  }

  public disconnect(): void {
    this.clearIdleSleepTimer();
    this.turnCount = 0;
    this.stopSpeaking();
    if (this.ws) {
      const socket = this.ws;
      this.ws = null;
      this.isReady = false;
      try {
        socket.onclose = null;
        socket.onerror = null;
        socket.onmessage = null;
        socket.close();
      } catch {
        // ignore
      }
      this.onConnectionStateChange?.(false);
    }
  }

  public dispose(): void {
    this.disconnect();
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close().catch(() => {});
    }
    this.audioCtx = null;
    this.gainNode = null;
  }
}
