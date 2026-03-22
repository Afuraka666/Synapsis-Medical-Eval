
import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
    isListening: boolean;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ isListening }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyzerRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    useEffect(() => {
        if (!isListening) {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            return;
        }

        const startVisualizer = async () => {
            try {
                // High-fidelity microphone constraints for improved clarity and sensitivity
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    audio: { 
                        echoCancellation: true, 
                        noiseSuppression: true, 
                        autoGainControl: true,
                        sampleRate: 48000,
                        channelCount: 1
                    } 
                });
                
                // Use interactive latency hint for real-time responsiveness
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
                    latencyHint: 'interactive'
                });

                if (audioContextRef.current.state === 'suspended') {
                    await audioContextRef.current.resume();
                }
                
                const source = audioContextRef.current.createMediaStreamSource(stream);
                analyzerRef.current = audioContextRef.current.createAnalyser();
                
                // High FFT size for granular frequency analysis
                analyzerRef.current.fftSize = 1024;
                analyzerRef.current.smoothingTimeConstant = 0.5; // Faster transitions for better responsiveness
                source.connect(analyzerRef.current);

                const bufferLength = analyzerRef.current.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);
                const canvas = canvasRef.current;
                if (!canvas) return;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;

                const draw = () => {
                    if (!isListening) return;
                    animationFrameRef.current = requestAnimationFrame(draw);
                    analyzerRef.current?.getByteFrequencyData(dataArray);

                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    
                    // Focus on human speech frequencies (approx. 300Hz - 3400Hz)
                    // With 48kHz sample rate and 1024 FFT, each bin is ~47Hz.
                    // 300Hz is bin ~6, 3400Hz is bin ~72.
                    const startBin = 4;
                    const endBin = 80;
                    const activeBins = endBin - startBin;
                    const barWidth = (canvas.width / activeBins) * 0.8;
                    let x = (canvas.width - (activeBins * (barWidth + 1))) / 2;

                    for (let i = startBin; i < endBin; i++) {
                        // Logarithmic-like sensitivity scaling for better visibility of speech nuances
                        const value = dataArray[i];
                        const normalized = Math.pow(value / 255, 0.85);
                        const barHeight = normalized * canvas.height * 0.9;
                        
                        // Reactive gradient based on intensity and frequency
                        const hue = 210 + (normalized * 40) + (i * 0.5); 
                        ctx.fillStyle = `hsla(${hue}, 85%, 60%, ${0.6 + (normalized * 0.4)})`;
                        
                        // Centered rounded bars for a modern "voice wave" look
                        const radius = barWidth / 2;
                        const bx = x;
                        const by = (canvas.height - barHeight) / 2;
                        
                        ctx.beginPath();
                        ctx.roundRect(bx, by, barWidth, barHeight, [radius, radius, radius, radius]);
                        ctx.fill();
                        
                        x += barWidth + 1;
                    }
                };
                draw();
            } catch (err) {
                console.error("Visualizer failed", err);
            }
        };

        startVisualizer();

        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            if (audioContextRef.current?.state !== 'closed') {
                audioContextRef.current?.close();
            }
        };
    }, [isListening]);

    if (!isListening) return null;

    return (
        <canvas 
            ref={canvasRef} 
            width="60" 
            height="24" 
            className="rounded-md opacity-100 shadow-sm border border-brand-blue/10 bg-blue-50/20"
        />
    );
};
