import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  RefreshCw,
  Search,
  X,
  XCircle,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import RecruiterLayout from "../layouts/RecruiterLayout";

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

  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

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

  const filteredQuestions = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) {
      return pendingQuestions;
    }

    return pendingQuestions.filter((question) =>
      String(question.question_text || "")
        .toLowerCase()
        .includes(normalizedSearch)
    );
  }, [pendingQuestions, search]);

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

  const handleApprove = async (question) => {
    setActionError("");
    setActionSuccess("");
    setApprovingId(question.id);

    try {
      await api.post(`/questions/${question.id}/approve`);

      setActionSuccess(
        "Question approved successfully."
      );

      await loadQuestions(true);
    } catch (err) {
      console.error("Failed to approve question:", err);

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
      setActionError("Rejection reason is required.");
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
        "Question rejected successfully."
      );

      setIsRejectModalOpen(false);
      setSelectedQuestion(null);
      setRejectionReason("");

      await loadQuestions(true);
    } catch (err) {
      console.error("Failed to reject question:", err);

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
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#D9DEE7] bg-[#FAFBFC] px-3 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#A76D5B]" />
                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#667085]">
                  Maker-checker workflow
                </span>
              </div>

              <h1 className="text-[29px] font-semibold leading-[1.08] tracking-[-0.035em] text-[#182033] sm:text-[34px] lg:text-[40px]">
                Assessment Review
              </h1>

              <p className="mt-2.5 max-w-2xl text-[12.5px] leading-6 text-[#667085]">
                Review questions submitted by Assessment Managers
                before they become available for assessments.
              </p>
            </div>

            <button
              type="button"
              onClick={() => loadQuestions(true)}
              disabled={refreshing}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#C9D0DC] bg-white px-4 text-sm font-semibold text-[#475467] transition duration-200 hover:-translate-y-0.5 hover:border-[#5658E8] hover:text-[#5658E8] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                size={15}
                className={refreshing ? "animate-spin" : ""}
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

        <section className="grid gap-4 md:grid-cols-3">
          <div className="relative overflow-hidden rounded-[18px] border border-[#E3E6EB] bg-white p-5 shadow-[0_8px_26px_rgba(27,37,58,0.035)]">
            <div className="absolute inset-x-0 top-0 h-0.5 bg-[#FFD8C7]" />

            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#8A94A8]">
              Review queue
            </p>

            <p className="mt-3 text-sm font-medium text-[#667085]">
              Pending review
            </p>

            <p className="mt-1 text-[34px] font-semibold tracking-[-0.03em] text-[#182033]">
              {pendingQuestions.length}
            </p>

            <p className="mt-4 text-xs text-[#98A2B3]">
              Questions awaiting an independent reviewer decision.
            </p>
          </div>

          <div className="relative overflow-hidden rounded-[18px] border border-[#E3E6EB] bg-white p-5 shadow-[0_8px_26px_rgba(27,37,58,0.035)]">
            <div className="absolute inset-x-0 top-0 h-0.5 bg-[#D4C6F8]" />

            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#8A94A8]">
              Workflow
            </p>

            <p className="mt-3 text-sm font-medium text-[#667085]">
              Reviewer action
            </p>

            <p className="mt-1 text-lg font-semibold text-[#5658E8]">
              Approve or Reject
            </p>

            <p className="mt-3 text-xs text-[#98A2B3]">
              Each decision is recorded against the reviewing user.
            </p>
          </div>

          <div className="relative overflow-hidden rounded-[18px] border border-[#E3E6EB] bg-white p-5 shadow-[0_8px_26px_rgba(27,37,58,0.035)]">
            <div className="absolute inset-x-0 top-0 h-0.5 bg-[#EDBFE5]" />

            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#8A94A8]">
              Integrity
            </p>

            <p className="mt-3 text-sm font-medium text-[#667085]">
              Independent review
            </p>

            <p className="mt-1 text-lg font-semibold text-[#AA5E9C]">
              Maker ≠ Checker
            </p>

            <p className="mt-3 text-xs text-[#98A2B3]">
              The question creator cannot approve or reject their own question.
            </p>
          </div>
        </section>

        {/* =====================================================
            SEARCH
        ===================================================== */}

        <section className="rounded-[18px] border border-[#E3E6EB] bg-white p-4 shadow-[0_8px_26px_rgba(27,37,58,0.035)] sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#5658E8]">
                Review queue
              </p>

              <h2 className="mt-1 text-[17px] font-semibold text-[#182033]">
                Find a question
              </h2>
            </div>

            <div className="relative w-full sm:max-w-md">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#98A2B3]"
              />

              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search pending questions..."
                className="h-11 w-full rounded-md border border-[#D4DAE4] bg-[#F8F9FC] pl-10 pr-4 text-sm text-[#202938] outline-none transition placeholder:text-[#98A2B3] hover:border-[#C4CAD6] focus:border-[#5658E8] focus:bg-white focus:ring-4 focus:ring-[#5658E8]/10"
              />
            </div>
          </div>
        </section>

        {/* =====================================================
            QUESTIONS
        ===================================================== */}

        <section>
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#5658E8]">
                Questions
              </p>

              <h2 className="mt-2 text-[25px] font-semibold tracking-[-0.025em] text-[#182033]">
                Pending review
              </h2>

              <p className="mt-2 text-sm leading-6 text-[#667085]">
                Approve valid questions or reject them with a clear reason.
              </p>
            </div>

            {!loading && !error && (
              <div className="rounded-full bg-[#F4F5F8] px-3 py-1.5 text-[10px] font-semibold text-[#667085]">
                {filteredQuestions.length}{" "}
                {filteredQuestions.length === 1
                  ? "question"
                  : "questions"}
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
                {search
                  ? "No pending questions match your search"
                  : "No questions are waiting for review"}
              </h3>

              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#98A2B3]">
                {search
                  ? "Try a different search term."
                  : "New questions submitted by Assessment Managers will appear here."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredQuestions.map((question) => {
                const isApproving = approvingId === question.id;
                const isRejecting = rejectingId === question.id;
                const busy = isApproving || isRejecting;

                return (
                  <article
                    key={question.id}
                    className="overflow-hidden rounded-[18px] border border-[#E3E6EB] bg-white shadow-[0_6px_20px_rgba(27,37,58,0.028)]"
                  >
                    <div className="grid lg:grid-cols-[minmax(0,1fr)_260px]">
                      <div className="min-w-0 p-5 sm:p-6">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-[#F4F5F8] px-2.5 py-1 text-[10px] font-semibold text-[#667085]">
                            {question.question_type
                              ?.replace("_", " ")
                              .toUpperCase() || "QUESTION"}
                          </span>

                          <span className="rounded-full bg-[#EAE5F9] px-2.5 py-1 text-[10px] font-semibold capitalize text-[#7862C8]">
                            {question.difficulty || "medium"}
                          </span>

                          <span className="rounded-full bg-[#FFF1EC] px-2.5 py-1 text-[10px] font-semibold text-[#A76D5B]">
                            Pending Review
                          </span>

                          {question.source && (
                            <span className="rounded-full bg-[#F3E3F2] px-2.5 py-1 text-[10px] font-semibold text-[#AA5E9C]">
                              {question.source === "ai_generated"
                                ? "AI Generated"
                                : "Manual"}
                            </span>
                          )}
                        </div>

                        <h3 className="mt-4 text-[17px] font-semibold leading-7 text-[#202938]">
                          {question.question_text}
                        </h3>

                        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] text-[#98A2B3]">
                          <span>Question ID: {question.id}</span>
                          <span>Skill ID: {question.skill_id}</span>
                        </div>

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
                      </div>

                      <div className="border-t border-[#E8EBEF] bg-[#FAFBFC] p-5 lg:border-l lg:border-t-0">
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

                        <div className="mt-5 grid gap-2">
                          <button
                            type="button"
                            onClick={() => handleApprove(question)}
                            disabled={busy}
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
                      setRejectionReason(event.target.value)
                    }
                    rows={5}
                    autoFocus
                    placeholder="Explain why this question should be revised..."
                    className="w-full rounded-md border border-[#D7DDE6] bg-[#F8F9FC] px-4 py-3 text-sm leading-6 text-[#202938] outline-none transition placeholder:text-[#98A2B3] focus:border-[#5658E8] focus:bg-white focus:ring-4 focus:ring-[#5658E8]/10"
                  />
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
      </div>
    </RecruiterLayout>
  );
}

export default ReviewerWorkspace;