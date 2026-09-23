import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  createQuiz,
  getQuiz,
  listClasses,
  listQuizAttempts,
  publishQuiz,
  setQuizQuestions,
  updateQuiz,
  type QuestionDraft,
  type QuizShellInput,
} from '../api/client';
import { DashboardLayout } from '../components/DashboardLayout';
import { ammanLocalInputToIso, isoToAmmanLocalInput } from '../lib/time';

interface ShellForm {
  title: string;
  classIds: string[];
  timeLimitMinutes: string;
  openAt: string;
  closeAt: string;
  negativeMarking: boolean;
  penaltyFraction: string;
}

function defaultShell(): ShellForm {
  const now = new Date();
  const in2Weeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  return {
    title: '',
    classIds: [],
    timeLimitMinutes: '20',
    openAt: isoToAmmanLocalInput(now.toISOString()),
    closeAt: isoToAmmanLocalInput(in2Weeks.toISOString()),
    negativeMarking: false,
    penaltyFraction: '0.25',
  };
}

function emptyOption() {
  return { text: '', isCorrect: false };
}

function emptyQuestion(): QuestionDraft {
  return { text: '', points: 1, options: [emptyOption(), emptyOption(), emptyOption(), emptyOption()] };
}

function attemptStatusLabel(submittedAt: string | null, submissionType: string | null): string {
  if (!submittedAt) return 'In progress';
  return submissionType === 'AUTO' ? 'Auto-submitted' : 'Submitted';
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.details.length > 0) return err.details.map((d) => d.message).join('; ');
    return err.message;
  }
  return 'Something went wrong';
}

const inputClass =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500';

