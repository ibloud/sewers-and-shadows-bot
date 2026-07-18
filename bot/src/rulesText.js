'use strict';

const RULES_TEXT = `
**Simultaneous movement.** Both players submit one move each turn; moves resolve together, not in alternating order.

**Same square → Feeding Frenzy.** Both pieces float (removed). Pennywise also steals one piece from your reserves if you have any.

**Literal swap → Crossing the Streams.** If your move lands exactly on the enemy piece's starting square, and their move lands exactly on yours, both pieces survive but swap colors.

**Moving into a vacated square → Ghost Move.** No special effect — just flavor.

**Queen takes Queen → Dance Off.** Both Queens are removed, regardless of who captured whom.

**Rook — Sewer Slide** (once per game): slide as normal, but leave a trail on every square passed through. Any piece that lands on a trailed square next turn is slowed and can't move the turn after.

**Bishop — Mirror Shift** (once per game): instead of a normal move, step one square orthogonally, breaking the "always the same color square" rule bishops normally follow.

**Knight — Float Jump** (once per game): if a normal knight move is blocked by your own piece, extend the long leg of the L by one extra square and jump over.

**Pawn — Red Balloon** (once per game): push forward two squares regardless of whether it's your pawn's first move, leaving a vapor trail.

**Check, checkmate, stalemate** work as in standard chess, adapted for simultaneous play — including Double Check (both Kings attacked at once) and Double Drowning (both Kings end up floated at once, ending the game in stalemate).

Use \`/move from:e2 to:e4\` to submit a move, with an optional \`special:\` flag for the abilities above.
`.trim();

module.exports = { RULES_TEXT };
