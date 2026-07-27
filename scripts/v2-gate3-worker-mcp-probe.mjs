import { randomUUID } from "node:crypto";
import { Client } from "../mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StdioClientTransport } from "../mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js";

const expectedTools = [
  "advance_workflow_step",
  "append_agent_work_note",
  "list_agent_projects",
  "list_agent_work",
  "list_databases",
  "list_role_assignments",
  "list_roles",
  "list_workflow_runs",
  "list_workflows",
  "query_records",
  "report_verification",
];

const transport = new StdioClientTransport({
  command: "/Users/adamking/.local/bin/node",
  args: [
    "/Users/adamking/projects/intellizen-app/mcp-server/dist/index.js",
    "--plane",
    "worker",
  ],
  env: {
    PATH: "/Users/adamking/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
    INTELLIZEN_WORKER_CAPABILITY_URL: "http://127.0.0.1:9/capability",
    INTELLIZEN_WORKER_CAPABILITY_TOKEN: randomUUID(),
  },
  stderr: "pipe",
});
const client = new Client({
  name: "intellizen-gate3-worker-probe",
  version: "1.0.0",
});

try {
  await client.connect(transport);
  const response = await client.listTools();
  const actual = response.tools.map((tool) => tool.name).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expectedTools)) {
    throw new Error(
      `Worker registry mismatch. Expected ${expectedTools.join(", ")}; received ${actual.join(", ")}.`,
    );
  }
  console.log(
    JSON.stringify(
      {
        result: "passed",
        build: "mcp-server/dist/index.js",
        plane: "worker",
        tools: actual,
        generic_mutation_tools_visible: actual.filter((name) =>
          [
            "create_record",
            "update_record",
            "link_records",
            "propose_roster_change",
          ].includes(name),
        ),
      },
      null,
      2,
    ),
  );
} finally {
  await client.close();
}
