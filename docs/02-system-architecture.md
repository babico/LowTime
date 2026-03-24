# System Architecture

- Purpose: Describe the major system components, trust boundaries, and infrastructure responsibilities for LowTime.
- Audience: Backend, frontend, platform, and operations engineers.
- Status: Baseline
- Last Updated: 2026-03-24
- Related Docs: [Product Overview](01-product-overview.md), [Backend Architecture](08-backend-architecture.md), [Data Model And Lifecycle](06-data-model-and-lifecycle.md), [ADR-002](adr/ADR-002-sfu-first-p2p-fallback.md), [ADR-003](adr/ADR-003-pwa-first.md)

## Overview
LowTime uses a web client, an application server, a signaling channel, an SFU media layer, TURN services, and two storage systems. Durable room metadata lives in PostgreSQL. Presence, reconnect windows, lobby queues, and other live room state live in Redis.

## Major Components
- `Web client`: React PWA responsible for room creation, join flow, call UI, media controls, and reconnect UX.
- `App server`: Fastify service that owns room lifecycle, access checks, host privileges, token issuance, and WebSocket signaling.
- `LiveKit SFU`: Primary media path for normal room traffic.
- `P2P fallback`: 1:1-only direct WebRTC path used when SFU join fails.
- `coturn`: Relay path for NAT traversal and restrictive networks.
- `PostgreSQL`: Durable room records and audit events.
- `Redis`: Ephemeral room state, rate limits, chat buffer, reconnect state, and lobby queues.
- `Observability stack`: Metrics, logs, and traces from the app server and media infrastructure.

## Component Diagram
```mermaid
flowchart LR
subgraph Client["User devices"]
  A[Host browser]
  B[Guest browser]
end

subgraph Edge["Application edge"]
  C[Fastify API]
  D[WebSocket signaling]
end

subgraph Media["Media infrastructure"]
  E[LiveKit SFU]
  F[coturn]
  G[P2P direct path]
end

subgraph Data["State stores"]
  H[PostgreSQL]
  I[Redis]
end

subgraph Ops["Observability"]
  J[Metrics and logs]
end

A --> C
A --> D
A --> E
A --> F
A -. 1:1 fallback .-> G
B --> C
B --> D
B --> E
B --> F
B -. 1:1 fallback .-> G
C --> H
C --> I
D --> I
C --> J
E --> J
F --> J
```

## Trust Boundaries
- Browsers are untrusted and can never self-assign host privileges.
- The app server is the authority for room policy, access mode changes, and host actions.
- Media infrastructure is trusted for transport but not for product policy decisions.
- PostgreSQL holds durable records; Redis is treated as recoverable live state.

## Trust Boundary Diagram
```mermaid
flowchart TD
subgraph Untrusted["Untrusted clients"]
  A[Host browser]
  B[Guest browser]
end

subgraph TrustedApp["Trusted app services"]
  C[Fastify API]
  D[WebSocket signaling]
end

subgraph TrustedInfra["Trusted infrastructure"]
  E[LiveKit SFU]
  F[coturn]
  G[PostgreSQL]
  H[Redis]
  I[Metrics and logging]
end

A --> C
A --> D
A --> E
B --> C
B --> D
B --> E
C --> G
C --> H
D --> H
C --> I
E --> I
F --> I
```

## Deployment Shape
- One web app deployment serves the PWA shell and static assets.
- One app server deployment handles REST and WebSocket traffic.
- LiveKit and coturn run as separately managed infrastructure.
- PostgreSQL and Redis are managed services or equivalent stateful deployments.

## Edge Cases
- Redis loss should not permanently destroy room records, but it will interrupt live presence and reconnect state.
- LiveKit outage should not break room creation, but active calls will degrade or fail.
- coturn spikes may signal restrictive network conditions or abuse.

## Failure Modes
- API reachable but media infrastructure degraded.
- WebSocket connected but room policy state missing in Redis.
- TURN-only traffic grows unexpectedly, increasing cost and latency.

## Implementation Notes
- Keep policy checks server-side even when the client already knows the likely result.
- Prefer minimal durable storage for privacy and operational simplicity.
- Use the ADRs for rationale and this doc for boundaries and responsibilities.
