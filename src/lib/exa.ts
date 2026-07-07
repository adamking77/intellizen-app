import { invoke } from "@tauri-apps/api/core";

import type {
  DeepResearchResult,
  SearchMode,
  SearchResultItem,
  SignalDraft,
} from "@/lib/types";

export async function runExaSearch(input: {
  mode: SearchMode;
  query: string;
  startDate?: string | null;
}): Promise<SearchResultItem[] | DeepResearchResult> {
  try {
    return await invoke<SearchResultItem[] | DeepResearchResult>("run_exa_search", {
      input,
    });
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err));
  }
}

export function signalDraftFromSearchResult(
  result: SearchResultItem,
  watchDomain = "manual",
): SignalDraft {
  return {
    title: result.title,
    url: result.url,
    source: result.source,
    published_at: result.published_at,
    snippet: result.snippet,
    watch_domain: watchDomain,
    exa_score: result.exa_score,
    source_reliability: result.source_reliability ?? null,
    info_credibility: result.info_credibility ?? null,
    raw_payload: result.raw_payload,
    status: "saved",
  };
}

export function signalDraftFromDeepResearch(
  result: DeepResearchResult,
): SignalDraft {
  return {
    title: result.title,
    url: result.url,
    source: result.source,
    published_at: new Date().toISOString(),
    snippet: result.snippet,
    watch_domain: "manual",
    exa_score: null,
    source_reliability: result.source_reliability ?? null,
    info_credibility: result.info_credibility ?? null,
    raw_payload: result.raw_payload,
    status: "saved",
  };
}
