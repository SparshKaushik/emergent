import { Outlet, createRootRoute, useLocation } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

import Header from "../components/Header";

const excludedRoutes = ["/", "/quizzes/create"];

export const Route = createRootRoute({
  component: () => {
    const { pathname } = useLocation();

    return (
      <>
        <Header />
        {excludedRoutes.includes(pathname) ? (
          <Outlet />
        ) : (
          <main className="container mx-auto p-4 flex flex-col items-center pt-20 md:pt-24">
            <div className="w-full md:w-3/4 lg:w-1/2">
              <Outlet />
            </div>
          </main>
        )}
        <TanStackRouterDevtools />
        <ReactQueryDevtools />
      </>
    );
  },
});
