import { NextRequest, NextResponse } from "next/server";
import { Sandbox } from "@e2b/desktop";
import { createAdminClient } from "@/lib/supabase/admin";

// Vercel cron: every 5 minutes. Belt-and-suspenders against orphaned E2B
// sandboxes when an Inngest worker gets hard-killed before its finally block
// runs. Looks for computer_jobs rows still in queued/running past 10 minutes
// and tears them down.
//
// Auth: Vercel cron sends `Authorization: Bearer ${CRON_SECRET}`. We require
// it on every request so this can't be triggered externally.

export const dynamic = "force-dynamic";

const STALE_AFTER_MINUTES = 10;

export async function GET(request: NextRequest) {
  // Vercel cron auth header
  const authHeader = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: stale, error } = await (admin as any).rpc("list_stale_computer_jobs", {
    p_older_than_minutes: STALE_AFTER_MINUTES,
  });
  if (error) {
    console.error("[cron/desktop-cleanup] list failed", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (stale as Array<{
    id: string;
    user_id: string;
    sandbox_id: string | null;
    status: string;
  }>) ?? [];

  let killed = 0;
  let updated = 0;
  for (const row of rows) {
    if (row.sandbox_id) {
      try {
        const desktop = await Sandbox.connect(row.sandbox_id, { apiKey: process.env.E2B_API_KEY });
        await desktop.kill();
        killed++;
      } catch (err) {
        // Most likely the sandbox already expired on the E2B side. Log and continue.
        console.warn("[cron/desktop-cleanup] sandbox kill failed", {
          jobId: row.id,
          sandboxId: row.sandbox_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: upErr } = await (admin as any).rpc("update_computer_job", {
      p_job_id: row.id,
      p_user_id: row.user_id,
      p_status: "expired",
      p_sandbox_id: null,
      p_stream_url: null,
      p_result: null,
      p_error: `Stale - cleaned by cron after ${STALE_AFTER_MINUTES}m`,
    });
    if (upErr) {
      console.error("[cron/desktop-cleanup] update failed", { jobId: row.id, error: upErr.message });
      continue;
    }
    updated++;
  }

  return NextResponse.json({
    ok: true,
    scanned: rows.length,
    killed,
    updated,
    staleAfterMinutes: STALE_AFTER_MINUTES,
  });
}
