import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MIDI_ACTION_META_MAP,
  PIONEER_MIDI_PRESETS,
  decodeRelativeJogDelta,
  detectRecommendedPreset,
  isPioneerDeviceName,
  parseRawMidiMessage,
  type MidiActionId,
  type MidiBinding,
  type MidiPresetId,
} from '@/lib/pioneerMidi';

const MIDI_STORAGE_KEY = 'playmyjam_pioneer_midi_v1';

/** Software loopback buses echo every outgoing MIDI packet straight back into input. */
function isLoopbackMidiPort(name: string): boolean {
  return /iac driver|loopmidi|midi through|virtual midi bus/i.test(name || '');
}

export interface ConnectedMidiDevice {
  id: string;
  name: string;
  manufacturer: string;
  state: string;
  hasInput: boolean;
  hasOutput: boolean;
  isPioneer: boolean;
}

export interface MidiActivityEvent {
  deviceName: string;
  channel: number;
  type: 'note' | 'cc';
  control: number;
  value: number;
  matchedAction?: MidiActionId;
  matchedLabel?: string;
  timestamp: number;
}

interface SavedMidiConfig {
  presetId: MidiPresetId;
  customBindings: MidiBinding[] | null;
  ledFeedbackEnabled: boolean;
  jogSensitivity: number; // seconds per relative tick (default 0.08)
  pitchRangePercent: number; // default 8% or 16%
}

function loadSavedMidiConfig(): SavedMidiConfig {
  try {
    const raw = localStorage.getItem(MIDI_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const validPresets: MidiPresetId[] = [
        'pioneer_ddj_standard',
        'pioneer_ddj_pro',
        'pioneer_cdj_midi',
        'custom',
      ];
      return {
        presetId: validPresets.includes(parsed.presetId) ? parsed.presetId : 'pioneer_ddj_standard',
        customBindings: Array.isArray(parsed.customBindings) ? parsed.customBindings : null,
        ledFeedbackEnabled: parsed.ledFeedbackEnabled !== false,
        jogSensitivity:
          typeof parsed.jogSensitivity === 'number' && parsed.jogSensitivity > 0.01 && parsed.jogSensitivity <= 1
            ? parsed.jogSensitivity
            : 0.08,
        pitchRangePercent:
          typeof parsed.pitchRangePercent === 'number' && parsed.pitchRangePercent >= 4 && parsed.pitchRangePercent <= 16
            ? parsed.pitchRangePercent
            : 8,
      };
    }
  } catch {
    // ignore storage errors
  }
  return {
    presetId: 'pioneer_ddj_standard',
    customBindings: null,
    ledFeedbackEnabled: true,
    jogSensitivity: 0.08,
    pitchRangePercent: 8,
  };
}

export interface PioneerControllerCallbacks {
  // Deck A
  toggleDeckA: () => void;
  cueDeckA: () => void;
  toggleSyncA: () => void;
  togglePflA: () => void;
  setDeckAVolume: (value: number) => void;
  setDeckAEQ: (eq: { high?: number; mid?: number; low?: number }) => void;
  setDeckAPitch: (percent: number) => void;
  nudgeDeckA: (deltaSeconds: number) => void;
  loopInDeckA: () => void;
  loopOutDeckA: () => void;
  loopToggleDeckA: () => void;
  beatJumpDeckA: (beats: number) => void;
  toggleEchoDeckA: () => void;
  toggleReverbDeckA: () => void;
  loadNextToDeckA: () => void;

  // Deck B
  toggleDeckB: () => void;
  cueDeckB: () => void;
  toggleSyncB: () => void;
  togglePflB: () => void;
  setDeckBVolume: (value: number) => void;
  setDeckBEQ: (eq: { high?: number; mid?: number; low?: number }) => void;
  setDeckBPitch: (percent: number) => void;
  nudgeDeckB: (deltaSeconds: number) => void;
  loopInDeckB: () => void;
  loopOutDeckB: () => void;
  loopToggleDeckB: () => void;
  beatJumpDeckB: (beats: number) => void;
  toggleEchoDeckB: () => void;
  toggleReverbDeckB: () => void;
  loadNextToDeckB: () => void;

  // Mixer & SFX
  setCrossfader: (value: number) => void;
  setMasterVolume: (value: number) => void;
  setCueVolume: (value: number) => void;
  playSoundEffect: (effect: 'laser' | 'horn' | 'siren' | 'zap') => void;
}

export interface PioneerLedState {
  deckAPlaying: boolean;
  deckBPlaying: boolean;
  deckACueEnabled: boolean;
  deckBCueEnabled: boolean;
  isSynced: boolean;
}

