import React, { useEffect, useState, useRef, useMemo } from "react";
import { useSession } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  WifiIcon,
  WifiOffIcon,
  AlertCircle as WsAlertIcon,
  AlertCircle as AlertCircleIcon,
} from "lucide-react";
import {
  calculateVibePercentages,
  getDominantVibe,
} from "@/lib/VibeDisplayUtils";
import { FinalVibeBadge } from "@/components/quiz/FinalVibeBadge";
import { VibeBreakdownBar } from "@/components/quiz/VibeBreakdownBar";
import type {
  LiveUserResponse,
  WebSocketStatus,
  QuizDetailsFromAPI,
} from "./types";

const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 5000;

interface QuizResponsesTabProps {
  quizId: string;
  quizDetails: QuizDetailsFromAPI | undefined;
}

export function QuizResponsesTab({
  quizId,
  quizDetails,
}: QuizResponsesTabProps) {
  const { data: sessionData } = useSession();
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [wsStatus, setWsStatus] = useState<WebSocketStatus>("Closed");
  const [wsUserResponses, setWsUserResponses] = useState<LiveUserResponse[]>(
    []
  );
  const [wsError, setWsError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isManualRetryVisible, setIsManualRetryVisible] = useState(false);

  const connectWebSocket = (currentQuizId: string, session: any) => {
    if (!currentQuizId || !session) {
      setWsStatus("Closed");
      return;
    }

    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
    const WS_URL = API_URL.replace(/^http/, "ws") + "/ws";

    setWsStatus("Connecting");
    setWsError(null);

    const socket = new WebSocket(WS_URL);
    wsRef.current = socket;
    setWs(socket);

    socket.onopen = () => {
      setWsStatus("Open");
      setWsError(null);
      setRetryCount(0);
      setIsManualRetryVisible(false);

      if (socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            event: "AUTHENTICATE",
            payload: { token: session.token },
          })
        );
        socket.send(
          JSON.stringify({
            event: "GET_QUIZ_RESPONSES",
            payload: { quizId: currentQuizId },
          })
        );
      }
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string);

        if (message.event === "QUIZ_RESPONSES_DATA") {
          setWsUserResponses(message.payload.responses as LiveUserResponse[]);
          setWsError(null);
        } else if (message.event === "NEW_QUIZ_RESPONSE") {
          if (message.payload.quizId === currentQuizId) {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(
                JSON.stringify({
                  event: "GET_QUIZ_RESPONSES",
                  payload: { quizId: currentQuizId },
                })
              );
            }
          }
        } else if (message.event === "QUIZ_RESPONSES_ERROR") {
          setWsError(`Server error (Responses): ${message.payload.message}`);
        } else if (
          message.event === "CONNECTED" ||
          message.event === "AUTHENTICATED"
        ) {
          // Handled by onopen or subsequent messages
        } else if (
          message.event === "ERROR" ||
          message.event === "AUTH_ERROR"
        ) {
          setWsError(
            `Server error: ${message.payload.error || "Unknown error"}`
          );
          if (
            message.event === "AUTH_ERROR" &&
            wsRef.current &&
            wsRef.current.readyState === WebSocket.OPEN
          ) {
            wsRef.current.close(1008, "Authentication failed");
          }
        }
      } catch (e) {
        setWsError("Failed to process message from server.");
      }
    };

    socket.onerror = () => {
      setWsStatus("Error");
      setWsError("WebSocket connection error. See console for details.");
    };

    socket.onclose = (closeEvent) => {
      setWsStatus("Closed");
      setWs(null);

      if (closeEvent.code !== 1008 && retryCount < MAX_RETRIES) {
        const nextRetryCount = retryCount + 1;
        setRetryCount(nextRetryCount);
        retryTimerRef.current = setTimeout(() => {
          connectWebSocket(currentQuizId, session);
        }, RETRY_DELAY_MS) as unknown as number;
      } else {
        setIsManualRetryVisible(true);
      }

      if (wsRef.current === socket) {
        wsRef.current = null;
      }
    };
  };

  const handleManualRetry = () => {
    setRetryCount(0);
    setIsManualRetryVisible(false);
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    connectWebSocket(quizId, sessionData?.session);
  };

  useEffect(() => {
    connectWebSocket(quizId, sessionData?.session);

    return () => {
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (wsRef.current) {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.close(1001, "Component unmounting");
        }
        wsRef.current = null;
      }
      setWs(null);
      setWsStatus("Closed");
    };
  }, [quizId, sessionData]);

  const allVibeLabelsForQuiz = useMemo(() => {
    if (!quizDetails) return [];
    const labels = new Set<string>();
    quizDetails.questions.forEach((q) =>
      q.answers.forEach((a) => labels.add(a.vibeLabel.toLowerCase()))
    );
    return Array.from(labels);
  }, [quizDetails]);

  const renderWsStatusIcon = () => {
    switch (wsStatus) {
      case "Open":
        return <WifiIcon className="h-4 w-4 text-green-500" />;
      case "Connecting":
        return (
          <span className="text-xs text-yellow-500 animate-pulse">
            Connecting...
          </span>
        );
      case "Closed":
        return <WifiOffIcon className="h-4 w-4 text-red-500" />;
      case "Error":
        return <WsAlertIcon className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Participant Responses {renderWsStatusIcon()}
        </CardTitle>
        <CardDescription>
          {wsStatus === "Open" && "Live view of participant responses."}
          {wsStatus === "Connecting" &&
            `Attempting to connect (${retryCount}/${MAX_RETRIES} retries)...`}
          {wsStatus === "Closed" &&
            !isManualRetryVisible &&
            "Disconnected from live updates. Attempting to reconnect..."}
          {wsStatus === "Closed" &&
            isManualRetryVisible &&
            "Disconnected from live updates. Automatic retries exhausted."}
          {wsStatus === "Error" &&
            !isManualRetryVisible &&
            "WebSocket connection error. Attempting to reconnect..."}
          {wsStatus === "Error" &&
            isManualRetryVisible &&
            "WebSocket connection error. Automatic retries exhausted."}
        </CardDescription>
        {wsError && (
          <Alert variant="destructive" className="mt-2">
            <WsAlertIcon className="h-4 w-4" />
            <AlertTitle>WebSocket Error</AlertTitle>
            <AlertDescription>{wsError}</AlertDescription>
          </Alert>
        )}
        {(wsStatus === "Closed" || wsStatus === "Error") &&
          isManualRetryVisible && (
            <div className="flex justify-center mt-4">
              <Button onClick={handleManualRetry}>Retry Connection</Button>
            </div>
          )}
      </CardHeader>
      <CardContent className="space-y-4">
        {wsStatus === "Connecting" && <Skeleton className="h-20 w-full" />}
        {wsStatus !== "Connecting" &&
          wsUserResponses.length > 0 &&
          wsUserResponses.map((response) => {
            const dominantVibe = getDominantVibe(
              response.vibeDistribution,
              allVibeLabelsForQuiz
            );
            const vibePercentages = calculateVibePercentages(
              response.vibeDistribution,
              response.totalAnswers,
              allVibeLabelsForQuiz
            );
            return (
              <div
                key={response.id}
                className="p-4 border rounded-md bg-muted/50 shadow-sm"
              >
                <div className="flex items-center">
                  <p className="font-semibold">
                    {response.userName || `User ID: ${response.userId}`}
                  </p>
                  <FinalVibeBadge dominantVibe={dominantVibe} />
                </div>
                <p className="text-xs text-muted-foreground mb-1">
                  Submitted: {new Date(response.submittedAt).toLocaleString()}
                </p>
                <VibeBreakdownBar
                  vibePercentages={vibePercentages}
                  totalAnswers={response.totalAnswers}
                />
              </div>
            );
          })}
        {wsStatus !== "Connecting" &&
          wsUserResponses.length === 0 &&
          wsStatus !== "Error" && (
            <p className="text-muted-foreground">
              {wsStatus === "Open"
                ? "No live responses yet. Waiting for participants..."
                : "Connect to see responses."}
            </p>
          )}
        {wsStatus === "Error" && wsUserResponses.length === 0 && (
          <Alert variant="destructive">
            <AlertCircleIcon className="h-4 w-4" />
            <AlertTitle>Could Not Load Responses</AlertTitle>
            <AlertDescription>
              {wsError ||
                "Failed to retrieve responses due to a WebSocket error."}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
