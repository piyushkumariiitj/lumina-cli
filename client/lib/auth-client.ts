import { createAuthClient } from "better-auth/react";
import { deviceAuthorizationClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
    baseURL: "http://localhost:3005", // Base URL of your auth server
    fetchOptions: {
        credentials: "include",
    },
    plugins: [
        deviceAuthorizationClient(),
    ]
});