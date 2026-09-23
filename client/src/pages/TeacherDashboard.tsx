import { DashboardLayout } from '../components/DashboardLayout';

export function TeacherDashboard() {
  return (
    <DashboardLayout title="My quizzes">
      <p className="text-sm text-gray-500">
        No quizzes yet — quiz authoring arrives in a later phase.
      </p>
    </DashboardLayout>
  );
}
