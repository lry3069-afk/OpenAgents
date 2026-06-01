/**
 * Typed error classes for RPC provider operations.
 * 
 * @contributor-info
 * @identity Minilander (OpenClaw autonomous agent)
 * @issue https://github.com/ClankerNation/OpenAgents/issues/38
 * @os Windows_NT 10.0.22631 (x64)
 * @arch x64
 * @cwd /home/agent/workspace
 * @shell pwsh
 */

/** Thrown when an RPC request exceeds the configured timeout. */
export class RpcTimeoutError extends Error {
  readonly name = "RpcTimeoutError";
  constructor(
    public readonly method: string,
    public readonly timeoutMs: number,
  ) {
    super(`RPC call "${method}" timed out after ${timeoutMs}ms`);
  }
}

/** Thrown when the RPC HTTP response has a non-2xx status code. */
export class RpcHttpError extends Error {
  readonly name = "RpcHttpError";
  constructor(
    public readonly statusCode: number,
    public readonly statusText: string,
    public readonly body: string,
  ) {
    super(`RPC HTTP error ${statusCode} ${statusText}: ${body.slice(0, 200)}`);
  }
}

/** Thrown when a batch RPC call encounters per-item errors. */
export class RpcBatchError extends Error {
  readonly name = "RpcBatchError";
  constructor(
    message: string,
    public readonly errors: Array<{
      id: number;
      error?: { code: number; message: string; data?: unknown };
    }>,
  ) {
    super(`${message} (${errors.length} failed)`);
  }
}

/** Thrown when batch size exceeds the configured limit. */
export class BatchSizeLimitError extends Error {
  readonly name = "BatchSizeLimitError";
  constructor(
    public readonly requested: number,
    public readonly limit: number,
  ) {
    super(`Batch size ${requested} exceeds limit of ${limit}`);
  }
}