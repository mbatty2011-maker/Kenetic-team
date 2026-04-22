# Computer Use Setup for Kai

Kai has the `computer`, `text_editor`, and `bash` tools scaffolded, but they require a running Docker container with a display to function. This document explains how to set that up.

## What's already done

- The three Computer Use tools are defined in `lib/agent-tools.ts`
- The `anthropic-beta: computer-use-2024-10-22` header is sent for all Kai requests
- Tool calls to `computer`, `text_editor`, and `bash` currently return a placeholder message telling the user a container is needed

## What you need to build

### 1. Docker container with VNC

Anthropic's reference implementation provides a Docker image you can use as a starting point:

```bash
docker pull ghcr.io/anthropics/anthropic-quickstarts:computer-use-demo-latest
```

Or build your own with:
- Ubuntu/Debian base
- Xvfb (virtual framebuffer)
- x11vnc or TigerVNC
- A web browser (Chromium)
- Python 3 with `anthropic` and `pyautogui` libraries
- A web server to expose screenshots/control

### 2. Container API

The container needs to expose endpoints that the `executeAgentTool` function in `lib/agent-tools.ts` can call:

- `POST /computer` — takes `{ action, coordinate?, text? }`, returns screenshot as base64
- `POST /text_editor` — takes `{ command, path, ... }`, returns file content/result
- `POST /bash` — takes `{ command }`, returns stdout/stderr

Set the container URL as an env var:

```
COMPUTER_USE_CONTAINER_URL=http://localhost:8080
```

### 3. Wire up the tools in agent-tools.ts

Replace the placeholder in `executeAgentTool` for `computer`, `text_editor`, and `bash`:

```typescript
case "computer": {
  const res = await fetch(`${process.env.COMPUTER_USE_CONTAINER_URL}/computer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  return data.screenshot_base64
    ? `[screenshot taken — ${data.width}x${data.height}]`
    : data.output ?? "done";
}
```

### 4. Display screenshots in the UI

The `computer` tool returns screenshots. To show them in the chat, you'll need to:
1. Return the base64 image from the tool result
2. Update `MessageBubble.tsx` to detect and render base64 images in tool results

## Infrastructure options

| Option | Pros | Cons |
|--------|------|------|
| Local Docker | Free, full control | Not accessible outside local network |
| Railway/Render container | Easy deploy, persistent | ~$5-20/mo |
| AWS ECS Fargate | Scalable, secure | More complex setup |
| Fly.io | Fast, global | Requires Fly CLI setup |

## Security considerations

- The container can execute arbitrary code — run it in an isolated environment
- Do not expose the container API publicly without authentication
- Consider rate limiting and request signing between the app and container
- The `bash` tool in particular is powerful — treat it like SSH access
