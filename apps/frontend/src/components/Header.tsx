import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { signIn, useSession } from "@/lib/auth";
import UserDropdownMenu from "./UserDropdownMenu";
import { Skeleton } from "./ui/skeleton";

export default function Header() {
  const { data: session, isPending } = useSession();

  return (
    <header className="p-4 flex justify-between items-center absolute top-0 z-50 bg-background/5 backdrop-blur-sm w-full">
      <Link to="/" className="text-2xl font-bold text-primary">
        VibeSync
      </Link>
      <nav className="space-x-4 flex items-center">
        {isPending ? (
          <>
            <Skeleton className="w-10 h-10 rounded-full" />
            <Skeleton className="h-10 w-24" />
          </>
        ) : session?.user ? (
          <>
            <Link
              to="/quizzes"
              className="text-sm text-muted-foreground hover:text-primary"
            >
              My Quizzes
            </Link>
            <UserDropdownMenu />
          </>
        ) : (
          <Button
            onClick={() =>
              signIn.social({
                provider: "google",
                callbackURL: window.location.origin + "/",
              })
            }
          >
            Sign In
          </Button>
        )}
      </nav>
    </header>
  );
}
