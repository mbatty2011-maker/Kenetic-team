import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { sendEmail } from "@/lib/tools/email";

export const dynamic = "force-dynamic";

const FEEDBACK_RECIPIENT = process.env.FEEDBACK_EMAIL ?? "";

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let content: string;
  try {
    ({ content } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!content || typeof content !== "string" || content.trim().length < 3) {
    return NextResponse.json({ error: "Feedback too short" }, { status: 400 });
  }
  if (content.length > 5000) {
    return NextResponse.json({ error: "Feedback too long (max 5000 chars)" }, { status: 400 });
  }

  // Try to store in DB (table may not exist yet — fails silently)
  supabase.from("feedback").insert({
    user_id: user.id,
    user_email: user.email,
    content: content.trim(),
  }).then(() => {}, () => {});

  const subject = `App Feedback — ${user.email}`;
  const body = [
    `Feedback from: ${user.email}`,
    `Submitted: ${new Date().toLocaleString("en-US", { timeZone: "America/Denver" })} MT`,
    "",
    "---",
    "",
    content.trim(),
  ].join("\n");

  try {
    await sendEmail({ to: FEEDBACK_RECIPIENT, subject, body });
  } catch {
    // Email not configured — DB insert is the fallback, which is fine
  }

  return NextResponse.json({ success: true });
}
