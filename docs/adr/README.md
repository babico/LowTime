# ADR Index

- Purpose: Explain how architecture decision records are written and list the decisions currently accepted for LowTime.
- Audience: Engineers and reviewers making long-lived technical decisions.
- Status: Baseline
- Last Updated: 2026-03-24
- Related Docs: [Docs Map](../00-docs-map.md), [Product Overview](../01-product-overview.md), [System Architecture](../02-system-architecture.md)

## ADR Format
- `Context`: What problem or pressure led to the decision.
- `Decision`: The chosen direction.
- `Consequences`: What becomes easier or harder because of the decision.
- `Alternatives Considered`: Main rejected options and why they were not chosen.

## Status Labels
- `Accepted`: The current default.
- `Superseded`: Replaced by a later ADR.
- `Proposed`: Under discussion and not yet the default.

## Current ADRs
- [ADR-001-no-registration.md](ADR-001-no-registration.md)
- [ADR-002-sfu-first-p2p-fallback.md](ADR-002-sfu-first-p2p-fallback.md)
- [ADR-003-pwa-first.md](ADR-003-pwa-first.md)
- [ADR-004-1to1-core-small-group-beta.md](ADR-004-1to1-core-small-group-beta.md)
- [ADR-005-auto-plus-manual-quality-controls.md](ADR-005-auto-plus-manual-quality-controls.md)
- [ADR-006-docker-first-deployment.md](ADR-006-docker-first-deployment.md)

## When To Add An ADR
- When a decision changes system boundaries or long-term maintenance cost.
- When a product constraint materially shapes architecture.
- When future contributors would otherwise re-debate the same tradeoff without context.
