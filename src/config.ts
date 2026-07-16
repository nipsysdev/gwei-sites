export interface Config {
  readonly pinToken: string;
  readonly rpcKey: string;
  readonly rpcKeyFallback: string;
  readonly dedicatedGateway: string;
}

export class ConfigBuilder {
  #pinToken = "";
  #rpcKey = "";
  #rpcKeyFallback = "";
  #dedicatedGateway = "";

  static fromEnv(): ConfigBuilder {
    return new ConfigBuilder()
      .pinToken(Deno.env.get("PIN_TOKEN") ?? "")
      .rpcKey(Deno.env.get("RPC_KEY") ?? "")
      .rpcKeyFallback(Deno.env.get("RPC_KEY_FALLBACK") ?? "")
      .dedicatedGateway(Deno.env.get("DEDICATED_GATEWAY") ?? "");
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

  build(): Config {
    return {
      pinToken: this.#pinToken,
      rpcKey: this.#rpcKey,
      rpcKeyFallback: this.#rpcKeyFallback,
      dedicatedGateway: this.#dedicatedGateway,
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
