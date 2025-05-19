import { Elysia, t, type Static } from "elysia";
import { auth } from "../../lib/auth";
import {
  user as userTableSchema,
  quizzes as quizzesTableSchema,
  userResponses as userResponsesTableSchema,
  answers as answersTableSchema,
} from "../../lib/db/schema"; // Explicitly alias schema imports
import { db } from "../../lib/db";
import { eq, and, sql } from "drizzle-orm"; // Import sql tag
import { type UserResponseData } from "../api/quiz"; // This type will have the new fields
// import type { ServerWebSocket } from "bun"; // Avoid direct bun import for ws type if causing conflict

// Infer user type from Drizzle schema
type ActualUserType = typeof userTableSchema.$inferSelect;

// Define the expected structure for incoming WebSocket messages
const webSocketMessageSchema = t.Object({
  event: t.String(),
  payload: t.Any(),
});
type WebSocketMessageFormat = Static<typeof webSocketMessageSchema>;

// This is the type for the object we place into Elysia's `store`
interface CustomSocketDataStore {
  user: ActualUserType;
}

// This represents the fuller structure of ws.data, which includes what Elysia adds
// and our custom `store` object.
interface ElysiaWSContext {
  store: CustomSocketDataStore;
  query: Record<string, string | undefined>;
  params: Record<string, string | undefined>;
  headers: Record<string, string | undefined>;
  // ... any other properties Elysia adds to ws.data
}

// Using a more generic type for what we store in activeConnections
// to avoid conflicts with Elysia's specific WebSocket instance type.
interface StoredWebSocket {
  id: string; // Connection ID
  data: ElysiaWSContext; // Context data, now typed correctly
  send: (message: string | object) => any; // Method to send messages
  close: (code?: number, reason?: string) => any; // Method to close
}

// In-memory store for active WebSocket connections: Map<userId, StoredWebSocket>
export const activeConnections = new Map<string, StoredWebSocket>();

// Type for individual message handlers
// 'ws' param will be inferred by Elysia in the handlers.
// ws.data will be ElysiaWSContext
type MessageHandler = (
  ws: { data: ElysiaWSContext; id: string; send: Function; close: Function },
  payload: any
) => void | Promise<void>;

const messageHandlers: Record<string, MessageHandler> = {};

/**
 * Registers a handler for a specific WebSocket event name.
 * @param eventName The name of the event to handle.
 * @param handler The function to execute when the event is received.
 */
export function registerWsHandler(eventName: string, handler: MessageHandler) {
  if (messageHandlers[eventName]) {
    console.warn(
      `WS: WebSocket handler for event "${eventName}" is being overwritten.`
    );
  }
  messageHandlers[eventName] = handler;
  console.log(`WS: Registered WebSocket handler for event: ${eventName}`);
}

/**
 * Broadcasts a message to a specific user if they have an active WebSocket connection.
 * @param userId The ID of the user to send the message to.
 * @param message The message object to send. It will be JSON.stringified.
 * @returns True if the message was sent, false otherwise.
 */
export function broadcastToUser(userId: string, message: object): boolean {
  const wsConnection = activeConnections.get(userId);
  if (wsConnection) {
    try {
      const messageToSend =
        typeof message === "string" ? message : JSON.stringify(message);
      wsConnection.send(messageToSend);
      console.log(
        `WS: Broadcasted message to user ${userId}: ${messageToSend}`
      );
      return true;
    } catch (e) {
      console.error(
        `WS: Error sending message to user ${userId} via stored connection:`,
        e
      );
      return false;
    }
  }
  console.log(
    `WS: User ${userId} not found in activeConnections for broadcasting.`
  );
  return false;
}

// Example PING handler for testing
registerWsHandler("PING", (ws, payload) => {
  const currentUser = ws.data.store.user; // Correct access
  if (!currentUser) {
    console.warn("WS PING: User data missing in ws.data.store");
    return;
  }
  console.log(
    `WS: Received PING from ${currentUser.id} (Socket: ${ws.id}) with payload:`,
    payload
  );
  ws.send(
    JSON.stringify({
      event: "PONG",
      payload: {
        message: "Pong back to you!",
        receivedPayload: payload,
        userId: currentUser.id,
        timestamp: Date.now(),
      },
    })
  );
});

