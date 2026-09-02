/**
 * Room-level coordination: who speaks, in what order, for how long — the
 * @mention parse, the round-robin driver, the member holds, the stop path, and
 * the user send that starts it all.
 *
 * Vendored from Hermes Desktop `hermes-bots/group-rounds.ts` (MIT), verbatim
 * where pure. Dropped on the way in: cross-connection members (one machine,
 * one engine), attachments (the room composer is text), and the bot-attention
 * badge (`data.ts`'s bot meta does not come with us). What stays is the whole
 * coordination model, comments included, because those comments are the record
 * of every bug this loop already survived.
 *
 * Behavioral model (Hermes's, clean-room): a room conversation is ONE ordered
 * log. A user send triggers at most GROUP_CHAT_MAX_ROUNDS serial round-robin
 * rounds over the roster — never parallel, no LLM router. Who speaks each
 * round is a deterministic @mention parse since the last user message
 * (mentioned members only, else everyone); whether a member actually speaks is
 * its own turn's choice — replying exactly "(pass)" (or nothing, or failing)
 * is silence. Hard caps end every turn; a round in which everyone passed means
 * the conversation settled. Each member runs its turn in its OWN persistent
 * per-room session and is fed only the messages NEW since it last saw the room.
 */

import { recordGroupActivity } from "./group-activity";
import {
  $groupChats,
  $groupNeedsYou,
  appendGroupChatEntry,
  GROUP_CHAT_HISTORY_LIMIT,
  GROUP_CHAT_MAX_CONTINUATIONS,
  GROUP_CHAT_MAX_MESSAGES,
  GROUP_CHAT_MAX_ROUNDS,
  groupSpeakerLabel,
  groupThreadOf,
  mintGroupThreadId,
  shouldCommitMemberTurn,
  updateGroupChat,
  type GroupChatRoom,
  type GroupHoldStamp,
} from "./group-chat";
import {
  botFriendlyNames,
  botHandle,
  durableGroupChatMembers,
  groupMemberKey,
  mentionNameForms,
} from "./group-membership";
import {
  clearGroupClarify,
  harvestStrandedGroupReply,
  interruptGroupMember,
  isGroupPassText,
  runGroupChatMemberTurn,
} from "./group-turns";
import type { GroupMember, GroupMessage } from "./types";

/** Deterministic @mention parse. Handles @name, @"two words" via display
 *  titles, and @everyone/@all. Names match case-insensitively against member
 *  names, display titles, and collapsed no-space forms. */
export function parseGroupChatMentions(
  text: unknown,
  members: GroupMember[],
): { everyone: boolean; mentioned: Set<string> } {
  const source = String(text || "");
  const mentioned = new Set<string>();
  let everyone = false;
  const handles = new Map<string, string>();

  for (const member of members) {
    const title = String(member.title || "").trim();
    const handle = String(member.handle || botHandle(member.name, member) || "").trim();

    const forms = new Set([
      member.name.toLowerCase(),
      member.name.toLowerCase().replace(/[\s_-]+/g, ""),
      ...(handle ? [handle.toLowerCase(), handle.toLowerCase().replace(/[\s_-]+/g, "")] : []),
      ...(title
        ? [title.toLowerCase(), title.toLowerCase().replace(/[\s_-]+/g, ""), title.split(/\s+/)[0].toLowerCase()]
        : []),
    ]);

    // Renamed members answer to their friendly names too, in slugged and
    // collapsed forms — the same tags the roster autocomplete inserts.
    for (const friendly of botFriendlyNames(member)) {
      for (const form of mentionNameForms(friendly)) forms.add(form);
    }

    for (const form of forms) {
      if (form) handles.set(form, groupMemberKey(member));
    }
  }

  for (const match of source.matchAll(/@([a-z0-9][a-z0-9._-]*)/gi)) {
    const handle = match[1].toLowerCase();

    if (handle === "everyone" || handle === "all") {
      everyone = true;
      continue;
    }
    if (handle === "user") continue;

    const resolved = handles.get(handle) || handles.get(handle.replace(/[._-]+/g, ""));
    if (resolved) mentioned.add(resolved);
  }

  return { everyone, mentioned };
}

