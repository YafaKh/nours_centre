import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, saveAnswer, startOrResumeAttempt, submitAttempt, type AttemptDetail } from '../api/client';
import { DashboardLayout } from '../components/DashboardLayout';

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function setAnswer(queryKey: unknown[], id: string, questionId: string, optionId: string | undefined) {
  return (prev: AttemptDetail | undefined): AttemptDetail | undefined => {
    if (!prev) return prev;
    const answers = { ...prev.answers };
    if (optionId === undefined) delete answers[questionId];
    else answers[questionId] = optionId;
    return { ...prev, answers };
  };
}

export function QuizTaking() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const queryKey = ['attempt', id];

  // startOrResumeAttempt is a get-or-create: calling it again (e.g. on refresh) just returns
  // the same attempt, which is what makes this one query cover both "start" and "resume" (FR-024).
  const attemptQuery = useQuery({
    queryKey,
    queryFn: () => startOrResumeAttempt(id!),
    refetchInterval: 30_000,
  });

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const [errorByQuestion, setErrorByQuestion] = useState<Record<string, string>>({});
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const answerMutation = useMutation({
    mutationFn: ({ attemptId, questionId, optionId }: { attemptId: string; questionId: string; optionId: string }) =>
      saveAnswer(attemptId, questionId, optionId),
  });

  const submitMutation = useMutation({
    mutationFn: (attemptId: string) => submitAttempt(attemptId),
    onSuccess: (result) => {
      queryClient.setQueryData<AttemptDetail>(queryKey, result);
      setShowConfirm(false);
    },
    onError: (err) => {
      setSubmitError(err instanceof ApiError ? err.message : 'Could not submit this attempt');
      setShowConfirm(false);
    },
  });

  function selectOption(attemptId: string, questionId: string, optionId: string) {
    const previous = attemptQuery.data?.answers[questionId];
    queryClient.setQueryData<AttemptDetail>(queryKey, setAnswer(queryKey, attemptId, questionId, optionId));
    setErrorByQuestion((e) => ({ ...e, [questionId]: '' }));

    answerMutation.mutate(
      { attemptId, questionId, optionId },
      {
        onError: (err) => {
          queryClient.setQueryData<AttemptDetail>(queryKey, setAnswer(queryKey, attemptId, questionId, previous));
          setErrorByQuestion((e) => ({
            ...e,
            [questionId]: err instanceof ApiError ? err.message : 'Could not save answer',
          }));
        },
      },
    );
  }

  const attempt = attemptQuery.data;
  const deadlineMs = attempt ? new Date(attempt.deadline).getTime() : null;
  const remainingMs = deadlineMs !== null ? deadlineMs - now : null;
  const timeUp = remainingMs !== null && remainingMs <= 0;
  const submitted = Boolean(attempt?.submittedAt);

  // FR-025: the server auto-submits lazily on the next read of this attempt. Poll every couple
  // seconds once the countdown hits zero, rather than waiting for the normal 30s poll, so "time
  // runs out" shows the auto-submitted result right away with no student action taken. This
  // covers the grace period too — an immediate refetch at 0:00 would still land inside it.
  useEffect(() => {
    if (!timeUp || submitted) return;
    const poll = setInterval(() => attemptQuery.refetch(), 2_000);
    return () => clearInterval(poll);
  }, [timeUp, submitted, attemptQuery]);

  const unansweredCount = attempt ? attempt.questions.length - Object.keys(attempt.answers).length : 0;
  const locked = timeUp || submitted;

  if (attemptQuery.isLoading) {
    return (
      <DashboardLayout title="Quiz">
        <p className="text-sm text-gray-500">Loading…</p>
      </DashboardLayout>
    );
  }

  if (attemptQuery.isError || !attempt) {
    return (
      <DashboardLayout title="Quiz">
        <div className="mx-auto max-w-2xl space-y-3">
          <p role="alert" className="text-sm text-red-600">
            {attemptQuery.error instanceof ApiError ? attemptQuery.error.message : 'Could not load this quiz.'}
          </p>
          <Link to="/student" className="text-sm text-blue-600 hover:underline">
            &larr; Back to my quizzes
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={attempt.title}>
      <div className="mx-auto max-w-2xl space-y-4 pb-24">
        <Link to="/student" className="text-sm text-blue-600 hover:underline">
          &larr; Back to my quizzes
        </Link>

        <div
          data-testid="quiz-timer"
          className={`sticky top-0 z-10 flex items-center justify-between rounded-md border p-3 text-sm font-semibold shadow-sm ${
            locked ? 'border-red-300 bg-red-50 text-red-800' : 'border-blue-300 bg-blue-50 text-blue-800'
          }`}
        >
          <span dir="auto" className="truncate">
            {attempt.title}
          </span>
          <span className="shrink-0">{timeUp ? 'Time is up' : formatRemaining(remainingMs ?? 0)}</span>
        </div>

        {submitted && (
          <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800">
            {attempt.submissionType === 'AUTO'
              ? 'Time ran out — this attempt was submitted automatically.'
              : 'Submitted.'}{' '}
            Your score: <span className="font-semibold">{attempt.score}</span>.
          </div>
        )}

        {timeUp && !submitted && (
          <p className="text-sm text-gray-600">Time is up for this attempt — waiting for it to finalize…</p>
        )}

        {attempt.questions.map((q, index) => (
          <div key={q.id} className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-sm font-medium text-gray-500">
              Question {index + 1} of {attempt.questions.length} · {q.points} pt{q.points === 1 ? '' : 's'}
            </p>
            <p dir="auto" className="text-base text-gray-900">
              {q.text}
            </p>
            <div className="space-y-2">
              {q.options.map((o) => {
                const selected = attempt.answers[q.id] === o.id;
                return (
                  <label
                    key={o.id}
                    className={`flex min-h-[44px] items-center gap-3 rounded-md border p-3 text-base ${
                      selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                    } ${locked ? 'opacity-70' : ''}`}
                  >
                    <input
                      type="radio"
                      name={`question-${q.id}`}
                      checked={selected}
                      disabled={locked}
                      onChange={() => selectOption(attempt.id, q.id, o.id)}
                    />
                    <span dir="auto">{o.text}</span>
                  </label>
                );
              })}
            </div>
            {errorByQuestion[q.id] && (
              <p role="alert" className="text-sm text-red-600">
                {errorByQuestion[q.id]}
              </p>
            )}
          </div>
        ))}

        {submitError && (
          <p role="alert" className="text-sm text-red-600">
            {submitError}
          </p>
        )}

        {!locked && (
          <div className="fixed inset-x-0 bottom-0 z-10 border-t border-gray-200 bg-white p-3">
            <button
              type="button"
              onClick={() => setShowConfirm(true)}
              className="mx-auto block w-full max-w-2xl rounded-md bg-blue-600 px-4 py-2.5 text-base font-medium text-white hover:bg-blue-700"
            >
              Submit
            </button>
          </div>
        )}

        {showConfirm && (
          <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center">
            <div className="w-full max-w-sm space-y-4 rounded-t-lg bg-white p-5 sm:rounded-lg">
              <p className="text-base font-medium text-gray-900">Submit this quiz?</p>
              <p className="text-sm text-gray-600">You can't change your answers after submitting.</p>
              {unansweredCount > 0 && (
                <p className="text-sm font-medium text-amber-700">
                  Warning: you have {unansweredCount} unanswered question{unansweredCount === 1 ? '' : 's'}. They will
                  score 0.
                </p>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 rounded-md border border-gray-300 px-4 py-2.5 text-base font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitMutation.isPending}
                  onClick={() => {
                    setSubmitError(null);
                    submitMutation.mutate(attempt.id);
                  }}
                  className="flex-1 rounded-md bg-blue-600 px-4 py-2.5 text-base font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  Submit
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
