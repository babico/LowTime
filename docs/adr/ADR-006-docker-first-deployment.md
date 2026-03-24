# ADR-006: Docker First Deployment

- Purpose: Record why LowTime uses Docker images as the default packaging format and Docker Compose as the default deployment path.
- Audience: Backend, frontend, platform, and operations contributors.
- Status: Accepted
- Last Updated: 2026-03-24
- Related Docs: [System Architecture](../02-system-architecture.md), [Backend Architecture](../08-backend-architecture.md), [Roadmap And Release Phases](../12-roadmap-and-release-phases.md)

## Context
LowTime is a greenfield project that needs a simple, repeatable way to run the web app, API server, and supporting stateful services across local development and early deployments. A Docker-first approach reduces machine-specific setup drift and gives the team one default packaging model before any more advanced orchestration is needed.

## Decision
Use Docker images as the default packaging format for repository-owned services and use Docker Compose as the default path for local development and single-host deployment. Containerized services should include at least the web app, backend server, PostgreSQL, Redis, and coturn. LiveKit may be external or self-hosted, but the application contract must remain environment-driven and container-friendly either way.

## Consequences
- Local setup becomes more reproducible across machines.
- Early deployments have a clear default path without choosing a larger orchestration platform yet.
- The team must maintain Dockerfiles, Compose configuration, health checks, and environment contracts from the start.
- Production hosting remains flexible because the same container images can later move to a different orchestrator if needed.

## Alternatives Considered
- Bare-metal or host-native processes by default
  - Rejected because it increases machine-specific setup drift and makes onboarding harder.
- Kubernetes as the first default
  - Rejected because it adds unnecessary operational weight for the current stage of the project.
