import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { AppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/agents/avatar";
import { getGatewayClient } from "@/engine/gateway";
import { listProfiles } from "@/engine/profiles";
import { cn } from "@/lib/utils";

import { listAcpMembers } from "./door";
import { GROUP_CHAT_MAX_MEMBERS, GROUP_CHAT_MIN_MEMBERS } from "./group-chat";
import { botHandle, displayName, memberFromProfile } from "./group-membership";
import type { GroupMember } from "./types";

/** Everyone who can be seated: Hermes profiles through the gateway, ACP agents
 *  from the registry once that door is wired. */
export function useSeatableMembers() {
  return useQuery({
    queryKey: ["rooms", "seatable-members"],
    queryFn: async (): Promise<GroupMember[]> => {
      const [profiles, acp] = await Promise.all([
        listProfiles(getGatewayClient()).catch(() => []),
        listAcpMembers(),
      ]);
      return [...profiles.map(memberFromProfile), ...acp];
    },
    staleTime: 30_000,
  });
}

/** "New room": name it, seat two to six members, open it. */
export function NewRoomSheet({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string, members: GroupMember[]) => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const seatable = useSeatableMembers();

  useEffect(() => {
    if (open) {
      setName("");
      setPicked([]);
    }
  }, [open]);

  const members = seatable.data ?? [];
  const chosen = useMemo(
    () => picked.map((key) => members.find((m) => m.name === key)).filter(Boolean) as GroupMember[],
    [picked, members],
  );

  const tooFew = chosen.length < GROUP_CHAT_MIN_MEMBERS;
  const full = chosen.length >= GROUP_CHAT_MAX_MEMBERS;

  const toggle = (member: GroupMember) => {
    setPicked((current) =>
      current.includes(member.name)
        ? current.filter((k) => k !== member.name)
        : current.length >= GROUP_CHAT_MAX_MEMBERS
          ? current
          : [...current, member.name],
    );
  };

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New room"
      description={`One log, ${GROUP_CHAT_MIN_MEMBERS}–${GROUP_CHAT_MAX_MEMBERS} agents. They take turns; @name addresses one.`}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={tooFew || creating}
            onClick={async () => {
              setCreating(true);
              try {
                await onCreate(name.trim() || "Room", chosen);
                onOpenChange(false);
              } catch {
                // The caller names the error; keep the sheet open for Retry.
              } finally {
                setCreating(false);
              }
            }}
          >
            {creating ? "Opening…" : "Open room"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="font-ui text-[var(--t-meta)] text-[var(--text-muted)]">Name</span>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="What is this room for?"
            maxLength={64}
            autoFocus
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <span className="font-ui text-[var(--t-meta)] text-[var(--text-muted)]">Members</span>
            <span className="font-ui text-[var(--t-section)] tabular-nums text-[var(--text-muted)]">
              {chosen.length} of {GROUP_CHAT_MAX_MEMBERS}
            </span>
          </div>

          {seatable.isLoading ? (
            <p className="py-6 text-center font-ui text-[var(--t-ui)] text-[var(--text-muted)]">
              Reading the roster…
            </p>
          ) : members.length === 0 ? (
            <p className="py-6 text-center font-ui text-[var(--t-ui)] text-[var(--text-muted)]">
              No agents are configured. Add them on the Agents page, then try again.
            </p>
          ) : (
            <ul className="max-h-64 overflow-y-auto rounded-[var(--r-plane)] border border-[var(--border)]">
              {members.map((member) => {
                const on = picked.includes(member.name);
                return (
                  <li key={`${member.door}:${member.name}`}>
                    <button
                      type="button"
                      onClick={() => toggle(member)}
                      disabled={!on && full}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-3 py-2 text-left disabled:opacity-40",
                        on ? "bg-[var(--selected)]" : "hover:bg-[var(--hover)]",
                      )}
                    >
                      <Checkbox checked={on} tabIndex={-1} aria-hidden />
                      <Avatar
                        agent={{
                          displayName: displayName(member),
                          avatarStyle: member.avatar_style,
                          avatarKind: member.avatar_kind,
                          avatarColor: member.avatar_color,
                        }}
                        size={22}
                        animate={false}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-ui text-[var(--t-ui)] text-[var(--text)]">
                          {displayName(member)}
                        </span>
                        <span className="block truncate font-mono text-[var(--t-section)] text-[var(--text-muted)]">
                          @{botHandle(member.name, member)}
                          {member.model ? ` · ${member.model}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 font-ui text-[var(--t-section)] text-[var(--text-muted)]">
                        {member.door === "acp" ? "ACP" : "Hermes"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {tooFew ? (
            <p className="font-ui text-[var(--t-section)] text-[var(--text-muted)]">
              Seat at least {GROUP_CHAT_MIN_MEMBERS}.
            </p>
          ) : null}
        </div>
      </div>
    </AppDialog>
  );
}
