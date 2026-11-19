# Nova local workspace companion

## Using worktrees in Nova

Deploy the included `nova_local_workspace_binding` database migration before
deploying the web changes. From this repository, `bun run --cwd packages/db
db:migrate` applies the repository's migrations to the configured database;
choose that database deliberately. No database migration is applied by the
companion.

1. Start `bun run workspace:local --project /absolute/path/to/project --origin
   https://nova.supercodeai.tech` from the Nova repository. Use your local Nova
   development origin instead when testing. Add more `--project` arguments for
   other approved folders.
2. In Nova's new-thread composer, choose **Choose branch** and pair using the
   printed code. The browser may ask for local-network access. This companion
   runs on the computer containing the repository, not on a remote web server.
3. Select a local Git project, or explicitly clone the selected connected GitHub
   repository onto this computer. Clones use this computer's Git authentication;
   web GitHub tokens are never copied into the companion. Use **Fetch branches**
   for an up-to-date remote list. Local-only branches need no remote access.
4. Select **New worktree** and its starting branch. Optionally name a new working
   branch immediately; otherwise the worktree starts detached. **Current
   checkout** is an explicit alternative. Non-Git folders offer initialization;
   they need an initial commit before an isolated worktree can be created.
5. If setup files are needed, inspect the filenames matched by `.worktreeinclude`
   and opt into their local copy. Ignored contents stay off the chat/file APIs.
6. Start the thread. Nova packs sources from the chosen worktree, not the remote
   default branch. Its existing file-proposal flow applies changes there only
   when **Make these changes** is selected. The companion intentionally exposes
   no arbitrary shell; it cannot claim to run local tests for the agent.
7. Select **Publish**, or directly ask Nova to commit/push/create a PR. Choose the
   files, destination branch, remote, commit message, and PR base/title/body.
   Review the generated preview, then confirm. The approved state is checked
   again; changes or remote movement require a new preview. Git uses your own
   configured identity. PR creation requires `gh` signed into the intended account.

Managed worktrees continue on their approved publishing branch after committing.
Current-checkout publication instead preserves the original checkout's HEAD and
index and creates the approved feature branch; use a managed worktree to continue
directly on that branch. Existing staged changes must be unstaged deliberately
before publishing; the companion never consumes them automatically.

Each thread's opaque workspace binding is persisted on the Nova session and its
Git registry stays on the computer. Re-pair the original companion to resume.
An unavailable companion never silently switches a bound thread to cloud or the
original folder. Parallel local work uses a separate worktree thread; side
conversations, local/cloud handoff, automatic cleanup, cloud Git publication,
and standalone native-app controls are not part of this first version.

## Running the companion directly

Run from the repository root with Bun:

```sh
bun apps/supercode-cli/server/src/nova/workspaces/cli.ts \
  --project /absolute/path/to/project \
  --origin http://localhost:3003 \
  --port 47832
```

Repeat `--project` for each explicitly approved local directory and `--origin`
for each trusted Nova browser origin. Origins must be exact HTTP loopback or
HTTPS origins, without a path, credentials, trailing slash, or wildcard. HTTPS
origins should identify only trusted deployed Nova installations. The default
port is 47832. The service binds only to `127.0.0.1`, not the LAN interface.

The terminal prints the address and a high-entropy, single-use pairing code,
never the bearer token. Enter that code in Nova. Restart the companion to pair
again or revoke its in-memory session. A session expires after one hour and
is bound to the exact browser Origin that paired it. Five incorrect pairing
attempts block further attempts for the remainder of the one-minute window.

Pair with `POST /pair` and JSON `{ "code": "..." }`; the response is
`{ "token": "...", "expiresAt": "ISO timestamp" }`. All subsequent calls use
`Authorization: Bearer <token>`, `Content-Type: application/json`, and that
same `Origin`. Keep the token in browser memory or sessionStorage, never in
localStorage, logs, or URLs.
Responses use `Cache-Control: no-store`. GET is not supported. Approved CORS
preflights allow only POST, Authorization and Content-Type, including private
network preflight when requested. The Host must be `127.0.0.1:<actual port>`.

## API

All routes accept strict JSON objects, rejecting unknown fields. The maximum
request body is 2 MiB. Paths below identify files inside an already registered
workspace; there is no browser API to register an arbitrary root directory or
execute a command. An explicitly confirmed GitHub clone is created only in the
engine-managed clone location, never a browser-supplied path.

| POST route | Input | Response |
| --- | --- | --- |
| `/projects` | `{}` | `{projects}` |
| `/lookup` | `{threadId}` | `{workspace}` (or `{workspace:null}`) |
| `/clone` | `{repositoryFullName:"owner/name",confirmed:true}` | `{project}` |
| `/branches` | `{projectId,fetch?:boolean}` | `{branches}` |
| `/ignored-files` | `{projectId}` | `{paths}` (names only, no contents) |
| `/create` | `{projectId,threadId,sourceRef,mode,newBranch?,copyIgnored?}` | `{workspace}` |
| `/get` | `{workspaceId}` | `{workspace}` |
| `/files` | `{workspaceId}` | `{paths}` |
| `/read` | `{workspaceId,path}` | `{content}` |
| `/write` | `{workspaceId,path,content}` | `{ok:true}` |
| `/status` | `{workspaceId}` | `{status}` |
| `/preview` | `{workspaceId,action,branch,baseBranch,remote,message,files,title?,body?}` | `{preview}` |
| `/publish` | `{previewId}` | `{result}` |
| `/initialize` | `{projectId,confirmed:true}` | `{project}` |

`mode` is `worktree` or `current`; `action` is `commit`, `push`, or `pr`.
`files` is an array of paths. Preview creation does not itself publish anything;
publishing the preview ID is the explicit confirmation step. Workspace creation
and writes should be invoked only after the corresponding user-approved UI
flow. Initialization always requires the literal `confirmed:true`.
Cloning also requires `confirmed:true` after an explicit user action; only a
GitHub `owner/name` identifier is accepted, not a URL, path, or clone command.
Branch listing is local unless `fetch:true` explicitly requests a refresh from
the configured remotes. Ignored-file listing returns only copy-candidate names
for user consent, not file bytes.

Use `/lookup` after pairing again to recover a thread's existing workspace.
Workspace IDs may be persisted as nonsecret browser state; bearer tokens should
not be persisted beyond the browser session. Lookup remains authenticated and
does not grant access to roots outside the CLI-approved list.

The project list intentionally includes approved local root paths for the paired
owner. Treat the paired browser origin as trusted: it can read and write those
workspaces and perform the supported Git operations. Pairing protects against
unapproved cross-origin web requests, not arbitrary processes running as the
same OS user, malicious code within an approved origin, or compromise of the
local machine. This is not an OS sandbox. Stop the companion when not needed.

Authentication failures return 401, Origin/Host violations 403, invalid inputs
400, and sanitized workspace failures 409. Known, fixed domain error messages
(such as a stale preview or occupied branch) are returned so the UI can guide
recovery. Other errors are generic; no Git output, credentials, or process
errors are returned by the transport.

## Embedding and tests

`startWorkspaceCompanion({roots,origins,port?,home?,service?})` returns
`{server,code,stop()}`. Inject `WorkspaceService` to test without touching Git
credentials; the default implementation is `NovaWorkspaceGit`. Port 0 is
supported for embedded tests, but the CLI requires a concrete port.

```sh
bun test apps/supercode-cli/server/src/nova/workspaces/server.test.ts
```
