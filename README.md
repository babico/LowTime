# LowTime

- Purpose: Provide a short project entry point, explain the product, and route contributors to the correct detailed docs.
- Audience: New engineers, product collaborators, designers, and operators.
- Status: Baseline
- Last Updated: 2026-03-25
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
- Monorepo scaffolding is in place for `apps/web`, `apps/server`, and `packages/shared`.
- Docker Compose baseline is in place for local development and single-host deployment.
- CI and linting baseline is in place for pull requests and pushes to `main`.
- Room creation, share-link generation, public join admission, the join-side device preview, SFU token handoff, the first basic in-call UI, the network health badge, and the installable PWA shell are in place for the core 1:1 flow.

## Planned Stack
- Web client: React + TypeScript + PWA shell
- API and signaling: Fastify + WebSocket
- Media transport: LiveKit SFU with 1:1 WebRTC P2P fallback
- NAT traversal: coturn
- Persistence: PostgreSQL for durable room metadata
- Ephemeral state: Redis for presence, lobby, reconnect windows, and chat buffer
- Packaging and deployment: Docker images with Docker Compose as the default local and single-host deployment path
- Observability: structured logs, metrics, traces, and reliability dashboards

## Repository Map
- `README.md`: project overview and doc entry point
- `TODO.md`: living implementation tracker
- `CONTRIBUTING.md`: workflow and documentation rules
- `.github/`: GitHub issue templates, PR template, and workflow automation
- `.github/workflows/ci.yml`: baseline GitHub Actions checks for lint, test, typecheck, and build
- `docker-compose.yml`: default local and single-host container stack
- `.env.example`: baseline environment contract for Docker-based runs
- `apps/`: application packages for the web client and backend server
- `packages/`: shared contracts and reusable code
- `docs/00-docs-map.md`: reading order and source-of-truth map
- `docs/adr/`: architecture decision records

## Start Here
1. Read [docs/00-docs-map.md](docs/00-docs-map.md) for the documentation reading order.
2. Read [docs/01-product-overview.md](docs/01-product-overview.md) for product scope and principles.
3. Read [docs/02-system-architecture.md](docs/02-system-architecture.md) and [docs/03-room-and-user-flows.md](docs/03-room-and-user-flows.md) before implementation.
4. Read [TODO.md](TODO.md) to see implementation status and the next features to build.
5. Use the GitHub issue and PR templates in `.github/` when opening work on GitHub.
6. Read the ADRs in [docs/adr/README.md](docs/adr/README.md) to understand why the major choices were made.

## Docker Quick Start
1. Optionally copy `.env.example` to `.env` to override the default host ports and service settings.
2. Start the baseline stack with `docker compose up --build`.
3. Open the web app on `http://localhost:5173`.
4. Check the server health endpoint on `http://localhost:3000/health`.
5. Keep the default LiveKit values from `.env.example` unless you are pointing at a different SFU.

## Local Checks
1. Install dependencies with `npm ci`.
2. Run `npm run check` for linting and typechecking.
3. Run `npm run test` for automated coverage on implemented backend flows.
4. Run `npm run build` before opening a PR when your change affects application code.

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
- Contribution workflow: [docs/13-issue-branch-pr-workflow.md](docs/13-issue-branch-pr-workflow.md)
- Implementation tracker: [TODO.md](TODO.md)
- GitHub templates and routing: `.github/`
- CI workflow: `.github/workflows/ci.yml`
- Docker baseline: `docker-compose.yml`, `.env.example`, `apps/web/Dockerfile`, `apps/server/Dockerfile`
- Decisions: [docs/adr/README.md](docs/adr/README.md)
