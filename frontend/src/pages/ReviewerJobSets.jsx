import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileText,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import api from "../services/api";
import RecruiterLayout from "../layouts/RecruiterLayout";

function getStatus(status) {
  const value = String(status || "draft").toLowerCase();

  if (value === "submitted_for_review") {
    return {
      label: "Submitted for review",
      className: "border-[#C8D9FB] bg-[#F0F5FF] text-[#355CB6]",
    };
  }

  if (value === "approved") {
    return {
      label: "Approved",
      className: "border-[#CFE4D9] bg-[#F2FAF5] text-[#28734E]",
    };
  }

  if (value === "rejected") {
    return {
      label: "Changes requested",
      className: "border-[#E8D0D0] bg-[#FFF6F6] text-[#A83E3E]",
    };
  }

  if (value === "not_generated") {
    return {
      label: "Not generated yet",
      className: "border-[#E1E5EC] bg-[#F8F9FB] text-[#667085]",
    };
  }

  return {
    label: "In progress",
    className: "border-[#E6DCBD] bg-[#FFFBEB] text-[#896C1A]",
  };
}

function formatDate(value) {
  if (!value) return "Not available";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";

  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function ReviewerJobSets() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const hiringYear = searchParams.get("hiring_year");

  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [expandedSetId, setExpandedSetId] = useState(null);

  const loadSets = async (refresh = false) => {
    try {
      if (refresh) setRefreshing(true);
      else setLoading(true);

      setError("");

      const response = await api.get(
        `/assessment-reviews/jobs/${Number(jobId)}/sets`,
        {
          params: hiringYear ? { hiring_year: Number(hiringYear) } : {},
          timeout: 15000,
        }
      );

      setPayload(response.data || null);
    } catch (err) {
      console.error("Failed to load job assessment sets:", err);

      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;

      if (status === 401) {
        setError("Your session has expired. Please sign in again.");
      } else if (status === 403) {
        setError("You do not have reviewer access to this job.");
      } else {
        setError(
          typeof detail === "string"
            ? detail
            : "Unable to load assessment sets for this job."
        );
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadSets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, hiringYear]);

  const openReview = (questionSet, variant) => {
    const status = String(variant.status || "").toLowerCase();
    const submitted = status === "submitted_for_review";
    const completed = status === "approved" || status === "rejected";

    if (!submitted && !completed) return;

    navigate("/review", {
      state: {
        source: "question-bank-set",
        assessmentSetId: Number(variant.id),
        jobId: Number(jobId),
        jobTitle: payload?.job?.title || `Job ${jobId}`,
        questionSetId: Number(questionSet.id),
        questionSetName: questionSet.name,
        setLabel: variant.label,
        status,
        completed,
      },
    });
  };

  const questionSets = Array.isArray(payload?.question_sets)
    ? payload.question_sets
    : [];

  return (
    <RecruiterLayout
      title="Assessment Sets"
      breadcrumb="Workspace / Question Banks / Job Assessment Sets"
    >
      <main className="mx-auto max-w-[1450px] space-y-6 pb-14 text-[#202938]">
        <section className="relative overflow-hidden rounded-[22px] border border-[#DDE2F0] bg-white p-6 shadow-[0_8px_24px_rgba(27,37,58,0.035)] sm:p-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-4 right-7 hidden h-20 w-32 sm:block"
          >
            <div className="absolute bottom-2 right-2 h-12 w-24 rotate-[-7deg] rounded-2xl border border-[#7862C8]/20 transition-transform duration-700 hover:rotate-0" />
            <div className="absolute bottom-4 right-6 h-9 w-20 rotate-[6deg] rounded-xl border border-dashed border-[#0F9D8A]/25" />
            <span className="absolute bottom-3 right-2 h-2 w-2 animate-pulse rounded-full bg-[#0F9D8A]/60" />
            <span className="absolute bottom-12 right-24 h-1.5 w-1.5 animate-ping rounded-full bg-[#7862C8]/60" />
          </div>

          <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <button
                type="button"
                onClick={() => navigate("/question-banks")}
                className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-[#5658E8] transition hover:gap-3"
              >
                <ArrowLeft size={16} />
                Back to Question Banks
              </button>

              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[#D9DDEE] bg-[#FAFAFF] px-3 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-[#667085]">
                  Assigned reviewer
                </span>
                {hiringYear && (
                  <span className="rounded-full border border-[#D9DDEE] bg-white px-3 py-1 text-[10px] font-semibold text-[#6250A8]">
                    Hiring year {hiringYear}
                  </span>
                )}
              </div>

              <h1 className="mt-3 text-[28px] font-semibold tracking-[-0.035em] text-[#182033] sm:text-[34px]">
                {payload?.job?.title || "Job assessment sets"}
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#667085]">
                Each assessment blueprint and its Set A / Set B variants are listed here for this specific job. Submitted sets can be opened for review; in-progress sets remain visible with their current status.
              </p>
            </div>

            <button
              type="button"
              onClick={() => loadSets(true)}
              disabled={refreshing || loading}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#D9DDEE] bg-white px-4 text-xs font-semibold text-[#475467] transition hover:border-[#5658E8] hover:text-[#5658E8] disabled:opacity-50"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </section>

        {error && (
          <section className="rounded-xl border border-[#E9C8C8] bg-[#FFF6F6] px-4 py-3 text-sm text-[#A83E3E]">
            {error}
          </section>
        )}

        {loading ? (
          <section className="rounded-[20px] border border-[#E3E6EB] bg-white p-10 text-center">
            <RefreshCw size={22} className="mx-auto animate-spin text-[#5658E8]" />
            <p className="mt-3 text-sm font-semibold text-[#344054]">
              Loading assessment sets for this job...
            </p>
          </section>
        ) : !error && questionSets.length === 0 ? (
          <section className="rounded-[20px] border border-dashed border-[#CBD2DD] bg-white px-6 py-12 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F0EBFB] text-[#7862C8]">
              <FileText size={24} />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-[#202938]">
              No assessment blueprints for this job yet
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#667085]">
              This job does not have an assessment blueprint for the selected hiring year. Once a manager creates one, its variants will appear here.
            </p>
            <button
              type="button"
              onClick={() => navigate("/review")}
              className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg border border-[#D9DDEE] bg-[#FAFAFF] px-4 text-xs font-semibold text-[#6250A8] hover:bg-[#F0EDFF]"
            >
              Open review queue
              <ArrowRight size={14} />
            </button>
          </section>
        ) : (
          <section className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#5658E8]">
                  Job-specific assessment workspace
                </p>
                <h2 className="mt-1 text-xl font-semibold text-[#202938]">
                  Assessment blueprints
                </h2>
              </div>
              <span className="rounded-full border border-[#E1E5EC] bg-white px-3 py-1.5 text-[10px] font-bold text-[#667085]">
                {questionSets.length} blueprint{questionSets.length === 1 ? "" : "s"}
              </span>
            </div>

            {questionSets.map((questionSet) => {
              const actualVariants = Array.isArray(questionSet.sets)
                ? questionSet.sets
                : [];
              const expectedCount = Math.max(
                0,
                Number(questionSet.variant_count) || 2
              );
              const variantsByNumber = new Map(
                actualVariants.map((variant) => [
                  Number(variant.variant_number),
                  variant,
                ])
              );

              const variants = Array.from(
                { length: expectedCount },
                (_, index) => {
                  const variantNumber = index + 1;
                  return (
                    variantsByNumber.get(variantNumber) || {
                      id: null,
                      label: String.fromCharCode(64 + variantNumber),
                      variant_number: variantNumber,
                      status: "not_generated",
                      slot_count: 0,
                    }
                  );
                }
              );

              return (
                <article
                  key={questionSet.id}
                  className="group relative overflow-hidden rounded-[20px] border border-[#E3E6EB] bg-white shadow-[0_8px_24px_rgba(27,37,58,0.035)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_15px_32px_rgba(27,37,58,0.07)]"
                >
                  <div className="flex flex-col gap-3 border-b border-[#EEF0F3] px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F0EBFB] text-[#7862C8]">
                        <FileText size={19} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-[#8A94A8]">
                          Blueprint #{questionSet.id}
                        </p>
                        <h3 className="mt-1 text-base font-semibold text-[#202938]">
                          {questionSet.name || `Assessment ${questionSet.id}`}
                        </h3>
                        <p className="mt-1 text-xs text-[#667085]">
                          {questionSet.hiring_cycle || "Hiring cycle not specified"}
                          {questionSet.hiring_year ? ` · ${questionSet.hiring_year}` : ""}
                          {questionSet.created_at ? ` · Created ${formatDate(questionSet.created_at)}` : ""}
                        </p>
                      </div>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#D9DDEE] bg-[#FAFAFF] px-3 py-1.5 text-[10px] font-semibold text-[#6250A8]">
                      <ShieldCheck size={12} />
                      Reviewer view
                    </span>
                  </div>

                  <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
                    {variants.map((variant) => {
                      const status = getStatus(variant.status);
                      const rawStatus = String(variant.status || "").toLowerCase();
                      const canOpenReview = rawStatus === "submitted_for_review";
                      const completed = rawStatus === "approved" || rawStatus === "rejected";
                      const isExpanded = expandedSetId === variant.id;

                      return (
                        <section
                          key={`${questionSet.id}-${variant.variant_number}`}
                          className="relative overflow-hidden rounded-[16px] border border-[#E6E9F0] bg-[#FCFCFE] p-4 transition hover:border-[#D7D9F3]"
                        >
                          <div className="pointer-events-none absolute right-3 top-3 h-14 w-14 rounded-xl border border-dashed border-[#7862C8]/15 transition-transform duration-500 group-hover:rotate-6" />

                          <div className="relative z-10 flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-[#8A94A8]">
                                Assessment variant
                              </p>
                              <h4 className="mt-1 text-lg font-semibold text-[#202938]">
                                Set {variant.label || String.fromCharCode(64 + variant.variant_number)}
                              </h4>
                            </div>
                            <span className={`inline-flex max-w-[170px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-semibold ${status.className}`}>
                              {canOpenReview || completed ? (
                                <CheckCircle2 size={11} />
                              ) : (
                                <Clock3 size={11} />
                              )}
                              {status.label}
                            </span>
                          </div>

                          {variant.id ? (
                            <div className="relative z-10 mt-4 grid grid-cols-2 gap-2">
                              <div className="rounded-lg border border-[#E8EAF0] bg-white px-3 py-2.5">
                                <p className="text-[9px] font-bold uppercase tracking-wide text-[#98A2B3]">
                                  Set ID
                                </p>
                                <p className="mt-1 text-xs font-semibold text-[#344054]">
                                  #{variant.id}
                                </p>
                              </div>
                              <div className="rounded-lg border border-[#E8EAF0] bg-white px-3 py-2.5">
                                <p className="text-[9px] font-bold uppercase tracking-wide text-[#98A2B3]">
                                  Question slots
                                </p>
                                <p className="mt-1 text-xs font-semibold text-[#344054]">
                                  {variant.slot_count ?? 0}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <p className="relative z-10 mt-4 text-xs leading-5 text-[#667085]">
                              This variant has not been generated yet. It will appear here when it exists.
                            </p>
                          )}

                          {variant.id && (
                            <div className="relative z-10 mt-4">
                              {canOpenReview || completed ? (
                                <button
                                  type="button"
                                  onClick={() => openReview(questionSet, variant)}
                                  className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-[#5658E8] px-3 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#4648C9]"
                                >
                                  {completed ? "View review decision" : "Open this set for review"}
                                  <ArrowRight size={13} />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setExpandedSetId(isExpanded ? null : variant.id)}
                                  className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-[#D9DDEE] bg-white px-3 text-xs font-semibold text-[#475467] transition hover:border-[#7862C8] hover:text-[#6250A8]"
                                >
                                  {isExpanded ? "Hide progress details" : "View progress"}
                                  <ArrowRight size={13} className={`transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                                </button>
                              )}
                            </div>
                          )}

                          {isExpanded && variant.id && (
                            <div className="relative z-10 mt-3 rounded-xl border border-[#E6E1F5] bg-white p-3">
                              <p className="text-xs font-semibold text-[#344054]">
                                This set is not submitted for review
                              </p>
                              <p className="mt-1.5 text-xs leading-5 text-[#667085]">
                                The set is visible for job-specific progress tracking. Full review and approve/reject actions become available after the Assessment Manager submits it.
                              </p>
                              <p className="mt-2 text-[10px] text-[#8A94A8]">
                                Created {formatDate(variant.created_at)}
                              </p>
                            </div>
                          )}
                        </section>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </main>
    </RecruiterLayout>
  );
}
