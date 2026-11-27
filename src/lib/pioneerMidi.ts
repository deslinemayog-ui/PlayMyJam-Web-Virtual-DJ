/**
 * Pioneer DJ / AlphaTheta & Universal MIDI Controller Mapping Engine
 * Supports:
 *  - Pioneer DDJ-FLX4 / DDJ-400 / DDJ-SB3 / DDJ-REV1 / DDJ-FLX6
 *  - Pioneer DDJ-1000 / DDJ-SX / DDJ-SX2 / DDJ-SX3 / XDJ-XZ (Controller MIDI Mode)
 *  - Pioneer CDJ-2000NXS2 / CDJ-3000 / XDJ-1000MK2 (USB MIDI Mode: Deck A = Ch 1, Deck B = Ch 2)
 *  - Universal MIDI Learn for any MIDI DJ controller
 */

export type MidiPresetId = 'pioneer_ddj_standard' | 'pioneer_ddj_pro' | 'pioneer_cdj_midi' | 'custom';

export type MidiControlCategory = 'deckA' | 'deckB' | 'mixer' | 'fx';

export type MidiActionId =
  // Deck A
  | 'deckA.play'
  | 'deckA.cue'
  | 'deckA.sync'
  | 'deckA.pfl'
  | 'deckA.volume'
  | 'deckA.eqHigh'
  | 'deckA.eqMid'
  | 'deckA.eqLow'
  | 'deckA.pitch'
  | 'deckA.jog'
  | 'deckA.loopIn'
  | 'deckA.loopOut'
  | 'deckA.loopToggle'
  | 'deckA.beatJumpBack'
  | 'deckA.beatJumpFwd'
  | 'deckA.echoToggle'
  | 'deckA.reverbToggle'
  | 'deckA.loadNext'
  // Deck B
  | 'deckB.play'
  | 'deckB.cue'
  | 'deckB.sync'
  | 'deckB.pfl'
  | 'deckB.volume'
  | 'deckB.eqHigh'
  | 'deckB.eqMid'
  | 'deckB.eqLow'
  | 'deckB.pitch'
  | 'deckB.jog'
  | 'deckB.loopIn'
  | 'deckB.loopOut'
  | 'deckB.loopToggle'
  | 'deckB.beatJumpBack'
  | 'deckB.beatJumpFwd'
  | 'deckB.echoToggle'
  | 'deckB.reverbToggle'
  | 'deckB.loadNext'
  // Mixer
  | 'mixer.crossfader'
  | 'mixer.masterVolume'
  | 'mixer.cueVolume'
  // Sound Effects
  | 'sfx.laser'
  | 'sfx.horn'
  | 'sfx.siren'
  | 'sfx.zap';

export type MidiValueKind = 'button' | 'fader' | 'relative_jog';

export interface MidiBinding {
  action: MidiActionId;
  /** 0-based MIDI channel (0 = Ch 1, 1 = Ch 2, ..., 15 = Ch 16) */
  channel: number;
  type: 'note' | 'cc';
  /** MIDI Note number or CC MSB number (0-127) */
  control: number;
  /** Optional 14-bit LSB CC number used by Pioneer DDJ faders/knobs */
  lsbControl?: number;
  /** True for inverted Pioneer pitch sliders (top = slower, bottom = faster) */
  invert?: boolean;
}

export interface MidiActionMetadata {
  id: MidiActionId;
  label: string;
  category: MidiControlCategory;
  kind: MidiValueKind;
  ledSupported?: boolean;
}

