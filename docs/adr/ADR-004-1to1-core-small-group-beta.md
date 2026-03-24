# ADR-004: 1:1 Core, Small-Group Beta

- Purpose: Record why LowTime optimizes first for 1:1 call quality while still planning for small-group rooms.
- Audience: Product, media, QA, and operations contributors.
- Status: Accepted
- Last Updated: 2026-03-24
- Related Docs: [Product Overview](../01-product-overview.md), [Media And Quality](../04-media-and-quality.md), [Roadmap And Release Phases](../12-roadmap-and-release-phases.md)

## Context
LowTime is aimed at unstable network environments where every added participant increases bandwidth, layout, and reliability pressure. Supporting small groups is valuable, but trying to optimize equally for 1:1 and group calling at launch would dilute the product's core quality target.

## Decision
Treat 1:1 calling as the primary quality target and launch requirement. Support up to 4 participants through the same room model, but label that path beta until performance metrics are healthy.

## Consequences
- The product can promise stronger quality expectations for its primary use case.
- Group-specific UX and scaling work can be phased in without blocking the MVP.
- Documentation and QA must clearly distinguish core support from beta support.

## Alternatives Considered
- Full parity between 1:1 and group rooms at launch
  - Rejected because it would over-expand the MVP and weaken low-bandwidth quality goals.
- 1:1 only with no path to groups
  - Rejected because the architecture should still support near-term growth to small groups.
