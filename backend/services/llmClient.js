/**
 * Minimal OpenAI-compatible LLM client using native fetch (Node >= 18)
 * Supports providers that expose an OpenAI-compatible Chat Completions API.
 * Configure via env:
 *   LLM_API_KEY        - required to enable fallback
 *   LLM_MODEL          - e.g., 'gpt-4o-mini', 'gpt-3.5-turbo', 'deepseek-chat', etc.
 *   LLM_BASE_URL       - override base URL (default https://api.openai.com/v1)
 *   LLM_PROVIDER       - optional label (openai, openrouter, groq, together, deepseek)
 */

const BASES = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  groq: 'https://api.groq.com/openai/v1',
  together: 'https://api.together.xyz/v1',
  deepseek: 'https://api.deepseek.com/v1',
};

function getConfig() {
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || 'gpt-3.5-turbo';
  const provider = (process.env.LLM_PROVIDER || 'openai').toLowerCase();
  const baseUrl = process.env.LLM_BASE_URL || BASES[provider] || BASES.openai;
  return { apiKey, model, baseUrl, provider };
}

async function chatComplete({ messages, temperature = 0.2, maxTokens = 512, system }) {
  const { apiKey, model, baseUrl, provider } = getConfig();
  if (!apiKey) throw new Error('LLM_API_KEY not set');

  const body = {
    model,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      ...(messages || []),
    ],
    temperature,
    max_tokens: maxTokens,
    stream: false,
  };

  const headers = {
    'content-type': 'application/json',
    'authorization': `Bearer ${apiKey}`,
  };
  // OpenRouter recommends Referer + Title but they are optional; keep minimal.
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`LLM error ${res.status}: ${text.slice(0, 300)}`);
  let data; try { data = JSON.parse(text); } catch { data = null; }
  const content = data?.choices?.[0]?.message?.content || '';
  if (!content) throw new Error('LLM returned empty content');
  return content;
}

module.exports = {
  chatComplete,
  getConfig,
};
