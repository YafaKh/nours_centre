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
        <Link
          to="/admin/students"
          className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-blue-400 hover:shadow-sm"
        >
          <span className="font-medium text-gray-900">Students</span>
          <p className="mt-1 text-sm text-gray-500">Browse every student and reset a password.</p>
        </Link>
        <Link
          to="/admin/import"
          className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-blue-400 hover:shadow-sm"
        >
          <span className="font-medium text-gray-900">Import students/teachers</span>
          <p className="mt-1 text-sm text-gray-500">Upload a CSV or XLSX file, or download a template first.</p>
        </Link>
      </div>
    </DashboardLayout>
  );
}
