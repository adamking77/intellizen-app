import { lazy, Suspense, type ComponentType } from "react";
import { Navigate, Route, BrowserRouter as Router, Routes } from "react-router-dom";

import { AgentPanelWindow, AppShell } from "@/components/layout/app-shell";

function lazyNamed<TModule extends Record<string, unknown>, TKey extends keyof TModule>(
  loader: () => Promise<TModule>,
  exportName: TKey,
) {
  return lazy(async () => {
    const module = await loader();
    return { default: module[exportName] as ComponentType };
  });
}

const HomeView = lazyNamed(() => import("@/views/Home"), "HomeView");
const SearchView = lazyNamed(() => import("@/views/Search"), "SearchView");
const ProjectsView = lazyNamed(() => import("@/views/Projects"), "ProjectsView");
const GraphView = lazyNamed(() => import("@/views/Graph"), "GraphView");
const CanvasView = lazyNamed(() => import("@/views/Canvas"), "CanvasView");
const DatabasesView = lazyNamed(() => import("@/views/Databases"), "DatabasesView");
const DatabaseEditorView = lazyNamed(() => import("@/views/DatabaseEditor"), "DatabaseEditorView");
const InvestigationView = lazyNamed(
  () => import("@/views/Investigation"),
  "InvestigationView",
);
const ReportsView = lazyNamed(() => import("@/views/Reports"), "ReportsView");

function RouteLoadingFallback() {
  return (
    <div className="flex h-full items-center justify-center p-6 text-sm text-[var(--foreground-dim)]">
      Loading...
    </div>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/agent-panel" element={<AgentPanelWindow />} />
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route
            path="/home"
            element={
              <Suspense fallback={<RouteLoadingFallback />}>
                <HomeView />
              </Suspense>
            }
          />
          <Route path="/inbox" element={<Navigate to="/home" replace />} />
          <Route
            path="/search"
            element={
              <Suspense fallback={<RouteLoadingFallback />}>
                <SearchView />
              </Suspense>
            }
          />
          <Route
            path="/intel"
            element={
              <Suspense fallback={<RouteLoadingFallback />}>
                <ProjectsView />
              </Suspense>
            }
          />
          <Route path="/projects" element={<Navigate to="/intel" replace />} />
          <Route path="/agent-work" element={<Navigate to="/home" replace />} />
          <Route
            path="/workflows"
            element={<Navigate to="/databases/c1000000-0000-0000-0000-000000000001" replace />}
          />
          <Route path="/roles" element={<Navigate to="/home" replace />} />
          <Route path="/monitors" element={<Navigate to="/home" replace />} />
          <Route
            path="/graph"
            element={
              <Suspense fallback={<RouteLoadingFallback />}>
                <GraphView />
              </Suspense>
            }
          />
          <Route
            path="/canvas"
            element={
              <Suspense fallback={<RouteLoadingFallback />}>
                <CanvasView />
              </Suspense>
            }
          />
          <Route
            path="/databases"
            element={
              <Suspense fallback={<RouteLoadingFallback />}>
                <DatabasesView />
              </Suspense>
            }
          />
          <Route
            path="/databases/:id"
            element={
              <Suspense fallback={<RouteLoadingFallback />}>
                <DatabaseEditorView />
              </Suspense>
            }
          />
          <Route
            path="/investigate"
            element={
              <Suspense fallback={<RouteLoadingFallback />}>
                <InvestigationView />
              </Suspense>
            }
          />
          <Route
            path="/docs"
            element={
              <Suspense fallback={<RouteLoadingFallback />}>
                <ReportsView />
              </Suspense>
            }
          />
          <Route path="/reports" element={<Navigate to="/docs" replace />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
