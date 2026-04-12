import Exa from "exa-js";

import type {
  DeepResearchResult,
  SearchMode,
  SearchResultItem,
  SignalDraft,
} from "@/lib/types";
import { safeHostname, summarizeText } from "@/lib/utils";

const exaApiKey = import.meta.env.VITE_EXA_API_KEY;

if (!exaApiKey) {
  throw new Error("Missing Exa API key.");
}

export const exa = new Exa(exaApiKey);

const HIGHLIGHTS = {
  numSentences: 3,
  highlightsPerUrl: 1,
};

type ExaResult = {
  url: string;
  title?: string | null;
  publishedDate?: string | null;
  score?: number | null;
  highlights?: string[];
  text?: string;
};

function normalizeResult(result: ExaResult): SearchResultItem {
  return {
    title: result.title ?? safeHostname(result.url),
    url: result.url,
    source: safeHostname(result.url),
    published_at: result.publishedDate ?? null,
    snippet: result.highlights?.[0] ?? summarizeText(result.text) ?? null,
    exa_score: result.score ?? null,
    raw_payload: result,
  };
}

export async function runExaSearch(input: {
  mode: SearchMode;
  query: string;
  startDate?: string | null;
}): Promise<SearchResultItem[] | DeepResearchResult> {
  const { mode, query, startDate } = input;

  switch (mode) {
    case "web": {
      const response = await exa.searchAndContents(query, {
        type: "auto",
        useAutoprompt: true,
        numResults: 10,
        highlights: HIGHLIGHTS,
      });
      return response.results.map((result) => normalizeResult(result));
    }
    case "news": {
      const response = await exa.searchAndContents(query, {
        type: "auto",
        category: "news",
        numResults: 10,
        highlights: HIGHLIGHTS,
        startPublishedDate: startDate || undefined,
      });
      return response.results.map((result) => normalizeResult(result));
    }
    case "research_papers": {
      const response = await exa.searchAndContents(query, {
        category: "research paper",
        numResults: 10,
        highlights: HIGHLIGHTS,
      });
      return response.results.map((result) => normalizeResult(result));
    }
    case "company": {
      const response = await exa.search(query, {
        category: "company",
        numResults: 10,
      });
      return response.results.map((result) => normalizeResult(result));
    }
    case "people": {
      const response = await exa.search(query, {
        category: "personal site",
        numResults: 10,
      });
      return response.results.map((result) => normalizeResult(result));
    }
    case "financial_reports": {
      const response = await exa.search(query, {
        category: "financial report",
        numResults: 10,
      });
      return response.results.map((result) => normalizeResult(result));
    }
    case "deep_research": {
      const response = await fetch("https://api.exa.ai/research/v1", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": exaApiKey,
        },
        body: JSON.stringify({
          instructions: query,
          model: "exa-research",
        }),
      });

      if (!response.ok) {
        throw new Error(`Deep Research start failed: ${response.statusText}`);
      }

      const { id } = (await response.json()) as { id: string };
      const completed = await pollDeepResearch(id);

      return {
        title: `Deep Research: ${query}`,
        url: `exa://research/${id}`,
        source: "exa.ai",
        snippet: summarizeText(completed, 240) ?? "Deep Research completed.",
        content: completed,
        raw_payload: { id, content: completed },
      };
    }
  }
}

async function pollDeepResearch(id: string): Promise<string> {
  const response = await fetch(`https://api.exa.ai/research/v1/${id}`, {
    headers: {
      "x-api-key": exaApiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Deep Research poll failed: ${response.statusText}`);
  }

  const payload = (await response.json()) as {
    status: "pending" | "completed" | "failed";
    data?: string;
    error?: string;
  };

  if (payload.status === "completed") {
    return payload.data ?? "";
  }

  if (payload.status === "failed") {
    throw new Error(payload.error ?? "Deep Research failed.");
  }

  await new Promise((resolve) => window.setTimeout(resolve, 2000));
  return pollDeepResearch(id);
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
    raw_payload: result.raw_payload,
    status: "saved",
  };
}
