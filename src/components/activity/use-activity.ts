import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSessionStore } from "@/engine/session-store";
import { $groupChats, $groupClarify } from "@/rooms/group-chat";
import { useValue } from "@/rooms/store";
import {
  buildActivityDashboard,
  type ActivityFilter,
  type ActivitySources,
} from "@/lib/activity-dashboard";
import { collectActivitySources } from "@/lib/activity-sources";

export function useActivity(filter: ActivityFilter) {
  const client = useQueryClient();
  const key = ["activity-dashboard", filter.days];
  const query = useQuery({
    queryKey: key,
    queryFn: () =>
      collectActivitySources(
        filter.days,
        client.getQueryData<ActivitySources>(key),
      ),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
  const threads = useSessionStore((s) => s.threads);
  const rooms = useValue($groupChats),
    prompts = useValue($groupClarify);
  const model = query.data
    ? buildActivityDashboard(query.data, filter, threads, rooms, prompts)
    : null;
  return { ...query, model, rooms };
}
