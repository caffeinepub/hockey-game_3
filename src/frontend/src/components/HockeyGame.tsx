import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAddScore, useTopScores } from "@/hooks/useQueries";
import { Canvas, useFrame } from "@react-three/fiber";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";

// ─── Types ───────────────────────────────────────────────────────────────────

type GamePhase = "start" | "playing" | "goal" | "roundover" | "gameover";

interface CharacterStats {
  speedMult: number;
  shotMult: number;
  checkMult: number;
  damageReduction: number;
  checkCooldownMult: number;
  checkRangeMult: number;
  pickupMult: number;
  stealMult: number;
  shootCooldown: number;
  puckBoost: boolean;
  abilityTag: string;
  abilityDesc: string;
}

interface ConfettiParticle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  spin: number;
  color: string;
  life: number;
  size: number;
}

interface PhysicsState {
  x: number;
  z: number;
  vx: number;
  vz: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const P1_COLOR = "#ff3a2d";
const P2_COLOR = "#3d7fff";
const NEON_CYAN = "#00e5ff";
const WINS_TO_WIN = 7;
const ROUNDS_TO_WIN_MATCH = 3;
const GOAL_CELEBRATE_MS = 2200;
const PLAYER_SPEED = 8;
const CHECK_COOLDOWN_MS = 1200;
const CHECK_RANGE = 2.0;
const CHECK_KNOCKBACK = 12;
const CHECK_STUN_MS = 700;
const PICKUP_DIST = 1.1;
const STEAL_DIST = 1.0;
const SHOOT_SPEED = 16;
const CARRY_OFFSET = 0.8;

// ─── Character Roster ─────────────────────────────────────────────────────────

const CHARACTER_ROSTER: Array<{
  fakeName: string;
  jerseyNumber: string;
  helmetAccent: string;
  stats: CharacterStats;
}> = [
  {
    fakeName: "IRON MIKE BLAZE",
    jerseyNumber: "07",
    helmetAccent: "#ff9900",
    stats: {
      speedMult: 1,
      shotMult: 1,
      checkMult: 1.5,
      damageReduction: 1,
      checkCooldownMult: 0.6,
      checkRangeMult: 1.2,
      pickupMult: 1,
      stealMult: 1,
      shootCooldown: 400,
      puckBoost: false,
      abilityTag: "ENFORCER",
      abilityDesc: "Harder checks, faster cooldown, longer reach",
    },
  },
  {
    fakeName: "SLAP SHOT KOWALSKI",
    jerseyNumber: "14",
    helmetAccent: "#cc44ff",
    stats: {
      speedMult: 1,
      shotMult: 1.4,
      checkMult: 1,
      damageReduction: 1,
      checkCooldownMult: 1,
      checkRangeMult: 1,
      pickupMult: 1,
      stealMult: 1,
      shootCooldown: 200,
      puckBoost: false,
      abilityTag: "SNIPER",
      abilityDesc: "Blazing shot speed, quick re-pickup after shooting",
    },
  },
  {
    fakeName: "THE HAWK NOVAK",
    jerseyNumber: "23",
    helmetAccent: "#00ffaa",
    stats: {
      speedMult: 1.35,
      shotMult: 1,
      checkMult: 1,
      damageReduction: 1,
      checkCooldownMult: 1,
      checkRangeMult: 1,
      pickupMult: 1,
      stealMult: 1.4,
      shootCooldown: 400,
      puckBoost: false,
      abilityTag: "SPEEDSTER",
      abilityDesc: "Faster skater, wider steal range",
    },
  },
  {
    fakeName: "BIG ICE DROZD",
    jerseyNumber: "31",
    helmetAccent: "#ffee00",
    stats: {
      speedMult: 0.8,
      shotMult: 1.2,
      checkMult: 1,
      damageReduction: 0.5,
      checkCooldownMult: 1,
      checkRangeMult: 1,
      pickupMult: 1,
      stealMult: 1,
      shootCooldown: 400,
      puckBoost: false,
      abilityTag: "TANK",
      abilityDesc: "Slow but powerful shot, takes half knockback",
    },
  },
  {
    fakeName: "CAPTAIN FREEZE",
    jerseyNumber: "99",
    helmetAccent: "#ff4488",
    stats: {
      speedMult: 1,
      shotMult: 1,
      checkMult: 1,
      damageReduction: 1,
      checkCooldownMult: 1,
      checkRangeMult: 1,
      pickupMult: 1.5,
      stealMult: 1.5,
      shootCooldown: 400,
      puckBoost: true,
      abilityTag: "ICE KING",
      abilityDesc: "Huge pickup range, puck gets speed burst on release",
    },
  },
  {
    fakeName: "ROCKET VASQUEZ",
    jerseyNumber: "08",
    helmetAccent: "#ff0066",
    stats: {
      speedMult: 1.5,
      shotMult: 0.9,
      checkMult: 0.8,
      damageReduction: 1,
      checkCooldownMult: 1,
      checkRangeMult: 0.8,
      pickupMult: 1.2,
      stealMult: 1.3,
      shootCooldown: 400,
      puckBoost: false,
      abilityTag: "ROCKET",
      abilityDesc: "Blazing speed, wide pickup and steal range",
    },
  },
  {
    fakeName: "THUNDER KORHONEN",
    jerseyNumber: "44",
    helmetAccent: "#ff6600",
    stats: {
      speedMult: 0.9,
      shotMult: 1.6,
      checkMult: 0.9,
      damageReduction: 0.8,
      checkCooldownMult: 1,
      checkRangeMult: 1,
      pickupMult: 1,
      stealMult: 1,
      shootCooldown: 300,
      puckBoost: false,
      abilityTag: "CANNON",
      abilityDesc: "Thunderous shot power, reduced incoming knockback",
    },
  },
  {
    fakeName: "GHOST PETROV",
    jerseyNumber: "11",
    helmetAccent: "#aaffee",
    stats: {
      speedMult: 1.2,
      shotMult: 1,
      checkMult: 0.7,
      damageReduction: 0.6,
      checkCooldownMult: 1,
      checkRangeMult: 1,
      pickupMult: 1.3,
      stealMult: 1.6,
      shootCooldown: 200,
      puckBoost: false,
      abilityTag: "GHOST",
      abilityDesc: "Elusive skater, absorbs half knockback, quick steal",
    },
  },
  {
    fakeName: "BRICK MALONE",
    jerseyNumber: "55",
    helmetAccent: "#886600",
    stats: {
      speedMult: 0.75,
      shotMult: 1.1,
      checkMult: 2.0,
      damageReduction: 0.3,
      checkCooldownMult: 0.5,
      checkRangeMult: 1.5,
      shootCooldown: 400,
      puckBoost: false,
      pickupMult: 0.9,
      stealMult: 0.9,
      abilityTag: "WRECKING BALL",
      abilityDesc: "Massive check power and range, takes minimal knockback",
    },
  },
  {
    fakeName: "ACE STROMBERG",
    jerseyNumber: "77",
    helmetAccent: "#00ccff",
    stats: {
      speedMult: 1.1,
      shotMult: 1.1,
      checkMult: 1,
      damageReduction: 0.9,
      checkCooldownMult: 0.9,
      checkRangeMult: 1.1,
      pickupMult: 1.1,
      stealMult: 1.1,
      shootCooldown: 300,
      puckBoost: false,
      abilityTag: "ALL-STAR",
      abilityDesc: "Balanced elite stats across the board",
    },
  },
];

// ─── Audio ────────────────────────────────────────────────────────────────────

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    )();
  }
  return audioCtx;
}

function playBeep(
  freq: number,
  duration: number,
  gain = 0.3,
  type: OscillatorType = "sine",
) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gainNode.gain.setValueAtTime(gain, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.001,
      ctx.currentTime + duration,
    );
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch {
    // Audio not supported or blocked
  }
}

function playWallHit() {
  playBeep(660, 0.08, 0.2, "square");
}

function playPaddleHit() {
  playBeep(440, 0.12, 0.35, "triangle");
  setTimeout(() => playBeep(550, 0.08, 0.2, "triangle"), 40);
}

function playBodyCheck() {
  playBeep(120, 0.15, 0.6, "sawtooth");
  setTimeout(() => playBeep(80, 0.25, 0.5, "sawtooth"), 60);
}

function playGoal() {
  const notes = [523, 659, 784, 1047];
  notes.forEach((freq, i) => {
    setTimeout(() => playBeep(freq, 0.4, 0.4, "sine"), i * 120);
  });
  setTimeout(() => playBeep(1047, 0.8, 0.5, "sine"), 500);
}

// ─── 3D Rink Components ───────────────────────────────────────────────────────

function CenterLine() {
  return (
    <mesh position={[0, 0.06, 0]} receiveShadow>
      <boxGeometry args={[0.12, 0.01, 16]} />
      <meshStandardMaterial
        color="#cc2222"
        emissive="#cc2222"
        emissiveIntensity={0.8}
      />
    </mesh>
  );
}

function BlueLines() {
  return (
    <>
      <mesh position={[-4, 0.06, 0]} receiveShadow>
        <boxGeometry args={[0.12, 0.01, 16]} />
        <meshStandardMaterial
          color="#2244cc"
          emissive="#2244cc"
          emissiveIntensity={0.6}
        />
      </mesh>
      <mesh position={[4, 0.06, 0]} receiveShadow>
        <boxGeometry args={[0.12, 0.01, 16]} />
        <meshStandardMaterial
          color="#2244cc"
          emissive="#2244cc"
          emissiveIntensity={0.6}
        />
      </mesh>
    </>
  );
}

function GoalCrease({ side }: { side: "left" | "right" }) {
  const x = side === "left" ? -11.8 : 11.8;
  const color = side === "left" ? "#ff3a2d" : "#3d7fff";
  const segments = 16;
  const radius = 1.8;

  const shape = useMemo(() => {
    const s = new THREE.Shape();
    const startAngle = side === "left" ? -Math.PI / 2 : Math.PI / 2;
    const endAngle = side === "left" ? Math.PI / 2 : (3 * Math.PI) / 2;
    s.moveTo(0, 0);
    for (let i = 0; i <= segments; i++) {
      const a = startAngle + ((endAngle - startAngle) * i) / segments;
      s.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
    }
    s.closePath();
    return s;
  }, [side]);

  return (
    <mesh position={[x, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={0.15}
        depthWrite={false}
      />
    </mesh>
  );
}

function CenterCircle() {
  return (
    <mesh position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <torusGeometry args={[2.2, 0.07, 8, 64]} />
      <meshStandardMaterial
        color="#cc2222"
        emissive="#cc2222"
        emissiveIntensity={0.5}
      />
    </mesh>
  );
}

function FaceOffCircles() {
  const positions: [number, number][] = [
    [-6, -4],
    [-6, 4],
    [6, -4],
    [6, 4],
  ];
  return (
    <>
      {positions.map(([x, z]) => (
        <mesh
          key={`${x}-${z}`}
          position={[x, 0.07, z]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <torusGeometry args={[1.1, 0.05, 8, 32]} />
          <meshStandardMaterial
            color="#cc2222"
            emissive="#cc2222"
            emissiveIntensity={0.3}
            transparent
            opacity={0.6}
          />
        </mesh>
      ))}
    </>
  );
}

function GoalNet({ side }: { side: "left" | "right" }) {
  const dir = side === "left" ? -1 : 1;
  const baseX = side === "left" ? -13 : 13;
  const color = side === "left" ? "#ff3a2d" : "#3d7fff";

  return (
    <group>
      <mesh position={[baseX, 0.9, 0]} castShadow>
        <boxGeometry args={[0.1, 0.1, 3.0]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.7}
        />
      </mesh>
      <mesh position={[baseX, 0.5, -1.5]} castShadow>
        <boxGeometry args={[0.1, 1.0, 0.1]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.7}
        />
      </mesh>
      <mesh position={[baseX, 0.5, 1.5]} castShadow>
        <boxGeometry args={[0.1, 1.0, 0.1]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.7}
        />
      </mesh>
      <mesh position={[baseX + dir * 1.0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.1, 1.0, 3.0]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.3}
          transparent
          opacity={0.4}
        />
      </mesh>
      <mesh position={[baseX + dir * 0.5, 0.5, 0]}>
        <boxGeometry args={[1.0, 1.0, 3.0]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={0.08}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[baseX, 0.06, 0]} receiveShadow>
        <boxGeometry args={[0.08, 0.01, 3.2]} />
        <meshStandardMaterial
          color="rgba(255,255,255,0.6)"
          emissive="#ffffff"
          emissiveIntensity={0.3}
        />
      </mesh>
    </group>
  );
}

function Boards() {
  const boardMat = (
    <meshStandardMaterial
      color="#00e5ff"
      emissive="#00e5ff"
      emissiveIntensity={0.4}
      roughness={0.4}
      metalness={0.3}
    />
  );

  return (
    <group>
      <mesh position={[0, 0.2, -8.1]}>
        <boxGeometry args={[28, 0.4, 0.2]} />
        {boardMat}
      </mesh>
      <mesh position={[0, 0.2, 8.1]}>
        <boxGeometry args={[28, 0.4, 0.2]} />
        {boardMat}
      </mesh>
      <mesh position={[-13.4, 0.2, 0]}>
        <boxGeometry args={[0.2, 0.4, 16.4]} />
        {boardMat}
      </mesh>
      <mesh position={[13.4, 0.2, 0]}>
        <boxGeometry args={[0.2, 0.4, 16.4]} />
        {boardMat}
      </mesh>
    </group>
  );
}

function IceSurface() {
  return (
    <mesh position={[0, 0, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[26, 16]} />
      <meshStandardMaterial
        color="#b8d4f0"
        roughness={0.85}
        metalness={0.0}
        emissive="#0a1d3c"
        emissiveIntensity={0.35}
      />
    </mesh>
  );
}

// ─── Player Mesh ──────────────────────────────────────────────────────────────

const PlayerMesh = React.forwardRef<
  THREE.Group,
  {
    color: string;
    isP1: boolean;
    helmetAccent: string;
    jerseyNumber: string;
    isActive?: boolean;
    teamColor?: string;
  }
>(({ color, isP1, helmetAccent, isActive = false, teamColor }, ref) => {
  return (
    <group ref={ref}>
      {/* Active glow ring on ice */}
      {isActive && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.7, 0.08, 6, 32]} />
          <meshStandardMaterial
            color={teamColor ?? color}
            emissive={teamColor ?? color}
            emissiveIntensity={2}
            transparent
            opacity={0.8}
          />
        </mesh>
      )}

      {/* Shadow on ice */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.55, 16]} />
        <meshBasicMaterial
          color="#000000"
          transparent
          opacity={isActive ? 0.5 : 0.3}
          depthWrite={false}
        />
      </mesh>

      {/* Body */}
      <mesh position={[0, 0.95, 0]} castShadow>
        <capsuleGeometry args={[0.45, 1.0, 4, 8]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isActive ? 0.6 : 0.25}
          roughness={0.4}
          metalness={0.2}
        />
      </mesh>

      {/* Head */}
      <mesh position={[0, 1.7, 0]} castShadow>
        <sphereGeometry args={[0.42, 12, 12]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isActive ? 0.4 : 0.2}
          roughness={0.5}
        />
      </mesh>

      {/* Helmet accent band */}
      <mesh position={[0, 1.72, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.43, 0.055, 6, 20]} />
        <meshStandardMaterial
          color={helmetAccent}
          emissive={helmetAccent}
          emissiveIntensity={isActive ? 1.5 : 0.8}
          roughness={0.2}
          metalness={0.4}
        />
      </mesh>

      {/* Helmet visor */}
      <mesh position={[0, 1.78, 0.32]}>
        <sphereGeometry args={[0.28, 8, 8, 0, Math.PI, 0, Math.PI / 2]} />
        <meshStandardMaterial
          color="#aaddff"
          transparent
          opacity={0.5}
          roughness={0.1}
          metalness={0.4}
        />
      </mesh>

      {/* Jersey number plate */}
      <mesh position={[0, 0.95, 0.47]}>
        <boxGeometry args={[0.5, 0.5, 0.02]} />
        <meshStandardMaterial
          color={helmetAccent}
          emissive={helmetAccent}
          emissiveIntensity={0.6}
        />
      </mesh>

      {/* Stick */}
      <mesh
        position={[isP1 ? 0.5 : -0.5, 0.5, 0.3]}
        rotation={[0.1, isP1 ? -0.4 : 0.4, isP1 ? 0.3 : -0.3]}
        castShadow
      >
        <boxGeometry args={[0.07, 0.07, 1.1]} />
        <meshStandardMaterial color="#c8a06e" roughness={0.8} />
      </mesh>

      {/* Skates */}
      <mesh position={[-0.18, 0.07, 0]} castShadow>
        <boxGeometry args={[0.2, 0.12, 0.6]} />
        <meshStandardMaterial color="#222222" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[0.18, 0.07, 0]} castShadow>
        <boxGeometry args={[0.2, 0.12, 0.6]} />
        <meshStandardMaterial color="#222222" metalness={0.6} roughness={0.3} />
      </mesh>
    </group>
  );
});
PlayerMesh.displayName = "PlayerMesh";

