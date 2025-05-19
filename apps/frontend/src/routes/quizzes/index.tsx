import { createFileRoute, Link } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useUserQuizzesQuery, type UserQuizBasicInfo } from "@/lib/api/quizApi";
import { useSession } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns"; // For formatting dates

export const Route = createFileRoute("/quizzes/")({
  component: QuizzesPage,
});

function QuizCard({ quiz }: { quiz: UserQuizBasicInfo }) {
  return (
    <div className="p-4 border rounded-md shadow-sm bg-card hover:shadow-md transition-shadow">
      <h3 className="text-lg font-semibold text-primary truncate">
        {quiz.title}
      </h3>
      {quiz.description && (
        <p className="text-sm text-muted-foreground mt-1 mb-2 truncate">
          {quiz.description}
        </p>
      )}
      <div className="mt-2 space-y-1">
        <p className="text-xs text-muted-foreground">
          Share Code: <Badge variant="secondary">{quiz.shareCode}</Badge>
        </p>
        <p className="text-xs text-muted-foreground">
          Created: {format(new Date(quiz.createdAt), "MMM d, yyyy - h:mm a")}
        </p>
      </div>
      <div className="mt-3 flex gap-2">
        {/* TODO: Add links/buttons for Edit, Delete etc. */}
        <Button size="sm" variant="outline" asChild>
          <Link to={`/quizzes/$quizId`} params={{ quizId: quiz.id }}>
            View Details
          </Link>
        </Button>
      </div>
    </div>
  );
}

function QuizzesPage() {
  const { data: quizzes, isLoading, isError, error } = useUserQuizzesQuery();

  return (
    <>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight">My Quizzes</h1>
        <Link to="/quizzes/create">
          <Button size="lg">Create New Quiz</Button>
        </Link>
      </div>
      <Tabs defaultValue="created-by-me" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="created-by-me">Created by Me</TabsTrigger>
          <TabsTrigger value="shared-with-me" disabled>
            Shared with Me (Soon!)
          </TabsTrigger>
        </TabsList>
        <TabsContent value="created-by-me">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="p-4 border rounded-md space-y-3">
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-8 w-20 mt-2" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <Alert variant="destructive">
              <AlertTitle>Error Loading Quizzes</AlertTitle>
              <AlertDescription>
                {error?.message || "An unexpected error occurred."}
              </AlertDescription>
            </Alert>
          ) : quizzes && quizzes.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {quizzes.map((quiz) => (
                <QuizCard key={quiz.id} quiz={quiz} />
              ))}
            </div>
          ) : (
            <div className="text-center py-10 border-2 border-dashed border-border rounded-lg bg-card/50">
              <h2 className="text-xl font-semibold text-muted-foreground">
                No Quizzes Found
              </h2>
              <p className="text-muted-foreground mt-2 mb-4">
                You haven't created any quizzes yet.
              </p>
              <Link to="/quizzes/create">
                <Button variant="default">Create Your First Quiz</Button>
              </Link>
            </div>
          )}
        </TabsContent>
        <TabsContent value="shared-with-me">
          <div className="p-6 border rounded-md bg-card">
            <p className="text-muted-foreground text-center">
              This feature is coming soon! You'll be able to see quizzes shared
              with you here.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
