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

### 1. Build `functionData` for Original and Optimized

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

1. Examine the function and all code it references
2. Identify every external variable or object that is referenced but NOT defined inside the function as a local variable or parameter
3. For **simple primitives** (numbers, strings, booleans), add their values directly to `args`
4. For **complex external dependencies** (objects with methods, arrays that get mutated, db handles, etc.):
   - Add the dependency as an **explicit parameter** to BOTH original and optimized function signatures
   - Define it as a mock in `argSetupCode`
   - Add the **parameter name** (not the value) to `args`
5. `args` MUST be identical between the original and optimized runs — otherwise the comparison is invalid

#### `argSetupCode` — mock definitions for complex dependencies
- Only include when you need to pass complex objects
- Plain JS string that defines mock variables
- Must be identical between the original and optimized runs

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

### 2. Run Original Benchmark

Call `run_benchmark` with:
- `functionData`: `{ type, code, explanation, entryPoint, args, argSetupCode? }` for the **original**
- `isOptimized: false`

Note the returned `jobId` as `originalJobId`.

### 3. Wait

Run the wait script (use the absolute path of the directory where you read this SKILL.md):

```
node "<skill-dir>/wait.js" 20
```

### 4. Get Original Result

Call `get_benchmark_result` with `originalJobId`. If not yet `"completed"`, run `wait.js 5` and poll again.

Save: `opsSec`, `opsSecPerRun`, `iterations`, `histogram`, `benchmarkConfig`.

### 5. Run Optimized Benchmark Attempts

You must try the optimized implementation up to **3 total attempts** if the
benchmark does not clear the effectiveness threshold on the first try.

For each optimized attempt:
- Build optimized `functionData`: `{ type, code, explanation, entryPoint, args, argSetupCode? }`
- Use the **exact same** `args` and `argSetupCode` as the original
- Call `run_benchmark` with `isOptimized: true`
- Note the returned `jobId` as `optimizedJobId`

### 6. Wait

```
node "<skill-dir>/wait.js" 20
```

### 7. Get Optimized Result

Call `get_benchmark_result` with `optimizedJobId`. If not yet `"completed"`, run `wait.js 5` and poll again.

Save: `opsSec`, `opsSecPerRun`, `iterations`, `histogram`.

### 8. Compare Results

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

### 9. Save to `.nsolid/benchmarks/`

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

### 10. Emit Structured Apply Metadata

After reporting the verdict, end the response with a single HTML comment
containing the data the host extension needs to offer an "Apply optimization"
action. Use the raw optimized source (unescaped newlines are fine inside a
JSON string if you properly escape them), the final verdict flags, and any
hot-function reference the extension provided in the prior CPU analysis.

```
<!-- nsentinel-optimized: {"code":"<optimized source>","entryPoint":"<entryPoint>","improvementPct":<number>,"pValue":<number>,"isSignificant":<bool>,"verdictEffective":<bool>} -->
```

Only emit the marker when a valid A/B comparison completed. If the benchmark
failed, timed out, or the original/optimized code was unavailable, omit the
marker entirely — the host extension will not offer the apply action.

## Guardrails

- You MUST use the exact same `args` and `argSetupCode` for both runs — otherwise the comparison is statistically invalid.
- NEVER skip the wait steps — always use `wait.js`, do not rely on estimating time.
- A fix is not a fix until `compare_benchmarks` returns `"optimization_effective"`.
- NEVER poll immediately after submitting a benchmark — always wait first.
- If an optimized attempt does not pass the threshold, do not stop after one
  miss. Revise the optimized code and retry until you either succeed or finish
  3 optimized attempts total.