/** Members that should take a turn this round: everyone when no member is
 *  @-mentioned in messages since the last user entry (or @everyone appears),
 *  otherwise only the mentioned members. Recomputed every round so a member
 *  pulled in mid-conversation joins the next round. */
export function resolveGroupResponders(log: GroupMessage[], members: GroupMember[]): GroupMember[] {
  let sinceLastUser: GroupMessage[] = [];

  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i].from.kind === "user") {
      sinceLastUser = log.slice(i);
      break;
    }
  }

  const mentioned = new Set<string>();
  let everyone = false;

  for (const entry of sinceLastUser) {
    const parsed = parseGroupChatMentions(entry.text, members);
    if (parsed.everyone) everyone = true;
    for (const name of parsed.mentioned) mentioned.add(name);
  }

  if (everyone || mentioned.size === 0) return members;
  return members.filter((member) => mentioned.has(groupMemberKey(member)));
}

/** Rotate the roster so a different member leads each round. */
export function rotateGroupSpeakers(members: GroupMember[], round: number): GroupMember[] {
  if (members.length < 2) return members;
  const shift = round % members.length;
  return [...members.slice(shift), ...members.slice(0, shift)];
}

/** Room-log line as a member sees it: `Name (user): …` / `Name: …` /
 *  `Name (you): …`. */
export function formatGroupChatLine(entry: GroupMessage, viewerName: string): string {
  if (entry.from.kind === "user") {
    return `${entry.from.name || "User"} (user): ${entry.text}`;
  }
  const suffix = entry.from.name === viewerName ? " (you)" : "";
  return `${groupSpeakerLabel(entry.from.name)}${suffix}: ${entry.text}`;
}

interface GroupChatTurnPromptInput {
  deltaLines: string[];
  groupName: string;
  members: GroupMember[];
  viewer: GroupMember;
}

/** The full per-turn payload for one member: participation rules + the room
 *  delta. Rules travel in the turn payload (not the profile's identity) so any
 *  existing agent can join a room without being reconfigured. */
export function buildGroupChatTurnPrompt({
  groupName,
  members,
  viewer,
  deltaLines,
}: GroupChatTurnPromptInput): string {
  const viewerKey = groupMemberKey(viewer);
  const peers = members.filter((m) => groupMemberKey(m) !== viewerKey);

  const peerNames = peers
    .map((m) => (m.title ? `${m.title} (@${botHandle(m.name, m)})` : `@${botHandle(m.name, m)}`))
    .join(", ");

  return [
    `[Group chat: "${groupName}"] You are @${botHandle(viewer.name, viewer)}, one participant in a group chat with ${peerNames || "no one else yet"} and the user.`,
    "",
    "New messages in the room since your last turn (oldest first):",
    ...deltaLines.map((line) => `  ${line}`),
    "",
    "Rules for this room:",
    "- Reply with ONE conversational message ONLY if you have something new worth adding: build on what was just said, claim or hand off work, answer a question aimed at you, or report a real result. Keep chatter short (1-3 sentences) — but when you are delivering a result, an answer the user asked for, or substantive work, give it at full quality and length; never thin out real content to fit the room.",
    '- If you have nothing new to add, reply with exactly "(pass)". Passing is good — it lets the conversation settle.',
    "- Mention a teammate as @name to pull them in; mention @user only for a judgment call or a result the user needs. Do not repeat points already made.",
    "- Never reveal content from your private 1:1 chats. Your reply text goes to the room verbatim — no preamble, no meta-commentary.",
  ].join("\n");
}

// --- member-hold helpers — pure, unit-tested ---

/** Classify a USER room message's effect on member holds. Only user sends ever
 *  reach this (member replies are appended by the round loop, never through
 *  `sendToGroupChat`), so an agent saying "stopped working on it" can never set
 *  a hold. Conservative on purpose: any standalone stop/halt/pause word next to
 *  a mention holds those members — "don't stop @x" therefore also holds, which
 *  errs toward the agent staying quiet until re-addressed (a wrongly-held agent
 *  is one mention away from release; a wrongly-running one keeps doing work it
 *  was told to stop). A non-stop direct mention releases the mentioned members —
 *  the user addressing an agent directly overrides its hold. */
