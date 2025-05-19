export interface QuizDetailsFromAPI {
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

export interface UserVibeData {
  vibeDistribution: { [vibeLabel: string]: number };
  totalAnswers: number;
}

export interface LiveUserResponse extends UserVibeData {
  id: string;
  userId: string;
  userName: string | null;
  submittedAt: string;
}

export type WebSocketStatus = "Connecting" | "Open" | "Closed" | "Error";
