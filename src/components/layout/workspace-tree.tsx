import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { open as pickFolder } from "@tauri-apps/plugin-dialog";
import { ChevronRight, Ellipsis, Plus } from "lucide-react";

import { useTreeRoving } from "@/components/layout/use-roving";
import { ProjectSessionTree } from "@/components/project/project-session-tree";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ContextMenu, type ContextMenuItem } from "@/components/ui/context-menu";
import type { DepartmentNode, NodeKind, ProjectNode, WorkspaceNode } from "@/lib/hierarchy";
import { groupSessionsByProject, projectSessionKey } from "@/lib/project-room";
import { toastError } from "@/lib/toast";
import { useHierarchy } from "@/lib/use-hierarchy";
import { cn } from "@/lib/utils";
import { listHermesSessions } from "@/services/hermes-project-sessions";

// The hierarchy in the sidebar: department → workspace → project (recursive).
// Behaviour ported from hermes-app's Tree.tsx; rows reuse the nav's density so
// a destination and a project read as the same kind of place.

const EXPANDED_KEY = "intelizen:tree-expanded";
const INDENT = 12;
const CHILD_KIND: Record<NodeKind, NodeKind | null> = {
  department: "workspace",
  workspace: "project",
  project: "project",
};
const CHILD_LABEL: Record<NodeKind, string> = {
  department: "New workspace",
  workspace: "New project",
  project: "New project",
};

/** What one row needs to know about its node, whatever its kind. */
interface Meta {
  kind: NodeKind;
  id: string;
  name: string;
  parentId: string | null;
  folders: string[];
  childCount: number;
  itemCount?: number;
}

interface MenuState {
  x: number;
  y: number;
  node: Meta;
  returnTo: HTMLElement | null;
}

interface Adding {
  parentId: string | null;
  kind: NodeKind;
}

function routeFor(node: Pick<Meta, "kind" | "id">): string {
  return node.kind === "project" ? `/project/${node.id}` : `/unit/${node.id}`;
}

