import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, User, Wallet, LogOut, Sparkles, Shuffle, ChevronDown, Hand, Radio } from 'lucide-react';
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
  const autoDJDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (autoDJDropdownRef.current && !autoDJDropdownRef.current.contains(event.target as Node)) {
        setShowAutoDJPanel(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
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

            {/* DJ Profile */}
            <div className="glass-card px-4 py-1 flex items-center gap-3">
              {/* Avatar */}
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center overflow-hidden">
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.fname || 'DJ'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-5 h-5 text-white" />
                )}
              </div>

              {/* DJ Info */}
              <div className="text-left">
                <p className="text-white font-montserrat-bold">
                  {user.djInfo?.djName || user.fname || 'DJ'}
                </p>
              </div>
            </div>

            {/* Logout Button */}
            <Button
              onClick={logout}
              variant="outline"
              size="sm"
              className="border-red-500 text-red-400 hover:bg-red-500 hover:text-white font-montserrat-bold transition-colors"
            >
              <LogOut className="w-4 h-4 mr-1" />
              Logout
            </Button>
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
