import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  AlertCircle,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Filter,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  Trash2,
  Users,
  X,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import RecruiterLayout from "../layouts/RecruiterLayout";

const COLORS = {
  indigo: "#5658E8",
  indigoDark: "#4648C9",
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
  text: "#1B2430",
  textSecondary: "#667085",
  textMuted: "#98A2B3",
};

const JOB_STYLES = [
  {
    accent: COLORS.violet,
    accentDark: COLORS.violetDark,
    light: COLORS.violetLight,
  },
  {
    accent: COLORS.blue,
    accentDark: COLORS.blueDark,
    light: COLORS.blueLight,
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
];

/**
 * Convert FastAPI errors into safe, readable React text.
 * Validation detail can be an array of objects rather than a string.
 */
function formatApiError(
  detail,
  fallback = "Request failed."
) {
  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (item && typeof item === "object") {
          const location = Array.isArray(item.loc)
            ? item.loc
                .filter((part) => part !== "body")
                .join(".")
            : "";

          const message =
            typeof item.msg === "string"
              ? item.msg
              : "Invalid request";

          return location
            ? `${location}: ${message}`
            : message;
        }

        return String(item);
      })
      .join("\n");
  }

  if (detail && typeof detail === "object") {
    if (typeof detail.detail === "string") {
      return detail.detail;
    }

    if (typeof detail.msg === "string") {
      return detail.msg;
    }

    try {
      return JSON.stringify(detail, null, 2);
    } catch {
      return fallback;
    }
  }

  return fallback;
}

