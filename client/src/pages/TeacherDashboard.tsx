import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listQuizzes } from '../api/client';
import { DashboardLayout } from '../components/DashboardLayout';
import { useAuth } from '../context/AuthContext';

export function TeacherDashboard() {
  const { user } = useAuth();
  const quizzesQuery = useQuery({ queryKey: ['quizzes'], queryFn: listQuizzes });
  const isAdmin = user?.role === 'ADMIN';

  return (
    <DashboardLayout title={isAdmin ? 'All quizzes' : 'My quizzes'}>
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex justify-end">
          <Link
            to="/teacher/quizzes/new"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + New quiz
          </Link>
        </div>

        {quizzesQuery.isLoading && <p className="text-sm text-gray-500">Loading…</p>}

        {quizzesQuery.data?.quizzes.length === 0 && (
          <p className="text-sm text-gray-500">No quizzes yet — create your first one above.</p>
        )}

        <ul className="space-y-2">
          {quizzesQuery.data?.quizzes.map((quiz) => (
            <li key={quiz.id}>
              <Link
                to={`/teacher/quizzes/${quiz.id}`}
                className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-blue-400 hover:shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span dir="auto" className="font-medium text-gray-900">
                    {quiz.title}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      quiz.status === 'PUBLISHED' ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'
                    }`}
                  >
                    {quiz.status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  {quiz.classes.map((c) => c.name).join(', ') || 'No classes'} · {quiz.questionCount} question
                  {quiz.questionCount === 1 ? '' : 's'} · {quiz.timeLimitMinutes} min
                  {isAdmin && (
                    <>
                      {' '}
                      · <span dir="auto">{quiz.owner.nameEn || quiz.owner.nameAr || quiz.owner.username}</span>
                    </>
                  )}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </DashboardLayout>
  );
}
