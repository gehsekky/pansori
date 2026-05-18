import Anthropic from '@anthropic-ai/sdk';

export interface NarrativeMeta {
  worldName: string;
  charName: string;
  charClass: string;
  roomName: string;
  contextTheme?: string;
}

export interface LLMProvider {
  enhance(narrative: string, meta: NarrativeMeta): Promise<string>;
}

// ─── None provider (passthrough) ─────────────────────────────────────────────

class NoneProvider implements LLMProvider {
  async enhance(narrative: string): Promise<string> {
    return narrative;
  }
}

// ─── Anthropic provider ───────────────────────────────────────────────────────

const SYSTEM_PROMPT = (meta: NarrativeMeta) =>
  `You are a narrative writer for a tabletop RPG called "${meta.worldName}". ` +
  `The player is ${meta.charName}, a ${meta.charClass}, currently in ${meta.roomName}. ` +
  `Rewrite the following game event as vivid, atmospheric prose of 1–3 sentences. ` +
  `Rules: keep ALL facts, numbers, damage values, and outcomes exactly as given. ` +
  `Do not invent new events, items, or characters. Return only the prose — no preamble.`;

class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.model = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001';
  }

  async enhance(narrative: string, meta: NarrativeMeta): Promise<string> {
    try {
      const msg = await this.client.messages.create({
        model: this.model,
        max_tokens: 512,
        system: SYSTEM_PROMPT(meta),
        messages: [{ role: 'user', content: narrative }],
      });
      const block = msg.content.find((b) => b.type === 'text');
      return block && block.type === 'text' ? block.text.trim() : narrative;
    } catch (err) {
      console.error('[llmProvider] Anthropic error — falling back to template narrative:', err);
      return narrative;
    }
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

function createProvider(): LLMProvider {
  const choice = (process.env.LLM_PROVIDER ?? 'none').toLowerCase();
  if (choice === 'anthropic') return new AnthropicProvider();
  return new NoneProvider();
}

export const llmProvider: LLMProvider = createProvider();
