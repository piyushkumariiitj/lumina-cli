
"use client";
import { LoginForm } from "@/components/login-form";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useEffect, Suspense } from "react";

function SignInContent() {
  const { data, isPending } = authClient.useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  useEffect(() => {
    if (!isPending && data?.session && data?.user) {
      router.push(callbackUrl);
    }
  }, [isPending, data, router, callbackUrl]);

  if (isPending) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <Spinner />
      </div>
    );
  }

  return <LoginForm />;
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center h-screen">
          <Spinner />
        </div>
      }
    >
      <SignInContent />
    </Suspense>
  );
}