// ─── Goalie Mesh ─────────────────────────────────────────────────────────────

const GoalieMesh = React.forwardRef<
  THREE.Group,
  {
    color: string;
    helmetAccent: string;
    isP1: boolean;
  }
>(({ color, helmetAccent, isP1 }, ref) => {
  return (
    <group ref={ref}>
      {/* Shadow on ice */}
      <mesh
        position={[0, 0.01, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[1.4, 1.0, 1]}
      >
        <circleGeometry args={[0.55, 16]} />
        <meshBasicMaterial
          color="#000000"
          transparent
          opacity={0.35}
          depthWrite={false}
        />
      </mesh>

      {/* Goalie crease glow ring */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.85, 0.07, 6, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={1.2}
          transparent
          opacity={0.6}
        />
      </mesh>

      {/* Body — wider/squatter than player */}
      <mesh position={[0, 0.85, 0]} castShadow>
        <capsuleGeometry args={[0.55, 0.7, 4, 8]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.4}
          roughness={0.3}
          metalness={0.25}
        />
      </mesh>

      {/* Chest protector (wider box over body) */}
      <mesh position={[0, 1.0, 0.1]} castShadow>
        <boxGeometry args={[1.1, 0.7, 0.2]} />
        <meshStandardMaterial
          color={helmetAccent}
          emissive={helmetAccent}
          emissiveIntensity={0.5}
          roughness={0.4}
          metalness={0.3}
        />
      </mesh>

      {/* Head */}
      <mesh position={[0, 1.65, 0]} castShadow>
        <sphereGeometry args={[0.44, 12, 12]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.35}
          roughness={0.4}
        />
      </mesh>

      {/* Goalie mask — cage front */}
      <mesh position={[0, 1.68, 0.38]}>
        <boxGeometry args={[0.7, 0.55, 0.08]} />
        <meshStandardMaterial
          color={helmetAccent}
          emissive={helmetAccent}
          emissiveIntensity={0.6}
          roughness={0.3}
          metalness={0.5}
        />
      </mesh>

      {/* Helmet accent band */}
      <mesh position={[0, 1.7, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.45, 0.06, 6, 20]} />
        <meshStandardMaterial
          color={helmetAccent}
          emissive={helmetAccent}
          emissiveIntensity={1.2}
          roughness={0.2}
          metalness={0.4}
        />
      </mesh>

      {/* Left leg pad — wide flat box */}
      <mesh position={[-0.28, 0.35, 0.1]} castShadow>
        <boxGeometry args={[0.45, 0.65, 0.22]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.3}
          roughness={0.5}
          metalness={0.1}
        />
      </mesh>

      {/* Right leg pad — wide flat box */}
      <mesh position={[0.28, 0.35, 0.1]} castShadow>
        <boxGeometry args={[0.45, 0.65, 0.22]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.3}
          roughness={0.5}
          metalness={0.1}
        />
      </mesh>

      {/* Pad stripes on leg pads */}
      <mesh position={[-0.28, 0.45, 0.22]}>
        <boxGeometry args={[0.42, 0.08, 0.02]} />
        <meshStandardMaterial
          color={helmetAccent}
          emissive={helmetAccent}
          emissiveIntensity={0.8}
        />
      </mesh>
      <mesh position={[0.28, 0.45, 0.22]}>
        <boxGeometry args={[0.42, 0.08, 0.02]} />
        <meshStandardMaterial
          color={helmetAccent}
          emissive={helmetAccent}
          emissiveIntensity={0.8}
        />
      </mesh>

      {/* Blocker pad on catching arm (opposite to stick side) */}
      <mesh
        position={[isP1 ? -0.65 : 0.65, 0.85, 0.15]}
        rotation={[0.1, 0, isP1 ? -0.15 : 0.15]}
        castShadow
      >
        <boxGeometry args={[0.18, 0.55, 0.5]} />
        <meshStandardMaterial
          color={helmetAccent}
          emissive={helmetAccent}
          emissiveIntensity={0.45}
          roughness={0.4}
          metalness={0.3}
        />
      </mesh>

      {/* Goalie stick */}
      <mesh
        position={[isP1 ? 0.55 : -0.55, 0.45, 0.3]}
        rotation={[0.15, isP1 ? -0.3 : 0.3, isP1 ? 0.4 : -0.4]}
        castShadow
      >
        <boxGeometry args={[0.09, 0.09, 1.3]} />
        <meshStandardMaterial color="#c8a06e" roughness={0.8} />
      </mesh>

      {/* Skates */}
      <mesh position={[-0.22, 0.06, 0]} castShadow>
        <boxGeometry args={[0.25, 0.1, 0.65]} />
        <meshStandardMaterial color="#111111" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0.22, 0.06, 0]} castShadow>
        <boxGeometry args={[0.25, 0.1, 0.65]} />
        <meshStandardMaterial color="#111111" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* GK badge on chest */}
      <mesh position={[0, 0.95, 0.51]}>
        <boxGeometry args={[0.3, 0.2, 0.01]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#ffffff"
          emissiveIntensity={0.4}
        />
      </mesh>
    </group>
  );
});
GoalieMesh.displayName = "GoalieMesh";

// ─── Puck Mesh ────────────────────────────────────────────────────────────────

const PuckMesh = React.forwardRef<
  THREE.Group,
  { possessionColor?: string | null }
>(({ possessionColor }, ref) => {
  const puckMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const ringMatRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(() => {
    if (puckMatRef.current) {
      if (possessionColor) {
        puckMatRef.current.emissive.set(possessionColor);
        puckMatRef.current.emissiveIntensity = 1.2;
      } else {
        puckMatRef.current.emissive.set("#ffffcc");
        puckMatRef.current.emissiveIntensity = 0.3;
      }
    }
    if (ringMatRef.current) {
      ringMatRef.current.opacity = possessionColor ? 0.85 : 0;
    }
  });

  return (
    <group ref={ref}>
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.5, 16]} />
        <meshBasicMaterial
          color="#000000"
          transparent
          opacity={0.45}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.65, 0.07, 6, 28]} />
        <meshStandardMaterial
          ref={ringMatRef}
          color={possessionColor ?? "#ffffff"}
          emissive={possessionColor ?? "#ffffff"}
          emissiveIntensity={1.5}
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 0.15, 0]} castShadow>
        <cylinderGeometry args={[0.4, 0.4, 0.15, 24]} />
        <meshStandardMaterial
          ref={puckMatRef}
          color="#222222"
          emissive="#ffffcc"
          emissiveIntensity={0.3}
          roughness={0.3}
          metalness={0.5}
        />
      </mesh>
    </group>
  );
});
PuckMesh.displayName = "PuckMesh";

// ─── Game Scene (R3F) ─────────────────────────────────────────────────────────

interface PossessionState {
  team: 1 | 2 | null;
  skaterIdx: number;
}

type CpuDifficulty = "easy" | "medium" | "hard";

interface GameSceneProps {
  running: boolean;
  onGoal: (scorer: 1 | 2) => void;
  onResetPositions: (resetFn: () => void) => void;
  onPossessionChange: (team: 1 | 2 | null, skaterIdx: number) => void;
  onBodyCheck: (checker: 1 | 2, skaterName: string) => void;
  p1Characters: [number, number, number];
  p2Characters: [number, number, number];
  p1ActiveIdx: number;
  p2ActiveIdx: number;
  onP1ActiveChange: (idx: number) => void;
  onP2ActiveChange: (idx: number) => void;
  cpuEnabled: boolean;
  cpuDifficulty: CpuDifficulty;
}

function makeSkaterState(x: number, z: number): PhysicsState {
  return { x, z, vx: 0, vz: 0 };
}