export const MIDI_ACTIONS: MidiActionMetadata[] = [
  // Deck A
  { id: 'deckA.play', label: 'Deck A Play / Pause', category: 'deckA', kind: 'button', ledSupported: true },
  { id: 'deckA.cue', label: 'Deck A Cue', category: 'deckA', kind: 'button', ledSupported: true },
  { id: 'deckA.sync', label: 'Deck A BPM Sync', category: 'deckA', kind: 'button', ledSupported: true },
  { id: 'deckA.pfl', label: 'Deck A Headphone Cue (PFL)', category: 'deckA', kind: 'button', ledSupported: true },
  { id: 'deckA.volume', label: 'Deck A Volume Fader', category: 'deckA', kind: 'fader' },
  { id: 'deckA.eqHigh', label: 'Deck A EQ High', category: 'deckA', kind: 'fader' },
  { id: 'deckA.eqMid', label: 'Deck A EQ Mid', category: 'deckA', kind: 'fader' },
  { id: 'deckA.eqLow', label: 'Deck A EQ Low', category: 'deckA', kind: 'fader' },
  { id: 'deckA.pitch', label: 'Deck A Tempo / Pitch Slider', category: 'deckA', kind: 'fader' },
  { id: 'deckA.jog', label: 'Deck A Jog Wheel', category: 'deckA', kind: 'relative_jog' },
  { id: 'deckA.loopIn', label: 'Deck A Loop In', category: 'deckA', kind: 'button' },
  { id: 'deckA.loopOut', label: 'Deck A Loop Out', category: 'deckA', kind: 'button' },
  { id: 'deckA.loopToggle', label: 'Deck A Loop On / Off', category: 'deckA', kind: 'button' },
  { id: 'deckA.beatJumpBack', label: 'Deck A Beat Jump -4', category: 'deckA', kind: 'button' },
  { id: 'deckA.beatJumpFwd', label: 'Deck A Beat Jump +4', category: 'deckA', kind: 'button' },
  { id: 'deckA.echoToggle', label: 'Deck A Echo FX Toggle', category: 'deckA', kind: 'button' },
  { id: 'deckA.reverbToggle', label: 'Deck A Reverb FX Toggle', category: 'deckA', kind: 'button' },
  { id: 'deckA.loadNext', label: 'Load Top Queue Track → Deck A', category: 'deckA', kind: 'button' },

  // Deck B
  { id: 'deckB.play', label: 'Deck B Play / Pause', category: 'deckB', kind: 'button', ledSupported: true },
  { id: 'deckB.cue', label: 'Deck B Cue', category: 'deckB', kind: 'button', ledSupported: true },
  { id: 'deckB.sync', label: 'Deck B BPM Sync', category: 'deckB', kind: 'button', ledSupported: true },
  { id: 'deckB.pfl', label: 'Deck B Headphone Cue (PFL)', category: 'deckB', kind: 'button', ledSupported: true },
  { id: 'deckB.volume', label: 'Deck B Volume Fader', category: 'deckB', kind: 'fader' },
  { id: 'deckB.eqHigh', label: 'Deck B EQ High', category: 'deckB', kind: 'fader' },
  { id: 'deckB.eqMid', label: 'Deck B EQ Mid', category: 'deckB', kind: 'fader' },
  { id: 'deckB.eqLow', label: 'Deck B EQ Low', category: 'deckB', kind: 'fader' },
  { id: 'deckB.pitch', label: 'Deck B Tempo / Pitch Slider', category: 'deckB', kind: 'fader' },
  { id: 'deckB.jog', label: 'Deck B Jog Wheel', category: 'deckB', kind: 'relative_jog' },
  { id: 'deckB.loopIn', label: 'Deck B Loop In', category: 'deckB', kind: 'button' },
  { id: 'deckB.loopOut', label: 'Deck B Loop Out', category: 'deckB', kind: 'button' },
  { id: 'deckB.loopToggle', label: 'Deck B Loop On / Off', category: 'deckB', kind: 'button' },
  { id: 'deckB.beatJumpBack', label: 'Deck B Beat Jump -4', category: 'deckB', kind: 'button' },
  { id: 'deckB.beatJumpFwd', label: 'Deck B Beat Jump +4', category: 'deckB', kind: 'button' },
  { id: 'deckB.echoToggle', label: 'Deck B Echo FX Toggle', category: 'deckB', kind: 'button' },
  { id: 'deckB.reverbToggle', label: 'Deck B Reverb FX Toggle', category: 'deckB', kind: 'button' },
  { id: 'deckB.loadNext', label: 'Load Top Queue Track → Deck B', category: 'deckB', kind: 'button' },

  // Mixer
  { id: 'mixer.crossfader', label: 'Crossfader (Deck A ↔ B)', category: 'mixer', kind: 'fader' },
  { id: 'mixer.masterVolume', label: 'Master Volume', category: 'mixer', kind: 'fader' },
  { id: 'mixer.cueVolume', label: 'Headphone Cue Volume', category: 'mixer', kind: 'fader' },

  // FX / Pads
  { id: 'sfx.laser', label: 'SFX Pad: Laser', category: 'fx', kind: 'button' },
  { id: 'sfx.horn', label: 'SFX Pad: Air Horn', category: 'fx', kind: 'button' },
  { id: 'sfx.siren', label: 'SFX Pad: Siren', category: 'fx', kind: 'button' },
  { id: 'sfx.zap', label: 'SFX Pad: Explosion', category: 'fx', kind: 'button' },
];

