import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileText,
  History,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  X,
  XCircle,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import RecruiterLayout from "../layouts/RecruiterLayout";

const VALID_DIFFICULTIES = ["easy", "medium", "hard"];
const VALID_QUESTION_TYPES = ["MCQ", "FREE_TEXT"];

function ReviewerWorkspace() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [difficultyFilter, setDifficultyFilter] = useState("all");

  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  const [versionHistory, setVersionHistory] = useState([]);
  const [versionHistoryLoading, setVersionHistoryLoading] =
    useState(false);
  const [versionHistoryError, setVersionHistoryError] = useState("");
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] =
    useState(false);
  const [versionHistoryQuestion, setVersionHistoryQuestion] =
    useState(null);

  const [approvingId, setApprovingId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);

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

    if (typeof detail === "string") {
      return detail;
    }

    return fallback;
  };

  const handleUnauthorized = (err) => {
    if (
      err.response?.status === 401 ||
      err.response?.status === 403
    ) {
      logout();
      navigate("/login", { replace: true });
      return true;
    }

    return false;
  };

  const loadQuestions = async (showRefreshState = false) => {
    try {
      setError("");
      setActionError("");

      if (showRefreshState) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const response = await api.get("/questions");

      const questionData = Array.isArray(response.data)
        ? response.data
        : [];

      setQuestions(questionData);
    } catch (err) {
      console.error("Failed to load questions for review:", err);

      if (handleUnauthorized(err)) {
        return;
      }

      setError(
        getErrorMessage(
          err,
          "Unable to load questions for review."
        )
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadQuestions();
  }, []);

  const pendingQuestions = useMemo(() => {
    return questions.filter(
      (question) => question.status === "pending_review"
    );
  }, [questions]);

  const approvedQuestions = useMemo(() => {
    return questions.filter(
      (question) => question.status === "approved"
    );
  }, [questions]);

  const rejectedQuestions = useMemo(() => {
    return questions.filter(
      (question) => question.status === "rejected"
    );
  }, [questions]);

  const aiPendingQuestions = useMemo(() => {
    return pendingQuestions.filter(
      (question) => question.source === "ai_generated"
    );
  }, [pendingQuestions]);

  const getReviewChecks = (question) => {
    const isMcq = question.question_type === "MCQ";

    const hasOptions =
      Array.isArray(question.options) &&
      question.options.length >= 2;

    const hasAnswerKey =
      !isMcq ||
      Boolean(
        question.correct_answer &&
          Array.isArray(question.options) &&
          question.options.includes(question.correct_answer)
      );

    return [
      {
        label: "Question text",
        passed: Boolean(
          String(question.question_text || "").trim()
        ),
      },
      {
        label: "Question type",
        passed: VALID_QUESTION_TYPES.includes(
          question.question_type
        ),
      },
      {
        label: "Skill mapping",
        passed:
          Number.isInteger(question.skill_id) &&
          question.skill_id > 0,
      },
      {
        label: "Difficulty",
        passed: VALID_DIFFICULTIES.includes(
          String(question.difficulty || "").toLowerCase()
        ),
      },
      {
        label: isMcq ? "MCQ options" : "Free-text structure",
        passed: isMcq ? hasOptions : !question.options,
      },
      {
        label: isMcq ? "Answer key" : "Response model",
        passed: hasAnswerKey,
      },
    ];
  };

  const getCheckSummary = (question) => {
    const checks = getReviewChecks(question);

    const passedCount = checks.filter(
      (check) => check.passed
    ).length;

    return {
      checks,
      passedCount,
      totalCount: checks.length,
      allPassed: passedCount === checks.length,
    };
  };

  const filteredQuestions = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return pendingQuestions.filter((question) => {
      const matchesSearch =
        !normalizedSearch ||
        String(question.question_text || "")
          .toLowerCase()
          .includes(normalizedSearch) ||
        String(question.skill_id || "")
          .toLowerCase()
          .includes(normalizedSearch);

      const matchesSource =
        sourceFilter === "all" ||
        question.source === sourceFilter;

      const matchesDifficulty =
        difficultyFilter === "all" ||
        String(question.difficulty || "").toLowerCase() ===
          difficultyFilter;

      return (
        matchesSearch &&
        matchesSource &&
        matchesDifficulty
      );
    });
  }, [
    pendingQuestions,
    search,
    sourceFilter,
    difficultyFilter,
  ]);

  const openRejectModal = (question) => {
    setSelectedQuestion(question);
    setRejectionReason("");
    setActionError("");
    setIsRejectModalOpen(true);
  };

  const closeRejectModal = () => {
    if (rejectingId !== null) {
      return;
    }

    setIsRejectModalOpen(false);
    setSelectedQuestion(null);
    setRejectionReason("");
  };

  const closeVersionHistory = () => {
    if (versionHistoryLoading) {
      return;
    }

    setIsVersionHistoryOpen(false);
    setVersionHistory([]);
    setVersionHistoryError("");
    setVersionHistoryQuestion(null);
  };

  const loadVersionHistory = async (question) => {
    setVersionHistoryQuestion(question);
    setVersionHistory([]);
    setVersionHistoryError("");
    setIsVersionHistoryOpen(true);
    setVersionHistoryLoading(true);

    try {
      const response = await api.get(
        `/questions/${question.id}/versions`
      );

      const historyData = Array.isArray(response.data)
        ? response.data
        : [];

      setVersionHistory(historyData);
    } catch (err) {
      console.error(
        "Failed to load question version history:",
        err
      );

      if (handleUnauthorized(err)) {
        return;
      }

      setVersionHistoryError(
        getErrorMessage(
          err,
          "Unable to load question version history."
        )
      );
    } finally {
      setVersionHistoryLoading(false);
    }
  };

  const areValuesEqual = (left, right) => {
    if (
      Array.isArray(left) ||
      Array.isArray(right)
    ) {
      return JSON.stringify(left ?? null) ===
        JSON.stringify(right ?? null);
    }

    return left === right;
  };

  const getChangedFields = (previousVersion, currentVersion) => {
    if (!previousVersion) {
      return ["Initial version"];
    }

    const fields = [
      {
        key: "question_text",
        label: "Question text",
      },
      {
        key: "question_type",
        label: "Question type",
      },
      {
        key: "skill_id",
        label: "Skill",
      },
      {
        key: "difficulty",
        label: "Difficulty",
      },
      {
        key: "options",
        label: "Options",
      },
      {
        key: "correct_answer",
        label: "Answer key",
      },
      {
        key: "explanation",
        label: "Explanation",
      },
      {
        key: "source",
        label: "Source",
      },
    ];

    return fields
      .filter(
        ({ key }) =>
          !areValuesEqual(
            previousVersion[key],
            currentVersion[key]
          )
      )
      .map(({ label }) => label);
  };

  const handleApprove = async (question) => {
    setActionError("");
    setActionSuccess("");
    setApprovingId(question.id);

    try {
      await api.post(
        `/questions/${question.id}/approve`
      );

      setActionSuccess(
        "Question approved successfully and removed from the pending review queue."
      );

      await loadQuestions(true);
    } catch (err) {
      console.error(
        "Failed to approve question:",
        err
      );

      if (handleUnauthorized(err)) {
        return;
      }

      setActionError(
        getErrorMessage(
          err,
          "Unable to approve the question."
        )
      );
    } finally {
      setApprovingId(null);
    }
  };

  const handleReject = async (event) => {
    event.preventDefault();

    if (!selectedQuestion) {
      return;
    }

    const normalizedReason = rejectionReason.trim();

    if (!normalizedReason) {
      setActionError(
        "Rejection reason is required."
      );
      return;
    }

    setActionError("");
    setActionSuccess("");
    setRejectingId(selectedQuestion.id);

    try {
      await api.post(
        `/questions/${selectedQuestion.id}/reject`,
        {
          rejection_reason: normalizedReason,
        }
      );

      setActionSuccess(
        "Question rejected successfully. The rejection reason has been recorded."
      );

      setIsRejectModalOpen(false);
      setSelectedQuestion(null);
      setRejectionReason("");

      await loadQuestions(true);
    } catch (err) {
      console.error(
        "Failed to reject question:",
        err
      );

      if (handleUnauthorized(err)) {
        return;
      }

      setActionError(
        getErrorMessage(
          err,
          "Unable to reject the question."
        )
      );
    } finally {
      setRejectingId(null);
    }
  };

  return (
    <RecruiterLayout
      title="Assessment Review"
      breadcrumb="Workspace / Assessment Review"
    >
      <div className="mx-auto max-w-[1500px] space-y-6 pb-12 text-[#202938]">

        {/* =====================================================
            PAGE HEADER
        ===================================================== */}

        <section className="relative overflow-hidden rounded-[18px] border border-[#E3E6EB] bg-white px-5 py-6 shadow-[0_8px_24px_rgba(27,37,58,0.035)] sm:px-7 sm:py-7 lg:px-9 lg:py-9">
          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[#CFDEFC]/45 blur-[70px]" />
          <div className="pointer-events-none absolute right-20 top-10 h-28 w-28 rounded-full bg-[#F3E3F2]/55 blur-[35px]" />

          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-4xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#D9DEE7] bg-[#FAFBFC] px-3 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#5658E8]" />

                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#667085]">
                  Human review + system validation
                </span>
              </div>

              <h1 className="text-[29px] font-semibold leading-[1.08] tracking-[-0.035em] text-[#182033] sm:text-[34px] lg:text-[40px]">
                Assessment Review
              </h1>

              <p className="mt-2.5 max-w-3xl text-[12.5px] leading-6 text-[#667085]">
                Evalyn performs the machine-checkable validation first,
                then presents the reviewer with the context needed to
                make the final content-quality decision.
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-2.5 text-[10px] font-semibold text-[#667085]">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D9DEE7] bg-white px-3 py-1.5">
                  <ShieldCheck
                    size={13}
                    className="text-[#5658E8]"
                  />
                  Automated checks
                </span>

                <span className="text-[#A3A9B5]">
                  →
                </span>

                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D9DEE7] bg-white px-3 py-1.5">
                  <UserRound
                    size={13}
                    className="text-[#AA5E9C]"
                  />
                  Reviewer decision
                </span>

                <span className="text-[#A3A9B5]">
                  →
                </span>

                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D9DEE7] bg-white px-3 py-1.5">
                  <History
                    size={13}
                    className="text-[#7862C8]"
                  />
                  Version history
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => loadQuestions(true)}
              disabled={refreshing}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#C9D0DC] bg-white px-4 text-sm font-semibold text-[#475467] transition duration-200 hover:-translate-y-0.5 hover:border-[#5658E8] hover:text-[#5658E8] disabled:cursor-not-allowed disabled:opacity-60"
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
          </div>
        </section>

        {/* =====================================================
            ACTION MESSAGES
        ===================================================== */}

        {actionSuccess && (
          <div className="flex items-start gap-3 rounded-[18px] border border-[#CFE4D9] bg-[#F5FAF7] px-4 py-3.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#E2F3EA] text-[#28734E]">
              <CheckCircle2 size={16} />
            </span>

            <div>
              <p className="text-xs font-semibold text-[#28734E]">
                Review completed
              </p>

              <p className="mt-0.5 text-xs leading-5 text-[#4B7D63]">
                {actionSuccess}
              </p>
            </div>
          </div>
        )}

        {actionError && (
          <div className="flex items-start gap-3 rounded-[18px] border border-[#E9C8C8] bg-[#FFF8F8] px-4 py-3.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#FBE9E9] text-[#A83E3E]">
              <AlertCircle size={16} />
            </span>

            <div>
              <p className="text-xs font-semibold text-[#8F3636]">
                Review action failed
              </p>

              <p className="mt-0.5 text-xs leading-5 text-[#A83E3E]">
                {actionError}
              </p>
            </div>
          </div>
        )}

        {/* =====================================================
            SUMMARY
        ===================================================== */}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">

          <div className="relative overflow-hidden rounded-[18px] border border-[#E3E6EB] bg-white p-5 shadow-[0_8px_26px_rgba(27,37,58,0.035)]">
            <div className="absolute inset-x-0 top-0 h-0.5 bg-[#FFD8C7]" />

            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#8A94A8]">
                  Review queue
                </p>

                <p className="mt-3 text-sm font-medium text-[#667085]">
                  Pending review
                </p>

                <p className="mt-1 text-[34px] font-semibold tracking-[-0.03em] text-[#182033]">
                  {pendingQuestions.length}
                </p>
              </div>

              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#FFF1EC] text-[#A76D5B]">
                <ClipboardCheck size={17} />
              </span>
            </div>

            <p className="mt-4 text-xs leading-5 text-[#98A2B3]">
              Questions awaiting an independent reviewer decision.
            </p>
          </div>

          <div className="relative overflow-hidden rounded-[18px] border border-[#E3E6EB] bg-white p-5 shadow-[0_8px_26px_rgba(27,37,58,0.035)]">
            <div className="absolute inset-x-0 top-0 h-0.5 bg-[#D4C6F8]" />

            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#8A94A8]">
                  AI queue
                </p>

                <p className="mt-3 text-sm font-medium text-[#667085]">
                  AI-generated
                </p>

                <p className="mt-1 text-[34px] font-semibold tracking-[-0.03em] text-[#5658E8]">
                  {aiPendingQuestions.length}
                </p>
              </div>

              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#F0EEFF] text-[#5658E8]">
                <Bot size={17} />
              </span>
            </div>

            <p className="mt-4 text-xs leading-5 text-[#98A2B3]">
              AI-generated questions waiting for independent review.
            </p>
          </div>

          <div className="relative overflow-hidden rounded-[18px] border border-[#E3E6EB] bg-white p-5 shadow-[0_8px_26px_rgba(27,37,58,0.035)]">
            <div className="absolute inset-x-0 top-0 h-0.5 bg-[#CFE4D9]" />

            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#8A94A8]">
                  Approved
                </p>

                <p className="mt-3 text-sm font-medium text-[#667085]">
                  Ready content
                </p>

                <p className="mt-1 text-[34px] font-semibold tracking-[-0.03em] text-[#28734E]">
                  {approvedQuestions.length}
                </p>
              </div>

              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#E2F3EA] text-[#28734E]">
                <CheckCircle2 size={17} />
              </span>
            </div>

            <p className="mt-4 text-xs leading-5 text-[#98A2B3]">
              Questions already approved for downstream assessment use.
            </p>
          </div>

          <div className="relative overflow-hidden rounded-[18px] border border-[#E3E6EB] bg-white p-5 shadow-[0_8px_26px_rgba(27,37,58,0.035)]">
            <div className="absolute inset-x-0 top-0 h-0.5 bg-[#EDBFE5]" />

            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#8A94A8]">
                  Rejected
                </p>

                <p className="mt-3 text-sm font-medium text-[#667085]">
                  Needs revision
                </p>

                <p className="mt-1 text-[34px] font-semibold tracking-[-0.03em] text-[#AA5E9C]">
                  {rejectedQuestions.length}
                </p>
              </div>

              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#F3E3F2] text-[#AA5E9C]">
                <XCircle size={17} />
              </span>
            </div>

            <p className="mt-4 text-xs leading-5 text-[#98A2B3]">
              Questions that were rejected and require correction.
            </p>
          </div>
        </section>

        {/* =====================================================
            REVIEW PRINCIPLE
        ===================================================== */}

        <section className="rounded-[18px] border border-[#DDDFF7] bg-[#F9F9FF] px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#E9E8FF] text-[#5658E8]">
              <ShieldCheck size={16} />
            </span>

            <div>
              <p className="text-xs font-semibold text-[#36386E]">
                Review model
              </p>

              <p className="mt-1 text-xs leading-5 text-[#667085]">
                Evalyn checks the data it can validate automatically.
                The reviewer remains responsible for the final content-quality
                decision, with historical versions available for context.
              </p>
            </div>
          </div>
        </section>

        {/* =====================================================
            SEARCH + FILTERS
        ===================================================== */}

        <section className="rounded-[18px] border border-[#E3E6EB] bg-white p-4 shadow-[0_8px_26px_rgba(27,37,58,0.035)] sm:p-6">
          <div className="flex flex-col gap-4">

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#5658E8]">
                  Review queue
                </p>

                <h2 className="mt-1 text-[17px] font-semibold text-[#182033]">
                  Find and triage a question
                </h2>
              </div>

              <div className="relative w-full lg:max-w-md">
                <Search
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#98A2B3]"
                />

                <input
                  type="text"
                  value={search}
                  onChange={(event) =>
                    setSearch(event.target.value)
                  }
                  placeholder="Search question text or skill ID..."
                  className="h-11 w-full rounded-md border border-[#D4DAE4] bg-[#F8F9FC] pl-10 pr-4 text-sm text-[#202938] outline-none transition placeholder:text-[#98A2B3] hover:border-[#C4CAD6] focus:border-[#5658E8] focus:bg-white focus:ring-4 focus:ring-[#5658E8]/10"
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label
                  htmlFor="source-filter"
                  className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.15em] text-[#8A94A8]"
                >
                  Source
                </label>

                <select
                  id="source-filter"
                  value={sourceFilter}
                  onChange={(event) =>
                    setSourceFilter(event.target.value)
                  }
                  className="h-10 w-full rounded-md border border-[#D4DAE4] bg-white px-3 text-sm text-[#344054] outline-none transition focus:border-[#5658E8] focus:ring-4 focus:ring-[#5658E8]/10"
                >
                  <option value="all">
                    All sources
                  </option>

                  <option value="ai_generated">
                    AI generated
                  </option>

                  <option value="manual">
                    Manual
                  </option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="difficulty-filter"
                  className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.15em] text-[#8A94A8]"
                >
                  Difficulty
                </label>

                <select
                  id="difficulty-filter"
                  value={difficultyFilter}
                  onChange={(event) =>
                    setDifficultyFilter(event.target.value)
                  }
                  className="h-10 w-full rounded-md border border-[#D4DAE4] bg-white px-3 text-sm capitalize text-[#344054] outline-none transition focus:border-[#5658E8] focus:ring-4 focus:ring-[#5658E8]/10"
                >
                  <option value="all">
                    All difficulties
                  </option>

                  <option value="easy">
                    Easy
                  </option>

                  <option value="medium">
                    Medium
                  </option>

                  <option value="hard">
                    Hard
                  </option>
                </select>
              </div>
            </div>
          </div>
        </section>

        {/* =====================================================
            QUESTIONS
        ===================================================== */}

        <section>
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#5658E8]">
                Questions
              </p>

              <h2 className="mt-2 text-[25px] font-semibold tracking-[-0.025em] text-[#182033]">
                Pending review
              </h2>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#667085]">
                Review the system checks, inspect the content, then make
                the independent approval decision. Historical versions remain
                available for context.
              </p>
            </div>

            {!loading && !error && (
              <div className="rounded-full bg-[#F4F5F8] px-3 py-1.5 text-[10px] font-semibold text-[#667085]">
                {filteredQuestions.length}{" "}
                {filteredQuestions.length === 1
                  ? "question"
                  : "questions"}{" "}
                shown
              </div>
            )}
          </div>

          {loading ? (
            <div className="rounded-[18px] border border-[#E3E6EB] bg-white p-8 text-sm text-[#98A2B3]">
              Loading review queue...
            </div>
          ) : error ? (
            <div className="rounded-[18px] border border-[#E9C8C8] bg-[#FFF8F8] p-6">
              <div className="flex items-start gap-3">
                <AlertCircle
                  size={19}
                  className="mt-0.5 text-[#A83E3E]"
                />

                <div>
                  <p className="text-sm font-semibold text-[#8F3636]">
                    Review queue unavailable
                  </p>

                  <p className="mt-1.5 text-sm leading-6 text-[#A83E3E]">
                    {error}
                  </p>
                </div>
              </div>
            </div>
          ) : filteredQuestions.length === 0 ? (
            <div className="rounded-[18px] border border-dashed border-[#C9CEDB] bg-white p-10 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-md bg-[#F8F1EF] text-[#A76D5B]">
                <ClipboardCheck size={23} />
              </div>

              <h3 className="mt-4 text-lg font-semibold text-[#202938]">
                {search ||
                sourceFilter !== "all" ||
                difficultyFilter !== "all"
                  ? "No pending questions match these filters"
                  : "No questions are waiting for review"}
              </h3>

              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#98A2B3]">
                {search ||
                sourceFilter !== "all" ||
                difficultyFilter !== "all"
                  ? "Adjust the search or filter values to view other pending questions."
                  : "New questions submitted by Assessment Managers will appear here."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredQuestions.map((question) => {
                const isApproving =
                  approvingId === question.id;

                const isRejecting =
                  rejectingId === question.id;

                const busy =
                  isApproving || isRejecting;

                const {
                  checks,
                  passedCount,
                  totalCount,
                  allPassed,
                } = getCheckSummary(question);

                const isAiGenerated =
                  question.source === "ai_generated";

                return (
                  <article
                    key={question.id}
                    className="overflow-hidden rounded-[18px] border border-[#E3E6EB] bg-white shadow-[0_6px_20px_rgba(27,37,58,0.028)]"
                  >
                    <div className="grid lg:grid-cols-[minmax(0,1fr)_330px]">

                      {/* =================================================
                          QUESTION CONTENT
                      ================================================= */}

                      <div className="min-w-0 p-5 sm:p-6">

                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-[#F4F5F8] px-2.5 py-1 text-[10px] font-semibold text-[#667085]">
                            {question.question_type
                              ?.replace("_", " ")
                              .toUpperCase() ||
                              "QUESTION"}
                          </span>

                          <span className="rounded-full bg-[#EAE5F9] px-2.5 py-1 text-[10px] font-semibold capitalize text-[#7862C8]">
                            {question.difficulty ||
                              "medium"}
                          </span>

                          <span className="rounded-full bg-[#FFF1EC] px-2.5 py-1 text-[10px] font-semibold text-[#A76D5B]">
                            Pending Review
                          </span>

                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F3E3F2] px-2.5 py-1 text-[10px] font-semibold text-[#AA5E9C]">
                            {isAiGenerated ? (
                              <Bot size={11} />
                            ) : (
                              <FileText size={11} />
                            )}

                            {isAiGenerated
                              ? "AI Generated"
                              : "Manual"}
                          </span>

                          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D9DEE7] bg-white px-2.5 py-1 text-[10px] font-semibold text-[#667085]">
                            <History size={11} />

                            v{question.version || 1}
                          </span>
                        </div>

                        <h3 className="mt-4 text-[17px] font-semibold leading-7 text-[#202938]">
                          {question.question_text}
                        </h3>

                        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] text-[#98A2B3]">
                          <span>
                            Question ID: {question.id}
                          </span>

                          <span>
                            Skill ID: {question.skill_id}
                          </span>

                          <span>
                            Type: {question.question_type}
                          </span>

                          <span>
                            Version: {question.version || 1}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            loadVersionHistory(question)
                          }
                          className="mt-4 inline-flex items-center gap-2 rounded-md border border-[#D6D9E5] bg-white px-3.5 py-2 text-xs font-semibold text-[#5658E8] transition hover:border-[#5658E8] hover:bg-[#F8F8FF]"
                        >
                          <History size={14} />
                          View version history
                        </button>

                        {/* =================================================
                            MCQ OPTIONS
                        ================================================= */}

                        {Array.isArray(question.options) &&
                          question.options.length > 0 && (
                            <div className="mt-5 border-t border-[#E9EBEF] pt-4">
                              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#98A2B3]">
                                Options
                              </p>

                              <div className="mt-3 grid gap-2 md:grid-cols-2">
                                {question.options.map(
                                  (option, index) => (
                                    <div
                                      key={`${question.id}-${index}`}
                                      className="rounded-md border border-[#E6E9EE] bg-[#FCFCFD] px-3 py-2.5 text-sm text-[#667085]"
                                    >
                                      <span className="mr-2 font-semibold text-[#5658E8]">
                                        {String.fromCharCode(
                                          65 + index
                                        )}
                                        .
                                      </span>

                                      {option}
                                    </div>
                                  )
                                )}
                              </div>
                            </div>
                          )}

                        {/* =================================================
                            AI EXPLANATION
                        ================================================= */}

                        {isAiGenerated &&
                          question.explanation && (
                            <div className="mt-5 rounded-md border border-[#DDDFF7] bg-[#F9F9FF] p-4">
                              <div className="flex items-start gap-2.5">
                                <Bot
                                  size={15}
                                  className="mt-0.5 shrink-0 text-[#5658E8]"
                                />

                                <div>
                                  <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#5658E8]">
                                    AI explanation
                                  </p>

                                  <p className="mt-1.5 text-xs leading-5 text-[#667085]">
                                    {question.explanation}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}

                        {/* =================================================
                            REVIEW EVIDENCE
                        ================================================= */}

                        <div className="mt-5 border-t border-[#E9EBEF] pt-4">
                          <div className="flex items-center gap-2">
                            <Clock3
                              size={14}
                              className="text-[#98A2B3]"
                            />

                            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#98A2B3]">
                              Review evidence
                            </p>
                          </div>

                          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                            <div className="rounded-md border border-[#E8EBEF] bg-[#FCFCFD] px-3 py-2.5">
                              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#A0A8B8]">
                                Source
                              </p>

                              <p className="mt-1 text-xs font-semibold text-[#475467]">
                                {isAiGenerated
                                  ? "AI generated"
                                  : "Manual"}
                              </p>
                            </div>

                            <div className="rounded-md border border-[#E8EBEF] bg-[#FCFCFD] px-3 py-2.5">
                              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#A0A8B8]">
                                Creator
                              </p>

                              <p className="mt-1 text-xs font-semibold text-[#475467]">
                                {question.created_by ??
                                  "Not recorded"}
                              </p>
                            </div>

                            <div className="rounded-md border border-[#E8EBEF] bg-[#FCFCFD] px-3 py-2.5">
                              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#A0A8B8]">
                                Submitted
                              </p>

                              <p className="mt-1 text-xs font-semibold text-[#475467]">
                                {question.created_at
                                  ? new Date(
                                      question.created_at
                                    ).toLocaleString()
                                  : "Not recorded"}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* =================================================
                          REVIEW CONTROL PANEL
                      ================================================= */}

                      <div className="border-t border-[#E8EBEF] bg-[#FAFBFC] p-5 lg:border-l lg:border-t-0">

                        {/* =================================================
                            SYSTEM CHECKS
                        ================================================= */}

                        <div>
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#98A2B3]">
                                System checks
                              </p>

                              <p className="mt-1 text-sm font-semibold text-[#202938]">
                                {passedCount}/
                                {totalCount} checks passed
                              </p>
                            </div>

                            <span
                              className={
                                allPassed
                                  ? "inline-flex items-center gap-1.5 rounded-full bg-[#E2F3EA] px-2.5 py-1.5 text-[10px] font-bold text-[#28734E]"
                                  : "inline-flex items-center gap-1.5 rounded-full bg-[#FFF1EC] px-2.5 py-1.5 text-[10px] font-bold text-[#A76D5B]"
                              }
                            >
                              {allPassed ? (
                                <CheckCircle2 size={12} />
                              ) : (
                                <AlertCircle size={12} />
                              )}

                              {allPassed
                                ? "Ready for review"
                                : "Needs attention"}
                            </span>
                          </div>

                          <div className="mt-4 space-y-2">
                            {checks.map((check) => (
                              <div
                                key={check.label}
                                className="flex items-center justify-between gap-3 rounded-md border border-[#E7E9ED] bg-white px-3 py-2.5"
                              >
                                <span className="text-[11px] font-medium text-[#667085]">
                                  {check.label}
                                </span>

                                {check.passed ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#28734E]">
                                    <CheckCircle2 size={12} />
                                    Pass
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#A83E3E]">
                                    <XCircle size={12} />
                                    Check
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>

                          <p className="mt-3 text-[10px] leading-5 text-[#98A2B3]">
                            These checks cover fields visible to the review
                            workspace. They support the reviewer but do not
                            replace the independent content-quality decision.
                          </p>
                        </div>

                        {/* =================================================
                            ANSWER KEY
                        ================================================= */}

                        <div className="mt-6 border-t border-[#E1E4EA] pt-5">
                          <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#98A2B3]">
                            Answer key
                          </p>

                          {question.correct_answer ? (
                            <div className="mt-3 rounded-md border border-[#D8DBF7] bg-[#F8F8FF] px-4 py-3">
                              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#8A94A8]">
                                Correct response
                              </p>

                              <p className="mt-1.5 break-words text-sm font-semibold text-[#5658E8]">
                                {question.correct_answer}
                              </p>
                            </div>
                          ) : (
                            <div className="mt-3 rounded-md border border-dashed border-[#D9DEE7] bg-white px-4 py-3">
                              <p className="text-xs leading-5 text-[#98A2B3]">
                                Not required for free-text questions.
                              </p>
                            </div>
                          )}
                        </div>

                        {/* =================================================
                            DECISION
                        ================================================= */}

                        <div className="mt-5 border-t border-[#E1E4EA] pt-5">
                          <div className="flex items-center gap-2">
                            <UserRound
                              size={14}
                              className="text-[#AA5E9C]"
                            />

                            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#98A2B3]">
                              Reviewer decision
                            </p>
                          </div>

                          <p className="mt-2 text-xs leading-5 text-[#667085]">
                            The reviewer makes the final content decision
                            after considering the question and system checks.
                          </p>

                          <div className="mt-4 grid gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                handleApprove(question)
                              }
                              disabled={busy || !allPassed}
                              title={
                                !allPassed
                                  ? "Resolve the visible system check failures before approving."
                                  : "Approve question"
                              }
                              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#28734E] px-4 text-sm font-semibold text-white transition hover:bg-[#236542] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isApproving ? (
                                <RefreshCw
                                  size={15}
                                  className="animate-spin"
                                />
                              ) : (
                                <CheckCircle2 size={15} />
                              )}

                              {isApproving
                                ? "Approving..."
                                : "Approve"}
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                openRejectModal(question)
                              }
                              disabled={busy}
                              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#D8B7B0] bg-white px-4 text-sm font-semibold text-[#A76D5B] transition hover:border-[#A76D5B] hover:bg-[#FFF8F6] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <XCircle size={15} />
                              Reject
                            </button>
                          </div>

                          {!allPassed && (
                            <div className="mt-3 rounded-md border border-[#EBCFC6] bg-[#FFF8F6] px-3 py-2.5">
                              <p className="text-[10px] leading-5 text-[#A76D5B]">
                                Approval is disabled until the visible
                                system-check failures are resolved.
                              </p>
                            </div>
                          )}
                        </div>

                        {/* =================================================
                            REVIEW STATUS
                        ================================================= */}

                        <div className="mt-5 rounded-md border border-[#E4E6EB] bg-white px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#98A2B3]">
                              Current status
                            </span>

                            <span className="rounded-full bg-[#FFF1EC] px-2.5 py-1 text-[10px] font-semibold text-[#A76D5B]">
                              Pending review
                            </span>
                          </div>

                          <p className="mt-2 text-[10px] leading-5 text-[#98A2B3]">
                            Reviewer decisions are persisted by the existing
                            backend approval/rejection workflow.
                          </p>
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
            REJECTION MODAL
        ===================================================== */}

        {isRejectModalOpen && selectedQuestion && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-[#172033]/55 px-3 py-3 backdrop-blur-[4px] sm:items-center sm:px-4"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                closeRejectModal();
              }
            }}
          >
            <div
              className="w-full max-w-xl overflow-hidden rounded-[18px] border border-[#E3E6EB] bg-white shadow-[0_24px_64px_rgba(38,40,79,0.22)]"
              role="dialog"
              aria-modal="true"
              aria-labelledby="reject-question-title"
            >
              <div className="flex items-center justify-between bg-[#26284F] px-5 py-4 sm:px-6">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#FFD8C7]">
                    Assessment review
                  </p>

                  <h2
                    id="reject-question-title"
                    className="mt-1 text-[21px] font-semibold tracking-[-0.02em] text-white"
                  >
                    Reject question
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={closeRejectModal}
                  disabled={rejectingId !== null}
                  aria-label="Close"
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.06] text-[#E1E5F2] transition hover:bg-white/[0.12] hover:text-white disabled:opacity-50"
                >
                  <X size={18} />
                </button>
              </div>

              <form
                onSubmit={handleReject}
                className="space-y-5 p-5 sm:p-6"
              >
                <div className="rounded-md border border-[#E8EBEF] bg-[#FAFBFC] p-4">
                  <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#98A2B3]">
                    Question
                  </p>

                  <p className="mt-2 text-sm font-semibold leading-6 text-[#202938]">
                    {selectedQuestion.question_text}
                  </p>
                </div>

                {actionError && (
                  <div className="flex items-start gap-3 rounded-md border border-[#E9C8C8] bg-[#FBF2F2] px-4 py-3 text-[12.5px] leading-5 text-[#A83E3E]">
                    <AlertCircle
                      size={17}
                      className="mt-0.5 shrink-0"
                    />

                    <span>{actionError}</span>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="rejection-reason"
                    className="mb-2 block text-[12.5px] font-semibold text-[#344054]"
                  >
                    Rejection reason
                  </label>

                  <textarea
                    id="rejection-reason"
                    value={rejectionReason}
                    onChange={(event) =>
                      setRejectionReason(
                        event.target.value
                      )
                    }
                    rows={5}
                    autoFocus
                    placeholder="Explain what needs to be corrected or improved..."
                    className="w-full rounded-md border border-[#D7DDE6] bg-[#F8F9FC] px-4 py-3 text-sm leading-6 text-[#202938] outline-none transition placeholder:text-[#98A2B3] focus:border-[#5658E8] focus:bg-white focus:ring-4 focus:ring-[#5658E8]/10"
                  />
                </div>

                <div className="rounded-md border border-[#E7E9EE] bg-[#FAFBFC] px-4 py-3">
                  <p className="text-[10px] leading-5 text-[#667085]">
                    Rejection requires a recorded reason so the question
                    owner has actionable feedback for revision.
                  </p>
                </div>

                <div className="flex flex-col-reverse gap-3 border-t border-[#E4E7EC] pt-5 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={closeRejectModal}
                    disabled={rejectingId !== null}
                    className="h-11 rounded-md border border-[#B8C0CB] bg-white px-5 text-sm font-medium text-[#667085] transition hover:border-[#5658E8] hover:bg-[#F8F8FF] hover:text-[#5658E8] disabled:opacity-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={
                      rejectingId !== null ||
                      !rejectionReason.trim()
                    }
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#A76D5B] px-5 text-sm font-semibold text-white transition hover:bg-[#955D4D] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {rejectingId !== null ? (
                      <>
                        <RefreshCw
                          size={15}
                          className="animate-spin"
                        />
                        Rejecting...
                      </>
                    ) : (
                      <>
                        <XCircle size={15} />
                        Reject Question
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* =====================================================
            VERSION HISTORY MODAL
        ===================================================== */}

        {isVersionHistoryOpen &&
          versionHistoryQuestion && (
            <div
              className="fixed inset-0 z-50 flex items-end justify-center bg-[#172033]/55 px-3 py-3 backdrop-blur-[4px] sm:items-center sm:px-4"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  closeVersionHistory();
                }
              }}
            >
              <div
                className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-[20px] border border-[#E3E6EB] bg-white shadow-[0_24px_72px_rgba(38,40,79,0.22)]"
                role="dialog"
                aria-modal="true"
                aria-labelledby="version-history-title"
              >
                <div className="flex items-center justify-between bg-[#26284F] px-5 py-4 sm:px-6">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <History
                        size={16}
                        className="text-[#FFD8C7]"
                      />

                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#FFD8C7]">
                        Question lifecycle
                      </p>
                    </div>

                    <h2
                      id="version-history-title"
                      className="mt-1 truncate text-[21px] font-semibold tracking-[-0.02em] text-white"
                    >
                      Version history
                    </h2>

                    <p className="mt-1 max-w-3xl truncate text-xs text-[#D8DCE9]">
                      Question #{versionHistoryQuestion.id}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={closeVersionHistory}
                    disabled={versionHistoryLoading}
                    aria-label="Close version history"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.06] text-[#E1E5F2] transition hover:bg-white/[0.12] hover:text-white disabled:opacity-50"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="max-h-[calc(90vh-80px)] overflow-y-auto p-5 sm:p-6">

                  {/* =================================================
                      CURRENT VERSION SUMMARY
                  ================================================= */}

                  <div className="rounded-[18px] border border-[#DDDFF7] bg-[#F9F9FF] p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#5658E8]">
                          Current question
                        </p>

                        <h3 className="mt-2 text-[16px] font-semibold leading-7 text-[#202938]">
                          {versionHistoryQuestion.question_text}
                        </h3>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-[#667085]">
                            v{versionHistoryQuestion.version || 1}
                          </span>

                          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold capitalize text-[#7862C8]">
                            {versionHistoryQuestion.difficulty}
                          </span>

                          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-[#667085]">
                            {versionHistoryQuestion.question_type}
                          </span>

                          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-[#AA5E9C]">
                            {versionHistoryQuestion.source ===
                            "ai_generated"
                              ? "AI Generated"
                              : "Manual"}
                          </span>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2 rounded-md border border-[#E2E4F0] bg-white px-3 py-2">
                        <History
                          size={14}
                          className="text-[#5658E8]"
                        />

                        <span className="text-[11px] font-semibold text-[#475467]">
                          {versionHistory.length}{" "}
                          {versionHistory.length === 1
                            ? "version"
                            : "versions"}{" "}
                          retained
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* =================================================
                      LOADING
                  ================================================= */}

                  {versionHistoryLoading && (
                    <div className="mt-5 flex items-center justify-center rounded-[18px] border border-[#E3E6EB] bg-white p-10">
                      <div className="flex items-center gap-2 text-sm font-medium text-[#667085]">
                        <RefreshCw
                          size={16}
                          className="animate-spin text-[#5658E8]"
                        />
                        Loading version history...
                      </div>
                    </div>
                  )}

                  {/* =================================================
                      ERROR
                  ================================================= */}

                  {!versionHistoryLoading &&
                    versionHistoryError && (
                      <div className="mt-5 rounded-[18px] border border-[#E9C8C8] bg-[#FFF8F8] p-5">
                        <div className="flex items-start gap-3">
                          <AlertCircle
                            size={18}
                            className="mt-0.5 text-[#A83E3E]"
                          />

                          <div>
                            <p className="text-sm font-semibold text-[#8F3636]">
                              Version history unavailable
                            </p>

                            <p className="mt-1.5 text-sm leading-6 text-[#A83E3E]">
                              {versionHistoryError}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                  {/* =================================================
                      VERSION TIMELINE
                  ================================================= */}

                  {!versionHistoryLoading &&
                    !versionHistoryError &&
                    versionHistory.length > 0 && (
                      <div className="mt-6">
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#5658E8]">
                              Historical record
                            </p>

                            <h3 className="mt-1 text-[18px] font-semibold text-[#182033]">
                              Content timeline
                            </h3>
                          </div>

                          <span className="hidden rounded-full bg-[#F4F5F8] px-3 py-1.5 text-[10px] font-semibold text-[#667085] sm:inline-flex">
                            Immutable snapshots
                          </span>
                        </div>

                        <div className="space-y-4">
                          {versionHistory.map(
                            (version, index) => {
                              const previousVersion =
                                versionHistory[index - 1];

                              const changedFields =
                                getChangedFields(
                                  previousVersion,
                                  version
                                );

                              const isCurrentVersion =
                                version.version ===
                                versionHistoryQuestion.version;

                              return (
                                <article
                                  key={version.id}
                                  className={
                                    isCurrentVersion
                                      ? "rounded-[18px] border border-[#CFCDF4] bg-[#FBFBFF] p-5"
                                      : "rounded-[18px] border border-[#E3E6EB] bg-white p-5"
                                  }
                                >
                                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="flex min-w-0 gap-3">
                                      <div
                                        className={
                                          isCurrentVersion
                                            ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#E9E8FF] text-[#5658E8]"
                                            : "flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#F4F5F8] text-[#667085]"
                                        }
                                      >
                                        <History
                                          size={17}
                                        />
                                      </div>

                                      <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <h4 className="text-sm font-semibold text-[#202938]">
                                            Version{" "}
                                            {version.version}
                                          </h4>

                                          {isCurrentVersion && (
                                            <span className="rounded-full bg-[#E9E8FF] px-2.5 py-1 text-[10px] font-bold text-[#5658E8]">
                                              Current
                                            </span>
                                          )}
                                        </div>

                                        <p className="mt-1 text-[10px] text-[#98A2B3]">
                                          Recorded{" "}
                                          {version.created_at
                                            ? new Date(
                                                version.created_at
                                              ).toLocaleString()
                                            : "timestamp unavailable"}
                                        </p>

                                        <p className="mt-0.5 text-[10px] text-[#98A2B3]">
                                          Changed by{" "}
                                          {version.changed_by ??
                                            "Not recorded"}
                                        </p>
                                      </div>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                      {changedFields.map(
                                        (field) => (
                                          <span
                                            key={`${version.id}-${field}`}
                                            className="rounded-full border border-[#E0E3EA] bg-white px-2.5 py-1 text-[10px] font-semibold text-[#667085]"
                                          >
                                            {field}
                                          </span>
                                        )
                                      )}
                                    </div>
                                  </div>

                                  <div className="mt-5 grid gap-4 lg:grid-cols-2">
                                    <div className="rounded-md border border-[#E7E9EE] bg-[#FCFCFD] p-4">
                                      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#98A2B3]">
                                        Question
                                      </p>

                                      <p className="mt-2 text-sm font-semibold leading-6 text-[#202938]">
                                        {version.question_text}
                                      </p>
                                    </div>

                                    <div className="grid gap-3 sm:grid-cols-3">
                                      <div className="rounded-md border border-[#E7E9EE] bg-[#FCFCFD] p-3">
                                        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#98A2B3]">
                                          Skill
                                        </p>

                                        <p className="mt-1 text-xs font-semibold text-[#475467]">
                                          {version.skill_id}
                                        </p>
                                      </div>

                                      <div className="rounded-md border border-[#E7E9EE] bg-[#FCFCFD] p-3">
                                        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#98A2B3]">
                                          Difficulty
                                        </p>

                                        <p className="mt-1 text-xs font-semibold capitalize text-[#475467]">
                                          {version.difficulty}
                                        </p>
                                      </div>

                                      <div className="rounded-md border border-[#E7E9EE] bg-[#FCFCFD] p-3">
                                        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#98A2B3]">
                                          Type
                                        </p>

                                        <p className="mt-1 text-xs font-semibold text-[#475467]">
                                          {version.question_type}
                                        </p>
                                      </div>
                                    </div>
                                  </div>

                                  {Array.isArray(
                                    version.options
                                  ) &&
                                    version.options.length > 0 && (
                                      <div className="mt-4 rounded-md border border-[#E7E9EE] bg-[#FCFCFD] p-4">
                                        <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#98A2B3]">
                                          Options
                                        </p>

                                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                                          {version.options.map(
                                            (
                                              option,
                                              optionIndex
                                            ) => (
                                              <div
                                                key={`${version.id}-${optionIndex}`}
                                                className="rounded-md border border-[#E6E9EE] bg-white px-3 py-2.5 text-sm text-[#667085]"
                                              >
                                                <span className="mr-2 font-semibold text-[#5658E8]">
                                                  {String.fromCharCode(
                                                    65 +
                                                      optionIndex
                                                  )}
                                                  .
                                                </span>

                                                {option}
                                              </div>
                                            )
                                          )}
                                        </div>
                                      </div>
                                    )}

                                  {version.correct_answer && (
                                    <div className="mt-4 rounded-md border border-[#D8DBF7] bg-[#F8F8FF] p-4">
                                      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#8A94A8]">
                                        Answer key
                                      </p>

                                      <p className="mt-1.5 text-sm font-semibold text-[#5658E8]">
                                        {version.correct_answer}
                                      </p>
                                    </div>
                                  )}

                                  {version.explanation && (
                                    <div className="mt-4 rounded-md border border-[#E7E9EE] bg-[#FCFCFD] p-4">
                                      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#98A2B3]">
                                        Explanation
                                      </p>

                                      <p className="mt-1.5 text-xs leading-5 text-[#667085]">
                                        {version.explanation}
                                      </p>
                                    </div>
                                  )}
                                </article>
                              );
                            }
                          )}
                        </div>
                      </div>
                    )}

                  {!versionHistoryLoading &&
                    !versionHistoryError &&
                    versionHistory.length === 0 && (
                      <div className="mt-5 rounded-[18px] border border-dashed border-[#C9CEDB] bg-white p-10 text-center">
                        <History
                          size={24}
                          className="mx-auto text-[#98A2B3]"
                        />

                        <h3 className="mt-3 text-sm font-semibold text-[#202938]">
                          No historical versions found
                        </h3>

                        <p className="mx-auto mt-1.5 max-w-md text-xs leading-5 text-[#98A2B3]">
                          This question does not currently have
                          version-history records available.
                        </p>
                      </div>
                    )}
                </div>
              </div>
            </div>
          )}
      </div>
    </RecruiterLayout>
  );
}

export default ReviewerWorkspace;