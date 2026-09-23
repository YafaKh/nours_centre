import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listAdminStudents, resetStudentPassword, type AdminStudentRow } from '../api/client';
import { DashboardLayout } from '../components/DashboardLayout';

export function AdminStudents() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [revealed, setRevealed] = useState<{ studentId: string; username: string; password: string } | null>(null);

  const studentsQuery = useQuery({ queryKey: ['admin-students'], queryFn: listAdminStudents });

  const resetMutation = useMutation({
    mutationFn: (row: AdminStudentRow) => resetStudentPassword(row.id),
    onSuccess: (result) => {
      setRevealed(result);
      queryClient.invalidateQueries({ queryKey: ['admin-students'] });
    },
  });

  const students = studentsQuery.data?.students ?? [];
  const filtered = search.trim()
    ? students.filter((s) => {
        const q = search.trim().toLowerCase();
        return (
          (s.nameEn ?? '').toLowerCase().includes(q) ||
          (s.nameAr ?? '').includes(search.trim()) ||
          s.studentId.toLowerCase().includes(q) ||
          s.className.toLowerCase().includes(q)
        );
      })
    : students;

  return (
    <DashboardLayout title="Students">
      <div className="mx-auto max-w-3xl space-y-4">
        <Link to="/admin" className="text-sm text-blue-600 hover:underline">
          &larr; Back to admin overview
        </Link>

        {revealed && (
          <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800">
            New password for <span className="font-mono">{revealed.username}</span>:{' '}
            <span className="font-mono font-semibold">{revealed.password}</span>
            <p className="mt-1 text-xs text-green-700">
              This is shown only once — hand it out now. Their old session was signed out immediately.
            </p>
          </div>
        )}

        <input
          type="search"
          placeholder="Search by name, student ID, or class"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />

        {studentsQuery.isLoading && <p className="text-sm text-gray-500">Loading…</p>}

        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-start text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="p-2 text-start font-medium">Name (Arabic)</th>
                <th className="p-2 text-start font-medium">Name (English)</th>
                <th className="p-2 text-start font-medium">Class</th>
                <th className="p-2 text-start font-medium">Username</th>
                <th className="p-2 text-start font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-b border-gray-100">
                  <td dir="auto" className="p-2">
                    {s.nameAr || '—'}
                  </td>
                  <td dir="auto" className="p-2">
                    {s.nameEn || '—'}
                  </td>
                  <td className="p-2 text-gray-700">{s.className}</td>
                  <td className="p-2 font-mono text-gray-700">{s.username}</td>
                  <td className="p-2">
                    <button
                      type="button"
                      onClick={() => resetMutation.mutate(s)}
                      disabled={resetMutation.isPending}
                      className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-60"
                    >
                      Reset password
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && !studentsQuery.isLoading && (
                <tr>
                  <td colSpan={5} className="p-3 text-center text-gray-500">
                    No students found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}
