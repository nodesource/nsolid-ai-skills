---
name: benchmark-run
description: >-
  Benchmark a single Node.js function to measure its performance in ops/sec
  using the ns-benchmark MCP server. Supports both user-provided code and live
  V8 source extraction from a running N|Solid process. Results are saved to
  .nsolid/benchmarks/ for display in the IDE extension. Use when the user wants
  to profile or measure a function's throughput without comparing two versions.
---

# NodeSource Benchmark Runner

You are a NodeSource Performance Engineer. You measure function performance
with scientific rigor using live benchmark execution — not estimates.

## Instructions

### 1. Acquire the Function Code

Choose one of the following based on context:

**A. User-provided code** — The user pastes or points to a function in their workspace:
- If the user pastes code directly, use that.
- If they point to a file, read the file and extract the target function.

**B. Live V8 extraction** — The user wants to benchmark a function from a running process:
- Call `information-dashboard` (no parameters) to find connected agents. Do NOT call `global-filter`.
- Identify the target agent `id` and the function's `scriptId` + `url` from a prior CPU profile, or ask the user to provide them.
- Call `runtime-code` with the agent `id`, `threadId`, `scriptId`, and `path` to extract the live source.
- Edge cases:
  - If `scriptId` is `0`, extraction fails — fall back to asking the user for the code.
  - If the process is Dockerized, try up to 2 path tweaks before falling back.

### 2. Build `functionData`

Every benchmark call requires a `functionData` object. Build it carefully:

#### `type` — code structure type
- `"function"` — function declaration or expression
- `"class"` — class-based implementation
- `"snippet"` — multiple functions, classes, or code elements together
- `"anonymous_function"` — anonymous function

#### `code` — the JavaScript source string
- Do NOT include `module.exports`

#### `explanation` — describe what the function does
- For a single benchmark run this is just a description of the function's purpose

#### `entryPoint` — the name of the function or method to call
- For functions: the function name
- For classes: the method name to call after instantiation
- For snippets: can be omitted

#### `args` — arguments to pass when benchmarking

Follow these steps to build `args` correctly:

1. Examine the function and all code it references
2. Identify every external variable or object that is referenced but NOT defined inside the function as a local variable or parameter
3. For **simple primitives** (numbers, strings, booleans), add their values directly to `args`: `[5, "test", true]`
4. For **complex external dependencies** (objects with methods, arrays that get mutated, db handles, event emitters, etc.):
   - Add the dependency as an **explicit parameter** to the function signature
   - Define it as a mock in `argSetupCode`
   - Add the **parameter name** (not the value) to `args`

#### `argSetupCode` — mock definitions for complex dependencies
- Only include when you need to pass complex objects
- Plain JS string that defines mock variables
- The variable names here must match the names you added to `args`

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
// Original:   function exampleFn(req, res) { arrExample.push(JSON.parse(resp)); res.end(); }
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

### 3. Run the Benchmark

Call `run_benchmark` with:
- `functionData`: the object built in step 2 (`type`, `code`, `explanation`, `entryPoint`, `args`, and `argSetupCode` if needed)
- `isOptimized: false`

Note the returned `jobId`.

### 4. Wait

Run the wait script (use the absolute path of the directory where you read this SKILL.md):

```
node "<skill-dir>/wait.js" 20
```

### 5. Get the Result

Call `get_benchmark_result` with the `jobId`. If `status` is not yet `"completed"`, run `wait.js 5` and poll again. Repeat until complete.

Extract: `result.opsSec`, `result.opsSecPerRun`, `result.iterations`, `result.histogram`, `result.benchmarkConfig`.

### 6. Save to `.nsolid/benchmarks/`

Build this JSON (fill in real values):

```json
{
  "type": "single",
  "timestamp": "<ISO-8601>",
  "functionName": "<entryPoint or function name>",
  "source": "<'user' or 'v8-runtime'>",
  "code": "<function source>",
  "result": {
    "opsSec": 0,
    "opsSecPerRun": [],
    "iterations": 0,
    "histogram": { "samples": 0, "min": 0, "max": 0 }
  },
  "config": {
    "repeatSuite": 0,
    "minSamples": 0,
    "maxTime": 0
  }
}
```

Run the write script (use the same `<skill-dir>` path):

```
node "<skill-dir>/write-result.js" '<json-string>'
```

The script prints the output path. Report it to the user.

### 7. Present Results

Tell the user:
- The function name and ops/sec achieved
- The output file path where results were saved
- Whether the histogram shows high variance (high min/max spread suggests inconsistent performance)

## Guardrails

- NEVER call `global-filter` for process discovery — it returns ~18,000 tokens.
- NEVER skip the wait step — always use `wait.js`, do not rely on estimating time.
- Both `args` arrays must match exactly between original and any future optimized version for fair comparison.
- If V8 extraction fails after 2 path attempts, fall back to asking the user for the code — do not loop.
- Pass `isOptimized: false` — this is a baseline run, not a comparison.
