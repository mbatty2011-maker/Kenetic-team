# Computer Use

The `/chat/computer` route runs a Claude-driven agent inside an E2B Desktop sandbox: Claude sees screenshots, picks a next action, the action is executed in the sandbox, and the cycle repeats until the task is done or the iteration/time limit is hit.

## Stack

- **E2B Desktop** (`@e2b/desktop`) — Firecracker microVM with a virtual display, browser, and input simulation. Same `E2B_API_KEY` as the code interpreter; no separate key.
- **Anthropic SDK** — `claude-sonnet-4-6`. The route does **not** use Anthropic's native computer-use beta tool; it uses a custom JSON action protocol that's narrower and easier to constrain.
- **SSE** — the route streams structured events to `app/chat/computer/ComputerUseClient.tsx`.

## Files

- `app/api/computer-use/route.ts` — POST starts a session and streams events; DELETE kills a sandbox by id.
- `lib/tools/desktopSandbox.ts` — `createDesktop`, `takeScreenshot`, `executeComputerAction`. Thin wrappers around the SDK.
- `app/chat/computer/ComputerUseClient.tsx` — UI: live VNC stream + action feed.

## Required env vars

```
E2B_API_KEY=...
ANTHROPIC_API_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

The Supabase keys are needed because every parsed action is written to `agent_activity_events` (`agent='computer'`).

## Vercel runtime

The route sets `export const maxDuration = 300` (5 minutes). This requires Vercel **Pro or higher** — Hobby caps at 60s.

The agent loop has its own 240-second wall-clock guard (`loopDeadline`) so it sends a clean `done` event before Vercel kills the function.

## SSE event protocol

Every line is `data: <json>\n\n`. Event shapes:

- `{ type: "status", message: string }` — progress update before the loop starts.
- `{ type: "session", sessionId: string }` — emitted once after the sandbox boots; the client uses this to call DELETE on stop.
- `{ type: "stream_ready", streamUrl: string }` — VNC stream URL the client embeds.
- `{ type: "action", action: string, ...fields }` — the agent's parsed next action (see schema below). Mirrored 1:1 to `agent_activity_events`.
- `{ type: "thinking", text: string }` — optional commentary (currently unused).
- `{ type: "done", result: string }` — agent finished (or hit the time/iteration limit).
- `{ type: "error", message: string }` — terminal error.

## Action schema (custom JSON, not Anthropic computer-use)

The model is instructed to emit exactly one JSON object per turn — no markdown fences. The route parses by scanning for the first balanced `{...}` block.

```json
{"action":"screenshot","reason":"..."}
{"action":"click","x":123,"y":456,"reason":"..."}
{"action":"double_click","x":123,"y":456,"reason":"..."}
{"action":"right_click","x":123,"y":456,"reason":"..."}
{"action":"type","text":"hello","reason":"..."}
{"action":"key","key":"Return","reason":"..."}
{"action":"scroll","direction":"down","amount":3,"reason":"..."}
{"action":"open","url":"https://example.com","reason":"..."}
{"action":"done","result":"Description of what was accomplished"}
```

### Why a custom protocol instead of `anthropic-beta: computer-use-2024-10-22`?

The native beta tool has a wider action surface and is more chatty. The custom schema is constrained to actions we actually need, lands in JSON we control, and avoids the beta tool's tendency to drift into unprompted exploration. Keep it.

## Limits and guards

- `MAX_ITERATIONS = 15` — hard cap on agent turns.
- `loopDeadline = 240_000ms` — wall-clock cap, sends `done` cleanly before Vercel kills the function.
- `pruneOldScreenshots` — keeps only the 2 most recent screenshots in the message history to control context size.
- `isSafeUrl` — blocks localhost, RFC1918, link-local, and cloud metadata endpoints on `open`.
- System prompt forbids visiting authentication/banking pages, downloading files, and extracting credentials. If a site asks for login, the agent emits `done` with a stop message.

## Testing locally

1. Confirm env vars are set in `.env.local` (above).
2. `npm run dev`.
3. Visit `/chat/computer` while signed in.
4. Submit a task like `Open google.com and search for "E2B desktop"`.
5. Watch the live stream and the action feed update on each turn.
6. Click Stop to call DELETE — the sandbox terminates within ~2 seconds (visible in the E2B dashboard).
7. Verify activity rows: `select * from agent_activity_events where agent = 'computer' order by created_at desc limit 20;`

## Cleanup of stale sandboxes

If a function is killed before `finally { desktop.kill() }` runs (rare, but happens on hard timeout), the sandbox lingers until E2B's TTL expires (~5 minutes). The stop button calls `Sandbox.connect(...).kill()` directly — same-instance lookup uses the in-memory `activeSessions` map; cross-instance falls back to the `sandboxId` the client was streamed.

## Roadmap (not in this pass)

- Persist screenshots to Supabase storage and store signed URLs in `agent_activity_events.screenshot_url` so the activity feed can show a visual record.
- Optional opt-in for Anthropic native computer-use beta tool, behind a flag.
