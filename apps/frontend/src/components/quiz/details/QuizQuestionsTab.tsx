import React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import type { QuizDetailsFromAPI } from "./types";

interface QuizQuestionsTabProps {
  quizDetails: QuizDetailsFromAPI;
}

export function QuizQuestionsTab({ quizDetails }: QuizQuestionsTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quiz Questions</CardTitle>
        <CardDescription>
          Review the questions and answers in this quiz.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {quizDetails.questions.map((question, qIndex) => (
          <div key={question.id} className="p-4 border rounded-md bg-muted/50">
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
  );
}
