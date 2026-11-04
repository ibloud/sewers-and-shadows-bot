// Review-only chapter, newly drafted from the owner's sequence. Not approved canon.
VAR approach = ""
VAR sticker = false
VAR candle = false
VAR hoodie = false
VAR route = false
VAR encounter = false
VAR result = ""
VAR ended = false
-> entry
=== entry ===
Derry, after rain. Violet waits beside a shuttered shop. Her orange-red costume seams and pale yellow cuffs catch the streetlight. She is a separate person cosplaying Pennywise, not Pennywise in disguise.
+ [Ask Violet to explain the route before following.]
~ approach = "asked"
Violet points to a marked stairwell. You agree to follow only as far as the table.
-> street
+ [Look for your own clue before following.]
~ approach = "observed"
You notice a sticker beside the stairwell: a small mark repeated below street level.
-> street
=== street ===
A sticker on the shop window points toward a drain-shaped symbol.
+ [Inspect the sticker.]
~ sticker = true
This bubble-free sticker is adapted as a fictional route marker; its arrow is a clue, not an instruction to enter a real drain. You keep its direction in mind.
-> street
+ [Follow Violet to the fictional stairwell.] -> below
=== below ===
Violet holds a candle beneath a covered lamp niche. Her hoodie is part of the cosplay; the person wearing it remains Violet.
+ [Inspect the candle.]
~ candle = true
A glass jar soy wax candle, based on the Dallas XY shop screenshot. In this story its light can reveal the route; no purchase is needed.
-> below
+ [Inspect the hoodie.]
~ hoodie = true
A black Essential Heavyweight Hoodie with a bold front badge, based on the Dallas XY screenshot. Orange-red details and pale yellow cuffs are Violet’s additional costume styling. Violet calls it a costume, not a transformation.
-> below
+ {candle} [Use the candle to reveal the route.]
~ route = true
Light catches the same arrow you saw above. The dry passage leads to a table.
-> table
=== table ===
Pennywise waits opposite Violet. You choose Violet's white moves; Pennywise commits a black move before you confirm. Both resolve together under Float Chess rules.
{approach == "asked": Violet repeats the agreed boundary: you can leave at any time.}
{sticker: The sticker's arrow is repeated on the table edge. Your clue led here.}
+ [Begin the bounded chess encounter.]
~ encounter = true
# encounter:chess
-> DONE
+ [Leave the table without playing.]
~ result = "left"
-> return_scene
=== return_scene ===
{result:
- "lost": Violet lowers her king. Losing the match does not close the way home.
- "won": Violet wins the match. Pennywise clears a space beside the board.
- "draw": Neither side wins. Violet records the engine's draw and closes the board.
- "bounded": Three simultaneous turns are complete. This chapter's practice encounter ends without declaring a chess winner.
- else: Violet leaves the chess encounter. No winner is declared, and the route remains open.
}
At the next table Violet and Pennywise lay out cards. The historical Float Cards engine uses simultaneous hidden choices and one reveal. Here, this is a written scene: the playable card mechanic is pending browser verification.
+ [Watch Violet place a card, then return to the street.] -> ending
+ [Decline the card scene and return to the street.] -> ending
=== ending ===
~ ended = true
You and Violet step into the rain. The chapter is complete. You can inspect the objects again or replay with a different first choice. No shop visit or purchase was required.
+ [Inspect the story objects again.] -> objects
=== objects ===
The objects remain part of the story; shop destinations have not been verified for this review.
+ [Inspect the sticker again.]
~ sticker = true
A printed arrow: the first clue on the route.
-> objects
+ [Inspect the candle again.]
~ candle = true
A protected light: the route-revealing item.
-> objects
+ [Inspect the hoodie again.]
~ hoodie = true
Violet's cosplay layer: costume does not erase her identity.
-> objects
+ [Return to the ending.] -> ending
