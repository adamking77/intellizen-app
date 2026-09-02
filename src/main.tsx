import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import App from "@/App";
import { AppErrorBoundary } from "@/components/layout/app-error-boundary";
import "@fontsource-variable/geist";
import "@/index.css";
import { applyTheme, loadTheme } from "@/lib/theme";

const theme = loadTheme();
applyTheme(theme.flavor, theme.accent);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60_000,
      gcTime: 15 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <QueryClientProvider client={queryClient}>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </QueryClientProvider>,
);
