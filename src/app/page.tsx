"use client";

import { useState, type FormEvent } from "react";
import { GoalsProvider, useGoals } from "~/contexts/GoalsContext";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import GoalsDashboard from "~/components/goals/GoalsDashboard";
import toast, { Toaster } from "react-hot-toast";
import { api } from "~/trpc/react";

function GoalsPageContent() {
  const { isAuthenticated, isLoading, authenticate } = useGoals();
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsAuthenticating(true);

    const success = await authenticate(password);
    if (success) {
      toast.success("Welcome to your Goals Dashboard!");
      setError(false);
    } else {
      setError(true);
      toast.error("Incorrect password");
    }
    setPassword("");
    setIsAuthenticating(false);
  };

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <div className="text-center">
          <div className="animate-pulse">
            <Lock className="mx-auto h-12 w-12 opacity-50" />
            <p className="mt-4 text-sm opacity-60">Checking authentication...</p>
          </div>
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-black text-white">
        <Toaster position="top-right" />
        <div className="flex min-h-screen flex-col items-center justify-center px-4">
          <Link
            href="/"
            className="absolute left-8 top-8 flex items-center gap-2 text-sm opacity-60 transition-opacity hover:opacity-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>

          <div className="w-full max-w-md space-y-8">
            <div className="text-center">
              <Lock className="mx-auto h-12 w-12 opacity-50" />
              <h1 className="mt-6 text-3xl font-light">Goals Dashboard</h1>
              <p className="mt-2 text-sm opacity-60">Enter password to access your goals</p>
            </div>

            <form onSubmit={handleSubmit} className="mt-8 space-y-6">
              <div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className={`w-full rounded-lg border bg-transparent px-4 py-3 text-white placeholder-white/30 outline-none transition-all ${
                    error ? "border-red-500 focus:border-red-400" : "border-white/20 focus:border-white/40"
                  }`}
                  autoFocus
                />
                {error && <p className="mt-2 text-sm text-red-400">Incorrect password. Please try again.</p>}
              </div>

              <button
                type="submit"
                disabled={isAuthenticating}
                className="w-full rounded-lg border border-white/20 bg-white/10 py-3 font-light transition-all hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isAuthenticating ? "Authenticating..." : "Unlock Dashboard"}
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  return <GoalsDashboard />;
}

function GoalsPage() {
  return (
    <GoalsProvider>
      <GoalsPageContent />
    </GoalsProvider>
  );
}

export default api.withTRPC(GoalsPage);
