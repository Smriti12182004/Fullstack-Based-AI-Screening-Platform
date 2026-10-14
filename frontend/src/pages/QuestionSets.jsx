import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  FolderOpen,
  Plus,
  RefreshCw,
  Search,
  X,
  XCircle,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import RecruiterLayout from "../layouts/RecruiterLayout";


const STATUS_META = {
  draft: {
    label: "Draft",
    icon: Clock3,
    className: "bg-[#F4F5F8] text-[#667085]",
    dot: "bg-[#98A2B3]",
  },

  under_review: {
    label: "Under Review",
    icon: Clock3,
    className: "bg-[#FFF4E8] text-[#B54708]",
    dot: "bg-[#F79009]",
  },

  approved: {
    label: "Approved",
    icon: CheckCircle2,
    className: "bg-[#ECFDF3] text-[#027A48]",
    dot: "bg-[#12B76A]",
  },

  rejected: {
    label: "Rejected",
    icon: XCircle,
    className: "bg-[#FFF1F1] text-[#B42318]",
    dot: "bg-[#F04438]",
  },

  published: {
    label: "Published",
    icon: CheckCircle2,
    className: "bg-[#EEF4FF] text-[#3538CD]",
    dot: "bg-[#6172F3]",
  },
};


function getErrorMessage(error, fallback) {
  const detail = error?.response?.data?.detail;

  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        return item?.msg || null;
      })
      .filter(Boolean);

    if (messages.length > 0) {
      return messages.join(". ");
    }
  }

  return fallback;
}


