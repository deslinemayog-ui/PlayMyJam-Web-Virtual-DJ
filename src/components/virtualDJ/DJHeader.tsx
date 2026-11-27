import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, User, Wallet, LogOut, Sparkles, Shuffle, ChevronDown, Hand, Radio, Disc3 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { currencyFormatter } from '@/utils';
import { Button } from '@/components/ui/button';
import AutoDJPanel from './AutoDJPanel';
import playLogo from '/play.webp';

interface DJHeaderProps {
  discoLightsEnabled?: boolean;
  onToggleDiscoLights?: (enabled: boolean) => void;
  airDJEnabled?: boolean;
  onToggleAirDJ?: (enabled: boolean) => void;
  // TikTok Live props
  isTikTokConnected?: boolean;
  tiktokViewerCount?: number;
  onOpenTikTokModal?: () => void;
  // Pioneer / MIDI Hardware props
  isHardwareConnected?: boolean;
  hardwareDeviceName?: string;
  onOpenHardwareModal?: () => void;
  // Auto DJ props
  autoDJState?: any;
  currentSong?: any;
  nextSong?: any;
  timeRemaining?: number;
  startAutoDJ?: () => void;
  stopAutoDJ?: () => void;
  skipToNext?: () => void;
  updateTransitionDuration?: (seconds: number) => void;
  updateCrossfadeSpeed?: (seconds: number) => void;
}

