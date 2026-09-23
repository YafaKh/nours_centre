import { DashboardLayout } from '../components/DashboardLayout';

export function StudentDashboard() {
  return (
    <DashboardLayout title="My quizzes">
      <p className="text-sm text-gray-500">
        No quizzes to show yet — quiz taking arrives in a later phase.
      </p>
    </DashboardLayout>
  );
}