function QuestionSets() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [jobs, setJobs] = useState([]);
  const [questionSets, setQuestionSets] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);

  const [error, setError] = useState("");
  const [createError, setCreateError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const [selectedJobId, setSelectedJobId] = useState("");
  const [setName, setSetName] = useState("");
  const [setDescription, setSetDescription] = useState("");


  const handleAuthError = (error) => {
    if (error?.response?.status === 401) {
      logout();
      navigate("/login", { replace: true });
      return true;
    }

    return false;
  };


  const loadQuestionSets = async (showRefreshState = false) => {
    try {
      setError("");

      if (showRefreshState) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const [jobsResponse, setsResponse] = await Promise.all([
        api.get("/question-sets/available-jobs"),
        api.get("/question-sets"),
      ]);

      const jobData = Array.isArray(jobsResponse.data)
        ? jobsResponse.data
        : [];

      const setData = Array.isArray(setsResponse.data)
        ? setsResponse.data
        : [];

      setJobs(jobData);
      setQuestionSets(setData);

      setSelectedJobId((current) => {
        if (
          current &&
          jobData.some(
            (job) => String(job.id) === String(current)
          )
        ) {
          return current;
        }

        return jobData.length > 0
          ? String(jobData[0].id)
          : "";
      });
    } catch (error) {
      console.error(
        "Failed to load question-set workspace:",
        error
      );

      if (handleAuthError(error)) {
        return;
      }

      if (error?.response?.status === 403) {
        setError(
          "You do not currently have access to the question-set workspace."
        );
        return;
      }

      setError(
        getErrorMessage(
          error,
          "Unable to load question sets."
        )
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };


  useEffect(() => {
    loadQuestionSets();
  }, []);


  useEffect(() => {
    if (!isCreateModalOpen) {
      return undefined;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow = "hidden";

    const handleEscape = (event) => {
      if (event.key !== "Escape" || creating) {
        return;
      }

      setIsCreateModalOpen(false);
      setCreateError("");
    };

    window.addEventListener(
      "keydown",
      handleEscape
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleEscape
      );

      document.body.style.overflow =
        previousOverflow;
    };
  }, [isCreateModalOpen, creating]);


  const jobMap = useMemo(() => {
    return new Map(
      jobs.map((job) => [
        String(job.id),
        job,
      ])
    );
  }, [jobs]);


  const filteredQuestionSets = useMemo(() => {
    const normalizedSearch =
      search.trim().toLowerCase();

    return questionSets.filter((questionSet) => {
      if (
        statusFilter !== "all" &&
        questionSet.status !== statusFilter
      ) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const job = jobMap.get(
        String(questionSet.job_id)
      );

      const haystack = [
        questionSet.name,
        questionSet.description,
        job?.title,
        String(questionSet.job_id),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(
        normalizedSearch
      );
    });
  }, [
    questionSets,
    statusFilter,
    search,
    jobMap,
  ]);


  const counts = useMemo(() => {
    return {
      all: questionSets.length,

      draft: questionSets.filter(
        (item) => item.status === "draft"
      ).length,

      under_review: questionSets.filter(
        (item) => item.status === "under_review"
      ).length,

      approved: questionSets.filter(
        (item) => item.status === "approved"
      ).length,

      rejected: questionSets.filter(
        (item) => item.status === "rejected"
      ).length,
    };
  }, [questionSets]);


  const resetCreateForm = () => {
    setSetName("");
    setSetDescription("");
    setCreateError("");

    if (jobs.length > 0) {
      setSelectedJobId(
        String(jobs[0].id)
      );
    } else {
      setSelectedJobId("");
    }
  };


  const openCreateModal = () => {
    setSuccessMessage("");
    setCreateError("");

    if (
      !selectedJobId &&
      jobs.length > 0
    ) {
      setSelectedJobId(
        String(jobs[0].id)
      );
    }

    setIsCreateModalOpen(true);
  };


  const closeCreateModal = () => {
    if (creating) {
      return;
    }

    setIsCreateModalOpen(false);
    resetCreateForm();
  };


  const handleCreateQuestionSet = async (
    event
  ) => {
    event.preventDefault();

    setCreateError("");
    setSuccessMessage("");

    const trimmedName = setName.trim();
    const trimmedDescription =
      setDescription.trim();

    if (!selectedJobId) {
      setCreateError(
        "Select a job before creating the question set."
      );
      return;
    }

    if (!trimmedName) {
      setCreateError(
        "Question set name is required."
      );
      return;
    }

    setCreating(true);

    try {
      const response = await api.post(
        "/question-sets",
        {
          job_id: Number(selectedJobId),
          name: trimmedName,
          description:
            trimmedDescription || null,
        }
      );

      const createdSet = response.data;

      setSuccessMessage(
        `Question set "${createdSet.name}" created successfully.`
      );

      setIsCreateModalOpen(false);
      resetCreateForm();

      await loadQuestionSets(true);

      navigate(
        `/question-sets/${createdSet.id}/builder`
      );
    } catch (error) {
      console.error(
        "Failed to create question set:",
        error
      );

      if (handleAuthError(error)) {
        return;
      }

      setCreateError(
        getErrorMessage(
          error,
          "Unable to create the question set."
        )
      );
    } finally {
      setCreating(false);
    }
  };


  const openQuestionSet = (
    questionSet
  ) => {
    navigate(
      `/question-sets/${questionSet.id}/builder`
    );
  };


  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
  };


  if (loading) {
    return (
      <RecruiterLayout
        title="Question Sets"
        breadcrumb="Workspace / Question Sets"
      >
        <main className="mx-auto flex min-h-[65vh] max-w-[1400px] items-center justify-center">
          <div className="text-center">

            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F3E3F2]">
              <RefreshCw
                size={24}
                className="animate-spin text-[#AA5E9C]"
              />
            </div>

            <p className="mt-5 text-sm font-semibold text-[#344054]">
              Loading question sets
            </p>

            <p className="mt-1.5 text-xs text-[#98A2B3]">
              Fetching your assigned jobs and assessment sets.
            </p>

          </div>
        </main>
      </RecruiterLayout>
    );
  }


  if (error) {
    return (
      <RecruiterLayout
        title="Question Sets"
        breadcrumb="Workspace / Question Sets"
      >
        <main className="mx-auto flex min-h-[65vh] max-w-[1400px] items-center justify-center">

          <section className="w-full max-w-2xl rounded-[22px] border border-[#F0D5D5] bg-white p-8 shadow-[0_18px_45px_rgba(38,40,79,0.05)] sm:p-10">

            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#FCE7E7] text-[#B42318]">
              <AlertCircle size={20} />
            </div>

            <p className="mt-6 text-[9px] font-bold uppercase tracking-[0.2em] text-[#B42318]">
              Question set workspace
            </p>

            <h1 className="mt-3 text-[30px] font-semibold tracking-[-0.03em] text-[#182033]">
              Unable to load question sets
            </h1>

            <p className="mt-3 text-sm leading-7 text-[#667085]">
              {error}
            </p>

            <div className="mt-7 flex flex-col gap-2 sm:flex-row">

              <button
                type="button"
                onClick={() =>
                  loadQuestionSets()
                }
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#5658E8] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#494BD8]"
              >
                <RefreshCw size={15} />
                Try again
              </button>

              <button
                type="button"
                onClick={() =>
                  navigate("/questions")
                }
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#D7DCE5] bg-white px-5 py-3 text-sm font-semibold text-[#475467] transition hover:border-[#5658E8] hover:text-[#5658E8]"
              >
                Question Bank
                <ArrowRight size={15} />
              </button>

            </div>

          </section>

        </main>
      </RecruiterLayout>
    );
  }


  return (
    <RecruiterLayout
      title="Question Sets"
      breadcrumb="Workspace / Question Sets"
    >
      <div className="mx-auto max-w-[1500px] space-y-6 pb-12">

        {/* =====================================================
            PAGE HEADER
        ===================================================== */}

        <section className="relative overflow-hidden rounded-[20px] border border-[#E3E6EB] bg-white px-5 py-7 shadow-[0_10px_28px_rgba(27,37,58,0.035)] sm:px-7 lg:px-9 lg:py-9">

          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#F3E3F2]/60 blur-[80px]" />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">

            <div className="max-w-3xl">

              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#E3D6E4] bg-[#FBF6FB] px-3 py-1.5">

                <span className="h-1.5 w-1.5 rounded-full bg-[#AA5E9C]" />

                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#7E6278]">
                  Assessment authoring
                </span>

              </div>

              <h1 className="text-[30px] font-semibold leading-[1.08] tracking-[-0.035em] text-[#182033] sm:text-[36px] lg:text-[42px]">
                Question Sets
              </h1>

              <p className="mt-3 max-w-2xl text-[13px] leading-6 text-[#667085]">
                Build structured assessment sets from the jobs
                assigned to your assessment workspace, then move
                them through configuration and review.
              </p>

            </div>


            <div className="flex flex-col gap-2 sm:flex-row">

              <button
                type="button"
                onClick={() =>
                  loadQuestionSets(true)
                }
                disabled={refreshing}
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

                {refreshing
                  ? "Refreshing..."
                  : "Refresh"}
              </button>


              <button
                type="button"
                onClick={openCreateModal}
                disabled={jobs.length === 0}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#5658E8] px-4 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(86,88,232,0.15)] transition hover:-translate-y-0.5 hover:bg-[#494BD8] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus size={15} />
                New Question Set
              </button>

            </div>

          </div>
        </section>


        {/* =====================================================
            SUCCESS
        ===================================================== */}

        {successMessage && (
          <div className="flex items-start gap-3 rounded-[16px] border border-[#D1E9DD] bg-[#F6FEF9] px-4 py-3.5 text-[#027A48]">

            <CheckCircle2
              size={17}
              className="mt-0.5 shrink-0"
            />

            <p className="text-sm font-medium">
              {successMessage}
            </p>

          </div>
        )}


        {/* =====================================================
            SUMMARY
        ===================================================== */}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">

          <SummaryCard
            label="All sets"
            count={counts.all}
            icon={FolderOpen}
            accent="all"
          />

          <SummaryCard
            label="Draft"
            count={counts.draft}
            icon={Clock3}
            accent="draft"
          />

          <SummaryCard
            label="Under review"
            count={counts.under_review}
            icon={Clock3}
            accent="review"
          />

          <SummaryCard
            label="Approved"
            count={counts.approved}
            icon={CheckCircle2}
            accent="approved"
          />

          <SummaryCard
            label="Rejected"
            count={counts.rejected}
            icon={XCircle}
            accent="rejected"
          />

        </section>


        {/* =====================================================
            FILTER BAR
        ===================================================== */}

        <section className="rounded-[18px] border border-[#E3E6EB] bg-white p-4 shadow-[0_8px_24px_rgba(27,37,58,0.03)]">

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">

            <div className="flex h-10 min-w-0 flex-1 items-center rounded-lg border border-[#D8DEE7] bg-[#FAFBFC] px-3.5 focus-within:border-[#5658E8] focus-within:bg-white focus-within:ring-4 focus-within:ring-[#5658E8]/10">

              <Search
                size={16}
                className="shrink-0 text-[#98A2B3]"
              />

              <input
                type="search"
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value
                  )
                }
                placeholder="Search question sets or jobs..."
                className="ml-3 min-w-0 flex-1 bg-transparent text-sm text-[#202938] outline-none placeholder:text-[#98A2B3]"
              />

            </div>


            <div className="flex flex-wrap items-center gap-2">

              {[
                ["all", "All", counts.all],
                ["draft", "Draft", counts.draft],
                [
                  "under_review",
                  "Under Review",
                  counts.under_review,
                ],
                [
                  "approved",
                  "Approved",
                  counts.approved,
                ],
                [
                  "rejected",
                  "Rejected",
                  counts.rejected,
                ],
              ].map(
                ([value, label, count]) => (
                  <button
                    type="button"
                    key={value}
                    onClick={() =>
                      setStatusFilter(value)
                    }
                    className={
                      statusFilter === value
                        ? "rounded-lg bg-[#26284F] px-3 py-2 text-xs font-semibold text-white"
                        : "rounded-lg border border-[#D8DEE7] bg-white px-3 py-2 text-xs font-semibold text-[#667085] transition hover:border-[#B9C0CD] hover:text-[#344054]"
                    }
                  >
                    {label}{" "}

                    <span
                      className={
                        statusFilter === value
                          ? "ml-1 text-white/70"
                          : "ml-1 text-[#98A2B3]"
                      }
                    >
                      {count}
                    </span>

                  </button>
                )
              )}

            </div>

          </div>


          {(search || statusFilter !== "all") && (
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#EEF0F3] pt-3">

              <p className="text-[11px] text-[#98A2B3]">
                Showing{" "}
                <span className="font-semibold text-[#667085]">
                  {filteredQuestionSets.length}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-[#667085]">
                  {questionSets.length}
                </span>{" "}
                question sets
              </p>

              <button
                type="button"
                onClick={clearFilters}
                className="text-[11px] font-semibold text-[#5658E8] hover:text-[#494BD8]"
              >
                Clear filters
              </button>

            </div>
          )}

        </section>


        {/* =====================================================
            NO ASSIGNED JOBS
        ===================================================== */}

        {jobs.length === 0 && (
          <section className="rounded-[18px] border border-dashed border-[#CBD2DC] bg-white p-8 text-center">

            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#F4F5F8] text-[#98A2B3]">
              <FolderOpen size={21} />
            </div>

            <h2 className="mt-4 text-base font-semibold text-[#202938]">
              No assigned jobs
            </h2>

            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#98A2B3]">
              No jobs have been assigned to this assessment
              workspace yet. A question set can only be created
              for a job you are authorized to work on.
            </p>

          </section>
        )}


        {/* =====================================================
            EMPTY
        ===================================================== */}

        {jobs.length > 0 &&
          filteredQuestionSets.length === 0 && (
            <section className="rounded-[18px] border border-dashed border-[#CBD2DC] bg-white p-10 text-center">

              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#F3E3F2] text-[#AA5E9C]">
                <BookOpen size={21} />
              </div>

              <h2 className="mt-4 text-base font-semibold text-[#202938]">

                {questionSets.length === 0
                  ? "No question sets yet"
                  : "No matching question sets"}

              </h2>

              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#98A2B3]">

                {questionSets.length === 0
                  ? "Create your first question set from an assigned job to begin the assessment authoring workflow."
                  : "Try another search term or clear the current filters."}

              </p>


              {questionSets.length === 0 ? (
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#5658E8] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#494BD8]"
                >
                  <Plus size={14} />
                  Create Question Set
                </button>
              ) : (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-6 inline-flex items-center gap-2 rounded-lg border border-[#D7DCE5] bg-white px-4 py-2.5 text-xs font-semibold text-[#475467] transition hover:border-[#5658E8] hover:text-[#5658E8]"
                >
                  Clear filters
                </button>
              )}

            </section>
          )}


        {/* =====================================================
            QUESTION SET GRID
        ===================================================== */}

        {filteredQuestionSets.length > 0 && (
          <section className="grid gap-4 xl:grid-cols-2">

            {filteredQuestionSets.map(
              (questionSet) => {
                const job = jobMap.get(
                  String(questionSet.job_id)
                );

                const meta =
                  STATUS_META[
                    questionSet.status
                  ] ||
                  STATUS_META.draft;

                return (
                  <article
                    key={questionSet.id}
                    className="group rounded-[18px] border border-[#E1E5EA] bg-white p-5 shadow-[0_8px_24px_rgba(27,37,58,0.025)] transition duration-200 hover:-translate-y-0.5 hover:border-[#D5D9E7] hover:shadow-[0_14px_34px_rgba(27,37,58,0.055)] sm:p-6"
                  >

                    <div className="flex items-start justify-between gap-4">

                      <div className="flex min-w-0 gap-3.5">

                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F3E3F2] text-[#AA5E9C]">
                          <BookOpen size={20} />
                        </div>

                        <div className="min-w-0">

                          <div className="flex flex-wrap items-center gap-2">

                            <h2 className="truncate text-[16px] font-semibold text-[#202938]">
                              {questionSet.name}
                            </h2>

                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.08em] ${meta.className}`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${meta.dot}`}
                              />

                              {meta.label}
                            </span>

                          </div>

                          <p className="mt-1 text-[10px] text-[#98A2B3]">
                            Question Set #{questionSet.id}
                            {" · "}
                            Version {questionSet.version}
                          </p>

                        </div>

                      </div>


                      <div className="shrink-0 text-right">

                        <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#98A2B3]">
                          Updated
                        </p>

                        <p className="mt-1 text-[10px] text-[#667085]">

                          {questionSet.updated_at
                            ? new Date(
                                questionSet.updated_at
                              ).toLocaleDateString()
                            : "—"}

                        </p>

                      </div>

                    </div>


                    <div className="mt-5 grid gap-3 sm:grid-cols-2">

                      <InfoBox
                        label="Assigned job"
                        value={
                          job?.title ||
                          `Job #${questionSet.job_id}`
                        }
                      />

                      <InfoBox
                        label="Job ID"
                        value={`#${questionSet.job_id}`}
                      />

                    </div>


                    {questionSet.description && (
                      <div className="mt-3 rounded-xl border border-[#EEF0F3] bg-[#FAFBFC] p-3.5">

                        <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#98A2B3]">
                          Description
                        </p>

                        <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-[#667085]">
                          {questionSet.description}
                        </p>

                      </div>
                    )}


                    {questionSet.rejection_reason && (
                      <div className="mt-3 rounded-xl border border-[#F2D4D4] bg-[#FFF8F8] p-3.5">

                        <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#B42318]">
                          Reviewer feedback
                        </p>

                        <p className="mt-1.5 line-clamp-3 text-xs leading-5 text-[#A83E3E]">
                          {questionSet.rejection_reason}
                        </p>

                      </div>
                    )}


                    <div className="mt-5 flex flex-col gap-2 border-t border-[#EEF0F3] pt-4 sm:flex-row sm:items-center sm:justify-between">

                      <div className="text-[10px] text-[#98A2B3]">

                        {questionSet.status ===
                        "under_review"
                          ? "Waiting for assessment reviewer"
                          : questionSet.status ===
                            "approved"
                            ? "Ready for assessment assembly"
                            : questionSet.status ===
                              "rejected"
                              ? "Changes are required before resubmission"
                              : "Continue assessment authoring"}

                      </div>


                      <button
                        type="button"
                        onClick={() =>
                          openQuestionSet(
                            questionSet
                          )
                        }
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#D7DCE5] bg-white px-3.5 text-xs font-semibold text-[#475467] transition hover:border-[#5658E8] hover:bg-[#FAFAFF] hover:text-[#5658E8]"
                      >
                        Open set

                        <ArrowRight
                          size={14}
                          className="transition-transform group-hover:translate-x-0.5"
                        />

                      </button>

                    </div>

                  </article>
                )
              }
            )}

          </section>
        )}

      </div>


      {/* =====================================================
          CREATE QUESTION SET MODAL
      ===================================================== */}

      {isCreateModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#172033]/55 px-3 py-3 backdrop-blur-[4px] sm:items-center sm:px-4"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeCreateModal();
            }
          }}
        >

          <div
            className="w-full max-w-2xl overflow-hidden rounded-[20px] border border-[#E1E5EA] bg-white shadow-[0_24px_72px_rgba(38,40,79,0.22)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-question-set-title"
          >

            <div className="flex items-start justify-between bg-[#26284F] px-5 py-5 sm:px-6">

              <div>

                <div className="flex items-center gap-2">

                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-[#F3E3F2]">
                    <BookOpen size={16} />
                  </span>

                  <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#DAD6FF]">
                    Assessment authoring
                  </p>

                </div>

                <h2
                  id="create-question-set-title"
                  className="mt-3 text-[22px] font-semibold tracking-[-0.02em] text-white"
                >
                  Create Question Set
                </h2>

                <p className="mt-1.5 text-xs leading-5 text-[#C8CBE0]">
                  Start a draft set for one of your assigned jobs.
                </p>

              </div>


              <button
                type="button"
                onClick={closeCreateModal}
                disabled={creating}
                aria-label="Close create question set dialog"
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.07] text-[#DDE0ED] transition hover:bg-white/[0.13] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X size={18} />
              </button>

            </div>


            <form
              onSubmit={
                handleCreateQuestionSet
              }
              className="p-5 sm:p-6"
            >

              {createError && (
                <div className="mb-5 flex items-start gap-3 rounded-xl border border-[#F0D5D5] bg-[#FFF8F8] px-3.5 py-3 text-[#B42318]">

                  <AlertCircle
                    size={16}
                    className="mt-0.5 shrink-0"
                  />

                  <p className="text-xs font-medium leading-5">
                    {createError}
                  </p>

                </div>
              )}


              <div className="space-y-5">

                <div>

                  <label
                    htmlFor="question-set-job"
                    className="text-xs font-semibold text-[#344054]"
                  >
                    Job
                  </label>

                  <select
                    id="question-set-job"
                    value={selectedJobId}
                    onChange={(event) =>
                      setSelectedJobId(
                        event.target.value
                      )
                    }
                    disabled={
                      creating ||
                      jobs.length === 0
                    }
                    className="mt-2 h-11 w-full rounded-lg border border-[#D7DCE5] bg-white px-3 text-sm text-[#344054] outline-none transition focus:border-[#5658E8] focus:ring-4 focus:ring-[#5658E8]/10 disabled:cursor-not-allowed disabled:bg-[#F8F9FB]"
                  >

                    {jobs.length === 0 ? (
                      <option value="">
                        No assigned jobs available
                      </option>
                    ) : (
                      jobs.map((job) => (
                        <option
                          key={job.id}
                          value={job.id}
                        >
                          {job.title}
                          {" "}
                          (Job #{job.id})
                        </option>
                      ))
                    )}

                  </select>

                  <p className="mt-1.5 text-[10px] leading-5 text-[#98A2B3]">
                    Only jobs explicitly assigned to your assessment workspace appear here.
                  </p>

                </div>


                <div>

                  <label
                    htmlFor="question-set-name"
                    className="text-xs font-semibold text-[#344054]"
                  >
                    Question set name
                  </label>

                  <input
                    id="question-set-name"
                    value={setName}
                    onChange={(event) =>
                      setSetName(
                        event.target.value
                      )
                    }
                    maxLength={255}
                    placeholder="e.g. Python + ML Screening Set"
                    disabled={creating}
                    className="mt-2 h-11 w-full rounded-lg border border-[#D7DCE5] bg-white px-3 text-sm text-[#344054] outline-none transition placeholder:text-[#98A2B3] focus:border-[#5658E8] focus:ring-4 focus:ring-[#5658E8]/10 disabled:cursor-not-allowed disabled:bg-[#F8F9FB]"
                  />

                  <div className="mt-1 flex justify-end">
                    <span className="text-[9px] text-[#98A2B3]">
                      {setName.length}/255
                    </span>
                  </div>

                </div>


                <div>

                  <label
                    htmlFor="question-set-description"
                    className="text-xs font-semibold text-[#344054]"
                  >
                    Description
                    <span className="ml-1 font-normal text-[#98A2B3]">
                      optional
                    </span>
                  </label>

                  <textarea
                    id="question-set-description"
                    value={setDescription}
                    onChange={(event) =>
                      setSetDescription(
                        event.target.value
                      )
                    }
                    maxLength={2000}
                    rows={5}
                    placeholder="Describe the purpose, skills, or candidate profile this set is intended to assess."
                    disabled={creating}
                    className="mt-2 w-full resize-none rounded-lg border border-[#D7DCE5] bg-white px-3 py-3 text-sm leading-6 text-[#344054] outline-none transition placeholder:text-[#98A2B3] focus:border-[#5658E8] focus:ring-4 focus:ring-[#5658E8]/10 disabled:cursor-not-allowed disabled:bg-[#F8F9FB]"
                  />

                  <div className="mt-1 flex justify-end">
                    <span className="text-[9px] text-[#98A2B3]">
                      {setDescription.length}/2000
                    </span>
                  </div>

                </div>

              </div>


              <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">

                <button
                  type="button"
                  onClick={closeCreateModal}
                  disabled={creating}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-[#D7DCE5] bg-white px-4 text-xs font-semibold text-[#475467] transition hover:border-[#B9C0CD] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={
                    creating ||
                    !selectedJobId ||
                    !setName.trim()
                  }
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#5658E8] px-5 text-xs font-semibold text-white transition hover:bg-[#494BD8] disabled:cursor-not-allowed disabled:opacity-50"
                >

                  {creating ? (
                    <>
                      <RefreshCw
                        size={14}
                        className="animate-spin"
                      />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus size={14} />
                      Create Set
                    </>
                  )}

                </button>

              </div>

            </form>
          </div>
        </div>
      )}

    </RecruiterLayout>
  );
}


