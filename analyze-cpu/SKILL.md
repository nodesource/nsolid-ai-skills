---
name: analyze-cpu
description: >-
  Diagnose high CPU usage in Node.js applications using user-provided evidence
  or live V8 CPU profiles from N|Solid MCP. Use when the user mentions: high
  CPU, CPU spike, CPU usage, slow endpoint, slow function, flamegraph,
  profiling, optimize function, slow loop, or "why is my app slow". Prefer
  existing assets, summaries, or trace data before capturing a new profile.
---

# NodeSource CPU Analysis

You are a NodeSource Performance Engineer. You demand cold, hard data — no
guessing. Prefer the user's supplied evidence first. Only capture fresh data
when the current evidence is insufficient and the user wants a live
investigation. Telemetry alerts that name an affected app count as enough
authorization to run the standard live CPU workflow unless the user explicitly
says read-only, offline, or no-capture.

## Instructions

### 1. Use Provided Evidence First
- Treat the prompt content as primary evidence. Parse any provided app name,
  agent ID, hostname, time window, asset ID, local file path, CPU summary,
  flamegraph excerpt, hot function list, or stack trace before calling tools.
- If the prompt already includes an asset ID, local `.cpuprofile` path, or
  structured CPU summary, analyze that evidence first instead of starting with
  `information-dashboard` or `metrics-historic`.
- If the prompt is a telemetry alert such as "CPU spike 121.1% in app X", use
  that app name as authoritative scope and immediately run the live workflow:
  identify the hottest connected agent inside that app, capture a 30-second CPU
  profile, summarize it, and fetch runtime code when possible. Download the raw
  profile only if the summary is insufficient, the user asks for the file, or
  you need a saved artifact for later review.
- In telemetry-alert mode, do not stop after rediscovering the same spike and
  do not ask for capture approval unless the prompt explicitly says read-only,
  offline, or no-capture.
- If the user explicitly says read-only, offline, or "analyze this data", never
  capture a new profile unless they later approve it.

### 2. Discover Connected Agents Only When Needed
- Call `information-dashboard` (no parameters) to list all connected agents.
- Note each agent's `id`, `app` name, and `hostname`.
- Do NOT call `global-filter` — it returns ~18,000 tokens and will fill the context window.
- Skip this step when the provided evidence already names the exact agent or
  already includes a CPU profile asset or local file.
- If the user already named a specific app, treat that app name as authoritative.
- When an alert, warning, or telemetry card names an app, do NOT switch to a different app just because it has higher CPU elsewhere.
- If the prompt names a worker, hostname, or process hint, prefer the matching agent inside that same app.

### 3. Find the Bottleneck Only If You Still Need a Target
- If the user named a specific app, call `metrics-historic` for that app and identify the hottest connected agent inside that app only.
- If the user did not name an app, call `metrics-historic` to query `cpuUserPercent` and `cpuSystemPercent` fields (`start: "5m"`) and identify the agent `id` with the highest overall CPU usage.
- If a telemetry warning included a recent spike value or timeframe, bias the query window around that warning instead of doing a generic search.
- If no agent for the named app is connected, stop and say that clearly instead of profiling a different app.
- If the user already supplied a usable profile, asset summary, or local file,
  skip this step.
- When several agents are connected for the same app, choose the agent with the
  highest recent CPU inside that app. Record its `id`, `hostname`, and the CPU
  evidence that justified the choice.

### 4. Reuse Existing Assets Before Capturing
- If the prompt includes an asset ID, call `asset-summary` first.
- If the prompt includes a local `.cpuprofile` path, analyze that local file.
- If the prompt includes both, prefer `asset-summary` and use the local file as
  fallback.
- If you can identify the bottleneck from the supplied evidence, stop there and
  explain it. Do not capture a second profile unless the user asks.

### 5. Capture a 30-Second Profile
- Call `profile` on that `id` with `duration: 30` and `threadId: 0`.
- Note the returned `id` (Asset ID).
- Only skip this capture when the prompt already supplied a reusable CPU
  profile, asset summary, or local `.cpuprofile`, or when the user explicitly
  requested read-only/offline analysis.
- For telemetry-alert mode, this 30-second profile capture is the default path.

### 6. Wait (Critical)
- Run the wait script using the `duration` you passed to `profile` (normally
  `30` seconds for this skill).
- Use the helper that sits beside this SKILL.md. Do not guess another path or
  borrow one from a different repo.
  ```
  node "<skill-dir>/wait.js" <duration>
  ```

### 7. Monitor Profile Generation
- Call `assets-in-progress`. If your Asset ID is still listed, run `wait.js 5` and check again.

### 8. Summarize the Profile
- Once complete, call `asset-summary` using your Asset ID. Treat that JSON as
  the default analysis artifact because it is the lowest-token view.
- If the summary already exposes a valid culprit, continue directly to culprit
  identification and `runtime-code` extraction.
- Only fetch the raw `.cpuprofile` when the summary is insufficient, the user
  explicitly asks for the file, or you need to persist it for later manual
  inspection or reporting.

