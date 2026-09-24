import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  AlertCircle,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  Plus,
  RefreshCw,
  Sparkles,
  Users,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import RecruiterLayout from "../layouts/RecruiterLayout";

const COLORS = {
  dark: "#25264A",
  indigo: "#5658E8",
  indigoDark: "#4648C9",
  indigoLight: "#ECECFF",

  blue: "#3B82F6",
  blueDark: "#2F68C5",
  blueLight: "#EAF2FF",

  violet: "#7A61D8",
  violetDark: "#654DBD",
  violetLight: "#F0EBFB",

  teal: "#0F9D8A",
  tealDark: "#08786B",
  tealLight: "#E5F7F3",

  rose: "#B85C87",
  roseDark: "#944668",
  roseLight: "#F8EAF1",

  amber: "#C58A32",
  amberDark: "#9C6A1F",
  amberLight: "#FBF2DE",

  peach: "#B87562",
  peachDark: "#955847",
  peachLight: "#FAECE8",

  text: "#1B2430",
  textSecondary: "#667085",
  textMuted: "#98A2B3",

  border: "#E1E4EB",
  background: "#F7F8FC",
};

function Jobs() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // ---------------------------------------------------------
  // LOAD JOBS
  // ---------------------------------------------------------
  const loadJobs = async (showRefreshState = false) => {
    try {
      setError("");

      if (showRefreshState) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const response = await api.get("/jobs");

      setJobs(
        Array.isArray(response.data)
          ? response.data
          : []
      );
    } catch (err) {
      console.error("Failed to load jobs:", err);

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
          "Unable to load jobs right now."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // ---------------------------------------------------------
  // INITIAL LOAD
  // ---------------------------------------------------------
  useEffect(() => {
    loadJobs();
  }, []);

  // ---------------------------------------------------------
  // DATE FORMAT
  // ---------------------------------------------------------
  const formatDate = (value) => {
    if (!value) {
      return "—";
    }

    return new Date(value).toLocaleDateString(
      undefined,
      {
        day: "numeric",
        month: "short",
        year: "numeric",
      }
    );
  };

  // ---------------------------------------------------------
  // DESCRIPTION PREVIEW
  // ---------------------------------------------------------
  const getDescriptionPreview = (description) => {
    if (!description) {
      return "No job description available.";
    }

    if (description.length <= 180) {
      return description;
    }

    return `${description.slice(0, 180)}...`;
  };

  // ---------------------------------------------------------
  // JOB PALETTE
  // ---------------------------------------------------------
  const getJobStyle = (index) => {
    const styles = [
      {
        accent: COLORS.blue,
        accentDark: COLORS.blueDark,
        light: COLORS.blueLight,
      },
      {
        accent: COLORS.violet,
        accentDark: COLORS.violetDark,
        light: COLORS.violetLight,
      },
      {
        accent: COLORS.teal,
        accentDark: COLORS.tealDark,
        light: COLORS.tealLight,
      },
      {
        accent: COLORS.rose,
        accentDark: COLORS.roseDark,
        light: COLORS.roseLight,
      },
      {
        accent: COLORS.amber,
        accentDark: COLORS.amberDark,
        light: COLORS.amberLight,
      },
      {
        accent: COLORS.peach,
        accentDark: COLORS.peachDark,
        light: COLORS.peachLight,
      },
    ];

    return styles[index % styles.length];
  };

  return (
    <RecruiterLayout
      title="Jobs"
      breadcrumb="Workspace / Jobs"
    >
      <div className="mx-auto max-w-[1440px] pb-16">

        {/* =====================================================
            PAGE INTRO
        ===================================================== */}
        <section className="relative overflow-hidden rounded-[30px] border border-[#DDE1EA] bg-white px-7 py-9 shadow-[0_20px_55px_rgba(38,40,79,0.06)] sm:px-9 sm:py-11 lg:px-11 lg:py-12">

          {/* Background palette */}
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#EAF2FF] blur-[75px] opacity-75" />

          <div className="pointer-events-none absolute right-[18%] top-5 h-36 w-36 rounded-full bg-[#F0EBFB] blur-[45px] opacity-75" />

          <div className="pointer-events-none absolute bottom-[-70px] right-[25%] h-48 w-48 rounded-full bg-[#F8EAF1] blur-[55px] opacity-70" />

          <div className="relative flex flex-col gap-9 lg:flex-row lg:items-end lg:justify-between">

            <div className="max-w-3xl">

              <div className="inline-flex items-center gap-2 rounded-full border border-[#E0E3EA] bg-[#FAFBFD] px-3.5 py-2">

                <span className="h-2 w-2 rounded-full bg-[#5658E8]" />

                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#667085]">
                  Job management
                </span>

              </div>

              <h1 className="mt-5 text-[40px] font-semibold leading-[1.04] tracking-[-0.04em] text-[#1B2430] sm:text-[50px]">
                Jobs
              </h1>

              <p className="mt-4 max-w-2xl text-sm leading-7 text-[#667085] sm:text-[15px]">
                Manage job descriptions and continue the
                screening workflow from role creation through
                skill review.
              </p>

              {/* Small workflow indicators */}
              <div className="mt-7 flex flex-wrap gap-2.5">

                <WorkflowBadge
                  icon={<BriefcaseBusiness size={12} />}
                  label="Roles"
                  background={COLORS.blueLight}
                  color={COLORS.blueDark}
                />

                <WorkflowBadge
                  icon={<Sparkles size={12} />}
                  label="AI-assisted"
                  background={COLORS.violetLight}
                  color={COLORS.violetDark}
                />

                <WorkflowBadge
                  icon={<Users size={12} />}
                  label="Recruiter review"
                  background={COLORS.roseLight}
                  color={COLORS.roseDark}
                />

              </div>

            </div>

            <div className="flex flex-wrap gap-3">

              <button
                type="button"
                onClick={() => loadJobs(true)}
                disabled={refreshing}
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#CBD1DC] bg-white px-4 text-sm font-semibold text-[#475467] transition duration-200 hover:-translate-y-0.5 hover:border-[#5658E8] hover:text-[#5658E8] disabled:cursor-not-allowed disabled:opacity-60"
              >

                <RefreshCw
                  size={15}
                  className={
                    refreshing
                      ? "animate-spin"
                      : ""
                  }
                />

                Refresh

              </button>

              <button
                type="button"
                onClick={() => navigate("/jobs/new")}
                className="group inline-flex h-11 items-center gap-2 rounded-xl bg-[#5658E8] px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(86,88,232,0.20)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#4648C9] hover:shadow-[0_14px_30px_rgba(86,88,232,0.24)]"
              >

                <Plus size={16} />

                New Job

                <ArrowRight
                  size={14}
                  className="transition-transform duration-200 group-hover:translate-x-1"
                />

              </button>

            </div>

          </div>

        </section>

        {/* =====================================================
            SUMMARY
        ===================================================== */}
        <section className="mt-9 grid gap-5 lg:grid-cols-2">

          <SummaryCard
            icon={<BriefcaseBusiness size={20} />}
            label="Total Jobs"
            value={jobs.length}
            background={COLORS.blueLight}
            iconColor={COLORS.blueDark}
            accent={COLORS.blue}
            description="Roles currently available in your workspace."
          />

          <SummaryCard
            icon={<CalendarDays size={20} />}
            label="Latest Job"
            value={
              jobs.length > 0
                ? jobs[jobs.length - 1]?.title
                : "No jobs yet"
            }
            background={COLORS.violetLight}
            iconColor={COLORS.violetDark}
            accent={COLORS.violet}
            valueSmall
            description={
              jobs.length > 0
                ? `Job #${jobs[jobs.length - 1]?.id}`
                : "Create your first role to begin."
            }
          />

        </section>

        {/* =====================================================
            JOB LIST
        ===================================================== */}
        <section className="mt-12">

          <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">

            <div>

              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#5658E8]">
                Workspace
              </p>

              <h2 className="mt-2 text-[26px] font-semibold tracking-[-0.03em] text-[#1B2430]">
                All jobs
              </h2>

              <p className="mt-2 text-sm leading-6 text-[#667085]">
                Jobs returned by the platform.
              </p>

            </div>

            {!loading && !error && jobs.length > 0 && (
              <div className="inline-flex items-center gap-2 self-start rounded-full bg-[#F0EBFB] px-3.5 py-2 text-[10px] font-bold text-[#654DBD] sm:self-auto">

                <span className="h-1.5 w-1.5 rounded-full bg-[#7A61D8]" />

                {jobs.length}{" "}
                {jobs.length === 1
                  ? "job"
                  : "jobs"}

              </div>
            )}

          </div>

          {/* =================================================
              LOADING
          ================================================= */}
          {loading ? (
            <div className="rounded-[24px] border border-[#DDE1EA] bg-white px-6 py-20 text-center shadow-[0_12px_34px_rgba(38,40,79,0.04)]">

              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F0EBFB]">

                <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#DCD8ED] border-t-[#7A61D8]" />

              </div>

              <p className="mt-5 text-sm font-semibold text-[#344054]">
                Loading jobs
              </p>

              <p className="mt-1.5 text-xs text-[#98A2B3]">
                Fetching your recruiter workspace.
              </p>

            </div>

          ) : error ? (

            /* =================================================
               ERROR
            ================================================= */
            <div className="rounded-[24px] border border-[#F0D2D2] bg-[#FFF9F9] p-7 shadow-[0_10px_28px_rgba(180,35,24,0.035)] sm:p-8">

              <div className="flex items-start gap-4">

                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#FCE7E7] text-[#B42318]">
                  <AlertCircle size={20} />
                </div>

                <div className="min-w-0">

                  <p className="text-sm font-semibold text-[#B42318]">
                    Jobs unavailable
                  </p>

                  <p className="mt-2 max-w-2xl text-sm leading-7 text-[#B42318]/80">
                    {error}
                  </p>

                  <button
                    type="button"
                    onClick={() => loadJobs()}
                    className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#5658E8] px-4 py-2.5 text-sm font-semibold text-white transition duration-200 hover:bg-[#4648C9]"
                  >
                    Try again
                    <ArrowRight size={14} />
                  </button>

                </div>

              </div>

            </div>

          ) : jobs.length === 0 ? (

            /* =================================================
               EMPTY
            ================================================= */
            <div className="relative overflow-hidden rounded-[26px] border border-dashed border-[#C9D0DC] bg-white px-6 py-20 text-center shadow-[0_12px_34px_rgba(38,40,79,0.035)]">

              <div className="pointer-events-none absolute -left-16 top-8 h-36 w-36 rounded-full bg-[#EAF2FF] blur-[50px]" />

              <div className="pointer-events-none absolute -right-16 bottom-4 h-36 w-36 rounded-full bg-[#F0EBFB] blur-[50px]" />

              <div className="relative">

                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#EAF2FF] text-[#3B82F6]">
                  <BriefcaseBusiness size={27} />
                </div>

                <p className="mt-6 text-[9px] font-bold uppercase tracking-[0.18em] text-[#3B82F6]">
                  Workspace is ready
                </p>

                <h3 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-[#1B2430]">
                  No jobs created yet
                </h3>

                <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-[#667085]">
                  Create your first job to begin the role-specific
                  screening workflow.
                </p>

                <button
                  type="button"
                  onClick={() => navigate("/jobs/new")}
                  className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[#5658E8] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(86,88,232,0.16)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#4648C9]"
                >
                  <Plus size={16} />
                  Create New Job
                </button>

              </div>

            </div>

          ) : (

            /* =================================================
               JOB CARDS
            ================================================= */
            <div className="space-y-5">

              {jobs
                .slice()
                .reverse()
                .map((job, index) => {
                  const style =
                    getJobStyle(index);

                  return (
                    <article
                      key={job.id}
                      className="group relative overflow-hidden rounded-[24px] border border-[#DDE1EA] bg-white shadow-[0_12px_32px_rgba(38,40,79,0.04)] transition duration-300 hover:-translate-y-1 hover:border-[#CDD2DD] hover:shadow-[0_20px_44px_rgba(38,40,79,0.08)]"
                    >

                      {/* Accent strip */}
                      <div
                        className="absolute inset-y-0 left-0 w-1.5 transition-all duration-300 group-hover:w-2"
                        style={{
                          backgroundColor:
                            style.accent,
                        }}
                      />

                      <div className="p-6 sm:p-7 lg:p-8">

                        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">

                          {/* JOB INFORMATION */}
                          <div className="min-w-0 flex-1">

                            <div className="flex items-start gap-4">

                              <div
                                className="flex h-13 w-13 shrink-0 items-center justify-center rounded-xl"
                                style={{
                                  backgroundColor:
                                    style.light,
                                  color:
                                    style.accentDark,
                                }}
                              >
                                <BriefcaseBusiness
                                  size={20}
                                />
                              </div>

                              <div className="min-w-0 flex-1">

                                <div className="flex flex-wrap items-center gap-3">

                                  <h3 className="max-w-[760px] text-lg font-semibold tracking-[-0.015em] text-[#1B2430] sm:text-[21px]">
                                    {job.title}
                                  </h3>

                                  <span
                                    className="rounded-full px-2.5 py-1 text-[9px] font-bold"
                                    style={{
                                      backgroundColor:
                                        style.light,
                                      color:
                                        style.accentDark,
                                    }}
                                  >
                                    Job #{job.id}
                                  </span>

                                </div>

                                <p className="mt-1.5 text-[10px] text-[#98A2B3]">
                                  Job ID: {job.id}
                                </p>

                              </div>

                            </div>

                            {/* Description */}
                            <p className="mt-6 max-w-4xl text-sm leading-7 text-[#5F6D7A]">
                              {getDescriptionPreview(
                                job.description
                              )}
                            </p>

                            {/* Metadata */}
                            <div className="mt-7 grid gap-4 border-t border-[#EEF0F3] pt-5 sm:grid-cols-3">

                              <MetaItem
                                label="Created by"
                                value={
                                  job.created_by
                                }
                                accent={
                                  style.accent
                                }
                              />

                              <MetaItem
                                label="Created"
                                value={formatDate(
                                  job.created_at
                                )}
                                accent={
                                  style.accent
                                }
                              />

                              <MetaItem
                                label="Last updated"
                                value={formatDate(
                                  job.updated_at
                                )}
                                accent={
                                  style.accent
                                }
                              />

                            </div>

                          </div>

                          {/* ACTION PANEL */}
                          <div className="w-full shrink-0 lg:w-[190px] lg:border-l lg:border-[#EEF0F3] lg:pl-7">

                            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#98A2B3]">
                              Next stage
                            </p>

                            <p className="mt-2 text-xs leading-5 text-[#667085]">
                              Continue to skill review
                              for this role.
                            </p>

                            <button
                              type="button"
                              onClick={() =>
                                navigate(
                                  `/jobs/${job.id}/skills`
                                )
                              }
                              className="group/button mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md"
                              style={{
                                backgroundColor:
                                  style.accent,
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor =
                                  style.accentDark;
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor =
                                  style.accent;
                              }}
                            >
                              Review Skills

                              <ArrowRight
                                size={15}
                                className="transition-transform duration-200 group-hover/button:translate-x-1"
                              />

                            </button>

                          </div>

                        </div>

                      </div>

                    </article>
                  );
                })}

            </div>
          )}

        </section>

        {/* =====================================================
            WORKFLOW FOOTER
        ===================================================== */}
        {!loading && !error && jobs.length > 0 && (
          <section className="mt-10 rounded-[22px] border border-[#DDE1EA] bg-[#F8F9FC] px-6 py-5 sm:px-7">

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

              <div className="flex items-start gap-3.5">

                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F0EBFB] text-[#7A61D8]">
                  <Sparkles size={17} />
                </div>

                <div>

                  <p className="text-xs font-semibold text-[#344054]">
                    Continue the screening workflow
                  </p>

                  <p className="mt-1 text-[11px] leading-5 text-[#667085]">
                    Open a role to review its skills and continue
                    toward screening question preparation.
                  </p>

                </div>

              </div>

              <button
                type="button"
                onClick={() => navigate("/jobs/new")}
                className="inline-flex items-center gap-2 self-start rounded-xl border border-[#DDE1EA] bg-white px-4 py-2.5 text-xs font-semibold text-[#475467] transition duration-200 hover:border-[#5658E8] hover:text-[#5658E8] sm:self-auto"
              >
                <Plus size={14} />
                New Job
              </button>

            </div>

          </section>
        )}

      </div>
    </RecruiterLayout>
  );
}

/* ============================================================
   WORKFLOW BADGE
============================================================ */

function WorkflowBadge({
  icon,
  label,
  background,
  color,
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-semibold"
      style={{
        backgroundColor: background,
        color,
      }}
    >
      {icon}
      {label}
    </span>
  );
}

/* ============================================================
   SUMMARY CARD
============================================================ */

function SummaryCard({
  icon,
  label,
  value,
  background,
  iconColor,
  accent,
  description,
  valueSmall = false,
}) {
  return (
    <div className="group relative overflow-hidden rounded-[22px] border border-[#DDE1EA] bg-white p-6 shadow-[0_10px_28px_rgba(38,40,79,0.035)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_17px_36px_rgba(38,40,79,0.07)] sm:p-7">

      {/* Top accent */}
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{
          backgroundColor: accent,
        }}
      />

      <div className="flex items-start justify-between gap-5">

        <div className="min-w-0">

          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#98A2B3]">
            {label}
          </p>

          <p
            className={`mt-3 font-semibold tracking-[-0.03em] text-[#1B2430] ${
              valueSmall
                ? "max-w-[500px] break-words text-lg sm:text-xl"
                : "text-[35px]"
            }`}
          >
            {value}
          </p>

          <p className="mt-2 text-[11px] leading-5 text-[#98A2B3]">
            {description}
          </p>

        </div>

        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition duration-300 group-hover:scale-105"
          style={{
            backgroundColor: background,
            color: iconColor,
          }}
        >
          {icon}
        </div>

      </div>

    </div>
  );
}

/* ============================================================
   META ITEM
============================================================ */

function MetaItem({
  label,
  value,
  accent,
}) {
  return (
    <div className="min-w-[110px]">

      <div className="flex items-center gap-2">

        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{
            backgroundColor: accent,
          }}
        />

        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#A1AAB6]">
          {label}
        </p>

      </div>

      <p className="mt-2 text-xs font-semibold text-[#667085]">
        {value}
      </p>

    </div>
  );
}

export default Jobs;