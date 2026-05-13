"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { GoalsProvider, useGoals } from "~/contexts/GoalsContext";
import GoalsDashboard from "~/components/goals/GoalsDashboard";
import { AnansiMark } from "~/components/goals/Brand";

function AppPageInner() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useGoals();

  // Auth guard — bounce unauthenticated visitors to the login screen.
  // Done client-side because the auth cookie is HttpOnly; we don't have
  // a server-side session check wired into route middleware yet.
  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/login");
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <main
        className="flex min-h-screen items-center justify-center"
        style={{ background: "var(--paper-deep)", color: "var(--ink)" }}
      >
        <div style={{ textAlign: "center" }}>
          <AnansiMark size={56} className="mx-auto" />
          <p
            className="mt-6"
            style={{ fontFamily: "var(--font-text)", fontStyle: "italic", fontSize: 14, color: "var(--ink-3)" }}
          >
            Looking for your threads…
          </p>
        </div>
      </main>
    );
  }

  return <GoalsDashboard />;
}

export default function AppPage() {
  return (
    <GoalsProvider>
      <AppPageInner />
    </GoalsProvider>
  );
}
