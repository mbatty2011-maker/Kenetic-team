import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

const PRICE_IDS: Record<string, string | undefined> = {
  starter:      process.env.STRIPE_PRICE_STARTER,
  pro:          process.env.STRIPE_PRICE_PRO,
  enterprise:   process.env.STRIPE_PRICE_ENTERPRISE,
};

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

  let tier: string;
  try {
    ({ tier } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const priceId = PRICE_IDS[tier];
  if (!priceId) {
    return NextResponse.json({ error: `Unknown or unconfigured tier: ${tier}` }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { user_id: user.id },
      success_url: `${appUrl}/success`,
      cancel_url:  `${appUrl}/cancel`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe error";
    console.error("stripe.checkout.sessions.create failed:", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json({ url: session.url });
}
