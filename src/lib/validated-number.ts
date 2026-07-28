export function requiredNonNegativeInteger(value: unknown, label: string) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}