// Handler for fetching quiz responses
async function handleGetQuizResponses(
  ws: { data: ElysiaWSContext; id: string; send: Function; close: Function },
  payload: any
) {
  const currentUser = ws.data.store.user; // Corrected access
  const quizId = payload?.quizId;

  if (!currentUser) {
    ws.send(
      JSON.stringify({
        event: "QUIZ_RESPONSES_ERROR",
        payload: {
          quizId,
          message: "Authentication error: User context not found.",
        },
      })
    );
    return;
  }

  if (!quizId || typeof quizId !== "string") {
    ws.send(
      JSON.stringify({
        event: "QUIZ_RESPONSES_ERROR",
        payload: { quizId, message: "Invalid or missing quizId provided." },
      })
    );
    return;
  }

  try {
    // Authorization: Check if the current user is the creator of the quiz
    // Note: The HTTP endpoint was changed to allow any authenticated user to see responses.
    // For consistency, or if WS should maintain creator-only, this logic might differ.
    // Assuming for now, WS also allows any authenticated user if the quiz is valid.
    const quizQueryResult = await db
      .select({ id: quizzesTableSchema.id })
      .from(quizzesTableSchema)
      .where(eq(quizzesTableSchema.id, quizId))
      .limit(1);

    if (quizQueryResult.length === 0) {
      ws.send(
        JSON.stringify({
          event: "QUIZ_RESPONSES_ERROR",
          payload: {
            quizId,
            message: "Quiz not found.", // Simplified message
          },
        })
      );
      return;
    }

    // Fetch responses if authorized - using raw SQL similar to HTTP endpoint
    const query = sql`
      SELECT
        ur.user_id AS "userId",
        u.name AS "userName",
        ur.submitted_at AS "submittedAt",
        a.vibe_label AS "vibeLabel"
      FROM ${userResponsesTableSchema} ur
      JOIN ${userTableSchema} u ON ur.user_id = u.id
      JOIN ${answersTableSchema} a ON ur.selected_answer_id = a.id
      WHERE ur.quiz_id = ${quizId}
      ORDER BY ur.user_id, ur.submitted_at;
    `;

    const result = await db.execute(query);
    const rawUserAnswers = result.rows as Array<{
      userId: string;
      userName: string | null;
      submittedAt: Date;
      vibeLabel: string;
    }>;

    const userProfilesMap = new Map<string, UserResponseData>();

    for (const userAnswer of rawUserAnswers) {
      if (!userProfilesMap.has(userAnswer.userId)) {
        userProfilesMap.set(userAnswer.userId, {
          id: userAnswer.userId,
          userId: userAnswer.userId,
          userName: userAnswer.userName,
          submittedAt: userAnswer.submittedAt,
          vibeDistribution: {},
          totalAnswers: 0,
        });
      }
      const profile = userProfilesMap.get(userAnswer.userId)!;
      profile.vibeDistribution[userAnswer.vibeLabel] =
        (profile.vibeDistribution[userAnswer.vibeLabel] || 0) + 1;
      profile.totalAnswers += 1;

      if (new Date(userAnswer.submittedAt) > new Date(profile.submittedAt)) {
        profile.submittedAt = userAnswer.submittedAt;
      }
    }

    ws.send(
      JSON.stringify({
        event: "QUIZ_RESPONSES_DATA",
        payload: { quizId, responses: Array.from(userProfilesMap.values()) },
      })
    );
  } catch (error) {
    console.error(
      `WS: Error in handleGetQuizResponses for quiz ${quizId}, user ${currentUser.id}:`,
      error
    );
    ws.send(
      JSON.stringify({
        event: "QUIZ_RESPONSES_ERROR",
        payload: {
          quizId,
          message: "An error occurred while fetching quiz responses.",
        },
      })
    );
  }
}

registerWsHandler("GET_QUIZ_RESPONSES", handleGetQuizResponses);

