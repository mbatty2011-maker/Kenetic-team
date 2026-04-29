import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { sendEmail } from "@/lib/tools/email";
import { welcomeEmailHtml, welcomeEmailText } from "@/lib/email/welcome";

export async function POST(req: NextRequest) {
  void req;
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
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://knetc.team";
  const dashboardUrl = `${baseUrl}/chat/alex`;

  try {
    await sendEmail({
      to: user.email!,
      subject: "Your team is in.",
      body: welcomeEmailText({ dashboardUrl }),
      html: welcomeEmailHtml({ dashboardUrl }),
    });
  } catch {
    // Welcome email is non-critical — fail silently
  }

  return NextResponse.json({ ok: true });
}
