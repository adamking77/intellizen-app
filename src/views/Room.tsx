import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Trash2, Users, X } from "lucide-react";

import { DecisionCard } from "@/components/agent/decision-card";
import { ReplyMarkdown } from "@/components/agent/reply-markdown";
import { clock } from "@/components/agent/turn-time";
import { Avatar, identityColor } from "@/components/agents/avatar";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import type { ApprovalChoice } from "@/engine/contract";
import { answerClarify } from "@/engine/decisions";
import type { ApprovalDecision, ClarifyDecision } from "@/engine/transcript";
import type { HermesProfile } from "@/engine/profiles";
import { useSessionStore } from "@/engine/session-store";
import { toastError } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { clientFor } from "@/rooms/door";
import { currentGroupActivity, groupActivityLabel, groupActivityTone } from "@/rooms/group-activity";
import { $groupChats, $groupClarify, $groupNeedsYou } from "@/rooms/group-chat";
import { displayName, groupMemberKey } from "@/rooms/group-membership";
import { sendToGroupChat, stopGroupThread } from "@/rooms/group-rounds";
import { clearGroupPrompt, respondGroupApproval } from "@/rooms/group-turns";
import { NewRoomSheet } from "@/rooms/new-room-sheet";
import { RoomComposer } from "@/rooms/room-composer";
import { disbandRoom, ensureRoomsLoaded, createRoom, listRooms } from "@/rooms/rooms";
import { useValue } from "@/rooms/store";
import type { GroupMember, GroupMessage } from "@/rooms/types";

/** Timestamps only as dividers after a 15-minute gap — the panel's rule
 *  (DESIGN.md), applied to the room log. */
const GAP_MS = 15 * 60_000;

