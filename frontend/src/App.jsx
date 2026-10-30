
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
import Assessments from "./pages/Assessments";
import ProctoringActivity from "./pages/ProctoringActivity";
import AssessmentResults from "./pages/AssessmentResults";

import QuestionBank from "./pages/QuestionBank";
import QuestionBanks from "./pages/QuestionBanks";
import AssessmentConfig from "./pages/AssessmentConfig";
import ManagerAssessmentSets from "./pages/ManagerAssessmentSets";
import ReviewerWorkspace from "./pages/ReviewerWorkspace";
import ReviewerJobSets from "./pages/ReviewerJobSets";

import CandidateDashboard from "./pages/CandidateDashboard";
import CandidateAssessment from "./pages/CandidateAssessment";

import AdminDashboard from "./pages/AdminDashboard";
import RoleDashboard from "./pages/RoleDashboard";
import AssignedJobs from "./pages/AssignedJobs";
import ManagerJobReview from "./pages/ManagerJobReview";

import ProtectedRoute from "./components/ProtectedRoute";
import ECompass from "./components/ECompass";
import Handbook from "./pages/Handbook";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* PUBLIC LANDING PAGE: always show Landing at the root URL */}
        <Route
          path="/"
          element={<Landing />}
        />

        {/* PUBLIC AUTHENTICATION */}
        <Route
          path="/login"
          element={<Login />}
        />

        <Route
          path="/auth/verify-email"
          element={<VerifyEmail />}
        />

        {/* RECRUITER DASHBOARD */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute allowedRoles={["recruiter"]}>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        {/* RECRUITER JOBS */}
        <Route
          path="/jobs"
          element={
            <ProtectedRoute allowedRoles={["recruiter"]}>
              <Jobs />
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
          path="/jobs/:jobId"
          element={
            <ProtectedRoute allowedRoles={["recruiter"]}>
              <JobDetails />
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

        {/* HR ASSESSMENTS */}
        <Route
          path="/assessments"
          element={
            <ProtectedRoute allowedRoles={["recruiter"]}>
              <Assessments />
            </ProtectedRoute>
          }
        />

        {/* HR ASSESSMENT RESULTS */}
        <Route
          path="/assessments/:assessmentId/results"
          element={
            <ProtectedRoute
              allowedRoles={[
                "recruiter",
                "assessment_manager",
              ]}
            >
              <AssessmentResults />
            </ProtectedRoute>
          }
        />

        {/* PROCTORING MONITORING */}
        <Route
          path="/proctoring/activity"
          element={
            <ProtectedRoute
              allowedRoles={[
                "recruiter",
                "assessment_manager",
              ]}
            >
              <ProctoringActivity />
            </ProtectedRoute>
          }
        />

        {/* ASSESSMENT MANAGER */}
        <Route
          path="/manager/dashboard"
          element={
            <ProtectedRoute allowedRoles={["assessment_manager"]}>
              <RoleDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/manager/jobs"
          element={
            <ProtectedRoute allowedRoles={["assessment_manager"]}>
              <AssignedJobs />
            </ProtectedRoute>
          }
        />

        <Route
          path="/manager/jobs/:jobId/review"
          element={
            <ProtectedRoute allowedRoles={["assessment_manager"]}>
              <ManagerJobReview />
            </ProtectedRoute>
          }
        />

        <Route
          path="/questions"
          element={
            <ProtectedRoute allowedRoles={["assessment_manager"]}>
              <QuestionBank />
            </ProtectedRoute>
          }
        />

        <Route
          path="/question-banks"
          element={
            <ProtectedRoute
              allowedRoles={[
                "assessment_manager",
                "assessment_reviewer",
              ]}
            >
              <QuestionBanks />
            </ProtectedRoute>
          }
        />

        {/* QUESTION-SET AUTHORING */}
        <Route
          path="/question-sets/:questionSetId"
          element={
            <ProtectedRoute allowedRoles={["assessment_manager"]}>
              <AssessmentConfig />
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

        {/* MANAGER QUESTION SOURCING WORKSPACE */}
        <Route
          path="/manager/question-sets/:questionSetId/questions"
          element={
            <ProtectedRoute allowedRoles={["assessment_manager"]}>
              <ManagerAssessmentSets />
            </ProtectedRoute>
          }
        />

        {/* ASSESSMENT REVIEWER */}
        <Route
          path="/reviewer/dashboard"
          element={
            <ProtectedRoute allowedRoles={["assessment_reviewer"]}>
              <RoleDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/review/jobs/:jobId/sets"
          element={
            <ProtectedRoute allowedRoles={["assessment_reviewer"]}>
              <ReviewerJobSets />
            </ProtectedRoute>
          }
        />

        <Route
          path="/review"
          element={
            <ProtectedRoute allowedRoles={["assessment_reviewer"]}>
              <ReviewerWorkspace />
            </ProtectedRoute>
          }
        />

        {/* CANDIDATE DASHBOARD */}
        <Route
          path="/candidate/dashboard"
          element={
            <ProtectedRoute allowedRoles={["candidate"]}>
              <CandidateDashboard />
            </ProtectedRoute>
          }
        />

        {/* CANDIDATE ASSESSMENT */}
        <Route
          path="/assessments/:assessmentId"
          element={
            <ProtectedRoute allowedRoles={["candidate"]}>
              <CandidateAssessment />
            </ProtectedRoute>
          }
        />

        {/* ORGANIZATION ADMINISTRATOR */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={["organization_admin"]}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />

        {/* ROLE-BASED HANDBOOK: available to every authenticated role */}
        <Route
          path="/handbook"
          element={
            <ProtectedRoute
              allowedRoles={[
                "recruiter",
                "assessment_manager",
                "assessment_reviewer",
                "candidate",
                "organization_admin",
              ]}
            >
              <Handbook />
            </ProtectedRoute>
          }
        />

        {/* FALLBACK */}
        <Route
          path="*"
          element={
            <Navigate
              to="/"
              replace
            />
          }
        />
      </Routes>
      <ECompass />
    </BrowserRouter>
  );
}

export default App;
