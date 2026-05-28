import type { ActionOptions } from '@humanhands/shared-types';

export interface RetryContext {
  attempt: number;
  maxAttempts: number;
  lastError: Error | null;
}

export type RetryableOperation<T> = (context: RetryContext) => Promise<T>;

export class RetryHandler {
  async execute<T>(
    operation: RetryableOperation<T>,
    options: Pick<ActionOptions, 'retries' | 'retryDelay'>,
  ): Promise<{ result: T; retryCount: number }> {
    const maxAttempts = (options.retries ?? 3) + 1;
    const delay = options.retryDelay ?? 500;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const context: RetryContext = { attempt, maxAttempts, lastError };
      try {
        const result = await operation(context);
        return { result, retryCount: attempt - 1 };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (!this.isRetryable(lastError) || attempt === maxAttempts) {
          throw lastError;
        }
        await this.sleep(delay * attempt);
      }
    }

    throw lastError ?? new Error('Retry handler exhausted without result');
  }

  private isRetryable(error: Error): boolean {
    const retryablePatterns = [
      /element is not visible/i,
      /element is not interactable/i,
      /element detached/i,
      /timeout/i,
      /stale element/i,
      /waiting for selector/i,
    ];
    return retryablePatterns.some((p) => p.test(error.message));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
