import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Edit3,
  FileQuestion,
  Plus,
  RefreshCw,
  Send,
  X,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import RecruiterLayout from "../layouts/RecruiterLayout";

const VALID_DIFFICULTIES = ["easy", "medium", "hard"];
const VALID_QUESTION_TYPES = ["MCQ", "FREE_TEXT"];

function ManagerQuestionSetQuestions() {
  const { questionSetId } = useParams();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [questionSet, setQuestionSet] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [sections, setSections] = useState([]);
  const [skills, setSkills] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [generatingQuestions, setGeneratingQuestions] = useState(false);
  const [regeneratingQuestionId, setRegeneratingQuestionId] = useState(null);
  const [batchRefreshProgress, setBatchRefreshProgress] = useState({
    current: 0,
    total: 0,
  });
  const [keptQuestionIds, setKeptQuestionIds] = useState([]);
  const [availableQuestionsBySection, setAvailableQuestionsBySection] = useState({});
  const [loadingAvailableSections, setLoadingAvailableSections] = useState({});
  const [selectedSectionForQuestions, setSelectedSectionForQuestions] = useState(null);
  const [addingQuestionId, setAddingQuestionId] = useState(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [actionError, setActionError] = useState("");

  const [search, setSearch] = useState("");
  const [difficultyFilter, setDifficultyFilter] =
    useState("all");
  const [statusFilter, setStatusFilter] =
    useState("all");

  const [isQuestionModalOpen, setIsQuestionModalOpen] =
    useState(false);

  const [editingQuestion, setEditingQuestion] =
    useState(null);

  const [questionText, setQuestionText] =
    useState("");

  const [questionType, setQuestionType] =
    useState("MCQ");

  const [questionSkillId, setQuestionSkillId] =
    useState("");

  const [questionDifficulty, setQuestionDifficulty] =
    useState("medium");

  const [questionOptions, setQuestionOptions] =
    useState(["", ""]);

  const [questionCorrectAnswer, setQuestionCorrectAnswer] =
    useState("");

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

  const loadQuestionSet = async () => {
    const response = await api.get(
      `/question-sets/${questionSetId}`
    );

    setQuestionSet(response.data);
  };

  const loadSections = async () => {
    const response = await api.get(
      `/sections?question_set_id=${questionSetId}`
    );

    const sectionData = Array.isArray(response.data)
      ? response.data
      : [];

    setSections(sectionData);
    return sectionData;
  };

  const loadQuestions = async () => {
    const response = await api.get(
      `/question-sets/${questionSetId}/questions`
    );

    const questionData = Array.isArray(response.data)
      ? response.data
      : [];

    setQuestions(questionData);

    return questionData;
  };

  const loadAvailableSectionQuestions = async (sectionId) => {
    setLoadingAvailableSections((current) => ({
      ...current,
      [sectionId]: true,
    }));

    try {
      const response = await api.get(
        `/questions/sections/${sectionId}/available`
      );

      const availableQuestions = Array.isArray(response.data)
        ? response.data
        : [];

      setAvailableQuestionsBySection((current) => ({
        ...current,
        [sectionId]: availableQuestions,
      }));

      return availableQuestions;
    } catch (err) {
      console.error(
        `Failed to load available questions for section ${sectionId}:`,
        err
      );

      if (handleUnauthorized(err)) {
        return [];
      }

      setActionError(
        getErrorMessage(
          err,
          "Unable to load reusable questions for the section."
        )
      );

      return [];
    } finally {
      setLoadingAvailableSections((current) => ({
        ...current,
        [sectionId]: false,
      }));
    }
  };

  const openSectionQuestionPicker = async (section) => {
    setActionError("");
    setSuccess("");
    setSelectedSectionForQuestions(section);

    await loadAvailableSectionQuestions(section.id);
  };

  const closeSectionQuestionPicker = () => {
    if (addingQuestionId !== null) {
      return;
    }

    setSelectedSectionForQuestions(null);
  };

  const handleAddQuestionToSection = async (questionId) => {
    if (!selectedSectionForQuestions) {
      return;
    }

    if (
      questionSet?.status !== "draft" &&
      questionSet?.status !== "rejected"
    ) {
      setActionError(
        "Questions can only be assigned while the question set is in draft or rejected state."
      );
      return;
    }

    setActionError("");
    setSuccess("");
    setAddingQuestionId(questionId);

    try {
      await api.post("/questions/sections/add", {
        question_id: Number(questionId),
        section_id: Number(selectedSectionForQuestions.id),
      });

      setSuccess(
        `Question ${questionId} added to ${selectedSectionForQuestions.name}.`
      );

      await loadAvailableSectionQuestions(
        selectedSectionForQuestions.id
      );
    } catch (err) {
      console.error(
        "Failed to add question to section:",
        err
      );

      if (handleUnauthorized(err)) {
        return;
      }

      setActionError(
        getErrorMessage(
          err,
          "Unable to add the question to this section."
        )
      );
    } finally {
      setAddingQuestionId(null);
    }
  };

  const loadSkills = (questionData = []) => {
    const skillIds = [
      ...new Set(
        questionData
          .map((question) => Number(question.skill_id))
          .filter((skillId) => Number.isInteger(skillId) && skillId > 0)
      ),
    ];

    const derivedSkills = skillIds
      .sort((a, b) => a - b)
      .map((id) => ({
        id,
        name: `Skill #${id}`,
      }));

    setSkills(derivedSkills);

    if (derivedSkills.length > 0) {
      setQuestionSkillId((current) => {
        const stillValid = derivedSkills.some(
          (skill) => String(skill.id) === String(current)
        );

        return stillValid
          ? String(current)
          : String(derivedSkills[0].id);
      });
    } else {
      setQuestionSkillId("");
    }
  };

  const loadPage = async (
    showRefreshState = false
  ) => {
    try {
      setError("");
      setActionError("");

      if (showRefreshState) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const [_, loadedQuestions, loadedSections] = await Promise.all([
        loadQuestionSet(),
        loadQuestions(),
        loadSections(),
      ]);

      loadSkills(loadedQuestions);

      await Promise.all(
        loadedSections.map((section) =>
          loadAvailableSectionQuestions(section.id)
        )
      );
    } catch (err) {
      console.error(
        "Failed to load manager question-set page:",
        err
      );

      if (handleUnauthorized(err)) {
        return;
      }

      setError(
        getErrorMessage(
          err,
          "Unable to load the question set."
        )
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadPage();
  }, [questionSetId]);

  useEffect(() => {
    const modalOpen = isQuestionModalOpen;

    if (!modalOpen) {
      return undefined;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow = "hidden";

    const handleEscape = (event) => {
      if (event.key !== "Escape") {
        return;
      }

      if (savingQuestion) {
        return;
      }

      closeQuestionModal();
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
  }, [
    isQuestionModalOpen,
    savingQuestion,
  ]);

  const resetQuestionForm = () => {
    setQuestionText("");
    setQuestionType("MCQ");
    setQuestionDifficulty("medium");
    setQuestionOptions(["", ""]);
    setQuestionCorrectAnswer("");

    if (skills.length > 0) {
      setQuestionSkillId(
        String(skills[0].id)
      );
    } else {
      setQuestionSkillId("");
    }
  };

  const openAddQuestion = () => {
    setActionError("");
    setSuccess("");
    setEditingQuestion(null);
    resetQuestionForm();

    if (questionSet?.status === "submitted_for_review") {
      setActionError(
        "This question set has already been submitted for review."
      );
      return;
    }

    setIsQuestionModalOpen(true);
  };

  const openEditQuestion = (question) => {
    setActionError("");
    setSuccess("");
    setEditingQuestion(question);

    setQuestionText(
      question.question_text || ""
    );

    setQuestionType(
      question.question_type || "MCQ"
    );

    setQuestionSkillId(
      question.skill_id != null
        ? String(question.skill_id)
        : ""
    );

    setQuestionDifficulty(
      question.difficulty || "medium"
    );

    setQuestionOptions(
      Array.isArray(question.options) &&
        question.options.length > 0
        ? question.options.map((option) =>
            String(option)
          )
        : ["", ""]
    );

    setQuestionCorrectAnswer(
      question.correct_answer || ""
    );

    if (questionSet?.status === "submitted_for_review") {
      setActionError(
        "This question set has already been submitted for review."
      );
      return;
    }

    setIsQuestionModalOpen(true);
  };

  const closeQuestionModal = () => {
    if (savingQuestion) {
      return;
    }

    setIsQuestionModalOpen(false);
    setEditingQuestion(null);
    resetQuestionForm();
  };

  const updateQuestionOption = (
    index,
    value
  ) => {
    setQuestionOptions((current) =>
      current.map((option, optionIndex) =>
        optionIndex === index
          ? value
          : option
      )
    );
  };

  const addQuestionOption = () => {
    setQuestionOptions((current) => [
      ...current,
      "",
    ]);
  };

  const removeQuestionOption = (index) => {
    setQuestionOptions((current) =>
      current.filter(
        (_, optionIndex) =>
          optionIndex !== index
      )
    );

    const removedOption =
      questionOptions[index] || "";

    if (
      questionCorrectAnswer ===
      removedOption
    ) {
      setQuestionCorrectAnswer("");
    }
  };

  const buildPayload = () => {
    const normalizedText =
      questionText.trim();

    const selectedSkillId =
      Number(questionSkillId);

    if (!normalizedText) {
      throw new Error(
        "Question text is required."
      );
    }

    if (
      !questionSkillId ||
      !Number.isInteger(selectedSkillId) ||
      selectedSkillId <= 0
    ) {
      throw new Error(
        "Please select a valid skill."
      );
    }

    if (
      !VALID_QUESTION_TYPES.includes(
        questionType
      )
    ) {
      throw new Error(
        "Invalid question type."
      );
    }

    if (
      !VALID_DIFFICULTIES.includes(
        questionDifficulty
      )
    ) {
      throw new Error(
        "Invalid difficulty."
      );
    }

    let options = null;
    let correctAnswer = null;

    if (questionType === "MCQ") {
      options = questionOptions
        .map((option) => option.trim())
        .filter(Boolean);

      if (options.length < 2) {
        throw new Error(
          "MCQ questions require at least two options."
        );
      }

      if (
        !questionCorrectAnswer.trim()
      ) {
        throw new Error(
          "Please select the correct answer."
        );
      }

      const normalizedAnswer =
        questionCorrectAnswer
          .trim()
          .toLowerCase();

      const answerIndex =
        options.findIndex(
          (option) =>
            option.toLowerCase() ===
            normalizedAnswer
        );

      if (answerIndex === -1) {
        throw new Error(
          "The correct answer must match one of the options."
        );
      }

      correctAnswer =
        options[answerIndex];
    }

    return {
      question_text: normalizedText,
      question_type: questionType,
      skill_id: selectedSkillId,
      difficulty: questionDifficulty,
      options,
      correct_answer: correctAnswer,
    };
  };

  const handleSaveQuestion = async (
    event
  ) => {
    event.preventDefault();

    if (
      questionSet?.status !== "draft" &&
      questionSet?.status !== "rejected"
    ) {
      setActionError(
        "Questions can only be changed while the question set is in draft or rejected state."
      );
      return;
    }

    setActionError("");
    setSuccess("");

    let payload;

    try {
      payload = buildPayload();
    } catch (validationError) {
      setActionError(
        validationError.message
      );
      return;
    }

    setSavingQuestion(true);

    try {
      if (editingQuestion) {
        await api.put(
          `/questions/${editingQuestion.id}`,
          payload
        );

        setSuccess(
          "Question updated successfully and returned to pending review."
        );
      } else {
        await api.post(
          `/question-sets/${questionSetId}/questions`,
          payload
        );

        setSuccess(
          "Question added to this year's question bank."
        );
      }

      await loadQuestions();

      setIsQuestionModalOpen(false);
      setEditingQuestion(null);
      resetQuestionForm();
    } catch (err) {
      console.error(
        "Failed to save manager question:",
        err
      );

      if (handleUnauthorized(err)) {
        return;
      }

      setActionError(
        getErrorMessage(
          err,
          "Unable to save the question."
        )
      );
    } finally {
      setSavingQuestion(false);
    }
  };

  const pendingAIQuestions = useMemo(() => {
    return questions.filter(
      (question) =>
        question.source === "ai_generated" &&
        question.status === "pending_review"
    );
  }, [questions]);

  const refreshableAIQuestions = useMemo(() => {
    const kept = new Set(keptQuestionIds);

    return pendingAIQuestions.filter(
      (question) => !kept.has(question.id)
    );
  }, [pendingAIQuestions, keptQuestionIds]);

  const toggleKeepQuestion = (questionId) => {
    setKeptQuestionIds((current) => {
      if (current.includes(questionId)) {
        return current.filter((id) => id !== questionId);
      }

      return [...current, questionId];
    });
  };

  const toggleKeepAllAIQuestions = () => {
    if (pendingAIQuestions.length === 0) {
      return;
    }

    if (keptQuestionIds.length === pendingAIQuestions.length) {
      setKeptQuestionIds([]);
      return;
    }

    setKeptQuestionIds(
      pendingAIQuestions.map((question) => question.id)
    );
  };

  const handleRegenerateSingleQuestion = async (questionId) => {
    if (!editable) {
      setActionError(
        "Questions can only be regenerated while the question set is editable."
      );
      return;
    }

    setActionError("");
    setSuccess("");
    setRegeneratingQuestionId(questionId);

    try {
      await api.post(
        `/questions/${questionId}/regenerate`
      );

      setKeptQuestionIds((current) =>
        current.filter((id) => id !== questionId)
      );

      await loadQuestions();

      setSuccess(
        `Question ${questionId} was regenerated with the same skill and difficulty and returned to pending review.`
      );
    } catch (err) {
      console.error(
        `Failed to regenerate question ${questionId}:`,
        err
      );

      if (handleUnauthorized(err)) {
        return;
      }

      setActionError(
        getErrorMessage(
          err,
          "Unable to regenerate this AI question."
        )
      );
    } finally {
      setRegeneratingQuestionId(null);
    }
  };

  const handleGenerateAIQuestions = async () => {
    if (!questionSet) {
      return;
    }

    if (
      questionSet.status !== "draft" &&
      questionSet.status !== "rejected"
    ) {
      setActionError(
        "AI questions can only be generated or refreshed while the question set is in draft or rejected state."
      );
      return;
    }

    setActionError("");
    setSuccess("");

    // Once AI questions already exist, Generate becomes a controlled refresh:
    // checked questions stay untouched; every unchecked AI question is replaced.
    if (pendingAIQuestions.length > 0) {
      if (refreshableAIQuestions.length === 0) {
        setSuccess(
          "All generated questions are kept. Nothing was refreshed."
        );
        return;
      }

      setGeneratingQuestions(true);
      setBatchRefreshProgress({
        current: 0,
        total: refreshableAIQuestions.length,
      });

      let refreshedCount = 0;

      try {
        for (const question of refreshableAIQuestions) {
          setBatchRefreshProgress({
            current: refreshedCount + 1,
            total: refreshableAIQuestions.length,
          });

          await api.post(
            `/questions/${question.id}/regenerate`
          );

          refreshedCount += 1;
        }

        setKeptQuestionIds([]);

        await loadQuestions();

        setSuccess(
          `Refreshed ${refreshedCount} question(s). Kept questions were left unchanged; each replacement preserved its original skill and difficulty.`
        );
      } catch (err) {
        console.error(
          "Failed to refresh AI questions:",
          err
        );

        if (handleUnauthorized(err)) {
          return;
        }

        setActionError(
          getErrorMessage(
            err,
            `Refresh stopped after ${refreshedCount} replacement(s). You can run Generate again to continue.`
          )
        );

        setKeptQuestionIds([]);
        await loadQuestions();
      } finally {
        setGeneratingQuestions(false);
        setBatchRefreshProgress({
          current: 0,
          total: 0,
        });
      }

      return;
    }

    // First generation / missing-pool generation keeps the existing blueprint logic.
    setGeneratingQuestions(true);

    try {
      const response = await api.post(
        "/questions/generate-for-question-set",
        {
          question_set_id: Number(questionSetId),
        }
      );

      const generatedCount =
        response.data?.total_generated ??
        response.data?.generated_count ??
        0;

      const remainingGap =
        response.data?.total_remaining_gap ?? 0;

      setSuccess(
        generatedCount > 0
          ? `AI generated ${generatedCount} new question(s) according to the configured skills and difficulty sections. Review them below, tick the questions you want to keep, then click Generate AI Questions again to refresh the rest.`
          : remainingGap === 0
            ? "The question pool already has enough current-year questions for the configured sections."
            : "AI generation completed. Refreshing the question pool."
      );

      setKeptQuestionIds([]);
      await loadQuestions();
    } catch (err) {
      console.error(
        "Failed to generate AI questions:",
        err
      );

      if (handleUnauthorized(err)) {
        return;
      }

      setActionError(
        getErrorMessage(
          err,
          "Unable to generate AI questions."
        )
      );
    } finally {
      setGeneratingQuestions(false);
    }
  };

  const handleSubmitForReview = async () => {
    if (!questionSet) {
      return;
    }

    if (
      questionSet.status !== "draft" &&
      questionSet.status !== "rejected"
    ) {
      setActionError(
        "This question set is already in the review workflow."
      );
      return;
    }

    if (questions.length === 0) {
      setActionError(
        "Add at least one question before submitting the question set for review."
      );
      return;
    }

    setActionError("");
    setSuccess("");
    setSubmittingReview(true);

    try {
      const response = await api.post(
        `/question-sets/${questionSetId}/submit-review`
      );

      setQuestionSet(response.data);

      setSuccess(
        "Question set submitted successfully for independent reviewer approval."
      );

      await loadQuestions();
    } catch (err) {
      console.error(
        "Failed to submit question set:",
        err
      );

      if (handleUnauthorized(err)) {
        return;
      }

      setActionError(
        getErrorMessage(
          err,
          "Unable to submit the question set for review."
        )
      );
    } finally {
      setSubmittingReview(false);
    }
  };

  const sectionQuestionCounts = useMemo(() => {
    return sections.map((section) => {
      const difficulty = String(section.difficulty || "").toLowerCase();
      const required = Array.isArray(section.skills)
        ? section.skills.reduce(
            (total, allocation) =>
              total + Number(
                allocation.question_count ??
                allocation.count ??
                0
              ),
            0
          )
        : 0;

      const current = questions.filter(
        (question) =>
          String(question.difficulty || "").toLowerCase() === difficulty
      ).length;

      return {
        ...section,
        required,
        current,
      };
    });
  }, [sections, questions]);

  const filteredQuestions = useMemo(() => {
    const normalizedSearch =
      search.trim().toLowerCase();

    return questions.filter((question) => {
      const matchesSearch =
        !normalizedSearch ||
        String(
          question.question_text || ""
        )
          .toLowerCase()
          .includes(normalizedSearch) ||
        String(
          question.skill_id || ""
        ).includes(normalizedSearch);

      const matchesDifficulty =
        difficultyFilter === "all" ||
        String(
          question.difficulty || ""
        ).toLowerCase() ===
          difficultyFilter;

      const matchesStatus =
        statusFilter === "all" ||
        question.status === statusFilter;

      return (
        matchesSearch &&
        matchesDifficulty &&
        matchesStatus
      );
    });
  }, [
    questions,
    search,
    difficultyFilter,
    statusFilter,
  ]);

  const groupedQuestions = useMemo(() => {
    return {
      easy: filteredQuestions.filter(
        (question) =>
          question.difficulty === "easy"
      ),
      medium: filteredQuestions.filter(
        (question) =>
          question.difficulty === "medium"
      ),
      hard: filteredQuestions.filter(
        (question) =>
          question.difficulty === "hard"
      ),
    };
  }, [filteredQuestions]);

  const pendingCount = questions.filter(
    (question) =>
      question.status === "pending_review"
  ).length;

  const approvedCount = questions.filter(
    (question) =>
      question.status === "approved"
  ).length;

  const rejectedCount = questions.filter(
    (question) =>
      question.status === "rejected"
  ).length;

  const editable =
    questionSet?.status === "draft" ||
    questionSet?.status === "rejected";

  if (loading) {
    return (
      <RecruiterLayout
        title="Question Set"
        breadcrumb="Workspace / Question Sets"
      >
        <main className="mx-auto flex min-h-[65vh] max-w-[1240px] items-center justify-center px-5 sm:px-8">
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAE5F9]">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#D9D9EA] border-t-[#5658E8]" />
            </div>

            <p className="mt-5 text-sm font-semibold text-[#344054]">
              Loading question set
            </p>

            <p className="mt-1.5 text-xs text-[#98A2B3]">
              Fetching the manager question workspace.
            </p>
          </div>
        </main>
      </RecruiterLayout>
    );
  }

  if (error) {
    return (
      <RecruiterLayout
        title="Question Set"
        breadcrumb="Workspace / Question Sets"
      >
        <main className="mx-auto flex min-h-[65vh] max-w-[1240px] items-center justify-center px-5 sm:px-8">
          <div className="w-full max-w-2xl rounded-[22px] border border-[#F0D5D5] bg-white p-8 shadow-[0_18px_45px_rgba(38,40,79,0.05)]">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#FCE7E7] text-[#B42318]">
              <AlertCircle size={20} />
            </div>

            <p className="mt-6 text-[9px] font-bold uppercase tracking-[0.2em] text-[#B42318]">
              Question set
            </p>

            <h1 className="mt-3 text-[30px] font-semibold tracking-[-0.03em] text-[#182033]">
              Unable to load
            </h1>

            <p className="mt-3 text-sm leading-7 text-[#667085]">
              {error}
            </p>

            <button
              type="button"
              onClick={() => loadPage()}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#5658E8] px-5 py-3 text-sm font-semibold text-white hover:bg-[#494BD8]"
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
      title="Question Set Workspace"
      breadcrumb={`Workspace / Question Set / #${questionSetId}`}
    >
      <main className="mx-auto max-w-[1240px] space-y-6 px-4 pb-12 sm:px-8">

        {/* HEADER */}
        <section className="relative overflow-hidden rounded-[24px] border border-[#DDE1E9] bg-white shadow-[0_12px_34px_rgba(38,40,79,0.04)]">
          <div className="h-1 bg-gradient-to-r from-[#CFDEFC] via-[#EAE5F9] to-[#F3E3F2]" />

          <div className="relative p-6 sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <button
                  type="button"
                  onClick={() =>
                    navigate("/questions")
                  }
                  className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#667085] hover:bg-[#F7F8FC] hover:text-[#5658E8]"
                >
                  <ArrowLeft size={14} />
                  Back to Question Bank
                </button>

                <div className="mt-5 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EAE5F9] text-[#5658E8]">
                    <FileQuestion size={20} />
                  </div>

                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#5658E8]">
                      Assessment Manager
                    </p>

                    <p className="mt-1 text-xs text-[#98A2B3]">
                      Question Set #{questionSetId}
                    </p>
                  </div>
                </div>

                <h1 className="mt-5 max-w-3xl text-[34px] font-semibold tracking-[-0.035em] text-[#182033] sm:text-[42px]">
                  {questionSet?.name ||
                    `Question Set #${questionSetId}`}
                </h1>

                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-[#DDE1E9] bg-[#FAFBFC] px-3 py-1.5 text-[10px] font-semibold text-[#667085]">
                    Year:{" "}
                    {questionSet?.hiring_year ??
                      "Not specified"}
                  </span>

                  <span className="rounded-full border border-[#DDE1E9] bg-[#FAFBFC] px-3 py-1.5 text-[10px] font-semibold text-[#667085]">
                    Job #{questionSet?.job_id}
                  </span>

                  <span className="rounded-full border border-[#DDE1E9] bg-[#F8F8FF] px-3 py-1.5 text-[10px] font-semibold capitalize text-[#5658E8]">
                    Status:{" "}
                    {String(
                      questionSet?.status || ""
                    ).replaceAll(
                      "_",
                      " "
                    )}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() =>
                    loadPage(true)
                  }
                  disabled={refreshing}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#CBD1DC] bg-white px-4 text-xs font-semibold text-[#475467] hover:border-[#5658E8] hover:text-[#5658E8] disabled:opacity-50"
                >
                  <RefreshCw
                    size={14}
                    className={
                      refreshing
                        ? "animate-spin"
                        : ""
                    }
                  />
                  Refresh
                </button>

                <button
                  type="button"
                  onClick={handleGenerateAIQuestions}
                  disabled={
                    !editable ||
                    generatingQuestions
                  }
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#CFC9F8] bg-[#F7F5FF] px-4 text-xs font-semibold text-[#5658E8] hover:border-[#5658E8] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {generatingQuestions ? (
                    <>
                      <RefreshCw
                        size={14}
                        className="animate-spin"
                      />
                      {batchRefreshProgress.total > 0
                        ? `Refreshing ${batchRefreshProgress.current}/${batchRefreshProgress.total}...`
                        : "Generating..."}
                    </>
                  ) : pendingAIQuestions.length > 0 ? (
                    <>
                      <RefreshCw size={14} />
                      Refresh Unkept ({refreshableAIQuestions.length})
                    </>
                  ) : (
                    <>
                      <Bot size={14} />
                      Generate AI Questions
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleSubmitForReview}
                  disabled={
                    !editable ||
                    submittingReview ||
                    questions.length === 0
                  }
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#5658E8] px-4 text-xs font-semibold text-white hover:bg-[#494BD8] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submittingReview ? (
                    <>
                      <RefreshCw
                        size={14}
                        className="animate-spin"
                      />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send size={14} />
                      Submit for Review
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* MESSAGES */}
        {(success || actionError) && (
          <section>
            {success && (
              <div className="flex items-start gap-3 rounded-xl border border-[#CFE6DD] bg-[#F2FAF7] px-4 py-3.5">
                <CheckCircle2
                  size={17}
                  className="mt-0.5 shrink-0 text-[#17655E]"
                />

                <p className="text-xs leading-5 text-[#17655E]">
                  {success}
                </p>
              </div>
            )}

            {actionError && (
              <div className="mt-3 flex items-start gap-3 rounded-xl border border-[#E9C8C8] bg-[#FBF2F2] px-4 py-3.5">
                <AlertCircle
                  size={17}
                  className="mt-0.5 shrink-0 text-[#A83E3E]"
                />

                <p className="text-xs leading-5 text-[#A83E3E]">
                  {actionError}
                </p>
              </div>
            )}
          </section>
        )}

        {/* SUMMARY */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            icon={<FileQuestion size={18} />}
            label="Total questions"
            value={questions.length}
            description="Questions currently in this annual bank."
          />

          <SummaryCard
            icon={<Bot size={18} />}
            label="Pending review"
            value={pendingCount}
            description="Questions awaiting reviewer approval."
          />

          <SummaryCard
            icon={<CheckCircle2 size={18} />}
            label="Approved"
            value={approvedCount}
            description="Questions already approved."
          />

          <SummaryCard
            icon={<ClipboardCheck size={18} />}
            label="Rejected"
            value={rejectedCount}
            description="Questions needing manager attention."
          />
        </section>

        {/* CONTROLS */}
        <section className="rounded-[20px] border border-[#DDE1E9] bg-white p-5 shadow-[0_10px_28px_rgba(38,40,79,0.03)] sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid flex-1 gap-4 md:grid-cols-3">
              <div>
                <label
                  htmlFor="manager-search"
                  className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-[#98A2B3]"
                >
                  Search
                </label>

                <input
                  id="manager-search"
                  type="text"
                  value={search}
                  onChange={(event) =>
                    setSearch(
                      event.target.value
                    )
                  }
                  placeholder="Search question text..."
                  className="h-11 w-full rounded-lg border border-[#D7DDE6] bg-white px-3 text-sm text-[#202938] outline-none focus:border-[#5658E8] focus:ring-4 focus:ring-[#5658E8]/10"
                />
              </div>

              <div>
                <label
                  htmlFor="manager-difficulty"
                  className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-[#98A2B3]"
                >
                  Difficulty
                </label>

                <select
                  id="manager-difficulty"
                  value={difficultyFilter}
                  onChange={(event) =>
                    setDifficultyFilter(
                      event.target.value
                    )
                  }
                  className="h-11 w-full rounded-lg border border-[#D7DDE6] bg-white px-3 text-sm text-[#202938] outline-none focus:border-[#5658E8]"
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

              <div>
                <label
                  htmlFor="manager-status"
                  className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-[#98A2B3]"
                >
                  Status
                </label>

                <select
                  id="manager-status"
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(
                      event.target.value
                    )
                  }
                  className="h-11 w-full rounded-lg border border-[#D7DDE6] bg-white px-3 text-sm text-[#202938] outline-none focus:border-[#5658E8]"
                >
                  <option value="all">
                    All statuses
                  </option>
                  <option value="pending_review">
                    Pending Review
                  </option>
                  <option value="approved">
                    Approved
                  </option>
                  <option value="rejected">
                    Rejected
                  </option>
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={openAddQuestion}
              disabled={!editable}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#5658E8] px-5 text-sm font-semibold text-white hover:bg-[#494BD8] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={16} />
              Add Question
            </button>
          </div>
        </section>

        {/* JD SECTIONS */}
        <section className="rounded-[22px] border border-[#DDE1E9] bg-white shadow-[0_10px_28px_rgba(38,40,79,0.03)]">
          <div className="border-b border-[#EAECF0] px-5 py-5 sm:px-6">
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#5658E8]">
              Assessment structure
            </p>
            <h2 className="mt-1 text-[20px] font-semibold text-[#202938]">
              Sections for this JD
            </h2>
            <p className="mt-1 text-xs text-[#98A2B3]">
              These are the sections configured for this question set. AI generation uses their configured skills and difficulty.
            </p>
          </div>

          {sectionQuestionCounts.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <FileQuestion size={22} className="mx-auto text-[#B1B7C3]" />
              <p className="mt-3 text-sm font-semibold text-[#475467]">
                No sections configured
              </p>
              <p className="mt-1 text-xs text-[#98A2B3]">
                Configure sections for this JD before generating the assessment question pool.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#EEF0F3]">
              {sectionQuestionCounts.map((section) => (
                <div key={section.id} className="px-5 py-5 sm:px-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-[#202938]">
                          {section.name}
                        </h3>
                        <span className="rounded-full bg-[#F4F1FF] px-2.5 py-1 text-[10px] font-semibold capitalize text-[#5658E8]">
                          {section.difficulty}
                        </span>
                        <span className="rounded-full bg-[#F4F5F8] px-2.5 py-1 text-[10px] font-semibold text-[#667085]">
                          Required: {section.required}
                        </span>
                        <span className="rounded-full bg-[#F4F5F8] px-2.5 py-1 text-[10px] font-semibold text-[#667085]">
                          Pool: {section.current}
                        </span>
                        <span className="rounded-full bg-[#EEF8F3] px-2.5 py-1 text-[10px] font-semibold text-[#237A4B]">
                          Reusable: {
                            availableQuestionsBySection[section.id]?.length ??
                            "—"
                          }
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {Array.isArray(section.skills) &&
                          section.skills.map((allocation) => (
                            <span
                              key={`${section.id}-${allocation.skill_id}`}
                              className="rounded-full border border-[#DDE1E9] bg-white px-2.5 py-1 text-[10px] font-semibold text-[#667085]"
                            >
                              Skill #{allocation.skill_id}: {allocation.question_count ?? allocation.count ?? 0}
                            </span>
                          ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          openSectionQuestionPicker(section)
                        }
                        disabled={
                          !editable ||
                          loadingAvailableSections[section.id]
                        }
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#CBD1DC] bg-white px-4 text-xs font-semibold text-[#475467] hover:border-[#5658E8] hover:text-[#5658E8] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {loadingAvailableSections[section.id] ? (
                          <>
                            <RefreshCw size={14} className="animate-spin" />
                            Loading...
                          </>
                        ) : (
                          <>
                            <ClipboardCheck size={14} />
                            Manage Questions
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={handleGenerateAIQuestions}
                        disabled={
                          !editable ||
                          generatingQuestions
                        }
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#CFC9F8] bg-[#F7F5FF] px-4 text-xs font-semibold text-[#5658E8] hover:border-[#5658E8] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {generatingQuestions ? (
                          <>
                            <RefreshCw size={14} className="animate-spin" />
                            {batchRefreshProgress.total > 0
                              ? `Refreshing ${batchRefreshProgress.current}/${batchRefreshProgress.total}...`
                              : "Generating..."}
                          </>
                        ) : pendingAIQuestions.length > 0 ? (
                          <>
                            <RefreshCw size={14} />
                            Refresh Unkept ({refreshableAIQuestions.length})
                          </>
                        ) : (
                          <>
                            <Bot size={14} />
                            Generate AI
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* AI REFRESH CONTROL */}
        {editable && pendingAIQuestions.length > 0 && (
          <section className="rounded-[20px] border border-[#D9D3FB] bg-[#FAF9FF] px-5 py-4 sm:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#5658E8]">
                  AI refresh mode
                </p>
                <p className="mt-1 text-sm font-semibold text-[#202938]">
                  Keep the questions you like; refresh the rest.
                </p>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-[#667085]">
                  Tick <span className="font-semibold text-[#475467]">Keep</span> on any generated question you want to preserve. Clicking the header refresh button replaces every unchecked AI question with a new question using the same skill and difficulty.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#DDE1E9] bg-white px-3 py-2 text-xs font-semibold text-[#475467]">
                  <input
                    type="checkbox"
                    checked={
                      pendingAIQuestions.length > 0 &&
                      keptQuestionIds.length === pendingAIQuestions.length
                    }
                    onChange={toggleKeepAllAIQuestions}
                    className="h-4 w-4 rounded border-[#C7CBD6] text-[#5658E8] focus:ring-[#5658E8]"
                  />
                  Keep all
                </label>

                <span className="rounded-full bg-white px-3 py-2 text-[10px] font-bold text-[#667085] ring-1 ring-[#E3E6EB]">
                  {keptQuestionIds.length} kept
                </span>

                <span className="rounded-full bg-[#F7F5FF] px-3 py-2 text-[10px] font-bold text-[#5658E8] ring-1 ring-[#D9D3FB]">
                  {refreshableAIQuestions.length} to refresh
                </span>
              </div>
            </div>
          </section>
        )}

        {/* QUESTION POOL */}
        {["easy", "medium", "hard"].map(
          (difficulty) => {
            const group = groupedQuestions[difficulty];

            return (
              <section
                key={difficulty}
                className="rounded-[22px] border border-[#DDE1E9] bg-white shadow-[0_10px_28px_rgba(38,40,79,0.03)]"
              >
                <div className="flex flex-col gap-3 border-b border-[#EAECF0] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#98A2B3]">
                      Question pool
                    </p>
                    <h2 className="mt-1 text-[20px] font-semibold capitalize text-[#202938]">
                      {difficulty}
                    </h2>
                  </div>
                  <span className="rounded-full bg-[#F8F8FF] px-3 py-1.5 text-[10px] font-bold text-[#5658E8]">
                    {group.length} questions
                  </span>
                </div>

                {group.length === 0 ? (
                  <div className="px-6 py-10 text-center">
                    <FileQuestion size={22} className="mx-auto text-[#B1B7C3]" />
                    <p className="mt-3 text-sm font-semibold text-[#475467]">
                      No questions here
                    </p>
                    <p className="mt-1 text-xs text-[#98A2B3]">
                      No questions match the current filters.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-[#EEF0F3]">
                    {group.map((question, index) => (
                      <article key={question.id} className="px-5 py-5 sm:px-6">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-[#F4F5F8] px-2.5 py-1 text-[10px] font-bold text-[#667085]">
                                Q{index + 1}
                              </span>
                              <span className="rounded-full border border-[#DDE1E9] bg-white px-2.5 py-1 text-[10px] font-semibold text-[#667085]">
                                Skill #{question.skill_id}
                              </span>
                              <span className="rounded-full bg-[#F4F5F8] px-2.5 py-1 text-[10px] font-semibold text-[#667085]">
                                {question.source === "ai_generated" ? "AI Generated" : "Manual"}
                              </span>
                              <span className="rounded-full bg-[#FFF6E6] px-2.5 py-1 text-[10px] font-semibold text-[#956B1E]">
                                {String(question.status || "").replaceAll("_", " ")}
                              </span>
                            </div>
                            <h3 className="mt-4 max-w-4xl text-sm font-semibold leading-6 text-[#202938]">
                              {question.question_text}
                            </h3>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {question.source === "ai_generated" &&
                              question.status === "pending_review" && (
                                <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-[#CFC9F8] bg-[#F7F5FF] px-3.5 text-xs font-semibold text-[#5658E8]">
                                  <input
                                    type="checkbox"
                                    checked={keptQuestionIds.includes(question.id)}
                                    onChange={() => toggleKeepQuestion(question.id)}
                                    className="h-4 w-4 rounded border-[#C7CBD6] text-[#5658E8] focus:ring-[#5658E8]"
                                  />
                                  Keep
                                </label>
                              )}

                            {question.source === "ai_generated" &&
                              question.status === "pending_review" && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRegenerateSingleQuestion(question.id)
                                  }
                                  disabled={
                                    !editable ||
                                    regeneratingQuestionId === question.id ||
                                    generatingQuestions
                                  }
                                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#CBD1DC] bg-white px-3.5 text-xs font-semibold text-[#475467] hover:border-[#5658E8] hover:text-[#5658E8] disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <RefreshCw
                                    size={13}
                                    className={
                                      regeneratingQuestionId === question.id
                                        ? "animate-spin"
                                        : ""
                                    }
                                  />
                                  {regeneratingQuestionId === question.id
                                    ? "Refreshing..."
                                    : "Regenerate"}
                                </button>
                              )}

                            <button
                              type="button"
                              onClick={() => openEditQuestion(question)}
                              disabled={!editable}
                              className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#CBD1DC] bg-white px-3.5 text-xs font-semibold text-[#475467] hover:border-[#5658E8] hover:text-[#5658E8] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Edit3 size={13} />
                              Edit
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            );
          }
        )}

        {/* WORKFLOW FOOTER */}
        <section className="rounded-[20px] border border-[#DDE1E9] bg-[#F8F9FC] px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#EAE5F9] text-[#5658E8]">
                <Send size={16} />
              </div>

              <div>
                <p className="text-xs font-semibold text-[#344054]">
                  Manager authoring workflow
                </p>

                <p className="mt-1 max-w-2xl text-[11px] leading-5 text-[#667085]">
                  Generate or add questions → edit
                  and validate the content → submit
                  the question set → independent
                  reviewer approval.
                </p>
              </div>
            </div>

            <span
              className={`text-[10px] font-bold uppercase tracking-[0.12em] ${
                editable
                  ? "text-[#956B1E]"
                  : "text-[#5658E8]"
              }`}
            >
              {editable
                ? "Authoring enabled"
                : "Submitted for review"}
            </span>
          </div>
        </section>
      </main>

      {/* QUESTION MODAL */}
      {selectedSectionForQuestions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#172033]/45 p-4">
          <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-[24px] bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[#EAECF0] px-6 py-5">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#5658E8]">
                  Section question selection
                </p>
                <h2 className="mt-1 text-[20px] font-semibold text-[#202938]">
                  {selectedSectionForQuestions.name}
                </h2>
                <p className="mt-1 text-xs text-[#98A2B3]">
                  Select approved reusable questions from the current or historical question pool.
                </p>
              </div>

              <button
                type="button"
                onClick={closeSectionQuestionPicker}
                disabled={addingQuestionId !== null}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-[#667085] hover:bg-[#F4F5F8] disabled:opacity-40"
              >
                <X size={18} />
              </button>
            </div>

            <div className="border-b border-[#EAECF0] bg-[#FAFBFC] px-6 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#F4F1FF] px-3 py-1.5 text-[10px] font-semibold capitalize text-[#5658E8]">
                  {selectedSectionForQuestions.difficulty}
                </span>
                <span className="rounded-full bg-white px-3 py-1.5 text-[10px] font-semibold text-[#667085] ring-1 ring-[#E3E6EB]">
                  Required: {selectedSectionForQuestions.skills?.reduce(
                    (total, allocation) =>
                      total +
                      Number(
                        allocation.question_count ??
                        allocation.count ??
                        0
                      ),
                    0
                  ) ?? 0}
                </span>
                <span className="rounded-full bg-white px-3 py-1.5 text-[10px] font-semibold text-[#237A4B] ring-1 ring-[#D5EBDD]">
                  Available: {
                    availableQuestionsBySection[
                      selectedSectionForQuestions.id
                    ]?.length ?? 0
                  }
                </span>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {loadingAvailableSections[
                selectedSectionForQuestions.id
              ] ? (
                <div className="px-6 py-12 text-center">
                  <RefreshCw
                    size={22}
                    className="mx-auto animate-spin text-[#5658E8]"
                  />
                  <p className="mt-3 text-sm font-semibold text-[#475467]">
                    Loading reusable questions...
                  </p>
                </div>
              ) : (
                (() => {
                  const availableQuestions =
                    availableQuestionsBySection[
                      selectedSectionForQuestions.id
                    ] || [];

                  if (availableQuestions.length === 0) {
                    return (
                      <div className="px-6 py-12 text-center">
                        <CheckCircle2
                          size={24}
                          className="mx-auto text-[#237A4B]"
                        />
                        <p className="mt-3 text-sm font-semibold text-[#475467]">
                          No reusable questions available
                        </p>
                        <p className="mt-1 text-xs text-[#98A2B3]">
                          This section currently has no additional approved questions that can be assigned.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="divide-y divide-[#EEF0F3]">
                      {availableQuestions.map((question) => (
                        <article
                          key={question.id}
                          className="px-6 py-5"
                        >
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-[#F4F5F8] px-2.5 py-1 text-[10px] font-bold text-[#667085]">
                                  Q{question.id}
                                </span>
                                <span className="rounded-full bg-[#EEF8F3] px-2.5 py-1 text-[10px] font-semibold text-[#237A4B]">
                                  Approved
                                </span>
                                <span className="rounded-full border border-[#DDE1E9] bg-white px-2.5 py-1 text-[10px] font-semibold text-[#667085]">
                                  {question.source === "ai_generated"
                                    ? "AI Generated"
                                    : "Manual"}
                                </span>
                                <span className="rounded-full border border-[#DDE1E9] bg-white px-2.5 py-1 text-[10px] font-semibold capitalize text-[#667085]">
                                  {question.difficulty}
                                </span>
                                <span className="rounded-full border border-[#DDE1E9] bg-white px-2.5 py-1 text-[10px] font-semibold text-[#667085]">
                                  Skill #{question.skill_id}
                                </span>
                                <span className="rounded-full bg-[#F8F8FF] px-2.5 py-1 text-[10px] font-semibold text-[#5658E8]">
                                  {question.question_bank_id == null
                                    ? "Legacy"
                                    : "Banked"}
                                </span>
                              </div>

                              <h3 className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#202938]">
                                {question.question_text}
                              </h3>
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                handleAddQuestionToSection(
                                  question.id
                                )
                              }
                              disabled={
                                addingQuestionId !== null ||
                                !editable
                              }
                              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#5658E8] px-4 text-xs font-semibold text-white hover:bg-[#494BD8] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {addingQuestionId === question.id ? (
                                <>
                                  <RefreshCw
                                    size={14}
                                    className="animate-spin"
                                  />
                                  Adding...
                                </>
                              ) : (
                                <>
                                  <Plus size={14} />
                                  Add to Section
                                </>
                              )}
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      )}

      {isQuestionModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#172033]/55 px-3 py-3 backdrop-blur-[4px] sm:items-center sm:px-4 sm:py-6"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeQuestionModal();
            }
          }}
        >
          <div
            className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-[20px] border border-[#E3E6EB] bg-white shadow-[0_24px_64px_rgba(38,40,79,0.22)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manager-question-modal-title"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between bg-[#26284F] px-6 py-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#A9B9FF]">
                  Question management
                </p>

                <h2
                  id="manager-question-modal-title"
                  className="mt-1 text-[22px] font-semibold text-white"
                >
                  {editingQuestion
                    ? "Edit Question"
                    : "Add Question"}
                </h2>
              </div>

              <button
                type="button"
                onClick={closeQuestionModal}
                disabled={savingQuestion}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.06] text-[#E1E5F2] hover:bg-white/[0.12] disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={handleSaveQuestion}
              className="space-y-5 p-5 sm:p-6"
            >
              {actionError && (
                <div className="flex items-start gap-3 rounded-xl border border-[#E9C8C8] bg-[#FFF8F8] px-4 py-3">
                  <AlertCircle
                    size={16}
                    className="mt-0.5 shrink-0 text-[#A83E3E]"
                  />

                  <p className="text-xs leading-5 text-[#A83E3E]">
                    {actionError}
                  </p>
                </div>
              )}

              <div>
                <label
                  htmlFor="manager-question-text"
                  className="mb-2 block text-[12.5px] font-semibold text-[#344054]"
                >
                  Question text
                </label>

                <textarea
                  id="manager-question-text"
                  value={questionText}
                  onChange={(event) =>
                    setQuestionText(
                      event.target.value
                    )
                  }
                  rows={5}
                  autoFocus
                  placeholder="Enter the question..."
                  className="w-full rounded-lg border border-[#D7DDE6] bg-white px-4 py-3 text-sm leading-6 text-[#202938] outline-none focus:border-[#5658E8] focus:ring-4 focus:ring-[#5658E8]/10"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label
                    htmlFor="manager-question-type"
                    className="mb-2 block text-[12.5px] font-semibold text-[#344054]"
                  >
                    Type
                  </label>

                  <select
                    id="manager-question-type"
                    value={questionType}
                    onChange={(event) => {
                      const value =
                        event.target.value;

                      setQuestionType(value);

                      if (
                        value === "FREE_TEXT"
                      ) {
                        setQuestionOptions([]);
                        setQuestionCorrectAnswer("");
                      } else if (
                        questionOptions.length <
                        2
                      ) {
                        setQuestionOptions([
                          "",
                          "",
                        ]);
                      }
                    }}
                    className="h-11 w-full rounded-lg border border-[#D7DDE6] bg-white px-3 text-sm text-[#202938] outline-none focus:border-[#5658E8]"
                  >
                    <option value="MCQ">
                      MCQ
                    </option>

                    <option value="FREE_TEXT">
                      Free Text
                    </option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="manager-question-skill"
                    className="mb-2 block text-[12.5px] font-semibold text-[#344054]"
                  >
                    Skill
                  </label>

                  <select
                    id="manager-question-skill"
                    value={questionSkillId}
                    onChange={(event) =>
                      setQuestionSkillId(
                        event.target.value
                      )
                    }
                    disabled={
                      skills.length === 0
                    }
                    className="h-11 w-full rounded-lg border border-[#D7DDE6] bg-white px-3 text-sm text-[#202938] outline-none focus:border-[#5658E8] disabled:bg-[#F8F9FC]"
                  >
                    {skills.length === 0 ? (
                      <option value="">
                        No skills available
                      </option>
                    ) : (
                      skills.map(
                        (skill) => (
                          <option
                            key={skill.id}
                            value={skill.id}
                          >
                            {skill.name}
                          </option>
                        )
                      )
                    )}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="manager-question-difficulty"
                    className="mb-2 block text-[12.5px] font-semibold text-[#344054]"
                  >
                    Difficulty
                  </label>

                  <select
                    id="manager-question-difficulty"
                    value={questionDifficulty}
                    onChange={(event) =>
                      setQuestionDifficulty(
                        event.target.value
                      )
                    }
                    className="h-11 w-full rounded-lg border border-[#D7DDE6] bg-white px-3 text-sm text-[#202938] outline-none focus:border-[#5658E8]"
                  >
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

              {questionType ===
                "MCQ" && (
                <div className="rounded-xl border border-[#E3E6EB] bg-[#FAFBFC] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#202938]">
                        Answer options
                      </p>

                      <p className="mt-1 text-xs text-[#98A2B3]">
                        Add choices and select the
                        correct answer.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={
                        addQuestionOption
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#CBD1DC] bg-white px-3 py-2 text-xs font-semibold text-[#5658E8] hover:border-[#5658E8]"
                    >
                      <Plus size={13} />
                      Add option
                    </button>
                  </div>

                  <div className="mt-4 space-y-3">
                    {questionOptions.map(
                      (
                        option,
                        index
                      ) => (
                        <div
                          key={`question-option-${index}`}
                          className="flex items-center gap-3"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#EAE5F9] text-xs font-bold text-[#5658E8]">
                            {String.fromCharCode(
                              65 + index
                            )}
                          </span>

                          <input
                            type="text"
                            value={option}
                            onChange={(event) =>
                              updateQuestionOption(
                                index,
                                event.target.value
                              )
                            }
                            placeholder={`Option ${String.fromCharCode(
                              65 + index
                            )}`}
                            className="h-11 min-w-0 flex-1 rounded-lg border border-[#D7DDE6] bg-white px-3 text-sm text-[#202938] outline-none focus:border-[#5658E8]"
                          />

                          <button
                            type="button"
                            onClick={() =>
                              removeQuestionOption(
                                index
                              )
                            }
                            disabled={
                              questionOptions.length <=
                              2
                            }
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#A83E3E] hover:bg-[#FFF6F6] disabled:opacity-30"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      )
                    )}
                  </div>

                  <div className="mt-5">
                    <label
                      htmlFor="manager-correct-answer"
                      className="mb-2 block text-[12.5px] font-semibold text-[#344054]"
                    >
                      Correct answer
                    </label>

                    <select
                      id="manager-correct-answer"
                      value={
                        questionCorrectAnswer
                      }
                      onChange={(event) =>
                        setQuestionCorrectAnswer(
                          event.target.value
                        )
                      }
                      className="h-11 w-full rounded-lg border border-[#D7DDE6] bg-white px-3 text-sm text-[#202938] outline-none focus:border-[#5658E8]"
                    >
                      <option value="">
                        Select correct answer
                      </option>

                      {questionOptions
                        .filter(
                          (option) =>
                            option.trim()
                        )
                        .map(
                          (
                            option,
                            index
                          ) => (
                            <option
                              key={`${option}-${index}`}
                              value={option}
                            >
                              {String.fromCharCode(
                                65 + index
                              )}{" "}
                              - {option}
                            </option>
                          )
                        )}
                    </select>
                  </div>
                </div>
              )}

              {questionType ===
                "FREE_TEXT" && (
                <div className="rounded-xl border border-[#E3E6EB] bg-[#F8F9FC] px-4 py-3 text-xs leading-5 text-[#667085]">
                  Free-text questions do not
                  require options or an answer key.
                </div>
              )}

              <div className="flex flex-col-reverse gap-3 border-t border-[#EAECF0] pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={
                    closeQuestionModal
                  }
                  disabled={
                    savingQuestion
                  }
                  className="h-11 rounded-lg border border-[#CBD1DC] bg-white px-5 text-sm font-semibold text-[#475467] hover:border-[#5658E8] hover:text-[#5658E8] disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={
                    savingQuestion ||
                    skills.length === 0
                  }
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#5658E8] px-5 text-sm font-semibold text-white hover:bg-[#494BD8] disabled:opacity-50"
                >
                  {savingQuestion ? (
                    <>
                      <RefreshCw
                        size={15}
                        className="animate-spin"
                      />
                      Saving...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={15} />
                      {editingQuestion
                        ? "Save Changes"
                        : "Add Question"}
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

function SummaryCard({
  icon,
  label,
  value,
  description,
}) {
  return (
    <div className="relative overflow-hidden rounded-[20px] border border-[#DDE1E9] bg-white p-5 shadow-[0_10px_28px_rgba(38,40,79,0.03)]">
      <div className="absolute inset-x-0 top-0 h-1 bg-[#EAE5F9]" />

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#98A2B3]">
            {label}
          </p>

          <p className="mt-3 text-[30px] font-semibold tracking-[-0.03em] text-[#202938]">
            {value}
          </p>

          <p className="mt-2 text-[11px] leading-5 text-[#98A2B3]">
            {description}
          </p>
        </div>

        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F4F1FF] text-[#5658E8]">
          {icon}
        </div>
      </div>
    </div>
  );
}

export default ManagerQuestionSetQuestions;