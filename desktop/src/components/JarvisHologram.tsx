import { useEffect, useRef, type MouseEvent } from "react";
import type { AssistantState } from "../types";

interface JarvisHologramProps {
  state?: AssistantState | string;
  size?: number;
  className?: string;
  showControls?: boolean;
  interactive?: boolean;
}

interface NeuralPoint {
  x: number;
  y: number;
  z: number;
  phase: number;
  links: number[];
}

interface ProjectedPoint {
  x: number;
  y: number;
  z: number;
}

function buildNeuralMesh(size: number): NeuralPoint[] {
  const points: NeuralPoint[] = [];
  const hemisphereCount = 56;
  const width = size * 0.28;
  const height = size * 0.29;

  for (const side of [-1, 1]) {
    for (let index = 0; index < hemisphereCount; index += 1) {
      const angle = (index / hemisphereCount) * Math.PI * 2.2;
      const radial = 0.4 + ((index * 31) % 47) / 100;
      points.push({
        x: side * (size * 0.04 + Math.abs(Math.cos(angle)) * width * radial),
        y: Math.sin(angle) * height * radial + Math.sin(index * 2.1) * size * 0.025,
        z: Math.cos(index * 1.7) * size * 0.11,
        phase: index * 0.83 + side,
        links: [],
      });
    }
  }

  for (let index = 0; index < 18; index += 1) {
    points.push({
      x: Math.sin(index * 2.7) * size * 0.06,
      y: (index / 17 - 0.5) * size * 0.44,
      z: Math.cos(index * 1.4) * size * 0.08,
      phase: index * 1.31,
      links: [],
    });
  }

  for (let index = 0; index < points.length; index += 1) {
    const candidates = points
      .map((point, candidateIndex) => {
        if (candidateIndex === index) return { candidateIndex, distance: Number.POSITIVE_INFINITY };
        const dx = points[index].x - point.x;
        const dy = points[index].y - point.y;
        const dz = points[index].z - point.z;
        return { candidateIndex, distance: dx * dx + dy * dy + dz * dz };
      })
      .sort((left, right) => left.distance - right.distance)
      .slice(0, 3);
    points[index].links = candidates.map((candidate) => candidate.candidateIndex);
  }
  return points;
}

