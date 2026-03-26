---
description: Analyze distributed tracing for HTTP latency and errors using NSolid
---

# NodeSource Tracing Analysis Skill

<objective>
Investigate and map out HTTP distributed tracing spans to identify microservice latency and error origins.
</objective>

<instructions>
Follow these steps:

1. **Discover Ecosystem**: 
   - Call `information-dashboard` and `global-filter` to view all connected services. (Use `serverless-functions` if analyzing AWS lambda).
   
2. **Find Slow Requests**: 
   - Call `tracing`. Use the `durations` parameter (e.g., `durations="1000-"` for spans > 1 second).

3. **Find Failing Endpoints**: 
   - Call `tracing` utilizing `span_attributes_http_status_code` (e.g., `500`) to filter for HTTP errors.

4. **Map the Trace**: 
   - *Thought Process*: Copy the `span_traceId` of the slow/failing request. Call `tracing` again with this specific ID.
   - Analyze the `span_parentId` vs child hierarchy. Pinpoint which exact downstream span was the longest or threw the exception, and explain the topology to the user.
</instructions>

<guardrails>
- Do not search randomly; always filter using `durations` or status codes first to narrow down the dataset.
- Respect the topological hierarchy. A slow top-level span is usually caused by a slow child span.
</guardrails>
