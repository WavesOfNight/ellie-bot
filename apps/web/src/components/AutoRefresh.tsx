"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Recharge les données de la page à intervalle régulier (pages sans formulaire uniquement). */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}
