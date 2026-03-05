# Hockey Game

## Current State
3v3 3D hockey game with React Three Fiber. Features: character selection with stats/abilities, possession/shooting/body-checking, AI teammates for non-active skaters, single-player VS CPU mode (Easy/Medium/Hard), round/match system, confetti goal animations, leaderboard.

Each team has 3 skaters controlled (or AI-assisted). There are goal nets on each side but no dedicated goalie -- skaters can block but there is no goalie entity that patrols the crease.

## Requested Changes (Diff)

### Add
- A CPU-controlled goalie for each team that actively defends their net
- The goalie is a separate entity (not one of the 3 skaters) -- it stays near the goal crease and moves laterally to track the puck
- Goalie mesh: visually distinct from regular skaters (different shape/color accent, goalie pads, blocker visual cue)
- Goalie movement: patrols along the crease line (z-axis) following the puck's z position, clamped to the crease area (z roughly -2.5 to 2.5, x fixed near the goal line)
- Goalie does NOT leave the crease -- it only slides left/right
- Goalie deflects the puck if the puck enters the crease and hits the goalie's bounding area (treat as a wall bounce that sends puck back)
- In 2P mode: both goalies are CPU-controlled
- In VS CPU mode: P1 goalie is CPU, P2 goalie is CPU (no player controls a goalie)
- Goalie speed scales slightly with CPU difficulty when it's the CPU's goalie (P2 side); P1 goalie always moves at medium speed
- HUD shows a small "GK" indicator on each side

### Modify
- GameScene: add two GoalieMesh refs and physics states, integrate goalie movement into useFrame loop
- Goal detection: puck passing through crease should first be checked against goalie collision before registering as a goal

### Remove
- Nothing removed
