import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  FileText,
  Info,
  ListChecks,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  LockKeyhole,
  Pencil,
  X,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import RecruiterLayout from "../layouts/RecruiterLayout";

const SECTION_DEFINITIONS = [
  {
    letter: "A",
    type: "conceptual",
    title: "Conceptual",
    defaultName: "Core Fundamentals",
    description:
      "Easy-level questions that test fundamentals, concepts, principles, definitions, comparisons and reasoning.",
    typeNote: "Easy only · MCQ",
    difficulties: ["easy"],
  },
  {
    letter: "B",
    type: "implementation",
    title: "Implementation",
    defaultName: "Implementation & Applied Reasoning",
    description:
      "Practical questions using code snippets, output prediction, SQL, debugging, APIs, configuration and implementation decisions.",
    typeNote: "Easy · Medium · Hard · MCQ",
    difficulties: ["easy", "medium", "hard"],
  },
  {
    letter: "C",
    type: "free_text",
    title: "Evaluation",
    defaultName: "Evaluation & Open Response",
    description:
      "Evaluation-oriented questions. Each slot can be MCQ or Free Text; Free Text uses rubric-based evaluation guidance.",
    typeNote: "Easy · Medium · MCQ or Free Text",
    difficulties: ["easy", "medium", "hard"],
  },
];

const DIFFICULTY_LABELS = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

