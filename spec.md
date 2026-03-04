# Hockey Game

## Current State
New project — no existing code.

## Requested Changes (Diff)

### Add
- A top-down 2D air hockey game playable in the browser
- Two-player mode (Player 1: keyboard WASD, Player 2: keyboard arrow keys) on the same machine
- Game canvas rendered via Canvas API
- Puck physics: velocity, friction, wall/paddle collisions, goal detection
- Two paddles (one per player) that can be moved around their respective halves
- Score tracking: first to 7 goals wins
- Game states: start screen, active gameplay, goal celebration, game over
- High score (max score reached) persisted in backend canister
- Sound effects via Web Audio API (goal, puck hit, wall bounce)
- Responsive canvas that fits in viewport

### Modify
- N/A (new project)

### Remove
- N/A (new project)

## Implementation Plan
1. Backend: store and retrieve high scores (player names + score) as a leaderboard
2. Frontend:
   - Canvas-based game loop using requestAnimationFrame
   - Game entities: Puck, Paddle (x2), Goals (x2), Rink
   - Physics: puck velocity + friction, elastic collisions with paddles and walls
   - WASD controls for P1 (left half only), Arrow keys for P2 (right half only)
   - HUD: scoreboard, player labels, win message
   - Start screen with instructions and leaderboard display
   - Game over screen with winner announcement and leaderboard
