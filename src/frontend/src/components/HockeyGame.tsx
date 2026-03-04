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
import React, { useRef, useEffect, useState, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

type GamePhase = "start" | "playing" | "goal" | "roundover" | "gameover";

interface ConfettiParticle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  spin: number;
  color: string;
  life: number; // 0–1, decreases to 0
  size: number;
}

interface Vec2 {
  x: number;
  y: number;
}

interface GameState {
  puck: Vec2;
  puckVel: Vec2;
  p1: Vec2;
  p1Vel: Vec2;
  p2: Vec2;
  p2Vel: Vec2;
  p1Angle: number;
  p2Angle: number;
  score: [number, number];
  roundWins: [number, number];
  keys: Set<string>;
  lastTime: number;
  goalScorer: 1 | 2 | null;
  goalFlashTimer: number;
  animFrameId: number;
  running: boolean;
  puckLastVel: Vec2;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CANVAS_W = 900;
const CANVAS_H = 560;
const RINK_MARGIN_X = 60;
const RINK_MARGIN_Y = 40;
const RINK_W = CANVAS_W - RINK_MARGIN_X * 2;
const RINK_H = CANVAS_H - RINK_MARGIN_Y * 2;
const PUCK_R = 13;
const PADDLE_R = 28;
const MAX_PUCK_SPEED = 750;
const PUCK_FRICTION = 0.985;
const PADDLE_SPEED = 420;
const GOAL_H = 140;
const GOAL_Y = RINK_MARGIN_Y + (RINK_H - GOAL_H) / 2;
const GOAL_DEPTH = 30;
const WINS_TO_WIN = 7;
const ROUNDS_TO_WIN_MATCH = 3;
const GOAL_CELEBRATE_MS = 2200;

// ─── Perspective Constants ────────────────────────────────────────────────────
// Camera at bottom of screen, looking up the rink (Y axis becomes depth)
// Near edge = physics Y = RINK_MARGIN_Y (top of screen in top-down) → renders at SCREEN_NEAR_Y
// Far edge = physics Y = RINK_MARGIN_Y + RINK_H → renders at HORIZON_Y
const HORIZON_Y = 130; // where far end of rink converges (screen pixels)
const SCREEN_NEAR_Y = 530; // where near edge of rink is drawn (screen pixels)
const SCREEN_NEAR_HALF_W = 410; // half-width of rink at near edge (screen pixels)
const PERSPECTIVE_DEPTH = 3.2; // how strong the perspective squeeze is
const _RINK_W_SCREEN = SCREEN_NEAR_HALF_W * 2; // full screen width at near edge

// Ice colors (literal values required for Canvas API)
const ICE_DARK = "#060e22";
const ICE_LINE_CENTER = "#cc2222";
const ICE_LINE_BLUE = "#2244cc";
const ICE_LINE_WHITE = "rgba(255,255,255,0.55)";
const NEON_CYAN = "#00e5ff";
const P1_COLOR = "#ff3a2d";
const P1_GLOW = "rgba(255, 58, 45, 0.6)";
const P2_COLOR = "#3d7fff";
const P2_GLOW = "rgba(61, 127, 255, 0.6)";
const PUCK_GLOW = "rgba(255, 255, 220, 0.7)";
const GOAL_COLOR_LEFT = "rgba(255, 58, 45, 0.35)";
const GOAL_COLOR_RIGHT = "rgba(61, 127, 255, 0.35)";

// ─── Perspective Projection ───────────────────────────────────────────────────
// Converts ice physics coordinates to screen (sx, sy, scale)
// iceX: full range 0..CANVAS_W, iceY: full range 0..CANVAS_H
// We map the rink interior Y (RINK_MARGIN_Y .. RINK_MARGIN_Y+RINK_H) to depth
// t=0 is near edge (low Y in physics = top of screen in top-down), t=1 is far

function project(
  iceX: number,
  iceY: number,
): { sx: number; sy: number; scale: number } {
  // Normalize iceY within the rink range: 0 at near edge, 1 at far edge
  // In original top-down view, near=RINK_MARGIN_Y, far=RINK_MARGIN_Y+RINK_H
  const t = (iceY - RINK_MARGIN_Y) / RINK_H;
  const tClamped = Math.max(0, Math.min(1, t));

  // Perspective scale: squishes as t→1
  const perspectiveFactor = 1 / (1 + tClamped * PERSPECTIVE_DEPTH);

  // Screen Y: near edge at SCREEN_NEAR_Y, far edge at HORIZON_Y
  const sy = SCREEN_NEAR_Y - (SCREEN_NEAR_Y - HORIZON_Y) * tClamped;

  // Screen X: converges from full rink width at near to tiny at vanishing point
  // Normalize iceX within rink: centerX at 0, left wall at -0.5, right wall at +0.5
  const iceRinkCenterX = RINK_MARGIN_X + RINK_W / 2;
  const normalizedX = (iceX - iceRinkCenterX) / RINK_W; // -0.5 to +0.5
  const screenHalfW = SCREEN_NEAR_HALF_W * perspectiveFactor;
  const sx = CANVAS_W / 2 + normalizedX * screenHalfW * 2;

  return { sx, sy, scale: perspectiveFactor };
}

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

function playGoal() {
  // Rising triumphant chord
  const notes = [523, 659, 784, 1047];
  notes.forEach((freq, i) => {
    setTimeout(() => playBeep(freq, 0.4, 0.4, "sine"), i * 120);
  });
  setTimeout(() => playBeep(1047, 0.8, 0.5, "sine"), 500);
}

// ─── Physics Helpers ──────────────────────────────────────────────────────────

function dist(a: Vec2, b: Vec2): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function capSpeed(vel: Vec2, maxSpeed: number): Vec2 {
  const spd = Math.sqrt(vel.x ** 2 + vel.y ** 2);
  if (spd > maxSpeed) {
    return { x: (vel.x / spd) * maxSpeed, y: (vel.y / spd) * maxSpeed };
  }
  return vel;
}

function elasticCollision(
  puck: Vec2,
  puckVel: Vec2,
  paddle: Vec2,
  paddleVel: Vec2,
): Vec2 {
  const dx = puck.x - paddle.x;
  const dy = puck.y - paddle.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = dx / d;
  const ny = dy / d;

  // Relative velocity along normal
  const relVx = puckVel.x - paddleVel.x;
  const relVy = puckVel.y - paddleVel.y;
  const dot = relVx * nx + relVy * ny;

  if (dot > 0) return puckVel; // Moving apart already

  // Impulse with coefficient of restitution = 0.85
  const restitution = 0.85;
  const j = -(1 + restitution) * dot;

  // Transfer paddle momentum
  const boostX = paddleVel.x * 0.6;
  const boostY = paddleVel.y * 0.6;

  return {
    x: puckVel.x + j * nx + boostX,
    y: puckVel.y + j * ny + boostY,
  };
}

// ─── Perspective Canvas Renderer ──────────────────────────────────────────────

// Draw a horizontal line in ice space at a given iceY, spanning full rink width
function drawPerspectiveLine(
  ctx: CanvasRenderingContext2D,
  iceY: number,
  color: string,
  lineWidth: number,
  shadowColor?: string,
  shadowBlur = 0,
) {
  const left = project(RINK_MARGIN_X, iceY);
  const right = project(RINK_MARGIN_X + RINK_W, iceY);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  if (shadowColor) {
    ctx.shadowColor = shadowColor;
    ctx.shadowBlur = shadowBlur;
  }
  ctx.beginPath();
  ctx.moveTo(left.sx, left.sy);
  ctx.lineTo(right.sx, right.sy);
  ctx.stroke();
  ctx.restore();
}

// Draw a perspective ellipse (circle in ice space projected to screen)
function drawPerspectiveCircle(
  ctx: CanvasRenderingContext2D,
  iceCx: number,
  iceCy: number,
  iceRadius: number,
  color: string,
  lineWidth: number,
  filled = false,
  fillColor = "",
) {
  const STEPS = 48;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  for (let i = 0; i <= STEPS; i++) {
    const angle = (i / STEPS) * Math.PI * 2;
    const ix = iceCx + Math.cos(angle) * iceRadius;
    const iy = iceCy + Math.sin(angle) * iceRadius;
    const { sx, sy } = project(ix, iy);
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  }
  ctx.closePath();
  if (filled) {
    ctx.fillStyle = fillColor;
    ctx.fill();
  }
  ctx.stroke();
  ctx.restore();
}

function drawRink(ctx: CanvasRenderingContext2D) {
  // ── Arena background / bleachers above horizon ──────────────────────────
  const bgGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  bgGrad.addColorStop(0, "#080d1c");
  bgGrad.addColorStop(0.3, "#0a1228");
  bgGrad.addColorStop(1, "#04080f");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Crowd area above horizon
  ctx.save();
  ctx.fillStyle = "#0c1530";
  ctx.fillRect(0, 0, CANVAS_W, HORIZON_Y + 10);

  // Arena lights: big glow spots overhead
  for (let i = 0; i < 5; i++) {
    const lx = (CANVAS_W / 5) * i + CANVAS_W / 10;
    const ly = 20;
    const arenLight = ctx.createRadialGradient(lx, ly, 0, lx, ly, 80);
    arenLight.addColorStop(0, "rgba(220, 240, 255, 0.18)");
    arenLight.addColorStop(1, "transparent");
    ctx.fillStyle = arenLight;
    ctx.fillRect(lx - 80, 0, 160, 100);
  }

  // Crowd dots — subtle colored rows suggesting spectators
  const crowdColors = [
    "rgba(255,80,60,0.35)",
    "rgba(60,120,255,0.35)",
    "rgba(255,220,60,0.25)",
    "rgba(200,200,200,0.2)",
    "rgba(80,200,255,0.2)",
  ];
  for (let row = 0; row < 5; row++) {
    const rowY = 18 + row * 16;
    const dotCount = 48 - row * 4;
    for (let col = 0; col < dotCount; col++) {
      const dotX = (CANVAS_W / dotCount) * col + CANVAS_W / dotCount / 2;
      // Vary x slightly for natural look
      const jx = ((col * 7 + row * 13) % 9) - 4;
      const jy = ((col * 3 + row * 5) % 5) - 2;
      ctx.beginPath();
      ctx.arc(dotX + jx, rowY + jy, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = crowdColors[(col + row) % crowdColors.length];
      ctx.fill();
    }
  }
  ctx.restore();

  // ── Ice surface trapezoid ─────────────────────────────────────────────────
  const nearLeft = project(RINK_MARGIN_X, RINK_MARGIN_Y + RINK_H);
  const nearRight = project(RINK_MARGIN_X + RINK_W, RINK_MARGIN_Y + RINK_H);
  const farLeft = project(RINK_MARGIN_X, RINK_MARGIN_Y);
  const farRight = project(RINK_MARGIN_X + RINK_W, RINK_MARGIN_Y);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(nearLeft.sx, nearLeft.sy);
  ctx.lineTo(nearRight.sx, nearRight.sy);
  ctx.lineTo(farRight.sx, farRight.sy);
  ctx.lineTo(farLeft.sx, farLeft.sy);
  ctx.closePath();

  // Ice gradient: bright near camera, darker at far end
  const iceGrad = ctx.createLinearGradient(
    CANVAS_W / 2,
    SCREEN_NEAR_Y,
    CANVAS_W / 2,
    HORIZON_Y,
  );
  iceGrad.addColorStop(0, "#0e1d3a");
  iceGrad.addColorStop(0.4, "#0b1730");
  iceGrad.addColorStop(0.8, "#091225");
  iceGrad.addColorStop(1, ICE_DARK);
  ctx.fillStyle = iceGrad;
  ctx.fill();

  // Rink border neon glow
  ctx.strokeStyle = NEON_CYAN;
  ctx.lineWidth = 2;
  ctx.shadowColor = NEON_CYAN;
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();

  // ── Ice shine lines (subtle horizontal glint) ─────────────────────────────
  const shineYPositions = [0.2, 0.45, 0.68, 0.85];
  for (const t of shineYPositions) {
    const iceY = RINK_MARGIN_Y + t * RINK_H;
    const lp = project(RINK_MARGIN_X + RINK_W * 0.1, iceY);
    const rp = project(RINK_MARGIN_X + RINK_W * 0.9, iceY);
    const shineGrad = ctx.createLinearGradient(lp.sx, lp.sy, rp.sx, rp.sy);
    shineGrad.addColorStop(0, "transparent");
    shineGrad.addColorStop(0.3, `rgba(180,220,255,${0.04 * (1 - t)})`);
    shineGrad.addColorStop(0.5, `rgba(200,235,255,${0.08 * (1 - t)})`);
    shineGrad.addColorStop(0.7, `rgba(180,220,255,${0.04 * (1 - t)})`);
    shineGrad.addColorStop(1, "transparent");
    ctx.save();
    ctx.strokeStyle = shineGrad;
    ctx.lineWidth = Math.max(1, 3 * (1 - t));
    ctx.beginPath();
    ctx.moveTo(lp.sx, lp.sy);
    ctx.lineTo(rp.sx, rp.sy);
    ctx.stroke();
    ctx.restore();
  }

  // ── Side boards (perspective walls) ──────────────────────────────────────
  // Left board wall: from near-left to far-left, with depth
  const boardH = 18; // visual board height in pixels
  ctx.save();
  // Left board face
  ctx.beginPath();
  ctx.moveTo(nearLeft.sx, nearLeft.sy);
  ctx.lineTo(nearLeft.sx, nearLeft.sy - boardH);
  ctx.lineTo(farLeft.sx, farLeft.sy - 4);
  ctx.lineTo(farLeft.sx, farLeft.sy);
  ctx.closePath();
  const lBoardGrad = ctx.createLinearGradient(
    nearLeft.sx,
    nearLeft.sy,
    farLeft.sx,
    farLeft.sy,
  );
  lBoardGrad.addColorStop(0, "rgba(0, 229, 255, 0.25)");
  lBoardGrad.addColorStop(1, "rgba(0, 229, 255, 0.08)");
  ctx.fillStyle = lBoardGrad;
  ctx.fill();
  ctx.strokeStyle = NEON_CYAN;
  ctx.lineWidth = 1.5;
  ctx.shadowColor = NEON_CYAN;
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Right board face
  ctx.beginPath();
  ctx.moveTo(nearRight.sx, nearRight.sy);
  ctx.lineTo(nearRight.sx, nearRight.sy - boardH);
  ctx.lineTo(farRight.sx, farRight.sy - 4);
  ctx.lineTo(farRight.sx, farRight.sy);
  ctx.closePath();
  const rBoardGrad = ctx.createLinearGradient(
    nearRight.sx,
    nearRight.sy,
    farRight.sx,
    farRight.sy,
  );
  rBoardGrad.addColorStop(0, "rgba(0, 229, 255, 0.25)");
  rBoardGrad.addColorStop(1, "rgba(0, 229, 255, 0.08)");
  ctx.fillStyle = rBoardGrad;
  ctx.fill();
  ctx.strokeStyle = NEON_CYAN;
  ctx.lineWidth = 1.5;
  ctx.shadowColor = NEON_CYAN;
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();

  // ── Center red line ───────────────────────────────────────────────────────
  const centerY = RINK_MARGIN_Y + RINK_H / 2;
  drawPerspectiveLine(ctx, centerY, ICE_LINE_CENTER, 3, ICE_LINE_CENTER, 6);

  // ── Blue lines ────────────────────────────────────────────────────────────
  const blueOffset = RINK_H * 0.22;
  drawPerspectiveLine(
    ctx,
    centerY - blueOffset,
    ICE_LINE_BLUE,
    3,
    ICE_LINE_BLUE,
    6,
  );
  drawPerspectiveLine(
    ctx,
    centerY + blueOffset,
    ICE_LINE_BLUE,
    3,
    ICE_LINE_BLUE,
    6,
  );

  // ── Goal lines ────────────────────────────────────────────────────────────
  drawPerspectiveLine(ctx, RINK_MARGIN_Y + RINK_H * 0.08, ICE_LINE_WHITE, 2);
  drawPerspectiveLine(ctx, RINK_MARGIN_Y + RINK_H * 0.92, ICE_LINE_WHITE, 2);

  // ── Center circle ─────────────────────────────────────────────────────────
  const iceCenterX = RINK_MARGIN_X + RINK_W / 2;
  const iceCenterY = RINK_MARGIN_Y + RINK_H / 2;
  // Circle radius in ice pixels: 65 pixels (same as original)
  drawPerspectiveCircle(ctx, iceCenterX, iceCenterY, 65, ICE_LINE_CENTER, 2);

  // Center dot
  const centerDot = project(iceCenterX, iceCenterY);
  ctx.save();
  ctx.fillStyle = ICE_LINE_CENTER;
  ctx.shadowColor = ICE_LINE_CENTER;
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.arc(centerDot.sx, centerDot.sy, 5 * centerDot.scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();

  // ── Face-off circles ─────────────────────────────────────────────────────
  const foX2 = RINK_W * 0.22 * 0.55;
  const foY2 = RINK_H * 0.28;
  const faceOffPositions = [
    { x: iceCenterX - foX2, y: iceCenterY - foY2 },
    { x: iceCenterX - foX2, y: iceCenterY + foY2 },
    { x: iceCenterX + foX2, y: iceCenterY - foY2 },
    { x: iceCenterX + foX2, y: iceCenterY + foY2 },
  ];
  for (const { x, y } of faceOffPositions) {
    drawPerspectiveCircle(ctx, x, y, 30, "rgba(200, 30, 30, 0.5)", 1.5);
    const dot = project(x, y);
    ctx.save();
    ctx.fillStyle = "rgba(200, 30, 30, 0.3)";
    ctx.beginPath();
    ctx.arc(dot.sx, dot.sy, 4 * dot.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── Goal creases ──────────────────────────────────────────────────────────
  // Left goal crease (arc + fill)
  const creaseRadius = 70;
  // Left crease (near left wall, around goal center)
  const leftGoalCenterX = RINK_MARGIN_X;
  const leftGoalCenterY = iceCenterY;
  drawPerspectiveCrease(
    ctx,
    leftGoalCenterX,
    leftGoalCenterY,
    creaseRadius,
    "left",
  );

  // Right crease
  const rightGoalCenterX = RINK_MARGIN_X + RINK_W;
  const rightGoalCenterY = iceCenterY;
  drawPerspectiveCrease(
    ctx,
    rightGoalCenterX,
    rightGoalCenterY,
    creaseRadius,
    "right",
  );

  // ── Goal nets ─────────────────────────────────────────────────────────────
  drawPerspectiveGoal(ctx, RINK_MARGIN_X, iceCenterY, "left", P1_COLOR);
  drawPerspectiveGoal(
    ctx,
    RINK_MARGIN_X + RINK_W,
    iceCenterY,
    "right",
    P2_COLOR,
  );
}

function drawPerspectiveCrease(
  ctx: CanvasRenderingContext2D,
  goalX: number,
  goalCenterY: number,
  radius: number,
  side: "left" | "right",
) {
  const halfGoal = GOAL_H / 2;
  const startY = goalCenterY - halfGoal;
  const endY = goalCenterY + halfGoal;

  // Draw the crease as a series of lines from the goal line outward
  const STEPS = 20;
  const dir = side === "left" ? 1 : -1;
  ctx.save();
  ctx.fillStyle =
    side === "left" ? "rgba(255, 58, 45, 0.08)" : "rgba(61, 127, 255, 0.08)";
  ctx.strokeStyle = ICE_LINE_WHITE;
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  // Bottom of crease at goal line
  const ptBottom = project(goalX, endY);
  ctx.moveTo(ptBottom.sx, ptBottom.sy);

  // Arc around crease
  for (let i = 0; i <= STEPS; i++) {
    const angle = (i / STEPS) * Math.PI - Math.PI / 2;
    const ix = goalX + dir * radius * Math.cos(angle);
    const iy = goalCenterY + radius * Math.sin(angle);
    const pt = project(ix, iy);
    ctx.lineTo(pt.sx, pt.sy);
  }
  // Back to top goal line
  const ptTop = project(goalX, startY);
  ctx.lineTo(ptTop.sx, ptTop.sy);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawPerspectiveGoal(
  ctx: CanvasRenderingContext2D,
  wallX: number,
  goalCenterY: number,
  side: "left" | "right",
  color: string,
) {
  const halfGoal = GOAL_H / 2;
  const topPostY = goalCenterY - halfGoal;
  const botPostY = goalCenterY + halfGoal;
  const dir = side === "left" ? -1 : 1;
  const depthIce = GOAL_DEPTH * 1.5; // depth in ice X pixels

  // Project the four corners of the goal face + back
  const faceTopPost = project(wallX, topPostY);
  const faceBotPost = project(wallX, botPostY);
  const backTopPost = project(wallX + dir * depthIce, topPostY);
  const backBotPost = project(wallX + dir * depthIce, botPostY);

  ctx.save();

  // Goal back area (filled)
  ctx.beginPath();
  ctx.moveTo(faceTopPost.sx, faceTopPost.sy);
  ctx.lineTo(faceBotPost.sx, faceBotPost.sy);
  ctx.lineTo(backBotPost.sx, backBotPost.sy);
  ctx.lineTo(backTopPost.sx, backTopPost.sy);
  ctx.closePath();
  ctx.fillStyle = side === "left" ? GOAL_COLOR_LEFT : GOAL_COLOR_RIGHT;
  ctx.fill();

  // Net grid lines (horizontal in Y direction)
  const NET_H_LINES = 5;
  const NET_V_LINES = 3;
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;

  // Horizontal net lines (depth lines)
  for (let i = 0; i <= NET_H_LINES; i++) {
    const iy = topPostY + (i / NET_H_LINES) * GOAL_H;
    const fp = project(wallX, iy);
    const bp = project(wallX + dir * depthIce, iy);
    ctx.beginPath();
    ctx.moveTo(fp.sx, fp.sy);
    ctx.lineTo(bp.sx, bp.sy);
    ctx.stroke();
  }

  // Vertical net lines (parallel to goal face)
  for (let i = 0; i <= NET_V_LINES; i++) {
    const ix = wallX + dir * depthIce * (i / NET_V_LINES);
    const tp = project(ix, topPostY);
    const bp = project(ix, botPostY);
    ctx.beginPath();
    ctx.moveTo(tp.sx, tp.sy);
    ctx.lineTo(bp.sx, bp.sy);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Goal posts outline (bright, with glow)
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(faceTopPost.sx, faceTopPost.sy);
  ctx.lineTo(faceBotPost.sx, faceBotPost.sy);
  ctx.lineTo(backBotPost.sx, backBotPost.sy);
  ctx.lineTo(backTopPost.sx, backTopPost.sy);
  ctx.lineTo(faceTopPost.sx, faceTopPost.sy);
  ctx.stroke();
  // Crossbar back
  ctx.beginPath();
  ctx.moveTo(backTopPost.sx, backTopPost.sy);
  ctx.lineTo(backBotPost.sx, backBotPost.sy);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();
}

// Draw a perspective-projected puck (flat ellipse on the ice)
function drawPuck(ctx: CanvasRenderingContext2D, pos: Vec2, flashGoal = false) {
  const { sx, sy, scale } = project(pos.x, pos.y);

  // Puck width & height in screen space — flat on ice
  const puckW = PUCK_R * 2.2 * scale;
  const puckH = PUCK_R * 0.7 * scale;

  ctx.save();
  // Shadow on ice below puck
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(
    sx,
    sy + puckH * 0.5,
    puckW * 0.9,
    puckH * 0.4,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  // Glow layer
  const glowColor = flashGoal ? "rgba(255, 200, 0, 0.9)" : PUCK_GLOW;
  const glowR = PUCK_R * 3 * scale;
  const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
  glow.addColorStop(0, glowColor);
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(sx, sy, glowR, glowR * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Puck body (flat ellipse)
  ctx.shadowColor = flashGoal ? "rgba(255,220,0,0.9)" : PUCK_GLOW;
  ctx.shadowBlur = 15 * scale;

  const grad = ctx.createRadialGradient(
    sx - puckW * 0.2,
    sy - puckH * 0.2,
    puckH * 0.1,
    sx,
    sy,
    puckW,
  );
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.5, flashGoal ? "#ffe000" : "#ffffcc");
  grad.addColorStop(1, flashGoal ? "#ff8800" : "#cccc88");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(sx, sy, puckW, puckH, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Fallback player rendering (no sprite)
function drawPlayerFallback(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  scale: number,
  color: string,
  glowColor: string,
  label: string,
) {
  const r = PADDLE_R * scale;
  ctx.save();
  // Glow
  const glow = ctx.createRadialGradient(
    sx,
    sy - r,
    r * 0.2,
    sx,
    sy - r,
    r * 2.5,
  );
  glow.addColorStop(0, glowColor);
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(sx, sy - r, r * 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 18;

  const grad = ctx.createRadialGradient(
    sx - r * 0.3,
    sy - r * 1.3,
    r * 0.2,
    sx,
    sy - r,
    r,
  );
  grad.addColorStop(0, color === P1_COLOR ? "#ff7a72" : "#7ab0ff");
  grad.addColorStop(0.5, color);
  grad.addColorStop(1, color === P1_COLOR ? "#991a10" : "#1a3d99");

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(sx, sy - r, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(sx, sy - r, r * 0.65, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = `bold ${Math.max(10, 14 * scale)}px 'Bricolage Grotesque', sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, sx, sy - r);
  ctx.restore();
}

// Sprite base sizes in screen pixels at scale=1
const BASE_SPRITE_H = 110; // height at near edge (scale=1)
const BASE_SPRITE_W = 90;

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  pos: Vec2,
  color: string,
  glowColor: string,
  label: string,
  _angle: number,
  sprite: HTMLImageElement | null,
) {
  const { sx, sy, scale } = project(pos.x, pos.y);

  // Shadow ellipse on ice at feet
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.ellipse(sx, sy, 28 * scale, 8 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Glow aura at feet level
  ctx.save();
  const auraGrad = ctx.createRadialGradient(
    sx,
    sy - 5 * scale,
    0,
    sx,
    sy - 10 * scale,
    60 * scale,
  );
  auraGrad.addColorStop(0, glowColor.replace("0.6)", "0.35)"));
  auraGrad.addColorStop(1, "transparent");
  ctx.fillStyle = auraGrad;
  ctx.beginPath();
  ctx.ellipse(sx, sy - 20 * scale, 60 * scale, 50 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (sprite?.complete && sprite.naturalWidth > 0) {
    const sprH = BASE_SPRITE_H * scale;
    const sprW = BASE_SPRITE_W * scale;
    ctx.save();
    // Draw sprite with feet at sy, centered on sx
    ctx.drawImage(sprite, sx - sprW / 2, sy - sprH, sprW, sprH);
    ctx.restore();
  } else {
    drawPlayerFallback(ctx, sx, sy, scale, color, glowColor, label);
  }
}

function drawGoalFlash(
  ctx: CanvasRenderingContext2D,
  scorer: 1 | 2,
  alpha: number,
) {
  const side = scorer === 1 ? "right" : "left";
  const x = side === "left" ? RINK_MARGIN_X : RINK_MARGIN_X + RINK_W;
  const color = scorer === 1 ? "255, 58, 45" : "61, 127, 255";

  ctx.save();
  const grd = ctx.createRadialGradient(
    x,
    CANVAS_H / 2,
    0,
    x,
    CANVAS_H / 2,
    300,
  );
  grd.addColorStop(0, `rgba(${color}, ${alpha * 0.5})`);
  grd.addColorStop(1, "transparent");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.restore();
}

function drawHUD(
  ctx: CanvasRenderingContext2D,
  score: [number, number],
  goalFlash: number,
  goalScorer: 1 | 2 | null,
  roundWins: [number, number] = [0, 0],
  roundNum = 1,
) {
  // Score panel background
  const hudY = 8;
  const hudH = 32;
  ctx.save();
  ctx.fillStyle = "rgba(6, 14, 34, 0.85)";
  ctx.roundRect(CANVAS_W / 2 - 120, hudY, 240, hudH, 8);
  ctx.fill();
  ctx.strokeStyle = NEON_CYAN;
  ctx.lineWidth = 1;
  ctx.shadowColor = NEON_CYAN;
  ctx.shadowBlur = 6;
  ctx.roundRect(CANVAS_W / 2 - 120, hudY, 240, hudH, 8);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Score text
  ctx.font = "bold 18px 'Bricolage Grotesque', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const s1Flash = goalFlash > 0 && goalScorer === 1;
  const s2Flash = goalFlash > 0 && goalScorer === 2;

  ctx.fillStyle = s1Flash
    ? `rgba(255,220,0,${0.7 + 0.3 * Math.sin(goalFlash * 8)})`
    : P1_COLOR;
  if (s1Flash) {
    ctx.shadowColor = "#ffcc00";
    ctx.shadowBlur = 15;
  }
  ctx.fillText(score[0].toString(), CANVAS_W / 2 - 55, hudY + hudH / 2);
  ctx.shadowBlur = 0;

  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fillText("—", CANVAS_W / 2, hudY + hudH / 2);

  ctx.fillStyle = s2Flash
    ? `rgba(255,220,0,${0.7 + 0.3 * Math.sin(goalFlash * 8)})`
    : P2_COLOR;
  if (s2Flash) {
    ctx.shadowColor = "#ffcc00";
    ctx.shadowBlur = 15;
  }
  ctx.fillText(score[1].toString(), CANVAS_W / 2 + 55, hudY + hudH / 2);
  ctx.shadowBlur = 0;

  // Player labels
  ctx.font = "11px 'Mona Sans', sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.textAlign = "left";
  ctx.fillText("P1  WASD", RINK_MARGIN_X + 4, 14);
  ctx.textAlign = "right";
  ctx.fillText("ARROWS  P2", CANVAS_W - RINK_MARGIN_X - 4, 14);

  // Round indicator
  ctx.font = "10px 'Mona Sans', sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.textAlign = "center";
  ctx.fillText(`ROUND ${roundNum}`, CANVAS_W / 2, hudY + hudH + 12);

  // Round win dots for P1 (left of center)
  for (let i = 0; i < ROUNDS_TO_WIN_MATCH; i++) {
    ctx.beginPath();
    ctx.arc(
      CANVAS_W / 2 - 55 + (i - 1) * 10,
      hudY + hudH + 22,
      3,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = i < roundWins[0] ? P1_COLOR : "rgba(255,255,255,0.2)";
    ctx.fill();
  }
  // Round win dots for P2 (right of center)
  for (let i = 0; i < ROUNDS_TO_WIN_MATCH; i++) {
    ctx.beginPath();
    ctx.arc(
      CANVAS_W / 2 + 55 + (i - 1) * 10,
      hudY + hudH + 22,
      3,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = i < roundWins[1] ? P2_COLOR : "rgba(255,255,255,0.2)";
    ctx.fill();
  }

  ctx.restore();
}

// ─── Game Component ───────────────────────────────────────────────────────────

export default function HockeyGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>({
    puck: { x: CANVAS_W / 2, y: CANVAS_H / 2 },
    puckVel: { x: 0, y: 0 },
    p1: { x: RINK_MARGIN_X + 70, y: CANVAS_H / 2 },
    p1Vel: { x: 0, y: 0 },
    p2: { x: CANVAS_W - RINK_MARGIN_X - 70, y: CANVAS_H / 2 },
    p2Vel: { x: 0, y: 0 },
    p1Angle: 0, // P1 defaults facing right (0 rad)
    p2Angle: Math.PI, // P2 defaults facing left (π rad)
    score: [0, 0],
    roundWins: [0, 0],
    keys: new Set(),
    lastTime: 0,
    goalScorer: null,
    goalFlashTimer: 0,
    animFrameId: 0,
    running: false,
    puckLastVel: { x: 0, y: 0 },
  });

  // Sprite image refs — loaded once, read in the animation loop
  const p1SpriteRef = useRef<HTMLImageElement | null>(null);
  const p2SpriteRef = useRef<HTMLImageElement | null>(null);

  // Load sprites on mount
  useEffect(() => {
    const img1 = new Image();
    img1.src = "/assets/generated/player1-sprite-transparent.dim_128x128.png";
    p1SpriteRef.current = img1;

    const img2 = new Image();
    img2.src = "/assets/generated/player2-sprite-transparent.dim_128x128.png";
    p2SpriteRef.current = img2;
  }, []);

  const [phase, setPhase] = useState<GamePhase>("start");
  const [displayScore, setDisplayScore] = useState<[number, number]>([0, 0]);
  const [goalMessage, setGoalMessage] = useState<string>("");
  const [goalScorer, setGoalScorerState] = useState<1 | 2 | null>(null);
  const [winner, setWinner] = useState<1 | 2 | null>(null);
  const [winnerName, setWinnerName] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [roundNumber, setRoundNumber] = useState(1);
  const [roundWins, setRoundWins] = useState<[number, number]>([0, 0]);
  const [roundWinner, setRoundWinner] = useState<1 | 2 | null>(null);
  const phaseRef = useRef<GamePhase>("start");
  const roundNumberRef = useRef(1);

  // ── Goal effects state ────────────────────────────────────────────────────
  const [confettiParticles, setConfettiParticles] = useState<
    ConfettiParticle[]
  >([]);
  const [showFlash, setShowFlash] = useState(false);
  const confettiRafRef = useRef<number>(0);
  const confettiLastTimeRef = useRef<number>(0);

  const { data: topScores, refetch: refetchScores } = useTopScores();
  const addScore = useAddScore();

  // Keep phaseRef in sync
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Keep roundNumberRef in sync
  useEffect(() => {
    roundNumberRef.current = roundNumber;
  }, [roundNumber]);

  // ── Confetti animation loop ───────────────────────────────────────────────
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
            vy: p.vy + 300 * dt, // gravity
            vx: p.vx * 0.99,
            rotation: p.rotation + p.spin * dt,
            life: p.life - dt / 2.0, // ~2s total life
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

  // ── Trigger goal effects ──────────────────────────────────────────────────
  const triggerGoalEffects = useCallback((scorer: 1 | 2) => {
    // Screen flash
    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 600);

    // Spawn confetti
    const CONFETTI_COLORS = [
      "#ff3a2d",
      "#3d7fff",
      "#ffe000",
      "#00e5ff",
      "#ff69b4",
      "#7fff00",
    ];
    const cx = 450; // canvas center x (roughly)
    const cy = 280; // canvas center y (roughly)

    const particles: ConfettiParticle[] = Array.from({ length: 80 }, (_, i) => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 150 + Math.random() * 400;
      return {
        id: i,
        x: cx + (Math.random() - 0.5) * 60,
        y: cy + (Math.random() - 0.5) * 60,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 150, // upward bias
        rotation: Math.random() * 360,
        spin: (Math.random() - 0.5) * 720,
        color:
          CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        life: 0.8 + Math.random() * 0.4, // stagger start times slightly
        size: 6 + Math.random() * 6,
      };
    });

    setConfettiParticles(particles);
    setGoalScorerState(scorer);
  }, []);

  const resetPuck = useCallback(() => {
    const gs = stateRef.current;
    gs.puck = { x: CANVAS_W / 2, y: CANVAS_H / 2 };
    const angle = (Math.random() * Math.PI) / 2 - Math.PI / 4;
    const side = Math.random() > 0.5 ? 1 : -1;
    const speed = 240;
    gs.puckVel = {
      x: Math.cos(angle) * speed * side,
      y: Math.sin(angle) * speed,
    };
    gs.puckLastVel = { ...gs.puckVel };
  }, []);

  const resetGame = useCallback(() => {
    const gs = stateRef.current;
    gs.score = [0, 0];
    gs.roundWins = [0, 0];
    gs.p1 = { x: RINK_MARGIN_X + 70, y: CANVAS_H / 2 };
    gs.p2 = { x: CANVAS_W - RINK_MARGIN_X - 70, y: CANVAS_H / 2 };
    gs.p1Vel = { x: 0, y: 0 };
    gs.p2Vel = { x: 0, y: 0 };
    gs.p1Angle = 0;
    gs.p2Angle = Math.PI;
    gs.goalScorer = null;
    gs.goalFlashTimer = 0;
    gs.keys = new Set();
    resetPuck();
    setDisplayScore([0, 0]);
    setWinner(null);
    setWinnerName("");
    setSubmitted(false);
    setRoundWins([0, 0]);
    setRoundNumber(1);
    setRoundWinner(null);
  }, [resetPuck]);

  // ── Game Loop ─────────────────────────────────────────────────────────────

  const gameLoop = useCallback(
    (timestamp: number) => {
      const gs = stateRef.current;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      if (!gs.running) return;

      const dt = Math.min((timestamp - gs.lastTime) / 1000, 0.05);
      gs.lastTime = timestamp;

      // ── Input ──────────────────────────────────────────────────────────
      const k = gs.keys;
      const spd = PADDLE_SPEED * dt;
      const prevP1 = { ...gs.p1 };
      const prevP2 = { ...gs.p2 };

      if (k.has("KeyW") || k.has("w"))
        gs.p1.y = clamp(
          gs.p1.y - spd,
          RINK_MARGIN_Y + PADDLE_R,
          RINK_MARGIN_Y + RINK_H - PADDLE_R,
        );
      if (k.has("KeyS") || k.has("s"))
        gs.p1.y = clamp(
          gs.p1.y + spd,
          RINK_MARGIN_Y + PADDLE_R,
          RINK_MARGIN_Y + RINK_H - PADDLE_R,
        );
      if (k.has("KeyA") || k.has("a"))
        gs.p1.x = clamp(
          gs.p1.x - spd,
          RINK_MARGIN_X + PADDLE_R,
          RINK_MARGIN_X + RINK_W / 2 - PADDLE_R,
        );
      if (k.has("KeyD") || k.has("d"))
        gs.p1.x = clamp(
          gs.p1.x + spd,
          RINK_MARGIN_X + PADDLE_R,
          RINK_MARGIN_X + RINK_W / 2 - PADDLE_R,
        );

      if (k.has("ArrowUp"))
        gs.p2.y = clamp(
          gs.p2.y - spd,
          RINK_MARGIN_Y + PADDLE_R,
          RINK_MARGIN_Y + RINK_H - PADDLE_R,
        );
      if (k.has("ArrowDown"))
        gs.p2.y = clamp(
          gs.p2.y + spd,
          RINK_MARGIN_Y + PADDLE_R,
          RINK_MARGIN_Y + RINK_H - PADDLE_R,
        );
      if (k.has("ArrowLeft"))
        gs.p2.x = clamp(
          gs.p2.x - spd,
          RINK_MARGIN_X + RINK_W / 2 + PADDLE_R,
          CANVAS_W - RINK_MARGIN_X - PADDLE_R,
        );
      if (k.has("ArrowRight"))
        gs.p2.x = clamp(
          gs.p2.x + spd,
          RINK_MARGIN_X + RINK_W / 2 + PADDLE_R,
          CANVAS_W - RINK_MARGIN_X - PADDLE_R,
        );

      // Paddle velocities (for momentum transfer)
      if (dt > 0) {
        gs.p1Vel = {
          x: (gs.p1.x - prevP1.x) / dt,
          y: (gs.p1.y - prevP1.y) / dt,
        };
        gs.p2Vel = {
          x: (gs.p2.x - prevP2.x) / dt,
          y: (gs.p2.y - prevP2.y) / dt,
        };
      }

      // ── Update facing angles ──────────────────────────────────────────
      // Only update angle when the paddle is actually moving (speed > threshold)
      const ANGLE_THRESHOLD = 20; // px/s
      const p1Speed = Math.sqrt(gs.p1Vel.x ** 2 + gs.p1Vel.y ** 2);
      const p2Speed = Math.sqrt(gs.p2Vel.x ** 2 + gs.p2Vel.y ** 2);
      if (p1Speed > ANGLE_THRESHOLD) {
        gs.p1Angle = Math.atan2(gs.p1Vel.y, gs.p1Vel.x);
      }
      if (p2Speed > ANGLE_THRESHOLD) {
        gs.p2Angle = Math.atan2(gs.p2Vel.y, gs.p2Vel.x);
      }

      // ── Puck movement + friction ──────────────────────────────────────
      gs.puckLastVel = { ...gs.puckVel };
      gs.puck.x += gs.puckVel.x * dt;
      gs.puck.y += gs.puckVel.y * dt;
      gs.puckVel.x *= PUCK_FRICTION;
      gs.puckVel.y *= PUCK_FRICTION;

      // ── Wall bounces ──────────────────────────────────────────────────
      const topWall = RINK_MARGIN_Y + PUCK_R;
      const botWall = RINK_MARGIN_Y + RINK_H - PUCK_R;

      if (gs.puck.y <= topWall) {
        gs.puck.y = topWall;
        if (gs.puckVel.y < 0) {
          gs.puckVel.y = -gs.puckVel.y;
          playWallHit();
        }
      }
      if (gs.puck.y >= botWall) {
        gs.puck.y = botWall;
        if (gs.puckVel.y > 0) {
          gs.puckVel.y = -gs.puckVel.y;
          playWallHit();
        }
      }

      // Left/right wall bounces (when NOT in goal zone)
      const inGoalZoneY =
        gs.puck.y >= GOAL_Y + PUCK_R && gs.puck.y <= GOAL_Y + GOAL_H - PUCK_R;

      const leftWall = RINK_MARGIN_X + PUCK_R;
      const rightWall = RINK_MARGIN_X + RINK_W - PUCK_R;

      if (!inGoalZoneY) {
        if (gs.puck.x <= leftWall) {
          gs.puck.x = leftWall;
          if (gs.puckVel.x < 0) {
            gs.puckVel.x = -gs.puckVel.x;
            playWallHit();
          }
        }
        if (gs.puck.x >= rightWall) {
          gs.puck.x = rightWall;
          if (gs.puckVel.x > 0) {
            gs.puckVel.x = -gs.puckVel.x;
            playWallHit();
          }
        }
      }

      // ── Goal detection ────────────────────────────────────────────────
      const puckInGoalY = gs.puck.y >= GOAL_Y && gs.puck.y <= GOAL_Y + GOAL_H;

      const goalLeft = RINK_MARGIN_X - PUCK_R;
      const goalRight = RINK_MARGIN_X + RINK_W + PUCK_R;

      if (puckInGoalY && gs.puck.x <= goalLeft) {
        // P2 scores
        gs.score[1] += 1;
        gs.running = false;
        playGoal();
        setDisplayScore([...gs.score] as [number, number]);
        setGoalMessage("PLAYER 2");
        gs.goalScorer = 2;
        triggerGoalEffects(2);
        const newScore: [number, number] = [...gs.score] as [number, number];
        if (newScore[1] >= WINS_TO_WIN) {
          // P2 wins this round
          gs.roundWins[1] += 1;
          const newRoundWins: [number, number] = [...gs.roundWins] as [
            number,
            number,
          ];
          if (newRoundWins[1] >= ROUNDS_TO_WIN_MATCH) {
            setTimeout(() => {
              setWinner(2);
              setPhase("gameover");
            }, GOAL_CELEBRATE_MS);
          } else {
            setTimeout(() => {
              setRoundWins([...gs.roundWins] as [number, number]);
              setRoundWinner(2);
              setConfettiParticles([]);
              setPhase("roundover");
            }, GOAL_CELEBRATE_MS);
          }
        } else {
          setPhase("goal");
          setTimeout(() => {
            resetPuck();
            gs.p1 = { x: RINK_MARGIN_X + 70, y: CANVAS_H / 2 };
            gs.p2 = { x: CANVAS_W - RINK_MARGIN_X - 70, y: CANVAS_H / 2 };
            gs.running = true;
            gs.lastTime = performance.now();
            setConfettiParticles([]);
            setPhase("playing");
          }, GOAL_CELEBRATE_MS);
        }
      } else if (puckInGoalY && gs.puck.x >= goalRight) {
        // P1 scores
        gs.score[0] += 1;
        gs.running = false;
        playGoal();
        setDisplayScore([...gs.score] as [number, number]);
        setGoalMessage("PLAYER 1");
        gs.goalScorer = 1;
        triggerGoalEffects(1);
        const newScore: [number, number] = [...gs.score] as [number, number];
        if (newScore[0] >= WINS_TO_WIN) {
          // P1 wins this round
          gs.roundWins[0] += 1;
          const newRoundWins: [number, number] = [...gs.roundWins] as [
            number,
            number,
          ];
          if (newRoundWins[0] >= ROUNDS_TO_WIN_MATCH) {
            setTimeout(() => {
              setWinner(1);
              setPhase("gameover");
            }, GOAL_CELEBRATE_MS);
          } else {
            setTimeout(() => {
              setRoundWins([...gs.roundWins] as [number, number]);
              setRoundWinner(1);
              setConfettiParticles([]);
              setPhase("roundover");
            }, GOAL_CELEBRATE_MS);
          }
        } else {
          setPhase("goal");
          setTimeout(() => {
            resetPuck();
            gs.p1 = { x: RINK_MARGIN_X + 70, y: CANVAS_H / 2 };
            gs.p2 = { x: CANVAS_W - RINK_MARGIN_X - 70, y: CANVAS_H / 2 };
            gs.running = true;
            gs.lastTime = performance.now();
            setConfettiParticles([]);
            setPhase("playing");
          }, GOAL_CELEBRATE_MS);
        }
      }

      // ── Paddle collisions ─────────────────────────────────────────────
      for (const { pos, vel } of [
        { pos: gs.p1, vel: gs.p1Vel },
        { pos: gs.p2, vel: gs.p2Vel },
      ]) {
        const d = dist(gs.puck, pos);
        const minDist = PUCK_R + PADDLE_R;
        if (d < minDist) {
          // Separate
          const overlap = minDist - d;
          const nx = (gs.puck.x - pos.x) / (d || 1);
          const ny = (gs.puck.y - pos.y) / (d || 1);
          gs.puck.x += nx * overlap;
          gs.puck.y += ny * overlap;

          const newVel = elasticCollision(gs.puck, gs.puckVel, pos, vel);
          gs.puckVel = capSpeed(newVel, MAX_PUCK_SPEED);
          playPaddleHit();
        }
      }

      // Cap speed
      gs.puckVel = capSpeed(gs.puckVel, MAX_PUCK_SPEED);

      // ── Goal flash timer ──────────────────────────────────────────────
      if (gs.goalFlashTimer > 0) {
        gs.goalFlashTimer = Math.max(0, gs.goalFlashTimer - dt);
      }

      // ── Render ────────────────────────────────────────────────────────
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      drawRink(ctx);

      // Goal flash overlay
      if (gs.goalScorer && phaseRef.current === "goal") {
        const t = 1 - gs.goalFlashTimer;
        const flashAlpha = Math.sin(t * Math.PI * 3) * 0.3;
        if (flashAlpha > 0) drawGoalFlash(ctx, gs.goalScorer, flashAlpha);
      }

      // Draw players and puck sorted by depth (farther = smaller Y = drawn first)
      // Sort so nearer objects draw on top of farther ones
      const drawables = [
        {
          y: gs.p2.y,
          draw: () =>
            drawPlayer(
              ctx,
              gs.p2,
              P2_COLOR,
              P2_GLOW,
              "P2",
              gs.p2Angle,
              p2SpriteRef.current,
            ),
        },
        {
          y: gs.p1.y,
          draw: () =>
            drawPlayer(
              ctx,
              gs.p1,
              P1_COLOR,
              P1_GLOW,
              "P1",
              gs.p1Angle,
              p1SpriteRef.current,
            ),
        },
        {
          y: gs.puck.y,
          draw: () => drawPuck(ctx, gs.puck, phaseRef.current === "goal"),
        },
      ];
      // Sort by iceY: lower Y = farther away = draw first
      drawables.sort((a, b) => a.y - b.y);
      for (const { draw } of drawables) draw();

      drawHUD(
        ctx,
        gs.score,
        gs.goalFlashTimer,
        gs.goalScorer,
        gs.roundWins,
        roundNumberRef.current,
      );

      gs.animFrameId = requestAnimationFrame(gameLoop);
    },
    [resetPuck, triggerGoalEffects],
  );

  // ── Start next round ──────────────────────────────────────────────────────

  const startNextRound = useCallback(() => {
    const gs = stateRef.current;
    cancelAnimationFrame(gs.animFrameId);
    gs.score = [0, 0];
    gs.p1 = { x: RINK_MARGIN_X + 70, y: CANVAS_H / 2 };
    gs.p2 = { x: CANVAS_W - RINK_MARGIN_X - 70, y: CANVAS_H / 2 };
    gs.p1Vel = { x: 0, y: 0 };
    gs.p2Vel = { x: 0, y: 0 };
    gs.p1Angle = 0;
    gs.p2Angle = Math.PI;
    gs.goalScorer = null;
    gs.goalFlashTimer = 0;
    gs.keys = new Set();
    resetPuck();
    setDisplayScore([0, 0]);
    setConfettiParticles([]);
    setRoundNumber((prev) => prev + 1);
    setRoundWinner(null);
    gs.running = true;
    gs.lastTime = performance.now();
    setPhase("playing");
    setTimeout(() => {
      gs.animFrameId = requestAnimationFrame(gameLoop);
    }, 0);
  }, [resetPuck, gameLoop]);

  // ── Start game loop ───────────────────────────────────────────────────────

  const startGame = useCallback(() => {
    resetGame();
    const gs = stateRef.current;
    gs.running = true;
    gs.lastTime = performance.now();
    setPhase("playing");
    setTimeout(() => {
      gs.animFrameId = requestAnimationFrame(gameLoop);
    }, 0);
  }, [resetGame, gameLoop]);

  const restartGame = useCallback(() => {
    const gs = stateRef.current;
    cancelAnimationFrame(gs.animFrameId);
    gs.running = false;
    resetGame();
    gs.running = true;
    gs.lastTime = performance.now();
    setPhase("playing");
    setTimeout(() => {
      gs.animFrameId = requestAnimationFrame(gameLoop);
    }, 0);
  }, [resetGame, gameLoop]);

  // ── Keyboard events ───────────────────────────────────────────────────────

  useEffect(() => {
    const preventKeys = new Set([
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      " ",
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
    ]);

    const onKeyDown = (e: KeyboardEvent) => {
      const code = e.code;
      if (preventKeys.has(code) || preventKeys.has(e.key)) {
        e.preventDefault();
      }
      stateRef.current.keys.add(code);
      stateRef.current.keys.add(e.key);

      if (e.code === "Space" || e.key === " ") {
        if (phaseRef.current === "start") startGame();
        else if (phaseRef.current === "playing") {
          /* no-op */
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      stateRef.current.keys.delete(e.code);
      stateRef.current.keys.delete(e.key);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [startGame]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      cancelAnimationFrame(stateRef.current.animFrameId);
    };
  }, []);

  // ── Initial canvas render (start screen) ─────────────────────────────────

  useEffect(() => {
    if (phase !== "start") return;

    const renderStartScreen = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      drawRink(ctx);

      // Static players + puck preview
      const p1Pos = { x: RINK_MARGIN_X + 70, y: CANVAS_H / 2 };
      const p2Pos = { x: CANVAS_W - RINK_MARGIN_X - 70, y: CANVAS_H / 2 };
      const puck = { x: CANVAS_W / 2, y: CANVAS_H / 2 };

      const startDrawables = [
        {
          y: p2Pos.y,
          draw: () =>
            drawPlayer(
              ctx,
              p2Pos,
              P2_COLOR,
              P2_GLOW,
              "P2",
              Math.PI,
              p2SpriteRef.current,
            ),
        },
        {
          y: p1Pos.y,
          draw: () =>
            drawPlayer(
              ctx,
              p1Pos,
              P1_COLOR,
              P1_GLOW,
              "P1",
              0,
              p1SpriteRef.current,
            ),
        },
        { y: puck.y, draw: () => drawPuck(ctx, puck) },
      ];
      startDrawables.sort((a, b) => a.y - b.y);
      for (const { draw } of startDrawables) draw();

      drawHUD(ctx, [0, 0], 0, null, [0, 0], 1);
    };

    renderStartScreen();

    // Re-render once sprites load so characters appear on the start screen
    const img1 = p1SpriteRef.current;
    const img2 = p2SpriteRef.current;
    if (img1 && !img1.complete)
      img1.addEventListener("load", renderStartScreen, { once: true });
    if (img2 && !img2.complete)
      img2.addEventListener("load", renderStartScreen, { once: true });
  }, [phase]);

  // ── Score submission ──────────────────────────────────────────────────────

  const handleSubmitScore = async () => {
    if (!winnerName.trim() || !winner) return;
    const finalScore = stateRef.current.score;
    const score = BigInt(finalScore[winner - 1]);
    await addScore.mutateAsync({ playerName: winnerName.trim(), score });
    await refetchScores();
    setSubmitted(true);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background select-none">
      {/* Canvas */}
      <div className="relative w-full max-w-[900px] mx-auto">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          tabIndex={0}
          data-ocid="game.canvas_target"
          className="w-full rounded-lg outline-none relative"
          style={{
            boxShadow:
              "0 0 40px oklch(0.85 0.18 195 / 0.2), 0 0 80px oklch(0.85 0.18 195 / 0.08), inset 0 0 0 1px oklch(0.85 0.18 195 / 0.15)",
            aspectRatio: `${CANVAS_W} / ${CANVAS_H}`,
          }}
        />

        {/* ── START SCREEN OVERLAY ── */}
        {phase === "start" && (
          <div className="absolute inset-0 flex flex-col items-center justify-between py-6 px-4 rounded-lg bg-black/60 backdrop-blur-sm">
            {/* Title */}
            <div className="flex flex-col items-center mt-2">
              <h1
                className="font-display text-5xl font-black tracking-tight neon-cyan"
                style={{ color: "#00e5ff" }}
              >
                AIR HOCKEY
              </h1>
              <p
                className="text-sm font-body mt-1"
                style={{ color: "rgba(255,255,255,0.5)" }}
              >
                FIRST TO {WINS_TO_WIN} GOALS · BEST OF{" "}
                {ROUNDS_TO_WIN_MATCH * 2 - 1} ROUNDS
              </p>
            </div>

            {/* Controls */}
            <div className="flex gap-8 text-sm font-body">
              <div
                className="p-4 rounded-lg border"
                style={{
                  background: "rgba(255,58,45,0.1)",
                  borderColor: P1_COLOR,
                  boxShadow: "0 0 12px rgba(255,58,45,0.3)",
                }}
              >
                <p
                  className="font-display font-bold mb-2"
                  style={{ color: P1_COLOR }}
                >
                  PLAYER 1
                </p>
                <div
                  className="grid grid-cols-3 gap-1 text-center text-xs"
                  style={{ color: "rgba(255,255,255,0.7)" }}
                >
                  <div />
                  <div className="bg-white/10 rounded px-2 py-1">W</div>
                  <div />
                  <div className="bg-white/10 rounded px-2 py-1">A</div>
                  <div className="bg-white/10 rounded px-2 py-1">S</div>
                  <div className="bg-white/10 rounded px-2 py-1">D</div>
                </div>
              </div>

              <div className="flex flex-col items-center justify-center gap-2">
                <Button
                  data-ocid="game.start_button"
                  onClick={startGame}
                  className="font-display font-black text-lg px-8 py-3 h-auto tracking-widest"
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
                  or press SPACE
                </span>
              </div>

              <div
                className="p-4 rounded-lg border"
                style={{
                  background: "rgba(61,127,255,0.1)",
                  borderColor: P2_COLOR,
                  boxShadow: "0 0 12px rgba(61,127,255,0.3)",
                }}
              >
                <p
                  className="font-display font-bold mb-2 text-right"
                  style={{ color: P2_COLOR }}
                >
                  PLAYER 2
                </p>
                <div
                  className="grid grid-cols-3 gap-1 text-center text-xs"
                  style={{ color: "rgba(255,255,255,0.7)" }}
                >
                  <div />
                  <div className="bg-white/10 rounded px-2 py-1">↑</div>
                  <div />
                  <div className="bg-white/10 rounded px-2 py-1">←</div>
                  <div className="bg-white/10 rounded px-2 py-1">↓</div>
                  <div className="bg-white/10 rounded px-2 py-1">→</div>
                </div>
              </div>
            </div>

            {/* Leaderboard */}
            <LeaderboardPanel scores={topScores} />
          </div>
        )}

        {/* ── SCREEN FLASH ── */}
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

        {/* ── CONFETTI ── */}
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

        {/* ── GOAL OVERLAY ── */}
        {phase === "goal" && (
          <>
            <style>{`
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

        {/* ── ROUND OVER OVERLAY ── */}
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
                PLAYER {roundWinner} WINS
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

        {/* ── GAME OVER OVERLAY ── */}
        {phase === "gameover" && winner && (
          <div className="absolute inset-0 flex flex-col items-center justify-between py-6 rounded-lg bg-black/75 backdrop-blur-sm">
            {/* Winner banner */}
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
                PLAYER {winner} WINS!
              </h2>
              <p className="font-display text-2xl font-bold mt-2 shimmer-text">
                {displayScore[0]} — {displayScore[1]}
              </p>
            </div>

            {/* Name submission */}
            <div className="flex flex-col items-center gap-3 w-full max-w-xs">
              {!submitted ? (
                <>
                  <p
                    className="font-body text-sm"
                    style={{ color: "rgba(255,255,255,0.6)" }}
                  >
                    Enter {winner === 1 ? "Player 1" : "Player 2"}'s name for
                    the leaderboard
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
                  style={{ color: "#00e5ff" }}
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

            {/* Leaderboard */}
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
      <Table data-ocid="game.leaderboard_table">
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
