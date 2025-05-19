import {
  useMutation,
  type UseMutationOptions,
  useQueryClient,
  useQuery,
} from "@tanstack/react-query";
import { useSession } from "@/lib/auth";
// import { fetchApi } from "./index"; // No longer needed
import axiosClient from "./axiosClient"; // Import the new axios client

// Frontend payload types, mirroring Zod schemas but prepared for API
export interface AnswerPayload {
  text: string;
  vibeLabel: string;
}

export interface QuestionPayload {
  text: string;
  order: number; // Ensure this is correctly populated from form
  answers: AnswerPayload[];
}

export interface CreateQuizPayload {
  title: string;
  description?: string | null; // Match backend DTO (Optional(String) can be null)
  questions: QuestionPayload[];
}

// Backend response types (simplified, expand as needed)
interface CreatedAnswerResponse {
  id: string;
  questionId: string;
  text: string;
  vibeLabel: string;
}

interface CreatedQuestionResponse {
  id: string;
  quizId: string;
  text: string;
  order: number;
  answers: CreatedAnswerResponse[];
}

export interface CreatedQuizResponse {
  id: string;
  creatorId: string;
  title: string;
  description?: string | null;
  shareCode: string;
  createdAt: string; // Typically string date from JSON
  questions: CreatedQuestionResponse[];
}

// Type for the basic quiz info returned by GET /quizzes/my
export interface UserQuizBasicInfo {
  id: string;
  title: string;
  description?: string | null;
  shareCode: string;
  createdAt: string; // Assuming string date from JSON
}

// Types for Quiz Details Endpoint (GET /quizzes/:quizId)
export interface QuizAnswerDetail {
  id: string;
  text: string;
  vibeLabel: string;
}

export interface QuizQuestionDetail {
  id: string;
  text: string;
  order: number;
  answers: QuizAnswerDetail[];
}

export interface QuizDetailsResponse {
  id: string;
  creatorId: string;
  title: string;
  description?: string | null;
  shareCode: string;
  createdAt: string; // Assuming string date from JSON
  questions: QuizQuestionDetail[];
}

// Types for Quiz Responses Endpoint (GET /quizzes/:quizId/responses)
export interface UserQuizResponseItem {
  id: string;
  userId: string;
  userName: string;
  submittedAt: string; // Assuming string date from JSON
}

export type QuizResponsesData = UserQuizResponseItem[];

// Type for finding quiz by share code
export interface QuizInfoByShareCodeResponse {
  id: string;
  title: string;
  description?: string | null;
  // Add any other basic info needed before joining live page
}

export const useCreateQuizMutation = (
  options?: UseMutationOptions<CreatedQuizResponse, Error, CreateQuizPayload>
) => {
  // const { data: sessionData } = useSession(); // No longer needed here for token
  const queryClient = useQueryClient();

  return useMutation<CreatedQuizResponse, Error, CreateQuizPayload>({
    mutationFn: async (
      quizData: CreateQuizPayload
    ): Promise<CreatedQuizResponse> => {
      const response = await axiosClient.post<CreatedQuizResponse>(
        "/quizzes",
        quizData
      );
      return response.data; // Axios returns data in response.data
    },
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: ["user-quizzes"] });
      options?.onSuccess?.(data, variables, context);
    },
    onError: (error, variables, context) => {
      // Error message is already enhanced by the axios interceptor
      console.error("Error creating quiz:", error.message);
      options?.onError?.(error, variables, context);
    },
    ...options,
  });
};

export const useUserQuizzesQuery = () => {
  const { data: sessionData } = useSession(); // Still used for the 'enabled' option

  return useQuery<UserQuizBasicInfo[], Error>({
    queryKey: ["user-quizzes", sessionData?.user?.id],
    queryFn: async (): Promise<UserQuizBasicInfo[]> => {
      const response =
        await axiosClient.get<UserQuizBasicInfo[]>("/quizzes/my");
      return response.data; // Axios returns data in response.data
    },
    enabled: !!sessionData?.session?.token, // Keep this to prevent fetching if no session
  });
};

