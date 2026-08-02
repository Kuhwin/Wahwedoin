import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
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

  const pathname = request.nextUrl.pathname;
  const isStatic = pathname.startsWith("/_next") || pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico|css|js)$/);
  const isAuthRoute = pathname.startsWith("/auth");

  if (isStatic) {
    return supabaseResponse;
  }

  const isApiRoute = pathname.startsWith("/api");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isApiRoute && !user) {
    const res = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    res.headers.set("X-Content-Type-Options", "nosniff");
    return res;
  }

  if (isAuthRoute && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  const isPublicRoute = pathname === "/" ||
    pathname === "/auth/login" ||
    pathname === "/auth/signup" ||
    pathname === "/privacy" ||
    pathname === "/terms";

  if (!isPublicRoute && !isAuthRoute && !user && !isApiRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon\\.png$).*)",
  ],
};
