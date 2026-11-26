import React, { useState, useMemo } from 'react';
import {
  Music,
  Search,
  User,
  X,
  Sparkles,
  Globe,
  Loader2,
  Download,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAudioLogic } from '@/hooks/useAudioLogic';
import { currencyFormatter } from '@/utils';
import { Song } from '@/Types';
import ConfirmationDialog from '@/components/ui/ConfirmationDialog';
import AIMusicTab from '@/components/virtualDJ/AIMusicTab';
import {
  fetchAndSaveExternalSong,
  searchExternalSongs,
  type ExternalSongSearchResult,
} from '@/lib/playServerApi';

interface MusicLibraryProps {
  songs: Song[];
  isLoadingSongs: boolean;
  loadTrackToDeckA: (song: Song) => void;
  loadTrackToDeckB: (song: Song) => void;
  tiktokRequestCoinsBySongId?: Record<string, number>;
  ownerId?: string;
  userFolder?: string;
}

const formatDuration = (seconds: number) => {
  if (!seconds || seconds <= 0) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const MusicLibrary: React.FC<MusicLibraryProps> = ({
  songs,
  isLoadingSongs,
  loadTrackToDeckA,
  loadTrackToDeckB,
  tiktokRequestCoinsBySongId,
  ownerId = '',
  userFolder = 'dj_guest',
}) => {
  // Initialize audio logic hook
  const {
    isSongPlaying,
    songHasBids,
    getSongBidAmount,
    cancelBid
  } = useAudioLogic(songs);

  // State for confirmation dialog
  const [confirmationDialog, setConfirmationDialog] = useState<{
    isOpen: boolean;
    song: Song | null;
    isLoading: boolean;
  }>({
    isOpen: false,
    song: null,
    isLoading: false
  });

  // Source toggle state — now includes 'ai'
  const [source, setSource] = useState<'server' | 'local' | 'ai'>('server');
  // Local songs state
  const [localSongs, setLocalSongs] = useState<Song[]>([]);

  // Search state for filtering tracks
  const [search, setSearch] = useState('');

  // External search fallback state (when song isn't in PlayMyJam server library)
  const [isSearchingExternal, setIsSearchingExternal] = useState(false);
  const [externalResults, setExternalResults] = useState<ExternalSongSearchResult[]>([]);
  const [externalSearchQuery, setExternalSearchQuery] = useState('');
  const [externalError, setExternalError] = useState<string | null>(null);
  const [fetchingVideoId, setFetchingVideoId] = useState<string | null>(null);
  const [savedExternalSongs, setSavedExternalSongs] = useState<Record<string, Song>>({});
  const [copiedUrlId, setCopiedUrlId] = useState<string | null>(null);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (!value.trim()) {
      setExternalResults([]);
      setExternalError(null);
      setExternalSearchQuery('');
    }
  };

  const handleExternalSearch = async () => {
    const q = search.trim();
    if (q.length < 2 || isSearchingExternal) return;

    setIsSearchingExternal(true);
    setExternalError(null);
    setExternalSearchQuery(q);

    try {
      const results = await searchExternalSongs(q, 5);
      setExternalResults(results);
      if (results.length === 0) {
        setExternalError(`No external tracks found for "${q}".`);
      }
    } catch (err) {
      setExternalResults([]);
      setExternalError(err instanceof Error ? err.message : 'External search failed.');
    } finally {
      setIsSearchingExternal(false);
    }
  };

  const handleFetchAndSaveExternal = async (item: ExternalSongSearchResult) => {
    if (fetchingVideoId) return;
    setFetchingVideoId(item.videoId);
    setExternalError(null);

    try {
      const { song } = await fetchAndSaveExternalSong({
        videoId: item.videoId,
        query: `${item.artist} ${item.title}`,
        ownerId,
        user: userFolder,
      });
      setSavedExternalSongs((prev) => ({
        ...prev,
        [item.videoId]: song,
      }));
    } catch (err) {
      setExternalError(err instanceof Error ? err.message : 'Failed to fetch and save song.');
    } finally {
      setFetchingVideoId(null);
    }
  };

  const handleCopyUrl = (videoId: string, url: string) => {
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopiedUrlId(videoId);
    setTimeout(() => {
      setCopiedUrlId((prev) => (prev === videoId ? null : prev));
    }, 1800);
  };

  // Handle local files selection
  const handleLocalFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    const newSongs: Song[] = files.map((file, i) => {
      const url = URL.createObjectURL(file);
      return {
        id: `local-${Date.now()}-${i}`,
        title: file.name.replace(/\.[^/.]+$/, ""),
        artist: 'Local Track',
        albumArt: '',
        url: url,
        audioUrl: url,
        duration: 0,
        action: 'stop',
        isPlaying: false,
        isSuggested: false,
        isLocal: true,
      };
    });
    setLocalSongs(prev => [...prev, ...newSongs]);
  };

  const handleScanMusic = async () => {
    if (window.electronAPI) {
      try {
        const paths = await window.electronAPI.scanMusic();
        const newSongs: Song[] = paths.map((p, i) => {
          const filename = p.split(/[/\\]/).pop() || 'Unknown Track';
          const title = filename.replace(/\.[^/.]+$/, "");
          const url = `local://${p}`;
          return {
            id: `local-sys-${Date.now()}-${i}`,
            title,
            artist: 'System Music',
            albumArt: '',
            url: url,
            audioUrl: url,
            duration: 0,
            action: 'stop',
            isPlaying: false,
            isSuggested: false,
            isLocal: true,
          };
        });
        setLocalSongs(prev => {
          const existingUrls = new Set(prev.map(s => s.url));
          const uniqueNew = newSongs.filter(s => !existingUrls.has(s.url));
          return [...prev, ...uniqueNew];
        });
      } catch (err) {
        console.error('Error scanning music', err);
      }
    } else {
      console.warn('electronAPI not found, are you running in Electron?');
    }
  };

  // Memoized filtered and sorted songs to prevent expensive operations on every render
  const sortedAndFilteredSongs = useMemo(() => {
    console.log('🔄 Recalculating sorted songs list...');

    const activeSongs = source === 'server' ? songs : localSongs;

    // Filter songs based on search
    const filteredSongs = activeSongs.filter(song =>
      song.title.toLowerCase().includes(search.toLowerCase()) ||
      song.artist.toLowerCase().includes(search.toLowerCase())
    );

    // Sort songs by PlayMyJam currentBid (highest first), then TikTok requests (highest coins first), then title
    return filteredSongs.sort((a, b) => {
      const bidA = a.currentBid || 0;
      const bidB = b.currentBid || 0;
      if (bidA !== bidB) {
        return bidB - bidA; // Higher PlayMyJam bids first
      }
      const ttA = source === 'server' ? (tiktokRequestCoinsBySongId?.[a.id] || 0) : 0;
      const ttB = source === 'server' ? (tiktokRequestCoinsBySongId?.[b.id] || 0) : 0;
      if (ttA !== ttB) {
        return ttB - ttA; // Higher TikTok song requests next
      }
      return a.title.localeCompare(b.title); // Then alphabetical
    });
  }, [songs, localSongs, search, source, tiktokRequestCoinsBySongId]); // Only recalculate when dependencies change

  // Handle cancel bid click
  const handleCancelBidClick = (song: Song) => {
    setConfirmationDialog({
      isOpen: true,
      song,
      isLoading: false
    });
  };

  // Handle confirmation dialog close
  const handleDialogClose = () => {
    if (!confirmationDialog.isLoading) {
      setConfirmationDialog({
        isOpen: false,
        song: null,
        isLoading: false
      });
    }
  };

  // Handle bid cancellation confirmation
  const handleConfirmCancelBid = async () => {
    if (!confirmationDialog.song) return;

    setConfirmationDialog(prev => ({ ...prev, isLoading: true }));

    try {
      const success = await cancelBid(confirmationDialog.song);

      if (success) {
        console.log('✅ Bid canceled successfully');
        // Close dialog after successful cancellation
        setConfirmationDialog({
          isOpen: false,
          song: null,
          isLoading: false
        });
      } else {
        console.error('❌ Failed to cancel bid');
        setConfirmationDialog(prev => ({ ...prev, isLoading: false }));
      }
    } catch (error) {
      console.error('❌ Error canceling bid:', error);
      setConfirmationDialog(prev => ({ ...prev, isLoading: false }));
    }
  };

  return (
    <div className="glass-card p-4 animate-fade-in-up font-montserrat-light" style={{animationDelay: '0.5s'}}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Music className="w-5 h-5 text-white" />
        <h3 className="text-lg font-montserrat-bold text-white">
          Music <span className="neon-text">Library</span>
        </h3>
      </div>

      {/* Toggle Source */}
      <div className="flex rounded-md overflow-hidden mb-4 border border-gray-700">
        <button 
          onClick={() => setSource('server')} 
          className={`flex-1 py-1.5 text-xs font-semibold transition-colors ${source === 'server' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
        >
          PlayMyJam
        </button>
        <button 
          onClick={() => setSource('local')} 
          className={`flex-1 py-1.5 text-xs font-semibold transition-colors ${source === 'local' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
        >
          Local
        </button>
        <button 
          onClick={() => setSource('ai')} 
          className={`flex-1 py-1.5 text-xs font-semibold transition-colors flex items-center justify-center gap-1 ${source === 'ai' ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
        >
          <Sparkles className="w-3 h-3" />
          AI
        </button>
      </div>

      {/* AI Tab */}
      {source === 'ai' && (
        <div className="flex-1 overflow-hidden">
          <AIMusicTab
            loadTrackToDeckA={loadTrackToDeckA}
            loadTrackToDeckB={loadTrackToDeckB}
          />
        </div>
      )}

      {/* Local Files Input & Scan */}
      {source === 'local' && (
        <div className="mb-4 space-y-2">
          {window.electronAPI && (
            <button 
              onClick={handleScanMusic}
              className="w-full text-center py-2 px-4 rounded-md bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold transition-colors shadow-lg"
            >
              Scan System Music Folder
            </button>
          )}
          <label className="block w-full text-center py-2 px-4 rounded-md border border-dashed border-gray-600 bg-gray-800 hover:bg-gray-700 cursor-pointer transition-colors">
            <span className="text-xs text-gray-300 font-semibold">Select Local Audio Files Manually</span>
            <input 
              type="file" 
              multiple 
              accept="audio/*" 
              onChange={handleLocalFiles} 
              className="hidden" 
            />
          </label>
        </div>
      )}

      {/* Search - only show for server/local tabs */}
      {source !== 'ai' && (
        <div className="pt-3 border-t border-gray-700 mb-4 space-y-2">
          <div className="relative flex items-center gap-1.5">
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && source === 'server' && search.trim().length >= 2) {
                  e.preventDefault();
                  void handleExternalSearch();
                }
              }}
              placeholder={
                source === 'server'
                  ? 'Search PlayMyJam or press Enter to search online...'
                  : 'Search tracks...'
              }
              className="w-full px-3 py-2 rounded bg-gray-800 text-white text-xs border border-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            {source === 'server' && search.trim().length >= 2 && (
              <button
                type="button"
                onClick={() => void handleExternalSearch()}
                disabled={isSearchingExternal}
                title="Search online & import to Firebase"
                className="px-2.5 py-2 rounded bg-cyan-600/80 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs flex items-center gap-1 flex-shrink-0 transition-colors"
              >
                {isSearchingExternal ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Globe className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Song List - Scrollable */}
      {source !== 'ai' && (
      <div className="overflow-hidden">
        <div className="space-y-2 h-full overflow-y-auto custom-scrollbar pr-2">
        {isLoadingSongs && source === 'server' ? (
          <div className="text-center py-8">
            <div className="w-6 h-6 border border-purple-400 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <p className="text-gray-400 text-sm">Loading music library...</p>
          </div>
        ) : sortedAndFilteredSongs.length === 0 ? (
          <div className="text-center py-6 space-y-3">
            <Music className="w-10 h-10 text-gray-600 mx-auto" />
            <p className="text-gray-400 text-xs">
              {search.trim()
                ? `No PlayMyJam track matched "${search.trim()}"`
                : 'No tracks available'}
            </p>
            {source === 'server' && search.trim().length >= 2 && (
              <Button
                type="button"
                size="sm"
                onClick={() => void handleExternalSearch()}
                disabled={isSearchingExternal}
                className="bg-gradient-to-r from-cyan-600 to-purple-600 hover:opacity-95 text-white text-xs"
              >
                {isSearchingExternal ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Searching Online...
                  </>
                ) : (
                  <>
                    <Search className="w-3.5 h-3.5 mr-1.5" />
                    Search &ldquo;{search.trim()}&rdquo; Online
                  </>
                )}
              </Button>
            )}
          </div>
        ) : (
          // Use memoized sorted and filtered songs
          sortedAndFilteredSongs.map((song) => {
            const isPlaying = isSongPlaying(song.id);
            const hasBids = songHasBids(song.id);
            const bidAmount = getSongBidAmount(song.id);
            const ttScore = source === 'server' ? (tiktokRequestCoinsBySongId?.[song.id] || 0) : 0;
            const ttCoins = ttScore > 0 ? Math.max(0, Math.floor(ttScore) - 1) : null;



            return (
              <div
                key={song.id}
                draggable={true}
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/json', JSON.stringify(song));
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                className={`rounded-lg p-1 hover:bg-gray-700/50 transition-colors group cursor-grab active:cursor-grabbing ${
                  isPlaying
                    ? 'bg-gray-800/50 border-2 border-red-500' // Tomato border for playing songs
                    : 'bg-gray-800/30 border-2 border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Album Art */}
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
                    {song.albumArt ? (
                      <img
                        src={song.albumArt}
                        alt="Album Art"
                        className="w-full h-full rounded-lg object-cover"
                      />
                    ) : (
                      <Music className="w-5 h-5 text-white" />
                    )}
                  </div>

                  {/* Song Info */}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-white font-semibold text-xs truncate">
                      {song.title}
                    </h4>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <User className="w-3 h-3" />
                      <span className="truncate">{song.artist}</span>
                    </div>

                    {/* Show bid amount only if there are bids */}
                    {hasBids && bidAmount ? (
                      <div className="flex items-center gap-1 text-xs text-green-400 mt-1">
                        <span className="font-semibold">{currencyFormatter(bidAmount)}</span>
                      </div>
                    ) : null}

                    {/* Read-only TikTok song request badge (never touches Firestore bids) */}
                    {ttCoins !== null && (
                      <div className="flex items-center gap-1 text-[10px] text-pink-300 mt-1">
                        <span className="px-1.5 py-0.5 rounded bg-pink-500/20 border border-pink-500/40 font-semibold">
                          TikTok Request • {ttCoins > 0 ? `${ttCoins} coins` : 'Free'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-1 items-center">
                    

                    {/* Load to deck buttons */}
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-purple-400 text-purple-400 hover:bg-purple-400 hover:text-white text-xs px-2 py-1 h-auto"
                        onClick={() => loadTrackToDeckA(song)}
                      >
                        A
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-blue-400 text-blue-400 hover:bg-blue-400 hover:text-white text-xs px-2 py-1 h-auto"
                        onClick={() => loadTrackToDeckB(song)}
                      >
                        B
                      </Button>
                    </div>

                    {/* Cancel button for songs with bids */}
                    {hasBids && bidAmount ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-400 text-red-400 hover:bg-red-400 hover:text-white text-xs px-2 py-1 h-auto"
                        onClick={() => handleCancelBidClick(song)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* External Search Results (fetched via play-server & saved to Firebase) */}
        {source === 'server' && (externalError || externalResults.length > 0) && (
          <div className="mt-3 pt-3 border-t border-cyan-500/30 space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 font-semibold text-cyan-300">
                <Globe className="w-3.5 h-3.5" />
                Online Results {externalSearchQuery ? `for "${externalSearchQuery}"` : ''}
              </span>
              <button
                type="button"
                onClick={() => {
                  setExternalResults([]);
                  setExternalError(null);
                }}
                className="text-gray-400 hover:text-white text-[10px]"
              >
                Clear
              </button>
            </div>

            {externalError && (
              <div className="p-2 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-[11px]">
                {externalError}
              </div>
            )}

            {externalResults.map((item) => {
              const savedSong = savedExternalSongs[item.videoId];
              const isFetchingThis = fetchingVideoId === item.videoId;
              const firebaseUrl = savedSong?.audioUrl || savedSong?.url || '';

              return (
                <div
                  key={item.videoId}
                  className={`rounded-lg p-2 border transition-colors ${
                    savedSong
                      ? 'bg-green-950/25 border-green-500/40'
                      : 'bg-gray-800/50 border-cyan-500/25'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-md bg-gray-900 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {item.thumbnail ? (
                        <img
                          src={item.thumbnail}
                          alt={item.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Music className="w-4 h-4 text-cyan-300" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h4 className="text-white font-semibold text-xs truncate">
                        {savedSong?.title || item.title}
                      </h4>
                      <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                        <span className="truncate">{savedSong?.artist || item.artist}</span>
                        {item.duration > 0 && (
                          <span className="text-[10px] text-gray-500 flex-shrink-0">
                            • {formatDuration(item.duration)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      {savedSong ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-purple-400 text-purple-400 hover:bg-purple-400 hover:text-white text-xs px-2 py-1 h-auto"
                            onClick={() => loadTrackToDeckA(savedSong)}
                            title="Load to Deck A"
                          >
                            A
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-blue-400 text-blue-400 hover:bg-blue-400 hover:text-white text-xs px-2 py-1 h-auto"
                            onClick={() => loadTrackToDeckB(savedSong)}
                            title="Load to Deck B"
                          >
                            B
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          disabled={Boolean(fetchingVideoId)}
                          onClick={() => void handleFetchAndSaveExternal(item)}
                          className="bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] px-2 py-1 h-auto"
                        >
                          {isFetchingThis ? (
                            <>
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Download className="w-3 h-3 mr-1" />
                              Import
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>

                  {savedSong && firebaseUrl && (
                    <div className="mt-2 pt-1.5 border-t border-white/10 flex items-center justify-between gap-2 text-[10px]">
                      <span className="text-green-400 font-semibold flex-shrink-0">
                        Saved to Firebase
                      </span>
                      <a
                        href={firebaseUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-300 hover:underline truncate flex-1"
                        title={firebaseUrl}
                      >
                        {firebaseUrl}
                      </a>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCopyUrl(item.videoId, firebaseUrl)}
                          className="p-1 rounded bg-white/10 hover:bg-white/20 text-gray-200"
                          title="Copy Firebase URL"
                        >
                          {copiedUrlId === item.videoId ? (
                            <Check className="w-3 h-3 text-green-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                        <a
                          href={firebaseUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 rounded bg-white/10 hover:bg-white/20 text-cyan-300"
                          title="Open audio URL"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        </div>
      </div>
      )}

      {/* Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={confirmationDialog.isOpen}
        onClose={handleDialogClose}
        onConfirm={handleConfirmCancelBid}
        song={confirmationDialog.song}
        isLoading={confirmationDialog.isLoading}
      />
    </div>
  );
};

export default MusicLibrary;
