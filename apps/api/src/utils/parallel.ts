/**
 * Parallel Processing Utilities
 *
 * Provides non-blocking batch processing with controlled concurrency.
 * Critical for background tasks that shouldn't affect live message latency.
 */

/**
 * Process items in parallel batches with controlled concurrency
 *
 * @param items - Array of items to process
 * @param batchSize - Number of items per batch
 * @param processor - Async function to process each item
 * @param options - Processing options
 * @returns Array of results
 */
export async function processInParallelBatches<T, R>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<R>,
  options: {
    delayMs?: number;
    onBatchComplete?: (batchNumber: number, totalBatches: number) => void;
    onError?: (error: Error, item: T, index: number) => void;
    continueOnError?: boolean;
  } = {}
): Promise<R[]> {
  const { delayMs = 0, onBatchComplete, onError, continueOnError = true } = options;
  const results: R[] = [];
  const batches = Math.ceil(items.length / batchSize);

  for (let i = 0; i < batches; i++) {
    const batch = items.slice(i * batchSize, (i + 1) * batchSize);

    // Process batch in parallel
    const batchPromises = batch.map(async (item, batchIndex) => {
      const globalIndex = i * batchSize + batchIndex;
      try {
        return await processor(item);
      } catch (error) {
        if (onError) {
          onError(error as Error, item, globalIndex);
        }
        if (!continueOnError) {
          throw error;
        }
        return null as unknown as R;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Callback for progress tracking
    onBatchComplete?.(i + 1, batches);

    // Small delay between batches (not within)
    if (delayMs > 0 && i < batches - 1) {
      await sleep(delayMs);
    }

    // Yield to event loop between batches
    await yieldToEventLoop();
  }

  return results;
}

/**
 * Process items with controlled concurrency (no batching)
 *
 * @param items - Array of items to process
 * @param concurrency - Maximum concurrent operations
 * @param processor - Async function to process each item
 * @returns Array of results
 */
export async function processWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  processor: (item: T, index: number) => Promise<R>,
  options: {
    onProgress?: (completed: number, total: number) => void;
    onError?: (error: Error, item: T, index: number) => void;
    continueOnError?: boolean;
  } = {}
): Promise<R[]> {
  const { onProgress, onError, continueOnError = true } = options;
  const results: R[] = new Array(items.length);
  let completed = 0;
  let currentIndex = 0;

  const workers = Array(Math.min(concurrency, items.length))
    .fill(null)
    .map(async () => {
      while (currentIndex < items.length) {
        const index = currentIndex++;
        const item = items[index];

        try {
          results[index] = await processor(item, index);
        } catch (error) {
          if (onError) {
            onError(error as Error, item, index);
          }
          if (!continueOnError) {
            throw error;
          }
          results[index] = null as unknown as R;
        }

        completed++;
        onProgress?.(completed, items.length);
      }
    });

  await Promise.all(workers);
  return results;
}

/**
 * Chunk an array into smaller arrays of specified size
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Yield to the event loop - allows other tasks to run
 * Critical for non-blocking background processing
 */
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run a function in the background without blocking
 * The function runs after the current call stack clears
 *
 * @param fn - Function to run in background
 * @param onError - Optional error handler
 */
export function runInBackground<T>(
  fn: () => Promise<T>,
  onError?: (error: Error) => void
): void {
  setImmediate(async () => {
    try {
      await fn();
    } catch (error) {
      if (onError) {
        onError(error as Error);
      } else {
        console.error('[Background] Unhandled error:', error);
      }
    }
  });
}

/**
 * Retry a function with exponential backoff
 *
 * @param fn - Function to retry
 * @param options - Retry options
 * @returns Result of the function
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
    shouldRetry?: (error: Error, attempt: number) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    backoffMultiplier = 2,
    shouldRetry = () => true,
  } = options;

  let lastError: Error;
  let delay = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries || !shouldRetry(lastError, attempt)) {
        throw lastError;
      }

      console.log(`[Retry] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
      await sleep(delay);
      delay = Math.min(delay * backoffMultiplier, maxDelayMs);
    }
  }

  throw lastError!;
}

/**
 * Create a deferred promise (useful for signaling)
 */
export function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * Throttle function calls
 *
 * @param fn - Function to throttle
 * @param limitMs - Minimum time between calls
 * @returns Throttled function
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limitMs: number
): T {
  let lastCall = 0;
  let timeout: NodeJS.Timeout | null = null;

  return ((...args: Parameters<T>) => {
    const now = Date.now();
    const remaining = limitMs - (now - lastCall);

    if (remaining <= 0) {
      lastCall = now;
      return fn(...args);
    }

    if (timeout) {
      clearTimeout(timeout);
    }

    return new Promise((resolve) => {
      timeout = setTimeout(() => {
        lastCall = Date.now();
        resolve(fn(...args));
      }, remaining);
    });
  }) as T;
}
