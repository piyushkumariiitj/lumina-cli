"use client";

import { authClient } from "@/lib/auth-client";
import type React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import { ShieldAlert, LogIn, ArrowRight } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

function DeviceAuthorizationForm() {
    const searchParams = useSearchParams();
    const initialCode = searchParams.get("user_code") || "";
    const [userCode, setUserCode] = useState(initialCode);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const { data: session, isPending: isSessionPending } = authClient.useSession();
    const router = useRouter();

    // Automatically redirect to approve page if user is logged in and code is provided in URL
    useEffect(() => {
        if (!isSessionPending && session && initialCode) {
            router.replace(`/approve?user_code=${encodeURIComponent(initialCode)}`);
        }
    }, [initialCode, session, isSessionPending, router]);

    useEffect(() => {
        if (initialCode) {
            let formatted = initialCode.toUpperCase().replace(/[^A-Z0-9]/g, "");
            if (formatted.length > 4 && !formatted.includes("-")) {
                formatted = formatted.slice(0, 4) + "-" + formatted.slice(4, 8);
            }
            setUserCode(formatted);
        }
    }, [initialCode]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        try {
            const formattedCode = userCode.trim().replace(/-/g, "").toUpperCase();
            if (!formattedCode || formattedCode.length < 8) {
                setError("Please enter a valid 8-character device code.");
                return;
            }

            const formattedWithHyphen = formattedCode.length === 8 
                ? `${formattedCode.slice(0, 4)}-${formattedCode.slice(4, 8)}`
                : formattedCode;

            // Redirect to approve page with user_code
            router.push(`/approve?user_code=${encodeURIComponent(formattedWithHyphen)}`);
        } catch (err: any) {
            setError(err?.message || "An unexpected error occurred.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (value.length > 4) {
            value = value.slice(0, 4) + "-" + value.slice(4, 8);
        }
        setUserCode(value);
    };

    if (isSessionPending) {
        return (
            <div className="flex justify-center items-center p-8 text-muted-foreground">
                <Spinner className="mr-2 h-5 w-5" />
                Loading session...
            </div>
        );
    }

    if (!session) {
        const callbackPath = initialCode ? `/approve?user_code=${encodeURIComponent(initialCode)}` : "/device";
        return (
            <div className="border-2 border-dashed border-zinc-700 rounded-xl p-8 bg-zinc-950 backdrop-blur-sm text-center space-y-6">
                <div className="p-3 rounded-lg border-2 border-dashed border-zinc-700 w-fit mx-auto">
                    <LogIn className="w-8 h-8 text-indigo-400" />
                </div>
                <div>
                    <h2 className="text-xl font-semibold text-foreground mb-2">Sign in Required</h2>
                    <p className="text-sm text-muted-foreground">You must be logged in to approve a CLI device authorization request.</p>
                </div>
                <button
                    type="button"
                    onClick={() => router.push(`/sign-in?callbackUrl=${encodeURIComponent(callbackPath)}`)}
                    className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                    <span>Sign In to Continue</span>
                    <ArrowRight className="w-4 h-4" />
                </button>
            </div>
        );
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="border-2 border-dashed border-zinc-700 rounded-xl p-8 bg-zinc-950 backdrop-blur-sm"
        >
            <div className="space-y-6">
                {/* User Session Info */}
                <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg flex items-center justify-between text-xs">
                    <span className="text-zinc-400">Signed in as:</span>
                    <span className="font-medium text-indigo-300">{session.user.email || session.user.name}</span>
                </div>

                {/* Code Input */}
                <div>
                    <label htmlFor="code" className="block text-sm font-medium text-foreground mb-2">
                        Device Code
                    </label>
                    <input
                        id="code"
                        type="text"
                        value={userCode}
                        onChange={handleCodeChange}
                        placeholder="XXXX-XXXX"
                        maxLength={9}
                        className="w-full px-4 py-3 bg-zinc-900 border-2 border-dashed border-zinc-700 rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-zinc-600 font-mono text-center text-lg tracking-widest"
                    />
                    <p className="text-xs text-muted-foreground mt-2">Find this code on the device CLI terminal</p>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="p-3 rounded-lg bg-red-950 border border-red-900 text-red-200 text-sm">{error}</div>
                )}

                {/* Submit Button */}
                <button
                    type="submit"
                    disabled={isLoading || userCode.length < 8}
                    className="w-full py-3 px-4 bg-zinc-100 text-zinc-950 font-semibold rounded-lg hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    {isLoading ? "Continuing..." : "Continue to Approval"}
                </button>

                {/* Info Box */}
                <div className="p-4 bg-zinc-900 border-2 border-dashed border-zinc-700 rounded-lg">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        This code is unique to your device and will expire shortly. Keep it confidential and never share it with anyone.
                    </p>
                </div>
            </div>
        </form>
    );
}

export default function DeviceAuthorizationPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4">
            <div className="w-full max-w-md">
                {/* Header Section */}
                <div className="flex flex-col items-center gap-4 mb-8">
                    <div className="p-3 rounded-lg border-2 border-dashed border-zinc-700">
                        <ShieldAlert className="w-8 h-8 text-yellow-300" />
                    </div>
                    <div className="text-center">
                        <h1 className="text-3xl font-bold text-foreground mb-2">Device Authorization</h1>
                        <p className="text-muted-foreground">Enter your device code to continue</p>
                    </div>
                </div>

                <Suspense fallback={<div className="text-center text-muted-foreground">Loading...</div>}>
                    <DeviceAuthorizationForm />
                </Suspense>
            </div>
        </div>
    );
}