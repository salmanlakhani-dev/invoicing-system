"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please fill in all fields.");
      return;
    }

    setIsLoading(true);
    const loadingToast = toast.loading("Signing in...");

    try {
      await login(email, password);
      toast.success("Welcome back!", { id: loadingToast });
      router.push("/");
    } catch (err) {
      console.error(err);
      let errorMessage = "Invalid email or password.";
      if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password") {
        errorMessage = "Incorrect email or password.";
      } else if (err.code === "auth/invalid-email") {
        errorMessage = "Invalid email address format.";
      } else if (err.code === "auth/network-request-failed") {
        errorMessage = "Network error. Please check your connection.";
      }
      toast.error(errorMessage, { id: loadingToast });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8">
      {/* Decorative backdrop blobs */}
      <div className="absolute top-1/4 left-1/4 -z-10 h-72 w-72 rounded-full bg-primary/5 blur-3xl"></div>
      <div className="absolute bottom-1/4 right-1/4 -z-10 h-72 w-72 rounded-full bg-secondary/5 blur-3xl"></div>

      <div className="w-full max-w-md animate-fade-in">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-tr from-primary to-secondary shadow-md text-white font-extrabold text-2xl mb-4 tracking-wider">
            IF
          </div>
          <h2 className="text-3xl font-extrabold text-brandText tracking-tight text-center">
            InvoiceFlow
          </h2>
          <p className="mt-2 text-sm text-muted text-center">
            Sign in to manage your business invoicing
          </p>
        </div>

        <div className="glass-card rounded-2xl p-8 border border-border shadow-xl">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-border bg-white/50 px-4 py-3 text-sm text-brandText placeholder-muted/60 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                placeholder="Enter your email"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-border bg-white/50 px-4 py-3 text-sm text-brandText placeholder-muted/60 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                placeholder="••••••••"
              />
            </div>

            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  defaultChecked
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
                <label htmlFor="remember-me" className="ml-2 text-muted">
                  Remember me
                </label>
              </div>
              <span className="text-primary hover:underline cursor-pointer">
                Forgot password?
              </span>
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="group relative flex w-full justify-center rounded-xl bg-gradient-to-r from-primary to-primary-light hover:from-primary-light hover:to-primary py-3.5 px-4 text-sm font-semibold text-white shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                ) : (
                  "Sign In to Dashboard"
                )}
              </button>
            </div>
          </form>


        </div>
      </div>
    </div>
  );
}
