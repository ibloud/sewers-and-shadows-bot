// Review-only chapter, newly drafted from the owner's sequence. Not approved canon.
VAR approach = ""
VAR sticker = false
VAR candle = false
VAR hoodie = false
VAR route = false
VAR encounter = false
VAR result = ""
VAR journal = false
VAR reflection = ""
VAR ended = false
VAR cards_entered = false
VAR cards_result = ""
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
# item:sticker
This bubble-free sticker is adapted as a fictional route marker; its arrow is a clue, not an instruction to enter a real drain. You keep its direction in mind.
-> street
+ [Follow Violet to the fictional stairwell.] -> below
=== below ===
Violet holds a candle beneath a covered lamp niche. Her hoodie is part of the cosplay; the person wearing it remains Violet.
+ [Inspect the candle.]
~ candle = true
# item:candle
A glass jar soy wax candle. In this story its light can reveal the route; no purchase is needed.
-> below
+ [Inspect the hoodie.]
~ hoodie = true
# item:hoodie
A black heavyweight hoodie with a bold front badge. Orange-red details and pale yellow cuffs are Violet’s additional costume styling. Violet calls it a costume, not a transformation.
-> below
+ [Inspect the Final Thoughts journal.] -> journal_entry
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
At the next table Violet and Pennywise lay out cards. You can play Float Cards as Violet, or decline. Each side commits one hidden card before both are revealed. Higher rank deals one RP; ties deal none.
+ [Play Float Cards as Violet.]
~ cards_entered = true
# encounter:cards
-> DONE
+ [Watch Violet place a card, then return to the street.] -> ending
+ [Decline the card scene and return to the street.] -> ending
=== cards_return ===
{cards_result:
- "won": Violet wins the card encounter. Pennywise gathers the spent cards.
- "lost": Pennywise wins the card encounter. Violet still keeps the way back open.
- "draw": The card encounter ends in a draw. Both hands are empty.
- else: Violet leaves the card encounter. No winner is declared.
}
+ [Return to the street.] -> ending

=== ending ===
~ ended = true
You and Violet step into the rain. The chapter is complete. You can inspect the objects again or replay with a different first choice. No shop visit or purchase was required.
+ [Inspect the story objects again.] -> objects
=== objects ===
The objects remain part of the story. You may inspect them or visit the shop; neither requires a purchase.
+ [Inspect the sticker again.]
~ sticker = true
# item:sticker
A printed arrow: the first clue on the route.
-> objects
+ [Inspect the candle again.]
~ candle = true
# item:candle
A protected light: the route-revealing item.
-> objects
+ [Inspect the hoodie again.]
~ hoodie = true
# item:hoodie
Violet's cosplay layer: costume does not erase her identity.
-> objects
+ [Inspect the Final Thoughts journal again.] -> journal_return
+ [Return to the ending.] -> ending

=== journal_entry ===
~ journal = true
# item:journal
A spiral-bound journal lies beside the candle. Violet suggests recording what you noticed before deciding what it means.
+ [Record the route clue.]
~ reflection = "clue"
You mark the repeated arrow and leave its meaning open.
-> below
+ [Close the journal for now.] -> below

=== journal_return ===
~ journal = true
# item:journal
The journal offers a place to separate what happened from what you expected.
+ [Record a thought about the table encounters.]
~ reflection = "encounters"
You note that finishing, losing and choosing to leave are different outcomes. Each still brought you back to the street.
-> objects
+ [Close the journal.] -> objects
