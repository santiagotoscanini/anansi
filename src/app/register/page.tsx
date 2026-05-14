"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { GoalsProvider, useGoals } from "~/contexts/GoalsContext";
import { RegisterScreen } from "~/components/auth/AuthScreens";
import { Toaster } from "react-hot-toast";
import LegalFooter from "~/components/LegalFooter";

function RegisterPageInner() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useGoals();

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace("/app");
  }, [isAuthenticated, isLoading, router]);

  return (
    <>
      <Toaster position="top-right" />
      <RegisterScreen onSwitchToLogin={() => router.push("/login")} onSuccess={() => router.push("/app")} />
      <LegalFooter />
    </>
  );
}

export default function RegisterPage() {
  return (
    <GoalsProvider>
      <RegisterPageInner />
    </GoalsProvider>
  );
}
