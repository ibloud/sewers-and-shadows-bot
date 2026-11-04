# Sewers & Shadows

A layered Discord chess-variant prototype maintained within the Loptr Lab ecosystem. See [bot setup, commands, and limitations](bot/README.md).

## Browser review — play before sign-in

A local human-versus-opponent Float Chess slice reuses the existing engine and heuristic evaluator. The review chapter follows Violet, a separate character cosplaying Pennywise, through Derry and a bounded match against Pennywise; narration is scripted. No Discord, account, model key or paid service is required.

```sh
# Node 18 or later; from the repository root, no install required
npm test
npm run build
npm start
# Open http://127.0.0.1:4173
```

Use Play, select a white piece and destination, then Confirm & resolve. Input & rules is available before and during play. Cancel/Escape clears a selection; restart, local summary preview and snapshot replay are included. Refresh discards the in-memory session. The original Discord bot remains separate historical functionality.

[Review evidence and Roomy plan](docs/REVIEW.md) · [Optional Handshake exercise and case-study draft](docs/CASE_STUDY.md) · [Provenance](docs/PROVENANCE.md)

This is a review proposal. Roomy/AT Protocol integration is planned and unverified for this app. Railway is not activated by the local preview commands.

## Loptr Lab mission and participation

Loptr Lab is a pre-seed, people-over-profit, accessibility-first venture working toward a self-sustaining model within a capitalist economy. Money sustains the work; meaningful change for people is its purpose. We accept funding only on terms that keep people and accessibility first. Our long-term vision includes universal basic income. We aim to bring change to life and leave a transparent record of what we tried, what worked, and what failed so others can carry it forward. This mission governs our projects, funding decisions, and partnerships; it is not a temporary marketing position.

Current open review and contribution opportunities are voluntary and unpaid. Before work begins, agree in writing on scope, time, what will be public, credit preferences, and an exit path. You can stop at any point. Participation does not promise employment, ownership, revenue share, academic credit, or future pay. Any paid commission or other formal arrangement requires a separate signed agreement before work begins. External assistance or benefits belong to the participant and are not compensation from Loptr Lab.

Financial support is optional and sustains infrastructure, maintenance, accessibility work, and documented development. Paying does not buy contributor status, canon authority, approvals, ownership, or employment. Participation and accessibility are not sponsorship rewards. Project-specific licenses and existing signed agreements continue to apply.

[Full mission and participation terms](https://github.com/ibloud/ibloud.github.io/blob/main/MISSION.md).

