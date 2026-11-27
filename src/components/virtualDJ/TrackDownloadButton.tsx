import React, { useEffect, useRef, useState } from 'react';
import { Check, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  canDownloadTrack,
  downloadTrackLocally,
  type DownloadableSong,
} from '@/lib/downloadTrack';

interface TrackDownloadButtonProps {
  song: DownloadableSong;
  variant?: 'outline' | 'solid' | 'compact';
  className?: string;
}

const TrackDownloadButton: React.FC<TrackDownloadButtonProps> = ({
  song,
  variant = 'outline',
  className = '',
}) => {
  const [status, setStatus] = useState<'idle' | 'downloading' | 'done'>('idle');
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  if (!canDownloadTrack(song)) {
    return null;
  }

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (status === 'downloading') return;

    setStatus('downloading');
    const result = await downloadTrackLocally(song);

    if (result.success) {
      setStatus('done');
      if (result.fallbackOpened) {
        toast.info(`Opened "${result.fileName}" in a new tab to save.`);
      } else {
        toast.success(`Saved "${result.fileName}" to Downloads`);
      }

      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
      resetTimerRef.current = window.setTimeout(() => {
        setStatus('idle');
        resetTimerRef.current = null;
      }, 3000);
    } else {
      setStatus('idle');
      toast.error(result.error || 'Could not download this song.');
    }
  };

  const baseStyles =
    variant === 'solid'
      ? 'px-2 py-1 rounded text-[11px] font-bold bg-emerald-600/85 hover:bg-emerald-500 text-white'
      : variant === 'compact'
      ? 'w-6 h-6 rounded bg-emerald-700/60 text-emerald-200 hover:bg-emerald-600 hover:text-white border border-emerald-500/40'
      : 'border border-emerald-400/80 text-emerald-400 hover:bg-emerald-500 hover:text-white rounded-md px-1.5 py-1 bg-transparent';

  const statusStyles =
    status === 'done'
      ? variant === 'solid'
        ? 'bg-emerald-500 text-white'
        : 'border-emerald-400 bg-emerald-500/20 text-emerald-300'
      : '';

  return (
    <button
      type="button"
      draggable={false}
      onDragStart={(e) => e.stopPropagation()}
      onClick={(e) => void handleClick(e)}
      disabled={status === 'downloading'}
      title={
        status === 'downloading'
          ? 'Downloading to Downloads folder...'
          : status === 'done'
          ? 'Saved to Downloads'
          : 'Download song to Downloads folder'
      }
      aria-label={`Download ${song.title || 'song'} to Downloads folder`}
      className={`inline-flex items-center justify-center transition-colors disabled:opacity-70 cursor-pointer flex-shrink-0 ${baseStyles} ${statusStyles} ${className}`}
    >
      {status === 'downloading' ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : status === 'done' ? (
        <Check className="w-3.5 h-3.5" />
      ) : (
        <Download className="w-3.5 h-3.5" />
      )}
    </button>
  );
};

export default TrackDownloadButton;
