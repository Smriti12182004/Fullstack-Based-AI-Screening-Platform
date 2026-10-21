import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import RecruiterLayout from "../layouts/RecruiterLayout";

const EDITABLE_STATUSES = new Set([
  "draft",
  "rejected",
]);

const STATUS_META = {
  draft: {
    label: "Draft",
    className: "bg-[#F4F5F8] text-[#667085]",
    dot: "bg-[#98A2B3]",
  },
  under_review: {
    label: "Under Review",
    className: "bg-[#FFF4E8] text-[#B54708]",
    dot: "bg-[#F79009]",
  },
  approved: {
    label: "Approved",
    className: "bg-[#ECFDF3] text-[#027A48]",
    dot: "bg-[#12B76A]",
  },
  rejected: {
    label: "Rejected",
    className: "bg-[#FFF1F1] text-[#B42318]",
    dot: "bg-[#F04438]",
  },
  published: {
    label: "Published",
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

function createEmptyAllocation(rowId = 1) {
  return {
    rowId,
    skillId: "",
    questionCount: "1",
  };
}

function getAllocationTotal(allocation) {
  return Number(allocation?.questionCount || 0);
}

function getSectionTotal(section) {
  if (!Array.isArray(section?.skills)) {
    return 0;
  }

  return section.skills.reduce(
    (total, skillAllocation) =>
      total + Number(skillAllocation?.question_count || 0),
    0,
  );
}

function QuestionSetBuilder() {
  const { questionSetId } = useParams();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [questionSet, setQuestionSet] = useState(null);
  const [skills, setSkills] = useState([]);
  const [sections, setSections] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);

  const [error, setError] = useState("");
  const [createError, setCreateError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [sectionName, setSectionName] = useState("");
  const [sectionDifficulty, setSectionDifficulty] = useState("easy");
  const [allocations, setAllocations] = useState([createEmptyAllocation()]);

  const handleAuthError = (requestError) => {
    if (requestError?.response?.status === 401) {
      logout();
      navigate("/login", { replace: true });
      return true;
    }

    return false;
  };

  const loadBuilder = async (showRefreshState = false) => {
    if (!questionSetId) {
      setError("Unable to determine the question set.");
      setLoading(false);
      return;
    }

    try {
      setError("");
      setSuccessMessage("");

      if (showRefreshState) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const [
        questionSetResponse,
        skillsResponse,
        sectionsResponse,
      ] = await Promise.all([
        api.get(`/question-sets/${questionSetId}`),
        api.get(`/question-sets/${questionSetId}/skills`),
        api.get(`/sections?question_set_id=${questionSetId}`),
      ]);

      const packageData = questionSetResponse.data;
      const currentQuestionSet =
        packageData?.question_set ||
        packageData ||
        null;

      const skillData = Array.isArray(skillsResponse.data)
        ? skillsResponse.data
        : [];

      const currentSections = Array.isArray(sectionsResponse.data)
        ? sectionsResponse.data
        : [];

      setQuestionSet(currentQuestionSet);
      setSections(currentSections);
      setSkills(skillData);
    } catch (requestError) {
      console.error(
        "Failed to load question-set builder:",
        requestError,
      );

      if (handleAuthError(requestError)) {
        return;
      }

      if (requestError?.response?.status === 403) {
        setError("You are not authorized to access this question set.");
        return;
      }

      if (requestError?.response?.status === 404) {
        setError("The requested question set could not be found.");
        return;
      }

      setError(
        getErrorMessage(
          requestError,
          "Unable to load the question-set builder.",
        ),
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadBuilder();
  }, [questionSetId]);

  const isEditable = EDITABLE_STATUSES.has(questionSet?.status);
  const nextDisplayOrder = sections.length + 1;

  const totalConfiguredQuestions = useMemo(
    () => sections.reduce((total, section) => total + getSectionTotal(section), 0),
    [sections],
  );

  const draftSectionTotal = useMemo(
    () => allocations.reduce((total, allocation) => total + getAllocationTotal(allocation), 0),
    [allocations],
  );

  const handleAllocationChange = (rowId, field, value) => {
    setAllocations((current) =>
      current.map((allocation) =>
        allocation.rowId === rowId
          ? { ...allocation, [field]: value }
          : allocation,
      ),
    );
    setCreateError("");
  };

  const handleAddSkillAllocation = () => {
    setCreateError("");

    if (allocations.length >= skills.length) {
      setCreateError("All available skills have already been added to this section.");
      return;
    }

    setAllocations((current) => {
      const nextRowId = current.reduce(
        (maxId, allocation) => Math.max(maxId, allocation.rowId),
        0,
      ) + 1;

      return [...current, createEmptyAllocation(nextRowId)];
    });
  };

  const handleRemoveSkillAllocation = (rowId) => {
    setCreateError("");

    setAllocations((current) => {
      if (current.length === 1) {
        return current;
      }

      return current.filter((allocation) => allocation.rowId !== rowId);
    });
  };

  const getAvailableSkillsForRow = (rowId) => {
    const selectedByOtherRows = new Set(
      allocations
        .filter((allocation) => allocation.rowId !== rowId)
        .map((allocation) => String(allocation.skillId))
        .filter(Boolean),
    );

    return skills.filter(
      (skill) => !selectedByOtherRows.has(String(skill.id)),
    );
  };

  const handleCreateSection = async (event) => {
    event.preventDefault();

    setCreateError("");
    setSuccessMessage("");

    if (!questionSet) {
      setCreateError("Question set information is unavailable.");
      return;
    }

    if (!isEditable) {
      setCreateError("This question set is no longer editable.");
      return;
    }

    if (!sectionName.trim()) {
      setCreateError("Section name is required.");
      return;
    }

    if (allocations.length === 0) {
      setCreateError("Add at least one skill to the section.");
      return;
    }

    if (!["easy", "medium", "hard"].includes(sectionDifficulty)) {
      setCreateError("Select a valid section difficulty.");
      return;
    }

    const seenSkillIds = new Set();
    const normalizedSkills = [];

    for (const allocation of allocations) {
      if (!allocation.skillId) {
        setCreateError("Select a skill for every allocation row.");
        return;
      }

      const normalizedSkillId = String(allocation.skillId);
      const questionCount = Number(allocation.questionCount);

      if (seenSkillIds.has(normalizedSkillId)) {
        setCreateError("A skill can appear only once within the same section.");
        return;
      }

      seenSkillIds.add(normalizedSkillId);

      if (!Number.isInteger(questionCount) || questionCount <= 0) {
        const skill = skills.find(
          (item) => String(item.id) === normalizedSkillId,
        );

        setCreateError(
          `Add at least one question for ${skill?.name || "each selected skill"}.`,
        );
        return;
      }

      normalizedSkills.push({
        skill_id: Number(allocation.skillId),
        question_count: questionCount,
      });
    }

    if (normalizedSkills.length === 0) {
      setCreateError("Add at least one skill to the section.");
      return;
    }

    setCreating(true);

    try {
      const response = await api.post("/sections", {
        question_set_id: Number(questionSetId),
        name: sectionName.trim(),
        difficulty: sectionDifficulty,
        display_order: nextDisplayOrder,
        skills: normalizedSkills,
      });

      const createdSection = response.data;

      setSuccessMessage(
        `Section "${createdSection.name}" created successfully with ${normalizedSkills.length} skill${normalizedSkills.length === 1 ? "" : "s"}.`,
      );

      setSectionName("");
      setSectionDifficulty("easy");
      setAllocations([createEmptyAllocation(1)]);

      await loadBuilder(true);
    } catch (requestError) {
      console.error(
        "Failed to create section:",
        requestError,
      );

      if (handleAuthError(requestError)) {
        return;
      }

      setCreateError(
        getErrorMessage(
          requestError,
          "Unable to create the section.",
        ),
      );
    } finally {
      setCreating(false);
    }
  };

  const handleContinue = () => {
    if (sections.length === 0) {
      setError(
        "Create at least one section before continuing to configuration.",
      );
      return;
    }

    navigate(
      `/question-sets/${questionSetId}/configuration`,
    );
  };

  const statusMeta =
    STATUS_META[questionSet?.status] || STATUS_META.draft;

  if (loading) {
    return (
      <RecruiterLayout
        title="Question Set Builder"
        breadcrumb="Workspace / Question Sets / Builder"
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
              Loading question-set builder
            </p>

            <p className="mt-1.5 text-xs text-[#98A2B3]">
              Fetching the set, assigned skills, and existing sections.
            </p>
          </div>
        </main>
      </RecruiterLayout>
    );
  }

  if (error && !questionSet) {
    return (
      <RecruiterLayout
        title="Question Set Builder"
        breadcrumb="Workspace / Question Sets / Builder"
      >
        <main className="mx-auto flex min-h-[65vh] max-w-[1400px] items-center justify-center">
          <section className="w-full max-w-2xl rounded-[22px] border border-[#F0D5D5] bg-white p-8 shadow-[0_18px_45px_rgba(38,40,79,0.05)] sm:p-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#FCE7E7] text-[#B42318]">
              <AlertCircle size={20} />
            </div>

            <p className="mt-6 text-[9px] font-bold uppercase tracking-[0.2em] text-[#B42318]">
              Question set builder
            </p>

            <h1 className="mt-3 text-[30px] font-semibold tracking-[-0.03em] text-[#182033]">
              Builder unavailable
            </h1>

            <p className="mt-3 text-sm leading-7 text-[#667085]">
              {error}
            </p>

            <div className="mt-7 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => loadBuilder()}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#5658E8] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#494BD8]"
              >
                <RefreshCw size={15} />
                Try again
              </button>

              <button
                type="button"
                onClick={() => navigate("/question-sets")}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#D7DCE5] bg-white px-5 py-3 text-sm font-semibold text-[#475467] transition hover:border-[#5658E8] hover:text-[#5658E8]"
              >
                <ArrowLeft size={15} />
                Back to Question Sets
              </button>
            </div>
          </section>
        </main>
      </RecruiterLayout>
    );
  }

  return (
    <RecruiterLayout
      title="Question Set Builder"
      breadcrumb={`Workspace / Question Sets / ${questionSet?.name || `Set #${questionSetId}`}`}
    >
      <div className="mx-auto max-w-[1500px] space-y-6 pb-12">
        <section className="relative overflow-hidden rounded-[22px] border border-[#E1E5EA] bg-white shadow-[0_10px_30px_rgba(27,37,58,0.035)]">
          <div className="h-1 bg-gradient-to-r from-[#EAE5F9] via-[#F3E3F2] to-[#CFDEFC]" />
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#F3E3F2]/55 blur-[75px]" />

          <div className="relative p-6 sm:p-8 lg:p-9">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 max-w-4xl">
                <button
                  type="button"
                  onClick={() => navigate("/question-sets")}
                  className="group inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#667085] transition hover:-translate-x-0.5 hover:bg-[#F7F8FC] hover:text-[#5658E8]"
                >
                  <ArrowLeft
                    size={14}
                    className="transition-transform group-hover:-translate-x-0.5"
                  />
                  Back to Question Sets
                </button>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F3E3F2] text-[#AA5E9C]">
                    <BookOpen size={20} />
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#AA5E9C]">
                        Assessment authoring
                      </p>

                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.08em] ${statusMeta.className}`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${statusMeta.dot}`}
                        />
                        {statusMeta.label}
                      </span>
                    </div>

                    <p className="mt-1 text-[11px] text-[#98A2B3]">
                      Question Set #{questionSet?.id}
                      {" · "}
                      Version {questionSet?.version}
                    </p>
                  </div>
                </div>

                <h1 className="mt-5 text-[32px] font-semibold tracking-[-0.035em] text-[#182033] sm:text-[40px]">
                  {questionSet?.name || `Question Set #${questionSetId}`}
                </h1>

                <p className="mt-3 max-w-3xl text-sm leading-7 text-[#667085]">
                  Define the question-paper sections. Each section has one difficulty and can contain multiple skills with independent question counts.
                </p>

                {questionSet.description && (
                  <p className="mt-2 max-w-3xl text-xs leading-6 text-[#98A2B3]">
                    {questionSet.description}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => loadBuilder(true)}
                  disabled={refreshing || creating}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#CBD1DC] bg-white px-4 text-xs font-semibold text-[#475467] transition hover:border-[#5658E8] hover:bg-[#FAFAFF] hover:text-[#5658E8] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw
                    size={14}
                    className={refreshing ? "animate-spin" : ""}
                  />
                  {refreshing ? "Refreshing..." : "Refresh"}
                </button>

                <button
                  type="button"
                  onClick={handleContinue}
                  disabled={sections.length === 0}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#5658E8] px-4 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(86,88,232,0.15)] transition hover:-translate-y-0.5 hover:bg-[#494BD8] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Continue to Configuration
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </section>

        {error && (
          <div className="flex items-start gap-3 rounded-[16px] border border-[#F0D5D5] bg-[#FFF8F8] px-4 py-3.5 text-[#B42318]">
            <AlertCircle
              size={17}
              className="mt-0.5 shrink-0"
            />
            <p className="text-sm font-medium leading-6">{error}</p>
          </div>
        )}

        {successMessage && (
          <div className="flex items-start gap-3 rounded-[16px] border border-[#D1E9DD] bg-[#F6FEF9] px-4 py-3.5 text-[#027A48]">
            <CheckCircle2
              size={17}
              className="mt-0.5 shrink-0"
            />
            <p className="text-sm font-medium">{successMessage}</p>
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-3">
          <SummaryCard
            label="Sections"
            value={sections.length}
            icon={BookOpen}
            accent="purple"
          />

          <SummaryCard
            label="Configured questions"
            value={totalConfiguredQuestions}
            icon={CheckCircle2}
            accent="green"
          />

          <SummaryCard
            label="Next display order"
            value={nextDisplayOrder}
            icon={Clock3}
            accent="blue"
          />
        </section>

        {sections.length > 0 && (
          <nav
            aria-label="Question-set section index"
            className="sticky top-2 z-20 mt-5 rounded-[16px] border border-[#E3E6EB] bg-white/95 p-4 shadow-[0_4px_16px_rgba(27,37,58,0.04)] backdrop-blur"
          >
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xs font-bold text-[#202938]">Section index</h2>
                <p className="mt-1 text-[10px] text-[#667085]">
                  Select a section to jump to it without scrolling through the whole builder.
                </p>
              </div>
              <span className="text-[10px] font-semibold text-[#667085]">
                {sections.length} {sections.length === 1 ? "section" : "sections"} · {totalConfiguredQuestions} configured questions
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {sections.map((section, index) => (
                <a
                  key={section.id}
                  href={`#question-set-section-${section.id}`}
                  className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#E3E6EB] bg-[#FCFCFD] px-3 py-2 text-[10px] font-semibold text-[#475467] transition hover:border-[#A8A0DF] hover:bg-[#F7F5FF] hover:text-[#5146B2] focus:outline-none focus:ring-2 focus:ring-[#5658E8]/30"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[#EAE5F9] text-[9px] font-bold text-[#7862C8]">
                    {index + 1}
                  </span>
                  <span className="max-w-[180px] truncate">{section.name || `Section ${index + 1}`}</span>
                  <span className="text-[#98A2B3]">{getSectionTotal(section)} Q</span>
                </a>
              ))}
            </div>
          </nav>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_430px]">
          <section className="rounded-[20px] border border-[#E3E6EB] bg-white p-5 shadow-[0_8px_24px_rgba(27,37,58,0.03)] sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#7862C8]">
                  Assessment structure
                </p>

                <h2 className="mt-1.5 text-[21px] font-semibold tracking-[-0.02em] text-[#202938]">
                  Sections
                </h2>

                <p className="mt-1.5 text-xs leading-5 text-[#98A2B3]">
                  A skill may appear in multiple sections. It must only appear once inside an individual section.
                </p>
              </div>

              <span className="inline-flex items-center gap-2 rounded-full bg-[#F4F5F8] px-3 py-1.5 text-[10px] font-semibold text-[#667085]">
                {sections.length} {sections.length === 1 ? "section" : "sections"}
              </span>
            </div>

            {sections.length === 0 ? (
              <div className="mt-6 rounded-[16px] border border-dashed border-[#CBD2DC] bg-[#FBFCFD] p-10 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#F3E3F2] text-[#AA5E9C]">
                  <BookOpen size={21} />
                </div>

                <h3 className="mt-4 text-sm font-semibold text-[#202938]">
                  No sections yet
                </h3>

                <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-[#98A2B3]">
                  Add the first section and assign one or more skills with the section difficulty and question count.
                </p>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {sections.map((section, index) => {
                  const sectionSkills = Array.isArray(section.skills)
                    ? section.skills
                    : [];

                  const sectionTotal = getSectionTotal(section);

                  return (
                    <article
                      id={`question-set-section-${section.id}`}
                      key={section.id}
                      className="scroll-mt-28 rounded-[16px] border border-[#E3E6EB] bg-[#FCFCFD] p-4 sm:p-5"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex min-w-0 gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EAE5F9] text-[#7862C8]">
                            <span className="text-xs font-bold">{index + 1}</span>
                          </div>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-semibold text-[#202938]">
                                {section.name}
                              </h3>

                              {section.is_locked && (
                                <span className="rounded-full bg-[#F4F5F8] px-2 py-1 text-[9px] font-semibold text-[#667085]">
                                  Locked
                                </span>
                              )}
                            </div>

                            <p className="mt-1 text-[10px] text-[#98A2B3]">
                              Order {section.display_order} · {sectionSkills.length} {sectionSkills.length === 1 ? "skill" : "skills"} · {sectionTotal} questions
                            </p>
                          </div>
                        </div>

                        <CountBox
                          label="Total"
                          value={sectionTotal}
                          accent="total"
                        />
                      </div>

                      <div className="mt-4 space-y-2">
                        {sectionSkills.map((allocation) => {
                          const skill = skills.find(
                            (item) =>
                              String(item.id) === String(allocation.skill_id),
                          );

                          const allocationTotal =
                            Number(allocation.question_count || 0);

                          return (
                            <div
                              key={allocation.id}
                              className="rounded-xl border border-[#E8EAF0] bg-white p-3"
                            >
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-[#344054]">
                                    {skill?.name || `Skill #${allocation.skill_id}`}
                                  </p>
                                  <p className="mt-1 text-[10px] text-[#98A2B3]">
                                    Skill total: {allocationTotal} questions
                                  </p>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                  <CountBox
                                    label="Difficulty"
                                    value={String(section.difficulty || "").replace(/^./, (char) => char.toUpperCase())}
                                    accent="medium"
                                  />
                                  <CountBox
                                    label="Questions"
                                    value={allocationTotal}
                                    accent="total"
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-[20px] border border-[#E3E6EB] bg-white p-5 shadow-[0_8px_24px_rgba(27,37,58,0.03)] sm:p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F3E3F2] text-[#AA5E9C]">
                <Plus size={20} />
              </div>

              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#AA5E9C]">
                  Build structure
                </p>

                <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.02em] text-[#202938]">
                  Add Section
                </h2>
              </div>
            </div>

            {!isEditable ? (
              <div className="mt-6 rounded-[16px] border border-[#E3E6EB] bg-[#FAFBFC] p-5">
                <div className="flex items-start gap-3">
                  <Settings2
                    size={17}
                    className="mt-0.5 shrink-0 text-[#667085]"
                  />

                  <div>
                    <p className="text-sm font-semibold text-[#344054]">
                      This set is read-only
                    </p>

                    <p className="mt-1.5 text-xs leading-5 text-[#98A2B3]">
                      The question set is currently{" "}
                      <span className="font-semibold capitalize">
                        {String(questionSet?.status || "").replace("_", " ")}
                      </span>
                      . Sections can only be added while the set is in Draft or Rejected state.
                    </p>
                  </div>
                </div>
              </div>
            ) : skills.length === 0 ? (
              <div className="mt-6 rounded-[16px] border border-[#F0D5D5] bg-[#FFF8F8] p-5">
                <div className="flex items-start gap-3">
                  <AlertCircle
                    size={17}
                    className="mt-0.5 shrink-0 text-[#B42318]"
                  />

                  <div>
                    <p className="text-sm font-semibold text-[#B42318]">
                      No confirmed job skills available
                    </p>

                    <p className="mt-1.5 text-xs leading-5 text-[#667085]">
                      Confirm the skills for this question set's job before building sections.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <form
                onSubmit={handleCreateSection}
                className="mt-6 space-y-5"
              >
                {createError && (
                  <div className="flex items-start gap-3 rounded-xl border border-[#F0D5D5] bg-[#FFF8F8] px-3.5 py-3 text-[#B42318]">
                    <AlertCircle
                      size={16}
                      className="mt-0.5 shrink-0"
                    />
                    <p className="text-xs font-medium leading-5">
                      {createError}
                    </p>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="builder-section-name"
                    className="text-xs font-semibold text-[#344054]"
                  >
                    Section name
                  </label>

                  <input
                    id="builder-section-name"
                    value={sectionName}
                    onChange={(event) => setSectionName(event.target.value)}
                    maxLength={255}
                    placeholder="e.g. Core Technical Skills"
                    disabled={creating}
                    className="mt-2 h-11 w-full rounded-lg border border-[#D7DCE5] bg-white px-3 text-sm text-[#344054] outline-none transition placeholder:text-[#98A2B3] focus:border-[#5658E8] focus:ring-4 focus:ring-[#5658E8]/10 disabled:cursor-not-allowed disabled:bg-[#F8F9FB]"
                  />

                  <p className="mt-1.5 text-[10px] text-[#98A2B3]">
                    Display order:{" "}
                    <span className="font-semibold text-[#667085]">
                      {nextDisplayOrder}
                    </span>
                  </p>
                </div>

                <div>
                  <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
                    <div>
                      <label
                        htmlFor="builder-section-difficulty"
                        className="text-[10px] font-semibold text-[#344054]"
                      >
                        Difficulty
                      </label>

                      <select
                        id="builder-section-difficulty"
                        value={sectionDifficulty}
                        onChange={(event) => setSectionDifficulty(event.target.value)}
                        disabled={creating}
                        className="mt-1.5 h-10 w-full rounded-lg border border-[#D7DCE5] bg-white px-3 text-sm text-[#344054] outline-none transition focus:border-[#5658E8] focus:ring-4 focus:ring-[#5658E8]/10 disabled:cursor-not-allowed disabled:bg-[#F8F9FB]"
                      >
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                      </select>
                    </div>

                    <div className="flex flex-col justify-end">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-[#344054]">
                            Skills in this section
                          </p>
                          <p className="mt-1 text-[10px] leading-5 text-[#98A2B3]">
                            Select multiple skills. Each selected skill uses the section difficulty.
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={handleAddSkillAllocation}
                          disabled={
                            creating ||
                            allocations.length >= skills.length
                          }
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#D7DCE5] bg-white px-3 py-2 text-[10px] font-semibold text-[#5658E8] transition hover:border-[#5658E8] hover:bg-[#FAFAFF] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Plus size={13} />
                          Add Skill
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 space-y-3">
                    {allocations.map((allocation, index) => {
                      const availableSkillsForRow = getAvailableSkillsForRow(
                        allocation.rowId,
                      );
                      const allocationTotal = getAllocationTotal(allocation);

                      return (
                        <div
                          key={allocation.rowId}
                          className="rounded-[14px] border border-[#E5E7EC] bg-[#FBFCFD] p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#98A2B3]">
                              Skill {index + 1}
                            </p>

                            {allocations.length > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleRemoveSkillAllocation(allocation.rowId)
                                }
                                disabled={creating}
                                aria-label={`Remove skill ${index + 1}`}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[#98A2B3] transition hover:bg-[#FFF1F1] hover:text-[#B42318] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>

                          <div className="mt-2">
                            <label
                              htmlFor={`builder-skill-${allocation.rowId}`}
                              className="text-[10px] font-semibold text-[#344054]"
                            >
                              Skill
                            </label>

                            <select
                              id={`builder-skill-${allocation.rowId}`}
                              value={allocation.skillId}
                              onChange={(event) =>
                                handleAllocationChange(
                                  allocation.rowId,
                                  "skillId",
                                  event.target.value,
                                )
                              }
                              disabled={creating}
                              className="mt-1.5 h-10 w-full rounded-lg border border-[#D7DCE5] bg-white px-3 text-sm text-[#344054] outline-none transition focus:border-[#5658E8] focus:ring-4 focus:ring-[#5658E8]/10 disabled:cursor-not-allowed disabled:bg-[#F8F9FB]"
                            >
                              <option value="">Select a skill</option>
                              {availableSkillsForRow.map((skill) => (
                                <option
                                  key={skill.id}
                                  value={skill.id}
                                >
                                  {skill.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="mt-3">
                            <p className="text-[10px] font-semibold text-[#344054]">
                              Questions for this section
                            </p>

                            <div className="mt-2 rounded-lg border border-[#EAE5F9] bg-[#FAFAFF] px-3 py-2">
                              <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#7862C8]">
                                {String(sectionDifficulty).replace(/^./, (char) => char.toUpperCase())} difficulty
                              </span>
                            </div>

                            <div className="mt-2 max-w-[220px]">
                              <NumberField
                                id={`builder-question-count-${allocation.rowId}`}
                                label="Question count"
                                value={allocation.questionCount}
                                onChange={(value) =>
                                  handleAllocationChange(
                                    allocation.rowId,
                                    "questionCount",
                                    value,
                                  )
                                }
                                disabled={creating}
                              />
                            </div>

                            <div className="mt-2 flex items-center justify-between rounded-lg border border-[#EAE5F9] bg-[#FAFAFF] px-3 py-2">
                              <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#7862C8]">
                                Skill total
                              </span>
                              <span className="text-sm font-bold text-[#5658E8]">
                                {allocationTotal}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl border border-[#EAE5F9] bg-[#FAFAFF] px-3.5 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7862C8]">
                        Section total
                      </span>
                      <p className="mt-1 text-[10px] text-[#98A2B3]">
                        Combined across all selected skills
                      </p>
                    </div>

                    <span className="text-base font-bold text-[#5658E8]">
                      {draftSectionTotal}
                    </span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={
                    creating ||
                    !sectionName.trim() ||
                    draftSectionTotal <= 0 ||
                    allocations.some((allocation) => !allocation.skillId)
                  }
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#5658E8] px-4 text-xs font-semibold text-white transition hover:bg-[#494BD8] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {creating ? (
                    <>
                      <RefreshCw
                        size={14}
                        className="animate-spin"
                      />
                      Creating section...
                    </>
                  ) : (
                    <>
                      <Plus size={14} />
                      Create Section
                    </>
                  )}
                </button>

                <p className="text-[10px] leading-5 text-[#98A2B3]">
                  The same skill may be used again in another section. It only cannot be duplicated inside this section.
                </p>
              </form>
            )}
          </section>
        </div>

        <section className="rounded-[18px] border border-[#E3E6EB] bg-white p-5 shadow-[0_8px_24px_rgba(27,37,58,0.025)] sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#98A2B3]">
                Next step
              </p>

              <h2 className="mt-1.5 text-base font-semibold text-[#202938]">
                Configure the assessment
              </h2>

              <p className="mt-1.5 text-xs leading-5 text-[#98A2B3]">
                Once your sections are defined, configure the total assessment size, time limit, and candidate instructions.
              </p>
            </div>

            <button
              type="button"
              onClick={handleContinue}
              disabled={sections.length === 0}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#5658E8] px-4 text-xs font-semibold text-white transition hover:bg-[#494BD8] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Continue to Configuration
              <ArrowRight size={14} />
            </button>
          </div>
        </section>
      </div>
    </RecruiterLayout>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  accent,
}) {
  const styles = {
    purple: {
      icon: "bg-[#F3E3F2] text-[#AA5E9C]",
    },
    green: {
      icon: "bg-[#ECFDF3] text-[#027A48]",
    },
    blue: {
      icon: "bg-[#EAE5F9] text-[#7862C8]",
    },
  };

  const style = styles[accent] || styles.purple;

  return (
    <div className="rounded-[16px] border border-[#E3E6EB] bg-white p-4 shadow-[0_6px_20px_rgba(27,37,58,0.025)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#98A2B3]">
            {label}
          </p>

          <p className="mt-2 text-[25px] font-semibold tracking-[-0.03em] text-[#202938]">
            {value}
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

function CountBox({
  label,
  value,
  accent,
}) {
  const styles = {
    total: {
      wrapper: "bg-[#F8F9FB] border-[#E6E9EF]",
      value: "text-[#344054]",
    },
    easy: {
      wrapper: "bg-[#F7FBFF] border-[#DCEBF5]",
      value: "text-[#35759B]",
    },
    medium: {
      wrapper: "bg-[#FAF8FF] border-[#E7E0F5]",
      value: "text-[#7862C8]",
    },
    hard: {
      wrapper: "bg-[#FFF8F6] border-[#F2DED7]",
      value: "text-[#A76D5B]",
    },
  };

  const style = styles[accent] || styles.total;

  return (
    <div
      className={`min-w-[52px] rounded-lg border px-2.5 py-2 text-center ${style.wrapper}`}
    >
      <p className="text-[8px] font-bold uppercase tracking-[0.1em] text-[#98A2B3]">
        {label}
      </p>

      <p className={`mt-1 text-sm font-bold ${style.value}`}>
        {value}
      </p>
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  disabled,
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="text-[10px] font-semibold text-[#667085]"
      >
        {label}
      </label>

      <input
        id={id}
        type="number"
        min="0"
        step="1"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="mt-1.5 h-10 w-full rounded-lg border border-[#D7DCE5] bg-white px-3 text-sm font-semibold text-[#344054] outline-none transition focus:border-[#5658E8] focus:ring-4 focus:ring-[#5658E8]/10 disabled:cursor-not-allowed disabled:bg-[#F8F9FB]"
      />
    </div>
  );
}

export default QuestionSetBuilder;
