# Repository guidance for coding agents

## Start with the project plan

Before making implementation changes, read these documents in order:

1. [`plans/SHARED-CONTRACT.md`](plans/SHARED-CONTRACT.md) for the hackathon requirements, architecture, API and data contracts, offline behavior, privacy boundaries, delivery dates, and acceptance checks.
2. [`plans/PERSON-1-QUEUE-AND-STAFF.md`](plans/PERSON-1-QUEUE-AND-STAFF.md) for Aarush's assigned work: order entry, barista queue, persistence, offline synchronization, authentication, deployment, and setup documentation.
3. [`plans/PERSON-2-GUEST-AND-DISPLAY.md`](plans/PERSON-2-GUEST-AND-DISPLAY.md) when integrating with the other contributor's guest, ready board, menu, and report modules.

Treat the shared agreement as the source of truth. Keep the work split, contract, and milestones aligned when making changes. The plans describe the intended design; verify the brief and the actual repository before implementing assumptions.

## Collaboration

- Work on the current branch in the existing checkout. Do not create additional worktrees unless asked.
- Aarush owns shared infrastructure, package files and lockfile, database migrations, API routes, order and barista screens, authentication, offline helpers, deployment, and README integration.
- Coordinate shared type, API, lifecycle, role, and synchronization changes with the other contributor before changing them. Update `plans/SHARED-CONTRACT.md` when an agreed contract changes.
- Keep each feature in its agreed area; request shared configuration or dependency changes through the infrastructure owner to avoid conflicting lockfile edits.
- Integrate small changes frequently and preserve local work. Do not overwrite uncommitted changes.

## Product requirements that implementation must preserve

- Implement all six modules in the shared plan. Payments stay on the organiser's POS.
- The browser app must support cached, previously initialized tablet use offline. Persist writes and sync operations locally before reporting success; retries must be idempotent and conflicts visible.
- Offline devices cannot show other devices' unsynced changes. Display freshness and report reconciliation state honestly; do not promise remote guest alerts while disconnected.
- Collect first name only by default. Protect guest tracking tokens and staff/lead routes. Never place secrets in source, client bundles, logs, or documentation.
- Preserve order-time item names and integer-cent prices when menu prices change. Use Asia/Singapore for event-day reporting and rollover.
- Follow the shared acceptance checks and distinguish verified behavior from planned behavior in documentation and demos.

## Development workflow

The repository may start without application scaffolding. Inspect existing files and instructions before choosing commands. Once a package manager and scripts are established, use the repository's lockfile and documented checks. Keep README setup, secure environment variable names, deployment, test account provisioning, and daily reset/reconciliation instructions current.
