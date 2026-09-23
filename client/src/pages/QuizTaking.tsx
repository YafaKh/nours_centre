import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, saveAnswer, startOrResumeAttempt, type AttemptDetail } from '../api/client';
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

  const answerMutation = useMutation({
    mutationFn: ({ attemptId, questionId, optionId }: { attemptId: string; questionId: string; optionId: string }) =>
      saveAnswer(attemptId, questionId, optionId),
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
          className={`sticky top-0 z-10 flex items-center justify-between rounded-md border p-3 text-sm font-semibold shadow-sm ${
            timeUp ? 'border-red-300 bg-red-50 text-red-800' : 'border-blue-300 bg-blue-50 text-blue-800'
          }`}
        >
          <span dir="auto" className="truncate">
            {attempt.title}
          </span>
          <span className="shrink-0">{timeUp ? 'Time is up' : formatRemaining(remainingMs ?? 0)}</span>
        </div>

        {timeUp && (
          <p className="text-sm text-gray-600">
            Time is up for this attempt. Your saved answers have been kept — auto-submission arrives in a later phase.
          </p>
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
                    } ${timeUp ? 'opacity-70' : ''}`}
                  >
                    <input
                      type="radio"
                      name={`question-${q.id}`}
                      checked={selected}
                      disabled={timeUp}
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
      </div>
    </DashboardLayout>
  );
}
