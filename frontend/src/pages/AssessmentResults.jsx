
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileCheck2,
  RefreshCw,
  Search,
  ShieldAlert,
  Users,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import RecruiterLayout from "../layouts/RecruiterLayout";
import QuestionText from "../components/QuestionText";

const STATUS_LABELS = {
  completed: "Graded",
  grading: "Grading in progress",
  needs_review: "HR review required",
  pending: "Awaiting grading",
  assigned: "Awaiting start",
  in_progress: "In progress",
};

function formatPercent(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(1)}%` : "—";
}

function formatPoints(earned, maximum) {
  if (
    earned === null ||
    earned === undefined ||
    maximum === null ||
    maximum === undefined
  ) {
    return "Pending";
  }

  return `${Number(earned).toFixed(1)} / ${Number(maximum).toFixed(1)} pts`;
}

function formatDate(value) {
  if (!value) return "Not available";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getStatus(row) {
  if (row?.result?.status) {
    return row.result.status;
  }

  const attemptStatus = String(row?.attempt_status || "").toLowerCase();

  if (attemptStatus === "assigned" || attemptStatus === "in_progress") {
    return attemptStatus;
  }

  return "pending";
}

function getRowKey(row) {
  if (row?.attempt_id !== null && row?.attempt_id !== undefined) {
    return `attempt-${row.attempt_id}`;
  }

  return `assignment-${row?.assignment_id ?? row?.candidate_id ?? "unknown"}`;
}

function getCandidateName(row) {
  return (
    row?.candidate_name ||
    row?.candidate_email ||
    `Candidate ${row?.candidate_id ?? "unknown"}`
  );
}

function isHrScoreOverridden(result) {
  return (
    typeof result?.feedback === "string" &&
    result.feedback.includes("HR score override:")
  );
}

function formatResultScore(value, result) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return formatPercent(value);
  }

  if (isHrScoreOverridden(result)) {
    const number = Number(value);
    return Number.isFinite(number)
      ? `${number.toFixed(2)}%`
      : formatPercent(value);
  }

  return formatPercent(value);
}

function statusClasses(status) {
  if (status === "completed") {
    return "border-[#CFE6DD] bg-[#F2FAF7] text-[#17655E]";
  }

  if (status === "needs_review") {
    return "border-[#F1D7AD] bg-[#FFF8EB] text-[#996515]";
  }

  if (status === "grading") {
    return "border-[#D8DBF7] bg-[#F7F7FF] text-[#5658E8]";
  }

  return "border-[#E1E4EB] bg-[#F8F9FC] text-[#667085]";
}

function csvCell(value) {
  const text =
    value === null || value === undefined ? "" : String(value);

  return `"${text.replace(/"/g, '""')}"`;
}

function renderBreakdown(items, labelKey) {
  if (!Array.isArray(items)) return "";

  return items
    .map((item) => {
      const name = item[labelKey] || "Unassigned";

      return `${name}: ${formatPoints(
        item.earned_points,
        item.max_points
      )} (${formatPercent(item.score)})`;
    })
    .join(" | ");
}

