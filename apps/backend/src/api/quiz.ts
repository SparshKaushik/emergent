import { Elysia, t, type Static } from "elysia";
import { db } from "../../lib/db";
import * as schema from "../../lib/db/schema";
import { authPlugin } from "../../lib/auth";
import { generateShareCode } from "../utils/generateShareCode";
import { eq, and, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { broadcastToUser } from "../ws";

const answerDto = t.Object({
  text: t.String(),
  vibeLabel: t.String(),
});

const questionDto = t.Object({
  text: t.String(),
  order: t.Integer(),
  answers: t.Array(answerDto, { minItems: 1 }),
});

const createQuizDto = t.Object({
  title: t.String({ minLength: 1 }),
  description: t.Optional(t.String()),
  questions: t.Array(questionDto, { minItems: 1 }),
});

// DTO for a single answer in quiz details
const answerDetailsDto = t.Object({
  id: t.String(),
  text: t.String(),
  vibeLabel: t.String(),
});
export type AnswerDetails = Static<typeof answerDetailsDto>;

// DTO for a single question in quiz details
const questionDetailsDto = t.Object({
  id: t.String(),
  text: t.String(),
  order: t.Integer(),
  answers: t.Array(answerDetailsDto),
});
export type QuestionDetails = Static<typeof questionDetailsDto>;

// DTO for full quiz details
const quizDetailsDto = t.Object({
  id: t.String(),
  creatorId: t.String(),
  title: t.String(),
  description: t.Nullable(t.String()),
  shareCode: t.String(),
  createdAt: t.Date(),
  questions: t.Array(questionDetailsDto),
});
export type QuizDetails = Static<typeof quizDetailsDto>;

// DTO for a single user response
const userResponseDataDto = t.Object({
  id: t.String(),
  userId: t.String(),
  userName: t.Nullable(t.String()),
  submittedAt: t.Date(),
  vibeDistribution: t.Record(t.String(), t.Number()),
  totalAnswers: t.Integer(),
});
export type UserResponseData = Static<typeof userResponseDataDto>;

// DTO for the list of user responses
const quizResponsesDto = t.Array(userResponseDataDto);
export type QuizResponses = Static<typeof quizResponsesDto>;

// DTO for quiz info by share code
const quizInfoByShareCodeDto = t.Object({
  id: t.String(),
  title: t.String(),
  description: t.Nullable(t.String()),
});
export type QuizInfoByShareCode = Static<typeof quizInfoByShareCodeDto>;

// DTOs for quiz submission
const submitAnswerDto = t.Object({
  questionId: t.String({ format: "uuid" }),
  selectedAnswerId: t.String({ format: "uuid" }),
});

const quizSubmissionDto = t.Object({
  answers: t.Array(submitAnswerDto, { minItems: 1 }), // User must submit at least one answer
});

const submissionResponseDto = t.Object({
  message: t.String(),
  submittedCount: t.Integer(),
});

async function createQuizInDb(
  tx: any,
  authUserId: string,
  title: string,
  description: string | null,
  shareCode: string,
  inputQuestions: Static<typeof questionDto>[]
) {
  const [newQuiz] = await tx
    .insert(schema.quizzes)
    .values({
      creatorId: authUserId,
      title,
      description: description || null,
      shareCode: shareCode,
    })
    .returning();
  if (!newQuiz) throw new Error("Failed to create quiz entry.");

  const createdQuestionsOutput: QuestionDetails[] = [];
  for (const q of inputQuestions) {
    if (q.answers.length === 0) {
      throw new Error(`Question "${q.text}" must have answers.`);
    }
    const [newQuestion] = await tx
      .insert(schema.questions)
      .values({ quizId: newQuiz.id, text: q.text, order: q.order })
      .returning();
    if (!newQuestion) throw new Error("Failed to create question.");

    const createdAnswersOutput: AnswerDetails[] = [];
    for (const a of q.answers) {
      const [newAnswer] = await tx
        .insert(schema.answers)
        .values({
          questionId: newQuestion.id,
          text: a.text,
          vibeLabel: a.vibeLabel,
        })
        .returning();
      if (!newAnswer) throw new Error("Failed to create answer.");
      createdAnswersOutput.push(newAnswer);
    }
    createdQuestionsOutput.push({
      ...newQuestion,
      answers: createdAnswersOutput,
    });
  }
  return {
    ...newQuiz,
    questions: createdQuestionsOutput,
  } as QuizDetails;
}

async function submitQuizAnswersToDb(
  tx: any,
  authUserId: string,
  quizId: string,
  submittedAnswers: Static<typeof submitAnswerDto>[]
) {
  await tx
    .delete(schema.userResponses)
    .where(
      and(
        eq(schema.userResponses.userId, authUserId),
        eq(schema.userResponses.quizId, quizId)
      )
    );

  if (submittedAnswers.length === 0) {
    return { submittedCount: 0 };
  }

  const responsesToInsert = submittedAnswers.map((ans) => ({
    userId: authUserId,
    quizId: quizId,
    questionId: ans.questionId,
    selectedAnswerId: ans.selectedAnswerId,
    submittedAt: new Date(),
  }));

  const inserted = await tx
    .insert(schema.userResponses)
    .values(responsesToInsert)
    .returning();

  return { submittedCount: inserted.length, responses: inserted };
}

async function notifyQuizOwner(
  tx: any,
  quizId: string,
  authUserId: string,
  submissionCount: number
) {
  const currentQuizInfoArr = await tx
    .select({
      creatorId: schema.quizzes.creatorId,
      title: schema.quizzes.title,
    })
    .from(schema.quizzes)
    .where(eq(schema.quizzes.id, quizId))
    .limit(1);

  if (currentQuizInfoArr.length > 0) {
    const { creatorId: quizOwnerId, title: quizTitle } = currentQuizInfoArr[0];
    broadcastToUser(quizOwnerId, {
      event: "NEW_QUIZ_RESPONSE",
      payload: {
        quizId: quizId,
        message: `A new response was submitted to your quiz titled '${quizTitle || "Untitled Quiz"}'.`,
        submittedBy: authUserId,
        submissionCount: submissionCount,
      },
    });
  }
}

export const quizRoutes = new Elysia({ prefix: "/quizzes" })
  .use(authPlugin)
  .post(
    "/",
    async (context) => {
      const { body, error, user: authUser } = context;
      const { title, description, questions: inputQuestions } = body;
      let shareCode: string;
      let attempts = 0;
      const maxAttempts = 10;

      while (true) {
        shareCode = generateShareCode();
        const existingQuiz = await db
          .select({ id: schema.quizzes.id })
          .from(schema.quizzes)
          .where(eq(schema.quizzes.shareCode, shareCode))
          .limit(1);
        if (existingQuiz.length === 0) break;
        attempts++;
        if (attempts >= maxAttempts) {
          return error(
            500,
            "Failed to generate a unique share code after several attempts."
          );
        }
      }

      try {
        const createdQuiz = await db.transaction(async (tx) => {
          return createQuizInDb(
            tx,
            authUser.id,
            title,
            description ?? null,
            shareCode,
            inputQuestions
          );
        });
        return createdQuiz;
      } catch (e: any) {
        return error(
          e.message.includes("must have answers") ||
            e.message.includes("Failed to create")
            ? 400
            : 500,
          e.message || "An unexpected error occurred during quiz creation."
        );
      }
    },
    {
      body: createQuizDto,
      response: {
        200: quizDetailsDto,
        400: t.String(),
        500: t.String(),
      },
      detail: {
        summary: "Create a new Quiz",
        tags: ["Quizzes"],
      },
      auth: true,
    }
  )
  .get(
    "/my",
    async ({ error, user: authUser }) => {
      if (!authUser) return error(401, "Unauthorized");
      try {
        const result = await db
          .select({
            id: schema.quizzes.id,
            title: schema.quizzes.title,
            description: schema.quizzes.description,
            shareCode: schema.quizzes.shareCode,
            createdAt: schema.quizzes.createdAt,
          })
          .from(schema.quizzes)
          .where(eq(schema.quizzes.creatorId, authUser.id))
          .orderBy(schema.quizzes.createdAt);
        return result;
      } catch (e: any) {
        return error(500, "Could not fetch user quizzes.");
      }
    },
    {
      response: {
        200: t.Array(
          t.Object({
            id: t.String(),
            title: t.String(),
            description: t.Nullable(t.String()),
            shareCode: t.String(),
            createdAt: t.Date(),
          })
        ),
        401: t.String(),
        500: t.String(),
      },
      detail: {
        summary: "Get Quizzes Created by User",
        tags: ["Quizzes"],
      },
      auth: true,
    }
  )
  .get(
    "/:quizId",
    async ({ params, error, user: authUser }) => {
      const quizId = params.quizId;
      if (!authUser) return error(401, "Unauthorized");

      try {
        const quizData = await db
          .select()
          .from(schema.quizzes)
          .where(and(eq(schema.quizzes.id, quizId)))
          .limit(1);

        if (quizData.length === 0) {
          return error(404, "Quiz not found");
        }
        const currentQuiz = quizData[0];

        const fetchedQuestions = await db
          .select()
          .from(schema.questions)
          .where(eq(schema.questions.quizId, currentQuiz.id))
          .orderBy(schema.questions.order);

        const questionDetailsList: QuestionDetails[] = [];
        for (const q of fetchedQuestions) {
          const questionAnswers: AnswerDetails[] = await db
            .select({
              id: schema.answers.id,
              text: schema.answers.text,
              vibeLabel: schema.answers.vibeLabel,
            })
            .from(schema.answers)
            .where(eq(schema.answers.questionId, q.id));
          questionDetailsList.push({
            ...q,
            order: q.order ?? 0,
            answers: questionAnswers,
          });
        }

        const result: QuizDetails = {
          id: currentQuiz.id,
          creatorId: currentQuiz.creatorId,
          title: currentQuiz.title,
          description: currentQuiz.description,
          shareCode: currentQuiz.shareCode,
          createdAt: currentQuiz.createdAt,
          questions: questionDetailsList,
        };
        return result;
      } catch (e: any) {
        return error(500, "Could not fetch quiz details.");
      }
    },
    {
      params: t.Object({ quizId: t.String() }),
      response: {
        200: quizDetailsDto,
        401: t.String(),
        404: t.String(),
        500: t.String(),
      },
      detail: {
        summary: "Get Quiz Details by ID",
        tags: ["Quizzes"],
      },
      auth: true,
    }
  )
  .get(
    "/:quizId/responses",
    async ({ params, error, user: authUser }) => {
      const quizId = params.quizId;
      if (!authUser) return error(401, "Unauthorized");

      const quizExistsResult = await db
        .select({ id: schema.quizzes.id })
        .from(schema.quizzes)
        .where(eq(schema.quizzes.id, quizId))
        .limit(1);

      if (quizExistsResult.length === 0) {
        return error(404, "Quiz not found.");
      }

      try {
        const query = sql`
          SELECT
            ur.user_id AS "userId",
            u.name AS "userName",
            ur.submitted_at AS "submittedAt",
            a.vibe_label AS "vibeLabel"
          FROM ${schema.userResponses} ur
          JOIN ${schema.user} u ON ur.user_id = u.id
          JOIN ${schema.answers} a ON ur.selected_answer_id = a.id
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

          if (
            new Date(userAnswer.submittedAt) > new Date(profile.submittedAt)
          ) {
            profile.submittedAt = userAnswer.submittedAt;
          }
        }

        const aggregatedResponses = Array.from(userProfilesMap.values());
        return aggregatedResponses;
      } catch (e: any) {
        return error(500, "Could not fetch quiz responses.");
      }
    },
    {
      params: t.Object({ quizId: t.String() }),
      response: {
        200: quizResponsesDto,
        401: t.String(),
        404: t.String(),
        500: t.String(),
      },
      detail: {
        summary: "Get Quiz Responses by Quiz ID",
        tags: ["Quizzes"],
      },
      auth: true,
    }
  )
  .get(
    "/find-by-code/:shareCode",
    async ({ params, error }) => {
      const { shareCode } = params;
      if (!shareCode || shareCode.trim() === "") {
        return error(400, "Share code cannot be empty.");
      }

      try {
        const quizData = await db
          .select({
            id: schema.quizzes.id,
            title: schema.quizzes.title,
            description: schema.quizzes.description,
          })
          .from(schema.quizzes)
          .where(eq(schema.quizzes.shareCode, shareCode.toUpperCase())) // Match frontend toUpperCase()
          .limit(1);

        if (quizData.length === 0) {
          return error(404, "Quiz not found with this share code.");
        }
        return quizData[0] as QuizInfoByShareCode; // Cast to ensure type match
      } catch (e: any) {
        return error(500, "Could not fetch quiz by share code.");
      }
    },
    {
      params: t.Object({ shareCode: t.String() }),
      response: {
        200: quizInfoByShareCodeDto,
        400: t.String(), // For empty share code
        404: t.String(),
        500: t.String(),
      },
      detail: {
        summary: "Find Quiz by Share Code",
        tags: ["Quizzes"],
      },
      // No auth: true, this is a public endpoint
    }
  )
  .post(
    "/:quizId/submit",
    async ({ params, body, error, user: authUser }) => {
      const { quizId } = params;
      const { answers: submittedAnswers } = body;

      if (!authUser) {
        // This should be caught by the auth: true middleware, but as a safeguard:
        return error(
          401,
          "Unauthorized: User must be logged in to submit answers."
        );
      }

      // Optional: Validate quiz existence first
      const quizExists = await db
        .select({ id: schema.quizzes.id, title: schema.quizzes.title })
        .from(schema.quizzes)
        .where(eq(schema.quizzes.id, quizId))
        .limit(1);

      if (quizExists.length === 0) {
        return error(404, "Quiz not found. Cannot submit answers.");
      }

      try {
        const result = await db.transaction(async (tx) => {
          const submissionResult = await submitQuizAnswersToDb(
            tx,
            authUser.id,
            quizId,
            submittedAnswers
          );
          if (submissionResult.submittedCount > 0) {
            await notifyQuizOwner(
              tx,
              quizId,
              authUser.id,
              submissionResult.submittedCount
            );
          }
          return { submittedCount: submissionResult.submittedCount };
        });

        return {
          message: "Quiz answers submitted successfully.",
          submittedCount: result.submittedCount,
        };
      } catch (e: any) {
        if (e.code === "23503") {
          return error(400, "Invalid question or answer ID provided.");
        }
        return error(
          500,
          "An unexpected error occurred while submitting answers."
        );
      }
    },
    {
      params: t.Object({ quizId: t.String({ format: "uuid" }) }),
      body: quizSubmissionDto,
      response: {
        200: submissionResponseDto,
        400: t.String(), // For invalid input or FK violation
        401: t.String(), // Unauthorized
        404: t.String(), // Quiz not found
        500: t.String(), // Internal server error
      },
      detail: {
        summary: "Submit answers for a Quiz",
        tags: ["Quizzes"],
      },
      auth: true, // Requires authentication
    }
  );
