import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  Archive,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileQuestion,
  FileText,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import RecruiterLayout from "../layouts/RecruiterLayout";

const CURRENT_YEAR =
  new Date().getFullYear();

const JOB_BANK_PALETTE = [
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
];

/* ============================================================
   JD SECTION NAMES
============================================================ */

const JD_HEADING_PATTERNS = [
  "job description",
  "role overview",
  "key responsibilities",
  "responsibilities",
  "required skills",
  "technical skills",
  "skills",
  "preferred qualifications",
  "qualifications",
  "experience expectations",
  "experience",
  "education",
  "what you will do",
  "what you'll do",
];

/* ============================================================
   MAIN PAGE
============================================================ */

const REVIEWER_CARD_PALETTES = [
  {
    accent: "#4A61C8",
    accentDark: "#3B54AC",
    light: "#EAF2FF",
  },
  {
    accent: "#7862C8",
    accentDark: "#6250A8",
    light: "#F0EBFB",
  },
  {
    accent: "#0F9D8A",
    accentDark: "#08786B",
    light: "#E5F7F3",
  },
];

function QuestionBanks() {
  const navigate = useNavigate();
  const { logout, auth } = useAuth();

  const [banks, setBanks] =
    useState([]);

  const [assignedJobs, setAssignedJobs] =
    useState([]);

  const [loadingBanks, setLoadingBanks] =
    useState(true);

  const [loadingJobs, setLoadingJobs] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [creatingJobId, setCreatingJobId] =
    useState(null);

  const [search, setSearch] =
    useState("");

  const [yearFilter, setYearFilter] =
    useState("all");

  const [statusFilter, setStatusFilter] =
    useState("all");

  const [bankError, setBankError] =
    useState("");

  const [jobError, setJobError] =
    useState("");

  const isAssessmentManager =
    auth?.role ===
    "assessment_manager";

  const handleUnauthorized = (err) => {
    if (
      err?.response?.status === 401
    ) {
      logout();

      navigate("/login", {
        replace: true,
      });

      return true;
    }

    return false;
  };

  const getErrorMessage = (
    err,
    fallback
  ) => {
    const detail =
      err?.response?.data?.detail;

    if (Array.isArray(detail)) {
      return detail
        .map((item) => {
          if (typeof item === "string") {
            return item;
          }

          return (
            item?.msg ||
            JSON.stringify(item)
          );
        })
        .filter(Boolean)
        .join(" ");
    }

    if (typeof detail === "string") {
      return detail;
    }

    if (
      err?.code === "ERR_NETWORK"
    ) {
      return "Unable to reach the backend server.";
    }

    return fallback;
  };

  /* ==========================================================
     LOAD QUESTION BANKS
  ========================================================== */

  const loadQuestionBanks =
    async () => {
      try {
        setLoadingBanks(true);
        setBankError("");

        const response =
          await api.get(
            "/question-banks",
            {
              params: isAssessmentManager && yearFilter !== "all"
                ? { hiring_year: Number(yearFilter) }
                : {},
              timeout: 10000,
            }
          );

        setBanks(
          Array.isArray(
            response.data
          )
            ? response.data
            : []
        );
      } catch (err) {
        console.error(
          "QUESTION BANKS: load failed",
          err
        );

        if (
          handleUnauthorized(err)
        ) {
          return;
        }

        setBankError(
          getErrorMessage(
            err,
            "Unable to load annual question banks."
          )
        );
      } finally {
        setLoadingBanks(false);
      }
    };

  /* ==========================================================
     LOAD ASSIGNED JOBS
  ========================================================== */

  const loadAssignedJobs =
    async () => {
      if (!isAssessmentManager) {
        setAssignedJobs([]);
        setLoadingJobs(false);
        return;
      }

      try {
        setLoadingJobs(true);
        setJobError("");

        const response =
          await api.get(
            "/question-sets/assigned-jobs",
            {
              timeout: 10000,
            }
          );

        setAssignedJobs(
          Array.isArray(
            response.data
          )
            ? response.data
            : []
        );
      } catch (err) {
        console.error(
          "QUESTION BANKS: assigned jobs load failed",
          err
        );

        if (
          handleUnauthorized(err)
        ) {
          return;
        }

        setJobError(
          getErrorMessage(
            err,
            "Unable to load jobs shared by HR."
          )
        );
      } finally {
        setLoadingJobs(false);
      }
    };

  /* ==========================================================
     LOAD EVERYTHING
  ========================================================== */

  const loadAll = async (
    showRefreshState = false
  ) => {
    if (showRefreshState) {
      setRefreshing(true);
    }

    await Promise.allSettled([
      loadQuestionBanks(),
      loadAssignedJobs(),
    ]);

    setRefreshing(false);
  };

  useEffect(() => {
    loadAll();
  }, [
    yearFilter,
    isAssessmentManager,
  ]);

  /* ==========================================================
     AVAILABLE YEARS
  ========================================================== */

  const availableYears =
    useMemo(() => {
      return [
        ...new Set(
          banks
            .map((bank) =>
              Number(
                bank.hiring_year
              )
            )
            .filter((year) =>
              Number.isInteger(year)
            )
        ),
      ].sort(
        (a, b) => b - a
      );
    }, [banks]);

  /* ==========================================================
     FILTERED BANKS
  ========================================================== */

  const filteredBanks =
    useMemo(() => {
      const query =
        search.trim().toLowerCase();

      return banks.filter(
        (bank) => {
          const matchesSearch =
            !query ||
            String(
              bank.name || ""
            )
              .toLowerCase()
              .includes(query) ||
            String(
              bank.job_id || ""
            )
              .toLowerCase()
              .includes(query) ||
            String(
              bank.hiring_year || ""
            ).includes(query);

          const matchesStatus =
            statusFilter === "all" ||
            String(bank.status || "active").toLowerCase() ===
              statusFilter.toLowerCase();

          const matchesYear =
            yearFilter === "all" ||
            Number(bank.hiring_year) === Number(yearFilter);

          return matchesSearch && matchesStatus && matchesYear;
        }
      );
    }, [
      banks,
      search,
      statusFilter,
      yearFilter,
    ]);

  /* ==========================================================
     ASSIGNED JOB CARDS
  ========================================================== */

  const assignedJobCards =
    useMemo(() => {
      const targetYear =
        yearFilter === "all"
          ? CURRENT_YEAR
          : Number(yearFilter);

      return assignedJobs.map(
        (job) => {
          const questionBank =
            banks.find(
              (bank) =>
                Number(
                  bank.job_id
                ) ===
                  Number(
                    job.id
                  ) &&
                Number(
                  bank.hiring_year
                ) ===
                  Number(
                    targetYear
                  )
            ) || null;

          return {
            ...job,
            hiring_year:
              targetYear,
            question_bank:
              questionBank,
          };
        }
      );
    }, [
      assignedJobs,
      banks,
      yearFilter,
    ]);

  /* ==========================================================
     COUNTS
  ========================================================== */

  const activeCount =
    banks.filter(
      (bank) =>
        String(
          bank.status ||
            "active"
        ).toLowerCase() ===
        "active"
    ).length;

  /* ==========================================================
     HELPERS
  ========================================================== */

  const formatDate = (
    value
  ) => {
    if (!value) {
      return "â€”";
    }

    const date = new Date(
      value
    );

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return "â€”";
    }

    return date.toLocaleDateString(
      undefined,
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }
    );
  };

  const clearFilters = () => {
    setSearch("");
    setYearFilter("all");
    setStatusFilter("all");
  };

  const getStatusConfig = (
    status
  ) => {
    const normalized =
      String(
        status || "active"
      ).toLowerCase();

    if (
      normalized ===
      "archived"
    ) {
      return {
        label: "Archived",
        icon: XCircle,
        className:
          "border-[#E6D4D4] bg-[#FCF5F5] text-[#A83E3E]",
      };
    }

    if (
      normalized ===
      "inactive"
    ) {
      return {
        label: "Inactive",
        icon: Clock3,
        className:
          "border-[#E7DEBF] bg-[#FCFAF1] text-[#896C1A]",
      };
    }

    return {
      label: "Active",
      icon: CheckCircle2,
      className:
        "border-[#CFE4D9] bg-[#F5FAF7] text-[#28734E]",
    };
  };

  /* ==========================================================
     CREATE QUESTION SET
  ========================================================== */

  const createQuestionSet =
    async (job) => {
      if (!job?.id) {
        return;
      }

      try {
        setCreatingJobId(
          job.id
        );

        setJobError("");

        const hiringYear =
          yearFilter ===
          "all"
            ? CURRENT_YEAR
            : Number(
                yearFilter
              );

        const response =
          await api.post(
            "/question-sets",
            {
              job_id: Number(
                job.id
              ),
              hiring_year:
                hiringYear,
              hiring_cycle:
                `${job.title} - ${hiringYear}`,
              name:
                `${job.title} - ${hiringYear} Assessment`,
              description:
                `Assessment blueprint for ${job.title}.`,
              variant_count: 2,
            },
            {
              timeout: 15000,
            }
          );

        await loadAll(true);

        if (
          response.data?.id
        ) {
          navigate(
            `/question-sets/${response.data.id}`
          );
        }
      } catch (err) {
        console.error(
          "QUESTION BANKS: create question set failed",
          err
        );

        if (
          handleUnauthorized(err)
        ) {
          return;
        }

        setJobError(
          getErrorMessage(
            err,
            "Unable to create the assessment blueprint."
          )
        );
      } finally {
        setCreatingJobId(
          null
        );
      }
    };

  /* ==========================================================
     OPEN QUESTION BANK
  ========================================================== */

  const openBank = async (
    bank
  ) => {
    if (
      !isAssessmentManager
    ) {
      setBankError(
        "HR and Assessment Reviewer have read-only access to Question Banks."
      );

      return;
    }

    if (!bank?.job_id) {
      setBankError(
        "This question bank is missing its job reference."
      );

      return;
    }

    try {
      setBankError("");

      const response =
        await api.get(
          "/question-sets",
          {
            params: {
              job_id: Number(
                bank.job_id
              ),
              hiring_year:
                Number(
                  bank.hiring_year
                ),
            },
            timeout: 10000,
          }
        );

      const questionSets =
        Array.isArray(
          response.data
        )
          ? response.data
          : [];

      const questionSet =
        questionSets[0];

      if (
        !questionSet?.id
      ) {
        setBankError(
          "No assessment blueprint exists for this annual Question Bank yet."
        );

        return;
      }

      navigate(
        `/question-sets/${questionSet.id}`
      );
    } catch (err) {
      console.error(
        "QUESTION BANKS: open failed",
        err
      );

      if (
        handleUnauthorized(err)
      ) {
        return;
      }

      setBankError(
        getErrorMessage(
          err,
          "Unable to open the assessment workspace."
        )
      );
    }
  };

  const visibleAssignedJobCards = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return assignedJobCards;

    return assignedJobCards.filter((job) =>
      [job.title, job.id, job.description].some((value) =>
        String(value ?? "").toLowerCase().includes(query)
      )
    );
  }, [assignedJobCards, search]);

  return (
    <RecruiterLayout
      title="Assessment Sets"
      breadcrumb="Workspace / Question Banks"
    >
      <main className="mx-auto max-w-[1500px] space-y-7 pb-14 text-[#202938]">

        {/* =====================================================
            HERO
        ===================================================== */}

        <section className="group relative overflow-hidden rounded-[20px] border border-[#D8DAF0] bg-gradient-to-br from-[#F5F1FF] via-[#F8F9FF] to-[#EEF5FF] px-5 py-6 shadow-[0_10px_30px_rgba(86,88,232,0.045)] sm:px-7 sm:py-7 lg:px-9 lg:py-8">

          <div className="pointer-events-none absolute right-7 top-4 hidden text-[#7B73D8]/30 sm:block">

            <div className="relative flex h-24 w-24 items-center justify-center transition duration-500 group-hover:rotate-3 group-hover:scale-105">

              <span className="absolute left-1 top-8 h-1.5 w-1.5 rounded-full bg-[#3B82F6]/50" />

              <span className="absolute right-0 top-2 h-1.5 w-1.5 animate-pulse rounded-full bg-[#5658E8]/55" />

              <span className="absolute bottom-5 right-1 h-px w-8 rotate-[-20deg] bg-current opacity-45" />

              <FileQuestion
                size={46}
                strokeWidth={1.05}
              />

            </div>

          </div>

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">

            <div>

              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#D3D6E9] bg-white/80 px-3 py-1.5 shadow-sm">

                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#5658E8]" />

                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#667085]">
                  Assessment preparation
                </span>

              </div>

              <h1 className="text-[30px] font-semibold tracking-[-0.035em] text-[#182033] sm:text-[38px]">
                Assessment Sets
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#667085]">
                Prepare assessment sets from the available question content and move them through the reviewer approval workflow.
              </p>

              <div className="mt-5 flex flex-wrap gap-2.5">

                <InfoChip
                  icon={
                    <CalendarDays size={12} />
                  }
                  label="Annual hiring cycles"
                  background="#FFFFFF"
                  color="#4A61C8"
                />

                <InfoChip
                  icon={
                    <Archive size={12} />
                  }
                  label="Year-specific libraries"
                  background="#FFFFFF"
                  color="#7862C8"
                />

              </div>

            </div>

            <button
              type="button"
              onClick={() =>
                loadAll(true)
              }
              disabled={refreshing}
              className="relative inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#C9D0DC] bg-white px-4 text-sm font-semibold text-[#475467] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#5658E8] hover:text-[#5658E8] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >

              <RefreshCw
                size={15}
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

        </section>

        {/* =====================================================
            ERRORS
        ===================================================== */}

        {(bankError ||
          jobError) && (

          <section className="space-y-2">

            {bankError && (
              <div className="rounded-[16px] border border-[#E9C8C8] bg-[#FBF2F2] px-4 py-3 text-sm text-[#A83E3E]">
                {bankError}
              </div>
            )}

            {jobError && (
              <div className="rounded-[16px] border border-[#E9C8C8] bg-[#FBF2F2] px-4 py-3 text-sm text-[#A83E3E]">
                {jobError}
              </div>
            )}

          </section>
        )}

                {isAssessmentManager && (
          <section className="rounded-2xl border border-[#E3E6EB] bg-white p-4 shadow-sm">
            <label className="flex items-center gap-3">
              <Search size={18} className="shrink-0 text-[#667085]" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search shared jobs by title, ID, or description..."
                aria-label="Search shared assessment jobs"
                className="h-10 min-w-0 flex-1 bg-transparent text-sm text-[#344054] outline-none placeholder:text-[#98A2B3]"
              />
              {search.trim() && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="shrink-0 text-xs font-semibold text-[#5658E8] hover:underline"
                >
                  Clear
                </button>
              )}
            </label>
          </section>
        )}

        {/* AVAILABLE QUESTION BANKS - REVIEWER VIEW */}
        {!isAssessmentManager && (
          <section className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#5658E8]">
                  Reviewer workspace
                </p>
                <h2 className="mt-2 text-[23px] font-semibold tracking-[-0.025em] text-[#1B2430]">
                  Available Question Banks
                </h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-[#667085]">
                  Browse the available hiring-cycle libraries in read-only mode. Open Assessment Review to approve or reject submitted assessment sets.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate("/review")}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#5658E8] px-4 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#4648C9]"
              >
                Open Assessment Review
                <ArrowRight size={14} />
              </button>
            </div>

            <div className="rounded-2xl border border-[#E3E6EB] bg-white p-4 shadow-sm">
              <label className="flex items-center gap-3">
                <Search size={18} className="shrink-0 text-[#667085]" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search question banks by name, job ID, or year..."
                  aria-label="Search available question banks"
                  className="h-10 min-w-0 flex-1 bg-transparent text-sm text-[#344054] outline-none placeholder:text-[#98A2B3]"
                />
                {search.trim() && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="shrink-0 text-xs font-semibold text-[#5658E8] hover:underline"
                  >
                    Clear
                  </button>
                )}
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <label className="flex flex-col gap-1.5 rounded-xl border border-[#E3E6EB] bg-white p-3">
                <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#8A94A8]">
                  Hiring Year
                </span>
                <select
                  value={yearFilter}
                  onChange={(event) => setYearFilter(event.target.value)}
                  aria-label="Filter question banks by hiring year"
                  className="h-9 w-full rounded-lg border border-[#D9DEE7] bg-white px-2.5 text-sm text-[#344054] outline-none focus:border-[#5658E8] focus:ring-2 focus:ring-[#5658E8]/10"
                >
                  <option value="all">All years</option>
                  {availableYears.map((year) => (
                    <option key={year} value={String(year)}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5 rounded-xl border border-[#E3E6EB] bg-white p-3">
                <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#8A94A8]">
                  Status
                </span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  aria-label="Filter question banks by status"
                  className="h-9 w-full rounded-lg border border-[#D9DEE7] bg-white px-2.5 text-sm text-[#344054] outline-none focus:border-[#5658E8] focus:ring-2 focus:ring-[#5658E8]/10"
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="archived">Archived</option>
                </select>
              </label>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={clearFilters}
                  disabled={
                    !search.trim() &&
                    yearFilter === "all" &&
                    statusFilter === "all"
                  }
                  className="h-10 w-full rounded-lg border border-[#D9DEE7] bg-white px-4 text-xs font-semibold text-[#475467] transition hover:border-[#5658E8] hover:text-[#5658E8] disabled:cursor-not-allowed disabled:opacity-40 lg:w-auto"
                >
                  Clear filters
                </button>
              </div>
            </div>

            {loadingBanks ? (
              <div className="rounded-[20px] border border-[#E3E6EB] bg-white p-10 text-center">
                <RefreshCw size={21} className="mx-auto animate-spin text-[#5658E8]" />
                <p className="mt-3 text-sm font-semibold text-[#344054]">
                  Loading available question banks...
                </p>
              </div>
            ) : filteredBanks.length === 0 ? (
              <div className="rounded-[20px] border border-dashed border-[#CBD2DD] bg-white px-6 py-12 text-center shadow-sm">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F0EBFB] text-[#7862C8]">
                  <Archive size={24} />
                </div>
                <h3 className="mt-4 text-base font-semibold text-[#202938]">
                  {search.trim()
                    ? "No matching question banks"
                    : "No question banks available yet"}
                </h3>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#667085]">
                  {search.trim()
                    ? "Try a different name, job ID, or hiring year."
                    : "There are no question banks in the list returned by the server. Submitted assessment sets can be checked in the review queue."}
                </p>
                <button
                  type="button"
                  onClick={() => navigate("/review")}
                  className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#D8DDF0] bg-[#F8F7FF] px-4 text-xs font-semibold text-[#6250A8] transition hover:bg-[#F0EDFF]"
                >
                  Go to Assessment Review
                  <ArrowRight size={14} />
                </button>
              </div>
            ) : (
              <>
                <p className="text-xs font-medium text-[#667085]">
                  Showing {filteredBanks.length} question bank{filteredBanks.length === 1 ? "" : "s"}
                </p>
                <div className="grid gap-4 xl:grid-cols-2">
                  {filteredBanks.map((bank, index) => {
                    const status = getStatusConfig(bank.status);
                    return (
                      <QuestionBankCard
                        key={bank.id}
                        bank={bank}
                        index={index}
                        palette={REVIEWER_CARD_PALETTES[index % REVIEWER_CARD_PALETTES.length]}
                        status={status}
                        StatusIcon={status.icon}
                        formatDate={formatDate}
                        isAssessmentManager={false}
                        isAssessmentReviewer={true}
                        onOpen={() =>
                          navigate(
                            `/review/jobs/${Number(bank.job_id)}/sets?hiring_year=${Number(bank.hiring_year)}`
                          )
                        }
                      />
                    );
                  })}
                </div>
              </>
            )}
          </section>
        )}

        {/* =====================================================
            MANAGER JOBS
        ===================================================== */}

        {isAssessmentManager && (

          <section>

            <div className="mb-5">

              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#5658E8]">
                Assessment Manager workspace
              </p>

              <h2 className="mt-2 text-[23px] font-semibold tracking-[-0.025em] text-[#1B2430]">
                Jobs Shared by HR
              </h2>

              <p className="mt-1 text-sm leading-6 text-[#667085]">
                Review the job and HR-confirmed skills before creating the assessment workspace.
              </p>

            </div>

            {loadingJobs ? (

              <div className="rounded-[20px] border border-[#E3E6EB] bg-white p-9 text-center">

                <RefreshCw
                  size={20}
                  className="mx-auto animate-spin text-[#5658E8]"
                />

                <p className="mt-3 text-sm font-semibold text-[#344054]">
                  Loading jobs shared by HR
                </p>

              </div>

            ) : visibleAssignedJobCards.length === 0 ? (

              <div className="rounded-[20px] border border-dashed border-[#CBD2DD] bg-[#FAFBFC] p-10 text-center">

                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F0EBFB] text-[#7A61D8]">

                  <BriefcaseBusiness
                    size={22}
                  />

                </div>

                <p className="mt-4 text-sm font-semibold text-[#344054]">
                  {search.trim() ? "No matching jobs found" : "No jobs shared yet"}
                </p>

                <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#667085]">
                  {search.trim() ? "Try a different search term." : "Jobs will appear here after HR confirms the skill scope and shares the role with you."}
                </p>

              </div>

            ) : (

              <div className="grid gap-4 lg:grid-cols-2">

                {visibleAssignedJobCards.map(
                  (
                    job,
                    index
                  ) => {

                    const hasBank =
                      Boolean(
                        job.question_bank
                      );

                    const creating =
                      creatingJobId ===
                      job.id;

                    return (
                      <AssignedJobCard
                        key={job.id}
                        job={job}
                        index={index}
                        hasBank={hasBank}
                        creating={creating}
                        onCreate={() =>
                          createQuestionSet(
                            job
                          )
                        }
                        onOpen={() =>
                          openBank(
                            job.question_bank
                          )
                        }
                      />
                    );
                  }
                )}

              </div>
            )}

          </section>
        )}



        </main>
    </RecruiterLayout>
  );
}

/* ============================================================
   QUESTION BANK CARD
============================================================ */

function QuestionBankCard({
  bank,
  index,
  palette,
  status,
  StatusIcon,
  formatDate,
  isAssessmentManager,
  isAssessmentReviewer = false,
  onOpen,
}) {
  return (
    <article className="group relative overflow-hidden rounded-[20px] border border-[#E3E6EB] bg-white shadow-[0_8px_24px_rgba(27,37,58,0.035)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#D5D9E3] hover:shadow-[0_15px_34px_rgba(27,37,58,0.07)]">

      {/* DOODLE */}

      <div
        className="pointer-events-none absolute right-3 top-3 transition-all duration-500 group-hover:rotate-3 group-hover:scale-105"
        style={{
          color: palette.accent,
          opacity: 0.28,
        }}
      >

        <div className="relative flex h-20 w-20 items-center justify-center">

          <span className="absolute left-0 top-4 h-1.5 w-1.5 rounded-full bg-current opacity-80" />

          <span className="absolute right-0 top-1 h-1.5 w-1.5 animate-pulse rounded-full bg-current opacity-70" />

          <span className="absolute bottom-1 right-0 h-px w-7 rotate-[-18deg] bg-current opacity-60" />

          <span className="absolute left-1 top-12 h-px w-4 rotate-[25deg] bg-current opacity-45" />

          {index % 3 ===
          0 ? (
            <Archive
              size={37}
              strokeWidth={1.05}
            />
          ) : index % 3 ===
            1 ? (
            <FileQuestion
              size={36}
              strokeWidth={1.05}
            />
          ) : (
            <ClipboardList
              size={35}
              strokeWidth={1.05}
            />
          )}

        </div>

      </div>

      <div className="relative z-10 p-5 sm:p-6">

        {/* HEADER */}

        <div className="flex items-start justify-between gap-4">

          <div className="flex min-w-0 items-start gap-3">

            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition duration-300 group-hover:scale-105 group-hover:-rotate-3"
              style={{
                backgroundColor:
                  palette.light,
                color:
                  palette.accentDark,
              }}
            >

              <Archive size={19} />

            </div>

            <div className="min-w-0">

              <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-[#8A94A8]">
                Hiring cycle
              </p>

              <h2 className="mt-1 truncate text-lg font-semibold tracking-[-0.02em] text-[#202938] transition-colors duration-200 group-hover:text-[#5658E8]">
                {bank.name ||
                  `Question Bank ${bank.hiring_year}`}
              </h2>

            </div>

          </div>

          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${status.className}`}
          >

            <StatusIcon size={12} />

            {status.label}

          </span>

        </div>

        {/* META */}

        <div className="mt-5 grid gap-3 sm:grid-cols-3">

          <BankInfoCard
            label="Bank ID"
            value={`#${bank.id}`}
            icon={
              <Archive size={13} />
            }
            background="#EAF2FF"
            color="#4A61C8"
          />

          <BankInfoCard
            label="Hiring Year"
            value={
              bank.hiring_year ||
              "â€”"
            }
            icon={
              <CalendarDays
                size={13}
              />
            }
            background="#F0EBFB"
            color="#7862C8"
          />

          <BankInfoCard
            label="Created"
            value={formatDate(
              bank.created_at
            )}
            icon={
              <Clock3 size={13} />
            }
            background="#E5F7F3"
            color="#28734E"
          />

        </div>

        {/* JD */}

        {bank.description && (
          <JobDescription
            description={
              bank.description
            }
          />
        )}

        {/* FOOTER */}

        <div className="mt-5 flex items-center justify-between border-t border-[#EEF0F3] pt-5">

          <div>

            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#98A2B3]">
              Access
            </p>

            <p className="mt-1 text-[10px] font-semibold text-[#667085]">
              {isAssessmentManager
                ? "Assessment workspace"
                : "Read only"}
            </p>

          </div>

          {(isAssessmentManager || isAssessmentReviewer) ? (

            <button
              type="button"
              onClick={onOpen}
              className="group/button inline-flex h-9 items-center gap-2 rounded-lg bg-[#5658E8] px-3.5 text-xs font-semibold text-white shadow-[0_7px_16px_rgba(86,88,232,0.14)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#4648C9] hover:shadow-[0_10px_21px_rgba(86,88,232,0.19)]"
            >

              {isAssessmentReviewer ? "Open Review" : "Open"}

              <ArrowRight
                size={13}
                className="transition-transform duration-200 group-hover/button:translate-x-0.5"
              />

            </button>

          ) : (

            <span className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#D8DDF0] bg-[#F8F7FF] px-3.5 text-[10px] font-bold text-[#6250A8]">

              <Archive size={12} />

              Read only

            </span>
          )}

        </div>

      </div>

    </article>
  );
}

/* ============================================================
   JD CONTAINER
============================================================ */

function JobDescription({
  description,
}) {
  const sections =
    parseJobDescription(
      description
    );

  if (!sections.length) {
    return null;
  }

  return (
    <div className="mt-5 overflow-hidden rounded-[16px] border border-[#E8EAF0] bg-[#FCFCFE]">

      <div className="flex items-center gap-2 border-b border-[#EEEFF4] bg-[#FAFAFD] px-4 py-3">

        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F0EBFB] text-[#7A61D8]">

          <FileText size={13} />

        </span>

        <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#7A61D8]">
          HR Job Description
        </p>

      </div>

      <div className="space-y-5 px-4 py-4">

        {sections.map(
          (section, index) => (
            <JobDescriptionSection
              key={`${section.title}-${index}`}
              section={section}
            />
          )
        )}

      </div>

    </div>
  );
}

/* ============================================================
   JD PARSER
============================================================ */

function parseJobDescription(
  description
) {
  let text = String(
    description || ""
  )
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

  if (!text) {
    return [];
  }

  /*
   * IMPORTANT:
   *
   * Some generated JDs arrive like:
   *
   * **Senior Fullstack Developer Job Description**
   * **Role Overview**
   * We are seeking...
   * **Key Responsibilities**
   * - Design...
   * - Develop...
   *
   * but sometimes the entire thing is actually one physical line.
   *
   * We normalize known bold headings BEFORE splitting into lines.
   */

  for (const headingPattern of JD_HEADING_PATTERNS) {
    const escapedHeading =
      headingPattern.replace(
        /[-/\\^$*+?.()|[\]{}]/g,
        "\\$&"
      );

    const headingRegex =
      new RegExp(
        `\\*\\*\\s*(${escapedHeading})\\s*\\*\\*`,
        "gi"
      );

    text = text.replace(
      headingRegex,
      "\nÂ§Â§HEADINGÂ§Â§$1Â§Â§ENDHEADINGÂ§Â§\n"
    );
  }

  /*
   * Convert explicit Markdown headings.
   */

  text = text.replace(
    /^#{1,6}\s*(.+)$/gm,
    "\nÂ§Â§HEADINGÂ§Â§$1Â§Â§ENDHEADINGÂ§Â§\n"
  );

  /*
   * Convert bold headings that are not part of a sentence.
   * This catches generated variants such as:
   *
   * **Role Overview**
   * **Key Responsibilities**
   */

  text = text.replace(
    /\*\*\s*([^*\n]{2,100})\s*\*\*/g,
    (match, value) => {
      const normalized =
        String(value)
          .trim()
          .toLowerCase();

      const looksLikeHeading =
        JD_HEADING_PATTERNS.some(
          (pattern) =>
            normalized === pattern ||
            normalized.includes(
              pattern
            )
        ) ||
        normalized.endsWith(
          "job description"
        );

      if (
        looksLikeHeading
      ) {
        return `\nÂ§Â§HEADINGÂ§Â§${value.trim()}Â§Â§ENDHEADINGÂ§Â§\n`;
      }

      return match;
    }
  );

  /*
   * Normalize common bullet markers.
   */

  text = text.replace(
    /\s+([-*â€¢])\s+/g,
    "\n$1 "
  );

  /*
   * Normalize numbered lists.
   */

  text = text.replace(
    /\s+(\d+[.)])\s+/g,
    "\n$1 "
  );

  /*
   * Split special markers into physical lines.
   */

  text = text.replace(
    /Â§Â§ENDHEADINGÂ§Â§/g,
    "Â§Â§ENDHEADINGÂ§Â§\n"
  );

  const lines = text
    .split("\n")
    .map((line) =>
      line.trim()
    )
    .filter(Boolean);

  const sections = [];

  let currentSection = {
    title: "",
    paragraphs: [],
    bullets: [],
  };

  const pushSection = () => {
    if (
      currentSection.title ||
      currentSection.paragraphs
        .length ||
      currentSection.bullets
        .length
    ) {
      sections.push(
        currentSection
      );
    }

    currentSection = {
      title: "",
      paragraphs: [],
      bullets: [],
    };
  };

  const addParagraph = (
    value
  ) => {
    const cleaned =
      cleanInlineMarkdown(
        value
      );

    if (!cleaned) {
      return;
    }

    currentSection.paragraphs.push(
      cleaned
    );
  };

  lines.forEach(
    (line) => {
      if (
        line.includes(
          "Â§Â§HEADINGÂ§Â§"
        )
      ) {
        const heading =
          line
            .replace(
              "Â§Â§HEADINGÂ§Â§",
              ""
            )
            .replace(
              "Â§Â§ENDHEADINGÂ§Â§",
              ""
            )
            .trim();

        pushSection();

        currentSection.title =
          cleanHeading(
            heading
          );

        return;
      }

      /*
       * Bullet markers.
       */

      const bulletMatch =
        line.match(
          /^[-*â€¢]\s+(.+)$/
        );

      if (bulletMatch) {
        currentSection.bullets.push(
          cleanInlineMarkdown(
            bulletMatch[1]
          )
        );

        return;
      }

      /*
       * Numbered list items.
       */

      const numberedMatch =
        line.match(
          /^\d+[.)]\s+(.+)$/
        );

      if (numberedMatch) {
        currentSection.bullets.push(
          cleanInlineMarkdown(
            numberedMatch[1]
          )
        );

        return;
      }

      /*
       * Standalone bold heading.
       */

      const boldOnly =
        line.match(
          /^\*\*\s*(.+?)\s*\*\*$/
        );

      if (boldOnly) {
        pushSection();

        currentSection.title =
          cleanHeading(
            boldOnly[1]
          );

        return;
      }

      /*
       * Normal paragraph.
       */

      addParagraph(line);
    }
  );

  pushSection();

  /*
   * If we failed to detect sections, create a clean
   * readable fallback rather than returning a mashed line.
   */

  if (
    sections.length === 1 &&
    !sections[0].title &&
    sections[0].paragraphs
      .length === 1
  ) {
    const paragraph =
      sections[0]
        .paragraphs[0];

    const fallbackBullets =
      extractEmbeddedBullets(
        paragraph
      );

    if (
      fallbackBullets.length
    ) {
      sections[0].paragraphs =
        [];
      sections[0].bullets =
        fallbackBullets;
    }
  }

  return sections.filter(
    (section) =>
      section.title ||
      section.paragraphs
        .length ||
      section.bullets.length
  );
}

