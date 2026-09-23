import { Link } from 'react-router-dom';
import { DashboardLayout } from '../components/DashboardLayout';

export function AdminDashboard() {
  return (
    <DashboardLayout title="Admin overview">
      <div className="mx-auto max-w-2xl space-y-3">
        <Link
          to="/teacher"
          className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-blue-400 hover:shadow-sm"
        >
          <span className="font-medium text-gray-900">Quizzes</span>
          <p className="mt-1 text-sm text-gray-500">
            View and edit every teacher's quizzes, see results, or create a new one.
          </p>
        </Link>
        <p className="text-sm text-gray-500">User management and spreadsheet imports arrive in a later phase.</p>
      </div>
    </DashboardLayout>
  );
}
