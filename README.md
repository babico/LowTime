# LowTime

- Purpose: Provide a short project entry point, explain the product, and route contributors to the correct detailed docs.
- Audience: New engineers, product collaborators, designers, and operators.
- Status: Baseline
- Last Updated: 2026-03-24
- Related Docs: [Contributing](CONTRIBUTING.md), [Docs Map](docs/00-docs-map.md), [Product Overview](docs/01-product-overview.md), [System Architecture](docs/02-system-architecture.md)

LowTime is a web-first calling app for people on weak or expensive internet connections. It is designed to feel as easy as opening a FaceTime link, but with stronger low-bandwidth behavior, flexible quality controls, and no account requirement.

## Core Value
- Create a room fast.
- Share a simple link.
- Join without registration.
- Keep the conversation alive when the network gets bad.

## Current Status
- The repository is currently docs-first and greenfield.
- The product, system, and delivery decisions are captured in `docs/`.
- Application packages have not been scaffolded yet.

## Planned Stack
- Web client: React + TypeScript + PWA shell
- API and signaling: Fastify + WebSocket
- Media transport: LiveKit SFU with 1:1 WebRTC P2P fallback
- NAT traversal: coturn
- Persistence: PostgreSQL for durable room metadata
- Ephemeral state: Redis for presence, lobby, reconnect windows, and chat buffer
- Observability: structured logs, metrics, traces, and reliability dashboards

## Repository Map
- `README.md`: project overview and doc entry point
- `TODO.md`: living implementation tracker
- `CONTRIBUTING.md`: workflow and documentation rules
- `docs/00-docs-map.md`: reading order and source-of-truth map
- `docs/adr/`: architecture decision records

## Start Here
1. Read [docs/00-docs-map.md](docs/00-docs-map.md) for the documentation reading order.
2. Read [docs/01-product-overview.md](docs/01-product-overview.md) for product scope and principles.
3. Read [docs/02-system-architecture.md](docs/02-system-architecture.md) and [docs/03-room-and-user-flows.md](docs/03-room-and-user-flows.md) before implementation.
4. Read [TODO.md](TODO.md) to see implementation status and the next features to build.
5. Read the ADRs in [docs/adr/README.md](docs/adr/README.md) to understand why the major choices were made.

## Documentation Index
- Product: [docs/01-product-overview.md](docs/01-product-overview.md)
- Architecture: [docs/02-system-architecture.md](docs/02-system-architecture.md)
- Flows: [docs/03-room-and-user-flows.md](docs/03-room-and-user-flows.md)
- Media and quality: [docs/04-media-and-quality.md](docs/04-media-and-quality.md)
- API contracts: [docs/05-api-and-realtime-contracts.md](docs/05-api-and-realtime-contracts.md)
- Data lifecycle: [docs/06-data-model-and-lifecycle.md](docs/06-data-model-and-lifecycle.md)
- Frontend design: [docs/07-frontend-architecture.md](docs/07-frontend-architecture.md)
- Backend design: [docs/08-backend-architecture.md](docs/08-backend-architecture.md)
- Security: [docs/09-security-and-abuse.md](docs/09-security-and-abuse.md)
- Operations: [docs/10-observability-and-operations.md](docs/10-observability-and-operations.md)
- Testing: [docs/11-testing-and-qa.md](docs/11-testing-and-qa.md)
- Delivery roadmap: [docs/12-roadmap-and-release-phases.md](docs/12-roadmap-and-release-phases.md)
- Implementation tracker: [TODO.md](TODO.md)
- Decisions: [docs/adr/README.md](docs/adr/README.md)