export function classifyGroupHoldDirective(
  text: string,
  mentionedKeys: Iterable<string> | null | undefined,
  everyone: boolean,
): { hold: string[]; holdAll: boolean; release: string[]; releaseAll: boolean } {
  const value = String(text || "");
  const mentioned = [...(mentionedKeys || [])];
  const stop = /\b(stop|halt|pause)\b/i.test(value);
  const resume = /\b(resume|continue|go|proceed)\b/i.test(value);

  if (stop) {
    // "@all stop" holds every member — symmetric with "@all resume".
    return { hold: mentioned, holdAll: Boolean(everyone), release: [], releaseAll: false };
  }
  if (resume) {
    return { hold: [], holdAll: false, release: mentioned, releaseAll: Boolean(everyone) };
  }
  return { hold: [], holdAll: false, release: mentioned, releaseAll: false };
}

/** What `parseGroupChatMentions` reports for one room message. */
interface GroupMentionParse {
  everyone?: boolean;
  mentioned?: Iterable<string>;
}

/** Next holds map after one user message. Holds are keyed by memberKey at ROOM
 *  scope (not thread scope): every main-composer send mints a NEW thread, so a
 *  thread-scoped hold would never block the next send's turns and the stop
 *  would not stick. Returns the same object when nothing changed. */
export function applyGroupHoldDirective(
  holds: Record<string, GroupHoldStamp> | null | undefined,
  mentions: GroupMentionParse | null | undefined,
  text: string,
  stamp: GroupHoldStamp | null | undefined,
  allMemberKeys: string[] = [],
): Record<string, GroupHoldStamp> {
  const prior: Record<string, GroupHoldStamp> = holds && typeof holds === "object" ? holds : {};
  const action = classifyGroupHoldDirective(
    text,
    mentions?.mentioned || [],
    Boolean(mentions?.everyone),
  );

  if (action.releaseAll) return Object.keys(prior).length ? {} : prior;

  // "@all stop": expand to every member key the caller knows about.
  const toHold = action.holdAll ? [...allMemberKeys] : action.hold;
  let next = prior;

  for (const key of toHold) {
    if (next === prior) next = { ...prior };
    next[key] = {
      at: stamp?.at || Date.now(),
      byMessageId: stamp?.byMessageId || null,
      thread: stamp?.thread || null,
    };
  }

  for (const key of action.release) {
    if (Object.prototype.hasOwnProperty.call(next, key)) {
      if (next === prior) next = { ...prior };
      delete next[key];
    }
  }

  return next;
}

/** A held member's skip must consume its delta exactly once — advance the
 *  watermark past the current log so the same entries never re-trigger the
 *  skip. Null = nothing to consume (no write, no spin). */
export function heldMemberWatermarkAdvance(
  seen: number | undefined,
  logLength: number,
): null | number {
  return logLength > (seen || 0) ? logLength : null;
}

// --- end member-hold helpers ---

/** Members cited by @mention in a thread who have not posted any entry after
 *  the citing one — the unresolved-handoff detector. A mention inside a member
 *  reply is visible to the NEXT round's responder selection, but the round loop
 *  exits first when nobody has new delta to read (`spokeThisRound === 0`) or a
 *  cap lands, so the room settles while a called agent never answers. Returns
 *  member keys still owed a turn. */
export function unaddressedGroupMentions(
  group: string,
  members: GroupMember[],
  thread: string,
): string[] {
  const room = $groupChats.get()[group] || { log: [] };
  const log = (room.log || []).filter((e) => groupThreadOf(e) === thread);

  // key → log INDEX of the entry that most recently cited this member. Entry
  // ids are UUIDs, NOT monotonic — index order is the only guaranteed ordering,
  // and it is what "answered after the citing entry" actually means.
  const citedAt = new Map<string, number>();
  const keyOf = (name: string | undefined) => {
    const m = members.find((mm) => mm.name === name);
    return m ? groupMemberKey(m) : null;
  };

  for (const entry of log) {
    // A user send re-drives everyone anyway; only member-to-member handoffs can
    // strand here.
    if (entry.from.kind !== "member") continue;
    const parsed = parseGroupChatMentions(entry.text || "", members);
    const citingMemberKey = keyOf(entry.from?.name);

    for (const key of parsed.mentioned) {
      // Never count an agent citing itself as a pending handoff.
      if (citingMemberKey && citingMemberKey !== key) citedAt.set(key, log.indexOf(entry));
    }
  }

  // A citation is answered when the cited member posts any entry after the
  // citing one (its turn, whatever the content).
  const lastPostAt = new Map<string, number>();
  for (const entry of log) {
    if (entry.from.kind !== "member") continue;
    const speakerKey = keyOf(entry.from?.name);
    if (speakerKey) lastPostAt.set(speakerKey, log.indexOf(entry));
  }

  return [...citedAt.keys()].filter((key) => {
    const citedIdx = citedAt.get(key) as number;
    const answeredIdx = lastPostAt.get(key);
    return answeredIdx === undefined || answeredIdx <= citedIdx;
  });
}

