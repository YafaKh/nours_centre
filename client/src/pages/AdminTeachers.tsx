import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listAdminTeachers } from '../api/client';
import { DashboardLayout } from '../components/DashboardLayout';

export function AdminTeachers() {
  const [search, setSearch] = useState('');

  const teachersQuery = useQuery({ queryKey: ['admin-teachers'], queryFn: listAdminTeachers });

  const teachers = teachersQuery.data?.teachers ?? [];
  const filtered = search.trim()
    ? teachers.filter((t) => {
        const q = search.trim().toLowerCase();
        return (
          (t.nameEn ?? '').toLowerCase().includes(q) ||
          (t.nameAr ?? '').includes(search.trim()) ||
          t.email.toLowerCase().includes(q)
        );
      })
    : teachers;

  return (
    <DashboardLayout title="Teachers">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between">
          <Link to="/admin" className="text-sm text-blue-600 hover:underline">
            &larr; Back to admin overview
          </Link>
          <Link
            to="/admin/import"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Import students/teachers
          </Link>
        </div>

        <input
          type="search"
          placeholder="Search by name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />

        {teachersQuery.isLoading && <p className="text-sm text-gray-500">Loading…</p>}

        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-start text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="p-2 text-start font-medium">Name (Arabic)</th>
                <th className="p-2 text-start font-medium">Name (English)</th>
                <th className="p-2 text-start font-medium">Email</th>
                <th className="p-2 text-start font-medium">Username</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="border-b border-gray-100">
                  <td dir="auto" className="p-2">
                    {t.nameAr || '—'}
                  </td>
                  <td dir="auto" className="p-2">
                    {t.nameEn || '—'}
                  </td>
                  <td className="p-2 text-gray-700">{t.email}</td>
                  <td className="p-2 font-mono text-gray-700">{t.username}</td>
                </tr>
              ))}
              {filtered.length === 0 && !teachersQuery.isLoading && (
                <tr>
                  <td colSpan={4} className="p-3 text-center text-gray-500">
                    No teachers found.
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
