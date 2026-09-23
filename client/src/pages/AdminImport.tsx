import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ApiError,
  importStudentsFile,
  importTeachersFile,
  studentsTemplateUrl,
  teachersTemplateUrl,
  type ApiErrorDetail,
  type ImportStudentsSummary,
  type ImportTeachersSummary,
} from '../api/client';
import { DashboardLayout } from '../components/DashboardLayout';

function ErrorList({ errors }: { errors: ApiErrorDetail[] }) {
  return (
    <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
      <p className="mb-1 font-medium">Nothing was saved — fix these rows and re-upload:</p>
      <ul className="list-inside list-disc space-y-0.5">
        {errors.map((e, i) => (
          <li key={i}>{e.message}</li>
        ))}
      </ul>
    </div>
  );
}

function StudentsImportPanel() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<ApiErrorDetail[] | null>(null);
  const [summary, setSummary] = useState<ImportStudentsSummary | null>(null);

  async function handleImport() {
    const file = fileInput.current?.files?.[0];
    if (!file) return;
    setPending(true);
    setErrors(null);
    setSummary(null);
    try {
      const result = await importStudentsFile(file);
      setSummary(result);
      if (fileInput.current) fileInput.current.value = '';
    } catch (err) {
      if (err instanceof ApiError && err.details.length > 0) {
        setErrors(err.details);
      } else {
        setErrors([{ field: 'file', message: err instanceof Error ? err.message : 'Import failed' }]);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Import students</h2>
        <a href={studentsTemplateUrl} className="text-sm text-blue-600 hover:underline">
          Download template
        </a>
      </div>
      <p className="text-sm text-gray-500">
        CSV or XLSX with columns: student_id, name_ar, name_en, class, email. Re-importing the same student ID
        updates that student instead of creating a duplicate (FR-053).
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileInput} type="file" accept=".csv,.xlsx" className="text-sm" />
        <button
          type="button"
          onClick={handleImport}
          disabled={pending}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {pending ? 'Importing…' : 'Import'}
        </button>
      </div>

      {errors && <ErrorList errors={errors} />}

      {summary && (
        <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800">
          <p>
            {summary.created} student{summary.created === 1 ? '' : 's'} created, {summary.updated} updated.
          </p>
          {summary.newPasswords.length > 0 && (
            <div className="mt-2 overflow-x-auto">
              <p className="mb-1 font-medium">New student passwords (shown once — hand these out now):</p>
              <table className="w-full text-start text-xs">
                <thead>
                  <tr className="text-green-700">
                    <th className="pe-3 text-start">Student ID</th>
                    <th className="text-start">Password</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.newPasswords.map((p) => (
                    <tr key={p.studentId}>
                      <td className="pe-3 py-0.5 font-mono">{p.studentId}</td>
                      <td className="py-0.5 font-mono">{p.password}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TeachersImportPanel() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<ApiErrorDetail[] | null>(null);
  const [summary, setSummary] = useState<ImportTeachersSummary | null>(null);

  async function handleImport() {
    const file = fileInput.current?.files?.[0];
    if (!file) return;
    setPending(true);
    setErrors(null);
    setSummary(null);
    try {
      const result = await importTeachersFile(file);
      setSummary(result);
      if (fileInput.current) fileInput.current.value = '';
    } catch (err) {
      if (err instanceof ApiError && err.details.length > 0) {
        setErrors(err.details);
      } else {
        setErrors([{ field: 'file', message: err instanceof Error ? err.message : 'Import failed' }]);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Import teachers</h2>
        <a href={teachersTemplateUrl} className="text-sm text-blue-600 hover:underline">
          Download template
        </a>
      </div>
      <p className="text-sm text-gray-500">CSV or XLSX with columns: name_ar, name_en, email.</p>

      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileInput} type="file" accept=".csv,.xlsx" className="text-sm" />
        <button
          type="button"
          onClick={handleImport}
          disabled={pending}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {pending ? 'Importing…' : 'Import'}
        </button>
      </div>

      {errors && <ErrorList errors={errors} />}

      {summary && (
        <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800">
          <p>
            {summary.created} teacher{summary.created === 1 ? '' : 's'} created, {summary.updated} updated.
          </p>
          {summary.newPasswords.length > 0 && (
            <div className="mt-2 overflow-x-auto">
              <p className="mb-1 font-medium">New teacher passwords (shown once — hand these out now):</p>
              <table className="w-full text-start text-xs">
                <thead>
                  <tr className="text-green-700">
                    <th className="pe-3 text-start">Email</th>
                    <th className="text-start">Password</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.newPasswords.map((p) => (
                    <tr key={p.email}>
                      <td className="pe-3 py-0.5 font-mono">{p.email}</td>
                      <td className="py-0.5 font-mono">{p.password}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AdminImport() {
  return (
    <DashboardLayout title="Import spreadsheets">
      <div className="mx-auto max-w-2xl space-y-4">
        <Link to="/admin" className="text-sm text-blue-600 hover:underline">
          &larr; Back to admin overview
        </Link>
        <StudentsImportPanel />
        <TeachersImportPanel />
      </div>
    </DashboardLayout>
  );
}
