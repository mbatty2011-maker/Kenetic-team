import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { inngest } from "@/lib/inngest";
import { checkDailyLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let message: string, conversationId: string;
  try {
    ({ message, conversationId } = await req.json() as { message: string; conversationId: string });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!message || typeof message !== "string" || message.length > 32000)
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  if (!conversationId || typeof conversationId !== "string")
    return NextResponse.json({ error: "Invalid conversationId" }, { status: 400 });

  const { allowed, count, limit } = await checkDailyLimit(supabase, user.id);
  if (!allowed) {
    return NextResponse.json(
      { error: `Daily limit reached (${count}/${limit} messages). Resets at midnight.` },
      { status: 429 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: job, error: jobError } = await (supabase as any).rpc("create_kai_job", {
    p_user_id: user.id,
    p_conversation_id: conversationId,
    p_prompt: message,
  });

  if (jobError || !job) {
    return NextResponse.json(
      { error: jobError?.message ?? "Failed to create job" },
      { status: 500 }
    );
  }

  try {
    await inngest.send({
      name: "kai/task.requested",
      data: { jobId: job.id, userId: user.id, conversationId },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to queue job";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).rpc("update_kai_job", {
      p_job_id: job.id,
      p_user_id: user.id,
      p_status: "failed",
      p_error: `Inngest send failed: ${msg}`,
    });
    return NextResponse.json({ error: "Failed to queue job — please try again" }, { status: 500 });
  }

  return NextResponse.json({ jobId: job.id });
}
