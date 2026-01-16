"use client";

import { useAuth } from "../hooks/useAuth";

interface AuthGuardProps {
  children: React.ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, isLoading } = useAuth();

  // Show loading spinner while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-t-2 border-b-2 border-white animate-spin"></div>
            <div className="absolute inset-0 w-16 h-16 rounded-full border-r-2 border-l-2 border-white/20 animate-spin-reverse"></div>
          </div>
          <p className="text-gray-400 text-sm tracking-widest uppercase">
            Authenticating...
          </p>
        </div>
      </div>
    );
  }

  // Don't render children if not authenticated (redirect will happen in useAuth)
  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
