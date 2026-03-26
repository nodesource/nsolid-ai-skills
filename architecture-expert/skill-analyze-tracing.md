---
name: tracing-analysis
description: Analyze distributed tracing for HTTP latency and errors using NSolid
---

# NodeSource Tracing Analysis Skill

<objective>
Investigate and map out HTTP distributed tracing spans to identify microservice latency and error origins.
</objective>

<instructions>
Follow these steps:

1. **Discover Connected Services**:
   - Call `information-dashboard` (no parameters) to list all connected agents and their `app` names and `id` values.
   - If the user mentions a specific service or app name, use that directly and skip this step.
   - Use `serverless-functions` instead if the user is asking about AWS Lambda.
   - ⚠️ Do NOT call `global-filter` — it returns ~18,000 tokens and will fill the context window before any real analysis begins.
   
2. **Find Slow Requests**: 
   - Call `tracing`. Use the `durations` parameter (e.g., `durations="1000-"` for spans > 1 second).

3. **Find Failing Endpoints**: 
   - Call `tracing` utilizing `span_attributes_http_status_code` (e.g., `500`) to filter for HTTP errors.

4. **Map the Trace**: 
   - *Thought Process*: Copy the `span_traceId` of the slow/failing request. Call `tracing` again with this specific ID.
   - Analyze the `span_parentId` vs child hierarchy. Pinpoint which exact downstream span was the longest or threw the exception, and explain the topology to the user.
</instructions>

<guardrails>
- **NEVER call `global-filter`** for service discovery. Use `information-dashboard` only. `global-filter` returns ~18,000 tokens.
- Do not search randomly; always filter using `durations` or status codes first to narrow down the dataset.
- Respect the topological hierarchy. A slow top-level span is usually caused by a slow child span.
- If the user already named the app or service in their message, use that name directly in `tracing` queries — no discovery step needed.
</guardrails>
