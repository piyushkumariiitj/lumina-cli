"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import { useState, Suspense } from "react";

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrlParam = searchParams.get("callbackUrl");
  const currentOrigin = typeof window !== "undefined" && window.location.origin
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");

  const targetCallback = callbackUrlParam 
    ? (callbackUrlParam.startsWith("http") ? callbackUrlParam : `${currentOrigin}${callbackUrlParam}`)
    : currentOrigin;

  const [isLoading, setIsLoading] = useState(false);

  const onLogin = async () => {
    setIsLoading(true);
    await authClient.signIn.social({
      provider: "github",
      callbackURL: targetCallback,
    });
    setIsLoading(false);
  };

  return (
    <div className="flex flex-col gap-6 justify-center items-center ">
      <div className="flex flex-col items-center justify-center space-y-4">
        <Image src={"/login.svg"} alt="Login" height={500} width={500} priority />
        <h1 className="text-6xl font-extrabold text-indigo-400">Welcome Back! to Lumina CLI</h1>
        <p className="text-base font-medium text-zinc-400">Login to your account for allowing device flow</p>
      </div>
      <Card className="border-dashed border-2">
        <CardContent>
          <div className="grid gap-6 pt-6">
            <div className="flex flex-col gap-4">
              <Button
                variant={"outline"}
                className="w-full h-full py-3"
                type="button"
                disabled={isLoading}
                onClick={onLogin}
              >
                <Image src={"/github.svg"} alt="Github" height={16} width={16} className="size-4 dark:invert mr-2" />
                {isLoading ? "Redirecting..." : "Continue With GitHub"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function LoginForm() {
  return (
    <Suspense fallback={<div>Loading login...</div>}>
      <LoginFormContent />
    </Suspense>
  );
}