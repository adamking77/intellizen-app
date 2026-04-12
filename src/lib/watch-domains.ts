import type { MonitorInsert } from "@/lib/types";

export const WATCH_DOMAINS = [
  "Family Offices",
  "SE Asia",
  "Spiritual Exploitation",
  "Crypto Fraud",
  "Macro Political",
  "Development Projects",
  "Social / Cultural",
] as const;

export const DEFAULT_MONITORS: MonitorInsert[] = [
  {
    name: "Family Offices",
    query: "family office exploitation fraud trust capture scheme",
    watch_domain: "Family Offices",
    frequency: "daily",
  },
  {
    name: "SE Asia",
    query: "Southeast Asia exploitation fraud criminal network",
    watch_domain: "SE Asia",
    frequency: "daily",
  },
  {
    name: "Spiritual Exploitation",
    query: "cult spiritual abuse guru exploitation victims",
    watch_domain: "Spiritual Exploitation",
    frequency: "daily",
  },
  {
    name: "Crypto Fraud",
    query: "cryptocurrency fraud scam rug pull exit scheme",
    watch_domain: "Crypto Fraud",
    frequency: "daily",
  },
  {
    name: "Macro Political",
    query: "authoritarian coercion political control capture",
    watch_domain: "Macro Political",
    frequency: "weekly",
  },
  {
    name: "Development Projects",
    query: "infrastructure development corruption land seizure",
    watch_domain: "Development Projects",
    frequency: "weekly",
  },
  {
    name: "Social / Cultural",
    query: "social manipulation influence operation autonomy control",
    watch_domain: "Social / Cultural",
    frequency: "weekly",
  },
];
