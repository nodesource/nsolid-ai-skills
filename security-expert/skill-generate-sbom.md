---
description: Generate a Software Bill of Materials (SBOM) for a registered application.
---

# NodeSource SBOM Generation Skill

<objective>
Retrieve a complete Software Bill of Materials (SBOM) for a specific application to assist securely evaluating and auditing supply chain dependencies.
</objective>

<instructions>
1. **Identify Target Application**:
   - Determine the specific `app` name you need the SBOM for. If the app name is unknown, use `global-filter` to retrieve a list of active applications.

2. **Determine Format Requirement**:
   - Determine if the user needs the SBOM in **SPDX XML** (industry compliance standard) or **JSON** (for programmatic analysis).

3. **Generate SBOM**:
   - Call the `nsolid-console_sbom` tool.
   - Pass the `app` parameter.
   - Pass the `format` parameter as either `"xml"` (default) or `"json"`.

4. **Handle Execution Edge Cases**:
   - *CRITICAL TIMEOUT WARNING*: Generating an SBOM requires traversing the entire transitive dependency tree of a live process. The N|Solid server dynamically extends the timeout to **180 seconds (3 minutes)** for tools with "sbom" in their name.
   - If your local MCP client connection drops at 60 seconds (a common client-default limitation), inform the user that the server is still processing it in the background or suggest adjusting their MCP client configuration. Do not frantically retry the request.

5. **Provide Output**:
   - Save the raw output to a file if it exceeds reasonable context window sizes (e.g. `application_sbom.xml` or `application_sbom.json`).
   - Give the user a high-level summary of the completion and the path to the saved SBOM.
</instructions>

<guardrails>
- DO NOT poll or aggressively retry the SBOM endpoint if it times out; it is extremely expensive computationally.
- DO NOT hallucinate dependencies. Only report what is strictly inside the returned SBOM string.
</guardrails>
