import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  RefreshCw,
  Sparkles,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import RecruiterLayout from "../layouts/RecruiterLayout";

function JobDetails() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [refreshError, setRefreshError] = useState("");

  // ---------------------------------------------------------
  // LOAD JOB
  // ---------------------------------------------------------
  const loadJob = async (showRefreshState = false) => {
    try {
      if (showRefreshState) {
        setRefreshing(true);
        setRefreshError("");
      } else {
        setLoading(true);
        setError("");
        setRefreshError("");
        setJob(null);
      }

      const response = await api.get(`/jobs/${jobId}`);

      setJob(response.data);
      setRefreshError("");
    } catch (err) {
      console.error("Failed to load job:", err);

      if (
        err.response?.status === 401 ||
        err.response?.status === 403
      ) {
        logout();
        navigate("/login", { replace: true });
        return;
      }

      const message =
        err.response?.data?.detail ||
        "Unable to load this job.";

      if (showRefreshState && job) {
        setRefreshError(message);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!jobId) {
      setError("Unable to determine which job to load.");
      setJob(null);
      setLoading(false);
      return;
    }

    loadJob();
  }, [jobId]);

  // ---------------------------------------------------------
  // DATE FORMAT
  // ---------------------------------------------------------
  const formatDate = (value) => {
    if (!value) {
      return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return date.toLocaleString();
  };

  // ---------------------------------------------------------
  // LOADING
  // ---------------------------------------------------------
  if (loading) {
    return (
      <RecruiterLayout
        title="Job Details"
        breadcrumb="Workspace / Jobs / Details"
      >
        <div className="mx-auto flex min-h-[65vh] max-w-[1240px] items-center justify-center px-5 sm:px-8">
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAE5F9]">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#D9D9EA] border-t-[#5658E8]" />
            </div>

            <p className="mt-5 text-sm font-semibold text-[#344054]">
              Loading job details
            </p>

            <p className="mt-1.5 text-xs text-[#98A2B3]">
              Fetching the selected job.
            </p>
          </div>
        </div>
      </RecruiterLayout>
    );
  }

  // ---------------------------------------------------------
  // ERROR
  // ---------------------------------------------------------
  if (error) {
    return (
      <RecruiterLayout
        title="Job Details"
        breadcrumb="Workspace / Jobs / Details"
      >
        <div className="mx-auto flex min-h-[65vh] max-w-[1240px] items-center justify-center px-5 sm:px-8">
          <div className="w-full max-w-2xl rounded-[22px] border border-[#F0D5D5] bg-white p-8 shadow-[0_18px_45px_rgba(38,40,79,0.05)] sm:p-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#FCE7E7] text-[#B42318]">
              <BriefcaseBusiness size={20} />
            </div>

            <p className="mt-6 text-[9px] font-bold uppercase tracking-[0.2em] text-[#B42318]">
              Job management
            </p>

            <h1 className="mt-3 text-[32px] font-semibold tracking-[-0.03em] text-[#182033]">
              Job unavailable
            </h1>

            <p className="mt-3 text-sm leading-7 text-[#667085]">
              {error}
            </p>

            <div className="mt-7 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => loadJob()}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#5658E8] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(86,88,232,0.16)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#494BD8] focus:outline-none focus:ring-4 focus:ring-[#5658E8]/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw
                  size={15}
                  className={loading ? "animate-spin" : ""}
                />
                {loading ? "Retrying..." : "Try again"}
              </button>

              <button
                type="button"
                onClick={() => navigate("/jobs")}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#D7DCE5] bg-white px-5 py-3 text-sm font-semibold text-[#475467] transition duration-200 hover:border-[#B9C2D0] hover:bg-[#FAFBFC] focus:outline-none focus:ring-4 focus:ring-[#5658E8]/10"
              >
                <ArrowLeft size={15} />
                Back to Jobs
              </button>
            </div>
          </div>
        </div>
      </RecruiterLayout>
    );
  }

  return (
    <RecruiterLayout
      title="Job Details"
      breadcrumb={`Workspace / Jobs / ${job?.title || "Details"}`}
    >
      <main
        className="mx-auto max-w-[1240px] px-4 pb-10 sm:px-8"
        aria-labelledby="job-details-title"
        aria-busy={refreshing}
      >
        {refreshing && (
          <div
            className="sr-only"
            role="status"
            aria-live="polite"
          >
            Refreshing job details.
          </div>
        )}

        {refreshError && (
          <div
            className="mb-5 flex flex-col gap-3 rounded-xl border border-[#F0D5D5] bg-[#FFF9F9] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            role="alert"
            aria-live="polite"
          >
            <div>
              <p className="text-xs font-semibold text-[#B42318]">
                Refresh failed
              </p>

              <p className="mt-1 text-xs leading-5 text-[#B42318]/80">
                {refreshError}
              </p>
            </div>

            <button
              type="button"
              onClick={() => loadJob(true)}
              disabled={refreshing}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#E7BDBD] bg-white px-3 text-xs font-semibold text-[#A83E3E] transition hover:border-[#C98E8E] hover:bg-[#FFF5F5] focus:outline-none focus:ring-4 focus:ring-[#A83E3E]/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                size={13}
                className={refreshing ? "animate-spin" : ""}
              />
              Retry refresh
            </button>
          </div>
        )}

        {/* =====================================================
            PAGE CONTEXT
        ===================================================== */}
        <div className="flex flex-col gap-4 border-b border-[#E7E9EF] pb-5 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => navigate("/jobs")}
            className="group inline-flex min-h-9 w-fit items-center gap-2 rounded-lg px-2 text-xs font-semibold text-[#667085] transition duration-200 hover:-translate-x-0.5 hover:bg-[#F7F8FC] hover:text-[#5658E8] focus:outline-none focus:ring-4 focus:ring-[#5658E8]/10"
            aria-label="Back to Jobs"
          >
            <ArrowLeft
              size={15}
              className="transition-transform duration-200 group-hover:-translate-x-0.5"
            />
            Back to Jobs
          </button>

          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#D9DCE7] bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#7A8495]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#5658E8]" />
            Job details
          </span>
        </div>

        {/* =====================================================
            JOB OVERVIEW
        ===================================================== */}
        <section
          className="mt-6 overflow-hidden rounded-[22px] border border-[#DDE1E9] bg-white shadow-[0_12px_34px_rgba(38,40,79,0.04)]"
          aria-labelledby="job-overview-heading"
        >
          <div className="relative overflow-hidden rounded-[22px]">
            <div className="h-1 bg-gradient-to-r from-[#CFDEFC] via-[#EAE5F9] to-[#F3E3F2]" />

            <div className="pointer-events-none absolute right-[-90px] top-[-100px] h-64 w-64 rounded-full bg-[#CFDEFC]/45 blur-[75px]" />

            <div className="relative p-6 sm:p-8">
              <div className="flex flex-col gap-7 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#CFDEFC] text-[#4A61C8]">
                      <BriefcaseBusiness size={19} />
                    </div>

                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#4A61C8]">
                        Job profile
                      </p>

                      <p className="mt-1 text-[10px] text-[#98A2B3]">
                        Job ID: {job?.id}
                      </p>
                    </div>
                  </div>

                  <h2
                    id="job-overview-heading"
                    className="sr-only"
                  >
                    Job overview
                  </h2>

                  <h1
                    id="job-details-title"
                    className="mt-5 max-w-4xl text-[34px] font-semibold leading-[1.08] tracking-[-0.035em] text-[#182033] sm:text-[44px]"
                  >
                    {job?.title}
                  </h1>

                  <p className="mt-3 max-w-2xl text-sm leading-6 text-[#667085]">
                    Review the role information below before
                    moving into recruiter skill review.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => loadJob(true)}
                  disabled={refreshing}
                  aria-label="Refresh job details"
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#CBD1DC] bg-white px-4 text-xs font-semibold text-[#475467] transition duration-200 hover:border-[#5658E8] hover:bg-[#FAFAFF] hover:text-[#5658E8] focus:outline-none focus:ring-4 focus:ring-[#5658E8]/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw
                    size={14}
                    className={
                      refreshing
                        ? "animate-spin"
                        : ""
                    }
                  />
                  {refreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>

              <div className="mt-8 grid gap-3 border-t border-[#EEF0F3] pt-6 sm:grid-cols-2 xl:grid-cols-4">
                <JobMeta
                  label="Created by"
                  value={job?.created_by}
                  background="#CFDEFC"
                  color="#4A61C8"
                />

                <JobMeta
                  label="Experience"
                  value={
                    job?.experience_required ||
                    "Not specified"
                  }
                  background="#E8F2EF"
                  color="#17655E"
                />

                <JobMeta
                  label="Created"
                  value={formatDate(job?.created_at)}
                  background="#EAE5F9"
                  color="#7862C8"
                  icon={<CalendarDays size={14} />}
                />

                <JobMeta
                  label="Last updated"
                  value={formatDate(job?.updated_at)}
                  background="#F3E3F2"
                  color="#AA5E9C"
                  icon={<CalendarDays size={14} />}
                />
              </div>
            </div>
          </div>
        </section>

        {/* =====================================================
            WORKSPACE CONTENT
        ===================================================== */}
        <section className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-7 lg:items-start">
          {/* =================================================
              JOB DESCRIPTION
          ================================================= */}
          <article
            className="min-w-0 rounded-[22px] border border-[#DDE1E9] bg-white shadow-[0_12px_34px_rgba(38,40,79,0.035)]"
            aria-labelledby="job-description-heading"
          >
            <div className="border-b border-[#EAECF0] px-6 py-5 sm:px-7">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#CFDEFC] text-[#4A61C8]">
                  <BriefcaseBusiness size={17} />
                </div>

                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#4A61C8]">
                    Role information
                  </p>

                  <h2
                    id="job-description-heading"
                    className="mt-1 text-[19px] font-semibold tracking-[-0.02em] text-[#202938]"
                  >
                    Job Description
                  </h2>
                </div>
              </div>
            </div>

            <div className="px-6 py-7 sm:px-7 sm:py-8">
              <div className="mb-5 flex items-center justify-between gap-3 border-b border-[#F0F2F4] pb-4">
                <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#A0A8B4]">
                  Role content
                </p>

                <p className="text-[10px] font-medium text-[#A0A8B4]">
                  Full description
                </p>
              </div>

              <div className="whitespace-pre-wrap break-words text-sm leading-8 text-[#4F5F70]">
                {job?.description ||
                  "No job description is available."}
              </div>
            </div>
          </article>

          {/* =================================================
              NEXT STAGE
          ================================================= */}
          <aside
            className="rounded-[22px] border border-[#DDE1E9] bg-white shadow-[0_12px_34px_rgba(38,40,79,0.035)] lg:sticky lg:top-24"
            aria-labelledby="next-stage-heading"
          >
            <div className="h-1 rounded-t-[22px] bg-[#EAE5F9]" />

            <div className="p-6 sm:p-7">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EAE5F9] text-[#7862C8]">
                <Sparkles size={19} />
              </div>

              <div className="mt-5 flex items-center gap-2">
                <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#7862C8]">
                  Next stage
                </span>

                <span className="rounded-full bg-[#F3E3F2] px-2 py-0.5 text-[9px] font-bold text-[#AA5E9C]">
                  02
                </span>
              </div>

              <h2
                id="next-stage-heading"
                className="mt-2 text-[20px] font-semibold tracking-[-0.02em] text-[#202938]"
              >
                Skill review
              </h2>

              <p className="mt-3 text-sm leading-6 text-[#667085]">
                Continue to AI-assisted skill extraction and
                recruiter review for this job.
              </p>

              <div className="mt-6 rounded-xl border border-[#EEF0F3] bg-[#FAFBFC] p-3.5">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F3E3F2] text-[#AA5E9C]">
                    <Sparkles size={14} />
                  </span>

                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold text-[#344054]">
                      Review extracted skills
                    </p>

                    <p className="mt-0.5 text-[9px] leading-4 text-[#98A2B3]">
                      Inspect, refine, save, and confirm the
                      role skill set.
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (job?.id != null) {
                    navigate(`/jobs/${job.id}/skills`);
                  }
                }}
                disabled={refreshing}
                className="group/button mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#5658E8] px-4 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(86,88,232,0.17)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#494BD8] focus:outline-none focus:ring-4 focus:ring-[#5658E8]/15 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label={`Review skills for ${job?.title || "this job"}`}
              >
                Review Skills

                <ArrowRight
                  size={15}
                  className="transition-transform duration-200 group-hover/button:translate-x-1"
                />
              </button>
            </div>
          </aside>
        </section>

        {/* =====================================================
            WORKFLOW CONTEXT
        ===================================================== */}
        <section
          className="mt-7 rounded-[20px] border border-[#DDE1E9] bg-[#F8F9FC] px-4 py-4 sm:px-6 sm:py-5"
          aria-label="Screening workflow context"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#CFDEFC] text-[#4A61C8]">
                <ArrowRight size={16} />
              </div>

              <div>
                <p className="text-xs font-semibold text-[#344054]">
                  Screening workflow
                </p>

                <p className="mt-1 text-[11px] leading-5 text-[#667085]">
                  Job creation → skill review → question
                  preparation.
                </p>
              </div>
            </div>

            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#98A2B3]">
              Current stage: Job details
            </p>
          </div>
        </section>
      </main>
    </RecruiterLayout>
  );
}

/* ============================================================
   JOB META
============================================================ */

function JobMeta({
  label,
  value,
  background,
  color,
  icon,
}) {
  return (
    <div className="rounded-[15px] border border-[#EEF0F3] bg-[#FAFBFC] p-3.5 transition duration-200 hover:bg-white hover:shadow-[0_8px_20px_rgba(38,40,79,0.04)]">
      <div className="flex items-center gap-2">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{
            backgroundColor: background,
            color,
          }}
        >
          {icon || <BriefcaseBusiness size={13} />}
        </span>

        <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-[#98A2B3]">
          {label}
        </p>
      </div>

      <p className="mt-2.5 break-words text-sm font-semibold text-[#344054]">
        {value}
      </p>
    </div>
  );
}

export default JobDetails;
