"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Wordmark } from "@/components/brand/brand";
import { LoginForm } from "@/components/staff/login-form";
import { useProfile } from "@/lib/client/hooks";

function safeNext(value: string | null, role: string): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return role === "lead" ? "/lead" : "/orders";
}

function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const profile = useProfile();
  useEffect(() => {
    if (profile) router.replace(safeNext(params.get("next"), profile.role));
  }, [profile, params, router]);
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-4 sm:px-6">
          <Link href="/"><Wordmark /></Link>
          <Link href="/guest" className="nav-link">track my order</Link>
        </div>
      </header>
      <div className="bar">staff sign in</div>
      <div className="grid flex-1 lg:grid-cols-2">
        <div className="relative hidden min-h-[320px] lg:block">
          <img src="/brand/party.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
          <p className="absolute left-8 top-8 max-w-sm text-[1.75rem] font-bold leading-[1.05] tracking-[-0.05em] text-paper">the order system for the beans&amp;beats café at christmas together.</p>
        </div>
        <div className="flex items-start justify-center px-5 py-10 sm:items-center">
          <div className="w-full max-w-md">
            <h1 className="h-title text-[1.75rem]">sign in</h1>
            <p className="mt-2 text-sm text-mute">Use the staff account your booth lead gave you. The tablet remembers your role, so it keeps working if the Wi-Fi drops.</p>
            <div className="mt-6"><LoginForm onDone={next => router.replace(safeNext(params.get("next"), next.role))} /></div>
            <p className="mt-8 text-sm text-mute">Ordered a drink? You don&apos;t need an account. Scan the QR code at the counter to follow your order.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><Login /></Suspense>;
}