/* ============================================================
   EMBEDDED BULLETS
============================================================ */

function extractEmbeddedBullets(
  text
) {
  const normalized =
    String(text || "")
      .replace(
        /\s*-\s+/g,
        "\n"
      )
      .replace(
        /\s*\*\s+/g,
        "\n"
      )
      .replace(
        /\s*â€¢\s+/g,
        "\n"
      );

  return normalized
    .split("\n")
    .map((item) =>
      cleanInlineMarkdown(
        item
      )
    )
    .filter(
      (item) => item.length > 2
    );
}

/* ============================================================
   CLEAN HEADING
============================================================ */

function cleanHeading(
  value
) {
  return String(
    value || ""
  )
    .replace(
      /^#+\s*/,
      ""
    )
    .replace(
      /^\*\*(.+)\*\*$/,
      "$1"
    )
    .replace(
      /^__(.+)__$/,
      "$1"
    )
    .trim();
}

/* ============================================================
   CLEAN INLINE MARKDOWN
============================================================ */

function cleanInlineMarkdown(
  value
) {
  return String(
    value || ""
  )
    .replace(
      /^#{1,6}\s+/,
      ""
    )
    .replace(
      /\*\*(.*?)\*\*/g,
      "$1"
    )
    .replace(
      /__(.*?)__/g,
      "$1"
    )
    .replace(
      /`([^`]+)`/g,
      "$1"
    )
    .replace(
      /^>\s?/,
      ""
    )
    .replace(
      /^\s*[-*â€¢]\s+/,
      ""
    )
    .replace(
      /^\s*\d+[.)]\s+/,
      ""
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

/* ============================================================
   JD SECTION RENDERER
============================================================ */

function JobDescriptionSection({
  section,
}) {
  const title =
    section.title || "";

  const titleLower =
    title.toLowerCase();

  const isResponsibilities =
    titleLower.includes(
      "responsibil"
    );

  const isSkills =
    titleLower.includes(
      "skill"
    );

  const isQualifications =
    titleLower.includes(
      "qualification"
    );

  const isExperience =
    titleLower.includes(
      "experience"
    );

  const SectionIcon =
    isResponsibilities
      ? CheckCircle2
      : isSkills
        ? Sparkles
        : isQualifications
          ? ShieldCheck
          : isExperience
            ? CalendarDays
            : BriefcaseBusiness;

  return (
    <section className="rounded-xl border border-transparent px-1 py-1 transition duration-200 hover:border-[#EEEAF7] hover:bg-white">

      {title && (

        <div className="mb-3 flex items-center gap-2.5">

          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#F0EBFB] text-[#7A61D8]">

            <SectionIcon
              size={13}
            />

          </span>

          <h4 className="text-[12px] font-bold tracking-[-0.005em] text-[#27364A]">
            {title}
          </h4>

        </div>
      )}

      {section.paragraphs.length >
        0 && (

        <div className="space-y-2">

          {section.paragraphs.map(
            (
              paragraph,
              paragraphIndex
            ) => (

              <p
                key={
                  paragraphIndex
                }
                className="text-xs leading-6 text-[#667085]"
              >
                {paragraph}
              </p>

            )
          )}

        </div>
      )}

      {section.bullets.length >
        0 && (

        <div className="space-y-1.5">

          {section.bullets.map(
            (
              bullet,
              bulletIndex
            ) => (

              <div
                key={
                  bulletIndex
                }
                className="group/bullet flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition duration-200 hover:bg-[#FAF9FF]"
              >

                <span className="mt-[7px] flex h-1.5 w-1.5 shrink-0 rounded-full bg-[#7A61D8] transition-transform duration-200 group-hover/bullet:scale-125" />

                <p className="text-xs leading-5.5 text-[#667085]">
                  {bullet}
                </p>

              </div>

            )
          )}

        </div>
      )}

    </section>
  );
}

/* ============================================================
   ASSIGNED JOB CARD
============================================================ */

function AssignedJobCard({
  job,
  index,
  hasBank,
  creating,
  onCreate,
  onOpen,
}) {
  const palettes = [
    {
      light: "#F0EBFB",
      color: "#7862C8",
      dark: "#654DBD",
    },
    {
      light: "#EAF2FF",
      color: "#4A61C8",
      dark: "#2F68C5",
    },
    {
      light: "#E5F7F3",
      color: "#0F9D8A",
      dark: "#08786B",
    },
    {
      light: "#F8EAF1",
      color: "#B85C87",
      dark: "#944668",
    },
  ];

  const palette =
    palettes[
      index % palettes.length
    ];

  return (
    <article className="group relative overflow-hidden rounded-[20px] border border-[#E3E6EB] bg-white shadow-[0_8px_26px_rgba(27,37,58,0.035)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#D5D9E3] hover:shadow-[0_15px_34px_rgba(27,37,58,0.07)]">

      <div
        className="pointer-events-none absolute right-3 top-3 transition-all duration-500 group-hover:rotate-3 group-hover:scale-105"
        style={{
          color: palette.color,
          opacity: 0.25,
        }}
      >

        <div className="relative flex h-20 w-20 items-center justify-center">

          <span className="absolute left-0 top-4 h-1.5 w-1.5 rounded-full bg-current" />

          <span className="absolute right-0 top-1 h-1.5 w-1.5 animate-pulse rounded-full bg-current" />

          <span className="absolute bottom-1 right-0 h-px w-7 rotate-[-18deg] bg-current opacity-55" />

          <BriefcaseBusiness
            size={37}
            strokeWidth={1.05}
          />

        </div>

      </div>

      <div className="relative z-10 p-5 sm:p-6">

        <div className="flex items-start justify-between gap-4">

          <div className="flex min-w-0 items-start gap-3">

            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition duration-300 group-hover:scale-105 group-hover:-rotate-3"
              style={{
                backgroundColor:
                  palette.light,
                color:
                  palette.color,
              }}
            >

              <BriefcaseBusiness
                size={19}
              />

            </div>

            <div className="min-w-0">

              <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-[#8A94A8]">
                Assigned job
              </p>

              <h3 className="mt-1 truncate text-lg font-semibold tracking-[-0.02em] text-[#202938] transition-colors duration-200 group-hover:text-[#5658E8]">
                {job.title}
              </h3>

            </div>

          </div>

          <span className="shrink-0 rounded-full border border-[#D9DEE7] bg-[#FAFBFC] px-2.5 py-1 text-[10px] font-bold text-[#667085]">
            #{job.id}
          </span>

        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">

          <BankInfoCard
            label="Hiring Year"
            value={
              job.hiring_year
            }
            icon={
              <CalendarDays
                size={13}
              />
            }
            background="#F0EBFB"
            color="#7862C8"
          />

          <BankInfoCard
            label="Question Bank"
            value={
              hasBank
                ? `#${job.question_bank.id}`
                : "Not created"
            }
            icon={
              <Archive size={13} />
            }
            background="#EAF2FF"
            color="#4A61C8"
          />

          <BankInfoCard
            label="Skill Status"
            value={
              String(
                job.skill_review_status ||
                  ""
              ).toLowerCase() ===
              "confirmed"
                ? "Confirmed"
                : "Pending"
            }
            icon={
              <CheckCircle2
                size={13}
              />
            }
            background="#E5F7F3"
            color="#28734E"
          />

        </div>

        {job.description && (

          <JobDescription
            description={
              job.description
            }
          />

        )}

        {Array.isArray(
          job.skills
        ) &&
          job.skills.length >
            0 && (

            <div className="mt-4 rounded-xl border border-[#E5E1F5] bg-[#FBFAFF] px-4 py-3">

              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#7862C8]">
                HR Confirmed Skills
              </p>

              <div className="mt-2 flex flex-wrap gap-1.5">

                {job.skills.map(
                  (
                    skill,
                    skillIndex
                  ) => (

                    <span
                      key={`${job.id}-${skill.id || skillIndex}`}
                      className="rounded-full border border-[#DDD6F3] bg-white px-2.5 py-1 text-[9px] font-semibold text-[#5E4DA3] transition duration-200 hover:-translate-y-0.5"
                    >
                      {
                        skill.name
                      }
                    </span>

                  )
                )}

              </div>

            </div>
          )}

        <div className="mt-5 flex items-center justify-end border-t border-[#EEF0F3] pt-5">

          {hasBank ? (

            <button
              type="button"
              onClick={onOpen}
              className="group/button inline-flex h-9 items-center gap-2 rounded-lg bg-[#5658E8] px-3.5 text-xs font-semibold text-white shadow-[0_7px_16px_rgba(86,88,232,0.14)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#4648C9]"
            >

              Open Assessment

              <ArrowRight
                size={13}
                className="transition-transform duration-200 group-hover/button:translate-x-0.5"
              />

            </button>

          ) : (

            <button
              type="button"
              onClick={onCreate}
              disabled={
                creating
              }
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#5658E8] px-3.5 text-xs font-semibold text-white shadow-[0_7px_16px_rgba(86,88,232,0.14)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#4648C9] disabled:cursor-not-allowed disabled:opacity-60"
            >

              {creating ? (
                <>
                  <RefreshCw
                    size={13}
                    className="animate-spin"
                  />

                  Creating...
                </>
              ) : (
                <>
                  <Plus size={13} />

                  Create Assessment

                  <ArrowRight
                    size={13}
                  />
                </>
              )}

            </button>
          )}

        </div>

      </div>

    </article>
  );
}

