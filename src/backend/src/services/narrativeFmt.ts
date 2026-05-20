// Narrative token format — separates mechanical bits (dice rolls, damage,
// HP, save DCs) from prose so the UI can render them distinctively while
// keeping them inline with the immersive narrative.
//
// Wire format: `{{kind|display}}`
//   - `kind`  — one of NarrativeTokenKind; drives the styled span on the FE
//   - `display` — the user-visible text (e.g. "5", "23/45", "DC 14")
//
// Producers use the `fmt.*` helpers below to build tokens; consumers
// (frontend + tests) parse with parseNarrativeTokens, or strip back to
// plain text with stripNarrativeTokens.
//
// Tokens may not contain `|` or `}}`. We hard-escape pipes in display text;
// `}}` is not expected in any mechanical bit we emit.

export type NarrativeTokenKind =
  | 'dmg' // damage dealt (e.g. "5", "5 damage")
  | 'hp' // HP value (e.g. "23/45", "1 HP")
  | 'roll' // d20 / dice roll result (e.g. "18", "d20 18")
  | 'dc' // save / check DC (e.g. "DC 14")
  | 'ac' // armor class (e.g. "AC 16")
  | 'save' // save result (e.g. "DEX 12")
  | 'note'; // misc mechanical aside ("[Sneak Attack 2d6: +7]")

export interface NarrativeTextPart {
  type: 'text';
  text: string;
}

export interface NarrativeTokenPart {
  type: 'token';
  kind: NarrativeTokenKind;
  display: string;
}

export type NarrativePart = NarrativeTextPart | NarrativeTokenPart;

// `|` is the kind/display separator. Display text containing `|` is
// escaped to a sentinel here and unescaped on parse so prose like
// "STR|DEX save" can survive a token wrapper without ambiguity.
const PIPE_SENTINEL = '\x00P\x00';

function escapeDisplay(s: string): string {
  return s.replace(/\|/g, PIPE_SENTINEL);
}

function unescapeDisplay(s: string): string {
  return s.replace(new RegExp(PIPE_SENTINEL, 'g'), '|');
}

function tok(kind: NarrativeTokenKind, display: string | number): string {
  return `{{${kind}|${escapeDisplay(String(display))}}}`;
}

export const fmt = {
  dmg: (n: number) => tok('dmg', n),
  hp: (cur: number, max?: number) => tok('hp', max == null ? String(cur) : `${cur}/${max}`),
  roll: (n: number) => tok('roll', n),
  dc: (n: number) => tok('dc', `DC ${n}`),
  ac: (n: number) => tok('ac', `AC ${n}`),
  save: (ability: string, total: number) => tok('save', `${ability} ${total}`),
  note: (text: string) => tok('note', text),
};

// Regex matches `{{kind|...}}` non-greedily. We use [^{}] inside to avoid
// catastrophic backtracking and to keep braces in display text reserved.
const TOKEN_RE = /\{\{(dmg|hp|roll|dc|ac|save|note)\|([^{}]*?)\}\}/g;

export function parseNarrativeTokens(s: string): NarrativePart[] {
  if (!s) return [];
  const parts: NarrativePart[] = [];
  let lastIdx = 0;
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(s)) !== null) {
    if (m.index > lastIdx) {
      parts.push({ type: 'text', text: s.slice(lastIdx, m.index) });
    }
    parts.push({
      type: 'token',
      kind: m[1] as NarrativeTokenKind,
      display: unescapeDisplay(m[2]),
    });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < s.length) {
    parts.push({ type: 'text', text: s.slice(lastIdx) });
  }
  return parts;
}

// Reduces a tokenised narrative to its plain display text. Used by tests
// asserting against old substrings ("takes 5 damage") and by any code path
// that needs the prose-only form (LLM prompts, plain-text exports).
export function stripNarrativeTokens(s: string): string {
  if (!s) return '';
  return s.replace(TOKEN_RE, (_full, _kind, display) => unescapeDisplay(display));
}
