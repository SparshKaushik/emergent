import Elysia from "elysia";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import { account, session, user, verification } from "./db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user,
      session,
      verification,
      account,
    },
  }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  trustedOrigins: ["https://vibesync.dokploy.touchtech.club"],
});

export const authPlugin = new Elysia({ name: "better-auth" })
  .mount(auth.handler)
  .macro({
    auth: {
      async resolve({ error, request }) {
        const session = await auth.api.getSession({
          headers: request.headers,
        });

        if (!session) {
          return error(
            401,
            "Unauthorized: Session not found, invalid, or expired."
          );
        }

        return {
          user: session.user,
          session: session.session,
        };
      },
    },
  });
