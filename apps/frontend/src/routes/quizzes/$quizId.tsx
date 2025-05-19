import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeftIcon,
  AlertCircle,
  WifiIcon,
  WifiOffIcon,
  AlertCircleIcon as WsAlertIcon,
} from "lucide-react";
import { useQuizDetailsQuery } from "@/lib/api/quizApi";
import { useEffect, useState, useRef, useMemo } from "react";
import { useSession } from "@/lib/auth";
import {
  calculateVibePercentages,
  getDominantVibe,
} from "@/lib/VibeDisplayUtils";
import { FinalVibeBadge } from "@/components/quiz/FinalVibeBadge";
import { VibeBreakdownBar } from "@/components/quiz/VibeBreakdownBar";

// Define retry constants
// const MAX_RETRIES = 10; // To be removed
// const RETRY_DELAY_MS = 5000; // 5 seconds // To be removed

// Interface for QuizDetails (from useQuizDetailsQuery)
// Ensure this matches the expected structure from your API
interface QuizDetailsFromAPI {
  id: string;
  title: string;
  description?: string | null;
  shareCode: string;
  questions: Array<{
    id: string;
    text: string;
    order: number;
    answers: Array<{
      id: string;
      text: string;
      vibeLabel: string;
    }>;
  }>;
}

// Interface for UserResponse item from useQuizResponsesQuery
// Ensure this matches the expected structure from your API
interface UserVibeData {
  vibeDistribution: { [vibeLabel: string]: number }; // Counts of each vibe label
  totalAnswers: number; // Total answers submitted by this user for this quiz
}

// This type should match the data sent by the backend's GET_QUIZ_RESPONSES WebSocket event
interface LiveUserResponse extends UserVibeData {
  id: string; // User ID or a unique identifier for the live update
  userId: string;
  userName: string | null;
  submittedAt: string; // Timestamp of the live update
}

type WebSocketStatus = "Connecting" | "Open" | "Closed" | "Error";

export const Route = createFileRoute("/quizzes/$quizId")({
  component: QuizDetailsPage,
});

