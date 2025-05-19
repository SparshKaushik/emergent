import { createFileRoute } from "@tanstack/react-router";
import { BackgroundLines } from "@/components/ui/background-lines";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  return (
    <BackgroundLines className="bg-background flex flex-col justify-center items-center h-dvh">
      <div className="p-4 sm:p-6 lg:p-8 text-center">
        <h1 className="text-5xl sm:text-7xl lg:text-8xl font-bold tracking-tighter">
          VibeSync
        </h1>
        <p className="mt-4 sm:mt-6 text-lg sm:text-xl lg:text-2xl text-muted-foreground max-w-xl lg:max-w-2xl mx-auto">
          Create real-time vibe check quizzes, share with a code, and see live
          results unfold.
        </p>
      </div>
    </BackgroundLines>
  );
}
