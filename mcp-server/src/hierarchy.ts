import type { SupabaseClient } from "@supabase/supabase-js";

export type NodeKind = "department" | "workspace" | "project";

export interface HierarchyNode {
  id: string;
  kind: NodeKind;
  parent_id: string | null;
  name: string;
  folders: string[];
  position: number;
}

export async function listHierarchy(supabase: SupabaseClient): Promise<HierarchyNode[]> {
  const { data, error } = await supabase
    .schema("workspace")
    .from("hierarchy_nodes")
    .select("*")
    .order("position")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as HierarchyNode[];
}
