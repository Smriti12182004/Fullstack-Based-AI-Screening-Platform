import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import VerifyEmail from "./pages/VerifyEmail";

import Dashboard from "./pages/Dashboard";
import Jobs from "./pages/Jobs";
import NewJob from "./pages/NewJob";
import JobDetails from "./pages/JobDetails";
import SkillReview from "./pages/SkillReview";

import QuestionBank from "./pages/QuestionBank";
import AssessmentConfig from "./pages/AssessmentConfig";
import ReviewerWorkspace from "./pages/ReviewerWorkspace";

import CandidateDashboard from "./pages/CandidateDashboard";
import CandidateAssessment from "./pages/CandidateAssessment";

import AdminDashboard from "./pages/AdminDashboard";

import ProtectedRoute from "./components/ProtectedRoute";

function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* =====================================================
            PUBLIC LANDING PAGE
        ===================================================== */}

        <Route
          path="/"
          element={<Landing />}
        />

        {/* =====================================================
            PUBLIC AUTHENTICATION
        ===================================================== */}

        <Route
          path="/login"
          element={<Login />}
        />

        <Route
          path="/auth/verify-email"
          element={<VerifyEmail />}
        />

        {/* =====================================================
            RECRUITER DASHBOARD
        ===================================================== */}

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute allowedRoles={["recruiter"]}>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        {/* =====================================================
            RECRUITER JOBS
        ===================================================== */}

        <Route
          path="/jobs"
          element={
            <ProtectedRoute allowedRoles={["recruiter"]}>
              <Jobs />
            </ProtectedRoute>
          }
        />

        <Route
          path="/jobs/:jobId"
          element={
            <ProtectedRoute allowedRoles={["recruiter"]}>
              <JobDetails />
            </ProtectedRoute>
          }
        />

        <Route
          path="/jobs/new"
          element={
            <ProtectedRoute allowedRoles={["recruiter"]}>
              <NewJob />
            </ProtectedRoute>
          }
        />

        <Route
          path="/jobs/:jobId/skills"
          element={
            <ProtectedRoute allowedRoles={["recruiter"]}>
              <SkillReview />
            </ProtectedRoute>
          }
        />

        {/* =====================================================
            ASSESSMENT MANAGER
        ===================================================== */}

        <Route
          path="/questions"
          element={
            <ProtectedRoute allowedRoles={["assessment_manager"]}>
              <QuestionBank />
            </ProtectedRoute>
          }
        />

        <Route
          path="/question-sets/:questionSetId/configuration"
          element={
            <ProtectedRoute allowedRoles={["assessment_manager"]}>
              <AssessmentConfig />
            </ProtectedRoute>
          }
        />

        {/* =====================================================
            ASSESSMENT REVIEWER
        ===================================================== */}

        <Route
          path="/review"
          element={
            <ProtectedRoute allowedRoles={["assessment_reviewer"]}>
              <ReviewerWorkspace />
            </ProtectedRoute>
          }
        />

        {/* =====================================================
            CANDIDATE DASHBOARD
        ===================================================== */}

        <Route
          path="/candidate/dashboard"
          element={
            <ProtectedRoute allowedRoles={["candidate"]}>
              <CandidateDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/assessments/:assessmentId"
          element={
            <ProtectedRoute allowedRoles={["candidate"]}>
              <CandidateAssessment />
            </ProtectedRoute>
          }
        />

        {/* =====================================================
            ORGANIZATION ADMINISTRATOR
        ===================================================== */}

        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={["organization_admin"]}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />

        {/* =====================================================
            FALLBACK
        ===================================================== */}

        <Route
          path="*"
          element={<Navigate to="/" replace />}
        />

      </Routes>
    </BrowserRouter>
  );
}

export default App;