import { DashboardLayout } from '../components/DashboardLayout';

export function AdminDashboard() {
  return (
    <DashboardLayout title="Admin overview">
      <p className="text-sm text-gray-500">
        Results, user management, and imports arrive in a later phase.
      </p>
    </DashboardLayout>
  );
}
