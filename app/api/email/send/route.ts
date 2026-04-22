import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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

  const { subject, body } = await req.json();

  if (typeof subject !== "string" || subject.length > 500) {
    return NextResponse.json({ error: "Invalid subject" }, { status: 400 });
  }
  if (typeof body !== "string" || body.length > 50000) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Gmail will be configured in Phase 7
  // For now, log and return success
  console.log("Email send requested:", { subject });

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
      to: user.email ?? process.env.GMAIL_FROM_ADDRESS ?? "",
      subject,
      body,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Email send error:", err);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}
