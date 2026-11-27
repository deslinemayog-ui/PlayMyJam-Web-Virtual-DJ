import React, { useState } from 'react';
import {
  X,
  Sliders,
  Headphones,
  Radio,
  Usb,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Trash2,
  Volume2,
  Disc3,
  Cpu,
  Speaker,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  MIDI_ACTIONS,
  PIONEER_MIDI_PRESETS,
  formatMidiBinding,
  type MidiControlCategory,
  type MidiPresetId,
} from '@/lib/pioneerMidi';
import type { usePioneerController } from '@/hooks/usePioneerController';
import type { AudioOutputDeviceInfo, AudioRoutingMode } from '@/hooks/useMusicPlayer';

type PioneerControllerState = ReturnType<typeof usePioneerController>;

interface PioneerHardwareModalProps {
  isOpen: boolean;
  onClose: () => void;
  controller: PioneerControllerState;
  audio: {
    routingMode: AudioRoutingMode;
    setRoutingMode: (mode: AudioRoutingMode) => void;
    outputDevices: AudioOutputDeviceInfo[];
    masterDeviceId: string;
    cueDeviceId: string;
    setMasterDevice: (id: string) => void;
    setCueDevice: (id: string) => void;
    refreshDevices: () => Promise<AudioOutputDeviceInfo[]>;
    maxOutputChannels: number;
    routingError: string | null;
    deckACueEnabled: boolean;
    deckBCueEnabled: boolean;
    toggleDeckACue: () => void;
    toggleDeckBCue: () => void;
    cueVolume: number;
    updateCueVolume: (vol: number) => void;
  };
}

const ROUTING_MODES: Array<{
  id: AudioRoutingMode;
  title: string;
  subtitle: string;
  badge: string;
}> = [
  {
    id: 'stereo',
    title: 'Standard Stereo',
    subtitle: 'Master mix to laptop speakers or standard 2-channel audio output',
    badge: '2ch',
  },
  {
    id: 'controller_4ch',
    title: 'Pioneer 4-Ch Controller',
    subtitle: 'Ch 1–2 Master Speakers + Ch 3–4 Headphone Cue (DDJ-FLX4 / 400 / 1000 / SX)',
    badge: '4ch',
  },
  {
    id: 'dual_device',
    title: 'Dual Audio Devices',
    subtitle: 'Master on main speakers + Headphone Cue on a second USB/headphone output',
    badge: '2+2',
  },
  {
    id: 'external_mixer',
    title: 'Club External Mixer (DJM)',
    subtitle: 'Deck A → Ch 1–2 & Deck B → Ch 3–4 directly into DJM-900NXS2 / DJM-A9',
    badge: 'Club 4ch',
  },
];

