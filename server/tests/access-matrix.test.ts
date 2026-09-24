import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import {
  cleanupQuizFixtures,
  createAdmin,
  createClass,
  createStudent,
  createTeacher,
  createPublishedQuiz,
  loginAndGetCookie,
  validQuestionsPayload,
  validQuizShellPayload,
} from './helpers/quizFixtures.js';

const app = createApp();
const PREFIX = 'access-matrix-';

// SPEC section 8, priority test #5, scoped exactly as PLAN.md Phase 8 describes it: not a full
// cartesian sweep of every endpoint x role x ownership combination, but the three cases that
// matter most - student vs cross-class/teacher/admin routes, teacher A vs teacher B, and admin
// succeeding everywhere those two are blocked.
describe('access control matrix (priority test #5)', () => {
  let classA: { id: string };
  let classB: { id: string };
  let studentACookie: string[];
  let studentBCookie: string[];
  let teacherACookie: string[];
  let teacherBCookie: string[];
  let adminCookie: string[];
  let quizAId: string;
  let quizBId: string;

  beforeAll(async () => {
    classA = await createClass(`${PREFIX}class-a`);
    classB = await createClass(`${PREFIX}class-b`);

    const teacherA = await createTeacher({ username: `${PREFIX}teacherA@x.test` });
    const teacherB = await createTeacher({ username: `${PREFIX}teacherB@x.test` });
    const admin = await createAdmin({ username: `${PREFIX}admin@x.test` });
    const studentA = await createStudent(classA.id, { studentId: `${PREFIX}studentA` });
    const studentB = await createStudent(classB.id, { studentId: `${PREFIX}studentB` });

    teacherACookie = await loginAndGetCookie(app, teacherA.username);
    teacherBCookie = await loginAndGetCookie(app, teacherB.username);
    adminCookie = await loginAndGetCookie(app, admin.username);
    studentACookie = await loginAndGetCookie(app, studentA.username);
    studentBCookie = await loginAndGetCookie(app, studentB.username);

    quizAId = await createPublishedQuiz(app, teacherACookie, { classIds: [classA.id] });
    quizBId = await createPublishedQuiz(app, teacherBCookie, { classIds: [classB.id] });
  });

  afterAll(async () => {
    await cleanupQuizFixtures(
      [`${PREFIX}teacherA`, `${PREFIX}teacherB`, `${PREFIX}admin`, `${PREFIX}studentA`, `${PREFIX}studentB`],
      `${PREFIX}class`,
    );
  });

  describe('case 1: student blocked from every teacher/admin route, and from any quiz/result outside their own class', () => {
    it('gets 403 from every teacher-only route', async () => {
      const routes: [string, 'get' | 'post' | 'put'][] = [
        ['/api/teacher/dashboard', 'get'],
        ['/api/teacher/classes', 'get'],
        ['/api/teacher/quizzes', 'get'],
        [`/api/teacher/quizzes/${quizAId}`, 'get'],
        [`/api/teacher/quizzes/${quizAId}/results`, 'get'],
        [`/api/teacher/quizzes/${quizAId}/results/export`, 'get'],
        [`/api/teacher/quizzes/${quizAId}/attempts`, 'get'],
        ['/api/teacher/quizzes', 'post'],
        [`/api/teacher/quizzes/${quizAId}`, 'put'],
        [`/api/teacher/quizzes/${quizAId}/questions`, 'put'],
        [`/api/teacher/quizzes/${quizAId}/publish`, 'post'],
      ];
      for (const [route, method] of routes) {
        const res = await request(app)[method](route).set('Cookie', studentACookie).send({});
        expect(res.status, `${method.toUpperCase()} ${route} as student`).toBe(403);
      }
    });

    it('gets 403 from every admin-only route', async () => {
      const routes: [string, 'get' | 'post'][] = [
        ['/api/admin/dashboard', 'get'],
        ['/api/admin/students', 'get'],
        ['/api/admin/teachers', 'get'],
        ['/api/admin/import/students/template', 'get'],
        ['/api/admin/import/teachers/template', 'get'],
      ];
      for (const [route, method] of routes) {
        const res = await request(app)[method](route).set('Cookie', studentACookie).send({});
        expect(res.status, `${method.toUpperCase()} ${route} as student`).toBe(403);
      }
    });

    it('excludes another class\'s quiz from the student\'s own quiz list (FR-004)', async () => {
      const resA = await request(app).get('/api/student/quizzes').set('Cookie', studentACookie);
      expect(resA.body.quizzes.find((q: { id: string }) => q.id === quizBId)).toBeUndefined();

      const resB = await request(app).get('/api/student/quizzes').set('Cookie', studentBCookie);
      expect(resB.body.quizzes.find((q: { id: string }) => q.id === quizAId)).toBeUndefined();
    });

    it('gives 404, not the quiz, when a student tries to start an attempt on another class\'s quiz', async () => {
      const res = await request(app)
        .post(`/api/student/quizzes/${quizBId}/attempt`)
        .set('Cookie', studentACookie);
      expect(res.status).toBe(404);

      const reverse = await request(app)
        .post(`/api/student/quizzes/${quizAId}/attempt`)
        .set('Cookie', studentBCookie);
      expect(reverse.status).toBe(404);
    });
  });

  describe('case 2: teacher A blocked from teacher B\'s quiz and results, on both read and write', () => {
    it('gives 404 on every read route for teacher B\'s quiz', async () => {
      const routes = [
        `/api/teacher/quizzes/${quizBId}`,
        `/api/teacher/quizzes/${quizBId}/results`,
        `/api/teacher/quizzes/${quizBId}/results/export`,
        `/api/teacher/quizzes/${quizBId}/attempts`,
      ];
      for (const route of routes) {
        const res = await request(app).get(route).set('Cookie', teacherACookie);
        expect(res.status, `GET ${route} as teacher A`).toBe(404);
      }
    });

    it('excludes teacher B\'s quiz from teacher A\'s quiz list', async () => {
      const res = await request(app).get('/api/teacher/quizzes').set('Cookie', teacherACookie);
      expect(res.body.quizzes.find((q: { id: string }) => q.id === quizBId)).toBeUndefined();
    });

    it('gives 404 on every write route for teacher B\'s quiz', async () => {
      const putShell = await request(app)
        .put(`/api/teacher/quizzes/${quizBId}`)
        .set('Cookie', teacherACookie)
        .send(validQuizShellPayload({ classIds: [classB.id] }));
      expect(putShell.status).toBe(404);

      const putQuestions = await request(app)
        .put(`/api/teacher/quizzes/${quizBId}/questions`)
        .set('Cookie', teacherACookie)
        .send({ questions: validQuestionsPayload(15) });
      expect(putQuestions.status).toBe(404);

      const publish = await request(app)
        .post(`/api/teacher/quizzes/${quizBId}/publish`)
        .set('Cookie', teacherACookie);
      expect(publish.status).toBe(404);
    });
  });

  describe('case 3: admin succeeds everywhere teachers and students are blocked', () => {
    it('succeeds on admin-only routes', async () => {
      const dashboard = await request(app).get('/api/admin/dashboard').set('Cookie', adminCookie);
      const students = await request(app).get('/api/admin/students').set('Cookie', adminCookie);
      const teachers = await request(app).get('/api/admin/teachers').set('Cookie', adminCookie);
      expect(dashboard.status).toBe(200);
      expect(students.status).toBe(200);
      expect(teachers.status).toBe(200);
    });

    it('reads and writes teacher B\'s quiz that teacher A is blocked from', async () => {
      const get = await request(app).get(`/api/teacher/quizzes/${quizBId}`).set('Cookie', adminCookie);
      expect(get.status).toBe(200);
      expect(get.body.id).toBe(quizBId);

      const results = await request(app).get(`/api/teacher/quizzes/${quizBId}/results`).set('Cookie', adminCookie);
      expect(results.status).toBe(200);

      const csv = await request(app).get(`/api/teacher/quizzes/${quizBId}/results/export`).set('Cookie', adminCookie);
      expect(csv.status).toBe(200);

      const put = await request(app)
        .put(`/api/teacher/quizzes/${quizBId}`)
        .set('Cookie', adminCookie)
        .send(validQuizShellPayload({ classIds: [classB.id], title: 'Fixture Quiz (edited by admin via access-matrix)' }));
      expect(put.status).toBe(200);
      expect(put.body.quiz.title).toBe('Fixture Quiz (edited by admin via access-matrix)');
    });

    it('includes both teachers\' quizzes in admin\'s quiz list', async () => {
      const res = await request(app).get('/api/teacher/quizzes').set('Cookie', adminCookie);
      const ids = res.body.quizzes.map((q: { id: string }) => q.id);
      expect(ids).toEqual(expect.arrayContaining([quizAId, quizBId]));
    });
  });
});
