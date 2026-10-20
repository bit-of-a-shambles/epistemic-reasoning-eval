// Documented APIs; all HTTP is injectable for offline contract tests.
export function validateModel(config) {
  const allowed = new Set([
    "provider",
    "model",
    "maxOutputTokens",
    "track",
    "temperature",
    "reasoningEffort",
    "timeoutMs",
    "pricing",
  ]);
  if (config && Object.keys(config).some((k) => !allowed.has(k)))
    throw new Error(
      "Unknown model config field; credentials belong in environment variables",
    );
  if (!config || !["openai", "anthropic"].includes(config.provider))
    throw new Error("provider must be openai or anthropic");
  if (typeof config.model !== "string" || !config.model.trim())
    throw new Error("An explicit model ID is required");
  if (config.model.includes("REPLACE_WITH"))
    throw new Error("Replace the example model ID with a pinned model ID");
  if (!Number.isInteger(config.maxOutputTokens) || config.maxOutputTokens < 16)
    throw new Error("maxOutputTokens must be an integer >=16");
  if (!["default", "fixed-budget"].includes(config.track))
    throw new Error("track must be default or fixed-budget");
  if (
    config.temperature !== undefined &&
    (!Number.isFinite(config.temperature) ||
      config.temperature < 0 ||
      config.temperature > 1)
  )
    throw new Error("Invalid temperature");
  if (
    config.timeoutMs !== undefined &&
    (!Number.isInteger(config.timeoutMs) || config.timeoutMs <= 0)
  )
    throw new Error("Invalid timeoutMs");
  if (
    config.pricing &&
    (!Number.isFinite(config.pricing.inputPerMillion) ||
      !Number.isFinite(config.pricing.outputPerMillion))
  )
    throw new Error("Specify both input and output token prices");
  for (const key of ["inputPerMillion", "outputPerMillion"])
    if (
      config.pricing?.[key] !== undefined &&
      (!Number.isFinite(config.pricing[key]) || config.pricing[key] < 0)
    )
      throw new Error("Invalid pricing");
  return config;
}
export function createProvider(
  config,
  { fetchImpl = fetch, env = process.env } = {},
) {
  validateModel(config);
  const apiKey =
    env[config.provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"];
  if (!apiKey)
    throw new Error(
      `Missing ${config.provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"}`,
    );
  return async (messages) => {
    const start = performance.now();
    const openai = config.provider === "openai";
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n");
    const conversation = messages.filter((m) => m.role !== "system");
    const body = openai
      ? {
          model: config.model,
          input: conversation,
          instructions: system,
          max_output_tokens: config.maxOutputTokens,
          store: false,
        }
      : {
          model: config.model,
          messages: conversation,
          system,
          max_tokens: config.maxOutputTokens,
        };
    if (config.temperature !== undefined) body.temperature = config.temperature;
    if (config.reasoningEffort !== undefined) {
      if (!openai)
        throw new Error(
          "reasoningEffort is supported only by the OpenAI adapter; configure Anthropic separately",
        );
      body.reasoning = { effort: config.reasoningEffort };
    }
    const response = await fetchImpl(
      openai
        ? "https://api.openai.com/v1/responses"
        : "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: openai
          ? {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            }
          : {
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
              "Content-Type": "application/json",
            },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(config.timeoutMs ?? 120000),
      },
    );
    if (!response.ok)
      throw new Error(
        `Provider HTTP ${response.status}; request ${response.headers?.get("request-id") ?? "unknown"}`,
      );
    const data = await response.json();
    const text = openai
      ? (data.output ?? [])
          .flatMap((item) => item.content ?? [])
          .filter((c) => c.type === "output_text")
          .map((c) => c.text)
          .join("\n")
      : (data.content ?? [])
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("\n");
    const usage = data.usage
      ? {
          inputTokens: data.usage.input_tokens,
          outputTokens: data.usage.output_tokens,
          raw: data.usage,
        }
      : null;
    // User-supplied list-price estimates, never silently substitute missing prices with zero.
    const cost =
      usage && config.pricing
        ? (usage.inputTokens * config.pricing.inputPerMillion +
            usage.outputTokens * config.pricing.outputPerMillion) /
          1e6
        : null;
    return {
      text,
      usage,
      estimatedCost: Number.isFinite(cost) ? cost : null,
      latencyMs: performance.now() - start,
      status: openai
        ? data.status
        : data.stop_reason === "end_turn"
          ? "completed"
          : "incomplete",
      stopReason: openai
        ? (data.incomplete_details?.reason ?? null)
        : data.stop_reason,
      resolvedModel: data.model ?? config.model,
      requestId: data.id ?? null,
    };
  };
}