const PioneerHardwareModal: React.FC<PioneerHardwareModalProps> = ({
  isOpen,
  onClose,
  controller,
  audio,
}) => {
  const [activeTab, setActiveTab] = useState<'hardware' | 'audio' | 'learn'>('hardware');
  const [learnCategory, setLearnCategory] = useState<'all' | MidiControlCategory>('all');

  if (!isOpen) return null;

  const filteredActions =
    learnCategory === 'all'
      ? MIDI_ACTIONS
      : MIDI_ACTIONS.filter((a) => a.category === learnCategory);

  const handleRefreshAll = () => {
    void controller.reconnectMidi();
    void audio.refreshDevices();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-text font-montserrat-light">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-4xl rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-[#101326] via-[#171836] to-[#0d1020] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-black/30">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 via-blue-600 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-lg">
              <Disc3 className={`w-5 h-5 text-white ${controller.isHardwareConnected ? 'animate-spin' : ''}`} style={{ animationDuration: '6s' }} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-white font-montserrat-bold text-base">
                  Pioneer DJ &amp; MIDI Hardware
                </h2>
                {controller.isHardwareConnected ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-montserrat-bold bg-emerald-500/20 border border-emerald-400/50 text-emerald-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {controller.primaryDevice?.name || 'MIDI Connected'}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] bg-white/10 border border-white/15 text-gray-300">
                    <Usb className="w-3 h-3" />
                    Plug in Pioneer USB
                  </span>
                )}
              </div>
              <p className="text-gray-400 text-xs">
                DDJ controllers, Club CDJs (USB MIDI), Universal MIDI Learn, and 4-channel Headphone Cue
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleRefreshAll}
              className="border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/20 text-xs"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Rescan USB
            </Button>
            <button
              type="button"
              onClick={() => {
                controller.cancelMidiLearn();
                onClose();
              }}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white flex items-center justify-center transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* MIDI Learn Active Banner OR Live MIDI Activity Strip */}
        {controller.learningAction ? (
          <div className="px-5 py-2.5 bg-amber-500/20 border-b border-amber-400/40 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-amber-200 text-xs">
              <Radio className="w-4 h-4 animate-pulse text-amber-300 flex-shrink-0" />
              <span>
                <strong className="font-montserrat-bold">MIDI LEARN ACTIVE:</strong> Move a knob/fader or press a button on your Pioneer controller to assign{' '}
                <strong className="text-white underline">
                  {MIDI_ACTIONS.find((a) => a.id === controller.learningAction)?.label}
                </strong>
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={controller.cancelMidiLearn}
              className="border-amber-400/60 text-amber-200 hover:bg-amber-500/30 text-xs py-1 h-7"
            >
              Cancel
            </Button>
          </div>
        ) : (
          <div className="px-5 py-2 bg-black/40 border-b border-white/10 flex items-center justify-between text-[11px] text-gray-400">
            <span className="flex items-center gap-2 truncate">
              <Cpu className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
              {controller.lastMidiEvent ? (
                <span className="truncate">
                  <span className="text-cyan-300 font-montserrat-bold">
                    {controller.lastMidiEvent.deviceName}
                  </span>{' '}
                  • CH {controller.lastMidiEvent.channel + 1} •{' '}
                  {controller.lastMidiEvent.type.toUpperCase()} {controller.lastMidiEvent.control} • VAL{' '}
                  {controller.lastMidiEvent.value}
                  {controller.lastMidiEvent.matchedLabel && (
                    <span className="text-emerald-300 font-montserrat-bold">
                      {' '}
                      → {controller.lastMidiEvent.matchedLabel}
                    </span>
                  )}
                </span>
              ) : (
                <span>
                  Live MIDI Monitor — twist any knob or press any button on your connected controller to test
                </span>
              )}
            </span>
            <span className="text-gray-500 flex-shrink-0 ml-2">
              {controller.devices.length} MIDI device{controller.devices.length === 1 ? '' : 's'}
            </span>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex border-b border-white/10 bg-black/20 px-5 pt-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('hardware')}
            className={`px-4 py-2 text-xs font-montserrat-bold rounded-t-lg border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'hardware'
                ? 'border-cyan-400 text-cyan-300 bg-cyan-500/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Usb className="w-3.5 h-3.5" />
            Hardware &amp; Presets
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('audio')}
            className={`px-4 py-2 text-xs font-montserrat-bold rounded-t-lg border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'audio'
                ? 'border-purple-400 text-purple-300 bg-purple-500/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Headphones className="w-3.5 h-3.5" />
            Audio &amp; Headphone Cue
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('learn')}
            className={`px-4 py-2 text-xs font-montserrat-bold rounded-t-lg border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'learn'
                ? 'border-pink-400 text-pink-300 bg-pink-500/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            MIDI Learn ({controller.activeBindings.length})
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
          {controller.midiError && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" />
              <span>{controller.midiError}</span>
            </div>
          )}

          {/* TAB 1: HARDWARE & PRESETS */}
          {activeTab === 'hardware' && (
            <>
              {/* Connected Devices */}
              <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-montserrat-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Usb className="w-4 h-4 text-cyan-400" />
                    Detected USB MIDI Controllers / CDJs
                  </h3>
                  <span className="text-[11px] text-gray-400">Hot-plug auto-detect enabled</span>
                </div>

                {controller.devices.length === 0 ? (
                  <div className="p-4 rounded-lg bg-black/30 border border-dashed border-white/15 text-center space-y-1.5">
                    <p className="text-gray-300 text-xs font-montserrat-bold">
                      No Pioneer / MIDI hardware detected yet
                    </p>
                    <p className="text-gray-400 text-[11px]">
                      Plug your Pioneer DDJ controller or CDJs into your laptop via USB — PlayMyJam detects them automatically.
                    </p>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-2.5">
                    {controller.devices.map((dev) => (
                      <div
                        key={dev.id}
                        className={`p-3 rounded-lg border flex items-center justify-between gap-2 ${
                          dev.isPioneer
                            ? 'bg-emerald-500/10 border-emerald-400/40'
                            : 'bg-black/35 border-white/15'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                            <span className="text-white text-xs font-montserrat-bold truncate">
                              {dev.name}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-400 truncate mt-0.5">
                            {dev.manufacturer || 'USB MIDI'} •{' '}
                            {dev.hasInput ? 'IN' : ''}
                            {dev.hasInput && dev.hasOutput ? ' + ' : ''}
                            {dev.hasOutput ? 'OUT (LEDs)' : ''}
                          </p>
                        </div>
                        {dev.isPioneer && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-montserrat-bold bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 flex-shrink-0">
                            Pioneer DJ
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Preset Selection */}
              <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-montserrat-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    Hardware Mapping Preset
                  </h3>
                  {controller.config.customBindings && (
                    <button
                      type="button"
                      onClick={controller.resetCurrentPreset}
                      className="text-[11px] text-cyan-300 hover:text-cyan-200 flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reset custom overrides
                    </button>
                  )}
                </div>

                <div className="grid sm:grid-cols-2 gap-2.5">
                  {(Object.keys(PIONEER_MIDI_PRESETS) as MidiPresetId[]).map((id) => {
                    const preset = PIONEER_MIDI_PRESETS[id];
                    const selected = controller.config.presetId === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => controller.selectPreset(id)}
                        className={`text-left p-3 rounded-xl border transition-all ${
                          selected
                            ? 'bg-purple-500/20 border-purple-400 text-white shadow-md'
                            : 'bg-black/30 border-white/10 text-gray-300 hover:border-white/30'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-montserrat-bold text-white">
                            {preset.name}
                          </span>
                          {selected && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500 text-white font-montserrat-bold">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-1">{preset.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Hardware Tuning Settings */}
              <div className="rounded-xl bg-white/5 border border-white/10 p-4 grid sm:grid-cols-3 gap-4">
                <label className="flex items-center justify-between gap-2 bg-black/30 rounded-lg px-3 py-2.5 border border-white/10 cursor-pointer">
                  <div>
                    <div className="text-xs font-montserrat-bold text-white">Controller LEDs</div>
                    <div className="text-[10px] text-gray-400">Light Play, Sync &amp; Cue LEDs</div>
                  </div>
                  <Switch
                    checked={controller.config.ledFeedbackEnabled}
                    onCheckedChange={(v) => controller.updateMidiConfig({ ledFeedbackEnabled: v })}
                  />
                </label>

                <div className="bg-black/30 rounded-lg px-3 py-2.5 border border-white/10">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-montserrat-bold text-white">Jog Sensitivity</span>
                    <span className="text-cyan-300 font-montserrat-bold">
                      {Math.round(controller.config.jogSensitivity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.02}
                    max={0.25}
                    step={0.01}
                    value={controller.config.jogSensitivity}
                    onChange={(e) =>
                      controller.updateMidiConfig({ jogSensitivity: Number(e.target.value) })
                    }
                    className="w-full accent-cyan-400"
                  />
                </div>

                <div className="bg-black/30 rounded-lg px-3 py-2.5 border border-white/10 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-montserrat-bold text-white">Tempo Range</div>
                    <div className="text-[10px] text-gray-400">Pitch slider range</div>
                  </div>
                  <div className="flex gap-1">
                    {[8, 16].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => controller.updateMidiConfig({ pitchRangePercent: pct })}
                        className={`px-2.5 py-1 rounded text-[11px] font-montserrat-bold ${
                          controller.config.pitchRangePercent === pct
                            ? 'bg-cyan-500 text-black'
                            : 'bg-white/10 text-gray-300 hover:bg-white/20'
                        }`}
                      >
                        ±{pct}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Quick Connection Guides */}
              <div className="grid md:grid-cols-2 gap-3 text-[11px] text-gray-300">
                <div className="p-3.5 rounded-xl bg-cyan-950/30 border border-cyan-500/25 space-y-1">
                  <div className="text-cyan-300 font-montserrat-bold text-xs">
                    USB Controller Quick Setup (DDJ-FLX4 / 400 / 1000 / SX)
                  </div>
                  <p>1. Plug controller into your laptop via USB.</p>
                  <p>2. Select your DDJ preset above (auto-detected on connect).</p>
                  <p>
                    3. Open <strong>Audio &amp; Headphone Cue</strong> tab → choose{' '}
                    <strong>Pioneer 4-Ch Controller</strong> and select your Pioneer USB device.
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-500/25 space-y-1">
                  <div className="text-purple-300 font-montserrat-bold text-xs">
                    Club CDJ + DJM Booth Setup (CDJ-2000NXS2 / CDJ-3000)
                  </div>
                  <p>1. Connect CDJs via USB and press <strong>LINK → PC/MIDI</strong> (Left = Ch 1, Right = Ch 2).</p>
                  <p>2. Pick the <strong>Pioneer CDJ (USB MIDI)</strong> preset above.</p>
                  <p>
                    3. Connect DJM mixer via USB → in Audio tab choose{' '}
                    <strong>Club External Mixer (DJM)</strong> for Deck A on Ch 1 &amp; Deck B on Ch 2.
                  </p>
                </div>
              </div>
            </>
          )}

          {/* TAB 2: AUDIO & HEADPHONE CUE */}
          {activeTab === 'audio' && (
            <>
              {audio.routingError && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />
                  <span>{audio.routingError}</span>
                </div>
              )}

              {/* Routing Mode Cards */}
              <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-montserrat-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Speaker className="w-4 h-4 text-purple-400" />
                    Audio Output Routing Mode
                  </h3>
                  <span className="text-[11px] text-cyan-300">
                    Current device max channels: {audio.maxOutputChannels}ch
                  </span>
                </div>

                <div className="grid sm:grid-cols-2 gap-2.5">
                  {ROUTING_MODES.map((m) => {
                    const active = audio.routingMode === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => audio.setRoutingMode(m.id)}
                        className={`text-left p-3 rounded-xl border transition-all ${
                          active
                            ? 'bg-purple-500/20 border-purple-400 text-white'
                            : 'bg-black/30 border-white/10 text-gray-300 hover:border-white/30'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-montserrat-bold text-white">{m.title}</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/10 text-cyan-300 font-montserrat-bold">
                            {m.badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400 mt-1">{m.subtitle}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Output Device Selectors */}
              <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-montserrat-bold text-white mb-1.5">
                      {audio.routingMode === 'controller_4ch'
                        ? 'Pioneer 4-Ch USB Controller Audio Device'
                        : audio.routingMode === 'external_mixer'
                          ? 'Club DJM USB Mixer Audio Device'
                          : 'Master Output Device (Speakers)'}
                    </label>
                    <select
                      value={audio.masterDeviceId}
                      onChange={(e) => audio.setMasterDevice(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-black/50 border border-white/15 text-white text-xs focus:outline-none focus:border-purple-400"
                    >
                      <option value="default" className="bg-[#121329]">
                        System Default Output
                      </option>
                      {audio.outputDevices.map((dev) => (
                        <option key={dev.deviceId} value={dev.deviceId} className="bg-[#121329]">
                          {dev.isPioneer ? `★ ${dev.label}` : dev.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {audio.routingMode === 'dual_device' && (
                    <div>
                      <label className="block text-xs font-montserrat-bold text-white mb-1.5">
                        Headphone Cue Output Device (Secondary)
                      </label>
                      <select
                        value={audio.cueDeviceId}
                        onChange={(e) => audio.setCueDevice(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-black/50 border border-white/15 text-white text-xs focus:outline-none focus:border-cyan-400"
                      >
                        <option value="default" className="bg-[#121329]">
                          System Default Output
                        </option>
                        {audio.outputDevices.map((dev) => (
                          <option key={dev.deviceId} value={dev.deviceId} className="bg-[#121329]">
                            {dev.isPioneer ? `★ ${dev.label}` : dev.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* Headphone Cue (PFL) Monitor Strip */}
              <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
                <h3 className="text-xs font-montserrat-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Headphones className="w-4 h-4 text-cyan-400" />
                  Headphone Cue (Pre-Fader Listen)
                </h3>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={audio.toggleDeckACue}
                    className={`font-montserrat-bold text-xs ${
                      audio.deckACueEnabled
                        ? 'bg-purple-500 text-white border-purple-400 shadow-lg shadow-purple-500/30'
                        : 'border-white/20 text-gray-300 hover:bg-white/10'
                    }`}
                  >
                    <Headphones className="w-3.5 h-3.5 mr-1.5" />
                    Deck A CUE {audio.deckACueEnabled ? 'ON' : 'OFF'}
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={audio.toggleDeckBCue}
                    className={`font-montserrat-bold text-xs ${
                      audio.deckBCueEnabled
                        ? 'bg-blue-500 text-white border-blue-400 shadow-lg shadow-blue-500/30'
                        : 'border-white/20 text-gray-300 hover:bg-white/10'
                    }`}
                  >
                    <Headphones className="w-3.5 h-3.5 mr-1.5" />
                    Deck B CUE {audio.deckBCueEnabled ? 'ON' : 'OFF'}
                  </Button>

                  <div className="flex-1 min-w-[180px] flex items-center gap-2 bg-black/35 px-3 py-2 rounded-lg border border-white/10">
                    <Volume2 className="w-4 h-4 text-cyan-300 flex-shrink-0" />
                    <span className="text-xs text-gray-300 whitespace-nowrap">Cue Vol</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={audio.cueVolume}
                      onChange={(e) => audio.updateCueVolume(Number(e.target.value))}
                      className="flex-1 accent-cyan-400"
                    />
                    <span className="text-xs font-montserrat-bold text-white w-8 text-right">
                      {audio.cueVolume}%
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-gray-400">
                  Pre-Fader Listen sends a deck to your headphones even when its volume fader or crossfader is turned all the way down. You can also toggle it directly using the CUE buttons on your Pioneer controller.
                </p>
              </div>
            </>
          )}

          {/* TAB 3: MIDI LEARN & CUSTOM MAPPING */}
          {activeTab === 'learn' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      { id: 'all', label: 'All Controls' },
                      { id: 'deckA', label: 'Deck A' },
                      { id: 'deckB', label: 'Deck B' },
                      { id: 'mixer', label: 'Mixer' },
                      { id: 'fx', label: 'SFX Pads' },
                    ] as const
                  ).map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setLearnCategory(cat.id)}
                      className={`px-3 py-1 rounded-full text-xs font-montserrat-bold transition-colors ${
                        learnCategory === cat.id
                          ? 'bg-pink-500 text-white'
                          : 'bg-white/10 text-gray-300 hover:bg-white/20'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={controller.resetCurrentPreset}
                  className="border-white/20 text-gray-300 hover:bg-white/10 text-xs"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                  Reset to Preset
                </Button>
              </div>

              <div className="rounded-xl bg-black/30 border border-white/10 divide-y divide-white/5 overflow-hidden">
                {filteredActions.map((action) => {
                  const binding = controller.activeBindings.find((b) => b.action === action.id);
                  const isLearning = controller.learningAction === action.id;
                  return (
                    <div
                      key={action.id}
                      className={`flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs transition-colors ${
                        isLearning ? 'bg-amber-500/15' : 'hover:bg-white/5'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-white font-montserrat-bold truncate">
                          {action.label}
                        </div>
                        <div className="text-[11px] text-gray-400">
                          {formatMidiBinding(binding)}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            isLearning
                              ? controller.cancelMidiLearn()
                              : controller.startMidiLearn(action.id)
                          }
                          className={`h-7 px-3 text-[11px] font-montserrat-bold ${
                            isLearning
                              ? 'border-amber-400 bg-amber-500 text-black animate-pulse'
                              : 'border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/20'
                          }`}
                        >
                          {isLearning ? 'Listening...' : 'Learn'}
                        </Button>
                        {binding && (
                          <button
                            type="button"
                            onClick={() => controller.clearBinding(action.id)}
                            title="Clear mapping"
                            className="w-7 h-7 rounded-md bg-white/5 hover:bg-red-500/30 text-gray-400 hover:text-red-200 flex items-center justify-center transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PioneerHardwareModal;
