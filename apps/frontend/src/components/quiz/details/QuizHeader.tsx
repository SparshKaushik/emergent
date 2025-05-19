import { Link } from "@tanstack/react-router";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { ArrowLeftIcon } from "lucide-react";
import type { QuizDetailsFromAPI } from "./types";

interface QuizHeaderProps {
  quizDetails: QuizDetailsFromAPI;
}

export function QuizHeader({ quizDetails }: QuizHeaderProps) {
  return (
    <>
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
    </>
  );
}
