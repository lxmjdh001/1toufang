"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getAccessToken } from "../lib/api";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(getAccessToken() ? "/dashboard" : "/login");
  }, [router]);

  return (
    <main className="admin-loading">
      <div className="brand">WzzAds</div>
      <p>正在进入系统...</p>
    </main>
  );
}
