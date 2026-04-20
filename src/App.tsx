import { lazy, Suspense, type ComponentType } from "react";
import { Navigate, Route, BrowserRouter as Router, Routes } from "react-router-dom";

import { AppShell } from "@/components/layout/app-shell";

function lazyNamed<TModule extends Record<string, unknown>, TKey extends keyof TModule>(
  loader: () => Promise<TModule>,
  exportName: TKey,
) {
  return lazy(async () => {
    const module = await loader();
    return { default: module[exportName] as ComponentType };
  });
}

const InboxView = lazyNamed(() => import("@/views/Inbox"), "InboxView");
const SearchView = lazyNamed(() => import("@/views/Search"), "SearchView");
const ProjectsView = lazyNamed(() => import("@/views/Projects"), "ProjectsView");
const MonitorsView = lazyNamed(() => import("@/views/Monitors"), "MonitorsView");
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
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/inbox" replace />} />
          <Route
            path="/inbox"
            element={
              <Suspense fallback={<RouteLoadingFallback />}>
                <InboxView />
              </Suspense>
            }
          />
          <Route
            path="/search"
            element={
              <Suspense fallback={<RouteLoadingFallback />}>
                <SearchView />
              </Suspense>
            }
          />
          <Route
            path="/projects"
            element={
              <Suspense fallback={<RouteLoadingFallback />}>
                <ProjectsView />
              </Suspense>
            }
          />
          <Route
            path="/monitors"
            element={
              <Suspense fallback={<RouteLoadingFallback />}>
                <MonitorsView />
              </Suspense>
            }
          />
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
            path="/reports"
            element={
              <Suspense fallback={<RouteLoadingFallback />}>
                <ReportsView />
              </Suspense>
            }
          />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
