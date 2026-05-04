---
name: benchmark-validate
description: >-
  Validate a code optimization using scientifically controlled A/B benchmarks
  via the ns-benchmark MCP server. Use when the user has an original and
  optimized version of a function and wants to prove the performance
  improvement with statistical rigor (ops/sec, p-value, improvement percentage).
  Also invoked automatically after CPU or memory optimization skills propose a fix.
  Results are saved to .nsolid/benchmarks/ for display in the IDE extension.
---

# NodeSource Benchmark Validation

You are a NodeSource Performance Engineer who validates every optimization
with scientific rigor. A fix is not a fix until a controlled A/B benchmark
proves it.

## Instructions

### 1. Acquire Both Implementations and Inspect Their Project Context

Before you build benchmark inputs, gather the real calling context for the original implementation:

- If the user points to workspace files, read the original and optimized implementations from those files.
- Search the codebase for real invocation sites of the original function.
- Search for unit/integration tests covering the original function or its immediate caller.
- Inspect the argument shapes, fixtures, mocks, and helper builders used in those tests.
- Use the original implementation's real calling pattern as the source of truth for benchmark inputs.

If the optimized implementation has a different entry point or wrapper shape, account for that separately, but keep the benchmark contract aligned with the original usage unless the user explicitly says the contract changed.

If you do not have access to the workspace or tests, say that clearly and derive the narrowest defensible benchmark inputs from the code itself.

### 2. Build `functionData` for Original and Optimized

Every benchmark call requires a `functionData` object. You will build **two** of them — one for the original, one for the optimized — using the **exact same** `args` and `argSetupCode` in both.

#### `type` — code structure type
- `"function"` — function declaration or expression
- `"class"` — class-based implementation
- `"snippet"` — multiple functions, classes, or code elements together
- `"anonymous_function"` — anonymous function

#### `code` — the JavaScript source string
- Do NOT include `module.exports`

#### `explanation`
- For the original: describe what the function does
- For the optimized: describe the specific changes made to improve it

#### `entryPoint` — the name of the function or method to call
- For functions: the function name
- For classes: the method name to call after instantiation
- For snippets: can be omitted

#### `args` — arguments for benchmarking

Follow these steps:

1. Examine the original function and all code it references
2. Search the codebase for actual invocation sites and tests before inventing arguments
3. If tests exist for the original function or its immediate caller, reuse their argument shapes, fixtures, mocks, and setup patterns when appropriate
4. Identify every external variable or object that is referenced but NOT defined inside the function as a local variable or parameter
5. For **simple primitives** (numbers, strings, booleans), add their values directly to `args`
6. For **complex external dependencies** (objects with methods, arrays that get mutated, db handles, etc.):
   - Add the dependency as an **explicit parameter** to BOTH original and optimized function signatures
   - Define it as a mock in `argSetupCode`
   - Add the **parameter name** (not the value) to `args`
7. `args` MUST be identical between the original and optimized runs — otherwise the comparison is invalid
8. `argSetupCode` MUST be identical between the original and optimized runs — otherwise the comparison is invalid
9. When test/codebase evidence conflicts with a generic mock, follow the codebase evidence

#### `argSetupCode` — mock definitions for complex dependencies
- Only include when you need to pass complex objects
- Plain JS string that defines mock variables
- Must be identical between the original and optimized runs

### 3. Stop and Ask the User to Confirm the Shared Benchmark Inputs

Before calling any benchmark tools, present both `functionData` objects to the user for review.

Your confirmation message must include:
- the original and optimized functions being compared
- the proposed shared `args`
- the proposed shared `argSetupCode` if present
- each entry point
- a short explanation of how the shared benchmark inputs were derived from real invocation sites and/or tests

If relevant tests were found, mention which test file(s), fixtures, or helper builders influenced the proposed input shape.

Then ask the user to confirm one of these actions:
- approve the proposed arguments
- ask you to regenerate them
- provide manual edits

Do NOT call `run_benchmark`, `get_benchmark_result`, `compare_benchmarks`, or any result-saving step until the user explicitly confirms the arguments.

---

### Argument Examples

