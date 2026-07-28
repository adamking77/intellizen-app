import {
  TEAM_REVIEW_FIXTURE_KEY,
  publishTeamRosterChanged,
  type TeamReviewFixture,
} from "@/lib/team-roster";

export function readTeamReviewFixture(): TeamReviewFixture | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(TEAM_REVIEW_FIXTURE_KEY) ?? "null",
    ) as Partial<TeamReviewFixture> | null;
    if (
      !parsed ||
      typeof parsed.roleRecordId !== "string" ||
      typeof parsed.agentRecordId !== "string" ||
      (parsed.bindingRef !== null && typeof parsed.bindingRef !== "string") ||
      typeof parsed.scope !== "string" ||
      typeof parsed.confirmedAt !== "string"
    ) {
      return null;
    }
    return parsed as TeamReviewFixture;
  } catch {
    return null;
  }
}

export function saveTeamReviewFixture(fixture: TeamReviewFixture) {
  window.localStorage.setItem(TEAM_REVIEW_FIXTURE_KEY, JSON.stringify(fixture));
  publishTeamRosterChanged(fixture);
}

export function clearTeamReviewFixture() {
  window.localStorage.removeItem(TEAM_REVIEW_FIXTURE_KEY);
  publishTeamRosterChanged(null);
}
