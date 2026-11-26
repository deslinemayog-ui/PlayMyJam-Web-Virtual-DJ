import { useState, useEffect, useRef, useCallback } from 'react';

interface DiscoLightsState {
  isActive: boolean;
  colors: string[];
  intensity: number;
  bassLevel: number;
  midLevel: number;
  trebleLevel: number;
}

export const useDiscoLights = (isPlaying: boolean, deckId: 'A' | 'B') => {
  const [discoState, setDiscoState] = useState<DiscoLightsState>({
    isActive: false,
    colors: [],
    intensity: 0,
    bassLevel: 0,
    midLevel: 0,
    trebleLevel: 0
  });

  const animationRef = useRef<number>();
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  // Disco color palettes
  const discoColors = [
    '#FF0080', '#00FF80', '#8000FF', '#FF8000', '#0080FF', '#FF0040',
    '#40FF00', '#FF4000', '#0040FF', '#FF00C0', '#C0FF00', '#00C0FF',
    '#FF6000', '#6000FF', '#00FF60', '#FF0060', '#60FF00', '#0060FF'
  ];

  // Initialize audio analysis
  const initializeAudioAnalysis = useCallback(() => {
    try {
      console.log(`🎵 Attempting to initialize disco lights for Deck ${deckId}`);

      // Try multiple ways to find the audio element
      let audioElement = document.querySelector(`audio[data-deck="${deckId}"]`) as HTMLAudioElement;

      if (!audioElement) {
        // Fallback: look for any audio element playing
        const allAudio = document.querySelectorAll('audio');
        console.log(`🎵 Found ${allAudio.length} audio elements total`);

        if (allAudio.length > 0) {
          // Use the first audio element as fallback
          audioElement = allAudio[0] as HTMLAudioElement;
          console.log(`🎵 Using fallback audio element for Deck ${deckId}`);
        }
      }

      if (!audioElement) {
        console.warn(`❌ No audio element found for Deck ${deckId}`);
        // Create a simple fallback animation
        setDiscoState(prev => ({
          ...prev,
          isActive: true,
          colors: ['#FF0080', '#00FF80', '#8000FF', '#FF8000', '#0080FF', '#FF0040', '#40FF00', '#FF4000'],
          intensity: 0.5
        }));
        return;
      }

      console.log(`🎵 Audio element found for Deck ${deckId}:`, audioElement.src);

      // Reuse the AnalyserNode created by useMusicPlayer's Web Audio graph so we NEVER hijack
      // createMediaElementSource() away from Deck EQ / Volume / Effects!
      const sharedAnalyser = (audioElement as HTMLAudioElement & { __analyserNode?: AnalyserNode }).__analyserNode;
      if (sharedAnalyser) {
        analyserRef.current = sharedAnalyser;
        dataArrayRef.current = new Uint8Array(sharedAnalyser.frequencyBinCount);
        console.log(`✅ Disco lights reusing shared Deck ${deckId} analyser`);
        return;
      }

      // If Web Audio analyser isn't ready yet, use lightweight animated fallback without stealing the audio element
      setDiscoState(prev => ({
        ...prev,
        isActive: true,
        colors: ['#FF0080', '#00FF80', '#8000FF', '#FF8000', '#0080FF', '#FF0040', '#40FF00', '#FF4000'],
        intensity: 0.45
      }));
    } catch (error) {
      console.error(`❌ Failed to initialize disco lights for Deck ${deckId}:`, error);

      // Fallback to simple animation
      setDiscoState(prev => ({
        ...prev,
        isActive: true,
        colors: ['#FF0080', '#00FF80', '#8000FF', '#FF8000', '#0080FF', '#FF0040', '#40FF00', '#FF4000'],
        intensity: 0.3
      }));
    }
  }, [deckId]);

  // Generate disco colors based on frequency data
  const generateDiscoColors = useCallback(() => {
    if (!analyserRef.current || !dataArrayRef.current) {
      return discoColors.slice(0, 8); // Fallback colors
    }

    try {
      // Get frequency data
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      
      const dataArray = dataArrayRef.current;
      const length = dataArray.length;
      
      // Analyze frequency bands
      const bassEnd = Math.floor(length * 0.1);
      const midEnd = Math.floor(length * 0.5);
      
      // Calculate average levels for each frequency band
      let bassSum = 0, midSum = 0, trebleSum = 0;
      
      for (let i = 0; i < bassEnd; i++) {
        bassSum += dataArray[i];
      }
      for (let i = bassEnd; i < midEnd; i++) {
        midSum += dataArray[i];
      }
      for (let i = midEnd; i < length; i++) {
        trebleSum += dataArray[i];
      }
      
      const bassLevel = bassSum / bassEnd / 255;
      const midLevel = midSum / (midEnd - bassEnd) / 255;
      const trebleLevel = trebleSum / (length - midEnd) / 255;
      
      // Calculate overall intensity
      const intensity = (bassLevel + midLevel + trebleLevel) / 3;
      
      // Generate colors based on frequency levels
      const colors = [];
      const numColors = 8;
      
      for (let i = 0; i < numColors; i++) {
        const angle = (i / numColors) * 360;
        let hue = angle;
        
        // Modulate hue based on frequency content
        if (i < numColors / 3) {
          // Bass colors (reds/oranges)
          hue = (angle + bassLevel * 60) % 360;
        } else if (i < (numColors * 2) / 3) {
          // Mid colors (greens/blues)
          hue = (angle + midLevel * 60 + 120) % 360;
        } else {
          // Treble colors (blues/purples)
          hue = (angle + trebleLevel * 60 + 240) % 360;
        }
        
        // Adjust saturation and lightness based on intensity
        const saturation = Math.min(100, 70 + intensity * 30);
        const lightness = Math.min(80, 40 + intensity * 40);
        
        colors.push(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
      }
      
      // Update state only if there's a significant change to reduce re-renders
      const newIntensity = intensity > 0.05 ? intensity : 0;

      setDiscoState(prevState => {
        // Only update if intensity changed significantly (reduces re-renders)
        if (Math.abs(prevState.intensity - newIntensity) > 0.05) {
          return {
            isActive: newIntensity > 0.05,
            colors,
            intensity: newIntensity,
            bassLevel,
            midLevel,
            trebleLevel
          };
        }
        return prevState;
      });
      
      return colors;
    } catch (error) {
      console.error('Error analyzing audio:', error);
      return discoColors.slice(0, 8);
    }
  }, []);

  // Animation loop with throttling for better performance
  const lastFrameTimeRef = useRef(0);
  const animate = useCallback((currentTime: number) => {
    if (isPlaying && analyserRef.current) {
      // Throttle to ~15fps instead of 60fps for much better performance
      if (currentTime - lastFrameTimeRef.current >= 66) {
        generateDiscoColors();
        lastFrameTimeRef.current = currentTime;
      }
      animationRef.current = requestAnimationFrame(animate);
    }
  }, [isPlaying, generateDiscoColors]);

  // Start/stop disco lights based on playing state
  useEffect(() => {
    if (isPlaying) {
      console.log(`🕺 Starting disco lights for Deck ${deckId}`);
      
      // Initialize audio analysis if needed
      if (!analyserRef.current) {
        initializeAudioAnalysis();
      }
      
      // Resume audio context if suspended
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
      }
      
      // Start animation
      animate();
    } else {
      console.log(`🛑 Stopping disco lights for Deck ${deckId}`);
      
      // Stop animation
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      
      // Reset state
      setDiscoState({
        isActive: false,
        colors: [],
        intensity: 0,
        bassLevel: 0,
        midLevel: 0,
        trebleLevel: 0
      });
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, deckId, initializeAudioAnalysis, animate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Generate CSS gradient for border
  const getBorderGradient = useCallback(() => {
    if (!discoState.isActive || discoState.colors.length === 0) {
      return '';
    }

    const colors = discoState.colors;
    const intensity = discoState.intensity;
    
    // Create animated gradient
    const gradientStops = colors.map((color, index) => {
      const position = (index / colors.length) * 100;
      return `${color} ${position}%`;
    }).join(', ');
    
    // Add pulsing effect based on intensity
    const pulseScale = 1 + intensity * 0.3;
    
    return {
      background: `conic-gradient(${gradientStops})`,
      transform: `scale(${pulseScale})`,
      transition: 'transform 0.1s ease-out'
    };
  }, [discoState]);

  return {
    discoState,
    getBorderGradient,
    isDiscoActive: discoState.isActive && isPlaying
  };
};
