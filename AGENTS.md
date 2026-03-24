# letta-code AGENTS Draft

This documentation-only overlay was assembled from current repo files, read-only git history/status, prior Letta recovery artifacts, and recovered Letta state. It is a draft for future promotion only; the live repo files were not edited in this pass.

Read `STATUS.md` in this directory before starting work. `AGENTS.md` is the durable project guide; `STATUS.md` contains the latest recovered work state, blockers, and proposed next steps.

## What This Project Is
- This directory is the maintained Letta Code fork inside `smarty-code`. It is not the default runtime for the parent repo anymore, but it still has its own build, check, and compatibility workflows. Use this file only when the task actually targets the Letta fork.
- Recovery confidence for this project mapping is `high`.

## Repo Layout
- `src/`: CLI, runtime, tool, and integration code.
- `scripts/`: build/check helpers and postinstall patches.
- `skills/` and `src/skills/`: built-in skills and skill plumbing.
- `vendor/`: vendored dependencies or patches.
- `package.json`: canonical script surface.

## How To Work Here
- Validate changes through the repo scripts in `package.json`; do not invent parallel command paths.
- When a change affects launcher or runtime integration, test the parent repo’s wrapper path too, because the fork is often exercised through `smarty-code/bin/smarty`.
- After upstream merges or replayed carry patches, rerun the check/build flow and any targeted update-chain tests needed for the touched area.
- Keep generated or vendored patches synchronized with the scripts that apply them.

## Key Commands Found In Docs / Config / History
- These commands were documented or inferred from repo config/history only. They were not executed in this pass.
- `bun install`
- `bun run lint`
- `bun run fix`
- `bun run typecheck`
- `bun run check`
- `bun run build`
- `bun run test:update-chain:manual`
- `bun run test:update-chain:startup`

## Architecture Map
- CLI entry and main flow: `src/index.ts`
- Skill loading or built-in skills: `src/skills/` and `skills/`
- Packaging or binary surface: `package.json`, `letta.js`, `scripts/`
- Vendor patch behavior: `vendor/` plus the postinstall/build scripts
- `src/`: CLI, runtime, tool, and integration code.
- `scripts/`: build/check helpers and postinstall patches.
- `skills/` and `src/skills/`: built-in skills and skill plumbing.
- `vendor/`: vendored dependencies or patches.
- `package.json`: canonical script surface.

## Important Directories And Files
- `README.md`
- `AGENTS.md`
- `package.json`
- `src/`
- `scripts/`

## Conventions And Guardrails
- Validate changes through the repo scripts in `package.json`; do not invent parallel command paths.
- When a change affects launcher or runtime integration, test the parent repo’s wrapper path too, because the fork is often exercised through `smarty-code/bin/smarty`.
- After upstream merges or replayed carry patches, rerun the check/build flow and any targeted update-chain tests needed for the touched area.
- Keep generated or vendored patches synchronized with the scripts that apply them.
- This fork is nested inside a larger repo that also carries Codex-first tooling. Be explicit about which runtime you are changing.
- A build alone is not enough after integration-heavy changes; run the narrowest real runtime smoke path that covers the touched code.
- Parent-repo maintenance scripts may update this fork and then bump a gitlink or wrapper expectation in the outer repo.
- Code changes: run `bun run check` first, then the narrowest additional script for the touched surface.
- Integration or update-chain changes: run the relevant `test:update-chain:*` command.

## Recovered Tacit Knowledge From Letta State
- Recent Letta thread count mapped to this repo: 7; newest thread is `conv-b1fd292a-6bdf-4ba7-8752-9e020381f42f` updated 2026-03-21T00:30:07.536000+00:00.
- agent-66f02ead-7fdf-4fe6-aa67-0ef87c80a1cb: Letta Code agent created in /Users/paulbettner/Projects/smarty-dev/smarty-code; memory=memfs_git_repo; last_run=2026-03-21T00:30:07.024406Z
- agent-6f89cea8-a3f2-4412-8453-a3ffd4f116da: Letta Code agent created in /Users/paulbettner/Projects/smarty-dev/wec; memory=memfs_git_repo; last_run=2026-03-20T23:58:06.784807Z
- agent-c8f17dbb-a0ab-45ec-a90e-3b6082a48a30: A stateful coding agent with persistent memory; memory=legacy_blocks_only; last_run=2026-03-20T21:24:54.861012Z

## Known Risks / Stale Areas / Conflicting Evidence
- Current git status is not clean: 1 status line(s) are present in the repo baseline.
- Local baseline includes `AGENTS.md` in git status; treat it as pre-existing repo state, not part of this docs-only pass.

## Relationship To Other Projects
- This repo sits under `smarty-code/forks` within the broader workspace and should stay scoped to its own command surface.
- This fork is a subproject of `smarty-code` and should stay aligned with the parent runtime/launcher workflow.

## Status Pointer
- See `STATUS.md` in this same draft overlay for the most recent recovered work state and likely resume path.
