import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listStudentQuizzes, type StudentQuizListItem } from '../api/client';
import { DashboardLayout } from '../components/DashboardLayout';

// Green while the close date hasn't passed yet (open or upcoming), red once it has.
function closeDateClass(status: StudentQuizListItem['windowStatus']): string {
  return status === 'CLOSED' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800';
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
            const submitted = Boolean(quiz.attempt?.submittedAt);
            // A student can only ever open a quiz that's currently open and that they haven't
            // already submitted — once submitted, or once the quiz closes, it can't be reopened.
            const canTake = quiz.windowStatus === 'OPEN' && !submitted;
            const inProgress = quiz.attempt && !submitted;

            const card = (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span dir="auto" className="font-medium text-gray-900">
                    {quiz.title}
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${closeDateClass(quiz.windowStatus)}`}>
                    Closes {new Date(quiz.closeAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  {quiz.timeLimitMinutes} min
                  {submitted && ` · Submitted · Score: ${quiz.attempt!.score ?? 0} / ${quiz.maxScore}`}
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
