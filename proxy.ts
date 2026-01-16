import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  // Get the token from the cookies
  const token = request.cookies.get("token")?.value;

  // Define paths that require authentication
  const protectedPaths = ["/"];

  // Check if the current path is protected
  const isProtectedPath = protectedPaths.includes(request.nextUrl.pathname);

  if (isProtectedPath && !token) {
    // Redirect to the login page if the user is not authenticated
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Allow the request to proceed
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - login (login page)
     * - register (register page)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|login|register).*)",
  ],
};
