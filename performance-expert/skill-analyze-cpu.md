---
description: Identify high CPU processes and profile them using NSolid Console MCP
---

# NodeSource CPU Analysis Skill

<objective>
Find the highest CPU-consuming process and successfully capture and summarize a CPU profile without tool thrashing.
</objective>

<instructions>
Follow these precise steps:

1. **Discover Apps & Agents**: 
   - Call `global-filter` to verify exact app names. 
   - Call `information-dashboard` to list currently connected agents, noting their `id`.

2. **Find the Bottleneck**: 
   - Call `metrics-historic` to query the `cpuUserPercent` and `cpuSystemPercent` fields (`start: "5m"`).
   - Identify the agent `id` with the highest overall CPU usage.

3. **Capture a Profile**: 
   - Call `profile` on that `id` (e.g., `duration: 10`, `threadId: 0`). 
   - Note the returned `id` (Asset ID).

4. **WAIT (CRITICAL)**: 
   - Look at the `duration` you just passed. You MUST wait that exact number of seconds (e.g., 10 seconds) before making any other tool calls.

5. **Monitor Profile Generation**: 
   - Call `assets-in-progress`. If your Asset ID is still listed inside `assetsInProgress`, wait 5 more seconds and check again.

6. **Summarize the Profile**: 
   - Once it disappears from progress, call `asset-summary` using your Asset ID to get the token-optimized JSON view.

7. **Identify the Culprit**:
   - *Thought Process*: Analyze the summary JSON. Identify the function (`functionName`), `scriptId`, and file path (`url`) consuming the highest `totalTime` or `selfTime`. Explain this to the user.

8. **Extract Runtime Code & Benchmark Handoff**:
   - Call `runtime-code` using the `id` (agent process ID), `threadId`, `scriptId`, and `url` (as the path) to dynamically extract the exact JavaScript source code of the bottleneck from the V8 runtime.
   - *EDGE CASES FOR RUNTIME CODE*: 
     - If the `scriptId` is `0`, the extraction will fail. Do not call the tool.
     - If the process is Dockerized, the `path` might be misaligned. Attempt to call the code extracting tool a maximum of 2 times with path tweaks.
     - If it still fails, DO NOT loop endlessly. Stop and ask the USER to provide the source code for the identified problematic function.
   - **HUMAN IN THE LOOP**: Once the problematic code is acquired, STOP. Show the user what you found and ask: *"I found these problems in the function. Do you want me to propose an optimized solution?"*
   - Only after receiving USER approval, refactor the code and hand off both the *original* and *optimized* versions to the **Benchmark Validation Skill** (`skill-benchmark-validate.md`).
</instructions>

<guardrails>
- If you do not wait the required `duration`, the profiler will fail or you will waste tokens polling empty states.
- Never download the raw `asset` tool for CPU profiles; always use `asset-summary`.
</guardrails>
