export const maxDuration = 300; // 5 minutes — requires Vercel Pro

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import { createDesktop, takeScreenshot, executeComputerAction } from "@/lib/tools/desktopSandbox";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DISPLAY_WIDTH = 1024;
const DISPLAY_HEIGHT = 768;
const MAX_ITERATIONS = 30;

const SYSTEM_PROMPT = `You are an AI agent controlling a desktop computer to complete tasks for the user. You have a full desktop with a browser available.

Guidelines:
- Always take a screenshot first to see the current state
- Be methodical: one action at a time, verify with a screenshot after each significant action
- To open the browser or navigate, use the open action with a URL
- When the task is complete, describe what you accomplished clearly and concisely`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ComputerTool = any;

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

        // Open browser to Google as starting point
        send({ type: "status", message: "Opening browser..." });
        await desktop.open("https://www.google.com");
        await desktop.wait(2000);

        const initShot = await takeScreenshot(desktop);
        send({ type: "status", message: "Ready. Starting task..." });

        const tools: ComputerTool[] = [
          {
            type: "computer_20250124",
            name: "computer",
            display_width_px: DISPLAY_WIDTH,
            display_height_px: DISPLAY_HEIGHT,
            display_number: 1,
          },
        ];

        const messages: Anthropic.MessageParam[] = [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: "image/png", data: initShot },
              },
              { type: "text", text: task },
            ],
          },
        ];

        for (let i = 0; i < MAX_ITERATIONS; i++) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const response = await (anthropic.beta.messages as any).create({
            model: "claude-sonnet-4-6",
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            tools,
            messages,
            betas: ["computer-use-2025-01-24"],
          });

          // Stream any text reasoning
          for (const block of response.content) {
            if (block.type === "text" && block.text?.trim()) {
              send({ type: "thinking", text: block.text });
            }
          }

          if (response.stop_reason !== "tool_use") {
            const finalText =
              response.content.find((b: { type: string }) => b.type === "text")?.text ??
              "Task complete.";
            send({ type: "done", result: finalText });
            break;
          }

          messages.push({ role: "assistant", content: response.content });

          const toolResults: Anthropic.MessageParam["content"] = [];

          for (const block of response.content) {
            if (block.type !== "tool_use" || block.name !== "computer") continue;

            const input = block.input as {
              action: string;
              coordinate?: [number, number];
              text?: string;
              scroll_direction?: string;
              scroll_amount?: number;
            };

            send({
              type: "action",
              action: input.action,
              coordinate: input.coordinate,
              text: input.text,
            });

            if (input.action !== "screenshot") {
              await executeComputerAction(
                desktop,
                input.action,
                input.coordinate,
                input.text,
                input.scroll_direction,
                input.scroll_amount
              );
              await desktop.wait(600);
            }

            const screenshot = await takeScreenshot(desktop);
            (toolResults as Anthropic.ToolResultBlockParam[]).push({
              type: "tool_result",
              tool_use_id: block.id,
              content: [
                {
                  type: "image",
                  source: { type: "base64", media_type: "image/png", data: screenshot },
                },
              ],
            });
          }

          messages.push({ role: "user", content: toolResults });
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