export const MIDI_ACTION_META_MAP: Record<MidiActionId, MidiActionMetadata> = MIDI_ACTIONS.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<MidiActionId, MidiActionMetadata>
);

export interface MidiPresetDefinition {
  id: MidiPresetId;
  name: string;
  description: string;
  bindings: MidiBinding[];
}

// Standard Pioneer DDJ MIDI layout (DDJ-FLX4, DDJ-400, DDJ-SB3, DDJ-REV1, DDJ-FLX6)
const PIONEER_DDJ_STANDARD_BINDINGS: MidiBinding[] = [
  // Deck A (Ch 0)
  { action: 'deckA.play', channel: 0, type: 'note', control: 0x0b },
  { action: 'deckA.cue', channel: 0, type: 'note', control: 0x0c },
  { action: 'deckA.sync', channel: 0, type: 'note', control: 0x58 },
  { action: 'deckA.pfl', channel: 0, type: 'note', control: 0x54 },
  { action: 'deckA.volume', channel: 0, type: 'cc', control: 0x13, lsbControl: 0x33 },
  { action: 'deckA.eqHigh', channel: 0, type: 'cc', control: 0x07, lsbControl: 0x27 },
  { action: 'deckA.eqMid', channel: 0, type: 'cc', control: 0x0b, lsbControl: 0x2b },
  { action: 'deckA.eqLow', channel: 0, type: 'cc', control: 0x0f, lsbControl: 0x2f },
  { action: 'deckA.pitch', channel: 0, type: 'cc', control: 0x00, lsbControl: 0x20, invert: false },
  { action: 'deckA.jog', channel: 0, type: 'cc', control: 0x21 },
  { action: 'deckA.jog', channel: 0, type: 'cc', control: 0x22 },
  { action: 'deckA.jog', channel: 0, type: 'cc', control: 0x23 },
  { action: 'deckA.loopIn', channel: 0, type: 'note', control: 0x10 },
  { action: 'deckA.loopOut', channel: 0, type: 'note', control: 0x11 },
  { action: 'deckA.loopToggle', channel: 0, type: 'note', control: 0x14 },
  // Deck A Performance Pads (Ch 7)
  { action: 'deckA.beatJumpBack', channel: 7, type: 'note', control: 0x04 },
  { action: 'deckA.beatJumpFwd', channel: 7, type: 'note', control: 0x05 },
  { action: 'deckA.echoToggle', channel: 7, type: 'note', control: 0x06 },
  { action: 'deckA.reverbToggle', channel: 7, type: 'note', control: 0x07 },
  // Deck A Load button (Ch 6)
  { action: 'deckA.loadNext', channel: 6, type: 'note', control: 0x46 },

  // Deck B (Ch 1)
  { action: 'deckB.play', channel: 1, type: 'note', control: 0x0b },
  { action: 'deckB.cue', channel: 1, type: 'note', control: 0x0c },
  { action: 'deckB.sync', channel: 1, type: 'note', control: 0x58 },
  { action: 'deckB.pfl', channel: 1, type: 'note', control: 0x54 },
  { action: 'deckB.volume', channel: 1, type: 'cc', control: 0x13, lsbControl: 0x33 },
  { action: 'deckB.eqHigh', channel: 1, type: 'cc', control: 0x07, lsbControl: 0x27 },
  { action: 'deckB.eqMid', channel: 1, type: 'cc', control: 0x0b, lsbControl: 0x2b },
  { action: 'deckB.eqLow', channel: 1, type: 'cc', control: 0x0f, lsbControl: 0x2f },
  { action: 'deckB.pitch', channel: 1, type: 'cc', control: 0x00, lsbControl: 0x20, invert: false },
  { action: 'deckB.jog', channel: 1, type: 'cc', control: 0x21 },
  { action: 'deckB.jog', channel: 1, type: 'cc', control: 0x22 },
  { action: 'deckB.jog', channel: 1, type: 'cc', control: 0x23 },
  { action: 'deckB.loopIn', channel: 1, type: 'note', control: 0x10 },
  { action: 'deckB.loopOut', channel: 1, type: 'note', control: 0x11 },
  { action: 'deckB.loopToggle', channel: 1, type: 'note', control: 0x14 },
  // Deck B Performance Pads (Ch 9)
  { action: 'deckB.beatJumpBack', channel: 9, type: 'note', control: 0x04 },
  { action: 'deckB.beatJumpFwd', channel: 9, type: 'note', control: 0x05 },
  { action: 'deckB.echoToggle', channel: 9, type: 'note', control: 0x06 },
  { action: 'deckB.reverbToggle', channel: 9, type: 'note', control: 0x07 },
  // Deck B Load button (Ch 6)
  { action: 'deckB.loadNext', channel: 6, type: 'note', control: 0x47 },

  // Global Mixer (Ch 6)
  { action: 'mixer.crossfader', channel: 6, type: 'cc', control: 0x1f, lsbControl: 0x3f },
  { action: 'mixer.masterVolume', channel: 6, type: 'cc', control: 0x08, lsbControl: 0x28 },
  { action: 'mixer.cueVolume', channel: 6, type: 'cc', control: 0x0d, lsbControl: 0x2d },

  // Performance Pads 1-4 on Deck A (Ch 7) → DJ Sound Effects
  { action: 'sfx.laser', channel: 7, type: 'note', control: 0x00 },
  { action: 'sfx.horn', channel: 7, type: 'note', control: 0x01 },
  { action: 'sfx.siren', channel: 7, type: 'note', control: 0x02 },
  { action: 'sfx.zap', channel: 7, type: 'note', control: 0x03 },
];