function AssessmentResults() {
  const { assessmentId } = useParams();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedRowKey, setSelectedRowKey] = useState(null);

  const loadResults = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      // Recover submitted attempts left pending by an earlier scoring run.
      await api.post(
        `/assessments/${assessmentId}/results/grade-pending`
      );

      const response = await api.get(
        `/assessments/${assessmentId}/results`
      );

      const nextPayload = response.data || {};
      const nextRows = Array.isArray(nextPayload.results)
        ? nextPayload.results
        : [];

      setPayload({
        ...nextPayload,
        results: nextRows,
      });

      setSelectedRowKey((current) =>
        current !== null &&
        nextRows.some((row) => getRowKey(row) === current)
          ? current
          : nextRows[0]
            ? getRowKey(nextRows[0])
            : null
      );
    } catch (requestError) {
      console.error(
        "Failed to load assessment results:",
        requestError
      );

      if (requestError.response?.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }

      setError(
        requestError.response?.data?.detail ||
          (requestError.response?.status === 403
            ? "Your account does not have permission to view these results."
            : "Unable to load results. Check the backend and try again.")
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleScoreOverride = async (row, score, reason) => {
    if (!row?.attempt_id) {
      throw new Error("This candidate has no assessment attempt to update.");
    }

    try {
      await api.post(
        `/assessments/${assessmentId}/results/${row.attempt_id}/override`,
        { score, reason }
      );

      await loadResults(true);
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        logout();
        navigate("/login", { replace: true });
        throw new Error("Your session has expired. Please sign in again.");
      }

      throw new Error(
        requestError.response?.data?.detail ||
        "Unable to save the score override. Please try again."
      );
    }
  };

  useEffect(() => {
    loadResults();
    // Reload when the assessment route changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentId]);

  // Keep results updated while the scoring worker is processing.
  useEffect(() => {
    const hasActiveGrading = (payload?.results || []).some(
      (row) => getStatus(row) === "grading"
    );

    if (!hasActiveGrading) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      loadResults(true);
    }, 4000);

    return () => window.clearTimeout(timer);
    // loadResults is intentionally omitted: it is recreated each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, assessmentId]);

  const rows = payload?.results || [];

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return rows.filter((row) => {
      const values = [
        getCandidateName(row),
        row.candidate_email,
        row.candidate_id,
        row.attempt_id,
      ];

      const matchesSearch =
        !needle ||
        values.some(
          (value) =>
            value !== null &&
            value !== undefined &&
            String(value).toLowerCase().includes(needle)
        );

      const matchesStatus =
        statusFilter === "all" || getStatus(row) === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [rows, search, statusFilter]);

  const selectedRow =
    rows.find((row) => getRowKey(row) === selectedRowKey) || null;

  const stats = useMemo(() => {
    const graded = rows.filter(
      (row) =>
        getStatus(row) === "completed" &&
        row.result?.score !== null &&
        row.result?.score !== undefined
    );

    const needsReview = rows.filter(
      (row) => getStatus(row) === "needs_review"
    ).length;

    const submitted = rows.filter(
      (row) =>
        row?.attempt_status === "submitted" ||
        Boolean(row?.submitted_at)
    ).length;

    const average = graded.length
      ? graded.reduce(
          (sum, row) => sum + Number(row.result.score),
          0
        ) / graded.length
      : null;

    return {
      candidates: rows.length,
      total: submitted,
      graded: graded.length,
      needsReview,
      average,
    };
  }, [rows]);

  const exportCsv = () => {
    const headers = [
      "Candidate",
      "Email",
      "Candidate ID",
      "Attempt ID",
      "Submitted At",
      "Grading Status",
      "Overall Score (%)",
      "Earned Points",
      "Maximum Points",
      "Skill Scores",
      "Section Scores",
      "Question Scores",
      "Feedback",
    ];

    const csvRows = rows.map((row) => {
      const result = row.result || {};
      const scoreIsFinal = getStatus(row) === "completed";

      return [
        getCandidateName(row),
        row.candidate_email,
        row.candidate_id,
        row.attempt_id,
        row.submitted_at,
        STATUS_LABELS[getStatus(row)] || "Not graded",
        scoreIsFinal ? result.score : "",
        scoreIsFinal ? result.earned_points : "",
        scoreIsFinal ? result.max_points : "",
        renderBreakdown(result.skill_scores, "skill_name"),
        renderBreakdown(result.section_scores, "section_name"),
        Array.isArray(result.question_scores)
          ? result.question_scores
              .map(
                (question) =>
                  `Q${question.display_order}: ${formatPoints(
                    question.earned_points,
                    question.max_points
                  )} (${formatPercent(question.score)})`
              )
              .join(" | ")
          : "",
        result.feedback,
      ]
        .map(csvCell)
        .join(",");
    });

    const csv = [
      headers.map(csvCell).join(","),
      ...csvRows,
    ].join("\r\n");

    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `evalyn-assessment-${assessmentId}-results.csv`;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <RecruiterLayout
        title="Assessment Results"
        breadcrumb="Workspace / Assessment Results"
      >
        <CenteredState
          icon={
            <RefreshCw
              size={22}
              className="animate-spin text-[#5658E8]"
            />
          }
          title="Loading assessment results"
          message="Fetching candidate scores, skill breakdowns, and rubric feedback."
        />
      </RecruiterLayout>
    );
  }

  if (error) {
    return (
      <RecruiterLayout
        title="Assessment Results"
        breadcrumb="Workspace / Assessment Results"
      >
        <section className="mx-auto max-w-[1000px] rounded-[22px] border border-[#E9C8C8] bg-white p-7 shadow-sm sm:p-9">
          <ShieldAlert size={24} className="text-[#B42318]" />

          <h1 className="mt-4 text-2xl font-semibold text-[#202938]">
            Results unavailable
          </h1>

          <p
            className="mt-3 text-sm leading-6 text-[#667085]"
            role="alert"
          >
            {error}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => loadResults()}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#5658E8] px-4 text-xs font-semibold text-white"
            >
              <RefreshCw size={14} />
              Try again
            </button>

            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#D7DCE5] px-4 text-xs font-semibold text-[#475467]"
            >
              <ArrowLeft size={14} />
              Go back
            </button>
          </div>
        </section>
      </RecruiterLayout>
    );
  }

  return (
    <RecruiterLayout
      title="Assessment Results"
      breadcrumb={`Workspace / Results / Assessment #${assessmentId}`}
    >
      <main className="mx-auto max-w-[1500px] space-y-7 pb-12">
        <section className="relative overflow-hidden rounded-[24px] border border-[#40426C] bg-[#25264A] text-white shadow-[0_22px_55px_rgba(37,38,74,0.15)]">
          <div className="pointer-events-none absolute -right-14 -top-20 h-64 w-64 rounded-full bg-[#7A61D8]/25 blur-[75px]" />

          <div className="relative flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="inline-flex items-center gap-2 text-xs font-semibold text-[#D8DAEA] hover:text-white"
              >
                <ArrowLeft size={14} />
                Back
              </button>

              <p className="mt-5 text-[9px] font-bold uppercase tracking-[0.17em] text-[#DAD9FF]">
                Candidate performance
              </p>

              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-[42px]">
                {payload?.assessment_title ||
                  `Assessment #${assessmentId}`}
              </h1>

              <p className="mt-3 text-sm leading-6 text-[#D8DAEA]">
                Review overall performance, skill-wise scores,
                section-wise scores, and rubric feedback for
                submitted attempts.
              </p>

              <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#B9BCE0]">
                Assessment ID: {payload?.assessment_id ?? assessmentId}
                <span className="mx-2 text-white/30">/</span>
                {stats.candidates} candidates
                <span className="mx-2 text-white/30">/</span>
                {stats.total} submissions
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                onClick={() => loadResults(true)}
                disabled={refreshing}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-4 text-xs font-semibold text-white hover:bg-white/[0.12] disabled:opacity-60"
              >
                <RefreshCw
                  size={14}
                  className={refreshing ? "animate-spin" : ""}
                />
                Refresh
              </button>

              <button
                type="button"
                onClick={exportCsv}
                disabled={!rows.length}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-xs font-semibold text-[#25264A] hover:bg-[#F0F1FF] disabled:opacity-50"
              >
                <Download size={14} />
                Export CSV
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={<Users size={17} />}
            label="Candidates"
            value={stats.candidates}
            helper="Assigned or attempted candidates"
            accent="blue"
          />

          <MetricCard
            icon={<CheckCircle2 size={17} />}
            label="Graded"
            value={stats.graded}
            helper="Scores available to HR"
            accent="teal"
          />

          <MetricCard
            icon={<ShieldAlert size={17} />}
            label="Needs HR review"
            value={stats.needsReview}
            helper="Requires manual attention"
            accent="amber"
          />

          <MetricCard
            icon={<FileCheck2 size={17} />}
            label="Average score"
            value={formatPercent(stats.average)}
            helper="Fully graded attempts only"
            accent="violet"
          />
        </section>

        {rows.length === 0 ? (
          <section className="rounded-[22px] border border-dashed border-[#CDD3DE] bg-white px-6 py-14 text-center">
            <Users size={25} className="mx-auto text-[#5658E8]" />

            <h2 className="mt-5 text-lg font-semibold text-[#202938]">
              No candidates assigned
            </h2>

            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#667085]">
              Candidates will appear here after they are assigned to this
              assessment.
            </p>
          </section>
        ) : (
          <section className="grid min-w-0 gap-6 xl:grid-cols-[minmax(320px,390px)_minmax(0,1fr)]">
            <aside className="min-w-0 overflow-hidden rounded-[22px] border border-[#DDE1E9] bg-white shadow-sm">
              <div className="border-b border-[#EAECF0] px-5 py-5">
                <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-[#5658E8]">
                  Candidate list
                </p>

                <h2 className="mt-1.5 text-lg font-semibold text-[#202938]">
                  Candidates & results
                </h2>

                <label className="mt-4 flex h-10 items-center gap-2 rounded-xl border border-[#DDE1E9] bg-[#FAFBFC] px-3">
                  <Search
                    size={15}
                    className="shrink-0 text-[#98A2B3]"
                  />

                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search name, email, or ID"
                    className="min-w-0 flex-1 bg-transparent text-xs text-[#344054] outline-none placeholder:text-[#98A2B3]"
                    aria-label="Search candidate submissions"
                  />
                </label>

                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value)
                  }
                  className="mt-3 h-10 w-full rounded-xl border border-[#DDE1E9] bg-white px-3 text-xs font-medium text-[#475467] outline-none"
                  aria-label="Filter by grading status"
                >
                  <option value="all">All grading statuses</option>
                  <option value="completed">Graded</option>
                  <option value="grading">Grading in progress</option>
                  <option value="needs_review">HR review required</option>
                  <option value="pending">Awaiting grading</option>
                  <option value="assigned">Awaiting start</option>
                  <option value="in_progress">In progress</option>
                </select>
              </div>

              <div className="max-h-[760px] space-y-2 overflow-y-auto p-3">
                {filteredRows.map((row) => {
                  const result = row.result || {};
                  const status = getStatus(row);
                  const active = selectedRowKey === getRowKey(row);

                  return (
                    <button
                      type="button"
                      key={getRowKey(row)}
                      onClick={() => setSelectedRowKey(getRowKey(row))}
                      className={`w-full rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-4 focus:ring-[#5658E8]/10 ${
                        active
                          ? "border-[#9697F4] bg-[#F7F7FF]"
                          : "border-[#EEF0F3] bg-white hover:border-[#CFD1F6] hover:bg-[#FCFCFF]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EAE5F9] text-[11px] font-bold text-[#7862C8]">
                            {getCandidateName(row)
                              .split(/\s+/)
                              .filter(Boolean)
                              .slice(0, 2)
                              .map((part) => part[0]?.toUpperCase())
                              .join("") || "C"}
                          </div>

                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[#344054]">
                              {getCandidateName(row)}
                            </p>

                            <p className="mt-1 truncate text-[11px] text-[#98A2B3]">
                              {row.candidate_email ||
                                `Candidate ID ${row.candidate_id}`}
                            </p>
                          </div>
                        </div>

                        <span className="shrink-0 text-sm font-bold text-[#25264A]">
                          {formatResultScore(result.score, result)}
                        </span>

                        {isHrScoreOverridden(result) && (
                          <span className="rounded-full border border-[#D8DBF7] bg-[#F7F7FF] px-2.5 py-1 text-[9px] font-bold text-[#5658E8]">
                            HR adjusted
                          </span>
                        )}
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-bold ${statusClasses(
                            status
                          )}`}
                        >
                          {STATUS_LABELS[status] || "Not graded"}
                        </span>

                        <span className="text-[10px] text-[#98A2B3]">
                          {row.attempt_id != null
                            ? `Attempt #${row.attempt_id}`
                            : `Assignment #${row.assignment_id}`}
                        </span>
                      </div>

                      <p className="mt-2 text-[10px] text-[#98A2B3]">
                        {row.submitted_at
                          ? `Submitted ${formatDate(row.submitted_at)}`
                          : row.started_at
                            ? `Started ${formatDate(row.started_at)}`
                            : `Assigned ${formatDate(row.opens_at)}`}
                      </p>
                    </button>
                  );
                })}

                {filteredRows.length === 0 && (
                  <p className="px-3 py-8 text-center text-xs text-[#667085]">
                    No candidates match these filters.
                  </p>
                )}
              </div>
            </aside>

            <div className="min-w-0 space-y-6">
              {selectedRow ? (
                <CandidateResultDetail row={selectedRow} assessmentId={assessmentId} onOverride={handleScoreOverride} />
              ) : (
                <div className="rounded-[22px] border border-dashed border-[#CDD3DE] bg-white p-10 text-center text-sm text-[#667085]">
                  Select a candidate to inspect the detailed results.
                </div>
              )}
            </div>
          </section>
        )}

        <section className="rounded-[18px] border border-[#E1E4EB] bg-[#F8F9FC] px-5 py-4">
          <div className="flex items-start gap-3">
            <ShieldAlert
              size={16}
              className="mt-0.5 shrink-0 text-[#7862C8]"
            />

            <p className="text-[11px] leading-5 text-[#667085]">
              Results are produced by the assessment grading service.
              Attempts marked "HR review required" should be reviewed before
              a hiring decision. Their final overall percentage is withheld
              until grading issues are resolved.
            </p>
          </div>
        </section>
      </main>
    </RecruiterLayout>
  );
}

function CandidateResultDetail({ row, assessmentId, onOverride }) {
  const result = row.result || null;
  const status = getStatus(row);
  const [overrideScore, setOverrideScore] = useState(
    result?.score === null || result?.score === undefined
      ? ""
      : String(result.score)
  );
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);
  const [overrideError, setOverrideError] = useState("");
  const [overrideSuccess, setOverrideSuccess] = useState("");

  useEffect(() => {
    setOverrideScore(
      result?.score === null || result?.score === undefined
        ? ""
        : String(result.score)
    );
  }, [row.attempt_id, result?.score]);

  useEffect(() => {
    setOverrideReason("");
    setOverrideError("");
    setOverrideSuccess("");
  }, [row.attempt_id]);

  const skills = Array.isArray(result?.skill_scores)
    ? result.skill_scores
    : [];

  const sections = Array.isArray(result?.section_scores)
    ? result.section_scores
    : [];

  const questions = Array.isArray(result?.question_scores)
    ? result.question_scores
    : [];

  const scoreIsFinal = status === "completed";
  const overallScore =
    !scoreIsFinal || result?.score === null || result?.score === undefined
      ? null
      : Math.min(100, Math.max(0, Number(result.score) || 0));

  const canOverrideScore =
    Boolean(row.attempt_id) &&
    row.attempt_status === "submitted" &&
    ["completed", "needs_review"].includes(status);

  const handleOverrideSubmit = async (event) => {
    event.preventDefault();
    setOverrideError("");
    setOverrideSuccess("");

    if (!canOverrideScore) {
      setOverrideError(
        "Only submitted attempts with completed results or results requiring review can be overridden."
      );
      return;
    }

    const scoreText = overrideScore.trim();
    const reason = overrideReason.trim();

    if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(scoreText)) {
      setOverrideError(
        "Enter a score from 0 to 100 with no more than two decimal places."
      );
      return;
    }

    const numericScore = Number(scoreText);
    if (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > 100) {
      setOverrideError("The score must be between 0 and 100.");
      return;
    }

    if (reason.length < 5) {
      setOverrideError("Enter a meaningful reason of at least 5 characters.");
      return;
    }

    const confirmed = window.confirm(
      `Confirm changing ${getCandidateName(row)}'s overall score to ${numericScore.toFixed(2)}%? This action will be recorded in the audit log.`
    );

    if (!confirmed) return;

    setOverrideSubmitting(true);

    try {
      await onOverride(row, numericScore, reason);
      setOverrideScore(numericScore.toFixed(2));
      setOverrideReason("");
      setOverrideSuccess(
        "Score override saved. The change and reason were recorded in the audit log."
      );
    } catch (submissionError) {
      setOverrideError(
        submissionError?.message || "Unable to save the score override."
      );
    } finally {
      setOverrideSubmitting(false);
    }
  };

  return (
    <>
      <section className="overflow-hidden rounded-[22px] border border-[#DDE1E9] bg-white shadow-sm">
        <div className="border-b border-[#EAECF0] px-6 py-5 sm:px-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#5658E8]">
                Candidate report
              </p>

              <h2 className="mt-2 break-words text-2xl font-semibold text-[#202938]">
                {getCandidateName(row)}
              </h2>

              <p className="mt-1 break-all text-xs text-[#667085]">
                {row.candidate_email || "No email available"}
              </p>
              {isHrScoreOverridden(result) && (
                <span className="mt-2 inline-flex rounded-full border border-[#D8DBF7] bg-[#F7F7FF] px-2.5 py-1 text-[9px] font-bold text-[#5658E8]">
                  HR adjusted
                </span>
              )}
            </div>

            <span
              className={`inline-flex w-fit rounded-full border px-3 py-1.5 text-[10px] font-bold ${statusClasses(
                status
              )}`}
            >
              {STATUS_LABELS[status] || "Not graded"}
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <InfoTile
              label="Candidate ID"
              value={row.candidate_id ?? "—"}
            />
            <InfoTile
              label="Attempt ID"
              value={row.attempt_id ?? "—"}
            />
            <InfoTile
              label="Submitted at"
              value={formatDate(row.submitted_at)}
            />
          </div>
        </div>

        <div className="grid gap-6 p-6 sm:grid-cols-[165px_minmax(0,1fr)] sm:items-center sm:p-7">
          <div
            className="mx-auto flex h-[150px] w-[150px] items-center justify-center rounded-full"
            style={{
              background:
                overallScore === null
                  ? "conic-gradient(#E9EBF3 0deg, #E9EBF3 360deg)"
                  : `conic-gradient(#5658E8 ${
                      overallScore * 3.6
                    }deg, #E9EBF3 0deg)`,
            }}
            role="img"
            aria-label={
              overallScore === null
                ? "Overall score not available"
                : `Overall score ${formatPercent(overallScore)}`
            }
          >
            <div className="flex h-[122px] w-[122px] flex-col items-center justify-center rounded-full bg-white">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#98A2B3]">
                Overall score
              </span>

              <span className="mt-1 text-[29px] font-semibold text-[#25264A]">
                {formatResultScore(overallScore, result)}
              </span>

              <span className="mt-1 text-[10px] text-[#667085]">
                {status === "completed"
                  ? formatPoints(result?.earned_points, result?.max_points)
                  : status === "needs_review"
                    ? "Withheld pending HR review"
                    : "Available after grading"}
              </span>
            </div>
          </div>

          <div className="min-w-0">
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoTile
                label="Grading status"
                value={STATUS_LABELS[status] || "Not graded"}
              />

              <InfoTile
                label="Graded at"
                value={formatDate(result?.graded_at)}
              />
            </div>

            <div className="mt-4 rounded-xl border border-[#EEF0F3] bg-[#FAFBFC] p-4">
              <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#98A2B3]">
                Overall feedback
              </p>

              <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-[#475467]">
                {result?.feedback ||
                  (status === "grading"
                    ? "Automated grading is still processing this attempt."
                    : status === "needs_review"
                      ? "This attempt requires HR review before its final score can be confirmed."
                      : "No overall feedback is available.")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {canOverrideScore && (
        <section
          aria-labelledby="score-override-title"
          className="overflow-hidden rounded-[22px] border border-[#E6D8B7] bg-white shadow-sm"
        >
          <div className="border-b border-[#F0E6D1] bg-[#FFFCF5] px-6 py-5 sm:px-7">
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#996515]">
              HR review action
            </p>
            <h3
              id="score-override-title"
              className="mt-1.5 text-lg font-semibold text-[#202938]"
            >
              Manual score override
            </h3>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-[#667085]">
              Set a revised overall percentage and document why the change is
              justified. Saving requires confirmation and creates an audit
              record. This changes only the overall score. The original question-level, skill-level, and section-level grading details remain unchanged and available for audit and review.
            </p>
          </div>

          <form onSubmit={handleOverrideSubmit} className="space-y-5 p-6 sm:p-7">
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold text-[#344054]">
                  Revised overall score (%)
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="100"
                  step="0.01"
                  required
                  value={overrideScore}
                  onChange={(event) => setOverrideScore(event.target.value)}
                  placeholder="Enter 0?100"
                  aria-label="Revised overall score"
                  className="mt-2 h-11 w-full rounded-xl border border-[#DDE1E9] bg-white px-3 text-sm text-[#344054] outline-none transition focus:border-[#7879EC] focus:ring-4 focus:ring-[#5658E8]/10"
                />
                <span className="mt-1.5 block text-[10px] text-[#98A2B3]">
                  Up to two decimal places.
                </span>
              </label>

              <div className="rounded-xl border border-[#EEF0F3] bg-[#FAFBFC] p-4">
                <p className="text-xs font-semibold text-[#344054]">
                  Selected candidate
                </p>
                <p className="mt-1 text-sm text-[#475467]">
                  {getCandidateName(row)}
                </p>
                <p className="mt-1 text-[10px] text-[#98A2B3]">
                  Attempt #{row.attempt_id}
                </p>
                <p className="mt-3 text-[10px] leading-5 text-[#667085]">
                  Current saved score: {result?.score === null || result?.score === undefined ? "Not set" : formatResultScore(result.score, result)}
                </p>
              </div>
            </div>

            <label className="block">
              <span className="text-xs font-semibold text-[#344054]">
                Reason for override <span className="text-[#B42318">*</span>
              </span>
              <textarea
                required
                minLength={5}
                maxLength={1000}
                rows={4}
                value={overrideReason}
                onChange={(event) => setOverrideReason(event.target.value)}
                placeholder="Explain the manual review decision and why the overall score should change."
                aria-label="Reason for score override"
                className="mt-2 w-full resize-y rounded-xl border border-[#DDE1E9] bg-white px-3 py-3 text-sm leading-6 text-[#344054] outline-none transition focus:border-[#7879EC] focus:ring-4 focus:ring-[#5658E8]/10"
              />
              <span className="mt-1.5 block text-[10px] text-[#98A2B3]">
                Required. Avoid entering unnecessary personal information.
              </span>
            </label>

            {overrideError && (
              <p
                role="alert"
                className="rounded-xl border border-[#E9C8C8] bg-[#FFF5F5] px-4 py-3 text-xs leading-5 text-[#B42318]"
              >
                {overrideError}
              </p>
            )}

            {overrideSuccess && (
              <p
                role="status"
                className="rounded-xl border border-[#CFE6DD] bg-[#F2FAF7] px-4 py-3 text-xs leading-5 text-[#17655E]"
              >
                {overrideSuccess}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EEF0F3] pt-5">
              <p className="max-w-lg text-[10px] leading-5 text-[#667085]">
                The backend will validate your access, score, and reason before
                saving the change.
              </p>
              <button
                type="submit"
                disabled={overrideSubmitting}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#25264A] px-5 py-3 text-xs font-semibold text-white transition hover:bg-[#353760] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {overrideSubmitting ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Saving override...
                  </>
                ) : (
                  "Review and save override"
                )}
              </button>
            </div>
          </form>
        </section>
      )}

      <ScoreBreakdown
        title="Skill-wise scores"
        eyebrow="Technical competency"
        items={skills}
        nameKey="skill_name"
        idKey="skill_id"
        accent="#08786B"
        icon={<FileCheck2 size={17} />}
        empty="Skill scores will appear here once grading data is available."
      />

      <ScoreBreakdown
        title="Section-wise scores"
        eyebrow="Assessment performance"
        items={sections}
        nameKey="section_name"
        idKey="section_id"
        accent="#7862C8"
        icon={<FileCheck2 size={17} />}
        empty="Section scores will appear here once grading data is available."
      />

      <section className="rounded-[22px] border border-[#DDE1E9] bg-white shadow-sm">
        <div className="border-b border-[#EAECF0] px-6 py-5 sm:px-7">
          <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#7862C8]">
            Answer-level review
          </p>

          <h3 className="mt-1 text-lg font-semibold text-[#202938]">
            Question scores and rubric
          </h3>

          <p className="mt-1 text-xs leading-5 text-[#667085]">
            Expand a question to inspect the submitted answer,
            criterion-level points, and grading feedback.
          </p>
        </div>

        {questions.length > 0 ? (
          <div className="divide-y divide-[#EEF0F3]">
            {questions.map((question, index) => (
              <QuestionScore
                key={question.question_id ?? index}
                question={question}
                index={index}
              />
            ))}
          </div>
        ) : (
          <p className="px-6 py-8 text-sm text-[#667085]">
            Question-level grading details are not available yet.
          </p>
        )}
      </section>
    </>
  );
}

function ScoreBreakdown({
  title,
  eyebrow,
  items,
  nameKey,
  idKey,
  accent,
  icon,
  empty,
}) {
  return (
    <section className="rounded-[22px] border border-[#DDE1E9] bg-white shadow-sm">
      <div className="border-b border-[#EAECF0] px-6 py-5 sm:px-7">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{
              backgroundColor: `${accent}18`,
              color: accent,
            }}
          >
            {icon}
          </div>

          <div>
            <p
              className="text-[9px] font-bold uppercase tracking-[0.16em]"
              style={{ color: accent }}
            >
              {eyebrow}
            </p>

            <h3 className="mt-1 text-lg font-semibold text-[#202938]">
              {title}
            </h3>
          </div>
        </div>
      </div>

      {items.length > 0 ? (
        <div className="space-y-3 p-5 sm:p-6">
          {items.map((item, index) => {
            const score =
              item.score === null || item.score === undefined
                ? null
                : Math.min(100, Math.max(0, Number(item.score) || 0));

            return (
              <div
                key={
                  item[idKey] ??
                  `${item[nameKey] || "item"}-${index}`
                }
                className="rounded-xl border border-[#EEF0F3] bg-[#FCFCFD] p-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#344054]">
                      {item[nameKey] ||
                        (nameKey === "skill_name"
                          ? "Unassigned skill"
                          : "Unassigned section")}
                    </p>

                    <p className="mt-1 text-[10px] text-[#98A2B3]">
                      {item.question_count ?? "—"} questions
                    </p>
                  </div>

                  <div className="sm:text-right">
                    <p className="text-sm font-bold text-[#25264A]">
                      {formatPercent(score)}
                    </p>

                    <p className="mt-0.5 text-[10px] text-[#667085]">
                      {formatPoints(
                        item.earned_points,
                        item.max_points
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#ECEEF4]">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${score ?? 0}%`,
                      backgroundColor: accent,
                    }}
                  />
                </div>

                {item.status === "needs_review" && (
                  <p className="mt-2 text-[10px] font-medium text-[#996515]">
                    One or more questions in this group need review.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="px-6 py-8 text-sm text-[#667085]">{empty}</p>
      )}
    </section>
  );
}

function QuestionScore({ question, index }) {
  const status = question.status || "pending";

  const criteria = Array.isArray(question.criterion_scores)
    ? question.criterion_scores
    : [];

  const rubric = Array.isArray(question.rubric)
    ? question.rubric
    : [];

  return (
    <details className="group px-5 py-4 sm:px-6">
      <summary className="flex cursor-pointer list-none flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F0F1FF] text-[10px] font-bold text-[#5658E8]">
            {String(question.display_order ?? index + 1).padStart(2, "0")}
          </span>

          <div className="min-w-0">
            <QuestionText
              text={question.question_text || `Question ${index + 1}`}
              className="text-sm font-semibold leading-6 text-[#344054]"
            />

            <p className="mt-1 text-[10px] text-[#667085]">
              {question.skill_name || "Unassigned skill"}
              <span className="mx-1">·</span>
              {question.section_name || "Unassigned section"}
            </p>

            <div className="mt-2 flex flex-wrap gap-2">
              {question.question_type && (
                <span className="rounded-full border border-[#E1E4EB] bg-[#F8F9FC] px-2.5 py-1 text-[9px] font-semibold uppercase text-[#667085]">
                  {question.question_type.replace(/_/g, " ")}
                </span>
              )}

              <span
                className={`rounded-full border px-2.5 py-1 text-[9px] font-bold ${statusClasses(
                  status
                )}`}
              >
                {STATUS_LABELS[status] || "Not graded"}
              </span>
            </div>
          </div>
        </div>

        <div className="shrink-0 sm:text-right">
          <p className="text-sm font-bold text-[#25264A]">
            {formatPercent(question.score)}
          </p>

          <p className="mt-0.5 text-[10px] text-[#667085]">
            {formatPoints(
              question.earned_points,
              question.max_points
            )}
          </p>
        </div>
      </summary>

      <div className="mt-4 space-y-4 border-t border-[#EEF0F3] pt-4">
        <AnswerPanel
          label="Candidate answer"
          value={question.answer_text || "No answer submitted."}
        />

        {question.correct_answer && (
          <AnswerPanel
            label="Answer key"
            value={question.correct_answer}
          />
        )}

        {criteria.length > 0 && (
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#7862C8]">
              Rubric criterion scores
            </p>

            <div className="mt-3 space-y-2">
              {criteria.map((criterion, criterionIndex) => (
                <div
                  key={criterion.key || criterionIndex}
                  className="rounded-xl border border-[#EEF0F3] bg-[#FCFCFD] p-3.5"
                >
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs font-semibold text-[#344054]">
                      {criterion.label ||
                        criterion.key ||
                        `Criterion ${criterionIndex + 1}`}
                    </p>

                    <p className="text-xs font-bold text-[#25264A]">
                      {formatPoints(
                        criterion.earned_points,
                        criterion.max_points
                      )}
                    </p>
                  </div>

                  {criterion.weight_percent !== null &&
                    criterion.weight_percent !== undefined && (
                      <p className="mt-1 text-[10px] text-[#98A2B3]">
                        Weight: {formatPercent(criterion.weight_percent)}
                      </p>
                    )}

                  {criterion.feedback && (
                    <p className="mt-2 text-[11px] leading-5 text-[#667085]">
                      {criterion.feedback}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {criteria.length === 0 && rubric.length > 0 && (
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#7862C8]">
              Evaluation rubric
            </p>

            <div className="mt-3 space-y-2">
              {rubric.map((criterion, criterionIndex) => (
                <div
                  key={criterion.key || criterionIndex}
                  className="rounded-xl border border-[#EEF0F3] bg-[#FCFCFD] p-3.5"
                >
                  <p className="text-xs font-semibold text-[#344054]">
                    {criterion.label ||
                      criterion.key ||
                      `Criterion ${criterionIndex + 1}`}
                  </p>

                  {criterion.guidance && (
                    <p className="mt-1 text-[11px] leading-5 text-[#667085]">
                      {criterion.guidance}
                    </p>
                  )}

                  <p className="mt-2 text-[10px] font-semibold text-[#7862C8]">
                    Maximum: {criterion.max_points ?? "—"} points
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {question.feedback && (
          <AnswerPanel
            label="Grading feedback"
            value={question.feedback}
          />
        )}

        {question.grading_error && (
          <div className="rounded-xl border border-[#F1D7AD] bg-[#FFF8EB] p-3.5">
            <p className="text-[10px] font-bold uppercase text-[#996515]">
              Grading issue
            </p>

            <p className="mt-1 text-xs leading-5 text-[#996515]">
              {question.grading_error}
            </p>
          </div>
        )}
      </div>
    </details>
  );
}

function AnswerPanel({ label, value }) {
  return (
    <div className="rounded-xl border border-[#EEF0F3] bg-[#FAFBFC] p-4">
      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#98A2B3]">
        {label}
      </p>

      <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-6 text-[#475467]">
        {value}
      </p>
    </div>
  );
}

function InfoTile({ label, value }) {
  return (
    <div className="min-w-0 rounded-xl border border-[#EEF0F3] bg-[#FAFBFC] p-3.5">
      <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-[#98A2B3]">
        {label}
      </p>

      <p className="mt-1.5 break-words text-xs font-semibold text-[#344054]">
        {value}
      </p>
    </div>
  );
}

function MetricCard({ icon, label, value, helper, accent }) {
  const styles = {
    blue: ["bg-[#CFDEFC]", "text-[#4A61C8]"],
    teal: ["bg-[#E5F7F3]", "text-[#08786B]"],
    amber: ["bg-[#FBF2DE]", "text-[#9C6A1F]"],
    violet: ["bg-[#EAE5F9]", "text-[#7862C8]"],
  };

  const [background, foreground] = styles[accent] || styles.blue;

  return (
    <div className="rounded-[18px] border border-[#DDE1E9] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#98A2B3]">
            {label}
          </p>

          <p className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-[#202938]">
            {value}
          </p>
        </div>

        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${background} ${foreground}`}
        >
          {icon}
        </div>
      </div>

      <p className="mt-3 text-[11px] text-[#667085]">{helper}</p>
    </div>
  );
}

function CenteredState({ icon, title, message }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-[1240px] items-center justify-center">
      <div className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAE5F9]">
          {icon}
        </div>

        <p className="mt-5 text-sm font-semibold text-[#344054]">
          {title}
        </p>

        <p className="mt-1.5 text-xs text-[#98A2B3]">{message}</p>
      </div>
    </div>
  );
}

export default AssessmentResults;
