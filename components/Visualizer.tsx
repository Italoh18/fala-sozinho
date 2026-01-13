import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  isActive: boolean;
  volume: number; // 0-1 (ish)
  color: string;
}

export const Visualizer: React.FC<VisualizerProps> = ({ isActive, volume, color }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let time = 0;

    const draw = () => {
      time += 0.1;
      const width = canvas.width;
      const height = canvas.height;
      const centerY = height / 2;

      ctx.clearRect(0, 0, width, height);

      if (!isActive) return;

      ctx.beginPath();
      ctx.lineWidth = 4;
      ctx.strokeStyle = color;
      
      // Base radius + volume modulation
      const baseRadius = height * 0.2;
      const modRadius = baseRadius + (Math.min(volume, 1) * 50);

      // Draw a "breathing" or "talking" circle/waveform
      for (let i = 0; i < 360; i += 5) {
        const rad = (i * Math.PI) / 180;
        // Perlin-ish noise effect
        const noise = Math.sin((i * 0.1) + time) * Math.cos((i * 0.05) + (time * 2)) * 10;
        const r = modRadius + noise;
        
        const x = width / 2 + r * Math.cos(rad);
        const y = height / 2 + r * Math.sin(rad);

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      
      ctx.closePath();
      ctx.stroke();

      // Inner glow
      const gradient = ctx.createRadialGradient(width/2, height/2, baseRadius * 0.5, width/2, height/2, modRadius * 1.2);
      gradient.addColorStop(0, `${color}00`);
      gradient.addColorStop(1, `${color}44`);
      ctx.fillStyle = gradient;
      ctx.fill();

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => cancelAnimationFrame(animationId);
  }, [isActive, volume, color]);

  return (
    <canvas 
      ref={canvasRef} 
      width={300} 
      height={300} 
      className="w-64 h-64 md:w-80 md:h-80 mx-auto"
    />
  );
};
