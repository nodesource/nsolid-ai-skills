---
name: vulnerability-analysis
description: Analyze live runtime vulnerabilities across all connected processes using NSolid MCP
---

# NodeSource Vulnerability Analysis Skill

<objective>
Conduct a rigorous security audit using exact MCP tools, identifying vulnerable apps and logging their first detection times.
</objective>

<instructions>
Follow these steps:

1. **High-Level Overview**: 
   - Call the `vulnerabilities` tool. 
   - *Thought Process*: Summarize the output to identify which application (`app`) has the most critical issues.
   
2. **Detail Per App**: 
   - For a specific vulnerable app, call `application-packages` (parameters: exact `app` name, `mode='flat'`).
   - *Note*: Wait patiently. The MCP server configures a 180s timeout for this streaming endpoint, but the MCP client might still drop the connection after 60 seconds. If it times out, proceed to the next step using the data already collected from the `vulnerabilities` tool.

3. **Discover First Detection Time**:
   - Call `events-historic` (parameters: `type='new-vulnerability-found'`, `summarize='true'`). 
   - *CRITICAL*: The MCP tool description may incorrectly say `vulnerability-detected`. Do not use that. Use only valid Security Events: `new-vulnerability-found`, `package-vulnerabilities-updated`, `vulnerabilities-database-updated`, or `active-vulns-updated`.
   - *Note*: If this endpoint returns a `null` response, it means there are no matched historical events. Proceed without failing the audit. Compile a timeline based on available events.

4. **SBOM Generation (Optional)**:
   - If a full compliance audit is requested by the user, call `sbom` (parameters: `format='json'`).
</instructions>

<guardrails>
- Respect the wait times for `application-packages` to avoid terminating the request early.
- Only analyze the application requested or the one with the highest vulnerabilities if none is specified.
</guardrails>
