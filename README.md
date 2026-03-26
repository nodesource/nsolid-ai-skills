# NodeSource Unified AI Developer Ecosystem PoC

This repository contains a Proof of Concept (PoC) illustrating the theory of **Expert-Led "Roles" and "Skills"**. It transforms isolated Model Context Protocol (MCP) data into robust, automated investigation formulas used by actual NodeSource consultants.

## Best Practices: The Vercel `skills` CLI Architecture
This repository is formatted to be fully compatible with the `npx skills@latest` CLI. By structuring the ecosystem into discrete feature folders with `SKILL.md` entry points, LLMs can autonomously traverse, download, and execute these capabilities globally without heavy configuration.

Users can install any of these expert roles directly into their projects using:
```bash
npx skills@latest add <github-org>/<repo-name>/performance-expert
```

## The Roles Ecosystem

### 1. 🛡️ Security Expert (`security-expert/`)
Identifies and resolves vulnerable packages and executes compliance audits.
- **Entry Point**: `SKILL.md`
- **Sub-skill**: `skill-analyze-vulnerabilities.md` — Guides the agent via `vulnerabilities` and `application-packages`.
- **Sub-skill**: `skill-generate-sbom.md` — Automates SPDX/JSON compliance reports with the 180s-timeout server logic.

### 2. ⚡ Performance Expert (`performance-expert/`)
Diagnoses and resolves CPU spikes and memory leaks, extracting actual V8 runtime code, and generating statistically proven optimizations.
- **Entry Point**: `SKILL.md`
- **Sub-skill**: `skill-analyze-cpu.md` — CPU profiling with dynamic V8 code extraction and human-in-the-loop safeguards.
- **Sub-skill**: `skill-analyze-memory.md` — Standard Heap sampling strategies for memory analysis.
- **Sub-skill**: `skill-advanced-memory-leak-hunter.md` — Multi-phase leak hunting (baseline vs peak vs delta analysis).
- **Sub-skill**: `skill-benchmark-validate.md` — Rigorously isolates external dependencies and executes A/B benchmarks to mathematically prove the performance delta.

### 3. 🏗️ Architecture Expert (`architecture-expert/`)
Diagnoses end-to-end latency and microservice topology issues.
- **Entry Point**: `SKILL.md`
- **Sub-skill**: `skill-analyze-tracing.md` — Leverages OpenTelemetry HTTP tracing spans to find structural bottlenecks across an ecosystem.

## Usage & Proactive Triggers
These skills are natively **Proactive**. The `SKILL.md` files contain explicit `<trigger_scenarios>` enabling your host AI Assistant (Claude Code, Cursor, Windsurf) to autonomously interject. 

For example, if you type: *"My application feels sluggish today,"* the AI will automatically load the `performance-expert/SKILL.md` and offer to pull a live N|Solid profile natively.
# nsolid-ai-skills
