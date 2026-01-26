
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
                
                const source = audioContextRef.current.createMediaStreamSource(stream);
                analyzerRef.current = audioContextRef.current.createAnalyser();
                
                // High FFT size for granular frequency analysis
                analyzerRef.current.fftSize = 512;
                analyzerRef.current.smoothingTimeConstant = 0.7; // Smooth transitions
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
                    
                    const barWidth = (canvas.width / (bufferLength / 2)) * 1.5;
                    let x = 0;

                    // Focus on human speech frequencies (lower half of spectrum)
                    for (let i = 0; i < bufferLength / 2; i++) {
                        // High sensitivity scaling for better visibility of low volume
                        const normalized = dataArray[i] / 255;
                        const barHeight = normalized * canvas.height * 2.8;
                        
                        // Reactive gradient based on intensity
                        const hue = 210 + (normalized * 30); // Shifts from blue to lighter teal
                        ctx.fillStyle = `hsla(${hue}, 80%, 60%, ${0.5 + (normalized * 0.5)})`;
                        
                        // Rounded bars for clinical aesthetics
                        const radius = barWidth / 2;
                        const bx = x;
                        const by = canvas.height - barHeight;
                        
                        ctx.beginPath();
                        ctx.roundRect(bx, by, barWidth, barHeight, [radius, radius, 0, 0]);
                        ctx.fill();
                        
                        x += barWidth + 1.5;
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
