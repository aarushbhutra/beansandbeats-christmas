# Repository guidance for coding agents

## Start with the project plan

Before making implementation changes, read these documents in order:

1. [`plans/SHARED-CONTRACT.md`](plans/SHARED-CONTRACT.md) for the hackathon requirements, architecture, API and data contracts, offline behavior, privacy boundaries, delivery dates, and acceptance checks.
2. [`plans/PERSON-1-QUEUE-AND-STAFF.md`](plans/PERSON-1-QUEUE-AND-STAFF.md) for Aarush's assigned work: order entry, barista queue, persistence, offline synchronization, authentication, deployment, and setup documentation.
3. [`plans/PERSON-2-GUEST-AND-DISPLAY.md`](plans/PERSON-2-GUEST-AND-DISPLAY.md) when integrating with the other contributor's guest, ready board, menu, and report modules.

Treat the shared agreement as the source of truth. Keep the work split, contract, and milestones aligned when making changes. The plans describe the intended design; verify the brief and the actual repository before implementing assumptions.

## Collaboration

- Use the latest remote `main` as the shared base for new work. Fetch it explicitly with `git fetch origin refs/heads/main:refs/remotes/origin/main`, since cloud checkout fetch rules may only track HEAD.
- For a new task, preserve uncommitted changes, then create a focused branch from `origin/main` (for example, `aarush/<task>`). Continue an existing task on its feature branch. Use the existing checkout; do not create additional worktrees unless asked.
- Commit and push changes to the feature branch, then open a pull request targeting `main`. Include the behavior changed, relevant validation, and remaining limitations. Leave review and merging to the user unless explicitly authorized.
- Do not push implementation changes directly to `main`, overwrite a teammate's branch, or force-push shared history. Keep unrelated work out of the pull request.
- If GitHub API access prevents creating a pull request, push the branch and provide its GitHub compare link. Do not claim a pull request was opened until creation is confirmed.
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

Use pnpm 11.25.0, pinned in package.json. Install with `pnpm install --frozen-lockfile`; run `pnpm setup:local` once for local first-run accounts; use `pnpm dev`, `pnpm build`, `pnpm typecheck`, `pnpm test` and (after a build) `pnpm test:e2e`. Keep pnpm-lock.yaml as the only dependency lockfile. The v2 architecture (README) supersedes the Supabase design in the plans; the domain contract is `lib/domain/types.ts`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