export function JarvisHologram({
  state = "IDLE",
  size = 460,
  className = "",
  interactive = false,
}: JarvisHologramProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });
  const yellowMixRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const mesh = buildNeuralMesh(size);
    const center = size / 2;
    const stateName = state.toUpperCase();
    const isProcessing = stateName === "THINKING" || stateName === "RESEARCHING" || stateName === "EXECUTING";
    const isSpeaking = stateName === "SPEAKING";
    const isListening = stateName === "LISTENING";
    const activity = isProcessing ? 2.5 : isSpeaking ? 1.8 : isListening ? 1.3 : 1.0;

    let frame = 0;

    const render = (timestamp: number) => {
      const time = timestamp / 1000;
      const pointer = pointerRef.current;
      pointer.x += (pointer.targetX - pointer.x) * 0.04;
      pointer.y += (pointer.targetY - pointer.y) * 0.04;

      // Smooth color mix transition: 0 = Blue/Cyan, 1 = Yellow/Gold (Mind Stone / Ultron Infusion)
      const targetYellow = isProcessing ? 1.0 : 0.0;
      yellowMixRef.current += (targetYellow - yellowMixRef.current) * 0.05;
      const yMix = yellowMixRef.current;

      const angle = time * 0.18 * activity + pointer.x * 0.35;
      const tilt = Math.sin(time * 0.28) * 0.14 + pointer.y * 0.2;
      const cosAngle = Math.cos(angle);
      const sinAngle = Math.sin(angle);
      const cosTilt = Math.cos(tilt);
      const sinTilt = Math.sin(tilt);
      const pulse = 1 + Math.sin(time * 2.4 * activity) * (0.05 + yMix * 0.04);

      context.clearRect(0, 0, size, size);
      context.save();
      context.translate(center, center);

      // Ambient background glow
      const ambient = context.createRadialGradient(0, 0, size * 0.04, 0, 0, size * 0.48);
      const rAmb = Math.round(70 + yMix * 185);
      const gAmb = Math.round(185 + yMix * 10);
      const bAmb = Math.round(255 - yMix * 200);
      ambient.addColorStop(0, `rgba(${rAmb}, ${gAmb}, ${bAmb}, ${0.22 + yMix * 0.1})`);
      ambient.addColorStop(0.45, `rgba(${Math.round(18 + yMix * 160)}, ${Math.round(85 + yMix * 60)}, ${Math.round(180 - yMix * 140)}, 0.12)`);
      ambient.addColorStop(1, "rgba(0, 10, 35, 0)");
      context.fillStyle = ambient;
      context.fillRect(-center, -center, size, size);

      // 3D Point Projection
      const projected: ProjectedPoint[] = mesh.map((point) => {
        const wave = Math.sin(time * activity * 1.5 + point.phase) * size * (0.007 + yMix * 0.005);
        const x1 = (point.x + wave) * cosAngle - point.z * sinAngle;
        const z1 = (point.x + wave) * sinAngle + point.z * cosAngle;
        const y1 = point.y * cosTilt - z1 * sinTilt;
        const z2 = point.y * sinTilt + z1 * cosTilt;
        const scale = 440 / (440 + z2);
        return { x: x1 * scale * pulse, y: y1 * scale * pulse, z: z2 };
      });

      // Render Neural Mesh Wireframe Links
      context.lineCap = "round";
      const rLine = Math.round(89 + yMix * 166);
      const gLine = Math.round(203 + yMix * 2);
      const bLine = Math.round(255 - yMix * 195);

      const rSig = Math.round(182 + yMix * 73);
      const gSig = Math.round(239 - yMix * 20);
      const bSig = Math.round(255 - yMix * 175);

      for (let index = 0; index < mesh.length; index += 1) {
        const source = projected[index];
        for (const link of mesh[index].links) {
          if (link <= index) continue;
          const target = projected[link];
          const depth = Math.max(0.12, Math.min(0.85, 0.42 + (source.z + target.z) / size));
          context.strokeStyle = `rgba(${rLine}, ${gLine}, ${bLine}, ${depth * (0.48 + yMix * 0.2)})`;
          context.lineWidth = 0.7 + depth * 0.95;
          context.beginPath();
          context.moveTo(source.x, source.y);
          context.lineTo(target.x, target.y);
          context.stroke();

          // Firing Signal Pulses across neural links
          const progress = (time * (0.18 + activity * 0.1) + (index + link) * 0.037) % 1;
          const signalX = source.x + (target.x - source.x) * progress;
          const signalY = source.y + (target.y - source.y) * progress;
          const directionX = target.x - source.x;
          const directionY = target.y - source.y;
          const length = Math.hypot(directionX, directionY) || 1;

          context.strokeStyle = `rgba(${rSig}, ${gSig}, ${bSig}, 0.95)`;
          context.lineWidth = 1.8 + yMix * 0.8;
          context.beginPath();
          context.moveTo(signalX - (directionX / length) * 3.5, signalY - (directionY / length) * 3.5);
          context.lineTo(signalX + (directionX / length) * 3.5, signalY + (directionY / length) * 3.5);
          context.stroke();
        }

        // Render Point Nodes
        const nodeSize = (1.5 + ((source.z + size * 0.2) / size) * 2.2) * (1 + yMix * 0.3);
        context.fillStyle = `rgba(${rSig}, ${gSig}, ${bSig}, 0.9)`;
        context.beginPath();
        context.arc(source.x, source.y, nodeSize, 0, Math.PI * 2);
        context.fill();
      }

      // Outer Energy Rings for Listening/Speaking/Thinking
      if (isListening || isSpeaking || isProcessing) {
        const ringRadius = size * 0.36 * (1 + Math.sin(time * 3) * 0.03);
        context.strokeStyle = `rgba(${rLine}, ${gLine}, ${bLine}, ${0.15 + yMix * 0.15})`;
        context.lineWidth = 1.2;
        context.beginPath();
        context.arc(0, 0, ringRadius, 0, Math.PI * 2);
        context.stroke();
      }

      // Central Brain AI Core Gradient
      const coreRadius = size * 0.11 * pulse;
      const core = context.createRadialGradient(0, 0, 0, 0, 0, coreRadius * 3);
      const rCore = Math.round(125 + yMix * 130);
      const gCore = Math.round(218 - yMix * 33);
      const bCore = Math.round(255 - yMix * 210);

      core.addColorStop(0, yMix > 0.4 ? "rgba(255, 253, 230, 1)" : "rgba(236, 252, 255, 1)");
      core.addColorStop(0.18, `rgba(${rCore}, ${gCore}, ${bCore}, 0.95)`);
      core.addColorStop(0.5, `rgba(${Math.round(30 + yMix * 190)}, ${Math.round(123 + yMix * 30)}, ${Math.round(255 - yMix * 240)}, 0.6)`);
      core.addColorStop(1, "rgba(5, 15, 60, 0)");

      context.fillStyle = core;
      context.beginPath();
      context.arc(0, 0, coreRadius * 3, 0, Math.PI * 2);
      context.fill();

      context.restore();
      frame = window.requestAnimationFrame(render);
    };

    frame = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(frame);
  }, [size, state]);

  const handlePointerMove = (event: MouseEvent<HTMLCanvasElement>) => {
    if (!interactive) return;
    const rect = event.currentTarget.getBoundingClientRect();
    pointerRef.current.targetX = (event.clientX - rect.left - rect.width / 2) / rect.width;
    pointerRef.current.targetY = (event.clientY - rect.top - rect.height / 2) / rect.height;
  };

  return (
    <div className={`relative flex h-full w-full items-center justify-center ${className}`}>
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        onMouseMove={interactive ? handlePointerMove : undefined}
        onMouseLeave={interactive ? () => { pointerRef.current.targetX = 0; pointerRef.current.targetY = 0; } : undefined}
        className={interactive ? "cursor-crosshair" : "pointer-events-none"}
      />
    </div>
  );
}
