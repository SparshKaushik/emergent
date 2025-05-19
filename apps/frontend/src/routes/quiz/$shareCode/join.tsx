import {
  createFileRoute,
  useParams,
  Link,
  useNavigate,
} from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import React from "react";
import { useJoinQuizMutation } from "@/lib/api/quizApi";
import { toast } from "sonner";
import { Loader2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const Route = createFileRoute("/quiz/$shareCode/join")({
  component: QuizJoinPage,
});

function QuizJoinPage() {
  const { shareCode: shareCodeFromUrl } = useParams({
    from: "/quiz/$shareCode/join",
  });
  const navigate = useNavigate();
  const [inputCode, setInputCode] = React.useState(shareCodeFromUrl || "");

  const joinQuizMutation = useJoinQuizMutation({
    onSuccess: (data) => {
      toast.success(`Joining quiz: ${data.title}`);
      navigate({ to: "/quiz/$quizId/live", params: { quizId: data.id } });
    },
    onError: (error) => {
      toast.error(`Failed to join quiz: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCode.trim()) {
      toast.error("Please enter a share code.");
      return;
    }
    joinQuizMutation.mutate({ shareCode: inputCode });
  };

  return (
    <div className="container mx-auto p-4 flex flex-col items-center justify-center min-h-screen">
      <div className="w-full max-w-md p-8 space-y-6 bg-card shadow-xl rounded-lg border">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-primary">Join Quiz</h1>
          {shareCodeFromUrl && (
            <p className="text-muted-foreground mt-2">
              Joining with code:{" "}
              <span className="font-semibold text-foreground">
                {shareCodeFromUrl}
              </span>
            </p>
          )}
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          <Input
            type="text"
            placeholder="ENTER SHARE CODE"
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value.toUpperCase())}
            className="text-center text-2xl font-bold tracking-widest h-16 disabled:bg-muted/30"
            required
            disabled={!!shareCodeFromUrl || joinQuizMutation.isPending}
          />
          <Button
            type="submit"
            className="w-full text-lg py-3 h-14 flex items-center justify-center gap-2"
            size="lg"
            disabled={joinQuizMutation.isPending || !inputCode.trim()}
          >
            {joinQuizMutation.isPending ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Joining...
              </>
            ) : (
              "Join Quiz Session"
            )}
          </Button>
        </form>
        {joinQuizMutation.isError && (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              {joinQuizMutation.error?.message ||
                "Could not validate share code."}
            </AlertDescription>
          </Alert>
        )}
        <div className="text-center mt-6">
          <Link to="/" className="text-sm text-primary hover:underline">
            &larr; Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