/** The REAL stop path for a room round. The loop's only cancellation primitives
 *  are the epoch bump (checked at member boundaries) and holds (which skip
 *  FUTURE turns) — neither touches the member whose model call is in flight
 *  RIGHT NOW, so "stop" would mean "finish this turn first". This does all three
 *  legs:
 *
 *  1. Bumps the room epoch — the driving loop bails at its next boundary and
 *     never selects another member (`isCurrent()` in `runGroupChatRounds`).
 *  2. Sets a hold for EVERY member — future turns stay skipped until the user
 *     explicitly releases (resume / @all resume / a direct mention), the exact
 *     contract user-typed "@all stop" already has.
 *  3. Interrupts the member currently ON TURN (`room.turn`, runtime-only) so the
 *     in-flight model call actually dies instead of grinding to completion in
 *     the background. Best-effort: an unreachable member still leaves the room
 *     stopped.
 *
 *  `members` is the live roster when the caller has one; falls back to the
 *  room's durable roster so a two-arg call still works. */
export async function stopGroupThread(
  group: string,
  thread: null | string,
  members: GroupMember[] | null = null,
): Promise<void> {
  const room = $groupChats.get()[group] || ({} as GroupChatRoom);
  const roster = Array.isArray(members) && members.length ? members : room.members || [];
  const turnName = room.turn || null;

  const stamp: GroupHoldStamp = { at: Date.now(), byMessageId: null, thread: thread || null };

  updateGroupChat(group, (r) => {
    r.epoch = (r.epoch || 0) + 1;
    r.running = false;
    r.turn = null;

    // The same hold shape `applyGroupHoldDirective` mints for "@all stop" — the
    // held-skip path and every release gesture apply unchanged. An existing
    // hold keeps its stamp.
    const holds: Record<string, GroupHoldStamp> = { ...(r.holds || {}) };
    for (const member of roster) {
      const key = groupMemberKey(member);
      if (key && !holds[key]) holds[key] = { ...stamp };
    }
    r.holds = holds;
    return r;
  });

  clearGroupClarify(group);

  // Recorded AFTER the bump so the event is tagged with the new epoch — it
  // stays visible as the current run's outcome instead of dropping out of view
  // with the superseded run's events.
  recordGroupActivity(group, { kind: "stopped", member: "You", thread: thread || null });

  // Interrupt the member actually mid-turn. `room.turn` is runtime-only and
  // names exactly one member (the loop is serial); a settled room has none.
  const onTurn = turnName ? roster.find((member) => member?.name === turnName) : null;
  if (onTurn) await interruptGroupMember(group, onTurn);
}

/** Drive one bounded round-robin turn for ONE THREAD. Serial — one member at a
 *  time. A newer user send bumps the room epoch; this loop notices at the next
 *  member boundary, bails, and the newest send's own loop takes over.
 *  Watermarks are per thread+member (`${thread}::${memberKey}`), so parallel
 *  topics never eat each other's deltas. */
