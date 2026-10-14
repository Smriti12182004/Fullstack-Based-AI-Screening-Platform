import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import RecruiterLayout from "../layouts/RecruiterLayout";

function ManagerJobReview() {
  const { jobId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [job, setJob] = useState(location.state?.job || null);
  const [loading, setLoading] = useState(!location.state?.job);
  const [refreshing, setRefreshing] = useState(false);
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

    return typeof detail === "string" ? detail : fallback;
  };

  const handleUnauthorized = (err) => {
    if (err.response?.status === 401) {
      logout();
      navigate("/login", { replace: true });
      return true;
    }

    return false;
  };

  const loadJob = async (showRefresh = false) => {
    try {
      setError("");

      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const response = await api.get("/question-sets/assigned-jobs");
      const assignedJobs = Array.isArray(response.data)
        ? response.data
        : [];

      const matched = assignedJobs.find(
        (item) => Number(item.id) === Number(jobId)
      );

      if (!matched) {
        setJob(null);
        setError("This job is not assigned to the current Assessment Manager.");
        return;
      }

      setJob(matched);
    } catch (err) {
      console.error("Failed to load assigned job:", err);

      if (handleUnauthorized(err)) {
        return;
      }

      setError(
        getErrorMessage(
          err,
          "Unable to load the shared job for review."
        )
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!location.state?.job) {
      loadJob();
    }
  }, [jobId]);

  const skills = useMemo(() => {
    if (!Array.isArray(job?.skills)) {
      return [];
    }

    return [...job.skills].sort((a, b) =>
      String(a?.name || "").localeCompare(String(b?.name || ""))
    );
  }, [job]);

  const reviewStatus = String(
    job?.skill_review_status || "pending"
  ).toLowerCase();

  const statusLabel =
    reviewStatus === "confirmed" ? "HR confirmed" : "Pending confirmation";

  if (loading) {
    return (
      <RecruiterLayout
        title="Job Review"
        breadcrumb="Assessment Manager / Assigned Jobs / Review"
      >
        <main className="mx-auto max-w-[1400px] space-y-6 pb-12">
          <section className="rounded-[22px] border border-[#E3E6EB] bg-white p-8">
            <div className="h-4 w-32 animate-pulse rounded bg-[#EEF2F0]" />
            <div className="mt-4 h-8 w-2/5 animate-pulse rounded bg-[#EEF2F0]" />
            <div className="mt-3 h-4 w-4/5 animate-pulse rounded bg-[#F3F6F4]" />
          </section>
        </main>
      </RecruiterLayout>
    );
  }

  return (
    <RecruiterLayout
      title="Job Review"
      breadcrumb="Assessment Manager / Assigned Jobs / Review"
    >
      <main className="mx-auto max-w-[1400px] space-y-6 pb-12 text-[#202938]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => navigate("/manager/jobs")}
            className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-[#667085] transition hover:text-[#5658E8]"
          >
            <ArrowLeft size={16} />
            Back to Assigned Jobs
          </button>

          <button
            type="button"
            onClick={() => loadJob(true)}
            disabled={refreshing}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#D9DEE7] bg-white px-4 text-xs font-semibold text-[#475467] transition hover:border-[#5658E8] hover:text-[#5658E8] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {error && (
          <div className="rounded-[18px] border border-[#E9C8C8] bg-[#FBF2F2] px-4 py-3 text-sm text-[#A83E3E]">
            {error}
          </div>
        )}

        {job && (
          <>
            <section className="relative overflow-hidden rounded-[22px] border border-[#E3E6EB] bg-white p-6 shadow-[0_8px_24px_rgba(27,37,58,0.035)] sm:p-8">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#5658E8] via-[#7862C8] to-[#0F9D8A]" />

              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#EAE5F9] text-[#7862C8]">
                    <BriefcaseBusiness size={24} />
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-[#D9DEE7] bg-[#FAFBFC] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#667085]">
                        Assigned job
                      </span>
                      <span className="rounded-full border border-[#CFE4D9] bg-[#F5FAF7] px-2.5 py-1 text-[10px] font-bold text-[#28734E]">
                        Manager access granted
                      </span>
                    </div>

                    <h1 className="mt-3 text-[30px] font-semibold tracking-[-0.035em] text-[#182033] sm:text-[38px]">
                      {job.title}
                    </h1>

                    <p className="mt-2 max-w-3xl text-sm leading-6 text-[#667085]">
                      Review the HR-provided job description and confirmed skill scope before creating or configuring the assessment.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#E3E6EB] bg-[#FAFBFC] px-3 py-2 text-xs font-semibold text-[#667085]">
                    <CalendarDays size={14} />
                    Job #{job.id}
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#CFE4D9] bg-[#F5FAF7] px-3 py-2 text-xs font-semibold text-[#28734E]">
                    <CheckCircle2 size={14} />
                    {statusLabel}
                  </div>
                </div>
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.75fr)]">
              <section className="rounded-[22px] border border-[#E3E6EB] bg-white shadow-[0_8px_24px_rgba(27,37,58,0.035)]">
                <div className="border-b border-[#EEF0F3] px-6 py-5 sm:px-8">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EAF1FC] text-[#4A61C8]">
                      <FileText size={19} />
                    </div>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#8A94A8]">
                        Job description
                      </p>
                      <h2 className="mt-1 text-xl font-semibold text-[#202938]">
                        HR-provided JD
                      </h2>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-6 sm:px-8 sm:py-8">
                  <div className="rounded-2xl border border-[#EEF0F3] bg-[#FBFCFD] p-5 sm:p-6">
                    <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7 text-[#475467]">
                      {job.description || "No job description is available."}
                    </pre>
                  </div>
                </div>
              </section>

              <aside className="space-y-6">
                <section className="rounded-[22px] border border-[#E3E6EB] bg-white p-6 shadow-[0_8px_24px_rgba(27,37,58,0.035)]">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E2F3EA] text-[#28734E]">
                      <ShieldCheck size={19} />
                    </div>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#8A94A8]">
                        Skill governance
                      </p>
                      <h2 className="mt-1 text-lg font-semibold text-[#202938]">
                        Confirmed skill scope
                      </h2>
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-[#667085]">
                    These skills came from the HR job workflow. Use them as the assessment scope when configuring sections and question generation.
                  </p>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {skills.length > 0 ? (
                      skills.map((skill) => (
                        <span
                          key={skill.id || skill.name}
                          className="inline-flex items-center gap-2 rounded-full border border-[#DDD6F3] bg-[#FBFAFF] px-3 py-1.5 text-xs font-semibold text-[#5E4DA3]"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-[#7862C8]" />
                          {skill.name}
                        </span>
                      ))
                    ) : (
                      <div className="w-full rounded-xl border border-[#E7DEBF] bg-[#FCFAF1] px-4 py-3 text-xs leading-5 text-[#896C1A]">
                        No skills are currently attached to this assigned job.
                      </div>
                    )}
                  </div>
                </section>

                <section className="rounded-[22px] border border-[#D9DEE7] bg-[#FAFBFC] p-6">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EAE5F9] text-[#7862C8]">
                      <ClipboardCheck size={19} />
                    </div>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#8A94A8]">
                        Next step
                      </p>
                      <h2 className="mt-1 text-lg font-semibold text-[#202938]">
                        Assessment preparation
                      </h2>
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-[#667085]">
                    Once the JD and skill scope are understood, the next stage is assessment configuration and question-set preparation.
                  </p>

                  <button
                    type="button"
                    onClick={() => navigate("/manager/jobs")}
                    className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#5658E8] px-4 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(86,88,232,0.15)] transition hover:bg-[#494BD8]"
                  >
                    Continue to Assessment Setup
                    <ArrowRight size={14} />
                  </button>
                </section>
              </aside>
            </div>
          </>
        )}
      </main>
    </RecruiterLayout>
  );
}

export default ManagerJobReview;
