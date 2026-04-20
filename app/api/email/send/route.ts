import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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

  const { subject, body } = await req.json();

  // Gmail will be configured in Phase 7
  // For now, log and return success
  console.log("Email send requested:", { to: "mbatty2011@gmail.com", subject });

  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    // Gmail not yet configured — still return success so UI works
    return NextResponse.json({
      success: true,
      message: "Email logged (Gmail not yet configured)"
    });
  }

  try {
    const { sendEmail } = await import("@/lib/tools/email");
    await sendEmail({
      to: "mbatty2011@gmail.com",
      subject,
      body,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Email send error:", err);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}
