import { Router } from 'express';
import { login, me, register, updateMe } from '../controllers/auth.controller.js';
import {
  cancelEmailChange,
  changePassword,
  checkResetToken,
  forgotPassword,
  getEmailChange,
  requestEmailChange,
  resetPassword,
  verifyEmailChange,
} from '../controllers/accountSecurity.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { env } from '../config/env.js';

// Mounted at /api/auth (API contract §6 and §6a).
const router = Router();

// Separate budgets, so sign-up attempts don't use up sign-in attempts.
const loginLimit = createRateLimiter({ ...env.authRateLimit, name: 'sign-in attempts' });
const registerLimit = createRateLimiter({ ...env.authRateLimit, name: 'sign-up attempts' });
// Stricter budgets for password reset and security changes (guessing tokens or passwords).
const resetRequestLimit = createRateLimiter({ ...env.sensitiveRateLimit, name: 'password reset requests' });
const tokenLimit = createRateLimiter({ ...env.sensitiveRateLimit, name: 'attempts with this link' });
const securityChangeLimit = createRateLimiter({ ...env.sensitiveRateLimit, name: 'security changes' });

router.post('/register', registerLimit, register);
router.post('/login', loginLimit, login);
router.get('/me', requireAuth, me);
router.patch('/me', requireAuth, updateMe);

// Account security (§6a)
router.post('/me/password', requireAuth, securityChangeLimit, changePassword);
router.get('/me/email', requireAuth, getEmailChange);
router.post('/me/email', requireAuth, securityChangeLimit, requestEmailChange);
router.delete('/me/email', requireAuth, cancelEmailChange);
router.post('/verify-email', tokenLimit, verifyEmailChange);
router.post('/forgot-password', resetRequestLimit, forgotPassword);
router.post('/reset-password/check', tokenLimit, checkResetToken);
router.post('/reset-password', tokenLimit, resetPassword);

export default router;