**Simple primitives — no argSetupCode needed:**
```
args: [5, "test", true]
args: [{ "name": "John", "age": 30 }, { "sortBy": "date" }]
args: [[1, 2, 3], ["a", "b", "c"]]
args: []  // function with no parameters
```

**HTTP Request/Response (external dependency):**
```
// Original:    function exampleFn(req, res) { arrExample.push(JSON.parse(resp)); res.end(); }
// Transformed: function exampleFn(req, res, arrExample) { arrExample.push(JSON.parse(resp)); res.end(); }
args: ["req", "res", "arrExample"]
argSetupCode:
  const req = { url: '/test' };
  const res = { writeHead: function() {}, write: function() {}, end: function() {} };
  const arrExample = [];
```

**Database connection:**
```
// Original:    function queryDatabase(userId) { return db.collection('users').findOne({ _id: userId }); }
// Transformed: function queryDatabase(userId, db) { return db.collection('users').findOne({ _id: userId }); }
args: ["user123", "db"]
argSetupCode:
  const db = {
    collection: function(name) {
      return { findOne: function(query) { return { name: 'Test User' }; } };
    }
  };
```

**File system:**
```
// Original:    function readConfigFile() { return JSON.parse(fs.readFileSync(configPath, 'utf8')); }
// Transformed: function readConfigFile(fs, configPath) { return JSON.parse(fs.readFileSync(configPath, 'utf8')); }
args: ["fs", "configPath"]
argSetupCode:
  const fs = { readFileSync: function(path, enc) { return '{"apiKey":"test"}'; } };
  const configPath = '/etc/config.json';
```

**Event emitters:**
```
// Original:    function processEvents(data) { eventEmitter.on('data', callback); }
// Transformed: function processEvents(data, eventEmitter, callback) { eventEmitter.on('data', callback); }
args: ["[1,2,3]", "eventEmitter", "callback"]
argSetupCode:
  const data = [1,2,3];
  const callback = function(d) {};
  const eventEmitter = {
    _events: {},
    on: function(event, handler) { this._events[event] = handler; },
    emit: function(event, data) { if (this._events[event]) this._events[event](data); }
  };
```

**Async/Await:**
```
// Original:    async function asyncExample() { return await fetchData(); }
// Transformed: async function asyncExample(fetchData) { return await fetchData(); }
args: ["fetchData"]
argSetupCode:
  const fetchData = async function() { return { data: 'example data' }; };
```

**Class instantiation:**
```
// Original:    function useClassExample() { const instance = new MyClass(); return instance.doSomething(); }
// Transformed: function useClassExample(MyClass) { const instance = new MyClass(); return instance.doSomething(); }
args: ["MyClass"]
argSetupCode:
  class MyClass { constructor() {} doSomething() { return 'result'; } }
```

---

### 4. Run Original Benchmark

Call `run_benchmark` with:
- `functionData`: `{ type, code, explanation, entryPoint, args, argSetupCode? }` for the **original**
- `isOptimized: false`

Note the returned `jobId` as `originalJobId`.

### 5. Wait

Run the wait script (use the absolute path of the directory where you read this SKILL.md):

```
node "<skill-dir>/wait.js" 20
```

### 6. Get Original Result

Call `get_benchmark_result` with `originalJobId`. If not yet `"completed"`, run `wait.js 5` and poll again.

Save: `opsSec`, `opsSecPerRun`, `iterations`, `histogram`, `benchmarkConfig`.

### 7. Run Optimized Benchmark Attempts

You must try the optimized implementation up to **3 total attempts** if the
benchmark does not clear the effectiveness threshold on the first try.

For each optimized attempt:
- Build optimized `functionData`: `{ type, code, explanation, entryPoint, args, argSetupCode? }`
- Use the **exact same** `args` and `argSetupCode` as the original
- Call `run_benchmark` with `isOptimized: true`
- Note the returned `jobId` as `optimizedJobId`

### 8. Wait

```
node "<skill-dir>/wait.js" 20
```

### 9. Get Optimized Result

Call `get_benchmark_result` with `optimizedJobId`. If not yet `"completed"`, run `wait.js 5` and poll again.

Save: `opsSec`, `opsSecPerRun`, `iterations`, `histogram`.

