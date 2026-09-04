export type TokenKind = "comment" | "string" | "number" | "keyword" | "punct" | "text";
export interface HighlightToken { kind: TokenKind; text: string }

const KEYWORDS: Record<string, string> = {
  js: "as async await break case catch class const continue default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while yield true false null undefined",
  ts: "as async await break case catch class const continue declare default delete do else enum export extends finally for from function if implements import in interface keyof let namespace new of private protected public readonly return satisfies static super switch this throw try type typeof var while true false null undefined",
  rs: "as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while true false bool char str String Vec Option Some None Result Ok Err",
  py: "and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield True False None",
  go: "break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var true false nil",
  sh: "case do done elif else esac fi for function if in local return then until while export readonly",
  css: "important media import from to keyframes supports charset font-face",
  sql: "select from where insert into values update set delete create table drop alter join left right inner outer on group by order having limit as and or not null distinct",
};

const ALIASES: Record<string, string> = {
  mjs: "js", cjs: "js", jsx: "js", tsx: "ts", mts: "ts", rust: "rs", python: "py",
  bash: "sh", zsh: "sh", scss: "css", less: "css", json: "js", jsonc: "js", yaml: "yml", toml: "yml",
};
const HASH_COMMENTS = new Set(["py", "sh", "yml", "rb", "pl", "r", "makefile", "dockerfile", "conf", "ini", "env"]);
const NO_SINGLE_QUOTE = new Set(["rs"]);

export function highlightLines(source: string, extension: string): HighlightToken[][] {
  const normalized = source.replace(/\n$/, "");
  const lang = ALIASES[extension.toLowerCase()] ?? extension.toLowerCase();
  const words = new Set((KEYWORDS[lang] ?? "").split(" ").filter(Boolean));
  const hashComments = HASH_COMMENTS.has(lang);
  const singleQuote = !NO_SINGLE_QUOTE.has(lang);
  const pattern = [
    "\\/\\*[\\s\\S]*?(?:\\*\\/|$)", "\\/\\/[^\\n]*", hashComments ? "#[^\\n]*" : null,
    '"(?:\\\\.|[^"\\\\\\n])*"?', singleQuote ? "'(?:\\\\.|[^'\\\\\\n])*'?" : null, "`(?:\\\\.|[^`\\\\])*`?",
    "\\b\\d[\\w.]*\\b", "[A-Za-z_$][\\w$]*", "[^\\w\\s]",
  ].filter(Boolean).join("|");
  const regex = new RegExp(pattern, "g");
  const tokens: HighlightToken[] = [];
  let last = 0;
  const push = (kind: TokenKind, text: string) => {
    if (!text) return;
    const previous = tokens.at(-1);
    if (previous?.kind === kind) previous.text += text;
    else tokens.push({ kind, text });
  };
  for (let match = regex.exec(normalized); match; match = regex.exec(normalized)) {
    push("text", normalized.slice(last, match.index));
    last = match.index + match[0].length;
    push(tokenKind(match[0], words, hashComments, singleQuote), match[0]);
  }
  push("text", normalized.slice(last));

  const lines: HighlightToken[][] = [[]];
  for (const token of tokens) {
    token.text.split("\n").forEach((part, index) => {
      if (index) lines.push([]);
      if (part) lines.at(-1)!.push({ kind: token.kind, text: part });
    });
  }
  return lines;
}

function tokenKind(token: string, keywords: Set<string>, hashComments: boolean, singleQuote: boolean): TokenKind {
  const first = token[0];
  if ((first === "/" && ["/", "*"].includes(token[1])) || (hashComments && first === "#")) return "comment";
  if (first === "'") return singleQuote ? "string" : "punct";
  if (["\"", "`"].includes(first)) return "string";
  if (/\d/.test(first)) return "number";
  if (/[A-Za-z_$]/.test(first)) return keywords.has(token) ? "keyword" : "text";
  return "punct";
}
