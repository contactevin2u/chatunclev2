/**
 * Input Validation Utilities
 * Security-focused validation functions for user inputs
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate password complexity
 * Requirements:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 */
export function validatePassword(password: string): ValidationResult {
  if (!password) {
    return { valid: false, error: 'Password is required' };
  }

  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long' };
  }

  if (password.length > 128) {
    return { valid: false, error: 'Password must not exceed 128 characters' };
  }

  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter' };
  }

  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter' };
  }

  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number' };
  }

  return { valid: true };
}

/**
 * Validate email format
 */
export function validateEmail(email: string): ValidationResult {
  if (!email) {
    return { valid: false, error: 'Email is required' };
  }

  // Basic email regex - allows most valid emails
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(email)) {
    return { valid: false, error: 'Invalid email format' };
  }

  if (email.length > 255) {
    return { valid: false, error: 'Email must not exceed 255 characters' };
  }

  return { valid: true };
}

/**
 * Validate name field
 */
export function validateName(name: string): ValidationResult {
  if (!name) {
    return { valid: false, error: 'Name is required' };
  }

  if (name.trim().length < 2) {
    return { valid: false, error: 'Name must be at least 2 characters long' };
  }

  if (name.length > 100) {
    return { valid: false, error: 'Name must not exceed 100 characters' };
  }

  return { valid: true };
}

/**
 * Sanitize string input - removes potential XSS vectors
 */
export function sanitizeString(input: string): string {
  if (!input) return '';

  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim();
}

/**
 * Validate pagination parameters
 */
export function validatePagination(limit?: string | number, offset?: string | number): {
  limit: number;
  offset: number;
} {
  const parsedLimit = typeof limit === 'string' ? parseInt(limit, 10) : limit;
  const parsedOffset = typeof offset === 'string' ? parseInt(offset, 10) : offset;

  return {
    limit: Math.min(Math.max(parsedLimit || 50, 1), 100),
    offset: Math.max(parsedOffset || 0, 0),
  };
}

/**
 * Validate UUID format
 */
export function validateUUID(id: string): ValidationResult {
  if (!id) {
    return { valid: false, error: 'ID is required' };
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidRegex.test(id)) {
    return { valid: false, error: 'Invalid ID format' };
  }

  return { valid: true };
}
