const SAFE_HASH = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;
const SAFE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SECRET_PATTERNS = [
  {
    rule: "authorization-header",
    pattern: /\b(?:authorization\s*:\s*)?bearer\s+[a-z0-9._~+/-]{16,}={0,2}\b/i,
  },
  {
    rule: "provider-key",
    pattern:
      /\b(?:sk-(?:proj-|ant-api\d{2}-)?|sb_secret_|gh[opusr]_|xox[baprs]-|whsec_)[a-z0-9_-]{16,}\b/i,
  },
  {
    rule: "jwt",
    pattern: /\beyJ[a-z0-9_-]{12,}\.[a-z0-9_-]{12,}\.[a-z0-9_-]{12,}\b/i,
  },
  {
    rule: "named-secret",
    pattern:
      /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|session[_-]?token|webhook[_-]?secret|service[_-]?role[_-]?key|password)\b\s*[:=]\s*["']?[a-z0-9._~+/-]{12,}/i,
  },
];

function shannonEntropy(value) {
  const frequencies = new Map();
  for (const character of value) {
    frequencies.set(character, (frequencies.get(character) ?? 0) + 1);
  }

  let entropy = 0;
  for (const count of frequencies.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

function isHighEntropyToken(token) {
  if (token.length < 32 || token.length > 512) return false;
  if (SAFE_HASH.test(token) || SAFE_UUID.test(token)) return false;

  const classes = [
    /[a-z]/.test(token),
    /[A-Z]/.test(token),
    /\d/.test(token),
    /[_~+/-]/.test(token),
  ].filter(Boolean).length;

  return classes >= 3 && shannonEntropy(token) >= 4.25;
}

function inspectString(value, path, findings) {
  for (const { rule, pattern } of SECRET_PATTERNS) {
    if (pattern.test(value)) {
      findings.push({ path, rule });
    }
  }

  const tokens = value.match(/[A-Za-z0-9_~+/-]{32,512}/g) ?? [];
  if (tokens.some(isHighEntropyToken)) {
    findings.push({ path, rule: "high-entropy-token" });
  }
}

function inspectValue(value, path, findings, seen) {
  if (typeof value === "string") {
    inspectString(value, path, findings);
    return;
  }

  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectValue(item, `${path}[${index}]`, findings, seen));
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    inspectValue(item, `${path}.${key}`, findings, seen);
  }
}

export function assessPersistenceSafety(value) {
  const findings = [];
  inspectValue(value, "$", findings, new WeakSet());
  return {
    safe: findings.length === 0,
    findings,
  };
}

export function assertPersistenceSafe(value) {
  const assessment = assessPersistenceSafety(value);
  if (!assessment.safe) {
    const first = assessment.findings[0];
    throw new Error(
      `Persistence rejected: secret-shaped value detected at ${first.path} (${first.rule}).`,
    );
  }
  return value;
}

