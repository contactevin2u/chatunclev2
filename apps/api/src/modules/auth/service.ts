import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, users } from '../../db/index.js';
import { config } from '../../config/env.js';

export interface TokenPayload {
  userId: string;
  email: string;
  name: string;
  role: string;
}

export interface AuthResult {
  success: boolean;
  token?: string;
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
  error?: string;
}

/**
 * Hash a password
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/**
 * Compare password with hash
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate JWT token
 */
export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

/**
 * Verify JWT token
 */
export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret) as TokenPayload;
  } catch {
    return null;
  }
}

/**
 * Register a new user
 */
export async function register(
  email: string,
  password: string,
  name: string
): Promise<AuthResult> {
  try {
    // Check if user exists
    const existing = await db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
    });

    if (existing) {
      return { success: false, error: 'Email already registered' };
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const [user] = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        passwordHash,
        name,
        role: 'user',
      })
      .returning();

    if (!user) {
      return { success: false, error: 'Failed to create user' };
    }

    // Generate token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    return {
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  } catch (error) {
    console.error('[Auth] Register error:', error);
    return { success: false, error: 'Registration failed' };
  }
}

/**
 * Login user
 */
export async function login(email: string, password: string): Promise<AuthResult> {
  try {
    // Find user
    const user = await db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
    });

    if (!user) {
      return { success: false, error: 'Invalid credentials' };
    }

    // Verify password
    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      return { success: false, error: 'Invalid credentials' };
    }

    // Generate token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    return {
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  } catch (error) {
    console.error('[Auth] Login error:', error);
    return { success: false, error: 'Login failed' };
  }
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string) {
  return db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
    },
  });
}

/**
 * Refresh token
 */
export async function refreshToken(currentToken: string): Promise<AuthResult> {
  const payload = verifyToken(currentToken);
  if (!payload) {
    return { success: false, error: 'Invalid token' };
  }

  // Verify user still exists
  const user = await getUserById(payload.userId);
  if (!user) {
    return { success: false, error: 'User not found' };
  }

  // Generate new token
  const token = generateToken({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });

  return {
    success: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  };
}
