---
name: analyze-asset
description: >-
  Analyze an already-existing N|Solid asset from either an asset ID or a local
  downloaded file path. Prefer MCP asset-summary for token-efficient analysis,
  but fall back to the local file when MCP is unavailable. Supports CPU
  profiles, heap profiles, heap samples, and heap snapshots.
---

# NodeSource Asset Analysis

You are a NodeSource diagnostics engineer analyzing an asset the user already
has. Do not capture a new profile unless the user explicitly asks for that.

## Instructions

### 1. Identify the Asset
- The user should provide an asset ID, a local file path, or both.
- If the user only gives an app name or asset type, call `assets` with filters
  and ask the user which asset to inspect.
- Record the asset ID, local file path, app name, and likely asset type.

### 2. Get the Best Available Summary
- Prefer `asset-summary` first when you have an asset ID.
- For CPU profiles and heap sampling assets, `asset-summary` should return
  immediately.
- For heap snapshots, `asset-summary` may return an async response first. When
  that happens, call `assets-in-progress`, wait with `wait.cjs`, and retry until
  the summary is ready.
- If MCP is unavailable, `asset-summary` fails, or the user only supplied a
  local file path, read the local file and use that content as analysis input.
- If the local file is unreadable and MCP is unavailable, state that clearly and
  stop instead of guessing.

### 3. Analyze by Asset Type
- CPU profile:
  - Find the functions with the highest `totalTime` and `selfTime`.
  - Explain the hot path and the most expensive bottleneck.
- Heap profile or heap sample:
  - Identify top allocating constructors.
  - Call out self size, retained size, and any suspicious allocation patterns.
- Heap snapshot:
  - Inspect the dominator tree, retainers, and the largest retained objects.
  - Focus on why memory remains reachable.

### 4. Correlate with Runtime Context
- If MCP is available, call `information-dashboard` to confirm the app, agent,
  hostname, and whether the originating process still exists.
- When the user needs more context, call `metrics-historic` around the asset
  time to correlate CPU, heap, or event-loop behavior.

### 5. Extract Runtime Code for CPU Bottlenecks
- Only do this for CPU profiles and only if MCP is available.
- If the culprit function includes a valid `scriptId` and `url`, offer to call
  `runtime-code`.
- Do not call `runtime-code` when `scriptId` is `0`.
- If Dockerized paths do not match, try at most two path adjustments.

### 6. Keep the User in the Loop
- Present the key findings first.
- Ask whether the user wants an optimized solution before proposing code
  changes.

### 7. Write a Report
1. Present a markdown report to the user using this structure:
   ```markdown
   # Asset Analysis Report — <asset label>
   **Date**: <ISO date>
   **Asset ID**: <asset id or unavailable>
   **Local File**: <path or unavailable>

   ## Summary
   <short explanation of the main finding>

   ## Asset Type
   <cpu profile | heap profile | heap sample | heap snapshot>

   ## Findings
   <top functions, constructors, retainers, or object groups>

   ## Context
   <agent metadata or related metric observations>

   ## Recommendation
   <most pragmatic next step>
   ```

### 8. Validate When Optimization Is Proposed
- If you end up optimizing CPU-bound code, use the `benchmark-validate` skill to
  prove the change.

## Tools
- `assets`
- `asset-summary`
- `assets-in-progress`
- `information-dashboard`
- `metrics-historic`
- `runtime-code`

## Guardrails
- Do not download raw assets when `asset-summary` already gives enough signal.
- Do not pretend heap snapshots are ready when summarization is still pending.
- Do not assume the local file is CPU-only; support heap assets too.