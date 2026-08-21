import React, { useEffect, useRef, useState } from "react";
import type { AssistantState } from "../types";

interface JarvisHologramProps {
  state?: AssistantState | string;
  size?: number;
  className?: string;
  showControls?: boolean;
  interactive?: boolean;
}

interface Particle3D {
  x: number;
  y: number;
  z: number;
  baseX: number;
  baseY: number;
  baseZ: number;
  radius: number;
  phase: number;
  speed: number;
  connections: number[];
  color: string;
}

interface ConnectionPulse {
  fromIdx: number;
  toIdx: number;
  progress: number;
  speed: number;
}

export function JarvisHologram({
  state = "IDLE",
  size = 420,
  className = "",
  showControls = true,
  interactive = true,
}: JarvisHologramProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Local state for simulation / testing override if user clicks quick controls
  const [activeState, setActiveState] = useState<string>(state);
  const [animPhase, setAnimPhase] = useState<"fading_particles" | "connecting_lines" | "center_mass" | "ready">("fading_particles");
  const [phaseProgress, setPhaseProgress] = useState<number>(0); // 0 to 1 for initial sequence

  // Update activeState when prop changes unless manually overridden
  useEffect(() => {
    setActiveState(state);
  }, [state]);

  // Sequence state ref to maintain smooth state transitions inside requestAnimationFrame loop
  const seqStartTimeRef = useRef<number>(Date.now());
  const mousePosRef = useRef<{ x: number; y: number; targetX: number; targetY: number }>({
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
  });
  const clickWaveRef = useRef<{ radius: number; maxRadius: number; active: boolean }>({
    radius: 0,
    maxRadius: 180,
    active: false,
  });

  const triggerStartupSequence = () => {
    seqStartTimeRef.current = Date.now();
    setAnimPhase("fading_particles");
    setPhaseProgress(0);
  };

  useEffect(() => {
    triggerStartupSequence();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;

    // Build 3D Particle Sphere Node Grid (Fibonacci Sphere Algorithm)
    const particleCount = 140;
    const particles: Particle3D[] = [];
    const sphereRadius = size * 0.32;

    const phi = (1 + Math.sqrt(5)) / 2; // Golden ratio

    for (let i = 0; i < particleCount; i++) {
      // Fibonacci sphere mapping
      const theta = 2 * Math.PI * i / phi;
      const y = 1 - (i / (particleCount - 1)) * 2; // -1 to 1
      const radiusAtY = Math.sqrt(1 - y * y);

      const x = Math.cos(theta) * radiusAtY;
      const z = Math.sin(theta) * radiusAtY;

      const px = x * sphereRadius;
      const py = y * sphereRadius;
      const pz = z * sphereRadius;

      // Color variation in gold/amber JARVIS HUD scheme
      const goldShades = [
        "#FFB300",
        "#FFA000",
        "#FF8C00",
        "#FFC107",
        "#FFD54F",
        "#00E5FF", // Accent glowing cyan node
      ];
      const color = goldShades[i % goldShades.length];

      particles.push({
        x: px,
        y: py,
        z: pz,
        baseX: px,
        baseY: py,
 baseZ: pz,
        radius: Math.random() * 1.8 + 1.2,
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.02 + 0.01,
        connections: [],
        color,
      });
    }

    // Pre-calculate spatial connections between close neighbors
    const maxConnDist = sphereRadius * 0.48;
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].baseX - particles[j].baseX;
        const dy = particles[i].baseY - particles[j].baseY;
        const dz = particles[i].baseZ - particles[j].baseZ;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < maxConnDist && particles[i].connections.length < 4) {
          particles[i].connections.push(j);
        }
      }
    }

    // Dynamic signal pulses moving through lines
    const linePulses: ConnectionPulse[] = [];
    for (let i = 0; i < 25; i++) {
      const fromIdx = Math.floor(Math.random() * particles.length);
      const conns = particles[fromIdx].connections;
      if (conns.length > 0) {
        const toIdx = conns[Math.floor(Math.random() * conns.length)];
        linePulses.push({
          fromIdx,
          toIdx,
          progress: Math.random(),
          speed: 0.008 + Math.random() * 0.012,
        });
      }
    }

    // Animation Loop
    let angleX = 0.2;
    let angleY = 0.0;
    const center = size / 2;

    const render = () => {
      const now = Date.now();
      const elapsed = now - seqStartTimeRef.current;

      // Stage timing calculations:
      // Stage 0: 0ms -> 1500ms (Fading incoming particles)
      // Stage 1: 1500ms -> 3500ms (Connecting lines start tracing)
      // Stage 2: 3500ms -> 5000ms (Center mass energizes and binds all particles)
      // Stage 3: 5000ms+ (Ready state, Age of Ultron breathing loop active)

      let currentStage: "fading_particles" | "connecting_lines" | "center_mass" | "ready" = "ready";
      let particleOpacity = 1.0;
      let lineOpacity = 1.0;
      let centerMassScale = 1.0;

      if (elapsed < 1500) {
        currentStage = "fading_particles";
        particleOpacity = Math.min(1.0, elapsed / 1200);
        lineOpacity = 0;
        centerMassScale = 0;
      } else if (elapsed < 3500) {
        currentStage = "connecting_lines";
        particleOpacity = 1.0;
        lineOpacity = Math.min(1.0, (elapsed - 1500) / 1800);
        centerMassScale = Math.min(0.4, (elapsed - 1500) / 2000);
      } else if (elapsed < 5000) {
        currentStage = "center_mass";
        particleOpacity = 1.0;
        lineOpacity = 1.0;
        centerMassScale = 0.4 + 0.6 * Math.min(1.0, (elapsed - 3500) / 1500);
      } else {
        currentStage = "ready";
        particleOpacity = 1.0;
        lineOpacity = 1.0;
        centerMassScale = 1.0;
      }

      setAnimPhase(currentStage);
      setPhaseProgress(Math.min(1.0, elapsed / 5000));

      // Calculate breathing parameters based on active assistant state
      const time = now * 0.001;
      let breathFreq = 1.2;
      let breathAmp = 0.06;
      let rotationSpeed = 0.005;
      let coreGlowIntensity = 0.8;

      const normalizedState = (activeState || "").toUpperCase();

      if (normalizedState === "THINKING" || normalizedState === "RESEARCHING" || normalizedState === "EXECUTING") {
        breathFreq = 3.2;
        breathAmp = 0.12;
        rotationSpeed = 0.015;
        coreGlowIntensity = 1.0;
      } else if (normalizedState === "SPEAKING" || normalizedState === "RESPONDING" || normalizedState === "TALKING") {
        // Multi-frequency organic vocal breathing pattern
        breathFreq = 2.4;
        breathAmp = 0.15;
        rotationSpeed = 0.008;
        coreGlowIntensity = 1.2;
      } else if (normalizedState === "LISTENING") {
        breathFreq = 1.8;
        breathAmp = 0.09;
        rotationSpeed = 0.006;
        coreGlowIntensity = 0.9;
      }

      // Age of Ultron HUD Breathing Radius Modulation (Harmonic expansion & contraction)
      const breathingFactor = 1 + Math.sin(time * breathFreq * Math.PI) * breathAmp + Math.cos(time * breathFreq * 0.5 * Math.PI) * (breathAmp * 0.4);

      // Smooth Mouse Interactivity (Parallax Pitch & Yaw)
      const mouse = mousePosRef.current;
      mouse.x += (mouse.targetX - mouse.x) * 0.05;
      mouse.y += (mouse.targetY - mouse.y) * 0.05;

      angleY += rotationSpeed;
      const rotY = angleY + mouse.x * 0.4;
      const rotX = angleX + mouse.y * 0.4;

      // Clear Canvas
      ctx.clearRect(0, 0, size, size);

      // Save Context
      ctx.save();
      ctx.translate(center, center);

      // 1. Draw Outer Holographic Radial Glow
      const ambientGlow = ctx.createRadialGradient(0, 0, size * 0.05, 0, 0, sphereRadius * 1.5 * breathingFactor);
      ambientGlow.addColorStop(0, `rgba(255, 170, 0, ${0.25 * coreGlowIntensity * particleOpacity})`);
      ambientGlow.addColorStop(0.5, `rgba(255, 120, 0, ${0.1 * particleOpacity})`);
      ambientGlow.addColorStop(1, "rgba(8, 16, 24, 0)");
      ctx.fillStyle = ambientGlow;
      ctx.beginPath();
      ctx.arc(0, 0, sphereRadius * 1.6 * breathingFactor, 0, Math.PI * 2);
      ctx.fill();

      // Project 3D Particles & Rotations
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);

      const projectedPoints: { x: number; y: number; z: number; scale: number; opacity: number; color: string; origIdx: number }[] = [];

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Micro particle wiggle / orbital jitter
        const jitter = Math.sin(time * 3 + p.phase) * 1.5;
        const currentRadius = sphereRadius * breathingFactor + jitter;
        const normFactor = currentRadius / sphereRadius;

        let bx = p.baseX * normFactor;
        let by = p.baseY * normFactor;
        let bz = p.baseZ * normFactor;

        // Apply 3D Rotation Matrix
        // Y-axis rotation
        let x1 = bx * cosY - bz * sinY;
        let z1 = bx * sinY + bz * cosY;
        let y1 = by;

        // X-axis rotation
        let y2 = y1 * cosX - z1 * sinX;
        let z2 = y1 * sinX + z1 * cosX;
        let x2 = x1;

        // Perspective Projection
        const fov = 450;
        const scale = fov / (fov + z2);
        const projX = x2 * scale;
        const projY = y2 * scale;

        // Depth opacity (particles in front are brighter)
        const depthOpacity = Math.max(0.15, Math.min(1.0, (z2 + sphereRadius) / (sphereRadius * 2)));

        projectedPoints.push({
          x: projX,
          y: projY,
          z: z2,
          scale,
          opacity: depthOpacity * particleOpacity,
          color: p.color,
          origIdx: i,
        });
      }

      // Sort points by Z (depth buffer rendering for clean overlap)
      const sortedPoints = [...projectedPoints].sort((a, b) => a.z - b.z);

      // 2. Draw Concentric Orbital HUD Tech Rings (Avengers Age of Ultron Ring Lattice)
      if (centerMassScale > 0.2) {
        ctx.lineWidth = 1.2;
        const ringCount = 3;
        for (let r = 0; r < ringCount; r++) {
          const rRadius = sphereRadius * (0.55 + r * 0.35) * breathingFactor * centerMassScale;
          const ringRot = time * (r % 2 === 0 ? 0.4 : -0.3) + r;

          ctx.save();
          ctx.rotate(ringRot);

          // Outer tech arc
          ctx.strokeStyle = `rgba(255, 180, 0, ${0.3 * lineOpacity})`;
          ctx.setLineDash([12, 18, 4, 18]);
          ctx.beginPath();
          ctx.arc(0, 0, rRadius, 0, Math.PI * 2);
          ctx.stroke();

          // Arc segment highlights
          ctx.strokeStyle = `rgba(0, 229, 255, ${0.5 * lineOpacity})`;
          ctx.setLineDash([40, 120]);
          ctx.beginPath();
          ctx.arc(0, 0, rRadius * 1.02, 0, Math.PI * 2);
          ctx.stroke();

          ctx.restore();
        }
      }

      // 3. Draw Particle Connection Lines (Stage 1+)
      if (lineOpacity > 0.01) {
        ctx.lineWidth = 0.8;
        for (let i = 0; i < projectedPoints.length; i++) {
          const ptA = projectedPoints[i];
          const origP = particles[ptA.origIdx];

          for (const connIdx of origP.connections) {
            const ptB = projectedPoints[connIdx];

            // Compute distance in screen space
            const dx = ptA.x - ptB.x;
            const dy = ptA.y - ptB.y;
            const screenDist = Math.sqrt(dx * dx + dy * dy);

            if (screenDist < sphereRadius * 0.75) {
              const alpha = (1 - screenDist / (sphereRadius * 0.75)) * 0.35 * lineOpacity * Math.min(ptA.opacity, ptB.opacity);
              ctx.strokeStyle = `rgba(255, 170, 0, ${alpha})`;
              ctx.beginPath();
              ctx.moveTo(ptA.x, ptA.y);
              ctx.lineTo(ptB.x, ptB.y);
              ctx.stroke();
            }
          }
        }

        // Draw Center Mass Spokes (Lines extending from center nucleus to inner particles)
        if (centerMassScale > 0.3) {
          for (let i = 0; i < projectedPoints.length; i += 3) {
            const pt = projectedPoints[i];
            const distFromCenter = Math.sqrt(pt.x * pt.x + pt.y * pt.y);
            if (distFromCenter < sphereRadius * 0.8) {
              const spokeAlpha = 0.25 * lineOpacity * pt.opacity * centerMassScale;
              ctx.strokeStyle = `rgba(255, 200, 50, ${spokeAlpha})`;
              ctx.beginPath();
              ctx.moveTo(0, 0);
              ctx.lineTo(pt.x, pt.y);
              ctx.stroke();
            }
          }
        }

        // 4. Draw Traveling Light Signal Pulses along lines
        for (const pulse of linePulses) {
          pulse.progress += pulse.speed * (normalizedState === "THINKING" ? 2.5 : 1.0);
          if (pulse.progress > 1) {
            pulse.progress = 0;
            pulse.fromIdx = Math.floor(Math.random() * particles.length);
            const conns = particles[pulse.fromIdx].connections;
            if (conns.length > 0) {
              pulse.toIdx = conns[Math.floor(Math.random() * conns.length)];
            }
          }

          const ptA = projectedPoints[pulse.fromIdx];
          const ptB = projectedPoints[pulse.toIdx];
          if (ptA && ptB) {
            const px = ptA.x + (ptB.x - ptA.x) * pulse.progress;
            const py = ptA.y + (ptB.y - ptA.y) * pulse.progress;

            ctx.fillStyle = "#00E5FF";
            ctx.shadowColor = "#00E5FF";
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(px, py, 2 * ptA.scale, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        }
      }

      // 5. Draw 3D Node Particles (Stage 0+)
      for (const pt of sortedPoints) {
        const particleSize = particles[pt.origIdx].radius * pt.scale;

        // Glowing particle render
        ctx.save();
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = pt.opacity;

        // Particle shadow blur for holographic glow effect
        ctx.shadowColor = pt.color;
        ctx.shadowBlur = 10 * pt.scale;

        ctx.beginPath();
        ctx.arc(pt.x, pt.y, Math.max(0.8, particleSize), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 6. Draw Center Mass (glowing JARVIS nucleus core - Age of Ultron style)
      if (centerMassScale > 0.05) {
        const coreRadius = sphereRadius * 0.26 * breathingFactor * centerMassScale;
        const corePulse = Math.sin(time * breathFreq * 2) * 0.08 + 1.0;

        ctx.save();
        // Inner Core Radial Gradient
        const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, coreRadius * corePulse);
        coreGrad.addColorStop(0, `rgba(255, 255, 240, ${0.95 * particleOpacity})`);
        coreGrad.addColorStop(0.25, `rgba(255, 190, 40, ${0.9 * particleOpacity})`);
        coreGrad.addColorStop(0.65, `rgba(255, 120, 0, ${0.6 * particleOpacity})`);
        coreGrad.addColorStop(1, `rgba(255, 80, 0, 0)`);

        ctx.fillStyle = coreGrad;
        ctx.shadowColor = "#FFAA00";
        ctx.shadowBlur = 25 * coreGlowIntensity;

        ctx.beginPath();
        ctx.arc(0, 0, coreRadius * 1.3 * corePulse, 0, Math.PI * 2);
        ctx.fill();

        // Nucleus Ring Arc Glyphs
        ctx.strokeStyle = `rgba(255, 220, 150, ${0.8 * particleOpacity})`;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(0, 0, coreRadius * 0.7, time * 2, time * 2 + Math.PI * 1.2);
        ctx.stroke();

        ctx.strokeStyle = `rgba(0, 229, 255, ${0.7 * particleOpacity})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(0, 0, coreRadius * 0.9, -time * 1.5, -time * 1.5 + Math.PI * 0.9);
        ctx.stroke();

        ctx.restore();
      }

      // 7. Interactive Mouse Click Ripple Wave
      const clickWave = clickWaveRef.current;
      if (clickWave.active) {
        clickWave.radius += 4;
        if (clickWave.radius > clickWave.maxRadius) {
          clickWave.active = false;
        } else {
          ctx.save();
          const waveAlpha = 1 - clickWave.radius / clickWave.maxRadius;
          ctx.strokeStyle = `rgba(0, 229, 255, ${waveAlpha * 0.8})`;
          ctx.lineWidth = 2;
          ctx.shadowColor = "#00E5FF";
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(0, 0, clickWave.radius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }

      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [size, activeState]);

  // Handle Mouse Hover & Click Interactivity
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!interactive) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;

    mousePosRef.current.targetX = (x / (size / 2)) * 0.8;
    mousePosRef.current.targetY = (y / (size / 2)) * 0.8;
  };

  const handleMouseLeave = () => {
    mousePosRef.current.targetX = 0;
    mousePosRef.current.targetY = 0;
  };

  const handleClick = () => {
    clickWaveRef.current = {
      radius: 5,
      maxRadius: size * 0.45,
      active: true,
    };
  };

  return (
    <div className={`relative flex flex-col items-center justify-center ${className}`}>
      {/* Canvas Hologram Orb */}
      <div className="relative flex items-center justify-center">
        {/* Ambient Hologram Glow Backdrop */}
        <div
          className="absolute rounded-full blur-3xl opacity-40 pointer-events-none transition-all duration-700"
          style={{
            width: size * 0.7,
            height: size * 0.7,
            background:
              activeState === "THINKING" || activeState === "RESEARCHING"
                ? "radial-gradient(circle, rgba(255,140,0,0.6) 0%, rgba(255,60,0,0.2) 60%, transparent 100%)"
                : activeState === "SPEAKING" || activeState === "TALKING" || activeState === "RESPONDING"
                ? "radial-gradient(circle, rgba(255,200,0,0.7) 0%, rgba(0,229,255,0.3) 60%, transparent 100%)"
                : "radial-gradient(circle, rgba(255,170,0,0.5) 0%, rgba(255,100,0,0.15) 60%, transparent 100%)",
          }}
        />

        <canvas
          ref={canvasRef}
          width={size}
          height={size}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
          className="relative z-10 cursor-pointer touch-none drop-shadow-[0_0_25px_rgba(255,160,0,0.35)]"
        />
      </div>

      {/* Stage Badge & Status Indicator */}
      <div className="mt-2 flex items-center gap-2 rounded-full border border-amber-500/20 bg-black/40 px-3 py-1 text-xs backdrop-blur-md">
        <span
          className={`h-2 w-2 rounded-full ${
            animPhase === "ready" ? "bg-amber-400 animate-pulse" : "bg-cyan-400 animate-ping"
          }`}
        />
        <span className="font-mono text-amber-200/90 uppercase tracking-wider">
          {animPhase === "fading_particles" && "1. Incoming Particles..."}
          {animPhase === "connecting_lines" && "2. Linking Neural Lines..."}
          {animPhase === "center_mass" && "3. Fusing Core Center Mass..."}
          {animPhase === "ready" && `JARVIS CORE • BREATHING [${activeState}]`}
        </span>
      </div>

      {/* Interactive Controls Bar for User Testing / State Switching */}
      {showControls && (
        <div className="mt-4 flex flex-wrap justify-center gap-2 rounded-2xl border border-white/10 bg-black/30 p-2 text-xs backdrop-blur-md">
          <button
            onClick={triggerStartupSequence}
            className="rounded-lg bg-amber-500/20 px-3 py-1.5 font-medium text-amber-300 hover:bg-amber-500/30 transition"
          >
            Replay Startup Animation
          </button>
          <div className="h-4 w-[1px] bg-white/10 self-center" />
          <button
            onClick={() => setActiveState("IDLE")}
            className={`rounded-lg px-3 py-1.5 font-medium transition ${
              activeState === "IDLE" ? "bg-amber-500 text-slate-950 font-bold" : "text-white/70 hover:bg-white/10"
            }`}
          >
            Idle
          </button>
          <button
            onClick={() => setActiveState("LISTENING")}
            className={`rounded-lg px-3 py-1.5 font-medium transition ${
              activeState === "LISTENING" ? "bg-amber-500 text-slate-950 font-bold" : "text-white/70 hover:bg-white/10"
            }`}
          >
            Listening
          </button>
          <button
            onClick={() => setActiveState("THINKING")}
            className={`rounded-lg px-3 py-1.5 font-medium transition ${
              activeState === "THINKING" ? "bg-amber-500 text-slate-950 font-bold" : "text-white/70 hover:bg-white/10"
            }`}
          >
            Thinking
          </button>
          <button
            onClick={() => setActiveState("SPEAKING")}
            className={`rounded-lg px-3 py-1.5 font-medium transition ${
              activeState === "SPEAKING" || activeState === "RESPONDING"
                ? "bg-amber-500 text-slate-950 font-bold"
                : "text-white/70 hover:bg-white/10"
            }`}
          >
            Speaking / Talking
          </button>
        </div>
      )}
    </div>
  );
}
