import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Public paths that don't require auth
  const publicPaths = [
    "/login",
    "/signup",
    "/auth/callback",
    "/api/inngest",
    "/api/oauth/google/callback",
  ];
  const isPublicPath = pathname === "/" || publicPaths.some((p) => pathname.startsWith(p));

  // Computer Use is internal only — redirect anyone who navigates there directly
  if (user && pathname.startsWith("/chat/computer")) {
    const url = request.nextUrl.clone();
    url.pathname = "/chat";
    return NextResponse.redirect(url);
  }

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/chat";
    return NextResponse.redirect(url);
  }

  // If authenticated user visits /onboarding but has already completed it, send to /chat.
  // Skip the redirect when we're returning from the Google OAuth round-trip so the
  // user can finish step 2 (Connect Google) before completion is committed.
  if (user && pathname === "/onboarding") {
    const returningFromGoogle = request.nextUrl.searchParams.get("google");
    if (!returningFromGoogle) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("company_name, onboarding_complete")
        .eq("id", user.id)
        .single();
      if (!profileError && (profile?.company_name || profile?.onboarding_complete)) {
        const url = request.nextUrl.clone();
        url.pathname = "/chat";
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
