# Docs Map

- Purpose: Explain how the documentation set is organized, what each document owns, and how contributors should navigate it.
- Audience: Anyone onboarding to the repository.
- Status: Baseline
- Last Updated: 2026-03-24
- Related Docs: [README](../README.md), [Product Overview](01-product-overview.md), [ADR Index](adr/README.md)

## Reading Order
1. [README](../README.md) for the short project introduction.
2. [01-product-overview.md](01-product-overview.md) for goals, non-goals, and product principles.
3. [02-system-architecture.md](02-system-architecture.md) for the main system boundaries.
4. [03-room-and-user-flows.md](03-room-and-user-flows.md) and [04-media-and-quality.md](04-media-and-quality.md) for the core runtime behavior.
5. [05-api-and-realtime-contracts.md](05-api-and-realtime-contracts.md) and [06-data-model-and-lifecycle.md](06-data-model-and-lifecycle.md) for implementation contracts.
6. [07-frontend-architecture.md](07-frontend-architecture.md) and [08-backend-architecture.md](08-backend-architecture.md) for ownership and subsystem design.
7. [09-security-and-abuse.md](09-security-and-abuse.md), [10-observability-and-operations.md](10-observability-and-operations.md), and [11-testing-and-qa.md](11-testing-and-qa.md) before shipping.
8. [12-roadmap-and-release-phases.md](12-roadmap-and-release-phases.md) for sequencing and milestone gates.
9. [13-issue-branch-pr-workflow.md](13-issue-branch-pr-workflow.md) for the contributor delivery process.
10. `.github/` for issue templates, pull request template, and PR auto-routing behavior.
11. [TODO.md](../TODO.md) for live implementation status.
12. [adr/README.md](adr/README.md) for the why behind major architecture choices.

## Source Of Truth Rules
- Product goals and scope live in [01-product-overview.md](01-product-overview.md).
- System boundaries and trust model live in [02-system-architecture.md](02-system-architecture.md).
- Room behavior and state transitions live in [03-room-and-user-flows.md](03-room-and-user-flows.md).
- Media selection, fallback, and quality rules live in [04-media-and-quality.md](04-media-and-quality.md).
- Public APIs and event contracts live in [05-api-and-realtime-contracts.md](05-api-and-realtime-contracts.md).
- Persistence, TTLs, and cleanup rules live in [06-data-model-and-lifecycle.md](06-data-model-and-lifecycle.md).
- Implementation status lives in [TODO.md](../TODO.md).
- GitHub intake and review templates live in `.github/`.
- Architecture rationale lives in `docs/adr/`, not duplicated elsewhere.

## Glossary
- `Room`: An ephemeral space identified by a shareable slug.
- `Host`: The creator of the room or anyone holding the host secret for that room.
- `Guest`: A participant joining through the public room link without host privileges.
- `Access mode`: Room admission mode: `open`, `lobby`, or `passcode`.
- `SFU`: Selective forwarding unit used as the default media transport.
- `P2P`: Direct WebRTC connection used only as a 1:1 fallback mode.
- `Quality preset`: User-facing choice between `Data Saver`, `Balanced`, and `Best Quality`.
- `Quality cap`: Host-enforced upper limit for the room's allowed quality tier.
- `Reconnect window`: Short-lived period in which a participant can rejoin without being treated as a new user.

## How To Extend The Docs
- Add new feature docs only when a current source-of-truth file would become too broad to maintain.
- Link any new doc from this index and from the relevant parent doc.
- Prefer updating an existing doc over creating a parallel version of the same behavior.
