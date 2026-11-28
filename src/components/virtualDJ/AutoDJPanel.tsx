import React, { useState, useEffect } from 'react';
import {
  X,
  Play,
  Pause,
  SkipForward,
  SlidersHorizontal,
  Music,
  Shuffle,
  AlertCircle,
  Sparkles,
  Disc3,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import type { Song } from '@/Types';

interface AutoDJStateLike {
  isEnabled: boolean;
  activeDeck: 'A' | 'B';
  isTransitioning: boolean;
  transitionProgress: number;
  transitionDuration: number;
  crossfadeSpeed: number;
}

interface AutoDJPanelProps {
  isOpen: boolean;
  onClose: () => void;
  autoDJState: AutoDJStateLike;
  currentSong?: Song | null;
  nextSong?: Song | null;
  timeRemaining: number;
  pendingRequestsCount?: number;
  startAutoDJ: () => void;
  stopAutoDJ: () => void;
  skipToNext: () => void;
  updateTransitionDuration: (seconds: number) => void;
  updateCrossfadeSpeed: (seconds: number) => void;
}

const formatTime = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const AutoDJPanel: React.FC<AutoDJPanelProps> = ({
  isOpen,
  onClose,
  autoDJState,
  currentSong,
  nextSong,
  timeRemaining,
  pendingRequestsCount = 0,
  startAutoDJ,
  stopAutoDJ,
  skipToNext,
  updateTransitionDuration,
  updateCrossfadeSpeed,
}) => {
  const [lastNextSongId, setLastNextSongId] = useState<string | null>(null);
  const [showQueueUpdate, setShowQueueUpdate] = useState(false);

  // Close on Escape key (matching other modals)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Brief banner when Up Next changes while Auto DJ is active
  useEffect(() => {
    const nextId = nextSong?.id || null;
    if (autoDJState.isEnabled && nextId && lastNextSongId && nextId !== lastNextSongId) {
      setShowQueueUpdate(true);
      const timer = setTimeout(() => setShowQueueUpdate(false), 4500);
      setLastNextSongId(nextId);
      return () => clearTimeout(timer);
    }
    setLastNextSongId(nextId);
  }, [nextSong?.id, lastNextSongId, autoDJState.isEnabled]);

  if (!isOpen) return null;

  const standbyDeck: 'A' | 'B' = autoDJState.activeDeck === 'A' ? 'B' : 'A';
  const approachingTransition =
    autoDJState.isEnabled &&
    !autoDJState.isTransitioning &&
    timeRemaining > 0 &&
    timeRemaining <= autoDJState.transitionDuration;

  const handleToggleAutoDJ = (checked: boolean) => {
    if (checked) {
      startAutoDJ();
    } else {
      stopAutoDJ();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl border border-purple-500/35 bg-gradient-to-br from-[#161530] via-[#1d1942] to-[#12122a] shadow-2xl overflow-hidden text-white font-montserrat-light"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between gap-3 bg-black/25 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                autoDJState.isTransitioning
                  ? 'bg-gradient-to-br from-cyan-400 to-purple-600 animate-pulse shadow-lg shadow-purple-500/30'
                  : autoDJState.isEnabled
                    ? 'bg-gradient-to-br from-emerald-500 to-cyan-600'
                    : 'bg-gray-800 border border-white/15'
              }`}
            >
              <Shuffle className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-montserrat-bold text-white">
                  Auto <span className="neon-text">DJ</span>
                </h2>
                {autoDJState.isTransitioning ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 animate-pulse">
                    <Sparkles className="w-2.5 h-2.5" />
                    Crossfading...
                  </span>
                ) : autoDJState.isEnabled ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">
                    <Disc3 className="w-2.5 h-2.5 animate-spin" style={{ animationDuration: '4s' }} />
                    Active • Deck {autoDJState.activeDeck}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/10 text-gray-300 border border-white/15">
                    Standby
                  </span>
                )}
                {pendingRequestsCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-pink-500/20 text-pink-300 border border-pink-400/40">
                    {pendingRequestsCount} request{pendingRequestsCount === 1 ? '' : 's'} queued
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-300 truncate">
                Hands-free smooth crossfades between Deck A &amp; Deck B with automatic request priority
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10">
              <span className="text-xs font-montserrat-bold text-white">
                {autoDJState.isEnabled ? 'AUTO ON' : 'AUTO OFF'}
              </span>
              <Switch
                checked={autoDJState.isEnabled}
                onCheckedChange={handleToggleAutoDJ}
                className="data-[state=checked]:bg-emerald-500"
              />
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Close Auto DJ"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
          {/* Queue Update Notification */}
          {showQueueUpdate && nextSong && (
            <div className="px-3.5 py-2.5 rounded-xl bg-amber-500/15 border border-amber-400/40 text-xs flex items-center gap-2 text-amber-200">
              <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span className="truncate">
                Queue updated — <strong>{nextSong.title}</strong> is now cued up next on Deck {standbyDeck}.
              </span>
            </div>
          )}

          {/* Live Transition Progress Bar */}
          {autoDJState.isEnabled && autoDJState.isTransitioning && (
            <div className="rounded-xl bg-cyan-500/10 border border-cyan-400/35 p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-cyan-200 font-montserrat-bold flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                  Crossfading Deck {autoDJState.activeDeck} → Deck {standbyDeck}
                </span>
                <span className="text-white font-montserrat-bold tabular-nums">
                  {Math.round(autoDJState.transitionProgress)}%
                </span>
              </div>
              <div className="w-full bg-black/50 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-purple-500 via-cyan-400 to-emerald-400 h-2 rounded-full transition-all duration-100"
                  style={{ width: `${Math.min(100, Math.max(0, autoDJState.transitionProgress))}%` }}
                />
              </div>
            </div>
          )}

          {/* Now Playing & Up Next Cards */}
          {autoDJState.isEnabled && (currentSong || nextSong) ? (
            <div className="grid sm:grid-cols-2 gap-3">
              {/* Now Playing */}
              <div className="rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/15 border border-purple-400/30 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-wider font-montserrat-bold text-purple-300 flex items-center gap-1.5">
                    <Music className="w-3.5 h-3.5" />
                    Now Playing
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/25 text-purple-200 border border-purple-400/40">
                    Deck {autoDJState.activeDeck}
                  </span>
                </div>

                {currentSong ? (
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-black/40 border border-white/10 overflow-hidden flex items-center justify-center flex-shrink-0">
                      {currentSong.albumArt ? (
                        <img
                          src={currentSong.albumArt}
                          alt={currentSong.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Music className="w-4 h-4 text-purple-300" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-montserrat-bold text-white truncate">
                        {currentSong.title}
                      </p>
                      <p className="text-xs text-gray-300 truncate">{currentSong.artist}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">Waiting for track...</p>
                )}

                <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs">
                  <span className="text-gray-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Remaining
                  </span>
                  <span
                    className={`font-montserrat-bold tabular-nums ${
                      approachingTransition ? 'text-amber-300 animate-pulse' : 'text-white'
                    }`}
                  >
                    {formatTime(timeRemaining)}
                  </span>
                </div>
              </div>

              {/* Up Next */}
              <div className="rounded-xl bg-white/5 border border-white/10 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-wider font-montserrat-bold text-cyan-300 flex items-center gap-1.5">
                    <SkipForward className="w-3.5 h-3.5" />
                    Up Next
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-200 border border-blue-400/40">
                    Deck {standbyDeck}
                  </span>
                </div>

                {nextSong ? (
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-black/40 border border-white/10 overflow-hidden flex items-center justify-center flex-shrink-0">
                      {nextSong.albumArt ? (
                        <img
                          src={nextSong.albumArt}
                          alt={nextSong.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Music className="w-4 h-4 text-cyan-300" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-montserrat-bold text-white truncate">
                        {nextSong.title}
                      </p>
                      <p className="text-xs text-gray-300 truncate">{nextSong.artist}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">Selecting next track...</p>
                )}

                <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs">
                  <span className="text-gray-400">Mix starts at</span>
                  <span className="text-cyan-300 font-montserrat-bold tabular-nums">
                    {formatTime(autoDJState.transitionDuration)} left
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-blue-500/10 border border-blue-500/30 p-3.5 text-xs text-blue-200 leading-relaxed">
              Turn on <strong>Auto DJ</strong> to automatically crossfade between decks at the end of every song.
              Incoming TikTok &amp; PlayMyJam requests jump to the front once, then playback smoothly continues through your library.
            </div>
          )}

          {/* Primary Action Buttons */}
          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              onClick={autoDJState.isEnabled ? stopAutoDJ : startAutoDJ}
              className={`flex-1 h-10 text-sm font-montserrat-bold text-white ${
                autoDJState.isEnabled
                  ? 'bg-red-500 hover:bg-red-600'
                  : 'bg-gradient-to-r from-emerald-500 to-cyan-600 hover:opacity-95'
              }`}
            >
              {autoDJState.isEnabled ? (
                <>
                  <Pause className="w-4 h-4 mr-2" />
                  Stop Auto DJ
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Start Auto DJ
                </>
              )}
            </Button>

            {autoDJState.isEnabled && (
              <Button
                type="button"
                onClick={skipToNext}
                disabled={autoDJState.isTransitioning}
                variant="outline"
                className="h-10 px-4 border-cyan-400/60 text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500 hover:text-black font-montserrat-bold text-xs"
                title="Smoothly crossfade to the next track right now"
              >
                <SkipForward className="w-4 h-4 mr-1.5" />
                Transition Now
              </Button>
            )}
          </div>

          {/* Mix Timing & Crossfade Settings */}
          <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-4">
            <h3 className="text-xs font-montserrat-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Transition &amp; Crossfade Settings
            </h3>

            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-gray-200">Transition Start</span>
                <span className="px-2 py-0.5 rounded bg-black/40 border border-white/10 text-purple-200 font-montserrat-bold tabular-nums">
                  {autoDJState.transitionDuration}s before end
                </span>
              </div>
              <input
                type="range"
                min="5"
                max="30"
                value={autoDJState.transitionDuration}
                onChange={(e) => updateTransitionDuration(Number(e.target.value))}
                className="w-full h-2 bg-gradient-to-r from-purple-500 via-gray-700 to-blue-500 rounded-lg appearance-none cursor-pointer crossfader"
              />
              <div className="flex justify-between text-[11px] text-gray-400 mt-1">
                <span>5s (Late mix)</span>
                <span>30s (Early blend)</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-gray-200">Crossfade Speed</span>
                <span className="px-2 py-0.5 rounded bg-black/40 border border-white/10 text-cyan-200 font-montserrat-bold tabular-nums">
                  {autoDJState.crossfadeSpeed}s fade
                </span>
              </div>
              <input
                type="range"
                min="2"
                max="15"
                value={autoDJState.crossfadeSpeed}
                onChange={(e) => updateCrossfadeSpeed(Number(e.target.value))}
                className="w-full h-2 bg-gradient-to-r from-purple-500 via-gray-700 to-blue-500 rounded-lg appearance-none cursor-pointer crossfader"
              />
              <div className="flex justify-between text-[11px] text-gray-400 mt-1">
                <span>2s (Quick cut)</span>
                <span>15s (Slow smooth)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AutoDJPanel;
