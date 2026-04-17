#!/usr/bin/env node
// Claude Code hook template for Windows — Node.js version
//
// Problem this solves:
//   Claude Code's bash-based hooks have multiple documented bugs on Windows.
//   This template uses Node.js (which Anthropic's hooks guide recommends for
//   cross-platform hook authoring) and bypasses all of them.
//
// Bugs bypassed:
//   - #24097  .sh scripts prompt file-association dialog instead of executing
//   - #32930  settings.json "shell" setting ignored for hooks on Windows
//   - #36156  stdin delivered as TTY (not pipe) — cat/jq hang or return empty
//   - #46601  Stop hook stdin bug on PowerShell 5.1 / pwsh 7
//   - #9758   .sh path handling (closed as NOT_PLANNED — still unresolved)
//
// Why this template works where bash hooks fail:
//   1. Node reads stdin correctly regardless of the TTY-vs-pipe bug. If stdin
//      is a TTY, we skip reading (avoiding the hang) and fall back to env vars.
//   2. JSON parsing is native (no jq dependency — jq is often missing on
//      Windows Git Bash installs).
//   3. Paths that arrive as MSYS-style `/c/Users/...` (from some Claude Code
//      code paths) are normalized to `C:/Users/...` so `fs.existsSync` accepts
//      them.
//   4. Heavy work (API calls, git ops, file I/O) runs in a detached child
//      process, so the main hook returns in milliseconds and never blocks
//      Claude's response.
//
// Usage in ~/.claude/settings.json:
//   {
//     "hooks": {
//       "Stop": [{
//         "hooks": [{
//           "type": "command",
//           "command": "node C:/path/to/hook-template.mjs"
//         }]
//       }]
//     }
//   }
//
// Adapt: put your business logic in runWorker(). The sample just writes a
// log line; replace with summarization, git push, notifications, etc.
//
// License: MIT

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { spawn } from 'child_process';
import { homedir } from 'os';
import { join, dirname } from 'path';

const IS_WORKER = process.argv.includes('--worker');

if (IS_WORKER) {
  runWorker();
} else {
  runMain();
}

// ---- Main: quick checks + spawn detached worker + exit fast ----
function runMain() {
  // Read hook JSON from stdin. On Windows, isTTY may be `undefined` (pipe is
  // fine) or `true` (the #36156 bug). If TTY, skip reading to avoid hanging.
  let hookJson = '';
  if (!process.stdin.isTTY) {
    try { hookJson = readFileSync(0, 'utf8'); } catch {}
  }

  let sessionId = '';
  let transcriptPath = '';
  try {
    const data = JSON.parse(hookJson || '{}');
    sessionId = data.session_id || '';
    transcriptPath = toWinPath(data.transcript_path || '');
  } catch {}

  // Fallback to env vars if stdin was empty (TTY bug hit, or hook event
  // without stdin JSON).
  if (!sessionId) sessionId = process.env.CLAUDE_SESSION_ID || '';
  if (!sessionId) process.exit(0);

  // Spawn detached worker. Main exits immediately so the Stop hook returns
  // in milliseconds; worker keeps running with stdio: 'ignore' + unref().
  const worker = spawn(process.execPath, [process.argv[1], '--worker'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: {
      ...process.env,
      HOOK_SESSION_ID: sessionId,
      HOOK_TRANSCRIPT_PATH: transcriptPath,
    },
  });
  worker.unref();
  process.exit(0);
}

// ---- Worker: runs async, does the heavy work ----
function runWorker() {
  const sessionId = process.env.HOOK_SESSION_ID;
  const transcriptPath = process.env.HOOK_TRANSCRIPT_PATH;
  if (!sessionId) process.exit(0);

  // Replace this block with your business logic.
  // Examples:
  //   - Summarize transcript with `claude -p --model haiku`
  //   - git add + commit + push
  //   - Send a desktop notification
  //   - Upload a file to a webhook
  //
  // Errors in the worker are invisible (stdio: 'ignore'). If you need to
  // debug, write to a log file explicitly.

  const logPath = join(homedir(), '.cache', 'claude-hook-sample.log');
  mkdirSync(dirname(logPath), { recursive: true });
  writeFileSync(
    logPath,
    `[${new Date().toISOString()}] session=${sessionId} transcript=${transcriptPath}\n`,
    { flag: 'a' }
  );

  process.exit(0);
}

// ---- MSYS path normalization ----
// Claude Code on Windows Git Bash sometimes passes paths as `/c/Users/...`
// (MSYS style). Node's native fs only recognizes `C:/Users/...` or
// `C:\Users\...`. Normalize before any fs call.
function toWinPath(p) {
  if (!p) return p;
  const m = p.match(/^\/([a-zA-Z])\/(.*)$/);
  return m ? `${m[1].toUpperCase()}:/${m[2]}` : p;
}
