
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { requireString, requireEmail } from '../utils/validate.js';
import { signToken } from '../utils/token.js';

// POST /api/auth/register
export async function register(req, res) {
  const name = requireString(req.body.name, 'name', {
    min: 2,
    max: 80,
  });

  const email = requireEmail(req.body.email);
  const password = requireString(req.body.password, 'password', {
    min: 8,
    max: 128,
  });

  const existingUser = await User.findOne({ email });

  if (existingUser) {
    throw ApiError.badRequest('An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  let user;

  try {
    user = await User.create({
      name,
      email,
      passwordHash,
      role: 'customer',
    });
  } catch (error) {
    // Handle simultaneous registrations with the same email.
    if (error.code === 11000) {
      throw ApiError.badRequest(
        'An account with this email already exists',
      );
    }
    throw error;
  }

  const token = signToken(user);

  return res.status(201).json({
    success: true,
    message: 'Registration successful',
    data: {
      user: user.toJSON(),
      token,
    },
  });
}

// POST /api/auth/login
export async function login(req, res) {
  const email = requireEmail(req.body.email);
  const password = requireString(req.body.password, 'password', {
    max: 128,
  });

  // passwordHash is excluded from normal queries in User.js.
  const user = await User.findOne({ email }).select('+passwordHash');

  if (!user) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  if (!user.isActive) {
    throw ApiError.forbidden(
      'This account has been deactivated',
      'ACCOUNT_DISABLED',
    );
  }

  const passwordMatches = await bcrypt.compare(
    password,
    user.passwordHash,
  );

  if (!passwordMatches) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const token = signToken(user);

  return res.status(200).json({
    success: true,
    message: 'Login successful',
    data: {
      user: user.toJSON(),
      token,
    },
  });
}