### 10. Compare Results

Call `compare_benchmarks` passing both `originalJobId` and `optimizedJobId`.

Analyze:
- `verdict`: `"optimization_effective"` requires both `isSignificant === true` AND `improvementPercent > 25`
- `pValue`: must be < 0.05 to be statistically significant
- `improvementPercent`: the percentage speed improvement

If the comparison is **not** `optimization_effective`:
- inspect the benchmark evidence and your current optimized code
- revise the optimized implementation to attack the remaining bottleneck
- rerun only the optimized side with a new optimized attempt
- keep the original benchmark as the baseline
- stop early if an attempt reaches `optimization_effective`
- otherwise continue until you have completed **3 optimized attempts total**

If none of the 3 optimized attempts reaches the threshold:
- report that clearly
- still present the **best** optimized attempt you measured
- make it explicit that the final result did not meet the effectiveness threshold

### 11. Save to `.nsolid/benchmarks/`

Build this JSON (fill in real values):

```json
{
  "type": "comparison",
  "timestamp": "<ISO-8601>",
  "verdict": "<verdict>",
  "improvementPercent": 0,
  "isSignificant": true,
  "pValue": 0,
  "original": {
    "functionName": "<entryPoint>",
    "code": "<original source>",
    "opsSec": 0,
    "opsSecPerRun": [],
    "iterations": 0,
    "histogram": { "samples": 0, "min": 0, "max": 0 }
  },
  "optimized": {
    "functionName": "<entryPoint>",
    "code": "<optimized source>",
    "opsSec": 0,
    "opsSecPerRun": [],
    "iterations": 0,
    "histogram": { "samples": 0, "min": 0, "max": 0 }
  },
  "thresholds": {
    "significancePValue": 0.05,
    "improvementPercent": 25
  }
}
```

Run the write script (use the same `<skill-dir>` path):

```
node "<skill-dir>/write-result.js" '<json-string>'
```

The script prints the output path. Report it to the user alongside the final
benchmark verdict. If you made multiple optimized attempts, save and report the
best final comparison you are standing behind.

Your report must include the **full raw benchmark result JSONs** returned by
`get_benchmark_result` for both the original and optimized runs, as well as the
`compare_benchmarks` response, so the user can see the complete data
(ops/sec, iterations, histograms, p-value, improvement percent, etc.).

As a recommended next step, advise the user to validate the optimization under
representative load and capture fresh CPU profiles afterward. That follow-up
helps confirm whether the function-level benchmark improvement produces a
meaningful impact on end-to-end application performance.

### 12. Emit Structured Apply Metadata

After reporting the verdict, end the response with a single HTML comment
containing the data the host extension needs to offer an "Apply optimization"
action. Use the raw optimized source (unescaped newlines are fine inside a
JSON string if you properly escape them), the final verdict flags, and any
hot-function reference the extension provided in the prior CPU analysis.

```
<!-- nsolid-ide-optimized: {"code":"<optimized source>","entryPoint":"<entryPoint>","improvementPct":<number>,"pValue":<number>,"isSignificant":<bool>,"verdictEffective":<bool>} -->
```

Only emit the marker when a valid A/B comparison completed. If the benchmark
failed, timed out, or the original/optimized code was unavailable, omit the
marker entirely — the host extension will not offer the apply action.

## Guardrails

- When the workspace is available, NEVER skip searching for real call sites and tests before proposing arguments.
- If tests exist for the original function or its immediate caller, inspect them before proposing benchmark inputs.
- NEVER run benchmark tools before the user confirms the proposed shared arguments.
- You MUST use the exact same `args` and `argSetupCode` for both runs — otherwise the comparison is statistically invalid.
- NEVER use different `args` or different `argSetupCode` between the original and optimized runs.
- NEVER skip the wait steps — always use `wait.js`, do not rely on estimating time.
- A fix is not a fix until `compare_benchmarks` returns `"optimization_effective"`.
- NEVER poll immediately after submitting a benchmark — always wait first.
- If an optimized attempt does not pass the threshold, do not stop after one
  miss. Revise the optimized code and retry until you either succeed or finish
  3 optimized attempts total.
