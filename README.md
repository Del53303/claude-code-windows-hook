# claude-code-windows-hook

A minimal, working Node.js template for Claude Code hooks on Windows.

Bypasses the documented bash-hook bugs on Windows Claude Code (`.sh` scripts
not executing, stdin delivered as TTY instead of pipe, `shell` setting
ignored, etc.) by using Node.js — which Anthropic's official docs already
recommend for cross-platform hook authoring, but without providing a concrete
working example.

## The problem

If you try to write a Claude Code hook on Windows with a bash `.sh` script,
you'll likely hit one or more of these open / unfixed issues:

| Issue | Symptom |
|-------|---------|
| [#24097](https://github.com/anthropics/claude-code/issues/24097) | `.sh` hooks trigger a file-association dialog instead of executing |
| [#32930](https://github.com/anthropics/claude-code/issues/32930) | `settings.json` `shell` setting is ignored; hooks hardcoded to `/usr/bin/bash` |
| [#36156](https://github.com/anthropics/claude-code/issues/36156) | stdin is delivered as TTY instead of pipe — `cat` / `jq` hang or return empty |
| [#46601](https://github.com/anthropics/claude-code/issues/46601) | Stop hook stdin bug on PowerShell 5.1 / pwsh 7 |
| [#9758](https://github.com/anthropics/claude-code/issues/9758) | Closed as `NOT_PLANNED` — path handling never fixed at the Claude Code level |

Existing community workarounds are partial: AutoHotkey scripts that hide bash
popup windows, `CLAUDE_CODE_GIT_BASH_PATH` environment variable tricks,
`.bashrc` + `cygpath` rewiring. They fix one symptom each but no single
recipe that works for all hook types.

## The solution

Anthropic's hooks guide notes that hooks invoked via `node` work uniformly
across Windows / Linux / macOS, whereas platform-specific shells do not.
This repo is a concrete working implementation of that recommendation,
tested on a real Windows 11 Claude Code install. It handles the edge cases
that don't appear in the one-line docs mention:

- **stdin TTY fallback** — if stdin is a TTY (Windows #36156 bug), skip reading
  (which would hang) and fall back to `CLAUDE_SESSION_ID` env var
- **MSYS path normalization** — Git Bash passes paths as `/c/Users/...` but
  Node's native `fs` needs `C:/Users/...`; a small helper normalizes
- **Detached worker pattern** — heavy work (API calls, git push) runs in a
  detached child process so the hook returns in milliseconds and Claude's
  response is never blocked
- **env-based worker communication** — stdin can only be read once; the worker
  gets its params from env vars set at spawn time

## Usage

1. Copy `hook-template.mjs` to a location on your machine (e.g. `~/.claude/hooks/my-hook.mjs`)
2. Replace the `runWorker()` body with your business logic
3. Register in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node C:/Users/YOU/.claude/hooks/my-hook.mjs"
          }
        ]
      }
    ]
  }
}
```

Works for `Stop`, `SessionEnd`, `PreToolUse`, `PostToolUse`, and other hook
events. The same pattern applies.

## How it compares to alternatives

| Approach | Works on Windows? | Caveats |
|---|---|---|
| `.sh` script directly in hook | ✗ | Hits #24097 / #36156 — file association dialog or empty stdin |
| `.sh` + `CLAUDE_CODE_GIT_BASH_PATH` env | ⚠️ partially | Only works if Git Bash is in an exact path; doesn't fix stdin TTY bug fundamentally |
| PowerShell hook | ⚠️ partially | Works for some hook events but has its own stdin quirks (#46601) |
| **Node.js (this template)** | ✓ | Works uniformly; Node is already required for Claude Code |

## Background

Extracted from a real multi-machine workflow running Claude Code on both
Linux and Windows. The Linux side worked out of the box with bash; the
Windows side required this Node.js rewrite to handle the hook stdin / path
quirks cleanly.

## License

MIT — use freely, modify, redistribute.

## Contributing

Found another Windows hook quirk not handled here? Open an issue or PR.

## Author

[@Del53303](https://github.com/Del53303)