export function readExpanded(): Set<string> {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(list) ? list.filter((v) => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

function writeExpanded(ids: Set<string>) {
  try {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

/** `/Users/name/x` → `~/x`, for display only. */
export function tildify(path: string): string {
  return path.replace(/^\/Users\/[^/]+(?=\/|$)/, "~");
}

function countProjects(projects: ProjectNode[]): number {
  return projects.reduce((n, p) => n + 1 + countProjects(p.projects), 0);
}

/** "Its 2 workspaces and 5 projects go with it." */
function deleteMessage(node: Meta, tree: { departments: DepartmentNode[] }): string {
  const parts: string[] = [];
  if (node.kind === "department") {
    const d = tree.departments.find((x) => x.id === node.id);
    const ws = d?.workspaces.length ?? 0;
    const ps = d ? d.workspaces.reduce((n, w) => n + countProjects(w.projects), 0) : 0;
    if (ws) parts.push(`${ws} ${ws === 1 ? "workspace" : "workspaces"}`);
    if (ps) parts.push(`${ps} ${ps === 1 ? "project" : "projects"}`);
  } else if (node.kind === "workspace") {
    const w = tree.departments.flatMap((d) => d.workspaces).find((x) => x.id === node.id);
    const ps = w ? countProjects(w.projects) : 0;
    if (ps) parts.push(`${ps} ${ps === 1 ? "project" : "projects"}`);
  } else if (node.childCount) {
    parts.push(`${node.childCount} ${node.childCount === 1 ? "project" : "projects"}`);
  }
  const base = `Delete "${node.name}"?`;
  return parts.length ? `${base} Its ${parts.join(" and ")} go with it.` : `${base} This cannot be undone.`;
}

/** A name being typed in place. Enter commits, Escape abandons, blur commits. */
function NameField({
  initial,
  depth,
  onCommit,
  onCancel,
}: {
  initial: string;
  depth: number;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = () => {
    if (done.current) return;
    done.current = true;
    const value = ref.current?.value.trim() ?? "";
    if (value && value !== initial) onCommit(value);
    else onCancel();
  };

  return (
    <div className="py-px" style={{ paddingLeft: 12 + depth * INDENT }}>
      <input
        ref={ref}
        defaultValue={initial}
        aria-label={initial ? "Rename" : "Name"}
        className={cn(
          "h-7 w-full rounded border border-[var(--accent-border)] bg-[var(--base)] px-2",
          "font-ui text-[var(--t-ui)] text-[var(--text)] placeholder:text-[var(--overlay-0)]",
          "focus:outline-none focus:border-[var(--accent)]",
        )}
        placeholder="Name"
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            done.current = true;
            onCancel();
          }
        }}
      />
    </div>
  );
}

interface RowProps {
  node: Meta;
  depth: number;
  open: boolean;
  selected: boolean;
  dropTarget: boolean;
  onOpenMenu: (node: Meta, x: number, y: number, returnTo: HTMLElement | null) => void;
  onToggle: (id: string) => void;
  onSelect: (node: Meta) => void;
  onRename: (id: string) => void;
  onDragStart: (node: Meta) => void;
  onDragOver: (node: Meta, e: React.DragEvent) => void;
  onDrop: (node: Meta) => void;
  onDragEnd: () => void;
}

/** One row. Everything that differs between kinds is passed in. */
function Row({
  node,
  depth,
  open,
  selected,
  dropTarget,
  onOpenMenu,
  onToggle,
  onSelect,
  onRename,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: RowProps) {
  const hasChildren = (node.itemCount ?? node.childCount) > 0;
  const folder = node.folders[0];
  return (
    <div
      role="treeitem"
      tabIndex={-1}
      data-id={node.id}
      data-parent={node.parentId ?? undefined}
      aria-selected={selected}
      aria-expanded={hasChildren ? open : undefined}
      aria-label={node.name}
      title={folder ? tildify(folder) : undefined}
      draggable={node.kind === "project"}
      style={{ paddingLeft: 4 + depth * INDENT }}
      className={cn(
        "nav-node group h-8 select-none",
        dropTarget && "ring-1 ring-[var(--accent)]",
      )}
      onClick={() => onSelect(node)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onRename(node.id);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onOpenMenu(node, e.clientX, e.clientY, e.currentTarget);
      }}
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.setData("text/plain", node.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(node);
      }}
      onDragOver={(e) => onDragOver(node, e)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDrop(node);
      }}
      onDragEnd={onDragEnd}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        disabled={!hasChildren}
        onClick={(e) => {
          e.stopPropagation();
          onToggle(node.id);
        }}
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--overlay-1)]",
          hasChildren ? "hover:text-[var(--text)]" : "invisible",
        )}
      >
        <ChevronRight
          strokeWidth={2}
          className={cn(
            "h-3 w-3 transition-transform duration-[var(--t-base)] ease-[var(--ease)]",
            open && "rotate-90",
          )}
        />
      </button>
      <span className="min-w-0 flex-1 truncate">{node.name}</span>
      {(node.itemCount ?? 0) > 0 ? <span className="text-meta">{node.itemCount}</span> : null}
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Actions for ${node.name}`}
        aria-haspopup="menu"
        onClick={(e) => {
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          onOpenMenu(node, r.left, r.bottom + 2, e.currentTarget.parentElement);
        }}
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--overlay-1)]",
          "opacity-0 transition-opacity duration-[var(--t-base)] ease-[var(--ease)] group-hover:opacity-100 group-focus-within:opacity-100",
          "hover:bg-[var(--base)] hover:text-[var(--text)]",
        )}
      >
        <Ellipsis className="h-3.5 w-3.5" strokeWidth={1.5} />
      </button>
    </div>
  );
}

export function WorkspaceTree() {
  const { tree, isLoading, error, create, rename, move, remove, setFolders } = useHierarchy();
  const location = useLocation();
  const navigate = useNavigate();
  const roving = useTreeRoving();
  const allSessions = useQuery({
    queryKey: ["hermes-sessions", "project-room"],
    queryFn: listHermesSessions,
    retry: false,
  });
  const sessionGroups = useMemo(
    () => groupSessionsByProject(tree, allSessions.data ?? []),
    [allSessions.data, tree],
  );
  const selectedSessionKey = new URLSearchParams(location.search).get("session");

  const [expanded, setExpanded] = useState<Set<string>>(readExpanded);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState<Adding | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [confirming, setConfirming] = useState<Meta | null>(null);
  const [dragging, setDragging] = useState<Meta | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const metas = useRef(new Map<string, Meta>());
  const remember = (meta: Meta) => metas.current.set(meta.id, meta);

  useEffect(() => writeExpanded(expanded), [expanded]);

  const expand = useCallback((id: string, on?: boolean) => {
    setExpanded((all) => {
      const next = new Set(all);
      const to = on ?? !next.has(id);
      if (to) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const closeMenu = useCallback(() => {
    setMenu((m) => {
      m?.returnTo?.focus();
      return null;
    });
  }, []);

  const select = (node: Meta) => {
    navigate(routeFor(node));
    if ((node.itemCount ?? node.childCount) > 0 && !expanded.has(node.id)) expand(node.id, true);
  };

  const startAdding = (parent: Meta | null) => {
    const kind = parent ? CHILD_KIND[parent.kind] : "department";
    if (!kind) return;
    if (parent) expand(parent.id, true);
    setAdding({ parentId: parent?.id ?? null, kind });
  };

  const chooseFolder = async (node: Meta) => {
    const picked = await pickFolder({ directory: true, multiple: false }).catch((err: unknown) => {
      toastError("Couldn't open the folder picker", err);
      return null;
    });
    if (typeof picked !== "string" || node.folders[0] === picked) return;
    await setFolders({ id: node.id, folders: [picked] }).catch((err) =>
      toastError("Couldn't set the folder", err),
    );
  };

  const confirmDelete = async () => {
    const node = confirming;
    setConfirming(null);
    if (!node) return;
    await remove(node.id).catch((err) => toastError("Couldn't delete", err));
    if (location.pathname.startsWith(routeFor(node))) navigate("/home");
  };

  const dropAccepts = (target: Meta) =>
    !!dragging &&
    dragging.kind === "project" &&
    dragging.id !== target.id &&
    dragging.id !== target.parentId &&
    target.kind !== "department";

  const onDragOver = (target: Meta, e: React.DragEvent) => {
    if (!dropAccepts(target)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setOver(target.id);
  };

  const onDrop = async (target: Meta) => {
    const moving = dragging;
    setDragging(null);
    setOver(null);
    if (!moving || !dropAccepts(target)) return;
    if (isInside(tree.departments, moving.id, target.id)) return;
    expand(target.id, true);
    await move({ id: moving.id, parentId: target.id, position: target.childCount }).catch((err) =>
      toastError("Couldn't move", err),
    );
  };

  const menuItems = (node: Meta): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [
      { label: CHILD_LABEL[node.kind], onSelect: () => startAdding(node) },
      { label: "Rename", onSelect: () => setEditing(node.id) },
    ];
    if (node.kind === "project") items.push({ label: "Set folder…", onSelect: () => void chooseFolder(node) });
    items.push({ label: "Delete", variant: "danger", onSelect: () => setConfirming(node) });
    return items;
  };

  const rowProps = (node: Meta, depth: number): RowProps => ({
    node,
    depth,
    open: expanded.has(node.id),
    selected: location.pathname === routeFor(node),
    dropTarget: over === node.id && dropAccepts(node),
    onOpenMenu: (n: Meta, x: number, y: number, returnTo: HTMLElement | null) =>
      setMenu({ node: n, x, y, returnTo }),
    onToggle: (id: string) => expand(id),
    onSelect: select,
    onRename: setEditing,
    onDragStart: setDragging,
    onDragOver,
    onDrop: (n: Meta) => void onDrop(n),
    onDragEnd: () => {
      setDragging(null);
      setOver(null);
    },
  });

  const nameField = (node: Meta, depth: number) =>
    editing === node.id ? (
      <NameField
        key={node.id}
        initial={node.name}
        depth={depth}
        onCommit={(name) => {
          setEditing(null);
          void rename({ id: node.id, name }).catch((err) => toastError("Couldn't rename", err));
          roving.focusRow(node.id);
        }}
        onCancel={() => {
          setEditing(null);
          roving.focusRow(node.id);
        }}
      />
    ) : null;

  const addField = (parentId: string | null, depth: number) =>
    adding && adding.parentId === parentId ? (
      <NameField
        key={`add:${parentId ?? "root"}`}
        initial=""
        depth={depth}
        onCommit={(name) => {
          setAdding(null);
          void create({ kind: adding.kind, parentId, name }).catch((err) =>
            toastError("Couldn't create", err),
          );
        }}
        onCancel={() => {
          setAdding(null);
          roving.focusRow(parentId);
        }}
      />
    ) : null;

  /** One node plus, when open or receiving a new child, its group. */
  const branch = (meta: Meta, depth: number, kids: () => React.ReactNode) => {
    remember(meta);
    const open = expanded.has(meta.id);
    return (
      <div key={meta.id} role="none">
        {nameField(meta, depth) ?? <Row {...rowProps(meta, depth)} />}
        {open || adding?.parentId === meta.id ? (
          <div role="group">
            {open ? kids() : null}
            {addField(meta.id, depth + 1)}
          </div>
        ) : null}
      </div>
    );
  };

  const renderProjects = (projects: ProjectNode[], parentId: string, depth: number): React.ReactNode[] =>
    projects.map((p) => {
      const sessions = sessionGroups.get(p.id) ?? [];
      return branch(
        {
          kind: "project",
          id: p.id,
          name: p.name,
          parentId,
          folders: p.folders,
          childCount: p.projects.length,
          itemCount: p.projects.length + sessions.length,
        },
        depth,
        () => (
          <>
            {renderProjects(p.projects, p.id, depth + 1)}
            <ProjectSessionTree
              depth={depth + 1}
              projectId={p.id}
              selectedKey={location.pathname === `/project/${p.id}` ? selectedSessionKey : null}
              sessions={sessions}
              onSelect={(session) => {
                const params = new URLSearchParams({ tab: "sessions", session: projectSessionKey(session) });
                navigate(`/project/${p.id}?${params.toString()}`);
              }}
            />
          </>
        ),
      );
    });

  const renderWorkspace = (w: WorkspaceNode, parentId: string) =>
    branch(
      { kind: "workspace", id: w.id, name: w.name, parentId, folders: [], childCount: w.projects.length },
      1,
      () => renderProjects(w.projects, w.id, 2),
    );

  const renderDepartment = (d: DepartmentNode) =>
    branch(
      { kind: "department", id: d.id, name: d.name, parentId: null, folders: [], childCount: d.workspaces.length },
      0,
      () => d.workspaces.map((w) => renderWorkspace(w, d.id)),
    );

  const onTreeKeyDown = (e: React.KeyboardEvent) => {
    if (roving.onKeyDown(e)) return;
    const row = (e.target as HTMLElement).closest<HTMLElement>('[role="treeitem"]');
    if (!row) return;
    const id = row.dataset.id ?? "";
    const expandable = row.hasAttribute("aria-expanded");
    const isOpen = row.getAttribute("aria-expanded") === "true";
    if (e.key === "ArrowRight") {
      e.preventDefault();
      if (expandable && !isOpen) expand(id, true);
      else if (isOpen) roving.onKeyDown({ ...e, key: "ArrowDown" } as React.KeyboardEvent);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (isOpen) expand(id, false);
      else roving.focusRow(row.dataset.parent ?? null);
    } else if (e.key === "Enter") {
      e.preventDefault();
      row.click();
    } else if (e.key === "F2") {
      e.preventDefault();
      setEditing(id);
    } else if (e.key === "Delete" && metas.current.has(id)) {
      e.preventDefault();
      setConfirming(metas.current.get(id) ?? null);
    } else if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
      e.preventDefault();
      const r = row.getBoundingClientRect();
      const node = metas.current.get(id);
      if (node) setMenu({ node, x: r.left + 24, y: r.bottom, returnTo: row });
    }
  };

  const empty = !isLoading && !error && tree.departments.length === 0 && !adding;

  return (
    <div className="flex flex-col">
      <div className="flex h-7 items-center justify-between pl-4 pr-1">
        <span className="font-ui text-[var(--t-count)] font-light uppercase tracking-[0.18em] text-[var(--overlay-1)]">
          Workspace
        </span>
        <button
          type="button"
          aria-label="New department"
          title="New department"
          onClick={() => startAdding(null)}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-[var(--r-pill)] text-[var(--overlay-1)]",
            "transition-colors duration-[var(--t-base)] ease-[var(--ease)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]",
          )}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      </div>

      {error ? (
        <p role="alert" className="px-4 py-1.5 font-ui text-[var(--t-meta)] leading-4 text-[var(--danger)]">
          Couldn't load the tree: {error.message}
        </p>
      ) : null}
      {isLoading ? (
        <p className="px-4 py-1.5 font-ui text-[var(--t-meta)] text-[var(--overlay-1)]">Loading…</p>
      ) : null}

      <div
        ref={roving.ref}
        role="tree"
        aria-label="Workspace"
        className="flex flex-col gap-px"
        onKeyDown={onTreeKeyDown}
        onDragLeave={() => setOver(null)}
      >
        {tree.departments.map(renderDepartment)}
        {addField(null, 0)}
        {empty ? (
          <button
            type="button"
            onClick={() => startAdding(null)}
            className="rounded px-4 py-1.5 text-left font-ui text-[var(--t-meta)] text-[var(--overlay-1)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
          >
            Add a department to begin
          </button>
        ) : null}
      </div>

      {menu ? (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.node)} onClose={closeMenu} />
      ) : null}

      <ConfirmDialog
        open={confirming !== null}
        title={confirming ? `Delete ${confirming.kind}` : "Delete"}
        message={confirming ? deleteMessage(confirming, tree) : ""}
        confirmLabel="Delete"
        danger
        onConfirm={() => void confirmDelete()}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}

/** Whether `targetId` sits inside the subtree rooted at `nodeId`. */
function isInside(departments: DepartmentNode[], nodeId: string, targetId: string): boolean {
  const walk = (projects: ProjectNode[]): boolean =>
    projects.some((p) => p.id === nodeId ? contains(p, targetId) : walk(p.projects));
  return departments.some((d) => d.workspaces.some((w) => walk(w.projects)));
}

function contains(p: ProjectNode, id: string): boolean {
  return p.projects.some((c) => c.id === id || contains(c, id));
}
