import React, { useState } from 'react';
import {
  X,
  Radio,
  Gift,
  MessageSquare,
  Eye,
  Heart,
  Gem,
  AlertCircle,
  Loader2,
  Trash2,
  ChevronDown,
  ChevronUp,
  LogOut,
  Minimize2,
  Maximize2,
  Music,
  Coins,
  Play,
  // Send,
  // FlaskConical,
  CheckCircle2,
  Globe,
  ExternalLink,
  Volume2,
  Ban,
  Check,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import type { Song } from '@/Types';
import type { TikTokGiftSfxType, useTikTokLive } from '@/hooks/useTikTokLive';

const GIFT_SFX_OPTIONS: Array<{ value: TikTokGiftSfxType; label: string }> = [
  { value: 'laser', label: 'Laser' },
  { value: 'horn', label: 'Air Horn' },
  { value: 'siren', label: 'Siren' },
  { value: 'zap', label: 'Explosion' },
  { value: 'whoosh', label: 'Reverse FX' },
  { value: 'scratch', label: 'Scratch' },
];

type TikTokLiveController = ReturnType<typeof useTikTokLive>;

interface TikTokLiveModalProps {
  isOpen: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onClose: () => void;
  live: TikTokLiveController;
  onPlaySongNow: (song: Song) => 'A' | 'B';
  onLoadToDeckA: (song: Song) => void;
  onLoadToDeckB: (song: Song) => void;
}

// const MOCK_PRESET_USERS = ['userA', 'userB', 'userC'];

const TikTokLiveModal: React.FC<TikTokLiveModalProps> = ({
  isOpen,
  isCollapsed,
  onToggleCollapse,
  onClose,
  live,
  onPlaySongNow,
  onLoadToDeckA,
  onLoadToDeckB,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [rightTab, setRightTab] = useState<'gifts' | 'chats' | 'activity'>('chats');
  // DEMO / MOCK LIVE state (uncomment for offline testing)
  // const [mockViewer, setMockViewer] = useState('userA');
  // const [mockComment, setMockComment] = useState('');

  if (!isOpen) return null;

  const handleConnectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void live.connect();
  };

  const handleLoadRequest = (deck: 'A' | 'B', song: Song) => {
    if (deck === 'A') {
      onLoadToDeckA(song);
    } else {
      onLoadToDeckB(song);
    }
    live.markSongRequestLoaded(song.id, deck);
  };

  const handlePlayNow = (song: Song) => {
    const deck = onPlaySongNow(song);
    live.consumeSongRequest(song.id, deck);
  };

  // DEMO / MOCK LIVE handler (uncomment for offline testing)
  // const handleMockChatSubmit = (e: React.FormEvent) => {
  //   e.preventDefault();
  //   if (!mockComment.trim()) return;
  //   live.simulateChat({
  //     uniqueId: mockViewer,
  //     nickname: mockViewer,
  //     comment: mockComment,
  //   });
  //   setMockComment('');
  // };

  const activeQueueCount = live.activeSongRequests.length;
  const playedCount = live.songRequests.filter((r) => r.status === 'played').length;
  const playingRequest = live.songRequests.find((r) => r.status === 'playing');

  // Collapsed floating dock bar (non-blocking so DJ can freely use decks underneath)
  if (isCollapsed) {
    const latestGift = live.gifts[0];
    const latestChat = live.chatMessages[0];
    const featuredRequest = playingRequest || live.activeSongRequests[0];

    return (
      <div className="fixed bottom-4 right-4 z-50 max-w-md select-none font-montserrat-light">
        <div className="rounded-2xl border border-purple-500/40 bg-[#121329]/95 backdrop-blur-xl shadow-2xl overflow-hidden">
          <div className="flex items-center gap-3 px-3.5 py-2.5">
            <button
              type="button"
              onClick={onToggleCollapse}
              className="flex items-center gap-2.5 min-w-0 flex-1 text-left group"
              title="Expand TikTok LIVE modal"
            >
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#fe2c55] via-purple-600 to-[#25f4ee] flex items-center justify-center flex-shrink-0">
                <Radio className={`w-3.5 h-3.5 text-white ${live.isConnected ? 'animate-pulse' : ''}`} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-montserrat-bold text-white truncate max-w-[140px]">
                    {live.isMockMode
                      ? 'Mock LIVE (Test)'
                      : live.isConnected
                        ? `@${live.status.uniqueId}`
                        : 'TikTok LIVE'}
                  </span>
                  {live.isConnected && (
                    <span
                      className={`w-2 h-2 rounded-full animate-pulse flex-shrink-0 ${live.isMockMode ? 'bg-amber-400' : 'bg-[#25f4ee]'
                        }`}
                    />
                  )}
                </div>
                {live.isConnected ? (
                  <div className="flex items-center gap-2.5 text-[11px] text-gray-300 mt-0.5">
                    <span className="flex items-center gap-1 text-cyan-300" title="Viewers">
                      <Eye className="w-3 h-3" />
                      {live.viewerCount.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1 text-purple-300" title="Active Song Requests">
                      <Music className="w-3 h-3" />
                      {activeQueueCount}
                    </span>
                    <span className="flex items-center gap-1 text-yellow-300" title="Coins">
                      <Gem className="w-3 h-3" />
                      {live.totalDiamonds.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1 text-pink-300" title="Gifts">
                      <Gift className="w-3 h-3" />
                      {live.giftCount.toLocaleString()}
                    </span>
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-400">Disconnected — click to expand</p>
                )}
              </div>
            </button>

            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={onToggleCollapse}
                title="Expand"
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-purple-500/40 text-gray-200 hover:text-white flex items-center justify-center transition-colors"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onClose}
                title="Hide"
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-red-500/40 text-gray-300 hover:text-white flex items-center justify-center transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Playing/Next TikTok Song Request or Latest Gift/Chat ticker while collapsed */}
          {live.isConnected && (featuredRequest || latestGift || latestChat) && (
            <div
              onClick={onToggleCollapse}
              className="px-3.5 py-1.5 border-t border-white/10 bg-black/35 text-[11px] truncate cursor-pointer hover:bg-black/50 transition-colors"
            >
              {featuredRequest ? (
                <span className="text-purple-200">
                  <strong
                    className={
                      featuredRequest.status === 'playing' ? 'text-green-400' : 'text-yellow-300'
                    }
                  >
                    {featuredRequest.status === 'playing'
                      ? `▶ Playing${featuredRequest.assignedDeck ? ` (${featuredRequest.assignedDeck})` : ''}`
                      : `#1 (${featuredRequest.coins > 0 ? `${featuredRequest.coins} coins` : 'Free'})`}
                  </strong>{' '}
                  {featuredRequest.song.artist} - {featuredRequest.song.title}{' '}
                  <span className="text-gray-400">by @{featuredRequest.requestedBy.uniqueId}</span>
                </span>
              ) : latestGift && (!latestChat || latestGift.timestamp >= latestChat.timestamp) ? (
                <span className="text-pink-200">
                  <strong className="text-pink-300">{latestGift.nickname}</strong> sent{' '}
                  <strong>{latestGift.giftName}</strong> ×{latestGift.repeatCount}{' '}
                  <span className="text-yellow-300">({latestGift.totalDiamonds} coins)</span>
                </span>
              ) : latestChat ? (
                <span className="text-gray-200">
                  <strong className="text-cyan-300">{latestChat.nickname}:</strong> {latestChat.comment}
                </span>
              ) : null}
            </div>
          )}
        </div>
      </div>
    );
  }

  let activeRank = 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-text font-montserrat-light">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        className={`relative z-10 w-full rounded-2xl border border-purple-500/30 bg-gradient-to-br from-[#121329] via-[#1a1638] to-[#0f1024] shadow-2xl overflow-hidden flex flex-col max-h-[92vh] transition-all font-montserrat-light ${live.isConnected ? 'max-w-4xl' : 'max-w-md'
          }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-black/25">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#fe2c55] via-purple-600 to-[#25f4ee] flex items-center justify-center flex-shrink-0">
              <Radio className={`w-5 h-5 text-white ${live.isConnected ? 'animate-pulse' : ''}`} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-white font-montserrat-bold text-base truncate">
                  {live.isConnected
                    ? `@${live.status.uniqueId} — TikTok LIVE`
                    : 'Connect to TikTok LIVE'}
                </h2>
                {live.isConnected && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white bg-[#fe2c55]">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    CONNECTED
                  </span>
                )}
              </div>
              <p className="text-gray-400 text-xs">
                {live.isConnected
                  ? 'Gift-backed song requests, live gifts, and chat from your TikTok stream'
                  : 'Go live in TikTok LIVE Studio, then connect your @username here'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {live.isConnected && (
              <>
                <button
                  type="button"
                  onClick={live.clearFeed}
                  title="Clear gifts, chats & queue"
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={live.disconnect}
                  className="border-red-500/60 text-red-400 hover:bg-red-500 hover:text-white text-xs"
                >
                  <LogOut className="w-3.5 h-3.5 mr-1" />
                  {live.isMockMode ? 'End Mock' : 'Disconnect'}
                </Button>
              </>
            )}
            <button
              type="button"
              onClick={onToggleCollapse}
              title="Collapse to floating bar"
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-purple-500/40 text-gray-300 hover:text-white flex items-center justify-center transition-colors"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              title={live.isConnected ? 'Close modal (stays connected)' : 'Close'}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* DISCONNECTED VIEW: Connect Form + Offline Mock Live Test Button */}
        {!live.isConnected ? (
          <form onSubmit={handleConnectSubmit} className="p-5 space-y-4">
            {!live.isElectron && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/25 text-cyan-200 text-xs">
                <Globe className="w-4 h-4 flex-shrink-0 mt-0.5 text-cyan-300" />
                <span>
                  Web Relay Mode — streams TikTok LIVE via PlayMyJam Cloud Server. For direct local connection, you can also use the Desktop app.
                </span>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1.5">
                TikTok Username
              </label>
              <input
                type="text"
                autoComplete="off"
                name="tiktok-username"
                value={live.config.username}
                onChange={(e) => live.updateConfig({ username: e.target.value })}
                placeholder="@yourtiktokhandle"
                disabled={live.isConnecting}
                className="w-full px-3.5 py-2.5 rounded-lg bg-black/40 border border-white/15 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-purple-400 disabled:opacity-50"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1.5">
                Minimum Coins to Request a Song (0 = Free for everyone)
              </label>
              <input
                type="number"
                min={0}
                step={1}
                value={live.config.minRequestCoins}
                onChange={(e) => {
                  const val = Math.max(0, Math.floor(Number(e.target.value) || 0));
                  live.updateConfig({ minRequestCoins: val });
                }}
                disabled={live.isConnecting}
                className="w-full px-3.5 py-2 rounded-lg bg-black/40 border border-white/15 text-white text-sm focus:outline-none focus:border-purple-400 disabled:opacity-50"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                {live.config.minRequestCoins === 0 ? (
                  <>
                    Anyone can type{' '}
                    <span className="text-cyan-300 font-montserrat-bold">/play Akon beautiful</span>{' '}
                    for free — gifters automatically jump ahead in the queue.
                  </>
                ) : (
                  <>
                    Viewers send a gift worth at least {live.config.minRequestCoins} coins, then comment{' '}
                    <span className="text-cyan-300 font-montserrat-bold">/play song name</span>.
                  </>
                )}
              </p>
            </div>

            <div className="flex items-center justify-between text-[11px] px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-300">
              <span>PlayMyJam Server Library</span>
              <span
                className={`font-bold ${live.librarySongCount > 0 ? 'text-green-400' : 'text-amber-300'
                  }`}
              >
                {live.librarySongCount > 0
                  ? `${live.librarySongCount.toLocaleString()} songs ready`
                  : '0 songs loaded (log in first)'}
              </span>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200"
              >
                {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                Optional: EulerStream API Key
              </button>
              {showAdvanced && (
                <input
                  type="password"
                  autoComplete="new-password"
                  name="tiktok-euler-key"
                  value={live.config.signApiKey}
                  onChange={(e) => live.updateConfig({ signApiKey: e.target.value })}
                  placeholder="euler_xxxxxxxx (optional)"
                  disabled={live.isConnecting}
                  className="mt-2 w-full px-3 py-2 rounded-lg bg-black/40 border border-white/15 text-white text-xs placeholder-gray-500 focus:outline-none focus:border-purple-400"
                />
              )}
            </div>

            {live.status.error && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/15 border border-red-500/40 text-red-300 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{live.status.error}</span>
              </div>
            )}

            <div className="space-y-2.5 pt-1">
              <Button
                type="submit"
                disabled={live.isConnecting || !live.config.username.trim()}
                className="w-full py-5 text-sm font-bold bg-gradient-to-r from-[#fe2c55] via-pink-600 to-purple-600 hover:opacity-95 text-white"
              >
                {live.isConnecting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Connecting to TikTok...
                  </>
                ) : (
                  <>
                    <Radio className="w-4 h-4 mr-2" />
                    Connect to TikTok
                  </>
                )}
              </Button>

              {/* DEMO / MOCK LIVE BUTTON (commented out for production)
              <Button
                type="button"
                variant="outline"
                disabled={live.isConnecting}
                onClick={() => void live.startMockLive()}
                className="w-full py-4 text-xs font-bold border-amber-400/50 bg-amber-500/10 text-amber-200 hover:bg-amber-500/25 hover:text-white"
              >
                <FlaskConical className="w-4 h-4 mr-2 text-amber-300" />
                Start Mock Live (Test Offline Without Going Live)
              </Button>
              */}
            </div>
          </form>
        ) : (
          /* CONNECTED VIEW: Stats + Settings + Queue & Feeds */
          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col p-5 gap-3">
            {/* DEMO / MOCK LIVE SIMULATOR BAR (commented out for production)
            {live.isMockMode && (
              <div className="rounded-xl bg-amber-500/10 border border-amber-400/35 p-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wide flex items-center gap-1">
                      <FlaskConical className="w-3.5 h-3.5" />
                      Test Viewer:
                    </span>
                    {MOCK_PRESET_USERS.map((handle) => (
                      <button
                        key={handle}
                        type="button"
                        onClick={() => setMockViewer(handle)}
                        className={`px-2 py-0.5 rounded-full text-[11px] font-semibold transition-colors ${mockViewer === handle
                            ? 'bg-amber-400 text-black'
                            : 'bg-white/10 text-gray-300 hover:bg-white/20'
                          }`}
                      >
                        @{handle}
                      </button>
                    ))}
                    <input
                      type="text"
                      value={mockViewer}
                      onChange={(e) => setMockViewer(e.target.value.replace(/^@+/, ''))}
                      placeholder="username"
                      className="w-24 px-2 py-0.5 rounded bg-black/45 border border-white/15 text-white text-[11px] focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-gray-300">Send Gift:</span>
                    {[1, 5, 20, 100].map((coins) => (
                      <button
                        key={coins}
                        type="button"
                        onClick={() =>
                          live.simulateGift({
                            uniqueId: mockViewer,
                            diamondCount: coins,
                          })
                        }
                        className="px-2 py-0.5 rounded bg-[#fe2c55]/25 hover:bg-[#fe2c55]/50 border border-[#fe2c55]/45 text-pink-200 text-[11px] font-bold transition-colors"
                        title={`Simulate @${mockViewer} sending ${coins} coins`}
                      >
                        +{coins} 💎
                      </button>
                    ))}
                  </div>
                </div>

                <form onSubmit={handleMockChatSubmit} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={mockComment}
                    onChange={(e) => setMockComment(e.target.value)}
                    placeholder='Type e.g. "/play Akon beautiful" or "/play Vybz Kartel Summer time"'
                    autoFocus
                    className="flex-1 px-3 py-2 rounded-lg bg-black/50 border border-amber-400/35 text-white text-xs placeholder-gray-400 focus:outline-none focus:border-amber-300"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!mockComment.trim()}
                    className="bg-amber-500 hover:bg-amber-400 text-black font-montserrat-bold text-xs px-3.5"
                  >
                    <Send className="w-3.5 h-3.5 mr-1.5" />
                    Send Chat
                  </Button>
                </form>
              </div>
            )}
            */}

            {/* Live Stats Strip */}
            <div className="grid grid-cols-4 gap-2.5">
              <div className="rounded-xl bg-white/5 border border-white/10 p-2 text-center">
                <div className="flex items-center justify-center gap-1 text-cyan-300 text-[10px] uppercase font-semibold">
                  <Eye className="w-3 h-3" /> Viewers
                </div>
                <p className="text-white font-bold text-sm mt-0.5">
                  {live.viewerCount.toLocaleString()}
                </p>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-2 text-center">
                <div className="flex items-center justify-center gap-1 text-pink-400 text-[10px] uppercase font-semibold">
                  <Heart className="w-3 h-3" /> Likes
                </div>
                <p className="text-white font-bold text-sm mt-0.5">
                  {live.totalLikes.toLocaleString()}
                </p>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-2 text-center">
                <div className="flex items-center justify-center gap-1 text-yellow-300 text-[10px] uppercase font-semibold">
                  <Gem className="w-3 h-3" /> Coins
                </div>
                <p className="text-white font-bold text-sm mt-0.5">
                  {live.totalDiamonds.toLocaleString()}
                </p>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-2 text-center">
                <div className="flex items-center justify-center gap-1 text-purple-300 text-[10px] uppercase font-semibold">
                  <Music className="w-3 h-3" /> Queue
                </div>
                <p className="text-white font-bold text-sm mt-0.5">
                  {activeQueueCount}
                </p>
              </div>
            </div>

            {/* Song Request Settings Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2 rounded-xl bg-purple-950/35 border border-purple-500/25 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-white font-semibold cursor-pointer">
                  <Switch
                    checked={live.config.requestsEnabled}
                    onCheckedChange={(v) => live.updateConfig({ requestsEnabled: v })}
                  />
                  <span>Requests</span>
                </label>

                <div className="h-4 w-px bg-white/15" />

                <label
                  className="flex items-center gap-2 text-white font-semibold cursor-pointer"
                  title="Automatically start playing requested songs when decks are idle or finish a track"
                >
                  <Switch
                    checked={live.config.autoPlayRequests}
                    onCheckedChange={(v) => live.updateConfig({ autoPlayRequests: v })}
                  />
                  <span>Auto-Play</span>
                </label>

                <div className="h-4 w-px bg-white/15" />

                <label
                  className="flex items-center gap-2 text-white font-semibold cursor-pointer"
                  title="When a requested song is not in PlayMyJam, search online via play-server, save it to Firebase, and queue/play it"
                >
                  <Switch
                    checked={live.config.externalSearchEnabled}
                    onCheckedChange={(v) => live.updateConfig({ externalSearchEnabled: v })}
                  />
                  <span className="flex items-center gap-1">
                    <Globe className="w-3.5 h-3.5 text-cyan-300" />
                    Web Fallback
                  </span>
                </label>

                <div className="h-4 w-px bg-white/15" />

                <label
                  className="flex items-center gap-2 text-white font-semibold cursor-pointer"
                  title="Require DJ approval before any requested track can queue or play"
                >
                  <Switch
                    checked={live.config.requireApproval}
                    onCheckedChange={(v) => live.updateConfig({ requireApproval: v })}
                  />
                  <span className="flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-300" />
                    Approve First
                  </span>
                </label>

                <div className="h-4 w-px bg-white/15" />

                <label
                  className="flex items-center gap-2 text-white font-semibold cursor-pointer"
                  title="Play DJ sound effects automatically when viewers send TikTok gifts (2.5s cooldown)"
                >
                  <Switch
                    checked={live.config.giftSfxEnabled}
                    onCheckedChange={(v) => live.updateConfig({ giftSfxEnabled: v })}
                  />
                  <span className="flex items-center gap-1">
                    <Volume2 className="w-3.5 h-3.5 text-pink-300" />
                    Gift SFX
                  </span>
                </label>

                <div className="h-4 w-px bg-white/15" />

                <label className="flex items-center gap-1.5 text-gray-300">
                  <Coins className="w-3.5 h-3.5 text-yellow-400" />
                  <span>Min Coins:</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={live.config.minRequestCoins}
                    onChange={(e) => {
                      const val = Math.max(0, Math.floor(Number(e.target.value) || 0));
                      live.updateConfig({ minRequestCoins: val });
                    }}
                    className="w-16 px-2 py-1 rounded bg-black/50 border border-white/15 text-white text-xs font-montserrat-bold text-center focus:outline-none focus:border-purple-400"
                  />
                </label>
              </div>

              {live.config.giftSfxEnabled && (
                <div className="w-full flex flex-wrap items-center gap-3 pt-2 border-t border-white/10 text-[11px] text-gray-300">
                  <label className="flex items-center gap-1.5">
                    <span>Gift FX:</span>
                    <select
                      value={live.config.smallGiftSfx}
                      onChange={(e) =>
                        live.updateConfig({ smallGiftSfx: e.target.value as TikTokGiftSfxType })
                      }
                      className="px-2 py-0.5 rounded bg-black/55 border border-white/15 text-white text-[11px] focus:outline-none focus:border-purple-400"
                    >
                      {GIFT_SFX_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value} className="bg-[#121329]">
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex items-center gap-1.5">
                    <span>Big Gift (≥</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={live.config.bigGiftThreshold}
                      onChange={(e) => {
                        const val = Math.max(1, Math.floor(Number(e.target.value) || 1));
                        live.updateConfig({ bigGiftThreshold: val });
                      }}
                      className="w-14 px-1.5 py-0.5 rounded bg-black/55 border border-white/15 text-white text-[11px] font-montserrat-bold text-center focus:outline-none focus:border-purple-400"
                    />
                    <span>coins):</span>
                    <select
                      value={live.config.bigGiftSfx}
                      onChange={(e) =>
                        live.updateConfig({ bigGiftSfx: e.target.value as TikTokGiftSfxType })
                      }
                      className="px-2 py-0.5 rounded bg-black/55 border border-white/15 text-white text-[11px] focus:outline-none focus:border-purple-400"
                    >
                      {GIFT_SFX_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value} className="bg-[#121329]">
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              <div className="flex items-center gap-2 text-[11px]">
                <span
                  className={`px-2 py-0.5 rounded-full border ${live.librarySongCount > 0
                      ? 'bg-green-500/10 border-green-500/30 text-green-300'
                      : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                    }`}
                >
                  Library: {live.librarySongCount} songs
                </span>
                <span className="text-gray-400 hidden sm:inline">
                  {live.config.minRequestCoins === 0 ? (
                    <span className="text-green-300 font-semibold">Free mode</span>
                  ) : (
                    <>Min {live.config.minRequestCoins} coins</>
                  )}
                </span>
              </div>
            </div>

            {/* Active External Search Spinner */}
            {live.searchingQueries.length > 0 && (
              <div className="px-3.5 py-2 rounded-xl text-xs border bg-cyan-500/15 border-cyan-400/40 text-cyan-200 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0 text-cyan-300" />
                <span className="truncate">
                  Searching online &amp; saving to Firebase:{' '}
                  <strong>{live.searchingQueries.map((q) => `"${q}"`).join(', ')}</strong>
                </span>
              </div>
            )}

            {/* Live Request Feedback Banner */}
            {live.lastRequestNotice && (
              <div
                className={`px-3.5 py-2 rounded-xl text-xs border flex items-center gap-2 ${live.lastRequestNotice.tone === 'success'
                    ? 'bg-green-500/15 border-green-500/35 text-green-200'
                    : live.lastRequestNotice.tone === 'warning'
                      ? 'bg-amber-500/15 border-amber-500/35 text-amber-200'
                      : 'bg-cyan-500/15 border-cyan-500/35 text-cyan-200'
                  }`}
              >
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{live.lastRequestNotice.message}</span>
              </div>
            )}

            {/* Main 2-Column Body: Left = Priority Song Queue, Right = Gifts / Chats / Activity */}
            <div className="flex-1 min-h-[280px] max-h-[46vh] grid grid-cols-1 md:grid-cols-2 gap-4 overflow-hidden">
              {/* Left Column: TikTok Song Request Priority Queue */}
              <div className="flex flex-col rounded-xl bg-black/35 border border-purple-500/25 overflow-hidden">
                <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-white/10 bg-purple-900/20">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-purple-200">
                    <Music className="w-4 h-4 text-purple-400" />
                    Song Request Queue ({activeQueueCount})
                    {live.pendingApprovalCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-amber-500/25 border border-amber-400/50 text-amber-200 text-[10px] font-montserrat-bold">
                        {live.pendingApprovalCount} pending
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    {playedCount > 0 && (
                      <button
                        type="button"
                        onClick={live.clearPlayedRequests}
                        className="text-[10px] text-gray-400 hover:text-white underline"
                      >
                        Clear played ({playedCount})
                      </button>
                    )}
                    <span className="text-[10px] text-gray-400">Highest coins first</span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                  {live.songRequests.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 text-xs py-8 gap-2 px-4">
                      <Music className="w-7 h-7 text-gray-600" />
                      <p className="text-gray-400 font-medium">No song requests yet</p>
                      <p className="text-[11px] text-gray-500">
                        {live.config.minRequestCoins === 0 ? (
                          <>
                            Type{' '}
                            <span className="text-cyan-300 font-montserrat-bold">/play Akon beautiful</span>{' '}
                            or{' '}
                            <span className="text-cyan-300 font-montserrat-bold">/play kygo</span> — matched
                            tracks queue &amp; play here automatically.
                          </>
                        ) : (
                          <>
                            Send ≥ {live.config.minRequestCoins} coins then type{' '}
                            <span className="text-cyan-300 font-montserrat-bold">/play &lt;song name&gt;</span>{' '}
                            — matched tracks queue here automatically.
                          </>
                        )}
                      </p>
                    </div>
                  ) : (
                    live.songRequests.map((req) => {
                      const isPlaying = req.status === 'playing';
                      const isPending = req.status === 'pending';
                      const isLoaded = req.status === 'loaded';
                      const isPlayed = req.status === 'played';
                      const rank = !isPlaying && !isPending && !isPlayed ? ++activeRank : null;

                      return (
                        <div
                          key={req.id}
                          className={`flex items-center gap-2.5 p-2.5 rounded-lg border transition-colors ${isPlaying
                              ? 'bg-gradient-to-r from-green-600/25 via-emerald-600/15 to-transparent border-green-400/50'
                              : isPending
                                ? 'bg-gradient-to-r from-amber-600/20 via-orange-600/10 to-transparent border-amber-400/50'
                                : isLoaded
                                  ? 'bg-gradient-to-r from-cyan-600/20 via-purple-600/15 to-transparent border-cyan-400/45'
                                  : isPlayed
                                    ? 'bg-white/5 border-white/10 opacity-60'
                                    : 'bg-gradient-to-r from-purple-600/20 via-fuchsia-600/10 to-transparent border-purple-500/35'
                            }`}
                        >
                          <div
                            className={`w-6 h-6 rounded-full text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 ${isPlaying
                                ? 'bg-green-500 animate-pulse'
                                : isPending
                                  ? 'bg-amber-500 text-black'
                                  : isPlayed
                                    ? 'bg-gray-700 text-green-400'
                                    : 'bg-purple-600/80'
                              }`}
                          >
                            {isPlaying ? (
                              <Play className="w-3 h-3 fill-current" />
                            ) : isPending ? (
                              <ShieldCheck className="w-3.5 h-3.5" />
                            ) : isPlayed ? (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            ) : (
                              rank
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs font-bold text-white truncate">{req.song.title}</p>
                              {isPlaying && (
                                <span className="px-1.5 py-0.2 rounded bg-green-500/30 border border-green-400/50 text-green-300 text-[9px] font-bold uppercase flex-shrink-0">
                                  Playing{req.assignedDeck ? ` • ${req.assignedDeck}` : ''}
                                </span>
                              )}
                              {isPending && (
                                <span className="px-1.5 py-0.2 rounded bg-amber-500/25 border border-amber-400/50 text-amber-200 text-[9px] font-bold uppercase flex-shrink-0">
                                  Pending
                                </span>
                              )}
                              {isLoaded && (
                                <span className="px-1.5 py-0.2 rounded bg-cyan-500/25 border border-cyan-400/40 text-cyan-200 text-[9px] font-bold uppercase flex-shrink-0">
                                  Deck {req.assignedDeck || 'Next'}
                                </span>
                              )}
                              {isPlayed && (
                                <span className="px-1.5 py-0.2 rounded bg-white/10 text-gray-300 text-[9px] font-semibold uppercase flex-shrink-0">
                                  Played
                                </span>
                              )}
                              {req.source === 'external' && (
                                <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 text-[9px] font-semibold uppercase flex-shrink-0">
                                  Firebase
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-gray-300 truncate">{req.song.artist}</p>
                            <div className="flex items-center gap-2 mt-0.5 text-[10px]">
                              {req.coins > 0 ? (
                                <span className="text-yellow-300 font-bold">
                                  💎 {req.coins.toLocaleString()} coins
                                </span>
                              ) : (
                                <span className="text-green-300 font-bold">Free request</span>
                              )}
                              <span className="text-gray-400 truncate">
                                by @{req.requestedBy.uniqueId}
                                {req.requesters.length > 1 ? ` +${req.requesters.length - 1}` : ''}
                              </span>
                              {req.source === 'external' && (req.song.audioUrl || req.song.url) && (
                                <a
                                  href={req.song.audioUrl || req.song.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-0.5 text-cyan-300 hover:underline flex-shrink-0"
                                  title="Open saved Firebase audio URL"
                                >
                                  <ExternalLink className="w-2.5 h-2.5" />
                                  URL
                                </a>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 flex-shrink-0">
                            {isPending ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => live.approveSongRequest(req.id)}
                                  title="Approve request and add to queue"
                                  className="px-2 py-1 rounded text-[10px] font-montserrat-bold bg-green-600/90 hover:bg-green-500 text-white flex items-center gap-1 transition-colors"
                                >
                                  <Check className="w-3 h-3" />
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => live.rejectSongRequest(req.id)}
                                  title="Reject request (refunds coins if gifted)"
                                  className="px-2 py-1 rounded text-[10px] font-montserrat-bold bg-red-600/80 hover:bg-red-500 text-white flex items-center gap-1 transition-colors"
                                >
                                  <Ban className="w-3 h-3" />
                                  Reject
                                </button>
                              </>
                            ) : (
                              <>
                                {!isPlaying && (
                                  <button
                                    type="button"
                                    onClick={() => handlePlayNow(req.song)}
                                    title="Play immediately"
                                    className="px-2 py-1 rounded text-[11px] font-bold bg-green-600/85 hover:bg-green-500 text-white flex items-center gap-0.5 transition-colors"
                                  >
                                    <Play className="w-3 h-3 fill-current" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleLoadRequest('A', req.song)}
                                  title="Load to Deck A"
                                  className="px-2 py-1 rounded text-[11px] font-bold bg-purple-600/80 hover:bg-purple-500 text-white transition-colors"
                                >
                                  A
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleLoadRequest('B', req.song)}
                                  title="Load to Deck B"
                                  className="px-2 py-1 rounded text-[11px] font-bold bg-blue-600/80 hover:bg-blue-500 text-white transition-colors"
                                >
                                  B
                                </button>
                                {!isPlayed ? (
                                  <button
                                    type="button"
                                    onClick={() => live.rejectSongRequest(req.id)}
                                    title="Reject song (stops if playing and refunds coins)"
                                    className="px-2 py-1 rounded text-[10px] font-montserrat-bold bg-red-600/25 border border-red-500/50 text-red-300 hover:bg-red-600 hover:text-white flex items-center gap-1 transition-colors"
                                  >
                                    <Ban className="w-3 h-3" />
                                    Reject
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => live.removeSongRequest(req.id)}
                                    title="Dismiss played entry"
                                    className="p-1 rounded text-gray-400 hover:text-red-400 hover:bg-white/10 transition-colors"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Viewers Holding Unused Gift Coins Ready to Request */}
                {live.viewerCredits.length > 0 && (
                  <div className="px-3 py-2 border-t border-white/10 bg-white/5">
                    <p className="text-[10px] text-gray-400 uppercase font-semibold mb-1">
                      Gifters Ready to Request ({live.viewerCredits.length})
                    </p>
                    <div className="flex flex-wrap gap-1.5 max-h-14 overflow-y-auto">
                      {live.viewerCredits.slice(0, 8).map((vc) => (
                        <span
                          key={vc.userKey}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border ${vc.availableCoins >= live.config.minRequestCoins
                              ? 'bg-green-500/15 border-green-500/35 text-green-300'
                              : 'bg-white/5 border-white/10 text-gray-300'
                            }`}
                        >
                          <span className="truncate max-w-[90px]">@{vc.uniqueId}</span>
                          <strong className="text-yellow-300">{vc.availableCoins}</strong>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Live Gifts / Chats / Request Log */}
              <div className="flex flex-col rounded-xl bg-black/35 border border-white/10 overflow-hidden">
                <div className="flex items-center gap-1 px-2.5 py-2 border-b border-white/10 bg-white/5">
                  <button
                    type="button"
                    onClick={() => setRightTab('chats')}
                    className={`flex-1 py-1 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-colors ${rightTab === 'chats'
                        ? 'bg-cyan-600/85 text-white'
                        : 'text-gray-400 hover:text-white'
                      }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Chats ({live.chatMessages.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRightTab('gifts')}
                    className={`flex-1 py-1 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-colors ${rightTab === 'gifts'
                        ? 'bg-[#fe2c55]/85 text-white'
                        : 'text-gray-400 hover:text-white'
                      }`}
                  >
                    <Gift className="w-3.5 h-3.5" />
                    Gifts ({live.gifts.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRightTab('activity')}
                    className={`py-1 px-2.5 rounded-lg text-xs font-bold transition-colors ${rightTab === 'activity'
                        ? 'bg-purple-600/85 text-white'
                        : 'text-gray-400 hover:text-white'
                      }`}
                  >
                    Log ({live.requestLogs.length})
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                  {rightTab === 'gifts' &&
                    (live.gifts.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 text-xs py-10 gap-2">
                        <Gift className="w-7 h-7 text-gray-600" />
                        <p>
                          {live.isMockMode
                            ? 'Click a +coins gift button above to simulate a viewer gift.'
                            : 'Waiting for TikTok gifts...'}
                        </p>
                      </div>
                    ) : (
                      live.gifts.map((gift) => (
                        <div
                          key={gift.id}
                          className="flex items-center gap-2.5 p-2.5 rounded-lg bg-gradient-to-r from-[#fe2c55]/20 via-purple-600/15 to-transparent border border-[#fe2c55]/30"
                        >
                          <div className="w-9 h-9 rounded-lg bg-black/40 flex items-center justify-center flex-shrink-0 overflow-hidden">
                            {gift.giftPictureUrl ? (
                              <img
                                src={gift.giftPictureUrl}
                                alt={gift.giftName}
                                className="w-8 h-8 object-contain"
                              />
                            ) : (
                              <Gift className="w-4 h-4 text-yellow-300" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-white truncate">
                              <span className="font-bold text-pink-300">{gift.nickname}</span>{' '}
                              sent <span className="font-semibold">{gift.giftName}</span>
                            </p>
                            <p className="text-[11px] text-yellow-300/90">
                              {gift.totalDiamonds.toLocaleString()} coins
                            </p>
                          </div>
                          <span className="text-sm font-black text-yellow-200 px-1.5">
                            ×{gift.repeatCount}
                          </span>
                        </div>
                      ))
                    ))}

                  {rightTab === 'chats' &&
                    (live.chatMessages.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 text-xs py-10 gap-2">
                        <MessageSquare className="w-7 h-7 text-gray-600" />
                        <p>
                          {live.isMockMode
                            ? 'Type a comment above like "/play Akon beautiful" to test.'
                            : 'Waiting for live chat messages...'}
                        </p>
                      </div>
                    ) : (
                      live.chatMessages.map((msg) => (
                        <div
                          key={msg.id}
                          className="flex items-start gap-2 px-3 py-2 rounded-lg bg-white/5 text-xs"
                        >
                          <span className="font-bold text-cyan-300 whitespace-nowrap">
                            {msg.nickname}:
                          </span>
                          <span className="text-gray-200 break-words">{msg.comment}</span>
                        </div>
                      ))
                    ))}

                  {rightTab === 'activity' &&
                    (live.requestLogs.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 text-xs py-10 gap-2">
                        <Music className="w-7 h-7 text-gray-600" />
                        <p>No song request activity yet.</p>
                      </div>
                    ) : (
                      live.requestLogs.map((log) => (
                        <div
                          key={log.id}
                          className={`px-3 py-2 rounded-lg text-xs border ${log.type === 'queued' || log.type === 'boosted' || log.type === 'playing' || log.type === 'approved'
                              ? 'bg-green-500/10 border-green-500/30 text-green-200'
                              : log.type === 'rejected'
                                ? 'bg-red-500/10 border-red-500/35 text-red-200'
                                : log.type === 'pending'
                                  ? 'bg-amber-500/10 border-amber-500/35 text-amber-200'
                                  : log.type === 'already_playing' || log.type === 'searching'
                                    ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-200'
                                    : log.type === 'not_found' || log.type === 'external_error'
                                      ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-200'
                                      : 'bg-white/5 border-white/10 text-gray-300'
                            }`}
                        >
                          <span className="font-bold">@{log.uniqueId}</span>:{' '}
                          {log.type === 'pending' && (
                            <>
                              requested <strong>{log.songTitle}</strong> (waiting for approval)
                            </>
                          )}
                          {log.type === 'approved' && (
                            <>
                              approved <strong>{log.songTitle}</strong>
                            </>
                          )}
                          {log.type === 'rejected' && (
                            <>
                              rejected <strong>{log.songTitle}</strong>
                              {log.coins > 0 ? ` (${log.coins} coins refunded)` : ''}
                            </>
                          )}
                          {log.type === 'searching' && (
                            <>searching online for &ldquo;{log.query}&rdquo;...</>
                          )}
                          {log.type === 'external_error' && (
                            <>
                              could not fetch &ldquo;{log.query}&rdquo;: {log.error || 'search failed'}
                              {log.coins > 0 ? ` (${log.coins} coins kept)` : ''}
                            </>
                          )}
                          {log.type === 'playing' && (
                            <>
                              now playing <strong>{log.songTitle}</strong> (
                              {log.coins > 0 ? `${log.coins} coins` : 'Free'})
                            </>
                          )}
                          {log.type === 'queued' && (
                            <>
                              queued <strong>{log.songTitle}</strong> (
                              {log.coins > 0 ? `${log.coins} coins` : 'Free'})
                            </>
                          )}
                          {log.type === 'boosted' && (
                            <>
                              boosted <strong>{log.songTitle}</strong> (
                              {log.coins > 0 ? `+${log.coins} coins` : 'Free'})
                            </>
                          )}
                          {log.type === 'already_playing' && (
                            <>
                              <strong>{log.songTitle}</strong> is already playing
                            </>
                          )}
                          {log.type === 'not_found' && (
                            <>
                              no track matched &ldquo;{log.query}&rdquo;
                              {log.coins > 0 ? ` (${log.coins} coins kept)` : ''}
                            </>
                          )}
                          {log.type === 'insufficient_coins' && (
                            <>
                              asked for &ldquo;{log.query}&rdquo; (needs {log.minCoins} coins, has{' '}
                              {log.coins})
                            </>
                          )}
                        </div>
                      ))
                    ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TikTokLiveModal;
