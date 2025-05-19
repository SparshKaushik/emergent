import {
  createFileRoute,
  useNavigate,
  useParams,
  redirect,
} from "@tanstack/react-router";
import React, { useState, useEffect } from "react";
import { useSession, getSession } from "@/lib/auth";
import {
  useQuizDetailsQuery,
  useSubmitQuizAnswersMutation,
  type QuizDetailsResponse,
  type SubmittedAnswerPayload,
} from "@/lib/api/quizApi";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircle,
  AlertCircle as AlertCircleIconLucide,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/quiz/$quizId/live")({
  beforeLoad: async ({ location }) => {
    const authState = await getSession();
    if (!authState || !authState.data?.session) {
      throw redirect({
        to: "/",
        search: {
          redirect: location.href,
        },
      });
    }
  },
  component: QuizLivePage,
});

function QuizLivePage() {
  const { quizId } = useParams({ from: "/quiz/$quizId/live" });
  const navigate = useNavigate();

  const {
    data: quizDetails,
    isLoading: isLoadingQuiz,
    isError: isErrorQuiz,
    error: errorQuiz,
  } = useQuizDetailsQuery(quizId);

  const submitAnswersMutation = useSubmitQuizAnswersMutation({
    onSuccess: (data) => {
      toast.success(data.message || "Quiz submitted successfully!");
      navigate({ to: "/" });
    },
    onError: (error) => {
      toast.error(`Submission failed: ${error.message}`);
    },
  });

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<
    Record<string, string>
  >({}); // questionId -> answerId
  const [animationDirection, setAnimationDirection] = useState(1); // 1 for next, -1 for prev

  if (isLoadingQuiz) {
    return (
      <div className="container mx-auto p-4 pt-20 md:pt-24 space-y-6">
        <Skeleton className="h-8 w-3/4 mb-2" />
        <Skeleton className="h-6 w-1/2 mb-6" />
        <Card className="w-full">
          <CardHeader>
            <Skeleton className="h-7 w-2/3 mb-3" />
            <Skeleton className="h-5 w-1/3" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center space-x-3">
                <Skeleton className="h-5 w-5 rounded-full" />
                <Skeleton className="h-5 flex-1" />
              </div>
            ))}
            <div className="flex justify-between mt-6">
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-10 w-24" />
            </div>
          </CardContent>
        </Card>
        <Skeleton className="h-4 w-full mt-4" />
      </div>
    );
  }

  if (isErrorQuiz) {
    return (
      <div className="container mx-auto p-4 pt-20 md:pt-24">
        <Alert variant="destructive">
          <AlertCircleIconLucide className="h-4 w-4" />
          <AlertTitle>Error loading quiz</AlertTitle>
          <AlertDescription>
            {errorQuiz?.message || "Could not fetch quiz details."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!quizDetails) {
    return (
      <div className="container mx-auto p-4 pt-20 md:pt-24">
        <Alert>
          <AlertCircleIconLucide className="h-4 w-4" />
          <AlertTitle>Quiz not found</AlertTitle>
          <AlertDescription>
            The quiz you are looking for does not exist or could not be loaded.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const questions = quizDetails.questions.sort((a, b) => a.order - b.order);
  const currentQuestion = questions[currentQuestionIndex];
  const totalQuestions = questions.length;

  const handleNextQuestion = () => {
    if (currentQuestionIndex < totalQuestions - 1) {
      setAnimationDirection(1);
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else {
      if (!quizId) {
        toast.error("Quiz ID is missing, cannot submit.");
        return;
      }
      const answersToSubmit: SubmittedAnswerPayload[] = Object.entries(
        selectedAnswers
      ).map(([questionId, selectedAnswerId]) => ({
        questionId,
        selectedAnswerId,
      }));

      if (answersToSubmit.length === 0 && totalQuestions > 0) {
        toast.error("Please answer at least one question before submitting.");
        return;
      }

      submitAnswersMutation.mutate({
        quizId,
        submission: { answers: answersToSubmit },
      });
    }
  };

  const handlePreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      setAnimationDirection(-1);
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const handleAnswerSelect = (questionId: string, answerId: string) => {
    setSelectedAnswers((prev) => ({ ...prev, [questionId]: answerId }));
  };

  const isLastQuestion = currentQuestionIndex === totalQuestions - 1;
  const canSubmit =
    isLastQuestion &&
    selectedAnswers[currentQuestion?.id] &&
    !submitAnswersMutation.isPending;

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? "100%" : "-100%",
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction < 0 ? "100%" : "-100%",
      opacity: 0,
    }),
  };

  return (
    <div className="container mx-auto p-4 pt-12 md:pt-16 flex flex-col items-center min-h-screen">
      <Card className="w-full max-w-2xl shadow-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold text-primary">
            {quizDetails.title}
          </CardTitle>
          {quizDetails.description && (
            <CardDescription className="text-muted-foreground mt-1">
              {quizDetails.description}
            </CardDescription>
          )}
          <Progress
            value={((currentQuestionIndex + 1) / totalQuestions) * 100}
            className="w-full mt-4 h-2"
          />
          <p className="text-sm text-muted-foreground mt-2">
            Question {currentQuestionIndex + 1} of {totalQuestions}
          </p>
        </CardHeader>

        <CardContent className="overflow-hidden relative min-h-[300px] md:min-h-[350px]">
          <AnimatePresence
            initial={false}
            custom={animationDirection}
            mode="wait"
          >
            {currentQuestion && (
              <motion.div
                key={currentQuestion.id}
                custom={animationDirection}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="w-full absolute top-0 left-0 p-6"
              >
                <h2 className="text-xl md:text-2xl font-semibold mb-6 text-center">
                  {currentQuestion.text}
                </h2>
                <RadioGroup
                  value={selectedAnswers[currentQuestion.id] || ""}
                  onValueChange={(value) =>
                    handleAnswerSelect(currentQuestion.id, value)
                  }
                  className="space-y-3"
                >
                  {currentQuestion.answers.map((answer) => (
                    <Label
                      key={answer.id}
                      htmlFor={answer.id}
                      className={`flex items-center space-x-3 p-4 border rounded-lg cursor-pointer transition-all duration-150 ease-in-out hover:border-primary hover:bg-primary/5
                        ${
                          selectedAnswers[currentQuestion.id] === answer.id
                            ? "border-primary bg-primary/10 ring-2 ring-primary"
                            : "border-border"
                        }`}
                    >
                      <RadioGroupItem
                        value={answer.id}
                        id={answer.id}
                        className="border-muted-foreground data-[state=checked]:border-primary data-[state=checked]:text-primary"
                      />
                      <span className="text-base">{answer.text}</span>
                    </Label>
                  ))}
                </RadioGroup>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>

        <div className="flex justify-between p-6 border-t">
          <Button
            variant="outline"
            onClick={handlePreviousQuestion}
            disabled={
              currentQuestionIndex === 0 || submitAnswersMutation.isPending
            }
            className="gap-2"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Previous
          </Button>
          <Button
            onClick={handleNextQuestion}
            disabled={
              (!isLastQuestion && !selectedAnswers[currentQuestion?.id]) ||
              (isLastQuestion && !canSubmit) ||
              submitAnswersMutation.isPending
            }
            className="gap-2 bg-primary hover:bg-primary/90"
          >
            {isLastQuestion ? (
              submitAnswersMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Submitting...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4" /> Finish Quiz
                </>
              )
            ) : (
              <>
                Next <ArrowRightIcon className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
