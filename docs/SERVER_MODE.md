# Server Mode: SQLite Over SSH

BranchBoard is local-first by default, but the storage layer already supports a
shared SQLite database. Server mode is designed for small teams that want one
shared board without introducing a full HTTP/WebSocket backend yet.

## Status

Server mode is implemented as `ServerStorageProvider`, backed by
`SshSqliteStorageProvider`.

It is suitable for controlled team usage, but the default and safest mode is
still `workspace-json`.

## How It Works

BranchBoard opens the same SQLite database in one of two ways:

1. **Local mode** - `branchBoard.sshHost` is empty. The extension runs `sqlite3`
   locally against `branchBoard.sqliteRemotePath`.
2. **SSH mode** - `branchBoard.sshHost` is set. The extension runs `sqlite3` on
   the remote host over SSH, using the configured SSH key or SSH agent.

The board path is the same in both modes. This means a developer on the server
machine can use local mode while teammates connect to the same DB through SSH.

## Required Tools

On the machine that runs SQLite:

- `sqlite3`
- `base64`
- POSIX shell (`sh`)

For SSH mode:

- SSH access to the target host,
- private key or working SSH agent,
- `BatchMode=yes` must be able to connect without interactive prompts.

## Important Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `branchBoard.storageMode` | `workspace-json` | Set to `server` to use SQLite. |
| `branchBoard.sshHost` | `""` | Empty = local SQLite. Non-empty = SSH target, e.g. `user@host` or SSH config alias. |
| `branchBoard.sshPort` | `22` | SSH port. |
| `branchBoard.sqliteRemotePath` | `~/sqlite/branchboard.db` | SQLite database path on the target machine. |
| `branchBoard.sshKeyPath` | `""` | Optional absolute path to a private key. Empty uses SSH agent/config. |
| `branchBoard.serverAllowEmptyOverwrite` | `false` | Data-loss guard. Allows replacing non-empty server board with an empty board only when explicitly enabled. |
| `branchBoard.syncIntervalSeconds` | `20` | Poll interval for refresh/sync. |

## Setup: Local SQLite On This Machine

Use this when VS Code/Cursor runs on the same machine as the database.

```jsonc
{
  "branchBoard.storageMode": "server",
  "branchBoard.sshHost": "",
  "branchBoard.sqliteRemotePath": "~/sqlite/branchboard.db"
}
```

Then run `BranchBoard: Sync Now` or reload the extension.

## Setup: Remote SQLite Over SSH

Use this when the DB lives on a shared server.

```jsonc
{
  "branchBoard.storageMode": "server",
  "branchBoard.sshHost": "deploy@example.com",
  "branchBoard.sshPort": 22,
  "branchBoard.sqliteRemotePath": "~/sqlite/branchboard.db",
  "branchBoard.sshKeyPath": "/Users/you/.ssh/id_ed25519"
}
```

You can select the key from the command palette:

```text
BranchBoard: Select SSH Key
```

## First Board Creation

If the server is reachable but has no board yet, BranchBoard does not silently
seed it. The extension loads an in-memory empty shell and asks the user to create
a board explicitly.

This is intentional. It prevents a wrong `sqliteRemotePath` from creating a
decoy empty board and hiding the real database.

## Database Schema

Server mode creates relational tables:

- `board_meta`
- `board_columns`
- `board_users`
- `board_tasks`
- `board_events`
- `board_deployments`
- `board_notifications`
- `board_announcements`
- `board_history`
- `board_change_history`

Each entity table stores indexed columns for common queries plus a full JSON
`data` payload. This preserves newer BranchBoard fields without requiring a
schema change for every product iteration.

Older DBs that contain only the legacy `board(id=1, data=<whole-board-json>)`
row are migrated automatically on first load. The legacy row remains as a safety
backup, while future reads/writes use relational tables.

## Write Model

The provider keeps a snapshot of the last loaded board.

On save it can write:

- a full import when there is no previous snapshot,
- an incremental relational delta when there is one.

The delta contains upserts/deletes per collection and can be stored in
`board_change_history` for inspection.

## Conflict And Data-Loss Guards

Server mode has several guardrails:

1. **Optimistic concurrency**
   Saves compare the last loaded `updated_at` with the current server
   `updated_at`. If another client wrote first, BranchBoard reloads the server
   board and refuses to overwrite it.

2. **Empty overwrite guard**
   If the incoming board has 0 tasks and the remote board has data, save is
   refused unless `branchBoard.serverAllowEmptyOverwrite` is true.

3. **No auto-seed on empty server**
   A reachable but empty database requires explicit user action.

4. **Legacy write blocker**
   SQLite triggers block old legacy writers after migration to relational tables.

5. **Serialized operations**
   Load/save operations are serialized with an internal operation lock.

## Fallback Behavior

If server mode fails during activation, BranchBoard falls back to local JSON so
the board UI remains usable. This fallback is loud:

- warning message,
- logger output,
- actions to retry, select SSH key or open settings.

The active storage kind can differ from configured `storageMode`; the WebView
receives both in `appConfig`.

## Test Connection

The Settings drawer can ask the provider to test the connection. The test checks:

1. transport: local shell or SSH,
2. `sqlite3` availability,
3. SQLite JSON function support,
4. database/schema summary.

The result is shown step-by-step and logged through `Logger`.

## Operational Notes

- Put the DB somewhere backed up, e.g. `~/sqlite/branchboard.db`.
- Keep SSH keys per-project via workspace settings when possible.
- Avoid editing the SQLite database manually while the extension is running.
- Keep `syncIntervalSeconds` moderate for SSH connections.
- Do not enable `serverAllowEmptyOverwrite` except for intentional reset.

## When To Use Local JSON Instead

Use `workspace-json` when:

- only one developer needs the board,
- the repository should carry the board file,
- server setup is not worth it,
- you need the simplest possible MVP.

Use `server` when:

- several people should share one board,
- notifications/admin announcements should sync,
- you want a single board outside the Git repository,
- you accept SSH/SQLite operational requirements.
