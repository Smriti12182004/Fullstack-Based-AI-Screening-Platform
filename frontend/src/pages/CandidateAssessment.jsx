import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ClipboardCheck,
  LoaderCircle,
  LogOut,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";

function CandidateAssessment() {
  const { assessmentId } = useParams();
  const navigate = useNavigate();
  const { auth, logout } = useAuth();

  const [assessment, setAssessment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadAssessment = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await api.get(
          `/assessments/${assessmentId}`
        );

        setAssessment(response.data);
      } catch (err) {
        console.error("Failed to load assessment:", err);

        if (
          err.response?.status === 401 ||
          err.response?.status === 403
        ) {
          logout();
          navigate("/login", { replace: true });
          return;
        }

        setError(
          err.response?.data?.detail ||
            "Unable to load this assessment."
        );
      } finally {
        setLoading(false);
      }
    };

    loadAssessment();
  }, [assessmentId, logout, navigate]);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F8F6]">
        <div className="text-center">
          <LoaderCircle
            size={32}
            className="mx-auto animate-spin text-[#004040]"
          />
          <p className="mt-3 text-sm text-[#61706E]">
            Loading assessment...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#F7F8F6] px-5 py-10">
        <div className="mx-auto max-w-2xl rounded-2xl border border-red-200 bg-white p-8">
          <h1 className="font-display text-3xl text-[#004040]">
            Assessment unavailable
          </h1>

          <p className="mt-3 text-sm leading-6 text-[#61706E]">
            {error}
          </p>

          <button
            type="button"
            onClick={() => navigate("/candidate/dashboard")}
            className="mt-6 rounded-xl bg-[#004040] px-5 py-3 text-sm font-semibold text-white hover:bg-[#003333]"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F8F6] text-[#13201F]">
      <header className="border-b border-[#DDE5E2] bg-white">
        <div className="mx-auto flex min-h-[72px] max-w-[1200px] items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#004040] text-white">
              <ClipboardCheck size={20} />
            </div>

            <div>
              <div className="font-display text-xl text-[#004040]">
                AI Screening
              </div>
              <p className="text-xs text-[#7A8785]">
                Candidate Workspace
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold">
                Candidate
              </p>
              <p className="text-xs text-[#7A8785]">
                ID: {auth?.user_id ?? "—"}
              </p>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#DDE5E2] bg-white px-3 text-sm font-medium text-[#52615F] hover:border-[#004040] hover:text-[#004040]"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">
                Logout
              </span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-5 py-8 sm:px-8">
        <button
          type="button"
          onClick={() => navigate("/candidate/dashboard")}
          className="inline-flex items-center gap-2 text-sm font-medium text-[#61706E] hover:text-[#004040]"
        >
          <ArrowLeft size={16} />
          Back to dashboard
        </button>

        <section className="mt-6 rounded-[28px] border border-[#DDE5E2] bg-white p-6 shadow-[0_16px_45px_rgba(0,64,64,0.07)] sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#187F78]">
            Assessment
          </p>

          <h1 className="mt-3 font-display text-4xl leading-tight text-[#004040]">
            {assessment?.title}
          </h1>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-[#EEF7F5] p-4">
              <p className="text-xs text-[#61706E]">
                Assessment ID
              </p>
              <p className="mt-1 text-lg font-semibold text-[#004040]">
                {assessment?.assessment_id}
              </p>
            </div>

            <div className="rounded-2xl bg-[#EEF7F5] p-4">
              <p className="text-xs text-[#61706E]">
                Job ID
              </p>
              <p className="mt-1 text-lg font-semibold text-[#004040]">
                {assessment?.job_id}
              </p>
            </div>

            <div className="rounded-2xl bg-[#EEF7F5] p-4">
              <p className="text-xs text-[#61706E]">
                Attempt ID
              </p>
              <p className="mt-1 text-lg font-semibold text-[#004040]">
                {assessment?.attempt_id}
              </p>
            </div>
          </div>

          <div className="mt-8 border-t border-[#DDE5E2] pt-6">
            <h2 className="text-lg font-semibold text-[#13201F]">
              Assessment status
            </h2>

            <p className="mt-2 text-sm text-[#61706E]">
              Current assessment status:{" "}
              <span className="font-semibold text-[#004040]">
                {assessment?.status}
              </span>
            </p>
          </div>

          <div className="mt-8 rounded-2xl border border-dashed border-[#C9D6D2] bg-[#F7F8F6] p-6">
            <h3 className="text-base font-semibold text-[#13201F]">
              Assessment execution
            </h3>

            <p className="mt-2 text-sm leading-6 text-[#61706E]">
              The assessment execution interface will be connected
              here once the question delivery, response submission,
              timing, and evaluation APIs are implemented.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

export default CandidateAssessment;