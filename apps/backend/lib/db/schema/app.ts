import { pgTable, text, timestamp, uuid, integer } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const quizzes = pgTable("quizzes", {
  id: uuid("id").defaultRandom().primaryKey(),
  creatorId: text("creator_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  shareCode: text("share_code").notNull().unique(),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

export const questions = pgTable("questions", {
  id: uuid("id").defaultRandom().primaryKey(),
  quizId: uuid("quiz_id")
    .notNull()
    .references(() => quizzes.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  order: integer("order").notNull(),
});

export const answers = pgTable("answers", {
  id: uuid("id").defaultRandom().primaryKey(),
  questionId: uuid("question_id")
    .notNull()
    .references(() => questions.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  vibeLabel: text("vibe_label").notNull(),
});

export const userResponses = pgTable("user_responses", {
  id: uuid("id").defaultRandom().primaryKey(),
  quizId: uuid("quiz_id")
    .notNull()
    .references(() => quizzes.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  questionId: uuid("question_id")
    .notNull()
    .references(() => questions.id, { onDelete: "cascade" }),
  selectedAnswerId: uuid("selected_answer_id")
    .notNull()
    .references(() => answers.id, { onDelete: "cascade" }),
  submittedAt: timestamp("submitted_at")
    .$defaultFn(() => new Date())
    .notNull(),
});
