# NodeSource AI Skills

Production-ready AI skills that transform N|Solid MCP data into automated investigation workflows used by NodeSource consultants.

## Installation

Install any skill into your project using the [Vercel Skills CLI](https://vercel.com/blog/agent-skills-explained-an-faq):

```bash
npx skills@latest add NodeSource/nsolid-ai-skills/analyze-vulnerabilities
npx skills@latest add NodeSource/nsolid-ai-skills/generate-sbom
npx skills@latest add NodeSource/nsolid-ai-skills/analyze-cpu
npx skills@latest add NodeSource/nsolid-ai-skills/analyze-memory
npx skills@latest add NodeSource/nsolid-ai-skills/advanced-memory-leak-hunter
npx skills@latest add NodeSource/nsolid-ai-skills/benchmark-run
npx skills@latest add NodeSource/nsolid-ai-skills/benchmark-validate
npx skills@latest add NodeSource/nsolid-ai-skills/analyze-tracing
```

Or manually copy the `<skill-name>/SKILL.md` file into your project's `.claude/skills/` directory.

## Skills

### Security

| Skill | Description |
|-------|-------------|
| **analyze-vulnerabilities** | Scans running production memory for actively-exploitable CVEs using live N|Solid data |
| **generate-sbom** | Generates SPDX/JSON Software Bill of Materials from live running processes |

### Performance

| Skill | Description |
|-------|-------------|
| **analyze-cpu** | Captures V8 CPU profiles, extracts live source code, and identifies bottleneck functions |
| **analyze-memory** | Diagnoses memory issues via real-time heap sampling and snapshot analysis |
| **advanced-memory-leak-hunter** | Multi-phase baseline-vs-peak delta analysis for elusive memory leaks |
| **benchmark-run** | Benchmarks a single Node.js function to measure throughput (ops/sec) using live V8 source or user-provided code |
| **benchmark-validate** | Scientifically controlled A/B benchmarks with statistical validation (p-value, ops/sec) |

### Architecture

| Skill | Description |
|-------|-------------|
| **analyze-tracing** | Maps distributed OpenTelemetry spans to diagnose microservice latency and topology issues |

## Scripts

Helper scripts used internally by skills to bridge MCP data and the local filesystem.

### fetch-asset.cjs

Downloads a full N|Solid asset (CPU profile, heap snapshot, or heap sampling) from the console API and saves it to `.nsolid/assets/`. Skills invoke this after triggering a profile/snapshot so the file is available for local tooling (e.g. Chrome DevTools, VS Code memory profiler).

```bash
node fetch-asset.cjs <assetId> <assetType> [appName]
```

| Argument | Description |
|----------|-------------|
| `assetId` | Asset ID returned by the MCP profile/snapshot/heap-sampling tool |
| `assetType` | One of: `cpuprofile`, `heapprofile`, `heapsnapshot` |
| `appName` | _(Optional)_ Application name used in the output path, defaults to `unknown` |

Output: `.nsolid/assets/<assetType>-<appName>-<assetIdPrefix>.<ext>`

Reads `nsolid.apiBaseUrl` and `nsolid.authToken` from `.vscode/settings.json` in the workspace root.

### save-report.cjs

Registers an existing markdown analysis report under `.nsolid/assets/` and appends metadata to `.nsolid/assets/reports-index.json` so the N|Solid VS Code extension can discover and display it in the Reports History sidebar.

```bash
node save-report.cjs <type> <title> <report-file>
```

| Argument | Description |
|----------|-------------|
| `type` | Report type: `cpu-analysis`, `memory-analysis`, `memory-leak-hunt`, `security-audit`, `lockfile-analysis`, `package-check`, `profile-analysis` |
| `title` | Human-readable title shown in the sidebar |
| `report-file` | Path to an existing `.md` file under the project-root `.nsolid/assets/` directory |

Output: updated `.nsolid/assets/reports-index.json`

The report markdown itself must already exist in the project-root `.nsolid/assets/`
directory before you call `save-report.cjs`. Do not create reports in `/tmp`.

Benchmark result helpers also always write to the project-root `.nsolid/benchmarks/`
directory, never beside a skill file or inside an `agents/` folder.

## Compatibility

Each skill is a standalone, self-contained `SKILL.md` file compatible with:
- Claude Code (CLI, Desktop, VS Code, JetBrains)
- Windsurf (Cascade)
- Cursor
- GitHub Copilot
- Gemini CLI
- Any tool supporting the [Vercel Agent Skills](https://vercel.com/blog/agent-skills-explained-an-faq) standard

## Prerequisites

All skills require the **N|Solid Console MCP server** to be configured and connected to your AI assistant.

## Architecture

Each skill is independent and self-contained — no delegation chains or sub-skill loading required. The AI assistant acts as the natural orchestrator, chaining skills together based on context. For example, after `analyze-cpu` identifies a bottleneck and proposes a fix, it directs the assistant to invoke `benchmark-validate` to prove the improvement.
