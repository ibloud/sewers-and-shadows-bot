# Browser review evidence and integration boundaries

Review date: 4 November 2026. Baseline: `8140e08b92240eeaf53485964348d91547f97bc9` (1 October 2026, 12:08:39 UTC). This is a review proposal, not a production release or a declaration of canonical rules.

## Findings before implementation

- Inspected all three branch trees: `main` at the baseline, `codex/social-preview` at `6355848010573ce1b9a8ab9f3c12708561d96144`, and `docs/mission-boundary-20261001` at `ba02a17dd572a0eb7b8ee45d778291659d874880`. The engine and opponent blob SHAs match across all three. Differences concern documentation and social preview; no competing browser, AT Protocol or Roomy implementation was present. GitHub's open PR and issue collections both returned empty.
- No `AGENTS.md`, license, rights manifest, build pipeline, deployment configuration, browser project or authentication package is tracked in this repository at the baseline. No license was inferred from another repository. Root and bot READMEs link to Loptr Lab's mission/participation terms. Existing bot dependencies are Discord.js and dotenv; browser play needs neither.
- Inspected the linked [mission](https://github.com/ibloud/ibloud.github.io/blob/main/MISSION.md), [collaboration terms](https://github.com/ibloud/ibloud.github.io/blob/main/COLLABORATE.md), [portfolio design record](https://github.com/ibloud/ibloud.github.io/blob/main/docs/PORTFOLIO_DESIGN.md) and [rights matrix](https://github.com/ibloud/ibloud.github.io/blob/main/docs/IP_AND_RIGHTS_MATRIX.md). The design record explicitly scopes its CSS to the portfolio repository; this app adopts its semantic violet/teal direction with original CSS and the requested 20px baseline. The bot's social-preview image is retained in GitHub but not loaded into the game because its public character/art clearance is not established here.

## Rules authority and conflicts

The implemented baseline is `bot/float-chess-engine.js`, blob `69045ba3e141d82c8cbd963a1b14f8303e54f847`. It owns validation, simultaneous resolution, specials and game results. This preview retains it unchanged. No ordinary-chess or Duet engine is used.

The engine references an external design document that is not in this repository; an authoritative written rules approval could not be established. Its marked `DESIGN CALL` comments cover en passant, knight Float Jump geometry, bishop Mirror Shift geometry, queen Dance-Off and multi-king checkmate. Specific conflict: `src/rulesText.js` describes bishop/knight abilities as once per game, while the engine tracks `usedSpecial` per piece. Browser help states the implementation, and owner rules review remains necessary. There is no cross-branch engine conflict.

Other retained limitations: end-state search considers standard moves and may miss special escapes; the multi-king implementation is conservative; the 50-turn event offers a draw rather than ending the game. Balloon-distraction events request future move revelation but the original transport does not implement a complete reveal protocol; this preview logs the event without claiming that protocol. Simultaneous en passant depends on the opponent's pending move; the preview's pre-commit legal menu does not offer that conditional action. This is a disclosed input limitation, not a new rules interpretation.

## Architecture and retained components

| Layer | Source and behavior |
| --- | --- |
| Rules | Original `bot/float-chess-engine.js`, unchanged; `_validateMove`, `submitMove`, `toJSON` and emitted events. The browser session has one documented adapter to the existing private validator. A public engine API is future work. |
| Opponent | Reuses `enumerateLegalMoves` and `scoreMove` from `bot/src/pennywiseAI.js`, unchanged. Harbour removes random jitter, uses stable tie-breaking and filters all candidates through full engine validation (including slowed pieces). Special-action fallback comes from engine-valid actions. It is a heuristic, not an LLM. |
| Browser session | `browser/session.js` commits the opponent before human selection, rejects invalid input before submission and rolls back on a resolution exception. A rejection preserves pending moves, history and board. End & inspect ends only the local session and declares no winner; engine outcomes remain engine-owned. |
| Narration | Pure deterministic event labels; receives copied engine results. No character prompt or model adapter is imported. Narration never submits moves. A synthetic exception test verifies the resolved game is unaffected. |
| Presentation | `browser/index.html`, `app.js`, `style.css`: human/opponent route, explicit selection/confirmation/cancellation, coordinate alternative, visible state, history, restart, completion, replay, summary preview, help and prefilled GitHub finding link. |
| Persistence | Browser match is in memory; refresh discards it. Local summary is a text preview only. Historical `gameManager.js` keeps per-channel sessions and flat `bot/data/stats.json` stats; it is not imported by the browser. |
| Historical transport | `bot/src/index.js`, card manager, triggers, Violet/Pennywise persona files and prompts remain separate and unchanged. No Discord reconnection or exhibition timer. Historical model fetch has no timeout isolation guarantee; it is not an optional adapter of this app and was not invoked. |
| Build | Dependency-free Node build wraps only the engine, evaluator and session in local module factories. `dist/` contains four static assets. Preview server serves only an asset allowlist on loopback and denies network connections in CSP. No keys, analytics, external fonts or data imports. |

No exhibition mode: the existing Discord timer would require meaningful pause/resume and transport work. The human-first slice is kept small.

## AT Protocol and Roomy — planned, unverified for this application

Upstream inspected: [`muni-town/roomy` at `cc11a2ebb6eae38d878618b5812f66ad1a92585f`](https://github.com/muni-town/roomy/tree/cc11a2ebb6eae38d878618b5812f66ad1a92585f), accessed 4 November 2026. Source inspection establishes interfaces, not the features deployed in Loptr Lab's Roomy instance.

| Evidence | Bounded conclusion |
| --- | --- |
| [`README.md`](https://github.com/muni-town/roomy/blob/cc11a2ebb6eae38d878618b5812f66ad1a92585f/README.md) | Roomy describes AT Protocol identity and a local SQLite event store; its package overview contains historical names. |
| [`packages/appserver/docs/authentication.md`](https://github.com/muni-town/roomy/blob/cc11a2ebb6eae38d878618b5812f66ad1a92585f/packages/appserver/docs/authentication.md) | HTTP uses PDS-proxied inter-service JWTs and an appserver DID; WebSockets use a separate single-use ticket exchange. Documentation and CLI examples use different default DIDs/domains, so the actual instance must supply discovery/configuration. |
| [`packages/sdk/src/operations/message.ts`](https://github.com/muni-town/roomy/blob/cc11a2ebb6eae38d878618b5812f66ad1a92585f/packages/sdk/src/operations/message.ts) and [`sendEvents.ts`](https://github.com/muni-town/roomy/blob/cc11a2ebb6eae38d878618b5812f66ad1a92585f/packages/sdk/src/schemas/procedures/sendEvents.ts) | Implemented SDK creates `space.roomy.message.createMessage.v0` events through a supplied sender; procedure NSID is `space.roomy.space.sendEvents`. A text match summary is a plausible first application test. No sender is implemented or called here. |
| [`packages/cli/README.md`](https://github.com/muni-town/roomy/blob/cc11a2ebb6eae38d878618b5812f66ad1a92585f/packages/cli/README.md) | Documents spaces/rooms/read/send and environment-based credentials. This is not a browser OAuth foundation for the game. CLI account or message actions were not run. |
| [`packages/sdk/src/schema/extensions/message.ts`](https://github.com/muni-town/roomy/blob/cc11a2ebb6eae38d878618b5812f66ad1a92585f/packages/sdk/src/schema/extensions/message.ts) and [`docs/plans/web-tiles-integration.md`](https://github.com/muni-town/roomy/blob/cc11a2ebb6eae38d878618b5812f66ad1a92585f/docs/plans/web-tiles-integration.md) | Source defines `space.roomy.attachment.tile.v0`, constrained `ing.dasl.masl` AT-URIs and an 8192-byte JSON payload cap. The plan reports host-to-tile support and no reader for the tile-to-host data channel. A plan's shipped claim is not a deployment verification. Arbitrary iframe apps or game records are not thereby accepted. |

No tested sign-in foundation exists in this repository, so no speculative OAuth package or game lexicon was added. Optional identity could later attach an explicitly authenticated DID to a reviewed summary; publication would require a separate user action and an established record convention. A local JSON summary is not an AT Protocol record, signature, provenance attestation or Roomy message. AT Protocol does not automatically provide real-time multiplayer, hidden-move commitments or state synchronization.

Smallest next consented test: the owner identifies the actual instance URL/appserver DID, deployed revision, test space/room and permitted test identity; confirms membership, scopes and written consent to one synthetic summary; then a tester uses the supported Roomy client/SDK to send that reviewed plain-text summary to the isolated room and reads it back, recording event/message ID and actual display. Agree removal/retention before sending. This step has not been run. A tile adaptation comes only after instance capabilities and the text path are verified. Do not create accounts or publish records as a prerequisite to reviewing this local app.

## Railway read-only observation

On 4 November 2026, the connected Railway status tool reported `sewers-and-shadows-bot` (`c5216fe9-3ce7-405a-9444-18df2598b7ef`) in `hopeful-friendship` (`2bed2e57-7ce2-4795-a1ff-a5e924885be5`), production (`91ff523a-a87e-49b1-92eb-ed48f031d298`): **Offline**, no active deployments, no pending staged/applying work, zero recent failures. Zero failures does not mean healthy or online. No Railway setting, deployment, variable or volume was changed. No live health response was claimed.

## Verification

Run from the repository root, Node 18+:

```sh
npm test
npm test --prefix bot
npm run build
npm start
# Open http://127.0.0.1:4173; start at #play or use Play on the landing section.
```

No install or credential is required. `npm test` passes the original 16 engine assertions and 7 session tests. The corrected bot command passes 16 assertions. Session tests cover a legal move and committed opponent response, invalid/malformed input preserving state, rollback/retry, legal candidate filtering, end/restart and summary isolation, actual engine draw completion through a synthetic repetition fixture, and narration failure isolation. Synthetic fixtures do not establish full rules correctness.

Browser smoke check: install Playwright separately (`npm install --no-save --package-lock=false playwright`), start the server, then run `node test/browser-smoke.cjs` (set `CHROMIUM_PATH` if using an installed Chromium). In this environment it used installed Chromium 154.0.8037.57. Passed pointer selection/legal/invalid paths, cancel recovery, native keyboard select/Tab/Enter/Escape, opponent response, end/restart/replay/summary, visible focus and 51px coordinate-select target, and 320/390/820/1440px layouts both at normal 20px root text and 40px root text with line/letter/word/paragraph spacing overrides. All eight measurements had document scroll width equal to viewport width; the board's labeled region scrolls when necessary. Reduced-motion media was checked. Four default asset requests, all loopback; no external requests or browser errors on the checked paths. Local preview CSP further blocks connect requests.

Browser emulation and automated focus/layout checks do not establish WCAG conformance, physical iPad Safari compatibility, VoiceOver quality, switch/assistive-device acceptance or usability. These remain separate human/device checks. No live model failure was tested, because no runtime model adapter exists. Historical model/Discord functionality was neither connected nor certified by these checks.

## Review handoff and next owner action

No existing CI or preview-hosting configuration was found. The draft PR and local preview are the review path. Keep Railway offline and do not merge or publish until owner review. First review the landing/play path locally, then decide the unresolved rules and schedule physical-device/accessibility checks. A review is finished when the owner has assessed the slice, recorded rules decisions and acceptance gaps, and separately authorized any future integration/release. Separate Duet, Ren’s Rhapsody and Break This Build workstreams were not modified.
