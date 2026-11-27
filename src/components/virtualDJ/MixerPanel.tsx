import React from 'react';
import { Volume2, Shuffle, RotateCcw, Play, Square, Music, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useSoundEffects } from '@/hooks/useSoundEffects';

interface MixerPanelProps {
  crossfader: number;
  masterVolume: number;
  isSynced: boolean;
  updateCrossfader: (value: number) => void;
  updateMasterVolume: (volume: number) => void;
  syncBPM: () => void;
  unsyncBPM: () => void;
  playSoundEffect: (effect: 'horn' | 'siren' | 'scratch' | 'whoosh' | 'laser' | 'zap') => void;
  // Advanced effects
  deckAEffects?: any;
  updateDeckAEffects?: (effects: any) => void;
  updateDeckADelay?: (delayTime: number) => void;
  updateDeckAReverb?: (reverbLevel: number) => void;
}

const MixerPanel: React.FC<MixerPanelProps> = ({
  crossfader,
  masterVolume,
  isSynced,
  updateCrossfader,
  updateMasterVolume,
  syncBPM,
  unsyncBPM,
  deckAEffects,
  updateDeckAEffects
}) => {
  // Enhanced sound effects with play/pause
  const { soundEffects, toggleEffect, stopAllEffects } = useSoundEffects();
  return (
    <div
      className="glass-card min-h-full p-4 animate-fade-in-up font-montserrat-light flex flex-col justify-between gap-3"
      style={{ animationDelay: '0.1s' }}
    >
      {/* Master Volume */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-white" />
            <h3 className="text-base font-montserrat-bold text-white">
              Master <span className="neon-text">Volume</span>
            </h3>
          </div>
          <span className="text-sm text-white font-montserrat-bold tabular-nums">
            {typeof masterVolume === 'number' ? masterVolume : 75}%
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={masterVolume}
          onChange={(e) => updateMasterVolume(Number(e.target.value))}
          className="w-full h-2 bg-gradient-to-r from-purple-500 via-gray-700 to-blue-500 rounded-lg appearance-none cursor-pointer crossfader block"
        />
      </div>

      {/* Crossfader */}
      <div>
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-purple-400 font-montserrat-bold text-sm">A</span>
          <span className="text-white font-montserrat-bold text-sm">
            Crossfader{' '}
            <span className="text-gray-300 font-montserrat-light tabular-nums">
              {typeof crossfader === 'number' ? crossfader : 50}%
            </span>
          </span>
          <span className="text-blue-400 font-montserrat-bold text-sm">B</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={crossfader}
          onChange={(e) => updateCrossfader(Number(e.target.value))}
          className="w-full h-2 bg-gradient-to-r from-purple-500 via-gray-700 to-blue-500 rounded-lg appearance-none cursor-pointer crossfader block"
        />
      </div>

      {/* BPM Sync */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-gradient-to-r from-purple-500/20 via-gray-700/20 to-blue-500/20 rounded-lg border border-gray-600/30">
        <span className="text-sm text-white font-montserrat-bold">
          {isSynced ? 'BPM Synced' : 'Sync BPM'}
        </span>
        <Switch
          checked={isSynced}
          onCheckedChange={(checked) => {
            if (checked) {
              syncBPM();
            } else {
              unsyncBPM();
            }
          }}
          className="data-[state=checked]:bg-green-500"
        />
      </div>

      {/* Enhanced Sound Effects with Play/Pause */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm text-white font-montserrat-bold">Sound Effects</h3>
          <Button
            size="sm"
            variant="outline"
            onClick={stopAllEffects}
            className="h-7 px-2.5 text-xs border-red-500 text-red-400 hover:bg-red-500 hover:text-white font-montserrat-bold"
          >
            <Square className="w-3 h-3 mr-1" />
            Stop All
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {soundEffects.map((effect) => {
            return (
              <Button
                key={effect.filename}
                size="sm"
                title={effect.name}
                className={`hover:scale-[1.02] transition-transform h-8 text-white font-montserrat-bold active:scale-95 flex items-center justify-between px-2 border border-gray-600/30 ${
                  effect.isPlaying ? 'animate-pulse bg-[#222240]/60' : 'bg-[#222240]/40 hover:bg-[#3a3a6a]/50'
                }`}
                onClick={() => toggleEffect(effect.filename)}
              >
                <span className="text-xs truncate flex-1 text-left">{effect.name}</span>
                <div className="ml-1 flex-shrink-0 opacity-80">
                  {effect.isPlaying ? (
                    <Square className="w-2.5 h-2.5" />
                  ) : (
                    <Play className="w-2.5 h-2.5" />
                  )}
                </div>
              </Button>
            );
          })}
        </div>
      </div>

      {/* Advanced Effects (2x2 grid) */}
      <div>
        <div className="flex items-center gap-2 mb-2.5">
          <Zap className="w-4 h-4 text-white" />
          <h3 className="text-base font-montserrat-bold text-white">
            Advanced <span className="neon-text">Effects</span>
          </h3>
        </div>

        <div className="grid grid-cols-2 gap-x-3.5 gap-y-3">
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <label className="text-gray-200 font-montserrat-light">Echo/Delay</label>
              <span className="text-white font-montserrat-bold tabular-nums">
                {deckAEffects?.delay || 0}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={deckAEffects?.delay || 0}
              onChange={(e) => {
                const value = Number(e.target.value);
                updateDeckAEffects?.({ ...deckAEffects, delay: value });
              }}
              className="w-full h-2 bg-gradient-to-r from-purple-500 via-gray-700 to-blue-500 rounded-lg appearance-none cursor-pointer crossfader block"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <label className="text-gray-200 font-montserrat-light">Reverb</label>
              <span className="text-white font-montserrat-bold tabular-nums">
                {deckAEffects?.reverb || 0}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={deckAEffects?.reverb || 0}
              onChange={(e) => {
                const value = Number(e.target.value);
                updateDeckAEffects?.({ ...deckAEffects, reverb: value });
              }}
              className="w-full h-2 bg-gradient-to-r from-purple-500 via-gray-700 to-blue-500 rounded-lg appearance-none cursor-pointer crossfader block"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <label className="text-gray-200 font-montserrat-light">Filter</label>
              <span className="text-white font-montserrat-bold tabular-nums">
                {deckAEffects?.filter || 50}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={deckAEffects?.filter || 50}
              onChange={(e) => updateDeckAEffects?.({ ...deckAEffects, filter: Number(e.target.value) })}
              className="w-full h-2 bg-gradient-to-r from-purple-500 via-gray-700 to-blue-500 rounded-lg appearance-none cursor-pointer crossfader block"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <label className="text-gray-200 font-montserrat-light">Distortion</label>
              <span className="text-white font-montserrat-bold tabular-nums">
                {deckAEffects?.distortion || 0}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={deckAEffects?.distortion || 0}
              onChange={(e) => updateDeckAEffects?.({ ...deckAEffects, distortion: Number(e.target.value) })}
              className="w-full h-2 bg-gradient-to-r from-purple-500 via-gray-700 to-blue-500 rounded-lg appearance-none cursor-pointer crossfader block"
            />
          </div>
        </div>
      </div>

      {/* Reset Button */}
      <div>
        <Button
          size="sm"
          variant="outline"
          className="w-full h-9 text-sm border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white font-montserrat-bold"
          onClick={() => {
            updateCrossfader(50);
            updateMasterVolume(75);
          }}
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          Reset Mixer
        </Button>
      </div>
    </div>
  );
};

export default MixerPanel;