// Pioneer DDJ-1000 / DDJ-SX / DDJ-SX2 / DDJ-SX3 / XDJ-XZ (Controller Mode)
const PIONEER_DDJ_PRO_BINDINGS: MidiBinding[] = [
  ...PIONEER_DDJ_STANDARD_BINDINGS.filter(
    (b) => b.action !== 'mixer.masterVolume' && b.action !== 'mixer.cueVolume'
  ),
  // Pro models expose Beat FX / Master & Headphone level on Ch 6 CC 0x08 / 0x0C
  { action: 'mixer.masterVolume', channel: 6, type: 'cc', control: 0x08, lsbControl: 0x28 },
  { action: 'mixer.cueVolume', channel: 6, type: 'cc', control: 0x0c, lsbControl: 0x2c },
];

// Club Pioneer CDJ-2000NXS2 / CDJ-3000 / XDJ-1000MK2 (USB MIDI Mode: Left CDJ = Ch 1, Right CDJ = Ch 2)
const PIONEER_CDJ_MIDI_BINDINGS: MidiBinding[] = [
  // CDJ Deck A (MIDI Ch 1 = index 0)
  { action: 'deckA.play', channel: 0, type: 'note', control: 0x00 },
  { action: 'deckA.cue', channel: 0, type: 'note', control: 0x01 },
  { action: 'deckA.beatJumpBack', channel: 0, type: 'note', control: 0x02 },
  { action: 'deckA.beatJumpFwd', channel: 0, type: 'note', control: 0x03 },
  { action: 'deckA.loopIn', channel: 0, type: 'note', control: 0x06 },
  { action: 'deckA.loopOut', channel: 0, type: 'note', control: 0x07 },
  { action: 'deckA.loopToggle', channel: 0, type: 'note', control: 0x08 },
  { action: 'deckA.sync', channel: 0, type: 'note', control: 0x20 },
  { action: 'deckA.jog', channel: 0, type: 'cc', control: 0x10 },
  { action: 'deckA.pitch', channel: 0, type: 'cc', control: 0x1d },

  // CDJ Deck B (MIDI Ch 2 = index 1)
  { action: 'deckB.play', channel: 1, type: 'note', control: 0x00 },
  { action: 'deckB.cue', channel: 1, type: 'note', control: 0x01 },
  { action: 'deckB.beatJumpBack', channel: 1, type: 'note', control: 0x02 },
  { action: 'deckB.beatJumpFwd', channel: 1, type: 'note', control: 0x03 },
  { action: 'deckB.loopIn', channel: 1, type: 'note', control: 0x06 },
  { action: 'deckB.loopOut', channel: 1, type: 'note', control: 0x07 },
  { action: 'deckB.loopToggle', channel: 1, type: 'note', control: 0x08 },
  { action: 'deckB.sync', channel: 1, type: 'note', control: 0x20 },
  { action: 'deckB.jog', channel: 1, type: 'cc', control: 0x10 },
  { action: 'deckB.pitch', channel: 1, type: 'cc', control: 0x1d },

  // Optional DJM Mixer MIDI (Ch 1 = 0 / Ch 6 = 5)
  { action: 'mixer.crossfader', channel: 0, type: 'cc', control: 0x0b },
  { action: 'deckA.volume', channel: 0, type: 'cc', control: 0x11 },
  { action: 'deckB.volume', channel: 0, type: 'cc', control: 0x12 },
];

