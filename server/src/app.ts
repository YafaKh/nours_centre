import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import authRoutes from './auth/routes.js';
import studentRoutes from './routes/student.js';
import teacherRoutes from './routes/teacher.js';
import adminRoutes from './routes/admin.js';

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(cookieParser(process.env.COOKIE_SECRET));
  app.use(
    cors({
      origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
      credentials: true,
    }),
  );

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.use('/api/auth', authRoutes);
  app.use('/api/student', studentRoutes);
  app.use('/api/teacher', teacherRoutes);
  app.use('/api/admin', adminRoutes);

  return app;
}
