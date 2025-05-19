import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { QuizDetailsFromAPI } from "./types";

interface QuizShareTabProps {
  quizDetails: QuizDetailsFromAPI;
}

export function QuizShareTab({ quizDetails }: QuizShareTabProps) {
  const shareLink = quizDetails
    ? `${window.location.origin}/quiz/${quizDetails.shareCode}/join`
    : "";

  return (
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
            <Button onClick={() => navigator.clipboard.writeText(shareLink)}>
              Copy Link
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