/* ============================================================
   SUMMARY CARD
============================================================ */

function SummaryCard({
  label,
  count,
  icon: Icon,
  accent,
}) {
  const styles = {
    all: {
      icon: "bg-[#EAE5F9] text-[#7862C8]",
    },

    draft: {
      icon: "bg-[#F4F5F8] text-[#667085]",
    },

    review: {
      icon: "bg-[#FFF4E8] text-[#B54708]",
    },

    approved: {
      icon: "bg-[#ECFDF3] text-[#027A48]",
    },

    rejected: {
      icon: "bg-[#FFF1F1] text-[#B42318]",
    },
  };

  const style =
    styles[accent] || styles.all;


  return (
    <div className="rounded-[16px] border border-[#E3E6EB] bg-white p-4 shadow-[0_6px_20px_rgba(27,37,58,0.025)]">

      <div className="flex items-center justify-between gap-3">

        <div>

          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#98A2B3]">
            {label}
          </p>

          <p className="mt-2 text-[25px] font-semibold tracking-[-0.03em] text-[#202938]">
            {count}
          </p>

        </div>

        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${style.icon}`}
        >
          <Icon size={18} />
        </div>

      </div>

    </div>
  );
}


/* ============================================================
   INFO BOX
============================================================ */

function InfoBox({
  label,
  value,
}) {
  return (
    <div className="rounded-xl border border-[#EEF0F3] bg-[#FBFCFD] p-3.5">

      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#98A2B3]">
        {label}
      </p>

      <p className="mt-1.5 truncate text-xs font-semibold text-[#475467]">
        {value}
      </p>

    </div>
  );
}


export default QuestionSets;