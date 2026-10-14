import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Archive,
  CheckCircle2,
  Clock3,
  FileQuestion,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import RecruiterLayout from "../layouts/RecruiterLayout";

function QuestionBank() {
  const navigate = useNavigate();
  const { auth, logout } = useAuth();

  const [questions, setQuestions] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [skillFilter, setSkillFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [difficultyFilter, setDifficultyFilter] =
    useState("all");
  const [statusFilter, setStatusFilter] =
    useState("all");

  // Annual Question Bank filter. This is intentionally a
  // client-side filter because the current GET /questions
  // endpoint does not expose a question_bank_id parameter.
  const [questionBanks, setQuestionBanks] = useState([]);
  const [questionBanksLoading, setQuestionBanksLoading] =
    useState(false);
  const [yearFilter, setYearFilter] = useState("all");
  const [questionBankFilter, setQuestionBankFilter] =
    useState("all");

  const [showCreateModal, setShowCreateModal] =
    useState(false);

  const [showGenerateModal, setShowGenerateModal] =
    useState(false);

  const [assignedJobs, setAssignedJobs] =
    useState([]);

  const [skills, setSkills] =
    useState([]);

  const [skillsLoading, setSkillsLoading] =
    useState(false);

  const [skillsError, setSkillsError] =
    useState("");

  const [jobsLoading, setJobsLoading] =
    useState(false);

  const [jobsError, setJobsError] =
    useState("");

  const [selectedJobId, setSelectedJobId] =
    useState("");

  const [creating, setCreating] =
    useState(false);

  const [generating, setGenerating] =
    useState(false);

  const [createForm, setCreateForm] =
    useState({
      question_text: "",
      question_type: "MCQ",
      skill_id: "",
      difficulty: "medium",
      options: ["", "", "", ""],
      correct_answer: "",
    });

  const [generateForm, setGenerateForm] =
    useState({
      job_id: "",
      skill_ids: [],
      generation_mode: "job_description",
      custom_topic: "",
      number_of_questions: 5,
      difficulty: "medium",
    });

  const [skillsDropdownOpen, setSkillsDropdownOpen] = useState(false);

  const getErrorMessage = (err, fallback) => {
    const detail = err?.response?.data?.detail;

    if (Array.isArray(detail)) {
      return detail
        .map((item) => {
          if (typeof item === "string") {
            return item;
          }

          return (
            item?.msg ||
            JSON.stringify(item)
          );
        })
        .filter(Boolean)
        .join(" ");
    }

    if (typeof detail === "string") {
      return detail;
    }

    if (err?.code === "ECONNABORTED") {
      return "The backend request timed out.";
    }

    if (err?.code === "ERR_NETWORK") {
      return "Unable to reach the FastAPI backend.";
    }

    return fallback;
  };

  const handleUnauthorized = (err) => {
    if (
      err?.response?.status === 401 ||
      err?.response?.status === 403
    ) {
      logout();

      navigate("/login", {
        replace: true,
      });

      return true;
    }

    return false;
  };

  const loadQuestions = async (
    showRefresh = false
  ) => {
    try {
      setError("");

      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      console.log(
        "QUESTION LIBRARY: loading /questions"
      );

      const response = await api.get(
        "/questions",
        {
          params: {
            library_only: true,
            ...(skillFilter !== "all"
              ? {
                  skill_id: Number(
                    skillFilter
                  ),
                }
              : {}),
            ...(typeFilter !== "all"
              ? {
                  question_type: typeFilter,
                }
              : {}),
            ...(difficultyFilter !== "all"
              ? {
                  difficulty:
                    difficultyFilter,
                }
              : {}),
          },
          timeout: 8000,
        }
      );

      const data = Array.isArray(
        response.data
      )
        ? response.data
        : [];

      console.log(
        "QUESTION LIBRARY: loaded",
        data
      );

      setQuestions(data);
    } catch (err) {
      console.error(
        "QUESTION LIBRARY: failed to load questions",
        err
      );

      if (handleUnauthorized(err)) {
        return;
      }

      setError(
        getErrorMessage(
          err,
          "Unable to load questions."
        )
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadSkills = async () => {
    try {
      setSkillsLoading(true);
      setSkillsError("");

      const response = await api.get("/skills", {
        timeout: 10000,
      });

      const skillData = Array.isArray(response.data)
        ? response.data
        : [];

      const normalizedSkills = skillData
        .filter(
          (skill) =>
            skill?.id !== null &&
            skill?.id !== undefined
        )
        .map((skill) => ({
          id: skill.id,
          name:
            String(
              skill.name ||
                skill.skill_name ||
                skill.title ||
                ""
            ).trim(),
        }))
        .filter((skill) => skill.name);

      setSkills(normalizedSkills);
    } catch (err) {
      console.error(
        "QUESTION LIBRARY: failed to load skills",
        err
      );

      if (handleUnauthorized(err)) {
        return;
      }

      setSkillsError(
        getErrorMessage(
          err,
          "Unable to load skill names."
        )
      );
    } finally {
      setSkillsLoading(false);
    }
  };

  const loadAssignedJobs = async () => {
    try {
      setJobsLoading(true);
      setJobsError("");

      const response = await api.get(
        "/question-sets/assigned-jobs",
        {
          timeout: 8000,
        }
      );

      const jobs = Array.isArray(
        response.data
      )
        ? response.data
        : [];

      setAssignedJobs(jobs);

      return jobs;
    } catch (err) {
      console.error(
        "QUESTION LIBRARY: failed to load assigned jobs",
        err
      );

      if (handleUnauthorized(err)) {
        return [];
      }

      setJobsError(
        getErrorMessage(
          err,
          "Unable to load jobs shared by HR."
        )
      );

      return [];
    } finally {
      setJobsLoading(false);
    }
  };

  const loadQuestionBanks = async () => {
    try {
      setQuestionBanksLoading(true);

      const response = await api.get(
        "/question-banks",
        {
          timeout: 12000,
        }
      );

      const responseData = response?.data;

      let banks = [];

      if (Array.isArray(responseData)) {
        banks = responseData;
      } else if (
        Array.isArray(responseData?.value)
      ) {
        banks = responseData.value;
      } else if (
        Array.isArray(responseData?.items)
      ) {
        banks = responseData.items;
      }

      setQuestionBanks(banks);
    } catch (err) {
      console.error(
        "QUESTION LIBRARY: failed to load annual question banks",
        err
      );

      if (handleUnauthorized(err)) {
        return;
      }

      // Question Bank filtering is an enhancement to the
      // existing library. Do not block the question library
      // when the annual-bank list cannot be loaded.
    } finally {
      setQuestionBanksLoading(false);
    }
  };

  useEffect(() => {
    loadQuestions();
  }, [
    skillFilter,
    typeFilter,
    difficultyFilter,
  ]);

  useEffect(() => {
    loadSkills();
    loadQuestionBanks();
    loadAssignedJobs();
  }, []);

  const skillOptions = useMemo(() => {
    const skillsById = new Map();

    const addSkill = (skill) => {
      if (
        skill?.id === null ||
        skill?.id === undefined
      ) {
        return;
      }

      const id = String(skill.id);
      const name = String(
        skill.name ||
          skill.skill_name ||
          skill.title ||
          ""
      ).trim();

      if (!name) {
        return;
      }

      const existing = skillsById.get(id);

      if (
        !existing ||
        existing.name.startsWith("Skill #")
      ) {
        skillsById.set(id, {
          id: skill.id,
          name,
        });
      }
    };

    skills.forEach(addSkill);

    assignedJobs.forEach((job) => {
      if (Array.isArray(job?.skills)) {
        job.skills.forEach(addSkill);
      }
    });

    questions.forEach((question) => {
      addSkill({
        id: question?.skill_id,
        name:
          question?.skill_name ||
          question?.skill?.name,
      });
    });

    return [...skillsById.values()].sort(
      (a, b) =>
        String(a.name).localeCompare(
          String(b.name),
          undefined,
          {
            sensitivity: "base",
          }
        )
    );
  }, [skills, assignedJobs, questions]);

  const skillNameById = useMemo(() => {
    return new Map(
      skillOptions.map((skill) => [
        String(skill.id),
        skill.name,
      ])
    );
  }, [skillOptions]);

  const availableYears = useMemo(() => {
    return [
      ...new Set(
        questionBanks
          .map((bank) =>
            Number(bank.hiring_year)
          )
          .filter((year) =>
            Number.isInteger(year)
          )
      ),
    ].sort((a, b) => b - a);
  }, [questionBanks]);

  const questionBankIdsByYear =
    useMemo(() => {
      const result = new Map();

      questionBanks.forEach((bank) => {
        if (
          bank?.id === null ||
          bank?.id === undefined ||
          bank?.hiring_year === null ||
          bank?.hiring_year === undefined
        ) {
          return;
        }

        const year = Number(
          bank.hiring_year
        );

        if (!Number.isInteger(year)) {
          return;
        }

        if (!result.has(year)) {
          result.set(
            year,
            new Set()
          );
        }

        result
          .get(year)
          .add(String(bank.id));
      });

      return result;
    }, [questionBanks]);

  const questionCountByYear =
    useMemo(() => {
      const counts = new Map();

      questions.forEach((question) => {
        if (
          question?.question_bank_id ===
            null ||
          question?.question_bank_id ===
            undefined
        ) {
          return;
        }

        const bank =
          questionBanks.find(
            (item) =>
              String(item?.id) ===
              String(
                question.question_bank_id
              )
          );

        const year = Number(
          bank?.hiring_year
        );

        if (!Number.isInteger(year)) {
          return;
        }

        counts.set(
          year,
          (counts.get(year) || 0) +
            1
        );
      });

      return counts;
    }, [questions, questionBanks]);

  const questionBankOptions =
    useMemo(() => {
      return [...questionBanks]
        .filter(
          (bank) =>
            bank?.id !== null &&
            bank?.id !== undefined &&
            (yearFilter === "all" ||
              Number(
                bank.hiring_year
              ) ===
                Number(
                  yearFilter
                ))
        )
        .sort((a, b) => {
          const yearA =
            Number(
              a.hiring_year
            ) || 0;

          const yearB =
            Number(
              b.hiring_year
            ) || 0;

          if (yearA !== yearB) {
            return yearB - yearA;
          }

          return String(
            a.name || ""
          ).localeCompare(
            String(
              b.name || ""
            )
          );
        });
    }, [questionBanks, yearFilter]);

  const questionBankNameById =
    useMemo(() => {
      return new Map(
        questionBanks
          .filter(
            (bank) =>
              bank?.id !== null &&
              bank?.id !== undefined
          )
          .map((bank) => [
            String(bank.id),
            bank.name ||
              `Question Bank #${bank.id}`,
          ])
      );
    }, [questionBanks]);

  const hasUnassignedQuestions =
    useMemo(() => {
      return questions.some(
        (question) =>
          question.question_bank_id ===
            null ||
          question.question_bank_id ===
            undefined
      );
    }, [questions]);

  const filteredQuestions =
    useMemo(() => {
      const normalizedSearch =
        search.trim().toLowerCase();

      return questions.filter(
        (question) => {
          const text =
            String(
              question.question_text ||
                ""
            ).toLowerCase();

          const status =
            String(
              question.status || ""
            ).toLowerCase();

          const matchesSearch =
            !normalizedSearch ||
            text.includes(
              normalizedSearch
            );

          const matchesStatus =
            statusFilter ===
              "all" ||
            status ===
              statusFilter.toLowerCase();

          const selectedYearBankIds =
            yearFilter ===
            "all"
              ? null
              : questionBankIdsByYear.get(
                  Number(
                    yearFilter
                  )
                );

          const matchesYear =
            yearFilter === "all"
              ? true
              : selectedYearBankIds?.has(
                  String(
                    question.question_bank_id
                  )
                ) === true;

          const matchesQuestionBank =
            questionBankFilter ===
            "all"
              ? true
              : questionBankFilter ===
                  "none"
                ? question.question_bank_id ===
                    null ||
                  question.question_bank_id ===
                    undefined
                : String(
                    question.question_bank_id
                  ) ===
                  String(
                    questionBankFilter
                  );

          return (
            matchesSearch &&
            matchesStatus &&
            matchesYear &&
            matchesQuestionBank
          );
        }
      );
    }, [
      questions,
      search,
      statusFilter,
      questionBankFilter,
      yearFilter,
      questionBankIdsByYear,
    ]);

  const approvedCount =
    questions.filter(
      (question) =>
        String(
          question.status || ""
        ).toLowerCase() ===
        "approved"
    ).length;

  const pendingCount =
    questions.filter(
      (question) =>
        String(
          question.status || ""
        ).toLowerCase() ===
        "pending_review"
    ).length;

  const rejectedCount =
    questions.filter(
      (question) =>
        String(
          question.status || ""
        ).toLowerCase() ===
        "rejected"
    ).length;

  const handleYearChange = (
    year
  ) => {
    setYearFilter(
      String(year)
    );

    // A year selection intentionally shows every annual bank
    // belonging to that hiring year, so clear any bank-specific
    // selection before applying the year filter.
    setQuestionBankFilter(
      "all"
    );
  };

  const clearFilters = () => {
    setSearch("");
    setYearFilter("all");
    setQuestionBankFilter(
      "all"
    );
    setSkillFilter("all");
    setTypeFilter("all");
    setDifficultyFilter("all");
    setStatusFilter("all");
  };

  const openCreateModal =
    async () => {
      setError("");
      setJobsError("");
      setShowCreateModal(true);

      if (
        assignedJobs.length === 0
      ) {
        await loadAssignedJobs();
      }
    };

  const openGenerateModal =
    async () => {
      setError("");
      setJobsError("");
      setShowGenerateModal(true);

      if (
        assignedJobs.length === 0
      ) {
        const jobs =
          await loadAssignedJobs();

        if (jobs.length === 1) {
          const job = jobs[0];

          setSelectedJobId(
            String(job.id)
          );

          setGenerateForm(
            (current) => ({
              ...current,
              job_id:
                String(
                  job.id
                ),
              skill_ids:
                Array.isArray(
                  job.skills
                )
                  ? job.skills.map(
                      (
                        skill
                      ) =>
                        Number(
                          skill.id
                        )
                    )
                  : [],
            })
          );
        }
      }
    };

  const getSelectedJob = () => {
    return assignedJobs.find(
      (job) =>
        Number(job.id) ===
        Number(
          selectedJobId ||
            generateForm.job_id
        )
    );
  };

  const handleJobChange = (
    value
  ) => {
    setSelectedJobId(value);

    const job =
      assignedJobs.find(
        (item) =>
          Number(item.id) ===
          Number(value)
      );

    setGenerateForm(
      (current) => ({
        ...current,
        job_id: value,
        skill_ids:
          Array.isArray(
            job?.skills
          )
            ? job.skills.map(
                (
                  skill
                ) =>
                  Number(
                    skill.id
                  )
              )
            : [],
      })
    );

    const firstSkill =
      Array.isArray(job?.skills) &&
      job.skills.length > 0
        ? job.skills[0]
        : null;

    if (firstSkill) {
      setCreateForm(
        (current) => ({
          ...current,
          skill_id:
            String(
              firstSkill.id
            ),
        })
      );
    }
  };

  const handleOptionChange = (
    index,
    value
  ) => {
    setCreateForm(
      (current) => {
        const options = [
          ...current.options,
        ];

        options[index] = value;

        return {
          ...current,
          options,
        };
      }
    );
  };

  const handleQuestionTypeChange =
    (value) => {
      setCreateForm(
        (current) => ({
          ...current,
          question_type:
            value,
          options:
            value === "MCQ"
              ? [
                  "",
                  "",
                  "",
                  "",
                ]
              : [],
          correct_answer:
            value === "MCQ"
              ? ""
              : "",
        })
      );
    };

  const createQuestion =
    async (event) => {
      event.preventDefault();

      setError("");
      setCreating(true);

      try {
        if (
          !createForm.question_text.trim()
        ) {
          throw new Error(
            "Question text is required."
          );
        }

        if (
          !createForm.skill_id
        ) {
          throw new Error(
            "Select a skill."
          );
        }

        if (
          createForm.question_type ===
          "MCQ"
        ) {
          const options =
            createForm.options
              .map(
                (option) =>
                  option.trim()
              )
              .filter(
                Boolean
              );

          if (
            options.length < 2
          ) {
            throw new Error(
              "An MCQ must have at least two options."
            );
          }

          if (
            !createForm.correct_answer.trim()
          ) {
            throw new Error(
              "Select the correct answer."
            );
          }

          if (
            !options.includes(
              createForm.correct_answer.trim()
            )
          ) {
            throw new Error(
              "Correct answer must match one of the options."
            );
          }
        }

        const payload = {
          question_text:
            createForm.question_text.trim(),
          question_type:
            createForm.question_type,
          skill_id:
            Number(
              createForm.skill_id
            ),
          difficulty:
            createForm.difficulty,
          options:
            createForm.question_type ===
            "MCQ"
              ? createForm.options
                  .map(
                    (option) =>
                      option.trim()
                  )
                  .filter(
                    Boolean
                  )
              : null,
          correct_answer:
            createForm.question_type ===
            "MCQ"
              ? createForm.correct_answer.trim()
              : null,
        };

        await api.post(
          "/questions",
          payload,
          {
            timeout: 12000,
          }
        );

        setShowCreateModal(
          false
        );

        setCreateForm({
          question_text: "",
          question_type: "MCQ",
          skill_id: "",
          difficulty: "medium",
          options: [
            "",
            "",
            "",
            "",
          ],
          correct_answer:
            "",
        });

        await loadQuestions(
          true
        );
      } catch (err) {
        console.error(
          "QUESTION LIBRARY: create failed",
          err
        );

        if (
          err instanceof Error &&
          !err.response
        ) {
          setError(
            err.message
          );
        } else if (
          !handleUnauthorized(
            err
          )
        ) {
          setError(
            getErrorMessage(
              err,
              "Unable to create the question."
            )
          );
        }
      } finally {
        setCreating(false);
      }
    };

  const generateQuestions =
    async (event) => {
      event.preventDefault();

      setGenerating(true);
      setError("");

      try {
        if (
          !generateForm.job_id
        ) {
          throw new Error(
            "Select a job."
          );
        }

        const generationMode =
          generateForm.generation_mode || "job_description";

        if (
          generationMode === "custom_topic" &&
          !generateForm.custom_topic.trim()
        ) {
          throw new Error("Enter a custom skill or topic.");
        }

        if (
          generationMode !== "job_description" &&
          (!Array.isArray(generateForm.skill_ids) ||
            generateForm.skill_ids.length === 0)
        ) {
          throw new Error(
            "Select at least one job skill to associate with the generated questions."
          );
        }

        const payload = {
          job_id: Number(generateForm.job_id),
          generation_mode: generationMode,
          custom_topic:
            generationMode === "custom_topic"
              ? generateForm.custom_topic.trim()
              : null,
          skill_ids:
            generationMode === "job_description"
              ? null
              : generateForm.skill_ids.map(Number),
          number_of_questions: Number(
            generateForm.number_of_questions
          ),
          difficulty: generateForm.difficulty,
        };

        await api.post(
          "/questions/generate",
          payload,
          {
            timeout: 120000,
          }
        );

        setShowGenerateModal(
          false
        );

        await loadQuestions(
          true
        );
      } catch (err) {
        console.error(
          "QUESTION LIBRARY: generation failed",
          err
        );

        if (
          err instanceof Error &&
          !err.response
        ) {
          setError(
            err.message
          );
        } else if (
          !handleUnauthorized(
            err
          )
        ) {
          setError(
            getErrorMessage(
              err,
              "Unable to generate questions."
            )
          );
        }
      } finally {
        setGenerating(false);
      }
    };

  const formatDate = (
    value
  ) => {
    if (!value) {
      return "—";
    }

    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return "—";
    }

    return date.toLocaleDateString(
      undefined,
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }
    );
  };

  const statusConfig = (
    status
  ) => {
    switch (
      String(
        status || ""
      ).toLowerCase()
    ) {
      case "approved":
        return {
          label: "Approved",
          className:
            "border-[#BBDDD5] bg-[#EFF8F5] text-[#17655E]",
        };

      case "rejected":
        return {
          label: "Rejected",
          className:
            "border-[#E9C8C8] bg-[#FBF2F2] text-[#A83E3E]",
        };

      case "pending_review":
        return {
          label: "Pending Review",
          className:
            "border-[#E7D7B4] bg-[#FFF9EC] text-[#9A6917]",
        };

      default:
        return {
          label:
            status || "Unknown",
          className:
            "border-[#D9DEE7] bg-[#FAFBFC] text-[#667085]",
        };
    }
  };

  return (
    <RecruiterLayout
      title="Question Library"
      breadcrumb="Workspace / Question Library"
    >
      <main className="mx-auto max-w-[1500px] space-y-6 pb-12 text-[#202938]">

        {/* Header */}
        <section className="relative overflow-hidden rounded-[22px] border border-[#E3E6EB] bg-white p-6 shadow-[0_8px_24px_rgba(27,37,58,0.035)] sm:p-8">
          <div className="absolute -right-20 -top-20 h-60 w-60 rounded-full bg-[#EAE5F9] opacity-50 blur-[70px]" />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#DDD6F3] bg-[#FBFAFF] px-3 py-1.5">
                <Sparkles
                  size={12}
                  className="text-[#7862C8]"
                />

                <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#7862C8]">
                  Assessment Manager
                </span>
              </div>

              <h1 className="mt-4 text-[32px] font-semibold tracking-[-0.035em] text-[#182033] sm:text-[40px]">
                Question Library
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#667085]">
                Manage, search, create, and generate role-specific screening questions.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#D9DEE7] bg-white px-5 text-sm font-semibold text-[#475467] transition hover:border-[#5658E8] hover:text-[#5658E8]"
              >
                <Plus size={16} />
                Create Question
              </button>

              <button
                type="button"
                onClick={
                  openGenerateModal
                }
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#5658E8] px-5 text-sm font-semibold text-white transition hover:bg-[#494BD8]"
              >
                <Sparkles size={16} />
                Generate with AI
              </button>
            </div>
          </div>
        </section>

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="rounded-[18px] border border-[#E9C8C8] bg-[#FBF2F2] px-4 py-3.5 text-sm text-[#A83E3E]"
          >
            {error}
          </div>
        )}

        {/* Metrics */}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={
              <FileQuestion size={18} />
            }
            label="Questions"
            value={
              loading
                ? "..."
                : questions.length
            }
            description="Available screening content"
            className="blue"
            doodle="questions"
            selected={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
          />

          <MetricCard
            icon={
              <CheckCircle2 size={18} />
            }
            label="Approved"
            value={
              loading
                ? "..."
                : approvedCount
            }
            description="Approved for downstream use"
            className="teal"
            doodle="approved"
            selected={statusFilter === "approved"}
            onClick={() => setStatusFilter("approved")}
          />

          <MetricCard
            icon={
              <Clock3 size={18} />
            }
            label="Pending Review"
            value={
              loading
                ? "..."
                : pendingCount
            }
            description="Awaiting reviewer decision"
            className="amber"
            doodle="pending"
            selected={statusFilter === "pending_review"}
            onClick={() => setStatusFilter("pending_review")}
          />

          <MetricCard
            icon={
              <Archive size={18} />
            }
            label="Rejected"
            value={
              loading
                ? "..."
                : rejectedCount
            }
            description="Questions sent back for revision"
            className="rose"
            doodle="rejected"
            selected={statusFilter === "rejected"}
            onClick={() => setStatusFilter("rejected")}
          />
        </section>

        {/* =========================================================
            YEAR BAR
            Select a hiring year to see ALL questions that belong
            to annual Question Banks from that year.
        ========================================================= */}
        <section className="rounded-[20px] border border-[#E3E6EB] bg-white p-4 shadow-[0_8px_24px_rgba(27,37,58,0.035)] sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-[#7862C8]">
                Question Bank Year
              </p>

              <p className="mt-1 text-sm font-semibold text-[#344054]">
                View the complete question pool for a hiring year
              </p>

              <p className="mt-1 text-xs leading-5 text-[#98A2B3]">
                Selecting a year includes questions from every annual Question Bank created for that year.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[#FAFBFC] p-1.5">
              <YearPill
                active={
                  yearFilter ===
                  "all"
                }
                label="All Years"
                count={
                  questions.length
                }
                onClick={() =>
                  handleYearChange(
                    "all"
                  )
                }
              />

              {availableYears.map(
                (year) => (
                  <YearPill
                    key={year}
                    active={
                      Number(
                        yearFilter
                      ) ===
                      Number(year)
                    }
                    label={String(
                      year
                    )}
                    count={
                      questionCountByYear.get(
                        year
                      ) || 0
                    }
                    onClick={() =>
                      handleYearChange(
                        year
                      )
                    }
                  />
                )
              )}

              {questionBanksLoading && (
                <div className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-semibold text-[#98A2B3]">
                  <RefreshCw
                    size={12}
                    className="animate-spin"
                  />
                  Loading years
                </div>
              )}
            </div>
          </div>

          {yearFilter !==
            "all" && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#EEF0F3] pt-3">
              <span className="rounded-full border border-[#D9D2F1] bg-[#FBFAFF] px-3 py-1.5 text-[10px] font-bold text-[#5E4DA3]">
                {yearFilter}{" "}
                Question Pool
              </span>

              <span className="text-xs text-[#667085]">
                {
                  filteredQuestions.length
                }{" "}
                question
                {filteredQuestions.length ===
                1
                  ? ""
                  : "s"}{" "}
                currently match this year and the other active filters.
              </span>
            </div>
          )}
        </section>

        {/* Filters */}
        <section className="rounded-[20px] border border-[#E3E6EB] bg-white p-4 shadow-[0_8px_24px_rgba(27,37,58,0.035)] sm:p-5">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px_170px_170px_170px_180px_auto]">
            <div className="relative">
              <Search
                size={16}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#98A2B3]"
              />

              <input
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target
                      .value
                  )
                }
                type="text"
                placeholder="Search questions..."
                className="h-11 w-full rounded-lg border border-[#D7DDE6] bg-white pl-10 pr-3 text-sm outline-none transition placeholder:text-[#98A2B3] focus:border-[#5658E8] focus:ring-4 focus:ring-[#5658E8]/10"
              />
            </div>

            <select
              value={
                questionBankFilter
              }
              onChange={(event) =>
                setQuestionBankFilter(
                  event.target
                    .value
                )
              }
              disabled={
                questionBanksLoading
              }
              className="h-11 rounded-lg border border-[#D7DDE6] bg-white px-3 text-sm outline-none focus:border-[#5658E8] disabled:cursor-not-allowed disabled:bg-[#F8F9FC] disabled:text-[#98A2B3]"
            >
              <option value="all">
                {yearFilter ===
                "all"
                  ? "All Yearly Question Banks"
                  : `All ${yearFilter} Question Banks`}
              </option>

              {questionBankOptions.map(
                (
                  questionBank
                ) => (
                  <option
                    key={
                      questionBank.id
                    }
                    value={
                      questionBank.id
                    }
                  >
                    {
                      questionBank.name
                    }
                  </option>
                )
              )}

              {hasUnassignedQuestions &&
                yearFilter ===
                  "all" && (
                  <option value="none">
                    No Yearly Question Bank
                  </option>
                )}
            </select>

            <select
              value={
                skillFilter
              }
              onChange={(event) =>
                setSkillFilter(
                  event.target
                    .value
                )
              }
              className="h-11 rounded-lg border border-[#D7DDE6] bg-white px-3 text-sm outline-none focus:border-[#5658E8]"
            >
              <option value="all">
                All Skills
              </option>

              {skillOptions.map(
                (skill) => (
                  <option
                    key={skill.id}
                    value={skill.id}
                  >
                    {skill.name}
                  </option>
                )
              )}
            </select>

            <select
              value={typeFilter}
              onChange={(event) =>
                setTypeFilter(
                  event.target
                    .value
                )
              }
              className="h-11 rounded-lg border border-[#D7DDE6] bg-white px-3 text-sm outline-none focus:border-[#5658E8]"
            >
              <option value="all">
                All Types
              </option>

              <option value="MCQ">
                MCQ
              </option>

              <option value="FREE_TEXT">
                Free Text
              </option>
            </select>

            <select
              value={
                difficultyFilter
              }
              onChange={(event) =>
                setDifficultyFilter(
                  event.target
                    .value
                )
              }
              className="h-11 rounded-lg border border-[#D7DDE6] bg-white px-3 text-sm outline-none focus:border-[#5658E8]"
            >
              <option value="all">
                All Difficulties
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

            <select
              value={
                statusFilter
              }
              onChange={(event) =>
                setStatusFilter(
                  event.target
                    .value
                )
              }
              className="h-11 rounded-lg border border-[#D7DDE6] bg-white px-3 text-sm outline-none focus:border-[#5658E8]"
            >
              <option value="all">
                All Statuses
              </option>

              <option value="approved">
                Approved
              </option>

              <option value="pending_review">
                Pending Review
              </option>

              <option value="rejected">
                Rejected
              </option>
            </select>

            <button
              type="button"
              onClick={() =>
                loadQuestions(
                  true
                )
              }
              disabled={
                refreshing
              }
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#D7DDE6] bg-white px-4 text-xs font-semibold text-[#475467] transition hover:border-[#5658E8] hover:text-[#5658E8] disabled:opacity-60"
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
          </div>

          {(search ||
            yearFilter !==
              "all" ||
            questionBankFilter !==
              "all" ||
            skillFilter !==
              "all" ||
            typeFilter !==
              "all" ||
            difficultyFilter !==
              "all" ||
            statusFilter !==
              "all") && (
            <button
              type="button"
              onClick={
                clearFilters
              }
              className="mt-3 text-xs font-semibold text-[#5658E8]"
            >
              Clear filters
            </button>
          )}
        </section>

        {/* Question table */}
        <section className="overflow-hidden rounded-[20px] border border-[#E3E6EB] bg-white shadow-[0_8px_24px_rgba(27,37,58,0.035)]">
          <div className="border-b border-[#EEF0F3] px-5 py-4 sm:px-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[#344054]">
                  Screening Questions
                </p>

                <p className="mt-1 text-xs text-[#98A2B3]">
                  {
                    filteredQuestions.length
                  }{" "}
                  question
                  {filteredQuestions.length ===
                  1
                    ? ""
                    : "s"}{" "}
                  shown
                  {yearFilter !==
                    "all" && (
                    <>
                      {" "}
                      from all{" "}
                      {
                        yearFilter
                      }{" "}
                      yearly question banks
                    </>
                  )}

                  {yearFilter ===
                    "all" &&
                    questionBankFilter !==
                      "all" && (
                      <>
                        {" "}
                        from the selected yearly question bank
                      </>
                    )}
                </p>
              </div>

              <span className="rounded-full bg-[#F5F6FA] px-3 py-1 text-[10px] font-semibold text-[#667085]">
                Assessment Manager
              </span>
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-[350px] items-center justify-center">
              <div className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#EAE5F9]">
                  <RefreshCw
                    size={20}
                    className="animate-spin text-[#5658E8]"
                  />
                </div>

                <p className="mt-4 text-sm font-semibold text-[#344054]">
                  Loading questions
                </p>

                <p className="mt-1 text-xs text-[#98A2B3]">
                  Fetching screening library data.
                </p>
              </div>
            </div>
          ) : filteredQuestions.length ===
            0 ? (
            <div className="flex min-h-[350px] items-center justify-center px-6">
              <div className="max-w-md text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAE5F9] text-[#7862C8]">
                  <FileQuestion
                    size={23}
                  />
                </div>

                <h2 className="mt-5 text-lg font-semibold text-[#202938]">
                  No questions found
                </h2>

                <p className="mt-2 text-sm leading-6 text-[#667085]">
                  No questions match the current filters.
                </p>

                <button
                  type="button"
                  onClick={
                    openCreateModal
                  }
                  className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-[#5658E8] px-4 text-xs font-semibold text-white"
                >
                  <Plus size={14} />
                  Create Question
                </button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-[#EEF0F3] bg-[#FAFBFC] text-left">
                    <th className="px-5 py-3 text-[9px] font-bold uppercase tracking-[0.14em] text-[#98A2B3]">
                      Question
                    </th>

                    <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-[0.14em] text-[#98A2B3]">
                      Skill
                    </th>

                    <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-[0.14em] text-[#98A2B3]">
                      Type
                    </th>

                    <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-[0.14em] text-[#98A2B3]">
                      Yearly Question Bank
                    </th>

                    <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-[0.14em] text-[#98A2B3]">
                      Difficulty
                    </th>

                    <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-[0.14em] text-[#98A2B3]">
                      Status
                    </th>

                    <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-[0.14em] text-[#98A2B3]">
                      Created
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {filteredQuestions.map(
                    (question) => {
                      const status =
                        statusConfig(
                          question.status
                        );

                      return (
                        <tr
                          key={
                            question.id
                          }
                          className="border-b border-[#F0F1F4] transition last:border-b-0 hover:bg-[#FCFCFE]"
                        >
                          <td className="max-w-[560px] px-5 py-4">
                            <p className="text-sm font-medium leading-6 text-[#344054]">
                              {
                                question.question_text
                              }
                            </p>

                            <p className="mt-1 text-[10px] text-[#98A2B3]">
                              Question #
                              {
                                question.id
                              }
                            </p>
                          </td>

                          <td className="px-4 py-4">
                            <span className="rounded-full border border-[#DDD6F3] bg-[#FBFAFF] px-2.5 py-1 text-[10px] font-semibold text-[#6657A9]">
                              {skillNameById.get(
                                String(
                                  question.skill_id
                                )
                              ) ||
                                question?.skill_name ||
                                question?.skill?.name ||
                                "Skill name unavailable"}
                            </span>
                          </td>

                          <td className="px-4 py-4 text-xs font-medium text-[#667085]">
                            {
                              question.question_type
                            }
                          </td>

                          <td className="max-w-[220px] px-4 py-4">
                            <span className="inline-flex max-w-full rounded-full border border-[#DDE3F2] bg-[#F7F9FD] px-2.5 py-1 text-[10px] font-semibold text-[#53627A]">
                              <span className="truncate">
                                {question.question_bank_id !==
                                  null &&
                                question.question_bank_id !==
                                  undefined
                                  ? questionBankNameById.get(
                                      String(
                                        question.question_bank_id
                                      )
                                    ) ||
                                    `Question Bank #${question.question_bank_id}`
                                  : "Not assigned"}
                              </span>
                            </span>
                          </td>

                          <td className="px-4 py-4">
                            <span className="text-xs font-semibold capitalize text-[#475467]">
                              {
                                question.difficulty
                              }
                            </span>
                          </td>

                          <td className="px-4 py-4">
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold ${status.className}`}
                            >
                              {
                                status.label
                              }
                            </span>
                          </td>

                          <td className="px-4 py-4 text-xs text-[#98A2B3]">
                            {formatDate(
                              question.created_at
                            )}
                          </td>
                        </tr>
                      );
                    }
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {/* =========================================================
          CREATE QUESTION MODAL
      ========================================================= */}

      {showCreateModal && (
        <Modal
          title="Create Question"
          subtitle="Add a screening question to the question library."
          onClose={() =>
            setShowCreateModal(
              false
            )
          }
        >
          {jobsLoading ? (
            <div className="py-10 text-center">
              <RefreshCw
                size={20}
                className="mx-auto animate-spin text-[#5658E8]"
              />

              <p className="mt-3 text-sm font-semibold text-[#344054]">
                Loading assigned jobs
              </p>
            </div>
          ) : (
            <form
              onSubmit={
                createQuestion
              }
              className="space-y-5"
            >
              {jobsError && (
                <div className="rounded-xl border border-[#E9C8C8] bg-[#FBF2F2] px-4 py-3 text-xs text-[#A83E3E]">
                  {jobsError}
                </div>
              )}

              <Field label="Assigned Job">
                <select
                  value={
                    selectedJobId
                  }
                  onChange={(
                    event
                  ) =>
                    handleJobChange(
                      event.target
                        .value
                    )
                  }
                  className="field"
                  required
                >
                  <option value="">
                    Select a job
                  </option>

                  {assignedJobs.map(
                    (job) => (
                      <option
                        key={
                          job.id
                        }
                        value={
                          job.id
                        }
                      >
                        {
                          job.title
                        }{" "}
                        (#{job.id})
                      </option>
                    )
                  )}
                </select>
              </Field>

              <Field label="Question">
                <textarea
                  value={
                    createForm.question_text
                  }
                  onChange={(
                    event
                  ) =>
                    setCreateForm(
                      (
                        current
                      ) => ({
                        ...current,
                        question_text:
                          event
                            .target
                            .value,
                      })
                    )
                  }
                  rows={4}
                  className="field resize-none"
                  placeholder="Enter the screening question..."
                  required
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Skill ID">
                  <input
                    value={
                      createForm.skill_id
                    }
                    onChange={(
                      event
                    ) =>
                      setCreateForm(
                        (
                          current
                        ) => ({
                          ...current,
                          skill_id:
                            event
                              .target
                              .value,
                        })
                      )
                    }
                    className="field"
                    type="number"
                    min="1"
                    placeholder="e.g. 4"
                    required
                  />
                </Field>

                <Field label="Type">
                  <select
                    value={
                      createForm.question_type
                    }
                    onChange={(
                      event
                    ) =>
                      handleQuestionTypeChange(
                        event
                          .target
                          .value
                      )
                    }
                    className="field"
                  >
                    <option value="MCQ">
                      MCQ
                    </option>

                    <option value="FREE_TEXT">
                      Free Text
                    </option>
                  </select>
                </Field>

                <Field label="Difficulty">
                  <select
                    value={
                      createForm.difficulty
                    }
                    onChange={(
                      event
                    ) =>
                      setCreateForm(
                        (
                          current
                        ) => ({
                          ...current,
                          difficulty:
                            event
                              .target
                              .value,
                        })
                      )
                    }
                    className="field"
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
                </Field>
              </div>

              {createForm.question_type ===
                "MCQ" && (
                <div className="space-y-4">
                  <Field label="Options">
                    <div className="space-y-2">
                      {createForm.options.map(
                        (
                          option,
                          index
                        ) => (
                          <input
                            key={
                              index
                            }
                            value={
                              option
                            }
                            onChange={(
                              event
                            ) =>
                              handleOptionChange(
                                index,
                                event
                                  .target
                                  .value
                              )
                            }
                            className="field"
                            placeholder={`Option ${
                              index +
                              1
                            }`}
                          />
                        )
                      )}
                    </div>
                  </Field>

                  <Field label="Correct Answer">
                    <select
                      value={
                        createForm.correct_answer
                      }
                      onChange={(
                        event
                      ) =>
                        setCreateForm(
                          (
                            current
                          ) => ({
                            ...current,
                            correct_answer:
                              event
                                .target
                                .value,
                          })
                        )
                      }
                      className="field"
                    >
                      <option value="">
                        Select correct answer
                      </option>

                      {createForm.options
                        .filter(
                          (
                            option
                          ) =>
                            option.trim()
                        )
                        .map(
                          (
                            option
                          ) => (
                            <option
                              key={
                                option
                              }
                              value={
                                option
                              }
                            >
                              {
                                option
                              }
                            </option>
                          )
                        )}
                    </select>
                  </Field>
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-[#EEF0F3] pt-5">
                <button
                  type="button"
                  onClick={() =>
                    setShowCreateModal(
                      false
                    )
                  }
                  className="h-10 rounded-lg border border-[#D9DEE7] px-4 text-xs font-semibold text-[#667085]"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={
                    creating
                  }
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#5658E8] px-5 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {creating && (
                    <RefreshCw
                      size={13}
                      className="animate-spin"
                    />
                  )}

                  {creating
                    ? "Creating..."
                    : "Create Question"}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}

      {/* =========================================================
          AI GENERATION MODAL
      ========================================================= */}

      {showGenerateModal && (
        <Modal
          title="Generate Questions with AI"
          subtitle="Generate structured questions from a job's assessment scope."
          onClose={() =>
            setShowGenerateModal(
              false
            )
          }
        >
          {jobsLoading ? (
            <div className="py-10 text-center">
              <RefreshCw
                size={20}
                className="mx-auto animate-spin text-[#5658E8]"
              />

              <p className="mt-3 text-sm font-semibold text-[#344054]">
                Loading assigned jobs
              </p>
            </div>
          ) : (
            <form
              onSubmit={
                generateQuestions
              }
              className="space-y-5"
            >
              {jobsError && (
                <div className="rounded-xl border border-[#E9C8C8] bg-[#FBF2F2] px-4 py-3 text-xs text-[#A83E3E]">
                  {jobsError}
                </div>
              )}

              <Field label="Job">
                <select
                  value={
                    generateForm.job_id
                  }
                  onChange={(
                    event
                  ) =>
                    handleJobChange(
                      event.target
                        .value
                    )
                  }
                  className="field"
                  required
                >
                  <option value="">
                    Select a job
                  </option>

                  {assignedJobs.map(
                    (job) => (
                      <option
                        key={
                          job.id
                        }
                        value={
                          job.id
                        }
                      >
                        {job.title}
                      </option>
                    )
                  )}
                </select>
              </Field>

              <Field label="Generation source">
                <div className="grid gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    aria-pressed={generateForm.generation_mode === "job_description"}
                    onClick={() => {
                      setGenerateForm((current) => ({
                        ...current,
                        generation_mode: "job_description",
                      }));
                      setSkillsDropdownOpen(false);
                    }}
                    className={`rounded-xl border p-3 text-left transition ${
                      generateForm.generation_mode === "job_description"
                        ? "border-[#AFA6E8] bg-[#F4F1FF] text-[#493E8C] ring-1 ring-[#DCD5FA]"
                        : "border-[#D9DEE7] bg-white text-[#475467] hover:border-[#B8BFCE]"
                    }`}
                  >
                    <span className="block text-sm font-semibold">
                      Job Description
                    </span>
                    <span className="mt-1 block text-xs leading-5 opacity-80">
                      Use the JD and all confirmed job skills.
                    </span>
                  </button>

                  <button
                    type="button"
                    aria-pressed={generateForm.generation_mode === "selected_skills"}
                    onClick={() => {
                      setGenerateForm((current) => ({
                        ...current,
                        generation_mode: "selected_skills",
                      }));
                      setSkillsDropdownOpen(false);
                    }}
                    className={`rounded-xl border p-3 text-left transition ${
                      generateForm.generation_mode === "selected_skills"
                        ? "border-[#AFA6E8] bg-[#F4F1FF] text-[#493E8C] ring-1 ring-[#DCD5FA]"
                        : "border-[#D9DEE7] bg-white text-[#475467] hover:border-[#B8BFCE]"
                    }`}
                  >
                    <span className="block text-sm font-semibold">
                      Select Skills
                    </span>
                    <span className="mt-1 block text-xs leading-5 opacity-80">
                      Focus only on skills you choose.
                    </span>
                  </button>

                  <button
                    type="button"
                    aria-pressed={generateForm.generation_mode === "custom_topic"}
                    onClick={() => {
                      setGenerateForm((current) => ({
                        ...current,
                        generation_mode: "custom_topic",
                      }));
                      setSkillsDropdownOpen(false);
                    }}
                    className={`rounded-xl border p-3 text-left transition ${
                      generateForm.generation_mode === "custom_topic"
                        ? "border-[#AFA6E8] bg-[#F4F1FF] text-[#493E8C] ring-1 ring-[#DCD5FA]"
                        : "border-[#D9DEE7] bg-white text-[#475467] hover:border-[#B8BFCE]"
                    }`}
                  >
                    <span className="block text-sm font-semibold">
                      Custom Skill / Topic
                    </span>
                    <span className="mt-1 block text-xs leading-5 opacity-80">
                      Enter a specific topic to focus on.
                    </span>
                  </button>
                </div>

                <p className="mt-2 text-xs leading-5 text-[#667085]">
                  {generateForm.generation_mode === "job_description"
                    ? "Generation will use the job description as context and consider all confirmed skills linked to the job."
                    : generateForm.generation_mode === "selected_skills"
                      ? "Choose one or more confirmed job skills below. Generated questions will focus on your selection."
                      : "Enter a custom topic below and select the existing job skill(s) to associate the generated questions with. This also supports topics not explicitly listed in the JD."}
                </p>
              </Field>

              {generateForm.generation_mode === "custom_topic" && (
                <Field label="Custom skill or topic">
                  <textarea
                    value={generateForm.custom_topic}
                    onChange={(event) =>
                      setGenerateForm((current) => ({
                        ...current,
                        custom_topic: event.target.value,
                      }))
                    }
                    maxLength={500}
                    rows={3}
                    required
                    placeholder="e.g. SQL query optimization, window functions, deadlock debugging, Kubernetes deployments..."
                    className="field w-full resize-y"
                  />
                  <p className="mt-1 text-xs text-[#98A2B3]">
                    Describe what the questions should test. You can include a
                    technology, concept, practical scenario, or debugging topic.
                  </p>
                </Field>
              )}

              {generateForm.generation_mode !== "job_description" &&
                getSelectedJob() && (
                getSelectedJob()?.skills?.length > 0 ? (
                  <Field
                    label={
                      generateForm.generation_mode === "custom_topic"
                        ? "Skills to associate with generated questions"
                        : "Skills"
                    }
                  >
                    <div className="relative">
                      <button
                        type="button"
                        aria-haspopup="listbox"
                        aria-expanded={skillsDropdownOpen}
                        onClick={() =>
                          setSkillsDropdownOpen((current) => !current)
                        }
                        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-[#D9DEE7] bg-white px-4 py-3 text-left transition hover:border-[#A9A9E8] focus:outline-none focus:ring-2 focus:ring-[#5658E8]/15"
                      >
                        <span>
                          <span className="block text-sm font-medium text-[#344054]">
                            {(() => {
                              const allSkills = getSelectedJob()?.skills || [];
                              const selectedIds =
                                generateForm.skill_ids.length > 0
                                  ? generateForm.skill_ids.map(Number)
                                  : allSkills.map((skill) => Number(skill.id));

                              return `${selectedIds.length} of ${allSkills.length} skills selected`;
                            })()}
                          </span>
                          <span className="mt-0.5 block text-xs text-[#98A2B3]">
                            Choose the skills to generate questions for
                          </span>
                        </span>
                        <span className="text-lg text-[#667085]" aria-hidden="true">
                          {skillsDropdownOpen ? "▴" : "▾"}
                        </span>
                      </button>

                      {skillsDropdownOpen && (
                        <div className="absolute left-0 right-0 z-40 mt-2 overflow-hidden rounded-xl border border-[#E3E6EB] bg-white shadow-[0_16px_40px_rgba(27,37,58,0.14)]">
                          <div className="flex items-center justify-between border-b border-[#EEF0F3] px-4 py-3">
                            <span className="text-xs font-semibold uppercase tracking-wide text-[#667085]">
                              Available skills
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setGenerateForm((current) => ({
                                  ...current,
                                  skill_ids: (getSelectedJob()?.skills || []).map(
                                    (skill) => Number(skill.id)
                                  ),
                                }))
                              }
                              className="text-xs font-semibold text-[#5658E8] hover:text-[#4143C8]"
                            >
                              Select all
                            </button>
                          </div>

                          <div
                            role="listbox"
                            aria-label="Choose skills for question generation"
                            aria-multiselectable="true"
                            className="max-h-56 overflow-y-auto p-2"
                          >
                            {getSelectedJob().skills.map((skill) => {
                              const id = Number(skill.id);
                              const allSkillIds = getSelectedJob().skills.map(
                                (item) => Number(item.id)
                              );
                              const selectedIds =
                                generateForm.skill_ids.length > 0
                                  ? generateForm.skill_ids.map(Number)
                                  : allSkillIds;
                              const checked = selectedIds.includes(id);

                              return (
                                <label
                                  key={id}
                                  className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition ${
                                    checked
                                      ? "bg-[#F4F2FF] text-[#493E8C]"
                                      : "text-[#344054] hover:bg-[#F8F9FC]"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() =>
                                      setGenerateForm((current) => {
                                        const currentIds =
                                          current.skill_ids.length > 0
                                            ? current.skill_ids.map(Number)
                                            : allSkillIds;

                                        const nextIds = checked
                                          ? currentIds.filter(
                                              (item) => item !== id
                                            )
                                          : [...currentIds, id];

                                        // An empty list means "all skills" to
                                        // the existing generation API. Keep at
                                        // least one explicitly selected.
                                        if (nextIds.length === 0) {
                                          return current;
                                        }

                                        return {
                                          ...current,
                                          skill_ids: [...new Set(nextIds)],
                                        };
                                      })
                                    }
                                    className="h-4 w-4 rounded border-[#C8CDD8] accent-[#5658E8]"
                                  />
                                  <span className="flex-1 text-sm font-medium">
                                    {skill.name}
                                  </span>
                                  {checked && (
                                    <span className="text-xs font-semibold text-[#5658E8]">
                                      Selected
                                    </span>
                                  )}
                                </label>
                              );
                            })}
                          </div>

                          <div className="flex items-center justify-between gap-3 border-t border-[#EEF0F3] bg-[#FCFCFE] px-4 py-3">
                            <span className="text-xs text-[#667085]">
                              You can select multiple skills.
                            </span>
                            <button
                              type="button"
                              onClick={() => setSkillsDropdownOpen(false)}
                              className="rounded-lg bg-[#5658E8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#494BD8]"
                            >
                              Done
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </Field>
                ) : (
                  <p className="rounded-xl border border-[#E3E6EB] bg-[#F8F9FC] px-4 py-3 text-sm text-[#667085]">
                    No skills are associated with this job. Generation will use
                    the available job assessment scope.
                  </p>
                )
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Number of Questions">
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={
                      generateForm.number_of_questions
                    }
                    onChange={(
                      event
                    ) =>
                      setGenerateForm(
                        (
                          current
                        ) => ({
                          ...current,
                          number_of_questions:
                            Number(
                              event
                                .target
                                .value
                            ),
                        })
                      )
                    }
                    className="field"
                  />
                </Field>

                <Field label="Difficulty">
                  <select
                    value={
                      generateForm.difficulty
                    }
                    onChange={(
                      event
                    ) =>
                      setGenerateForm(
                        (
                          current
                        ) => ({
                          ...current,
                          difficulty:
                            event
                              .target
                              .value,
                        })
                      )
                    }
                    className="field"
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
                </Field>
              </div>

              <div className="rounded-xl border border-[#DDD6F3] bg-[#FBFAFF] p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#EAE5F9] text-[#7862C8]">
                    <Sparkles
                      size={16}
                    />
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-[#4C427C]">
                      AI generation
                    </p>

                    <p className="mt-1 text-[11px] leading-5 text-[#7A7396]">
                      Generated questions are stored for review and are not automatically approved.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-[#EEF0F3] pt-5">
                <button
                  type="button"
                  onClick={() =>
                    setShowGenerateModal(
                      false
                    )
                  }
                  className="h-10 rounded-lg border border-[#D9DEE7] px-4 text-xs font-semibold text-[#667085]"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={
                    generating ||
                    !generateForm.job_id
                  }
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#5658E8] px-5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {generating && (
                    <RefreshCw
                      size={13}
                      className="animate-spin"
                    />
                  )}

                  {generating
                    ? "Generating..."
                    : "Generate Questions"}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </RecruiterLayout>
  );
}

function YearPill({
  active,
  label,
  count,
  onClick,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group inline-flex min-w-[82px] items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-left transition focus:outline-none focus:ring-2 focus:ring-[#5658E8]/20 ${
        active
          ? "bg-[#5658E8] text-white shadow-[0_6px_14px_rgba(86,88,232,0.16)]"
          : "bg-white text-[#475467] hover:bg-[#F6F4FD] hover:text-[#5658E8]"
      }`}
    >
      <span className="text-xs font-semibold">
        {label}
      </span>

      <span
        className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
          active
            ? "bg-white/15 text-white"
            : "bg-[#F2F4F7] text-[#98A2B3] group-hover:bg-white group-hover:text-[#5658E8]"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function Field({
  label,
  children,
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold text-[#475467]">
        {label}
      </span>

      {children}
    </label>
  );
}

function MetricCard({
  icon,
  label,
  value,
  description,
  onClick,
  selected = false,
  doodle = "questions",
}) {
  const tones = {
    questions: "#5273C8",
    approved: "#338777",
    pending: "#B78339",
    rejected: "#B55F7A",
  };

  const tone = tones[doodle] || tones.questions;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={Boolean(selected)}
      aria-label={`${label}: ${value}. ${
        selected ? "Currently selected filter." : "Click to filter the question list."
      }`}
      className={`group relative flex min-h-[166px] w-full flex-col overflow-hidden rounded-2xl border p-5 text-left transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5660DE] focus-visible:ring-offset-2 ${
        selected
          ? "border-[#BBC4F1] bg-[#F8F9FF] shadow-[0_5px_16px_rgba(56,66,130,0.08)]"
          : "border-[#DCE2EA] bg-white hover:-translate-y-1 hover:border-[#C5CDE3] hover:shadow-[0_14px_28px_rgba(35,47,85,0.10)]"
      }`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-2 -top-3 h-28 w-32 opacity-25 transition-all duration-300 group-hover:rotate-3 group-hover:scale-110 group-hover:opacity-65"
      >
        <svg
          viewBox="0 0 128 112"
          fill="none"
          stroke={tone}
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-full w-full"
        >
          {doodle === "questions" && (
            <>
              <path d="M17 64 C27 53 32 73 43 59 S59 45 69 56 S86 72 98 48" />
              <path d="M30 30 C42 17 52 34 47 42 C43 48 36 48 36 55" />
              <circle cx="37" cy="63" r="1.8" fill={tone} />
              <circle cx="95" cy="77" r="8" />
              <path d="M89 77h12 M95 71v12" />
              <circle cx="79" cy="30" r="3" />
              <path d="M19 88c7-7 13-7 20 0" />
            </>
          )}

          {doodle === "approved" && (
            <>
              <circle cx="73" cy="47" r="24" />
              <path d="m61 47 8 8 17-19" strokeWidth="2.5" />
              <path d="M20 76c7-8 15-8 22 0s15 8 22 0" />
              <circle cx="104" cy="22" r="4" />
              <path d="M27 29l4 4 8-9" />
              <path d="M91 82l5 5 11-13" />
            </>
          )}

          {doodle === "pending" && (
            <>
              <circle cx="73" cy="50" r="24" strokeDasharray="4 5" />
              <path d="M73 35v16l11 7" strokeWidth="2.2" />
              <path d="M21 34c7-6 15-6 22 0s15 6 22 0" />
              <circle cx="30" cy="79" r="5" />
              <circle cx="102" cy="83" r="3" />
              <path d="m19 93 7-4 7 4" />
            </>
          )}

          {doodle === "rejected" && (
            <>
              <path d="M52 31 C62 18 86 23 91 41 S89 72 73 76 S47 63 52 48" />
              <path d="m64 42 19 19 M83 42 64 61" strokeWidth="2.4" />
              <path d="M16 68c9-12 17 12 27 0s17 12 27 0" />
              <circle cx="101" cy="22" r="4" />
              <circle cx="35" cy="28" r="2.5" />
              <path d="m98 80 5 5-5 5" />
            </>
          )}
        </svg>
      </span>

      <span className="relative z-10 flex w-full items-start justify-between gap-4">
        <span className="min-w-0">
          <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-[#6B7485]">
            {label}
          </span>

          <span
            className="mt-3 block text-[32px] font-semibold leading-none tracking-[-0.045em] text-[#182033]"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {value}
          </span>
        </span>

        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-white/90 transition-transform duration-200 group-hover:rotate-[-4deg] group-hover:scale-105"
          style={{
            color: tone,
            borderColor: `${tone}35`,
          }}
        >
          {icon}
        </span>
      </span>

      <span className="relative z-10 mt-4 block text-xs leading-5 text-[#727D8F]">
        {description}
      </span>

      <span
        className={`relative z-10 mt-auto flex items-center justify-between pt-3 text-[11px] font-medium transition-colors ${
          selected
            ? "text-[#4C5CB2]"
            : "text-[#8A93A2] group-hover:text-[#4656A6]"
        }`}
      >
        <span>
          {selected ? "Filter selected" : "Click to filter"}
        </span>
        <span
          aria-hidden="true"
          className="inline-block transition-transform duration-200 group-hover:translate-x-1"
        >
          →
        </span>
      </span>

      {selected && (
        <span
          aria-hidden="true"
          className="absolute inset-x-5 bottom-0 h-[3px] rounded-t-full"
          style={{ backgroundColor: tone }}
        />
      )}
    </button>
  );
}


function Modal({
  title,
  subtitle,
  children,
  onClose,
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#14162B]/55 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-[700px] overflow-y-auto rounded-[24px] border border-[#E0E3EA] bg-white shadow-[0_28px_90px_rgba(20,22,43,0.25)]">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-[#EEF0F3] bg-white px-6 py-5">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#202938]">
              {title}
            </h2>

            <p className="mt-1 text-xs leading-5 text-[#667085]">
              {subtitle}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[#667085] transition hover:bg-[#F5F6F8] hover:text-[#202938]"
            aria-label="Close"
          >
            <X size={17} />
          </button>
        </div>

        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
}

export default QuestionBank;