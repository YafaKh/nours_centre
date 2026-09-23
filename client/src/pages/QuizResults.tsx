import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getQuiz, getQuizResults, quizResultsExportUrl, type AttemptStatus } from '../api/client';
import { DashboardLayout } from '../components/DashboardLayout';

const STATUS_LABEL: Record<AttemptStatus, string> = {
  NOT_ATTEMPTED: 'Not attempted',
  IN_PROGRESS: 'In progress',
  SUBMITTED: 'Submitted',
  AUTO_SUBMITTED: 'Auto-submitted',
};

const STATUS_CLASS: Record<AttemptStatus, string> = {
  NOT_ATTEMPTED: 'bg-gray-200 text-gray-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-800',
  SUBMITTED: 'bg-green-100 text-green-800',
  AUTO_SUBMITTED: 'bg-amber-100 text-amber-800',
};

function fmtNumber(n: number | null): string {
  return n === null ? '—' : String(Math.round(n * 100) / 100);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 text-center">
      <div className="text-lg font-semibold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

export function QuizResults() {
  const { id } = useParams<{ id: string }>();
  const quizQuery = useQuery({ queryKey: ['quiz', id], queryFn: () => getQuiz(id!) });
  const resultsQuery = useQuery({ queryKey: ['quiz-results', id], queryFn: () => getQuizResults(id!) });
  const results = resultsQuery.data;

  return (
    <DashboardLayout title={quizQuery.data ? `Results: ${quizQuery.data.title}` : 'Results'}>
      <div className="mx-auto max-w-3xl space-y-4">
        <Link to={`/teacher/quizzes/${id}`} className="text-sm text-blue-600 hover:underline">
          &larr; Back to quiz
        </Link>

        {resultsQuery.isLoading && <p className="text-sm text-gray-500">Loading…</p>}

        {results && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Attempted" value={`${results.summary.attempted} / ${results.summary.totalStudents}`} />
              <Stat label="Average" value={fmtNumber(results.summary.average)} />
              <Stat label="Highest" value={fmtNumber(results.summary.highest)} />
              <Stat label="Lowest" value={fmtNumber(results.summary.lowest)} />
            </div>

            <div className="flex justify-end">
              <a
                href={quizResultsExportUrl(id!)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                Download CSV
              </a>
            </div>

            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="w-full text-start text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500">
                    <th className="p-2 text-start font-medium">Student</th>
                    <th className="p-2 text-start font-medium">Class</th>
                    <th className="p-2 text-start font-medium">Status</th>
                    <th className="p-2 text-start font-medium">Score</th>
                    <th className="p-2 text-start font-medium">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {results.roster.map((r) => (
                    <tr key={r.studentId} className="border-b border-gray-100">
                      <td className="p-2">
                        <span dir="auto">{r.nameEn || r.nameAr || r.studentId}</span>
                      </td>
                      <td className="p-2 text-gray-700">{r.className}</td>
                      <td className="p-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[r.status]}`}>
                          {STATUS_LABEL[r.status]}
                        </span>
                      </td>
                      <td className="p-2 text-gray-700">{r.score === null ? '—' : `${r.score} / ${results.maxScore}`}</td>
                      <td className="p-2 text-gray-500">
                        {r.submittedAt ? new Date(r.submittedAt).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                  {results.roster.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-3 text-center text-gray-500">
                        No students in this quiz's target classes.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h2 className="mb-2 text-base font-semibold text-gray-900">Per-question % correct</h2>
              <ul className="space-y-1 text-sm">
                {results.questionStats.map((q) => (
                  <li key={q.questionId} className="flex items-center justify-between gap-3">
                    <span dir="auto" className="truncate text-gray-700">
                      Q{q.order + 1}. {q.text}
                    </span>
                    <span className="shrink-0 text-gray-500">
                      {q.percentCorrect === null ? '—' : `${q.percentCorrect}%`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
