import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, queryOne } from '../config/database';
import { config } from '../config/env';
import { User, JwtPayload } from '../types';
import { authenticate } from '../middleware/auth';

const router = Router();

// Public registration disabled - use admin panel to create users
// POST /admin/agents (requires admin authentication)

// Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    // Find user
    const user = await queryOne<User>(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Generate token
    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const token = jwt.sign(payload, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn as string,
    } as jwt.SignOptions);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const user = await queryOne<User>(
      'SELECT id, email, name, role, created_at FROM users WHERE id = $1',
      [req.user!.userId]
    );

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

export default router;