function AssessmentConfig() {
  const { questionSetId } = useParams();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [configuration, setConfiguration] = useState(null);
  const [sections, setSections] = useState([]);
  const [availableSkills, setAvailableSkills] = useState([]);
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [candidateInstructions, setCandidateInstructions] =
    useState("Attempt all.");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingSectionId, setSavingSectionId] = useState(null);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [success, setSuccess] = useState("");
  const [openSkillPicker, setOpenSkillPicker] = useState(null);
  const [editing, setEditing] = useState(false);
  const [hasAcceptedQuestions, setHasAcceptedQuestions] =
    useState(false);
  const [loadingAuthoringState, setLoadingAuthoringState] =
    useState(true);

  const [expandedSections, setExpandedSections] =
    useState(() => new Set([0, 1, 2]));

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

    return typeof detail === "string"
      ? detail
      : fallback;
  };

  const handleAuthError = (err) => {
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

  const normalizeSection = (
    section,
    index
  ) => {
    const definition =
      SECTION_DEFINITIONS[index];

    const sourceSkills = Array.isArray(
      section?.skills
    )
      ? section.skills
      : [];

    return {
      id: section.id,
      name:
        section.name ||
        definition.defaultName,

      sectionType:
        definition.type,

      displayOrder:
        index + 1,

      targetQuestions:
        sourceSkills.reduce(
          (sum, item) =>
            sum +
            Number(
              item.easy_count || 0
            ) +
            Number(
              item.medium_count || 0
            ) +
            Number(
              item.hard_count || 0
            ),
          0
        ),

      skills: sourceSkills
        .map((item) => ({
          skillId: Number(
            item.skill_id
          ),
          easy: Number(
            item.easy_count || 0
          ),
          medium: Number(
            item.medium_count || 0
          ),
          hard: Number(
            item.hard_count || 0
          ),
        }))
        .filter(
          (item) =>
            item.skillId > 0
        ),
    };
  };

  const loadData = async (
    showRefresh = false
  ) => {
    if (!questionSetId) {
      return;
    }

    try {
      setError("");

      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const [
        configResponse,
        sectionResponse,
        skillsResponse,
        authoringResponse,
      ] = await Promise.all([
        api.get(
          `/question-sets/${questionSetId}/configuration`
        ),
        api.get(
          `/sections?question_set_id=${questionSetId}`
        ),
        api.get(
          `/assessment-authoring/question-sets/${questionSetId}/skills`
        ),
        api.get(
          `/assessment-authoring/question-sets/${questionSetId}`
        ),
      ]);

      const sectionData =
        Array.isArray(
          sectionResponse.data
        )
          ? [
              ...sectionResponse.data,
            ].sort(
              (a, b) =>
                Number(
                  a.display_order ||
                    a.id
                ) -
                Number(
                  b.display_order ||
                    b.id
                )
            )
          : [];

      const normalized =
        SECTION_DEFINITIONS.map(
          (_, index) => {
            const source =
              sectionData[index] || {
                id: null,
                name:
                  SECTION_DEFINITIONS[
                    index
                  ].defaultName,
                skills: [],
              };

            return normalizeSection(
              source,
              index
            );
          }
        );

      setConfiguration(
        configResponse.data
      );

      setDurationMinutes(
        String(
          configResponse.data
            ?.duration_minutes || 60
        )
      );

      setCandidateInstructions(
        configResponse.data
          ?.candidate_instructions ||
          ""
      );

      setSections(
        normalized
      );

      setAvailableSkills(
        (
          Array.isArray(
            skillsResponse.data
          )
            ? skillsResponse.data
            : []
        ).sort((a, b) =>
          String(
            a.name || ""
          ).localeCompare(
            String(
              b.name || ""
            )
          )
        )
      );

      const blueprintReady =
        normalized.length === 3 &&
        normalized.every(
          (section) =>
            isSectionReady(section)
        );

      setEditing(
        (current) =>
          current ||
          (!blueprintReady &&
            !Boolean(
              configResponse.data
                ?.status ===
                "locked"
            ))
      );

      const authoringSets =
        Array.isArray(
          authoringResponse.data
            ?.sets
        )
          ? authoringResponse.data
              .sets
          : [];

      const accepted =
        authoringSets.some(
          (assessmentSet) =>
            Array.isArray(
              assessmentSet?.slots
            ) &&
            assessmentSet.slots.some(
              (slot) =>
                Boolean(
                  slot?.current_question
                )
            )
        );

      setHasAcceptedQuestions(
        accepted
      );
    } catch (err) {
      console.error(
        "Failed to load assessment blueprint:",
        err
      );

      if (
        handleAuthError(err)
      ) {
        return;
      }

      setError(
        getErrorMessage(
          err,
          "Unable to load the assessment blueprint."
        )
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingAuthoringState(
        false
      );
    }
  };

  useEffect(() => {
    loadData();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionSetId]);

  const totalQuestions =
    useMemo(
      () =>
        sections.reduce(
          (
            sum,
            section
          ) =>
            sum +
            Number(
              section.targetQuestions ||
                0
            ),
          0
        ),
      [sections]
    );

  const allocationTotal = (
    section
  ) =>
    section.skills.reduce(
      (
        sum,
        skill
      ) =>
        sum +
        skill.easy +
        skill.medium +
        skill.hard,
      0
    );

  const validSection = (
    section
  ) => {
    if (!section.id) {
      return false;
    }

    if (
      section.skills.length === 0
    ) {
      return false;
    }

    if (
      section.targetQuestions <=
      0
    ) {
      return false;
    }

    if (
      allocationTotal(
        section
      ) !==
      section.targetQuestions
    ) {
      return false;
    }

    return section.skills.every(
      (skill) =>
        section.sectionType ===
        "conceptual"
          ? skill.easy > 0 ||
            (skill.medium === 0 &&
              skill.hard === 0)
          : skill.easy +
              skill.medium +
              skill.hard >
            0
    );
  };

  const allValid =
    sections.length === 3 &&
    sections.every(
      validSection
    );

  const skillName = (
    skillId
  ) =>
    availableSkills.find(
      (skill) =>
        Number(skill.id) ===
        Number(skillId)
    )?.name ||
    `Skill #${skillId}`;

  const selectedSkillIds = (
    section
  ) =>
    section.skills.map(
      (skill) =>
        Number(skill.skillId)
    );

  const toggleSkill = (
    sectionIndex,
    skillId
  ) => {
    setSections(
      (current) =>
        current.map(
          (
            section,
            index
          ) => {
            if (
              index !==
              sectionIndex
            ) {
              return section;
            }

            const exists =
              section.skills.some(
                (skill) =>
                  Number(
                    skill.skillId
                  ) ===
                  Number(
                    skillId
                  )
              );

            if (exists) {
              return {
                ...section,

                skills:
                  section.skills.filter(
                    (skill) =>
                      Number(
                        skill.skillId
                      ) !==
                      Number(
                        skillId
                      )
                  ),
              };
            }

            return {
              ...section,

              skills: [
                ...section.skills,

                {
                  skillId:
                    Number(
                      skillId
                    ),

                  easy: 0,
                  medium: 0,
                  hard: 0,
                },
              ],
            };
          }
        )
    );
  };

  const updateTarget = (
    sectionIndex,
    value
  ) => {
    const parsed = Math.max(
      0,
      Number(value || 0)
    );

    setSections(
      (current) =>
        current.map(
          (
            section,
            index
          ) =>
            index ===
            sectionIndex
              ? {
                  ...section,
                  targetQuestions:
                    parsed,
                }
              : section
        )
    );
  };

  const updateAllocation = (
    sectionIndex,
    skillId,
    difficulty,
    value
  ) => {
    const parsed = Math.max(
      0,
      Number(value || 0)
    );

    setSections(
      (current) =>
        current.map(
          (
            section,
            index
          ) => {
            if (
              index !==
              sectionIndex
            ) {
              return section;
            }

            return {
              ...section,

              skills:
                section.skills.map(
                  (skill) =>
                    Number(
                      skill.skillId
                    ) ===
                    Number(
                      skillId
                    )
                      ? {
                          ...skill,
                          [difficulty]:
                            parsed,
                        }
                      : skill
                ),
            };
          }
        )
    );
  };

  const distributeEvenly = (
    sectionIndex
  ) => {
    setSections(
      (current) =>
        current.map(
          (
            section,
            index
          ) => {
            if (
              index !==
                sectionIndex ||
              section.skills
                .length === 0
            ) {
              return section;
            }

            const target =
              Math.max(
                0,
                Number(
                  section.targetQuestions ||
                    0
                )
              );

            const next =
              section.skills.map(
                (skill) => ({
                  ...skill,
                  easy: 0,
                  medium: 0,
                  hard: 0,
                })
              );

            if (
              section.sectionType ===
              "conceptual"
            ) {
              for (
                let i = 0;
                i < target;
                i += 1
              ) {
                next[
                  i %
                    next.length
                ].easy += 1;
              }
            } else {
              const base =
                Math.floor(
                  target /
                    next.length
                );

              let remainder =
                target %
                next.length;

              next.forEach(
                (skill) => {
                  skill.medium =
                    base;

                  if (
                    remainder >
                    0
                  ) {
                    skill.medium +=
                      1;
                    remainder -=
                      1;
                  }
                }
              );
            }

            return {
              ...section,
              skills: next,
            };
          }
        )
    );
  };

  const getSectionTone = (
    index
  ) => {
    const tones = [
      {
        accent:
          "#6756B8",
        soft:
          "#F0EBFB",
        lighter:
          "#F8F6FD",
        border:
          "#DDD6F3",
        text:
          "#55479F",
      },
      {
        accent:
          "#0F9D8A",
        soft:
          "#E5F7F3",
        lighter:
          "#F3FBF9",
        border:
          "#C9EAE3",
        text:
          "#08776A",
      },
      {
        accent:
          "#B85C87",
        soft:
          "#F8EAF1",
        lighter:
          "#FDF6FA",
        border:
          "#E9D3DE",
        text:
          "#964667",
      },
    ];

    return (
      tones[index] ||
      tones[0]
    );
  };

  const toggleSection = (
    index
  ) => {
    setExpandedSections(
      (current) => {
        const next =
          new Set(
            current
          );

        if (
          next.has(index)
        ) {
          next.delete(index);
        } else {
          next.add(index);
        }

        return next;
      }
    );
  };

  const jumpToSection = (
    index
  ) => {
    setExpandedSections(
      (current) => {
        const next =
          new Set(
            current
          );

        next.add(index);

        return next;
      }
    );

    window.setTimeout(
      () => {
        document
          .getElementById(
            `assessment-section-${index}`
          )
          ?.scrollIntoView({
            behavior:
              "smooth",
            block: "start",
          });
      },
      20
    );
  };

  const isBlueprintConfigured =
    Boolean(configuration) &&
    sections.length === 3 &&
    sections.every(
      (section) =>
        Boolean(section.id) &&
        section.skills.length >
          0 &&
        Number(
          section.targetQuestions ||
            0
        ) > 0
    );

  const canEditBlueprint =
    !hasAcceptedQuestions;

  const enterEditMode =
    () => {
      setSaveError("");
      setSuccess("");
      setOpenSkillPicker(
        null
      );
      setEditing(true);
    };

  const cancelEdit =
    () => {
      setSaveError("");
      setSuccess("");
      setOpenSkillPicker(
        null
      );
      setEditing(false);
      loadData(true);
    };

  const isSectionReady = (
    section
  ) => {
    if (
      !section?.id ||
      section.skills.length ===
        0
    ) {
      return false;
    }

    const assigned =
      allocationTotal(
        section
      );

    return (
      Number(
        section.targetQuestions ||
          0
      ) > 0 &&
      assigned ===
        Number(
          section.targetQuestions ||
            0
        )
    );
  };

  const saveSingleSection =
    async (
      sectionIndex
    ) => {
      const section =
        sections[
          sectionIndex
        ];

      if (
        !section ||
        !canEditBlueprint ||
        !isSectionReady(
          section
        )
      ) {
        setSaveError(
          "Choose at least one JD skill, set a positive question count, and make the allocations match the section total."
        );
        return;
      }

      try {
        setSavingSectionId(
          section.id
        );

        setSaveError("");
        setSuccess("");

        const response =
          await api.put(
            `/sections/${section.id}`,
            {
              name:
                section.name.trim() ||
                SECTION_DEFINITIONS[
                  sectionIndex
                ]
                  .defaultName,

              section_type:
                section.sectionType,

              display_order:
                section.displayOrder,

              skills:
                section.skills.map(
                  (skill) => ({
                    skill_id:
                      skill.skillId,

                    easy_count:
                      skill.easy,

                    medium_count:
                      section.sectionType ===
                      "conceptual"
                        ? 0
                        : skill.medium,

                    hard_count:
                      section.sectionType ===
                      "conceptual"
                        ? 0
                        : skill.hard,
                  })
                ),
            }
          );

        const normalizedSavedSection =
          response.data?.id
            ? normalizeSection(
                response.data,
                sectionIndex
              )
            : section;

        setSections(
          (current) =>
            current.map(
              (
                item,
                index
              ) =>
                index ===
                sectionIndex
                  ? normalizedSavedSection
                  : item
            )
        );

        const configuredTotal =
          sections.reduce(
            (
              sum,
              item,
              index
            ) =>
              sum +
              (index ===
              sectionIndex
                ? Number(
                    normalizedSavedSection.targetQuestions ||
                      0
                  )
                : isSectionReady(
                      item
                    )
                  ? Number(
                      item.targetQuestions ||
                        0
                    )
                  : 0),
            0
          );

        await api.put(
          `/assessment-authoring/question-sets/${questionSetId}/partial-configuration`,
          {
            total_questions:
              configuredTotal,

            duration_minutes:
              Number(
                durationMinutes
              ),

            candidate_instructions:
              candidateInstructions.trim() ||
              null,
          }
        );

        await api.post(
          `/assessment-authoring/question-sets/${questionSetId}/bootstrap`
        );

        setSuccess(
          `${SECTION_DEFINITIONS[sectionIndex].title} section saved. Its question slots are now available in the Question Set Builder.`
        );
      } catch (err) {
        console.error(
          "Failed to save assessment section:",
          err
        );

        if (
          handleAuthError(
            err
          )
        ) {
          return;
        }

        setSaveError(
          getErrorMessage(
            err,
            "Unable to save this assessment section."
          )
        );
      } finally {
        setSavingSectionId(
          null
        );
      }
    };

  const handleSave =
    async (event) => {
      event.preventDefault();

      setSaveError("");
      setSuccess("");

      const duration =
        Number(
          durationMinutes
        );

      if (
        !Number.isInteger(
          duration
        ) ||
        duration <= 0
      ) {
        setSaveError(
          "Duration must be a positive whole number."
        );
        return;
      }

      try {
        setSaving(true);

        if (
          !canEditBlueprint
        ) {
          const configResponse =
            await api.put(
              `/question-sets/${questionSetId}/configuration`,
              {
                total_questions:
                  totalQuestions,

                duration_minutes:
                  duration,

                candidate_instructions:
                  candidateInstructions.trim() ||
                  null,
              }
            );

          setConfiguration(
            configResponse.data
          );

          setDurationMinutes(
            String(
              configResponse
                .data
                .duration_minutes
            )
          );

          setSuccess(
            "Assessment settings updated. The question blueprint remains locked because this set already contains an accepted question."
          );

          setEditing(
            false
          );

          return;
        }

        if (!allValid) {
          setSaveError(
            "Complete each section: choose at least one JD skill, set a question target, and make the skill allocations equal the section target."
          );

          return;
        }

        const saveOrder =
          [
            ...sections,
          ].sort(
            (a, b) => {
              const aIsConceptual =
                a.sectionType ===
                "conceptual";

              const bIsConceptual =
                b.sectionType ===
                "conceptual";

              if (
                aIsConceptual !==
                bIsConceptual
              ) {
                return aIsConceptual
                  ? 1
                  : -1;
              }

              return (
                Number(
                  a.displayOrder ||
                    0
                ) -
                Number(
                  b.displayOrder ||
                    0
                )
              );
            }
          );

        for (
          const section of
            saveOrder
        ) {
          const index =
            sections.findIndex(
              (item) =>
                Number(
                  item.id
                ) ===
                Number(
                  section.id
                )
            );

          const response =
            await api.put(
              `/sections/${section.id}`,
              {
                name:
                  section.name.trim() ||
                  SECTION_DEFINITIONS[
                    index
                  ]
                    .defaultName,

                section_type:
                  section.sectionType,

                display_order:
                  section.displayOrder,

                skills:
                  section.skills.map(
                    (
                      skill
                    ) => ({
                      skill_id:
                        skill.skillId,

                      easy_count:
                        skill.easy,

                      medium_count:
                        section.sectionType ===
                        "conceptual"
                          ? 0
                          : skill.medium,

                      hard_count:
                        section.sectionType ===
                        "conceptual"
                          ? 0
                          : skill.hard,
                    })
                  ),
              }
            );

          if (
            response.data?.id
          ) {
            setSections(
              (current) =>
                current.map(
                  (item) =>
                    Number(
                      item.id
                    ) ===
                    Number(
                      section.id
                    )
                      ? normalizeSection(
                          response.data,
                          index
                        )
                      : item
                )
            );
          }
        }

        const configResponse =
          await api.put(
            `/question-sets/${questionSetId}/configuration`,
            {
              total_questions:
                totalQuestions,

              duration_minutes:
                duration,

              candidate_instructions:
                candidateInstructions.trim() ||
                null,
            }
          );

        setConfiguration(
          configResponse.data
        );

        setDurationMinutes(
          String(
            configResponse
              .data
              .duration_minutes
          )
        );

        setSuccess(
          "Blueprint saved. Opening the question-authoring workspace."
        );

        setEditing(
          false
        );

        setHasAcceptedQuestions(
          false
        );

        window.setTimeout(
          () => {
            navigate(
              `/manager/question-sets/${questionSetId}/questions`
            );
          },
          350
        );
      } catch (err) {
        console.error(
          "Failed to save assessment blueprint:",
          err
        );

        if (
          handleAuthError(
            err
          )
        ) {
          return;
        }

        setSaveError(
          getErrorMessage(
            err,
            "Unable to save the assessment blueprint."
          )
        );
      } finally {
        setSaving(false);
      }
    };

  if (loading) {
    return (
      <RecruiterLayout
        title="Assessment Setup"
        breadcrumb="Workspace / Question Sets"
      >
        <main className="mx-auto flex min-h-[65vh] max-w-[1180px] items-center justify-center px-6">
          <div className="text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#D7DAE3] border-t-[#5759E7]" />

            <p className="mt-4 text-sm font-semibold text-[#344054]">
              Loading assessment blueprint
            </p>
          </div>
        </main>
      </RecruiterLayout>
    );
  }

  if (error) {
    return (
      <RecruiterLayout
        title="Assessment Setup"
        breadcrumb="Workspace / Question Sets"
      >
        <main className="mx-auto flex min-h-[65vh] max-w-[1180px] items-center justify-center px-6">
          <div className="w-full max-w-xl rounded-[22px] border border-[#F0D5D5] bg-white p-8 shadow-[0_12px_30px_rgba(38,40,79,0.04)]">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FCE8E8] text-[#B42318]">
              <AlertCircle size={19} />
            </div>

            <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-[#172033]">
              Assessment setup unavailable
            </h1>

            <p className="mt-3 text-sm leading-6 text-[#667085]">
              {error}
            </p>

            <button
              type="button"
              onClick={() =>
                loadData()
              }
              className="mt-6 inline-flex h-10 items-center gap-2 rounded-xl bg-[#5658D8] px-4 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(86,88,216,0.15)] transition hover:-translate-y-0.5 hover:bg-[#4E50C5]"
            >
              <RefreshCw size={14} />
              Try again
            </button>
          </div>
        </main>
      </RecruiterLayout>
    );
  }

  return (
    <RecruiterLayout
      title="Assessment Setup"
      breadcrumb={`Workspace / Question Sets / #${questionSetId}`}
    >
      <main className="mx-auto max-w-[1240px] px-5 pb-16 text-[#172033] lg:px-8">

        {/* =====================================================
            PAGE HEADER
        ===================================================== */}

        <div className="relative overflow-hidden rounded-[24px] border border-[#DDE2EA] bg-gradient-to-br from-[#F8F9FC] via-white to-[#F1EFFC] px-6 pb-7 pt-5 shadow-[0_14px_36px_rgba(38,40,79,0.055)]">

          <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-[#DCD8F7]/45 blur-[55px]" />

          <div className="pointer-events-none absolute bottom-[-70px] left-[22%] h-44 w-44 rounded-full bg-[#D5EFEA]/35 blur-[50px]" />

          <button
            type="button"
            onClick={() =>
              navigate(-1)
            }
            className="relative z-10 inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-[#667085] transition hover:bg-white/80 hover:text-[#172033]"
          >
            <ArrowLeft size={14} />
            Back
          </button>

          <div className="relative z-10 mt-5 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">

            <div>

              <div className="inline-flex w-fit items-center gap-2 rounded-full bg-[#EAE7FB] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#5B4DAA]">
                <Settings2 size={13} />
                Assessment blueprint
              </div>

              <h1 className="mt-3 text-[32px] font-semibold tracking-[-0.04em] text-[#121A2A] sm:text-[40px]">
                Assessment configuration
              </h1>

              <p className="mt-3 max-w-3xl text-[15px] leading-7 text-[#5F6B7A]">
                {editing
                  ? "Edit the saved assessment blueprint. Changes are applied to the existing configuration."
                  : "Review the saved assessment blueprint. Use Edit blueprint when you need to make changes."}
              </p>

            </div>

            <button
              type="button"
              onClick={() =>
                loadData(true)
              }
              disabled={
                refreshing ||
                saving
              }
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#D1D6E1] bg-white/95 px-4 text-sm font-semibold text-[#475467] shadow-sm transition hover:-translate-y-0.5 hover:border-[#6756B8] hover:text-[#6756B8] disabled:opacity-50"
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
        </div>


        {/* =====================================================
            STATUS BANNER
        ===================================================== */}

        {isBlueprintConfigured &&
          !editing && (
            <section className="mt-5 overflow-hidden rounded-[20px] border border-[#D9E5DE] bg-gradient-to-r from-[#F5FBF7] via-white to-[#F9F7FF] shadow-[0_10px_28px_rgba(38,40,79,0.04)]">

              <div className="flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">

                <div className="flex items-start gap-3">

                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#E2F3EA] text-[#28734E] shadow-sm">
                    <LockKeyhole
                      size={17}
                    />
                  </div>

                  <div>

                    <div className="flex flex-wrap items-center gap-2">

                      <p className="text-[15px] font-semibold text-[#1D2939]">
                        Blueprint saved
                      </p>

                      <span className="rounded-full border border-[#CFE4D9] bg-[#F7FCF9] px-2.5 py-1 text-[10px] font-semibold text-[#28734E]">
                        {hasAcceptedQuestions
                          ? "Structure locked"
                          : "Draft"}
                      </span>

                    </div>

                    <p className="mt-1.5 max-w-2xl text-[13px] leading-6 text-[#5F6B7A]">
                      {hasAcceptedQuestions
                        ? "This assessment already has an accepted question. Section, skill and difficulty rules stay fixed; duration and candidate instructions can still be edited."
                        : "Your saved blueprint is preserved. Reopen Edit blueprint to change the section and allocation rules."}
                    </p>

                  </div>

                </div>


                <div className="flex flex-wrap items-center gap-2">

                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        `/manager/question-sets/${questionSetId}/questions`
                      )
                    }
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#D4D8E2] bg-white px-4 text-sm font-semibold text-[#475467] shadow-sm transition hover:-translate-y-0.5 hover:border-[#6756B8] hover:text-[#5B4DAA]"
                  >
                    <ListChecks
                      size={13}
                    />
                    Continue to question authoring
                    <ArrowRight
                      size={13}
                    />
                  </button>

                  <button
                    type="button"
                    onClick={
                      enterEditMode
                    }
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#5658D8] px-4 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(86,88,216,0.18)] transition hover:-translate-y-0.5 hover:bg-[#4E50C5]"
                  >
                    <Pencil
                      size={13}
                    />
                    Edit blueprint
                  </button>

                </div>

              </div>

            </section>
          )}


        {/* =====================================================
            MESSAGES
        ===================================================== */}

        {(saveError ||
          success) && (
          <div
            className={`mt-5 rounded-xl border px-4 py-3.5 text-sm leading-6 ${
              saveError
                ? "border-[#EBCACA] bg-[#FFF5F5] text-[#9F3F3F]"
                : "border-[#CFE4D9] bg-[#F3FAF6] text-[#28734E]"
            }`}
          >
            <div className="flex items-start gap-2">
              {saveError ? (
                <X size={14} />
              ) : (
                <Check size={14} />
              )}

              <span>
                {saveError ||
                  success}
              </span>
            </div>
          </div>
        )}


        <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">

          <form
            onSubmit={
              handleSave
            }
          >

            {/* =================================================
                SECTION BLUEPRINT
            ================================================= */}

            <section className="overflow-hidden rounded-[24px] border border-[#D9DEE7] bg-white shadow-[0_15px_38px_rgba(38,40,79,0.06)]">

              <div className="flex items-center justify-between border-b border-[#E1E5EC] bg-gradient-to-r from-[#F9FAFC] to-[#F6F5FD] px-5 py-5 sm:px-6">

                <div>

                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#6B63A8]">
                    Question distribution
                  </p>

                  <h2 className="mt-1 text-[21px] font-semibold tracking-[-0.02em] text-[#1D2939]">
                    Section blueprint
                  </h2>

                </div>


                <div className="rounded-full border border-[#DDE1E8] bg-white px-3.5 py-2 text-right text-xs font-medium text-[#667085] shadow-sm">

                  <span className="font-bold text-[#1D2939]">
                    {
                      totalQuestions
                    }
                  </span>

                  {" "}
                  questions / set

                </div>

              </div>


              {sections.map(
                (
                  section,
                  index
                ) => {

                  const definition =
                    SECTION_DEFINITIONS[
                      index
                    ];

                  const selectedIds =
                    selectedSkillIds(
                      section
                    );

                  const assigned =
                    allocationTotal(
                      section
                    );

                  const balanced =
                    assigned ===
                    section.targetQuestions;

                  const tone =
                    getSectionTone(
                      index
                    );

                  const isExpanded =
                    expandedSections.has(
                      index
                    );

                  const coverage =
                    section.targetQuestions >
                    0
                      ? Math.min(
                          100,
                          (assigned /
                            section.targetQuestions) *
                            100
                        )
                      : 0;

                  return (
                    <section
                      key={
                        section.id ||
                        definition.letter
                      }
                      id={`assessment-section-${index}`}
                      className="scroll-mt-24 border-b border-[#E1E5EC] last:border-b-0"
                    >

                      {/* ================================
                          SECTION HEADER
                      ================================= */}

                      <div
                        className="relative overflow-hidden px-5 py-6 sm:px-6"
                        style={{
                          background:
                            `linear-gradient(135deg, ${tone.lighter} 0%, #FFFFFF 72%)`,
                          borderTop:
                            `4px solid ${tone.accent}`,
                        }}
                      >

                        <div
                          className="pointer-events-none absolute -right-16 top-[-80px] h-44 w-44 rounded-full opacity-60 blur-[50px]"
                          style={{
                            backgroundColor:
                              tone.soft,
                          }}
                        />


                        <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">

                          <div className="min-w-0 flex-1">

                            <div className="flex flex-wrap items-center gap-2.5">

                              <span
                                className="flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold text-white shadow-sm"
                                style={{
                                  backgroundColor:
                                    tone.accent,
                                }}
                              >
                                {
                                  definition.letter
                                }
                              </span>


                              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7D8796]">
                                Section{" "}
                                {
                                  definition.letter
                                }
                              </span>


                              <span
                                className="rounded-full border px-2.5 py-1 text-[10px] font-bold"
                                style={{
                                  borderColor:
                                    tone.border,

                                  backgroundColor:
                                    tone.soft,

                                  color:
                                    tone.text,
                                }}
                              >
                                {
                                  definition.title
                                }
                              </span>


                              <span className="rounded-full border border-[#E3E7ED] bg-white px-2.5 py-1 text-[10px] font-semibold text-[#667085]">
                                {
                                  definition.typeNote
                                }
                              </span>


                              {editing &&
                                canEditBlueprint &&
                                isSectionReady(
                                  section
                                ) && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      saveSingleSection(
                                        index
                                      )
                                    }
                                    disabled={
                                      savingSectionId ===
                                        section.id ||
                                      saving
                                    }
                                    className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#D8D4F2] bg-white px-2.5 text-[10px] font-semibold text-[#584DA8] shadow-sm transition hover:-translate-y-0.5 hover:border-[#AFA7E6] hover:bg-[#F5F2FF] disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {savingSectionId ===
                                    section.id ? (
                                      <RefreshCw
                                        size={
                                          11
                                        }
                                        className="animate-spin"
                                      />
                                    ) : (
                                      <Save
                                        size={
                                          11
                                        }
                                      />
                                    )}

                                    {savingSectionId ===
                                    section.id
                                      ? "Saving…"
                                      : "Save section"}
                                  </button>
                                )}

                            </div>


                            <div className="mt-4 flex flex-wrap items-center gap-3">

                              <div className="min-w-[220px] flex-1">

                                <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-[#667085]">

                                  <span>
                                    Coverage
                                  </span>

                                  <span
                                    style={{
                                      color:
                                        tone.text,
                                    }}
                                  >
                                    {
                                      assigned
                                    }{" "}
                                    /
                                    {
                                      section.targetQuestions ||
                                      0
                                    }{" "}
                                    allocated
                                  </span>

                                </div>


                                <div className="h-2 overflow-hidden rounded-full bg-white/90 ring-1 ring-[#E2E5EB]">

                                  <div
                                    className="h-full rounded-full transition-[width] duration-500"
                                    style={{
                                      width:
                                        `${coverage}%`,

                                      backgroundColor:
                                        tone.accent,
                                    }}
                                  />

                                </div>

                              </div>


                              <button
                                type="button"
                                onClick={() =>
                                  toggleSection(
                                    index
                                  )
                                }
                                className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#D8DDE5] bg-white px-3.5 text-xs font-semibold text-[#475467] shadow-sm transition hover:-translate-y-0.5 hover:border-[#6756B8] hover:text-[#5B4DAA]"
                                aria-expanded={
                                  isExpanded
                                }
                              >

                                {isExpanded
                                  ? "Collapse"
                                  : "Expand"}

                                <ChevronDown
                                  size={14}
                                  className={`transition-transform duration-200 ${
                                    isExpanded
                                      ? "rotate-180"
                                      : "rotate-0"
                                  }`}
                                />

                              </button>

                            </div>

                          </div>


                          <div className="hidden shrink-0 lg:block">

                            <div
                              className="rounded-2xl border border-white/90 bg-white/85 px-4 py-3 shadow-sm"
                              style={{
                                boxShadow:
                                  `0 10px 25px ${tone.accent}12`,
                              }}
                            >

                              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#98A2B3]">
                                Section target
                              </p>

                              <p
                                className="mt-1 text-2xl font-semibold leading-none"
                                style={{
                                  color:
                                    tone.accent,
                                }}
                              >
                                {
                                  section.targetQuestions
                                }
                              </p>

                              <p className="mt-1 text-[10px] text-[#98A2B3]">
                                questions /
                                set
                              </p>

                            </div>

                          </div>

                        </div>

                      </div>


                      {/* ================================
                          EXPANDED CONTENT
                      ================================= */}

                      {isExpanded && (
                        <div className="relative bg-white">

                          <div className="grid gap-5 px-5 py-6 sm:px-6 lg:grid-cols-[1fr_280px]">

                            <div className="min-w-0">

                              <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7D8796]">
                                Section name
                              </label>

                              <input
                                value={
                                  section.name
                                }
                                disabled={
                                  !editing ||
                                  hasAcceptedQuestions
                                }
                                onChange={(
                                  event
                                ) =>
                                  setSections(
                                    (
                                      current
                                    ) =>
                                      current.map(
                                        (
                                          item,
                                          itemIndex
                                        ) =>
                                          itemIndex ===
                                          index
                                            ? {
                                                ...item,

                                                name: event
                                                  .target
                                                  .value,
                                              }
                                            : item
                                      )
                                  )
                                }
                                className="mt-2 h-12 w-full max-w-[560px] rounded-xl border border-[#D7DCE5] bg-white px-4 text-[15px] font-semibold text-[#1D2939] outline-none shadow-sm transition focus:border-[#6559D8] focus:ring-4 focus:ring-[#6559D8]/10 disabled:bg-[#F8F9FB] disabled:text-[#98A2B3]"
                                aria-label={`Section ${definition.letter} name`}
                              />


                              <p className="mt-3 max-w-2xl text-[13.5px] leading-6 text-[#667085]">
                                {
                                  definition.description
                                }
                              </p>


                              <div className="mt-5 rounded-2xl border border-[#EEF0F3] bg-[#FBFCFD] p-4">

                                <div className="flex items-center justify-between gap-3">

                                  <div>

                                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7D8796]">
                                      Skills in this section
                                    </p>

                                    <p className="mt-1 text-[11px] text-[#98A2B3]">
                                      Only confirmed JD skills are available.
                                    </p>

                                  </div>


                                  <span
                                    className="rounded-full px-2.5 py-1 text-[10px] font-bold"
                                    style={{
                                      backgroundColor:
                                        tone.soft,

                                      color:
                                        tone.text,
                                    }}
                                  >
                                    {
                                      section.skills
                                        .length
                                    }{" "}
                                    selected
                                  </span>

                                </div>


                                <div className="mt-4 flex flex-wrap items-center gap-2">

                                  {section.skills.map(
                                    (
                                      skill
                                    ) => (
                                      <button
                                        key={
                                          skill.skillId
                                        }
                                        type="button"
                                        disabled={
                                          !editing ||
                                          hasAcceptedQuestions
                                        }
                                        onClick={() =>
                                          toggleSkill(
                                            index,
                                            skill.skillId
                                          )
                                        }
                                        className="group inline-flex items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-xs font-semibold shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
                                        style={{
                                          borderColor:
                                            tone.border,

                                          color:
                                            tone.text,
                                        }}
                                      >
                                        {
                                          skillName(
                                            skill.skillId
                                          )
                                        }

                                        <X
                                          size={
                                            11
                                          }
                                          className="transition-transform duration-200 group-hover:rotate-90"
                                        />
                                      </button>
                                    )
                                  )}


                                  <button
                                    type="button"
                                    disabled={
                                      !editing ||
                                      hasAcceptedQuestions
                                    }
                                    onClick={() =>
                                      setOpenSkillPicker(
                                        openSkillPicker ===
                                          index
                                          ? null
                                          : index
                                      )
                                    }
                                    className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[#AEB6C4] bg-white px-3 py-1.5 text-xs font-semibold text-[#475467] shadow-sm transition hover:-translate-y-0.5 hover:border-[#6559D8] hover:bg-[#FAF9FF] hover:text-[#6559D8] disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    <Plus
                                      size={
                                        12
                                      }
                                    />
                                    Add skill
                                  </button>

                                </div>


                                {openSkillPicker ===
                                  index && (
                                  <div className="mt-4 rounded-2xl border border-[#D9DEE7] bg-white p-4 shadow-[0_14px_32px_rgba(16,24,40,0.10)]">

                                    <div className="mb-3 flex items-center justify-between">

                                      <div>

                                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#6B63A8]">
                                          Confirmed JD skills
                                        </p>

                                        <p className="mt-0.5 text-[10px] text-[#98A2B3]">
                                          Click a skill to add or remove it.
                                        </p>

                                      </div>


                                      <button
                                        type="button"
                                        onClick={() =>
                                          setOpenSkillPicker(
                                            null
                                          )
                                        }
                                        className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F7F8FB] text-[#98A2B3] transition hover:bg-[#F0EBFB] hover:text-[#6756B8]"
                                      >
                                        <X
                                          size={
                                            13
                                          }
                                        />
                                      </button>

                                    </div>


                                    <div className="grid gap-2 sm:grid-cols-2">

                                      {availableSkills.map(
                                        (
                                          skill
                                        ) => {

                                          const selected =
                                            selectedIds.includes(
                                              Number(
                                                skill.id
                                              )
                                            );

                                          return (
                                            <button
                                              key={
                                                skill.id
                                              }
                                              type="button"
                                              disabled={
                                                !editing ||
                                                hasAcceptedQuestions
                                              }
                                              onClick={() =>
                                                toggleSkill(
                                                  index,
                                                  skill.id
                                                )
                                              }
                                              className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition ${
                                                selected
                                                  ? "border-[#D7CEF1] bg-[#F3F1FF] text-[#554AA5]"
                                                  : "border-transparent text-[#475467] hover:border-[#E3E7ED] hover:bg-[#F8F9FB]"
                                              } disabled:cursor-not-allowed disabled:opacity-60`}
                                            >
                                              <span>
                                                {
                                                  skill.name
                                                }
                                              </span>

                                              {selected && (
                                                <Check
                                                  size={
                                                    13
                                                  }
                                                />
                                              )}
                                            </button>
                                          );
                                        }
                                      )}

                                    </div>

                                  </div>
                                )}

                              </div>

                            </div>


                            <div
                              className="rounded-2xl border p-5 shadow-sm"
                              style={{
                                borderColor:
                                  tone.border,

                                background:
                                  `linear-gradient(145deg, ${tone.lighter}, #FFFFFF)`,
                              }}
                            >

                              <div className="flex items-center justify-between gap-3">

                                <div>

                                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7D8796]">
                                    Questions in section
                                  </p>

                                  <p className="mt-1 text-[11px] text-[#98A2B3]">
                                    Set the total, then distribute it across skills.
                                  </p>

                                </div>

                                <div
                                  className="flex h-9 w-9 items-center justify-center rounded-xl"
                                  style={{
                                    backgroundColor:
                                      tone.soft,

                                    color:
                                      tone.accent,
                                  }}
                                >
                                  <ListChecks
                                    size={
                                      16
                                    }
                                  />
                                </div>

                              </div>


                              <div className="mt-5 flex items-end gap-2">

                                <div>

                                  <label className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#98A2B3]">
                                    Target
                                  </label>

                                  <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={
                                      section.targetQuestions
                                    }
                                    disabled={
                                      !editing ||
                                      hasAcceptedQuestions
                                    }
                                    onChange={(
                                      event
                                    ) =>
                                      updateTarget(
                                        index,
                                        event.target
                                          .value
                                      )
                                    }
                                    className="mt-1 h-12 w-24 rounded-xl border border-[#D7DCE5] bg-white px-3 text-[16px] font-semibold text-[#1D2939] outline-none shadow-sm transition focus:border-[#6559D8] focus:ring-4 focus:ring-[#6559D8]/10 disabled:bg-[#F8F9FB] disabled:text-[#98A2B3]"
                                  />

                                </div>


                                <button
                                  type="button"
                                  onClick={() =>
                                    distributeEvenly(
                                      index
                                    )
                                  }
                                  disabled={
                                    !editing ||
                                    hasAcceptedQuestions ||
                                    section.skills
                                      .length ===
                                      0 ||
                                    section.targetQuestions <=
                                      0
                                  }
                                  className="h-12 rounded-xl border border-[#D9DEE7] bg-white px-4 text-xs font-semibold text-[#475467] shadow-sm transition hover:-translate-y-0.5 hover:border-[#6559D8] hover:bg-[#FAF9FF] hover:text-[#6559D8] disabled:opacity-50"
                                >
                                  Distribute
                                </button>

                              </div>


                              <div className="mt-5 rounded-xl border border-white/90 bg-white/75 p-3.5">

                                <div className="flex items-center justify-between text-[11px]">

                                  <span className="text-[#7D8796]">
                                    Allocation
                                  </span>

                                  <span
                                    className={`font-bold ${
                                      balanced
                                        ? "text-[#28734E]"
                                        : "text-[#B54708]"
                                    }`}
                                  >
                                    {
                                      assigned
                                    }{" "}
                                    /
                                    {
                                      section.targetQuestions
                                    }
                                  </span>

                                </div>


                                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#EEF0F3]">

                                  <div
                                    className="h-full rounded-full transition-[width] duration-500"
                                    style={{
                                      width:
                                        `${coverage}%`,

                                      backgroundColor:
                                        balanced
                                          ? "#28734E"
                                          : tone.accent,
                                    }}
                                  />

                                </div>

                              </div>

                            </div>

                          </div>


                          {/* ============================
                              SKILL ALLOCATION TABLE
                          ============================== */}

                          {section.skills.length >
                            0 && (
                            <div className="overflow-x-auto border-t border-[#EEF0F3]">

                              <table className="w-full min-w-[650px] border-collapse text-left">

                                <thead>

                                  <tr className="bg-[#F7F8FB] text-[10px] font-bold uppercase tracking-[0.13em] text-[#7D8796]">

                                    <th className="w-[42%] px-5 py-3.5">
                                      Skill
                                    </th>

                                    {definition.difficulties.map(
                                      (
                                        difficulty
                                      ) => (
                                        <th
                                          key={
                                            difficulty
                                          }
                                          className="px-4 py-3.5 text-center"
                                        >
                                          {
                                            DIFFICULTY_LABELS[
                                              difficulty
                                            ]
                                          }
                                        </th>
                                      )
                                    )}

                                    <th className="px-4 py-3.5 text-right">
                                      Total
                                    </th>

                                  </tr>

                                </thead>


                                <tbody className="divide-y divide-[#EEF0F3]">

                                  {section.skills.map(
                                    (
                                      skill
                                    ) => (
                                      <tr
                                        key={
                                          skill.skillId
                                        }
                                        className="transition hover:bg-[#FAF9FF]"
                                      >

                                        <td className="px-5 py-4">

                                          <p className="text-[13px] font-semibold text-[#344054]">
                                            {
                                              skillName(
                                                skill.skillId
                                              )
                                            }
                                          </p>

                                          <p className="mt-0.5 text-[10px] text-[#98A2B3]">
                                            Question allocation
                                          </p>

                                        </td>


                                        {definition.difficulties.map(
                                          (
                                            difficulty
                                          ) => (
                                            <td
                                              key={
                                                difficulty
                                              }
                                              className="px-4 py-4 text-center"
                                            >

                                              <input
                                                type="number"
                                                min="0"
                                                step="1"
                                                value={
                                                  skill[
                                                    difficulty
                                                  ]
                                                }
                                                disabled={
                                                  !editing ||
                                                  hasAcceptedQuestions
                                                }
                                                onChange={(
                                                  event
                                                ) =>
                                                  updateAllocation(
                                                    index,
                                                    skill.skillId,
                                                    difficulty,
                                                    event
                                                      .target
                                                      .value
                                                  )
                                                }
                                                className="h-9 w-16 rounded-lg border border-[#D7DCE5] bg-white px-2 text-center text-xs font-semibold text-[#344054] outline-none shadow-sm focus:border-[#6559D8] focus:ring-2 focus:ring-[#6559D8]/10 disabled:bg-[#F8F9FB] disabled:text-[#98A2B3]"
                                              />

                                            </td>
                                          )
                                        )}


                                        <td className="px-4 py-4 text-right">

                                          <span className="inline-flex min-w-[32px] justify-center rounded-full bg-[#F2F4F7] px-2 py-1 text-[11px] font-bold text-[#475467]">
                                            {
                                              skill.easy +
                                              skill.medium +
                                              skill.hard
                                            }
                                          </span>

                                        </td>

                                      </tr>
                                    )
                                  )}

                                </tbody>

                              </table>

                            </div>
                          )}


                          {section.skills.length ===
                            0 && (
                            <div className="border-t border-[#EEF0F3] bg-[#FAFBFC] px-5 py-5 text-[13px] text-[#98A2B3]">
                              Add at least one confirmed JD skill to define this section.
                            </div>
                          )}

                        </div>
                      )}

                    </section>
                  );
                }
              )}

            </section>


            {/* =================================================
                ASSESSMENT SETTINGS
            ================================================= */}

            <section className="mt-6 overflow-hidden rounded-[22px] border border-[#DCE1E8] bg-white shadow-[0_10px_28px_rgba(38,40,79,0.045)]">

              <div className="bg-gradient-to-r from-[#FBFCFD] to-[#F8F7FD] px-5 py-6 sm:px-6">

                <div className="mb-5">

                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#6B63A8]">
                    Assessment settings
                  </p>

                  <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.02em] text-[#1D2939]">
                    Candidate experience
                  </h2>

                  <p className="mt-1 text-[13px] leading-6 text-[#667085]">
                    Configure the time limit and instructions candidates will see during the assessment.
                  </p>

                </div>


                <div className="grid gap-5 lg:grid-cols-[220px_1fr]">

                  <div className="rounded-2xl border border-[#E2E5EB] bg-white p-4 shadow-sm">

                    <label
                      htmlFor="duration"
                      className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#7D8796]"
                    >
                      Duration
                    </label>

                    <div className="relative mt-2">

                      <Clock3
                        size={14}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#98A2B3]"
                      />

                      <input
                        id="duration"
                        type="number"
                        min="1"
                        value={
                          durationMinutes
                        }
                        disabled={
                          !editing
                        }
                        onChange={(
                          event
                        ) =>
                          setDurationMinutes(
                            event
                              .target
                              .value
                          )
                        }
                        className="h-11 w-full rounded-xl border border-[#D7DCE5] bg-white pl-9 pr-14 text-sm font-semibold text-[#344054] outline-none shadow-sm focus:border-[#6559D8] focus:ring-4 focus:ring-[#6559D8]/10 disabled:bg-[#F8F9FB] disabled:text-[#98A2B3]"
                      />

                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium text-[#667085]">
                        min
                      </span>

                    </div>

                  </div>


                  <div className="rounded-2xl border border-[#E2E5EB] bg-white p-4 shadow-sm">

                    <label
                      htmlFor="instructions"
                      className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#7D8796]"
                    >
                      Candidate instructions
                    </label>

                    <div className="relative mt-2">

                      <FileText
                        size={14}
                        className="pointer-events-none absolute left-3 top-3 text-[#98A2B3]"
                      />

                      <textarea
                        id="instructions"
                        value={
                          candidateInstructions
                        }
                        disabled={
                          !editing
                        }
                        onChange={(
                          event
                        ) =>
                          setCandidateInstructions(
                            event
                              .target
                              .value
                          )
                        }
                        maxLength={5000}
                        rows={4}
                        className="w-full resize-y rounded-xl border border-[#D7DCE5] bg-white py-3 pl-9 pr-3 text-sm leading-6 text-[#344054] outline-none shadow-sm focus:border-[#6559D8] focus:ring-4 focus:ring-[#6559D8]/10 disabled:bg-[#F8F9FB] disabled:text-[#98A2B3]"
                      />

                    </div>

                    <div className="mt-1 flex justify-end text-[10px] text-[#98A2B3]">
                      {
                        candidateInstructions.length
                      }
                      /5000
                    </div>

                  </div>

                </div>

              </div>

            </section>


            {/* =================================================
                BOTTOM ACTION BAR
            ================================================= */}

            <div className="mt-6 flex flex-col gap-4 rounded-[20px] border border-[#DDE2EA] bg-gradient-to-r from-[#F8F9FC] to-[#FBFAFD] p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">

              <p className="flex max-w-2xl items-start gap-2 text-[13px] leading-6 text-[#667085]">

                <Info
                  size={14}
                  className="mt-0.5 shrink-0 text-[#6756B8]"
                />

                <span>
                  {hasAcceptedQuestions
                    ? "This set already contains an accepted question. Only assessment-level settings can be changed here."
                    : "Save each completed section independently. You can configure Sections B and C without completing the whole blueprint first."}
                </span>

              </p>


              {editing ? (
                <div className="flex shrink-0 items-center gap-2">

                  <button
                    type="button"
                    onClick={
                      cancelEdit
                    }
                    disabled={
                      saving
                    }
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#D9DEE7] bg-white px-5 text-sm font-semibold text-[#475467] shadow-sm transition hover:-translate-y-0.5 hover:border-[#BFC4CF] disabled:opacity-50"
                  >
                    Cancel
                  </button>


                  <button
                    type="submit"
                    disabled={
                      saving ||
                      Boolean(
                        savingSectionId
                      ) ||
                      (!hasAcceptedQuestions &&
                        !allValid)
                    }
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#5658D8] px-5 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(86,88,216,0.16)] transition hover:-translate-y-0.5 hover:bg-[#4E50C5] disabled:cursor-not-allowed disabled:opacity-45"
                  >

                    <Save
                      size={15}
                    />

                    {saving
                      ? "Saving…"
                      : "Save changes"}

                  </button>

                </div>
              ) : (
                <button
                  type="button"
                  onClick={
                    enterEditMode
                  }
                  className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#5658D8] px-5 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(86,88,216,0.16)] transition hover:-translate-y-0.5 hover:bg-[#4E50C5]"
                >

                  <Pencil
                    size={15}
                  />

                  Edit blueprint

                </button>
              )}

            </div>

          </form>


          {/* ===================================================
              SUMMARY SIDEBAR
          =================================================== */}

          <aside className="lg:sticky lg:top-20 lg:self-start">

            <div className="overflow-hidden rounded-[22px] border border-[#DCE1E8] bg-white shadow-[0_12px_30px_rgba(38,40,79,0.05)]">

              <div className="border-b border-[#E4E7EC] bg-gradient-to-r from-[#F7F7FF] to-[#FBFAFC] px-5 py-5">

                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#6B63A8]">
                  Blueprint summary
                </p>

                <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.02em] text-[#1D2939]">
                  Per set
                </h2>

                <p className="mt-1 text-[11px] leading-5 text-[#98A2B3]">
                  Click a section to jump directly to it.
                </p>

              </div>


              <div>

                {sections.map(
                  (
                    section,
                    index
                  ) => {

                    const tone =
                      getSectionTone(
                        index
                      );

                    const allocated =
                      section.skills.reduce(
                        (
                          sum,
                          skill
                        ) =>
                          sum +
                          skill.easy +
                          skill.medium +
                          skill.hard,
                        0
                      );

                    const coverage =
                      section.targetQuestions >
                      0
                        ? Math.min(
                            100,
                            (allocated /
                              section.targetQuestions) *
                              100
                          )
                        : 0;

                    return (
                      <button
                        key={
                          section.id ||
                          index
                        }
                        type="button"
                        onClick={() =>
                          jumpToSection(
                            index
                          )
                        }
                        className="group w-full border-b border-[#EEF0F3] px-5 py-4 text-left transition hover:bg-[#FAFBFC]"
                      >

                        <div className="flex items-center justify-between gap-3">

                          <div className="flex min-w-0 items-center gap-3">

                            <span
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white shadow-sm"
                              style={{
                                backgroundColor:
                                  tone.accent,
                              }}
                            >
                              {
                                SECTION_DEFINITIONS[
                                  index
                                ].letter
                              }
                            </span>


                            <div className="min-w-0">

                              <span className="block truncate text-sm font-semibold text-[#344054]">
                                {
                                  SECTION_DEFINITIONS[
                                    index
                                  ].title
                                }
                              </span>

                              <span className="mt-0.5 block text-[10px] text-[#98A2B3]">
                                {
                                  section
                                    .skills
                                    .length
                                }{" "}
                                skill
                                {
                                  section
                                    .skills
                                    .length ===
                                  1
                                    ? ""
                                    : "s"
                                }
                              </span>

                            </div>

                          </div>


                          <span
                            className="text-lg font-semibold"
                            style={{
                              color:
                                tone.accent,
                            }}
                          >
                            {
                              section.targetQuestions
                            }
                          </span>

                        </div>


                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#EEF0F3]">

                          <div
                            className="h-full rounded-full transition-[width] duration-500"
                            style={{
                              width:
                                `${coverage}%`,

                              backgroundColor:
                                tone.accent,
                            }}
                          />

                        </div>


                        <div className="mt-2 flex items-center justify-between text-[10px] text-[#98A2B3]">

                          <span>
                            {
                              allocated
                            }{" "}
                            allocated
                          </span>


                          <span
                            className="font-semibold opacity-0 transition group-hover:opacity-100"
                            style={{
                              color:
                                tone.text,
                            }}
                          >
                            Jump to
                            section →
                          </span>

                        </div>

                      </button>
                    );
                  }
                )}


                <div className="flex items-center justify-between bg-[#F8F9FC] px-5 py-5">

                  <span className="text-sm font-semibold text-[#667085]">
                    Total questions /
                    set
                  </span>

                  <span className="text-2xl font-semibold text-[#1D2939]">
                    {
                      totalQuestions
                    }
                  </span>

                </div>


                <div className="bg-gradient-to-r from-[#F6F4FF] to-[#FBFAFF] px-5 py-5">

                  <div className="flex items-start gap-2.5 text-[11px] leading-5 text-[#667085]">

                    <ListChecks
                      size={14}
                      className="mt-0.5 shrink-0 text-[#6756B8]"
                    />

                    <span>
                      Set A and Set
                      B share this
                      blueprint but
                      contain
                      different
                      actual
                      questions.
                    </span>

                  </div>

                </div>

              </div>

            </div>

          </aside>

        </div>

      </main>
    </RecruiterLayout>
  );
}

export default AssessmentConfig;