export const useQuizDetailsQuery = (quizId: string | undefined) => {
  const { data: sessionData } = useSession();
  return useQuery<QuizDetailsResponse, Error>({
    queryKey: ["quiz-details", quizId],
    queryFn: async (): Promise<QuizDetailsResponse> => {
      if (!quizId) throw new Error("Quiz ID is required to fetch details.");
      const response = await axiosClient.get<QuizDetailsResponse>(
        `/quizzes/${quizId}`
      );
      return response.data;
    },
    enabled: !!sessionData?.session?.token && !!quizId,
  });
};

export const useQuizResponsesQuery = (quizId: string | undefined) => {
  const { data: sessionData } = useSession();
  return useQuery<QuizResponsesData, Error>({
    queryKey: ["quiz-responses", quizId],
    queryFn: async (): Promise<QuizResponsesData> => {
      if (!quizId) throw new Error("Quiz ID is required to fetch responses.");
      const response = await axiosClient.get<QuizResponsesData>(
        `/quizzes/${quizId}/responses`
      );
      return response.data;
    },
    enabled: !!sessionData?.session?.token && !!quizId,
  });
};

export const useJoinQuizMutation = (
  options?: UseMutationOptions<
    QuizInfoByShareCodeResponse,
    Error,
    { shareCode: string }
  >
) => {
  return useMutation<QuizInfoByShareCodeResponse, Error, { shareCode: string }>(
    {
      mutationFn: async ({
        shareCode,
      }): Promise<QuizInfoByShareCodeResponse> => {
        if (!shareCode || shareCode.trim() === "") {
          throw new Error("Share code cannot be empty.");
        }
        const response = await axiosClient.get<QuizInfoByShareCodeResponse>(
          `/quizzes/find-by-code/${shareCode.toUpperCase()}` // Ensure shareCode is in expected format (e.g., uppercase)
        );
        return response.data;
      },
      onSuccess: (data, variables, context) => {
        // Optionally, pre-fetch quiz details for the live page if desired
        // queryClient.prefetchQuery({
        //   queryKey: ["quiz-details", data.id],
        //   queryFn: async () => {
        //     const res = await axiosClient.get<QuizDetailsResponse>(`/quizzes/${data.id}`);
        //     return res.data;
        //   },
        // });
        options?.onSuccess?.(data, variables, context);
      },
      onError: (error, variables, context) => {
        console.error(
          `Error joining quiz with code ${variables.shareCode}:`,
          error.message
        );
        options?.onError?.(error, variables, context);
      },
      ...options,
    }
  );
};

// Types for Quiz Submission API
export interface SubmittedAnswerPayload {
  questionId: string;
  selectedAnswerId: string;
}

export interface QuizSubmissionPayload {
  answers: SubmittedAnswerPayload[];
}

export interface QuizSubmissionResponse {
  message: string;
  submittedCount: number;
}

export const useSubmitQuizAnswersMutation = (
  options?: UseMutationOptions<
    QuizSubmissionResponse,
    Error,
    { quizId: string; submission: QuizSubmissionPayload }
  >
) => {
  const queryClient = useQueryClient(); // For potential cache invalidations

  return useMutation<
    QuizSubmissionResponse,
    Error,
    { quizId: string; submission: QuizSubmissionPayload }
  >({
    mutationFn: async ({ quizId, submission }) => {
      if (!quizId) throw new Error("Quiz ID is required for submission.");
      if (!submission.answers || submission.answers.length === 0) {
        throw new Error("At least one answer must be submitted.");
      }
      const response = await axiosClient.post<
        QuizSubmissionResponse,
        any,
        QuizSubmissionPayload // Explicitly type the request data
      >(`/quizzes/${quizId}/submit`, submission);
      return response.data;
    },
    onSuccess: (data, variables, context) => {
      // Example: Invalidate user responses query for this quiz if it exists,
      // or any query that should be updated after submission.
      queryClient.invalidateQueries({
        queryKey: ["quiz-responses", variables.quizId],
      });
      queryClient.invalidateQueries({
        queryKey: ["quiz-details", variables.quizId],
      }); // If details page shows submission status

      options?.onSuccess?.(data, variables, context);
    },
    onError: (error, variables, context) => {
      console.error(
        `Error submitting answers for quiz ${variables.quizId}:`,
        error.message
      );
      options?.onError?.(error, variables, context);
    },
    ...options,
  });
};
