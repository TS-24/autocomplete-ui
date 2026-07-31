import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { runMigrations } from "./db/migrate";
import { ensureSeedData } from "./db/repo/settings.repo";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const router = createRouter({
  routeTree,
  context: { queryClient },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

async function bootstrap(): Promise<void> {
  await runMigrations();
  await ensureSeedData();
  const root = document.getElementById("root")!;
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  );
}

bootstrap().catch((e) => {
  console.error("bootstrap failed", e);
  const root = document.getElementById("root")!;
  root.innerHTML = `<div style="padding:2rem;font-family:system-ui;color:#e4e4e7">
    <h1 style="font-size:1.2rem">Startup failed</h1>
    <pre style="white-space:pre-wrap;color:#a1a1aa">${String(e)}</pre></div>`;
});
