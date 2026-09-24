import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  Filter,
  RefreshCw,
  Search,
  AlertCircle,
  Plus,
  X,
  Trash2,
  CheckCircle2,
  FileQuestion,
  Pencil,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import RecruiterLayout from "../layouts/RecruiterLayout";

function QuestionBank() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [questions, setQuestions] = useState([]);
  const [skills, setSkills] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState("");
  const [skillsError, setSkillsError] = useState("");
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");

  const [search, setSearch] = useState("");
  const [questionType, setQuestionType] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [skillId, setSkillId] = useState("all");

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [creatingQuestion, setCreatingQuestion] = useState(false);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [updatingQuestion, setUpdatingQuestion] = useState(false);

  const [newQuestionText, setNewQuestionText] = useState("");
  const [newQuestionType, setNewQuestionType] = useState("MCQ");
  const [newQuestionSkillId, setNewQuestionSkillId] = useState("");
  const [newQuestionDifficulty, setNewQuestionDifficulty] =
    useState("medium");
  const [newQuestionOptions, setNewQuestionOptions] = useState([
    "",
    "",
  ]);
  const [newQuestionCorrectAnswer, setNewQuestionCorrectAnswer] =
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

  const loadQuestions = async (showRefreshState = false) => {
    try {
      setError("");

      if (showRefreshState) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const params = {};

      if (skillId !== "all") {
        params.skill_id = Number(skillId);
      }

      if (questionType !== "all") {
        params.question_type = questionType;
      }

      if (difficulty !== "all") {
        params.difficulty = difficulty;
      }

      const response = await api.get("/questions", {
        params,
      });

      setQuestions(
        Array.isArray(response.data)
          ? response.data
          : []
      );
    } catch (err) {
      console.error("Failed to load questions:", err);

      if (
        err.response?.status === 401 ||
        err.response?.status === 403
      ) {
        logout();
        navigate("/login", { replace: true });
        return;
      }

      setError(
        getErrorMessage(
          err,
          "Unable to load the question bank."
        )
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadSkills = async () => {
    try {
      setSkillsError("");

      const response = await api.get("/skills");

      const skillData = Array.isArray(response.data)
        ? response.data
        : [];

      const sortedSkills = skillData.sort((a, b) =>
        String(a.name || "").localeCompare(
          String(b.name || ""),
          undefined,
          {
            sensitivity: "base",
          }
        )
      );

      setSkills(sortedSkills);

      if (sortedSkills.length > 0) {
        setNewQuestionSkillId(
          String(sortedSkills[0].id)
        );
      }
    } catch (err) {
      console.error("Failed to load skills:", err);

      if (
        err.response?.status === 401 ||
        err.response?.status === 403
      ) {
        logout();
        navigate("/login", { replace: true });
        return;
      }

      setSkillsError(
        getErrorMessage(err, "Unable to load skills.")
      );
    }
  };

  useEffect(() => {
    loadSkills();
  }, []);

  useEffect(() => {
    loadQuestions();
  }, [skillId, questionType, difficulty]);

  useEffect(() => {
    const modalOpen = isCreateModalOpen || isEditModalOpen;

    if (!modalOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    const handleEscape = (event) => {
      if (event.key !== "Escape") {
        return;
      }

      if (creatingQuestion || updatingQuestion) {
        return;
      }

      if (isCreateModalOpen) {
        setIsCreateModalOpen(false);
        resetCreateForm();
        return;
      }

      if (isEditModalOpen) {
        setIsEditModalOpen(false);
        setEditingQuestion(null);
        resetCreateForm();
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [
    isCreateModalOpen,
    isEditModalOpen,
    creatingQuestion,
    updatingQuestion,
  ]);

  const filteredQuestions = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return questions.filter((question) => {
      if (!normalizedSearch) {
        return true;
      }

      return question.question_text
        ?.toLowerCase()
        .includes(normalizedSearch);
    });
  }, [questions, search]);

  const mcqCount = questions.filter(
    (question) =>
      question.question_type?.toUpperCase() === "MCQ"
  ).length;

  const freeTextCount = questions.filter(
    (question) =>
      question.question_type?.toUpperCase() === "FREE_TEXT"
  ).length;

  const clearFilters = () => {
    setSearch("");
    setSkillId("all");
    setQuestionType("all");
    setDifficulty("all");
  };

  const resetCreateForm = () => {
    setNewQuestionText("");
    setNewQuestionType("MCQ");
    setNewQuestionDifficulty("medium");
    setNewQuestionOptions(["", ""]);
    setNewQuestionCorrectAnswer("");
    setCreateError("");

    if (skills.length > 0) {
      setNewQuestionSkillId(String(skills[0].id));
    } else {
      setNewQuestionSkillId("");
    }
  };

  const openCreateModal = () => {
    setCreateError("");
    setCreateSuccess("");

    if (!newQuestionSkillId && skills.length > 0) {
      setNewQuestionSkillId(String(skills[0].id));
    }

    setIsCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    if (creatingQuestion) {
      return;
    }

    setIsCreateModalOpen(false);
    resetCreateForm();
  };

  const updateQuestionOption = (index, value) => {
    setNewQuestionOptions((current) =>
      current.map((option, optionIndex) =>
        optionIndex === index ? value : option
      )
    );
  };

  const addQuestionOption = () => {
    setNewQuestionOptions((current) => [
      ...current,
      "",
    ]);
  };

  const removeQuestionOption = (index) => {
    setNewQuestionOptions((current) =>
      current.filter(
        (_, optionIndex) => optionIndex !== index
      )
    );

    setNewQuestionCorrectAnswer((current) => {
      const removedOption =
        newQuestionOptions[index] || "";

      return current === removedOption ? "" : current;
    });
  };

  const openEditModal = (question) => {
    setCreateError("");
    setCreateSuccess("");
    setEditingQuestion(question);
    setNewQuestionText(question.question_text || "");
    setNewQuestionType(
      question.question_type?.toUpperCase() || "MCQ"
    );
    setNewQuestionSkillId(
      question.skill_id != null
        ? String(question.skill_id)
        : skills.length > 0
          ? String(skills[0].id)
          : ""
    );
    setNewQuestionDifficulty(
      question.difficulty?.toLowerCase() || "medium"
    );
    setNewQuestionOptions(
      Array.isArray(question.options) && question.options.length > 0
        ? question.options.map((option) => String(option))
        : ["", ""]
    );
    setNewQuestionCorrectAnswer(question.correct_answer || "");
    setIsEditModalOpen(true);
  };

  const closeEditModal = () => {
    if (updatingQuestion) {
      return;
    }

    setIsEditModalOpen(false);
    setEditingQuestion(null);
    resetCreateForm();
  };

  const handleUpdateQuestion = async (event) => {
    event.preventDefault();

    if (!editingQuestion) {
      return;
    }

    setCreateError("");
    setCreateSuccess("");

    const questionText = newQuestionText.trim();
    const selectedSkillId = Number(newQuestionSkillId);

    if (!questionText) {
      setCreateError("Question text is required.");
      return;
    }

    if (!newQuestionSkillId || !Number.isInteger(selectedSkillId)) {
      setCreateError("Please select a skill.");
      return;
    }

    let options = [];
    let correctAnswer = null;

    if (newQuestionType === "MCQ") {
      options = newQuestionOptions
        .map((option) => option.trim())
        .filter(Boolean);

      if (options.length < 2) {
        setCreateError("MCQ questions require at least two options.");
        return;
      }

      const normalizedOptions = options.map((option) =>
        option.toLowerCase()
      );
      const normalizedCorrectAnswer =
        newQuestionCorrectAnswer.trim().toLowerCase();

      if (!normalizedCorrectAnswer) {
        setCreateError("Please select the correct answer.");
        return;
      }

      if (!normalizedOptions.includes(normalizedCorrectAnswer)) {
        setCreateError(
          "The correct answer must match one of the options."
        );
        return;
      }

      correctAnswer = options[
        normalizedOptions.indexOf(normalizedCorrectAnswer)
      ];
    }

    const payload = {
      question_text: questionText,
      question_type: newQuestionType,
      skill_id: selectedSkillId,
      difficulty: newQuestionDifficulty,
      options,
      correct_answer: correctAnswer,
    };

    setUpdatingQuestion(true);

    try {
      await api.put(`/questions/${editingQuestion.id}`, payload);

      setCreateSuccess("Question updated successfully.");

      await loadQuestions(true);

      setIsEditModalOpen(false);
      setEditingQuestion(null);
      resetCreateForm();
    } catch (err) {
      console.error("Failed to update question:", err);

      if (err.response?.status === 401 || err.response?.status === 403) {
        logout();
        navigate("/login", { replace: true });
        return;
      }

      setCreateError(
        getErrorMessage(err, "Unable to update the question.")
      );
    } finally {
      setUpdatingQuestion(false);
    }
  };

  const handleCreateQuestion = async (event) => {
    event.preventDefault();

    setCreateError("");
    setCreateSuccess("");

    const questionText = newQuestionText.trim();
    const selectedSkillId = Number(newQuestionSkillId);

    if (!questionText) {
      setCreateError("Question text is required.");
      return;
    }

    if (!newQuestionSkillId || !Number.isInteger(selectedSkillId)) {
      setCreateError("Please select a skill.");
      return;
    }

    let options = [];
    let correctAnswer = null;

    if (newQuestionType === "MCQ") {
      options = newQuestionOptions
        .map((option) => option.trim())
        .filter(Boolean);

      if (options.length < 2) {
        setCreateError(
          "MCQ questions require at least two options."
        );
        return;
      }

      const normalizedOptions = options.map((option) =>
        option.toLowerCase()
      );

      const normalizedCorrectAnswer =
        newQuestionCorrectAnswer.trim().toLowerCase();

      if (!normalizedCorrectAnswer) {
        setCreateError("Please select the correct answer.");
        return;
      }

      if (!normalizedOptions.includes(normalizedCorrectAnswer)) {
        setCreateError(
          "The correct answer must match one of the options."
        );
        return;
      }

      correctAnswer = options[
        normalizedOptions.indexOf(normalizedCorrectAnswer)
      ];
    }

    const payload = {
      question_text: questionText,
      question_type: newQuestionType,
      skill_id: selectedSkillId,
      difficulty: newQuestionDifficulty,
      options,
      correct_answer: correctAnswer,
    };

    setCreatingQuestion(true);

    try {
      await api.post("/questions", payload);

      setCreateSuccess(
        "Question created successfully and added to the question bank."
      );

      await loadQuestions(true);

      setIsCreateModalOpen(false);
      resetCreateForm();
    } catch (err) {
      console.error("Failed to create question:", err);

      if (
        err.response?.status === 401 ||
        err.response?.status === 403
      ) {
        logout();
        navigate("/login", { replace: true });
        return;
      }

      setCreateError(
        getErrorMessage(
          err,
          "Unable to create the question."
        )
      );
    } finally {
      setCreatingQuestion(false);
    }
  };

  return (
    <RecruiterLayout
      title="Question Bank"
      breadcrumb="Workspace / Question Bank"
    >
      <div className="mx-auto max-w-[1500px] space-y-6 pb-12 text-[#202938]">

        {/* =====================================================
            PAGE HEADER
        ===================================================== */}
        <section className="relative overflow-hidden rounded-[18px] border border-[#E3E6EB] bg-white px-5 py-6 shadow-[0_8px_24px_rgba(27,37,58,0.035)] sm:px-7 sm:py-7 lg:px-9 lg:py-9">

          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[#CFDEFC]/45 blur-[70px]" />
          <div className="pointer-events-none absolute right-20 top-10 h-28 w-28 rounded-full bg-[#EAE5F9]/55 blur-[35px]" />
          <div className="pointer-events-none absolute bottom-[-60px] right-[20%] h-40 w-40 rounded-full bg-[#F3E3F2]/55 blur-[50px]" />

          <div className="relative flex flex-col gap-4 sm:gap-5 lg:flex-row lg:items-center lg:justify-between">

            <div className="max-w-3xl">

              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#D9DEE7] bg-[#FAFBFC] px-3 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#5658E8]" />
                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#667085]">
                  Question management
                </span>
              </div>

              <h1 className="text-[29px] font-semibold leading-[1.08] tracking-[-0.035em] text-[#182033] sm:text-[34px] lg:text-[40px]">
                Question Bank
              </h1>

              <p className="mt-2.5 max-w-2xl text-[12.5px] leading-6 text-[#667085] sm:text-[12.5px]">
                Browse, manage, and organize screening questions by skill,
                question type, and difficulty.
              </p>

            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:gap-3">

              <button
                type="button"
                onClick={() => loadQuestions(true)}
                disabled={refreshing}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[#C9D0DC] bg-white px-4 text-sm font-semibold text-[#475467] transition duration-200 hover:-translate-y-0.5 hover:border-[#5658E8] hover:text-[#5658E8] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                <RefreshCw
                  size={15}
                  className={refreshing ? "animate-spin" : ""}
                />
                Refresh
              </button>

              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#5658E8] px-5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(86,88,232,0.16)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#4C4EDC] sm:w-auto"
              >
                <Plus size={16} />
                Add Question
              </button>

            </div>
          </div>
        </section>

        {createSuccess && (
          <div className="flex items-start gap-3 rounded-[18px] border border-[#CFE4D9] bg-[#F5FAF7] px-4 py-3.5 shadow-[0_6px_18px_rgba(40,115,78,0.035)]">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#E2F3EA] text-[#28734E]">
              <CheckCircle2 size={16} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#28734E]">
                Update successful
              </p>
              <p className="mt-0.5 text-xs leading-5 text-[#4B7D63]">
                {createSuccess}
              </p>
            </div>
          </div>
        )}

        {/* =====================================================
            SUMMARY
        ===================================================== */}
        <section className="grid gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">

          <div className="relative overflow-hidden rounded-[18px] border border-[#E3E6EB] bg-white p-5 shadow-[0_8px_26px_rgba(27,37,58,0.035)]">
            <div className="absolute inset-x-0 top-0 h-0.5 bg-[#9FB1FE]" />

            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#8A94A8]">
                  Question library
                </p>
                <p className="mt-3 text-sm font-medium text-[#667085]">
                  Total questions
                </p>
                <p className="mt-1 text-[34px] font-semibold tracking-[-0.03em] text-[#182033]">
                  {questions.length}
                </p>
              </div>

              <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#CFDEFC] text-[#4A61C8]">
                <BookOpen size={19} />
              </div>
            </div>

            <p className="mt-4 text-xs text-[#98A2B3]">
              Available screening content in the workspace.
            </p>
          </div>

          <div className="relative overflow-hidden rounded-[18px] border border-[#E3E6EB] bg-white p-5 shadow-[0_8px_26px_rgba(27,37,58,0.035)]">
            <div className="absolute inset-x-0 top-0 h-0.5 bg-[#D4C6F8]" />

            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#8A94A8]">
                  Objective content
                </p>
                <p className="mt-3 text-sm font-medium text-[#667085]">
                  MCQ
                </p>
                <p className="mt-1 text-[34px] font-semibold tracking-[-0.03em] text-[#182033]">
                  {mcqCount}
                </p>
              </div>

              <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#EAE5F9] text-[#7862C8]">
                <FileQuestion size={19} />
              </div>
            </div>

            <p className="mt-4 text-xs text-[#98A2B3]">
              Questions with structured answer options.
            </p>
          </div>

          <div className="relative overflow-hidden rounded-[18px] border border-[#E3E6EB] bg-white p-5 shadow-[0_8px_26px_rgba(27,37,58,0.035)]">
            <div className="absolute inset-x-0 top-0 h-0.5 bg-[#EDBFE5]" />

            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#8A94A8]">
                  Open response
                </p>
                <p className="mt-3 text-sm font-medium text-[#667085]">
                  Free Text
                </p>
                <p className="mt-1 text-[34px] font-semibold tracking-[-0.03em] text-[#182033]">
                  {freeTextCount}
                </p>
              </div>

              <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#F3E3F2] text-[#AA5E9C]">
                <FileQuestion size={19} />
              </div>
            </div>

            <p className="mt-4 text-xs text-[#98A2B3]">
              Questions designed for written responses.
            </p>
          </div>

        </section>

        {/* =====================================================
            FILTERS
        ===================================================== */}
        <section className="rounded-[18px] border border-[#E3E6EB] bg-white p-4 shadow-[0_8px_26px_rgba(27,37,58,0.035)] sm:p-6">

          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#5658E8]">
                Workspace
              </p>
              <div className="mt-1 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#F3F2FF] text-[#5658E8]">
                  <Filter size={15} />
                </span>
                <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-[#182033]">
                  Filter questions
                </h2>
              </div>
            </div>

            <button
              type="button"
              onClick={clearFilters}
              className="self-start rounded-md px-2 py-1 text-xs font-semibold text-[#5658E8] transition hover:bg-[#F3F2FF] sm:self-auto"
            >
              Clear filters
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_220px_180px_180px]">

            <div className="md:col-span-2 xl:col-span-1">
              <label
                htmlFor="question-search"
                className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#667085]"
              >
                Search
              </label>
              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#98A2B3]"
                />
                <input
                  id="question-search"
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search question text..."
                  className="h-11 w-full rounded-md border border-[#D4DAE4] bg-[#F8F9FC] pl-10 pr-4 text-sm text-[#202938] outline-none transition placeholder:text-[#98A2B3] hover:border-[#C4CAD6] focus:border-[#5658E8] focus:bg-white focus:ring-4 focus:ring-[#5658E8]/10"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="question-skill-filter"
                className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#667085]"
              >
                Skill
              </label>
              <select
                id="question-skill-filter"
                value={skillId}
                onChange={(e) => setSkillId(e.target.value)}
                className="h-11 w-full rounded-md border border-[#D4DAE4] bg-[#F8F9FC] px-3 text-sm text-[#202938] outline-none transition hover:border-[#C4CAD6] focus:border-[#5658E8] focus:bg-white focus:ring-4 focus:ring-[#5658E8]/10"
              >
                <option value="all">All Skills</option>
                {skills.map((skill) => (
                  <option key={skill.id} value={skill.id}>
                    {skill.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="question-type-filter"
                className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#667085]"
              >
                Type
              </label>
              <select
                id="question-type-filter"
                value={questionType}
                onChange={(e) => setQuestionType(e.target.value)}
                className="h-11 w-full rounded-md border border-[#D4DAE4] bg-[#F8F9FC] px-3 text-sm text-[#202938] outline-none transition hover:border-[#C4CAD6] focus:border-[#5658E8] focus:bg-white focus:ring-4 focus:ring-[#5658E8]/10"
              >
                <option value="all">All Types</option>
                <option value="MCQ">MCQ</option>
                <option value="FREE_TEXT">Free Text</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="question-difficulty-filter"
                className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#667085]"
              >
                Difficulty
              </label>
              <select
                id="question-difficulty-filter"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="h-11 w-full rounded-md border border-[#D4DAE4] bg-[#F8F9FC] px-3 text-sm text-[#202938] outline-none transition hover:border-[#C4CAD6] focus:border-[#5658E8] focus:bg-white focus:ring-4 focus:ring-[#5658E8]/10"
              >
                <option value="all">All Difficulties</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>

          {skillsError && (
            <p className="mt-3 text-xs text-[#A83E3E]">
              {skillsError}
            </p>
          )}
        </section>

        {/* =====================================================
            QUESTION LIST
        ===================================================== */}
        <section>

          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#5658E8]">
                Question library
              </p>

              <h2 className="mt-2 text-[25px] font-semibold tracking-[-0.025em] text-[#182033]">
                Available questions
              </h2>

              <p className="mt-2 text-sm leading-6 text-[#667085]">
                Review and manage the questions currently available in the bank.
              </p>
            </div>

            {!loading && !error && (
              <div className="rounded-full bg-[#F4F5F8] px-3 py-1.5 text-[10px] font-semibold text-[#667085]">
                {filteredQuestions.length} {filteredQuestions.length === 1 ? "question" : "questions"}
              </div>
            )}
          </div>

          {loading ? (
            <div className="overflow-hidden rounded-[18px] border border-[#E3E6EB] bg-white shadow-[0_8px_26px_rgba(27,37,58,0.035)]">
              <div className="flex items-center justify-between border-b border-[#EAECF0] px-5 py-4 sm:px-6">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 animate-pulse rounded-md bg-[#EEF1F6]" />
                  <div>
                    <div className="h-3 w-28 animate-pulse rounded bg-[#EEF1F6]" />
                    <div className="mt-2 h-2.5 w-44 animate-pulse rounded bg-[#F3F4F7]" />
                  </div>
                </div>
                <div className="h-8 w-20 animate-pulse rounded-md bg-[#F3F4F7]" />
              </div>

              <div className="space-y-0 divide-y divide-[#EEF0F3]">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="grid md:grid-cols-[64px_minmax(0,1fr)] lg:grid-cols-[72px_minmax(0,1fr)_225px]">
                    <div className="flex items-center justify-center border-b border-[#EEF0F3] bg-[#FAFBFC] px-4 py-6 lg:border-b-0 lg:border-r">
                      <div className="h-10 w-10 animate-pulse rounded-md bg-[#EEF1F6]" />
                    </div>
                    <div className="min-w-0 p-4 sm:p-5 lg:p-6">
                      <div className="flex flex-wrap gap-2">
                        <div className="h-6 w-16 animate-pulse rounded-full bg-[#F0F2F5]" />
                        <div className="h-6 w-20 animate-pulse rounded-full bg-[#F0F2F5]" />
                        <div className="h-6 w-24 animate-pulse rounded-full bg-[#F0F2F5]" />
                      </div>
                      <div className="mt-4 h-4 w-[82%] animate-pulse rounded bg-[#EEF1F6]" />
                      <div className="mt-2 h-4 w-[68%] animate-pulse rounded bg-[#F3F4F7]" />
                      <div className="mt-5 h-3 w-32 animate-pulse rounded bg-[#F3F4F7]" />
                    </div>
                    <div className="hidden border-l border-[#EEF0F3] bg-[#FCFCFD] p-5 lg:block">
                      <div className="h-3 w-24 animate-pulse rounded bg-[#EEF1F6]" />
                      <div className="mt-4 h-3 w-32 animate-pulse rounded bg-[#F3F4F7]" />
                      <div className="mt-3 h-8 w-full animate-pulse rounded-md bg-[#F3F4F7]" />
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-[#EAECF0] bg-[#FAFBFC] px-5 py-3.5 sm:px-6">
                <div className="flex items-center gap-2 text-xs text-[#98A2B3]">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[#B9BCE0]" />
                  Loading question bank...
                </div>
              </div>
            </div>
          ) : error ? (
            <div className="rounded-[18px] border border-[#E9C8C8] bg-[#FFF8F8] p-6 shadow-[0_8px_24px_rgba(168,62,62,0.035)] sm:p-7">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#FBE9E9] text-[#A83E3E]">
                    <AlertCircle size={19} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#8F3636]">
                      Question bank unavailable
                    </p>
                    <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[#A83E3E]">
                      {error}
                    </p>
                    <p className="mt-2 text-xs text-[#B56A6A]">
                      Check the connection and try loading the question bank again.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => loadQuestions()}
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-[#5658E8] px-4 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(86,88,232,0.13)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#4C4EDC] focus:outline-none focus:ring-4 focus:ring-[#5658E8]/10"
                >
                  <RefreshCw size={14} />
                  Try again
                </button>
              </div>
            </div>
          ) : filteredQuestions.length === 0 ? (
            <div className="rounded-[18px] border border-dashed border-[#C9CEDB] bg-white p-8 text-center shadow-[0_8px_24px_rgba(27,37,58,0.025)] sm:p-10">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-md bg-[#EEF0FF] text-[#5658E8]">
                <BookOpen size={23} />
              </div>

              <h3 className="mt-4 text-lg font-semibold text-[#202938]">
                {search || skillId !== "all" || questionType !== "all" || difficulty !== "all"
                  ? "No questions match your filters"
                  : "Your question bank is empty"}
              </h3>

              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#98A2B3]">
                {search || skillId !== "all" || questionType !== "all" || difficulty !== "all"
                  ? "Try clearing one or more filters, or search using a different term."
                  : "Create the first screening question to start building your reusable question library."}
              </p>

              {search || skillId !== "all" || questionType !== "all" || difficulty !== "all" ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-5 inline-flex items-center gap-2 rounded-md border border-[#D6DAE3] bg-white px-4 py-2.5 text-sm font-semibold text-[#475467] transition duration-200 hover:border-[#5658E8] hover:text-[#5658E8] focus:outline-none focus:ring-4 focus:ring-[#5658E8]/10"
                >
                  <X size={15} />
                  Clear filters
                </button>
              ) : (
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="mt-5 inline-flex items-center gap-2 rounded-md bg-[#5658E8] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(86,88,232,0.12)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#4C4EDC] focus:outline-none focus:ring-4 focus:ring-[#5658E8]/10"
                >
                  <Plus size={15} />
                  Add Question
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredQuestions.map((question, index) => {
                const skillName =
                  skills.find((skill) => skill.id === question.skill_id)?.name || "—";
                const typeLabel =
                  question.question_type?.replace("_", " ").toUpperCase() || "—";
                const difficultyLabel =
                  question.difficulty || "medium";

                const difficultyClasses =
                  difficultyLabel === "easy"
                    ? "bg-[#EAF7F0] text-[#28734E]"
                    : difficultyLabel === "hard"
                      ? "bg-[#FAEDEA] text-[#A76D5B]"
                      : "bg-[#EAE5F9] text-[#7862C8]";

                return (
                  <article
                    key={question.id}
                    className="group overflow-hidden rounded-[18px] border border-[#E3E6EB] bg-white shadow-[0_6px_20px_rgba(27,37,58,0.028)] transition duration-200 hover:-translate-y-0.5 hover:border-[#C9CCF7] hover:shadow-[0_12px_28px_rgba(27,37,58,0.065)]"
                  >
                    <div className="grid md:grid-cols-[64px_minmax(0,1fr)] lg:grid-cols-[72px_minmax(0,1fr)_225px]">

                      <div className="flex items-center justify-center border-b border-[#E8EBEF] bg-[#F8F9FC] px-4 py-4 md:border-b-0 md:border-r lg:px-4 lg:py-5">
                        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#CFDEFC] text-[#4A61C8] transition duration-200 group-hover:scale-105">
                          <span className="text-xs font-bold">
                            Q{index + 1}
                          </span>
                        </div>
                      </div>

                      <div className="min-w-0 p-4 sm:p-5 lg:p-6">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-[#F4F5F8] px-2.5 py-1 text-[10px] font-semibold text-[#667085]">
                              {typeLabel}
                            </span>
                            <span
                              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize ${difficultyClasses}`}
                            >
                              {difficultyLabel}
                            </span>
                            <span className="rounded-full bg-[#F3E3F2] px-2.5 py-1 text-[10px] font-semibold text-[#AA5E9C]">
                              {skillName}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => openEditModal(question)}
                            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-[#D6DAE3] bg-white px-3 text-xs font-semibold text-[#475467] opacity-95 transition duration-200 hover:border-[#5658E8] hover:text-[#5658E8] focus:outline-none focus:ring-4 focus:ring-[#5658E8]/10"
                            aria-label={`Edit question ${index + 1}`}
                          >
                            <Pencil size={13} />
                            Edit
                          </button>
                        </div>

                        <h3 className="mt-4 text-[17px] font-semibold leading-7 tracking-[-0.012em] text-[#202938]">
                          {question.question_text}
                        </h3>

                        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] text-[#98A2B3]">
                          <span>Question ID: {question.id}</span>
                          <span>Skill ID: {question.skill_id}</span>
                        </div>

                        {Array.isArray(question.options) && question.options.length > 0 && (
                          <div className="mt-5 border-t border-[#E9EBEF] pt-4">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#98A2B3]">
                                Options
                              </p>
                              <span className="text-[10px] font-medium text-[#98A2B3]">
                                {question.options.length} choices
                              </span>
                            </div>

                            <div className="mt-3 grid gap-2 md:grid-cols-2">
                              {question.options.map((option, optionIndex) => (
                                <div
                                  key={`${question.id}-${optionIndex}`}
                                  className="rounded-md border border-[#E6E9EE] bg-[#FCFCFD] px-3 py-2.5 text-sm text-[#667085] transition duration-150 group-hover:bg-white"
                                >
                                  <span className="mr-2 font-semibold text-[#5658E8]">
                                    {String.fromCharCode(65 + optionIndex)}.
                                  </span>
                                  {option}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="border-t border-[#E8EBEF] bg-[#FAFBFC] p-4 sm:p-5 md:col-span-2 lg:col-span-1 lg:border-l lg:border-t-0">
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

                        <div className="mt-5 border-t border-[#E8EBEF] pt-4">
                          <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#98A2B3]">
                            Question type
                          </p>
                          <p className="mt-1.5 text-xs font-semibold text-[#475467]">
                            {typeLabel}
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

        {/* Create Question Modal */}
        {isCreateModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-[#172033]/55 px-3 py-3 backdrop-blur-[4px] sm:items-center sm:px-4 sm:py-6"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                closeCreateModal();
              }
            }}
          >
            <div
              className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-[18px] border border-[#E3E6EB] bg-white shadow-[0_24px_64px_rgba(38,40,79,0.22)] sm:rounded-[18px]"
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-question-title"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#26284F] px-4 py-4 sm:px-6 sm:py-4.5">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#A9B9FF]">
                    Question management
                  </p>

                  <h2
                    id="create-question-title"
                    className="mt-1 font-display text-[22px] font-semibold tracking-[-0.02em] text-white"
                  >
                    Add a question
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={closeCreateModal}
                  disabled={creatingQuestion}
                  aria-label="Close"
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.06] text-[#E1E5F2] transition hover:bg-white/[0.12] hover:text-white focus:outline-none focus:ring-2 focus:ring-white/30 disabled:opacity-50"
                >
                  <X size={18} />
                </button>
              </div>

              <form
                onSubmit={handleCreateQuestion}
                className="space-y-5 p-4 sm:p-6 sm:pb-7"
              >
                {createError && (
                  <div className="flex items-start gap-3 rounded-md border border-[#E9C8C8] bg-[#FBF2F2] px-4 py-3 text-[12.5px] leading-5 text-[#A83E3E]">
                    <AlertCircle
                      size={17}
                      className="mt-0.5 shrink-0"
                    />

                    <span>{createError}</span>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="question-text"
                    className="mb-2 block text-[12.5px] font-semibold text-[#344054]"
                  >
                    Question text
                  </label>

                  <textarea
                    id="question-text"
                    value={newQuestionText}
                    onChange={(event) =>
                      setNewQuestionText(
                        event.target.value
                      )
                    }
                    autoFocus
                    rows={4}
                    placeholder="Enter the question..."
                    className="w-full rounded-md border border-[#D7DDE6] bg-[#F8F9FC] px-4 py-3 text-sm leading-6 text-[#202938] outline-none transition placeholder:text-[#98A2B3] focus:border-[#5658E8] focus:bg-white focus:ring-4 focus:ring-[#5658E8]/10"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label
                      htmlFor="question-type"
                      className="mb-2 block text-[12.5px] font-semibold text-[#344054]"
                    >
                      Question type
                    </label>

                    <select
                      id="question-type"
                      value={newQuestionType}
                      onChange={(event) => {
                        const value =
                          event.target.value;

                        setNewQuestionType(value);

                        if (value === "FREE_TEXT") {
                          setNewQuestionOptions([]);
                          setNewQuestionCorrectAnswer("");
                        } else if (
                          newQuestionOptions.length < 2
                        ) {
                          setNewQuestionOptions([
                            "",
                            "",
                          ]);
                        }
                      }}
                      className="h-11 w-full rounded-md border border-[#D7DDE6] bg-white px-3 text-sm text-[#202938] outline-none transition focus:border-[#5658E8] focus:ring-4 focus:ring-[#5658E8]/10"
                    >
                      <option value="MCQ">MCQ</option>
                      <option value="FREE_TEXT">
                        Free Text
                      </option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="question-skill"
                      className="mb-2 block text-[12.5px] font-semibold text-[#344054]"
                    >
                      Skill
                    </label>

                    <select
                      id="question-skill"
                      value={newQuestionSkillId}
                      onChange={(event) =>
                        setNewQuestionSkillId(
                          event.target.value
                        )
                      }
                      disabled={skills.length === 0}
                      className="h-11 w-full rounded-md border border-[#D7DDE6] bg-white px-3 text-sm text-[#202938] outline-none transition focus:border-[#5658E8] focus:ring-4 focus:ring-[#5658E8]/10 disabled:bg-[#F8F9FC] disabled:text-[#98A2B3]"
                    >
                      {skills.length === 0 ? (
                        <option value="">
                          No skills available
                        </option>
                      ) : (
                        skills.map((skill) => (
                          <option
                            key={skill.id}
                            value={skill.id}
                          >
                            {skill.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="question-difficulty"
                      className="mb-2 block text-[12.5px] font-semibold text-[#344054]"
                    >
                      Difficulty
                    </label>

                    <select
                      id="question-difficulty"
                      value={newQuestionDifficulty}
                      onChange={(event) =>
                        setNewQuestionDifficulty(
                          event.target.value
                        )
                      }
                      className="h-11 w-full rounded-md border border-[#D7DDE6] bg-white px-3 text-sm text-[#202938] outline-none transition focus:border-[#5658E8] focus:ring-4 focus:ring-[#5658E8]/10"
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>
                </div>

                {newQuestionType === "MCQ" && (
                  <div className="rounded-md border border-[#E3E6EB] bg-[#FAFBFC] p-4.5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold text-[#202938]">
                          Answer options
                        </h3>

                        <p className="mt-1 text-xs text-[#98A2B3]">
                          Add at least two options and select the correct answer.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={addQuestionOption}
                        className="inline-flex items-center gap-1.5 rounded-md border border-[#B8C0CB] bg-white px-3 py-2 text-xs font-semibold text-[#5658E8] transition hover:border-[#5658E8] hover:bg-[#F8F8FF] focus:outline-none focus:ring-2 focus:ring-[#5658E8]/20"
                      >
                        <Plus size={14} />
                        Add option
                      </button>
                    </div>

                    <div className="mt-4 space-y-3">
                      {newQuestionOptions.map(
                        (option, index) => (
                          <div
                            key={`new-option-${index}`}
                            className="flex items-center gap-3"
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#D8D1F0] bg-[#EAE5F9] text-xs font-semibold text-[#5658E8]">
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
                              className="h-11 min-w-0 flex-1 rounded-md border border-[#D7DDE6] bg-white px-3 text-sm text-[#202938] outline-none transition placeholder:text-[#98A2B3] focus:border-[#5658E8] focus:ring-4 focus:ring-[#5658E8]/10"
                            />

                            <button
                              type="button"
                              onClick={() =>
                                removeQuestionOption(
                                  index
                                )
                              }
                              disabled={
                                newQuestionOptions.length <=
                                2
                              }
                              aria-label={`Remove option ${String.fromCharCode(
                                65 + index
                              )}`}
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-[#9A6B6B] transition hover:bg-[#FFF6F6] hover:text-[#A83E3E] focus:outline-none focus:ring-2 focus:ring-[#A83E3E]/15 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )
                      )}
                    </div>

                    <div className="mt-5">
                      <label
                        htmlFor="correct-answer"
                        className="mb-2 block text-[12.5px] font-semibold text-[#344054]"
                      >
                        Correct answer
                      </label>

                      <select
                        id="correct-answer"
                        value={newQuestionCorrectAnswer}
                        onChange={(event) =>
                          setNewQuestionCorrectAnswer(
                            event.target.value
                          )
                        }
                        className="h-11 w-full rounded-md border border-[#D7DDE6] bg-white px-3 text-sm text-[#202938] outline-none transition focus:border-[#5658E8] focus:ring-4 focus:ring-[#5658E8]/10"
                      >
                        <option value="">
                          Select correct answer
                        </option>

                        {newQuestionOptions
                          .filter((option) => option.trim())
                          .map((option, index) => (
                            <option
                              key={`${option}-${index}`}
                              value={option}
                            >
                              {String.fromCharCode(
                                65 +
                                  newQuestionOptions.indexOf(
                                    option
                                  )
                              )}
                              {" - "}
                              {option}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                )}

                {newQuestionType === "FREE_TEXT" && (
                  <div className="rounded-md border border-[#E3E6EB] bg-[#F8F9FC] px-4 py-3 text-[12.5px] leading-5 text-[#667085]">
                    Free-text questions do not require options or an answer key.
                  </div>
                )}

                <div className="flex flex-col-reverse gap-3 border-t border-[#E4E7EC] pt-5 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={closeCreateModal}
                    disabled={creatingQuestion}
                    className="h-11 rounded-md border border-[#B8C0CB] bg-white px-5 text-sm font-medium text-[#667085] transition hover:border-[#5658E8] hover:bg-[#F8F8FF] hover:text-[#5658E8] focus:outline-none focus:ring-2 focus:ring-[#5658E8]/15 disabled:opacity-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={
                      creatingQuestion ||
                      skills.length === 0
                    }
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#5658E8] px-5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(86,88,232,0.16)] transition hover:bg-[#494BD8] focus:outline-none focus:ring-2 focus:ring-[#5658E8]/20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {creatingQuestion ? (
                      <>
                        <RefreshCw
                          size={16}
                          className="animate-spin"
                        />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Plus size={16} />
                        Create Question
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Question Modal */}
        {isEditModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-[#172033]/55 px-3 py-3 backdrop-blur-[4px] sm:items-center sm:px-4 sm:py-6"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                closeEditModal();
              }
            }}
          >
            <div
              className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-[18px] border border-[#E3E6EB] bg-white shadow-[0_24px_64px_rgba(38,40,79,0.22)] sm:rounded-[18px]"
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-question-title"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between bg-[#26284F] px-6 py-4.5">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#A9B9FF]">
                    Question management
                  </p>
                  <h2
                    id="edit-question-title"
                    className="mt-1 font-display text-[22px] font-semibold tracking-[-0.02em] text-white"
                  >
                    Edit question
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={closeEditModal}
                  disabled={updatingQuestion}
                  aria-label="Close"
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.06] text-[#E1E5F2] transition hover:bg-white/[0.12] hover:text-white focus:outline-none focus:ring-2 focus:ring-white/30 disabled:opacity-50"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleUpdateQuestion} className="space-y-5 p-4 sm:p-6 sm:pb-7">
                {createError && (
                  <div className="flex items-start gap-3 rounded-md border border-[#E9C8C8] bg-[#FBF2F2] px-4 py-3 text-[12.5px] leading-5 text-[#A83E3E]">
                    <AlertCircle size={17} className="mt-0.5 shrink-0" />
                    <span>{createError}</span>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="edit-question-text"
                    className="mb-2 block text-[12.5px] font-semibold text-[#344054]"
                  >
                    Question text
                  </label>
                  <textarea
                    id="edit-question-text"
                    value={newQuestionText}
                    onChange={(event) => setNewQuestionText(event.target.value)}
                    autoFocus
                    rows={4}
                    placeholder="Enter the question..."
                    className="w-full rounded-md border border-[#D7DDE6] bg-[#F8F9FC] px-4 py-3 text-sm leading-6 text-[#202938] outline-none transition placeholder:text-[#98A2B3] focus:border-[#5658E8] focus:bg-white focus:ring-4 focus:ring-[#5658E8]/10"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label
                      htmlFor="edit-question-type"
                      className="mb-2 block text-[12.5px] font-semibold text-[#344054]"
                    >
                      Question type
                    </label>
                    <select
                      id="edit-question-type"
                      value={newQuestionType}
                      onChange={(event) => {
                        const value = event.target.value;
                        setNewQuestionType(value);
                        if (value === "FREE_TEXT") {
                          setNewQuestionOptions([]);
                          setNewQuestionCorrectAnswer("");
                        } else if (newQuestionOptions.length < 2) {
                          setNewQuestionOptions(["", ""]);
                        }
                      }}
                      className="h-11 w-full rounded-md border border-[#D7DDE6] bg-white px-3 text-sm text-[#202938] outline-none transition focus:border-[#5658E8] focus:ring-4 focus:ring-[#5658E8]/10"
                    >
                      <option value="MCQ">MCQ</option>
                      <option value="FREE_TEXT">Free Text</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="edit-question-skill"
                      className="mb-2 block text-[12.5px] font-semibold text-[#344054]"
                    >
                      Skill
                    </label>
                    <select
                      id="edit-question-skill"
                      value={newQuestionSkillId}
                      onChange={(event) => setNewQuestionSkillId(event.target.value)}
                      disabled={skills.length === 0}
                      className="h-11 w-full rounded-md border border-[#D7DDE6] bg-white px-3 text-sm text-[#202938] outline-none transition focus:border-[#5658E8] focus:ring-4 focus:ring-[#5658E8]/10 disabled:bg-[#F8F9FC] disabled:text-[#98A2B3]"
                    >
                      {skills.length === 0 ? (
                        <option value="">No skills available</option>
                      ) : (
                        skills.map((skill) => (
                          <option key={skill.id} value={skill.id}>
                            {skill.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="edit-question-difficulty"
                      className="mb-2 block text-[12.5px] font-semibold text-[#344054]"
                    >
                      Difficulty
                    </label>
                    <select
                      id="edit-question-difficulty"
                      value={newQuestionDifficulty}
                      onChange={(event) => setNewQuestionDifficulty(event.target.value)}
                      className="h-11 w-full rounded-md border border-[#D7DDE6] bg-white px-3 text-sm text-[#202938] outline-none transition focus:border-[#5658E8] focus:ring-4 focus:ring-[#5658E8]/10"
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>
                </div>

                {newQuestionType === "MCQ" && (
                  <div className="rounded-md border border-[#E3E6EB] bg-[#FAFBFC] p-4.5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold text-[#202938]">
                          Answer options
                        </h3>
                        <p className="mt-1 text-xs text-[#98A2B3]">
                          Edit the options and select the correct answer.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={addQuestionOption}
                        className="inline-flex items-center gap-1.5 rounded-md border border-[#B8C0CB] bg-white px-3 py-2 text-xs font-semibold text-[#5658E8] transition hover:border-[#5658E8] hover:bg-[#F8F8FF] focus:outline-none focus:ring-2 focus:ring-[#5658E8]/20"
                      >
                        <Plus size={14} />
                        Add option
                      </button>
                    </div>

                    <div className="mt-4 space-y-3">
                      {newQuestionOptions.map((option, index) => (
                        <div key={`edit-option-${index}`} className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#D8D1F0] bg-[#EAE5F9] text-xs font-semibold text-[#5658E8]">
                            {String.fromCharCode(65 + index)}
                          </span>
                          <input
                            type="text"
                            value={option}
                            onChange={(event) => updateQuestionOption(index, event.target.value)}
                            placeholder={`Option ${String.fromCharCode(65 + index)}`}
                            className="h-11 min-w-0 flex-1 rounded-md border border-[#D7DDE6] bg-white px-3 text-sm text-[#202938] outline-none transition placeholder:text-[#98A2B3] focus:border-[#5658E8] focus:ring-4 focus:ring-[#5658E8]/10"
                          />
                          <button
                            type="button"
                            onClick={() => removeQuestionOption(index)}
                            disabled={newQuestionOptions.length <= 2}
                            aria-label={`Remove option ${String.fromCharCode(65 + index)}`}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-[#9A6B6B] transition hover:bg-[#FFF6F6] hover:text-[#A83E3E] focus:outline-none focus:ring-2 focus:ring-[#A83E3E]/15 disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5">
                      <label
                        htmlFor="edit-correct-answer"
                        className="mb-2 block text-[12.5px] font-semibold text-[#344054]"
                      >
                        Correct answer
                      </label>
                      <select
                        id="edit-correct-answer"
                        value={newQuestionCorrectAnswer}
                        onChange={(event) => setNewQuestionCorrectAnswer(event.target.value)}
                        className="h-11 w-full rounded-md border border-[#D7DDE6] bg-white px-3 text-sm text-[#202938] outline-none transition focus:border-[#5658E8] focus:ring-4 focus:ring-[#5658E8]/10"
                      >
                        <option value="">Select correct answer</option>
                        {newQuestionOptions
                          .filter((option) => option.trim())
                          .map((option, index) => (
                            <option key={`${option}-${index}`} value={option}>
                              {String.fromCharCode(65 + newQuestionOptions.indexOf(option))} - {option}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                )}

                {newQuestionType === "FREE_TEXT" && (
                  <div className="rounded-md border border-[#E3E6EB] bg-[#F8F9FC] px-4 py-3 text-[12.5px] leading-5 text-[#667085]">
                    Free-text questions do not require options or an answer key.
                  </div>
                )}

                <div className="flex flex-col-reverse gap-3 border-t border-[#E4E7EC] pt-5 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={closeEditModal}
                    disabled={updatingQuestion}
                    className="h-11 rounded-md border border-[#B8C0CB] bg-white px-5 text-sm font-medium text-[#667085] transition hover:border-[#5658E8] hover:bg-[#F8F8FF] hover:text-[#5658E8] focus:outline-none focus:ring-2 focus:ring-[#5658E8]/15 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updatingQuestion || skills.length === 0}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#5658E8] px-5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(86,88,232,0.16)] transition hover:bg-[#494BD8] focus:outline-none focus:ring-2 focus:ring-[#5658E8]/20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {updatingQuestion ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={16} />
                        Save changes
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

export default QuestionBank;
