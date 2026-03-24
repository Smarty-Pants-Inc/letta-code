# letta-code STATUS Draft

This volatile recovery handoff was assembled from Letta evidence, current repo files, and read-only git history. Confidence varies by section and is called out explicitly.

## Most Recent Recovered Work Summary
- Based on recent Letta evidence, this repo was most recently associated with `conv-b1fd292a-6bdf-4ba7-8752-9e020381f42f` (2026-03-21T00:30:07.536000+00:00) and its summary was: “what other working tree changes?? help me get everything cleanly landed either into an existing upstream PR or our local fork's patch stack”.
- Recent git history is led by `e49ad24 2026-03-20 fix(streaming): preserve literal markdown during token rendering`.

## Likely Last Stopping Point
- `AGENTS.md`

## Active / Recent Workstreams
- Pre-existing local changes include `AGENTS.md`.
- Recent commit: `e49ad24 2026-03-20 fix(streaming): preserve literal markdown during token rendering`.
- Recent commit: `b39079d 2026-03-20 fix(resume): use in-context backfill for stale history workaround`.
- Recent commit: `6d0da77 2026-03-19 fix(restack): resolve post-rebase build and startup regressions`.
- Letta thread `conv-b1fd292a-6bdf-4ba7-8752-9e020381f42f`: what other working tree changes?? help me get everything cleanly landed either into an existing upstream PR or our local fork's patch stack
- Letta thread `conv-006fabdf-f985-445a-9fcc-23344aeb482c`: uh oh, just saw this error: ● Tried to reflect, but got lost in the palace: Error: Unknown option '--update-args'. To specify a positional a
- Letta thread `conv-0648dd45-2443-4c08-b5fd-bc939664708d`: ok, see this conversation with my coworker just now, and then advise me  [Pasted text #1 +15 lines]

## Recent Decisions And Rationale
- Recent Letta threads around the fork centered on preserving runtime correctness after rebases and keeping launcher/env propagation consistent.

## Current Blockers / Risks / Unanswered Questions
- Current git status is not clean: 1 status line(s) are present in the repo baseline.
- Local baseline includes `AGENTS.md` in git status; treat it as pre-existing repo state, not part of this docs-only pass.
- Fork branch divergence is visible at baseline: `## smarty/main...origin/smarty/main [ahead 26, behind 25]`.

## Proposed Next Steps
- Read `README.md` first to re-establish repo-local context.
- Read `AGENTS.md` first to re-establish repo-local context.
- Read `package.json` first to re-establish repo-local context.
- Inspect the current dirty files before making any new documentation or code decisions: `AGENTS.md`.
- Cross-check the newest Letta thread `conv-b1fd292a-6bdf-4ba7-8752-9e020381f42f` against the repo before treating it as authoritative.

## Top Files To Read First
- `README.md`
- `AGENTS.md`
- `package.json`
- `src/`
- `scripts/`

## Relevant Recent Commits / Hotspots / Threads / Memory Blocks
- Recent commits:
  - `e49ad24 2026-03-20 fix(streaming): preserve literal markdown during token rendering`
  - `b39079d 2026-03-20 fix(resume): use in-context backfill for stale history workaround`
  - `6d0da77 2026-03-19 fix(restack): resolve post-rebase build and startup regressions`
  - `d7ced77 2026-03-19 test(startup): isolate startup flow auth state`
  - `5353f37 2026-03-19 fix(plan-mode): satisfy exhaustive deps in exit guard`
- Letta threads:
  - `2026-03-21T00:30:07.536000+00:00 conv-b1fd292a-6bdf-4ba7-8752-9e020381f42f via agent-66f02ead-7fdf-4fe6-aa67-0ef87c80a1cb: what other working tree changes?? help me get everything cleanly landed either into an existing upstream PR or our local fork's patch stack`
  - `2026-03-20T23:58:07.184000+00:00 conv-006fabdf-f985-445a-9fcc-23344aeb482c via agent-6f89cea8-a3f2-4412-8453-a3ffd4f116da: uh oh, just saw this error: ● Tried to reflect, but got lost in the palace: Error: Unknown option '--update-args'. To specify a positional argument starting with a '-', place it...`
  - `2026-03-20T19:53:41.844000+00:00 conv-0648dd45-2443-4c08-b5fd-bc939664708d via agent-6f89cea8-a3f2-4412-8453-a3ffd4f116da: ok, see this conversation with my coworker just now, and then advise me  [Pasted text #1 +15 lines]`
  - `2026-03-19T04:44:42.425000+00:00 conv-0100b639-f984-4105-aa5f-68f673488be3 via agent-c8f17dbb-a0ab-45ec-a90e-3b6082a48a30: ok that sounds good but you missed something:  "prefer omission over speculation" is not right  *definitely* avoid hallucination BUT when there is ambiguity OR missing (but obvi...`
  - `2026-03-17T03:14:54.372000+00:00 conv-f19cf3de-a21d-45ec-94a3-2f938b90578b via agent-c8f17dbb-a0ab-45ec-a90e-3b6082a48a30: [Pasted text #4 +7 lines]`
- Memory files / blocks:
  - `/Users/paulbettner/.letta/agents/agent-496aa78b-ccbf-4bf2-9806-22887ab500d7/memory`
  - `/Users/paulbettner/.letta/agents/agent-524488ce-1bbb-4987-b9c3-dc73700ec4ef/memory`
  - `/Users/paulbettner/.letta/agents/agent-653d1bcc-8930-48e1-a47f-8138281a8e74/memory`
  - `/Users/paulbettner/.letta/agents/agent-66f02ead-7fdf-4fe6-aa67-0ef87c80a1cb/memory`
  - `/Users/paulbettner/.letta/agents/agent-6f89cea8-a3f2-4412-8453-a3ffd4f116da/memory`

## Confidence And Freshness Notes
- Mapping confidence: `high`.
- Freshness assessment for this STATUS draft: `high`.
