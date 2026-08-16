"use client";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import { CheckCircle, XCircle, Smartphone, ShieldCheck, ShieldAlert, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

function DeviceApprovalContent() {
    const { data, isPending: isSessionPending } = authClient.useSession();
    const router = useRouter();
    const searchParams = useSearchParams();
    const userCode = searchParams.get("user_code");

    const [isVerifying, setIsVerifying] = useState(true);
    const [codeError, setCodeError] = useState<string | null>(null);
    const [authStatus, setAuthStatus] = useState<"pending" | "approved" | "denied">("pending");
    const [isProcessing, setIsProcessing] = useState({
        approve: false,
        deny: false,
    });

    // Handle session redirect
    useEffect(() => {
        if (!isSessionPending && (!data?.session || !data?.user)) {
            const callbackPath = userCode ? `/approve?user_code=${encodeURIComponent(userCode)}` : "/approve";
            router.push(`/sign-in?callbackUrl=${encodeURIComponent(callbackPath)}`);
        }
    }, [isSessionPending, data, router, userCode]);

    // Handle missing user_code
    useEffect(() => {
        if (!isSessionPending && data?.session && !userCode) {
            router.push("/device");
        }
    }, [isSessionPending, data, userCode, router]);

    // Verify and claim user_code on load
    useEffect(() => {
        const verifyCode = async () => {
            if (!userCode || !data?.session) return;
            setIsVerifying(true);
            setCodeError(null);

            try {
                const formattedCode = userCode.trim().replace(/-/g, "").toUpperCase();
                const res = await authClient.device({
                    query: { user_code: formattedCode },
                });

                if (res.error) {
                    const errorMsg = res.error.error_description || (res.error as any).message || "Invalid or expired authorization code";
                    setCodeError(errorMsg);
                } else if (res.data?.status) {
                    if (res.data.status === "approved") {
                        setAuthStatus("approved");
                    } else if (res.data.status === "denied") {
                        setAuthStatus("denied");
                    }
                }
            } catch (err: any) {
                setCodeError(err?.message || "Failed to verify device code.");
            } finally {
                setIsVerifying(false);
            }
        };

        if (!isSessionPending && data?.session && userCode) {
            verifyCode();
        }
    }, [userCode, data, isSessionPending]);

    const handleApprove = async () => {
        if (!userCode) return;
        setIsProcessing({ approve: true, deny: false });

        try {
            toast.loading("Approving device...", { id: "approval-toast" });
            const formattedCode = userCode.trim().replace(/-/g, "").toUpperCase();

            const res = await authClient.device.approve({
                userCode: formattedCode,
            });

            toast.dismiss("approval-toast");

            if (res.error) {
                toast.error(res.error.error_description || (res.error as any).message || "Failed to approve device");
            } else {
                toast.success("Device approved successfully!");
                setAuthStatus("approved");
            }
        } catch (error: any) {
            toast.dismiss("approval-toast");
            toast.error(error?.message || "Something went wrong while approving device");
        } finally {
            setIsProcessing({ approve: false, deny: false });
        }
    };

    const handleDeny = async () => {
        if (!userCode) return;
        setIsProcessing({ approve: false, deny: true });

        try {
            toast.loading("Denying device request...", { id: "deny-toast" });
            const formattedCode = userCode.trim().replace(/-/g, "").toUpperCase();

            const res = await authClient.device.deny({
                userCode: formattedCode,
            });

            toast.dismiss("deny-toast");

            if (res.error) {
                toast.error(res.error.error_description || (res.error as any).message || "Failed to deny device");
            } else {
                toast.info("Device authorization denied");
                setAuthStatus("denied");
            }
        } catch (error: any) {
            toast.dismiss("deny-toast");
            toast.error(error?.message || "Something went wrong while denying device");
        } finally {
            setIsProcessing({ approve: false, deny: false });
        }
    };

    if (isSessionPending || (isVerifying && !codeError && authStatus === "pending")) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-background">
                <Spinner className="w-8 h-8 mb-4" />
                <p className="text-sm text-zinc-400">Verifying authorization request...</p>
            </div>
        );
    }

    if (!data?.session && !data?.user) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-background">
                <Spinner className="w-8 h-8 mb-4" />
                <p className="text-sm text-zinc-400">Redirecting to sign in...</p>
            </div>
        );
    }

    // Success State
    if (authStatus === "approved") {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background font-sans p-4">
                <div className="w-full max-w-md border-2 border-dashed border-emerald-500/40 rounded-2xl p-8 bg-zinc-900/60 backdrop-blur-sm text-center space-y-6">
                    <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-emerald-500/50 bg-emerald-500/10 flex items-center justify-center mx-auto">
                        <ShieldCheck className="w-10 h-10 text-emerald-400" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-2xl font-bold text-zinc-50">Device Authorized!</h2>
                        <p className="text-sm text-zinc-400">
                            Your device CLI has been successfully authenticated. You can safely close this browser window and return to your terminal.
                        </p>
                    </div>
                    <Button
                        onClick={() => router.push("/")}
                        className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                    >
                        Go to Home
                    </Button>
                </div>
            </div>
        );
    }

    // Denied State
    if (authStatus === "denied") {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background font-sans p-4">
                <div className="w-full max-w-md border-2 border-dashed border-red-500/40 rounded-2xl p-8 bg-zinc-900/60 backdrop-blur-sm text-center space-y-6">
                    <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-red-500/50 bg-red-500/10 flex items-center justify-center mx-auto">
                        <XCircle className="w-10 h-10 text-red-400" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-2xl font-bold text-zinc-50">Authorization Denied</h2>
                        <p className="text-sm text-zinc-400">
                            You have denied authorization for this device. The terminal request has been rejected.
                        </p>
                    </div>
                    <Button
                        onClick={() => router.push("/")}
                        className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                    >
                        Go to Home
                    </Button>
                </div>
            </div>
        );
    }

    // Code Error State
    if (codeError) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background font-sans p-4">
                <div className="w-full max-w-md border-2 border-dashed border-amber-500/40 rounded-2xl p-8 bg-zinc-900/60 backdrop-blur-sm text-center space-y-6">
                    <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-amber-500/50 bg-amber-500/10 flex items-center justify-center mx-auto">
                        <ShieldAlert className="w-10 h-10 text-amber-400" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-2xl font-bold text-zinc-50">Invalid Request</h2>
                        <p className="text-sm text-zinc-400">{codeError}</p>
                    </div>
                    <Button
                        onClick={() => router.push("/device")}
                        className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 flex items-center justify-center gap-2"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        <span>Enter Code Manually</span>
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-background font-sans p-4">
            <div className="w-full max-w-md">
                <div className="space-y-6">
                    {/* Header Card */}
                    <div className="border-2 border-dashed border-zinc-700 rounded-2xl p-8 bg-zinc-900/50 backdrop-blur-sm text-center space-y-6">
                        {/* Device Icon */}
                        <div className="flex justify-center">
                            <div className="relative">
                                <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-zinc-600 bg-zinc-800 flex items-center justify-center">
                                    <Smartphone className="w-10 h-10 text-cyan-400" />
                                </div>
                                <div className="absolute -top-1 -right-1 w-7 h-7 bg-orange-500 rounded-full border-2 border-zinc-900 flex items-center justify-center">
                                    <span className="text-xs text-white font-bold">!</span>
                                </div>
                            </div>
                        </div>

                        {/* Title and Description */}
                        <div className="space-y-2">
                            <h1 className="text-2xl font-bold text-zinc-50">
                                Device Authorization
                            </h1>
                            <p className="text-sm text-zinc-400">
                                A new CLI device is requesting access to your account
                            </p>
                        </div>

                        {/* Device Code Display Card */}
                        <div className="border border-zinc-800 rounded-xl p-4 bg-zinc-950/80 space-y-2 text-left">
                            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide text-center">
                                Authorization Code
                            </p>
                            <div className="bg-zinc-900 rounded-lg p-3 border border-zinc-800">
                                <p className="text-2xl font-mono font-bold text-cyan-400 text-center tracking-widest">
                                    {userCode || "----"}
                                </p>
                            </div>
                        </div>

                        {/* Security Info Card */}
                        <div className="space-y-2 text-left bg-zinc-950/60 p-4 rounded-xl border border-zinc-800">
                            <p className="text-xs font-semibold text-zinc-400">
                                Account: <span className="text-indigo-300 font-medium">{data?.user?.email}</span>
                            </p>
                            <p className="text-xs text-zinc-500 leading-relaxed">
                                Only approve this request if you initiated it from your terminal CLI.
                            </p>
                        </div>

                        {/* Action Buttons */}
                        <div className="space-y-3 pt-2">
                            <Button
                                onClick={handleApprove}
                                disabled={isProcessing.approve || isProcessing.deny}
                                className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                                {isProcessing.approve ? (
                                    <>
                                        <Spinner className="w-4 h-4" />
                                        <span>Approving...</span>
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle className="w-5 h-5" />
                                        <span>Approve Device</span>
                                    </>
                                )}
                            </Button>

                            <Button
                                onClick={handleDeny}
                                disabled={isProcessing.approve || isProcessing.deny}
                                className="w-full h-11 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                                {isProcessing.deny ? (
                                    <>
                                        <Spinner className="w-4 h-4" />
                                        <span>Denying...</span>
                                    </>
                                ) : (
                                    <>
                                        <XCircle className="w-5 h-5" />
                                        <span>Deny Device</span>
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function DeviceApprovalPage() {
    return (
        <Suspense fallback={
            <div className="flex flex-col items-center justify-center min-h-screen bg-background">
                <Spinner className="w-8 h-8 mb-4" />
                <p className="text-sm text-zinc-400">Loading device approval...</p>
            </div>
        }>
            <DeviceApprovalContent />
        </Suspense>
    );
}