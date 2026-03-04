# Hockey Game

## Current State

A top-down 2D air hockey game rendered on a Canvas. Two cartoon player sprites slide around a flat rink drawn from a bird's-eye view. Physics include puck bouncing, elastic collisions, scoring, goal animations (confetti, screen flash, "GOAL!" text), a round system (first to 7 goals wins a round; first to 3 rounds wins the match), a leaderboard, and full keyboard controls (WASD / Arrow keys).

## Requested Changes (Diff)

### Add
- A perspective-transformed ice rink that gives the feeling of standing on the ice -- drawn in 3-point perspective so the ice surface recedes into the distance
- Ice surface texture details (scratches, sheen) rendered in perspective
- Player characters drawn as proper upright hockey players (with skates, jerseys, stick) that move along the ice plane
- Perspective-correct shadows/depth cues under each player
- Camera-angle feel: spectators sit in the upper portion of the canvas, ice stretches toward a vanishing point

### Modify
- Replace flat top-down rink drawing with a perspective-projected rink (still Canvas 2D, using CSS transforms or manual perspective math)
- Player and puck positions are still stored in 2D "ice coordinates" but projected to screen space for rendering
- Rink lines (blue lines, center line, face-off circles, goal creases) all drawn in perspective
- Goal nets rendered as 3D-looking structures in perspective
- HUD, overlays (goal, round over, game over, start screen) remain unchanged
- Player sprites updated to front-facing upright hockey player characters instead of top-down pucks

### Remove
- Flat top-down rink rendering

## Implementation Plan

1. Create a `project3D` utility that converts ice-plane (x, y) coordinates to screen (sx, sy) using a perspective transform with a defined vanishing point and horizon line
2. Rewrite `drawRink` to use projected coordinates for all lines, arcs (approximated as polylines in perspective), and goal nets
3. Rewrite `drawPaddle` / player rendering to draw an upright hockey character sprite at projected position, sized by depth (farther = smaller)
4. Rewrite `drawPuck` to draw the puck in perspective (elliptical, flattened on ice plane)
5. Adjust all collision/physics to continue working in flat 2D ice coordinates -- perspective is only a rendering layer
6. Generate new upright-facing player sprites (P1 red jersey, P2 blue jersey, both holding hockey sticks)
7. Keep all game logic, scoring, HUD overlays, and leaderboard untouched
