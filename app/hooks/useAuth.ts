"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

// Paths that don't require authentication
const PUBLIC_PATHS = ["/login", "/register"];

export function useAuth() {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = () => {
      // Get token from cookies
      const token = document.cookie
        .split("; ")
        .find((row) => row.startsWith("token="))
        ?.split("=")[1];

      const isPublicPath = PUBLIC_PATHS.includes(pathname);

      if (!token && !isPublicPath) {
        // Not authenticated and trying to access protected route
        setIsAuthenticated(false);
        router.replace("/login");
      } else if (token && isPublicPath) {
        // Authenticated but on login/register page, redirect to home
        setIsAuthenticated(true);
        router.replace("/");
      } else {
        setIsAuthenticated(!!token);
      }

      setIsLoading(false);
    };

    checkAuth();
  }, [pathname, router]);

  const logout = () => {
    // Clear the token cookie
    document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    setIsAuthenticated(false);
    router.replace("/login");
  };

  return { isAuthenticated, isLoading, logout };
}
