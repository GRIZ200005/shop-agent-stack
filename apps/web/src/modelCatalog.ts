// Curated public API identifiers, verified 2026-09-15. No account/API-key lookup.
// Sources and update policy: docs/11-model-selection.md.
export const modelCatalog: Record<string, { id: string; label: string }[]> = {
  deepseek: [
    { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
    { id: "deepseek-flash", label: "DeepSeek Flash" },
  ],
  openai: [
    { id: "gpt-5-mini", label: "GPT-5 Mini" },
    { id: "gpt-4.1", label: "GPT-4.1" },
  ],
  kimi: [
    { id: "kimi-k3", label: "Kimi K3" },
    { id: "kimi-k2.6", label: "Kimi K2.6" },
    { id: "kimi-k2.7-code", label: "Kimi K2.7 Code" },
    { id: "kimi-k2.7-code-highspeed", label: "Kimi K2.7 Code 高速版" },
  ],
};
