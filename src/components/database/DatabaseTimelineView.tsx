import { EmptyState } from "@/components/ui/empty-state";
import type {
  WorkspaceDatabaseModel,
  WorkspaceDatabaseFieldValue,
} from "@/lib/types";

interface DatabaseTimelineViewProps {
  database: WorkspaceDatabaseModel;
  view: WorkspaceDatabaseModel["views"][number];
  onOpenRecord?: (recordId: string) => void;
  onUpdateField?: (recordId: string, fieldId: string, value: WorkspaceDatabaseFieldValue) => void;
}

export function DatabaseTimelineView(_props: DatabaseTimelineViewProps) {
  return (
    <EmptyState
      title="Timeline rebuilding"
      description="The timeline view is being rebuilt with a new charting library. Coming back shortly."
    />
  );
}
