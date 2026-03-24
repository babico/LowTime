# ADR-003: PWA First Delivery

- Purpose: Record why LowTime ships as a web app before native mobile applications.
- Audience: Product, frontend, and platform contributors.
- Status: Accepted
- Last Updated: 2026-03-24
- Related Docs: [Product Overview](../01-product-overview.md), [Frontend Architecture](../07-frontend-architecture.md)

## Context
LowTime's first goal is fast reach and minimal installation friction. Native apps would improve some device integration later, but they would slow the first release and split the team's effort early.

## Decision
Ship LowTime first as a mobile-friendly PWA. Use installability, app-shell caching, and responsive design to make the web experience feel app-like. Re-evaluate native wrappers only after the PWA proves product fit.

## Consequences
- The team can move faster with one client surface.
- Mobile browser limitations must be handled carefully, especially for screen share and device APIs.
- App-store distribution is deferred.

## Alternatives Considered
- Native iOS and Android first
  - Rejected because it increases time-to-market and doubles initial client complexity.
- Thin wrappers from day one
  - Rejected because the web product should prove core usage before wrapper work is added.