export async function runGroupChatRounds(
  group: string,
  members: GroupMember[],
  thread: string,
): Promise<void> {
  const startEpoch = $groupChats.get()[group]?.epoch || 0;
  const isCurrent = () => ($groupChats.get()[group]?.epoch || 0) === startEpoch;
  let posted = 0;
  let continuations = 0;
  // How this drive ended. 'settled' means quiet consensus (everyone passed with
  // nothing pending); 'capped' means a round/message/continuation cap forced
  // the exit — the activity feed must tell those apart.
  let exitKind: "capped" | "settled" = "settled";

  /** One member's turn, from delta through commit. Returns whether it spoke.
   *  `null` means the drive was cancelled and the caller must return. */
  const driveMember = async (member: GroupMember): Promise<boolean | null> => {
    const room = $groupChats.get()[group] || ({ log: [], watermarks: {} } as unknown as GroupChatRoom);
    const memberKey = groupMemberKey(member);
    const markKey = `${thread}::${memberKey}`;
    const seen = room.watermarks[markKey] || 0;
    // Delta: NEW room entries, narrowed to this thread — the member's turn sees
    // only the conversation it is part of.
    const delta = room.log.slice(seen).filter((e) => groupThreadOf(e) === thread);

    if (!delta.length) return false;

    // A member the user told to stop is HELD — no turn until an explicit
    // release. Consume the delta exactly once (watermark past the current log)
    // so the same entries never re-trigger this skip, and surface WHY the agent
    // is silent in the activity feed the first time.
    const heldEntry = (room.holds || {})[memberKey];
    if (heldEntry) {
      const advance = heldMemberWatermarkAdvance(seen, room.log.length);
      updateGroupChat(group, (r) => {
        if (advance !== null) r.watermarks[markKey] = advance;
        if (r.holds?.[memberKey] && !r.holds[memberKey].noted) {
          r.holds = { ...r.holds, [memberKey]: { ...r.holds[memberKey], noted: true } };
        }
        return r;
      });
      if (!heldEntry.noted) {
        recordGroupActivity(group, { kind: "held", member: member.name, thread });
      }
      return false;
    }

    const prompt = buildGroupChatTurnPrompt({
      groupName: $groupChats.get()[group]?.name || group,
      members,
      viewer: member,
      deltaLines: delta
        .slice(-GROUP_CHAT_HISTORY_LIMIT)
        .map((e) => formatGroupChatLine(e, member.name)),
    });

    // Surface WHO is on turn (runtime-only, like running/epoch) so the room
    // shows "Radar is thinking…" instead of a generic working line — long model
    // turns otherwise read as the room being stuck.
    updateGroupChat(group, (r) => {
      r.turn = member.name;
      return r;
    });

    let reply: null | string = null;
    try {
      reply = await runGroupChatMemberTurn(group, member, prompt, thread);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      recordGroupActivity(group, {
        kind: "failed",
        member: member.name,
        thread,
        ...(reason ? { reason } : {}),
      });
      reply = null; // a failed turn is a pass, never a room error
    }

    // The turn may have finished AFTER a newer user send bumped the room epoch.
    // That newer send's loop re-drives this member with the full delta, so
    // committing this stale result (watermark advance + append) would
    // double-deliver the same reply. Drop it here — BEFORE the watermark
    // advance and BEFORE the append. Only a newer USER entry in THIS thread
    // makes the re-drive premise true: a cross-thread send bumps the epoch too,
    // but its loop filters this thread out and would never regenerate the
    // finished reply. The during-turn tail is anchored by entry id, not index —
    // the history trim drops entries from the FRONT, so an index slice could
    // overshoot after a mid-turn trim and silently commit a stale turn.
    const roomNow = $groupChats.get()[group] || ({ log: [] } as unknown as GroupChatRoom);
    const epochNow = roomNow.epoch || 0;
    const anchorId = room.log.length ? room.log[room.log.length - 1].id : null;
    const anchorIdx = anchorId == null ? -1 : roomNow.log.findIndex((e) => e.id === anchorId);
    // Anchor trimmed away ⇒ every pre-turn entry was dropped, so every surviving
    // entry is newer — scanning the whole log stays exact.
    const turnTail = anchorIdx >= 0 ? roomNow.log.slice(anchorIdx + 1) : roomNow.log;
    const newerUserEntryInThread = turnTail.some(
      (e) => e.from?.kind === "user" && groupThreadOf(e) === thread,
    );

    if (!shouldCommitMemberTurn(startEpoch, epochNow, newerUserEntryInThread)) {
      recordGroupActivity(group, { kind: "cancelled", member: member.name, thread });
      return null;
    }

    // The member has now seen everything up to the pre-reply log length.
    updateGroupChat(group, (r) => {
      r.watermarks[markKey] = r.log.length;
      return r;
    });

    if (reply !== null && !isGroupPassText(reply)) {
      appendGroupChatEntry(group, { kind: "member", name: member.name }, reply, thread);
      // Its own message counts as seen too.
      updateGroupChat(group, (r) => {
        r.watermarks[markKey] = r.log.length;
        return r;
      });
      posted += 1;
      recordGroupActivity(group, { kind: "replied", member: member.name, thread });
      return true;
    }

    if (reply !== null) recordGroupActivity(group, { kind: "passed", member: member.name, thread });
    return false;
  };

  try {
    for (let round = 0; round < GROUP_CHAT_MAX_ROUNDS; round++) {
      // Deliver any replies that finished after their turn timed out — every
      // member, not just this round's responders, so long work is late, never
      // lost.
      for (const member of members) {
        if (!isCurrent()) {
          recordGroupActivity(group, { kind: "cancelled", member: null, thread });
          return;
        }
        await harvestStrandedGroupReply(group, member);
      }

      const roomLog = ($groupChats.get()[group]?.log || []).filter(
        (e) => groupThreadOf(e) === thread,
      );

      // Exclude members the harvest pass just above confirmed are STILL running
      // (their stranded marker survived harvest). Re-selecting one here would
      // submit into their live session — the gateway's busy policy redirects or
      // hard-interrupts that turn, killing exactly the long-running work this
      // stranded/harvest mechanism exists to protect. Skip them; the next
      // harvest pass picks the reply up once it actually lands.
      const strandedNow = $groupChats.get()[group]?.stranded || {};

      const responders = rotateGroupSpeakers(
        resolveGroupResponders(roomLog, members),
        round,
      ).filter((member) => !Object.prototype.hasOwnProperty.call(strandedNow, groupMemberKey(member)));

      let spokeThisRound = 0;

      for (const member of responders) {
        if (!isCurrent() || posted >= GROUP_CHAT_MAX_MESSAGES) {
          if (!isCurrent()) {
            recordGroupActivity(group, { kind: "cancelled", member: null, thread });
          } else {
            exitKind = "capped"; // message cap, not consensus
          }
          return;
        }

        const spoke = await driveMember(member);
        if (spoke === null) return;
        if (spoke) spokeThisRound += 1;
      }

      if (spokeThisRound === 0) {
        // "Everyone passed" is NOT the only way a round can go quiet —
        // responders can be narrowed to members with no new delta while the
        // thread's tail carries an @mention handoff that was never answered.
        // Before settling, check for cited members still owed a turn and run one
        // bounded continuation round for exactly those members. If none exist
        // (or the continuation also goes quiet), the room genuinely settled.
        const pendingKeys = unaddressedGroupMentions(group, members, thread);

        // Bound continuation rounds independently of the message cap so a
        // pathological mention chain cannot consume the room's entire budget on
        // back-and-forth handoffs.
        continuations += 1;

        if (pendingKeys.length && continuations <= GROUP_CHAT_MAX_CONTINUATIONS) {
          const citedMembers = members.filter((member) =>
            pendingKeys.includes(groupMemberKey(member)),
          );

          if (citedMembers.length && posted < GROUP_CHAT_MAX_MESSAGES) {
            const strandedThen = $groupChats.get()[group]?.stranded || {};
            const continuationResponders = citedMembers.filter(
              (member) =>
                !Object.prototype.hasOwnProperty.call(strandedThen, groupMemberKey(member)),
            );

            for (const member of continuationResponders) {
              if (
                !isCurrent() ||
                posted >= GROUP_CHAT_MAX_MESSAGES ||
                continuations > GROUP_CHAT_MAX_CONTINUATIONS
              ) {
                break;
              }
              const spoke = await driveMember(member);
              if (spoke === null) return;
              // The continuation's own reply may cite someone else — fall
              // through to the normal loop so the next round handles it via the
              // same responder machinery.
              if (spoke) spokeThisRound += 1;
            }
          }
        }

        if (spokeThisRound === 0) {
          // Genuinely nothing left to say — including after the continuation
          // attempt above produced no spoken turns. Settle honestly, but if
          // cited members are STILL owed a turn and only the continuation /
          // message caps stopped us from driving them, this is a capped exit,
          // not consensus.
          if (
            pendingKeys.length &&
            (continuations > GROUP_CHAT_MAX_CONTINUATIONS || posted >= GROUP_CHAT_MAX_MESSAGES)
          ) {
            exitKind = "capped";
          }
          return;
        }
      }
    }

    // All GROUP_CHAT_MAX_ROUNDS rounds ran with someone still speaking — the
    // round cap ended the drive, not consensus.
    exitKind = "capped";
  } finally {
    if (isCurrent()) {
      recordGroupActivity(group, { kind: exitKind, member: null, thread });
      updateGroupChat(group, (r) => {
        r.running = false;
        r.turn = null;
        return r;
      });

      // The loop's harvest pass only runs at the top of each round of an ACTIVE
      // loop — a member whose turn timed out after the final round would stay
      // stranded until the user's NEXT send. Poll for the late reply in the
      // background (bounded) so long work is late, never lost.
      const strandedLeft = Object.keys($groupChats.get()[group]?.stranded || {});
      if (strandedLeft.length && typeof window !== "undefined") {
        void harvestStrandedUntilSettled(group, members, thread);
      }
    }
  }
}

