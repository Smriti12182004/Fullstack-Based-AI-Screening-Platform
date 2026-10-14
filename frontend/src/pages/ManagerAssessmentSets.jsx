import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
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

function ManagerAssessmentSets() {
  const { questionSetId } = useParams();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [workspace, setWorkspace] = useState(null);
  const [activeSetId, setActiveSetId] = useState(null);
  const [expandedSections, setExpandedSections] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [generatingSlotId, setGeneratingSlotId] = useState(null);
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

      const response = await api.get(
        `/assessment-authoring/question-sets/${questionSetId}`
      );

      const data = response.data;

      setWorkspace(data);

      // Load any candidate-facing Assessment records already materialized
      // for this QuestionSet. This is intentionally best-effort so the
      // existing authoring workspace is never blocked by this new lifecycle
      // lookup.
      try {
        const assessmentResponse = await api.get(
          `/assessments/question-set/${questionSetId}/variants`
        );

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
      } catch (assessmentErr) {
        console.warn(
          "Unable to load candidate-facing assessment variants:",
          assessmentErr
        );
      }

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

              return (
                <section
                  key={section.id}
                  className="border-b border-[#E5E7EB] last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() =>
                      toggleSection(
                        section.id
                      )
                    }
                    className="flex w-full items-start justify-between gap-5 py-5 text-left"
                  >
                    <div className="flex min-w-0 items-start gap-3.5">

                      <div className="flex h-8 w-8 shrink-0 items-center justify-center bg-[#F1EEFF] text-xs font-bold text-[#5E4DA3]">
                        {String.fromCharCode(
                          65 +
                            sectionIndex
                        )}
                      </div>

                      <div className="min-w-0">

                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#98A2B3]">
                            Section{" "}
                            {String.fromCharCode(
                              65 +
                                sectionIndex
                            )}
                          </span>

                          <span className="text-[10px] font-semibold text-[#5E4DA3]">
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
                      <span className="text-[10px] font-semibold text-[#667085]">
                        {
                          sectionPrepared
                        }
                        /
                        {
                          sectionSlots.length
                        }{" "}
                        prepared
                      </span>

                      <ChevronDown
                        size={16}
                        className={`text-[#8A94A8] transition-transform ${
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
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#D8D1FF] bg-[#F8F7FF] px-3 text-[10px] font-semibold text-[#5146B2] transition hover:border-[#BDB5F6] hover:bg-[#F1EEFF] disabled:cursor-not-allowed disabled:opacity-50"
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
          <div className="border-b border-[#E5E7EB]">
            <div className="flex items-center justify-between gap-4">

              <div className="flex items-center gap-1">
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
                    className="h-9 w-60 border border-[#D9DEE7] bg-white pl-8 pr-3 text-xs text-[#344054] outline-none focus:border-[#6658D7]"
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
                    className="h-9 border border-[#D9DEE7] bg-white px-3 text-xs font-semibold text-[#475467] outline-none"
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
              emptyMessage="No approved current-year question matches this exact skill, difficulty and section type."
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
              emptyMessage="No approved question from a previous finalized assessment matches this exact skill, difficulty and section type."
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
    <div className="inline-flex h-10 min-w-[174px] shrink-0 overflow-hidden rounded-lg border border-[#4E3FC9] bg-[#5A49D7] shadow-[0_6px_18px_rgba(90,73,215,0.24)] ring-1 ring-white/10">
      <button
        type="button"
        onClick={() =>
          onGenerate(count)
        }
        disabled={generating}
        className="inline-flex h-full min-w-[112px] items-center justify-center gap-2 bg-gradient-to-r from-[#6454EC] via-[#7359F2] to-[#8A5CF6] px-4 text-[11px] font-bold tracking-[0.01em] text-white transition-all duration-150 hover:from-[#5748DD] hover:via-[#654AE6] hover:to-[#7B4DEB] disabled:cursor-not-allowed disabled:opacity-60"
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

      <div className="relative flex h-full w-[62px] shrink-0 items-center border-l border-white/20 bg-[#5545D0]">
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
    <div className="border-b border-[#EEF0F3] py-5 last:border-b-0">

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">

        <div className="flex min-w-0 items-start gap-3.5">

          <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-[#DDD9F2] bg-[#F7F5FF] text-xs font-bold text-[#5146B2]">
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

              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#667085]">
                {DIFFICULTY_LABELS[
                  slot.difficulty
                ] ||
                  slot.difficulty}
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

            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">

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
                  className="h-9 w-full border border-[#D9DEE7] bg-white px-2.5 pr-8 text-xs font-semibold text-[#344054] outline-none focus:border-[#6658D7] disabled:bg-[#F8F9FB] disabled:text-[#667085]"
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

              <span className="text-[10px] text-[#98A2B3]">
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
              <div className="mt-4">

                <p className="max-w-5xl text-[15px] font-medium leading-7 text-[#263042]">
                  {
                    question.question_text
                  }
                </p>

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
                                className={`rounded-md px-1.5 py-1 text-xs leading-5 ${
                                  isCorrect
                                    ? "bg-[#F3FBF6] text-[#28734E]"
                                    : "text-[#667085]"
                                }`}
                              >
                                <span
                                  className={`mr-1.5 font-semibold ${
                                    isCorrect
                                      ? "text-[#28734E]"
                                      : "text-[#566070]"
                                  }`}
                                >
                                  {String.fromCharCode(
                                    65 +
                                      index
                                  )}
                                  .
                                </span>

                                {
                                  option
                                }

                                {isCorrect && (
                                  <span className="ml-1.5 text-[8px] font-bold uppercase tracking-[0.08em]">
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

                <p className="text-xs text-[#7A8498]">
                  No question added yet. Choose a source below.
                </p>

                {latestGenerated && (
                  <div className="mt-3 flex flex-wrap items-center gap-3 border-l-2 border-[#CFC9F4] bg-[#FAF9FF] px-3 py-2.5 text-[10px] text-[#5146B2]">

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
                  <div className="mt-3 flex flex-wrap items-center gap-3 border-l-2 border-[#D36B6B] bg-[#FFF8F8] px-3 py-2.5 text-[10px] text-[#9F3F3F]">

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
                icon={
                  <History
                    size={13}
                  />
                }
                onClick={
                  onExisting
                }
              >
                Existing
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
        <div className="mt-4 flex flex-col gap-3 border-t border-[#F0F1F4] pt-3 sm:flex-row sm:items-center sm:justify-between">

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] text-[#98A2B3]">

            <SourceBadge
              source={
                slot.source_type ||
                question.source
              }
            />

            <span>
              Version{" "}
              {question.version ||
                1}
            </span>

            <span>
              Reviewer{" "}
              {question.reviewer_rating
                ? `${question.reviewer_rating}/3`
                : "—"}
            </span>

            <span className="flex items-center gap-2">
              Manager rating

              <StarRating
                value={
                  question.manager_rating
                }
                disabled={
                  ratingQuestionId ===
                  question.id
                }
                onChange={(value) =>
                  onRate(
                    question.id,
                    value
                  )
                }
              />
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">

            {latestGenerated && (
              <button
                type="button"
                onClick={() =>
                  onReviewCandidate(
                    latestGenerated
                  )
                }
                className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#5146B2]"
              >
                <Bot size={12} />
                Review AI candidates
              </button>
            )}

            {recoverable
              .slice(0, 3)
              .map((attempt) => (
                <button
                  key={
                    attempt.id
                  }
                  type="button"
                  onClick={() =>
                    onRestore(
                      attempt
                    )
                  }
                  disabled={
                    restoringAttemptId ===
                    attempt.id
                  }
                  className="text-[10px] font-semibold text-[#667085] hover:text-[#5146B2] disabled:opacity-50"
                >
                  {restoringAttemptId ===
                  attempt.id
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
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 items-center gap-1.5 border px-3 text-[10px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
        tone === "primary"
          ? "border-[#6658D7] bg-[#6658D7] text-white hover:bg-[#584CC5]"
          : "border-[#D9DEE7] bg-white text-[#475467] hover:border-[#BFC4CF] hover:text-[#202938]"
      } ${className}`}
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
  const label = String(
    status || ""
  ).replaceAll(
    "_",
    " "
  );

  return (
    <span className="text-[9px] font-semibold capitalize text-[#98A2B3]">
      {label || "draft"}
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

function StarRating({
  value,
  disabled,
  onChange,
}) {
  const numeric = Number(
    value || 0
  );

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3].map(
        (star) => (
          <button
            key={star}
            type="button"
            onClick={() =>
              onChange(
                numeric ===
                  star
                  ? null
                  : star
              )
            }
            disabled={disabled}
            className="p-0.5 disabled:opacity-50"
          >
            <Star
              size={13}
              className={
                star <=
                numeric
                  ? "fill-[#C58A32] text-[#C58A32]"
                  : "text-[#C9CDD6]"
              }
            />
          </button>
        )
      )}
    </div>
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
  const attempts =
    Array.isArray(
      candidatePool?.attempts
    )
      ? candidatePool.attempts
      : [];

  const patterns =
    useMemo(
      () =>
        Array.from(
          new Set(
            attempts.map(
              (attempt) =>
                inferCandidatePattern(
                  attempt
                )
            )
          )
        ).sort(),
      [attempts]
    );

  const filtered =
    useMemo(() => {
      const normalizedSearch =
        search
          .trim()
          .toLowerCase();

      const rows =
        attempts.filter(
          (attempt) => {
            if (
              normalizedSearch
            ) {
              const haystack =
                [
                  attempt?.question_text,
                  ...(attempt?.options ||
                    []),
                ]
                  .join(" ")
                  .toLowerCase();

              if (
                !haystack.includes(
                  normalizedSearch
                )
              ) {
                return false;
              }
            }

            if (
              pattern !==
                "all" &&
              inferCandidatePattern(
                attempt
              ) !== pattern
            ) {
              return false;
            }

            if (
              length !==
              "all"
            ) {
              const words =
                candidateWordCount(
                  attempt
                );

              if (
                length ===
                  "brief" &&
                words > 35
              ) {
                return false;
              }

              if (
                length ===
                  "standard" &&
                (words <= 35 ||
                  words >
                    75)
              ) {
                return false;
              }

              if (
                length ===
                  "detailed" &&
                words <= 75
              ) {
                return false;
              }
            }

            return true;
          }
        );

      return [...rows].sort(
        (a, b) => {
          if (
            sort ===
            "shortest"
          ) {
            return (
              candidateWordCount(
                a
              ) -
              candidateWordCount(
                b
              )
            );
          }

          if (
            sort ===
            "longest"
          ) {
            return (
              candidateWordCount(
                b
              ) -
              candidateWordCount(
                a
              )
            );
          }

          if (
            sort ===
            "alpha"
          ) {
            return String(
              a?.question_text ||
                ""
            ).localeCompare(
              String(
                b?.question_text ||
                  ""
              )
            );
          }

          return (
            Number(
              b?.attempt_number ||
                0
            ) -
            Number(
              a?.attempt_number ||
                0
            )
          );
        }
      );
    }, [
      attempts,
      search,
      pattern,
      length,
      sort,
    ]);

  return (
    <div>

      <div className="border-y border-[#E7E9EE] bg-[#FAFBFC] px-4 py-4">

        <div className="border border-[#DDD8FA] bg-[#F8F7FF] px-3.5 py-3.5">

          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">

            <div className="min-w-0 flex-1">

              <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#5146B2]">
                Tell AI what you want in the next batch
              </label>

              <textarea
                value={
                  promptDraft
                }
                onChange={(
                  event
                ) =>
                  setPromptDraft(
                    event.target
                      .value
                  )
                }
                maxLength={1200}
                rows={2}
                className="mt-2 w-full resize-y border border-[#D8D2F3] bg-white px-3 py-2.5 text-xs leading-5 text-[#344054] outline-none"
                placeholder="Example: Give me debugging questions with a short broken FastAPI snippet. Ask for the root cause and best fix. Avoid definition-only questions."
              />
            </div>

            <button
              type="button"
              onClick={
                onRegenerate
              }
              disabled={
                !promptDraft.trim()
              }
              className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 bg-[#6658D7] px-3.5 text-[10px] font-semibold text-white disabled:opacity-50"
            >
              <RefreshCw
                size={12}
              />
              Regenerate with prompt
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">

          <div className="relative min-w-[240px] flex-1">

            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#98A2B3]"
            />

            <input
              value={search}
              onChange={(
                event
              ) =>
                setSearch(
                  event.target
                    .value
                )
              }
              className="h-9 w-full border border-[#D9DEE7] bg-white pl-9 pr-3 text-xs text-[#344054] outline-none focus:border-[#6658D7]"
              placeholder="Search candidates..."
            />
          </div>

          <SlidersHorizontal
            size={13}
          />

          <select
            value={pattern}
            onChange={(
              event
            ) =>
              setPattern(
                event.target
                  .value
              )
            }
            className="h-9 border border-[#D9DEE7] bg-white px-2.5 text-xs font-semibold text-[#475467]"
          >
            <option value="all">
              All patterns
            </option>

            {patterns.map(
              (item) => (
                <option
                  key={
                    item
                  }
                  value={
                    item
                  }
                >
                  {item}
                </option>
              )
            )}
          </select>

          <select
            value={length}
            onChange={(
              event
            ) =>
              setLength(
                event.target
                  .value
              )
            }
            className="h-9 border border-[#D9DEE7] bg-white px-2.5 text-xs font-semibold text-[#475467]"
          >
            <option value="all">
              Any length
            </option>
            <option value="brief">
              Brief
            </option>
            <option value="standard">
              Standard
            </option>
            <option value="detailed">
              Detailed
            </option>
          </select>

          <select
            value={sort}
            onChange={(
              event
            ) =>
              setSort(
                event.target
                  .value
              )
            }
            className="h-9 border border-[#D9DEE7] bg-white px-2.5 text-xs font-semibold text-[#475467]"
          >
            <option value="newest">
              Newest
            </option>
            <option value="shortest">
              Shortest
            </option>
            <option value="longest">
              Longest
            </option>
            <option value="alpha">
              A–Z
            </option>
          </select>
        </div>
      </div>

      <div className="mt-4 divide-y divide-[#EEF0F3] border-y border-[#EEF0F3]">

        {!filtered.length ? (
          <div className="py-14 text-center text-sm text-[#667085]">
            No candidates match these filters.
          </div>
        ) : (
          filtered.map(
            (attempt, index) => {
              const currentAttemptIsBeingAccepted =
                acceptingAttemptId ===
                attempt?.id;

              const correctAnswer =
                getCorrectAnswerLabel(
                  attempt
                );

              return (
                <div
                  key={
                    attempt.id
                  }
                  className="py-5"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">

                    <div className="min-w-0 flex-1">

                      <div className="flex flex-wrap items-center gap-2">

                        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#8A94A8]">
                          Candidate{" "}
                          {index +
                            1}
                        </span>

                        <span className="text-[10px] text-[#98A2B3]">
                          Generation #
                          {
                            attempt.attempt_number
                          }
                        </span>

                        <span className="rounded-full bg-[#F1EEFF] px-2 py-1 text-[9px] font-semibold text-[#5E4DA3]">
                          {inferCandidatePattern(
                            attempt
                          )}
                        </span>
                      </div>

                      <p className="mt-2 text-sm font-medium leading-6 text-[#263042]">
                        {
                          attempt.question_text
                        }
                      </p>

                      {attempt.question_type !==
                        "FREE_TEXT" &&
                        Array.isArray(
                          attempt.options
                        ) && (
                          <div className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">

                            {attempt.options
                              .slice(
                                0,
                                4
                              )
                              .map(
                                (
                                  option,
                                  optionIndex
                                ) => {
                                  const isCorrect =
                                    correctAnswer?.index ===
                                    optionIndex;

                                  return (
                                    <div
                                      key={`${option}-${optionIndex}`}
                                      className={`rounded-md border px-2.5 py-2 text-[10px] leading-5 ${
                                        isCorrect
                                          ? "border-[#B9DEC9] bg-[#F3FBF6] text-[#28734E]"
                                          : "border-transparent text-[#667085]"
                                      }`}
                                    >
                                      <span className="mr-1.5 font-semibold">
                                        {String.fromCharCode(
                                          65 +
                                            optionIndex
                                        )}
                                        .
                                      </span>

                                      {
                                        option
                                      }
                                    </div>
                                  );
                                }
                              )}
                          </div>
                        )}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        onAccept(
                          attempt
                        )
                      }
                      disabled={
                        currentAttemptIsBeingAccepted
                      }
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 bg-[#6658D7] px-3.5 text-[10px] font-semibold text-white disabled:opacity-50"
                    >
                      {currentAttemptIsBeingAccepted ? (
                        <RefreshCw
                          size={12}
                          className="animate-spin"
                        />
                      ) : (
                        <Check
                          size={12}
                        />
                      )}

                      {currentAttemptIsBeingAccepted
                        ? "Using..."
                        : "Use this question"}
                    </button>

                  </div>
                </div>
              );
            }
          )
        )}
      </div>
    </div>
  );
}

function CandidateReview({
  candidateReview,
  accepting,
  onAccept,
}) {
  const attempt =
    candidateReview.attempt;

  const correctAnswer =
    getCorrectAnswerLabel(
      attempt
    );

  return (
    <div>

      <h3 className="text-base font-semibold leading-6 text-[#202938]">
        {
          attempt?.question_text
        }
      </h3>

      {attempt?.question_type !==
        "FREE_TEXT" && (
        <div className="mt-4 space-y-2">

          {(attempt?.options ||
            []
          ).map(
            (
              option,
              index
            ) => {
              const isCorrect =
                correctAnswer?.index ===
                index;

              return (
                <div
                  key={`${option}-${index}`}
                  className={`border px-3 py-2.5 text-xs ${
                    isCorrect
                      ? "border-[#B9DEC9] bg-[#F3FBF6] text-[#28734E]"
                      : "border-[#E5E7EB] text-[#475467]"
                  }`}
                >
                  <span className="mr-2 font-semibold">
                    {String.fromCharCode(
                      65 +
                        index
                    )}
                    .
                  </span>

                  {
                    option
                  }

                  {isCorrect && (
                    <span className="ml-2 font-semibold">
                      Correct
                    </span>
                  )}
                </div>
              );
            }
          )}
        </div>
      )}

      <div className="mt-6 flex justify-end border-t border-[#E5E7EB] pt-4">

        <button
          type="button"
          onClick={
            onAccept
          }
          disabled={
            accepting
          }
          className="inline-flex h-10 items-center gap-2 bg-[#6658D7] px-4 text-xs font-semibold text-white disabled:opacity-50"
        >
          {accepting ? (
            <RefreshCw
              size={13}
              className="animate-spin"
            />
          ) : (
            <Check
              size={13}
            />
          )}

          {accepting
            ? "Using question…"
            : "Use this question"}
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
      <div className="flex min-h-[260px] items-center justify-center text-sm text-[#667085]">
        <RefreshCw
          size={16}
          className="mr-2 animate-spin"
        />
        Loading matching questions…
      </div>
    );
  }

  if (!questions.length) {
    return (
      <div className="py-14 text-center text-sm text-[#667085]">
        {
          emptyMessage
        }
      </div>
    );
  }

  return (
    <div className="mt-4 max-h-[58vh] overflow-y-auto">

      <div className="divide-y divide-[#EEF0F3] border-y border-[#EEF0F3]">

        {questions.map(
          (question) => (
            <div
              key={`${historical ? "h" : "b"}-${question.id}-${question.assessment_id || ""}`}
              className="grid gap-4 py-4 lg:grid-cols-[minmax(0,1fr)_220px]"
            >
              <div className="min-w-0">

                <div className="flex flex-wrap items-center gap-2">

                  {historical ? (
                    <span className="px-2 py-1 text-[9px] font-semibold bg-[#EEF6FF] text-[#3E6098]">
                      {
                        question.source_year ||
                        "Previous year"
                      }
                    </span>
                  ) : showBankMeta ? (
                    <span className="px-2 py-1 text-[9px] font-semibold bg-[#F1EEFF] text-[#5E4DA3]">
                      Current bank
                    </span>
                  ) : null}

                  {question.status ===
                    "approved" && (
                    <span className="px-2 py-1 text-[9px] font-semibold bg-[#F2FAF5] text-[#28734E]">
                      Approved
                    </span>
                  )}
                </div>

                <p className="mt-2 text-sm font-semibold leading-5 text-[#263042]">
                  {
                    question.question_text
                  }
                </p>
              </div>

              <div className="flex items-center justify-end">

                <button
                  type="button"
                  onClick={() =>
                    onUse(
                      question
                    )
                  }
                  className="inline-flex h-9 items-center gap-2 border border-[#6658D7] px-3 text-[10px] font-semibold text-[#5146B2]"
                >
                  <Check
                    size={12}
                  />
                  Use in slot
                </button>

              </div>
            </div>
          )
        )}

      </div>
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
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#111429]/38 p-4 backdrop-blur-[2px]">

      <div
        className={`max-h-[92vh] w-full overflow-hidden border border-[#DDE1E8] bg-white shadow-[0_30px_90px_rgba(25,28,55,0.22)] ${
          wide
            ? "max-w-6xl"
            : "max-w-2xl"
        }`}
      >

        <div className="flex items-start justify-between gap-4 border-b border-[#E5E7EB] px-5 py-4 sm:px-6">

          <div className="min-w-0 flex-1">

            <div className="flex flex-wrap items-start gap-3">

              <div className="min-w-0 flex-1">

                <h2 className="text-lg font-semibold text-[#202938]">
                  {title}
                </h2>

                {subtitle && (
                  <p className="mt-1 max-w-3xl text-xs leading-5 text-[#7A8498]">
                    {
                      subtitle
                    }
                  </p>
                )}
              </div>

              {headerAction}
            </div>
          </div>

          <button
            type="button"
            onClick={
              onClose
            }
            className="flex h-8 w-8 shrink-0 items-center justify-center text-[#667085] hover:bg-[#F5F6F8]"
          >
            <X
              size={17}
            />
          </button>
        </div>

        <div className="max-h-[calc(92vh-90px)] overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
          {children}
        </div>
      </div>
    </div>
  );
}

export default ManagerAssessmentSets;