export const PIONEER_MIDI_PRESETS: Record<MidiPresetId, MidiPresetDefinition> = {
  pioneer_ddj_standard: {
    id: 'pioneer_ddj_standard',
    name: 'Pioneer DDJ-FLX4 / DDJ-400 / SB3 / REV1 / FLX6',
    description: 'Standard Pioneer 2/4-deck USB controllers (plug-and-play MIDI + 14-bit faders + LEDs)',
    bindings: PIONEER_DDJ_STANDARD_BINDINGS,
  },
  pioneer_ddj_pro: {
    id: 'pioneer_ddj_pro',
    name: 'Pioneer DDJ-1000 / DDJ-SX / DDJ-SZ / XDJ-XZ',
    description: 'Pro Pioneer USB controllers & all-in-ones in Controller Mode',
    bindings: PIONEER_DDJ_PRO_BINDINGS,
  },
  pioneer_cdj_midi: {
    id: 'pioneer_cdj_midi',
    name: 'Pioneer CDJ-2000NXS2 / CDJ-3000 / XDJ-1000 (USB MIDI)',
    description: 'Club CDJs connected via USB in MIDI mode (Deck A = Ch 1, Deck B = Ch 2)',
    bindings: PIONEER_CDJ_MIDI_BINDINGS,
  },
  custom: {
    id: 'custom',
    name: 'Custom / Universal MIDI Learn',
    description: 'Map any Pioneer, AlphaTheta, Numark, Denon, or generic MIDI controller',
    bindings: PIONEER_DDJ_STANDARD_BINDINGS,
  },
};

export function detectRecommendedPreset(deviceNames: string[]): MidiPresetId {
  const joined = deviceNames.join(' ').toLowerCase();
  if (/cdj|xdj-1000|xdj-700/.test(joined)) {
    return 'pioneer_cdj_midi';
  }
  if (/ddj-1000|ddj-sx|ddj-sz|ddj-rz|ddj-flx10|xdj-xz|opus|djm/.test(joined)) {
    return 'pioneer_ddj_pro';
  }
  if (/pioneer|alphatheta|ddj|flx|sb3|rev1|rb|400|200/.test(joined)) {
    return 'pioneer_ddj_standard';
  }
  return 'pioneer_ddj_standard';
}

export function isPioneerDeviceName(name: string): boolean {
  return /pioneer|alphatheta|ddj|xdj|cdj|djm|opus|omnis/i.test(name || '');
}

export interface ParsedMidiMessage {
  channel: number;
  type: 'note' | 'cc';
  control: number;
  value: number;
  isNoteOn: boolean;
}

export function parseRawMidiMessage(data: Uint8Array): ParsedMidiMessage | null {
  if (!data || data.length < 3) return null;
  const status = data[0];
  const command = status & 0xf0;
  const channel = status & 0x0f;
  const control = data[1] & 0x7f;
  const value = data[2] & 0x7f;

  if (command === 0x90) {
    return { channel, type: 'note', control, value, isNoteOn: value > 0 };
  }
  if (command === 0x80) {
    return { channel, type: 'note', control, value: 0, isNoteOn: false };
  }
  if (command === 0xb0) {
    return { channel, type: 'cc', control, value, isNoteOn: value > 0 };
  }
  return null;
}

/**
 * Decodes Pioneer relative jog wheel CC encoding (64-centered: 65..127 = forward, 63..1 = backward)
 * and standard two's complement encoders (1..63 = forward, 127..65 = backward).
 */
export function decodeRelativeJogDelta(ccValue: number): number {
  if (ccValue === 64 || ccValue === 0) return 0;
  // Pioneer DDJ/CDJ standard 64-centered relative CC
  if (ccValue > 64 && ccValue <= 96) {
    return ccValue - 64; // clockwise (+)
  }
  if (ccValue >= 32 && ccValue < 64) {
    return ccValue - 64; // counter-clockwise (-)
  }
  // Two's complement fallback (1..31 = +, 97..127 = -)
  if (ccValue > 0 && ccValue < 32) {
    return ccValue;
  }
  if (ccValue > 96) {
    return ccValue - 128;
  }
  return 0;
}

export function formatMidiBinding(binding?: MidiBinding): string {
  if (!binding) return 'Unmapped';
  const ch = binding.channel + 1;
  const kind = binding.type === 'note' ? 'Note' : 'CC';
  const hex = `0x${binding.control.toString(16).toUpperCase().padStart(2, '0')}`;
  return `CH ${ch} • ${kind} ${binding.control} (${hex})`;
}
