import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  Edit3,
  FilePlus2,
  History,
  Layers3,
  RefreshCw,
  Search,
  SlidersHorizontal,
  ShieldCheck,
  Sparkles,
  Star,
  X,
} from "lucide-react";

import api from "../services/api";
import QuestionText from "../components/QuestionText";
import { useAuth } from "../context/AuthContext";
import RecruiterLayout from "../layouts/RecruiterLayout";

const DIFFICULTIES = ["easy", "medium", "hard"];

const DIFFICULTY_LABELS = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

const SECTION_TYPE_LABELS = {
  conceptual: "Conceptual",
  implementation: "Implementation",
  free_text: "Free Text",
};

const SECTION_TYPE_DESCRIPTIONS = {
  conceptual:
    "Assess fundamentals, principles, behaviour, comparisons and technical reasoning.",
  implementation:
    "Assess practical execution through code, SQL, debugging, APIs and engineering scenarios.",
  free_text:
    "Assess how candidates explain, design, debug and justify solutions using their own response.",
};

// A restrained, persistent color system distinguishes section types without
// relying on decorative hover animations or top-of-card color strips.
function getQuestionIndexPreview(value) {
  return String(value || "")
    .replace(/```[A-Za-z0-9_+#.-]*\s*/g, "")
    .replace(/```/g, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

const QUESTION_SECTION_TONES = {
  conceptual: {
    // Neutral surfaces are the default. Section color is confined to small labels.
    sectionHeader: "border-[#E3E7EE] bg-white",
    sectionLetter: "bg-[#ECE8FF] text-[#5B4BB7]",
    sectionEyebrow: "text-[#7464C1]",
    sectionType: "border-[#E3DDF8] bg-[#FAF9FF] text-[#5B4BB7]",
    preparedBadge: "bg-[#F1EEFF] text-[#5B4BB7]",
    cardBorder: "border-[#E0E5EC]",
    cardBackground: "bg-white",
    numberBadge: "border-[#E0E5EC] bg-[#F7F8FA] text-[#536273]",
    difficultyBadge: "bg-[#F1EEFF] text-[#5B4BB7]",
    skillPanel: "border-[#E4E8EF] bg-[#FAFBFC]",
    skillSelect: "border-[#D9DFE8] bg-white",
    helperText: "text-[#758195]",
    questionPanel: "border-[#E6EAF0] bg-white",
    emptyBorder: "border-[#DDE3EB]",
    emptyBackground: "bg-[#FAFBFC]",
    emptyTitle: "text-[#344054]",
    emptyText: "text-[#7B8794]",
  },
  implementation: {
    sectionHeader: "border-[#E3E7EE] bg-white",
    sectionLetter: "bg-[#DDF3EA] text-[#147564]",
    sectionEyebrow: "text-[#277D6D]",
    sectionType: "border-[#D3EAE1] bg-[#F7FCF9] text-[#147564]",
    preparedBadge: "bg-[#E8F6F0] text-[#147564]",
    cardBorder: "border-[#E0E5EC]",
    cardBackground: "bg-white",
    numberBadge: "border-[#E0E5EC] bg-[#F7F8FA] text-[#536273]",
    difficultyBadge: "bg-[#E8F6F0] text-[#147564]",
    skillPanel: "border-[#E4E8EF] bg-[#FAFBFC]",
    skillSelect: "border-[#D9DFE8] bg-white",
    helperText: "text-[#758195]",
    questionPanel: "border-[#E6EAF0] bg-white",
    emptyBorder: "border-[#DDE3EB]",
    emptyBackground: "bg-[#FAFBFC]",
    emptyTitle: "text-[#344054]",
    emptyText: "text-[#7B8794]",
  },
  free_text: {
    sectionHeader: "border-[#E3E7EE] bg-white",
    sectionLetter: "bg-[#FBE8F0] text-[#A34E79]",
    sectionEyebrow: "text-[#A34E79]",
    sectionType: "border-[#F0DDE6] bg-[#FFFAFC] text-[#A34E79]",
    preparedBadge: "bg-[#FBF0F5] text-[#A34E79]",
    cardBorder: "border-[#E0E5EC]",
    cardBackground: "bg-white",
    numberBadge: "border-[#E0E5EC] bg-[#F7F8FA] text-[#536273]",
    difficultyBadge: "bg-[#FBF0F5] text-[#A34E79]",
    skillPanel: "border-[#E4E8EF] bg-[#FAFBFC]",
    skillSelect: "border-[#D9DFE8] bg-white",
    helperText: "text-[#758195]",
    questionPanel: "border-[#E6EAF0] bg-white",
    emptyBorder: "border-[#DDE3EB]",
    emptyBackground: "bg-[#FAFBFC]",
    emptyTitle: "text-[#344054]",
    emptyText: "text-[#7B8794]",
  },
};

function getQuestionSectionTone(sectionType) {
  const key = String(sectionType || "conceptual").toLowerCase();
  return QUESTION_SECTION_TONES[key] || QUESTION_SECTION_TONES.conceptual;
}

function ManagerAssessmentSets() {
  const { questionSetId } = useParams();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [workspace, setWorkspace] = useState(null);
  const [activeSetId, setActiveSetId] = useState(null);
  const [expandedSections, setExpandedSections] = useState({});
  const [expandedIndexSectionId, setExpandedIndexSectionId] = useState();
  const pendingQuestionNavigationRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [generatingSlotId, setGeneratingSlotId] = useState(null);
  const [generationStartedAt, setGenerationStartedAt] = useState(null);
  const [acceptingAttemptId, setAcceptingAttemptId] = useState(null);
  const [restoringAttemptId, setRestoringAttemptId] = useState(null);
  const [ratingQuestionId, setRatingQuestionId] = useState(null);
  const [savingSkillSlotId, setSavingSkillSlotId] = useState(null);
  const [savingQuestionTypeSlotId, setSavingQuestionTypeSlotId] = useState(null);
  const [submittingAssessmentSetId, setSubmittingAssessmentSetId] = useState(null);
  const [materializingAssessmentSetId, setMaterializingAssessmentSetId] = useState(null);
  const [publishingAssessmentId, setPublishingAssessmentId] = useState(null);
  const [materializedAssessments, setMaterializedAssessments] = useState({});

  const [candidateReview, setCandidateReview] = useState(null);
  const [candidatePool, setCandidatePool] = useState(null);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidatePattern, setCandidatePattern] = useState("all");
  const [candidateLength, setCandidateLength] = useState("all");
  const [candidateSort, setCandidateSort] = useState("newest");
  const [candidatePromptDraft, setCandidatePromptDraft] = useState("");
  const [manualSlot, setManualSlot] = useState(null);
  const [existingSlot, setExistingSlot] = useState(null);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [historicalQuestions, setHistoricalQuestions] = useState([]);
  const [bankQuestions, setBankQuestions] = useState([]);
  const [loadingHistorical, setLoadingHistorical] = useState(false);
  const [loadingBank, setLoadingBank] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const [generationRequest, setGenerationRequest] = useState(null);
  const [generationPromptDraft, setGenerationPromptDraft] = useState("");
  const [generationStrategyDraft, setGenerationStrategyDraft] = useState("balanced");
  const [generationFocusDraft, setGenerationFocusDraft] = useState("auto");

  const [sourceTab, setSourceTab] = useState("bank");
  const [sourceSearch, setSourceSearch] = useState("");
  const [sourceSort, setSourceSort] = useState("rating");

  const [manualForm, setManualForm] = useState({
    question_text: "",
    options: ["", "", "", ""],
    correct_answer: "",
    explanation: "",
  });

  const [editForm, setEditForm] = useState({
    question_text: "",
    options: ["", "", "", ""],
    correct_answer: "",
    correct_answer_index: "",
    explanation: "",
  });

  const getErrorMessage = (err, fallback) => {
    const detail = err?.response?.data?.detail;

    if (Array.isArray(detail)) {
      return detail
        .map((item) =>
          typeof item === "string"
            ? item
            : item?.msg || JSON.stringify(item)
        )
        .filter(Boolean)
        .join(" ");
    }

    return typeof detail === "string" ? detail : fallback;
  };

  const handleUnauthorized = (err) => {
    if (err?.response?.status === 401) {
      logout();
      navigate("/login", { replace: true });
      return true;
    }

    return false;
  };

  const loadWorkspace = async (showRefresh = false) => {
    try {
      setError("");
      setSuccess("");

      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      // The main authoring workspace is required for the page to render.
      // Bound the request so a slow or unreachable API fails visibly instead
      // of leaving the page on the loading spinner indefinitely.
      const response = await api.get(
        `/assessment-authoring/question-sets/${questionSetId}`,
        { timeout: 15000 }
      );

      const data = response.data;

      setWorkspace(data);

      // Candidate-facing assessment variants are optional metadata. Fetch
      // them in the background: do not await this call, because an unrelated
      // slow endpoint must never block the question-authoring workspace.
      void api
        .get(`/assessments/question-set/${questionSetId}/variants`, {
          timeout: 5000,
        })
        .then((assessmentResponse) => {
          const assessmentRows = Array.isArray(
            assessmentResponse.data
          )
            ? assessmentResponse.data
            : [];

          const assessmentMap = {};

          for (const assessment of assessmentRows) {
            const matchingSet = (data?.sets || []).find(
              (assessmentSet) =>
                Number(assessmentSet?.variant_number) ===
                Number(assessment?.variant_number)
            );

            if (matchingSet?.id != null) {
              assessmentMap[matchingSet.id] = assessment;
            }
          }

          setMaterializedAssessments(assessmentMap);
        })
        .catch((assessmentErr) => {
          console.warn(
            "Unable to load candidate-facing assessment variants:",
            assessmentErr
          );
        });

      const firstSet = Array.isArray(data?.sets) ? data.sets[0] : null;

      setActiveSetId((current) => {
        if (
          current &&
          data?.sets?.some((item) => Number(item.id) === Number(current))
        ) {
          return current;
        }

        return firstSet?.id || null;
      });

      const initialSections = {};

      for (const section of data?.sections || []) {
        initialSections[section.id] = true;
      }

      setExpandedSections((current) => ({
        ...initialSections,
        ...current,
      }));
    } catch (err) {
      console.error("Failed to load assessment authoring workspace:", err);

      if (handleUnauthorized(err)) {
        return;
      }

      setError(
        getErrorMessage(
          err,
          "Unable to load the assessment set workspace."
        )
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadWorkspace();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionSetId]);

  const activeSet = useMemo(
    () =>
      workspace?.sets?.find(
        (item) => Number(item.id) === Number(activeSetId)
      ) || null,
    [workspace, activeSetId]
  );

  const sections = useMemo(() => {
    const definedSections = Array.isArray(workspace?.sections)
      ? [...workspace.sections]
      : [];

    return definedSections.sort(
      (a, b) =>
        Number(a.display_order || a.id) -
        Number(b.display_order || b.id)
    );
  }, [workspace]);

  const availableSkills = useMemo(() => {
    const skills = Array.isArray(workspace?.available_skills)
      ? workspace.available_skills
      : Array.isArray(workspace?.skills)
        ? workspace.skills
        : [];

    return [...skills].sort((a, b) =>
      String(a.name || a.skill_name || "").localeCompare(
        String(b.name || b.skill_name || "")
      )
    );
  }, [workspace]);

  const getSlotsForSection = (sectionId) =>
    (activeSet?.slots || [])
      .filter(
        (slot) => Number(slot.section_id) === Number(sectionId)
      )
      .sort(
        (a, b) =>
          Number(a.slot_number) - Number(b.slot_number)
      );

  /*
   * IMPORTANT:
   * Never rely only on the cached assessmentSet.summary here.
   *
   * When a manager accepts the last generated candidate, the slot updates
   * immediately in React, while the previously loaded summary may still say
   * 9/10. Readiness must therefore be derived from the actual slot objects.
   */
  const activeSetSlots = Array.isArray(activeSet?.slots)
    ? activeSet.slots
    : [];

  const totalSlots = Number(
    activeSet?.summary?.total_slots ??
      activeSetSlots.length ??
      0
  );

  const filledSlots = activeSetSlots.filter(
    (slot) =>
      slot?.current_question_id != null ||
      Boolean(slot?.current_question)
  ).length;

  const pendingSlots = activeSetSlots.filter(
    (slot) =>
      slot?.current_question?.status === "pending_review"
  ).length;

  const approvedSlots = activeSetSlots.filter(
    (slot) =>
      slot?.current_question?.status === "approved"
  ).length;

  const remainingSlots = Math.max(
    totalSlots - filledSlots,
    0
  );

  const progress = totalSlots
    ? Math.round((filledSlots / totalSlots) * 100)
    : 0;

  const setLabel = (set) =>
    set?.label ||
    `Set ${String.fromCharCode(
      64 + Number(set?.variant_number || 1)
    )}`;

  const getSectionDescription = (section) => {
    const key = String(
      section?.section_type || "conceptual"
    ).toLowerCase();

    const description = String(
      section?.description || ""
    ).trim();

    const normalized = description.toLowerCase();

    const knownGeneric = new Set([
      "easy-only fundamentals, concepts, principles and reasoning.",
      "easy-only fundamentals, concepts, principles and reasoning",
      "concepts, principles, reasoning and application.",
      "concepts, principles, reasoning and application",
    ]);

    if (
      description &&
      !knownGeneric.has(normalized)
    ) {
      return description;
    }

    return (
      SECTION_TYPE_DESCRIPTIONS[key] ||
      SECTION_TYPE_DESCRIPTIONS.conceptual
    );
  };

  const toggleSection = (sectionId) => {
    setExpandedSections((current) => ({
      ...current,
      [sectionId]: current[sectionId] === false,
    }));
  };

  const navigateToQuestion = (sectionId, slotId) => {
    pendingQuestionNavigationRef.current = slotId;
    setExpandedSections((current) => ({
      ...current,
      [sectionId]: true,
    }));
  };

  useEffect(() => {
    const slotId = pendingQuestionNavigationRef.current;
    if (slotId == null) return;

    const target = document.getElementById(`question-slot-${slotId}`);
    if (!target) return;

    target.scrollIntoView({ behavior: "smooth", block: "start" });
    pendingQuestionNavigationRef.current = null;
  }, [expandedSections]);

  const updateWorkspaceSlot = (
    currentWorkspace,
    slotId,
    payload
  ) => {
    if (!currentWorkspace || !payload?.slot) {
      return currentWorkspace;
    }

    const incoming = payload.slot;

    return {
      ...currentWorkspace,

      sets: (currentWorkspace.sets || []).map(
        (assessmentSet) => {
          const slots = (
            assessmentSet.slots || []
          ).map((slot) =>
            Number(slot.id) === Number(slotId)
              ? incoming
              : slot
          );

          const totalSlots = Number(
            assessmentSet?.summary?.total_slots ??
              slots.length ??
              0
          );

          const filledSlots = slots.filter(
            (slot) =>
              slot?.current_question_id != null ||
              Boolean(slot?.current_question)
          ).length;

          const pendingReview = slots.filter(
            (slot) =>
              slot?.current_question?.status ===
              "pending_review"
          ).length;

          const approved = slots.filter(
            (slot) =>
              slot?.current_question?.status ===
              "approved"
          ).length;

          return {
            ...assessmentSet,
            slots,

            summary: {
              ...(assessmentSet.summary || {}),
              total_slots: totalSlots,
              filled_slots: filledSlots,
              remaining_slots: Math.max(
                totalSlots - filledSlots,
                0
              ),
              pending_review: pendingReview,
              approved,
              ready_for_finalize:
                totalSlots > 0 &&
                filledSlots === totalSlots,
            },
          };
        }
      ),
    };
  };

  const getAssessmentSetSubmissionState = (
    assessmentSet
  ) => {
    const slots = Array.isArray(
      assessmentSet?.slots
    )
      ? assessmentSet.slots
      : [];

    const total = Number(
      assessmentSet?.summary?.total_slots ??
        slots.length ??
        0
    );

    const filled = slots.filter(
      (slot) =>
        slot?.current_question_id != null ||
        Boolean(slot?.current_question)
    ).length;

    const remaining = Math.max(
      total - filled,
      0
    );

    const hasRejectedQuestion = slots.some(
      (slot) =>
        slot?.current_question?.status ===
        "rejected"
    );

    const status = String(
      assessmentSet?.status || "draft"
    ).toLowerCase();

    const canSubmit =
      total > 0 &&
      remaining === 0 &&
      !hasRejectedQuestion &&
      (status === "draft" ||
        status === "rejected");

    return {
      total,
      filled,
      remaining,
      hasRejectedQuestion,
      status,
      canSubmit,
    };
  };

  const submitAssessmentSetForReview = async (
    assessmentSet
  ) => {
    if (!assessmentSet?.id) {
      return;
    }

    const state =
      getAssessmentSetSubmissionState(
        assessmentSet
      );

    if (!state.canSubmit) {
      if (state.hasRejectedQuestion) {
        setError(
          `${setLabel(
            assessmentSet
          )} cannot be submitted while a current question is rejected. Resolve the rejected question first.`
        );
      } else if (state.remaining > 0) {
        setError(
          `${setLabel(
            assessmentSet
          )} is not ready for review. ${state.remaining} required question${
            state.remaining === 1 ? "" : "s"
          } still need${
            state.remaining === 1 ? "s" : ""
          } to be prepared.`
        );
      } else {
        setError(
          `${setLabel(
            assessmentSet
          )} cannot be submitted from its current status.`
        );
      }

      return;
    }

    const confirmed = window.confirm(
      `Submit ${setLabel(
        assessmentSet
      )} for review? Only this set will be sent to the assigned reviewer.`
    );

    if (!confirmed) {
      return;
    }

    try {
      setSubmittingAssessmentSetId(
        assessmentSet.id
      );

      setError("");
      setSuccess("");

      const response = await api.post(
        `/assessment-authoring/sets/${assessmentSet.id}/submit-review`
      );

      const submittedSet =
        response.data || {};

      setWorkspace((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,

          sets: (current.sets || []).map(
            (item) =>
              Number(item.id) ===
              Number(assessmentSet.id)
                ? {
                    ...item,
                    ...submittedSet,

                    status:
                      submittedSet.status ||
                      "submitted_for_review",

                    summary:
                      submittedSet.summary ||
                      item.summary,

                    slots:
                      submittedSet.slots ||
                      item.slots,
                  }
                : item
          ),
        };
      });

      const reviewerName =
        submittedSet?.assigned_reviewer
          ?.username;

      setSuccess(
        `${setLabel(
          assessmentSet
        )} has been submitted for review${
          reviewerName
            ? ` to ${reviewerName}`
            : ""
        }.`
      );
    } catch (err) {
      console.error(
        "Failed to submit assessment set for review:",
        err
      );

      if (handleUnauthorized(err)) {
        return;
      }

      setError(
        getErrorMessage(
          err,
          `Unable to submit ${setLabel(
            assessmentSet
          )} for review.`
        )
      );
    } finally {
      setSubmittingAssessmentSetId(null);
    }
  };

  const materializeAssessmentSet = async (
    assessmentSet
  ) => {
    if (!assessmentSet?.id) {
      return;
    }

    const status = String(
      assessmentSet?.status || "draft"
    ).toLowerCase();

    if (status !== "approved") {
      setError(
        `${setLabel(
          assessmentSet
        )} must be approved by the reviewer before a candidate assessment can be created.`
      );
      return;
    }

    const existingAssessment =
      materializedAssessments[assessmentSet.id];

    if (existingAssessment?.id) {
      setError(
        "A candidate-facing assessment has already been created for this set."
      );
      return;
    }

    try {
      setMaterializingAssessmentSetId(
        assessmentSet.id
      );
      setError("");
      setSuccess("");

      const response = await api.post(
        `/assessments/from-set/${assessmentSet.id}`
      );

      const assessment =
        response.data || null;

      if (!assessment?.id) {
        throw new Error(
          "The candidate-facing assessment was created but no assessment ID was returned."
        );
      }

      setMaterializedAssessments((current) => ({
        ...current,
        [assessmentSet.id]: assessment,
      }));

      setSuccess(
        `${setLabel(
          assessmentSet
        )} has been converted into a candidate-facing assessment and is ready for the publishing step.`
      );
    } catch (err) {
      console.error(
        "Failed to materialize assessment set:",
        err
      );

      if (handleUnauthorized(err)) {
        return;
      }

      setError(
        getErrorMessage(
          err,
          `Unable to create the candidate-facing assessment for ${setLabel(
            assessmentSet
          )}.`
        )
      );
    } finally {
      setMaterializingAssessmentSetId(null);
    }
  };

  const publishCandidateAssessment = async (
    assessmentSet,
    assessment
  ) => {
    if (!assessmentSet?.id || !assessment?.id) {
      return;
    }

    const assessmentStatus = String(
      assessment?.status || ""
    ).toLowerCase();

    if (assessmentStatus === "published") {
      setError(
        `Candidate assessment #${assessment.id} is already published.`
      );
      return;
    }

    if (assessmentStatus !== "ready") {
      setError(
        `Candidate assessment #${assessment.id} must be ready before it can be published.`
      );
      return;
    }

    const confirmed = window.confirm(
      `Publish the candidate assessment for ${setLabel(
        assessmentSet
      )}? Once published, it can proceed to candidate assignment.`
    );

    if (!confirmed) {
      return;
    }

    try {
      setPublishingAssessmentId(assessment.id);
      setError("");
      setSuccess("");

      const response = await api.post(
        `/assessment-delivery/assessments/${assessment.id}/publish`
      );

      const publishedAssessment =
        response.data || {};

      setMaterializedAssessments((current) => ({
        ...current,
        [assessmentSet.id]: {
          ...current[assessmentSet.id],
          ...publishedAssessment,
          status: publishedAssessment.status || "published",
        },
      }));

      setSuccess(
        `${setLabel(
          assessmentSet
        )} is now published as candidate assessment #${
          publishedAssessment.id || assessment.id
        } and is ready for assignment.`
      );
    } catch (err) {
      console.error(
        "Failed to publish candidate assessment:",
        err
      );

      if (handleUnauthorized(err)) {
        return;
      }

      setError(
        getErrorMessage(
          err,
          `Unable to publish candidate assessment #${
            assessment.id
          }.`
        )
      );
    } finally {
      setPublishingAssessmentId(null);
    }
  };

  const selectSlotSkill = async (
    slot,
    skillId
  ) => {
    if (
      !skillId ||
      Number(skillId) ===
        Number(slot.skill_id)
    ) {
      return;
    }

    if (slot.current_question) {
      setError(
        "The skill can only be changed while the slot is empty. Replace or clear the current question first."
      );
      return;
    }

    try {
      setSavingSkillSlotId(slot.id);
      setError("");

      const response = await api.put(
        `/assessment-authoring/slots/${slot.id}/skill`,
        {
          skill_id: Number(skillId),
        }
      );

      setWorkspace((current) =>
        updateWorkspaceSlot(
          current,
          slot.id,
          response.data
        )
      );
    } catch (err) {
      console.error(
        "Failed to change slot skill:",
        err
      );

      if (handleUnauthorized(err)) {
        return;
      }

      setError(
        getErrorMessage(
          err,
          "Unable to update the slot skill."
        )
      );
    } finally {
      setSavingSkillSlotId(null);
    }
  };

  const selectSlotQuestionType = async (
    slot,
    questionType
  ) => {
    if (
      !questionType ||
      questionType ===
        (slot.preferred_question_type ||
          "MCQ")
    ) {
      return;
    }

    if (slot.current_question) {
      setError(
        "Question type can only be changed while the slot is empty. Generate or add a candidate after choosing the type."
      );
      return;
    }

    try {
      setSavingQuestionTypeSlotId(slot.id);
      setError("");

      const response = await api.put(
        `/assessment-authoring/slots/${slot.id}/question-type`,
        {
          question_type: questionType,
        }
      );

      setWorkspace((current) =>
        updateWorkspaceSlot(
          current,
          slot.id,
          response.data
        )
      );
    } catch (err) {
      console.error(
        "Failed to change question type:",
        err
      );

      if (handleUnauthorized(err)) {
        return;
      }

      setError(
        getErrorMessage(
          err,
          "Unable to update the question type."
        )
      );
    } finally {
      setSavingQuestionTypeSlotId(null);
    }
  };

  const openGenerationDialog = (
    slot,
    count
  ) => {
    setError("");
    setGenerationPromptDraft("");
    setGenerationStrategyDraft(
      "balanced"
    );
    setGenerationFocusDraft("auto");

    setGenerationRequest({
      slot,
      count: Math.min(
        Math.max(
          Number(count) || 1,
          1
        ),
        50
      ),
    });
  };

  const generateForSlot = async (
    slot,
    count,
    managerPrompt = "",
    generationStrategy = "balanced",
    generationFocus = "auto",
    appendToExistingPool = false
  ) => {
    const normalizedCount =
      Math.min(
        Math.max(
          Number(count) || 1,
          1
        ),
        50
      );

    const normalizedPrompt =
      managerPrompt.trim();

    const mergeAttempts = (
      existing,
      incoming
    ) => {
      const rows = [
        ...(Array.isArray(existing)
          ? existing
          : []),

        ...(Array.isArray(incoming)
          ? incoming
          : []),
      ];

      return rows.filter(
        (attempt, index, allRows) =>
          attempt?.id != null &&
          allRows.findIndex(
            (item) =>
              item?.id === attempt?.id
          ) === index
      );
    };

    const updateCandidatePoolFromBatch = (
      batchData,
      fallbackSlot = slot
    ) => {
      const incomingSlot =
        batchData?.slot ||
        fallbackSlot;

      const incomingAttempts =
        Array.isArray(batchData?.attempts)
          ? batchData.attempts
          : [];

      setWorkspace((current) =>
        updateWorkspaceSlot(
          current,
          slot.id,
          batchData
        )
      );

      setCandidatePool(
        (currentPool) => {
          const sameSlot =
            Number(
              currentPool?.slot?.id
            ) === Number(slot.id);

          const previousAttempts =
            appendToExistingPool &&
            sameSlot
              ? currentPool?.attempts || []
              : [];

          const mergedAttempts =
            mergeAttempts(
              previousAttempts,
              incomingAttempts
            );

          return {
            slot: incomingSlot,
            attempts: mergedAttempts,

            referenceQuestion:
              incomingSlot?.current_question ||
              fallbackSlot.current_question ||
              null,

            generatedCount:
              mergedAttempts.length,

            requestedCount: Number(
              batchData?.requested_count ||
                normalizedCount
            ),

            batchRequestedCount:
              Number(
                batchData?.requested_count ||
                  normalizedCount
              ),

            managerPrompt:
              batchData?.manager_prompt ??
              normalizedPrompt ??
              (sameSlot
                ? currentPool?.managerPrompt ||
                  ""
                : ""),

            generationStrategy:
              batchData?.generation_strategy ||
              generationStrategy ||
              (sameSlot
                ? currentPool?.generationStrategy ||
                  "balanced"
                : "balanced"),

            generationFocus:
              batchData?.generation_focus ||
              generationFocus ||
              (sameSlot
                ? currentPool?.generationFocus ||
                  "auto"
                : "auto"),

            warning:
              batchData?.warning || "",

            shortfall: Number(
              batchData?.shortfall || 0
            ),

            generationStatus: "finished",
            generationError: "",
          };
        }
      );
    };

    try {
      setError("");
      setSuccess("");
      setGeneratingSlotId(slot.id);
      setGenerationStartedAt(Date.now());

      const response = await api.post(
        `/assessment-authoring/slots/${slot.id}/generate-batch?count=${normalizedCount}`,
        {
          manager_prompt:
            normalizedPrompt || null,
          generation_strategy:
            generationStrategy,
          generation_focus:
            generationFocus,
        }
      );

      const batchData =
        response.data || {};

      const requested = Number(
        batchData.requested_count ||
          normalizedCount
      );

      const generated = Number(
        batchData.generated_count ||
          0
      );

      setGenerationRequest(null);
      setCandidateSearch("");
      setCandidatePattern("all");
      setCandidateLength("all");
      setCandidateSort("newest");
      setCandidatePromptDraft(
        normalizedPrompt
      );

      updateCandidatePoolFromBatch(
        batchData
      );

      if (
        Number(batchData.shortfall || 0) >
        0
      ) {
        setSuccess(
          `Generated ${generated} of ${requested} requested candidates. Only validated candidates were kept.`
        );
      } else {
        setSuccess(
          `${generated} AI candidate${
            generated === 1 ? "" : "s"
          } generated and added to the review pool.`
        );
      }
    } catch (err) {
      console.error(
        "Failed to generate question batch:",
        err
      );

      if (handleUnauthorized(err)) {
        return;
      }

      setError(
        getErrorMessage(
          err,
          "Unable to generate the question batch. Check the backend and Gemini configuration."
        )
      );
    } finally {
      setGeneratingSlotId(null);
      setGenerationStartedAt(null);
    }
  };

  const submitGenerationRequest = async (
    event
  ) => {
    event.preventDefault();

    if (!generationRequest) {
      return;
    }

    const prompt =
      generationPromptDraft.trim();

    if (prompt.length > 1200) {
      setError(
        "Manager guidance must be 1200 characters or fewer."
      );
      return;
    }

    await generateForSlot(
      generationRequest.slot,
      generationRequest.count,
      prompt,
      generationStrategyDraft,
      generationFocusDraft
    );
  };

  const regenerateCandidatePool =
    async () => {
      if (!candidatePool?.slot?.id) {
        return;
      }

      await generateForSlot(
        candidatePool.slot,
        Number(
          candidatePool.requestedCount || 3
        ),
        candidatePromptDraft.trim() ||
          candidatePool.managerPrompt ||
          "",
        candidatePool.generationStrategy ||
          "balanced",
        candidatePool.generationFocus ||
          "auto",
        true
      );
    };

  const acceptAttempt = async (
    slot,
    attempt
  ) => {
    if (!attempt?.id) {
      return;
    }

    if (
      slot.current_question &&
      !window.confirm(
        "Use this AI question in the slot? The current question will remain preserved in generation history."
      )
    ) {
      return;
    }

    try {
      setError("");
      setAcceptingAttemptId(attempt.id);

      const response = await api.post(
        `/assessment-authoring/slots/${slot.id}/attempts/${attempt.id}/accept`
      );

      setWorkspace((current) =>
        updateWorkspaceSlot(
          current,
          slot.id,
          response.data
        )
      );

      setCandidateReview(null);

      setSuccess(
        `Question ${slot.slot_number} is now using the selected AI candidate.`
      );
    } catch (err) {
      console.error(
        "Failed to accept AI candidate:",
        err
      );

      if (handleUnauthorized(err)) {
        return;
      }

      setError(
        getErrorMessage(
          err,
          "Unable to accept the generated question."
        )
      );
    } finally {
      setAcceptingAttemptId(null);
    }
  };

  const restoreAttempt = async (
    slot,
    attempt
  ) => {
    if (!attempt?.id) {
      return;
    }

    if (
      !window.confirm(
        "Restore this question into the slot? The current question will remain preserved in history."
      )
    ) {
      return;
    }

    try {
      setError("");
      setRestoringAttemptId(attempt.id);

      const response = await api.post(
        `/assessment-authoring/slots/${slot.id}/attempts/${attempt.id}/restore`
      );

      setWorkspace((current) =>
        updateWorkspaceSlot(
          current,
          slot.id,
          response.data
        )
      );

      setSuccess(
        `Generation #${attempt.attempt_number} restored.`
      );
    } catch (err) {
      console.error(
        "Failed to restore question:",
        err
      );

      if (handleUnauthorized(err)) {
        return;
      }

      setError(
        getErrorMessage(
          err,
          "Unable to restore the selected question."
        )
      );
    } finally {
      setRestoringAttemptId(null);
    }
  };

  const openManual = (slot) => {
    setError("");
    setManualSlot(slot);

    setManualForm({
      question_text: "",
      options:
        (
          slot.preferred_question_type ||
          (
            slot.section_type ===
            "free_text"
              ? "FREE_TEXT"
              : "MCQ"
          )
        ) === "FREE_TEXT"
          ? []
          : ["", "", "", ""],

      correct_answer: "",
      explanation: "",
    });
  };

  const saveManual = async (
    event
  ) => {
    event.preventDefault();

    if (!manualSlot) {
      return;
    }

    try {
      setSavingManual(true);
      setError("");

      const response = await api.post(
        `/assessment-authoring/slots/${manualSlot.id}/manual`,
        {
          question_text:
            manualForm.question_text,

          question_type:
            manualSlot.preferred_question_type ||
            (
              manualSlot.section_type ===
              "free_text"
                ? "FREE_TEXT"
                : "MCQ"
            ),

          options: manualForm.options,

          correct_answer:
            manualForm.correct_answer ||
            null,

          explanation:
            manualForm.explanation ||
            null,
        }
      );

      setWorkspace((current) =>
        updateWorkspaceSlot(
          current,
          manualSlot.id,
          response.data
        )
      );

      setManualSlot(null);

      setSuccess(
        "Manual question saved. The next AI generation for this slot will use it as context."
      );
    } catch (err) {
      console.error(
        "Failed to create manual question:",
        err
      );

      if (handleUnauthorized(err)) {
        return;
      }

      setError(
        getErrorMessage(
          err,
          "Unable to create the manual question."
        )
      );
    } finally {
      setSavingManual(false);
    }
  };

  const openExisting = async (
    slot
  ) => {
    setError("");
    setExistingSlot(slot);
    setSourceTab("bank");
    setSourceSearch("");
    setBankQuestions([]);
    setHistoricalQuestions([]);

    try {
      setLoadingBank(true);

      const response = await api.get(
        `/assessment-authoring/slots/${slot.id}/bank`
      );

      setBankQuestions(
        Array.isArray(response.data)
          ? response.data
          : []
      );
    } catch (err) {
      console.error(
        "Failed to load question bank candidates:",
        err
      );

      if (handleUnauthorized(err)) {
        return;
      }

      setError(
        getErrorMessage(
          err,
          "Unable to load matching question-bank questions."
        )
      );
    } finally {
      setLoadingBank(false);
    }
  };

  const openHistorical = async () => {
    if (!existingSlot) {
      return;
    }

    try {
      setLoadingHistorical(true);
      setHistoricalQuestions([]);

      const response = await api.get(
        `/assessment-authoring/slots/${existingSlot.id}/historical`
      );

      setHistoricalQuestions(
        Array.isArray(response.data)
          ? response.data
          : []
      );
    } catch (err) {
      console.error(
        "Failed to load historical questions:",
        err
      );

      if (handleUnauthorized(err)) {
        return;
      }

      setError(
        getErrorMessage(
          err,
          "Unable to load previous finalized questions."
        )
      );
    } finally {
      setLoadingHistorical(false);
    }
  };

  const useExisting = async (
    question
  ) => {
    if (
      !existingSlot ||
      !question?.id
    ) {
      return;
    }

    if (
      existingSlot.current_question &&
      !window.confirm(
        "Use this existing question in the slot? The current question remains preserved."
      )
    ) {
      return;
    }

    try {
      setError("");

      const response = await api.post(
        `/assessment-authoring/slots/${existingSlot.id}/existing/${question.id}`
      );

      setWorkspace((current) =>
        updateWorkspaceSlot(
          current,
          existingSlot.id,
          response.data
        )
      );

      setExistingSlot(null);

      setSuccess(
        "Existing question added to the slot."
      );
    } catch (err) {
      console.error(
        "Failed to use question-bank question:",
        err
      );

      if (handleUnauthorized(err)) {
        return;
      }

      setError(
        getErrorMessage(
          err,
          "Unable to use this existing question."
        )
      );
    }
  };

  const useHistorical = async (
    question
  ) => {
    if (
      !existingSlot ||
      !question?.id
    ) {
      return;
    }

    if (
      existingSlot.current_question &&
      !window.confirm(
        "Use this previous finalized question in the slot? The current question remains preserved."
      )
    ) {
      return;
    }

    try {
      const response = await api.post(
        `/assessment-authoring/slots/${existingSlot.id}/historical/${question.id}`
      );

      setWorkspace((current) =>
        updateWorkspaceSlot(
          current,
          existingSlot.id,
          response.data
        )
      );

      setExistingSlot(null);

      setSuccess(
        "Previous finalized question added to the slot."
      );
    } catch (err) {
      console.error(
        "Failed to use historical question:",
        err
      );

      if (handleUnauthorized(err)) {
        return;
      }

      setError(
        getErrorMessage(
          err,
          "Unable to use the historical question."
        )
      );
    }
  };

  const openEdit = (slot) => {
    const question =
      slot.current_question;

    if (!question) {
      return;
    }

    const normalizedOptions =
      question.question_type ===
      "FREE_TEXT"
        ? []
        : [
            ...(question.options || []),
            "",
            "",
            "",
            "",
          ].slice(
            0,
            Math.max(
              4,
              question.options?.length ||
                4
            )
          );

    const correctAnswerIndex =
      question.question_type ===
      "FREE_TEXT"
        ? -1
        : resolveCorrectAnswerIndex({
            ...question,
            options: normalizedOptions,
          });

    const normalizedCorrectAnswer =
      correctAnswerIndex >= 0
        ? normalizedOptions[
            correctAnswerIndex
          ]
        : "";

    setError("");

    setEditingQuestion({
      slot,
      question,
    });

    setEditForm({
      question_text:
        question.question_text || "",

      options: normalizedOptions,

      correct_answer:
        normalizedCorrectAnswer,

      correct_answer_index:
        correctAnswerIndex >= 0
          ? String(correctAnswerIndex)
          : "",

      explanation:
        question.explanation || "",
    });
  };

  const saveEdit = async (event) => {
    event.preventDefault();

    if (!editingQuestion) {
      return;
    }

    try {
      setSavingEdit(true);
      setError("");

      const {
        slot,
        question,
      } = editingQuestion;

      const normalizedOptions =
        (editForm.options || []).map(
          (option) =>
            String(
              option || ""
            ).trim()
        );

      let correctAnswer = null;

      if (
        question.question_type !==
        "FREE_TEXT"
      ) {
        const selectedIndex =
          Number(
            editForm.correct_answer_index
          );

        if (
          !Number.isInteger(
            selectedIndex
          ) ||
          selectedIndex < 0 ||
          selectedIndex >=
            normalizedOptions.length ||
          !normalizedOptions[
            selectedIndex
          ]
        ) {
          throw new Error(
            "The stored correct answer could not be resolved. Select the correct option before saving."
          );
        }

        correctAnswer =
          normalizedOptions[
            selectedIndex
          ];
      }

      const response = await api.put(
        `/assessment-authoring/questions/${question.id}`,
        {
          question_text:
            editForm.question_text,

          question_type:
            question.question_type,

          options:
            normalizedOptions,

          correct_answer:
            correctAnswer,

          explanation:
            editForm.explanation ||
            null,
        }
      );

      setWorkspace((current) =>
        updateWorkspaceSlot(
          current,
          slot.id,
          response.data
        )
      );

      setEditingQuestion(null);

      setSuccess(
        "Question version saved. It is back in pending review."
      );
    } catch (err) {
      console.error(
        "Failed to edit question:",
        err
      );

      if (handleUnauthorized(err)) {
        return;
      }

      setError(
        getErrorMessage(
          err,
          "Unable to save the question edit."
        )
      );
    } finally {
      setSavingEdit(false);
    }
  };

  const rateQuestion = async (
    questionId,
    rating
  ) => {
    try {
      setRatingQuestionId(
        questionId
      );

      setError("");

      const response = await api.put(
        `/assessment-authoring/questions/${questionId}/rating`,
        {
          rating,
        }
      );

      setWorkspace((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,

          sets: (current.sets || []).map(
            (assessmentSet) => ({
              ...assessmentSet,

              slots: (
                assessmentSet.slots || []
              ).map((slot) => {
                if (
                  slot.current_question
                    ?.id !== questionId
                ) {
                  return slot;
                }

                return {
                  ...slot,

                  current_question: {
                    ...slot.current_question,

                    manager_rating:
                      response.data
                        ?.manager_rating ??
                      rating,

                    reviewer_rating:
                      response.data
                        ?.reviewer_rating ??
                      slot.current_question
                        .reviewer_rating,
                  },
                };
              }),
            })
          ),
        };
      });
    } catch (err) {
      console.error(
        "Failed to rate question:",
        err
      );

      if (handleUnauthorized(err)) {
        return;
      }

      setError(
        getErrorMessage(
          err,
          "Unable to save the question rating."
        )
      );
    } finally {
      setRatingQuestionId(null);
    }
  };

  const filteredBankQuestions =
    useMemo(() => {
      const normalizedSearch =
        sourceSearch
          .trim()
          .toLowerCase();

      const rows =
        (bankQuestions || []).filter(
          (question) => {
            if (!normalizedSearch) {
              return true;
            }

            return String(
              question.question_text ||
                ""
            )
              .toLowerCase()
              .includes(
                normalizedSearch
              );
          }
        );

      return [...rows].sort(
        (a, b) => {
          const aReviewer = Number(
            a.reviewer_rating || 0
          );

          const bReviewer = Number(
            b.reviewer_rating || 0
          );

          const aManager = Number(
            a.manager_rating || 0
          );

          const bManager = Number(
            b.manager_rating || 0
          );

          const aCombined =
            aReviewer * 2 +
            aManager;

          const bCombined =
            bReviewer * 2 +
            bManager;

          if (
            sourceSort === "rating" &&
            aCombined !== bCombined
          ) {
            return (
              bCombined -
              aCombined
            );
          }

          if (
            sourceSort ===
            "newest"
          ) {
            return (
              Number(
                b.id || 0
              ) -
              Number(
                a.id || 0
              )
            );
          }

          return String(
            a.question_text ||
              ""
          ).localeCompare(
            String(
              b.question_text ||
                ""
            )
          );
        }
      );
    }, [
      bankQuestions,
      sourceSearch,
      sourceSort,
    ]);

  const filteredHistoricalQuestions =
    useMemo(() => {
      const normalizedSearch =
        sourceSearch
          .trim()
          .toLowerCase();

      const rows =
        (historicalQuestions || []).filter(
          (question) => {
            if (!normalizedSearch) {
              return true;
            }

            return String(
              question.question_text ||
                ""
            )
              .toLowerCase()
              .includes(
                normalizedSearch
              );
          }
        );

      return [...rows].sort(
        (a, b) => {
          const aReviewer = Number(
            a.reviewer_rating || 0
          );

          const bReviewer = Number(
            b.reviewer_rating || 0
          );

          const aManager = Number(
            a.manager_rating || 0
          );

          const bManager = Number(
            b.manager_rating || 0
          );

          const aCombined =
            aReviewer * 2 +
            aManager;

          const bCombined =
            bReviewer * 2 +
            bManager;

          if (
            aCombined !== bCombined
          ) {
            return (
              bCombined -
              aCombined
            );
          }

          return (
            Number(
              b.source_year || 0
            ) -
            Number(
              a.source_year || 0
            )
          );
        }
      );
    }, [
      historicalQuestions,
      sourceSearch,
    ]);

  if (loading) {
    return (
      <RecruiterLayout
        title="Question Set Builder"
        breadcrumb="Workspace / Question Sets"
      >
        <div className="flex min-h-[50vh] items-center justify-center text-sm text-[#667085]">
          <RefreshCw
            size={17}
            className="mr-2 animate-spin"
          />
          Loading assessment builder…
        </div>
      </RecruiterLayout>
    );
  }

  return (
    <RecruiterLayout
      title="Question Set Builder"
      breadcrumb={`Workspace / Question Sets / ${
        workspace?.name ||
        "Assessment"
      }`}
    >
      <main className="mx-auto max-w-[1380px] pb-16 text-[#202938]">

        <div className="flex items-start justify-between gap-5 border-b border-[#E5E7EB] pb-5">
          <div className="min-w-0">

            <button
              type="button"
              onClick={() =>
                navigate(-1)
              }
              className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#667085] hover:text-[#202938]"
            >
              <ArrowLeft size={14} />
              Back to question sets
            </button>

            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#7862C8]">
              <Layers3 size={13} />
              Assessment authoring
            </div>

            <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.03em] text-[#182033]">
              {workspace?.name ||
                "Assessment question set"}
            </h1>

            <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[#667085]">
              Prepare the candidate-facing questions for each set. Select the skill at the slot, then choose whether the question should come from AI, manual authoring, the current question bank, or a previous finalized assessment.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              loadWorkspace(true)
            }
            disabled={refreshing}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-[#D9DEE7] bg-white px-3.5 text-xs font-semibold text-[#475467] hover:border-[#BFC4CF] disabled:opacity-50"
          >
            <RefreshCw
              size={13}
              className={
                refreshing
                  ? "animate-spin"
                  : ""
              }
            />
            Refresh
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 border-l-2 border-[#D36B6B] bg-[#FFF8F8] px-4 py-3 text-xs leading-5 text-[#9F3F3F]">
            <X
              size={15}
              className="mt-0.5 shrink-0"
            />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mt-4 flex items-start gap-2 border-l-2 border-[#58A47B] bg-[#F7FCF9] px-4 py-3 text-xs leading-5 text-[#28734E]">
            <CheckCircle2
              size={15}
              className="mt-0.5 shrink-0"
            />
            <span>{success}</span>
          </div>
        )}

        <section className="mt-5 flex flex-col gap-4 border-b border-[#E5E7EB] pb-5 lg:flex-row lg:items-center lg:justify-between">

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-[#667085]">
            <span>
              <strong className="text-[#202938]">
                {totalSlots}
              </strong>{" "}
              questions
            </span>

            <span>
              <strong className="text-[#202938]">
                {filledSlots}
              </strong>{" "}
              prepared
            </span>

            <span>
              <strong className="text-[#202938]">
                {pendingSlots}
              </strong>{" "}
              pending review
            </span>

            <span>
              <strong className="text-[#28734E]">
                {approvedSlots}
              </strong>{" "}
              approved
            </span>

            <span>
              <strong className="text-[#202938]">
                {remainingSlots}
              </strong>{" "}
              remaining
            </span>
          </div>

          <div className="flex min-w-0 items-center gap-3">
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-[#ECEEF2]">
              <div
                className="h-full rounded-full bg-[#6658D7] transition-all"
                style={{
                  width: `${progress}%`,
                }}
              />
            </div>

            <span className="text-[11px] font-semibold text-[#667085]">
              {progress}% prepared
            </span>
          </div>
        </section>

        <section className="mt-5 flex items-center justify-between border-b border-[#E5E7EB]">
          <div className="inline-flex items-end gap-1">

            {(workspace?.sets || []).map(
              (assessmentSet) => {
                const active =
                  Number(
                    assessmentSet.id
                  ) ===
                  Number(
                    activeSetId
                  );

                const setState =
                  getAssessmentSetSubmissionState(
                    assessmentSet
                  );

                return (
                  <button
                    key={assessmentSet.id}
                    type="button"
                    onClick={() =>
                      setActiveSetId(
                        assessmentSet.id
                      )
                    }
                    className={`relative px-4 pb-3 pt-2 text-sm font-semibold transition ${
                      active
                        ? "text-[#4E45A9]"
                        : "text-[#7A8498] hover:text-[#313A4D]"
                    }`}
                  >
                    {setLabel(
                      assessmentSet
                    )}

                    <span className="ml-2 text-[10px] font-medium text-[#98A2B3]">
                      {setState.filled}/
                      {setState.total}
                    </span>

                    {active && (
                      <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#6658D7]" />
                    )}
                  </button>
                );
              }
            )}
          </div>

          <span className="pb-3 text-[11px] text-[#98A2B3]">
            {workspace?.hiring_year ||
              "Current cycle"}{" "}
            · independent question content
            per set
          </span>
        </section>

        {activeSet && (
          <nav
            aria-label="Question index for selected set"
            className="mt-4 rounded-xl border border-[#DDD8F2] bg-white shadow-[0_4px_16px_rgba(16,24,40,0.04)]"
          >
            <div className="flex flex-col gap-2 border-b border-[#EEF0F3] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-xs font-bold text-[#202938]">Question index</h2>
                <p className="mt-1 text-[10px] text-[#667085]">
                  Select a question to jump to its editor. Expand a section to preview its questions.
                </p>
              </div>
              <span className="inline-flex w-fit shrink-0 items-center rounded-full bg-[#F5F3FF] px-2.5 py-1 text-[10px] font-semibold text-[#5146B2]">
                {activeSetSlots.length} {activeSetSlots.length === 1 ? "question" : "questions"}
              </span>
            </div>

            {sections.some((section) => getSlotsForSection(section.id).length > 0) ? (
              <div className="divide-y divide-[#EEF0F3] px-3 sm:px-4">
                {sections.map((section, sectionIndex) => {
                  const sectionSlots = getSlotsForSection(section.id);
                  if (sectionSlots.length === 0) return null;

                  const indexExpanded =
                    expandedIndexSectionId === undefined
                      ? sectionIndex === 0
                      : expandedIndexSectionId === section.id;
                  const preparedCount = sectionSlots.filter(
                    (slot) => slot.current_question || slot.current_question_id != null
                  ).length;
                  const sectionTitle =
                    section.name ||
                    section.title ||
                    SECTION_TYPE_LABELS[
                      String(section.section_type || "conceptual").toLowerCase()
                    ] ||
                    "Questions";

                  return (
                    <div key={section.id} className="py-2">
                      <button
                        type="button"
                        aria-expanded={indexExpanded}
                        onClick={() => setExpandedIndexSectionId(indexExpanded ? null : section.id)}
                        className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-[#F8F7FF] focus:outline-none focus:ring-2 focus:ring-[#6658D7]/25"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#F1EEFF] text-[10px] font-bold text-[#5146B2]">
                          {String.fromCharCode(65 + sectionIndex)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11px] font-semibold text-[#344054]">
                            {sectionTitle}
                          </span>
                          <span className="mt-0.5 block text-[9px] text-[#98A2B3]">
                            {preparedCount} of {sectionSlots.length} prepared
                          </span>
                        </span>
                        <span className="shrink-0 rounded-full bg-[#F4F5F8] px-2 py-1 text-[9px] font-semibold text-[#667085]">
                          {sectionSlots.length} {sectionSlots.length === 1 ? "question" : "questions"}
                        </span>
                        <ChevronDown
                          size={14}
                          className={`shrink-0 text-[#8A94A8] transition-transform ${indexExpanded ? "rotate-180" : ""}`}
                        />
                      </button>

                      {indexExpanded && (
                        <div className="mt-1 space-y-1 pb-1 pl-1 sm:pl-10">
                          {sectionSlots.map((slot, slotIndex) => {
                            const question = slot.current_question;
                            const prepared = Boolean(question || slot.current_question_id != null);
                            const slotLabel = `${String.fromCharCode(65 + sectionIndex)}.${String(slotIndex + 1).padStart(2, "0")}`;
                            const matchedSkill = availableSkills.find(
                              (skill) => String(skill.id) === String(slot.skill_id)
                            );
                            const skillLabel =
                              matchedSkill?.name ||
                              matchedSkill?.skill_name ||
                              slot.skill_name ||
                              (slot.skill_id != null ? `Skill #${slot.skill_id}` : "Skill not assigned");
                            const rawQuestionType =
                              question?.question_type ||
                              slot.preferred_question_type ||
                              (slot.section_type === "free_text" ? "FREE_TEXT" : "MCQ");
                            const questionTypeLabel = String(rawQuestionType)
                              .replace(/_/g, " ")
                              .toUpperCase();
                            const difficultyLabel =
                              DIFFICULTY_LABELS[slot.difficulty] ||
                              slot.difficulty ||
                              "Difficulty not set";
                            const statusLabel = question?.status
                              ? String(question.status).replace(/_/g, " ")
                              : prepared
                                ? "Prepared"
                                : "Empty";
                            const previewText = question?.question_text?.trim()
                              ? getQuestionIndexPreview(question.question_text)
                              : prepared
                                ? "Question linked; open the slot to inspect its text."
                                : "No question yet. Open this slot to generate, select, or author one.";

                            return (
                              <button
                                key={slot.id}
                                type="button"
                                onClick={() => navigateToQuestion(section.id, slot.id)}
                                title={`Open ${slotLabel}`}
                                className={`grid w-full grid-cols-[44px_minmax(0,1fr)] items-start gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-left transition focus:outline-none focus:ring-2 focus:ring-[#6658D7]/25 sm:grid-cols-[44px_minmax(0,1fr)_auto] ${
                                  prepared
                                    ? "border-[#E5E0FA] bg-[#FBFAFF] hover:border-[#B9B0F0] hover:bg-[#F7F5FF]"
                                    : "border-dashed border-[#E3E6EB] bg-[#FCFCFD] hover:border-[#B9B0F0] hover:bg-[#FAF9FF]"
                                }`}
                              >
                                <span className="mt-0.5 inline-flex h-6 items-center justify-center rounded-md bg-white px-1.5 text-[9px] font-bold text-[#5146B2] ring-1 ring-inset ring-[#E3DDFB]">
                                  {slotLabel}
                                </span>
                                <span className="min-w-0">
                                  <span className="line-clamp-2 block text-[10px] font-medium leading-4 text-[#344054]">
                                    {previewText}
                                  </span>
                                  <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[9px] text-[#7A8498]">
                                    <span className="max-w-[150px] truncate">{skillLabel}</span>
                                    <span>{difficultyLabel}</span>
                                    <span>{questionTypeLabel}</span>
                                  </span>
                                </span>
                                <span className={`col-start-2 mt-0.5 inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-1 text-[9px] font-semibold capitalize sm:col-start-auto sm:mt-0 ${
                                  prepared
                                    ? "bg-[#F0EDFF] text-[#5146B2]"
                                    : "bg-[#F0F1F4] text-[#667085]"
                                }`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${prepared ? "bg-[#6658D7]" : "bg-[#C3C8D2]"}`} />
                                  {statusLabel}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="px-4 py-3 text-xs text-[#98A2B3]">
                No question slots are configured for this set yet.
              </p>
            )}
          </nav>
        )}

        <section className="mt-5 bg-white">
          {sections.map(
            (
              section,
              sectionIndex
            ) => {
              const sectionSlots =
                getSlotsForSection(
                  section.id
                );

              const sectionPrepared =
                sectionSlots.filter(
                  (slot) =>
                    slot.current_question
                ).length;

              const sectionExpanded =
                expandedSections[
                  section.id
                ] !== false;

              const sectionType =
                String(
                  section.section_type ||
                    "conceptual"
                ).toLowerCase();
              const sectionTone = getQuestionSectionTone(sectionType);

              return (
                <section
                  key={section.id}
                  className="mb-4 border-b border-[#E5E7EB] pb-4 last:mb-0 last:border-b-0 last:pb-0"
                >
                  <button
                    type="button"
                    onClick={() =>
                      toggleSection(
                        section.id
                      )
                    }
                    className={`flex w-full items-start justify-between gap-5 rounded-lg border px-4 py-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6658D7]/25 ${sectionTone.sectionHeader}`}
                  >
                    <div className="flex min-w-0 items-start gap-3.5">

                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${sectionTone.sectionLetter}`}>
                        {String.fromCharCode(
                          65 +
                            sectionIndex
                        )}
                      </div>

                      <div className="min-w-0">

                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-[9px] font-bold uppercase tracking-[0.16em] ${sectionTone.sectionEyebrow}`}>
                            Section{" "}
                            {String.fromCharCode(
                              65 +
                                sectionIndex
                            )}
                          </span>

                          <span className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-semibold ${sectionTone.sectionType}`}>
                            {SECTION_TYPE_LABELS[
                              sectionType
                            ] ||
                              sectionType}
                          </span>
                        </div>

                        <h2 className="mt-1 text-lg font-semibold text-[#202938]">
                          {section.name ||
                            section.title ||
                            SECTION_TYPE_LABELS[
                              sectionType
                            ]}
                        </h2>

                        <p className="mt-1 max-w-4xl text-xs leading-5 text-[#667085]">
                          {getSectionDescription(
                            section
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold tabular-nums ${sectionTone.preparedBadge}`}>
                        {sectionPrepared}/{sectionSlots.length} prepared
                      </span>

                      <ChevronDown
                        size={16}
                        className={`text-[#667085] ${
                          sectionExpanded
                            ? "rotate-180"
                            : ""
                        }`}
                      />
                    </div>
                  </button>

                  {sectionExpanded && (
                    <div className="pb-2">
                      {sectionSlots.length ===
                      0 ? (
                        <div className="border-l-2 border-[#E0DDF5] bg-[#FAF9FF] px-4 py-3 text-xs text-[#667085]">
                          No question slots are configured for this section yet.
                        </div>
                      ) : (
                        <div>

                          <div className="flex items-center justify-between border-y border-[#EEF0F3] py-2 text-[9px] font-bold uppercase tracking-[0.14em] text-[#98A2B3]">
                            <span>
                              Question slots
                            </span>

                            <span>
                              {
                                sectionSlots.length
                              }{" "}
                              {sectionSlots.length ===
                              1
                                ? "slot"
                                : "slots"}
                            </span>
                          </div>

                          {sectionSlots.map(
                            (
                              slot,
                              slotIndex
                            ) => (
                              <QuestionRow
                                key={
                                  slot.id
                                }
                                slot={
                                  slot
                                }
                                questionNumber={
                                  slotIndex +
                                  1
                                }
                                availableSkills={
                                  availableSkills
                                }
                                generating={
                                  generatingSlotId ===
                                  slot.id
                                }
                                savingSkill={
                                  savingSkillSlotId ===
                                  slot.id
                                }
                                savingQuestionType={
                                  savingQuestionTypeSlotId ===
                                  slot.id
                                }
                                onQuestionTypeChange={(
                                  questionType
                                ) =>
                                  selectSlotQuestionType(
                                    slot,
                                    questionType
                                  )
                                }
                                ratingQuestionId={
                                  ratingQuestionId
                                }
                                restoringAttemptId={
                                  restoringAttemptId
                                }
                                onSkillChange={(
                                  skillId
                                ) =>
                                  selectSlotSkill(
                                    slot,
                                    skillId
                                  )
                                }
                                onGenerate={(
                                  count
                                ) =>
                                  openGenerationDialog(
                                    slot,
                                    count
                                  )
                                }
                                onManual={() =>
                                  openManual(
                                    slot
                                  )
                                }
                                onExisting={() =>
                                  openExisting(
                                    slot
                                  )
                                }
                                onEdit={() =>
                                  openEdit(
                                    slot
                                  )
                                }
                                onGenerateAnother={(
                                  count
                                ) =>
                                  openGenerationDialog(
                                    slot,
                                    count
                                  )
                                }
                                onRate={
                                  rateQuestion
                                }
                                onReviewCandidate={() => {
                                  const generatedAttempts =
                                    (
                                      slot.generation_attempts ||
                                      []
                                    ).filter(
                                      (
                                        attempt
                                      ) =>
                                        attempt?.status ===
                                        "generated"
                                    );

                                  setCandidateSearch(
                                    ""
                                  );

                                  setCandidatePattern(
                                    "all"
                                  );

                                  setCandidateLength(
                                    "all"
                                  );

                                  setCandidateSort(
                                    "newest"
                                  );

                                  setCandidatePromptDraft(
                                    ""
                                  );

                                  setCandidatePool({
                                    slot,
                                    attempts:
                                      generatedAttempts,

                                    referenceQuestion:
                                      slot.current_question ||
                                      null,

                                    generatedCount:
                                      generatedAttempts.length,

                                    requestedCount:
                                      Math.min(
                                        Math.max(
                                          generatedAttempts.length ||
                                            1,
                                          1
                                        ),
                                        50
                                      ),

                                    managerPrompt:
                                      "",

                                    generationStrategy:
                                      "balanced",

                                    generationFocus:
                                      "auto",
                                  });
                                }}
                                onRestore={(
                                  attempt
                                ) =>
                                  restoreAttempt(
                                    slot,
                                    attempt
                                  )
                                }
                              />
                            )
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              );
            }
          )}
        </section>

        {/* ============================================================
            SET-LEVEL SUBMIT BUTTON
            This is intentionally BELOW the entire active set.
            ============================================================ */}

        {activeSet && (
          <section className="mt-6 border border-[#DDD8F2] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(16,24,40,0.05)]">

            {(() => {
              const submissionState =
                getAssessmentSetSubmissionState(
                  activeSet
                );

              const submitting =
                submittingAssessmentSetId ===
                activeSet.id;

              const materializing =
                materializingAssessmentSetId ===
                activeSet.id;

              const materializedAssessment =
                materializedAssessments[activeSet.id] ||
                null;

              let statusLabel =
                "Draft";

              let statusClass =
                "bg-[#F5F6F8] text-[#667085]";

              if (
                submissionState.status ===
                "submitted_for_review"
              ) {
                statusLabel =
                  "Submitted for review";

                statusClass =
                  "bg-[#F1EEFF] text-[#5E4DA3]";
              } else if (
                submissionState.status ===
                "approved"
              ) {
                statusLabel =
                  "Approved";

                statusClass =
                  "bg-[#F2FAF5] text-[#28734E]";
              } else if (
                submissionState.status ===
                "rejected"
              ) {
                statusLabel =
                  "Rejected";

                statusClass =
                  "bg-[#FFF4F4] text-[#A53D3D]";
              }

              let buttonLabel =
                "Submit for Review";

              if (submitting) {
                buttonLabel =
                  "Submitting…";
              } else if (
                submissionState.status ===
                "submitted_for_review"
              ) {
                buttonLabel =
                  "Submitted for Review";
              } else if (
                submissionState.status ===
                "approved"
              ) {
                buttonLabel =
                  "Approved";
              } else if (
                submissionState.hasRejectedQuestion
              ) {
                buttonLabel =
                  "Resolve Rejected Question";
              } else if (
                submissionState.remaining > 0
              ) {
                buttonLabel = `Complete ${
                  submissionState.remaining
                } More`;
              }

              const buttonDisabled =
                submitting ||
                !submissionState.canSubmit;

              return (
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">

                  <div className="min-w-0">

                    <div className="flex flex-wrap items-center gap-2">

                      <span className="text-base font-semibold text-[#202938]">
                        {setLabel(
                          activeSet
                        )}
                      </span>

                      <span
                        className={`rounded-full px-2.5 py-1 text-[9px] font-semibold ${statusClass}`}
                      >
                        {statusLabel}
                      </span>
                    </div>

                    <p className="mt-1.5 text-xs leading-5 text-[#667085]">
                      {submissionState.canSubmit
                        ? `This will send ${setLabel(
                            activeSet
                          )} only to the assigned assessment reviewer. Set B will remain unchanged.`
                        : submissionState.hasRejectedQuestion
                          ? "Resolve the rejected current question before sending this set to the reviewer."
                          : submissionState.remaining > 0
                            ? `Prepare all ${submissionState.total} questions before sending this set to the reviewer. ${submissionState.remaining} question${
                                submissionState.remaining ===
                                1
                                  ? ""
                                  : "s"
                              } remaining.`
                            : submissionState.status ===
                                "submitted_for_review"
                              ? "This set is already with the assigned assessment reviewer."
                              : submissionState.status ===
                                  "approved"
                                ? materializedAssessment
                                  ? `This set has been approved by the reviewer. Candidate Assessment #${materializedAssessment.id} exists as a legacy materialization record.`
                                  : "This set has been approved by the reviewer. The next step is the Assessment Reviewer handing it off to HR; the Assessment Manager does not publish or assign it to candidates."
                                : "This set is not currently available for submission."}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[10px] text-[#98A2B3]">

                      <span>
                        <strong className="text-[#344054]">
                          {
                            submissionState.filled
                          }
                          /
                          {
                            submissionState.total
                          }
                        </strong>{" "}
                        questions prepared
                      </span>

                      <span>
                        <strong className="text-[#344054]">
                          {
                            activeSetSlots.filter(
                              (slot) =>
                                slot?.current_question?.status ===
                                "pending_review"
                            ).length
                          }
                        </strong>{" "}
                        pending review
                      </span>

                      <span>
                        <strong className="text-[#28734E]">
                          {
                            activeSetSlots.filter(
                              (slot) =>
                                slot?.current_question?.status ===
                                "approved"
                            ).length
                          }
                        </strong>{" "}
                        approved
                      </span>

                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center">

                    {submissionState.status ===
                      "approved" && (
                        <div className="flex min-h-12 items-center gap-2 rounded-lg border border-[#B9DEC9] bg-[#F3FBF6] px-4 text-xs font-semibold text-[#28734E]">
                          <CheckCircle2
                            size={15}
                          />

                          <span>
                            Reviewer approved · awaiting HR handoff
                          </span>
                        </div>
                      )}

                    <button
                      type="button"
                      onClick={() =>
                        submitAssessmentSetForReview(
                          activeSet
                        )
                      }
                      disabled={
                        buttonDisabled
                      }
                      className={`inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-lg px-7 text-sm font-semibold transition ${
                        submissionState.canSubmit
                          ? "bg-[#6658D7] text-white shadow-[0_7px_20px_rgba(102,88,215,0.24)] hover:bg-[#584CC5]"
                          : "border border-[#D9DEE7] bg-[#F8F9FB] text-[#7A8498]"
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                      title={
                        submissionState.hasRejectedQuestion
                          ? "Resolve the rejected question before submitting."
                          : submissionState.remaining > 0
                            ? `Prepare ${submissionState.remaining} more question${
                                submissionState.remaining ===
                                1
                                  ? ""
                                  : "s"
                              }.`
                            : submissionState.status ===
                                "submitted_for_review"
                              ? "Already submitted for review."
                              : submissionState.status ===
                                  "approved"
                                ? "Already approved."
                                : `Submit ${setLabel(
                                    activeSet
                                  )} for reviewer approval.`
                      }
                    >
                      {submitting ? (
                        <RefreshCw
                          size={15}
                          className="animate-spin"
                        />
                      ) : submissionState.status ===
                          "submitted_for_review" ||
                        submissionState.status ===
                          "approved" ? (
                        <CheckCircle2
                          size={15}
                        />
                      ) : (
                        <ShieldCheck
                          size={15}
                        />
                      )}

                      {buttonLabel}
                    </button>

                  </div>

                </div>
              );
            })()}

          </section>
        )}

        <div className="mt-6 flex items-center justify-between border-t border-[#E5E7EB] pt-5 text-xs text-[#667085]">

          <div className="flex items-center gap-2">
            <ShieldCheck
              size={14}
              className="text-[#5E4DA3]"
            />

            <span>
              AI output stays as a candidate until you explicitly accept it. Historical questions remain immutable.
            </span>
          </div>

          <span className="font-semibold text-[#202938]">
            {activeSet
              ? (() => {
                  const state =
                    getAssessmentSetSubmissionState(
                      activeSet
                    );

                  return `${setLabel(
                    activeSet
                  )} · ${state.filled}/${state.total}`;
                })()
              : ""}
          </span>

        </div>
      </main>

      {generationRequest && (
        <Modal
          title="Configure AI generation"
          subtitle="Give the AI optional guidance for this batch. Hard assessment constraints such as skill, difficulty and question type remain enforced."
          onClose={() =>
            !generatingSlotId &&
            setGenerationRequest(null)
          }
        >
          <GenerationSettingsForm
            slot={
              generationRequest.slot
            }
            count={
              generationRequest.count
            }
            prompt={
              generationPromptDraft
            }
            setPrompt={
              setGenerationPromptDraft
            }
            strategy={
              generationStrategyDraft
            }
            setStrategy={
              setGenerationStrategyDraft
            }
            focus={
              generationFocusDraft
            }
            setFocus={
              setGenerationFocusDraft
            }
            onSubmit={
              submitGenerationRequest
            }
            onCancel={() =>
              setGenerationRequest(null)
            }
            generating={
              generatingSlotId ===
              generationRequest
                .slot?.id
            }
            generationStartedAt={generationStartedAt}
          />
        </Modal>
      )}

      {candidatePool && (
        <Modal
          title={`${candidatePool.generatedCount || candidatePool.attempts?.length || 0} AI candidates`}
          subtitle={
            candidatePool.referenceQuestion
              ? "The batch uses the current question and recent approved patterns as guidance while creating different content."
              : "Candidates were generated for the selected skill, section, difficulty and question type."
          }
          onClose={() =>
            setCandidatePool(null)
          }
          wide
          headerAction={
            <button
              type="button"
              onClick={
                regenerateCandidatePool
              }
              disabled={
                generatingSlotId ===
                candidatePool.slot
                  ?.id
              }
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#DDD8FA] bg-white px-3 text-[10px] font-semibold text-[#5D52B6] shadow-sm transition hover:border-[#BEB5F5] hover:bg-[#F8F7FF] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                size={12}
                className={
                  generatingSlotId ===
                  candidatePool.slot
                    ?.id
                    ? "animate-spin"
                    : ""
                }
              />

              {generatingSlotId ===
              candidatePool.slot?.id
                ? "Regenerating…"
                : `Regenerate ${
                    candidatePool.requestedCount ||
                    3
                  }`}
            </button>
          }
        >
          {generatingSlotId === candidatePool.slot?.id && generationStartedAt && (
            <GenerationProgressPanel
              key={generationStartedAt}
              startedAt={generationStartedAt}
              compact
            />
          )}
          <CandidatePool
            candidatePool={
              candidatePool
            }
            search={
              candidateSearch
            }
            setSearch={
              setCandidateSearch
            }
            pattern={
              candidatePattern
            }
            setPattern={
              setCandidatePattern
            }
            length={
              candidateLength
            }
            setLength={
              setCandidateLength
            }
            sort={
              candidateSort
            }
            setSort={
              setCandidateSort
            }
            promptDraft={
              candidatePromptDraft
            }
            setPromptDraft={
              setCandidatePromptDraft
            }
            onRegenerate={
              regenerateCandidatePool
            }
            acceptingAttemptId={
              acceptingAttemptId
            }
            onAccept={(attempt) =>
              acceptAttempt(
                candidatePool.slot,
                attempt
              )
            }
          />
        </Modal>
      )}

      {candidateReview && (
        <Modal
          title="Review AI candidate"
          subtitle="Review the generated candidate before accepting it into the slot."
          onClose={() =>
            !acceptingAttemptId &&
            setCandidateReview(null)
          }
          wide
        >
          <CandidateReview
            candidateReview={
              candidateReview
            }
            accepting={
              acceptingAttemptId ===
              candidateReview
                .attempt?.id
            }
            onAccept={() =>
              acceptAttempt(
                candidateReview.slot,
                candidateReview.attempt
              )
            }
          />
        </Modal>
      )}

      {manualSlot && (
        <Modal
          title="Add question manually"
          subtitle="The question will be stored as a pending-review question."
          onClose={() =>
            !savingManual &&
            setManualSlot(null)
          }
        >
          <ManualQuestionForm
            slot={manualSlot}
            form={manualForm}
            setForm={
              setManualForm
            }
            onSubmit={saveManual}
            onCancel={() =>
              setManualSlot(null)
            }
            saving={savingManual}
          />
        </Modal>
      )}

      {editingQuestion && (
        <Modal
          title="Edit current question"
          subtitle="Saving creates the next question version and returns the question to pending review."
          onClose={() =>
            !savingEdit &&
            setEditingQuestion(null)
          }
        >
          <EditQuestionForm
            question={
              editingQuestion.question
            }
            form={editForm}
            setForm={setEditForm}
            onSubmit={saveEdit}
            onCancel={() =>
              setEditingQuestion(null)
            }
            saving={savingEdit}
          />
        </Modal>
      )}

      {existingSlot && (
        <Modal
          title="Choose an existing question"
          subtitle={`${existingSlot.skill_name || `Skill #${existingSlot.skill_id}`} · ${
            DIFFICULTY_LABELS[
              existingSlot.difficulty
            ] ||
            existingSlot.difficulty
          }`}
          onClose={() =>
            !loadingBank &&
            !loadingHistorical &&
            setExistingSlot(null)
          }
          wide
        >
          <div className="mb-4 flex flex-col gap-3 rounded-xl border border-[#E7EAF0] bg-[#FAFBFD] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#667085]">
                Skill-matched library
              </p>
              <p className="mt-1 text-xs leading-5 text-[#667085]">
                Only questions from approved question sets matching <strong className="font-semibold text-[#344054]">{existingSlot.skill_name || `Skill #${existingSlot.skill_id}`}</strong>, {DIFFICULTY_LABELS[existingSlot.difficulty] || existingSlot.difficulty}, {String(existingSlot.preferred_question_type || (existingSlot.section_type === "free_text" ? "FREE_TEXT" : "MCQ")).toUpperCase() === "FREE_TEXT" ? "free-text" : "multiple-choice"} type, and {SECTION_TYPE_LABELS[existingSlot.section_type] || existingSlot.section_type} section can be assigned to this slot.
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center rounded-full border border-[#E0E4EC] bg-white px-3 py-1.5 text-[10px] font-semibold text-[#667085]">
              {sourceTab === "bank"
                ? loadingBank ? "Searching library…" : `${filteredBankQuestions.length} matching questions`
                : loadingHistorical ? "Searching history…" : `${filteredHistoricalQuestions.length} finalized questions`}
            </span>
          </div>
          <div className="border-b border-[#E5E7EB]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">

              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setSourceTab("bank")
                  }
                  className={`border-b-2 px-3 pb-3 pt-1 text-xs font-semibold ${
                    sourceTab ===
                    "bank"
                      ? "border-[#6658D7] text-[#5146B2]"
                      : "border-transparent text-[#7A8498]"
                  }`}
                >
                  Current question bank
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSourceTab(
                      "historical"
                    );

                    if (
                      !historicalQuestions.length
                    ) {
                      openHistorical();
                    }
                  }}
                  className={`border-b-2 px-3 pb-3 pt-1 text-xs font-semibold ${
                    sourceTab ===
                    "historical"
                      ? "border-[#6658D7] text-[#5146B2]"
                      : "border-transparent text-[#7A8498]"
                  }`}
                >
                  Previous finalized assessments
                </button>
              </div>

              <div className="mb-2 flex items-center gap-2">

                <div className="relative">
                  <Search
                    size={13}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#98A2B3]"
                  />

                  <input
                    value={
                      sourceSearch
                    }
                    onChange={(
                      event
                    ) =>
                      setSourceSearch(
                        event.target
                          .value
                      )
                    }
                    className="h-9 w-full rounded-lg border border-[#D9DEE7] bg-white pl-8 pr-3 text-xs text-[#344054] outline-none transition focus:border-[#6658D7] focus:ring-4 focus:ring-[#6658D7]/10 sm:w-60"
                    placeholder="Search matching questions…"
                  />
                </div>

                {sourceTab ===
                  "bank" && (
                  <select
                    value={
                      sourceSort
                    }
                    onChange={(
                      event
                    ) =>
                      setSourceSort(
                        event.target
                          .value
                      )
                    }
                    className="h-9 rounded-lg border border-[#D9DEE7] bg-white px-3 text-xs font-semibold text-[#475467] outline-none transition focus:border-[#6658D7] focus:ring-4 focus:ring-[#6658D7]/10"
                  >
                    <option value="rating">
                      Top rated
                    </option>
                    <option value="newest">
                      Newest
                    </option>
                    <option value="alpha">
                      A–Z
                    </option>
                  </select>
                )}
              </div>
            </div>
          </div>

          {sourceTab ===
          "bank" ? (
            <QuestionSourceList
              loading={
                loadingBank
              }
              emptyMessage="The current job/year question bank has no approved question matching this exact skill, difficulty, section, and question type. Check Previous finalized assessments for approved questions from an earlier cycle, or generate a new candidate."
              questions={
                filteredBankQuestions
              }
              onUse={
                useExisting
              }
              showBankMeta
            />
          ) : (
            <QuestionSourceList
              loading={
                loadingHistorical
              }
              emptyMessage="No approved question from a previous finalized assessment matches this skill, difficulty, section, and question type. The library will not offer mismatched questions for this slot."
              questions={
                filteredHistoricalQuestions
              }
              onUse={
                useHistorical
              }
              historical
            />
          )}
        </Modal>
      )}
    </RecruiterLayout>
  );
}

function GenerationControl({
  generating,
  count,
  onCountChange,
  onGenerate,
  icon,
  label = "Generate",
  ariaLabel = "AI candidate count",
}) {
  return (
    <div className="inline-flex h-10 min-w-[174px] shrink-0 overflow-hidden rounded-lg border border-[#5146B2] bg-[#5146B2]">
      <button
        type="button"
        onClick={() =>
          onGenerate(count)
        }
        disabled={generating}
        className="inline-flex h-full min-w-[112px] items-center justify-center gap-2 bg-[#6658D7] px-4 text-[11px] font-bold tracking-[0.01em] text-white disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
      >
        {generating ? (
          <RefreshCw
            size={13}
            className="animate-spin"
          />
        ) : (
          icon
        )}

        <span>
          {generating
            ? "Generating…"
            : label}
        </span>
      </button>

      <div className="relative flex h-full w-[62px] shrink-0 items-center border-l border-white/25 bg-[#5146B2]">
        <select
          value={count}
          onChange={(event) =>
            onCountChange(
              Number(
                event.target.value
              )
            )
          }
          disabled={generating}
          aria-label={ariaLabel}
          className="h-full w-full appearance-none cursor-pointer bg-transparent px-2.5 pr-7 text-center text-[11px] font-bold text-white outline-none disabled:cursor-not-allowed disabled:opacity-60"
        >
          {Array.from(
            {
              length: 50,
            },
            (_, index) =>
              index + 1
          ).map((value) => (
            <option
              key={value}
              value={value}
              className="bg-white text-[#344054]"
            >
              {value}
            </option>
          ))}
        </select>

        <ChevronDown
          size={14}
          strokeWidth={2.5}
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-white"
        />
      </div>
    </div>
  );
}

function QuestionRow({
  slot,
  questionNumber,
  availableSkills,
  generating,
  savingSkill,
  savingQuestionType,
  onQuestionTypeChange,
  ratingQuestionId,
  restoringAttemptId,
  onSkillChange,
  onGenerate,
  onManual,
  onExisting,
  onEdit,
  onGenerateAnother,
  onRate,
  onReviewCandidate,
  onRestore,
}) {
  const [generationCount, setGenerationCount] =
    useState(3);

  const question =
    slot.current_question;

  const visualTheme = getQuestionSectionTone(slot.section_type);

  const attempts =
    Array.isArray(
      slot.generation_attempts
    )
      ? slot.generation_attempts
      : [];

  const latestGenerated =
    attempts.find(
      (attempt) =>
        attempt?.status ===
        "generated"
    );

  const latestFailed =
    attempts.find(
      (attempt) =>
        attempt?.status ===
        "failed"
    );

  const recoverable =
    attempts.filter(
      (attempt) =>
        attempt?.candidate_question_id
    );

  return (
    <div
      id={`question-slot-${slot.id}`}
      className={`relative scroll-mt-28 rounded-xl border p-4 sm:p-5 ${visualTheme.cardBorder} ${visualTheme.cardBackground}`}
    >

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">

        <div className="flex min-w-0 items-start gap-3.5">

          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${visualTheme.numberBadge}`}>
            {String(
              questionNumber
            ).padStart(
              2,
              "0"
            )}
          </div>

          <div className="min-w-0 flex-1">

            <div className="flex flex-wrap items-center gap-2">

              <span className="text-sm font-semibold text-[#202938]">
                Question{" "}
                {questionNumber}
              </span>

              <span className="text-[10px] text-[#98A2B3]">
                ·
              </span>

              <span className={`inline-flex rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] ${visualTheme.difficultyBadge}`}>
                {DIFFICULTY_LABELS[slot.difficulty] || slot.difficulty}
              </span>

              {question && (
                <StatusText
                  status={
                    question.status
                  }
                />
              )}

              <QuestionTypeControl
                value={
                  slot.preferred_question_type ||
                  (
                    slot.section_type ===
                    "free_text"
                      ? "FREE_TEXT"
                      : "MCQ"
                  )
                }
                sectionType={
                  slot.section_type
                }
                disabled={
                  Boolean(
                    question
                  ) ||
                  savingQuestionType ||
                  generating
                }
                onChange={
                  onQuestionTypeChange
                }
              />
            </div>

            <div className={`mt-3 flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center ${visualTheme.skillPanel}`}>

              <div className="relative w-full max-w-xs">

                <select
                  value={String(
                    slot.skill_id ||
                      ""
                  )}
                  onChange={(
                    event
                  ) =>
                    onSkillChange(
                      event.target
                        .value
                    )
                  }
                  disabled={
                    Boolean(
                      question
                    ) ||
                    savingSkill ||
                    generating
                  }
                  className={`h-9 w-full rounded-lg border px-3 pr-8 text-xs font-semibold text-[#344054] outline-none focus:border-[#6658D7] focus:bg-white focus:ring-4 focus:ring-[#6658D7]/10 disabled:bg-[#F8F9FB] disabled:text-[#667085] ${visualTheme.skillSelect}`}
                >
                  {availableSkills.length ===
                    0 && (
                    <option
                      value={String(
                        slot.skill_id ||
                          ""
                      )}
                    >
                      {slot.skill_name ||
                        `Skill #${slot.skill_id}`}
                    </option>
                  )}

                  {availableSkills.map(
                    (skill) => (
                      <option
                        key={
                          skill.id
                        }
                        value={String(
                          skill.id
                        )}
                      >
                        {skill.name ||
                          skill.skill_name}
                      </option>
                    )
                  )}
                </select>
              </div>

              <span className={`text-[10px] leading-4 ${visualTheme.helperText}`}>
                Choose from confirmed JD skills.{" "}
                {SECTION_TYPE_LABELS[
                  slot.section_type
                ] ||
                  slot.section_type}{" "}
                ·{" "}
                {DIFFICULTY_LABELS[
                  slot.difficulty
                ] ||
                  slot.difficulty}
              </span>
            </div>

            {question ? (
              <div className={`mt-4 rounded-xl border px-4 py-3.5 sm:px-5 sm:py-4 ${visualTheme.questionPanel}`}>

                <QuestionText
                  text={question.question_text}
                  className="max-w-5xl text-[14px] leading-6 text-[#273142]"
                />

                {question.question_type !==
                  "FREE_TEXT" &&
                  Array.isArray(
                    question.options
                  ) &&
                  question.options.length >
                    0 && (
                    <div className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:max-w-5xl">

                      {question.options
                        .slice(0, 4)
                        .map(
                          (
                            option,
                            index
                          ) => {
                            const correctAnswer =
                              getCorrectAnswerLabel(
                                question
                              );

                            const isCorrect =
                              correctAnswer?.index ===
                              index;

                            return (
                              <div
                                key={`${option}-${index}`}
                                className={`rounded-lg border px-3 py-2.5 text-xs leading-5 ${
                                  isCorrect
                                    ? "border-[#B9DEC9] bg-[#F3FAF6] text-[#28734E]"
                                    : "border-[#E1E6EE] bg-[#FBFCFE] text-[#586779]"
                                }`}
                              >
                                <span
                                  className={`mr-2 inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-[10px] font-bold ${
                                    isCorrect
                                      ? "bg-[#DFF2E6] text-[#28734E]"
                                      : "bg-[#F1F4F8] text-[#5E6C7D] ring-1 ring-inset ring-[#E0E5ED]"
                                  }`}
                                >
                                  {String.fromCharCode(
                                    65 +
                                      index
                                  )}
                                  .
                                </span>

                                <QuestionText
                                  text={option}
                                  className="inline text-xs leading-5"
                                />

                                {isCorrect && (
                                  <span className="ml-2 inline-flex items-center rounded-full bg-[#DFF2E6] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.08em]">
                                    ✓ Correct
                                  </span>
                                )}
                              </div>
                            );
                          }
                        )}
                    </div>
                  )}

                {question.question_type !==
                  "FREE_TEXT" &&
                  getCorrectAnswerLabel(
                    question
                  ) && (
                    <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-[#B9DEC9] bg-[#F3FBF6] px-2.5 py-1.5 text-[9px] font-bold text-[#28734E]">
                      <CheckCircle2
                        size={11}
                      />
                      Correct answer:{" "}
                      {
                        getCorrectAnswerLabel(
                          question
                        ).label
                      }
                    </div>
                  )}
              </div>
            ) : (
              <div className="mt-4">

                <div className={`rounded-xl border border-dashed px-4 py-3.5 ${visualTheme.emptyBorder} ${visualTheme.emptyBackground}`}>
                  <p className={`text-xs font-semibold ${visualTheme.emptyTitle}`}>
                    No question added yet
                  </p>
                  <p className={`mt-1 text-[10px] leading-5 ${visualTheme.emptyText}`}>
                    Generate a draft, write one manually, or choose an approved question from the library for this skill.
                  </p>
                </div>

                {latestGenerated && (
                  <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-[#E5E1F7] bg-[#FBFAFF] px-3 py-2.5 text-[10px] text-[#5146B2]">

                    <Bot size={12} />

                    <span className="font-semibold">
                      {
                        attempts.filter(
                          (
                            attempt
                          ) =>
                            attempt?.status ===
                            "generated"
                        ).length
                      }{" "}
                      AI candidate
                      {
                        attempts.filter(
                          (
                            attempt
                          ) =>
                            attempt?.status ===
                            "generated"
                        ).length ===
                        1
                          ? ""
                          : "s"
                      }{" "}
                      saved
                    </span>

                    <button
                      type="button"
                      onClick={
                        onReviewCandidate
                      }
                      className="font-semibold underline underline-offset-2"
                    >
                      Review candidates
                    </button>
                  </div>
                )}

                {latestFailed && (
                  <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-[#F0DCDC] bg-[#FFFAFA] px-3 py-2.5 text-[10px] text-[#9F3F3F]">

                    <span className="min-w-0 flex-1">
                      AI generation failed:{" "}
                      {latestFailed.error_message ||
                        latestFailed
                          .validation_errors?.[0] ||
                        "Unknown generation error."}
                    </span>

                    <button
                      type="button"
                      onClick={
                        onGenerate
                      }
                      disabled={
                        generating
                      }
                      className="shrink-0 font-semibold text-[#8E3636] underline underline-offset-2 disabled:opacity-50"
                    >
                      Retry AI
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 xl:max-w-[560px] xl:justify-end">

          {!question ? (
            <>
              <GenerationControl
                generating={
                  generating
                }
                count={
                  generationCount
                }
                onCountChange={
                  setGenerationCount
                }
                onGenerate={
                  onGenerate
                }
                icon={
                  <Bot size={13} />
                }
                label="Generate"
                ariaLabel="Number of AI questions to generate, 1 to 50"
              />

              <ActionButton
                icon={
                  <FilePlus2
                    size={13}
                  />
                }
                onClick={
                  onManual
                }
              >
                Add manually
              </ActionButton>

              <ActionButton
                tone="library"
                icon={
                  <History
                    size={13}
                  />
                }
                onClick={
                  onExisting
                }
              >
                Question library
              </ActionButton>
            </>
          ) : (
            <>
              <ActionButton
                icon={
                  <Edit3
                    size={13}
                  />
                }
                onClick={
                  onEdit
                }
              >
                Edit
              </ActionButton>

              <GenerationControl
                generating={
                  generating
                }
                count={
                  generationCount
                }
                onCountChange={
                  setGenerationCount
                }
                onGenerate={
                  onGenerateAnother
                }
                icon={
                  <Sparkles
                    size={13}
                  />
                }
                label="Generate"
                ariaLabel="Number of additional AI questions to generate, 1 to 50"
              />

              <ActionButton
                tone="library"
                icon={
                  <History
                    size={13}
                  />
                }
                onClick={
                  onExisting
                }
              >
                Replace from library
              </ActionButton>
            </>
          )}
        </div>
      </div>

      {question && (
        <div className="mt-4 flex flex-col gap-4 border-t border-[#EEF0F3] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 text-[10px] text-[#8490A1]">
            <SourceBadge source={slot.source_type || question.source} />

            <span className="rounded-md bg-[#F6F7FA] px-2 py-1 text-[#667085]">
              Version {question.version || 1}
            </span>

            <span className="inline-flex items-center gap-2 rounded-lg border border-[#DDE5EA] bg-white px-2.5 py-1.5">
              <span className="font-semibold text-[#536473]">Reviewer</span>
              <StaticStarRating value={question.reviewer_rating} label="Reviewer quality rating" />
              <span className="font-semibold tabular-nums text-[#667085]">
                {question.reviewer_rating ? `${question.reviewer_rating}/3` : "Not rated"}
              </span>
            </span>

            <span className="inline-flex items-center gap-2 rounded-lg border border-[#EFDFB6] bg-[#FFF8E6] px-2.5 py-1.5">
              <span className="font-semibold text-[#8F671C]">Your rating</span>
              <StarRating
                value={question.manager_rating}
                disabled={ratingQuestionId === question.id}
                onChange={(value) => onRate(question.id, value)}
              />
              <span className="font-semibold tabular-nums text-[#8F671C]">
                {question.manager_rating ? `${question.manager_rating}/3` : "Rate"}
              </span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {latestGenerated && (
              <button
                type="button"
                onClick={() => onReviewCandidate(latestGenerated)}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[10px] font-semibold text-[#5146B2] transition hover:bg-[#F5F2FF] focus:outline-none focus:ring-2 focus:ring-[#6658D7]/20"
              >
                <Bot size={12} />
                Review AI candidates
              </button>
            )}

            {recoverable.slice(0, 3).map((attempt) => (
              <button
                key={attempt.id}
                type="button"
                onClick={() => onRestore(attempt)}
                disabled={restoringAttemptId === attempt.id}
                className="rounded-lg px-2.5 py-2 text-[10px] font-semibold text-[#667085] transition hover:bg-[#F6F7FA] hover:text-[#5146B2] focus:outline-none focus:ring-2 focus:ring-[#6658D7]/20 disabled:opacity-50"
              >
                {restoringAttemptId === attempt.id
                  ? "Restoring…"
                  : `Restore #${attempt.attempt_number}`}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionTypeControl({
  value,
  disabled,
  onChange,
}) {
  const effective =
    value === "FREE_TEXT"
      ? "FREE_TEXT"
      : "MCQ";

  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-[#D9DEE7] bg-[#FAFBFC] p-0.5">

      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          onChange("MCQ")
        }
        className={`rounded-md px-2 py-1 text-[9px] font-semibold ${
          effective === "MCQ"
            ? "bg-white text-[#5146B2] shadow-[0_1px_2px_rgba(16,24,40,0.08)]"
            : "text-[#98A2B3]"
        }`}
      >
        MCQ
      </button>

      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          onChange(
            "FREE_TEXT"
          )
        }
        className={`rounded-md px-2 py-1 text-[9px] font-semibold ${
          effective ===
          "FREE_TEXT"
            ? "bg-white text-[#5146B2] shadow-[0_1px_2px_rgba(16,24,40,0.08)]"
            : "text-[#98A2B3]"
        }`}
      >
        Free text
      </button>
    </div>
  );
}

function ActionButton({
  icon,
  tone = "default",
  children,
  disabled,
  onClick,
  className = "",
}) {
  const toneClasses = {
    primary: "border-[#5146B2] bg-[#5146B2] text-white",
    library: "border-[#BFE3D7] bg-[#E8F6F0] text-[#176E5F]",
    default: "border-[#D8DFE8] bg-white text-[#475467]",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[10px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6658D7]/25 disabled:cursor-not-allowed disabled:opacity-50 ${toneClasses[tone] || toneClasses.default} ${className}`}
    >
      {icon}
      {children}
    </button>
  );
}

function SourceBadge({
  source,
}) {
  const config =
    {
      ai_generated: {
        label: "AI generated",
        className:
          "bg-[#F1EEFF] text-[#5E4DA3]",
      },

      manual: {
        label: "Manual",
        className:
          "bg-[#F5F6F8] text-[#667085]",
      },

      historical: {
        label:
          "Previous assessment",
        className:
          "bg-[#EEF6FF] text-[#3E6098]",
      },

      question_bank: {
        label:
          "Question bank",
        className:
          "bg-[#F2F7FF] text-[#4665B7]",
      },
    }[source] || {
      label:
        source || "Question",
      className:
        "bg-[#F5F6F8] text-[#667085]",
    };

  return (
    <span
      className={`px-2 py-1 text-[9px] font-semibold ${config.className}`}
    >
      {config.label}
    </span>
  );
}

function StatusText({
  status,
}) {
  const normalized = String(status || "draft").toLowerCase();
  const label = normalized.replaceAll("_", " ");
  const statusTone = {
    approved: "border-[#B8E0CA] bg-[#E9F7EF] text-[#20764B]",
    pending_review: "border-[#F0DCA9] bg-[#FFF7DF] text-[#946B18]",
    rejected: "border-[#F0CACA] bg-[#FFF0F0] text-[#A83E3E]",
    draft: "border-[#DCE3EC] bg-[#F2F5F9] text-[#637184]",
    published: "border-[#B8E0CA] bg-[#E9F7EF] text-[#20764B]",
  }[normalized] || "border-[#DCE3EC] bg-[#F2F5F9] text-[#637184]";

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[9px] font-semibold capitalize ${statusTone}`}>
      {label}
    </span>
  );
}

function resolveCorrectAnswerIndex(
  questionLike
) {
  const options =
    Array.isArray(
      questionLike?.options
    )
      ? questionLike.options
      : [];

  const raw = String(
    questionLike?.correct_answer ??
      ""
  ).trim();

  if (
    !raw ||
    options.length === 0
  ) {
    return -1;
  }

  const normalizedRaw =
    raw
      .replace(
        /^option\s+/i,
        ""
      )
      .trim()
      .toLowerCase();

  const letterMatch =
    normalizedRaw.match(
      /^([a-d])(?:\.|\)|\s|$)/i
    );

  if (letterMatch) {
    const index =
      letterMatch[1]
        .toUpperCase()
        .charCodeAt(0) -
      65;

    if (
      index >= 0 &&
      index < options.length
    ) {
      return index;
    }
  }

  const directIndex =
    options.findIndex(
      (option) =>
        String(option || "")
          .trim()
          .toLowerCase() ===
        raw.toLowerCase()
    );

  if (directIndex >= 0) {
    return directIndex;
  }

  return options.findIndex(
    (option) =>
      String(option || "")
        .trim()
        .toLowerCase()
        .replace(
          /^option\s+/i,
          ""
        ) ===
      normalizedRaw
  );
}

function getCorrectAnswerLabel(
  questionLike
) {
  const index =
    resolveCorrectAnswerIndex(
      questionLike
    );

  if (index < 0) {
    return null;
  }

  const options =
    Array.isArray(
      questionLike?.options
    )
      ? questionLike.options
      : [];

  return {
    index,
    label: `Option ${String.fromCharCode(
      65 + index
    )}`,
    text: String(
      options[index] || ""
    ).trim(),
  };
}

function StaticStarRating({ value, label = "Question rating" }) {
  const numeric = Number(value || 0);

  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${label}: ${numeric ? `${numeric} out of 3 stars` : "not rated"}`}>
      {[1, 2, 3].map((star) => (
        <Star
          key={star}
          size={12}
          strokeWidth={1.8}
          className={star <= numeric ? "fill-[#D4A34A] text-[#B88324]" : "text-[#D6DAE2]"}
        />
      ))}
    </span>
  );
}

function StarRating({ value, disabled, onChange }) {
  const numeric = Number(value || 0);

  return (
    <span className="inline-flex items-center gap-0.5" role="group" aria-label="Set manager quality rating">
      {[1, 2, 3].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(numeric === star ? null : star)}
          disabled={disabled}
          aria-label={`Rate this question ${star} out of 3 stars`}
          aria-pressed={numeric === star}
          title={`${star} out of 3 stars${numeric === star ? " (click to clear)" : ""}`}
          className="rounded-md p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A34A]/35 disabled:cursor-wait disabled:opacity-50"
        >
          <Star
            size={15}
            strokeWidth={1.9}
            className={star <= numeric ? "fill-[#D4A34A] text-[#B88324]" : "text-[#C8CDD6]"}
          />
        </button>
      ))}
    </span>
  );
}

function inferCandidatePattern(
  attempt
) {
  if (attempt?.pattern) {
    return attempt.pattern;
  }

  const text = String(
    attempt?.question_text ||
      ""
  ).toLowerCase();

  if (
    /\b(select|join|where|group by|order by|postgresql|sql)\b/.test(
      text
    )
  ) {
    return "SQL";
  }

  if (
    /output|printed|print\(|console|returned|return value/.test(
      text
    )
  ) {
    return "Output prediction";
  }

  if (
    /debug|bug|error|exception|fix/.test(
      text
    )
  ) {
    return "Debugging";
  }

  if (
    /code snippet|given the following code|function\(|def |class /.test(
      text
    )
  ) {
    return "Code interpretation";
  }

  if (
    /compare|difference between|distinguish|versus/.test(
      text
    )
  ) {
    return "Comparison";
  }

  if (
    /scenario|suppose|consider|production|developer/.test(
      text
    )
  ) {
    return "Scenario";
  }

  if (
    /design|architecture|trade-off|approach/.test(
      text
    )
  ) {
    return "Design / reasoning";
  }

  if (
    /why |purpose|principle|what is|which best describes/.test(
      text
    )
  ) {
    return "Concept / principle";
  }

  return "Applied reasoning";
}

function candidateWordCount(
  attempt
) {
  return String(
    attempt?.question_text ||
      ""
  )
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function generationFocusLabel(
  value
) {
  const labels = {
    auto: "Auto",
    concept:
      "Concept / principle",
    scenario:
      "Scenario / application",
    comparison:
      "Comparison",
    code:
      "Code interpretation",
    output:
      "Output prediction",
    debugging:
      "Debugging / troubleshooting",
    sql:
      "SQL / query reasoning",
    design:
      "Design / architecture reasoning",
    applied:
      "Applied reasoning",
  };

  return (
    labels[value] ||
    labels.auto
  );
}

function GenerationProgressPanel({ startedAt, compact = false }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!startedAt) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
      );
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [startedAt]);

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  const elapsedRemainder = elapsedSeconds % 60;
  const elapsedLabel = `${String(elapsedMinutes).padStart(2, "0")}:${String(
    elapsedRemainder
  ).padStart(2, "0")}`;

  const stages = [
    {
      number: "01",
      title: "Plan the batch",
      description:
        "Use the selected skill, section, difficulty, question type and manager guidance as constraints.",
    },
    {
      number: "02",
      title: "Generate drafts",
      description:
        "Create question candidates according to the selected generation strategy and question style.",
    },
    {
      number: "03",
      title: "Validate candidates",
      description:
        "Check generated drafts against the assessment requirements and generation validation rules.",
    },
    {
      number: "04",
      title: "Prepare human review",
      description:
        "Return the candidates for the manager to inspect. A candidate becomes the current question only after explicit acceptance.",
    },
  ];

  return (
    <section
      className={`rounded-xl border border-[#D8D1FF] bg-gradient-to-br from-[#FAF9FF] to-white ${
        compact ? "p-3.5" : "p-4"
      }`}
      aria-busy="true"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#ECE9FF] text-[#5146B2]">
          <RefreshCw size={16} className="animate-spin" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p
              role="status"
              aria-live="polite"
              className="text-xs font-bold text-[#3E378A]"
            >
              AI question generation is in progress
            </p>
            <span className="rounded-full border border-[#E2DDF8] bg-white px-2.5 py-1 text-[10px] font-semibold tabular-nums text-[#5146B2]">
              Elapsed {elapsedLabel}
            </span>
          </div>

          <p className="mt-1.5 text-[11px] leading-5 text-[#667085]">
            Evalyn is waiting for the generation service to return the batch. The
            current endpoint does not report live internal stage completion, so
            the steps below explain the pipeline rather than claiming a stage has
            finished.
          </p>
        </div>
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#EAE7FA]">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-[#6658D7]" />
      </div>

      <div className={`mt-4 grid gap-2 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-2"}`}>
        {stages.map((stage) => (
          <div
            key={stage.number}
            className="flex items-start gap-2.5 rounded-lg border border-[#EEEAFB] bg-white/90 p-3"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#F0EDFF] text-[9px] font-bold text-[#5146B2]">
              {stage.number}
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-[#344054]">
                {stage.title}
              </p>
              <p className="mt-1 text-[10px] leading-4 text-[#7A8498]">
                {stage.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-lg bg-[#F8F7FF] px-3 py-2.5">
        <ShieldCheck size={14} className="mt-0.5 shrink-0 text-[#6658D7]" />
        <p className="text-[10px] leading-4 text-[#667085]">
          Human review remains in control: generated drafts do not replace an
          existing question until you choose to accept one.
        </p>
      </div>
    </section>
  );
}

function GenerationSettingsForm({
  slot,
  count,
  prompt,
  setPrompt,
  strategy,
  setStrategy,
  focus,
  setFocus,
  onSubmit,
  onCancel,
  generating,
  generationStartedAt,
}) {
  const selectedType =
    slot?.preferred_question_type ||
    (
      slot?.section_type ===
      "free_text"
        ? "FREE_TEXT"
        : "MCQ"
    );

  const focusOptions =
    slot?.section_type ===
    "implementation"
      ? [
          [
            "auto",
            "Auto — choose the best pattern",
          ],
          [
            "scenario",
            "Scenario / practical application",
          ],
          [
            "code",
            "Code interpretation",
          ],
          [
            "output",
            "Output prediction",
          ],
          [
            "debugging",
            "Debugging / root cause",
          ],
          [
            "comparison",
            "Comparison / when to use",
          ],
          [
            "sql",
            "SQL / query reasoning",
          ],
          [
            "design",
            "Design / architecture reasoning",
          ],
          [
            "applied",
            "Applied engineering reasoning",
          ],
        ]
      : slot?.section_type ===
          "free_text"
        ? [
            [
              "auto",
              "Auto — choose the best pattern",
            ],
            [
              "scenario",
              "Scenario / practical application",
            ],
            [
              "debugging",
              "Troubleshooting / root cause",
            ],
            [
              "comparison",
              "Comparison / trade-off",
            ],
            [
              "design",
              "Design / reasoning",
            ],
            [
              "applied",
              "Applied reasoning",
            ],
          ]
        : [
            [
              "auto",
              "Auto — choose the best pattern",
            ],
            [
              "scenario",
              "Scenario / practical application",
            ],
            [
              "debugging",
              "Troubleshooting / diagnosis",
            ],
            [
              "comparison",
              "Comparison / distinction",
            ],
            [
              "concept",
              "Concept / principle",
            ],
            [
              "applied",
              "Applied reasoning",
            ],
          ];

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-5"
    >
      <div className="flex flex-wrap items-center gap-2 text-xs text-[#667085]">
        <span className="font-semibold text-[#202938]">
          {count} candidates
        </span>

        <span>
          ·
        </span>

        <span>
          {slot?.skill_name ||
            `Skill #${slot?.skill_id}`}
        </span>

        <span>
          ·
        </span>

        <span>
          {DIFFICULTY_LABELS[
            slot?.difficulty
          ] ||
            slot?.difficulty}
        </span>

        <span>
          ·
        </span>

        <span>
          {selectedType}
        </span>
      </div>

      {generating && generationStartedAt && (
        <GenerationProgressPanel
          key={generationStartedAt}
          startedAt={generationStartedAt}
        />
      )}

      <div>

        <label className="text-xs font-semibold text-[#344054]">
          Generation strategy
        </label>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">

          {[
            {
              value:
                "pattern",
              label:
                "Pattern-focused",
              copy:
                "Stay closest to existing question structure and style.",
            },
            {
              value:
                "balanced",
              label:
                "Balanced",
              copy:
                "Keep the pattern while allowing useful current variation.",
            },
            {
              value:
                "current",
              label:
                "Current focus",
              copy:
                "Prioritize modern practical concepts within the target skill.",
            },
          ].map(
            (item) => {
              const active =
                strategy ===
                item.value;

              return (
                <button
                  key={
                    item.value
                  }
                  type="button"
                  onClick={() =>
                    setStrategy(
                      item.value
                    )
                  }
                  className={`border p-3 text-left transition ${
                    active
                      ? "border-[#6658D7] bg-[#F8F7FF] ring-1 ring-[#D8D2FF]"
                      : "border-[#D9DEE7] bg-white hover:border-[#BFC4CF]"
                  }`}
                >
                  <div className={`text-xs font-semibold ${
                    active
                      ? "text-[#5146B2]"
                      : "text-[#344054]"
                  }`}>
                    {
                      item.label
                    }
                  </div>

                  <div className="mt-1 text-[10px] leading-4 text-[#7A8498]">
                    {
                      item.copy
                    }
                  </div>
                </button>
              );
            }
          )}
        </div>
      </div>

      <div>

        <label
          htmlFor="generation-focus"
          className="text-xs font-semibold text-[#344054]"
        >
          Quick question style
        </label>

        <select
          id="generation-focus"
          value={focus}
          onChange={(event) =>
            setFocus(
              event.target
                .value
            )
          }
          disabled={
            generating
          }
          className="mt-2 h-9 w-full border border-[#D9DEE7] bg-white px-3 text-xs font-semibold text-[#475467] outline-none focus:border-[#6658D7]"
        >
          {focusOptions.map(
            ([
              value,
              label,
            ]) => (
              <option
                key={
                  value
                }
                value={
                  value
                }
              >
                {label}
              </option>
            )
          )}
        </select>
      </div>

      <div>

        <div className="flex items-center justify-between gap-3">

          <label
            htmlFor="manager-generation-guidance"
            className="text-xs font-semibold text-[#344054]"
          >
            What kind of questions do you want?
          </label>

          <span className="text-[10px] text-[#98A2B3]">
            {
              prompt.length
            }
            /1200
          </span>
        </div>

        <textarea
          id="manager-generation-guidance"
          value={prompt}
          onChange={(event) =>
            setPrompt(
              event.target.value.slice(
                0,
                1200
              )
            )
          }
          rows={5}
          className="mt-2 w-full resize-y border border-[#D9DEE7] bg-white px-3 py-2.5 text-xs leading-5 text-[#344054] outline-none placeholder:text-[#A0A8B6] focus:border-[#6658D7]"
          placeholder="Example: Give me troubleshooting-style FastAPI MCQs. Start with a real-world failure and ask for the likely cause or best next step."
          disabled={
            generating
          }
        />
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-[#EEF0F3] pt-4">

        <button
          type="button"
          onClick={onCancel}
          disabled={
            generating
          }
          className="h-9 border border-[#D9DEE7] bg-white px-3.5 text-xs font-semibold text-[#475467] disabled:opacity-50"
        >
          Cancel
        </button>

        <button
          type="submit"
          disabled={
            generating
          }
          className="inline-flex h-9 items-center gap-2 bg-[#6658D7] px-4 text-xs font-semibold text-white hover:bg-[#584CC5] disabled:opacity-60"
        >
          {generating && (
            <RefreshCw
              size={13}
              className="animate-spin"
            />
          )}

          {generating
            ? "Generating…"
            : `Generate ${count}`}
        </button>

      </div>
    </form>
  );
}

function CandidatePool({
  candidatePool,
  search,
  setSearch,
  pattern,
  setPattern,
  length,
  setLength,
  sort,
  setSort,
  promptDraft,
  setPromptDraft,
  onRegenerate,
  acceptingAttemptId,
  onAccept,
}) {
  const attempts = Array.isArray(candidatePool?.attempts)
    ? candidatePool.attempts
    : [];

  const patterns = useMemo(
    () =>
      Array.from(
        new Set(attempts.map((attempt) => inferCandidatePattern(attempt)))
      ).sort(),
    [attempts]
  );

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    const rows = attempts.filter((attempt) => {
      if (normalizedSearch) {
        const haystack = [
          attempt?.question_text,
          ...(attempt?.options || []),
        ]
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(normalizedSearch)) return false;
      }

      if (pattern !== 'all' && inferCandidatePattern(attempt) !== pattern) {
        return false;
      }

      if (length !== 'all') {
        const words = candidateWordCount(attempt);

        if (length === 'brief' && words > 35) return false;
        if (length === 'standard' && (words <= 35 || words > 75)) return false;
        if (length === 'detailed' && words <= 75) return false;
      }

      return true;
    });

    return [...rows].sort((a, b) => {
      if (sort === 'shortest') {
        return candidateWordCount(a) - candidateWordCount(b);
      }

      if (sort === 'longest') {
        return candidateWordCount(b) - candidateWordCount(a);
      }

      if (sort === 'alpha') {
        return String(a?.question_text || '').localeCompare(
          String(b?.question_text || '')
        );
      }

      return Number(b?.attempt_number || 0) - Number(a?.attempt_number || 0);
    });
  }, [attempts, search, pattern, length, sort]);

  const selectClassName =
    'h-10 rounded-xl border border-[#E0E4EC] bg-white px-3 text-xs font-medium text-[#475467] shadow-sm outline-none transition focus:border-[#7A6AF0] focus:ring-4 focus:ring-[#7A6AF0]/10';

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-[#E4E0FA] bg-gradient-to-br from-[#FAF9FF] via-white to-[#F8FAFF] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ECE9FF] text-[#6658D7] ring-1 ring-inset ring-[#DBD5FF]">
            <Sparkles size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-[#252746]">
                Refine your next batch
              </h3>
              <span className="rounded-full border border-[#E0DBFA] bg-white/80 px-2 py-0.5 text-[9px] font-semibold text-[#7467C6]">
                Optional guidance
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-[#7A8498]">
              Tell the AI what to emphasize. Required skill, section, difficulty and question type remain enforced.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1">
            <label
              htmlFor="candidate-prompt"
              className="mb-2 block text-[10px] font-bold uppercase tracking-[0.13em] text-[#5D52B6]"
            >
              Generation instructions
            </label>
            <textarea
              id="candidate-prompt"
              value={promptDraft}
              onChange={(event) => setPromptDraft(event.target.value)}
              maxLength={1200}
              rows={2}
              className="min-h-[68px] w-full resize-y rounded-xl border border-[#DDD8F6] bg-white px-3.5 py-3 text-xs leading-5 text-[#344054] shadow-sm outline-none transition placeholder:text-[#9AA2B1] focus:border-[#7A6AF0] focus:ring-4 focus:ring-[#7A6AF0]/10"
              placeholder="Example: Ask debugging questions with a short broken FastAPI snippet. Focus on root cause and the best fix; avoid definition-only questions."
            />
            <div className="mt-1.5 flex justify-end text-[10px] tabular-nums text-[#98A2B3]">
              {promptDraft.length}/1200
            </div>
          </div>

          <button
            type="button"
            onClick={onRegenerate}
            disabled={!promptDraft.trim()}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#6658D7] px-4 text-xs font-semibold text-white shadow-[0_7px_16px_rgba(102,88,215,0.18)] transition hover:-translate-y-0.5 hover:bg-[#584BC7] focus:outline-none focus:ring-4 focus:ring-[#6658D7]/15 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
          >
            <RefreshCw size={13} />
            Regenerate with prompt
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-[#E5E8EF] bg-[#FBFCFE] p-3.5 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold text-[#344054]">Find a candidate</h3>
            <p className="mt-0.5 text-[10px] text-[#98A2B3]">
              Search question text or narrow by pattern and length.
            </p>
          </div>
          <span className="rounded-full border border-[#E2E6EF] bg-white px-2.5 py-1 text-[10px] font-semibold text-[#667085]">
            {filtered.length} of {attempts.length} shown
          </span>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:flex-nowrap">
          <div className="relative min-w-0 flex-1">
            <Search
              size={15}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#98A2B3]"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-10 w-full rounded-xl border border-[#E0E4EC] bg-white pl-10 pr-3 text-xs text-[#344054] shadow-sm outline-none transition placeholder:text-[#9AA2B1] focus:border-[#7A6AF0] focus:ring-4 focus:ring-[#7A6AF0]/10"
              placeholder="Search candidates..."
              aria-label="Search AI candidates"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <SlidersHorizontal size={14} className="hidden text-[#8A94A8] sm:block" />
            <select
              value={pattern}
              onChange={(event) => setPattern(event.target.value)}
              className={`${selectClassName} min-w-[145px] flex-1 sm:flex-none`}
              aria-label="Filter by question pattern"
            >
              <option value="all">All patterns</option>
              {patterns.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>

            <select
              value={length}
              onChange={(event) => setLength(event.target.value)}
              className={`${selectClassName} flex-1 sm:flex-none`}
              aria-label="Filter by question length"
            >
              <option value="all">Any length</option>
              <option value="brief">Brief</option>
              <option value="standard">Standard</option>
              <option value="detailed">Detailed</option>
            </select>

            <select
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              className={`${selectClassName} flex-1 sm:flex-none`}
              aria-label="Sort AI candidates"
            >
              <option value="newest">Newest</option>
              <option value="shortest">Shortest</option>
              <option value="longest">Longest</option>
              <option value="alpha">A–Z</option>
            </select>
          </div>
        </div>
      </section>

      {!filtered.length ? (
        <div className="rounded-2xl border border-dashed border-[#D8DDE8] bg-white px-5 py-14 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F1F3F9] text-[#8993A6]">
            <Search size={19} />
          </div>
          <h3 className="mt-4 text-sm font-semibold text-[#344054]">
            No matching candidates
          </h3>
          <p className="mx-auto mt-1.5 max-w-sm text-xs leading-5 text-[#8490A3]">
            Try another search term or reset the filters to view the full batch.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setPattern('all');
              setLength('all');
              setSort('newest');
            }}
            className="mt-4 inline-flex h-9 items-center justify-center rounded-lg border border-[#D9DDF0] bg-white px-3.5 text-xs font-semibold text-[#5D52B6] transition hover:bg-[#F8F7FF]"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((attempt, index) => {
            const currentAttemptIsBeingAccepted =
              acceptingAttemptId === attempt?.id;
            const correctAnswer = getCorrectAnswerLabel(attempt);
            const isFreeText = attempt.question_type === 'FREE_TEXT';

            return (
              <article
                key={attempt.id}
                className="group relative overflow-hidden rounded-2xl border border-[#E4E7EE] bg-white shadow-[0_2px_10px_rgba(24,32,51,0.025)] transition-all duration-300 ease-out hover:-translate-y-1 hover:border-[#CFCBE8] hover:shadow-[0_16px_34px_rgba(35,32,79,0.085)] focus-within:border-[#C6C0ED]"
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-14 -top-14 h-36 w-36 rounded-full bg-[#F4F2FF] opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
                />

                <div className="relative p-4 sm:p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="flex min-w-0 flex-1 items-start gap-3.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#E2E5EC] bg-white text-[11px] font-semibold tabular-nums text-[#687385] transition-colors duration-200 group-hover:border-[#CBC6E9] group-hover:bg-[#F8F7FE] group-hover:text-[#5D52B6]">
                        {String(index + 1).padStart(2, '0')}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#6B7484]">
                            Candidate {index + 1}
                          </span>
                          <span className="text-[10px] text-[#98A2B3]">
                            Run #{attempt.attempt_number}
                          </span>
                          <span className="rounded-md border border-[#E4E6EC] bg-[#F8F9FB] px-2 py-1 text-[9px] font-medium text-[#606B7C]">
                            {inferCandidatePattern(attempt)}
                          </span>
                          <span className="rounded-md border border-[#E4E6EC] bg-white px-2 py-1 text-[9px] font-medium text-[#798394]">
                            {isFreeText ? 'Open response' : 'Multiple choice'}
                          </span>
                        </div>

                        <div className="mt-2.5 text-sm leading-6 text-[#202938] sm:text-[15px] sm:leading-7">
                          <QuestionText text={attempt.question_text} />
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onAccept(attempt)}
                      disabled={currentAttemptIsBeingAccepted}
                      className="group/accept inline-flex h-9 shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-[#DAD7F4] bg-white px-3.5 text-[11px] font-semibold text-[#5D52B6] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#BDB6E8] hover:bg-[#F8F7FE] hover:shadow-[0_5px_14px_rgba(49,42,109,0.08)] active:translate-y-0 focus:outline-none focus:ring-4 focus:ring-[#6658D7]/12 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 md:mt-0"
                    >
                      {currentAttemptIsBeingAccepted ? (
                        <RefreshCw size={13} className="animate-spin" />
                      ) : (
                        <Check size={14} />
                      )}
                      {currentAttemptIsBeingAccepted ? 'Using...' : 'Use question'}
                      {!currentAttemptIsBeingAccepted && (
                        <ArrowRight size={12} className="transition-transform duration-200 group-hover/accept:translate-x-0.5" />
                      )}
                    </button>
                  </div>

                  {!isFreeText && Array.isArray(attempt.options) && (
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {attempt.options.slice(0, 4).map((option, optionIndex) => {
                        const isCorrect = correctAnswer?.index === optionIndex;
                        const optionLetter = String.fromCharCode(65 + optionIndex);

                        return (
                          <div
                            key={`${option}-${optionIndex}`}
                            className={`flex min-w-0 items-start gap-3 rounded-xl border px-3.5 py-3 text-xs leading-5 transition-all duration-200 ${
                              isCorrect
                                ? 'border-[#B9DEC9] bg-[#F3FAF5] text-[#28734E] hover:border-[#9DCFB1] hover:bg-[#EDF8F1]'
                                : 'border-[#E8EAF0] bg-white text-[#667085] hover:border-[#D4D8E4] hover:bg-[#FAFBFD] hover:shadow-[0_3px_10px_rgba(24,32,51,0.035)]'
                            }`}
                          >
                            <span
                              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold transition-colors ${
                                isCorrect
                                  ? 'bg-[#DDF2E5] text-[#28734E]'
                                  : 'border border-[#E4E7ED] bg-white text-[#7B8798] group-hover:border-[#DADDE7]'
                              }`}
                            >
                              {optionLetter}
                            </span>
                            <span className="min-w-0 flex-1 pt-0.5">
                              <QuestionText text={option} className="text-xs leading-5" />
                            </span>
                            {isCorrect && (
                              <span className="inline-flex shrink-0 items-center gap-1 pt-0.5 text-[9px] font-semibold text-[#28734E]">
                                <CheckCircle2 size={12} />
                                Correct answer
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {isFreeText && (
                    <div className="mt-4 flex items-center gap-2 rounded-xl border border-dashed border-[#DDE2EA] bg-[#FAFBFC] px-3.5 py-3 text-[11px] text-[#7A8498]">
                      <FilePlus2 size={14} className="shrink-0 text-[#7A8498]" />
                      Open-ended response — no fixed answer choices.
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E9ECF2] pt-3 text-[10px] text-[#98A2B3]">
        <span>AI candidates are drafts until you explicitly accept one.</span>
        <span className="font-medium tabular-nums">{filtered.length} displayed</span>
      </div>
    </div>
  );
}

function CandidateReview({
  candidateReview,
  accepting,
  onAccept,
}) {
  const attempt = candidateReview.attempt;
  const correctAnswer = getCorrectAnswerLabel(attempt);
  const isFreeText = attempt?.question_type === 'FREE_TEXT';

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[#E3DFFC] bg-gradient-to-br from-[#FAF9FF] to-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[#E3DFFC] bg-white px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[#5D52B6]">
            AI-generated draft
          </span>
          {attempt?.attempt_number != null && (
            <span className="text-[10px] text-[#8992A5]">
              Generation #{attempt.attempt_number}
            </span>
          )}
          <span className="rounded-full border border-[#E5E8EF] bg-white px-2.5 py-1 text-[9px] font-medium text-[#758195]">
            {isFreeText ? 'Open response' : 'Multiple choice'}
          </span>
        </div>

        <div className="mt-4 text-base leading-7 text-[#202938] sm:text-[17px]">
          <QuestionText text={attempt?.question_text} />
        </div>
      </div>

      {isFreeText ? (
        <div className="flex items-start gap-3 rounded-xl border border-[#E5E8EF] bg-[#FAFBFD] p-4 text-xs leading-5 text-[#667085]">
          <FilePlus2 size={16} className="mt-0.5 shrink-0 text-[#7A6BC8]" />
          <p>This is an open-ended question. The candidate will write a response rather than choose from fixed options.</p>
        </div>
      ) : (
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h4 className="text-xs font-semibold text-[#344054]">Answer choices</h4>
            {correctAnswer?.index != null && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#B9DEC9] bg-[#F2FAF5] px-2.5 py-1 text-[9px] font-semibold text-[#28734E]">
                <CheckCircle2 size={12} />
                Correct answer indicated
              </span>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {(attempt?.options || []).map((option, index) => {
              const isCorrect = correctAnswer?.index === index;

              return (
                <div
                  key={`${option}-${index}`}
                  className={`flex min-w-0 items-start gap-3 rounded-xl border px-3.5 py-3.5 text-xs leading-5 ${
                    isCorrect
                      ? 'border-[#B9DEC9] bg-[#F2FAF5] text-[#28734E]'
                      : 'border-[#E5E8EF] bg-white text-[#566273]'
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ${
                      isCorrect
                        ? 'bg-[#DDF2E5] text-[#28734E]'
                        : 'bg-[#F4F6FA] text-[#758195]'
                    }`}
                  >
                    {String.fromCharCode(65 + index)}
                  </span>
                  <span className="min-w-0 flex-1 pt-1">
                    <QuestionText text={option} className="text-xs leading-5" />
                  </span>
                  {isCorrect && <CheckCircle2 size={15} className="mt-1 shrink-0" />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 border-t border-[#E9ECF2] pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-md text-[10px] leading-5 text-[#8992A5]">
          Accepting makes this the current question for the slot. You can still review its status in the workspace.
        </p>
        <button
          type="button"
          onClick={onAccept}
          disabled={accepting}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#6658D7] px-4 text-xs font-semibold text-white shadow-[0_7px_16px_rgba(102,88,215,0.16)] transition hover:-translate-y-0.5 hover:bg-[#584BC7] focus:outline-none focus:ring-4 focus:ring-[#6658D7]/15 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {accepting ? (
            <RefreshCw size={13} className="animate-spin" />
          ) : (
            <Check size={14} />
          )}
          {accepting ? 'Using question…' : 'Accept this question'}
        </button>
      </div>
    </div>
  );
}

function QuestionSourceList({
  loading,
  emptyMessage,
  questions,
  onUse,
  showBankMeta,
  historical,
}) {
  if (loading) {
    return (
      <div className="flex min-h-[220px] items-center justify-center gap-2 text-sm text-[#667085]" aria-live="polite">
        <RefreshCw size={16} className="animate-spin text-[#6658D7]" />
        Finding approved questions for this skill…
      </div>
    );
  }

  if (!questions.length) {
    return (
      <div className="rounded-xl border border-dashed border-[#D8DEE8] bg-[#FAFBFD] px-6 py-12 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#7A8498] ring-1 ring-inset ring-[#E4E8EF]">
          <Search size={17} />
        </div>
        <p className="mt-3 text-sm font-semibold text-[#344054]">
          No matching approved questions
        </p>
        <p className="mx-auto mt-1.5 max-w-md text-xs leading-5 text-[#7A8498]">
          {emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 max-h-[58vh] space-y-3 overflow-y-auto pr-1">
      {questions.map((question) => (
        <article
          key={`${historical ? "h" : "b"}-${question.id}-${question.assessment_id || ""}`}
          className="group/source rounded-xl border border-[#E5E8EF] bg-white p-4 transition-all duration-200 hover:-translate-y-px hover:border-[#CEC7EE] hover:bg-[#FEFDFF] hover:shadow-[0_8px_20px_rgba(38,40,79,0.05)]"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {historical ? (
                  <span className="rounded-full bg-[#F3F5F9] px-2.5 py-1 text-[9px] font-semibold text-[#596579]">
                    {question.source_year || "Previous year"}
                  </span>
                ) : showBankMeta ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#F0F8F3] px-2.5 py-1 text-[9px] font-semibold text-[#28734E]">
                    <CheckCircle2 size={10} />
                    {question.confirmed_set_label
                      ? `Confirmed · ${question.confirmed_set_label}`
                      : question.confirmed_set_variant
                        ? `Confirmed · Set ${String.fromCharCode(64 + Number(question.confirmed_set_variant))}`
                        : "Approved question bank"}
                  </span>
                ) : null}

                {question.status === "approved" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#F0F8F3] px-2.5 py-1 text-[9px] font-semibold text-[#28734E]">
                    <CheckCircle2 size={10} /> Approved
                  </span>
                )}

                {question.difficulty && (
                  <span className="rounded-full bg-[#F7F8FA] px-2.5 py-1 text-[9px] font-medium capitalize text-[#667085]">
                    {DIFFICULTY_LABELS[question.difficulty] || question.difficulty}
                  </span>
                )}

                {question.question_type && (
                  <span className="rounded-full bg-[#F7F8FA] px-2.5 py-1 text-[9px] font-medium text-[#667085]">
                    {String(question.question_type).toUpperCase() === "FREE_TEXT" ? "Free text" : "Multiple choice"}
                  </span>
                )}
              </div>

              <QuestionText
                text={question.question_text}
                className="mt-3 text-sm leading-6 text-[#273142]"
              />

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="inline-flex items-center gap-1.5 text-[10px] text-[#7A8498]">
                  <span className="font-medium text-[#98A2B3]">Manager</span>
                  <StaticStarRating value={question.manager_rating} label="Manager rating" />
                  <span className="tabular-nums">{question.manager_rating ? `${question.manager_rating}/3` : "—"}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 text-[10px] text-[#7A8498]">
                  <span className="font-medium text-[#98A2B3]">Reviewer</span>
                  <StaticStarRating value={question.reviewer_rating} label="Reviewer rating" />
                  <span className="tabular-nums">{question.reviewer_rating ? `${question.reviewer_rating}/3` : "—"}</span>
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onUse(question)}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-[#D9D4F2] bg-white px-3.5 text-[10px] font-semibold text-[#5146B2] transition duration-200 hover:-translate-y-0.5 hover:border-[#BEB5E9] hover:bg-[#F7F5FF] focus:outline-none focus:ring-4 focus:ring-[#6658D7]/10"
            >
              <Check size={12} />
              Use in slot
              <ArrowRight size={12} className="transition-transform group-hover/source:translate-x-0.5" />
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function ManualQuestionForm({
  slot,
  form,
  setForm,
  onSubmit,
  onCancel,
  saving,
}) {
  const isFreeText =
    slot.section_type ===
    "free_text";

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-5"
    >

      <FormField label="Question">
        <textarea
          value={
            form.question_text
          }
          onChange={(event) =>
            setForm(
              (
                current
              ) => ({
                ...current,
                question_text:
                  event.target
                    .value,
              })
            )
          }
          rows={5}
          required
          className="w-full border border-[#D9DEE7] bg-white px-3 py-2.5 text-sm text-[#344054] outline-none focus:border-[#6658D7]"
        />
      </FormField>

      {!isFreeText && (
        <div className="grid gap-3 sm:grid-cols-2">

          {form.options.map(
            (
              option,
              index
            ) => (
              <FormField
                key={index}
                label={`Option ${String.fromCharCode(
                  65 +
                    index
                )}`}
              >
                <input
                  value={
                    option
                  }
                  onChange={(
                    event
                  ) =>
                    setForm(
                      (
                        current
                      ) => ({
                        ...current,
                        options:
                          current.options.map(
                            (
                              value,
                              i
                            ) =>
                              i ===
                              index
                                ? event
                                    .target
                                    .value
                                : value
                          ),
                      })
                    )
                  }
                  required
                  className="w-full border border-[#D9DEE7] bg-white px-3 py-2.5 text-sm text-[#344054] outline-none focus:border-[#6658D7]"
                />
              </FormField>
            )
          )}
        </div>
      )}

      <FormField label="Explanation / answer rationale">
        <textarea
          value={
            form.explanation
          }
          onChange={(event) =>
            setForm(
              (
                current
              ) => ({
                ...current,
                explanation:
                  event.target
                    .value,
              })
            )
          }
          rows={4}
          className="w-full border border-[#D9DEE7] bg-white px-3 py-2.5 text-sm text-[#344054] outline-none focus:border-[#6658D7]"
        />
      </FormField>

      <FormActions
        onCancel={
          onCancel
        }
        disabled={
          saving
        }
        submitLabel={
          saving
            ? "Saving…"
            : "Save question"
        }
      />
    </form>
  );
}

function EditQuestionForm({
  question,
  form,
  setForm,
  onSubmit,
  onCancel,
  saving,
}) {
  const isFreeText =
    question.question_type ===
    "FREE_TEXT";

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-5"
    >

      <FormField label="Question">
        <textarea
          value={
            form.question_text
          }
          onChange={(event) =>
            setForm(
              (
                current
              ) => ({
                ...current,
                question_text:
                  event.target
                    .value,
              })
            )
          }
          rows={5}
          required
          className="w-full border border-[#D9DEE7] bg-white px-3 py-2.5 text-sm text-[#344054] outline-none focus:border-[#6658D7]"
        />
      </FormField>

      {!isFreeText && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">

            {form.options.map(
              (
                option,
                index
              ) => (
                <FormField
                  key={index}
                  label={`Option ${String.fromCharCode(
                    65 +
                      index
                  )}`}
                >
                  <input
                    value={
                      option
                    }
                    onChange={(
                      event
                    ) =>
                      setForm(
                        (
                          current
                        ) => ({
                          ...current,
                          options:
                            current.options.map(
                              (
                                value,
                                i
                              ) =>
                                i ===
                                index
                                  ? event
                                      .target
                                      .value
                                  : value
                            ),
                        })
                      )
                    }
                    required
                    className="w-full border border-[#D9DEE7] bg-white px-3 py-2.5 text-sm text-[#344054] outline-none focus:border-[#6658D7]"
                  />
                </FormField>
              )
            )}
          </div>

          <FormField label="Correct answer">
            <select
              value={
                form.correct_answer
              }
              onChange={(
                event
              ) =>
                setForm(
                  (
                    current
                  ) => ({
                    ...current,
                    correct_answer:
                      event.target
                        .value,
                  })
                )
              }
              required
              className="w-full border border-[#D9DEE7] bg-white px-3 py-2.5 text-sm text-[#344054] outline-none focus:border-[#6658D7]"
            >
              <option value="">
                Select an option
              </option>

              {form.options
                .filter(Boolean)
                .map(
                  (
                    option,
                    index
                  ) => (
                    <option
                      key={`${index}-${option}`}
                      value={
                        option
                      }
                    >
                      Option{" "}
                      {String.fromCharCode(
                        65 +
                          index
                      )}
                    </option>
                  )
                )}
            </select>
          </FormField>
        </>
      )}

      <FormField label="Explanation / answer rationale">
        <textarea
          value={
            form.explanation
          }
          onChange={(event) =>
            setForm(
              (
                current
              ) => ({
                ...current,
                explanation:
                  event.target
                    .value,
              })
            )
          }
          rows={4}
          className="w-full border border-[#D9DEE7] bg-white px-3 py-2.5 text-sm text-[#344054] outline-none focus:border-[#6658D7]"
        />
      </FormField>

      <FormActions
        onCancel={
          onCancel
        }
        disabled={
          saving
        }
        submitLabel={
          saving
            ? "Saving…"
            : "Save version"
        }
      />
    </form>
  );
}

function FormField({
  label,
  children,
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#667085]">
        {label}
      </span>
      {children}
    </label>
  );
}

function FormActions({
  onCancel,
  disabled,
  submitLabel,
}) {
  return (
    <div className="flex justify-end gap-2 border-t border-[#E5E7EB] pt-4">

      <button
        type="button"
        onClick={onCancel}
        disabled={disabled}
        className="h-10 border border-[#D9DEE7] px-4 text-xs font-semibold text-[#475467] disabled:opacity-50"
      >
        Cancel
      </button>

      <button
        type="submit"
        disabled={disabled}
        className="inline-flex h-10 items-center gap-2 bg-[#6658D7] px-4 text-xs font-semibold text-white disabled:opacity-50"
      >
        <Check
          size={13}
        />
        {
          submitLabel
        }
      </button>

    </div>
  );
}

function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
  headerAction = null,
}) {
  useEffect(() => {
    const previous =
      document.body.style
        .overflow;

    document.body.style.overflow =
      "hidden";

    return () => {
      document.body.style.overflow =
        previous;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-[#111429]/45 p-2 backdrop-blur-[4px] sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`my-auto flex max-h-[94vh] w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-white/70 bg-white shadow-[0_32px_100px_rgba(20,22,48,0.28)] sm:rounded-[24px] ${
          wide ? "max-w-6xl" : "max-w-2xl"
        }`}
      >
        <div className="shrink-0 border-b border-[#E9ECF2] bg-gradient-to-r from-[#FBFAFF] via-white to-[#F8FAFF] px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex items-start justify-between gap-3 sm:gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ECE9FF] text-[#6658D7] ring-1 ring-inset ring-[#E0DBFF]">
                  <Sparkles size={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold tracking-[-0.02em] text-[#202938] sm:text-lg">
                    {title}
                  </h2>
                  {subtitle && (
                    <p className="mt-1.5 max-w-3xl text-xs leading-5 text-[#7A8498]">
                      {subtitle}
                    </p>
                  )}
                </div>
                {headerAction}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#E5E8EF] bg-white text-[#7B8798] transition hover:border-[#D5D9E4] hover:bg-[#F7F8FB] hover:text-[#344054] focus:outline-none focus:ring-4 focus:ring-[#6658D7]/10"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {children}
        </div>
      </div>
    </div>
  );
}

export default ManagerAssessmentSets;