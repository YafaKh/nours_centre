import { Router } from 'express';
import { requireAuth, requireRole } from '../auth/middleware.js';

const router = Router();
// Admin has all teacher abilities (FR-007), so both roles pass here.
router.use(requireAuth, requireRole('TEACHER', 'ADMIN'));

// Placeholder for Phase 1 — quiz authoring arrives in Phase 2.
router.get('/dashboard', (req, res) => {
  res.json({ user: req.user, quizzes: [] });
});

export default router;
