export interface Config {
  readonly pinToken: string;
  readonly rpcKey: string;
  readonly rpcKeyFallback: string;
  readonly dedicatedGateway: string;
  /** Custom-domain aliases: request host → full `.gwei` name to resolve. */
  readonly customDomains: ReadonlyMap<string, string>;
}

/**
 * Parse a custom-domain map of the form `host=name,host=name` into a Map of
 * lowercased host → full `.gwei` name.
 */
export function parseCustomDomains(raw: string): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  if (!raw) return map;
  for (const pair of raw.split(",")) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const host = pair.slice(0, idx).trim().toLowerCase();
    const name = pair.slice(idx + 1).trim().toLowerCase();
    if (host && name) map.set(host, name);
  }
  return map;
}

export class ConfigBuilder {
  #pinToken = "";
  #rpcKey = "";
  #rpcKeyFallback = "";
  #dedicatedGateway = "";
  #customDomains: ReadonlyMap<string, string> = new Map();

  static fromEnv(): ConfigBuilder {
    return new ConfigBuilder()
      .pinToken(Deno.env.get("PIN_TOKEN") ?? "")
      .rpcKey(Deno.env.get("RPC_KEY") ?? "")
      .rpcKeyFallback(Deno.env.get("RPC_KEY_FALLBACK") ?? "")
      .dedicatedGateway(Deno.env.get("DEDICATED_GATEWAY") ?? "")
      .customDomains(Deno.env.get("CUSTOM_DOMAINS") ?? "");
  }

  pinToken(v: string): this {
    this.#pinToken = v;
    return this;
  }

  rpcKey(v: string): this {
    this.#rpcKey = v;
    return this;
  }

  rpcKeyFallback(v: string): this {
    this.#rpcKeyFallback = v;
    return this;
  }

  dedicatedGateway(v: string): this {
    this.#dedicatedGateway = v;
    return this;
  }

  /** Set custom-domain aliases from a `host=name,host=name` string. */
  customDomains(v: string): this {
    this.#customDomains = parseCustomDomains(v);
    return this;
  }

  build(): Config {
    return {
      pinToken: this.#pinToken,
      rpcKey: this.#rpcKey,
      rpcKeyFallback: this.#rpcKeyFallback,
      dedicatedGateway: this.#dedicatedGateway,
      customDomains: this.#customDomains,
    };
  }
}

let current: Config = ConfigBuilder.fromEnv().build();

export function getConfig(): Config {
  return current;
}

export function setConfig(config: Config): void {
  current = config;
}

export function resetConfig(): void {
  current = ConfigBuilder.fromEnv().build();
}
