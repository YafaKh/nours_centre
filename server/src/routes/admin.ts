import { Router } from 'express';
import { requireAuth, requireRole } from '../auth/middleware.js';

const router = Router();
router.use(requireAuth, requireRole('ADMIN'));

// Placeholder for Phase 1 — results/import views arrive in later phases.
router.get('/dashboard', (req, res) => {
  res.json({ user: req.user });
});

export default router;
