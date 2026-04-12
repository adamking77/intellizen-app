import { Navigate, Route, BrowserRouter as Router, Routes } from "react-router-dom";

import { AppShell } from "@/components/layout/app-shell";
import { GraphView } from "@/views/Graph";
import { InboxView } from "@/views/Inbox";
import { InvestigationView } from "@/views/Investigation";
import { MonitorsView } from "@/views/Monitors";
import { ProjectsView } from "@/views/Projects";
import { ReportsView } from "@/views/Reports";
import { SearchView } from "@/views/Search";

function App() {
  return (
    <Router>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/inbox" replace />} />
          <Route path="/inbox" element={<InboxView />} />
          <Route path="/search" element={<SearchView />} />
          <Route path="/projects" element={<ProjectsView />} />
          <Route path="/monitors" element={<MonitorsView />} />
          <Route path="/graph" element={<GraphView />} />
          <Route path="/investigate" element={<InvestigationView />} />
          <Route path="/reports" element={<ReportsView />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
