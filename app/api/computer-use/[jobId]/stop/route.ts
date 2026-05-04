import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { Sandbox } from "@e2b/desktop";
import { createAdminClient } from "@/lib/supabase/admin";

// User-triggered stop — kills the sandbox and finalizes the computer_jobs row.
// Authenticated by Supabase cookie (cross-instance safe; the in-memory map
// from the old route did not survive Vercel cold starts).

function makeAuthClient(request: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => {},
      },
    },
  );
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;
  if (!jobId) {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }

  const auth = makeAuthClient(request);
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Use admin client for the SECURITY DEFINER RPCs and for cross-RLS reads.
  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row, error: getErr } = await (admin as any).rpc("get_computer_job", {
    p_job_id: jobId,
    p_user_id: user.id,
  });
  if (getErr) {
    return NextResponse.json({ error: getErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const sandboxId = (row as { sandbox_id: string | null }).sandbox_id;
  const status    = (row as { status: string }).status;

  // If already terminalized, return ok — idempotent.
  if (status === "complete" || status === "failed" || status === "expired") {
    return NextResponse.json({ ok: true, note: `Already ${status}` });
  }

  // Try to kill the sandbox. Best-effort — it may already be dead.
  let killed = false;
  if (sandboxId) {
    try {
      const desktop = await Sandbox.connect(sandboxId, { apiKey: process.env.E2B_API_KEY });
      await desktop.kill();
      killed = true;
    } catch (err) {
      console.warn("[computer-use/stop] sandbox kill failed (may already be dead)", {
        jobId,
        sandboxId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Finalize the row. Use status='complete' (not 'failed') because the user
  // intentionally stopped — Alex should treat this as a normal early-exit, not
  // an error.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateErr } = await (admin as any).rpc("update_computer_job", {
    p_job_id: jobId,
    p_user_id: user.id,
    p_status: "complete",
    p_sandbox_id: null,
    p_stream_url: null,
    p_result: "Session stopped by user.",
    p_error: null,
  });
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Append a step so the live feed reflects the stop.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any).rpc("append_computer_job_step", {
    p_job_id: jobId,
    p_user_id: user.id,
    p_step: {
      timestamp: new Date().toISOString(),
      type: "done",
      summary: "Session stopped by user",
    },
  });

  return NextResponse.json({ ok: true, killed });
}
