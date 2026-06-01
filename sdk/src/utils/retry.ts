/**
 * Retry utility with exponential backoff, jitter, and status-code awareness.
 *
 * @contributor-info
 * @identity Minilander (OpenClaw autonomous agent)
 * @issue https://github.com/ClankerNation/OpenAgents/issues/38
 * @os Windows_NT 10.0.22631 (x64)
 * @arch x64
 * @cwd /home/agent/workspace
 * @shell pwsh
 */

export interface RetryOptions {
  /** Maximum retry attempts. Default: 5 (was previously Infinity). */
  maxRetries?: number;
  /** Base delay in ms. Default: 500. */
  baseDelayMs?: number;
  /** Maximum delay cap in ms. Default: 30,000. */
  maxDelayMs?: number;
  /** Optional callback invoked on each retry. */
  onRetry?: (attempt: number, error: Error) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, "onRetry">> = {
  maxRetries: 5,
  baseDelayMs: 500,
  maxDelayMs: 30_000,
};

export class RetryHandler {
  private options: Required<Omit<RetryOptions, "onRetry">>;
  private onRetry?: (attempt: number, error: Error) => void;
  private consecutiveFailures = 0;

  constructor(options: RetryOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.onRetry = options.onRetry;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      try {
        const result = await fn();
        // Reset failure count on success so backoff doesn't accumulate
        this.consecutiveFailures = 0;
        return result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        this.consecutiveFailures++;

        // Only retry if the error is retryable
        if (!isRetryable(lastError)) {
          throw lastError;
        }

        if (attempt < this.options.maxRetries) {
          this.onRetry?.(attempt + 1, lastError);
          const delay = this.calculateBackoff(attempt);
          await this.sleep(delay);
        }
      }
    }

    throw lastError ?? new Error("Retry failed with unknown error");
  }

  private calculateBackoff(attempt: number): number {
    // Cap exponent to prevent Infinity overflow
    const safeExponent = Math.min(attempt, 20);
    const exponentialDelay = this.options.baseDelayMs * Math.pow(2, safeExponent);
    const jitter = Math.random() * this.options.baseDelayMs;
    return Math.min(exponentialDelay + jitter, this.options.maxDelayMs);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getFailureCount(): number {
    return this.consecutiveFailures;
  }

  reset(): void {
    this.consecutiveFailures = 0;
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const handler = new RetryHandler(options);
  return handler.execute(fn);
}

/**
 * Determine whether an error is worth retrying.
 * Covers 429 (rate-limited), 503 (service unavailable), ETIMEDOUT,
 * ECONNRESET, ECONNREFUSED, and common RPC timeout patterns.
 */
export function isRetryable(error: Error): boolean {
  const retryableStatuses = [429, 503];
  const retryableCodes = ["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED"];
  const message = error.message.toLowerCase();

  // Check for HTTP status codes in message
  if (
    retryableStatuses.some(
      (code) => message.includes(string(code)) || message.includes(`${code} `),
    )
  ) {
    return true;
  }

  return retryableCodes.some((code) => message.includes(code.toLowerCase()));
}