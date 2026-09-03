import type { SupabaseClient } from "@supabase/supabase-js";

export async function listHierarchy(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .schema("workspace")
    .from("hierarchy_nodes")
    .select("*")
    .order("position")
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}
