export type Role = 'STUDENT' | 'TEACHER' | 'ADMIN';

export interface CurrentUser {
  id: string;
  role: Role;
  username: string;
  nameAr: string | null;
  nameEn: string | null;
}

export interface ApiErrorDetail {
  field: string;
  message: string;
}

export class ApiError extends Error {
  status: number;
  details: ApiErrorDetail[];
  constructor(status: number, message: string, details: ApiErrorDetail[] = []) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? `Request failed with status ${res.status}`, body.details ?? []);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Like `request`, but for a multipart file upload — no Content-Type header, so the browser
 * sets the multipart boundary itself. */
async function uploadFile<T>(path: string, file: File): Promise<T> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`/api${path}`, { method: 'POST', credentials: 'include', body: formData });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? `Request failed with status ${res.status}`, body.details ?? []);
  }
  return res.json() as Promise<T>;
}

export function login(username: string, password: string) {
  return request<{ user: CurrentUser }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export function logout() {
  return request<{ ok: true }>('/auth/logout', { method: 'POST' });
}

export function fetchCurrentUser() {
  return request<{ user: CurrentUser }>('/auth/me');
}

export interface ClassOption {
  id: string;
  name: string;
}

export interface QuizOwner {
  id: string;
  nameAr: string | null;
  nameEn: string | null;
  username: string;
}

export interface QuizListItem {
  id: string;
  title: string;
  timeLimitMinutes: number;
  openAt: string;
  closeAt: string;
  negativeMarking: boolean;
  penaltyFraction: number;
  status: 'DRAFT' | 'PUBLISHED';
  classes: ClassOption[];
  questionCount: number;
  owner: QuizOwner;
}

export interface OptionDraft {
  text: string;
  isCorrect: boolean;
}

export interface QuestionDraft {
  text: string;
  points: number;
  options: OptionDraft[];
}

export interface QuizDetail extends QuizListItem {
  locked: boolean;
  questions: (QuestionDraft & { id: string; options: (OptionDraft & { id: string })[] })[];
}

export interface QuizShellInput {
  title: string;
  classIds: string[];
  timeLimitMinutes: number;
  openAt: string;
  closeAt: string;
  negativeMarking: boolean;
  penaltyFraction: number;
}

export function listClasses() {
  return request<{ classes: ClassOption[] }>('/teacher/classes');
}

export function listQuizzes() {
  return request<{ quizzes: QuizListItem[] }>('/teacher/quizzes');
}

export function getQuiz(id: string) {
  return request<QuizDetail>(`/teacher/quizzes/${id}`);
}

export function createQuiz(input: QuizShellInput) {
  return request<{ quiz: QuizListItem }>('/teacher/quizzes', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateQuiz(id: string, input: QuizShellInput) {
  return request<{ quiz: QuizListItem }>(`/teacher/quizzes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function setQuizQuestions(id: string, questions: QuestionDraft[]) {
  return request<{ questions: QuizDetail['questions'] }>(`/teacher/quizzes/${id}/questions`, {
    method: 'PUT',
    body: JSON.stringify({ questions }),
  });
}

export function publishQuiz(id: string) {
  return request<{ quiz: QuizListItem }>(`/teacher/quizzes/${id}/publish`, { method: 'POST' });
}

export type QuizWindowStatus = 'UPCOMING' | 'OPEN' | 'CLOSED';

export interface StudentAttemptSummary {
  id: string;
  startedAt: string;
  deadline: string;
  submittedAt: string | null;
  submissionType: string | null;
  score: number | null;
}

export interface StudentQuizListItem {
  id: string;
  title: string;
  timeLimitMinutes: number;
  openAt: string;
  closeAt: string;
  negativeMarking: boolean;
  windowStatus: QuizWindowStatus;
  attempt: StudentAttemptSummary | null;
}

export function listStudentQuizzes() {
  return request<{ quizzes: StudentQuizListItem[] }>('/student/quizzes');
}

export interface StudentOption {
  id: string;
  order: number;
  text: string;
}

export interface StudentQuestion {
  id: string;
  order: number;
  text: string;
  points: number;
  options: StudentOption[];
}

export interface AttemptDetail {
  id: string;
  quizId: string;
  title: string;
  timeLimitMinutes: number;
  negativeMarking: boolean;
  penaltyFraction: number;
  startedAt: string;
  deadline: string;
  submittedAt: string | null;
  submissionType: string | null;
  score: number | null;
  questions: StudentQuestion[];
  answers: Record<string, string>;
}

/** Starts the quiz if the student has no attempt yet, otherwise returns their existing one —
 * safe to call again on every page load, which is how "resume on refresh" works (FR-024). */
export function startOrResumeAttempt(quizId: string) {
  return request<AttemptDetail>(`/student/quizzes/${quizId}/attempt`, { method: 'POST' });
}

export function saveAnswer(attemptId: string, questionId: string, optionId: string) {
  return request<{ questionId: string; optionId: string; answeredAt: string }>(
    `/student/attempts/${attemptId}/answers`,
    { method: 'PUT', body: JSON.stringify({ questionId, optionId }) },
  );
}

export function submitAttempt(attemptId: string) {
  return request<AttemptDetail>(`/student/attempts/${attemptId}/submit`, { method: 'POST' });
}

export interface TeacherAttemptSummary {
  id: string;
  student: { studentId: string; nameAr: string | null; nameEn: string | null };
  startedAt: string;
  deadline: string;
  submittedAt: string | null;
  submissionType: string | null;
  score: number | null;
}

export function listQuizAttempts(quizId: string) {
  return request<{ attempts: TeacherAttemptSummary[] }>(`/teacher/quizzes/${quizId}/attempts`);
}

export type AttemptStatus = 'NOT_ATTEMPTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'AUTO_SUBMITTED';

export interface ResultsRosterRow {
  studentId: string;
  nameAr: string | null;
  nameEn: string | null;
  className: string;
  status: AttemptStatus;
  score: number | null;
  startedAt: string | null;
  submittedAt: string | null;
}

export interface QuestionStat {
  questionId: string;
  order: number;
  text: string;
  percentCorrect: number | null;
}

export interface QuizResults {
  quizId: string;
  title: string;
  maxScore: number;
  roster: ResultsRosterRow[];
  summary: {
    totalStudents: number;
    attempted: number;
    scored: number;
    average: number | null;
    highest: number | null;
    lowest: number | null;
  };
  questionStats: QuestionStat[];
}

export function getQuizResults(quizId: string) {
  return request<QuizResults>(`/teacher/quizzes/${quizId}/results`);
}

export function quizResultsExportUrl(quizId: string) {
  return `/api/teacher/quizzes/${quizId}/results/export`;
}

// --- Phase 6: spreadsheet import ---

export interface ImportStudentsSummary {
  created: number;
  updated: number;
  newPasswords: { studentId: string; username: string; password: string }[];
}

export function importStudentsFile(file: File) {
  return uploadFile<ImportStudentsSummary>('/admin/import/students', file);
}

export const studentsTemplateUrl = '/api/admin/import/students/template';

export interface ImportTeachersSummary {
  created: number;
  updated: number;
  newPasswords: { email: string; password: string }[];
}

export function importTeachersFile(file: File) {
  return uploadFile<ImportTeachersSummary>('/admin/import/teachers', file);
}

export const teachersTemplateUrl = '/api/admin/import/teachers/template';

export const quizQuestionsTemplateUrl = '/api/teacher/import/quiz-questions/template';

export function importQuizQuestionsFile(quizId: string, file: File) {
  return uploadFile<{ questions: QuizDetail['questions'] }>(`/teacher/quizzes/${quizId}/questions/import`, file);
}

export interface AdminStudentRow {
  id: string;
  studentId: string;
  nameAr: string | null;
  nameEn: string | null;
  className: string;
  username: string;
}

export function listAdminStudents() {
  return request<{ students: AdminStudentRow[] }>('/admin/students');
}

export function resetStudentPassword(studentRowId: string) {
  return request<{ studentId: string; username: string; password: string }>(
    `/admin/students/${studentRowId}/reset-password`,
    { method: 'POST' },
  );
}
