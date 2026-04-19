export interface StreamResult {
  fullText: string;
  usage: { inputTokens: number; outputTokens: number };
}

export interface ProviderHealth {
  status: 'ok' | 'error';
  latencyMs: number;
}

// Pluggable LLM contract. One active provider at a time, selected via config.
// Each provider owns its own SDK, retries, circuit breaker, and error mapping.
// Callers work with this interface — never with Anthropic (or any other) SDK directly.
export interface LlmProvider {
  name: string;
  generate(prompt: string): Promise<string>;
  stream(prompt: string, onText: (delta: string) => void, signal?: AbortSignal): Promise<StreamResult>;
  checkHealth(): Promise<ProviderHealth>;
}

let activeProvider: LlmProvider | null = null;

export function getProvider(): LlmProvider {
  if (!activeProvider) {
    throw new Error('LLM provider not registered — call registerProvider() at boot');
  }
  return activeProvider;
}

export function registerProvider(provider: LlmProvider): void {
  activeProvider = provider;
}

// Test-only — lets a test reset module state between runs.
export function resetProvider(): void {
  activeProvider = null;
}
