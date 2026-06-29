#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BIZ_OPS_DATABASE_ID = "0b4edfb0-d632-4e4e-987f-3e6ec24b57b3";
const TASKS_DATABASE_ID = "654acc9c-0270-49e2-86f7-788e25c59a76";

const FIELDS = {
  projectName: "initiative_name",
  projectStage: "initiative_stage",
  projectPriority: "initiative_priority",
  projectAssignee: "initiative_assignee",
  projectAgentOwner: "initiative_agent_owner",
  taskName: "task_name",
  taskStatus: "task_status",
  taskStage: "task_stage",
  taskPriority: "task_priority",
  taskAssignee: "task_assignee",
  taskProject: "task_project",
};

function parseArgs(argv) {
  const options = {
    actors: [],
    limit: 8,
    compact: false,
    quietMissingEnv: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--actor" || arg === "--actors") {
      options.actors.push(...String(argv[++index] ?? "").split(","));
    } else if (arg === "--limit") {
      options.limit = Number(argv[++index] ?? options.limit);
    } else if (arg === "--compact") {
      options.compact = true;
    } else if (arg === "--quiet-missing-env") {
      options.quietMissingEnv = true;
    } else if (!arg.startsWith("--")) {
      options.actors.push(...arg.split(","));
    }
  }

  if (!options.actors.length) {
    options.actors = ["Claude", "Fiona", "Steve", "Keel", "Codex"];
  }

  options.actors = options.actors
    .map(canonicalActor)
    .filter(Boolean);

  return options;
}

function canonicalActor(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  const aliases = {
    claude: "Claude",
    steve: "Steve",
    fiona: "Fiona",
    keel: "Keel",
    codex: "Codex",
  };
  return aliases[normalized] ?? value.trim();
}

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        if (separator === -1) return [line, ""];
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
        return [key, value];
      }),
  );
}

function asStringArray(value) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string");
  if (typeof value === "string" && value) return [value];
  return [];
}

