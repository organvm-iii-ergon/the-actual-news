# The Actual News

**Verifiable news ledger platform — news as a public service.**

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![CI](https://github.com/the-actual-news/the-actual-news/actions/workflows/ci.yml/badge.svg)](https://github.com/the-actual-news/the-actual-news/actions/workflows/ci.yml)

Every story ships with three layers:

- **Narrative** — Human-readable piece, written for comprehension
- **Claims Ledger** — Machine-readable atomic claims with scope, time bounds, and confidence
- **Evidence Graph** — Links from each claim to primary evidence, counterevidence, and uncertainties

Publication is gated by deterministic quality policies, not engagement metrics.

## Architecture

```mermaid
graph TB
    subgraph "User Surfaces"
        R[Reader Web]
        V[Verifier Web]
        P[Publisher Web]
    end

    subgraph "Services"
        GW[Gateway :8080]
        SS[Story :8081]
        CS[Claim :8082]
        ES[Evidence :8083]
        VS[Verify :8084]
    end

    subgraph "Data"
        PG[(PostgreSQL)]
        OB[Event Outbox]
    end

    R --> GW
    V --> VS
    P --> SS

    GW --> PG
    SS --> PG
    CS --> PG
    ES --> PG
    VS --> PG
    GW --> OB
```

## Quick Start

```bash
# Prerequisites: Docker, Node.js >= 20, pnpm >= 9

# Clone and install
git clone https://github.com/the-actual-news/the-actual-news.git
cd the-actual-news
pnpm install

# Start infrastructure (Postgres + Prism mock servers)
cp .env.example .env
make up

# Apply database migrations
make migrate

# Run conformance tests
make test

# Start the gateway service
make dev-minimal

# Start the full stack
make dev
```

## Project Structure

```
the-actual-news/
├── contracts/          # OpenAPI specs, event schemas, policy packs
├── db/migrations/      # PostgreSQL migrations (001-003)
├── docs/               # Architecture, roadmap, glossary
├── specs/              # Protocol spec and SDD artifacts
├── services/
│   ├── gateway/        # Public BFF (feed, story, publish)
│   ├── story/          # Story CRUD (stub)
│   ├── claim/          # Claim extraction (stub)
│   ├── evidence/       # Evidence registration (stub)
│   └── verify/         # Verification tasks (stub)
├── apps/public-web/    # Next.js reader + verifier UI
├── infra/              # Docker Compose + Postgres init
└── tools/
    ├── conformance/    # CT-01..CT-07 test suite
    └── migrate.sh      # Migration runner
```

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Verification Spine** | Claims + evidence edges + corrections shipped with every story |
| **Policy Packs** | Versioned thresholds that gate publication (e.g., min evidence ratio) |
| **Publish Gate** | Deterministic decision: story publishes only when quality metrics pass |
| **Evidence Graph** | Content-addressed evidence linked to claims with typed relations |
| **Corrections Ledger** | Append-only corrections — history is never erased |

## Conformance Tests

The platform includes a conformance test suite (CT-01 through CT-07) that validates publish gate behavior against the [Core Protocol Spec](specs/protocol/core-protocol-spec-v1.md):

| Test | Scenario |
|------|----------|
| CT-01 | Minimal publish passes |
| CT-02 | Fails unsupported claim share |
| CT-03A | Ratio edge passes at 0.50 |
| CT-03B | Ratio fails at 0.60 |
| CT-04 | High-impact corroboration passes |
| CT-05 | Same independence key fails |
| CT-06 | Contradicted claims hard fail |
| CT-07 | Missing provenance treated conservatively |

## Documentation

- [Architecture](docs/architecture.md) — Platform design and service topology
- [Roadmap](docs/roadmap.md) — 10-phase program from prototype to archival permanence
- [Glossary](docs/glossary.md) — Terminology from the protocol spec
- [Protocol Spec](specs/protocol/core-protocol-spec-v1.md) — RFC-style core protocol
- [Design Document](docs/design/News-as-Public-Service.md) — Original design provenance

## Contributing

See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for guidelines.

## License

[AGPL-3.0](LICENSE) — Because the public record should remain public.