function Jobs() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [selectedJobIds, setSelectedJobIds] = useState([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState("");
  const [bulkDeleteProgress, setBulkDeleteProgress] = useState("");

  const loadJobs = async (showRefreshState = false) => {
    try {
      setError("");

      if (showRefreshState) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const response = await api.get("/jobs");

      const nextJobs = Array.isArray(response.data)
        ? response.data
        : [];

      setJobs(nextJobs);

      // Retain only selections for jobs still present.
      setSelectedJobIds((currentIds) =>
        currentIds.filter((id) =>
          nextJobs.some(
            (job) => Number(job.id) === Number(id)
          )
        )
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
        formatApiError(
          err.response?.data?.detail,
          "Unable to load jobs right now."
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

  const formatDate = (value) => {
    if (!value) {
      return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return date.toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const getDescriptionPreview = (description) => {
    if (!description) {
      return "No job description available.";
    }

    if (description.length <= 210) {
      return description;
    }

    return `${description.slice(0, 210)}...`;
  };

  const filteredJobs = useMemo(() => {
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const query = search.trim().toLowerCase();

    return jobs
      .slice()
      .reverse()
      .filter((job) => {
        const title = String(job.title || "").toLowerCase();
        const description = String(
          job.description || ""
        ).toLowerCase();
        const id = String(job.id || "").toLowerCase();

        const matchesSearch =
          !query ||
          title.includes(query) ||
          description.includes(query) ||
          id.includes(query);

        const createdAt = job.created_at
          ? new Date(job.created_at).getTime()
          : 0;

        const age = createdAt
          ? now - createdAt
          : Number.POSITIVE_INFINITY;

        const matchesFilter =
          filter === "all" ||
          (filter === "recent7" && age <= sevenDays) ||
          (filter === "recent30" && age <= thirtyDays) ||
          (filter === "older" && age > thirtyDays);

        return matchesSearch && matchesFilter;
      });
  }, [jobs, search, filter]);

  const visibleSelectedCount = filteredJobs.filter((job) =>
    selectedJobIds.includes(Number(job.id))
  ).length;

  const allVisibleJobsSelected =
    filteredJobs.length > 0 &&
    visibleSelectedCount === filteredJobs.length;

  const toggleJobSelection = (jobId) => {
    const normalizedId = Number(jobId);

    setSelectedJobIds((currentIds) =>
      currentIds.includes(normalizedId)
        ? currentIds.filter((id) => id !== normalizedId)
        : [...currentIds, normalizedId]
    );
  };

  const toggleVisibleJobSelection = () => {
    const visibleIds = filteredJobs.map((job) =>
      Number(job.id)
    );

    setSelectedJobIds((currentIds) => {
      const allSelected = visibleIds.every((id) =>
        currentIds.includes(id)
      );

      if (allSelected) {
        return currentIds.filter(
          (id) => !visibleIds.includes(id)
        );
      }

      return [
        ...new Set([...currentIds, ...visibleIds]),
      ];
    });
  };

  const getJobStyle = (index) =>
    JOB_STYLES[index % JOB_STYLES.length];

  // ---------------------------------------------------------
  // Single-job deletion
  // ---------------------------------------------------------

  const requestDelete = (job) => {
    setDeleteTarget(job);
    setDeleteError("");
  };

  const cancelDelete = () => {
    if (deleting) {
      return;
    }

    setDeleteTarget(null);
    setDeleteError("");
  };

  const handleDeleteJob = async () => {
    if (!deleteTarget) {
      return;
    }

    const jobId = Number(deleteTarget.id);

    setDeleting(true);
    setDeleteError("");

    try {
      await api.delete(`/jobs/${jobId}`);

      setJobs((currentJobs) =>
        currentJobs.filter(
          (job) => Number(job.id) !== jobId
        )
      );

      setSelectedJobIds((currentIds) =>
        currentIds.filter((id) => Number(id) !== jobId)
      );

      setDeleteTarget(null);
    } catch (err) {
      console.error("Failed to delete job:", err);

      if (
        err.response?.status === 401 ||
        err.response?.status === 403
      ) {
        logout();
        navigate("/login", { replace: true });
        return;
      }

      setDeleteError(
        formatApiError(
          err.response?.data?.detail,
          "Unable to delete this job. Check your connection and try again."
        )
      );
    } finally {
      setDeleting(false);
    }
  };

  // ---------------------------------------------------------
  // Bulk deletion
  // ---------------------------------------------------------

  const cancelBulkDelete = () => {
    if (bulkDeleting) {
      return;
    }

    setBulkDeleteOpen(false);
    setBulkDeleteError("");
    setBulkDeleteProgress("");
  };

  const handleBulkDelete = async () => {
    const jobIds = [
      ...new Set(selectedJobIds.map(Number)),
    ].filter(
      (id) => Number.isSafeInteger(id) && id > 0
    );

    if (jobIds.length === 0) {
      setBulkDeleteError(
        "Select at least one valid job before deleting."
      );
      return;
    }

    // API request limit: 100 IDs per request.
    // Total selected jobs can exceed 100.
    const batchSize = 100;
    const batchCount = Math.ceil(
      jobIds.length / batchSize
    );

    const deletedIds = [];
    const failures = [];

    setBulkDeleting(true);
    setBulkDeleteError("");
    setBulkDeleteProgress(
      "Preparing to delete selected jobs..."
    );

    try {
      for (
        let offset = 0;
        offset < jobIds.length;
        offset += batchSize
      ) {
        const batch = jobIds.slice(
          offset,
          offset + batchSize
        );

        const batchNumber =
          Math.floor(offset / batchSize) + 1;

        const batchEnd = offset + batch.length;

        setBulkDeleteProgress(
          `Processing ${batchEnd} of ${jobIds.length} jobs ` +
          `(batch ${batchNumber} of ${batchCount})...`
        );

        try {
          const response = await api.post(
            "/jobs/bulk-delete",
            {
              job_ids: batch,
            }
          );

          const result = response.data || {};

          if (Array.isArray(result.deleted_ids)) {
            deletedIds.push(
              ...result.deleted_ids.map(Number)
            );
          }

          if (Array.isArray(result.failures)) {
            failures.push(...result.failures);
          }
        } catch (err) {
          console.error(
            `Bulk-delete batch ${batchNumber} failed:`,
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

          const detail = formatApiError(
            err.response?.data?.detail,
            "This batch could not be processed."
          );

          // A request-level validation error affects the whole batch.
          for (const jobId of batch) {
            failures.push({
              job_id: jobId,
              reason: "error",
              detail,
            });
          }

          // Stop if the request itself is invalid. Sending the remaining
          // batches with the same invalid request shape will not help.
          if (err.response?.status === 422) {
            for (const jobId of jobIds.slice(batchEnd)) {
              failures.push({
                job_id: jobId,
                reason: "error",
                detail:
                  "Not attempted because the previous batch failed request validation.",
              });
            }

            break;
          }

          // If the network is offline, stop sending more requests.
          if (!err.response) {
            for (const jobId of jobIds.slice(batchEnd)) {
              failures.push({
                job_id: jobId,
                reason: "error",
                detail:
                  "Not attempted because the connection was interrupted.",
              });
            }

            break;
          }
        }
      }

      const deletedSet = new Set(
        deletedIds.map(Number)
      );

      const unavailableIds = new Set(
        failures
          .filter(
            (failure) => failure.reason === "not_found"
          )
          .map((failure) => Number(failure.job_id))
      );

      // Remove successfully deleted jobs from the UI.
      setJobs((currentJobs) =>
        currentJobs.filter(
          (job) =>
            !deletedSet.has(Number(job.id)) &&
            !unavailableIds.has(Number(job.id))
        )
      );

      // Keep failed jobs selected so they can be reviewed or retried.
      setSelectedJobIds((currentIds) =>
        currentIds.filter(
          (id) =>
            !deletedSet.has(Number(id)) &&
            !unavailableIds.has(Number(id))
        )
      );

      const unresolvedFailures = failures.filter(
        (failure) => failure.reason !== "not_found"
      );

      if (unresolvedFailures.length > 0) {
        const failureLines = unresolvedFailures.map(
          (failure) =>
            `Job #${failure.job_id}: ${
              failure.detail || "Unable to delete this job."
            }`
        );

        setBulkDeleteError(
          `${deletedIds.length} job(s) deleted; ` +
          `${unresolvedFailures.length} could not be deleted.\n` +
          failureLines.join("\n")
        );

        setBulkDeleteProgress(
          `Finished processing ${jobIds.length} selected jobs.`
        );
      } else {
        setBulkDeleteOpen(false);
        setBulkDeleteError("");
        setBulkDeleteProgress("");
      }
    } catch (err) {
      console.error(
        "Unexpected bulk-delete error:",
        err
      );

      setBulkDeleteError(
        formatApiError(
          err.response?.data?.detail,
          "Unable to delete selected jobs. Check your connection and try again."
        )
      );

      setBulkDeleteProgress("");
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <RecruiterLayout
      title="Jobs"
      breadcrumb="Workspace / Jobs"
    >
      <main className="mx-auto max-w-[1500px] space-y-7 pb-14 text-[#202938]">

        {/* HEADER */}

        <section className="group relative overflow-hidden rounded-[22px] border border-[#D8DAF0] bg-gradient-to-br from-[#F5F1FF] via-[#F8F9FF] to-[#EEF5FF] px-5 py-6 shadow-[0_8px_24px_rgba(86,88,232,0.035)] sm:px-7 sm:py-7 lg:px-9 lg:py-8">

          <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-[#CFDEFC]/45 blur-[70px]" />

          <div className="pointer-events-none absolute right-[20%] top-0 h-40 w-40 rounded-full bg-[#E9DFFF]/45 blur-[55px]" />

          <div className="pointer-events-none absolute bottom-[-70px] right-[28%] h-44 w-44 rounded-full bg-[#F8E4F0]/40 blur-[60px]" />

          <div className="pointer-events-none absolute right-7 top-5 hidden text-[#7B73D8]/30 sm:block">
            <div className="relative flex h-24 w-24 items-center justify-center transition-all duration-500 group-hover:rotate-3 group-hover:scale-105">
              <span className="absolute right-0 top-4 h-1.5 w-1.5 rounded-full bg-[#5658E8]/60" />
              <span className="absolute left-1 top-10 h-1.5 w-1.5 rounded-full bg-[#3B82F6]/45" />
              <span className="absolute bottom-5 right-2 h-px w-7 rotate-[-25deg] bg-current opacity-40" />
              <BriefcaseBusiness size={46} strokeWidth={1.05} />
            </div>
          </div>

          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">

            <div className="max-w-3xl">

              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#D9DEE7] bg-white/80 px-3 py-1.5 shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-[#5658E8]" />
                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#667085]">
                  Job management
                </span>
              </div>

              <h1 className="text-[30px] font-semibold tracking-[-0.035em] text-[#182033] sm:text-[38px]">
                Jobs
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#667085]">
                Manage job descriptions and continue the
                screening workflow from role creation through
                skill review.
              </p>

              <div className="mt-5 flex flex-wrap gap-2.5">
                <InfoChip
                  icon={<BriefcaseBusiness size={12} />}
                  label="Roles"
                  background="#EAF2FF"
                  color="#2F68C5"
                />

                <InfoChip
                  icon={<Sparkles size={12} />}
                  label="AI-assisted"
                  background="#F0EBFB"
                  color="#654DBD"
                />

                <InfoChip
                  icon={<Users size={12} />}
                  label="Recruiter review"
                  background="#F8EAF1"
                  color="#944668"
                />
              </div>

            </div>

            <div className="relative z-10 flex flex-wrap gap-3">

              <button
                type="button"
                onClick={() => loadJobs(true)}
                disabled={refreshing}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#C9D0DC] bg-white px-4 text-sm font-semibold text-[#475467] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#5658E8] hover:bg-[#FAF9FF] hover:text-[#5658E8] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw
                  size={15}
                  className={refreshing ? "animate-spin" : ""}
                />
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>

              <button
                type="button"
                onClick={() => navigate("/jobs/new")}
                className="group/button inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#5658E8] px-4 text-sm font-semibold text-white shadow-[0_9px_21px_rgba(86,88,232,0.18)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#4648C9] hover:shadow-[0_13px_27px_rgba(86,88,232,0.23)]"
              >
                <Plus
                  size={15}
                  className="transition-transform duration-300 group-hover/button:rotate-90"
                />
                New Job
                <ArrowRight
                  size={14}
                  className="transition-transform duration-200 group-hover/button:translate-x-1"
                />
              </button>

            </div>
          </div>
        </section>

        {/* ERROR */}

        {error && (
          <section className="rounded-[18px] border border-[#E9C8C8] bg-[#FBF2F2] px-4 py-3.5 text-sm text-[#A83E3E]">
            <p className="font-semibold">Jobs API</p>
            <p className="mt-1 whitespace-pre-wrap">{error}</p>
          </section>
        )}

        {/* WORKSPACE HEADER */}

        <section>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">

            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#5658E8]">
                Recruiter workspace
              </p>

              <h2 className="mt-2 text-[23px] font-semibold tracking-[-0.025em] text-[#1B2430]">
                All Jobs
              </h2>

              <p className="mt-1 text-sm leading-6 text-[#667085]">
                Open a role to review the job details and continue
                the screening workflow.
              </p>
            </div>

            {!loading && !error && jobs.length > 0 && (
              <div className="inline-flex items-center gap-2 rounded-full bg-[#EEF0FF] px-3 py-2 text-[9px] font-bold uppercase tracking-[0.12em] text-[#5658E8]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#5658E8]" />
                {filteredJobs.length} shown
              </div>
            )}

          </div>
        </section>

        {/* FILTER AND BULK ACTIONS */}

        {!loading && !error && jobs.length > 0 && (
          <section className="rounded-[18px] border border-[#DDE1EA] bg-white p-3.5 shadow-[0_8px_22px_rgba(38,40,79,0.025)]">

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">

              <div className="group/search relative flex-1">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#98A2B3] transition-colors duration-200 group-focus-within/search:text-[#7A61D8]"
                />

                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search jobs by title, description, or ID..."
                  className="h-10 w-full rounded-lg border border-[#D9DEE7] bg-[#FBFCFE] pl-10 pr-4 text-xs text-[#202938] outline-none transition duration-200 placeholder:text-[#98A2B3] hover:border-[#C9D0DC] focus:border-[#7A61D8] focus:bg-white focus:ring-4 focus:ring-[#7A61D8]/10"
                />
              </div>

              <div className="flex items-center gap-2">

                <div className="flex h-10 items-center gap-2 rounded-lg border border-[#D9DEE7] bg-[#FBFCFE] px-3 text-xs text-[#667085]">
                  <Filter size={14} />

                  <span className="hidden sm:inline">
                    Filter
                  </span>

                  <select
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    className="h-8 border-0 bg-transparent text-xs font-semibold text-[#344054] outline-none"
                  >
                    <option value="all">All jobs</option>
                    <option value="recent7">Last 7 days</option>
                    <option value="recent30">Last 30 days</option>
                    <option value="older">Older jobs</option>
                  </select>
                </div>

                {(search || filter !== "all") && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setFilter("all");
                    }}
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#D9DEE7] bg-white px-3 text-xs font-semibold text-[#667085] transition duration-200 hover:-translate-y-0.5 hover:border-[#5658E8] hover:bg-[#FAF9FF] hover:text-[#5658E8]"
                  >
                    Clear
                    <X size={13} />
                  </button>
                )}

              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 border-t border-[#EEF0F3] pt-3 sm:flex-row sm:items-center sm:justify-between">

              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#475467]">
                <input
                  type="checkbox"
                  checked={allVisibleJobsSelected}
                  onChange={toggleVisibleJobSelection}
                  disabled={filteredJobs.length === 0 || bulkDeleting}
                  aria-label="Select all visible jobs"
                  className="h-4 w-4 rounded border-[#C9D0DC] accent-[#5658E8]"
                />
                Select all visible ({filteredJobs.length})
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs text-[#667085]">
                  {selectedJobIds.length} selected
                </span>

                <button
                  type="button"
                  onClick={() => {
                    setBulkDeleteError("");
                    setBulkDeleteProgress("");
                    setBulkDeleteOpen(true);
                  }}
                  disabled={
                    selectedJobIds.length === 0 || bulkDeleting
                  }
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#E6C9CF] bg-[#FFF9FB] px-3.5 text-xs font-semibold text-[#B85C72] transition hover:border-[#DFAEB9] hover:bg-[#FFF4F7] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 size={13} />
                  Delete selected
                </button>
              </div>

            </div>
          </section>
        )}

        {/* LOADING */}

        {loading && (
          <section className="flex min-h-[300px] items-center justify-center rounded-[20px] border border-[#E1E4EB] bg-white shadow-[0_8px_24px_rgba(27,37,58,0.035)]">
            <div className="text-center">

              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F0EBFB] text-[#7A61D8]">
                <RefreshCw size={21} className="animate-spin" />
              </div>

              <p className="mt-5 text-sm font-semibold text-[#344054]">
                Loading jobs
              </p>

              <p className="mt-1 text-xs text-[#98A2B3]">
                Fetching roles from your workspace.
              </p>

            </div>
          </section>
        )}

        {/* EMPTY */}

        {!loading && !error && jobs.length === 0 && (
          <section className="relative overflow-hidden rounded-[20px] border border-dashed border-[#C8CFDC] bg-white px-6 py-20 text-center shadow-[0_8px_24px_rgba(27,37,58,0.03)]">
            <div className="pointer-events-none absolute right-8 top-6 text-[#7A61D8]/25">
              <Sparkles size={36} strokeWidth={1.05} />
            </div>

            <div className="relative">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAF2FF] text-[#3B82F6]">
                <BriefcaseBusiness size={24} />
              </div>

              <p className="mt-5 text-[9px] font-bold uppercase tracking-[0.18em] text-[#5658E8]">
                Recruiter workspace
              </p>

              <h3 className="mt-2 text-lg font-semibold text-[#202938]">
                No jobs created yet
              </h3>

              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#667085]">
                Create your first job description to begin the screening
                workflow.
              </p>

              <button
                type="button"
                onClick={() => navigate("/jobs/new")}
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#5658E8] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_9px_20px_rgba(86,88,232,0.15)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#4648C9]"
              >
                <Plus size={15} />
                Create New Job
                <ArrowRight size={13} />
              </button>
            </div>
          </section>
        )}

        {/* NO SEARCH MATCH */}

        {!loading &&
          !error &&
          jobs.length > 0 &&
          filteredJobs.length === 0 && (
            <section className="relative overflow-hidden rounded-[20px] border border-dashed border-[#C8CFDC] bg-white px-6 py-16 text-center shadow-[0_8px_24px_rgba(27,37,58,0.03)]">
              <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[#F0EBFB] opacity-60 blur-2xl" />

              <div className="relative">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F0EBFB] text-[#7A61D8]">
                  <Search size={22} />
                </div>

                <h3 className="mt-5 text-lg font-semibold text-[#202938]">
                  No matching jobs
                </h3>

                <p className="mt-2 text-sm text-[#667085]">
                  Try another search or filter.
                </p>

                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setFilter("all");
                  }}
                  className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#5658E8] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_9px_20px_rgba(86,88,232,0.15)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#4648C9]"
                >
                  Clear filters
                  <ArrowRight size={13} />
                </button>
              </div>
            </section>
          )}

        {/* JOB CARDS */}

        {!loading && !error && filteredJobs.length > 0 && (
          <section className="space-y-5">
            {filteredJobs.map((job, index) => (
              <JobCard
                key={job.id}
                job={job}
                selected={selectedJobIds.includes(Number(job.id))}
                onToggleSelection={() => toggleJobSelection(job.id)}
                style={getJobStyle(index)}
                index={index}
                formatDate={formatDate}
                getDescriptionPreview={getDescriptionPreview}
                onReview={() =>
                  navigate(`/jobs/${job.id}/skills`)
                }
                onDelete={() => requestDelete(job)}
              />
            ))}
          </section>
        )}

        {/* SINGLE DELETE MODAL */}

        {deleteTarget && (
          <DeleteJobModal
            job={deleteTarget}
            deleting={deleting}
            error={deleteError}
            onCancel={cancelDelete}
            onConfirm={handleDeleteJob}
          />
        )}

        {/* BULK DELETE MODAL */}

        {bulkDeleteOpen && (
          <DeleteSelectedJobsModal
            jobs={jobs.filter((job) =>
              selectedJobIds.includes(Number(job.id))
            )}
            selectedCount={selectedJobIds.length}
            deleting={bulkDeleting}
            error={bulkDeleteError}
            progress={bulkDeleteProgress}
            onCancel={cancelBulkDelete}
            onConfirm={handleBulkDelete}
          />
        )}

      </main>
    </RecruiterLayout>
  );
}

function JobCard({
  job,
  selected,
  onToggleSelection,
  style,
  index,
  formatDate,
  getDescriptionPreview,
  onReview,
  onDelete,
}) {
  return (
    <article
      className={`group relative overflow-hidden rounded-[20px] border bg-white shadow-[0_8px_24px_rgba(27,37,58,0.035)] transition duration-300 hover:-translate-y-0.5 hover:border-[#D5D9E3] hover:shadow-[0_14px_32px_rgba(27,37,58,0.06)] ${
        selected
          ? "border-[#8C8DEB] ring-2 ring-[#5658E8]/10"
          : "border-[#E3E6EB]"
      }`}
    >
      <div
        className="pointer-events-none absolute right-3 top-2 transition-all duration-500 group-hover:rotate-3 group-hover:scale-105"
        style={{
          color: style.accent,
          opacity: 0.24,
        }}
      >
        <div className="relative flex h-20 w-20 items-center justify-center">
          <span className="absolute left-0 top-4 h-1.5 w-1.5 rounded-full bg-current opacity-65" />
          <span className="absolute right-0 top-2 h-1.5 w-1.5 rounded-full bg-current opacity-55" />
          <span className="absolute bottom-2 right-0 h-px w-7 rotate-[-18deg] bg-current opacity-50" />

          {index % 4 === 0 ? (
            <BriefcaseBusiness size={37} strokeWidth={1.05} />
          ) : index % 4 === 1 ? (
            <Sparkles size={36} strokeWidth={1.05} />
          ) : index % 4 === 2 ? (
            <Target size={35} strokeWidth={1.05} />
          ) : (
            <BriefcaseBusiness size={35} strokeWidth={1.05} />
          )}
        </div>
      </div>

      <div className="relative z-10 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <label className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-[#D9DEE7] bg-white transition hover:border-[#8C8DEB]">
              <input
                type="checkbox"
                checked={selected}
                onChange={onToggleSelection}
                aria-label={`Select job ${job.title || job.id}`}
                className="h-4 w-4 cursor-pointer rounded border-[#C9D0DC] accent-[#5658E8]"
              />
            </label>

            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-3"
              style={{
                backgroundColor: style.light,
                color: style.accentDark,
              }}
            >
              <BriefcaseBusiness size={19} />
            </div>

            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-[#8A94A8]">
                Recruiter job
              </p>

              <h3 className="mt-1 truncate text-[17px] font-semibold tracking-[-0.015em] text-[#202938] transition-colors duration-200 group-hover:text-[#5658E8]">
                {job.title || "Untitled Job"}
              </h3>
            </div>
          </div>

          <span
            className="shrink-0 rounded-full px-2.5 py-1 text-[9px] font-bold"
            style={{
              backgroundColor: style.light,
              color: style.accentDark,
            }}
          >
            #{job.id}
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <MetaCard
            icon={<CalendarDays size={13} />}
            label="Created"
            value={formatDate(job.created_at)}
            background="#F0EBFB"
            color="#7862C8"
          />

          <MetaCard
            icon={<BriefcaseBusiness size={13} />}
            label="Job ID"
            value={`#${job.id}`}
            background="#EAF2FF"
            color="#4A61C8"
          />

          <MetaCard
            icon={<CheckCircle2 size={13} />}
            label="Status"
            value="Created"
            background="#E5F7F3"
            color="#28734E"
          />
        </div>

        <div className="mt-4 rounded-xl border border-[#E9ECF1] bg-[#FAFBFD] px-4 py-3.5 transition duration-300 group-hover:border-[#DDDFF0] group-hover:bg-[#FCFCFF]">
          <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#7A61D8]">
            Job Description
          </p>

          <p className="mt-2 line-clamp-4 text-xs leading-5 text-[#667085]">
            {getDescriptionPreview(job.description)}
          </p>
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-[#EEF0F3] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#98A2B3]">
              Next stage
            </p>

            <p className="mt-1 text-[10px] font-semibold text-[#667085]">
              Skill Review
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#E6C9CF] bg-[#FFF9FB] px-3 text-xs font-semibold text-[#B85C72] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#DFAEB9] hover:bg-[#FFF4F7] hover:text-[#A63F59]"
            >
              <Trash2 size={13} />
              Delete
            </button>

            <button
              type="button"
              onClick={onReview}
              className="group/button inline-flex h-9 items-center gap-2 rounded-lg bg-[#5658E8] px-3.5 text-xs font-semibold text-white shadow-[0_7px_16px_rgba(86,88,232,0.14)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#4648C9] hover:shadow-[0_10px_21px_rgba(86,88,232,0.19)]"
            >
              Review Skills
              <ArrowRight
                size={13}
                className="transition-transform duration-200 group-hover/button:translate-x-0.5"
              />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function MetaCard({
  icon,
  label,
  value,
  background,
  color,
}) {
  return (
    <div className="rounded-xl border border-[#EEF0F3] bg-[#FAFBFC] p-3">
      <div className="flex items-center gap-2">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          style={{
            backgroundColor: background,
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

function InfoChip({
  icon,
  label,
  background,
  color,
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-white/60 px-3 py-1.5 text-[10px] font-semibold shadow-sm transition duration-200 hover:-translate-y-0.5"
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

function DeleteJobModal({
  job,
  deleting,
  error,
  onCancel,
  onConfirm,
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#16182D]/45 px-4 backdrop-blur-[2px]">
      <div className="w-full max-w-[440px] overflow-hidden rounded-[22px] border border-[#E2D8DC] bg-white shadow-[0_28px_70px_rgba(21,24,48,0.22)]">
        <div className="p-6 sm:p-7">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F8EAF1] text-[#B85C72]">
              <Trash2 size={19} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-[#B85C72]">
                    Delete job
                  </p>

                  <h3 className="mt-1.5 text-lg font-semibold tracking-[-0.02em] text-[#202938]">
                    Delete this job?
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={onCancel}
                  disabled={deleting}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#98A2B3] transition hover:bg-[#F4F5F7] hover:text-[#475467] disabled:opacity-50"
                  aria-label="Close delete dialog"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-[#EEF0F3] bg-[#FAFBFC] px-4 py-3.5">
            <p className="text-xs font-semibold text-[#344054]">
              {job.title || "Untitled Job"}
            </p>

            <p className="mt-1 text-[10px] text-[#98A2B3]">
              Job #{job.id}
            </p>
          </div>

          <p className="mt-4 text-xs leading-6 text-[#667085]">
            This permanently removes the job and its job-linked setup.
            This action cannot be undone.
          </p>

          {error && (
            <div className="mt-4 whitespace-pre-wrap rounded-xl border border-[#E9C8C8] bg-[#FFF8F8] px-3.5 py-3 text-xs leading-5 text-[#A83E3E]">
              {error}
            </div>
          )}

          <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onCancel}
              disabled={deleting}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-[#D7DCE5] bg-white px-4 text-xs font-semibold text-[#475467] transition hover:border-[#BFC6D3] hover:bg-[#FAFBFD] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={onConfirm}
              disabled={deleting}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#B85C72] px-4 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(184,92,114,0.18)] transition hover:-translate-y-0.5 hover:bg-[#A63F59] hover:shadow-[0_12px_24px_rgba(184,92,114,0.24)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleting && (
                <RefreshCw size={13} className="animate-spin" />
              )}

              {deleting ? "Deleting..." : "Delete Job"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeleteSelectedJobsModal({
  jobs,
  selectedCount,
  deleting,
  error,
  progress,
  onCancel,
  onConfirm,
}) {
  const previewJobs = jobs.slice(0, 5);
  const remainingCount = Math.max(
    0,
    jobs.length - previewJobs.length
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#16182D]/45 px-4 py-6 backdrop-blur-[2px]">
      <div className="max-h-[90vh] w-full max-w-[520px] overflow-y-auto rounded-[22px] border border-[#E2D8DC] bg-white shadow-[0_28px_70px_rgba(21,24,48,0.22)]">
        <div className="p-6 sm:p-7">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F8EAF1] text-[#B85C72]">
              <Trash2 size={19} />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-[#B85C72]">
                Bulk delete
              </p>

              <h3 className="mt-1.5 text-lg font-semibold tracking-[-0.02em] text-[#202938]">
                Delete {selectedCount} selected job
                {selectedCount === 1 ? "" : "s"}?
              </h3>

              <p className="mt-2 text-xs leading-5 text-[#667085]">
                Jobs linked to existing assessment data may be blocked
                and will remain in your workspace. Other eligible jobs
                can still be deleted.
              </p>
            </div>

            <button
              type="button"
              onClick={onCancel}
              disabled={deleting}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#98A2B3] transition hover:bg-[#F4F5F7] hover:text-[#475467] disabled:opacity-50"
              aria-label="Close bulk-delete dialog"
            >
              <X size={16} />
            </button>
          </div>

          <div className="mt-5 rounded-xl border border-[#EEF0F3] bg-[#FAFBFC] p-3">
            {previewJobs.length > 0 ? (
              <ul className="space-y-2">
                {previewJobs.map((job) => (
                  <li
                    key={job.id}
                    className="flex items-start justify-between gap-3 rounded-lg bg-white px-3 py-2"
                  >
                    <span className="min-w-0 break-words text-xs font-semibold text-[#344054]">
                      {job.title || "Untitled Job"}
                    </span>

                    <span className="shrink-0 text-[10px] text-[#98A2B3]">
                      #{job.id}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[#667085]">
                No selected jobs remain in the current list.
              </p>
            )}

            {remainingCount > 0 && (
              <p className="mt-2 px-1 text-[10px] text-[#667085]">
                And {remainingCount} more job
                {remainingCount === 1 ? "" : "s"}.
              </p>
            )}
          </div>

          {progress && (
            <p
              className="mt-4 text-xs font-medium text-[#5658E8]"
              role="status"
            >
              {progress}
            </p>
          )}

          {error && (
            <div className="mt-4 whitespace-pre-wrap rounded-xl border border-[#E9C8C8] bg-[#FFF8F8] px-3.5 py-3 text-xs leading-5 text-[#A83E3E]">
              {error}
            </div>
          )}

          <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onCancel}
              disabled={deleting}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-[#D7DCE5] bg-white px-4 text-xs font-semibold text-[#475467] transition hover:border-[#BFC6D3] hover:bg-[#FAFBFD] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={onConfirm}
              disabled={deleting || selectedCount === 0}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#B85C72] px-4 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(184,92,114,0.18)] transition hover:-translate-y-0.5 hover:bg-[#A63F59] hover:shadow-[0_12px_24px_rgba(184,92,114,0.24)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleting && (
                <RefreshCw size={13} className="animate-spin" />
              )}

              {deleting
                ? "Deleting selected jobs..."
                : `Delete ${selectedCount} job${selectedCount === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Jobs;