function GameScene({
  running,
  onGoal,
  onResetPositions,
  onPossessionChange,
  onBodyCheck,
  p1Characters,
  p2Characters,
  p1ActiveIdx,
  p2ActiveIdx,
  onP1ActiveChange,
  onP2ActiveChange,
  cpuEnabled,
  cpuDifficulty,
}: GameSceneProps) {
  const puck = useRef<PhysicsState>({ x: 0, z: 0, vx: 0, vz: 0 });

  // 3 skaters per team
  const p1s = useRef<[PhysicsState, PhysicsState, PhysicsState]>([
    makeSkaterState(-9, -2.5),
    makeSkaterState(-9, 0),
    makeSkaterState(-9, 2.5),
  ]);
  const p2s = useRef<[PhysicsState, PhysicsState, PhysicsState]>([
    makeSkaterState(9, -2.5),
    makeSkaterState(9, 0),
    makeSkaterState(9, 2.5),
  ]);

  const p1MeshRefs = useRef<
    [THREE.Group | null, THREE.Group | null, THREE.Group | null]
  >([null, null, null]);
  const p2MeshRefs = useRef<
    [THREE.Group | null, THREE.Group | null, THREE.Group | null]
  >([null, null, null]);
  const puckMeshRef = useRef<THREE.Group>(null);

  // Goalie physics state (x is fixed, only z moves)
  const p1Goalie = useRef<{ x: number; z: number }>({ x: -12.8, z: 0 });
  const p2Goalie = useRef<{ x: number; z: number }>({ x: 12.8, z: 0 });
  const p1GoalieMeshRef = useRef<THREE.Group>(null);
  const p2GoalieMeshRef = useRef<THREE.Group>(null);

  const keysRef = useRef<Set<string>>(new Set());
  const goalCooldownRef = useRef(false);

  // Possession: which team + which skater index has the puck
  const possessionRef = useRef<PossessionState>({ team: null, skaterIdx: 0 });

  // Shoot cooldowns per skater per team [s0, s1, s2]
  const p1ShootCooldowns = useRef<[number, number, number]>([0, 0, 0]);
  const p2ShootCooldowns = useRef<[number, number, number]>([0, 0, 0]);

  // Facing directions per skater
  const p1Facings = useRef<
    [
      { dx: number; dz: number },
      { dx: number; dz: number },
      { dx: number; dz: number },
    ]
  >([
    { dx: 1, dz: 0 },
    { dx: 1, dz: 0 },
    { dx: 1, dz: 0 },
  ]);
  const p2Facings = useRef<
    [
      { dx: number; dz: number },
      { dx: number; dz: number },
      { dx: number; dz: number },
    ]
  >([
    { dx: -1, dz: 0 },
    { dx: -1, dz: 0 },
    { dx: -1, dz: 0 },
  ]);

  // Check cooldowns per skater
  const p1CheckCooldowns = useRef<[number, number, number]>([0, 0, 0]);
  const p2CheckCooldowns = useRef<[number, number, number]>([0, 0, 0]);

  // Stun timers and knockback per skater
  const p1StunUntil = useRef<[number, number, number]>([0, 0, 0]);
  const p2StunUntil = useRef<[number, number, number]>([0, 0, 0]);
  const p1Knockbacks = useRef<
    [
      { vx: number; vz: number },
      { vx: number; vz: number },
      { vx: number; vz: number },
    ]
  >([
    { vx: 0, vz: 0 },
    { vx: 0, vz: 0 },
    { vx: 0, vz: 0 },
  ]);
  const p2Knockbacks = useRef<
    [
      { vx: number; vz: number },
      { vx: number; vz: number },
      { vx: number; vz: number },
    ]
  >([
    { vx: 0, vz: 0 },
    { vx: 0, vz: 0 },
    { vx: 0, vz: 0 },
  ]);

  // Skater switch debounce
  const p1SwitchDebounce = useRef(0);
  const p2SwitchDebounce = useRef(0);

  // CPU debounce refs
  const cpuSwitchDebounce = useRef(0);
  const cpuShootDebounce = useRef(0);
  const cpuCheckDebounce = useRef(0);
  const cpuEnabledRef = useRef(cpuEnabled);
  const cpuDifficultyRef = useRef(cpuDifficulty);
  useEffect(() => {
    cpuEnabledRef.current = cpuEnabled;
  }, [cpuEnabled]);
  useEffect(() => {
    cpuDifficultyRef.current = cpuDifficulty;
  }, [cpuDifficulty]);

  // Puck possession color for visual
  const [puckPossessionColor, setPuckPossessionColor] = useState<string | null>(
    null,
  );
  const prevPossessionRef = useRef<PossessionState>({
    team: null,
    skaterIdx: 0,
  });

  // Active idx refs (to avoid stale closures in useFrame)
  const p1ActiveIdxRef = useRef(p1ActiveIdx);
  const p2ActiveIdxRef = useRef(p2ActiveIdx);
  useEffect(() => {
    p1ActiveIdxRef.current = p1ActiveIdx;
  }, [p1ActiveIdx]);
  useEffect(() => {
    p2ActiveIdxRef.current = p2ActiveIdx;
  }, [p2ActiveIdx]);

  const p1CharactersRef = useRef(p1Characters);
  const p2CharactersRef = useRef(p2Characters);
  useEffect(() => {
    p1CharactersRef.current = p1Characters;
  }, [p1Characters]);
  useEffect(() => {
    p2CharactersRef.current = p2Characters;
  }, [p2Characters]);

  const onP1ActiveChangeRef = useRef(onP1ActiveChange);
  const onP2ActiveChangeRef = useRef(onP2ActiveChange);
  useEffect(() => {
    onP1ActiveChangeRef.current = onP1ActiveChange;
  }, [onP1ActiveChange]);
  useEffect(() => {
    onP2ActiveChangeRef.current = onP2ActiveChange;
  }, [onP2ActiveChange]);

  const resetPositions = useCallback(() => {
    p1s.current = [
      makeSkaterState(-9, -2.5),
      makeSkaterState(-9, 0),
      makeSkaterState(-9, 2.5),
    ];
    p2s.current = [
      makeSkaterState(9, -2.5),
      makeSkaterState(9, 0),
      makeSkaterState(9, 2.5),
    ];
    const angle = (Math.random() * Math.PI) / 2 - Math.PI / 4;
    const side = Math.random() > 0.5 ? 1 : -1;
    puck.current = {
      x: 0,
      z: 0,
      vx: Math.cos(angle) * 8 * side,
      vz: Math.sin(angle) * 8,
    };
    goalCooldownRef.current = false;
    possessionRef.current = { team: null, skaterIdx: 0 };
    p1ShootCooldowns.current = [0, 0, 0];
    p2ShootCooldowns.current = [0, 0, 0];
    p1StunUntil.current = [0, 0, 0];
    p2StunUntil.current = [0, 0, 0];
    p1Knockbacks.current = [
      { vx: 0, vz: 0 },
      { vx: 0, vz: 0 },
      { vx: 0, vz: 0 },
    ];
    p2Knockbacks.current = [
      { vx: 0, vz: 0 },
      { vx: 0, vz: 0 },
      { vx: 0, vz: 0 },
    ];
  }, []);

  useEffect(() => {
    onResetPositions(resetPositions);
  }, [onResetPositions, resetPositions]);

  useEffect(() => {
    const angle = (Math.random() * Math.PI) / 2 - Math.PI / 4;
    const side = Math.random() > 0.5 ? 1 : -1;
    puck.current.vx = Math.cos(angle) * 8 * side;
    puck.current.vz = Math.sin(angle) * 8;
  }, []);

  useEffect(() => {
    const preventKeys = new Set([
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      " ",
      "Enter",
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "KeyQ",
      "ShiftLeft",
      "ShiftRight",
      "Tab",
    ]);

    const onKeyDown = (e: KeyboardEvent) => {
      if (preventKeys.has(e.code) || preventKeys.has(e.key)) {
        e.preventDefault();
      }
      keysRef.current.add(e.code);
      keysRef.current.add(e.key);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code);
      keysRef.current.delete(e.key);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useFrame((_, delta) => {
    if (!running || goalCooldownRef.current) return;

    const dt = Math.min(delta, 0.05);
    const k = keysRef.current;
    const now = performance.now();

    const p1Chars = p1CharactersRef.current;
    const p2Chars = p2CharactersRef.current;
    const p1AI = p1ActiveIdxRef.current;
    const p2AI = p2ActiveIdxRef.current;

    // ── Skater switching ──────────────────────────────────────────────────
    if (k.has("Tab") && now - p1SwitchDebounce.current > 250) {
      p1SwitchDebounce.current = now;
      onP1ActiveChangeRef.current((p1AI + 1) % 3);
    }
    if (
      !cpuEnabledRef.current &&
      (k.has("ControlRight") || k.has("Numpad0")) &&
      now - p2SwitchDebounce.current > 250
    ) {
      p2SwitchDebounce.current = now;
      onP2ActiveChangeRef.current((p2AI + 1) % 3);
    }

    // ── CPU: auto-switch P2 active skater ────────────────────────────────
    if (cpuEnabledRef.current) {
      const diff = cpuDifficultyRef.current;
      const switchInterval =
        diff === "easy" ? 500 : diff === "medium" ? 300 : 150;

      if (now - cpuSwitchDebounce.current > switchInterval) {
        cpuSwitchDebounce.current = now;
        // Switch to skater nearest the puck
        const puckXc = puck.current.x;
        const puckZc = puck.current.z;
        let closestIdx = 0;
        let closestDist = Number.POSITIVE_INFINITY;
        for (let i = 0; i < 3; i++) {
          const dx2 = p2s.current[i].x - puckXc;
          const dz2 = p2s.current[i].z - puckZc;
          const dist2 = Math.sqrt(dx2 * dx2 + dz2 * dz2);
          if (dist2 < closestDist) {
            closestDist = dist2;
            closestIdx = i;
          }
        }
        if (closestIdx !== p2AI) {
          onP2ActiveChangeRef.current(closestIdx);
        }
      }
    }

    // ── Move each team's active skater ────────────────────────────────────
    const moveSkater = (
      skaters: [PhysicsState, PhysicsState, PhysicsState],
      facings: [
        { dx: number; dz: number },
        { dx: number; dz: number },
        { dx: number; dz: number },
      ],
      stunUntil: [number, number, number],
      knockbacks: [
        { vx: number; vz: number },
        { vx: number; vz: number },
        { vx: number; vz: number },
      ],
      activeIdx: number,
      charIndices: [number, number, number],
      upKeys: string[],
      downKeys: string[],
      leftKeys: string[],
      rightKeys: string[],
    ) => {
      for (let i = 0; i < 3; i++) {
        const s = skaters[i];
        const stats = CHARACTER_ROSTER[charIndices[i]].stats;
        const speed = PLAYER_SPEED * stats.speedMult;

        const prevX = s.x;
        const prevZ = s.z;

        if (i === activeIdx && now >= stunUntil[i]) {
          if (upKeys.some((k2) => k.has(k2))) s.z -= speed * dt;
          if (downKeys.some((k2) => k.has(k2))) s.z += speed * dt;
          if (leftKeys.some((k2) => k.has(k2))) s.x -= speed * dt;
          if (rightKeys.some((k2) => k.has(k2))) s.x += speed * dt;
        }

        // Apply knockback decay (all skaters)
        if (now < stunUntil[i]) {
          s.x += knockbacks[i].vx * dt;
          s.z += knockbacks[i].vz * dt;
          knockbacks[i].vx *= 0.88;
          knockbacks[i].vz *= 0.88;
        }

        s.x = Math.max(-12.5, Math.min(12.5, s.x));
        s.z = Math.max(-7.2, Math.min(7.2, s.z));
        s.vx = (s.x - prevX) / dt;
        s.vz = (s.z - prevZ) / dt;

        const spd = Math.sqrt(s.vx ** 2 + s.vz ** 2);
        if (spd > 0.5) {
          facings[i] = { dx: s.vx / spd, dz: s.vz / spd };
        }
      }
    };

    moveSkater(
      p1s.current,
      p1Facings.current,
      p1StunUntil.current,
      p1Knockbacks.current,
      p1AI,
      p1Chars,
      ["KeyW", "w"],
      ["KeyS", "s"],
      ["KeyA", "a"],
      ["KeyD", "d"],
    );
    if (!cpuEnabledRef.current) {
      moveSkater(
        p2s.current,
        p2Facings.current,
        p2StunUntil.current,
        p2Knockbacks.current,
        p2AI,
        p2Chars,
        ["ArrowUp"],
        ["ArrowDown"],
        ["ArrowLeft"],
        ["ArrowRight"],
      );
    } else {
      // CPU controls P2 active skater directly (no key input)
      const diff = cpuDifficultyRef.current;
      const cpuSpeedFrac =
        diff === "easy" ? 0.55 : diff === "medium" ? 0.78 : 0.95;
      const jitter = diff === "hard" ? 0 : diff === "medium" ? 0.8 : 1.8;

      const poss2 = possessionRef.current;
      const puckXc = puck.current.x;
      const puckZc = puck.current.z;

      // All P2 skaters get knockback decay; active one gets CPU movement
      for (let i = 0; i < 3; i++) {
        const s = p2s.current[i];
        const stats = CHARACTER_ROSTER[p2Chars[i]].stats;
        const speed = PLAYER_SPEED * stats.speedMult * cpuSpeedFrac;

        const prevX = s.x;
        const prevZ = s.z;

        if (now < p2StunUntil.current[i]) {
          // Apply knockback
          s.x += p2Knockbacks.current[i].vx * dt;
          s.z += p2Knockbacks.current[i].vz * dt;
          p2Knockbacks.current[i].vx *= 0.88;
          p2Knockbacks.current[i].vz *= 0.88;
        } else if (i === p2AI) {
          // CPU active skater movement
          let targetX: number;
          let targetZ: number;

          if (poss2.team === 2 && poss2.skaterIdx === i) {
            // Has puck — move toward P1 goal (left side x=-13)
            const shootThreshold =
              diff === "easy" ? -6 : diff === "medium" ? -3 : -100; // always shoot on hard
            if (s.x < shootThreshold) {
              // In shooting range — aim at goal
              targetX = -13;
              targetZ = (Math.random() - 0.5) * 2; // slight aim variance
            } else {
              targetX = -13;
              targetZ = 0;
            }
          } else if (poss2.team === null) {
            // Free puck — chase it
            targetX = puckXc;
            targetZ = puckZc;
          } else if (poss2.team === 2) {
            // Teammate has it — go offensive
            targetX = -8;
            targetZ = 0;
          } else {
            // P1 has puck — chase the carrier
            targetX = p1s.current[poss2.skaterIdx].x;
            targetZ = p1s.current[poss2.skaterIdx].z;
          }

          // Add positional jitter for easy/medium
          const jx = jitter > 0 ? (Math.random() - 0.5) * jitter * dt : 0;
          const jz = jitter > 0 ? (Math.random() - 0.5) * jitter * dt : 0;

          const ddx = targetX - s.x + jx;
          const ddz = targetZ - s.z + jz;
          const dist = Math.sqrt(ddx * ddx + ddz * ddz);
          if (dist > 0.15) {
            s.x += (ddx / dist) * speed * dt;
            s.z += (ddz / dist) * speed * dt;
          }
        }

        s.x = Math.max(-12.5, Math.min(12.5, s.x));
        s.z = Math.max(-7.2, Math.min(7.2, s.z));
        s.vx = (s.x - prevX) / dt;
        s.vz = (s.z - prevZ) / dt;

        const spd = Math.sqrt(s.vx ** 2 + s.vz ** 2);
        if (spd > 0.5) {
          p2Facings.current[i] = { dx: s.vx / spd, dz: s.vz / spd };
        }
      }
    }

    // ── AI movement for non-active skaters ────────────────────────────────
    const puckX = puck.current.x;
    const puckZ = puck.current.z;
    const possession = possessionRef.current;

    for (let i = 0; i < 3; i++) {
      if (i === p1AI) continue; // skip human-controlled skater
      // Knockback already handled by moveSkater; skip autonomous movement while stunned
      if (now < p1StunUntil.current[i]) continue;

      const s = p1s.current[i];
      const stats = CHARACTER_ROSTER[p1Chars[i]].stats;
      const speed = PLAYER_SPEED * stats.speedMult;

      // Determine target position
      let targetX: number;
      let targetZ: number;
      if (possession.team === null) {
        // Free puck: chase the puck
        targetX = puckX;
        targetZ = puckZ;
      } else if (possession.team === 1) {
        // Own team has puck: advance toward opponent's goal (right side x=13)
        targetX = 13;
        targetZ = 0;
      } else {
        // Opponent has puck: chase the puck carrier
        targetX = p2s.current[possession.skaterIdx].x;
        targetZ = p2s.current[possession.skaterIdx].z;
      }

      const prevX = s.x;
      const prevZ = s.z;
      const ddx = targetX - s.x;
      const ddz = targetZ - s.z;
      const dist = Math.sqrt(ddx * ddx + ddz * ddz);

      if (dist > 0.1) {
        s.x += (ddx / dist) * speed * dt;
        s.z += (ddz / dist) * speed * dt;
      }

      s.x = Math.max(-12.5, Math.min(12.5, s.x));
      s.z = Math.max(-7.2, Math.min(7.2, s.z));
      s.vx = (s.x - prevX) / dt;
      s.vz = (s.z - prevZ) / dt;

      const spd = Math.sqrt(s.vx ** 2 + s.vz ** 2);
      if (spd > 0.5) {
        p1Facings.current[i] = { dx: s.vx / spd, dz: s.vz / spd };
      }
    }

    for (let i = 0; i < 3; i++) {
      if (i === p2AI) continue; // skip human-controlled skater
      // Knockback already handled by moveSkater; skip autonomous movement while stunned
      if (now < p2StunUntil.current[i]) continue;

      const s = p2s.current[i];
      const stats = CHARACTER_ROSTER[p2Chars[i]].stats;
      const speed = PLAYER_SPEED * stats.speedMult;

      // Determine target position
      let targetX: number;
      let targetZ: number;
      if (possession.team === null) {
        // Free puck: chase the puck
        targetX = puckX;
        targetZ = puckZ;
      } else if (possession.team === 2) {
        // Own team has puck: advance toward opponent's goal (left side x=-13)
        targetX = -13;
        targetZ = 0;
      } else {
        // Opponent has puck: chase the puck carrier
        targetX = p1s.current[possession.skaterIdx].x;
        targetZ = p1s.current[possession.skaterIdx].z;
      }

      const prevX = s.x;
      const prevZ = s.z;
      const ddx = targetX - s.x;
      const ddz = targetZ - s.z;
      const dist = Math.sqrt(ddx * ddx + ddz * ddz);

      if (dist > 0.1) {
        s.x += (ddx / dist) * speed * dt;
        s.z += (ddz / dist) * speed * dt;
      }

      s.x = Math.max(-12.5, Math.min(12.5, s.x));
      s.z = Math.max(-7.2, Math.min(7.2, s.z));
      s.vx = (s.x - prevX) / dt;
      s.vz = (s.z - prevZ) / dt;

      const spd = Math.sqrt(s.vx ** 2 + s.vz ** 2);
      if (spd > 0.5) {
        p2Facings.current[i] = { dx: s.vx / spd, dz: s.vz / spd };
      }
    }

    // ── Body check ────────────────────────────────────────────────────────
    // P1 active skater checks nearest P2 skater (Q key)
    if (
      (k.has("KeyQ") || k.has("q")) &&
      now >= p1CheckCooldowns.current[p1AI] &&
      now >= p1StunUntil.current[p1AI]
    ) {
      const p1Stats = CHARACTER_ROSTER[p1Chars[p1AI]].stats;
      let nearest = -1;
      let nearestDist = Number.POSITIVE_INFINITY;
      for (let i = 0; i < 3; i++) {
        const dx = p2s.current[i].x - p1s.current[p1AI].x;
        const dz = p2s.current[i].z - p1s.current[p1AI].z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < nearestDist) {
          nearest = i;
          nearestDist = d;
        }
      }
      const checkRange = CHECK_RANGE * p1Stats.checkRangeMult;
      if (nearest >= 0 && nearestDist < checkRange) {
        const p2Stats = CHARACTER_ROSTER[p2Chars[nearest]].stats;
        const dx = p2s.current[nearest].x - p1s.current[p1AI].x;
        const dz = p2s.current[nearest].z - p1s.current[p1AI].z;
        const nx = dx / nearestDist;
        const nz = dz / nearestDist;
        const knockback =
          CHECK_KNOCKBACK * p1Stats.checkMult * p2Stats.damageReduction;
        p2Knockbacks.current[nearest] = {
          vx: nx * knockback,
          vz: nz * knockback,
        };
        p2StunUntil.current[nearest] = now + CHECK_STUN_MS;
        // Strip puck
        if (
          possessionRef.current.team === 2 &&
          possessionRef.current.skaterIdx === nearest
        ) {
          possessionRef.current = { team: null, skaterIdx: 0 };
          p2ShootCooldowns.current[nearest] = now + 600;
          puck.current.vx = nx * 10;
          puck.current.vz = nz * 10;
        }
        p1CheckCooldowns.current[p1AI] =
          now + CHECK_COOLDOWN_MS * p1Stats.checkCooldownMult;
        playBodyCheck();
        onBodyCheck(1, CHARACTER_ROSTER[p1Chars[p1AI]].fakeName);
      } else {
        p1CheckCooldowns.current[p1AI] =
          now +
          CHECK_COOLDOWN_MS *
            CHARACTER_ROSTER[p1Chars[p1AI]].stats.checkCooldownMult *
            0.5;
      }
    }

    // ── CPU body check logic ─────────────────────────────────────────────
    if (
      cpuEnabledRef.current &&
      now >= p2CheckCooldowns.current[p2AI] &&
      now >= p2StunUntil.current[p2AI]
    ) {
      const diff2 = cpuDifficultyRef.current;
      const checkProb =
        diff2 === "easy" ? 0.4 : diff2 === "medium" ? 0.65 : 0.9;
      // Check if any P1 skater is within range
      const cpuStats2 = CHARACTER_ROSTER[p2Chars[p2AI]].stats;
      let nearestP1 = -1;
      let nearestP1Dist = Number.POSITIVE_INFINITY;
      for (let i = 0; i < 3; i++) {
        const dx3 = p1s.current[i].x - p2s.current[p2AI].x;
        const dz3 = p1s.current[i].z - p2s.current[p2AI].z;
        const d3 = Math.sqrt(dx3 * dx3 + dz3 * dz3);
        if (d3 < nearestP1Dist) {
          nearestP1Dist = d3;
          nearestP1 = i;
        }
      }
      const cpuCheckRange2 = CHECK_RANGE * cpuStats2.checkRangeMult;
      if (
        nearestP1 >= 0 &&
        nearestP1Dist < cpuCheckRange2 &&
        Math.random() < checkProb &&
        now - cpuCheckDebounce.current > 400
      ) {
        cpuCheckDebounce.current = now;
        const p1Stats2 = CHARACTER_ROSTER[p1Chars[nearestP1]].stats;
        const dx3 = p1s.current[nearestP1].x - p2s.current[p2AI].x;
        const dz3 = p1s.current[nearestP1].z - p2s.current[p2AI].z;
        const dist3 = Math.sqrt(dx3 * dx3 + dz3 * dz3);
        const nx3 = dx3 / dist3;
        const nz3 = dz3 / dist3;
        const knockback3 =
          CHECK_KNOCKBACK * cpuStats2.checkMult * p1Stats2.damageReduction;
        p1Knockbacks.current[nearestP1] = {
          vx: nx3 * knockback3,
          vz: nz3 * knockback3,
        };
        p1StunUntil.current[nearestP1] = now + CHECK_STUN_MS;
        if (
          possessionRef.current.team === 1 &&
          possessionRef.current.skaterIdx === nearestP1
        ) {
          possessionRef.current = { team: null, skaterIdx: 0 };
          p1ShootCooldowns.current[nearestP1] = now + 600;
          puck.current.vx = nx3 * 10;
          puck.current.vz = nz3 * 10;
        }
        p2CheckCooldowns.current[p2AI] =
          now + CHECK_COOLDOWN_MS * cpuStats2.checkCooldownMult;
        playBodyCheck();
        onBodyCheck(2, CHARACTER_ROSTER[p2Chars[p2AI]].fakeName);
      }
    }

    // P2 active skater checks nearest P1 skater (ShiftRight)
    if (
      !cpuEnabledRef.current &&
      (k.has("ShiftRight") || k.has("ShiftLeft")) &&
      possessionRef.current.team !== 2 &&
      now >= p2CheckCooldowns.current[p2AI] &&
      now >= p2StunUntil.current[p2AI]
    ) {
      const p2Stats = CHARACTER_ROSTER[p2Chars[p2AI]].stats;
      let nearest = -1;
      let nearestDist = Number.POSITIVE_INFINITY;
      for (let i = 0; i < 3; i++) {
        const dx = p1s.current[i].x - p2s.current[p2AI].x;
        const dz = p1s.current[i].z - p2s.current[p2AI].z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < nearestDist) {
          nearest = i;
          nearestDist = d;
        }
      }
      const checkRange = CHECK_RANGE * p2Stats.checkRangeMult;
      if (nearest >= 0 && nearestDist < checkRange) {
        const p1Stats = CHARACTER_ROSTER[p1Chars[nearest]].stats;
        const dx = p1s.current[nearest].x - p2s.current[p2AI].x;
        const dz = p1s.current[nearest].z - p2s.current[p2AI].z;
        const nx = dx / nearestDist;
        const nz = dz / nearestDist;
        const knockback =
          CHECK_KNOCKBACK * p2Stats.checkMult * p1Stats.damageReduction;
        p1Knockbacks.current[nearest] = {
          vx: nx * knockback,
          vz: nz * knockback,
        };
        p1StunUntil.current[nearest] = now + CHECK_STUN_MS;
        if (
          possessionRef.current.team === 1 &&
          possessionRef.current.skaterIdx === nearest
        ) {
          possessionRef.current = { team: null, skaterIdx: 0 };
          p1ShootCooldowns.current[nearest] = now + 600;
          puck.current.vx = nx * 10;
          puck.current.vz = nz * 10;
        }
        p2CheckCooldowns.current[p2AI] =
          now + CHECK_COOLDOWN_MS * p2Stats.checkCooldownMult;
        playBodyCheck();
        onBodyCheck(2, CHARACTER_ROSTER[p2Chars[p2AI]].fakeName);
      } else {
        p2CheckCooldowns.current[p2AI] =
          now +
          CHECK_COOLDOWN_MS *
            CHARACTER_ROSTER[p2Chars[p2AI]].stats.checkCooldownMult *
            0.5;
      }
    }

    // ── Shoot ─────────────────────────────────────────────────────────────
    const poss = possessionRef.current;

    if (
      poss.team === 1 &&
      poss.skaterIdx === p1AI &&
      (k.has("Space") || k.has(" "))
    ) {
      const stats = CHARACTER_ROSTER[p1Chars[poss.skaterIdx]].stats;
      const shotSpeed = SHOOT_SPEED * stats.shotMult;
      puck.current.vx = p1Facings.current[poss.skaterIdx].dx * shotSpeed;
      puck.current.vz = p1Facings.current[poss.skaterIdx].dz * shotSpeed;
      if (stats.puckBoost) {
        puck.current.vx *= 1.15;
        puck.current.vz *= 1.15;
      }
      possessionRef.current = { team: null, skaterIdx: 0 };
      p1ShootCooldowns.current[poss.skaterIdx] = now + stats.shootCooldown;
      playPaddleHit();
    } else if (poss.team === 2 && poss.skaterIdx === p2AI) {
      // CPU or human P2 shoot
      const diffShoot = cpuDifficultyRef.current;
      const shootThresholdX =
        diffShoot === "easy" ? -6 : diffShoot === "medium" ? -3 : 999; // hard always shoots
      const shouldCpuShoot =
        cpuEnabledRef.current &&
        (p2s.current[p2AI].x < shootThresholdX || diffShoot === "hard") &&
        now - cpuShootDebounce.current > 350;
      const humanShoot =
        !cpuEnabledRef.current &&
        (k.has("Enter") || k.has("ShiftLeft") || k.has("ShiftRight"));

      if (shouldCpuShoot || humanShoot) {
        if (shouldCpuShoot) cpuShootDebounce.current = now;
        const stats = CHARACTER_ROSTER[p2Chars[poss.skaterIdx]].stats;
        const shotSpeed = SHOOT_SPEED * stats.shotMult;
        // CPU aims at goal
        let faceDx = p2Facings.current[poss.skaterIdx].dx;
        let faceDz = p2Facings.current[poss.skaterIdx].dz;
        if (cpuEnabledRef.current) {
          // Aim toward left goal with slight aim error
          const aimErr =
            diffShoot === "easy"
              ? (Math.random() - 0.5) * 0.8
              : diffShoot === "medium"
                ? (Math.random() - 0.5) * 0.3
                : 0;
          const aimX = -13 - p2s.current[p2AI].x;
          const aimZ = aimErr - p2s.current[p2AI].z;
          const aimDist = Math.sqrt(aimX * aimX + aimZ * aimZ);
          faceDx = aimX / aimDist;
          faceDz = aimZ / aimDist;
        }
        puck.current.vx = faceDx * shotSpeed;
        puck.current.vz = faceDz * shotSpeed;
        if (stats.puckBoost) {
          puck.current.vx *= 1.15;
          puck.current.vz *= 1.15;
        }
        possessionRef.current = { team: null, skaterIdx: 0 };
        p2ShootCooldowns.current[poss.skaterIdx] = now + stats.shootCooldown;
        playPaddleHit();
      }
    }

    // ── Puck physics ──────────────────────────────────────────────────────
    const currentPoss = possessionRef.current;

    if (currentPoss.team === null) {
      puck.current.x += puck.current.vx * dt;
      puck.current.z += puck.current.vz * dt;
      puck.current.vx *= 0.992;
      puck.current.vz *= 0.992;

      if (puck.current.z < -7.5) {
        puck.current.z = -7.5;
        if (puck.current.vz < 0) {
          puck.current.vz = -puck.current.vz;
          playWallHit();
        }
      }
      if (puck.current.z > 7.5) {
        puck.current.z = 7.5;
        if (puck.current.vz > 0) {
          puck.current.vz = -puck.current.vz;
          playWallHit();
        }
      }

      const inGoalZone = Math.abs(puck.current.z) < 3.2;
      if (!inGoalZone) {
        if (puck.current.x < -12.8) {
          puck.current.x = -12.8;
          if (puck.current.vx < 0) {
            puck.current.vx = -puck.current.vx;
            playWallHit();
          }
        }
        if (puck.current.x > 12.8) {
          puck.current.x = 12.8;
          if (puck.current.vx > 0) {
            puck.current.vx = -puck.current.vx;
            playWallHit();
          }
        }
      }

      // Pickup: all 6 skaters can pick up free puck
      let pickedUp = false;
      for (let i = 0; i < 3 && !pickedUp; i++) {
        const s = p1s.current[i];
        const dx = puck.current.x - s.x;
        const dz = puck.current.z - s.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        const stats = CHARACTER_ROSTER[p1Chars[i]].stats;
        if (
          d < PICKUP_DIST * stats.pickupMult &&
          now >= p1ShootCooldowns.current[i]
        ) {
          possessionRef.current = { team: 1, skaterIdx: i };
          pickedUp = true;
        }
      }
      for (let i = 0; i < 3 && !pickedUp; i++) {
        const s = p2s.current[i];
        const dx = puck.current.x - s.x;
        const dz = puck.current.z - s.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        const stats = CHARACTER_ROSTER[p2Chars[i]].stats;
        if (
          d < PICKUP_DIST * stats.pickupMult &&
          now >= p2ShootCooldowns.current[i]
        ) {
          possessionRef.current = { team: 2, skaterIdx: i };
          pickedUp = true;
        }
      }
    } else {
      // Possessed — check for steals by opposing team
      const holder = currentPoss.team;
      const holderIdx = currentPoss.skaterIdx;

      // Check each opposing skater for a steal
      const opposingSkaters = holder === 1 ? p2s.current : p1s.current;
      const opposingChars = holder === 1 ? p2Chars : p1Chars;
      const opposingCooldowns =
        holder === 1 ? p2ShootCooldowns.current : p1ShootCooldowns.current;
      const holderCooldowns =
        holder === 1 ? p1ShootCooldowns.current : p2ShootCooldowns.current;

      for (let i = 0; i < 3; i++) {
        const other = opposingSkaters[i];
        const otherStats = CHARACTER_ROSTER[opposingChars[i]].stats;
        const dx = puck.current.x - other.x;
        const dz = puck.current.z - other.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        const effectiveSteal = STEAL_DIST * otherStats.stealMult;
        if (d < effectiveSteal && now >= opposingCooldowns[i]) {
          possessionRef.current = { team: holder === 1 ? 2 : 1, skaterIdx: i };
          holderCooldowns[holderIdx] = now + 400;
          playPaddleHit();
          break;
        }
      }

      // Attach puck to possessing skater
      const newPoss = possessionRef.current;
      const holderState =
        newPoss.team === 1
          ? p1s.current[newPoss.skaterIdx]
          : p2s.current[newPoss.skaterIdx];
      const facing =
        newPoss.team === 1
          ? p1Facings.current[newPoss.skaterIdx]
          : p2Facings.current[newPoss.skaterIdx];
      puck.current.x = holderState.x + facing.dx * CARRY_OFFSET;
      puck.current.z = holderState.z + facing.dz * CARRY_OFFSET;
      puck.current.vx = 0;
      puck.current.vz = 0;
    }

    // Cap puck speed
    if (possessionRef.current.team === null) {
      const puckSpd = Math.sqrt(puck.current.vx ** 2 + puck.current.vz ** 2);
      const MAX_SPEED = 18;
      if (puckSpd > MAX_SPEED) {
        puck.current.vx = (puck.current.vx / puckSpd) * MAX_SPEED;
        puck.current.vz = (puck.current.vz / puckSpd) * MAX_SPEED;
      }
    }

    // ── Goalie AI movement ────────────────────────────────────────────────
    const puckZForGoalie = puck.current.z;
    const GOALIE_CLAMP = 2.4;

    // P1 goalie (left side) — always medium speed 6
    const p1GoalieSpeed = 6;
    const p1GDiff = puckZForGoalie - p1Goalie.current.z;
    const p1GStep = p1GoalieSpeed * dt;
    if (Math.abs(p1GDiff) < p1GStep) {
      p1Goalie.current.z = puckZForGoalie;
    } else {
      p1Goalie.current.z += Math.sign(p1GDiff) * p1GStep;
    }
    p1Goalie.current.z = Math.max(
      -GOALIE_CLAMP,
      Math.min(GOALIE_CLAMP, p1Goalie.current.z),
    );

    // P2 goalie (right side) — speed depends on mode/difficulty
    const p2GoalieSpeed = cpuEnabledRef.current
      ? cpuDifficultyRef.current === "easy"
        ? 4
        : cpuDifficultyRef.current === "medium"
          ? 6
          : 9
      : 6;
    const p2GDiff = puckZForGoalie - p2Goalie.current.z;
    const p2GStep = p2GoalieSpeed * dt;
    if (Math.abs(p2GDiff) < p2GStep) {
      p2Goalie.current.z = puckZForGoalie;
    } else {
      p2Goalie.current.z += Math.sign(p2GDiff) * p2GStep;
    }
    p2Goalie.current.z = Math.max(
      -GOALIE_CLAMP,
      Math.min(GOALIE_CLAMP, p2Goalie.current.z),
    );

    // ── Goalie-puck collision (before goal detection) ─────────────────────
    if (possessionRef.current.team === null) {
      // P1 goalie save (left side)
      if (
        puck.current.x < -11.5 &&
        Math.abs(puck.current.z - p1Goalie.current.z) < 1.0 &&
        Math.abs(puck.current.z) < 3.2 &&
        puck.current.vx < 0
      ) {
        puck.current.vx = Math.abs(puck.current.vx) * 1.1;
        // Add slight z deflection for realism
        puck.current.vz += (puck.current.z - p1Goalie.current.z) * 2;
        puck.current.x = -11.5;
        playWallHit();
      }

      // P2 goalie save (right side)
      if (
        puck.current.x > 11.5 &&
        Math.abs(puck.current.z - p2Goalie.current.z) < 1.0 &&
        Math.abs(puck.current.z) < 3.2 &&
        puck.current.vx > 0
      ) {
        puck.current.vx = -Math.abs(puck.current.vx) * 1.1;
        // Add slight z deflection for realism
        puck.current.vz += (puck.current.z - p2Goalie.current.z) * 2;
        puck.current.x = 11.5;
        playWallHit();
      }
    }

    // ── Goal detection ────────────────────────────────────────────────────
    if (puck.current.x < -13.2 && Math.abs(puck.current.z) < 3.2) {
      possessionRef.current = { team: null, skaterIdx: 0 };
      goalCooldownRef.current = true;
      playGoal();
      onGoal(2);
    } else if (puck.current.x > 13.2 && Math.abs(puck.current.z) < 3.2) {
      possessionRef.current = { team: null, skaterIdx: 0 };
      goalCooldownRef.current = true;
      playGoal();
      onGoal(1);
    }

    // ── Notify possession changes ─────────────────────────────────────────
    const newPoss = possessionRef.current;
    const prevPoss = prevPossessionRef.current;
    if (
      newPoss.team !== prevPoss.team ||
      newPoss.skaterIdx !== prevPoss.skaterIdx
    ) {
      prevPossessionRef.current = { ...newPoss };
      onPossessionChange(newPoss.team, newPoss.skaterIdx);
      setPuckPossessionColor(
        newPoss.team === 1 ? P1_COLOR : newPoss.team === 2 ? P2_COLOR : null,
      );
    }

    // ── Sync mesh positions ────────────────────────────────────────────────
    for (let i = 0; i < 3; i++) {
      const mesh = p1MeshRefs.current[i];
      if (mesh) {
        const s = p1s.current[i];
        mesh.position.set(s.x, 0, s.z);
        const spd = Math.sqrt(s.vx ** 2 + s.vz ** 2);
        if (spd > 0.5) {
          mesh.rotation.y = Math.atan2(s.vx, s.vz);
        }
      }
    }
    for (let i = 0; i < 3; i++) {
      const mesh = p2MeshRefs.current[i];
      if (mesh) {
        const s = p2s.current[i];
        mesh.position.set(s.x, 0, s.z);
        const spd = Math.sqrt(s.vx ** 2 + s.vz ** 2);
        if (spd > 0.5) {
          mesh.rotation.y = Math.atan2(s.vx, s.vz);
        }
      }
    }

    if (puckMeshRef.current) {
      puckMeshRef.current.position.set(puck.current.x, 0, puck.current.z);
    }

    // ── Sync goalie mesh positions ─────────────────────────────────────────
    if (p1GoalieMeshRef.current) {
      p1GoalieMeshRef.current.position.set(
        p1Goalie.current.x,
        0,
        p1Goalie.current.z,
      );
    }
    if (p2GoalieMeshRef.current) {
      p2GoalieMeshRef.current.position.set(
        p2Goalie.current.x,
        0,
        p2Goalie.current.z,
      );
    }
  });

  const poss = possessionRef.current;

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[0, 20, 5]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <hemisphereLight args={["#ffffff", "#0a1228", 0.6]} />
      <pointLight position={[-13, 4, 0]} color="#ff3a2d" intensity={2} />
      <pointLight position={[13, 4, 0]} color="#3d7fff" intensity={2} />
      <pointLight position={[0, 12, 0]} color="#ddeeff" intensity={0.8} />
      <pointLight position={[-6, 10, 0]} color="#bbccff" intensity={0.4} />
      <pointLight position={[6, 10, 0]} color="#bbccff" intensity={0.4} />

      <IceSurface />
      <Boards />
      <CenterLine />
      <BlueLines />
      <CenterCircle />
      <FaceOffCircles />
      <GoalCrease side="left" />
      <GoalCrease side="right" />
      <GoalNet side="left" />
      <GoalNet side="right" />

      {/* P1 skaters */}
      {([0, 1, 2] as const).map((i) => (
        <PlayerMesh
          key={`p1-${i}`}
          ref={(el) => {
            p1MeshRefs.current[i] = el;
          }}
          color={P1_COLOR}
          isP1={true}
          helmetAccent={CHARACTER_ROSTER[p1Characters[i]].helmetAccent}
          jerseyNumber={CHARACTER_ROSTER[p1Characters[i]].jerseyNumber}
          isActive={i === p1ActiveIdx}
          teamColor={P1_COLOR}
        />
      ))}

      {/* P2 skaters */}
      {([0, 1, 2] as const).map((i) => (
        <PlayerMesh
          key={`p2-${i}`}
          ref={(el) => {
            p2MeshRefs.current[i] = el;
          }}
          color={P2_COLOR}
          isP1={false}
          helmetAccent={CHARACTER_ROSTER[p2Characters[i]].helmetAccent}
          jerseyNumber={CHARACTER_ROSTER[p2Characters[i]].jerseyNumber}
          isActive={i === p2ActiveIdx}
          teamColor={P2_COLOR}
        />
      ))}

      {/* P1 Goalie */}
      <GoalieMesh
        ref={p1GoalieMeshRef}
        color={P1_COLOR}
        helmetAccent="#ffffff"
        isP1={true}
      />

      {/* P2 Goalie */}
      <GoalieMesh
        ref={p2GoalieMeshRef}
        color={P2_COLOR}
        helmetAccent="#ffffff"
        isP1={false}
      />

      {/* Puck */}
      <PuckMesh
        ref={puckMeshRef}
        possessionColor={
          poss.team === 1
            ? P1_COLOR
            : poss.team === 2
              ? P2_COLOR
              : puckPossessionColor
        }
      />
    </>
  );
}