function Turn({
  entry,
  members,
  directory,
  showTime,
}: {
  entry: GroupMessage;
  members: GroupMember[];
  directory: Record<string, HermesProfile>;
  showTime: boolean;
}) {
  const isUser = entry.from.kind === "user";
  const member = members.find((m) => m.name === entry.from.name);
  const who = isUser ? "You" : member ? displayName(member) : entry.from.name;
  const profile = member ? profileForMember(directory, member) : null;
  const face = {
    displayName: who,
    avatarStyle: profile?.avatarStyle ?? member?.avatar_style ?? "sphere",
    avatarKind: profile?.avatarKind ?? member?.avatar_kind,
    avatarColor: profile?.avatarColor ?? member?.avatar_color,
  };
  const hue = identityColor(who, face.avatarColor);

  return (
    <>
      {showTime ? (
        <div className="my-1 flex items-center gap-2 px-1">
          <span className="h-px flex-1 bg-[var(--hair)]" />
          <span className="font-ui text-[var(--t-section)] tabular-nums text-[var(--text-muted)]">
            {clock(entry.at)}
          </span>
          <span className="h-px flex-1 bg-[var(--hair)]" />
        </div>
      ) : null}
      {isUser ? (
        <div className="group flex max-w-[82%] flex-col gap-1 self-end">
          <span className="text-right font-ui text-[var(--t-meta)] text-[var(--text-muted)]">You</span>
          <p className="whitespace-pre-wrap rounded-[var(--r-ctl)] bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] px-[11px] py-2 font-ui text-[var(--t-body)] leading-6 text-[var(--text)]">
            {entry.text}
          </p>
        </div>
      ) : (
        <div className="group flex gap-[9px]">
          <div className="mt-0.5 shrink-0">
            <Avatar agent={face} size={24} image={profile?.avatarImage} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="font-ui text-[var(--t-ui)] text-[var(--text)]">{who}</span>
            <div
              className="rounded-[var(--r-ctl)] px-[11px] py-2"
              style={{ background: `color-mix(in srgb, ${hue} 12%, transparent)` }}
            >
              <ReplyMarkdown content={entry.text} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function profileForMember(directory: Record<string, HermesProfile>, member: GroupMember) {
  return directory[member.door === "acp" ? `acp:${member.name}` : member.name] ?? null;
}

/** The room: one log, the members beside it, the receipts of the run in
 *  flight, and a composer that addresses anyone with `@name`. */
export function RoomView({
  roomId,
  panel = false,
  onClose,
}: {
  roomId?: string;
  panel?: boolean;
  onClose?: () => void;
} = {}) {
  const { id: routeId = "" } = useParams();
  const id = roomId ?? routeId;
  const navigate = useNavigate();
  const rooms = useValue($groupChats);
  const clarify = useValue($groupClarify);
  const needsYou = useValue($groupNeedsYou);
  const [ready, setReady] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [confirmDisband, setConfirmDisband] = useState(false);
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [behind, setBehind] = useState(false);
  const directory = useSessionStore((state) => state.profileDirectory);

  useEffect(() => {
    void ensureRoomsLoaded().finally(() => setReady(true));
  }, []);

  const room = rooms[id] && !rooms[id].tombstone ? rooms[id] : null;
  const members = useMemo(() => room?.members ?? [], [room]);
  const log = room?.log ?? [];
  const activity = room ? currentGroupActivity(id) : [];

  // A member's blocking request, if this room has one.
  const pending = useMemo(
    () => Object.values(clarify).find((p) => p.group === id) ?? null,
    [clarify, id],
  );
  const pendingMember = pending ? members.find((m) => m.name === pending.member) ?? null : null;

  // Reading the room clears its @user badge.
  useEffect(() => {
    if (id && needsYou[id]) $groupNeedsYou.set({ ...$groupNeedsYou.get(), [id]: false });
  }, [id, needsYou]);

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    if (atBottom.current) {
      el.scrollTop = el.scrollHeight;
      setBehind(false);
    } else {
      setBehind(true);
    }
  }, [log.length, activity.length]);

  const onApprove = async (decision: ApprovalDecision, choice: ApprovalChoice) => {
    if (!pending || !pendingMember) return;
    setBusy(true);
    try {
      await respondGroupApproval(id, pendingMember, decision.requestId, choice);
    } catch (error) {
      toastError("Couldn't answer that request", error);
    } finally {
      setBusy(false);
    }
  };

  const onClarify = async (decision: ClarifyDecision, answers: Record<string, string[]>) => {
    if (!pending || !pendingMember) return;
    setBusy(true);
    try {
      await answerClarify(clientFor(pendingMember), decision, answers);
      clearGroupPrompt(id, pendingMember);
    } catch (error) {
      toastError("Couldn't answer that question", error);
    } finally {
      setBusy(false);
    }
  };

  if (!ready) {
    return (
      <div className="h-full bg-[var(--base)] p-6">
        <Skeleton lines={5} className="mx-auto max-w-2xl" />
      </div>
    );
  }

  if (!room) {
    const others = listRooms();
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-[var(--base)] px-6">
        <EmptyState
          title={id ? "No room with this id" : "No room open"}
          description={
            others.length
              ? "It may have been disbanded. Open another, or start a new one."
              : "A room puts several agents in one log. They take turns; @name addresses one."
          }
          action={{ label: "New room", onClick: () => setSheet(true) }}
        />
        {others.length ? (
          <ul className="w-full max-w-sm rounded-[var(--r-plane)] border border-[var(--border)]">
            {others.map((other) => (
              <li key={other.roomId}>
                <button
                  type="button"
                  onClick={() => navigate(`/room/${other.roomId}`)}
                  className="flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left hover:bg-[var(--hover)]"
                >
                  <span className="truncate font-ui text-[var(--t-ui)] text-[var(--text)]">
                    {other.name}
                  </span>
                  <span className="shrink-0 font-ui text-[var(--t-section)] text-[var(--text-muted)]">
                    {(other.members || []).length} members
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <NewRoomSheet
          open={sheet}
          onOpenChange={setSheet}
          onCreate={(name, seated) => navigate(`/room/${createRoom(name, seated)}`)}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden bg-[var(--base)]" data-room-panel={panel || undefined}>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-3 px-5 py-3">
          <div className="flex shrink-0 items-center" aria-label={`${members.length} room members`}>
            {members.slice(0, 6).map((member, index) => {
              const profile = profileForMember(directory, member);
              return (
                <span key={groupMemberKey(member)} style={{ marginInlineStart: index ? -7 : 0 }}>
                  <Avatar
                    agent={{
                      displayName: displayName(member),
                      avatarStyle: profile?.avatarStyle ?? member.avatar_style,
                      avatarKind: profile?.avatarKind ?? member.avatar_kind,
                      avatarColor: profile?.avatarColor ?? member.avatar_color,
                    }}
                    image={profile?.avatarImage}
                    size={24}
                    animate={false}
                  />
                </span>
              );
            })}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-ui text-[var(--t-title)] font-light uppercase tracking-[0.16em] text-[var(--text)]">
              {room.name}
            </h1>
            <p className="truncate font-ui text-[var(--t-meta)] text-[var(--text-muted)]">
              {room.turn
                ? `${displayName(members.find((m) => m.name === room.turn) ?? { name: room.turn })} is thinking…`
                : `${members.length} members${room.running ? " · running" : ""}`}
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setConfirmDisband(true)}
            title="Disband this room"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          {panel && onClose ? (
            <Button size="sm" variant="ghost" onClick={onClose} title="Close room">
              <X className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </header>

        <div
          ref={logRef}
          onScroll={(event) => {
            const el = event.currentTarget;
            const near = el.scrollHeight - el.scrollTop - el.clientHeight <= 32;
            atBottom.current = near;
            if (near) setBehind(false);
          }}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
        >
          {log.length === 0 ? (
            <p className="py-10 text-center font-ui text-[var(--t-ui)] text-[var(--text-muted)]">
              Say something to start. Everyone answers unless you @name someone.
            </p>
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-3">
              {log.map((entry, index) => (
                <Turn
                  key={entry.id ?? `${entry.at}-${index}`}
                  entry={entry}
                  members={members}
                  directory={directory}
                  showTime={index === 0 || entry.at - (log[index - 1]?.at ?? 0) > GAP_MS}
                />
              ))}
              {pending ? (
                <div className="px-3 py-2">
                  <DecisionCard
                    decision={pending.decision}
                    asker={pendingMember ? displayName(pendingMember) : pending.member}
                    busy={busy}
                    onApprove={(decision, choice) => void onApprove(decision, choice)}
                    onClarify={(decision, answers) => void onClarify(decision, answers)}
                  />
                </div>
              ) : null}
            </div>
          )}
        </div>

        {behind ? (
          <div className="flex shrink-0 justify-center pb-1.5">
            <button
              type="button"
              className="rounded-[var(--r-pill)] bg-[var(--hover-strong)] px-3 py-0.5 text-[var(--t-meta)] text-[var(--text)]"
              onClick={() => {
                const el = logRef.current;
                if (!el) return;
                el.scrollTop = el.scrollHeight;
                atBottom.current = true;
                setBehind(false);
              }}
            >
              New reply ↓
            </button>
          </div>
        ) : null}

        <RoomComposer
          members={members}
          running={room.running === true}
          onSend={(text) => sendToGroupChat(id, members, text)}
          onStop={() => void stopGroupThread(id, null, members)}
        />
      </div>

      <aside className={cn("hidden w-60 shrink-0 flex-col border-l border-[var(--border)] bg-[var(--mantle)] lg:flex", panel && "lg:hidden")}>
        <div className="flex items-center gap-2 px-4 py-3">
          <Users className="h-3.5 w-3.5 text-[var(--text-muted)]" />
          <span className="font-ui text-[var(--t-meta)] font-medium text-[var(--text-muted)]">Members</span>
        </div>
        <ul className="shrink-0 py-1">
          {members.map((member) => {
            const held = Boolean(room.holds?.[groupMemberKey(member)]);
            return (
              <li
                key={`${member.door}:${member.name}`}
                className="flex items-center gap-2 px-4 py-1.5"
              >
                <Avatar
                  agent={{
                    displayName: displayName(member),
                    avatarStyle: profileForMember(directory, member)?.avatarStyle ?? member.avatar_style,
                    avatarKind: profileForMember(directory, member)?.avatarKind ?? member.avatar_kind,
                    avatarColor: profileForMember(directory, member)?.avatarColor ?? member.avatar_color,
                  }}
                  image={profileForMember(directory, member)?.avatarImage}
                  size={20}
                  animate={false}
                />
                <span className="min-w-0 flex-1 truncate font-ui text-[var(--t-ui)] text-[var(--text)]">
                  {displayName(member)}
                </span>
                {room.turn === member.name ? (
                  <span className="shrink-0 font-ui text-[var(--t-section)] text-[var(--accent)]">on turn</span>
                ) : held ? (
                  <span className="shrink-0 font-ui text-[var(--t-section)] text-[var(--text-muted)]">held</span>
                ) : null}
              </li>
            );
          })}
        </ul>

        <div className="border-t border-[var(--border-subtle)] px-4 py-3">
          <span className="font-ui text-[var(--t-meta)] font-medium text-[var(--text-muted)]">Receipts</span>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto pb-3">
          {activity.length === 0 ? (
            <li className="px-4 font-ui text-[var(--t-meta)] text-[var(--text-muted)]">
              Nothing running.
            </li>
          ) : (
            activity.map((event, index) => (
              <li key={`${event.at}-${index}`} className="flex gap-2 px-4 py-0.5">
                <span className="shrink-0 font-ui text-[var(--t-section)] tabular-nums text-[var(--text-muted)]">
                  {clock(event.at)}
                </span>
                <span
                  className="min-w-0 flex-1 font-ui text-[var(--t-section)] leading-4"
                  style={{ color: groupActivityTone(event.kind) }}
                  title={event.reason}
                >
                  {groupActivityLabel(event)}
                </span>
              </li>
            ))
          )}
        </ul>
      </aside>

      <ConfirmDialog
        open={confirmDisband}
        title={`Disband ${room.name}?`}
        message="The log is deleted and the members' room sessions are dropped. This cannot be undone."
        confirmLabel="Disband"
        danger
        onCancel={() => setConfirmDisband(false)}
        onConfirm={() => {
          setConfirmDisband(false);
          void disbandRoom(id).then(() => onClose ? onClose() : navigate("/room"));
        }}
      />
    </div>
  );
}
