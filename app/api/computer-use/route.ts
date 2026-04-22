export const maxDuration = 300; // 5 minutes — requires Vercel Pro

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import { createDesktop, takeScreenshot, executeComputerAction } from "@/lib/tools/desktopSandbox";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MAX_ITERATIONS = 15;

function isSafeUrl(raw: string): boolean {
  let url: URL;
  try { url = new URL(raw); } catch { return false; }
  if (!["http:", "https:"].includes(url.protocol)) return false;
  const host = url.hostname.toLowerCase();
  const blocked = [
    /^localhost$/,
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,
    /^0\.0\.0\.0$/,
    /^::1$/,
  ];
  return !blocked.some((r) => r.test(host));
}

type AgentAction =
  | { action: "click"; x: number; y: number; reason: string }
  | { action: "double_click"; x: number; y: number; reason: string }
  | { action: "right_click"; x: number; y: number; reason: string }
  | { action: "type"; text: string; reason: string }
  | { action: "key"; key: string; reason: string }
  | { action: "scroll"; direction: "up" | "down"; amount: number; reason: string }
  | { action: "open"; url: string; reason: string }
  | { action: "screenshot"; reason: string }
  | { action: "done"; result: string };

const SYSTEM_PROMPT = `You are an AI agent controlling a desktop computer via screenshots. After seeing each screenshot, output your next action as a single JSON object — nothing else.

Action formats (pick one):
{"action":"screenshot","reason":"..."}
{"action":"click","x":123,"y":456,"reason":"..."}
{"action":"double_click","x":123,"y":456,"reason":"..."}
{"action":"right_click","x":123,"y":456,"reason":"..."}
{"action":"type","text":"hello","reason":"..."}
{"action":"key","key":"Return","reason":"..."}
{"action":"scroll","direction":"down","amount":3,"reason":"..."}
{"action":"open","url":"https://example.com","reason":"..."}
{"action":"done","result":"Description of what was accomplished"}

Rules:
- Output ONLY valid JSON — no explanation, no markdown, no code fences
- Take a screenshot first to understand the current state
- Verify each action with a screenshot before the next
- Use "open" to navigate to URLs directly
- Use "done" when the task is fully complete

RESTRICTIONS (never violate these):
- Only visit URLs directly relevant to the user's task
- Never access internal networks, localhost, cloud metadata endpoints (169.254.x.x), admin panels, banking sites, email accounts, or authentication pages
- Never extract, describe, or screenshot passwords, API keys, tokens, or personal financial data
- Never download or upload files
- If a site asks for login credentials, stop immediately and use {"action":"done","result":"Stopped — site requires login credentials"} instead
- Only perform the specific task requested — nothing beyond it`;

export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => {},
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { task } = await request.json();
  if (!task?.trim()) return NextResponse.json({ error: "Task required" }, { status: 400 });
  if (task.length > 2000) return NextResponse.json({ error: "Task too long (max 2000 characters)" }, { status: 400 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      let desktop: Awaited<ReturnType<typeof createDesktop>>["desktop"] | null = null;

      try {
        send({ type: "status", message: "Starting desktop environment..." });

        const result = await createDesktop();
        desktop = result.desktop;
        send({ type: "stream_ready", streamUrl: result.streamUrl });

        send({ type: "status", message: "Opening browser..." });
        await desktop.open("https://www.google.com");
        await desktop.wait(2000);

        const initShot = await takeScreenshot(desktop);
        send({ type: "status", message: "Ready. Starting task..." });

        // Conversation history: alternate user/assistant
        const history: Anthropic.MessageParam[] = [];

        // First user message: screenshot + task
        history.push({
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/png", data: initShot } },
            { type: "text", text: `Task: ${task}` },
          ],
        });

        for (let i = 0; i < MAX_ITERATIONS; i++) {
          const response = await anthropic.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 512,
            system: SYSTEM_PROMPT,
            messages: history,
          });

          const rawText = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";

          // Parse JSON action — extract first balanced {...} from the response
          let parsed: AgentAction;
          try {
            let depth = 0, start = -1, end = -1;
            for (let ci = 0; ci < rawText.length; ci++) {
              if (rawText[ci] === "{") { if (depth === 0) start = ci; depth++; }
              else if (rawText[ci] === "}") { depth--; if (depth === 0) { end = ci; break; } }
            }
            if (start === -1 || end === -1) throw new Error("no JSON found");
            parsed = JSON.parse(rawText.slice(start, end + 1));
          } catch {
            send({ type: "error", message: `Could not parse agent response: ${rawText}` });
            break;
          }

          history.push({ role: "assistant", content: rawText });

          // Handle done
          if (parsed.action === "done") {
            send({ type: "done", result: parsed.result });
            break;
          }

          // Stream the action to the UI
          send({ type: "action", ...parsed });

          // Execute the action
          let nextShot: string;

          if (parsed.action === "open") {
            if (!isSafeUrl(parsed.url)) {
              history.push({
                role: "user",
                content: [{ type: "text", text: "That URL is blocked. Only public http/https URLs are allowed. Use done to finish." }],
              });
              continue;
            }
            await desktop.open(parsed.url);
            await desktop.wait(2000);
            nextShot = await takeScreenshot(desktop);
          } else if (parsed.action === "screenshot") {
            nextShot = await takeScreenshot(desktop);
          } else if (parsed.action === "click") {
            await executeComputerAction(desktop, "left_click", [parsed.x, parsed.y]);
            await desktop.wait(600);
            nextShot = await takeScreenshot(desktop);
          } else if (parsed.action === "double_click") {
            await executeComputerAction(desktop, "double_click", [parsed.x, parsed.y]);
            await desktop.wait(600);
            nextShot = await takeScreenshot(desktop);
          } else if (parsed.action === "right_click") {
            await executeComputerAction(desktop, "right_click", [parsed.x, parsed.y]);
            await desktop.wait(600);
            nextShot = await takeScreenshot(desktop);
          } else if (parsed.action === "type") {
            await executeComputerAction(desktop, "type", undefined, parsed.text);
            await desktop.wait(400);
            nextShot = await takeScreenshot(desktop);
          } else if (parsed.action === "key") {
            await executeComputerAction(desktop, "key", undefined, parsed.key);
            await desktop.wait(400);
            nextShot = await takeScreenshot(desktop);
          } else if (parsed.action === "scroll") {
            await executeComputerAction(desktop, "scroll", undefined, undefined, parsed.direction, parsed.amount);
            await desktop.wait(400);
            nextShot = await takeScreenshot(desktop);
          } else {
            nextShot = await takeScreenshot(desktop);
          }

          // Feed screenshot back as next user message
          history.push({
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/png", data: nextShot } },
              { type: "text", text: "Screenshot after your last action. What next?" },
            ],
          });
        }
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Unknown error" });
      } finally {
        if (desktop) {
          try { await desktop.kill(); } catch {}
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