function fieldString(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function firstRelationId(value) {
  return asStringArray(value)[0] ?? null;
}

function isOpenTask(record) {
  const status = fieldString(record.fields?.[FIELDS.taskStatus]) ?? "";
  const stage = fieldString(record.fields?.[FIELDS.taskStage]) ?? "";
  return !["done", "complete", "completed"].includes(status.toLowerCase())
    && !["done", "complete", "completed"].includes(stage.toLowerCase());
}

function isActiveProject(record) {
  const stage = fieldString(record.fields?.[FIELDS.projectStage]) ?? "";
  return !["done", "complete", "completed", "archived"].includes(stage.toLowerCase());
}

function projectMatchesActor(record, actor) {
  const owner = fieldString(record.fields?.[FIELDS.projectAgentOwner]);
  const fallbackAssignees = asStringArray(record.fields?.[FIELDS.projectAssignee]);
  return owner ? owner === actor : fallbackAssignees.includes(actor);
}

function taskMatchesActor(record, initiativeById, actor) {
  const directAssignees = asStringArray(record.fields?.[FIELDS.taskAssignee]);
  if (directAssignees.includes(actor)) return true;

  const projectId = firstRelationId(record.fields?.[FIELDS.taskProject]);
  const initiative = projectId ? initiativeById.get(projectId) : null;
  if (!initiative) return false;

  return initiative.agentOwner ? initiative.agentOwner === actor : initiative.assignees.includes(actor);
}

function summarizeProject(record) {
  return {
    id: record.id,
    title: fieldString(record.fields?.[FIELDS.projectName]) ?? "Untitled project",
    stage: fieldString(record.fields?.[FIELDS.projectStage]),
    priority: fieldString(record.fields?.[FIELDS.projectPriority]),
    agent_owner: fieldString(record.fields?.[FIELDS.projectAgentOwner]),
    assignees: asStringArray(record.fields?.[FIELDS.projectAssignee]),
  };
}

function summarizeTask(record, initiativeById) {
  const projectId = firstRelationId(record.fields?.[FIELDS.taskProject]);
  const initiative = projectId ? initiativeById.get(projectId) : null;
  return {
    id: record.id,
    title: fieldString(record.fields?.[FIELDS.taskName]) ?? "Untitled task",
    status: fieldString(record.fields?.[FIELDS.taskStatus]),
    stage: fieldString(record.fields?.[FIELDS.taskStage]),
    priority: fieldString(record.fields?.[FIELDS.taskPriority]),
    assignees: asStringArray(record.fields?.[FIELDS.taskAssignee]),
    project_id: projectId,
    project_title: initiative?.name ?? null,
    inherited_agent_owner: initiative?.agentOwner ?? null,
  };
}

async function listRecords(supabase, databaseId) {
  const { data, error } = await supabase
    .schema("workspace")
    .from("records")
    .select("id, database_id, fields, body, updated_at")
    .eq("database_id", databaseId)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

function renderActorReadback(actor, projects, tasks, limit, compact) {
  const shownProjects = projects.slice(0, limit);
  const shownTasks = tasks.slice(0, limit);

  console.log(`--- IntelliZen Assignment Readback (${actor}) ---`);
  console.log(`Active projects: ${projects.length}`);
  for (const project of shownProjects) {
    const meta = [project.stage, project.priority].filter(Boolean).join(" / ");
    console.log(`- ${project.title}${meta ? ` (${meta})` : ""}`);
  }
  if (projects.length > shownProjects.length) {
    console.log(`- ... ${projects.length - shownProjects.length} more`);
  }

  console.log(`Open tasks: ${tasks.length}`);
  for (const task of shownTasks) {
    const meta = [task.status, task.stage, task.priority, task.project_title].filter(Boolean).join(" / ");
    console.log(`- ${task.title}${meta ? ` (${meta})` : ""}`);
  }
  if (tasks.length > shownTasks.length) {
    console.log(`- ... ${tasks.length - shownTasks.length} more`);
  }

  if (!compact) {
    console.log("Assignment rule: direct task assignee wins; otherwise inherit Biz Ops Agent Owner; legacy initiative assignee is fallback only when Agent Owner is blank.");
  }
  console.log("--- End Assignment Readback ---");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const localEnv = loadEnvFile(join(ROOT, ".env.local"));
  const supabaseUrl =
    process.env.VITE_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    localEnv.VITE_SUPABASE_URL ??
    localEnv.SUPABASE_URL ??
    "https://jicrdrwtwubveyvzyyrh.supabase.co";
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    localEnv.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ??
    localEnv.VITE_SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseKey) {
    const message = "IntelliZen assignment readback unavailable: missing Supabase service role key.";
    if (!options.quietMissingEnv) console.error(message);
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const [projectRecords, taskRecords] = await Promise.all([
    listRecords(supabase, BIZ_OPS_DATABASE_ID),
    listRecords(supabase, TASKS_DATABASE_ID),
  ]);

  const initiativeById = new Map(
    projectRecords.map((record) => [
      record.id,
      {
        name: fieldString(record.fields?.[FIELDS.projectName]) ?? "Untitled project",
        assignees: asStringArray(record.fields?.[FIELDS.projectAssignee]),
        agentOwner: fieldString(record.fields?.[FIELDS.projectAgentOwner]),
      },
    ]),
  );

  for (const actor of options.actors) {
    const projects = projectRecords
      .filter((record) => isActiveProject(record) && projectMatchesActor(record, actor))
      .map(summarizeProject);
    const tasks = taskRecords
      .filter((record) => isOpenTask(record) && taskMatchesActor(record, initiativeById, actor))
      .map((record) => summarizeTask(record, initiativeById));

    renderActorReadback(actor, projects, tasks, options.limit, options.compact);
  }
}

main().catch((error) => {
  console.error(`IntelliZen assignment readback failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