/* ============================================================
   BANK INFO CARD
============================================================ */

function BankInfoCard({
  label,
  value,
  icon,
  background,
  color,
}) {
  return (
    <div className="rounded-xl border border-[#EEF0F3] bg-[#FAFBFC] p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#D9DEE7] hover:bg-white hover:shadow-[0_7px_16px_rgba(38,40,79,0.035)]">

      <div className="flex items-center gap-2">

        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          style={{
            backgroundColor:
              background,
            color,
          }}
        >
          {icon}
        </span>

        <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-[#98A2B3]">
          {label}
        </p>

      </div>

      <p className="mt-2 truncate text-xs font-semibold text-[#344054]">
        {value}
      </p>

    </div>
  );
}

/* ============================================================
   SUMMARY CARD
============================================================ */

function SummaryCard({
  label,
  value,
  description,
  icon,
  background,
  color,
}) {
  return (
    <div className="group relative overflow-hidden rounded-[18px] border border-[#E3E6EB] bg-white p-5 shadow-[0_8px_24px_rgba(27,37,58,0.035)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#D5D9E3] hover:shadow-[0_14px_32px_rgba(27,37,58,0.06)]">

      <div
        className="pointer-events-none absolute right-2 top-2 opacity-20 transition-all duration-500 group-hover:rotate-3 group-hover:scale-105"
        style={{
          color,
        }}
      >

        <div className="relative flex h-16 w-16 items-center justify-center">

          <span className="absolute left-0 top-3 h-1.5 w-1.5 rounded-full bg-current" />

          <span className="absolute right-0 top-1 h-1.5 w-1.5 animate-pulse rounded-full bg-current" />

          <Sparkles
            size={30}
            strokeWidth={1.05}
          />

        </div>

      </div>

      <div
        className="flex h-11 w-11 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-3"
        style={{
          backgroundColor:
            background,
          color,
        }}
      >
        {icon}
      </div>

      <p className="mt-5 text-[9px] font-bold uppercase tracking-[0.17em] text-[#98A2B3]">
        {label}
      </p>

      <p className="mt-1 text-[30px] font-semibold tracking-[-0.04em] text-[#182033]">
        {value}
      </p>

      <p className="mt-1 text-xs text-[#98A2B3]">
        {description}
      </p>

    </div>
  );
}

/* ============================================================
   INFO CHIP
============================================================ */

function InfoChip({
  icon,
  label,
  background,
  color,
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-[#E0E3EA] px-3 py-1.5 text-[10px] font-semibold shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
      style={{
        backgroundColor:
          background,
        color,
      }}
    >
      {icon}
      {label}
    </span>
  );
}

export default QuestionBanks;