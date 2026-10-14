import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  FileText,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import RecruiterLayout from "../layouts/RecruiterLayout";

const JOB_PALETTE = [
  {
    accent: "#7A61D8",
    accentDark: "#654DBD",
    light: "#F0EBFB",
  },
  {
    accent: "#3B82F6",
    accentDark: "#2F68C5",
    light: "#EAF2FF",
  },
  {
    accent: "#0F9D8A",
    accentDark: "#08786B",
    light: "#E5F7F3",
  },
  {
    accent: "#B85C87",
    accentDark: "#944668",
    light: "#F8EAF1",
  },
  {
    accent: "#C58A32",
    accentDark: "#9C6A1F",
    light: "#FBF2DE",
  },
];

function AssignedJobs() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const getErrorMessage = (err, fallback) => {
    const detail = err.response?.data?.detail;

    if (Array.isArray(detail)) {
      return detail
        .map((item) => {
          if (typeof item === "string") {
            return item;
          }

          return item?.msg || JSON.stringify(item);
        })
        .filter(Boolean)
        .join(" ");
    }

    return typeof detail === "string"
      ? detail
      : fallback;
  };

  const handleUnauthorized = (err) => {
    if (
      err.response?.status === 401 ||
      err.response?.status === 403
    ) {
      logout();

      navigate("/login", {
        replace: true,
      });

      return true;
    }

    return false;
  };

  const loadJobs = async (showRefresh = false) => {
    try {
      setError("");

      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const response = await api.get(
        "/question-sets/assigned-jobs"
      );

      setJobs(
        Array.isArray(response.data)
          ? response.data
          : []
      );
    } catch (err) {
      console.error(
        "Failed to load assigned jobs:",
        err
      );

      if (handleUnauthorized(err)) {
        return;
      }

      setError(
        getErrorMessage(
          err,
          "Unable to load the jobs assigned to you."
        )
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, []);

  const filteredJobs = useMemo(() => {
    const query = search
      .trim()
      .toLowerCase();

    if (!query) {
      return jobs;
    }

    return jobs.filter((job) => {
      const haystack = [
        job?.title,
        job?.description,
        ...(Array.isArray(job?.skills)
          ? job.skills.map(
              (skill) => skill?.name
            )
          : []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [jobs, search]);

  if (loading) {
    return (
      <RecruiterLayout
        title="Assigned Jobs"
        breadcrumb="Assessment Manager / Assigned Jobs"
      >
        <main className="mx-auto max-w-[1400px] pb-12 text-[#202938]">

          <section className="group relative overflow-hidden rounded-[20px] border border-[#D8DAF0] bg-gradient-to-br from-[#F5F1FF] via-[#F8F9FF] to-[#EEF5FF] p-6 shadow-[0_10px_30px_rgba(86,88,232,0.045)] sm:p-8">

            <div className="pointer-events-none absolute right-7 top-4 hidden text-[#7B73D8]/25 sm:block">

              <div className="relative flex h-24 w-24 items-center justify-center transition duration-500 group-hover:rotate-3 group-hover:scale-105">

                <span className="absolute left-1 top-8 h-1.5 w-1.5 rounded-full bg-[#3B82F6]/50" />

                <span className="absolute right-0 top-2 h-1.5 w-1.5 animate-pulse rounded-full bg-[#5658E8]/55" />

                <BriefcaseBusiness
                  size={46}
                  strokeWidth={1.05}
                />

              </div>

            </div>

            <div className="relative max-w-3xl">

              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#D3D6E9] bg-white/80 px-3 py-1.5 shadow-sm">

                <span className="h-1.5 w-1.5 rounded-full bg-[#5658E8]" />

                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#667085]">
                  Assessment preparation
                </span>

              </div>

              <div className="h-10 w-56 animate-pulse rounded-xl bg-[#E5E7F6]" />

              <div className="mt-4 h-4 w-[70%] animate-pulse rounded bg-[#E7EAF3]" />

              <div className="mt-2 h-4 w-[55%] animate-pulse rounded bg-[#EDF0F6]" />

            </div>

          </section>

        </main>
      </RecruiterLayout>
    );
  }

  return (
    <RecruiterLayout
      title="Assigned Jobs"
      breadcrumb="Assessment Manager / Assigned Jobs"
    >
      <main className="mx-auto max-w-[1400px] space-y-7 pb-12 text-[#202938]">

        {/* =====================================================
            HERO
        ===================================================== */}

        <section className="group relative overflow-hidden rounded-[20px] border border-[#D8DAF0] bg-gradient-to-br from-[#F5F1FF] via-[#F8F9FF] to-[#EEF5FF] px-5 py-6 shadow-[0_10px_30px_rgba(86,88,232,0.045)] sm:px-7 sm:py-7 lg:px-9 lg:py-8">

          <div className="pointer-events-none absolute right-7 top-4 hidden text-[#7B73D8]/30 sm:block">

            <div className="relative flex h-24 w-24 items-center justify-center transition duration-500 group-hover:rotate-3 group-hover:scale-105">

              <span className="absolute left-1 top-8 h-1.5 w-1.5 rounded-full bg-[#3B82F6]/50" />

              <span className="absolute right-0 top-2 h-1.5 w-1.5 animate-pulse rounded-full bg-[#5658E8]/55" />

              <span className="absolute bottom-5 right-1 h-px w-8 rotate-[-20deg] bg-current opacity-45" />

              <BriefcaseBusiness
                size={46}
                strokeWidth={1.05}
              />

            </div>

          </div>

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">

            <div className="max-w-3xl">

              <div className="flex flex-wrap items-center gap-2">

                <span className="inline-flex items-center gap-2 rounded-full border border-[#D3D6E9] bg-white/80 px-3 py-1.5 shadow-sm">

                  <span className="h-1.5 w-1.5 rounded-full bg-[#5658E8]" />

                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#667085]">
                    Assessment preparation
                  </span>

                </span>

                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#CFE4D9] bg-white/80 px-3 py-1.5 text-[10px] font-semibold text-[#28734E] shadow-sm">

                  <ShieldCheck size={12} />

                  HR-shared jobs

                </span>

              </div>

              <h1 className="mt-4 text-[30px] font-semibold tracking-[-0.035em] text-[#182033] sm:text-[38px]">
                Assigned Jobs
              </h1>

              <p className="mt-2 text-sm leading-6 text-[#667085] sm:text-[15px]">
                Review the published job description and confirmed skill
                scope before configuring the assessment blueprint.
              </p>

            </div>

            <div className="relative z-10 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">

              <div className="group/search flex h-10 min-w-0 items-center gap-2 rounded-lg border border-[#C9D0DC] bg-white px-3.5 shadow-sm transition duration-200 focus-within:border-[#5658E8] focus-within:ring-4 focus-within:ring-[#5658E8]/10 sm:min-w-[250px]">

                <Search
                  size={15}
                  className="text-[#98A2B3] transition-colors duration-200 group-focus-within/search:text-[#5658E8]"
                />

                <input
                  value={search}
                  onChange={(event) =>
                    setSearch(
                      event.target.value
                    )
                  }
                  placeholder="Search assigned jobs..."
                  className="w-full bg-transparent text-xs text-[#344054] outline-none placeholder:text-[#98A2B3]"
                />

              </div>

              <button
                type="button"
                onClick={() =>
                  loadJobs(true)
                }
                disabled={refreshing}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#C9D0DC] bg-white px-4 text-xs font-semibold text-[#475467] shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-[#5658E8] hover:text-[#5658E8] disabled:cursor-not-allowed disabled:opacity-60"
              >

                <RefreshCw
                  size={14}
                  className={
                    refreshing
                      ? "animate-spin"
                      : ""
                  }
                />

                {refreshing
                  ? "Refreshing..."
                  : "Refresh"}

              </button>

            </div>

          </div>

        </section>

        {/* =====================================================
            ERROR
        ===================================================== */}

        {error && (

          <div className="rounded-[18px] border border-[#E9C8C8] bg-[#FBF2F2] px-4 py-3 text-sm text-[#A83E3E]">

            {error}

          </div>

        )}

        {/* =====================================================
            WORKSPACE HEADING
        ===================================================== */}

        <section>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">

            <div>

              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#5658E8]">
                Manager workspace
              </p>

              <h2 className="mt-2 text-[23px] font-semibold tracking-[-0.025em] text-[#1B2430]">
                Jobs Shared by HR
              </h2>

              <p className="mt-1 text-sm leading-6 text-[#667085]">
                Open a shared job, inspect its confirmed skill scope,
                and continue into assessment preparation.
              </p>

            </div>

            {jobs.length > 0 && (

              <div className="inline-flex items-center gap-2 self-start rounded-full bg-[#EEF0FF] px-3 py-2 text-[9px] font-bold uppercase tracking-[0.12em] text-[#5658E8] sm:self-auto">

                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#5658E8]" />

                {filteredJobs.length} shown

              </div>
            )}

          </div>

        </section>

        {/* =====================================================
            EMPTY STATE
        ===================================================== */}

        {filteredJobs.length === 0 ? (

          <section className="group relative overflow-hidden rounded-[20px] border border-dashed border-[#D4D9E2] bg-white px-6 py-16 text-center shadow-[0_8px_24px_rgba(27,37,58,0.025)]">

            <div className="pointer-events-none absolute right-8 top-5 text-[#7A61D8]/25 transition duration-500 group-hover:rotate-3 group-hover:scale-105">

              <div className="relative flex h-20 w-20 items-center justify-center">

                <span className="absolute left-0 top-4 h-1.5 w-1.5 rounded-full bg-current" />

                <span className="absolute right-0 top-1 h-1.5 w-1.5 animate-pulse rounded-full bg-current" />

                <BriefcaseBusiness
                  size={34}
                  strokeWidth={1.05}
                />

              </div>

            </div>

            <div className="relative">

              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F0EBFB] text-[#7862C8] transition duration-300 group-hover:-rotate-3 group-hover:scale-105">

                <BriefcaseBusiness size={23} />

              </div>

              <h2 className="mt-5 text-lg font-semibold text-[#202938]">
                {jobs.length === 0
                  ? "No assigned jobs yet"
                  : "No matching jobs"}
              </h2>

              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#667085]">
                {jobs.length === 0
                  ? "Jobs will appear here after HR shares them with the Assessment Manager."
                  : "Try a different job title, skill, or keyword."}
              </p>

              {jobs.length === 0 ? (

                <span className="mt-5 inline-flex items-center gap-2 rounded-lg border border-[#DCD8EE] bg-[#FAF9FF] px-3.5 py-2 text-[10px] font-bold text-[#6250A8]">

                  <ShieldCheck size={12} />

                  Waiting for HR assignment

                </span>

              ) : (

                <button
                  type="button"
                  onClick={() =>
                    setSearch("")
                  }
                  className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#5658E8] px-4 py-2.5 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(86,88,232,0.14)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#4648C9]"
                >

                  Clear search

                  <ArrowRight size={13} />

                </button>
              )}

            </div>

          </section>

        ) : (

          /* ===================================================
             JOB LIST
          =================================================== */

          <section className="space-y-4">

            {filteredJobs.map(
              (job, index) => {

                const skills = Array.isArray(
                  job?.skills
                )
                  ? job.skills
                  : [];

                const reviewStatus =
                  String(
                    job?.skill_review_status ||
                      "pending"
                  ).toLowerCase();

                const confirmed =
                  reviewStatus ===
                  "confirmed";

                const palette =
                  JOB_PALETTE[
                    index %
                      JOB_PALETTE.length
                  ];

                const DoodleIcon =
                  index % 3 === 0
                    ? BriefcaseBusiness
                    : index % 3 === 1
                      ? Sparkles
                      : FileText;

                return (
                  <article
                    key={job.id}
                    className="group relative overflow-hidden rounded-[20px] border border-[#E3E6EB] bg-white shadow-[0_8px_24px_rgba(27,37,58,0.035)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#D5D9E3] hover:shadow-[0_16px_34px_rgba(27,37,58,0.07)]"
                  >

                    {/* soft color wash */}

                    <div
                      className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-45 blur-2xl transition duration-500 group-hover:scale-125"
                      style={{
                        backgroundColor:
                          palette.light,
                      }}
                    />

                    {/* doodle */}

                    <div
                      className="pointer-events-none absolute right-3 top-2 transition-all duration-500 group-hover:rotate-3 group-hover:scale-105"
                      style={{
                        color:
                          palette.accent,
                        opacity: 0.25,
                      }}
                    >

                      <div className="relative flex h-20 w-20 items-center justify-center">

                        <span className="absolute left-0 top-4 h-1.5 w-1.5 rounded-full bg-current" />

                        <span className="absolute right-0 top-1 h-1.5 w-1.5 animate-pulse rounded-full bg-current" />

                        <span className="absolute bottom-1 right-0 h-px w-7 rotate-[-18deg] bg-current opacity-55" />

                        <DoodleIcon
                          size={36}
                          strokeWidth={1.05}
                        />

                      </div>

                    </div>

                    <div className="relative z-10 p-5 sm:p-6 lg:p-7">

                      <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">

                        {/* =====================================
                            JOB DETAILS
                        ===================================== */}

                        <div className="flex min-w-0 flex-1 items-start gap-4">

                          <div
                            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition duration-300 group-hover:scale-105 group-hover:-rotate-3"
                            style={{
                              backgroundColor:
                                palette.light,
                              color:
                                palette.accentDark,
                            }}
                          >

                            <BriefcaseBusiness
                              size={21}
                            />

                          </div>

                          <div className="min-w-0 flex-1">

                            <div className="flex flex-wrap items-center gap-2">

                              <span
                                className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em]"
                                style={{
                                  backgroundColor:
                                    palette.light,
                                  color:
                                    palette.accentDark,
                                }}
                              >
                                Job #{job.id}
                              </span>

                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                                  confirmed
                                    ? "border-[#CFE4D9] bg-[#F5FAF7] text-[#28734E]"
                                    : "border-[#E7DEBF] bg-[#FCFAF1] text-[#896C1A]"
                                }`}
                              >

                                {confirmed ? (
                                  <CheckCircle2
                                    size={11}
                                  />
                                ) : (
                                  <Sparkles
                                    size={11}
                                  />
                                )}

                                {confirmed
                                  ? "HR skills confirmed"
                                  : "Skills need review"}

                              </span>

                            </div>

                            <h2 className="mt-2 truncate text-xl font-semibold tracking-[-0.02em] text-[#202938] transition-colors duration-200 group-hover:text-[#5658E8] sm:text-[22px]">
                              {job.title ||
                                "Untitled Job"}
                            </h2>

                            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[#98A2B3]">

                              <span className="inline-flex items-center gap-1.5">
                                <CalendarDays size={13} />
                                Shared job
                              </span>

                              <span className="inline-flex items-center gap-1.5">
                                <FileText size={13} />
                                Published JD available
                              </span>

                            </div>

                          </div>

                        </div>

                        {/* =====================================
                            SKILL SCOPE
                        ===================================== */}

                        <div className="flex w-full flex-col gap-3 xl:w-[430px] xl:min-w-[430px]">

                          <div>

                            <div className="mb-2 flex items-center justify-between">

                              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8A94A8]">
                                Skill scope
                              </span>

                              <span className="text-xs font-semibold text-[#667085]">
                                {skills.length}{" "}
                                {skills.length === 1
                                  ? "skill"
                                  : "skills"}
                              </span>

                            </div>

                            <div className="flex min-h-[52px] flex-wrap content-start gap-1.5">

                              {skills.length > 0 ? (

                                skills
                                  .slice(
                                    0,
                                    6
                                  )
                                  .map(
                                    (
                                      skill
                                    ) => (

                                      <span
                                        key={
                                          skill.id ||
                                          skill.name
                                        }
                                        className="rounded-full border border-[#DDD6F3] bg-[#FBFAFF] px-2.5 py-1 text-[11px] font-semibold text-[#5E4DA3] transition duration-200 hover:-translate-y-0.5"
                                      >
                                        {skill.name}
                                      </span>

                                    )
                                  )

                              ) : (

                                <span className="text-xs text-[#98A2B3]">
                                  Skill details will load on review.
                                </span>

                              )}

                              {skills.length > 6 && (

                                <span className="rounded-full border border-[#E3E6EB] bg-[#FAFBFC] px-2.5 py-1 text-[11px] font-semibold text-[#667085]">
                                  +
                                  {skills.length -
                                    6}{" "}
                                  more
                                </span>

                              )}

                            </div>

                          </div>

                          {/* FIX:
                              Full-width button gives every card
                              the exact same right-side alignment.
                          */}

                          <button
                            type="button"
                            onClick={() =>
                              navigate(
                                `/manager/jobs/${job.id}/review`,
                                {
                                  state: {
                                    job,
                                  },
                                }
                              )
                            }
                            className="group/button inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#5658E8] px-4 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(86,88,232,0.14)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#4648C9] hover:shadow-[0_12px_24px_rgba(86,88,232,0.19)]"
                          >

                            Review JD & Skills

                            <ArrowRight
                              size={14}
                              className="transition-transform duration-200 group-hover/button:translate-x-1"
                            />

                          </button>

                        </div>

                      </div>

                    </div>

                  </article>
                );
              }
            )}

          </section>
        )}

      </main>
    </RecruiterLayout>
  );
}

export default AssignedJobs;