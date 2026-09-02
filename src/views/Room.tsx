import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, Trash2, Users } from "lucide-react";

import { DecisionCard } from "@/components/agent/decision-card";
import { ReplyMarkdown } from "@/components/agent/reply-markdown";
import { clock } from "@/components/agent/turn-time";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import type { ApprovalChoice } from "@/engine/contract";
import { answerClarify } from "@/engine/decisions";
import type { ApprovalDecision, ClarifyDecision } from "@/engine/transcript";
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
  showTime,
}: {
  entry: GroupMessage;
  members: GroupMember[];
  showTime: boolean;
}) {
  const isUser = entry.from.kind === "user";
  const member = members.find((m) => m.name === entry.from.name);
  const who = isUser ? "You" : member ? displayName(member) : entry.from.name;

  return (
    <>
      {showTime ? (
        <div className="my-1 flex items-center gap-2 px-1">
          <span className="h-px flex-1 bg-[var(--hair)]" />
          <span className="font-ui text-[11px] tabular-nums text-[var(--text-muted)]">
            {clock(entry.at)}
          </span>
          <span className="h-px flex-1 bg-[var(--hair)]" />
        </div>
      ) : null}
      <div
        className={cn(
          "group flex flex-col gap-1 rounded-lg px-3 py-2",
          isUser && "bg-[var(--surface-wash)]",
        )}
      >
        <span className="font-ui text-[12px] font-medium text-[var(--text-muted)]">{who}</span>
        {isUser ? (
          <p className="font-ui text-[14px] leading-6 whitespace-pre-wrap text-[var(--text)]">
            {entry.text}
          </p>
        ) : (
          <ReplyMarkdown content={entry.text} />
        )}
      </div>
    </>
  );
}

/** The room: one log, the members beside it, the receipts of the run in
 *  flight, and a composer that addresses anyone with `@name`. */
export function RoomView() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const rooms = useValue($groupChats);
  const clarify = useValue($groupClarify);
  const needsYou = useValue($groupNeedsYou);
  const [ready, setReady] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [confirmDisband, setConfirmDisband] = useState(false);
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

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
    if (el) el.scrollTop = el.scrollHeight;
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
      <div className="flex h-full items-center justify-center bg-[var(--base)]">
        <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
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
          <ul className="w-full max-w-sm rounded-lg border border-[var(--border)]">
            {others.map((other) => (
              <li key={other.roomId}>
                <button
                  type="button"
                  onClick={() => navigate(`/room/${other.roomId}`)}
                  className="flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left hover:bg-[var(--hover)]"
                >
                  <span className="truncate font-ui text-[13px] text-[var(--text)]">
                    {other.name}
                  </span>
                  <span className="shrink-0 font-ui text-[11px] text-[var(--text-muted)]">
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
    <div className="flex h-full overflow-hidden bg-[var(--base)]">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-5 py-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-ui text-[17px] font-semibold text-[var(--text)]">
              {room.name}
            </h1>
            <p className="truncate font-ui text-[12px] text-[var(--text-muted)]">
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
        </header>

        <div ref={logRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {log.length === 0 ? (
            <p className="py-10 text-center font-ui text-[13px] text-[var(--text-muted)]">
              Say something to start. Everyone answers unless you @name someone.
            </p>
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-1">
              {log.map((entry, index) => (
                <Turn
                  key={entry.id ?? `${entry.at}-${index}`}
                  entry={entry}
                  members={members}
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

        <RoomComposer
          members={members}
          running={room.running === true}
          onSend={(text) => sendToGroupChat(id, members, text)}
          onStop={() => void stopGroupThread(id, null, members)}
        />
      </div>

      <aside className="hidden w-60 shrink-0 flex-col border-l border-[var(--border)] bg-[var(--mantle)] lg:flex">
        <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-4 py-3">
          <Users className="h-3.5 w-3.5 text-[var(--text-muted)]" />
          <span className="font-ui text-[12px] font-medium text-[var(--text-muted)]">Members</span>
        </div>
        <ul className="shrink-0 py-1">
          {members.map((member) => {
            const held = Boolean(room.holds?.[groupMemberKey(member)]);
            return (
              <li
                key={`${member.door}:${member.name}`}
                className="flex items-baseline gap-2 px-4 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate font-ui text-[13px] text-[var(--text)]">
                  {displayName(member)}
                </span>
                {room.turn === member.name ? (
                  <span className="shrink-0 font-ui text-[11px] text-[var(--accent)]">on turn</span>
                ) : held ? (
                  <span className="shrink-0 font-ui text-[11px] text-[var(--text-muted)]">held</span>
                ) : null}
              </li>
            );
          })}
        </ul>

        <div className="border-t border-[var(--border-subtle)] px-4 py-3">
          <span className="font-ui text-[12px] font-medium text-[var(--text-muted)]">Receipts</span>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto pb-3">
          {activity.length === 0 ? (
            <li className="px-4 font-ui text-[12px] text-[var(--text-muted)]">
              Nothing running.
            </li>
          ) : (
            activity.map((event, index) => (
              <li key={`${event.at}-${index}`} className="flex gap-2 px-4 py-0.5">
                <span className="shrink-0 font-ui text-[11px] tabular-nums text-[var(--text-muted)]">
                  {clock(event.at)}
                </span>
                <span
                  className="min-w-0 flex-1 font-ui text-[11px] leading-4"
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
          void disbandRoom(id).then(() => navigate("/room"));
        }}
      />
    </div>
  );
}
