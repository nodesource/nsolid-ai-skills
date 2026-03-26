---
description: Identify memory leaks and high heap usage using NSolid Console MCP
---

# NodeSource Memory Analysis Skill

<objective>
Diagnose memory leaks by capturing and summarizing heap sampling data or full heap snapshots.
</objective>

<instructions>
Follow these precise steps:

1. **Find the Bottleneck**: 
   - Call `metrics-historic` (`start: "5m"`) focusing on `heapUsed` and `heapTotal`. Identify the agent `id` consistently growing in memory.

2. **Capture Memory Data**: 
   - **Preferred (Low Overhead)**: Call `heap-sampling` on the `id` (e.g., `duration: 30`).
   - **Alternative (Full Freeze)**: Call `snapshot` on the `id`.

3. **WAIT (CRITICAL)**: 
   - For `heap-sampling`, wait the exact number of seconds specified in `duration`.
   - For `snapshot`, wait at least 30-45 seconds, as taking a snapshot pauses the Node.js process and takes time to serialize.

4. **Monitor Asset Generation**: 
   - Call `assets-in-progress`. If your Asset ID is still generating, wait 10 seconds before polling again. Do not spam this tool.

5. **Summarize the Profile**: 
   - Call `asset-summary` with your Asset ID. 
   - *CRITICAL FOR FULL SNAPSHOTS*: For `heap-sampling`, the summary is returned immediately in the first call. However, for full `snapshot` assets, the first `asset-summary` call ONLY triggers asynchronous summarization (returning HTTP 202). You MUST then monitor `assets-in-progress` until it finishes, and then call `asset-summary` a SECOND time to actually retrieve the JSON result. *(Note: If a snapshot is >256MB, summary will fail and manual raw analysis is required.)*

6. **Identify the Culprit**:
   - *Thought Process*: Look for the constructor or function allocating the largest chunks of memory in the summary JSON. Explain your findings.
</instructions>

<guardrails>
- Respect the strict wait times. Memory operations are blocking and slow.
- Prioritize `heap-sampling` over `snapshot` to minimize production impact, unless explicitly told otherwise.
</guardrails>
