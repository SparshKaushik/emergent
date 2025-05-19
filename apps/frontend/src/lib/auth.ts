import { createAuthClient } from "better-auth/react";

export const { useSession, signIn, signOut, getSession } = createAuthClient({
  baseURL:
    import.meta.env.API_URL || "https://vibesyncapi.dokploy.touchtech.club",
});
