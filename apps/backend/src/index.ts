import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";

import { auth, authPlugin } from "../lib/auth";
import { quizRoutes } from "./api/quiz";
import { webSocketHandler } from "./ws";

const app = new Elysia()
  .use(
    cors({
      origin: "https://vibesync.dokploy.touchtech.club",
    })
  )
  .use(swagger())
  .use(authPlugin)
  .use(quizRoutes)
  .get("/", () => "Hello World")
  .use(webSocketHandler)
  .listen(3001);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
