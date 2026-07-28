import { supabase } from "@/lib/supabase";
import type { IntelClaim, IntelEntity } from "@/lib/types";

// ============================
// OSINT entity layer (Phase C)
// ============================

const ENTITY_SELECT =
  "id, entity_type, name, aliases, external_ids, summary, confidence, first_case_id, created_at, updated_at";

export async function listIntelEntities(input: { caseId?: string; search?: string; limit?: number } = {}) {
  const limit = input.limit ?? 50;
  if (input.caseId) {
    // Entities linked to this case via signal provenance or first sighting.
    const { data: links, error: linksError } = await supabase
      .schema("intel").from("entity_signals")
      .select("entity_id")
      .eq("case_id", input.caseId)
      .limit(500);
    if (linksError) throw linksError;
    const linkedIds = Array.from(new Set(((links ?? []) as Array<{ entity_id: string }>).map((row) => row.entity_id)));
    let query = supabase
      .schema("intel").from("entities")
      .select(ENTITY_SELECT)
      .order("updated_at", { ascending: false })
      .limit(limit);
    query = linkedIds.length
      ? query.or(`id.in.(${linkedIds.join(",")}),first_case_id.eq.${input.caseId}`)
      : query.eq("first_case_id", input.caseId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as IntelEntity[];
  }

  let query = supabase
    .schema("intel").from("entities")
    .select(ENTITY_SELECT)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (input.search?.trim()) {
    query = query.ilike("name", `%${input.search.trim()}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as IntelEntity[];
}

/** Upsert a canonical entity by (type, case-insensitive name); merges aliases. */
export async function upsertIntelEntity(input: {
  entityType: IntelEntity["entity_type"];
  name: string;
  aliases?: string[];
  externalIds?: Record<string, unknown>;
  summary?: string | null;
  confidence?: IntelEntity["confidence"];
  caseId?: string | null;
}) {
  const name = input.name.trim();
  if (!name) throw new Error("Entity name is required.");
  const { data: existing, error: existingError } = await supabase
    .schema("intel").from("entities")
    .select(ENTITY_SELECT)
    .eq("entity_type", input.entityType)
    .ilike("name", name)
    .limit(1);
  if (existingError) throw existingError;

  const match = (existing ?? [])[0] as IntelEntity | undefined;
  if (match) {
    const mergedAliases = Array.from(new Set([...match.aliases, ...(input.aliases ?? [])]));
    const { data, error } = await supabase
      .schema("intel").from("entities")
      .update({
        aliases: mergedAliases,
        external_ids: { ...match.external_ids, ...(input.externalIds ?? {}) },
        ...(input.summary !== undefined ? { summary: input.summary } : {}),
        ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
      })
      .eq("id", match.id)
      .select(ENTITY_SELECT)
      .single();
    if (error) throw error;
    return { entity: data as IntelEntity, created: false };
  }

  const { data, error } = await supabase
    .schema("intel").from("entities")
    .insert([
      {
        entity_type: input.entityType,
        name,
        aliases: input.aliases ?? [],
        external_ids: input.externalIds ?? {},
        summary: input.summary ?? null,
        confidence: input.confidence ?? null,
        first_case_id: input.caseId ?? null,
      },
    ])
    .select(ENTITY_SELECT)
    .single();
  if (error) throw error;
  return { entity: data as IntelEntity, created: true };
}

export async function linkEntitySignal(input: { entityId: string; signalId: number; caseId?: string | null; note?: string | null }) {
  const { error } = await supabase
    .schema("intel").from("entity_signals")
    .upsert(
      [{ entity_id: input.entityId, signal_id: input.signalId, case_id: input.caseId ?? null, note: input.note ?? null }],
      { onConflict: "entity_id,signal_id" },
    );
  if (error) throw error;
}

const CLAIM_SELECT =
  "id, case_id, claim, entity_ids, source_reliability, info_credibility, claim_origin, event_date, supporting_signal_ids, contradicting_signal_ids, recorded_by, created_at";

export async function listIntelClaims(input: { caseId?: string; entityId?: string; limit?: number } = {}) {
  let query = supabase
    .schema("intel").from("claims")
    .select(CLAIM_SELECT)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 50);
  if (input.caseId) query = query.eq("case_id", input.caseId);
  if (input.entityId) query = query.contains("entity_ids", [input.entityId]);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as IntelClaim[];
}

/** Record a graded claim. Claims are append-only; supersede with a new claim. */
export async function createIntelClaim(input: {
  claim: string;
  recordedBy: string;
  caseId?: string | null;
  entityIds?: string[];
  sourceReliability?: IntelClaim["source_reliability"];
  infoCredibility?: number | null;
  claimOrigin?: IntelClaim["claim_origin"];
  eventDate?: string | null;
  supportingSignalIds?: number[];
  contradictingSignalIds?: number[];
}) {
  const claim = input.claim.trim();
  if (!claim) throw new Error("Claim text is required.");
  const { data, error } = await supabase
    .schema("intel").from("claims")
    .insert([
      {
        claim,
        recorded_by: input.recordedBy,
        case_id: input.caseId ?? null,
        entity_ids: input.entityIds ?? [],
        source_reliability: input.sourceReliability ?? null,
        info_credibility: input.infoCredibility ?? null,
        claim_origin: input.claimOrigin ?? null,
        event_date: input.eventDate ?? null,
        supporting_signal_ids: input.supportingSignalIds ?? [],
        contradicting_signal_ids: input.contradictingSignalIds ?? [],
      },
    ])
    .select(CLAIM_SELECT)
    .single();
  if (error) throw error;
  return data as IntelClaim;
}
