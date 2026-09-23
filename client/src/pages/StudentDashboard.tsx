import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listStudentQuizzes, type StudentQuizListItem } from '../api/client';
import { DashboardLayout } from '../components/DashboardLayout';

function statusLabel(status: StudentQuizListItem['windowStatus']): string {
  if (status === 'OPEN') return 'Open now';
  if (status === 'UPCOMING') return 'Upcoming';
  return 'Closed';
}

function statusClass(status: StudentQuizListItem['windowStatus']): string {
  if (status === 'OPEN') return 'bg-green-100 text-green-800';
  if (status === 'UPCOMING') return 'bg-amber-100 text-amber-800';
  return 'bg-gray-200 text-gray-700';
}

export function StudentDashboard() {
  const quizzesQuery = useQuery({ queryKey: ['student-quizzes'], queryFn: listStudentQuizzes });
  const quizzes = quizzesQuery.data?.quizzes ?? [];

  return (
    <DashboardLayout title="My quizzes">
      <div className="mx-auto max-w-2xl space-y-3">
        {quizzesQuery.isLoading && <p className="text-sm text-gray-500">Loading…</p>}

        {quizzesQuery.data && quizzes.length === 0 && (
          <p className="text-sm text-gray-500">No quizzes for your class yet.</p>
        )}

        <ul className="space-y-2">
          {quizzes.map((quiz) => {
            const canTake = quiz.windowStatus === 'OPEN';
            const inProgress = quiz.attempt && !quiz.attempt.submittedAt;

            const card = (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span dir="auto" className="font-medium text-gray-900">
                    {quiz.title}
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(quiz.windowStatus)}`}>
                    {statusLabel(quiz.windowStatus)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  {quiz.timeLimitMinutes} min
                  {quiz.attempt?.submittedAt && ' · Submitted'}
                  {inProgress && ' · In progress'}
                </p>
              </>
            );

            return (
              <li key={quiz.id}>
                {canTake ? (
                  <Link
                    to={`/student/quizzes/${quiz.id}`}
                    className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-blue-400 hover:shadow-sm"
                  >
                    {card}
                  </Link>
                ) : (
                  <div className="block rounded-lg border border-gray-200 bg-white p-4 opacity-70">{card}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </DashboardLayout>
  );
}
