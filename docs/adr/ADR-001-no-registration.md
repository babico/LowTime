# ADR-001: No Registration In V1

- Purpose: Record why LowTime uses anonymous link-based rooms instead of account creation in the first release.
- Audience: Product, frontend, backend, and security contributors.
- Status: Accepted
- Last Updated: 2026-03-24
- Related Docs: [Product Overview](../01-product-overview.md), [Security And Abuse](../09-security-and-abuse.md)

## Context
LowTime is meant for quick, low-friction calls, often from mobile browsers and weak networks. Requiring an account would add latency, complexity, and abandonment risk before users ever reach the call.

## Decision
Do not require registration or sign-in for v1. Use short room links for discovery and a host secret for room ownership. Guests identify themselves only with a display name entered at join time.

## Consequences
- Joining is faster and lighter, especially on mobile.
- There is no persistent identity or contact model in v1.
- Security and abuse controls must rely more on link entropy, rate limiting, and host controls.
- Host privilege recovery depends on secure local handling of the host secret.

## Alternatives Considered
- Full account system
  - Rejected because it directly conflicts with the product promise of instant access.
- Magic-link or email-based guest verification
  - Rejected because it still adds latency and dependency on external identity.
