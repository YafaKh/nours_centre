import { Router } from 'express';
import { requireAuth, requireRole } from '../auth/middleware.js';

const router = Router();
router.use(requireAuth, requireRole('STUDENT'));

// Placeholder for Phase 1 — quiz list arrives in Phase 3.
router.get('/dashboard', (req, res) => {
  res.json({ user: req.user, quizzes: [] });
});

export default router;
