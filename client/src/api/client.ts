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
