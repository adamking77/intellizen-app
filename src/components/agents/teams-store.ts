// Teams live in `$APPDATA/teams.json`, beside `engine.json`. The donor kept
// them in SQLite; a handful of records in one file is the whole need here.

import { BaseDirectory, exists, mkdir, readTextFile, writeFile } from "@tauri-apps/plugin-fs";

import { parseTeamsFile, removeTeam, serializeTeams, upsertTeam, type Team } from "./agent-model";

const FILE = "teams.json";
const DIR = { baseDir: BaseDirectory.AppData };

export async function loadTeams(): Promise<Team[]> {
  if (!(await exists(FILE, DIR))) return [];
  return parseTeamsFile(await readTextFile(FILE, DIR));
}

async function writeTeams(teams: Team[]): Promise<void> {
  if (!(await exists("", DIR))) await mkdir("", { ...DIR, recursive: true });
  await writeFile(FILE, new TextEncoder().encode(serializeTeams(teams)), DIR);
}

export async function saveTeam(team: Team): Promise<Team[]> {
  const next = upsertTeam(await loadTeams(), team);
  await writeTeams(next);
  return next;
}

export async function deleteTeam(id: string): Promise<Team[]> {
  const next = removeTeam(await loadTeams(), id);
  await writeTeams(next);
  return next;
}

export function newTeamId(): string {
  return `team-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