export const usePioneerController = (
  callbacks: PioneerControllerCallbacks,
  ledState: PioneerLedState
) => {
  const [isMidiSupported] = useState<boolean>(
    () => typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function'
  );
  const [midiError, setMidiError] = useState<string | null>(null);
  const [devices, setDevices] = useState<ConnectedMidiDevice[]>([]);
  const [config, setConfig] = useState<SavedMidiConfig>(() => loadSavedMidiConfig());
  const [learningAction, setLearningAction] = useState<MidiActionId | null>(null);
  const [lastMidiEvent, setLastMidiEvent] = useState<MidiActivityEvent | null>(null);

  const midiAccessRef = useRef<MIDIAccess | null>(null);
  const callbacksRef = useRef(callbacks);
  const configRef = useRef(config);
  const learningActionRef = useRef<MidiActionId | null>(null);
  const hasAutoSelectedPresetRef = useRef<boolean>(false);
  // 14-bit MSB cache for smooth Pioneer DDJ faders & EQ knobs (`${channel}:${msbControl}` -> 0..127)
  const msbCacheRef = useRef<Map<string, number>>(new Map());
  // Tracks recently transmitted LED packets (`${ch}:${note}:${vel}` -> ms) to drop loopback echoes
  const recentLedSendsRef = useRef<Map<string, number>>(new Map());
  const prevLedStateRef = useRef<PioneerLedState | null>(null);

  callbacksRef.current = callbacks;
  configRef.current = config;
  learningActionRef.current = learningAction;

  const activeBindings: MidiBinding[] =
    config.customBindings ?? PIONEER_MIDI_PRESETS[config.presetId].bindings;
  const activeBindingsRef = useRef<MidiBinding[]>(activeBindings);
  activeBindingsRef.current = activeBindings;

  const saveConfig = useCallback((next: SavedMidiConfig) => {
    try {
      localStorage.setItem(MIDI_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  }, []);

  const updateMidiConfig = useCallback(
    (patch: Partial<SavedMidiConfig>) => {
      setConfig((prev) => {
        const next = { ...prev, ...patch };
        saveConfig(next);
        return next;
      });
    },
    [saveConfig]
  );

  const selectPreset = useCallback(
    (presetId: MidiPresetId) => {
      setLearningAction(null);
      setConfig((prev) => {
        const next: SavedMidiConfig = {
          ...prev,
          presetId,
          customBindings: presetId === 'custom' ? [...activeBindingsRef.current] : null,
        };
        saveConfig(next);
        return next;
      });
    },
    [saveConfig]
  );

  const resetCurrentPreset = useCallback(() => {
    setLearningAction(null);
    setConfig((prev) => {
      const next: SavedMidiConfig = {
        ...prev,
        presetId: prev.presetId === 'custom' ? 'pioneer_ddj_standard' : prev.presetId,
        customBindings: null,
      };
      saveConfig(next);
      return next;
    });
  }, [saveConfig]);

  const clearBinding = useCallback(
    (action: MidiActionId) => {
      setConfig((prev) => {
        const current = prev.customBindings ?? PIONEER_MIDI_PRESETS[prev.presetId].bindings;
        const filtered = current.filter((b) => b.action !== action);
        const next: SavedMidiConfig = {
          ...prev,
          presetId: 'custom',
          customBindings: filtered,
        };
        saveConfig(next);
        return next;
      });
    },
    [saveConfig]
  );

  const dispatchAction = useCallback((action: MidiActionId, normalized0to1: number, rawValue: number, isNoteOn: boolean) => {
    const cb = callbacksRef.current;
    const meta = MIDI_ACTION_META_MAP[action];
    if (!meta) return;

    // Button actions trigger on Note-On (or CC >= 64)
    if (meta.kind === 'button') {
      if (!isNoteOn && rawValue < 64) return;
      switch (action) {
        case 'deckA.play': cb.toggleDeckA(); break;
        case 'deckA.cue': cb.cueDeckA(); break;
        case 'deckA.sync': cb.toggleSyncA(); break;
        case 'deckA.pfl': cb.togglePflA(); break;
        case 'deckA.loopIn': cb.loopInDeckA(); break;
        case 'deckA.loopOut': cb.loopOutDeckA(); break;
        case 'deckA.loopToggle': cb.loopToggleDeckA(); break;
        case 'deckA.beatJumpBack': cb.beatJumpDeckA(-4); break;
        case 'deckA.beatJumpFwd': cb.beatJumpDeckA(4); break;
        case 'deckA.echoToggle': cb.toggleEchoDeckA(); break;
        case 'deckA.reverbToggle': cb.toggleReverbDeckA(); break;
        case 'deckA.loadNext': cb.loadNextToDeckA(); break;

        case 'deckB.play': cb.toggleDeckB(); break;
        case 'deckB.cue': cb.cueDeckB(); break;
        case 'deckB.sync': cb.toggleSyncB(); break;
        case 'deckB.pfl': cb.togglePflB(); break;
        case 'deckB.loopIn': cb.loopInDeckB(); break;
        case 'deckB.loopOut': cb.loopOutDeckB(); break;
        case 'deckB.loopToggle': cb.loopToggleDeckB(); break;
        case 'deckB.beatJumpBack': cb.beatJumpDeckB(-4); break;
        case 'deckB.beatJumpFwd': cb.beatJumpDeckB(4); break;
        case 'deckB.echoToggle': cb.toggleEchoDeckB(); break;
        case 'deckB.reverbToggle': cb.toggleReverbDeckB(); break;
        case 'deckB.loadNext': cb.loadNextToDeckB(); break;

        case 'sfx.laser': cb.playSoundEffect('laser'); break;
        case 'sfx.horn': cb.playSoundEffect('horn'); break;
        case 'sfx.siren': cb.playSoundEffect('siren'); break;
        case 'sfx.zap': cb.playSoundEffect('zap'); break;
        default: break;
      }
      return;
    }

    // Relative Jog Wheel
    if (meta.kind === 'relative_jog') {
      const ticks = decodeRelativeJogDelta(rawValue);
      if (ticks === 0) return;
      const deltaSeconds = ticks * configRef.current.jogSensitivity;
      if (action === 'deckA.jog') cb.nudgeDeckA(deltaSeconds);
      else if (action === 'deckB.jog') cb.nudgeDeckB(deltaSeconds);
      return;
    }

    // Continuous Faders & Knobs (0..100 or -pitchRange..+pitchRange)
    const pct0to100 = Math.round(Math.max(0, Math.min(1, normalized0to1)) * 100);
    const pitchRange = configRef.current.pitchRangePercent;
    const pitchPercent = (Math.max(0, Math.min(1, normalized0to1)) * 2 - 1) * pitchRange;

    switch (action) {
      case 'deckA.volume': cb.setDeckAVolume(pct0to100); break;
      case 'deckA.eqHigh': cb.setDeckAEQ({ high: pct0to100 }); break;
      case 'deckA.eqMid': cb.setDeckAEQ({ mid: pct0to100 }); break;
      case 'deckA.eqLow': cb.setDeckAEQ({ low: pct0to100 }); break;
      case 'deckA.pitch': cb.setDeckAPitch(pitchPercent); break;

      case 'deckB.volume': cb.setDeckBVolume(pct0to100); break;
      case 'deckB.eqHigh': cb.setDeckBEQ({ high: pct0to100 }); break;
      case 'deckB.eqMid': cb.setDeckBEQ({ mid: pct0to100 }); break;
      case 'deckB.eqLow': cb.setDeckBEQ({ low: pct0to100 }); break;
      case 'deckB.pitch': cb.setDeckBPitch(pitchPercent); break;

      case 'mixer.crossfader': cb.setCrossfader(pct0to100); break;
      case 'mixer.masterVolume': cb.setMasterVolume(pct0to100); break;
      case 'mixer.cueVolume': cb.setCueVolume(pct0to100); break;
      default: break;
    }
  }, []);

  const handleMidiMessage = useCallback(
    (deviceName: string, event: MIDIMessageEvent) => {
      if (!event.data) return;
      const parsed = parseRawMidiMessage(event.data);
      if (!parsed) return;

      // Drop loopback echoes of LED feedback packets we just transmitted within the last 200ms
      if (parsed.type === 'note') {
        const echoKey = `${parsed.channel}:${parsed.control}:${parsed.value}`;
        const sentAt = recentLedSendsRef.current.get(echoKey);
        if (sentAt !== undefined && Date.now() - sentAt < 200) {
          recentLedSendsRef.current.delete(echoKey);
          return;
        }
      }

      // 1. MIDI Learn capture mode
      const learnTarget = learningActionRef.current;
      if (learnTarget) {
        // Ignore Note-Off (velocity 0) during MIDI Learn so releasing a button doesn't double-bind
        if (parsed.type === 'note' && !parsed.isNoteOn) return;

        // Clear ref synchronously so a Pioneer 14-bit fader's companion LSB CC (arriving <1ms later)
        // never overwrites the freshly captured MSB CC binding before React re-renders.
        learningActionRef.current = null;

        const newBinding: MidiBinding = {
          action: learnTarget,
          channel: parsed.channel,
          type: parsed.type,
          control: parsed.control,
        };

        setConfig((prev) => {
          const base = prev.customBindings ?? PIONEER_MIDI_PRESETS[prev.presetId].bindings;
          const withoutSameAction = base.filter((b) => b.action !== learnTarget);
          const next: SavedMidiConfig = {
            ...prev,
            presetId: 'custom',
            customBindings: [...withoutSameAction, newBinding],
          };
          saveConfig(next);
          return next;
        });

        setLearningAction(null);
        setLastMidiEvent({
          deviceName,
          channel: parsed.channel,
          type: parsed.type,
          control: parsed.control,
          value: parsed.value,
          matchedAction: learnTarget,
          matchedLabel: `Mapped → ${MIDI_ACTION_META_MAP[learnTarget]?.label || learnTarget}`,
          timestamp: Date.now(),
        });
        return;
      }

      const bindings = activeBindingsRef.current;

      // 2. Match primary Note or CC MSB
      let matched = bindings.find(
        (b) => b.channel === parsed.channel && b.type === parsed.type && b.control === parsed.control
      );
      let normalized = parsed.value / 127;

      if (matched && parsed.type === 'cc' && matched.lsbControl !== undefined) {
        // Cache MSB for smooth 14-bit Pioneer fader precision
        msbCacheRef.current.set(`${parsed.channel}:${parsed.control}`, parsed.value);
      } else if (!matched && parsed.type === 'cc') {
        // Check if this is the 14-bit LSB companion CC of a Pioneer fader/knob
        const lsbMatched = bindings.find(
          (b) => b.channel === parsed.channel && b.type === 'cc' && b.lsbControl === parsed.control
        );
        if (lsbMatched) {
          matched = lsbMatched;
          const msb = msbCacheRef.current.get(`${parsed.channel}:${lsbMatched.control}`);
          if (msb !== undefined) {
            normalized = ((msb << 7) | parsed.value) / 16383;
          } else {
            return; // wait for MSB first
          }
        }
      }

      if (matched) {
        if (matched.invert) {
          normalized = 1 - normalized;
        }
        dispatchAction(matched.action, normalized, parsed.value, parsed.isNoteOn);
      }

      setLastMidiEvent({
        deviceName,
        channel: parsed.channel,
        type: parsed.type,
        control: parsed.control,
        value: parsed.value,
        matchedAction: matched?.action,
        matchedLabel: matched ? MIDI_ACTION_META_MAP[matched.action]?.label : undefined,
        timestamp: Date.now(),
      });
    },
    [dispatchAction, saveConfig]
  );

  // Scan inputs/outputs and attach listeners
  const syncMidiDevices = useCallback(
    (access: MIDIAccess) => {
      const byName = new Map<string, ConnectedMidiDevice>();

      access.inputs.forEach((input) => {
        const name = input.name || 'USB MIDI Input';
        const key = name.toLowerCase();
        const existing = byName.get(key);
        byName.set(key, {
          id: existing?.id || input.id,
          name,
          manufacturer: input.manufacturer || existing?.manufacturer || '',
          state: input.state,
          hasInput: true,
          hasOutput: existing?.hasOutput || false,
          isPioneer: isPioneerDeviceName(`${input.manufacturer || ''} ${name}`),
        });

        input.onmidimessage = (ev: MIDIMessageEvent) => {
          handleMidiMessage(name, ev);
        };
      });

      access.outputs.forEach((output) => {
        const name = output.name || 'USB MIDI Output';
        const key = name.toLowerCase();
        const existing = byName.get(key);
        byName.set(key, {
          id: existing?.id || output.id,
          name,
          manufacturer: output.manufacturer || existing?.manufacturer || '',
          state: output.state,
          hasInput: existing?.hasInput || false,
          hasOutput: true,
          isPioneer: isPioneerDeviceName(`${output.manufacturer || ''} ${name}`),
        });
      });

      const list = Array.from(byName.values()).filter((d) => d.state === 'connected');
      setDevices(list);

      // Auto-select Pioneer preset on first connect if user hasn't customized mappings
      if (
        list.length > 0 &&
        !hasAutoSelectedPresetRef.current &&
        !configRef.current.customBindings
      ) {
        const recommended = detectRecommendedPreset(list.map((d) => `${d.manufacturer} ${d.name}`));
        hasAutoSelectedPresetRef.current = true;
        if (recommended !== configRef.current.presetId) {
          updateMidiConfig({ presetId: recommended });
        }
      }
    },
    [handleMidiMessage, updateMidiConfig]
  );

  const reconnectMidi = useCallback(async () => {
    if (!isMidiSupported) {
      setMidiError(
        'Web MIDI is not supported in this browser. Use the PlayMyJam Desktop (Electron) app or Chrome/Edge.'
      );
      return;
    }

    try {
      setMidiError(null);
      const access = await navigator.requestMIDIAccess({ sysex: false });
      midiAccessRef.current = access;
      syncMidiDevices(access);
      access.onstatechange = () => {
        syncMidiDevices(access);
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'MIDI permission denied or unavailable.';
      setMidiError(msg);
    }
  }, [isMidiSupported, syncMidiDevices]);

  // Connect automatically on mount
  useEffect(() => {
    if (!isMidiSupported) return;
    void reconnectMidi();

    return () => {
      const access = midiAccessRef.current;
      if (access) {
        access.onstatechange = null;
        access.inputs.forEach((input) => {
          input.onmidimessage = null;
        });
      }
    };
  }, [isMidiSupported, reconnectMidi]);

  // Send diff-only LED feedback back to connected Pioneer/MIDI controllers (never to loopback buses)
  useEffect(() => {
    const access = midiAccessRef.current;
    if (!access || !config.ledFeedbackEnabled || devices.length === 0) {
      prevLedStateRef.current = null;
      return;
    }

    const prev = prevLedStateRef.current;
    const sendLedForAction = (action: MidiActionId, isOn: boolean) => {
      const binding = activeBindings.find((b) => b.action === action && b.type === 'note');
      if (!binding) return;
      const channel = binding.channel & 0x0f;
      const control = binding.control & 0x7f;
      const statusByte = 0x90 | channel;
      const velocity = isOn ? 0x7f : 0x00;

      let sentAny = false;
      access.outputs.forEach((output) => {
        if (output.state !== 'connected') return;
        // Never send LED feedback to software loopback ports (e.g. macOS IAC Driver)
        if (isLoopbackMidiPort(output.name || '')) return;
        try {
          output.send([statusByte, control, velocity]);
          sentAny = true;
        } catch {
          // ignore output write errors on read-only ports
        }
      });

      if (sentAny) {
        recentLedSendsRef.current.set(`${channel}:${control}:${velocity}`, Date.now());
      }
    };

    if (!prev || prev.deckAPlaying !== ledState.deckAPlaying) {
      sendLedForAction('deckA.play', ledState.deckAPlaying);
    }
    if (!prev || prev.deckBPlaying !== ledState.deckBPlaying) {
      sendLedForAction('deckB.play', ledState.deckBPlaying);
    }
    if (!prev || prev.deckACueEnabled !== ledState.deckACueEnabled) {
      sendLedForAction('deckA.pfl', ledState.deckACueEnabled);
    }
    if (!prev || prev.deckBCueEnabled !== ledState.deckBCueEnabled) {
      sendLedForAction('deckB.pfl', ledState.deckBCueEnabled);
    }
    if (!prev || prev.isSynced !== ledState.isSynced) {
      sendLedForAction('deckA.sync', ledState.isSynced);
      sendLedForAction('deckB.sync', ledState.isSynced);
    }

    prevLedStateRef.current = {
      deckAPlaying: ledState.deckAPlaying,
      deckBPlaying: ledState.deckBPlaying,
      deckACueEnabled: ledState.deckACueEnabled,
      deckBCueEnabled: ledState.deckBCueEnabled,
      isSynced: ledState.isSynced,
    };
  }, [
    activeBindings,
    config.ledFeedbackEnabled,
    devices.length,
    ledState.deckAPlaying,
    ledState.deckBPlaying,
    ledState.deckACueEnabled,
    ledState.deckBCueEnabled,
    ledState.isSynced,
  ]);

  const primaryDevice =
    devices.find((d) => d.isPioneer) ||
    devices.find((d) => !isLoopbackMidiPort(d.name)) ||
    devices[0] ||
    null;

  return {
    isMidiSupported,
    midiError,
    devices,
    primaryDevice,
    isHardwareConnected: devices.length > 0,
    config,
    activeBindings,
    learningAction,
    lastMidiEvent,
    startMidiLearn: (action: MidiActionId) => setLearningAction(action),
    cancelMidiLearn: () => setLearningAction(null),
    selectPreset,
    resetCurrentPreset,
    clearBinding,
    updateMidiConfig,
    reconnectMidi,
  };
};
