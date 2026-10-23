
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  LogOut,
  RefreshCw,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import evalynLetter from "../assets/evalyn-letter.png";
import "./CandidateDashboard.css";

function CandidateDashboard() {
  const navigate = useNavigate();
  const { auth, logout } = useAuth();

  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [currentTime, setCurrentTime] = useState(
    new Date()
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  const getGreeting = () => {
    const hour = currentTime.getHours();

    if (hour >= 5 && hour < 12) {
      return "Good morning";
    }

    if (hour >= 12 && hour < 17) {
      return "Good afternoon";
    }

    return "Good evening";
  };

  const getDisplayName = () => {
    return auth?.full_name?.trim() || auth?.username || "there";
  };

  const greeting = getGreeting();
  const displayName = getDisplayName();

  const loadAssessments = async (showRefreshState = false) => {
    try {
      setError("");

      if (showRefreshState) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const response = await api.get("/assessments");

      setAssessments(
        Array.isArray(response.data)
          ? response.data
          : []
      );
    } catch (err) {
      console.error(
        "Failed to load candidate assessments:",
        err
      );

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
          "Unable to load your assessments right now."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAssessments();
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const getStatus = (attemptStatus) => {
    switch (attemptStatus) {
      case "in_progress":
      case "started":
        return {
          label: "In Progress",
          className:
            "bg-amber-50 text-amber-700 border-amber-200",
        };

      case "completed":
      case "submitted":
        return {
          label: "Completed",
          className:
            "bg-emerald-50 text-emerald-700 border-emerald-200",
        };

      default:
        return {
          label: "Not Started",
          className:
            "bg-slate-50 text-slate-600 border-slate-200",
        };
    }
  };

  const handleAssessmentAction = (assessment) => {
    navigate(
      `/assessments/${assessment.assessment_id}`
    );
  };

  const inProgressCount = assessments.filter(
    (assessment) =>
      assessment.attempt_status === "in_progress" ||
      assessment.attempt_status === "started"
  ).length;

  const completedCount = assessments.filter(
    (assessment) =>
      assessment.attempt_status === "completed" ||
      assessment.attempt_status === "submitted"
  ).length;

  return (
    <div className="candidate-dashboard min-h-screen bg-[#F5F8FC] text-[#202938]">
      <header className="cd-topbar border-b border-[#DDE1E9] bg-white">
        <div className="cd-topbar__inner mx-auto flex min-h-[72px] max-w-[1400px] items-center justify-between px-5 sm:px-8">
          <div className="cd-brand flex items-center gap-3">
            <div className="cd-brand__mark flex h-11 w-11 shrink-0 items-center justify-center">
              <img
                src={evalynLetter}
                alt="Evalyn logo"
                className="cd-brand__logo h-10 w-10 object-contain"
              />
            </div>

            <div>
              <div className="cd-brand__name font-display text-xl text-[#25264A]">
                Evalyn
              </div>

              <p className="cd-brand__subtitle text-xs text-[#667085]">
                Candidate Workspace
              </p>
            </div>
          </div>

          <div className="cd-account flex items-center gap-3">
            <div className="cd-account__identity hidden text-right sm:block">
              <p className="cd-account__name text-sm font-semibold text-[#202938]">
                {displayName}
              </p>

              <p className="cd-account__role text-xs text-[#667085]">
                Candidate
              </p>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="cd-button cd-button--logout inline-flex h-10 items-center gap-2 rounded-xl border border-[#DDE1E9] bg-white px-3 text-sm font-medium text-[#475467] transition hover:border-[#25264A] hover:text-[#25264A]"
            >
              <LogOut size={16} />

              <span className="hidden sm:inline">
                Logout
              </span>
            </button>
          </div>
        </div>
      </header>

      <main className="cd-main mx-auto max-w-[1400px] px-5 py-8 sm:px-8">
        <section className="cd-hero relative overflow-hidden rounded-[28px] border border-[#DDE1E9] bg-white p-6 shadow-[0_16px_45px_rgba(37,38,74,0.10)] sm:p-8">
          <div className="cd-hero__orbit pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full border-[22px] border-[#F0EBFB]" />

          <div className="cd-hero__content relative max-w-3xl">
            <p className="cd-hero__eyebrow mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-[#7862C8]">
              {greeting}
            </p>

            <h1 className="cd-hero__title font-display text-4xl leading-tight text-[#25264A] sm:text-5xl">
              {greeting}, {displayName}.
            </h1>

            <p className="cd-hero__description mt-4 max-w-2xl text-sm leading-7 text-[#667085] sm:text-base">
              Review your assigned assessments and
              continue where you left off. Your progress is
              linked to your candidate account.
            </p>
          </div>
        </section>

        <section className="cd-stats mt-6 grid gap-4 sm:grid-cols-3">
          <div className="cd-stat-card cd-stat-card--assigned rounded-2xl border border-[#DDE1E9] bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="cd-stat-card__label text-sm text-[#667085]">
                  Assigned
                </p>

                <p className="cd-stat-card__value mt-1 text-3xl font-semibold text-[#202938]">
                  {assessments.length}
                </p>
              </div>

              <div className="cd-stat-card__icon cd-stat-card__icon--assigned flex h-11 w-11 items-center justify-center rounded-xl bg-[#F0EBFB] text-[#25264A]">
                <ClipboardCheck size={20} />
              </div>
            </div>
          </div>

          <div className="cd-stat-card cd-stat-card--progress rounded-2xl border border-[#DDE1E9] bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="cd-stat-card__label text-sm text-[#667085]">
                  In Progress
                </p>

                <p className="cd-stat-card__value mt-1 text-3xl font-semibold text-[#202938]">
                  {inProgressCount}
                </p>
              </div>

              <div className="cd-stat-card__icon cd-stat-card__icon--progress flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFF7E8] text-[#B87910]">
                <Clock3 size={20} />
              </div>
            </div>
          </div>

          <div className="cd-stat-card cd-stat-card--completed rounded-2xl border border-[#DDE1E9] bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="cd-stat-card__label text-sm text-[#667085]">
                  Completed
                </p>

                <p className="cd-stat-card__value mt-1 text-3xl font-semibold text-[#202938]">
                  {completedCount}
                </p>
              </div>

              <div className="cd-stat-card__icon cd-stat-card__icon--completed flex h-11 w-11 items-center justify-center rounded-xl bg-[#ECF8F2] text-[#17845F]">
                <FileCheck2 size={20} />
              </div>
            </div>
          </div>
        </section>

        <section className="cd-assessments mt-8">
          <div className="cd-assessments__heading mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="cd-assessments__title font-display text-2xl text-[#25264A]">
                Assigned assessments
              </h2>

              <p className="cd-assessments__description mt-1 text-sm text-[#667085]">
                Assessments currently linked to your
                account.
              </p>
            </div>

            <button
              type="button"
              onClick={() => loadAssessments(true)}
              disabled={refreshing}
              className="cd-button cd-button--refresh inline-flex h-10 items-center gap-2 rounded-xl border border-[#DDE1E9] bg-white px-3 text-sm font-medium text-[#475467] transition hover:border-[#25264A] hover:text-[#25264A] disabled:opacity-60"
            >
              <RefreshCw
                size={16}
                className={
                  refreshing ? "animate-spin" : ""
                }
              />

              <span className="hidden sm:inline">
                Refresh
              </span>
            </button>
          </div>

          {loading ? (
            <div className="cd-state-card rounded-2xl border border-[#DDE1E9] bg-white p-8 text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#DDE1E9] border-t-[#25264A]" />

              <p className="mt-4 text-sm text-[#667085]">
                Loading your assessments...
              </p>
            </div>
          ) : error ? (
            <div className="cd-state-card cd-state-card--error rounded-2xl border border-red-200 bg-red-50 p-6">
              <p className="text-sm font-medium text-red-700">
                {error}
              </p>

              <button
                type="button"
                onClick={() => loadAssessments()}
                className="mt-4 rounded-xl bg-[#5658E8] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#4546C8]"
              >
                Try again
              </button>
            </div>
          ) : assessments.length === 0 ? (
            <div className="cd-state-card cd-state-card--empty rounded-2xl border border-dashed border-[#CDD3DE] bg-white p-10 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F0EBFB] text-[#25264A]">
                <ClipboardCheck size={24} />
              </div>

              <h3 className="mt-5 text-lg font-semibold text-[#202938]">
                No assessments assigned
              </h3>

              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#667085]">
                There are currently no assessments
                associated with your candidate account.
              </p>
            </div>
          ) : (
            <div className="cd-assessment-list grid gap-4">
              {assessments.map((assessment) => {
                const status = getStatus(
                  assessment.attempt_status
                );

                return (
                  <article
                    key={assessment.assessment_id}
                    className="cd-assessment-card rounded-2xl border border-[#DDE1E9] bg-white p-5 shadow-[0_8px_25px_rgba(37,38,74,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(37,38,74,0.08)] sm:p-6"
                  >
                    <div className="cd-assessment-card__layout flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="cd-assessment-card__title text-lg font-semibold text-[#202938]">
                            {assessment.title}
                          </h3>

                          <span
                            className={`cd-status-badge rounded-full border px-2.5 py-1 text-xs font-semibold ${status.className}`}
                          >
                            {status.label}
                          </span>
                        </div>

                        <div className="cd-assessment-card__meta mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#667085]">
                          <span>
                            Assessment ID:{" "}
                            {assessment.assessment_id}
                          </span>

                          <span>
                            Job ID: {assessment.job_id}
                          </span>

                          <span>
                            Attempt ID: {assessment.attempt_id}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          handleAssessmentAction(assessment)
                        }
                        className="cd-button cd-assessment-card__action inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#5658E8] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#4546C8]"
                      >
                        {assessment.attempt_status === "in_progress" ||
                        assessment.attempt_status === "started"
                          ? "Continue Assessment"
                          : assessment.attempt_status === "completed" ||
                            assessment.attempt_status === "submitted"
                          ? "View Assessment"
                          : "Start Assessment"}

                        <ArrowRight size={16} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default CandidateDashboard;
