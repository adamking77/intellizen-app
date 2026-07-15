import type { HomePin } from "@/lib/home-pins";

export interface AuthoritativeHomePinMutation {
  before: HomePin[];
  requested: HomePin[];
  authoritative: HomePin[];
}

/**
 * Applies a Home mutation to a fresh remote snapshot and verifies the saved
 * result with a second read. This preserves pins added by another process
 * since the last UI query and keeps the shared Home Pins database canonical.
 */
export async function mutateAuthoritativeHomePins({
  read,
  write,
  transform,
}: {
  read: () => Promise<HomePin[]>;
  write: (pins: HomePin[]) => Promise<unknown>;
  transform: (pins: HomePin[]) => HomePin[];
}): Promise<AuthoritativeHomePinMutation> {
  const before = await read();
  const requested = transform(before);
  await write(requested);
  const authoritative = await read();
  return { before, requested, authoritative };
}
