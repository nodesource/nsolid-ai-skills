---
description: Validate a code optimization using ns-benchmark MCP
---

# NodeSource Benchmark Validation Skill

<objective>
Scientifically validate if a proposed code change improves performance using rigorous benchmarking and permutation tests.
</objective>

<instructions>
Follow these steps exactly to ensure scientific validity:

1. **Prepare Original Code & Dependencies**: 
   - Check the function and identify ALL external dependencies (variables, objects, database handles, etc., referenced but not defined locally).
   - *CRITICAL EXAMPLES FOR EXTERNAL DEPENDENCIES*:
     - If the code modifies an external array: `function example(req, res, arr) { arr.push(req); }`. You MUST mock `arr` in `argSetupCode`.
     - `argSetupCode`: `"const req = { url: '/test' }; const res = { writeHead: function() {}, end: function() {} }; const arr = [];"`
     - Your `args` array would then correctly be `["req", "res", "arr"]` mapping these mock variables dynamically into the benchmark runner.
   - For simple arguments without definitions, provide primitives directly: `args: [5, "test", true]`.

2. **Run Original Benchmark**: 
   - Call `run_benchmark`. Pass the original code to `functionData.code`, specify your `argSetupCode`, pass `args`, and set `isOptimized: false`. This returns a `jobId`.

3. **WAIT (CRITICAL)**: 
   - Wait at least 15 to 30 seconds to allow the benchmark jobs to execute. Do not poll immediately.

4. **Check Result**: 
   - Call `get_benchmark_result` with the `jobId` until the status is "completed". Note this `originalJobId` and the mean ops/sec.

5. **Prepare & Run Optimized Benchmark**:
   - Call `run_benchmark` again with the optimized code. You MUST ensure both original and optimized functions have the EXACT SAME parameter pattern. Use the EXACT SAME `argSetupCode` and `args` to maintain a controlled A/B test. Set `isOptimized: true`.

6. **WAIT (CRITICAL)**: 
   - Wait another 15 to 30 seconds for the optimized benchmark to complete.

7. **Check Result**: 
   - Call `get_benchmark_result` until status is "completed". Note this `optimizedJobId` and the mean ops/sec.

8. **Compare Results**:
   - Call `compare_benchmarks`, passing both `originalJobId` and `optimizedJobId`. 
   - *Thought Process*: Analyze the "verdict", "p-value", and "improvementPercent". A valid p-value (< 0.05) combined with `optimization_effective` proves the fix. Report your scientific finding to the user.
</instructions>

<guardrails>
- You MUST use the exact same arguments (`argSetupCode`/`args`) for both the baseline and optimized run, or the test is invalid.
- You MUST wait between starting a benchmark and checking results to conserve tokens.
</guardrails>

<examples>
Here are critical examples of how to transform original functions with external dependencies into benchmarkable formats using `args` and `argSetupCode`:

**EXAMPLE 1 - HTTP REQUEST/RESPONSE:**
* Original: `function exampleFn(req, res) { arrExample.push(JSON.parse(resp)); res.end(); }`
* Transformed: `function exampleFn(req, res, arrExample) { arrExample.push(JSON.parse(resp)); res.end(); }`
* With args: `["req", "res", "arrExample"]`
* And argSetupCode: 
  ```javascript
  const req = { url: '/test' };
  const res = { writeHead: function() {}, write: function() {}, end: function() {} };
  const arrExample = [];
  ```

**EXAMPLE 2 - DATABASE CONNECTION:**
* Original: `function queryDatabase(userId) { return db.collection('users').findOne({ _id: userId }); }`
* Transformed: `function queryDatabase(userId, db) { return db.collection('users').findOne({ _id: userId }); }`
* With args: `["user123", "db"]`
* And argSetupCode:
  ```javascript
  const db = { collection: function(name) { return { findOne: function(query) { return null; } }; } };
  ```

**EXAMPLE 3 - EVENT EMITTERS:**
* Original: `function processEvents(data) { eventEmitter.on('data', callback); }`
* Transformed: `function processEvents(data, eventEmitter, callback) { eventEmitter.on('data', callback); }`
* With args: `["[1,2,3]", "eventEmitter", "callback"]`
* And argSetupCode:
  ```javascript
  const eventEmitter = { _events: {}, on: function(event, handler) { this._events[event] = handler; } };
  const callback = function(data) {};
  ```

**EXAMPLE 4 - ASYNC/AWAIT MOCKS:**
* Original: `async function asyncExample() { return await fetchData(); }`
* Transformed: `async function asyncExample(fetchData) { return await fetchData(); }`
* With args: `["fetchData"]`
* And argSetupCode:
  ```javascript
  const fetchData = async function() { return { data: 'example data' }; };
  ```
</examples>
