# ADR-005: Automatic Adaptation Plus Manual Quality Controls

- Purpose: Record why LowTime combines automatic network adaptation with both simple presets and advanced user controls.
- Audience: Product, media, frontend, and QA contributors.
- Status: Accepted
- Last Updated: 2026-03-24
- Related Docs: [Media And Quality](../04-media-and-quality.md), [Room And User Flows](../03-room-and-user-flows.md)

## Context
Many users just want the call to work, while others on fragile or expensive networks need clear, explicit control over what the app sends and receives. A fully automatic system hides useful knobs from power users. A fully manual system is too heavy for mainstream users.

## Decision
Use automatic adaptation as the default behavior, expose three presets in the main UI, and provide advanced controls in a secondary settings panel. Let hosts cap the maximum allowed room quality while still allowing participants to reduce their own quality below that cap.

## Consequences
- Mainstream users get a simple interface.
- Power users can actively manage bandwidth.
- The frontend and media controller must support both local preferences and room-level policy.
- QA must test both automatic and manual quality paths.

## Alternatives Considered
- Fully automatic quality only
  - Rejected because it gives weak-network users too little control.
- Fully manual controls only
  - Rejected because it would make the product too complex for quick-call usage.
