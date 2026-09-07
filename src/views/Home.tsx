import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Layout } from "react-grid-layout";
import { Plus, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { Choices } from "@/components/ui/choices";
import { WorkflowApprovalCard } from "@/components/workflows/workflow-approval-card";
import { Control } from "@/components/ui/control";
import { DecisionCard } from "@/components/agent/decision-card";
import { Pulse, type PulseTrace } from "@/components/activity/pulse";
import { Sentence } from "@/components/home/sentence";
import { Dock } from "@/components/layout/dock";

import {
  PinnedViewGrid,
  type PinnedDatabaseWidgetModel,
  type PinnedHomeWidgetModel,
} from "@/components/home/pinned-view-grid";
import {
  loadHomePins,
  createDatabaseHomePin,
  createPluginHomePin,
  isDatabaseViewHomePin,
  isGenuiHomePin,
  isInstrumentHomePin,
  isPluginHomePin,
  patchHomePinPlacements,
  patchHomePinMetadata,
  removeHomePinById,
  restoreHomePin,
  pinsForDashboard,
  saveHomePins,
  supportsPinnedHomeView,
  type HomePin,
  type HomePinPlacement,
} from "@/lib/home-pins";
import { mutateAuthoritativeHomePins } from "@/lib/home-pin-mutations";
import { loadGenuiPins, migrateLegacyGenuiPins } from "@/lib/genui-pins";
import { buildHomeWidgetPresets, isHomeWidgetPresetPinned, type HomeWidgetPreset } from "@/lib/home-widget-presets";
import {
  loadHomeDashboardLayout,
  mergeHomeDashboardLayout,
  pinnedDatabaseRecordPath,
  saveHomeDashboardLayout,
  type HomeDashboardLayoutItem,
} from "@/lib/home-dashboard";
import {
  listHomePinsFromWorkspace,
  listWorkspaceDatabaseCatalog,
  saveHomePinsToWorkspace,
} from "@/lib/data";
import { useAppStore } from "@/store";
import { toast } from "@/lib/toast";
import { useStringListPreference } from "@/lib/settings-preferences";
import { SET_ASIDE_MATERIALS_KEY, useRestingAgents, useSessionMode, type SessionMode } from "@/lib/session-mode";
import { useActivity } from "@/components/activity/use-activity";
import { DEFAULT_ACTIVITY_FILTER } from "@/lib/activity-dashboard";
import { listWorkEvents } from "@/lib/data/work-receipts";
import { useSessionStore } from "@/engine/session-store";
import { $groupChats, $groupClarify } from "@/rooms/group-chat";
import { useValue } from "@/rooms/store";
import { runRoomAction } from "@/components/agent/panel-room";
import type { ApprovalChoice } from "@/engine/contract";
import type { ApprovalDecision, ClarifyDecision } from "@/engine/transcript";
import { GENZEN_WORKSPACE_DATABASE_IDS, listWorkspaceDatabaseRecordFields, listWorkflowRuns, resolveWorkflowApproval } from "@/lib/data";
import {
  activitySentence,
  collectHomeQuestions,
  filterRestingActivity,
  filterRestingHomeQuestions,
  filterSetAsideHomeTasks,
  groupTasksByTrigger,
  projectHomeTasks,
  sourceProblems,
  workflowApprovalFollowUpWarning,
  type HomeQuestion,
  type HomeTask,
} from "@/lib/home-availability";
import type { HierarchyNode } from "@/lib/hierarchy";
import {
  clearLegacyPluginWidgetKeys,
  parseWidgetKey,
  PluginWidgetMenuItems,
  readLegacyPluginWidgetKeys,
} from "@/plugins/home-widgets";

export function HomeView() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const entityFilter = useAppStore((state) => state.entityFilter);
  const [pins, setPins] = useState<HomePin[]>(() => loadHomePins());
  const [layout, setLayout] = useState<HomeDashboardLayoutItem[]>(() => loadHomeDashboardLayout());
  const [widgetPickerOpen, setWidgetPickerOpen] = useState(false);
  const sessionMode = useSessionMode();
  const quietAgents = useRestingAgents();
  const [setAsideMaterialIds, setSetAsideMaterialIds] = useStringListPreference(SET_ASIDE_MATERIALS_KEY);
  const [gridOpen, setGridOpen] = useState(false);
  const [questionAttempt, setQuestionAttempt] = useState<string | null>(null);
  const [questionError, setQuestionError] = useState<{ key: string; message: string } | null>(null);
  const [lastVisit] = useState(readHomeLastVisit);
  const visitedAt = useRef(Date.now());
  const pinMutationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const legacyGenuiMigrationStartedRef = useRef(false);
  const legacyPluginMigrationStartedRef = useRef(false);
  const {
    data: catalog = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["workspace-database-catalog", entityFilter],
    queryFn: () => listWorkspaceDatabaseCatalog({ entity: entityFilter }),
    staleTime: 0,
    refetchOnMount: "always",
    networkMode: "always",
  });
  const activity = useActivity(DEFAULT_ACTIVITY_FILTER);
  const threads = useSessionStore((state) => state.threads);
  const profiles = useSessionStore((state) => state.profileDirectory);
  const rooms = useValue($groupChats);
  const prompts = useValue($groupClarify);
  const events = useQuery({
    queryKey: ["home-work-events", lastVisit],
    queryFn: () => listWorkEvents({ since: lastVisit!, limit: 100 }),
    enabled: Boolean(lastVisit),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
  const tasks = useQuery({
    queryKey: ["home-tasks"],
    queryFn: () => listWorkspaceDatabaseRecordFields(GENZEN_WORKSPACE_DATABASE_IDS.tasks),
    staleTime: 10_000,
  });

  useEffect(() => () => writeHomeLastVisit(visitedAt.current), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !(event.metaKey || event.ctrlKey) || event.key !== ".") return;
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.closest("input, textarea, select"))) return;
      event.preventDefault();
      setGridOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const allQuestions = useMemo(() => collectHomeQuestions({ threads, profiles, rooms, prompts, runs: activity.data?.runs.data ?? [] }), [threads, profiles, rooms, prompts, activity.data?.runs.data]);
  const questions = useMemo(() => filterRestingHomeQuestions(allQuestions, rooms, quietAgents.restingAgents), [allQuestions, rooms, quietAgents.restingAgents]);
  const visibleActivity = useMemo(() => filterRestingActivity(activity.model, rooms, quietAgents.restingAgents), [activity.model, rooms, quietAgents.restingAgents]);
  const activityErrors = useMemo(
    () => activity.data ? sourceProblems(activity.data, events.error) : events.error ? [errorDescription(events.error)] : [],
    [activity.data, events.error],
  );
  const availability = useMemo(
    () => activitySentence({
      model: visibleActivity,
      questions,
      events: events.data,
      eventsState: lastVisit ? events.isPending ? "loading" : "ready" : "unseen",
      sourceErrors: activityErrors,
    }),
    [visibleActivity, questions, lastVisit, events.data, events.isPending, activityErrors],
  );
  const rawHierarchy = activity.data?.hierarchy.data ?? null;
  const activeTraces = useMemo<PulseTrace[]>(() => {
    const seen = new Set<string>();
    return visibleActivity?.progress.flatMap((item) => {
      if (item.target.type === "profile") {
        const id = `profile:${item.target.id}`;
        if (seen.has(id)) return [];
        seen.add(id);
        return [{ id, color: profiles[item.target.id]?.avatarColor }];
      }
      if (item.target.type === "room") {
        const room = rooms[item.target.id];
        const turn = room?.running && room.turn ? room.turn : null;
        if (!turn) return [];
        const id = `room:${item.target.id}:${turn}`;
        if (seen.has(id)) return [];
        seen.add(id);
        const member = room.members?.find((candidate) => candidate.name === turn);
        return [{ id, color: member?.avatar_color }];
      }
      return [];
    }) ?? [];
  }, [visibleActivity, profiles, rooms]);
  const [taskScope, setTaskScope] = useState<string | null>(null);
  const setAsideProjectId = useMemo(
    () => rawHierarchy?.find((node) => node.id === taskScope && node.kind === "project")?.id ?? null,
    [rawHierarchy, taskScope],
  );
  const aside = Boolean(setAsideProjectId && setAsideMaterialIds.includes(setAsideProjectId));
  const setAside = useCallback(() => {
    if (!setAsideProjectId) return;
    setSetAsideMaterialIds(Array.from(new Set([...setAsideMaterialIds, setAsideProjectId])));
  }, [setAsideMaterialIds, setAsideProjectId, setSetAsideMaterialIds]);
  const restoreAside = useCallback(() => {
    if (!setAsideProjectId) return;
    setSetAsideMaterialIds(setAsideMaterialIds.filter((id) => id !== setAsideProjectId));
  }, [setAsideMaterialIds, setAsideProjectId, setSetAsideMaterialIds]);
  const restoreSetAsideMaterial = useCallback((id: string) => {
    setSetAsideMaterialIds(setAsideMaterialIds.filter((materialId) => materialId !== id));
  }, [setAsideMaterialIds, setSetAsideMaterialIds]);
  const mode = sessionMode.mode ?? "thinking";
  const availabilityOpen = sessionMode.ready && sessionMode.mode === null;
  const chooseMode = useCallback((next: SessionMode) => {
    if (!sessionMode.ready) return;
    sessionMode.setMode(next);
    sessionMode.setLastAvailabilityAnswer(next);
  }, [sessionMode]);
  const homeTasks = useMemo(
    () => projectHomeTasks(tasks.data?.records ?? [], rawHierarchy, taskScope),
    [tasks.data?.records, rawHierarchy, taskScope],
  );
  const visibleHomeTasks = useMemo(
    () => filterSetAsideHomeTasks(homeTasks, rawHierarchy, setAsideMaterialIds),
    [homeTasks, rawHierarchy, setAsideMaterialIds],
  );
  const taskGroups = useMemo(() => groupTasksByTrigger(visibleHomeTasks), [visibleHomeTasks]);
  const keepingOut = useMemo(() => visibleHomeTasks.filter((task) => task.keepingOut), [visibleHomeTasks]);
  const setAsideProjects = useMemo(
    () => setAsideMaterialIds.map((id) => ({ id, name: rawHierarchy?.find((node) => node.id === id && node.kind === "project")?.name ?? id })),
    [rawHierarchy, setAsideMaterialIds],
  );

  const answerQuestion = useCallback(async (
    question: HomeQuestion,
    answer: HomeQuestionAnswer,
  ) => {
    setQuestionAttempt(question.key);
    setQuestionError(null);
    try {
      if (question.source === "profile") {
        const current = useSessionStore.getState().threads[question.profile];
        const sessionId = current?.sessionId ?? current?.storedSessionId ?? null;
        if (sessionId !== question.sessionId || !current?.transcript.pending.some((pending) => pending.requestId === question.decision.requestId)) throw new Error("That request is no longer pending in this session.");
        if (answer.kind === "approval") await useSessionStore.getState().decideApproval(question.profile, answer.decision, answer.choice);
        else if (answer.kind === "clarify") await useSessionStore.getState().decideClarify(question.profile, answer.decision, answer.answers);
        else throw new Error("That workflow answer does not belong to this session.");
      } else if (question.source === "room" && answer.kind === "approval") {
        await runRoomAction({ type: "room-approve", roomId: question.roomId, memberKey: question.memberKey, requestId: answer.decision.requestId, choice: answer.choice });
      } else if (question.source === "room" && answer.kind === "clarify") {
        await runRoomAction({ type: "room-clarify", roomId: question.roomId, memberKey: question.memberKey, requestId: answer.decision.requestId, answers: answer.answers });
      } else if (question.source === "room") {
        throw new Error("That workflow answer does not belong to this room.");
      } else if (answer.kind === "workflow") {
        const current = collectHomeQuestions({ threads: {}, profiles: {}, rooms: {}, prompts: {}, runs: await listWorkflowRuns({ status: "Needs approval", limit: 100 }) }).find((candidate) => candidate.key === question.key);
        if (!current || current.source !== "workflow") throw new Error("That workflow approval is no longer pending.");
        const resolution = await resolveWorkflowApproval({
          workflowRunId: question.runId,
          decision: answer.decision,
          decisionSummary: answer.summary,
          decidedBy: "Adam",
          expectedRunVersion: question.runVersion,
          expectedStepId: question.currentStepId,
          approvalId: question.approvalId,
          expectedPayloadHash: question.payloadHash,
          decisionRole: question.decisionRole ?? undefined,
          expectedUpdatedAt: question.updatedAt,
          confirmWrite: true,
        });
        const followUpWarning = workflowApprovalFollowUpWarning(resolution);
        if (followUpWarning) toast.info("Workflow approval recorded", { description: followUpWarning });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["activity-dashboard"] }),
          queryClient.invalidateQueries({ queryKey: ["workflow-runs"] }),
          queryClient.invalidateQueries({ queryKey: ["home-work-events"] }),
          queryClient.invalidateQueries({ queryKey: ["home-tasks"] }),
        ]);
      } else {
        throw new Error("That conversation answer does not belong to this workflow.");
      }
    } catch (answerError) {
      setQuestionError({ key: question.key, message: errorDescription(answerError) });
    } finally {
      setQuestionAttempt((current) => current === question.key ? null : current);
    }
  }, []);
  const {
    data: workspacePins,
    isLoading: isLoadingPins,
    error: pinsError,
  } = useQuery({
    queryKey: ["home-pins"],
    // Remote pins are authoritative, including an empty list. Restoring local
    // cache when remote is empty resurrects widgets after a confirmed unpin.
    queryFn: listHomePinsFromWorkspace,
    staleTime: 0,
    refetchOnMount: "always",
    networkMode: "always",
  });

  useEffect(() => {
    saveHomePins(pins);
  }, [pins]);

  useEffect(() => {
    saveHomeDashboardLayout(layout);
  }, [layout]);

  const pinnedWidgets = useMemo<PinnedHomeWidgetModel[]>(() => {
    const catalogById = new Map(catalog.map((entry) => [entry.id, entry]));
    return pinsForDashboard(pins, "home")
      .map((pin): PinnedHomeWidgetModel | null => {
        if (isGenuiHomePin(pin)) return { kind: "genui", pin };
        if (isPluginHomePin(pin)) return { kind: "plugin", pin };
        if (isInstrumentHomePin(pin)) return { kind: "instrument", pin };
        const database = catalogById.get(pin.databaseId);
        const view = database?.views.find((candidate) => candidate.id === pin.viewId);
        if (!database || !view || !supportsPinnedHomeView(view.type)) return null;
        return { kind: "database-view", pin, database, view } satisfies PinnedDatabaseWidgetModel;
      })
      .filter((widget): widget is PinnedHomeWidgetModel => Boolean(widget));
  }, [catalog, pins]);

  const widgetPresets = useMemo(() => buildHomeWidgetPresets(catalog), [catalog]);
  const homePins = useMemo(() => pinsForDashboard(pins, "home"), [pins]);
  const databasePins = useMemo(() => homePins.filter(isDatabaseViewHomePin), [homePins]);

  useEffect(() => {
    const validIds = new Set(pinnedWidgets.map((widget) => widget.pin.id));
    // A remote pin can arrive before the catalog refresh that contains its
    // newly created view. Keep unresolved pins in source state; deleting them
    // here races MCP writes and silently removes valid dashboard widgets.
    if (layout.some((item) => !validIds.has(item.id))) {
      setLayout((current) => current.filter((item) => validIds.has(item.id)));
    }
  }, [layout, pinnedWidgets]);

  const gridLayout = useMemo<Layout>(
    () =>
      mergeHomeDashboardLayout(
        pinnedWidgets.map((widget) => widget.pin),
        layout,
      ).map((item) => ({
        i: item.id,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        minW: 4,
        minH: 8,
      })),
    [layout, pinnedWidgets],
  );

  const applyAuthoritativePins = useCallback((nextPins: HomePin[]) => {
    const nextLayout = pinsForDashboard(nextPins, "home").map((pin) => ({
      id: pin.id,
      x: pin.x,
      y: pin.y,
      w: pin.w,
      h: pin.h,
    }));
    setPins(nextPins);
    setLayout(nextLayout);
    saveHomePins(nextPins);
    queryClient.setQueryData(["home-pins"], nextPins);
  }, [queryClient]);

  useEffect(() => {
    if (!workspacePins) return;
    applyAuthoritativePins(workspacePins);
  }, [applyAuthoritativePins, workspacePins]);

  useEffect(() => {
    if (!workspacePins || legacyGenuiMigrationStartedRef.current || loadGenuiPins().length === 0) return;
    legacyGenuiMigrationStartedRef.current = true;
    void migrateLegacyGenuiPins({
      read: listHomePinsFromWorkspace,
      write: saveHomePinsToWorkspace,
    }).then((authoritativeGenuiPins) => {
      if (authoritativeGenuiPins.length > 0) {
        void queryClient.invalidateQueries({ queryKey: ["home-pins"] });
      }
    }).catch((migrationError) => {
      legacyGenuiMigrationStartedRef.current = false;
      toast.error("Generated widgets could not be moved to shared Home Pins", {
        description: errorDescription(migrationError),
      });
    });
  }, [queryClient, workspacePins]);

  useEffect(() => {
    const legacyKeys = readLegacyPluginWidgetKeys();
    if (!workspacePins || legacyPluginMigrationStartedRef.current || legacyKeys.length === 0) return;
    legacyPluginMigrationStartedRef.current = true;
    void enqueuePinMutation((current) => legacyKeys.reduce((next, key) => {
      const widget = parseWidgetKey(key);
      if (!widget || pinsForDashboard(next, "home").some((pin) => isPluginHomePin(pin) && pin.pluginId === widget.pluginId && pin.widgetId === widget.widgetId)) return next;
      return [...next, createPluginHomePin(next, { ...widget, title: widget.widgetId })];
    }, current)).then(clearLegacyPluginWidgetKeys).catch((migrationError) => {
      legacyPluginMigrationStartedRef.current = false;
      toast.error("Plugin widgets could not be moved to shared Home Pins", {
        description: errorDescription(migrationError),
      });
    });
  }, [workspacePins]);

  function enqueuePinMutation(transform: (current: HomePin[]) => HomePin[]) {
    let authoritative: HomePin[] = [];
    const operation = pinMutationQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const result = await mutateAuthoritativeHomePins({
          read: listHomePinsFromWorkspace,
          write: saveHomePinsToWorkspace,
          transform,
        });
        authoritative = result.authoritative;
        applyAuthoritativePins(authoritative);
        await queryClient.invalidateQueries({ queryKey: ["home-pins"] });
      });
    pinMutationQueueRef.current = operation.catch(() => undefined);
    return operation.then(() => authoritative);
  }

  async function restoreRemotePinsAfterFailure() {
    try {
      const authoritative = await listHomePinsFromWorkspace();
      applyAuthoritativePins(authoritative);
    } catch {
      await queryClient.invalidateQueries({ queryKey: ["home-pins"] });
    }
  }

  function persistPlacements(placements: HomePinPlacement[]) {
    return enqueuePinMutation((current) => patchHomePinPlacements(current, placements));
  }

  function commitGridLayout(nextGridLayout: Layout) {
    const nextLayoutItems = nextGridLayout.map((item) => ({
      id: item.i,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
    }));
    setLayout(nextLayoutItems);
    setPins((current) => patchHomePinPlacements(current, nextLayoutItems));
    void persistPlacements(nextLayoutItems).catch((err) => {
      void restoreRemotePinsAfterFailure();
      toast.error("Home layout was not saved", {
        description: errorDescription(err),
        action: {
          label: "Retry",
          onClick: () => {
            void persistPlacements(nextLayoutItems).catch((retryErr) => {
              void restoreRemotePinsAfterFailure();
              toast.error("Home layout was not saved", { description: errorDescription(retryErr) });
            });
          },
        },
      });
    });
  }

  function handleRemovePin(pinId: string) {
    const removedPin = pins.find((pin) => pin.id === pinId);
    if (!removedPin) return;
    setPins((current) => removeHomePinById(current, pinId));
    setLayout((current) => current.filter((item) => item.id !== pinId));
    void enqueuePinMutation((current) => removeHomePinById(current, pinId))
      .then(() => {
        toast.success("View removed from Home", {
          action: {
            label: "Undo",
            onClick: () => {
              setPins((current) => restoreHomePin(current, removedPin));
              void enqueuePinMutation((current) => restoreHomePin(current, removedPin)).catch((err) => {
                void restoreRemotePinsAfterFailure();
                toast.error("View could not be restored", { description: errorDescription(err) });
              });
            },
          },
        });
      })
      .catch((err) => {
        void restoreRemotePinsAfterFailure();
        toast.error("View was not removed from Home", {
          description: errorDescription(err),
          action: {
            label: "Retry",
            onClick: () => handleRemovePin(pinId),
          },
        });
      });
  }

  function handleUpdateWidgetMetadata(
    pinId: string,
    metadata: Parameters<typeof patchHomePinMetadata>[2],
  ) {
    void enqueuePinMutation((current) => patchHomePinMetadata(current, pinId, metadata))
      .then(() => toast.success("Widget updated"))
      .catch((err) => {
        void restoreRemotePinsAfterFailure();
        toast.error("Widget settings were not saved", { description: errorDescription(err) });
      });
  }

  function handleAddWidgetPreset(preset: HomeWidgetPreset) {
    if (isHomeWidgetPresetPinned(databasePins, preset)) return;
    setWidgetPickerOpen(false);
    void enqueuePinMutation((current) => {
      if (isHomeWidgetPresetPinned(pinsForDashboard(current, "home").filter(isDatabaseViewHomePin), preset)) return current;
      return [...current, createDatabaseHomePin(current, {
        databaseId: preset.databaseId,
        viewId: preset.viewId,
        title: preset.title,
        filter: preset.filter,
        config: preset.config,
      })];
    }).then(() => {
      toast.success(`${preset.label} added to Home`);
    }).catch((err) => {
      void restoreRemotePinsAfterFailure();
      toast.error(`${preset.label} was not added`, { description: errorDescription(err) });
    });
  }

  function handleAddPluginWidget(widget: { pluginId: string; widgetId: string; title: string }) {
    setWidgetPickerOpen(false);
    void enqueuePinMutation((current) => {
      if (pinsForDashboard(current, "home").some((pin) => isPluginHomePin(pin) && pin.pluginId === widget.pluginId && pin.widgetId === widget.widgetId)) return current;
      return [...current, createPluginHomePin(current, widget)];
    }).then(() => toast.success(`${widget.title} added to Home`)).catch((err) => {
      void restoreRemotePinsAfterFailure();
      toast.error(`${widget.title} was not added`, { description: errorDescription(err) });
    });
  }

  if (error || pinsError) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="bg-[var(--base)] px-3 py-4 sm:px-6">
          <span className="t-title text-[var(--text)]">Home unavailable</span>
          <p className="mt-2 font-ui text-[var(--t-ui)] text-[var(--danger)]">
            {error instanceof Error
              ? error.message
              : pinsError instanceof Error
                ? pinsError.message
                : "The dashboard could not be loaded."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--base)]">
      <div className="shrink-0 bg-[var(--base)] px-3 py-4 sm:px-6">
        <span className="t-title text-[var(--text)]">Home</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6">
        <section className="mx-auto flex w-full max-w-[1600px] flex-col">
          <HomeAvailability
            mode={mode}
            ready={sessionMode.ready}
            lastAvailabilityAnswer={sessionMode.lastAvailabilityAnswer}
            onModeChange={chooseMode}
            availabilityOpen={availabilityOpen}
            onAvailabilityClose={() => chooseMode("thinking")}
            sentence={availability.sentence}
            meanwhile={availability.meanwhile}
            counts={availability.counts}
            traces={activeTraces}
            activityState={activity.model ? "known" : activityErrors.length ? "unknown" : "loading"}
            questions={questions}
            questionAttempt={questionAttempt}
            questionError={questionError}
            onAnswer={answerQuestion}
            tasks={taskGroups}
            keepingOut={keepingOut}
            setAsideProjects={setAsideProjects}
            scopes={rawHierarchy?.filter((node) => node.kind === "workspace" || node.kind === "project") ?? []}
            scopesKnown={rawHierarchy !== null}
            taskScope={taskScope}
            onTaskScope={setTaskScope}
            tasksState={tasks.isPending ? "loading" : tasks.error ? "error" : tasks.data?.complete === false ? "partial" : "ready"}
            tasksError={tasks.error ? errorDescription(tasks.error) : null}
            aside={aside}
            onSetAside={setAsideProjectId ? setAside : undefined}
            onRestore={setAsideProjectId ? restoreAside : undefined}
            onRestoreProject={restoreSetAsideMaterial}
            onShowGrid={() => setGridOpen(true)}
          />
          {gridOpen ? (
            <>
              <div className="mb-3 mt-8 flex items-center justify-between border-t border-[var(--surface-line)] pt-4">
                <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-[var(--text-dim)]">Pinned views</span>
                <Control size="sm" variant="text" onClick={() => setGridOpen(false)}>Hide dashboard</Control>
              </div>
          <div className="relative mb-3 flex justify-end">
            <button
              type="button"
              onClick={() => setWidgetPickerOpen((open) => !open)}
              aria-expanded={widgetPickerOpen}
              aria-haspopup="menu"
              className="inline-flex h-8 items-center gap-1.5 rounded-[var(--r-pill)] bg-[var(--hover)] px-3 font-ui text-[var(--t-meta)] text-[var(--subtext-0)] transition-colors hover:bg-[var(--hover-strong)] hover:text-[var(--text)]"
            >
              <Plus className="h-3.5 w-3.5" />
              Add widget
            </button>
            {widgetPickerOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-full z-40 mt-2 w-[min(300px,calc(100vw-24px))] rounded-[var(--r-plane)] bg-[var(--mantle)] p-2 shadow-[var(--shadow-elevated)]"
              >
                <div className="mb-1 flex items-center justify-between px-2 py-1">
                  <span className="font-ui text-[var(--t-count)] font-light uppercase tracking-[0.14em] text-[var(--overlay-1)]">Available widgets</span>
                  <button
                    type="button"
                    onClick={() => setWidgetPickerOpen(false)}
                    aria-label="Close widget picker"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-[var(--r-pill)] text-[var(--overlay-1)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {widgetPresets.length === 0 ? (
                  <p className="px-2 py-3 font-ui text-[var(--t-section)] text-[var(--overlay-1)]">No database widgets are available in this scope.</p>
                ) : widgetPresets.map((preset) => {
                  const pinned = isHomeWidgetPresetPinned(databasePins, preset);
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      role="menuitem"
                      disabled={pinned}
                      onClick={() => handleAddWidgetPreset(preset)}
                      className="block w-full rounded-[var(--r-plane)] px-2 py-2 text-left transition-colors hover:bg-[var(--surface-wash)] disabled:opacity-50"
                    >
                      <span className="block font-ui text-[var(--t-meta)] font-medium text-[var(--text)]">
                        {preset.label}{pinned ? " · Added" : ""}
                      </span>
                      <span className="mt-0.5 block font-ui text-[var(--t-count)] leading-4 text-[var(--overlay-1)]">{preset.description}</span>
                    </button>
                  );
                })}
                {/* wave-1 plugins: widgets contributed by ~/.hermes/plugins */}
                <PluginWidgetMenuItems pins={homePins} onAdd={handleAddPluginWidget} />
              </div>
            ) : null}
          </div>
          {isLoading || isLoadingPins ? (
            <Skeleton lines={3} className="px-4 py-3" />
          ) : pinnedWidgets.length > 0 ? (
            <PinnedViewGrid
              widgets={pinnedWidgets}
              catalog={catalog}
              layout={gridLayout}
              onLayoutChange={commitGridLayout}
              onOpenWidget={(widget) => navigate(`/databases/${widget.database.id}?view=${widget.view.id}`)}
              onOpenRecord={(widget, recordId) =>
                navigate(pinnedDatabaseRecordPath(widget.database.id, widget.view.id, recordId))
              }
              onRemoveWidget={(widget) => handleRemovePin(widget.pin.id)}
              onUpdateWidgetMetadata={(widget, metadata) => handleUpdateWidgetMetadata(widget.pin.id, metadata)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <p className="font-ui text-[var(--t-body)] font-medium text-[var(--subtext-0)]">
                No pinned views
              </p>
              <p className="font-ui text-[var(--t-meta)] text-[var(--overlay-1)]">
                Open a database view and pin it to see it here.
              </p>
              <button
                type="button"
                onClick={() => navigate("/databases")}
                className="mt-1 inline-flex items-center gap-1.5 rounded-[var(--r-pill)] border border-[var(--border)] bg-[var(--mantle)] px-3 py-1.5 font-ui text-[var(--t-meta)] text-[var(--subtext-0)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
              >
                Open Databases
              </button>
            </div>
          )}
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function errorDescription(err: unknown) {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "The shared Home Pins database did not accept the change.";
}

function HomeAvailability({
  mode,
  ready,
  lastAvailabilityAnswer,
  onModeChange,
  availabilityOpen,
  onAvailabilityClose,
  sentence,
  meanwhile,
  counts,
  traces,
  activityState,
  questions,
  questionAttempt,
  questionError,
  onAnswer,
  tasks,
  keepingOut,
  setAsideProjects,
  scopes,
  scopesKnown,
  taskScope,
  onTaskScope,
  tasksState,
  tasksError,
  aside,
  onSetAside,
  onRestore,
  onRestoreProject,
  onShowGrid,
}: {
  mode: SessionMode;
  ready: boolean;
  lastAvailabilityAnswer: SessionMode | null;
  onModeChange: (mode: SessionMode) => void;
  availabilityOpen: boolean;
  onAvailabilityClose: () => void;
  sentence: string;
  meanwhile: string;
  counts: string;
  traces: PulseTrace[];
  activityState: "known" | "loading" | "unknown";
  questions: HomeQuestion[];
  questionAttempt: string | null;
  questionError: { key: string; message: string } | null;
  onAnswer: (question: HomeQuestion, answer: HomeQuestionAnswer) => Promise<void>;
  tasks: Array<{ trigger: string; tasks: HomeTask[] }>;
  keepingOut: HomeTask[];
  setAsideProjects: Array<{ id: string; name: string }>;
  scopes: HierarchyNode[];
  scopesKnown: boolean;
  taskScope: string | null;
  onTaskScope: (id: string | null) => void;
  tasksState: "loading" | "error" | "partial" | "ready";
  tasksError: string | null;
  aside: boolean;
  onSetAside?: () => void;
  onRestore?: () => void;
  onRestoreProject: (id: string) => void;
  onShowGrid: () => void;
}) {
  if (!ready) {
    return <p role="status" className="mx-auto py-12 font-ui text-[var(--t-body)] text-[var(--text-muted)]">Preparing this session…</p>;
  }
  const firstQuestion = questions[0] ?? null;
  const dock = <Dock mode={mode} onModeChange={onModeChange} traces={traces} activityState={activityState} questionKeys={questions.map((question) => question.key)} aside={aside} onSetAside={onSetAside} onRestore={onRestore} />;

  if (availabilityOpen) {
    return (
      <div className="mx-auto flex min-h-[min(620px,72dvh)] w-full max-w-[780px] flex-col justify-center py-10">
        <p className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-[var(--text-dim)]">A new session</p>
        <h1 className="mt-5 font-ui text-[clamp(24px,3vw,28px)] font-light leading-[1.18] text-[var(--text)]">What is actually available today?</h1>
        <p className="mt-5 max-w-[620px] font-ui text-[var(--t-body)] leading-relaxed text-[var(--text-muted)]">Choose a shape for this session. Agents keep working, and a pending question stays in its conversation.</p>
        {lastAvailabilityAnswer ? <p className="mt-3 font-ui text-[var(--t-meta)] text-[var(--text-dim)]">Last time: {lastAvailabilityAnswer.replace("_", " ")}.</p> : null}
        <div className="mt-8 border-y border-[var(--surface-line)]">
          <Choices
            className="grid gap-0 [&>button]:min-h-[var(--h-row)] [&>button]:justify-start [&>button]:whitespace-normal [&>button]:py-2 [&>button]:text-left"
            label="What is available today"
            choices={[
              { id: "thinking", label: "Thinking · reading, wandering, no decisions" },
              { id: "deciding", label: "Deciding · one question at a time" },
              { id: "executing", label: "Executing · the move menu" },
              { id: "not_today", label: "Not today · the app keeps working and asks nothing" },
            ]}
            onChoose={(choice) => onModeChange(choice as SessionMode)}
          />
        </div>
        <Control size="sm" variant="text" className="mt-3 w-fit text-[var(--text-dim)]" onClick={onAvailabilityClose}>Continue thinking</Control>
        <div className="mt-10">
          <p className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-[var(--text-dim)]">Meanwhile</p>
          <p className="mt-2 max-w-[660px] font-ui text-[var(--t-body)] leading-relaxed text-[var(--text-muted)]">{meanwhile}</p>
        </div>
        <div className="mt-auto pt-10">{dock}</div>
      </div>
    );
  }

  if (mode === "not_today") {
    return (
      <div className="mx-auto flex min-h-[min(620px,72dvh)] max-w-[760px] flex-col items-center justify-center text-center">
        <h1 className="font-ui text-[clamp(24px,3vw,28px)] font-light leading-[1.18] text-[var(--text)]">Not today. Everything keeps running.</h1>
        <p className="mt-5 max-w-[680px] font-ui text-[var(--t-body)] leading-relaxed text-[var(--text-muted)]">Anything that needs you remains in its conversation without a clock. Notifications, HUD and toasts are quiet for this session.</p>
        <Pulse traces={traces} questions={questions.map((question) => question.key)} state={activityState} className="mt-12" />
        <Control size="sm" variant="text" className="mt-6" onClick={onShowGrid}>Show pinned views</Control>
        <div className="mt-auto pt-10">{dock}</div>
      </div>
    );
  }

  if (mode === "deciding") {
    return (
      <div className="mx-auto flex h-[min(620px,72dvh)] w-full max-w-[920px] flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto py-10">
          {firstQuestion ? <HomeQuestionCard question={firstQuestion} meanwhile={meanwhile} busy={questionAttempt === firstQuestion.key} error={questionError?.key === firstQuestion.key ? questionError.message : null} onAnswer={onAnswer} /> : (
            <div>
              <p className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-[var(--text-dim)]">Deciding</p>
              <Sentence>No question is pending right now.</Sentence>
            </div>
          )}
          <Control size="sm" variant="text" className="mt-8 w-fit" onClick={onShowGrid}>Show pinned views</Control>
        </div>
        <div className="shrink-0 border-t border-[var(--surface-line)] bg-[var(--ground)] py-3">{dock}</div>
      </div>
    );
  }

  if (mode === "executing") {
    const moveCount = tasks.reduce((count, group) => count + group.tasks.length, 0);
    return (
      <div className="mx-auto flex h-[min(620px,72dvh)] w-full max-w-[920px] flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto py-10">
          <p className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-[var(--text-dim)]">Executing · move menu</p>
          <Sentence className="mt-3">{tasksState === "loading" ? "Task moves are still loading." : tasksState === "error" ? "Task moves could not be read." : moveCount ? `${moveCount} ${moveCount === 1 ? "move" : "moves"} you may make.` : "No described moves are available."}</Sentence>
          <p className="mt-3 font-ui text-[var(--t-body)] text-[var(--text-muted)]">{tasksState === "partial" ? "Only the first 5,000 task records were read; this menu and its count are incomplete." : "Pick by the condition that fits, not by a date."}</p>
        <label className="mt-7 flex w-fit items-center gap-2 font-mono text-[var(--t-count)] uppercase tracking-[0.12em] text-[var(--text-dim)]">
          Scope
          <select aria-label="Task scope" disabled={!scopesKnown} value={taskScope ?? ""} onChange={(event) => onTaskScope(event.target.value || null)} className="rounded-[var(--r-ctl)] border border-[var(--surface-line)] bg-[var(--surface)] px-2 py-1 font-ui text-[var(--t-meta)] normal-case tracking-normal text-[var(--text)]">
            <option value="">All workspaces and projects</option>
            {scopes.map((scope) => <option key={scope.id} value={scope.id}>{scope.name}</option>)}
          </select>
        </label>
        {!scopesKnown ? <p role="status" className="mt-3 font-ui text-[var(--t-meta)] text-[var(--text-muted)]">Task scopes are unavailable; scoped work is not being classified as invalid.</p> : null}
        {setAsideProjects.length ? <section className="mt-5 font-ui text-[var(--t-meta)] text-[var(--text-muted)]">
          <p>Set aside locally. Work continues.</p>
          <div className="mt-2 flex flex-wrap gap-2">{setAsideProjects.map((project) => <button key={project.id} type="button" className="underline decoration-[var(--text-dim)] underline-offset-4" onClick={() => onRestoreProject(project.id)}>Restore {project.name}</button>)}</div>
        </section> : null}
        {tasksError ? <p role="alert" className="mt-6 text-[var(--t-meta)] text-[var(--bad)]">Tasks could not be read: {tasksError}</p> : null}
        {tasksState === "loading" ? <p role="status" className="mt-8 font-ui text-[var(--t-body)] text-[var(--text-muted)]">Reading task moves…</p> : null}
        {tasksState === "ready" || tasksState === "partial" ? <div className="mt-8 grid gap-7">
          {tasks.map((group) => (
            <section key={group.trigger}>
              <p className="border-b border-[var(--surface-line)] pb-1 font-mono text-[9.5px] uppercase tracking-[0.08em] text-[var(--text-dim)]">{group.trigger === "No trigger recorded" ? group.trigger : `If ${group.trigger}`}</p>
              <div className="divide-y divide-[var(--surface-line)]">
                {group.tasks.map((task) => <TaskMove key={task.id} task={task} />)}
              </div>
            </section>
          ))}
          {keepingOut.length ? <section>
            <p className="border-b border-[var(--surface-line)] pb-1 font-mono text-[9.5px] uppercase tracking-[0.08em] text-[var(--text-dim)]">What you are keeping out right now</p>
            <div className="divide-y divide-[var(--surface-line)]">{keepingOut.map((task) => <TaskMove key={task.id} task={task} />)}</div>
          </section> : null}
        </div> : null}
          <Control size="sm" variant="text" className="mt-8 w-fit" onClick={onShowGrid}>Show pinned views</Control>
        </div>
        <div className="shrink-0 border-t border-[var(--surface-line)] bg-[var(--ground)] py-3">{dock}</div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[min(620px,72dvh)] w-full max-w-[920px] flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto py-10">
        <p className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-[var(--text-dim)]">Thinking</p>
        <Sentence className="mt-3" counts={counts}>{sentence}</Sentence>
        <p className="mt-4 max-w-[760px] font-ui text-[var(--t-body)] leading-relaxed text-[var(--text-muted)]">{meanwhile}</p>
        {firstQuestion ? <div className="mt-8"><HomeQuestionCard question={firstQuestion} meanwhile={meanwhile} busy={questionAttempt === firstQuestion.key} error={questionError?.key === firstQuestion.key ? questionError.message : null} onAnswer={onAnswer} compact /></div> : null}
        <Pulse traces={traces} questions={questions.map((question) => question.key)} state={activityState} className="mt-10" />
        <Control size="sm" variant="text" className="mt-4 w-fit" onClick={onShowGrid}>Show pinned views</Control>
      </div>
      <div className="shrink-0 border-t border-[var(--surface-line)] bg-[var(--ground)] py-3">{dock}</div>
    </div>
  );
}

type HomeQuestionAnswer =
  | { kind: "approval"; decision: ApprovalDecision; choice: ApprovalChoice }
  | { kind: "clarify"; decision: ClarifyDecision; answers: Record<string, string[]> }
  | { kind: "workflow"; decision: "approved" | "rejected" | "changes_requested"; summary: string };

function HomeQuestionCard({ question, meanwhile, busy, error, onAnswer, compact }: {
  question: HomeQuestion;
  meanwhile: string;
  busy: boolean;
  error: string | null;
  compact?: boolean;
  onAnswer: (question: HomeQuestion, answer: HomeQuestionAnswer) => Promise<void>;
}) {
  if (question.source === "workflow") return <WorkflowApprovalCard question={question} meanwhile={meanwhile} busy={busy} error={error} compact={compact} onAnswer={(decision, summary) => void onAnswer(question, { kind: "workflow", decision, summary })} />;
  const source = question.source === "profile" ? `Profile session · ${question.owner}` : `Room · ${question.owner}`;
  return (
    <div className={compact ? "max-w-[760px] border-t border-[var(--surface-line)] pt-6" : ""}>
      <p className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-[var(--question)]">A question for you · {source}</p>
      <div className="mt-3">
        <DecisionCard
          key={question.key}
          decision={question.decision}
          asker={question.owner}
          busy={busy}
          onApprove={(decision, choice) => void onAnswer(question, { kind: "approval", decision, choice })}
          onClarify={(decision, answers) => void onAnswer(question, { kind: "clarify", decision, answers })}
        />
      </div>
      <dl className="mt-4 grid gap-1 font-mono text-[var(--t-count)] leading-relaxed text-[var(--text-dim)] sm:grid-cols-[90px_minmax(0,1fr)]">
        <dt>Meanwhile</dt><dd>{meanwhile}</dd>
        <dt>If you leave it</dt><dd>This request remains pending in its conversation.</dd>
      </dl>
      {error ? <p role="alert" className="mt-3 text-[var(--t-meta)] text-[var(--bad)]">{error}</p> : null}
    </div>
  );
}

function TaskMove({ task }: { task: HomeTask }) {
  return (
    <div className="py-3">
      <Link to={`/databases/${GENZEN_WORKSPACE_DATABASE_IDS.tasks}?record=${encodeURIComponent(task.id)}`} className="font-ui text-[var(--t-body)] font-light text-[var(--text)] underline decoration-[var(--surface-line)] underline-offset-4 hover:decoration-[var(--text)]">{task.title}</Link>
      {task.doneWhen ? <p className="mt-1 font-mono text-[var(--t-count)] text-[var(--text-dim)]">done when {task.doneWhen}</p> : null}
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[var(--t-count)] text-[var(--text-dim)]">
        {task.effort ? <span>~{task.effort}</span> : null}
        {!task.scopeValid ? <span>scope needs repair</span> : null}
      </div>
    </div>
  );
}

const HOME_LAST_VISIT_KEY = "intelizen:home-last-visit";

function readHomeLastVisit() {
  try {
    const value = window.localStorage.getItem(HOME_LAST_VISIT_KEY);
    return value && Number.isFinite(Date.parse(value)) ? value : null;
  } catch {
    return null;
  }
}

function writeHomeLastVisit(at: number) {
  try {
    window.localStorage.setItem(HOME_LAST_VISIT_KEY, new Date(at).toISOString());
  } catch {
    /* local Home history is best effort */
  }
}