const DJHeader: React.FC<DJHeaderProps> = ({
  discoLightsEnabled = true,
  onToggleDiscoLights,
  airDJEnabled = false,
  onToggleAirDJ,
  isTikTokConnected = false,
  tiktokViewerCount = 0,
  onOpenTikTokModal,
  isHardwareConnected = false,
  hardwareDeviceName = '',
  onOpenHardwareModal,
  autoDJState,
  currentSong,
  nextSong,
  timeRemaining,
  startAutoDJ,
  stopAutoDJ,
  skipToNext,
  updateTransitionDuration,
  updateCrossfadeSpeed
}) => {
  const { user, isAuthenticated, logout } = useAuth();
  const [showAutoDJPanel, setShowAutoDJPanel] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const autoDJDropdownRef = useRef<HTMLDivElement>(null);
  const profileDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (autoDJDropdownRef.current && !autoDJDropdownRef.current.contains(event.target as Node)) {
        setShowAutoDJPanel(false);
      }
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowAutoDJPanel(false);
        setShowProfileMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div className="container mx-auto px-6 py-2">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Link to="/" className="glass-card p-2 hover-lift">
            <ArrowLeft className="w-5 h-5 text-white" />
          </Link>
          <div>
            <img
              src={playLogo}
              alt="PlayMyJam DJ"
              decoding="async"
              className="h-8 lg:h-10 w-auto"
            />
          </div>
        </div>

        {/* DJ Info Section */}
        {isAuthenticated && user ? (
          <div className="flex items-center gap-4 relative">
            {/* Auto DJ Dropdown */}
            <div className="relative" ref={autoDJDropdownRef}>
              <Button
                onClick={() => setShowAutoDJPanel(!showAutoDJPanel)}
                variant="outline"
                size="sm"
                className={`${autoDJState?.isEnabled
                  ? 'border-green-500 text-green-400 bg-green-500/20'
                  : 'border-blue-500 text-blue-400 bg-blue-500/20'
                  } hover:bg-blue-500 hover:text-white font-montserrat-bold transition-colors`}
              >
                <Shuffle className="w-4 h-4 mr-1" />
                Auto DJ
                <ChevronDown className={`w-3 h-3 ml-1 transition-transform ${showAutoDJPanel ? 'rotate-180' : ''}`} />
              </Button>

              {/* Auto DJ Panel Dropdown */}
              {showAutoDJPanel && (
                <div className="absolute top-full right-0 mt-2 z-50">
                  <div className="bg-gray-900/95 backdrop-blur-sm border border-gray-600/50 rounded-lg shadow-2xl">
                    <AutoDJPanel
                      autoDJState={autoDJState}
                      currentSong={currentSong}
                      nextSong={nextSong}
                      timeRemaining={timeRemaining || 0}
                      startAutoDJ={startAutoDJ || (() => { })}
                      stopAutoDJ={stopAutoDJ || (() => { })}
                      skipToNext={skipToNext || (() => { })}
                      updateTransitionDuration={updateTransitionDuration || (() => { })}
                      updateCrossfadeSpeed={updateCrossfadeSpeed || (() => { })}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Connect TikTok Button */}
            <Button
              onClick={onOpenTikTokModal}
              variant="outline"
              size="sm"
              className={`${isTikTokConnected
                ? 'border-[#25f4ee] text-[#25f4ee] bg-[#25f4ee]/15 hover:bg-[#25f4ee]/25'
                : 'border-[#fe2c55]/70 text-pink-300 bg-[#fe2c55]/15 hover:bg-[#fe2c55] hover:text-white'
                } font-montserrat-bold transition-all`}
            >
              <Radio className={`w-4 h-4 mr-1.5 ${isTikTokConnected ? 'animate-pulse' : ''}`} />
              {isTikTokConnected ? 'TikTok Live' : 'Connect TikTok'}
              {isTikTokConnected && tiktokViewerCount > 0 && (
                <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-black/30 text-[10px]">
                  {tiktokViewerCount.toLocaleString()}
                </span>
              )}
            </Button>

            {/* Pioneer / MIDI Hardware Button */}
            <Button
              onClick={onOpenHardwareModal}
              variant="outline"
              size="sm"
              className={`${isHardwareConnected
                ? 'border-emerald-400 text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25'
                : 'border-cyan-500/60 text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500 hover:text-black'
                } font-montserrat-bold transition-all`}
              title="Connect Pioneer DDJ controllers, Club CDJs (MIDI), and Headphone Cue routing"
            >
              <Disc3 className={`w-4 h-4 mr-1.5 ${isHardwareConnected ? 'animate-spin' : ''}`} style={isHardwareConnected ? { animationDuration: '5s' } : undefined} />
              <span className="max-w-[110px] truncate">
                {isHardwareConnected ? (hardwareDeviceName || 'Pioneer MIDI') : 'Pioneer / MIDI'}
              </span>
            </Button>

            {/* Disco Lights Toggle */}
            {/**<Button
              onClick={() => onToggleDiscoLights?.(!discoLightsEnabled)}
              variant="outline"
              size="sm"
              className={`${
                discoLightsEnabled
                  ? 'border-purple-500 text-purple-400 bg-purple-500/20'
                  : 'border-gray-500 text-gray-400'
              } hover:bg-purple-500 hover:text-white font-montserrat-bold transition-colors`}
            >
              <Sparkles className="w-4 h-4 mr-1" />
              Disco
            </Button> */}

            {/* Air DJ Motion Control Toggle - Commented out for now
            <Button
              onClick={() => onToggleAirDJ?.(!airDJEnabled)}
              variant="outline"
              size="sm"
              className={`${
                airDJEnabled
                  ? 'border-cyan-400 text-cyan-300 bg-cyan-500/25 shadow-[0_0_12px_rgba(34,211,238,0.4)]'
                  : 'border-gray-600 text-gray-300 hover:border-cyan-400/60'
              } hover:bg-cyan-500 hover:text-white font-montserrat-bold transition-all`}
            >
              <Hand className="w-4 h-4 mr-1 text-cyan-400" />
              Air DJ
            </Button>
            */}
            {/* Balance */}
            <div className="glass-card px-4 py-2 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-green-400" />
              <div className="text-right">
                <p className="text-green-400 font-montserrat-bold">
                  {currencyFormatter(user.balance || 0)}
                </p>
              </div>
            </div>

            {/* DJ Profile Dropdown */}
            <div className="relative" ref={profileDropdownRef}>
              <button
                type="button"
                onClick={() => setShowProfileMenu((prev) => !prev)}
                aria-expanded={showProfileMenu}
                aria-haspopup="menu"
                className="glass-card px-3 py-1.5 flex items-center gap-2.5 hover:border-purple-400/50 border border-transparent transition-colors cursor-pointer"
              >
                {/* Avatar */}
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {user.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user.fname || 'DJ'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-4 h-4 text-white" />
                  )}
                </div>

                {/* DJ Info */}
                <div className="text-left">
                  <p className="text-white text-sm font-montserrat-bold leading-tight">
                    {user.djInfo?.djName || user.fname || 'DJ'}
                  </p>
                </div>

                <ChevronDown
                  className={`w-3.5 h-3.5 text-gray-300 transition-transform ${showProfileMenu ? 'rotate-180' : ''}`}
                />
              </button>

              {showProfileMenu && (
                <div
                  role="menu"
                  className="absolute top-full right-0 mt-2 z-50 min-w-[180px] bg-gray-900/95 backdrop-blur-sm border border-gray-600/50 rounded-lg shadow-2xl p-1.5"
                >
                  <div className="px-2.5 py-1.5 border-b border-gray-700/70 mb-1">
                    <p className="text-xs font-montserrat-bold text-white truncate">
                      {user.djInfo?.djName || user.fname || 'DJ'}
                    </p>
                    {user.email && (
                      <p className="text-[10px] text-gray-400 truncate mt-0.5">{user.email}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowProfileMenu(false);
                      logout();
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs text-red-400 hover:bg-red-500 hover:text-white font-montserrat-bold transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Button
              onClick={onOpenTikTokModal}
              variant="outline"
              size="sm"
              className={`${isTikTokConnected
                ? 'border-[#25f4ee] text-[#25f4ee] bg-[#25f4ee]/15 hover:bg-[#25f4ee]/25'
                : 'border-[#fe2c55]/70 text-pink-300 bg-[#fe2c55]/15 hover:bg-[#fe2c55] hover:text-white'
                } font-montserrat-bold transition-all`}
            >
              <Radio className={`w-4 h-4 mr-1.5 ${isTikTokConnected ? 'animate-pulse' : ''}`} />
              {isTikTokConnected ? 'TikTok Live' : 'Connect TikTok'}
            </Button>
            <Button
              onClick={onOpenHardwareModal}
              variant="outline"
              size="sm"
              className={`${isHardwareConnected
                ? 'border-emerald-400 text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25'
                : 'border-cyan-500/60 text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500 hover:text-black'
                } font-montserrat-bold transition-all`}
            >
              <Disc3 className={`w-4 h-4 mr-1.5 ${isHardwareConnected ? 'animate-spin' : ''}`} style={isHardwareConnected ? { animationDuration: '5s' } : undefined} />
              <span className="max-w-[110px] truncate">
                {isHardwareConnected ? (hardwareDeviceName || 'Pioneer MIDI') : 'Pioneer / MIDI'}
              </span>
            </Button>
            <div className="glass-card px-4 py-2">
              <p className="text-gray-400 font-montserrat-light">Please login to continue</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DJHeader;
