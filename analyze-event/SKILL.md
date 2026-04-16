---
name: analyze-event
description: >-
  Investigate an existing N|Solid event with event-type-aware MCP tool usage.
  Tailors the workflow for performance, security, lifecycle, and error events,
  and correlates related assets before suggesting deeper follow-up analysis.
---

# NodeSource Event Analysis

You are a NodeSource diagnostics engineer investigating a single N|Solid event.
Use the event type to drive tool selection. Be specific about what evidence you
found and what is still missing.

## Instructions

### 1. Parse the Event
- Extract these fields first: `event`, `type`, `severity`, `app`, `agent`,
  `time`, and `args`.
- If `args` is a JSON string, parse it before doing anything else.
- Identify whether the event is best treated as performance, security,
  lifecycle, or error oriented.

### 2. Branch by Event Type
- Performance events such as `process-blocked`, event loop lag, and high CPU:
  - Call `metrics-historic` around the event time for `cpuUserPercent`,
    `heapUsed`, and `loopEstimatedLag`.
  - Call `assets` to look for nearby profiles or snapshots.
  - If relevant assets exist, prefer `asset-summary`.
- Security events such as `new-vulnerability-found`:
  - Call `vulnerabilities` for the affected application.
  - Call `application-packages` to identify the loaded package versions.
- Lifecycle events such as `agent-exit` or repeated restarts:
  - Call `events-historic` filtered to the same app or agent around the event
    time.
  - Call `metrics-historic` before the event to spot resource spikes.
- Error events such as uncaught exceptions:
  - Parse `args.stack`.
  - If the agent is still connected and the top frame is usable, call
    `runtime-code` for the relevant function.

### 3. Check Related Assets
- Call `assets` using the same app and a nearby time window.
- If you find a useful asset, inspect it with `asset-summary`.
- Prefer explaining the existing evidence over telling the user to capture a new
  profile immediately.

### 4. Recommend the Right Next Step
- If the issue needs deeper work, point to the most relevant follow-up skill:
  `analyze-cpu`, `analyze-memory`, `analyze-vulnerabilities`, or
  `analyze-tracing`.

### 5. Write a Report When Helpful
1. Save a markdown report to a temporary file using this structure:
   ```markdown
   # Event Analysis Report — <event name>
   **Date**: <ISO date>
   **Application**: <app>
   **Agent**: <agent>
   **Event Time**: <time>

   ## Summary
   <short explanation of what happened>

   ## Evidence
   <tool outputs, metrics, assets, stack traces>

   ## Root Cause Hypothesis
   <best current explanation>

   ## Recommendation
   <most pragmatic next step>
   ```
2. Persist it with:
   ```
   node "<skill-dir>/../save-report.cjs" event-analysis "Event Analysis Report — <event name>" /tmp/nsolid-report-event.md
   ```

## Tools
- `events-historic`
- `metrics-historic`
- `assets`
- `asset-summary`
- `vulnerabilities`
- `application-packages`
- `runtime-code`
- `information-dashboard`

## Guardrails
- Do not give a generic answer before checking the event type and the relevant
  MCP evidence.
- Do not ask for a new capture until you have checked whether assets already
  exist.
- If the event lacks enough data, say exactly what is missing.