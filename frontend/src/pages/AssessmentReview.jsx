import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  FileText,
  RefreshCw,
  ShieldCheck,
  UserRound,
  XCircle,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import RecruiterLayout from "../layouts/RecruiterLayout";


function AssessmentReview() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [queue, setQueue] = useState([]);
  const [selectedAssessmentId, setSelectedAssessmentId] =
    useState(null);
  const [reviewPackage, setReviewPackage] = useState(null);

  const [loading, setLoading] = useState(true);
  const [packageLoading, setPackageLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState(false);

  const [error, setError] = useState("");
  const [packageError, setPackageError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  const [decisionComment, setDecisionComment] = useState("");

  const handleAuthError = (err) => {
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

  const loadQueue = async (showRefreshState = false) => {
    try {
      setError("");

      if (showRefreshState) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const response = await api.get(
        "/assessment-reviews/queue"
      );

      const data = Array.isArray(response.data)
        ? response.data
        : [];

      setQueue(data);

      if (
        selectedAssessmentId !== null &&
        !data.some(
          (item) => item.id === selectedAssessmentId
        )
      ) {
        setSelectedAssessmentId(null);
        setReviewPackage(null);
      }
    } catch (err) {
      console.error(
        "Failed to load assessment review queue:",
        err
      );

      if (handleAuthError(err)) {
        return;
      }

      setError(
        getErrorMessage(
          err,
          "Unable to load the assessment review queue."
        )
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadReviewPackage = async (assessmentId) => {
    setSelectedAssessmentId(assessmentId);
    setPackageLoading(true);
    setPackageError("");
    setActionError("");
    setActionSuccess("");

    try {
      const response = await api.get(
        `/assessment-reviews/${assessmentId}`
      );

      setReviewPackage(response.data);
      setDecisionComment("");
    } catch (err) {
      console.error(
        "Failed to load assessment review package:",
        err
      );

      if (handleAuthError(err)) {
        return;
      }

      setReviewPackage(null);

      setPackageError(
        getErrorMessage(
          err,
          "Unable to load the assessment review package."
        )
      );
    } finally {
      setPackageLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const pendingCount = queue.length;

  const totalQuestions = useMemo(() => {
    if (!reviewPackage) {
      return 0;
    }

    return reviewPackage.questions?.length || 0;
  }, [reviewPackage]);

  const handleApprove = async () => {
    if (!reviewPackage) {
      return;
    }

    setActing(true);
    setActionError("");
    setActionSuccess("");

    try {
      await api.post(
        `/assessment-reviews/${reviewPackage.assessment_id}/approve`,
        {
          comment: decisionComment.trim() || null,
        }
      );

      setActionSuccess(
        `Assessment Variant ${
          reviewPackage.variant_number ?? ""
        } approved successfully.`
      );

      setReviewPackage(null);
      setSelectedAssessmentId(null);
      setDecisionComment("");

      await loadQueue(true);
    } catch (err) {
      console.error(
        "Failed to approve assessment:",
        err
      );

      if (handleAuthError(err)) {
        return;
      }

      setActionError(
        getErrorMessage(
          err,
          "Unable to approve the assessment."
        )
      );
    } finally {
      setActing(false);
    }
  };

  const handleReject = async () => {
    if (!reviewPackage) {
      return;
    }

    const normalizedComment = decisionComment.trim();

    if (!normalizedComment) {
      setActionError(
        "Enter a rejection reason before rejecting the assessment."
      );
      return;
    }

    setActing(true);
    setActionError("");
    setActionSuccess("");

    try {
      await api.post(
        `/assessment-reviews/${reviewPackage.assessment_id}/reject`,
        {
          comment: normalizedComment,
        }
      );

      setActionSuccess(
        `Assessment Variant ${
          reviewPackage.variant_number ?? ""
        } rejected successfully.`
      );

      setReviewPackage(null);
      setSelectedAssessmentId(null);
      setDecisionComment("");

      await loadQueue(true);
    } catch (err) {
      console.error(
        "Failed to reject assessment:",
        err
      );

      if (handleAuthError(err)) {
        return;
      }

      setActionError(
        getErrorMessage(
          err,
          "Unable to reject the assessment."
        )
      );
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <RecruiterLayout
        title="Assessment Review"
        breadcrumb="Workspace / Assessment Review / Assessments"
      >
        <main className="mx-auto flex min-h-[65vh] max-w-[1500px] items-center justify-center px-5 sm:px-8">
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAE5F9]">
              <RefreshCw
                size={25}
                className="animate-spin text-[#5658E8]"
              />
            </div>

            <p className="mt-5 text-sm font-semibold text-[#344054]">
              Loading assessment review queue
            </p>

            <p className="mt-1.5 text-xs text-[#98A2B3]">
              Fetching assessments waiting for independent review.
            </p>
          </div>
        </main>
      </RecruiterLayout>
    );
  }

  if (error) {
    return (
      <RecruiterLayout
        title="Assessment Review"
        breadcrumb="Workspace / Assessment Review / Assessments"
      >
        <main className="mx-auto flex min-h-[65vh] max-w-[1500px] items-center justify-center px-5 sm:px-8">
          <div className="w-full max-w-2xl rounded-[22px] border border-[#F0D5D5] bg-white p-8 shadow-[0_18px_45px_rgba(38,40,79,0.05)] sm:p-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#FCE7E7] text-[#B42318]">
              <AlertCircle size={20} />
            </div>

            <p className="mt-6 text-[9px] font-bold uppercase tracking-[0.2em] text-[#B42318]">
              Assessment review
            </p>

            <h1 className="mt-3 text-[32px] font-semibold tracking-[-0.03em] text-[#182033]">
              Review queue unavailable
            </h1>

            <p className="mt-3 text-sm leading-7 text-[#667085]">
              {error}
            </p>

            <button
              type="button"
              onClick={() => loadQueue()}
              className="mt-7 inline-flex items-center justify-center gap-2 rounded-lg bg-[#5658E8] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#494BD8]"
            >
              <RefreshCw size={15} />
              Try again
            </button>
          </div>
        </main>
      </RecruiterLayout>
    );
  }

  return (
    <RecruiterLayout
      title="Assessment Review"
      breadcrumb="Workspace / Assessment Review / Assessments"
    >
      <main className="mx-auto max-w-[1500px] px-4 pb-12 sm:px-8">

        {/* =====================================================
            HEADER
        ===================================================== */}

        <section className="relative overflow-hidden rounded-[24px] border border-[#DDE1E9] bg-white shadow-[0_12px_34px_rgba(38,40,79,0.04)]">
          <div className="h-1 bg-gradient-to-r from-[#CFDEFC] via-[#EAE5F9] to-[#F3E3F2]" />

          <div className="pointer-events-none absolute right-[-80px] top-[-80px] h-56 w-56 rounded-full bg-[#EAE5F9]/65 blur-[70px]" />

          <div className="relative p-6 sm:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-4xl">
                <button
                  type="button"
                  onClick={() => navigate("/review")}
                  className="group inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#667085] transition hover:-translate-x-0.5 hover:bg-[#F7F8FC] hover:text-[#5658E8]"
                >
                  <ArrowLeft size={14} />
                  Question Review
                </button>

                <div className="mt-6 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EAE5F9] text-[#7862C8]">
                    <ShieldCheck size={20} />
                  </div>

                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#7862C8]">
                      Independent assessment review
                    </p>

                    <p className="mt-1 text-[10px] text-[#98A2B3]">
                      Reviewer workspace
                    </p>
                  </div>
                </div>

                <h1 className="mt-5 text-[34px] font-semibold tracking-[-0.035em] text-[#182033] sm:text-[42px]">
                  Assessment Review Queue
                </h1>

                <p className="mt-3 max-w-3xl text-sm leading-7 text-[#667085]">
                  Review the complete assessment variant before it
                  becomes eligible for the publishing workflow.
                </p>
              </div>

              <button
                type="button"
                onClick={() => loadQueue(true)}
                disabled={refreshing || acting}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#CBD1DC] bg-white px-4 text-xs font-semibold text-[#475467] transition hover:border-[#5658E8] hover:bg-[#FAFAFF] hover:text-[#5658E8] disabled:cursor-not-allowed disabled:opacity-60"
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
          </div>
        </section>

        {/* =====================================================
            MESSAGES
        ===================================================== */}

        {(actionSuccess || actionError) && (
          <section className="mt-6">
            {actionSuccess && (
              <div className="flex items-start gap-3 rounded-xl border border-[#CFE6DD] bg-[#F2FAF7] px-4 py-3.5">
                <CheckCircle2
                  size={17}
                  className="mt-0.5 shrink-0 text-[#17655E]"
                />

                <div>
                  <p className="text-sm font-semibold text-[#17655E]">
                    Review decision recorded
                  </p>

                  <p className="mt-1 text-xs leading-5 text-[#4B7D63]">
                    {actionSuccess}
                  </p>
                </div>
              </div>
            )}

            {actionError && (
              <div className="flex items-start gap-3 rounded-xl border border-[#E9C8C8] bg-[#FBF2F2] px-4 py-3.5">
                <AlertCircle
                  size={17}
                  className="mt-0.5 shrink-0 text-[#A83E3E]"
                />

                <div>
                  <p className="text-sm font-semibold text-[#8F3636]">
                    Review action failed
                  </p>

                  <p className="mt-1 text-xs leading-5 text-[#A83E3E]">
                    {actionError}
                  </p>
                </div>
              </div>
            )}
          </section>
        )}

        {/* =====================================================
            SUMMARY
        ===================================================== */}

        <section className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SummaryCard
            label="Pending assessments"
            value={pendingCount}
            description="Ready assessments waiting for reviewer action."
            background="#EAE5F9"
            color="#7862C8"
            icon={<ShieldCheck size={18} />}
          />

          <SummaryCard
            label="Selected variant"
            value={
              reviewPackage?.variant_number
                ? `V${reviewPackage.variant_number}`
                : "—"
            }
            description={
              reviewPackage
                ? reviewPackage.title
                : "Select an assessment from the review queue."
            }
            background="#CFDEFC"
            color="#4A61C8"
            icon={<FileText size={18} />}
          />

          <SummaryCard
            label="Questions"
            value={
              reviewPackage
                ? totalQuestions
                : "—"
            }
            description={
              reviewPackage
                ? "Questions included in this assessment."
                : "No assessment selected."
            }
            background="#E8F2EF"
            color="#17655E"
            icon={<CheckCircle2 size={18} />}
          />
        </section>

        {/* =====================================================
            MAIN REVIEW AREA
        ===================================================== */}

        <section className="mt-7 grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)] xl:items-start">

          {/* ===================================================
              REVIEW QUEUE
          =================================================== */}

          <aside className="rounded-[22px] border border-[#DDE1E9] bg-white shadow-[0_12px_34px_rgba(38,40,79,0.035)]">
            <div className="border-b border-[#EAECF0] px-6 py-5">
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#7862C8]">
                Pending queue
              </p>

              <h2 className="mt-1 text-[19px] font-semibold text-[#202938]">
                Assessments
              </h2>

              <p className="mt-1 text-[11px] leading-5 text-[#98A2B3]">
                Select a generated variant to inspect its full content.
              </p>
            </div>

            {queue.length === 0 ? (
              <div className="p-7 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#F7F7FF] text-[#5658E8]">
                  <CheckCircle2 size={21} />
                </div>

                <h3 className="mt-4 text-sm font-semibold text-[#344054]">
                  Review queue is clear
                </h3>

                <p className="mt-1.5 text-xs leading-5 text-[#98A2B3]">
                  There are no ready assessments waiting for reviewer action.
                </p>
              </div>
            ) : (
              <div className="max-h-[760px] space-y-3 overflow-y-auto p-4">
                {queue.map((assessment) => {
                  const selected =
                    selectedAssessmentId ===
                    assessment.id;

                  return (
                    <button
                      key={assessment.id}
                      type="button"
                      onClick={() =>
                        loadReviewPackage(
                          assessment.id
                        )
                      }
                      disabled={packageLoading || acting}
                      className={`w-full rounded-[16px] border p-4 text-left transition ${
                        selected
                          ? "border-[#BFC3F1] bg-[#F7F7FF] shadow-[0_8px_22px_rgba(86,88,232,0.08)]"
                          : "border-[#E7E9EE] bg-white hover:border-[#C9CDF3] hover:bg-[#FCFCFF]"
                      } disabled:cursor-not-allowed disabled:opacity-70`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#98A2B3]">
                            Assessment #{assessment.id}
                          </p>

                          <p className="mt-1.5 truncate text-sm font-semibold text-[#202938]">
                            {assessment.title}
                          </p>
                        </div>

                        <span className="shrink-0 rounded-full bg-[#F3E3F2] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[#AA5E9C]">
                          V{assessment.variant_number ?? "—"}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <QueueMeta
                          label="Questions"
                          value={
                            assessment.question_count
                          }
                        />

                        <QueueMeta
                          label="Status"
                          value="Pending"
                        />
                      </div>

                      <div className="mt-3 flex items-center gap-2 text-[10px] text-[#98A2B3]">
                        <Clock3 size={12} />

                        {formatDate(
                          assessment.created_at
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </aside>

          {/* ===================================================
              REVIEW PACKAGE
          =================================================== */}

          <section className="min-w-0">
            {packageLoading ? (
              <div className="flex min-h-[520px] items-center justify-center rounded-[22px] border border-[#DDE1E9] bg-white">
                <div className="text-center">
                  <RefreshCw
                    size={28}
                    className="mx-auto animate-spin text-[#5658E8]"
                  />

                  <p className="mt-4 text-sm font-semibold text-[#344054]">
                    Loading assessment preview
                  </p>

                  <p className="mt-1 text-xs text-[#98A2B3]">
                    Preparing the reviewer package.
                  </p>
                </div>
              </div>
            ) : packageError ? (
              <div className="rounded-[22px] border border-[#E9C8C8] bg-white p-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#FCE7E7] text-[#B42318]">
                  <AlertCircle size={20} />
                </div>

                <h2 className="mt-5 text-2xl font-semibold text-[#202938]">
                  Preview unavailable
                </h2>

                <p className="mt-2 text-sm leading-6 text-[#667085]">
                  {packageError}
                </p>
              </div>
            ) : !reviewPackage ? (
              <div className="flex min-h-[520px] items-center justify-center rounded-[22px] border border-dashed border-[#D7DDE6] bg-white px-8 text-center">
                <div>
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F7F7FF] text-[#5658E8]">
                    <FileText size={24} />
                  </div>

                  <h2 className="mt-5 text-xl font-semibold text-[#202938]">
                    Select an assessment
                  </h2>

                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#98A2B3]">
                    Choose a pending assessment from the queue to
                    preview its instructions, timing, questions,
                    answer keys and explanations.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">

                {/* ---------------------------------------------
                    ASSESSMENT HEADER
                --------------------------------------------- */}

                <article className="rounded-[22px] border border-[#DDE1E9] bg-white shadow-[0_12px_34px_rgba(38,40,79,0.035)]">
                  <div className="border-b border-[#EAECF0] p-6 sm:p-7">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#7862C8]">
                          Assessment preview
                        </p>

                        <h2 className="mt-2 text-[26px] font-semibold tracking-[-0.025em] text-[#202938]">
                          {reviewPackage.title}
                        </h2>

                        <p className="mt-1 text-xs text-[#98A2B3]">
                          Assessment #{reviewPackage.assessment_id}
                          {" · "}
                          Variant {reviewPackage.variant_number ?? "—"}
                        </p>
                      </div>

                      <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[#FFF8EC] px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[#9C6A1F]">
                        <UserRound size={12} />
                        Pending reviewer decision
                      </span>
                    </div>

                    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <InfoCard
                        icon={<Clock3 size={15} />}
                        label="Duration"
                        value={
                          reviewPackage.configuration
                            ?.duration_minutes != null
                            ? `${reviewPackage.configuration.duration_minutes} minutes`
                            : "Not configured"
                        }
                      />

                      <InfoCard
                        icon={<FileText size={15} />}
                        label="Question count"
                        value={`${totalQuestions} questions`}
                      />

                      <InfoCard
                        icon={<ShieldCheck size={15} />}
                        label="Review state"
                        value={
                          reviewPackage.review_status
                        }
                      />
                    </div>
                  </div>

                  {/* -------------------------------------------
                      CANDIDATE INSTRUCTIONS
                  ------------------------------------------- */}

                  {reviewPackage.configuration
                    ?.candidate_instructions && (
                    <div className="border-b border-[#EAECF0] bg-[#FAFBFC] p-6 sm:p-7">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#CFDEFC] text-[#4A61C8]">
                          <FileText size={15} />
                        </div>

                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#4A61C8]">
                            Candidate instructions
                          </p>

                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#475467]">
                            {
                              reviewPackage
                                .configuration
                                .candidate_instructions
                            }
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* -------------------------------------------
                      QUESTIONS
                  ------------------------------------------- */}

                  <div className="p-6 sm:p-7">
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#5658E8]">
                          Question review
                        </p>

                        <h3 className="mt-1 text-lg font-semibold text-[#202938]">
                          Assessment content
                        </h3>
                      </div>

                      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#98A2B3]">
                        {totalQuestions} total
                      </span>
                    </div>

                    <div className="mt-6 space-y-4">
                      {reviewPackage.questions.map(
                        (question) => (
                          <ReviewerQuestionCard
                            key={question.id}
                            question={question}
                          />
                        )
                      )}
                    </div>
                  </div>
                </article>

                {/* ---------------------------------------------
                    DECISION
                --------------------------------------------- */}

                <article className="rounded-[22px] border border-[#DDE1E9] bg-white shadow-[0_12px_34px_rgba(38,40,79,0.035)]">
                  <div className="border-b border-[#EAECF0] px-6 py-5 sm:px-7">
                    <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#A76D5B]">
                      Reviewer decision
                    </p>

                    <h3 className="mt-1 text-lg font-semibold text-[#202938]">
                      Approve or reject this assessment
                    </h3>
                  </div>

                  <div className="p-6 sm:p-7">
                    <label
                      htmlFor="decision-comment"
                      className="mb-2 block text-[12px] font-semibold text-[#344054]"
                    >
                      Review comment
                    </label>

                    <textarea
                      id="decision-comment"
                      value={decisionComment}
                      onChange={(event) =>
                        setDecisionComment(
                          event.target.value
                        )
                      }
                      maxLength={5000}
                      rows={5}
                      placeholder="Add a review note. A reason is required when rejecting."
                      disabled={acting}
                      className="w-full resize-y rounded-xl border border-[#D7DDE6] bg-white px-4 py-3 text-sm leading-6 text-[#202938] outline-none transition placeholder:text-[#98A2B3] focus:border-[#5658E8] focus:ring-4 focus:ring-[#5658E8]/10 disabled:bg-[#F7F8FA]"
                    />

                    <div className="mt-2 flex justify-between gap-3 text-[10px] text-[#98A2B3]">
                      <span>
                        Rejecting requires a non-empty reason.
                      </span>

                      <span>
                        {decisionComment.length}/5000
                      </span>
                    </div>

                    <div className="mt-6 flex flex-col gap-3 border-t border-[#EAECF0] pt-6 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        onClick={handleReject}
                        disabled={acting}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#E7B7B7] bg-[#FFF8F8] px-5 text-sm font-semibold text-[#A83E3E] transition hover:border-[#C98282] hover:bg-[#FDF0F0] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {acting ? (
                          <RefreshCw
                            size={16}
                            className="animate-spin"
                          />
                        ) : (
                          <XCircle size={16} />
                        )}

                        Reject assessment
                      </button>

                      <button
                        type="button"
                        onClick={handleApprove}
                        disabled={acting}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#17655E] px-5 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(23,101,94,0.15)] transition hover:-translate-y-0.5 hover:bg-[#0F5750] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {acting ? (
                          <RefreshCw
                            size={16}
                            className="animate-spin"
                          />
                        ) : (
                          <CheckCircle2 size={16} />
                        )}

                        Approve assessment
                      </button>
                    </div>
                  </div>
                </article>
              </div>
            )}
          </section>
        </section>
      </main>
    </RecruiterLayout>
  );
}


/* ============================================================
   SUMMARY CARD
============================================================ */

function SummaryCard({
  label,
  value,
  description,
  background,
  color,
  icon,
}) {
  return (
    <div className="relative overflow-hidden rounded-[20px] border border-[#DDE1E9] bg-white p-5 shadow-[0_10px_28px_rgba(38,40,79,0.035)]">
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{
          backgroundColor: color,
        }}
      />

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#98A2B3]">
            {label}
          </p>

          <p className="mt-2 text-[27px] font-semibold tracking-[-0.03em] text-[#1B2430]">
            {value}
          </p>

          <p className="mt-2 text-[11px] leading-5 text-[#98A2B3]">
            {description}
          </p>
        </div>

        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{
            backgroundColor: background,
            color,
          }}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}


/* ============================================================
   QUEUE META
============================================================ */

function QueueMeta({
  label,
  value,
}) {
  return (
    <div className="rounded-lg border border-[#EEF0F3] bg-white px-3 py-2">
      <p className="text-[8px] font-bold uppercase tracking-[0.1em] text-[#98A2B3]">
        {label}
      </p>

      <p className="mt-1 text-[11px] font-semibold text-[#475467]">
        {value}
      </p>
    </div>
  );
}


/* ============================================================
   INFO CARD
============================================================ */

function InfoCard({
  icon,
  label,
  value,
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#EEF0F3] bg-[#FAFBFC] px-4 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[#5658E8] shadow-sm">
        {icon}
      </span>

      <div className="min-w-0">
        <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-[#98A2B3]">
          {label}
        </p>

        <p className="mt-1 truncate text-xs font-semibold capitalize text-[#475467]">
          {value}
        </p>
      </div>
    </div>
  );
}


/* ============================================================
   REVIEWER QUESTION CARD
============================================================ */

function ReviewerQuestionCard({
  question,
}) {
  const options = Array.isArray(question.options)
    ? question.options
    : [];

  return (
    <article className="rounded-[18px] border border-[#E5E8ED] bg-[#FCFCFD] p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-[#CFDEFC] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[#4A61C8]">
          Q{question.display_order}
        </span>

        <span className="rounded-full bg-[#EAE5F9] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[#7862C8]">
          {question.difficulty}
        </span>

        <span className="rounded-full bg-[#F3E3F2] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[#AA5E9C]">
          Skill #{question.skill_id}
        </span>

        <span className="rounded-full bg-[#F2F4F7] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[#667085]">
          {question.question_type}
        </span>
      </div>

      <h4 className="mt-4 text-sm font-semibold leading-6 text-[#202938]">
        {question.question_text}
      </h4>

      {question.question_type === "MCQ" &&
        options.length > 0 && (
          <div className="mt-4 grid gap-2">
            {options.map((option, index) => {
              const isCorrect =
                option === question.correct_answer;

              return (
                <div
                  key={`${question.id}-${index}`}
                  className={`rounded-xl border px-4 py-3 text-xs leading-5 ${
                    isCorrect
                      ? "border-[#B8DCCA] bg-[#F2FAF7] text-[#17655E]"
                      : "border-[#EEF0F3] bg-white text-[#475467]"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#F7F8FA] text-[10px] font-bold text-[#667085]">
                      {String.fromCharCode(65 + index)}
                    </span>

                    <span className="flex-1">
                      {option}
                    </span>

                    {isCorrect && (
                      <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#17655E]">
                        Correct
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      {question.question_type === "FREE_TEXT" && (
        <div className="mt-4 rounded-xl border border-dashed border-[#D7DDE6] bg-white p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#98A2B3]">
            Free-text response
          </p>

          <p className="mt-1.5 text-xs text-[#667085]">
            Candidate response will be evaluated after submission.
          </p>
        </div>
      )}

      {question.correct_answer && (
        <div className="mt-4 rounded-xl border border-[#B8DCCA] bg-[#F2FAF7] p-4">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#17655E]">
            Answer key
          </p>

          <p className="mt-1.5 text-xs font-semibold text-[#17655E]">
            {question.correct_answer}
          </p>
        </div>
      )}

      {question.explanation && (
        <div className="mt-3 rounded-xl border border-[#E6E8EC] bg-white p-4">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#667085]">
            Explanation
          </p>

          <p className="mt-1.5 text-xs leading-5 text-[#475467]">
            {question.explanation}
          </p>
        </div>
      )}
    </article>
  );
}


/* ============================================================
   DATE FORMATTER
============================================================ */

function formatDate(value) {
  if (!value) {
    return "Created date unavailable";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Created date unavailable";
  }

  return date.toLocaleString();
}


export default AssessmentReview;