function QuizDetailsPage() {
  const { quizId } = useParams({ from: "/quizzes/$quizId" });
  const { data: sessionData } = useSession();

  const {
    data: quizDetails,
    isLoading: isLoadingDetails,
    isError: isErrorDetails,
    error: errorDetails,
  } = useQuizDetailsQuery(quizId) as {
    data: QuizDetailsFromAPI | undefined;
    isLoading: boolean;
    isError: boolean;
    error: Error | null;
  };

  const [_, setWs] = useState<WebSocket | null>(null);
  const [wsStatus, setWsStatus] = useState<WebSocketStatus>("Closed");
  const [wsUserResponses, setWsUserResponses] = useState<LiveUserResponse[]>(
    []
  );
  const [wsError, setWsError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryTimerRef = useRef<number | null>(null); // Use ref for retry timer ID
  const [isManualRetryVisible, setIsManualRetryVisible] = useState(false);

  const connectWebSocket = (quizId: string, session: any) => {
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      console.log(
        "WebSocket connection attempt skipped: already open or connecting."
      );
      setWsStatus(
        wsRef.current.readyState === WebSocket.OPEN ? "Open" : "Connecting"
      );
      return;
    }

    if (!quizId || !session) {
      setWsStatus("Closed");
      return;
    }

    // Clear any existing timer before attempting a new connection
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
    const WS_URL = API_URL.replace(/^http/, "ws") + "/ws";

    setWsStatus("Connecting");
    setWsError(null);
    // Clearing might be safer to ensure data consistency if the server state changes.
    // setWsUserResponses([]);

    const socket = new WebSocket(WS_URL);
    wsRef.current = socket;
    setWs(socket);

    socket.onopen = () => {
      console.log("WebSocket connection established for quiz:", quizId);
      setWsStatus("Open");
      setWsError(null);
      // setRetryCount(0); // Removed: Reset retry count on successful connection
      setIsManualRetryVisible(false); // Hide manual retry on success

      if (socket.readyState === WebSocket.OPEN) {
        // Then, request initial/live responses for this quiz
        socket.send(
          JSON.stringify({
            event: "GET_QUIZ_RESPONSES",
            payload: { quizId },
          })
        );
      }
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string);
        console.log("WebSocket message received on quizzes/$quizId:", message);

        if (message.event === "QUIZ_RESPONSES_DATA") {
          setWsUserResponses(message.payload.responses as LiveUserResponse[]);
          setWsError(null);
        } else if (message.event === "NEW_QUIZ_RESPONSE") {
          console.log("WS: Received NEW_QUIZ_RESPONSE", message.payload);
          if (message.payload.quizId === quizId) {
            console.log(
              "WS: New response for current quiz. Refreshing responses."
            );
            // Re-requesting all responses might be simpler than merging
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(
                JSON.stringify({
                  event: "GET_QUIZ_RESPONSES",
                  payload: { quizId },
                })
              );
            }
          }
        } else if (message.event === "QUIZ_RESPONSES_ERROR") {
          console.error(
            "WS Error (QUIZ_RESPONSES_ERROR):",
            message.payload.message
          );
          setWsError(`Server error (Responses): ${message.payload.message}`);
          // This is a server error, not a connection error, don't retry connection here.
        } else if (
          message.event === "CONNECTED" ||
          message.event === "AUTHENTICATED"
        ) {
          // Handle AUTHENTICATED event
          console.log("WS: Successfully connected and/or authenticated.");
        } else if (
          message.event === "ERROR" ||
          message.event === "AUTH_ERROR"
        ) {
          // Handle AUTH_ERROR or generic server error
          console.error(
            "WS Error (Generic/Auth ERROR event):",
            message.payload.error
          );
          setWsError(
            `Server error: ${message.payload.error || "Unknown error"}`
          );
          // If it's an auth error, close the socket and stop retrying
          if (
            message.event === "AUTH_ERROR" &&
            wsRef.current &&
            wsRef.current.readyState === WebSocket.OPEN
          ) {
            wsRef.current.close(1008, "Authentication failed"); // Close with a specific code
          }
          // For other errors, the onerror/onclose handlers will handle potential retries
        }
      } catch (e) {
        console.error("WS: Failed to parse message or handle it:", e);
        setWsError("Failed to process message from server.");
        // This is an application-level error, not a connection error, don't retry connection here.
      }
    };

    socket.onerror = (errorEvent) => {
      console.error("WebSocket native error:", errorEvent);
      // Set status to Error immediately on native error
      setWsStatus("Error");
      setWsError("WebSocket connection error. See console for details.");
      // onclose will be called after onerror, handle retry logic there
    };

    socket.onclose = (closeEvent) => {
      console.log(
        "WebSocket connection closed:",
        closeEvent.code,
        closeEvent.reason
      );
      setWsStatus("Closed");
      setWs(null); // Clear the stateful ws

      // Clear any existing timer
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }

      // Show manual retry button if the close wasn't due to unmounting (1001)
      // or a specific auth failure that prevents retries (1008).
      if (closeEvent.code !== 1001 && closeEvent.code !== 1008) {
        setIsManualRetryVisible(true);
        console.log("WebSocket disconnected. Manual retry button enabled.");
      } else if (closeEvent.code === 1008) {
        console.log(
          "WebSocket closed due to authentication issue. Manual retry not appropriate."
        );
        // Potentially set a specific error message for auth failure if needed
      } else {
        console.log("WebSocket closed intentionally (e.g. component unmount).");
      }

      // This cleanup for wsRef.current was a bit misplaced here,
      // it should primarily be in the useEffect cleanup.
      // However, ensuring it's null if the socket truly closes is okay.
      // if (wsRef.current) {
      // wsRef.current = null;
      // }
    };
  };

  const handleManualRetry = () => {
    console.log("Manual WebSocket retry initiated.");
    // setRetryCount(0); // Removed: Reset count for manual retry
    setIsManualRetryVisible(false); // Hide button while attempting
    // Clear any pending automatic retry timer just in case (though it shouldn't exist)
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    connectWebSocket(quizId, sessionData?.session); // Attempt connection
  };

  useEffect(() => {
    // Initial connection attempt
    connectWebSocket(quizId, sessionData?.session);

    // Cleanup function
    return () => {
      console.log("Cleaning up WebSocket connection and timers on unmount.");
      // Clear any scheduled automatic retry timer
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      // Close the WebSocket connection if it exists
      if (wsRef.current) {
        // Use a specific close code if possible (e.g., 1001 Going Away)
        try {
          wsRef.current.close(1001, "Component unmounting");
        } catch (e) {
          console.error("Error closing WebSocket:", e);
        }
        wsRef.current = null;
      }
      setWs(null); // Clear the stateful ws on unmount
      setWsStatus("Closed");
      // The connectWebSocket function handles resetting on successful connect.
    };
  }, [quizId, sessionData]); // Dependencies remain the same

  const allVibeLabelsForQuiz = useMemo(() => {
    if (!quizDetails) return [];
    const labels = new Set<string>();
    quizDetails.questions.forEach((q) =>
      q.answers.forEach((a) => labels.add(a.vibeLabel.toLowerCase()))
    );
    return Array.from(labels);
  }, [quizDetails]);

  const shareLink = quizDetails
    ? `${window.location.origin}/quiz/${quizDetails.shareCode}/join`
    : "";

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

  // Update displayResponses to only use wsUserResponses
  const displayResponses = wsUserResponses;

  if (isLoadingDetails) {
    return (
      <div className="container mx-auto py-8 px-4 md:px-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-10 w-1/3" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  if (isErrorDetails) {
    return (
      <div className="container mx-auto py-8 px-4 md:px-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Quiz Details</AlertTitle>
          <AlertDescription>
            {errorDetails?.message || "An unexpected error occurred."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!quizDetails) {
    return (
      <div className="container mx-auto py-8 px-4 md:px-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Quiz Not Found</AlertTitle>
          <AlertDescription>
            The requested quiz could not be found or you do not have permission
            to view it.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 md:px-6">
      <Link
        to="/quizzes"
        className="mb-6 inline-flex items-center gap-2 text-sm text-primary hover:underline"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Back to My Quizzes
      </Link>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-3xl">{quizDetails.title}</CardTitle>
          {quizDetails.description && (
            <CardDescription className="text-md">
              {quizDetails.description}
            </CardDescription>
          )}
        </CardHeader>
      </Card>

      <Tabs defaultValue="responses" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="responses">
            <div className="flex items-center gap-2">
              Responses {renderWsStatusIcon()}
            </div>
          </TabsTrigger>
          <TabsTrigger value="questions">Questions</TabsTrigger>
          <TabsTrigger value="share">Share</TabsTrigger>
        </TabsList>

        <TabsContent value="responses">
          <Card>
            <CardHeader>
              <CardTitle>Participant Responses</CardTitle>
              <CardDescription>
                {wsStatus === "Open" && "Live view of participant responses."}
                {wsStatus === "Connecting" && "Attempting to connect..."}
                {wsStatus === "Closed" &&
                  !isManualRetryVisible &&
                  "Disconnected from live updates."}
                {wsStatus === "Closed" &&
                  isManualRetryVisible &&
                  "Disconnected. Click 'Retry Connection' to reconnect."}
                {wsStatus === "Error" &&
                  !isManualRetryVisible &&
                  "WebSocket connection error."}
                {wsStatus === "Error" &&
                  isManualRetryVisible &&
                  "WebSocket error. Click 'Retry Connection' to try again."}
              </CardDescription>
              {wsError && (
                <Alert variant="destructive" className="mt-2">
                  <WsAlertIcon className="h-4 w-4" />
                  <AlertTitle>WebSocket Error</AlertTitle>
                  <AlertDescription>{wsError}</AlertDescription>
                </Alert>
              )}
              {/* Add manual retry button if visible and status is closed/error */}
              {(wsStatus === "Closed" || wsStatus === "Error") &&
                isManualRetryVisible && (
                  <div className="flex justify-center mt-4">
                    <Button onClick={handleManualRetry}>
                      Retry Connection
                    </Button>
                  </div>
                )}
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Updated loading/empty/error states for responses */}
              {wsStatus === "Connecting" && (
                <Skeleton className="h-20 w-full" />
              )}
              {wsStatus !== "Connecting" &&
                displayResponses.length > 0 &&
                displayResponses.map((response) => {
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
                        Submitted:{" "}
                        {new Date(response.submittedAt).toLocaleString()}
                      </p>
                      <VibeBreakdownBar
                        vibePercentages={vibePercentages}
                        totalAnswers={response.totalAnswers}
                      />
                    </div>
                  );
                })}
              {wsStatus !== "Connecting" &&
                displayResponses.length === 0 &&
                wsStatus !== "Error" && (
                  <p className="text-muted-foreground">
                    {wsStatus === "Open"
                      ? "No live responses yet. Waiting for participants..."
                      : "Connect to see responses."}
                  </p>
                )}
              {wsStatus === "Error" && displayResponses.length === 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Could Not Load Responses</AlertTitle>
                  <AlertDescription>
                    {wsError ||
                      "Failed to retrieve responses due to a WebSocket error."}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="questions">
          <Card>
            <CardHeader>
              <CardTitle>Quiz Questions</CardTitle>
              <CardDescription>
                Review the questions and answers in this quiz.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {quizDetails.questions.map((question, qIndex) => (
                <div
                  key={question.id}
                  className="p-4 border rounded-md bg-muted/50"
                >
                  <p className="font-semibold text-lg mb-2">
                    {`Q${qIndex + 1}: ${question.text}`}
                  </p>
                  <ul className="space-y-1 pl-4">
                    {question.answers.map((answer) => (
                      <li key={answer.id} className="text-sm">
                        - {answer.text}{" "}
                        <span className="text-xs text-muted-foreground">
                          ({answer.vibeLabel})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="share">
          <Card>
            <CardHeader>
              <CardTitle>Share Your Quiz</CardTitle>
              <CardDescription>
                Use the code or link below to invite participants.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label
                  htmlFor="shareCodeInput"
                  className="block text-sm font-medium text-muted-foreground mb-1"
                >
                  Share Code
                </label>
                <div className="flex gap-2">
                  <Input
                    id="shareCodeInput"
                    value={quizDetails.shareCode}
                    readOnly
                    className="text-lg font-mono tracking-wider"
                  />
                  <Button
                    onClick={() =>
                      navigator.clipboard.writeText(quizDetails.shareCode)
                    }
                  >
                    Copy Code
                  </Button>
                </div>
              </div>
              <div>
                <label
                  htmlFor="shareLinkInput"
                  className="block text-sm font-medium text-muted-foreground mb-1"
                >
                  Share Link
                </label>
                <div className="flex gap-2">
                  <Input
                    id="shareLinkInput"
                    value={shareLink}
                    readOnly
                    className="text-sm"
                  />
                  <Button
                    onClick={() => navigator.clipboard.writeText(shareLink)}
                  >
                    Copy Link
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