export const webSocketHandler = new Elysia({
  name: "websocket-handler",
  prefix: "/ws",
}).ws("/", {
  body: webSocketMessageSchema,

  beforeHandle({ request, error, store }) {
    // store here is initially an empty object from Elysia
    const session = auth.api.getSession({ headers: request.headers });
    // This is an async operation, so we need to await it.
    return session
      .then((s) => {
        if (!s || !s.user) {
          console.log("WS Auth: Unauthorized - No session or user.");
          return error(401, "Unauthorized");
        }
        console.log(`WS Auth: User ${s.user.id} attempting to connect.`);
        // Explicitly type what we are putting into the store.
        // `store` object itself is augmented by Elysia, ws.data will contain this store.
        (store as CustomSocketDataStore).user = s.user as ActualUserType;
      })
      .catch((err) => {
        console.error("WS Auth: Error during getSession", err);
        return error(500, "Authentication error");
      });
  },

  open(ws) {
    // ws.data is typed as ElysiaWSContext by Elysia due to how store is handled and what it adds.
    // Or, we can cast ws.data here if needed, but ideally Elysia infers it.
    const typedWsData = ws.data as ElysiaWSContext;
    const user = typedWsData.store.user; // Corrected access
    const id = ws.id;

    console.log("WS Open: ws.data.store.user", user);

    if (!user || !user.id) {
      console.error(
        "WS Open: User data not found or incomplete in ws.data.store. Closing connection."
      );
      ws.close(1008, "Authentication context error");
      return;
    }

    if (activeConnections.has(user.id)) {
      console.warn(
        `WS Open: User ${user.id} already has an active connection. Closing old one.`
      );
      const oldWs = activeConnections.get(user.id);
      try {
        oldWs?.close(1000, "New connection by same user");
      } catch (e) {
        /* ignore */
      }
    }

    const storedConn: StoredWebSocket = {
      id: id,
      data: typedWsData, // Store the fully typed ws.data
      send: (msgToSend) => ws.send(msgToSend),
      close: (code, reason) => ws.close(code, reason),
    };
    activeConnections.set(user.id, storedConn);
    console.log(
      `WS Open: User ${user.id} connected. Socket ID: ${id}. Total active: ${activeConnections.size}`
    );

    ws.send(
      JSON.stringify({
        event: "CONNECTED",
        payload: { userId: user.id, message: "Welcome!" },
      })
    );
  },

  message(ws, receivedMessage) {
    const typedWsData = ws.data;
    const user = typedWsData.store.user; // Corrected access
    const id = ws.id;

    if (!user || !user.id) {
      console.warn(
        `WS Message: Received message from connection without full user context. Socket ID: ${id}`
      );
      ws.send(
        JSON.stringify({
          event: "ERROR",
          payload: { error: "User context missing, please reconnect." },
        })
      );
      return;
    }

    console.log(
      `WS Msg: From ${user.id} (Socket: ${id}): ${JSON.stringify(receivedMessage)}`
    );

    const handler = messageHandlers[receivedMessage.event];
    if (handler) {
      try {
        const handlerWsArg = {
          data: typedWsData, // Pass the correctly typed ws.data
          id,
          send: ws.send,
          close: ws.close,
        };
        const result = handler(handlerWsArg, receivedMessage.payload);
        if (result instanceof Promise) {
          result.catch((err) => {
            console.error(
              `WS Msg Err (Async): Evt "${receivedMessage.event}" (User ${user.id}):`,
              err
            );
            ws.send(
              JSON.stringify({
                event: "ERROR",
                payload: {
                  evt: receivedMessage.event,
                  err: "Async handler execution failed",
                },
              })
            );
          });
        }
      } catch (e) {
        console.error(
          `WS Msg Err (Sync): Evt "${receivedMessage.event}" (User ${user.id}):`,
          e
        );
        ws.send(
          JSON.stringify({
            event: "ERROR",
            payload: {
              evt: receivedMessage.event,
              err: "Sync handler execution failed",
            },
          })
        );
      }
    } else {
      console.warn(
        `WS Message: No handler for event "${receivedMessage.event}" from user ${user.id}`
      );
      ws.send(
        JSON.stringify({
          event: "ERROR",
          payload: { error: `Unknown event: ${receivedMessage.event}` },
        })
      );
    }
  },

  close(ws, code, reasonMessage) {
    const typedWsData = ws.data as ElysiaWSContext;
    const user = typedWsData.store.user; // Corrected access
    const id = ws.id;
    const reason = reasonMessage
      ? Buffer.from(reasonMessage).toString()
      : "No reason specified";

    if (user && user.id) {
      const storedConn = activeConnections.get(user.id);
      if (storedConn && storedConn.id === id) {
        activeConnections.delete(user.id);
        console.log(
          `WS Close: User ${user.id} (Socket: ${id}) disconnected. Code: ${code}, Reason: "${reason}". Total active: ${activeConnections.size}`
        );
      } else {
        console.log(
          `WS Close: Stale/alternative socket closed for user ${user.id} (Socket: ${id}). Code: ${code}, Reason: "${reason}". Total active: ${activeConnections.size}`
        );
      }
    } else {
      console.log(
        `WS Close: Socket (ID: ${id}) disconnected without full user association. Code: ${code}, Reason: "${reason}". Total active: ${activeConnections.size}`
      );
    }
  },

  drain(ws) {
    const typedWsData = ws.data as ElysiaWSContext;
    const user = typedWsData.store.user; // Corrected access
    console.log(
      `WS Drain: Socket for ${user?.id || "unknown user"} (ID: ${ws.id}) is ready for more data.`
    );
  },
});
