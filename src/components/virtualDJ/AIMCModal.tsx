import React, { useEffect, useState } from 'react';
import {
  X,
  Mic,
  Volume2,
  Sparkles,
  SkipForward,
  Send,
  Loader2,
  Radio,
  MessageCircleQuestion,
  UserPlus,
  Gift,
  Music2,
  Trash2,
  AlertCircle,
  SlidersHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import type { useAIMC } from '@/hooks/useAIMC';
import type { AIMCAccent, AIMCEnergy, AIMCVoiceName } from '@/lib/playServerApi';

type AIMCController = ReturnType<typeof useAIMC>;

interface AIMCModalProps {
  isOpen: boolean;
  onClose: () => void;
  aiMC: AIMCController;
  isTikTokConnected: boolean;
  onOpenTikTokModal: () => void;
  onSimulateRequestComment?: (viewerName: string, comment: string, grantVipCoins: number) => void;
  activeRequestNotice?: string;
  searchingQueries?: string[];
}

const ACCENT_OPTIONS: Array<{ value: AIMCAccent; label: string }> = [
  { value: 'zim', label: 'Zimbabwean (Zim Hype)' },
  { value: 'sa', label: 'South African (Amapiano)' },
  { value: 'jamaican', label: 'Jamaican Dancehall' },
  { value: 'us_club', label: 'US Nightclub MC' },
  { value: 'uk_club', label: 'UK Club MC' },
];

const VOICE_OPTIONS: Array<{ value: AIMCVoiceName; label: string }> = [
  { value: 'Fenrir', label: 'Fenrir — Deep Hype Male' },
  { value: 'Puck', label: 'Puck — Upbeat Lively Male' },
  { value: 'Charon', label: 'Charon — Smooth Deep Radio' },
  { value: 'Kore', label: 'Kore — Energetic Female' },
  { value: 'Zephyr', label: 'Zephyr — Warm Bright Female' },
  { value: 'Aoede', label: 'Aoede — Charismatic Female' },
];

const ENERGY_OPTIONS: Array<{ value: AIMCEnergy; label: string }> = [
  { value: 'hype', label: 'Club Hype' },
  { value: 'radio', label: 'Radio DJ' },
  { value: 'chill', label: 'Chill Host' },
];

const EVENT_BADGE: Record<string, { label: string; color: string }> = {
  join: { label: 'JOIN', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  question: { label: 'Q&A', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' },
  gift: { label: 'GIFT', color: 'bg-pink-500/20 text-pink-300 border-pink-500/40' },
  follow: { label: 'FOLLOW', color: 'bg-purple-500/20 text-purple-300 border-purple-500/40' },
  share: { label: 'SHARE', color: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
  now_playing: { label: 'TRACK', color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' },
  hype: { label: 'HYPE', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  custom: { label: 'MIC', color: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40' },
  song_queued: { label: 'REQ', color: 'bg-green-500/20 text-green-300 border-green-500/40' },
  song_need_coins: { label: 'COINS', color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40' },
  ai_song_cooking: { label: 'COOKING', color: 'bg-fuchsia-500/25 text-fuchsia-200 border-fuchsia-400/50' },
  ai_song_ready: { label: 'AI SONG', color: 'bg-violet-500/25 text-violet-200 border-violet-400/50' },
};

const AIMCModal: React.FC<AIMCModalProps> = ({
  isOpen,
  onClose,
  aiMC,
  isTikTokConnected,
  onOpenTikTokModal,
  onSimulateRequestComment,
  activeRequestNotice = '',
  searchingQueries = [],
}) => {
  const [customLine, setCustomLine] = useState('');
  const [testViewerName, setTestViewerName] = useState('Jossy');
  const [simulatedComment, setSimulatedComment] = useState('');
  const [includeTestCoins, setIncludeTestCoins] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const { config, updateConfig } = aiMC;

  const handleSpeakCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customLine.trim()) return;
    aiMC.speakCustom(customLine);
    setCustomLine('');
  };

  const handleSendSimulatedComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!simulatedComment.trim()) return;
    const viewer = testViewerName || 'Jossy';
    if (onSimulateRequestComment) {
      // Runs through the REAL AI song request + VIP AI song + AI MC pipeline!
      onSimulateRequestComment(viewer, simulatedComment, includeTestCoins ? 50 : 0);
    } else {
      aiMC.testQuestion(viewer, simulatedComment);
    }
    setSimulatedComment('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border border-amber-500/35 bg-gradient-to-br from-[#161530] via-[#1d1942] to-[#12122a] shadow-2xl overflow-hidden text-white font-montserrat-light"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between gap-3 bg-black/25 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                aiMC.isSpeaking
                  ? 'bg-gradient-to-br from-amber-400 to-orange-600 animate-pulse shadow-lg shadow-amber-500/30'
                  : config.enabled
                    ? 'bg-gradient-to-br from-amber-500 to-pink-600'
                    : 'bg-gray-800 border border-white/15'
              }`}
            >
              <Mic className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-montserrat-bold text-white">
                  AI <span className="neon-text">MC</span>
                </h2>
                {aiMC.isGenerating ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/40">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    Preparing voice...
                  </span>
                ) : aiMC.isSpeaking ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 animate-pulse">
                    <Volume2 className="w-2.5 h-2.5" />
                    On Air
                  </span>
                ) : config.enabled ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-200 border border-purple-400/40">
                    <Sparkles className="w-2.5 h-2.5" />
                    Listening Live
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/10 text-gray-300 border border-white/15">
                    Standby
                  </span>
                )}
                {aiMC.isLiveStreamConnected && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-400/35"
                    title={`Persistent real-time WebSocket stream (${aiMC.liveModelName || 'Gemini Live'}) • auto-resets every 10 turns & sleeps after 2m idle`}
                  >
                    ⚡ Real-Time{aiMC.lastLatencyMs ? ` • ${(aiMC.lastLatencyMs / 1000).toFixed(1)}s` : ''}
                  </span>
                )}
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/10 text-gray-200 border border-white/15 tabular-nums"
                  title="Hourly AI MC credit guard (rolling 60-minute count)"
                >
                  {aiMC.shoutoutsThisHour}/{config.maxShoutoutsPerHour === 0 ? '∞' : config.maxShoutoutsPerHour} / hr
                </span>
                {aiMC.queuedCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                    +{aiMC.queuedCount} queued
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-300 truncate">
                Live Zimbabwean hype host — welcomes TikTok joiners, answers chat questions &amp; hypes gifts with Gemini AI Voice
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10">
              <span className="text-xs font-montserrat-bold text-white">
                {config.enabled ? 'MC ON' : 'MC OFF'}
              </span>
              <Switch
                checked={config.enabled}
                onCheckedChange={(checked) => updateConfig({ enabled: checked })}
                className="data-[state=checked]:bg-emerald-500"
              />
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Close AI MC Studio"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
          {/* TikTok Connection / Standby Status Banner */}
          {!isTikTokConnected ? (
            <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-pink-500/10 border border-pink-500/30 text-xs">
              <div className="flex items-center gap-2 text-pink-200">
                <Radio className="w-4 h-4 text-[#fe2c55] flex-shrink-0" />
                <span>
                  Connect your TikTok LIVE to automatically greet joiners and reply to viewer comments — or test the MC mic below right now!
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  onClose();
                  onOpenTikTokModal();
                }}
                className="bg-[#fe2c55] hover:bg-[#e1254a] text-white text-xs h-7 px-3 flex-shrink-0"
              >
                Connect TikTok
              </Button>
            </div>
          ) : !config.enabled ? (
            <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-amber-500/15 border border-amber-400/45 text-xs">
              <div className="flex items-center gap-2 text-amber-200">
                <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span>
                  TikTok LIVE is connected, but <strong>AI MC is OFF</strong>. Turn it ON so it automatically responds to live comments, joins &amp; gifts!
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => updateConfig({ enabled: true })}
                className="bg-emerald-500 hover:bg-emerald-400 text-black font-montserrat-bold text-xs h-7 px-3 flex-shrink-0"
              >
                Turn MC ON
              </Button>
            </div>
          ) : null}

          {/* Live TikTok Activity Telemetry */}
          {(isTikTokConnected ||
            aiMC.liveStats.commentsSeen > 0 ||
            aiMC.liveStats.joinsSeen > 0 ||
            aiMC.liveStats.giftsSeen > 0) && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-black/30 border border-white/10 text-[11px]">
              <span className="text-emerald-300 font-semibold flex items-center gap-1.5">
                <Radio className="w-3 h-3 animate-pulse" />
                Feed Seen: {aiMC.liveStats.commentsSeen} comments • {aiMC.liveStats.joinsSeen} joins • {aiMC.liveStats.giftsSeen} gifts
              </span>
              {aiMC.liveStats.lastEventNote && (
                <span className="text-gray-300 truncate max-w-[360px]">
                  {aiMC.liveStats.lastEventNote}
                </span>
              )}
            </div>
          )}

          {/* On-Air Transcript + Error Bar */}
          {(aiMC.isGenerating || aiMC.isSpeaking || aiMC.currentLine || aiMC.lastError) && (
            <div className="rounded-xl bg-black/35 border border-amber-500/30 p-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] uppercase tracking-wider font-montserrat-bold text-amber-300">
                      {aiMC.isSpeaking ? 'Speaking Now' : aiMC.isGenerating ? 'Generating MC Line...' : 'Last Spoken Line'}
                    </span>
                    {aiMC.lastVoiceMode && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-gray-300">
                        {aiMC.lastVoiceMode === 'gemini-live'
                          ? `⚡ Gemini Live Stream (${config.voiceName})${aiMC.lastLatencyMs ? ` • ${(aiMC.lastLatencyMs / 1000).toFixed(1)}s` : ''}`
                          : aiMC.lastVoiceMode === 'gemini'
                            ? `Gemini Voice (${config.voiceName})`
                            : 'System Voice Fallback'}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-white font-medium leading-snug">
                    {aiMC.currentLine ? `"${aiMC.currentLine}"` : 'Warming up the microphone...'}
                  </p>
                </div>

                {(aiMC.isSpeaking || aiMC.queuedCount > 0) && (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {aiMC.isSpeaking && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={aiMC.skipCurrent}
                        className="h-7 px-2.5 text-xs border-red-400/60 text-red-300 hover:bg-red-500 hover:text-white"
                      >
                        <SkipForward className="w-3.5 h-3.5 mr-1" />
                        Skip
                      </Button>
                    )}
                    {aiMC.queuedCount > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={aiMC.clearQueue}
                        className="h-7 px-2 text-xs border-gray-500 text-gray-300 hover:bg-gray-700"
                      >
                        Clear Queue
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {aiMC.lastError && (
                <div className="flex items-start gap-2 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1.5">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>{aiMC.lastError}</span>
                </div>
              )}
            </div>
          )}

          {/* Quick Live Mic & Offline Viewer Simulator (No TikTok Needed) */}
          <div className="rounded-xl bg-white/5 border border-white/10 p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-montserrat-bold text-amber-300 flex items-center gap-1.5">
                <Mic className="w-3.5 h-3.5" />
                Test Studio (No TikTok Needed)
              </span>

              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  type="text"
                  value={testViewerName}
                  onChange={(e) => setTestViewerName(e.target.value)}
                  placeholder="Viewer name"
                  className="w-24 px-2 py-1 rounded-md bg-black/45 border border-white/15 text-xs text-white focus:outline-none focus:border-amber-400"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={aiMC.isGenerating}
                  onClick={() => aiMC.testJoin(testViewerName || 'Jossy')}
                  className="h-7 px-2.5 text-xs bg-emerald-600/85 hover:bg-emerald-500 text-white"
                >
                  <UserPlus className="w-3 h-3 mr-1" />
                  Join
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={aiMC.isGenerating}
                  onClick={() => aiMC.testGift(testViewerName || 'Jossy', 'Rose', 5, 5)}
                  className="h-7 px-2.5 text-xs bg-pink-600/85 hover:bg-pink-500 text-white"
                >
                  <Gift className="w-3 h-3 mr-1" />
                  Gift
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={aiMC.isGenerating}
                  onClick={aiMC.testHype}
                  className="h-7 px-2.5 text-xs bg-amber-500 hover:bg-amber-400 text-black font-montserrat-bold"
                >
                  <Sparkles className="w-3 h-3 mr-1" />
                  Hype
                </Button>
              </div>
            </div>

            {/* Simulate Viewer Comment / AI Song Request Input */}
            <form onSubmit={handleSendSimulatedComment} className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={simulatedComment}
                  onChange={(e) => setSimulatedComment(e.target.value)}
                  placeholder={`Comment or request from ${testViewerName || 'Jossy'} (e.g. "DJ play Macheso" or "Make a Zimdancehall song for Jossy!")`}
                  className="flex-1 px-3 py-2 rounded-lg bg-black/45 border border-cyan-500/35 text-xs text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={!simulatedComment.trim() || aiMC.isGenerating}
                  className="h-8 px-3.5 text-xs bg-cyan-600 hover:bg-cyan-500 text-white font-montserrat-bold flex-shrink-0"
                >
                  <MessageCircleQuestion className="w-3.5 h-3.5 mr-1.5" />
                  Send Comment
                </Button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <label className="inline-flex items-center gap-1.5 text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeTestCoins}
                    onChange={(e) => setIncludeTestCoins(e.target.checked)}
                    className="rounded accent-fuchsia-500"
                  />
                  <span>
                    Give {testViewerName || 'Jossy'} <strong className="text-fuchsia-300">50 test VIP coins</strong> (uncheck to test &ldquo;need coins&rdquo; reminder)
                  </span>
                </label>
                {searchingQueries.length > 0 ? (
                  <span className="text-fuchsia-300 font-semibold flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {searchingQueries[0]}
                  </span>
                ) : activeRequestNotice ? (
                  <span className="text-emerald-300 truncate max-w-[300px]">{activeRequestNotice}</span>
                ) : null}
              </div>
            </form>

            {/* Direct DJ Mic Announcement */}
            <form onSubmit={handleSpeakCustom} className="flex items-center gap-2">
              <input
                type="text"
                value={customLine}
                onChange={(e) => setCustomLine(e.target.value)}
                placeholder='Or type a direct DJ announcement (e.g. "Shoutout to Bulawayo massive, drop a gift for your song!")'
                className="flex-1 px-3 py-2 rounded-lg bg-black/45 border border-white/15 text-xs text-white placeholder-gray-400 focus:outline-none focus:border-amber-400"
              />
              <Button
                type="submit"
                size="sm"
                disabled={!customLine.trim() || aiMC.isGenerating}
                className="h-8 px-3.5 text-xs bg-gradient-to-r from-amber-500 to-pink-600 hover:opacity-95 text-white font-montserrat-bold flex-shrink-0"
              >
                <Send className="w-3.5 h-3.5 mr-1.5" />
                Announce
              </Button>
            </form>
          </div>

          {/* 2-Column Configuration + Transcript */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Left Column: Persona, Accent & Gemini Voice */}
            <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
              <h3 className="text-xs font-montserrat-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                MC Persona &amp; Gemini Voice
              </h3>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] text-gray-300 mb-1">MC Name</label>
                  <input
                    type="text"
                    value={config.mcName}
                    onChange={(e) => updateConfig({ mcName: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-black/45 border border-white/15 text-xs text-white focus:outline-none focus:border-purple-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-300 mb-1">Accent / Style</label>
                  <select
                    value={config.accent}
                    onChange={(e) => updateConfig({ accent: e.target.value as AIMCAccent })}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-black/60 border border-white/15 text-xs text-white focus:outline-none focus:border-purple-400"
                  >
                    {ACCENT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value} className="bg-[#161530]">
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] text-gray-300 mb-1">Gemini AI Voice</label>
                  <select
                    value={config.voiceName}
                    onChange={(e) => updateConfig({ voiceName: e.target.value as AIMCVoiceName })}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-black/60 border border-white/15 text-xs text-white focus:outline-none focus:border-purple-400"
                  >
                    {VOICE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value} className="bg-[#161530]">
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-gray-300 mb-1">Energy</label>
                  <div className="grid grid-cols-3 gap-1">
                    {ENERGY_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => updateConfig({ energy: opt.value })}
                        className={`py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                          config.energy === opt.value
                            ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                            : 'bg-black/35 border-white/10 text-gray-400 hover:text-white'
                        }`}
                      >
                        {opt.label.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-black/30 border border-white/10">
                <div>
                  <p className="text-xs font-semibold text-white">Gemini AI Voice</p>
                  <p className="text-[10px] text-gray-400">
                    Expressive Zim MC audio via Gemini TTS (auto-falls back to device voice if offline)
                  </p>
                </div>
                <Switch
                  checked={config.useGeminiVoice}
                  onCheckedChange={(checked) => updateConfig({ useGeminiVoice: checked })}
                  className="data-[state=checked]:bg-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] text-gray-300 mb-1">
                  What We Do On This Live (MC Script Context &amp; Rules)
                </label>
                <textarea
                  rows={3}
                  value={config.aboutLive}
                  onChange={(e) => updateConfig({ aboutLive: e.target.value })}
                  placeholder="Tell the AI MC what your live is about so it welcomes people and answers questions accurately..."
                  className="w-full px-2.5 py-2 rounded-lg bg-black/45 border border-white/15 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-400 resize-none"
                />
              </div>
            </div>

            {/* Right Column: Auto-Triggers & Talkover Audio Controls */}
            <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
              <h3 className="text-xs font-montserrat-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Live Triggers &amp; Audio Ducking
              </h3>

              <div className="space-y-1.5">
                <div className="px-2.5 py-1.5 rounded-lg bg-black/30 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-200 flex items-center gap-2">
                      <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
                      Welcome joining viewers by name
                    </span>
                    <Switch
                      checked={config.welcomeJoins}
                      onCheckedChange={(checked) => updateConfig({ welcomeJoins: checked })}
                      className="scale-90 data-[state=checked]:bg-emerald-500"
                    />
                  </div>
                  <div className="flex items-center justify-between pl-5 pt-1.5 border-t border-white/10">
                    <div className="min-w-0 pr-2">
                      <p className="text-[11px] font-semibold text-emerald-200">
                        Always talk to joiners
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {config.alwaysTalkToJoiners
                          ? 'ON: Greets every viewer who joins the live'
                          : 'OFF: Randomly welcomes joiners to keep flow natural'}
                      </p>
                    </div>
                    <Switch
                      checked={config.alwaysTalkToJoiners}
                      onCheckedChange={(checked) =>
                        updateConfig({
                          alwaysTalkToJoiners: checked,
                          ...(checked && !config.welcomeJoins ? { welcomeJoins: true } : {}),
                        })
                      }
                      className="scale-90 data-[state=checked]:bg-emerald-500"
                    />
                  </div>
                </div>

                <div className="px-2.5 py-1.5 rounded-lg bg-black/30 border border-white/10 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-200 flex items-center gap-2">
                      <MessageCircleQuestion className="w-3.5 h-3.5 text-cyan-400" />
                      Answer host-directed questions (EN &amp; Shona)
                    </span>
                    <Switch
                      checked={config.answerQuestions}
                      onCheckedChange={(checked) => updateConfig({ answerQuestions: checked })}
                      className="scale-90 data-[state=checked]:bg-cyan-500"
                    />
                  </div>
                  {config.answerQuestions && (
                    <div className="space-y-1 pt-0.5">
                      <div className="grid grid-cols-2 gap-1">
                        <button
                          type="button"
                          onClick={() => updateConfig({ commentReplyMode: 'host_questions' })}
                          className={`py-1 rounded text-[10px] font-semibold border transition-colors ${
                            config.commentReplyMode === 'host_questions'
                              ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200'
                              : 'bg-black/30 border-white/10 text-gray-400 hover:text-white'
                          }`}
                        >
                          Host Questions Only (Smart)
                        </button>
                        <button
                          type="button"
                          onClick={() => updateConfig({ commentReplyMode: 'all' })}
                          className={`py-1 rounded text-[10px] font-semibold border transition-colors ${
                            config.commentReplyMode === 'all'
                              ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200'
                              : 'bg-black/30 border-white/10 text-gray-400 hover:text-white'
                          }`}
                        >
                          All Comments
                        </button>
                      </div>
                      <p className="text-[10px] text-gray-400 leading-tight">
                        {config.commentReplyMode === 'host_questions'
                          ? 'AI skips viewers talking to each other (@mentions & side banter) and only replies to questions aimed at the host/DJ.'
                          : 'Replies to all readable live comments (still skips @mentions to other viewers).'}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-black/30 border border-white/10">
                  <span className="text-xs text-gray-200 flex items-center gap-2">
                    <Gift className="w-3.5 h-3.5 text-pink-400" />
                    Hype incoming TikTok gifts
                  </span>
                  <Switch
                    checked={config.hypeGifts}
                    onCheckedChange={(checked) => updateConfig({ hypeGifts: checked })}
                    className="scale-90 data-[state=checked]:bg-pink-500"
                  />
                </div>

                <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-black/30 border border-white/10">
                  <span className="text-xs text-gray-200 flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                    Shoutout new followers &amp; shares
                  </span>
                  <Switch
                    checked={config.hypeFollows}
                    onCheckedChange={(checked) => updateConfig({ hypeFollows: checked })}
                    className="scale-90 data-[state=checked]:bg-purple-500"
                  />
                </div>

                <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-black/30 border border-white/10">
                  <span className="text-xs text-gray-200 flex items-center gap-2">
                    <Music2 className="w-3.5 h-3.5 text-emerald-400" />
                    Announce song requests &amp; VIP AI songs
                  </span>
                  <Switch
                    checked={config.announceRequests}
                    onCheckedChange={(checked) => updateConfig({ announceRequests: checked })}
                    className="scale-90 data-[state=checked]:bg-emerald-500"
                  />
                </div>

                <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-black/30 border border-white/10">
                  <span className="text-xs text-gray-200 flex items-center gap-2">
                    <Music2 className="w-3.5 h-3.5 text-amber-400" />
                    Announce new songs playing on deck
                  </span>
                  <Switch
                    checked={config.announceTracks}
                    onCheckedChange={(checked) => updateConfig({ announceTracks: checked })}
                    className="scale-90 data-[state=checked]:bg-amber-500"
                  />
                </div>
              </div>

              {/* Volume, Auto-Duck & Cooldown Sliders */}
              <div className="pt-1 space-y-2.5 border-t border-white/10">
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-gray-300">MC Mic Volume</span>
                    <span className="text-white font-montserrat-bold tabular-nums">{config.mcVolume}%</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="100"
                    value={config.mcVolume}
                    onChange={(e) => updateConfig({ mcVolume: Number(e.target.value) })}
                    className="w-full h-1.5 bg-gray-700 rounded-lg cursor-pointer"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-gray-300">
                      Auto-Duck Music While MC Speaks ({config.duckMusicTo}%)
                    </span>
                    <Switch
                      checked={config.autoDuckMusic}
                      onCheckedChange={(checked) => updateConfig({ autoDuckMusic: checked })}
                      className="scale-75 data-[state=checked]:bg-emerald-500"
                    />
                  </div>
                  {config.autoDuckMusic && (
                    <input
                      type="range"
                      min="10"
                      max="75"
                      value={config.duckMusicTo}
                      onChange={(e) => updateConfig({ duckMusicTo: Number(e.target.value) })}
                      className="w-full h-1.5 bg-gray-700 rounded-lg cursor-pointer"
                    />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-gray-300">Comment Cooldown</span>
                      <span className="text-white font-montserrat-bold tabular-nums">{config.questionCooldownSec}s</span>
                    </div>
                    <input
                      type="range"
                      min="2"
                      max="45"
                      value={config.questionCooldownSec}
                      onChange={(e) => updateConfig({ questionCooldownSec: Number(e.target.value) })}
                      className="w-full h-1.5 bg-gray-700 rounded-lg cursor-pointer"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-gray-300">Join Cooldown</span>
                      <span className="text-white font-montserrat-bold tabular-nums">{config.joinCooldownSec}s</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="60"
                      value={config.joinCooldownSec}
                      onChange={(e) => updateConfig({ joinCooldownSec: Number(e.target.value) })}
                      className="w-full h-1.5 bg-gray-700 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>
                {/* Credit Guard: Hourly Shoutout Cap */}
                <div className="pt-1 border-t border-white/10 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-emerald-300 font-semibold">
                      Credit Guard (Max Shoutouts / Hour)
                    </span>
                    <span className="text-gray-300 tabular-nums">
                      {aiMC.shoutoutsThisHour} / {config.maxShoutoutsPerHour === 0 ? '∞' : config.maxShoutoutsPerHour}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {[
                      { val: 30, label: '30/hr' },
                      { val: 60, label: '60/hr' },
                      { val: 120, label: '120/hr' },
                      { val: 0, label: 'Unlimited' },
                    ].map((opt) => (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() => updateConfig({ maxShoutoutsPerHour: opt.val })}
                        className={`py-1 rounded text-[10px] font-semibold border transition-colors ${
                          config.maxShoutoutsPerHour === opt.val
                            ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200'
                            : 'bg-black/30 border-white/10 text-gray-400 hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-400">
                    Auto-resets session every 10 turns &amp; sleeps after 2 min idle to keep Gemini costs minimal.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Live MC Transcript Feed */}
          <div className="rounded-xl bg-black/30 border border-white/10 p-3.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-montserrat-bold text-gray-200">
                Recent MC Shoutouts ({aiMC.history.length})
              </span>
              {aiMC.history.length > 0 && (
                <button
                  type="button"
                  onClick={aiMC.clearHistory}
                  className="text-[11px] text-gray-400 hover:text-red-300 flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear
                </button>
              )}
            </div>

            {aiMC.history.length === 0 ? (
              <p className="text-xs text-gray-500 py-3 text-center">
                No shoutouts yet. Click &ldquo;Test Welcome&rdquo; or &ldquo;Test Q&amp;A&rdquo; above to hear your Zim AI MC!
              </p>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                {aiMC.history.map((item) => {
                  const badge = EVENT_BADGE[item.eventType] || EVENT_BADGE.hype;
                  return (
                    <div
                      key={item.id}
                      className="px-2.5 py-2 rounded-lg bg-white/5 border border-white/10 text-xs space-y-0.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${badge.color}`}
                          >
                            {badge.label}
                          </span>
                          {item.triggerDetail && (
                            <span className="text-[10px] text-gray-400 truncate">
                              {item.triggerDetail}
                            </span>
                          )}
                        </div>
                        <span className="text-[9px] text-gray-500 flex-shrink-0">
                          {item.transport === 'live'
                            ? `⚡ Live${item.latencyMs ? ` ${(item.latencyMs / 1000).toFixed(1)}s` : ''}`
                            : item.usedGeminiVoice
                              ? 'Gemini'
                              : 'System'}{' '}
                          •{' '}
                          {new Date(item.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-gray-100 leading-snug">&ldquo;{item.spokenText}&rdquo;</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIMCModal;
