// ============================================
// TIMING UTILITIES
// ============================================

/**
 * Sleep for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get a random delay between min and max
 */
export function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Sleep for a random duration between min and max
 */
export async function randomSleep(min: number, max: number): Promise<void> {
  const delay = randomDelay(min, max);
  await sleep(delay);
}

/**
 * Wrap setImmediate in a Promise for yielding to event loop
 */
export function setImmediatePromise(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

// ============================================
// ARRAY UTILITIES
// ============================================

/**
 * Split an array into chunks of specified size
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Remove duplicates from array by key
 */
export function uniqueBy<T>(array: T[], key: keyof T): T[] {
  const seen = new Set<unknown>();
  return array.filter(item => {
    const k = item[key];
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ============================================
// STRING UTILITIES
// ============================================

/**
 * Truncate string to max length with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Generate a unique temporary ID for optimistic updates
 */
export function generateTempId(): string {
  return `temp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Sanitize phone number (remove non-digits)
 */
export function sanitizePhoneNumber(phone: string): string {
  return phone.replace(/\D/g, '');
}

// ============================================
// VALIDATION UTILITIES
// ============================================

/**
 * Check if string is a valid phone number format
 */
export function isValidPhoneNumber(phone: string): boolean {
  const sanitized = sanitizePhoneNumber(phone);
  return sanitized.length >= 10 && sanitized.length <= 15;
}

/**
 * Check if string is a valid email
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// ============================================
// DATE UTILITIES
// ============================================

/**
 * Format date to ISO string
 */
export function toISOString(date: Date | string | number): string {
  return new Date(date).toISOString();
}

/**
 * Get time difference in milliseconds
 */
export function timeDiffMs(start: Date, end: Date = new Date()): number {
  return end.getTime() - start.getTime();
}

/**
 * Check if date is within the last N minutes
 */
export function isWithinMinutes(date: Date, minutes: number): boolean {
  const diff = timeDiffMs(date);
  return diff < minutes * 60 * 1000;
}

// ============================================
// OBJECT UTILITIES
// ============================================

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Pick specific keys from an object
 */
export function pick<T extends object, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Omit specific keys from an object
 */
export function omit<T extends object, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result as Omit<T, K>;
}

// ============================================
// ERROR UTILITIES
// ============================================

/**
 * Safe JSON stringify (handles circular references)
 */
export function safeStringify(obj: unknown): string {
  const seen = new WeakSet();
  return JSON.stringify(obj, (_, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
    }
    return value;
  });
}

/**
 * Extract error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return safeStringify(error);
}

// ============================================
// RETRY UTILITIES
// ============================================

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  onRetry?: (error: unknown, attempt: number) => void;
}

/**
 * Retry a function with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < options.maxRetries) {
        const delay = Math.min(
          options.baseDelayMs * Math.pow(2, attempt),
          options.maxDelayMs
        );
        options.onRetry?.(error, attempt + 1);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}