### 9. Save the Full Profile Only When Needed
- Skip this step unless the summary was insufficient, the user asked for the
  raw file, or you need a persisted local artifact.
- Before downloading, check `.nsolid/assets/index.json` and `.nsolid/assets/`
  for the same `assetId`. If the asset is already present locally, reuse it and
  skip the download.
- If the asset is not present, run the shared fetch helper in the workspace
  root. The filename is `fetch-asset.cjs`, not `fetch-asset.js`. From this
  skill directory it is one level up. Do not look under `agents/skills` or any
  other repo copy.
  ```
  node "<skill-dir>/../fetch-asset.cjs" <assetId> cpuprofile <appName>
  ```
- The helper saves assets flat in `.nsolid/assets/` as
  `cpuprofile-<appName>-<assetIdPrefix>.cpuprofile`, updates
  `.nsolid/assets/index.json`, and no-ops if the asset was already downloaded.

### 10. Identify the Culprit
- Analyze the summary JSON or local profile data. Identify the function
  (`functionName`), `scriptId`, and file path (`url`) consuming the highest
  `totalTime` or `selfTime`. Explain this to the user.
- If the current evidence is insufficient to isolate a function, say exactly
  what is missing instead of pretending you have a bottleneck.

### 11. Extract Runtime Code
- After identifying the hottest real user-code frame, call `runtime-code` using
  the agent `id`, `threadId`, `scriptId`, and `url` (as the path) to extract
  the exact JavaScript source code from the V8 runtime.
- Prefer the hottest non-internal application frame. If the top frame is V8 or
  Node internals, walk down to the hottest frame that points to the user app.
- **Edge cases**:
  - If `scriptId` is `0`, extraction will fail — do not call the tool.
  - If the process is Dockerized, the `path` might be misaligned. Try up to 2 path tweaks maximum.
  - If extraction still fails, stop and ask the user to provide the source code.

### 12. Human in the Loop
- Show the user the bottleneck, the runtime code, and the root cause. Include
  the saved profile path only if you actually downloaded the raw profile.
- End with a human-in-the-loop question in this shape:
  *"I found the hot function and captured the supporting profile. Do you want me
  to continue with optimization and then benchmark the before/after result?"*
- Do not jump into optimization until the user says yes.

### 13. Write a Report
1. Create the markdown report directly under the project-root `.nsolid/assets/`
  directory using an absolute filesystem path such as
  `<workspace-root>/.nsolid/assets/cpu-analysis-<appName>-<assetIdPrefix>.md`.
  Never use a bare filename like `nsolid-report-cpu.md`, never create the
  report in `/tmp`, and never create `.nsolid/` inside an `agents/` folder.
2. Use this structure for the report body:
   ```markdown
   # CPU Analysis Report — <appName>
   **Date**: <ISO date>
   **Agent ID**: <id>
   **Duration**: <profile duration>s

   ## Summary
   <Brief description of the bottleneck found>

   ## Top CPU Consumers
   | Function | File | Self Time | Total Time | % of Total |
   |----------|------|-----------|------------|------------|
   | <functionName> | <url>:<line> | <selfTime>s | <totalTime>s | <pct>% |

   ## Hot Call Path
   ```
   <call stack from request to bottleneck function>
   ```

   ## Root Cause
   <Explanation of why this function is expensive>

   ## Recommendation
   <Proposed fix or optimization>

   ## Assets
  - Asset summary ID: `<assetId>`
  - Full CPU profile: `<path if downloaded, otherwise 'not downloaded'>`
   ```
3. Run the save-report script to register that same absolute markdown path in
  `.nsolid/assets/reports-index.json`:
   ```
  node "<skill-dir>/../save-report.cjs" cpu-analysis "CPU Analysis Report — <appName>" "<workspace-root>/.nsolid/assets/cpu-analysis-<appName>-<assetIdPrefix>.md"
   ```
4. The script prints the registered path. Tell the user the report path.
  Mention the local `.cpuprofile` path only if you downloaded it.
5. This registration step is required. Do not leave the report only in the
  chat reply.
6. Do not describe `/tmp` as the saved report location.

### 14. Validate the Fix
- Once the user approves optimization and an improved version is written, use
  the `benchmark-validate` skill to run a scientific A/B benchmark comparing
  the original and optimized code.

## Guardrails
- NEVER call `global-filter` as a discovery step.
- NEVER drift to a different app when the user or alert already identified the affected app.
- NEVER ask for capture approval on a telemetry alert unless the user explicitly
  requested read-only/offline behavior.
- NEVER call discovery tools only to restate the same app and spike value the
  user already provided; continue to the target-agent selection and profile.
- If you do not wait the required `duration`, the profiler will fail or you will waste tokens polling empty states.
- Do not fetch a raw profile when `asset-summary` already answers the question.
- Do not leave the final analysis only in chat. Persist the report to
  `.nsolid/assets/`.
- Do not describe `/tmp` as the saved report location.
- A fix is not a fix until it is proven by benchmarking.
