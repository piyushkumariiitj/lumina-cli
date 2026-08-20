import { createAuthClient } from "better-auth/react";
import { deviceAuthorizationClient } from "better-auth/client/plugins";

const getBaseUrl = () => {
    if (process.env.NEXT_PUBLIC_BETTER_AUTH_URL) {
        return process.env.NEXT_PUBLIC_BETTER_AUTH_URL.replace(/\/+$/, "");
    }
    if (process.env.NEXT_PUBLIC_SERVER_URL) {
        return process.env.NEXT_PUBLIC_SERVER_URL.replace(/\/+$/, "");
    }
    if (typeof window !== "undefined") {
        const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
        if (isLocalhost) {
            return "http://localhost:3005";
        }
    }
    return "https://lumina-cli.onrender.com";
};

export const authClient = createAuthClient({
    baseURL: getBaseUrl(),
    fetchOptions: {
        credentials: "include",
    },
    plugins: [
        deviceAuthorizationClient(),
    ]
});
