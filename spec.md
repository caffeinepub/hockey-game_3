# Hockey Game

## Current State
A 2-player air hockey game on canvas. Players score goals to reach 7 points, after which a "game over" overlay appears with a winner banner, score submission to a leaderboard, and a "Play Again" button that resets everything from scratch.

There is no concept of rounds -- the game is a single match.

## Requested Changes (Diff)

### Add
- A **round system**: track round wins per player (e.g. P1 rounds won, P2 rounds won)
- A **round-end overlay** that appears after someone wins a round (reaches 7 goals). Shows: who won the round, current round score (e.g. "Round 2 — P1: 1  P2: 0"), and a "NEXT ROUND" button
- Round counter display in the HUD or overlay
- After clicking "Next Round", reset goal scores to 0 and start a new round immediately
- After a configurable number of rounds won (e.g. first to win 3 rounds = match winner), show the final "GAME OVER" screen with overall winner

### Modify
- `GamePhase` type: add `"roundover"` phase
- Game over condition: trigger only when a player has won enough rounds (e.g. first to 3 rounds), not just on goal tally
- The "Play Again" button resets both goal scores AND round wins
- HUD: show round wins alongside goal score (e.g. small round indicators)

### Remove
- Nothing removed

## Implementation Plan
1. Add `ROUNDS_TO_WIN_MATCH = 3` and `roundWins: [number, number]` to game state
2. Add `roundNumber` state to React component
3. Add `"roundover"` to `GamePhase` type
4. When a player reaches `WINS_TO_WIN` goals, check if their round wins reach `ROUNDS_TO_WIN_MATCH`:
   - If yes: set phase to `"gameover"` (existing behavior)
   - If no: increment round wins, set phase to `"roundover"`
5. Add round-over overlay: show winner of round, round wins tally, "NEXT ROUND" button
6. `startNextRound()` function: reset goal scores to 0, reset puck/paddles, increment round number, resume game loop
7. Update HUD canvas drawing to show small round-win indicators (dots or numbers) near the score
8. Update `resetGame()` to also clear round wins and round number
