# Handshake case-study draft — make the test path reproducible

Status: review draft, 4 November 2026. Optional exercise using this repository's actual build. This is a development record; candidates must replace the reflection prompts with their own decisions and checks. It does not claim that a candidate performed this work.

## Problem and evidence

Starting commit: [`8140e08b92240eeaf53485964348d91547f97bc9`](https://github.com/ibloud/sewers-and-shadows-bot/commit/8140e08b92240eeaf53485964348d91547f97bc9), committed 1 October 2026 at 12:08:39 UTC. Inspected 4 November 2026. The baseline's `bot/package.json` ran `node ../test-float-chess.js`, but the tracked test is `bot/test-float-chess.js`. A new reviewer cannot run the advertised package test command successfully.

Reproduction in a separate checkout (Node 18 or later; no Discord or model credentials):

```sh
git clone https://github.com/ibloud/sewers-and-shadows-bot.git float-chess-exercise
cd float-chess-exercise
git switch --detach 8140e08b92240eeaf53485964348d91547f97bc9
npm test --prefix bot
```

Expected: run the Float Chess regression suite. Actual, reproduced before the change: exit 1, `MODULE_NOT_FOUND`, looking for `sewers-and-shadows-bot/test-float-chess.js`. No dependency installation is needed to run these pure-engine tests.

## Bounded correction and replay

Change only the test script in `bot/package.json`:

```diff
- "test": "node ../test-float-chess.js"
+ "test": "node test-float-chess.js"
```

Replay `npm test --prefix bot`. Observed after correction: exit 0, **16 passed, 0 failed**. The same engine and assertions are retained. Acceptance criteria: the command works from the repository root with `--prefix bot` and from `bot/` with `npm test`; no bot login, model request or rules modification occurs.

[Compare starting commit with the review branch](https://github.com/ibloud/sewers-and-shadows-bot/compare/8140e08b92240eeaf53485964348d91547f97bc9...codex/browser-training-review). The broader PR adds the browser project; the exercise correction is the single script line above. A participant can create a separate branch containing just that line.

## Contribution and AI assistance

The development assistant inspected the tracked paths, reproduced the failure, proposed the path correction, added a local browser adapter around the existing engine/evaluator, and ran the reported checks. The owner supplied the scope and boundaries. AI generated code and draft documentation at development time. Runtime play uses deterministic heuristic selection and scripted event narration; there is no trained model in the browser.

Candidate reflection, to complete from actual experience:

- Starting commit and environment: [record yours].
- AI helped with: [specific suggestions or code; include what you rejected].
- I decided: [why this file and correction, and what I kept out of scope].
- I personally verified: [commands, input path, browser and observed output].
- Remaining uncertainty: [physical device, assistive technology or rules review].
- Evidence: [your diff, before/after output, and optional local demo capture].

Do not present assistant-run checks as personal hands-on verification. The browser's responsive and keyboard checks are Chromium automation; physical iPad Safari, VoiceOver and assistive-device review remain unverified. Rules interpretations and Roomy deployment behavior are separate review items.

## Participation

Playing and the exercise are optional. Current open contributions are voluntary and unpaid. Before substantive contribution, agree in writing on scope, time, public visibility, credit preferences, license treatment and an exit path. Participants may stop at any point. Participation does not imply employment, contributor approval, ownership, compensation or academic credit. Follow the [existing mission and participation terms](https://github.com/ibloud/ibloud.github.io/blob/main/MISSION.md). No participant identity, recordings or results were collected for this review.
