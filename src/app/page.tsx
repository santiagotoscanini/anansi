"use client";

import { useState, type FormEvent } from "react";
import { GoalsProvider, useGoals } from "~/contexts/GoalsContext";
import { Lock } from "lucide-react";
import GoalsDashboard from "~/components/goals/GoalsDashboard";
import toast, { Toaster } from "react-hot-toast";
import { api } from "~/trpc/react";

function GoalsPageContent() {
  const { isAuthenticated, isLoading, authenticate } = useGoals();
  const [password, setPassword] = useState("");
  const [selectedUser, setSelectedUser] = useState("");
  const [error, setError] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Fetch available users
  const { data: users, isLoading: usersLoading } = api.auth.getUsers.useQuery();

  // Authentication handler
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsAuthenticating(true);

    if (!selectedUser) {
      toast.error("Please select a user");
      setIsAuthenticating(false);
      return;
    }

    const success = await authenticate(password, selectedUser);
    if (success) {
      toast.success(`Welcome to your Goals Dashboard, ${selectedUser}!`);
      setError(false);
    } else {
      setError(true);
      toast.error("Incorrect password or user not found");
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
          <div className="w-full max-w-md space-y-8">
            <div className="text-center">
              <Lock className="mx-auto h-12 w-12 opacity-50" />
              <h1 className="mt-6 text-3xl font-light">Goals Dashboard</h1>
              <p className="mt-2 text-sm opacity-60">Enter password to access your goals</p>
            </div>

            <form onSubmit={handleSubmit} className="mt-8 space-y-6">
              {/* User Selection */}
              <div>
                <label className="mb-2 block text-sm font-light text-white/70">Select User</label>
                {usersLoading ? (
                  <div className="w-full rounded-lg border border-white/20 bg-transparent px-4 py-3 text-white/50">
                    Loading users...
                  </div>
                ) : (
                  <select
                    value={selectedUser}
                    onChange={(e) => setSelectedUser(e.target.value)}
                    className="w-full rounded-lg border border-white/20 bg-black px-4 py-3 text-white outline-none transition-all focus:border-white/40"
                    required
                  >
                    <option value="">Choose a user...</option>
                    {users?.map((user) => (
                      <option key={user.id} value={user.name} className="bg-black text-white">
                        {user.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Password Input */}
              <div>
                <label className="mb-2 block text-sm font-light text-white/70">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className={`w-full rounded-lg border bg-transparent px-4 py-3 text-white placeholder-white/30 outline-none transition-all ${
                    error ? "border-red-500 focus:border-red-400" : "border-white/20 focus:border-white/40"
                  }`}
                  required
                />
                {error && (
                  <p className="mt-2 text-sm text-red-400">Incorrect password or user not found. Please try again.</p>
                )}
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
