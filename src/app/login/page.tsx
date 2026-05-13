"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { GoalsProvider, useGoals } from "~/contexts/GoalsContext";
import { LoginScreen } from "~/components/auth/AuthScreens";
import { Toaster } from "react-hot-toast";

function LoginPageInner() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useGoals();

  // If you're already logged in and land on /login, bounce to /app.
  // Cookie-based auth means a returning user just sees a flash of the
  // login form otherwise.
  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace("/app");
  }, [isAuthenticated, isLoading, router]);

  return (
    <>
      <Toaster position="top-right" />
      <LoginScreen onSwitchToRegister={() => router.push("/register")} onSuccess={() => router.push("/app")} />
    </>
  );
}

export default function LoginPage() {
  return (
    <GoalsProvider>
      <LoginPageInner />
    </GoalsProvider>
  );
}