export function QuizEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const classesQuery = useQuery({ queryKey: ['classes'], queryFn: listClasses });
  const quizQuery = useQuery({
    queryKey: ['quiz', id],
    queryFn: () => getQuiz(id!),
    enabled: !isNew,
  });

  const [shell, setShell] = useState<ShellForm>(defaultShell());
  const [questions, setQuestionsState] = useState<QuestionDraft[]>([]);
  const [shellError, setShellError] = useState<string | null>(null);
  const [questionsError, setQuestionsErrorState] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const quiz = quizQuery.data;
    if (!quiz) return;
    setShell({
      title: quiz.title,
      classIds: quiz.classes.map((c) => c.id),
      timeLimitMinutes: String(quiz.timeLimitMinutes),
      openAt: isoToAmmanLocalInput(quiz.openAt),
      closeAt: isoToAmmanLocalInput(quiz.closeAt),
      negativeMarking: quiz.negativeMarking,
      penaltyFraction: String(quiz.penaltyFraction || 0.25),
    });
    setQuestionsState(
      quiz.questions.map((q) => ({
        text: q.text,
        points: q.points,
        options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
      })),
    );
  }, [quizQuery.data]);

  const locked = quizQuery.data?.locked ?? false;

  // Locked implies at least one Attempt exists (src/quiz/lock.ts) — that's the only case
  // where this list is ever non-empty.
  const attemptsQuery = useQuery({
    queryKey: ['quiz-attempts', id],
    queryFn: () => listQuizAttempts(id!),
    enabled: !isNew && locked,
  });

  const createMutation = useMutation({
    mutationFn: (input: QuizShellInput) => createQuiz(input),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['quizzes'] });
      navigate(`/teacher/quizzes/${res.quiz.id}`, { replace: true });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: QuizShellInput) => updateQuiz(id!, input),
    onSuccess: () => {
      setNotice('Quiz details saved.');
      queryClient.invalidateQueries({ queryKey: ['quiz', id] });
      queryClient.invalidateQueries({ queryKey: ['quizzes'] });
    },
  });

  const questionsMutation = useMutation({
    mutationFn: (qs: QuestionDraft[]) => setQuizQuestions(id!, qs),
    onSuccess: () => {
      setNotice('Questions saved.');
      queryClient.invalidateQueries({ queryKey: ['quiz', id] });
      queryClient.invalidateQueries({ queryKey: ['quizzes'] });
    },
  });

  const publishMutation = useMutation({
    mutationFn: () => publishQuiz(id!),
    onSuccess: () => {
      setNotice('Quiz published. Students in the target classes will see it once it opens.');
      queryClient.invalidateQueries({ queryKey: ['quiz', id] });
      queryClient.invalidateQueries({ queryKey: ['quizzes'] });
    },
  });

  function handleShellSubmit(e: FormEvent) {
    e.preventDefault();
    setShellError(null);
    setNotice(null);
    const payload: QuizShellInput = {
      title: shell.title,
      classIds: shell.classIds,
      timeLimitMinutes: Number(shell.timeLimitMinutes),
      openAt: ammanLocalInputToIso(shell.openAt),
      closeAt: ammanLocalInputToIso(shell.closeAt),
      negativeMarking: shell.negativeMarking,
      penaltyFraction: shell.negativeMarking ? Number(shell.penaltyFraction) : 0,
    };
    const mutation = isNew ? createMutation : updateMutation;
    mutation.mutate(payload, { onError: (err) => setShellError(describeError(err)) });
  }

  function toggleClass(classId: string) {
    setShell((s) => ({
      ...s,
      classIds: s.classIds.includes(classId) ? s.classIds.filter((c) => c !== classId) : [...s.classIds, classId],
    }));
  }

  function addQuestion() {
    setQuestionsState((qs) => [...qs, emptyQuestion()]);
  }

  function removeQuestion(index: number) {
    setQuestionsState((qs) => qs.filter((_, i) => i !== index));
  }

  function updateQuestion(index: number, patch: Partial<QuestionDraft>) {
    setQuestionsState((qs) => qs.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  function updateOptionText(qIndex: number, oIndex: number, text: string) {
    setQuestionsState((qs) =>
      qs.map((q, i) =>
        i === qIndex ? { ...q, options: q.options.map((o, j) => (j === oIndex ? { ...o, text } : o)) } : q,
      ),
    );
  }

  function setCorrectOption(qIndex: number, oIndex: number) {
    setQuestionsState((qs) =>
      qs.map((q, i) =>
        i === qIndex ? { ...q, options: q.options.map((o, j) => ({ ...o, isCorrect: j === oIndex })) } : q,
      ),
    );
  }

  function handleSaveQuestions() {
    setQuestionsErrorState(null);
    setNotice(null);
    questionsMutation.mutate(questions, { onError: (err) => setQuestionsErrorState(describeError(err)) });
  }

  function handlePublish() {
    setNotice(null);
    publishMutation.mutate(undefined, { onError: (err) => setShellError(describeError(err)) });
  }

  const title = isNew ? 'New quiz' : quizQuery.data?.title || 'Edit quiz';
  const owner = quizQuery.data?.owner;

  return (
    <DashboardLayout title={title}>
      <div className="mx-auto max-w-2xl space-y-6">
        <Link to="/teacher" className="text-sm text-blue-600 hover:underline">
          &larr; Back to my quizzes
        </Link>

        {!isNew && quizQuery.data && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
            <span
              className={`rounded-full px-2 py-0.5 font-medium ${
                quizQuery.data.status === 'PUBLISHED' ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'
              }`}
            >
              {quizQuery.data.status}
            </span>
            {owner && (
              <span dir="auto">
                Owner: {owner.nameEn || owner.nameAr || owner.username}
              </span>
            )}
          </div>
        )}

        {locked && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            This quiz is locked: a student has already started it. Nothing on this quiz — questions, options,
            points, correct answers, or the close date — can be edited anymore.
          </div>
        )}

        {locked && (
          <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Results</h2>
              <Link to={`/teacher/quizzes/${id}/results`} className="text-sm text-blue-600 hover:underline">
                Full results &rarr;
              </Link>
            </div>
            {attemptsQuery.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
            {attemptsQuery.data && (
              <div className="overflow-x-auto">
                <table className="w-full text-start text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-500">
                      <th className="py-1.5 pe-3 text-start font-medium">Student</th>
                      <th className="py-1.5 pe-3 text-start font-medium">Status</th>
                      <th className="py-1.5 text-start font-medium">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attemptsQuery.data.attempts.map((a) => (
                      <tr key={a.id} className="border-b border-gray-100">
                        <td className="py-1.5 pe-3">
                          <span dir="auto">{a.student.nameEn || a.student.nameAr || a.student.studentId}</span>
                        </td>
                        <td className="py-1.5 pe-3 text-gray-700">{attemptStatusLabel(a.submittedAt, a.submissionType)}</td>
                        <td className="py-1.5 text-gray-700">{a.score ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {notice && <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800">{notice}</div>}

        <form onSubmit={handleShellSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-base font-semibold text-gray-900">Quiz details</h2>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Title</label>
            <input
              dir="auto"
              className={inputClass}
              value={shell.title}
              disabled={locked}
              onChange={(e) => setShell((s) => ({ ...s, title: e.target.value }))}
              required
            />
          </div>

          <div>
            <span className="mb-1 block text-sm font-medium text-gray-700">Target classes</span>
            <div className="flex flex-wrap gap-3">
              {classesQuery.data?.classes.map((c) => (
                <label key={c.id} className="flex items-center gap-1.5 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={shell.classIds.includes(c.id)}
                    disabled={locked}
                    onChange={() => toggleClass(c.id)}
                  />
                  {c.name}
                </label>
              ))}
              {classesQuery.data?.classes.length === 0 && (
                <span className="text-sm text-gray-500">No classes yet.</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Time limit (minutes)</label>
              <input
                type="number"
                min={1}
                className={inputClass}
                value={shell.timeLimitMinutes}
                disabled={locked}
                onChange={(e) => setShell((s) => ({ ...s, timeLimitMinutes: e.target.value }))}
                required
              />
            </div>
            <div />
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Opens (Amman time)</label>
              <input
                type="datetime-local"
                className={inputClass}
                value={shell.openAt}
                disabled={locked}
                onChange={(e) => setShell((s) => ({ ...s, openAt: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Closes (Amman time)</label>
              <input
                type="datetime-local"
                className={inputClass}
                value={shell.closeAt}
                disabled={locked}
                onChange={(e) => setShell((s) => ({ ...s, closeAt: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="negativeMarking"
              type="checkbox"
              checked={shell.negativeMarking}
              disabled={locked}
              onChange={(e) => setShell((s) => ({ ...s, negativeMarking: e.target.checked }))}
            />
            <label htmlFor="negativeMarking" className="text-sm font-medium text-gray-700">
              Negative marking
            </label>
          </div>

          {shell.negativeMarking && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Penalty fraction (e.g. 0.25 = lose a quarter of the question's points for a wrong answer)
              </label>
              <input
                type="number"
                step="0.05"
                min={0.05}
                max={1}
                className={inputClass}
                value={shell.penaltyFraction}
                disabled={locked}
                onChange={(e) => setShell((s) => ({ ...s, penaltyFraction: e.target.value }))}
                required
              />
            </div>
          )}

          {shellError && (
            <p role="alert" className="text-sm text-red-600">
              {shellError}
            </p>
          )}

          <button
            type="submit"
            disabled={locked || createMutation.isPending || updateMutation.isPending}
            className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-base font-medium text-white hover:bg-blue-700 disabled:opacity-60 sm:w-auto"
          >
            {isNew ? 'Create quiz' : 'Save details'}
          </button>
        </form>

        {!isNew && (
          <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Questions ({questions.length})</h2>
              <button
                type="button"
                onClick={addQuestion}
                disabled={locked}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-60"
              >
                + Add question
              </button>
            </div>

            {questions.map((q, qIndex) => (
              <div key={qIndex} className="space-y-3 rounded-md border border-gray-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="mt-2 text-sm font-medium text-gray-500">Q{qIndex + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeQuestion(qIndex)}
                    disabled={locked}
                    className="text-sm text-red-600 hover:underline disabled:opacity-60"
                  >
                    Remove
                  </button>
                </div>
                <textarea
                  dir="auto"
                  className={inputClass}
                  placeholder="Question text"
                  value={q.text}
                  disabled={locked}
                  onChange={(e) => updateQuestion(qIndex, { text: e.target.value })}
                  rows={2}
                />
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Points</label>
                  <input
                    type="number"
                    min={0.1}
                    step="0.5"
                    className={`${inputClass} max-w-[8rem]`}
                    value={q.points}
                    disabled={locked}
                    onChange={(e) => updateQuestion(qIndex, { points: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  {q.options.map((o, oIndex) => (
                    <div key={oIndex} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`correct-${qIndex}`}
                        checked={o.isCorrect}
                        disabled={locked}
                        onChange={() => setCorrectOption(qIndex, oIndex)}
                        aria-label={`Option ${oIndex + 1} is correct`}
                      />
                      <input
                        dir="auto"
                        className={inputClass}
                        placeholder={`Option ${oIndex + 1}`}
                        value={o.text}
                        disabled={locked}
                        onChange={(e) => updateOptionText(qIndex, oIndex, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {questionsError && (
              <p role="alert" className="text-sm text-red-600">
                {questionsError}
              </p>
            )}

            <button
              type="button"
              onClick={handleSaveQuestions}
              disabled={locked || questionsMutation.isPending || questions.length === 0}
              className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-base font-medium text-white hover:bg-blue-700 disabled:opacity-60 sm:w-auto"
            >
              Save questions
            </button>
          </div>
        )}

        {!isNew && quizQuery.data?.status === 'DRAFT' && (
          <button
            type="button"
            onClick={handlePublish}
            disabled={locked || publishMutation.isPending}
            className="w-full rounded-md bg-green-600 px-4 py-2.5 text-base font-medium text-white hover:bg-green-700 disabled:opacity-60 sm:w-auto"
          >
            Publish quiz
          </button>
        )}
      </div>
    </DashboardLayout>
  );
}
