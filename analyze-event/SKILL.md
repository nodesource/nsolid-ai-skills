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

### 5. Always Write a Report
1. Create the markdown report directly under the project-root `.nsolid/assets/`
  directory using a descriptive filename such as
  `.nsolid/assets/event-analysis-<eventName>.md`. Never create the report in
  `/tmp`, and never create `.nsolid/` inside an `agents/` folder.
2. Use this structure for the report body:
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
3. Register that existing file with the save helper so it appends the metadata
  entry to `.nsolid/assets/reports-index.json`.
   ```
  node "<skill-dir>/../save-report.cjs" event-analysis "Event Analysis Report — <event name>" .nsolid/assets/event-analysis-<eventName>.md
   ```
4. Do not stop after pasting findings in chat. Always run the registration step
  and tell the user where the report was written.
5. Tell the user the actual `.nsolid/assets/...` report path you created. Do
  not describe `/tmp` as the saved report location.

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
- Do not leave the report only in chat. Persist it to `.nsolid/assets/` on
  every completed event investigation.
- Do not describe `/tmp` as the saved report location.