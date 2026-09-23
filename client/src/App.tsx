import { Navigate, Route, Routes } from 'react-router-dom';
import { Login } from './pages/Login';
import { StudentDashboard } from './pages/StudentDashboard';
import { QuizTaking } from './pages/QuizTaking';
import { TeacherDashboard } from './pages/TeacherDashboard';
import { QuizEditor } from './pages/QuizEditor';
import { QuizResults } from './pages/QuizResults';
import { AdminDashboard } from './pages/AdminDashboard';
import { AdminImport } from './pages/AdminImport';
import { AdminStudents } from './pages/AdminStudents';
import { ProtectedRoute } from './components/ProtectedRoute';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/student"
        element={
          <ProtectedRoute role="STUDENT">
            <StudentDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/quizzes/:id"
        element={
          <ProtectedRoute role="STUDENT">
            <QuizTaking />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher"
        element={
          <ProtectedRoute role="TEACHER">
            <TeacherDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/quizzes/:id"
        element={
          <ProtectedRoute role="TEACHER">
            <QuizEditor />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/quizzes/:id/results"
        element={
          <ProtectedRoute role="TEACHER">
            <QuizResults />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute role="ADMIN">
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/students"
        element={
          <ProtectedRoute role="ADMIN">
            <AdminStudents />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/import"
        element={
          <ProtectedRoute role="ADMIN">
            <AdminImport />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
