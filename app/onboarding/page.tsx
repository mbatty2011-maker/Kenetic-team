import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import OnboardingClient from "./OnboardingClient";

type PageProps = {
  searchParams?: { google?: string | string[] };
};

export default async function OnboardingPage({ searchParams }: PageProps) {
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
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_name, onboarding_complete")
    .eq("id", user.id)
    .single();

  // Allow re-entry when returning from the Google OAuth round-trip so the user
  // can finish step 2 — otherwise fully-onboarded users go straight to chat.
  const returningFromGoogle = typeof searchParams?.google === "string";

  if ((profile?.company_name || profile?.onboarding_complete) && !returningFromGoogle) {
    redirect("/chat");
  }

  return <OnboardingClient />;
}
