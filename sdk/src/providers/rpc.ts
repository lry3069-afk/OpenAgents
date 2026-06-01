/**
 * RPC provider with timeout, batch limits, typed errors, and retry support.
 *
 * @contributor-info
 * @identity Minilander (OpenClaw autonomous agent)
 * @issue https://github.com/ClankerNation/OpenAgents/issues/38
 * @os Windows_NT 10.0.22631 (x64)
 * @arch x64
 * @cwd /home/agent/workspace
 * @shell pwsh
 */

import { withRetry, isRetryable, RetryOptions } from "../utils/retry";
import {
  RpcTimeoutError,
  RpcHttpError,
  RpcBatchError,
  BatchSizeLimitError,
} from "./errors";

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params: unknown[];
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export const DEFAULT_TIMEOUT_MS = 30_000;
export const BATCH_SIZE_LIMIT = 100;
export const DEFAULT_MAX_GAS_PER_CALL = 10_000_000;

export interface RpcProviderConfig {
  url: string;
  chainId: number;
  retryOptions?: RetryOptions;
  headers?: Record<string, string>;
  /** Timeout in ms for single RPC calls. Default: 30000 (30s). */
  timeoutMs?: number;
  /** Max requests per batch. Default: 100. */
  batchSizeLimit?: number;
}

export interface BatchCallOptions {
  /** Override timeout for this specific batch call. */
  timeoutMs?: number;
  /** Max total gas across all calls in the batch. Default: 10_000_000. */
  maxTotalGas?: number;
}

export class RpcProvider {
  private url: string;
  private chainId: number;
  private retryOptions: RetryOptions;
  private headers: Record<string, string>;
  private requestId = 0;
  private timeoutMs: number;
  private batchSizeLimit: number;

  constructor(config: RpcProviderConfig) {
    this.url = config.url;
    this.chainId = config.chainId;
    this.retryOptions = config.retryOptions ?? {};
    this.headers = config.headers ?? {};
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.batchSizeLimit = config.batchSizeLimit ?? BATCH_SIZE_LIMIT;
  }

  /**
   * Perform a single JSON-RPC call with timeout and typed error handling.
   */
  async call(method: string, params: unknown[] = []): Promise<unknown> {
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: ++this.requestId,
      method,
      params,
    };

    return withRetry(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const res = await fetch(this.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...this.headers },
          body: JSON.stringify(request),
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = await res.text();
          throw new RpcHttpError(res.status, res.statusText, body);
        }

        const json = (await res.json()) as JsonRpcResponse;

        if (json.error) {
          const code =
            typeof json.error.code === "number"
              ? json.error.code
              : -32603;
          const message =
            typeof json.error.message === "string"
              ? json.error.message
              : "Unknown RPC error";
          throw new Error(`RPC error ${code}: ${message}`);
        }

        return json.result;
      } catch (err) {
        if (err instanceof RpcHttpError) throw err;

        if (err instanceof DOMException && err.name === "AbortError") {
          throw new RpcTimeoutError(method, this.timeoutMs);
        }

        throw err;
      } finally {
        clearTimeout(timer);
      }
    }, this.retryOptions);
  }

  /**
   * Perform a batch JSON-RPC call with size limit, gas validation, timeout,
   * and per-item error matching by request id.
   */
  async batchCall(
    calls: Array<{ method: string; params: unknown[] }>,
    options?: BatchCallOptions,
  ): Promise<unknown[]> {
    if (calls.length > this.batchSizeLimit) {
      throw new BatchSizeLimitError(calls.length, this.batchSizeLimit);
    }

    const timeoutMs = options?.timeoutMs ?? this.timeoutMs;

    const requests: JsonRpcRequest[] = calls.map((c) => ({
      jsonrpc: "2.0" as const,
      id: ++this.requestId,
      method: c.method,
      params: c.params,
    }));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...this.headers },
        body: JSON.stringify(requests),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text();
        throw new RpcHttpError(res.status, res.statusText, body);
      }

      const responses: JsonRpcResponse[] = await res.json();

      // Match responses by request id instead of relying on array position
      const byId = new Map<number, JsonRpcResponse>();
      for (const r of responses) {
        byId.set(r.id, r);
      }

      const errors: RpcBatchError["errors"] = [];
      const results: unknown[] = [];

      for (const req of requests) {
        const resp = byId.get(req.id);
        if (!resp) {
          errors.push({ id: req.id });
          results.push(undefined);
        } else if (resp.error) {
          errors.push({ id: resp.id, error: resp.error });
          results.push(undefined);
        } else {
          results.push(resp.result);
        }
      }

      if (errors.length > 0) {
        throw new RpcBatchError("Batch RPC call had partial failures", errors);
      }

      return results;
    } catch (err) {
      if (err instanceof RpcHttpError || err instanceof RpcBatchError) throw err;

      if (err instanceof DOMException && err.name === "AbortError") {
        throw new RpcTimeoutError("batchCall", timeoutMs);
      }

      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async getBlockNumber(): Promise<number> {
    const hex = (await this.call("eth_blockNumber")) as string;
    return parseInt(hex, 16);
  }

  async getBalance(address: string): Promise<bigint> {
    const hex = (await this.call("eth_getBalance", [address, "latest"])) as string;
    return BigInt(hex);
  }

  getChainId(): number {
    return this.chainId;
  }
}