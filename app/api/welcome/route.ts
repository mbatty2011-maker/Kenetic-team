import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { sendEmail } from "@/lib/tools/email";

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, company_name")
    .eq("id", user.id)
    .single();

  const firstName = (profile?.full_name ?? "").split(" ")[0] || "there";
  const company = profile?.company_name ? ` at ${profile.company_name}` : "";

  try {
    await sendEmail({
      to: user.email!,
      subject: "Welcome to knetc — your team is ready",
      body: `Hi ${firstName},

Welcome to knetc. Your AI executive team${company} is ready to go.

Here's who you've got:

  Alex — Chief of Staff. Your main point of contact. Orchestrates everything.
  Jeremy — CFO. Financial modeling, unit economics, fundraising math.
  Kai — CTO. Architecture, code, debugging, anything technical.
  Dana — Head of Sales. GTM strategy, pipeline, partnerships.
  Marcus — General Counsel. Contracts, IP, compliance, legal structure.

A few things worth knowing:

  The Boardroom lets you bring all five agents into one conversation for decisions that span functions.

  Your agents can build real artifacts — Google Sheets, Docs, Gmail drafts — not just advice.

  Use the Agent Memory in Settings to tell your team everything they should always know about your company.

Start by asking Alex anything. He'll loop in the right people.

— The knetc team
knetc.team`,
    });
  } catch {
    // Welcome email is non-critical — fail silently
  }

  return NextResponse.json({ ok: true });
}
