import { createAuthClient } from "better-auth/react";
import {deviceAuthorizationClient} from 'better-auth/client/plugins'
export const authClient = createAuthClient({
    baseURL: process.env.NEXT_PUBLIC_AUTH_URL || "/api/auth",
    plugins:[
        deviceAuthorizationClient()
    ]
})