/** Bounded background harvest for members whose replies outlived the turn loop.
 *  Polls every 5s for up to 5 minutes; stops early when nothing is stranded, a
 *  new loop takes the room over (it harvests on its own), or the room record
 *  disappears (disband). */
async function harvestStrandedUntilSettled(
  group: string,
  members: GroupMember[],
  thread: string,
): Promise<void> {
  const HARVEST_INTERVAL_MS = 5000;
  const HARVEST_MAX_TRIES = 60;

  for (let attempt = 0; attempt < HARVEST_MAX_TRIES; attempt++) {
    await new Promise((resolve) => window.setTimeout(resolve, HARVEST_INTERVAL_MS));
    const room = $groupChats.get()[group];
    if (!room || room.running) return;

    const stranded = room.stranded || {};
    if (!Object.keys(stranded).length) return;

    for (const member of members) {
      if (Object.prototype.hasOwnProperty.call(stranded, groupMemberKey(member))) {
        try {
          await harvestStrandedGroupReply(group, member);
        } catch {
          // Best-effort: the next tick retries; the bound stops runaways.
        }
      }
    }
  }

  recordGroupActivity(group, { kind: "failed", member: null, thread });
}

/** User send into a room. `thread` continues that thread (its reply box);
 *  omitted/null mints a NEW thread — the main composer's shape. Appends, bumps
 *  the room epoch (supersedes any running loop at its next member boundary),
 *  and starts the turn drive for the target thread. Returns the thread id the
 *  message landed in. */
