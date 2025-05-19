import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm, useFieldArray, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import React from "react";
import {
  useCreateQuizMutation,
  type CreateQuizPayload,
} from "@/lib/api/quizApi";
import { useSession } from "@/lib/auth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

// Zod Schema Definitions
const answerSchema = z.object({
  text: z.string().min(1, "Answer text cannot be empty."),
  vibeLabel: z.string().min(1, "Vibe label must be selected."),
});

const questionSchema = z.object({
  text: z.string().min(1, "Question text cannot be empty."),
  order: z.number().int().min(0),
  answers: z
    .array(answerSchema)
    .min(1, "Each question must have at least one answer."),
});

const quizFormSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters long."),
  description: z.string().optional(),
  questions: z
    .array(questionSchema)
    .min(1, "Quiz must have at least one question."),
});

type QuizFormValues = z.infer<typeof quizFormSchema>;

export const Route = createFileRoute("/quizzes/create")({
  component: QuizCreatePage,
});

// Helper component for a single Answer item
interface AnswerItemProps {
  questionIndex: number;
  answerIndex: number;
  form: UseFormReturn<QuizFormValues>;
  removeAnswer: (index: number) => void;
  availableVibeLabels: string[];
}

function AnswerItem({
  questionIndex,
  answerIndex,
  form,
  removeAnswer,
  availableVibeLabels,
}: AnswerItemProps) {
  return (
    <div className="flex gap-3 items-end p-3 border-b border-border last:border-b-0">
      <FormField
        control={form.control}
        name={`questions.${questionIndex}.answers.${answerIndex}.text`}
        render={({ field }) => (
          <FormItem className="flex-grow">
            <FormLabel className="text-sm text-muted-foreground">
              Answer Text
            </FormLabel>
            <FormControl>
              <Input
                placeholder={`Answer ${answerIndex + 1}`}
                {...field}
                className="bg-input text-foreground"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name={`questions.${questionIndex}.answers.${answerIndex}.vibeLabel`}
        render={({ field }) => (
          <FormItem className="w-[200px]">
            <FormLabel className="text-sm text-muted-foreground">
              Vibe Label
            </FormLabel>
            <Select onValueChange={field.onChange} defaultValue={field.value}>
              <FormControl>
                <SelectTrigger className="bg-input text-foreground">
                  <SelectValue placeholder="Select vibe" />
                </SelectTrigger>
              </FormControl>
              <SelectContent className="bg-popover text-popover-foreground">
                {availableVibeLabels.length === 0 && (
                  <SelectItem value="" disabled>
                    Define labels first
                  </SelectItem>
                )}
                {availableVibeLabels.map((label) => (
                  <SelectItem key={label} value={label}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
      <Button
        type="button"
        onClick={() => removeAnswer(answerIndex)}
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-destructive"
      >
        Remove
      </Button>
    </div>
  );
}

// Helper component for a single Question item
interface QuestionItemProps {
  questionIndex: number;
  form: UseFormReturn<QuizFormValues>;
  removeQuestion: (index: number) => void;
  availableVibeLabels: string[];
}

function QuestionItem({
  questionIndex,
  form,
  removeQuestion,
  availableVibeLabels,
}: QuestionItemProps) {
  const {
    fields: answerFields,
    append: appendAnswer,
    remove: removeAnswer,
  } = useFieldArray({
    control: form.control,
    name: `questions.${questionIndex}.answers`,
  });

  return (
    <div className="p-4 border border-border rounded-lg mb-6 bg-card text-card-foreground shadow-lg">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-xl font-semibold">Question {questionIndex + 1}</h3>
        <Button
          type="button"
          onClick={() => removeQuestion(questionIndex)}
          variant="destructive"
          size="sm"
        >
          Remove Question
        </Button>
      </div>
      <FormField
        control={form.control}
        name={`questions.${questionIndex}.text`}
        render={({ field }) => (
          <FormItem className="mb-4">
            <FormLabel className="text-base">Question Text</FormLabel>
            <FormControl>
              <Input
                placeholder={`Enter text for question ${questionIndex + 1}`}
                {...field}
                className="bg-input text-foreground p-3"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name={`questions.${questionIndex}.order`}
        render={({ field }) => <input type="hidden" {...field} />}
      />

      <div className="space-y-2">
        <h4 className="text-md font-medium text-muted-foreground mb-1">
          Answers
        </h4>
        {answerFields.map((answerItem, answerIndex) => (
          <AnswerItem
            key={answerItem.id}
            questionIndex={questionIndex}
            answerIndex={answerIndex}
            form={form}
            removeAnswer={removeAnswer}
            availableVibeLabels={availableVibeLabels}
          />
        ))}
        {answerFields.length === 0 && (
          <p className="text-sm text-muted-foreground py-2">
            No answers added yet.
          </p>
        )}
        <Button
          type="button"
          onClick={() =>
            appendAnswer({ text: "", vibeLabel: availableVibeLabels[0] || "" })
          }
          variant="outline"
          size="sm"
          className="mt-3 border-primary text-primary hover:bg-primary/10"
        >
          Add Answer
        </Button>
      </div>
    </div>
  );
}

function QuizCreatePage() {
  const [availableVibeLabels, setAvailableVibeLabels] = React.useState<
    string[]
  >(["genz", "millennial"]);
  const [newVibeLabelInput, setNewVibeLabelInput] = React.useState<string>("");

  const navigate = useNavigate();
  const { data: sessionInfo } = useSession();

  const createQuizMutation = useCreateQuizMutation({
    onSuccess: (data) => {
      toast.success("Quiz created successfully!");
      console.log("Quiz created, share code:", data.shareCode);
      navigate({ to: "/quizzes" });
    },
    onError: (error) => {
      toast.error(`Failed to create quiz: ${error.message}`);
    },
  });

  const form = useForm<QuizFormValues>({
    resolver: zodResolver(quizFormSchema),
    defaultValues: {
      title: "",
      description: "",
      questions: [
        {
          text: "",
          order: 0,
          answers: [{ text: "", vibeLabel: availableVibeLabels[0] || "" }],
        },
      ],
    },
  });

  const {
    fields: questionFields,
    append: appendQuestion,
    remove: removeQuestion,
  } = useFieldArray({
    control: form.control,
    name: "questions",
  });

  function onSubmit(values: QuizFormValues) {
    if (!sessionInfo?.session?.token) {
      toast.error("You must be logged in to create a quiz.");
      return;
    }

    const questionsWithOrder = values.questions.map((q, index) => ({
      ...q,
      order: index,
      answers: q.answers.map((a) => ({ text: a.text, vibeLabel: a.vibeLabel })),
    }));

    const payload: CreateQuizPayload = {
      title: values.title,
      description: values.description || null,
      questions: questionsWithOrder,
    };
    createQuizMutation.mutate(payload);
  }

  const handleAddVibeLabel = () => {
    const trimmedLabel = newVibeLabelInput.trim().toLowerCase();
    if (trimmedLabel && !availableVibeLabels.includes(trimmedLabel)) {
      setAvailableVibeLabels([...availableVibeLabels, trimmedLabel]);
      setNewVibeLabelInput("");
    } else if (availableVibeLabels.includes(trimmedLabel)) {
      form.setError(`root.custom`, {
        type: "custom",
        message: `Vibe label '${trimmedLabel}' already exists.`,
      });
    }
  };

  const handleAppendQuestion = () => {
    appendQuestion({
      text: "",
      order: questionFields.length,
      answers: [{ text: "", vibeLabel: availableVibeLabels[0] || "" }],
    });
  };

  React.useEffect(() => {
    if (questionFields.length === 0) {
      appendQuestion({
        text: "",
        order: 0,
        answers: [{ text: "", vibeLabel: availableVibeLabels[0] || "" }],
      });
    }
  }, [questionFields.length, appendQuestion, availableVibeLabels]);

  return (
    <main className="container mx-auto p-4 flex flex-col items-center pt-20 md:pt-24">
      <div className="w-full">
        <header className="mb-10 text-center md:text-left">
          <h1 className="text-4xl font-bold">Create New Vibe Quiz</h1>
          <p className="text-lg text-muted-foreground mt-1">
            Craft your questions and set the vibes for your audience.
          </p>
        </header>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col lg:flex-row gap-10"
          >
            {/* Main Form Area */}
            <div className="flex-grow space-y-8 lg:w-3/5 xl:w-2/3">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xl font-semibold">
                      Quiz Title
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., 'What's Your Office Vibe?'"
                        {...field}
                        className="bg-input text-foreground p-4 text-base"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xl font-semibold">
                      Description (Optional)
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="A brief description of your quiz"
                        {...field}
                        className="bg-input text-foreground p-4 text-base"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div>
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-semibold">Questions</h2>
                  <Button
                    type="button"
                    onClick={handleAppendQuestion}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Add Question
                  </Button>
                </div>
                {questionFields.length > 0 ? (
                  questionFields.map((questionItem, questionIndex) => (
                    <QuestionItem
                      key={questionItem.id}
                      questionIndex={questionIndex}
                      form={form}
                      removeQuestion={removeQuestion}
                      availableVibeLabels={availableVibeLabels}
                    />
                  ))
                ) : (
                  <div className="text-center text-muted-foreground py-10 border-2 border-dashed border-border rounded-lg bg-card/50">
                    <p className="text-lg">No questions yet!</p>
                    <p>Click "Add Question" to start building your quiz.</p>
                  </div>
                )}
              </div>

              <Button
                type="submit"
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 text-lg font-semibold py-3 px-6 rounded-lg shadow-md flex items-center justify-center gap-2"
                disabled={createQuizMutation.isPending}
              >
                {createQuizMutation.isPending && (
                  <Loader2 className="h-5 w-5 animate-spin" />
                )}
                {createQuizMutation.isPending
                  ? "Creating..."
                  : "Create Quiz & Get Share Code"}
              </Button>
              {createQuizMutation.isError && (
                <p className="text-sm text-destructive mt-2 text-center">
                  Error:{" "}
                  {createQuizMutation.error?.message ||
                    "An unknown error occurred"}
                </p>
              )}
            </div>

            {/* Vibe Labels Management Area */}
            <aside className="lg:w-2/5 xl:w-1/3 space-y-6 p-6 bg-card text-card-foreground border border-border rounded-xl shadow-xl">
              <h2 className="text-xl font-semibold border-b border-border pb-3 mb-4">
                Manage Vibe Labels
              </h2>
              <div className="space-y-3">
                <FormLabel className="text-base text-muted-foreground">
                  Available Vibe Labels
                </FormLabel>
                {availableVibeLabels.length > 0 ? (
                  <ul className="space-y-2 max-h-72 overflow-y-auto pr-2">
                    {availableVibeLabels.map((label) => (
                      <li
                        key={label}
                        className="flex justify-between items-center p-3 bg-input rounded-md hover:bg-muted/70 transition-colors"
                      >
                        <span className="capitalize">{label}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setAvailableVibeLabels((prev) =>
                              prev.filter((l) => l !== label)
                            )
                          }
                          className="text-destructive hover:text-destructive/80 hover:bg-destructive/10 px-2 py-1 h-auto"
                          disabled={
                            availableVibeLabels.length <= 2 &&
                            availableVibeLabels.includes(label)
                          }
                        >
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground p-3 bg-input rounded-md">
                    No vibe labels defined. Add some below.
                  </p>
                )}
              </div>
              <div className="space-y-2 pt-4 border-t border-border">
                <FormLabel htmlFor="new-vibe-label-input" className="text-base">
                  Add New Vibe Label
                </FormLabel>
                <div className="flex gap-2 items-center">
                  <Input
                    id="new-vibe-label-input"
                    value={newVibeLabelInput}
                    onChange={(e) => {
                      setNewVibeLabelInput(e.target.value);
                      if (form.formState.errors.root?.custom) {
                        form.clearErrors("root.custom");
                      }
                    }}
                    placeholder="e.g., chaotic good"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddVibeLabel();
                      }
                    }}
                    className="bg-input text-foreground"
                  />
                  <Button
                    type="button"
                    onClick={handleAddVibeLabel}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 whitespace-nowrap"
                  >
                    Add Label
                  </Button>
                </div>
                {form.formState.errors.root?.custom && (
                  <FormMessage>
                    {form.formState.errors.root.custom.message}
                  </FormMessage>
                )}
              </div>
            </aside>
          </form>
        </Form>
      </div>
    </main>
  );
}
