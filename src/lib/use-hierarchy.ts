import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  buildTree,
  createNode,
  deleteNode,
  EMPTY_HIERARCHY,
  listHierarchy,
  moveNode,
  renameNode,
  setFolders,
  type NodeKind,
} from "@/lib/hierarchy";

export const HIERARCHY_QUERY_KEY = ["hierarchy"] as const;

/** The tree plus the five edits the sidebar makes. Every write invalidates
 *  the one query, so the tree re-reads rather than patching itself. */
export function useHierarchy() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: HIERARCHY_QUERY_KEY,
    queryFn: listHierarchy,
    select: buildTree,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: HIERARCHY_QUERY_KEY });

  const create = useMutation({
    mutationFn: (input: { kind: NodeKind; parentId: string | null; name: string }) =>
      createNode(input.kind, input.parentId, input.name),
    onSettled: invalidate,
  });
  const rename = useMutation({
    mutationFn: (input: { id: string; name: string }) => renameNode(input.id, input.name),
    onSettled: invalidate,
  });
  const move = useMutation({
    mutationFn: (input: { id: string; parentId: string | null; position: number }) =>
      moveNode(input.id, input.parentId, input.position),
    onSettled: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteNode(id),
    onSettled: invalidate,
  });
  const folders = useMutation({
    mutationFn: (input: { id: string; folders: string[] }) => setFolders(input.id, input.folders),
    onSettled: invalidate,
  });

  return {
    tree: query.data ?? EMPTY_HIERARCHY,
    isLoading: query.isLoading,
    error: query.error,
    create: create.mutateAsync,
    rename: rename.mutateAsync,
    move: move.mutateAsync,
    remove: remove.mutateAsync,
    setFolders: folders.mutateAsync,
  };
}
