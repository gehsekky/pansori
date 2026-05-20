// Mirror of src/backend/src/services/narrativeFmt.ts — parses the
// `{{kind|display}}` tokens emitted by the backend so the FE can render
// mechanical bits with distinct styling while the surrounding prose flows
// as normal italic narrative.

export type NarrativeTokenKind = 'dmg' | 'hp' | 'roll' | 'dc' | 'ac' | 'save' | 'note';

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

const PIPE_SENTINEL = '\x00P\x00';

function unescapeDisplay(s: string): string {
  return s.replace(new RegExp(PIPE_SENTINEL, 'g'), '|');
}

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

export function stripNarrativeTokens(s: string): string {
  if (!s) return '';
  return s.replace(TOKEN_RE, (_full, _kind, display) => unescapeDisplay(display));
}
