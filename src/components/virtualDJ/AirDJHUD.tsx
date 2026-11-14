import React, { useEffect, useRef, useState, useCallback } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { X, Minimize2, Maximize2, Hand, Sliders, Volume2, Sparkles, Loader2, VideoOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AirDJHUDProps {
  isOpen: boolean;
  onClose: () => void;
  crossfader: number; // 0 to 100
  onUpdateCrossfader: (value: number) => void;
  onUpdateDeckAVolume?: (value: number) => void;
  onUpdateDeckBVolume?: (value: number) => void;
  onToggleDeckA?: () => void;
  onToggleDeckB?: () => void;
  onPlaySoundEffect?: (effect: string) => void;
}

// MediaPipe Hand connection pairs for skeleton drawing
const HAND_CONNECTIONS = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle
  [0, 9], [9, 10], [10, 11], [11, 12],
  // Ring
  [0, 13], [13, 14], [14, 15], [15, 16],
  // Pinky
  [0, 17], [17, 18], [18, 19], [19, 20],
  // Palm connections
  [5, 9], [9, 13], [13, 17]
];

export const AirDJHUD: React.FC<AirDJHUDProps> = ({
  isOpen,
  onClose,
  crossfader,
  onUpdateCrossfader,
  onUpdateDeckAVolume,
  onUpdateDeckBVolume,
  onToggleDeckA,
  onToggleDeckB,
  onPlaySoundEffect
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [controlMode, setControlMode] = useState<'crossfader' | 'volume'>('crossfader');
  const [detectedHandsCount, setDetectedHandsCount] = useState(0);
  const [isPinching, setIsPinching] = useState(false);
  const [activeGestureNote, setActiveGestureNote] = useState<string>('Wave your hand in view');

  // Debounce for pinch actions (e.g. sound effect or toggle)
  const lastPinchTimeRef = useRef<number>(0);

  // Initialize MediaPipe Vision Task & Camera
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsLoading(true);
    setCameraError(null);

    const initLandmarker = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );

        if (!isMounted) return;

        const landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
        });

        landmarkerRef.current = landmarker;

        // Start webcam stream
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, frameRate: { ideal: 30 } },
          audio: false,
        });

        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadeddata = () => {
            if (isMounted) {
              setIsLoading(false);
              startTrackingLoop();
            }
          };
        }
      } catch (err: any) {
        console.error('Air DJ init error:', err);
        if (isMounted) {
          setIsLoading(false);
          setCameraError(err.message || 'Could not access webcam');
        }
      }
    };

    initLandmarker();

    return () => {
      isMounted = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
      }
    };
  }, [isOpen]);

  // Main Tracking Loop
  const startTrackingLoop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;

    if (!video || !canvas || !landmarker) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      if (video.readyState >= 2) {
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 240;

        const now = performance.now();
        const results = landmarker.detectForVideo(video, now);

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const handLandmarks = results.landmarks || [];
        setDetectedHandsCount(handLandmarks.length);

        if (handLandmarks.length === 0) {
          setActiveGestureNote('No hands detected. Show hands to camera.');
          setIsPinching(false);
        } else {
          // Process Hand 1 (and Hand 2 if present)
          handLandmarks.forEach((landmarks, handIndex) => {
            // Draw Hand Skeleton
            drawHandSkeleton(ctx, landmarks, canvas.width, canvas.height, handIndex);

            // Calculate Key Landmarks (Mirrored horizontal axis: 1.0 - landmark.x)
            const wrist = landmarks[0];
            const thumbTip = landmarks[4];
            const indexTip = landmarks[8];

            const mirroredX = 1.0 - wrist.x;
            const mirroredY = 1.0 - wrist.y;

            // Check Pinch: distance between thumb tip and index tip
            const pinchDist = Math.hypot(
              thumbTip.x - indexTip.x,
              thumbTip.y - indexTip.y,
              thumbTip.z - indexTip.z
            );

            const pinchingNow = pinchDist < 0.07;
            setIsPinching(pinchingNow);

            if (pinchingNow && now - lastPinchTimeRef.current > 1200) {
              lastPinchTimeRef.current = now;
              // Trigger quick DJ FX scratch/drop on pinch
              onPlaySoundEffect?.('scratch');
              setActiveGestureNote('⚡ Pinch Detected! DJ Scratch triggered');
            }

            // GESTURE MODE 1: CROSSFADER CONTROL (Single or primary hand X position)
            if (controlMode === 'crossfader' && handIndex === 0) {
              // Map mirroredX (0.1 to 0.9) to crossfader (0 to 100)
              const clampedX = Math.max(0.1, Math.min(0.9, mirroredX));
              let normalizedX = (clampedX - 0.1) / 0.8; // 0.0 to 1.0

              // Soft center snap around 50%
              if (normalizedX >= 0.44 && normalizedX <= 0.56) {
                normalizedX = 0.5;
              }

              const newCrossfaderVal = Math.round(normalizedX * 100);
              onUpdateCrossfader(newCrossfaderVal);

              const deckLabel =
                newCrossfaderVal < 45
                  ? `Deck A (${100 - newCrossfaderVal}%)`
                  : newCrossfaderVal > 55
                  ? `Deck B (${newCrossfaderVal}%)`
                  : 'Balanced (50/50)';

              setActiveGestureNote(`Crossfader: ${deckLabel}`);
            }

            // GESTURE MODE 2: DUAL VOLUME (Left hand Deck A, Right hand Deck B)
            if (controlMode === 'volume') {
              // Higher hand in view = higher volume (0.2 to 0.85 Y range)
              const vol = Math.max(0, Math.min(1, (mirroredY - 0.2) / 0.65));
              const pct = Math.round(vol * 100);

              if (mirroredX < 0.5) {
                onUpdateDeckAVolume?.(vol);
                setActiveGestureNote(`Left Hand ➔ Deck A Volume: ${pct}%`);
              } else {
                onUpdateDeckBVolume?.(vol);
                setActiveGestureNote(`Right Hand ➔ Deck B Volume: ${pct}%`);
              }
            }
          });
        }
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();
  }, [controlMode, onUpdateCrossfader, onUpdateDeckAVolume, onUpdateDeckBVolume, onPlaySoundEffect]);

  // Helper: Draw Neon Skeleton
  const drawHandSkeleton = (
    ctx: CanvasRenderingContext2D,
    landmarks: any[],
    width: number,
    height: number,
    handIndex: number
  ) => {
    // Neon line color (Cyan for hand 0, Pink for hand 1)
    const strokeColor = handIndex === 0 ? '#38bdf8' : '#f43f5e';
    const pointColor = handIndex === 0 ? '#06b6d4' : '#fb7185';

    // 1. Draw Bones
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.shadowColor = strokeColor;
    ctx.shadowBlur = 8;

    HAND_CONNECTIONS.forEach(([i, j]) => {
      const p1 = landmarks[i];
      const p2 = landmarks[j];

      ctx.beginPath();
      // Video is mirrored horizontally
      ctx.moveTo((1.0 - p1.x) * width, p1.y * height);
      ctx.lineTo((1.0 - p2.x) * width, p2.y * height);
      ctx.stroke();
    });

    // 2. Draw Glowing Knuckle/Joint Dots
    landmarks.forEach((p, index) => {
      const x = (1.0 - p.x) * width;
      const y = p.y * height;

      ctx.beginPath();
      // Larger circle for fingertips (#4, #8, #12, #16, #20)
      const isTip = [4, 8, 12, 16, 20].includes(index);
      ctx.arc(x, y, isTip ? 5 : 3, 0, 2 * Math.PI);
      ctx.fillStyle = isTip ? '#ffffff' : pointColor;
      ctx.shadowColor = pointColor;
      ctx.shadowBlur = isTip ? 12 : 6;
      ctx.fill();
    });
  };

  if (!isOpen) return null;

  return (
    <div
      className={`fixed z-50 transition-all duration-300 ${
        isMinimized
          ? 'bottom-6 right-6 w-auto'
          : 'bottom-6 right-6 w-80 sm:w-96'
      }`}
    >
      <div className="glass-card bg-[#0e1322]/95 border border-purple-500/40 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-gradient-to-r from-purple-900/40 via-indigo-900/30 to-black/40">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
            <Hand className="w-4 h-4 text-cyan-400" />
            <span className="text-white text-xs font-montserrat-bold tracking-wide">
              Air DJ • Motion Control
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMinimized(!isMinimized)}
              className="h-7 w-7 p-0 text-gray-400 hover:text-white"
            >
              {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-7 w-7 p-0 text-gray-400 hover:text-red-400"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Minimized View Pill */}
        {isMinimized && (
          <div className="px-4 py-2 flex items-center gap-3">
            <span className="text-xs text-cyan-400 font-medium">Tracking Active</span>
            <span className="text-xs text-gray-400 font-mono">
              Fader: {crossfader}%
            </span>
          </div>
        )}

        {/* Expanded View */}
        {!isMinimized && (
          <div className="p-3">
            {/* Camera View with Neon Canvas Overlay */}
            <div className="relative w-full aspect-[4/3] bg-black/60 rounded-xl overflow-hidden border border-white/10 flex items-center justify-center">
              {isLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-20 bg-black/80">
                  <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
                  <span className="text-xs text-gray-300 font-medium">Starting MediaPipe AI Vision...</span>
                </div>
              )}

              {cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center z-20 bg-black/90">
                  <VideoOff className="w-8 h-8 text-red-400 mb-2" />
                  <span className="text-xs text-red-300">{cameraError}</span>
                  <span className="text-[10px] text-gray-500 mt-1">Please allow camera permissions</span>
                </div>
              )}

              {/* Hidden Video Source (flipped for natural mirroring) */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover transform -scale-x-100 opacity-30"
              />

              {/* Live Skeletal Landmark Canvas Overlay */}
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full pointer-events-none"
              />

              {/* Live HUD Floating Badges */}
              <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/60 border border-white/10 text-[10px] text-white">
                <span className={`w-1.5 h-1.5 rounded-full ${detectedHandsCount > 0 ? 'bg-green-400' : 'bg-yellow-400'}`} />
                {detectedHandsCount === 0 ? 'No Hands' : `${detectedHandsCount} Hand${detectedHandsCount > 1 ? 's' : ''}`}
              </div>

              {isPinching && (
                <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/30 border border-yellow-400/50 text-[10px] text-yellow-300 font-bold animate-pulse">
                  <Sparkles className="w-3 h-3 text-yellow-400" />
                  PINCH
                </div>
              )}

              {/* Crossfader Visual Guide Bar in Video */}
              {controlMode === 'crossfader' && (
                <div className="absolute bottom-2 inset-x-4">
                  <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden relative">
                    <div
                      className="absolute top-0 bottom-0 w-3 bg-cyan-400 rounded-full shadow-[0_0_10px_#22d3ee] transform -translate-x-1/2 transition-all duration-75"
                      style={{ left: `${crossfader}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] text-gray-400 font-bold mt-1 px-1">
                    <span className="text-cyan-400">DECK A</span>
                    <span>CENTER</span>
                    <span className="text-pink-400">DECK B</span>
                  </div>
                </div>
              )}
            </div>

            {/* Gesture Telemetry Readout */}
            <div className="mt-2.5 px-3 py-2 bg-white/5 rounded-xl border border-white/5 flex items-center justify-between">
              <span className="text-xs text-gray-300 font-mono truncate max-w-[240px]">
                {activeGestureNote}
              </span>
              <span className="text-[11px] font-bold text-cyan-400 font-mono">
                {controlMode === 'crossfader' ? `${crossfader}%` : 'LIVE'}
              </span>
            </div>

            {/* Mode Switcher */}
            <div className="grid grid-cols-2 gap-2 mt-2">
              <Button
                variant={controlMode === 'crossfader' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setControlMode('crossfader')}
                className={`h-8 text-xs font-semibold ${
                  controlMode === 'crossfader'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white'
                    : 'border-white/10 text-gray-300 hover:text-white'
                }`}
              >
                <Sliders className="w-3.5 h-3.5 mr-1.5" />
                Crossfader Mode
              </Button>

              <Button
                variant={controlMode === 'volume' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setControlMode('volume')}
                className={`h-8 text-xs font-semibold ${
                  controlMode === 'volume'
                    ? 'bg-gradient-to-r from-purple-500 to-pink-600 text-white'
                    : 'border-white/10 text-gray-300 hover:text-white'
                }`}
              >
                <Volume2 className="w-3.5 h-3.5 mr-1.5" />
                Dual Volume Mode
              </Button>
            </div>

            {/* Quick Tips */}
            <p className="text-[10px] text-gray-500 text-center mt-2">
              Wave hand left/right to glide crossfader • Pinch fingers to scratch
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AirDJHUD;