// ─── Main Game Component ──────────────────────────────────────────────────────

export default function HockeyGame() {
  const [phase, setPhase] = useState<GamePhase>("start");
  const [gameMode, setGameMode] = useState<"2p" | "cpu">("2p");
  const [cpuDifficulty, setCpuDifficulty] = useState<CpuDifficulty>("medium");
  const [displayScore, setDisplayScore] = useState<[number, number]>([0, 0]);
  const [goalMessage, setGoalMessage] = useState<string>("");
  const [goalScorer, setGoalScorerState] = useState<1 | 2 | null>(null);
  const [winner, setWinner] = useState<1 | 2 | null>(null);
  const [winnerName, setWinnerName] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [roundNumber, setRoundNumber] = useState(1);
  const [roundWins, setRoundWins] = useState<[number, number]>([0, 0]);
  const [roundWinner, setRoundWinner] = useState<1 | 2 | null>(null);

  // 3v3: each team picks 3 characters
  const [p1Characters, setP1Characters] = useState<[number, number, number]>([
    0, 1, 2,
  ]);
  const [p2Characters, setP2Characters] = useState<[number, number, number]>([
    3, 4, 5,
  ]);
  const [p1Names, setP1Names] = useState<[string, string, string]>([
    CHARACTER_ROSTER[0].fakeName,
    CHARACTER_ROSTER[1].fakeName,
    CHARACTER_ROSTER[2].fakeName,
  ]);
  const [p2Names, setP2Names] = useState<[string, string, string]>([
    CHARACTER_ROSTER[3].fakeName,
    CHARACTER_ROSTER[4].fakeName,
    CHARACTER_ROSTER[5].fakeName,
  ]);

  const [p1ActiveIdx, setP1ActiveIdx] = useState(0);
  const [p2ActiveIdx, setP2ActiveIdx] = useState(0);

  const [showFlash, setShowFlash] = useState(false);
  const [possession, setPossession] = useState<{
    team: 1 | 2 | null;
    skaterIdx: number;
  }>({
    team: null,
    skaterIdx: 0,
  });
  const [checkMsg, setCheckMsg] = useState<{
    text: string;
    color: string;
  } | null>(null);
  const checkMsgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [confettiParticles, setConfettiParticles] = useState<
    ConfettiParticle[]
  >([]);

  const phaseRef = useRef<GamePhase>("start");
  const scoreRef = useRef<[number, number]>([0, 0]);
  const roundWinsRef = useRef<[number, number]>([0, 0]);
  const roundNumberRef = useRef(1);
  const resetPositionsRef = useRef<(() => void) | null>(null);
  const confettiRafRef = useRef<number>(0);
  const confettiLastTimeRef = useRef<number>(0);

  const { data: topScores, refetch: refetchScores } = useTopScores();
  const addScore = useAddScore();

  // Auto-fill names when character selection changes
  useEffect(() => {
    setP1Names([
      CHARACTER_ROSTER[p1Characters[0]].fakeName,
      CHARACTER_ROSTER[p1Characters[1]].fakeName,
      CHARACTER_ROSTER[p1Characters[2]].fakeName,
    ]);
  }, [p1Characters]);

  useEffect(() => {
    setP2Names([
      CHARACTER_ROSTER[p2Characters[0]].fakeName,
      CHARACTER_ROSTER[p2Characters[1]].fakeName,
      CHARACTER_ROSTER[p2Characters[2]].fakeName,
    ]);
  }, [p2Characters]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    roundNumberRef.current = roundNumber;
  }, [roundNumber]);

  // ── Confetti animation ────────────────────────────────────────────────────
  const confettiLength = confettiParticles.length;
  useEffect(() => {
    if (confettiLength === 0) return;
    confettiLastTimeRef.current = performance.now();

    const animate = (now: number) => {
      const dt = Math.min((now - confettiLastTimeRef.current) / 1000, 0.05);
      confettiLastTimeRef.current = now;

      setConfettiParticles((prev) => {
        const updated = prev
          .map((p) => ({
            ...p,
            x: p.x + p.vx * dt,
            y: p.y + p.vy * dt,
            vy: p.vy + 300 * dt,
            vx: p.vx * 0.99,
            rotation: p.rotation + p.spin * dt,
            life: p.life - dt / 2.0,
          }))
          .filter((p) => p.life > 0);

        if (updated.length === 0) return [];
        return updated;
      });

      confettiRafRef.current = requestAnimationFrame(animate);
    };

    confettiRafRef.current = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(confettiRafRef.current);
    };
  }, [confettiLength]);

  // ── Body check feedback ───────────────────────────────────────────────────
  const handleBodyCheck = useCallback((checker: 1 | 2, skaterName: string) => {
    if (checkMsgTimerRef.current) clearTimeout(checkMsgTimerRef.current);
    setCheckMsg({
      text: `${skaterName} CHECKS!`,
      color: checker === 1 ? P1_COLOR : P2_COLOR,
    });
    checkMsgTimerRef.current = setTimeout(() => setCheckMsg(null), 900);
  }, []);

  // ── Trigger goal effects ──────────────────────────────────────────────────
  const triggerGoalEffects = useCallback((scorer: 1 | 2) => {
    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 600);

    const CONFETTI_COLORS = [
      "#ff3a2d",
      "#3d7fff",
      "#ffe000",
      "#00e5ff",
      "#ff69b4",
      "#7fff00",
    ];
    const cx = 450;
    const cy = 280;

    const particles: ConfettiParticle[] = Array.from({ length: 80 }, (_, i) => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 150 + Math.random() * 400;
      return {
        id: i,
        x: cx + (Math.random() - 0.5) * 60,
        y: cy + (Math.random() - 0.5) * 60,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 150,
        rotation: Math.random() * 360,
        spin: (Math.random() - 0.5) * 720,
        color:
          CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        life: 0.8 + Math.random() * 0.4,
        size: 6 + Math.random() * 6,
      };
    });

    setConfettiParticles(particles);
    setGoalScorerState(scorer);
  }, []);

  // ── Handle goal scored ────────────────────────────────────────────────────
  const handleGoal = useCallback(
    (scorer: 1 | 2) => {
      if (phaseRef.current !== "playing") return;

      const newScore: [number, number] = [
        scoreRef.current[0],
        scoreRef.current[1],
      ];
      newScore[scorer - 1] += 1;
      scoreRef.current = newScore;
      setDisplayScore([...newScore]);
      // Show team's active name
      const scorerName =
        scorer === 1 ? p1Names[p1ActiveIdx] : p2Names[p2ActiveIdx];
      setGoalMessage(scorerName);
      triggerGoalEffects(scorer);
      setPhase("goal");

      if (newScore[scorer - 1] >= WINS_TO_WIN) {
        const newRoundWins: [number, number] = [...roundWinsRef.current];
        newRoundWins[scorer - 1] += 1;
        roundWinsRef.current = newRoundWins;

        if (newRoundWins[scorer - 1] >= ROUNDS_TO_WIN_MATCH) {
          setTimeout(() => {
            setWinner(scorer);
            setPhase("gameover");
            setConfettiParticles([]);
          }, GOAL_CELEBRATE_MS);
        } else {
          setTimeout(() => {
            setRoundWins([...newRoundWins]);
            setRoundWinner(scorer);
            setConfettiParticles([]);
            setPhase("roundover");
          }, GOAL_CELEBRATE_MS);
        }
      } else {
        setTimeout(() => {
          resetPositionsRef.current?.();
          setConfettiParticles([]);
          setPhase("playing");
        }, GOAL_CELEBRATE_MS);
      }
    },
    [p1Names, p2Names, p1ActiveIdx, p2ActiveIdx, triggerGoalEffects],
  );

  // ── Start next round ──────────────────────────────────────────────────────
  const startNextRound = useCallback(() => {
    scoreRef.current = [0, 0];
    setDisplayScore([0, 0]);
    setConfettiParticles([]);
    setRoundNumber((prev) => prev + 1);
    setRoundWinner(null);
    setPossession({ team: null, skaterIdx: 0 });
    resetPositionsRef.current?.();
    setPhase("playing");
  }, []);

  // ── Start game ────────────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    scoreRef.current = [0, 0];
    roundWinsRef.current = [0, 0];
    roundNumberRef.current = 1;
    setDisplayScore([0, 0]);
    setRoundWins([0, 0]);
    setRoundNumber(1);
    setWinner(null);
    setWinnerName("");
    setSubmitted(false);
    setRoundWinner(null);
    setConfettiParticles([]);
    setPossession({ team: null, skaterIdx: 0 });
    setP1ActiveIdx(0);
    setP2ActiveIdx(0);
    resetPositionsRef.current?.();
    setPhase("playing");
  }, []);

  const restartGame = useCallback(() => {
    startGame();
  }, [startGame]);

  // ── Space key to start ────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        (e.code === "Space" || e.key === " ") &&
        phaseRef.current === "start"
      ) {
        e.preventDefault();
        startGame();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [startGame]);

  // ── Score submission ──────────────────────────────────────────────────────
  const handleSubmitScore = async () => {
    if (!winnerName.trim() || !winner) return;
    const score = BigInt(scoreRef.current[winner - 1]);
    await addScore.mutateAsync({ playerName: winnerName.trim(), score });
    await refetchScores();
    setSubmitted(true);
  };

  const isRunning = phase === "playing";

  // Active skater names for HUD
  const p1ActiveName = p1Names[p1ActiveIdx];
  const p2ActiveName = p2Names[p2ActiveIdx];

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background select-none">
      <div
        style={{
          width: "100%",
          maxWidth: "1100px",
          aspectRatio: "16/9",
          position: "relative",
        }}
        className="mx-auto"
      >
        {/* ── 3D Canvas ── */}
        <Canvas
          shadows
          data-ocid="game.canvas_target"
          style={{ width: "100%", height: "100%", borderRadius: "0.5rem" }}
          camera={{ position: [0, 14, 10], fov: 55 }}
          onCreated={({ camera }) => {
            camera.lookAt(0, 0, -1);
          }}
        >
          <GameScene
            running={isRunning}
            onGoal={handleGoal}
            onResetPositions={(fn) => {
              resetPositionsRef.current = fn;
            }}
            onPossessionChange={(team, skaterIdx) =>
              setPossession({ team, skaterIdx })
            }
            onBodyCheck={handleBodyCheck}
            p1Characters={p1Characters}
            p2Characters={p2Characters}
            p1ActiveIdx={p1ActiveIdx}
            p2ActiveIdx={p2ActiveIdx}
            onP1ActiveChange={setP1ActiveIdx}
            onP2ActiveChange={setP2ActiveIdx}
            cpuEnabled={gameMode === "cpu"}
            cpuDifficulty={cpuDifficulty}
          />
        </Canvas>

        {/* ── HUD overlay ── */}
        {(phase === "playing" || phase === "goal") && (
          <div
            className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1 pointer-events-none"
            style={{
              background: "rgba(6, 14, 34, 0.85)",
              border: "1px solid rgba(0,229,255,0.3)",
              boxShadow: "0 0 12px rgba(0,229,255,0.15)",
              borderRadius: "0.5rem",
              padding: "6px 24px",
            }}
          >
            <div className="flex items-center gap-4">
              {/* P1 GK badge */}
              <span
                style={{
                  fontSize: "7px",
                  fontWeight: 900,
                  letterSpacing: "0.06em",
                  background: `${P1_COLOR}20`,
                  border: `1px solid ${P1_COLOR}60`,
                  borderRadius: "3px",
                  padding: "1px 4px",
                  color: P1_COLOR,
                  fontFamily: "var(--font-display, monospace)",
                  textShadow: `0 0 4px ${P1_COLOR}`,
                }}
              >
                GK
              </span>
              <span
                className="font-display font-black text-2xl"
                style={{ color: P1_COLOR, textShadow: `0 0 10px ${P1_COLOR}` }}
              >
                {displayScore[0]}
              </span>
              <span
                className="font-body text-sm"
                style={{ color: "rgba(255,255,255,0.5)" }}
              >
                —
              </span>
              <span
                className="font-display font-black text-2xl"
                style={{ color: P2_COLOR, textShadow: `0 0 10px ${P2_COLOR}` }}
              >
                {displayScore[1]}
              </span>
              {/* P2 GK badge */}
              <span
                style={{
                  fontSize: "7px",
                  fontWeight: 900,
                  letterSpacing: "0.06em",
                  background: `${P2_COLOR}20`,
                  border: `1px solid ${P2_COLOR}60`,
                  borderRadius: "3px",
                  padding: "1px 4px",
                  color: P2_COLOR,
                  fontFamily: "var(--font-display, monospace)",
                  textShadow: `0 0 4px ${P2_COLOR}`,
                }}
              >
                GK
              </span>
            </div>
            {/* Round win dots */}
            <div
              className="flex items-center gap-3 text-xs font-body"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              <span>ROUND {roundNumber}</span>
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background:
                        i < roundWins[0] ? P1_COLOR : "rgba(255,255,255,0.2)",
                    }}
                  />
                ))}
              </div>
              <span style={{ color: "rgba(255,255,255,0.2)" }}>|</span>
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background:
                        i < roundWins[1] ? P2_COLOR : "rgba(255,255,255,0.2)",
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Possession indicator */}
            {possession.team !== null && (
              <div
                className="flex items-center gap-1 text-xs font-display font-bold mt-0.5"
                style={{
                  color: possession.team === 1 ? P1_COLOR : P2_COLOR,
                  textShadow: `0 0 8px ${possession.team === 1 ? P1_COLOR : P2_COLOR}`,
                  transition: "color 0.2s",
                }}
              >
                <span style={{ fontSize: "9px" }}>●</span>
                <span>
                  SLOT {possession.skaterIdx + 1} (
                  {possession.team === 1
                    ? p1Names[possession.skaterIdx]
                    : p2Names[possession.skaterIdx]}
                  ) HAS PUCK
                </span>
              </div>
            )}

            {/* Ability tags for active skaters */}
            <div
              style={{
                display: "flex",
                gap: "1rem",
                fontSize: "9px",
                color: "rgba(255,255,255,0.35)",
                fontFamily: "var(--font-display, monospace)",
                letterSpacing: "0.06em",
                alignItems: "center",
              }}
            >
              <span style={{ color: `${P1_COLOR}99` }}>
                {p1ActiveName}:{" "}
                {CHARACTER_ROSTER[p1Characters[p1ActiveIdx]].stats.abilityTag}
              </span>
              <span style={{ color: `${P2_COLOR}99` }}>
                {p2ActiveName}:{" "}
                {CHARACTER_ROSTER[p2Characters[p2ActiveIdx]].stats.abilityTag}
              </span>
              {gameMode === "cpu" && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "3px",
                    background: `${P2_COLOR}22`,
                    border: `1px solid ${P2_COLOR}88`,
                    borderRadius: "4px",
                    padding: "1px 5px",
                    fontSize: "8px",
                    color: P2_COLOR,
                    fontWeight: 900,
                    letterSpacing: "0.08em",
                    textShadow: `0 0 6px ${P2_COLOR}`,
                  }}
                >
                  CPU · {cpuDifficulty.toUpperCase()}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Controls hint ── */}
        {phase === "playing" && (
          <div
            className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none z-10 flex gap-6 text-xs font-body"
            style={{ color: "rgba(255,255,255,0.3)" }}
          >
            <span style={{ color: "rgba(255,58,45,0.6)" }}>
              P1: WASD · SPACE shoot · Q check · TAB switch skater
            </span>
            {gameMode === "cpu" ? (
              <span style={{ color: `${P2_COLOR}99` }}>CPU controlling P2</span>
            ) : (
              <span style={{ color: "rgba(61,127,255,0.6)" }}>
                P2: ↑↓←→ · ENTER shoot · SHIFT check · RCTRL switch
              </span>
            )}
          </div>
        )}

        {/* ── Screen Flash ── */}
        <div
          className="absolute inset-0 pointer-events-none rounded-lg"
          style={{
            background: "white",
            opacity: showFlash ? 0.7 : 0,
            transition: showFlash
              ? "opacity 50ms ease-in"
              : "opacity 500ms ease-out",
            zIndex: 10,
          }}
        />

        {/* ── Confetti ── */}
        {confettiParticles.map((p) => (
          <div
            key={p.id}
            className="absolute pointer-events-none"
            style={{
              left: `${(p.x / 900) * 100}%`,
              top: `${(p.y / 560) * 100}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              backgroundColor: p.color,
              transform: `rotate(${p.rotation}deg)`,
              opacity: Math.min(1, p.life * 2),
              borderRadius: p.id % 3 === 0 ? "50%" : "1px",
              zIndex: 20,
            }}
          />
        ))}

        {/* ── Body Check Flash ── */}
        {checkMsg && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ zIndex: 25 }}
          >
            <div
              className="font-display font-black tracking-widest"
              style={{
                fontSize: "clamp(1.4rem, 4vw, 2.5rem)",
                color: checkMsg.color,
                textShadow: `0 0 16px ${checkMsg.color}, 0 0 32px ${checkMsg.color}60, 0 3px 8px rgba(0,0,0,0.9)`,
                animation: "checkPop 0.9s ease-out forwards",
              }}
            >
              {checkMsg.text}
            </div>
          </div>
        )}

        {/* ── GOAL Animation ── */}
        {phase === "goal" && (
          <>
            <style>{`
              @keyframes checkPop {
                0%   { transform: scale(1.3) translateY(-8px); opacity: 0; }
                15%  { transform: scale(1.0) translateY(0); opacity: 1; }
                60%  { transform: scale(1.0) translateY(0); opacity: 1; }
                100% { transform: scale(0.9) translateY(-6px); opacity: 0; }
              }
              @keyframes goalPop {
                0%   { transform: scale(2.5); opacity: 0; }
                15%  { transform: scale(0.9); opacity: 1; }
                25%  { transform: scale(1.08); opacity: 1; }
                35%  { transform: scale(0.97); opacity: 1; }
                45%  { transform: scale(1.02); opacity: 1; }
                55%  { transform: scale(1); opacity: 1; }
                80%  { transform: scale(1); opacity: 1; }
                100% { transform: scale(1.05); opacity: 0; }
              }
              @keyframes scorerSlideUp {
                0%   { transform: translateY(20px); opacity: 0; }
                30%  { transform: translateY(-4px); opacity: 1; }
                50%  { transform: translateY(0px); opacity: 1; }
                80%  { transform: translateY(0px); opacity: 1; }
                100% { transform: translateY(-8px); opacity: 0; }
              }
            `}</style>
            <div
              className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
              style={{ zIndex: 30 }}
            >
              <div
                className="font-display font-black tracking-widest"
                style={{
                  fontSize: "clamp(3rem, 10vw, 6rem)",
                  color: goalScorer === 1 ? P1_COLOR : P2_COLOR,
                  textShadow:
                    goalScorer === 1
                      ? `0 0 20px ${P1_COLOR}, 0 0 40px ${P1_COLOR}, 0 0 80px rgba(255,58,45,0.4), 0 4px 12px rgba(0,0,0,0.8)`
                      : `0 0 20px ${P2_COLOR}, 0 0 40px ${P2_COLOR}, 0 0 80px rgba(61,127,255,0.4), 0 4px 12px rgba(0,0,0,0.8)`,
                  animation: `goalPop ${GOAL_CELEBRATE_MS}ms ease-out forwards`,
                  lineHeight: 1,
                  letterSpacing: "0.1em",
                }}
              >
                GOAL!
              </div>
              <div
                className="font-display font-bold tracking-widest mt-2"
                style={{
                  fontSize: "clamp(1.1rem, 3.5vw, 2rem)",
                  color: "rgba(255,255,255,0.95)",
                  textShadow: "0 2px 8px rgba(0,0,0,0.9)",
                  animation: `scorerSlideUp ${GOAL_CELEBRATE_MS}ms ease-out forwards`,
                  animationDelay: "80ms",
                  opacity: 0,
                }}
              >
                {goalMessage} SCORES
              </div>
            </div>
          </>
        )}

        {/* ── START SCREEN ── */}
        {phase === "start" && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-between py-4 px-3 rounded-lg bg-black/70 backdrop-blur-sm overflow-y-auto"
            style={{ zIndex: 50 }}
          >
            <div className="flex flex-col items-center mt-1">
              <h1
                className="font-display text-4xl font-black tracking-tight"
                style={{ color: NEON_CYAN }}
              >
                ICE HOCKEY 3v3
              </h1>
              <p
                className="text-xs font-body mt-0.5"
                style={{ color: "rgba(255,255,255,0.5)" }}
              >
                FIRST TO {WINS_TO_WIN} GOALS · BEST OF{" "}
                {ROUNDS_TO_WIN_MATCH * 2 - 1} ROUNDS
              </p>

              {/* Mode toggle */}
              <div
                className="flex gap-1 mt-2 p-0.5 rounded-lg"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                <button
                  type="button"
                  data-ocid="game.mode_2p.toggle"
                  onClick={() => setGameMode("2p")}
                  className="font-display font-black text-xs px-4 py-1.5 rounded-md tracking-widest transition-all"
                  style={{
                    background:
                      gameMode === "2p"
                        ? "rgba(255,255,255,0.15)"
                        : "transparent",
                    color: gameMode === "2p" ? "#fff" : "rgba(255,255,255,0.4)",
                    border:
                      gameMode === "2p"
                        ? "1px solid rgba(255,255,255,0.3)"
                        : "1px solid transparent",
                    boxShadow:
                      gameMode === "2p"
                        ? "0 0 8px rgba(255,255,255,0.1)"
                        : "none",
                  }}
                >
                  2 PLAYERS
                </button>
                <button
                  type="button"
                  data-ocid="game.mode_cpu.toggle"
                  onClick={() => setGameMode("cpu")}
                  className="font-display font-black text-xs px-4 py-1.5 rounded-md tracking-widest transition-all"
                  style={{
                    background:
                      gameMode === "cpu" ? `${P2_COLOR}22` : "transparent",
                    color:
                      gameMode === "cpu" ? P2_COLOR : "rgba(255,255,255,0.4)",
                    border:
                      gameMode === "cpu"
                        ? `1px solid ${P2_COLOR}66`
                        : "1px solid transparent",
                    boxShadow:
                      gameMode === "cpu" ? `0 0 8px ${P2_COLOR}33` : "none",
                  }}
                >
                  VS CPU
                </button>
              </div>
            </div>

            <div className="flex gap-4 items-start w-full max-w-5xl">
              {/* P1 Panel */}
              <TeamSetupPanel
                teamLabel="PLAYER 1"
                teamColor={P1_COLOR}
                teamBg="rgba(255,58,45,0.08)"
                characters={p1Characters}
                names={p1Names}
                onCharacterChange={(slot, idx) => {
                  const next = [...p1Characters] as [number, number, number];
                  next[slot] = idx;
                  setP1Characters(next);
                }}
                onNameChange={(slot, name) => {
                  const next = [...p1Names] as [string, string, string];
                  next[slot] = name;
                  setP1Names(next);
                }}
                controlsGrid={
                  <div
                    className="grid grid-cols-3 gap-1 text-center text-xs mt-1"
                    style={{ color: "rgba(255,255,255,0.7)" }}
                  >
                    <div />
                    <div className="bg-white/10 rounded px-1 py-0.5">W</div>
                    <div />
                    <div className="bg-white/10 rounded px-1 py-0.5">A</div>
                    <div className="bg-white/10 rounded px-1 py-0.5">S</div>
                    <div className="bg-white/10 rounded px-1 py-0.5">D</div>
                  </div>
                }
                controlsHint="SPACE shoot · Q check · TAB switch"
                ocidPrefix="game.p1"
              />

              {/* Center: Play button + mode controls */}
              <div className="flex flex-col items-center gap-2 pt-8">
                <Button
                  data-ocid="game.start_button"
                  onClick={startGame}
                  className="font-display font-black text-lg px-6 py-3 h-auto tracking-widest whitespace-nowrap"
                  style={{
                    background: "oklch(0.85 0.18 195)",
                    color: "#04080f",
                    boxShadow: "0 0 20px oklch(0.85 0.18 195 / 0.5)",
                  }}
                >
                  ▶ PLAY
                </Button>
                <span
                  className="text-xs"
                  style={{ color: "rgba(255,255,255,0.35)" }}
                >
                  or SPACE
                </span>
              </div>

              {/* P2 Panel or CPU Panel */}
              {gameMode === "2p" ? (
                <TeamSetupPanel
                  teamLabel="PLAYER 2"
                  teamColor={P2_COLOR}
                  teamBg="rgba(61,127,255,0.08)"
                  characters={p2Characters}
                  names={p2Names}
                  onCharacterChange={(slot, idx) => {
                    const next = [...p2Characters] as [number, number, number];
                    next[slot] = idx;
                    setP2Characters(next);
                  }}
                  onNameChange={(slot, name) => {
                    const next = [...p2Names] as [string, string, string];
                    next[slot] = name;
                    setP2Names(next);
                  }}
                  controlsGrid={
                    <div
                      className="grid grid-cols-3 gap-1 text-center text-xs mt-1"
                      style={{ color: "rgba(255,255,255,0.7)" }}
                    >
                      <div />
                      <div className="bg-white/10 rounded px-1 py-0.5">↑</div>
                      <div />
                      <div className="bg-white/10 rounded px-1 py-0.5">←</div>
                      <div className="bg-white/10 rounded px-1 py-0.5">↓</div>
                      <div className="bg-white/10 rounded px-1 py-0.5">→</div>
                    </div>
                  }
                  controlsHint="ENTER shoot · SHIFT check · RCTRL switch"
                  ocidPrefix="game.p2"
                />
              ) : (
                <CpuTeamPanel
                  teamColor={P2_COLOR}
                  teamBg="rgba(61,127,255,0.08)"
                  difficulty={cpuDifficulty}
                  onDifficultyChange={setCpuDifficulty}
                  characters={p2Characters}
                  onCharacterChange={(slot, idx) => {
                    const next = [...p2Characters] as [number, number, number];
                    next[slot] = idx;
                    setP2Characters(next);
                  }}
                />
              )}
            </div>

            <LeaderboardPanel scores={topScores} />
          </div>
        )}

        {/* ── ROUND OVER ── */}
        {phase === "roundover" && roundWinner && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-6 rounded-lg bg-black/75 backdrop-blur-sm"
            style={{ zIndex: 40 }}
          >
            <div className="flex flex-col items-center gap-2">
              <p
                style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.85rem" }}
                className="font-body tracking-widest"
              >
                ROUND {roundNumber} COMPLETE
              </p>
              <h2
                className="font-display font-black text-5xl tracking-tight"
                style={{
                  color: roundWinner === 1 ? P1_COLOR : P2_COLOR,
                  textShadow:
                    roundWinner === 1
                      ? "0 0 20px rgba(255,58,45,0.8), 0 0 40px rgba(255,58,45,0.4)"
                      : "0 0 20px rgba(61,127,255,0.8), 0 0 40px rgba(61,127,255,0.4)",
                }}
              >
                {roundWinner === 1 ? p1Names[0] : p2Names[0]}'S TEAM WINS
              </h2>
              <p
                className="font-display text-xl font-bold mt-1"
                style={{ color: "rgba(255,255,255,0.7)" }}
              >
                Round Wins: P1 {roundWins[0]} — P2 {roundWins[1]}
              </p>
              <p
                style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.8rem" }}
                className="font-body"
              >
                First to {ROUNDS_TO_WIN_MATCH} rounds wins the match
              </p>
            </div>
            <Button
              data-ocid="game.next_round_button"
              onClick={startNextRound}
              className="font-display font-black text-lg px-10 py-3 h-auto tracking-widest"
              style={{
                background: "oklch(0.85 0.18 195)",
                color: "#04080f",
                boxShadow: "0 0 20px oklch(0.85 0.18 195 / 0.5)",
              }}
            >
              NEXT ROUND ▶
            </Button>
          </div>
        )}

        {/* ── GAME OVER ── */}
        {phase === "gameover" && winner && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-between py-6 rounded-lg bg-black/75 backdrop-blur-sm"
            style={{ zIndex: 50 }}
          >
            <div className="flex flex-col items-center mt-4">
              <p
                className="font-body text-sm mb-1"
                style={{ color: "rgba(255,255,255,0.5)" }}
              >
                GAME OVER
              </p>
              <h2
                className="font-display font-black text-5xl tracking-tight"
                style={{
                  color: winner === 1 ? P1_COLOR : P2_COLOR,
                  textShadow:
                    winner === 1
                      ? "0 0 20px rgba(255,58,45,0.8), 0 0 40px rgba(255,58,45,0.4)"
                      : "0 0 20px rgba(61,127,255,0.8), 0 0 40px rgba(61,127,255,0.4)",
                }}
              >
                {winner === 1 ? "P1" : "P2"}'S TEAM WINS!
              </h2>
              <p
                className="font-display text-2xl font-bold mt-2"
                style={{ color: NEON_CYAN }}
              >
                {displayScore[0]} — {displayScore[1]}
              </p>
            </div>

            <div className="flex flex-col items-center gap-3 w-full max-w-xs">
              {!submitted ? (
                <>
                  <p
                    className="font-body text-sm"
                    style={{ color: "rgba(255,255,255,0.6)" }}
                  >
                    Enter the winner's name for the leaderboard
                  </p>
                  <Input
                    data-ocid="game.name_input"
                    value={winnerName}
                    onChange={(e) => setWinnerName(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") handleSubmitScore();
                    }}
                    placeholder="Enter name..."
                    className="text-center font-display font-bold text-lg bg-white/5 border-white/20 text-white"
                    maxLength={20}
                  />
                  <Button
                    data-ocid="game.submit_button"
                    onClick={handleSubmitScore}
                    disabled={!winnerName.trim() || addScore.isPending}
                    className="w-full font-display font-black tracking-wider"
                    style={{
                      background: winner === 1 ? P1_COLOR : P2_COLOR,
                      color: "#fff",
                    }}
                  >
                    {addScore.isPending ? "SAVING..." : "SUBMIT SCORE"}
                  </Button>
                </>
              ) : (
                <p
                  className="font-display font-bold text-lg"
                  style={{ color: NEON_CYAN }}
                >
                  ✓ Score saved!
                </p>
              )}
              <Button
                data-ocid="game.restart_button"
                variant="outline"
                onClick={restartGame}
                className="w-full font-display font-black tracking-wider border-white/20 text-white hover:bg-white/10"
              >
                PLAY AGAIN
              </Button>
            </div>

            <LeaderboardPanel scores={topScores} compact />
          </div>
        )}
      </div>

      {/* Footer */}
      <footer
        className="mt-3 text-xs font-body"
        style={{ color: "rgba(255,255,255,0.25)" }}
      >
        © {new Date().getFullYear()}. Built with love using{" "}
        <a
          href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
          style={{ color: "rgba(255,255,255,0.4)" }}
        >
          caffeine.ai
        </a>
      </footer>
    </div>
  );
}

// ─── Team Setup Panel ─────────────────────────────────────────────────────────

interface TeamSetupPanelProps {
  teamLabel: string;
  teamColor: string;
  teamBg: string;
  characters: [number, number, number];
  names: [string, string, string];
  onCharacterChange: (slot: 0 | 1 | 2, charIdx: number) => void;
  onNameChange: (slot: 0 | 1 | 2, name: string) => void;
  controlsGrid: React.ReactNode;
  controlsHint: string;
  ocidPrefix: string;
}

function TeamSetupPanel({
  teamLabel,
  teamColor,
  teamBg,
  characters,
  names,
  onCharacterChange,
  onNameChange,
  controlsGrid,
  controlsHint,
  ocidPrefix,
}: TeamSetupPanelProps) {
  const slots: (0 | 1 | 2)[] = [0, 1, 2];

  return (
    <div
      className="flex-1 p-2 rounded-lg border"
      style={{
        background: teamBg,
        borderColor: teamColor,
        boxShadow: `0 0 12px ${teamColor}4d`,
      }}
    >
      <p
        className="font-display font-bold mb-2 text-sm text-center"
        style={{ color: teamColor }}
      >
        {teamLabel}
      </p>

      {slots.map((slot) => (
        <div key={slot} className="mb-2">
          {/* Slot label */}
          <div className="flex items-center gap-2 mb-1">
            <span
              className="font-display font-bold"
              style={{
                fontSize: "9px",
                color: teamColor,
                letterSpacing: "0.06em",
              }}
            >
              SLOT {slot + 1}
            </span>
            <div style={{ flex: 1, height: 1, background: `${teamColor}30` }} />
          </div>

          {/* Horizontal scrollable character cards */}
          <div
            className="flex gap-1 overflow-x-auto pb-1"
            style={{ scrollbarWidth: "none" }}
          >
            {CHARACTER_ROSTER.map((char, idx) => {
              const selected = characters[slot] === idx;
              return (
                <button
                  // biome-ignore lint/suspicious/noArrayIndexKey: static roster
                  key={idx}
                  type="button"
                  data-ocid={`${ocidPrefix}.slot${slot + 1}.item.${idx + 1}`}
                  onClick={() => onCharacterChange(slot, idx)}
                  className="flex-none flex flex-col items-center gap-0.5 rounded cursor-pointer transition-all"
                  style={{
                    width: "44px",
                    padding: "4px 2px",
                    background: selected
                      ? `${teamColor}30`
                      : "rgba(255,255,255,0.04)",
                    border: `1px solid ${selected ? teamColor : "rgba(255,255,255,0.12)"}`,
                    boxShadow: selected ? `0 0 6px ${teamColor}60` : "none",
                  }}
                >
                  <span
                    className="font-display font-black leading-none"
                    style={{
                      fontSize: "9px",
                      color: selected ? "#fff" : "rgba(255,255,255,0.4)",
                    }}
                  >
                    #{char.jerseyNumber}
                  </span>
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: char.helmetAccent,
                      boxShadow: selected
                        ? `0 0 5px ${char.helmetAccent}`
                        : "none",
                    }}
                  />
                  <span
                    className="font-display font-bold text-center leading-tight"
                    style={{
                      fontSize: "6px",
                      color: selected
                        ? "rgba(255,255,255,0.85)"
                        : "rgba(255,255,255,0.3)",
                      maxWidth: "40px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {char.fakeName.split(" ")[0]}
                  </span>
                  <span
                    style={{
                      fontSize: "5px",
                      color: char.helmetAccent,
                      fontWeight: 700,
                      letterSpacing: "0.03em",
                      textTransform: "uppercase",
                      textAlign: "center",
                      lineHeight: 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {char.stats.abilityTag.split(" ")[0]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Selected char ability desc */}
          <p
            style={{
              fontSize: "8px",
              color: "rgba(255,255,255,0.4)",
              lineHeight: 1.3,
              minHeight: "1.6em",
              marginBottom: "2px",
            }}
          >
            <span
              style={{
                color: CHARACTER_ROSTER[characters[slot]].helmetAccent,
                fontWeight: 700,
              }}
            >
              {CHARACTER_ROSTER[characters[slot]].stats.abilityTag}
            </span>
            {" — "}
            {CHARACTER_ROSTER[characters[slot]].stats.abilityDesc}
          </p>

          {/* Name input */}
          <Input
            data-ocid={`${ocidPrefix}.slot${slot + 1}.input`}
            value={names[slot]}
            onChange={(e) =>
              onNameChange(
                slot,
                e.target.value || CHARACTER_ROSTER[characters[slot]].fakeName,
              )
            }
            onKeyDown={(e) => e.stopPropagation()}
            placeholder={`Slot ${slot + 1} name...`}
            className="text-xs bg-white/5 border-white/20 text-white h-7"
            maxLength={20}
          />
        </div>
      ))}

      {/* Controls */}
      {controlsGrid}
      <p
        className="text-xs mt-1 text-center"
        style={{ color: "rgba(255,255,255,0.35)", fontSize: "9px" }}
      >
        {controlsHint}
      </p>
    </div>
  );
}

// ─── CPU Team Panel ───────────────────────────────────────────────────────────

interface CpuTeamPanelProps {
  teamColor: string;
  teamBg: string;
  difficulty: CpuDifficulty;
  onDifficultyChange: (d: CpuDifficulty) => void;
  characters: [number, number, number];
  onCharacterChange: (slot: 0 | 1 | 2, charIdx: number) => void;
}

function CpuTeamPanel({
  teamColor,
  teamBg,
  difficulty,
  onDifficultyChange,
  characters,
  onCharacterChange,
}: CpuTeamPanelProps) {
  const slots: (0 | 1 | 2)[] = [0, 1, 2];
  const diffOptions: { key: CpuDifficulty; label: string; desc: string }[] = [
    { key: "easy", label: "EASY", desc: "Slow reaction, aim errors" },
    { key: "medium", label: "MEDIUM", desc: "Balanced challenge" },
    { key: "hard", label: "HARD", desc: "Precise & relentless" },
  ];

  return (
    <div
      className="flex-1 p-2 rounded-lg border"
      style={{
        background: teamBg,
        borderColor: teamColor,
        boxShadow: `0 0 12px ${teamColor}4d`,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-center gap-2 mb-2">
        <span
          className="font-display font-black text-sm tracking-widest"
          style={{ color: teamColor }}
        >
          CPU TEAM
        </span>
        <span
          style={{
            fontSize: "9px",
            background: `${teamColor}22`,
            border: `1px solid ${teamColor}55`,
            borderRadius: "4px",
            padding: "1px 5px",
            color: teamColor,
            fontWeight: 900,
            letterSpacing: "0.06em",
          }}
        >
          AI
        </span>
      </div>

      {/* Difficulty selector */}
      <div className="mb-3">
        <p
          className="font-display font-bold text-center mb-1"
          style={{
            fontSize: "9px",
            color: "rgba(255,255,255,0.5)",
            letterSpacing: "0.08em",
          }}
        >
          DIFFICULTY
        </p>
        <div className="flex gap-1">
          {diffOptions.map(({ key, label }) => {
            const selected = difficulty === key;
            const diffColor =
              key === "easy"
                ? "#00ff88"
                : key === "medium"
                  ? "#ffbb00"
                  : "#ff4444";
            return (
              <button
                key={key}
                type="button"
                data-ocid={`game.cpu.${key}.toggle`}
                onClick={() => onDifficultyChange(key)}
                className="flex-1 font-display font-black rounded transition-all"
                style={{
                  fontSize: "10px",
                  padding: "5px 2px",
                  letterSpacing: "0.06em",
                  background: selected
                    ? `${diffColor}22`
                    : "rgba(255,255,255,0.04)",
                  border: `1px solid ${selected ? diffColor : "rgba(255,255,255,0.1)"}`,
                  color: selected ? diffColor : "rgba(255,255,255,0.35)",
                  boxShadow: selected ? `0 0 6px ${diffColor}44` : "none",
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p
          style={{
            fontSize: "8px",
            color: "rgba(255,255,255,0.3)",
            textAlign: "center",
            marginTop: "3px",
          }}
        >
          {diffOptions.find((d) => d.key === difficulty)?.desc}
        </p>
      </div>

      {/* CPU character roster (pick 3 slots) */}
      {slots.map((slot) => (
        <div key={slot} className="mb-2">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="font-display font-bold"
              style={{
                fontSize: "9px",
                color: teamColor,
                letterSpacing: "0.06em",
              }}
            >
              SLOT {slot + 1}
            </span>
            <div style={{ flex: 1, height: 1, background: `${teamColor}30` }} />
          </div>
          <div
            className="flex gap-1 overflow-x-auto pb-1"
            style={{ scrollbarWidth: "none" }}
          >
            {CHARACTER_ROSTER.map((char, idx) => {
              const selected = characters[slot] === idx;
              return (
                <button
                  // biome-ignore lint/suspicious/noArrayIndexKey: static roster
                  key={idx}
                  type="button"
                  data-ocid={`game.cpu.slot${slot + 1}.item.${idx + 1}`}
                  onClick={() => onCharacterChange(slot, idx)}
                  className="flex-none flex flex-col items-center gap-0.5 rounded cursor-pointer transition-all"
                  style={{
                    width: "44px",
                    padding: "4px 2px",
                    background: selected
                      ? `${teamColor}30`
                      : "rgba(255,255,255,0.04)",
                    border: `1px solid ${selected ? teamColor : "rgba(255,255,255,0.12)"}`,
                    boxShadow: selected ? `0 0 6px ${teamColor}60` : "none",
                  }}
                >
                  <span
                    className="font-display font-black leading-none"
                    style={{
                      fontSize: "9px",
                      color: selected ? "#fff" : "rgba(255,255,255,0.4)",
                    }}
                  >
                    #{char.jerseyNumber}
                  </span>
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: char.helmetAccent,
                      boxShadow: selected
                        ? `0 0 5px ${char.helmetAccent}`
                        : "none",
                    }}
                  />
                  <span
                    className="font-display font-bold text-center leading-tight"
                    style={{
                      fontSize: "6px",
                      color: selected
                        ? "rgba(255,255,255,0.85)"
                        : "rgba(255,255,255,0.3)",
                      maxWidth: "40px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {char.fakeName.split(" ")[0]}
                  </span>
                  <span
                    style={{
                      fontSize: "5px",
                      color: char.helmetAccent,
                      fontWeight: 700,
                      letterSpacing: "0.03em",
                      textTransform: "uppercase",
                      textAlign: "center",
                      lineHeight: 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {char.stats.abilityTag.split(" ")[0]}
                  </span>
                </button>
              );
            })}
          </div>
          <p
            style={{
              fontSize: "8px",
              color: "rgba(255,255,255,0.4)",
              lineHeight: 1.3,
              minHeight: "1.6em",
              marginBottom: "2px",
            }}
          >
            <span
              style={{
                color: CHARACTER_ROSTER[characters[slot]].helmetAccent,
                fontWeight: 700,
              }}
            >
              {CHARACTER_ROSTER[characters[slot]].stats.abilityTag}
            </span>
            {" — "}
            {CHARACTER_ROSTER[characters[slot]].stats.abilityDesc}
          </p>
        </div>
      ))}

      {/* AI flavor text */}
      <div
        className="mt-1 rounded text-center font-body"
        style={{
          fontSize: "8px",
          color: "rgba(255,255,255,0.3)",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)",
          padding: "4px 6px",
          lineHeight: 1.4,
        }}
      >
        CPU auto-switches active skater, chases puck, shoots on goal &amp; body
        checks
      </div>
    </div>
  );
}

// ─── Leaderboard Panel ────────────────────────────────────────────────────────

function LeaderboardPanel({
  scores,
  compact = false,
}: {
  scores: Array<{ score: bigint; playerName: string }> | undefined;
  compact?: boolean;
}) {
  const maxRows = compact ? 5 : 8;
  const rows = scores?.slice(0, maxRows) ?? [];

  return (
    <div
      className="w-full max-w-sm rounded-lg border overflow-hidden"
      style={{
        background: "rgba(6, 14, 34, 0.8)",
        borderColor: "rgba(0, 229, 255, 0.3)",
        boxShadow: "0 0 16px rgba(0, 229, 255, 0.1)",
      }}
    >
      <div
        className="px-3 py-2 border-b"
        style={{ borderColor: "rgba(0, 229, 255, 0.2)" }}
      >
        <h3
          className="font-display font-bold text-sm tracking-widest text-center"
          style={{ color: NEON_CYAN }}
        >
          LEADERBOARD
        </h3>
      </div>
      <Table>
        <TableHeader>
          <TableRow style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            <TableHead
              className="w-8 text-center font-display text-xs"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              #
            </TableHead>
            <TableHead
              className="font-display text-xs"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              NAME
            </TableHead>
            <TableHead
              className="text-right font-display text-xs"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              SCORE
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={3}
                className="text-center text-xs font-body py-4"
                style={{ color: "rgba(255,255,255,0.3)" }}
              >
                No scores yet — be the first!
              </TableCell>
            </TableRow>
          ) : (
            rows.map((entry, i) => (
              <TableRow
                // biome-ignore lint/suspicious/noArrayIndexKey: leaderboard rows are static display only
                key={entry.playerName + i}
                style={{ borderColor: "rgba(255,255,255,0.06)" }}
              >
                <TableCell
                  className="text-center font-display font-bold text-xs"
                  style={{
                    color:
                      i === 0
                        ? "#ffe000"
                        : i === 1
                          ? "#c0c0c0"
                          : i === 2
                            ? "#cd7f32"
                            : "rgba(255,255,255,0.4)",
                  }}
                >
                  {i + 1}
                </TableCell>
                <TableCell
                  className="font-display font-semibold text-sm"
                  style={{ color: "rgba(255,255,255,0.85)" }}
                >
                  {entry.playerName}
                </TableCell>
                <TableCell
                  className="text-right font-display font-bold text-sm"
                  style={{ color: NEON_CYAN }}
                >
                  {entry.score.toString()}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