export function sendToGroupChat(
  group: string,
  members: GroupMember[],
  text: string,
  thread?: null | string,
): null | string {
  const trimmed = String(text || "").trim();
  if (!trimmed || !members.length) return null;

  const target = thread || mintGroupThreadId();
  $groupNeedsYou.set({ ...$groupNeedsYou.get(), [group]: false });

  // Refresh the durable roster on every send, so a room made before a member
  // was renamed still seats everyone correctly.
  updateGroupChat(group, (room) => {
    room.members = durableGroupChatMembers(members);
    return room;
  });

  const sent = appendGroupChatEntry(group, { kind: "user", name: "You" }, trimmed, target);

  const wasRunning = $groupChats.get()[group]?.running === true;
  updateGroupChat(group, (room) => {
    room.epoch = (room.epoch || 0) + 1;
    room.running = true;
    // User text is the ONLY input that changes member holds. An explicit
    // "stop @member" sets a sticky hold; "@member resume" (or @all resume, or
    // any direct non-stop mention of the held member) releases it. Member
    // replies never flow through this function.
    room.holds = applyGroupHoldDirective(
      room.holds,
      parseGroupChatMentions(trimmed, members),
      trimmed,
      { at: sent?.at, byMessageId: sent?.id, thread: target },
      members.map((member) => groupMemberKey(member)),
    );
    return room;
  });
  recordGroupActivity(group, { kind: "queued", member: "You", thread: target });

  const drive = () =>
    void runGroupChatRounds(group, members, target).catch(() => {
      updateGroupChat(group, (r) => {
        r.running = false;
        return r;
      });
    });

  if (!wasRunning) {
    drive();
  } else {
    // A loop is live; it bails at its next boundary. Chain the fresh loop after
    // a short settle so exactly one drive owns the room.
    setTimeout(drive, 250);
  }

  return target;
}
