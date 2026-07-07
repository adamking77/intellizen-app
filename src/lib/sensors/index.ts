import type { SearchResultItem } from "@/lib/types";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? value as UnknownRecord : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function firstString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.find((item): item is string => typeof item === "string") ?? null;
  return null;
}

function sensorResult(input: {
  title: string;
  url: string;
  source: string;
  snippet?: string | null;
  score?: number | null;
  raw: unknown;
  reliability?: SearchResultItem["source_reliability"];
  credibility?: number | null;
}): SearchResultItem {
  return {
    title: input.title,
    url: input.url,
    source: input.source,
    published_at: null,
    snippet: input.snippet ?? null,
    exa_score: input.score ?? null,
    source_reliability: input.reliability ?? "B",
    info_credibility: input.credibility ?? 2,
    raw_payload: input.raw,
  };
}

export async function runSanctionsSearch(query: string): Promise<SearchResultItem[]> {
  const apiKey = import.meta.env.VITE_OPENSANCTIONS_API_KEY as string | undefined;
  if (apiKey) {
    const res = await fetch("https://api.opensanctions.org/match/default", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `ApiKey ${apiKey}`,
      },
      body: JSON.stringify({
        queries: {
          q: {
            schema: "Thing",
            properties: { name: [query] },
          },
        },
      }),
    });
    if (!res.ok) throw new Error(`OpenSanctions match failed (${res.status})`);
    const json = await res.json() as UnknownRecord;
    const responses = asRecord(json.responses);
    const resultBlock = asRecord(responses.q);
    return asArray(resultBlock.results).slice(0, 10).map((item) => {
      const row = asRecord(item);
      const entity = asRecord(row.entity);
      const properties = asRecord(entity.properties);
      const caption = firstString(entity.caption) ?? firstString(properties.name) ?? "OpenSanctions match";
      const id = String(entity.id ?? row.id ?? caption);
      const score = typeof row.score === "number" ? row.score : null;
      return sensorResult({
        title: caption,
        url: `https://www.opensanctions.org/entities/${encodeURIComponent(id)}/`,
        source: "OpenSanctions",
        snippet: `Screening match${score != null ? ` · score ${score.toFixed(3)}` : ""}`,
        score,
        raw: row,
        reliability: "B",
        credibility: score != null && score >= 0.85 ? 2 : 3,
      });
    });
  }

  const res = await fetch(`https://api.opensanctions.org/search/default?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`OpenSanctions search failed (${res.status})`);
  const json = await res.json() as UnknownRecord;
  return asArray(json.results).slice(0, 10).map((item) => {
    const row = asRecord(item);
    const caption = String(row.caption ?? row.name ?? "OpenSanctions entity");
    const id = String(row.id ?? caption);
    return sensorResult({
      title: caption,
      url: `https://www.opensanctions.org/entities/${encodeURIComponent(id)}/`,
      source: "OpenSanctions",
      snippet: String(row.schema ?? "Sanctions/PEP search result"),
      score: typeof row.score === "number" ? row.score : null,
      raw: row,
      reliability: "B",
      credibility: 3,
    });
  });
}

export async function runCorporateSearch(query: string): Promise<SearchResultItem[]> {
  const [gleif, companiesHouse, sec] = await Promise.allSettled([
    searchGleif(query),
    searchCompaniesHouse(query),
    searchSecTickers(query),
  ]);
  return [gleif, companiesHouse, sec].flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  ).slice(0, 20);
}

async function searchGleif(query: string): Promise<SearchResultItem[]> {
  const url = `https://api.gleif.org/api/v1/lei-records?filter[fulltext]=${encodeURIComponent(query)}&page[size]=5`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GLEIF search failed (${res.status})`);
  const json = await res.json() as UnknownRecord;
  return asArray(json.data).map((item) => {
    const row = asRecord(item);
    const attributes = asRecord(row.attributes);
    const entity = asRecord(attributes.entity);
    const legalName = asRecord(entity.legalName);
    const name = String(legalName.name ?? row.id ?? "GLEIF legal entity");
    const lei = String(row.id ?? "");
    const status = String(asRecord(attributes.registration).status ?? "");
    return sensorResult({
      title: name,
      url: lei ? `https://search.gleif.org/#/record/${encodeURIComponent(lei)}` : "https://search.gleif.org/",
      source: "GLEIF",
      snippet: [lei ? `LEI ${lei}` : null, status ? `registration ${status}` : null].filter(Boolean).join(" · "),
      raw: row,
      reliability: "A",
      credibility: 2,
    });
  });
}

async function searchCompaniesHouse(query: string): Promise<SearchResultItem[]> {
  const apiKey = import.meta.env.VITE_COMPANIES_HOUSE_API_KEY as string | undefined;
  if (!apiKey) return [];
  const res = await fetch(`https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(query)}&items_per_page=5`, {
    headers: {
      Authorization: `Basic ${btoa(`${apiKey}:`)}`,
    },
  });
  if (!res.ok) throw new Error(`Companies House search failed (${res.status})`);
  const json = await res.json() as UnknownRecord;
  return asArray(json.items).map((item) => {
    const row = asRecord(item);
    const number = String(row.company_number ?? "");
    const title = String(row.title ?? "Companies House company");
    return sensorResult({
      title,
      url: number ? `https://find-and-update.company-information.service.gov.uk/company/${encodeURIComponent(number)}` : "https://find-and-update.company-information.service.gov.uk/",
      source: "Companies House",
      snippet: [number ? `Company ${number}` : null, row.company_status ? `status ${String(row.company_status)}` : null].filter(Boolean).join(" · "),
      raw: row,
      reliability: "A",
      credibility: 2,
    });
  });
}

async function searchSecTickers(query: string): Promise<SearchResultItem[]> {
  const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`SEC ticker lookup failed (${res.status})`);
  const json = await res.json() as UnknownRecord;
  const needle = query.toLowerCase();
  return Object.values(json)
    .map(asRecord)
    .filter((row) => String(row.title ?? "").toLowerCase().includes(needle) || String(row.ticker ?? "").toLowerCase() === needle)
    .slice(0, 5)
    .map((row) => {
      const cik = String(row.cik_str ?? "").padStart(10, "0");
      const title = String(row.title ?? "SEC registrant");
      const ticker = String(row.ticker ?? "");
      return sensorResult({
        title,
        url: cik ? `https://data.sec.gov/submissions/CIK${cik}.json` : "https://www.sec.gov/edgar/searchedgar/companysearch",
        source: "SEC EDGAR",
        snippet: [ticker ? `Ticker ${ticker}` : null, cik ? `CIK ${cik}` : null].filter(Boolean).join(" · "),
        raw: row,
        reliability: "A",
        credibility: 2,
      });
    });
}
