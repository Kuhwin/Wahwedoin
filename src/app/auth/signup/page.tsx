"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

export default function SignupPage() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [inviteEmail, setInviteEmail] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    const inviteParam = searchParams.get("invite");
    if (inviteParam) {
      const decoded = decodeURIComponent(inviteParam).trim();
      setInviteEmail(decoded);
      setEmail(decoded);
    }
  }, [searchParams]);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    const redirectTo = inviteEmail
      ? `${window.location.origin}/auth/callback?invite=${encodeURIComponent(inviteEmail)}`
      : `${window.location.origin}/auth/callback`;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  }

  async function handleGoogleSignup() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) setError(error.message);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-800 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Image src="/logo.png" alt="Wah We Doin" width={48} height={48} className="h-12 w-12 rounded-xl object-cover mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Create account</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Join Wah We Doin</p>
        </div>

        {inviteEmail && (
          <div className="mb-4 p-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 flex items-start gap-2">
            <svg className="h-5 w-5 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <div className="text-xs text-indigo-700 dark:text-indigo-300">
              <p className="font-medium">You&apos;ve been invited!</p>
              <p>Create an account to join the team. Use the email your invitation was sent to.</p>
            </div>
          </div>
        )}

        {success ? (
          <div className="text-center py-8">
            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Check your email</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              We sent a confirmation link to <strong>{email}</strong>
            </p>
            {inviteEmail && (
              <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-2">
                After confirming, you&apos;ll be added to the team automatically.
              </p>
            )}
            <Link href="/auth/login" className="mt-4 inline-block text-sm text-indigo-600 hover:text-indigo-700 font-medium">
              Go to sign in
            </Link>
          </div>
        ) : (
          <>
            {/* Google Sign Up */}
            <button
              onClick={handleGoogleSignup}
              className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors mb-4"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200 dark:border-slate-700" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-3 bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500">or sign up with email</span>
              </div>
            </div>

            <form onSubmit={handleSignup} className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  {error}
                </div>
              )}

              <Input
                label="Email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Input
                label="Password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Input
                label="Confirm Password"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Creating account..." : "Create Account"}
              </Button>
            </form>
          </>
        )}

        <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-6">
          Already have an account?{" "}
          <Link href="/auth/login" className="text-indigo-600 hover:text-indigo-700 font-medium">
            Sign in
          </Link>
        </p>

        <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-4">
          By continuing, you agree to our{" "}
          <Link href="/terms" className="hover:underline">Terms of Service</Link>
          {" "}and{" "}
          <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
        </p>
      </div>
    </div>
  );
}
