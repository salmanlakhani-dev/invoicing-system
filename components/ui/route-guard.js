"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

/**
 * RouteGuard checks the authentication state and redirects unauthenticated
 * users to /login, while preserving public access for /pay/[token] routes.
 */
export function RouteGuard({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isPublicRoute = pathname.startsWith("/pay/");
  const isLoginRoute = pathname === "/login";

  useEffect(() => {
    if (loading) return;

    if (!user && !isPublicRoute && !isLoginRoute) {
      router.replace("/login");
    } else if (user && isLoginRoute) {
      router.replace("/");
    }
  }, [user, loading, pathname, router, isPublicRoute, isLoginRoute]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          {/* Custom double-ring spinner with brand colors */}
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 rounded-full border-4 border-primary/20"></div>
            <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
          </div>
          <p className="text-sm font-medium text-primary/80 tracking-wider">Loading Elevate TM Invoicing...</p>
        </div>
      </div>
    );
  }

  // If user is not authenticated and the route is protected, return null to avoid flash
  if (!user && !isPublicRoute && !isLoginRoute) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 rounded-full border-4 border-primary/20"></div>
          <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
        </div>
      </div>
    );
  }

  return children;
}
