import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileText,
  History,
  Lock,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  UserRound,
  X,
  XCircle,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import RecruiterLayout from "../layouts/RecruiterLayout";

function MetaCard({ label, value }) {
  return (
    <div className="rounded-xl border border-[#EEF0F3] bg-[#FAFBFC] px-3 py-2.5">
      <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-[#98A2B3]">
        {label}
      </p>

      <p className="mt-1 text-sm font-semibold text-[#344054]">
        {value ?? "—"}
      </p>
    </div>
  );
}

function LoadingPanel({ text = "Loading..." }) {
  return (
    <div className="rounded-[18px] border border-[#E3E6EB] bg-white p-8 text-center shadow-[0_8px_26px_rgba(27,37,58,0.035)]">
      <RefreshCw
        size={22}
        className="mx-auto animate-spin text-[#5658E8]"
      />

      <p className="mt-3 text-sm font-semibold text-[#475467]">
        {text}
      </p>
    </div>
  );
}

function EmptyPanel({ title, description }) {
  return (
    <div className="border p-10 text-center group relative isolate overflow-hidden transition-all duration-300 rounded-[20px] border-[#E3E6EB] bg-white px-6 py-8 shadow-[0_8px_24px_rgba(27,37,58,0.035)]">

      <div
        aria-hidden="true"
        data-review-empty-doodle
        className="pointer-events-none absolute right-5 top-5 hidden h-20 w-24 sm:block"
      >
        <div className="absolute right-1 top-1 h-14 w-14 rotate-12 rounded-2xl border border-[#7862C8]/20 transition-transform duration-700 group-hover:rotate-45" />
        <div className="absolute right-4 top-4 h-9 w-9 rounded-full border border-dashed border-[#0F9D8A]/30" />
        <span className="absolute right-6 top-7 h-2 w-2 rounded-full bg-[#7862C8]/50 animate-pulse" />
        <span className="absolute right-0 top-3 h-1.5 w-1.5 rounded-full bg-[#0F9D8A]/60 animate-ping" />
      </div>

      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#F4F5F8] text-[#667085]">
        <ClipboardCheck size={20} />
      </div>

      <h3 className="mt-4 text-lg font-semibold text-[#202938]">
        {title}
      </h3>

      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#98A2B3]">
        {description}
      </p>
    </div>
  );
}

function StatusBadge({ status }) {
  const normalized = String(
    status || "unknown"
  ).toLowerCase();

  let label = status || "Unknown";
  let className =
    "bg-[#F4F5F8] text-[#667085]";

  if (
    normalized ===
    "submitted_for_review"
  ) {
    label = "Submitted for review";
    className =
      "bg-[#EAE5F9] text-[#5658E8]";
  } else if (
    normalized === "approved"
  ) {
    label = "Approved";
    className =
      "bg-[#E2F3EA] text-[#28734E]";
  } else if (
    normalized === "rejected"
  ) {
    label = "Rejected";
    className =
      "bg-[#FFF0F0] text-[#A83E3E]";
  } else if (
    normalized === "draft"
  ) {
    label = "Draft";
    className =
      "bg-[#F4F5F8] text-[#667085]";
  }

  return (
    <span
      className={`rounded-full px-2.5 py-1.5 text-[10px] font-bold ${className}`}
    >
      {label}
    </span>
  );
}

function getSetLabel(setItem) {
  const explicitLabel = String(
    setItem?.label || ""
  ).trim();

  if (explicitLabel) {
    return explicitLabel
      .replace(/^set\s+/i, "Set ");
  }

  const variant = Number(
    setItem?.variant_number
  );

  if (variant === 1) {
    return "Set A";
  }

  if (variant === 2) {
    return "Set B";
  }

  return `Set ${
    setItem?.variant_number ?? "—"
  }`;
}

function getQuestionId(question) {
  return (
    question?.question_id ??
    question?.id ??
    null
  );
}

function getSetState(setItem) {
  const status = String(
    setItem?.status || "draft"
  ).toLowerCase();

  if (
    status ===
    "submitted_for_review"
  ) {
    return {
      openable: true,
      title: "Ready for review",
      reason:
        setItem?.lock_reason ||
        "The Assessment Manager has submitted this set for independent review.",
      button: `Open ${getSetLabel(
        setItem
      )}`,
    };
  }

  if (status === "draft") {
    return {
      openable: false,
      title: "Waiting for submission",
      reason:
        setItem?.lock_reason ||
        "The Assessment Manager has not submitted this set for review yet.",
      button:
        "Locked — not submitted",
    };
  }

  if (status === "rejected") {
    return {
      openable: false,
      title: "Needs revision",
      reason:
        setItem?.lock_reason ||
        "This set was rejected and must be revised before it can be submitted again.",
      button:
        "Locked — needs revision",
    };
  }

  if (status === "approved") {
    return {
      openable: false,
      title: "Already approved",
      reason:
        "This set has already completed reviewer approval.",
      button:
        "Locked — already approved",
    };
  }

  return {
    openable: false,
    title: "Not available",
    reason:
      setItem?.lock_reason ||
      "This set is not currently available for reviewer action.",
    button: "Locked",
  };
}

function getCompletedSetState(setItem) {
  const status = String(
    setItem?.status || ""
  ).toLowerCase();

  if (status === "approved") {
    return {
      openable: true,
      title: "Completed review — approved",
      reason:
        setItem?.review_comment ||
        "This assessment set was approved and is available as a read-only review record.",
      button: "Open completed review",
    };
  }

  if (status === "rejected") {
    return {
      openable: true,
      title: "Completed review — rejected",
      reason:
        setItem?.review_comment ||
        "This assessment set was rejected and is available as a read-only review record.",
      button: "Open completed review",
    };
  }

  return {
    openable: false,
    title: "Not in review history",
    reason:
      "Only completed assessment-set reviews can be opened from review history.",
    button: "Locked",
  };
}

function ReviewerWorkspace() {
  const location = useLocation();
  const directOpenRef = useRef("");

  const navigate = useNavigate();

  const { logout } = useAuth();

  const [
    assessmentQueue,
    setAssessmentQueue,
  ] = useState([]);

  const [queueLoaded, setQueueLoaded] = useState(false);

  const [
    completedQueue,
    setCompletedQueue,
  ] = useState([]);

  const [
    reviewMode,
    setReviewMode,
  ] = useState("active");

  const [
    historyLoaded,
    setHistoryLoaded,
  ] = useState(false);

  const [
    selectedJob,
    setSelectedJob,
  ] = useState(null);

  const [
    selectedSet,
    setSelectedSet,
  ] = useState(null);

  const [
    selectedSection,
    setSelectedSection,
  ] = useState(null);

  const [stage, setStage] =
    useState("jobs");

  const [loading, setLoading] =
    useState(true);

  const [
    loadingSet,
    setLoadingSet,
  ] = useState(false);

  const [
    historyLoading,
    setHistoryLoading,
  ] = useState(false);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [error, setError] =
    useState("");

  const [
    actionError,
    setActionError,
  ] = useState("");

  const [
    actionSuccess,
    setActionSuccess,
  ] = useState("");

  const [jobSearch, setJobSearch] =
    useState("");

  const [
    questionSearch,
    setQuestionSearch,
  ] = useState("");

  const [
    statusFilter,
    setStatusFilter,
  ] = useState("all");

  const [
    sourceFilter,
    setSourceFilter,
  ] = useState("all");

  const [
    rejectingQuestion,
    setRejectingQuestion,
  ] = useState(null);

  const [
    rejectingSet,
    setRejectingSet,
  ] = useState(false);

  const [
    rejectionReason,
    setRejectionReason,
  ] = useState("");

  const [
    approvingId,
    setApprovingId,
  ] = useState(null);

  const [
    rejectingId,
    setRejectingId,
  ] = useState(null);

  const [
    approvingSetId,
    setApprovingSetId,
  ] = useState(null);

  const [
    rejectingSetId,
    setRejectingSetId,
  ] = useState(null);

  const [
    sendingToHrSetId,
    setSendingToHrSetId,
  ] = useState(null);

  const [
    versionQuestion,
    setVersionQuestion,
  ] = useState(null);

  const [versions, setVersions] =
    useState([]);

  const [
    versionsLoading,
    setVersionsLoading,
  ] = useState(false);

  const [
    versionsError,
    setVersionsError,
  ] = useState("");

  const getErrorMessage = (
    err,
    fallback
  ) => {
    const detail =
      err?.response?.data?.detail;

    if (Array.isArray(detail)) {
      const message = detail
        .map((item) => {
          if (
            typeof item ===
            "string"
          ) {
            return item;
          }

          return (
            item?.msg ||
            JSON.stringify(item)
          );
        })
        .filter(Boolean)
        .join(" ");

      if (message) {
        return message;
      }
    }

    if (
      typeof detail ===
        "string" &&
      detail.trim()
    ) {
      return detail;
    }

    if (
      err?.code ===
      "ERR_NETWORK"
    ) {
      return "Unable to reach the backend server. Make sure FastAPI is running.";
    }

    if (
      err?.code ===
      "ECONNABORTED"
    ) {
      return "The backend request timed out.";
    }

    return fallback;
  };

  const handleUnauthorized = (
    err
  ) => {
    if (
      err?.response?.status ===
      401
    ) {
      logout();

      navigate("/login", {
        replace: true,
      });

      return true;
    }

    return false;
  };

  const loadQueue =
    async () => {
      const response =
        await api.get(
          "/assessment-reviews/sets/queue"
        );

      const data = Array.isArray(
        response.data
      )
        ? response.data
        : [];

      setAssessmentQueue(
        data
      );

      setQueueLoaded(true);

      return data;
    };

  const loadCompletedQueue =
    async () => {
      try {
        setHistoryLoading(
          true
        );

        const response =
          await api.get(
            "/assessment-reviews/sets/completed"
          );

        const data =
          Array.isArray(
            response.data
          )
            ? response.data
            : [];

        setCompletedQueue(
          data
        );

        setHistoryLoaded(
          true
        );

        return data;
      } catch (err) {
        console.error(
          "Failed to load completed review history:",
          err
        );

        if (
          !handleUnauthorized(
            err
          )
        ) {
          setActionError(
            getErrorMessage(
              err,
              "Unable to load completed review history."
            )
          );
        }

        return null;
      } finally {
        setHistoryLoading(
          false
        );
      }
    };

  const [hrRecipients, setHrRecipients] = useState([]);
  const [selectedHrUserId, setSelectedHrUserId] = useState("");
  const [hrRecipientsLoading, setHrRecipientsLoading] = useState(false);
  const [hrRecipientsError, setHrRecipientsError] = useState("");

  const loadSet = async (
    assessmentSetId,
    silent = false
  ) => {
    try {
      if (!silent) {
        setLoadingSet(true);
      }

      const response =
        await api.get(
          `/assessment-reviews/sets/${assessmentSetId}`
        );

      const data =
        response.data || null;

      setSelectedSet(data);

      return data;
    } catch (err) {
      console.error(
        "Failed to load AssessmentSet:",
        err
      );

      if (
        !handleUnauthorized(
          err
        )
      ) {
        setActionError(
          getErrorMessage(
            err,
            "Unable to open this Assessment Set."
          )
        );
      }

      return null;
    } finally {
      if (!silent) {
        setLoadingSet(false);
      }
    }
  };

  const loadCompletedSet =
    async (
      assessmentSetId,
      silent = false
    ) => {
      try {
        if (!silent) {
          setLoadingSet(true);
        }

        const response =
          await api.get(
            `/assessment-reviews/sets/completed/${assessmentSetId}`
          );

        const data =
          response.data || null;

        setSelectedSet(data);

        return data;
      } catch (err) {
        console.error(
          "Failed to load completed AssessmentSet review:",
          err
        );

        if (
          !handleUnauthorized(
            err
          )
        ) {
          setActionError(
            getErrorMessage(
              err,
              "Unable to open this completed Assessment Set review."
            )
          );
        }

        return null;
      } finally {
        if (!silent) {
          setLoadingSet(false);
        }
      }
    };

  const switchReviewMode =
    async (mode) => {
      setReviewMode(
        mode
      );

      setSelectedJob(
        null
      );

      setSelectedSet(
        null
      );

      setSelectedSection(
        null
      );

      setActionError("");

      setActionSuccess("");

      setJobSearch("");

      setQuestionSearch("");

      setStage(
        "jobs"
      );

      if (mode === "completed") {
        if (!historyLoaded && !historyLoading) {
          await loadCompletedQueue();
        }
      } else if (!queueLoaded) {
        try {
          await loadQueue();
        } catch (err) {
          console.error(
            "Failed to refresh active review queue:",
            err
          );

          if (
            !handleUnauthorized(
              err
            )
          ) {
            setActionError(
              getErrorMessage(
                err,
                "Unable to load the active review queue."
              )
            );
          }
        }
      }
    };

  const loadWorkspace =
    async () => {
      try {
        setLoading(true);
        setError("");

        // Prefetch history without blocking the initial pending queue.
        loadCompletedQueue().catch((prefetchError) => {
          console.error(
            "Background completed-review prefetch failed:",
            prefetchError
          );
        });

        await loadQueue();
      } catch (err) {
        console.error(
          "Failed to load reviewer workspace:",
          err
        );

        if (
          !handleUnauthorized(
            err
          )
        ) {
          setError(
            getErrorMessage(
              err,
              "Unable to load the reviewer workspace."
            )
          );
        }
      } finally {
        setLoading(false);
      }
    };

  useEffect(() => {
    let active = true;

    const loadHrRecipients = async () => {
      setHrRecipientsLoading(true);
      setHrRecipientsError("");

      try {
        const response = await api.get(
          "/assessment-reviews/hr-recipients"
        );
        const contacts = Array.isArray(response?.data)
          ? response.data
          : [];

        if (active) {
          setHrRecipients(contacts);
          if (contacts.length === 0) {
            setHrRecipientsError("No HR contacts are available.");
          }
        }
      } catch (err) {
        console.error("Failed to load HR contacts:", err);
        if (active) {
          setHrRecipientsError(
            getErrorMessage(err, "Unable to load HR contacts.")
          );
        }
      } finally {
        if (active) {
          setHrRecipientsLoading(false);
        }
      }
    };

    loadHrRecipients();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const savedRecipientId = selectedSet?.hr_contact?.id;

    if (savedRecipientId !== null && savedRecipientId !== undefined) {
      setSelectedHrUserId(String(savedRecipientId));
      return;
    }

    if (hrRecipients.length > 0) {
      setSelectedHrUserId((current) => {
        const currentIsValid = hrRecipients.some(
          (contact) => String(contact.id) === String(current)
        );
        return currentIsValid ? current : String(hrRecipients[0].id);
      });
    }
  }, [
    selectedSet?.assessment_set_id,
    selectedSet?.hr_contact?.id,
    hrRecipients,
  ]);

  useEffect(() => {
    loadWorkspace();
  }, []);

  useEffect(() => {
    const target = location.state;
    const targetId = Number(target?.assessmentSetId);

    if (
      target?.source !== "question-bank-set" ||
      !Number.isInteger(targetId) ||
      targetId <= 0
    ) {
      return;
    }

    const key = `${location.key}:${targetId}`;
    if (directOpenRef.current === key) return;
    directOpenRef.current = key;

    setActionError("");
    setActionSuccess("");

    setSelectedJob({
      job_id: Number(target.jobId),
      job_title: target.jobTitle || `Job ${target.jobId}`,
      question_set_name: target.questionSetName || "Assessment",
      sets: [],
    });

    // Open the actual assessment-set detail view, not an undefined stage.
    setSelectedSet(null);
    setSelectedSection(null);
    setReviewMode(target.completed ? "completed" : "active");
    setStage("set-detail");

    const openTarget = async () => {
      try {
        if (target.completed) {
          await loadCompletedSet(targetId);
        } else {
          await loadSet(targetId);
        }
      } catch (err) {
        console.error("Failed to open selected assessment set:", err);
        setActionError(
          getErrorMessage(err, "Unable to open the selected assessment set.")
        );
      }
    };

    openTarget();
    // Intentionally run when navigation enters this page with a direct-set target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  const jobs = useMemo(
    () => {
      const groups =
        new Map();

      const queue =
        reviewMode === "completed"
          ? completedQueue
          : assessmentQueue;

      queue.forEach(
        (item) => {
          const jobId =
            item?.job_id;

          if (
            jobId === null ||
            jobId === undefined
          ) {
            return;
          }

          const key =
            String(jobId);

          if (
            !groups.has(key)
          ) {
            groups.set(
              key,
              {
                job_id:
                  jobId,

                job_title:
                  item?.job_title ||
                  `Job ${jobId}`,

                question_set_name:
                  item?.question_set
                    ?.name ||
                  "Assessment",

                sets:
                  new Map(),
              }
            );
          }

          const group =
            groups.get(key);

          const variants =
            Array.isArray(
              item?.assessment_sets
            ) &&
            item.assessment_sets
              .length > 0
              ? item.assessment_sets
              : [item];

          variants.forEach(
            (variant) => {
              if (!variant?.id) {
                return;
              }

              const normalized =
                {
                  ...variant,

                  label:
                    getSetLabel(
                      variant
                    ),

                  is_openable:
                    reviewMode === "completed"
                      ? [
                          "approved",
                          "rejected",
                        ].includes(
                          String(
                            variant?.status ||
                              ""
                          ).toLowerCase()
                        )
                      : variant?.is_openable ===
                          true ||
                        variant?.status ===
                          "submitted_for_review",
                };

              group.sets.set(
                Number(
                  variant.id
                ),
                normalized
              );
            }
          );
        }
      );

      return Array.from(
        groups.values()
      )
        .map((job) => ({
          ...job,

          sets: Array.from(
            job.sets.values()
          ).sort(
            (left, right) =>
              Number(
                left?.variant_number ||
                  0
              ) -
              Number(
                right?.variant_number ||
                  0
              )
          ),
        }))
        .sort(
          (left, right) =>
            String(
              left.job_title
            ).localeCompare(
              String(
                right.job_title
              )
            )
        );
    },
    [
      assessmentQueue,
      completedQueue,
      reviewMode,
    ]
  );

  const filteredJobs =
    useMemo(() => {
      const query =
        jobSearch
          .trim()
          .toLowerCase();

      if (!query) {
        return jobs;
      }

      return jobs.filter(
        (job) => {
          const values = [
            job.job_title,
            job.question_set_name,
            ...job.sets.map(
              (setItem) =>
                setItem.label
            ),
          ];

          return values.some(
            (value) =>
              String(
                value ?? ""
              )
                .toLowerCase()
                .includes(query)
          );
        }
      );
    }, [jobs, jobSearch]);

  const sections = useMemo(
    () => {
      if (!selectedSet) {
        return [];
      }

      const groups =
        new Map();

      const ensureSection =
        (
          key,
          seed = {}
        ) => {
          const normalizedKey =
            String(key);

          if (
            !groups.has(
              normalizedKey
            )
          ) {
            groups.set(
              normalizedKey,
              {
                key:
                  normalizedKey,

                section_id:
                  seed.section_id ??
                  null,

                name:
                  seed.section_name ||
                  seed.name ||
                  "Section",

                section_type:
                  seed.section_type ||
                  "—",

                slots: [],

                questions: [],
              }
            );
          }

          return groups.get(
            normalizedKey
          );
        };

      (
        Array.isArray(
          selectedSet.slots
        )
          ? selectedSet.slots
          : []
      ).forEach((slot) => {
        const key =
          slot?.section_id ??
          slot?.section_name ??
          slot?.id ??
          "section";

        ensureSection(
          key,
          {
            section_id:
              slot?.section_id,

            section_name:
              slot?.section_name,

            name:
              slot?.name,

            section_type:
              slot?.section_type,
          }
        ).slots.push(
          slot
        );
      });

      (
        Array.isArray(
          selectedSet.questions
        )
          ? selectedSet.questions
          : []
      ).forEach(
        (question) => {
          const key =
            question?.section_id ??
            question?.section_name ??
            `slot-${question?.slot_id}`;

          ensureSection(
            key,
            {
              section_id:
                question?.section_id,

              section_name:
                question?.section_name,

              section_type:
                question?.section_type,
            }
          ).questions.push(
            question
          );
        }
      );

      return Array.from(
        groups.values()
      )
        .map(
          (section) => ({
            ...section,

            slotCount:
              section.slots.length,

            questionCount:
              section.questions
                .length,

            pendingCount:
              section.questions.filter(
                (question) =>
                  question?.status ===
                  "pending_review"
              ).length,

            approvedCount:
              section.questions.filter(
                (question) =>
                  question?.status ===
                  "approved"
              ).length,

            rejectedCount:
              section.questions.filter(
                (question) =>
                  question?.status ===
                  "rejected"
              ).length,
          })
        )
        .sort(
          (left, right) =>
            Number(
              left.section_id ||
                999999
            ) -
            Number(
              right.section_id ||
                999999
            )
        );
    },
    [selectedSet]
  );

  const visibleQuestions =
    useMemo(() => {
      if (!selectedSection) {
        return [];
      }

      const query =
        questionSearch
          .trim()
          .toLowerCase();

      return selectedSection.questions.filter(
        (question) => {
          const searchMatch =
            !query ||
            String(
              question?.question_text ||
                ""
            )
              .toLowerCase()
              .includes(query) ||
            String(
              question?.skill_name ||
                ""
            )
              .toLowerCase()
              .includes(query) ||
            String(
              question?.difficulty ||
                ""
            )
              .toLowerCase()
              .includes(query);

          const statusMatch =
            statusFilter ===
              "all" ||
            String(
              question?.status ||
                ""
            ).toLowerCase() ===
              statusFilter;

          const sourceMatch =
            sourceFilter ===
              "all" ||
            String(
              question?.source ||
                ""
            ).toLowerCase() ===
              sourceFilter;

          return (
            searchMatch &&
            statusMatch &&
            sourceMatch
          );
        }
      );
    }, [
      selectedSection,
      questionSearch,
      statusFilter,
      sourceFilter,
    ]);

  const selectedSummary =
    selectedSet?.summary ||
    {};

  const setIsSubmitted =
    selectedSet?.status ===
    "submitted_for_review";

  const setIsApproved =
    String(
      selectedSet?.status || ""
    ).toLowerCase() === "approved";

  const sentToHr = Boolean(
    selectedSet?.sent_to_hr ||
    selectedSet?.sent_to_hr_at
  );

  const setApprovalReady =
    setIsSubmitted &&
    Number(
      selectedSummary.total_slots ??
        0
    ) > 0 &&
    Number(
      selectedSummary.remaining_slots ??
        0
    ) === 0 &&
    Number(
      selectedSummary.pending_review ??
        0
    ) === 0 &&
    Number(
      selectedSummary.rejected ??
        0
    ) === 0 &&
    Number(
      selectedSummary.approved ??
        0
    ) ===
      Number(
        selectedSummary.total_slots ??
          0
      );

  const currentJobTitle =
    selectedJob?.job_title ||
    selectedSet?.job?.title ||
    "Published job";

  const openJob = (
    job
  ) => {
    setSelectedJob(
      job
    );

    setSelectedSet(
      null
    );

    setSelectedSection(
      null
    );

    setActionError("");
    setActionSuccess("");

    setStage("sets");
  };

  const openSet = async (
    setItem
  ) => {
    const availability =
      getSetState(
        setItem
      );

    if (
      !availability.openable
    ) {
      setActionSuccess(
        ""
      );

      setActionError(
        `${availability.title}: ${availability.reason}`
      );

      return;
    }

    setActionError("");
    setActionSuccess("");

    setSelectedSection(
      null
    );

    const data =
      await loadSet(
        setItem.id
      );

    if (data) {
      setStage(
        "set-detail"
      );
    }
  };

  const openCompletedSet =
    async (setItem) => {
      const status =
        String(
          setItem?.status ||
            ""
        ).toLowerCase();

      if (
        ![
          "approved",
          "rejected",
        ].includes(status)
      ) {
        setActionSuccess("");

        setActionError(
          "Only completed assessment-set reviews can be opened from review history."
        );

        return;
      }

      setActionError("");

      setActionSuccess("");

      setSelectedSection(
        null
      );

      const data =
        await loadCompletedSet(
          setItem.id
        );

      if (data) {
        setStage(
          "set-detail"
        );
      }
    };

  const openSection = (
    section
  ) => {
    setSelectedSection(
      section
    );

    setQuestionSearch("");

    setStatusFilter(
      "all"
    );

    setSourceFilter(
      "all"
    );

    setActionError("");
    setActionSuccess("");

    setStage(
      "questions"
    );
  };

  const backToJobs =
    () => {
      setSelectedJob(
        null
      );

      setSelectedSet(
        null
      );

      setSelectedSection(
        null
      );

      setActionError("");
      setActionSuccess("");

      setStage(
        "jobs"
      );
    };

  const backToSets =
    () => {
      setSelectedSet(
        null
      );

      setSelectedSection(
        null
      );

      setActionError("");
      setActionSuccess("");

      setStage(
        "sets"
      );
    };

  const backToSetDetail =
    () => {
      setSelectedSection(
        null
      );

      setActionError("");
      setActionSuccess("");

      setStage(
        "set-detail"
      );
    };

  const refreshWorkspace =
    async () => {
      try {
        setRefreshing(
          true
        );

        setActionError("");
        setActionSuccess("");

        if (reviewMode === "completed") {
          await loadCompletedQueue();
        } else {
          await loadQueue();
        }

        if (
          selectedSet?.assessment_set_id
        ) {
          const selectedSetStatus = String(
            selectedSet?.status || ""
          ).toLowerCase();

          if (
            reviewMode === "completed" ||
            selectedSetStatus === "approved" ||
            selectedSetStatus === "rejected"
          ) {
            await loadCompletedSet(
              selectedSet.assessment_set_id,
              true
            );
          } else {
            await loadSet(
              selectedSet.assessment_set_id,
              true
            );
          }
        }
      } catch (err) {
        console.error(
          "Failed to refresh reviewer workspace:",
          err
        );

        if (
          !handleUnauthorized(
            err
          )
        ) {
          setActionError(
            getErrorMessage(
              err,
              "Unable to refresh the reviewer workspace."
            )
          );
        }
      } finally {
        setRefreshing(
          false
        );
      }
    };

  const approveQuestion =
    async (question) => {
      const id =
        getQuestionId(
          question
        );

      if (!id) {
        setActionError(
          "This question does not have a valid ID."
        );

        return;
      }

      if (
        question?.status !==
        "pending_review"
      ) {
        setActionError(
          "Only questions currently pending review can be approved."
        );

        return;
      }

      setApprovingId(id);

      setActionError("");
      setActionSuccess("");

      try {
        const approvalResponse = await api.post(
          `/questions/${id}/approve`
        );

        // Update the approved question immediately in both state objects.
        // The open section is a snapshot derived from selectedSet and can
        // otherwise keep rendering its stale pending_review status.
        const approvedQuestion = {
          ...question,
          ...(approvalResponse.data || {}),
          status: "approved",
        };

        const updateApprovedQuestion = (items) =>
          Array.isArray(items)
            ? items.map((item) =>
                getQuestionId(item) === id
                  ? { ...item, ...approvedQuestion }
                  : item
              )
            : items;

        setSelectedSet((current) =>
          current
            ? {
                ...current,
                questions: updateApprovedQuestion(current.questions),
              }
            : current
        );

        setSelectedSection((current) =>
          current
            ? {
                ...current,
                questions: updateApprovedQuestion(current.questions),
              }
            : current
        );

        setActionSuccess(
          `Question #${id} approved successfully.`
        );

        await Promise.all([
          loadQueue(),

          loadSet(
            selectedSet.assessment_set_id,
            true
          ),
        ]);
      } catch (err) {
        console.error(
          "Failed to approve question:",
          err
        );

        if (
          !handleUnauthorized(
            err
          )
        ) {
          setActionError(
            getErrorMessage(
              err,
              "Unable to approve the question."
            )
          );
        }
      } finally {
        setApprovingId(
          null
        );
      }
    };

  const rejectQuestion =
    async (event) => {
      event.preventDefault();

      const id =
        getQuestionId(
          rejectingQuestion
        );

      const reason =
        rejectionReason.trim();

      if (!id) {
        setActionError(
          "This question does not have a valid ID."
        );

        return;
      }

      if (!reason) {
        setActionError(
          "Rejection reason is required."
        );

        return;
      }

      setRejectingId(id);

      setActionError("");
      setActionSuccess("");

      try {
        await api.post(
          `/questions/${id}/reject`,
          {
            rejection_reason:
              reason,
          }
        );

        setActionSuccess(
          `Question #${id} rejected successfully.`
        );

        setRejectingQuestion(
          null
        );

        setRejectionReason(
          ""
        );

        await Promise.all([
          loadQueue(),

          loadSet(
            selectedSet.assessment_set_id,
            true
          ),
        ]);
      } catch (err) {
        console.error(
          "Failed to reject question:",
          err
        );

        if (
          !handleUnauthorized(
            err
          )
        ) {
          setActionError(
            getErrorMessage(
              err,
              "Unable to reject the question."
            )
          );
        }
      } finally {
        setRejectingId(
          null
        );
      }
    };

  const approveSet =
    async () => {
      const assessmentSetId =
        selectedSet?.assessment_set_id ??
        selectedSet?.id ??
        null;

      if (!assessmentSetId) {
        setActionError(
          "This assessment set does not have a valid ID."
        );

        return;
      }

      if (!setIsSubmitted) {
        setActionError(
          "Only assessment sets submitted for review can be approved."
        );

        return;
      }

      if (!setApprovalReady) {
        setActionError(
          "The assessment set cannot be approved until every slot is filled and every question is approved."
        );

        return;
      }

      setApprovingSetId(
        assessmentSetId
      );

      setActionError("");
      setActionSuccess("");

      try {
        const response = await api.post(
          `/assessment-reviews/sets/${assessmentSetId}/approve`,
          {}
        );

        const approvedSetLabel = getSetLabel(
          selectedSet
        );

        setSelectedSet((current) =>
          current
            ? {
                ...current,
                ...(response.data || {}),
                status: "approved",
                review_status: "approved",
              }
            : current
        );

        setSelectedJob((current) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            sets: (current.sets || []).map((setItem) =>
              Number(setItem?.id) === Number(assessmentSetId)
                ? {
                    ...setItem,
                    ...(response.data || {}),
                    status: "approved",
                    review_status: "approved",
                  }
                : setItem
            ),
          };
        });

        setSelectedSection(null);
        setActionSuccess(
          `${approvedSetLabel} approved successfully. The reviewer decision is complete; the set is now ready to be handed off to HR.`
        );
        setActionError("");

        await loadQueue();
      } catch (err) {
        console.error(
          "Failed to approve assessment set:",
          err
        );

        if (
          !handleUnauthorized(
            err
          )
        ) {
          setActionError(
            getErrorMessage(
              err,
              "Unable to approve the assessment set."
            )
          );
        }
      } finally {
        setApprovingSetId(
          null
        );
      }
    };

  const selectedHrRecipient = hrRecipients.find(
    (contact) => String(contact.id) === String(selectedHrUserId)
  ) || selectedSet?.hr_contact || null;

  const sendSetToHr =
    async () => {
      const assessmentSetId =
        selectedSet?.assessment_set_id ??
        selectedSet?.id ??
        null;

      if (!assessmentSetId) {
        setActionError(
          "This assessment set does not have a valid ID."
        );
        return;
      }

      const status = String(
        selectedSet?.status || ""
      ).toLowerCase();

      if (status !== "approved") {
        setActionError(
          "Only approved assessment sets can be sent to HR."
        );
        return;
      }

      const alreadySent = Boolean(
        selectedSet?.sent_to_hr ||
        selectedSet?.sent_to_hr_at
      );

      if (alreadySent) {
        setActionSuccess(
          `${getSetLabel(selectedSet)} has already been handed off to HR.`
        );
        setActionError("");
        return;
      }

      const selectedRecipient = hrRecipients.find(
        (contact) => String(contact.id) === String(selectedHrUserId)
      );

      if (!selectedRecipient) {
        setActionError("Choose an HR recipient before sending.");
        return;
      }

      const confirmed = window.confirm(
        `Send ${getSetLabel(
          selectedSet
        )} to ${selectedRecipient.name} (${selectedRecipient.email})? The approved assessment will become available in that HR user's workspace.`
      );

      if (!confirmed) {
        return;
      }

      setSendingToHrSetId(assessmentSetId);
      setActionError("");
      setActionSuccess("");

      try {
        const response = await api.post(
          `/assessment-reviews/sets/${assessmentSetId}/send-to-hr`,
          { hr_user_id: selectedRecipient.id }
        );

        const handoff = response?.data || {};

        setSelectedSet((current) =>
          current
            ? {
                ...current,
                ...handoff,
                status: "approved",
                review_status: "approved",
                sent_to_hr: true,
              }
            : current
        );

        setSelectedJob((current) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            sets: (current.sets || []).map((setItem) =>
              Number(setItem?.id) === Number(assessmentSetId)
                ? {
                    ...setItem,
                    ...handoff,
                    status: "approved",
                    review_status: "approved",
                    sent_to_hr: true,
                  }
                : setItem
            ),
          };
        });

        setActionSuccess(
          `${getSetLabel(
            selectedSet
          )} was sent to HR successfully. HR can now configure availability and candidate delivery.`
        );
        setActionError("");
      } catch (err) {
        console.error(
          "Failed to send assessment set to HR:",
          err
        );

        if (!handleUnauthorized(err)) {
          setActionError(
            getErrorMessage(
              err,
              "Unable to send the assessment set to HR."
            )
          );
        }
      } finally {
        setSendingToHrSetId(null);
      }
    };

  const rejectSet =
    async () => {
      const assessmentSetId =
        selectedSet?.assessment_set_id ??
        selectedSet?.id ??
        null;

      const reason =
        rejectionReason.trim();

      if (!assessmentSetId) {
        setActionError(
          "This assessment set does not have a valid ID."
        );

        return;
      }

      if (!setIsSubmitted) {
        setActionError(
          "Only assessment sets submitted for review can be rejected."
        );

        return;
      }

      if (!reason) {
        setActionError(
          "Rejection reason is required."
        );

        return;
      }

      setRejectingSetId(
        assessmentSetId
      );

      setActionError("");
      setActionSuccess("");

      try {
        await api.post(
          `/assessment-reviews/sets/${assessmentSetId}/reject`,
          {
            comment: reason,
          }
        );

        setActionSuccess(
          `${getSetLabel(
            selectedSet
          )} rejected successfully.`
        );

        setRejectingSet(
          false
        );

        setRejectionReason(
          ""
        );

        setSelectedSection(
          null
        );

        setSelectedSet(
          null
        );

        setSelectedJob(
          null
        );

        setReviewMode(
          "active"
        );

        setStage(
          "jobs"
        );

        await loadQueue();
      } catch (err) {
        console.error(
          "Failed to reject assessment set:",
          err
        );

        if (
          !handleUnauthorized(
            err
          )
        ) {
          setActionError(
            getErrorMessage(
              err,
              "Unable to reject the assessment set."
            )
          );
        }
      } finally {
        setRejectingSetId(
          null
        );
      }
    };

  const openVersionHistory =
    async (question) => {
      const id =
        getQuestionId(
          question
        );

      if (!id) {
        return;
      }

      setVersionQuestion(
        question
      );

      setVersions([]);

      setVersionsError("");

      setVersionsLoading(
        true
      );

      try {
        const response =
          await api.get(
            `/questions/${id}/versions`
          );

        setVersions(
          Array.isArray(
            response.data
          )
            ? response.data
            : []
        );
      } catch (err) {
        console.error(
          "Failed to load version history:",
          err
        );

        if (
          !handleUnauthorized(
            err
          )
        ) {
          setVersionsError(
            getErrorMessage(
              err,
              "Unable to load version history."
            )
          );
        }
      } finally {
        setVersionsLoading(
          false
        );
      }
    };

  if (loading) {
    return (
      <RecruiterLayout
        title="Assessment Review"
        breadcrumb="Workspace / Assessment Review"
      >
        <main className="mx-auto flex min-h-[65vh] max-w-[1500px] items-center justify-center px-5 sm:px-8">
          <LoadingPanel
            text="Loading reviewer workspace..."
          />
        </main>
      </RecruiterLayout>
    );
  }

  return (
    <RecruiterLayout
      title="Assessment Review"
      breadcrumb={`Workspace / Assessment Review${
        selectedJob
          ? ` / ${selectedJob.job_title}`
          : ""
      }`}
    >
      <div className="mx-auto max-w-[1500px] space-y-6 pb-12 text-[#202938]">
        <section className="group relative isolate overflow-hidden rounded-[22px] border border-[#DFE2F1] bg-gradient-to-br from-white via-[#FCFBFF] to-[#F3FAF8] px-5 py-7 shadow-[0_12px_34px_rgba(27,37,58,0.045)] transition-shadow duration-300 hover:shadow-[0_16px_40px_rgba(86,88,232,0.07)] sm:px-8 sm:py-8 lg:px-10">
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[#DCD7FF]/30 blur-[65px]" />
          <div aria-hidden="true" className="pointer-events-none absolute bottom-[-5rem] right-24 h-44 w-44 rounded-full bg-[#CFF3E8]/30 blur-[60px]" />
          <div
            aria-hidden="true"
            data-review-hero-doodle
            className="pointer-events-none absolute right-7 top-5 hidden h-24 w-32 sm:block"
          >
            <div className="absolute right-1 top-1 h-16 w-16 rotate-12 rounded-2xl border border-[#7862C8]/20 transition-transform duration-700 group-hover:rotate-45" />
            <div className="absolute right-5 top-5 h-11 w-11 rounded-full border border-dashed border-[#0F9D8A]/30 transition-transform duration-700 group-hover:-rotate-12" />
            <span className="absolute right-7 top-8 h-2 w-2 rounded-full bg-[#7862C8]/50 animate-pulse" />
            <span className="absolute right-0 top-4 h-1.5 w-1.5 rounded-full bg-[#0F9D8A]/65 animate-ping" />
            <span className="absolute right-24 top-14 h-1.5 w-1.5 rounded-full bg-[#7862C8]/55 animate-pulse" />
            <div className="absolute right-0 top-[4.5rem] h-px w-8 rotate-[-24deg] bg-[#7862C8]/30" />
          </div>

          <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#D9DEE7] bg-[#FAFBFC] px-3 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#5658E8]" />

                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#667085]">
                  Independent reviewer gate
                </span>
              </div>

              <h1 className="text-[30px] font-semibold leading-[1.08] tracking-[-0.035em] text-[#182033] sm:text-[38px]">
                {stage ===
                "jobs"
                  ? reviewMode === "completed"
                    ? "Completed Review History"
                    : "Assessment Review"
                  : stage === "sets"
                    ? `${currentJobTitle} — ${
                        reviewMode === "completed"
                          ? "Completed Reviews"
                          : "Assessment Sets"
                      }`
                    : stage ===
                        "set-detail"
                      ? `${getSetLabel(
                          selectedSet
                        )} — ${
                          reviewMode === "completed"
                            ? "Completed Review"
                            : "Review Package"
                        }`
                      : selectedSection?.name ||
                        "Question Review"}
              </h1>

              <p className="mt-2.5 max-w-3xl text-sm leading-6 text-[#667085]">
                {stage ===
                "jobs"
                  ? reviewMode === "completed"
                    ? "Browse completed reviewer decisions and reopen any approved or rejected assessment set in read-only mode."
                    : "Review HR-published jobs and choose an assessment set."
                  : stage === "sets"
                    ? reviewMode === "completed"
                      ? "Set A and Set B are shown with their completed reviewer decisions. Completed reviews are read-only."
                      : "Set A and Set B are shown with their current status. Only sets submitted by the Assessment Manager can be opened."
                    : stage ===
                        "set-detail"
                      ? reviewMode === "completed"
                        ? `Inspect ${getSetLabel(
                            selectedSet
                          )} and its persisted reviewer decision.`
                        : `Review ${
                            getSetLabel(
                              selectedSet
                            )
                          } against the job requirements.`
                      : `Review questions in ${
                          selectedSection?.name ||
                          "this section"
                        } individually.`}
              </p>
            </div>

            <button
              type="button"
              onClick={
                refreshWorkspace
              }
              disabled={
                refreshing
              }
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-[#C9D0DC] bg-white px-4 text-sm font-semibold text-[#475467] transition hover:border-[#5658E8] hover:text-[#5658E8] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                size={15}
                className={
                  refreshing
                    ? "animate-spin"
                    : ""
                }
              />

              Refresh
            </button>
          </div>
        </section>

        {(error ||
          actionError ||
          actionSuccess) && (
          <div className="space-y-3">
            {error && (
              <div className="flex gap-3 rounded-[18px] border border-[#E9C8C8] bg-[#FFF8F8] px-4 py-3.5 text-sm text-[#A83E3E]">
                <AlertCircle
                  size={17}
                  className="mt-0.5 shrink-0"
                />

                <p>
                  {error}
                </p>
              </div>
            )}

            {actionError && (
              <div className="flex gap-3 rounded-[18px] border border-[#E9C8C8] bg-[#FFF8F8] px-4 py-3.5 text-sm text-[#A83E3E]">
                <AlertCircle
                  size={17}
                  className="mt-0.5 shrink-0"
                />

                <p>
                  {
                    actionError
                  }
                </p>
              </div>
            )}

            {actionSuccess && (
              <div className="flex gap-3 rounded-[18px] border border-[#CFE4D9] bg-[#F5FAF7] px-4 py-3.5 text-sm text-[#28734E]">
                <CheckCircle2
                  size={17}
                  className="mt-0.5 shrink-0"
                />

                <p>
                  {
                    actionSuccess
                  }
                </p>
              </div>
            )}
          </div>
        )}

        {stage ===
          "jobs" && (
          <section className="space-y-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#5658E8]">
                  {reviewMode === "completed"
                    ? "Review history"
                    : "Review queue"}
                </p>

                <h2 className="mt-1.5 text-[23px] font-semibold tracking-[-0.02em] text-[#182033]">
                  {reviewMode === "completed"
                    ? "Completed reviews"
                    : "HR-published jobs"}
                </h2>

                <p className="mt-1 text-sm leading-6 text-[#667085]">
                  {reviewMode === "completed"
                    ? "Open an approved or rejected review without changing it."
                    : "Select a job to see Set A and Set B."}
                </p>
              </div>

              <div className="flex w-full flex-col gap-3 lg:w-auto lg:flex-row lg:items-center lg:justify-end lg:gap-3">
                <div className="inline-grid w-full shrink-0 grid-cols-2 items-center gap-1 rounded-xl border border-[#E0E4EF] bg-[#F7F8FC] p-1.5 sm:w-auto">
                  <button
                    type="button"
                    onClick={() =>
                      switchReviewMode(
                        "active"
                      )
                    }
                    className={`inline-flex h-10 min-w-[145px] items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-xs font-semibold transition duration-200 ${
                      reviewMode ===
                      "active"
                        ? "bg-[#5658E8] text-white shadow-[0_3px_8px_rgba(86,88,232,0.20)]"
                        : "text-[#667085] hover:bg-white hover:text-[#5658E8]"
                    }`}
                  >
                    <ClipboardCheck
                      size={
                        14
                      }
                    />
                    Pending reviews
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      switchReviewMode(
                        "completed"
                      )
                    }
                    className={`inline-flex h-10 min-w-[145px] items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-xs font-semibold transition duration-200 ${
                      reviewMode ===
                      "completed"
                        ? "bg-[#5658E8] text-white shadow-[0_3px_8px_rgba(86,88,232,0.20)]"
                        : "text-[#667085] hover:bg-white hover:text-[#5658E8]"
                    }`}
                  >
                    {historyLoading ? (
                      <RefreshCw
                        size={
                          14
                        }
                        className="animate-spin"
                      />
                    ) : (
                      <History
                        size={
                          14
                        }
                      />
                    )}
                    Completed history
                  </button>
                </div>

                <div className="relative w-full min-w-0 lg:w-[320px] lg:shrink-0">
                  <Search
                    size={15}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#98A2B3]"
                  />

                  <input
                    value={
                      jobSearch
                    }
                    onChange={(
                      event
                    ) =>
                      setJobSearch(
                        event.target
                          .value
                      )
                    }
                    placeholder={
                      reviewMode ===
                      "completed"
                        ? "Search completed reviews..."
                        : "Search published jobs..."
                    }
                    className="h-11 w-full rounded-xl border border-[#DDE2ED] bg-white pl-10 pr-3 text-sm outline-none transition placeholder:text-[#98A2B3] focus:border-[#5658E8] focus:ring-4 focus:ring-[#5658E8]/10"
                  />
                </div>
              </div>
            </div>

            {reviewMode === "completed" &&
            historyLoading &&
            filteredJobs.length === 0 ? (
              <section
                aria-live="polite"
                className="flex min-h-[190px] flex-col items-center justify-center rounded-[20px] border border-[#E3E6EB] bg-white px-6 py-9 text-center shadow-[0_8px_24px_rgba(27,37,58,0.035)]"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F0EDFF] text-[#5658E8]">
                  <RefreshCw size={19} className="animate-spin" />
                </div>
                <h3 className="mt-4 text-sm font-semibold text-[#202938]">
                  Loading completed reviews
                </h3>
                <p className="mt-1.5 max-w-sm text-xs leading-5 text-[#667085]">
                  Fetching your approved and rejected assessment sets.
                </p>
              </section>
            ) : filteredJobs.length === 0 ? (
              <EmptyPanel
                title={
                  reviewMode ===
                  "completed"
                    ? "No completed reviews"
                    : "No reviewable jobs"
                }
                description={
                  reviewMode ===
                  "completed"
                    ? "There are currently no approved or rejected Assessment Sets in your completed reviewer history."
                    : "There are currently no Assessment Sets submitted for review within your assigned reviewer scope."
                }
              />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {filteredJobs.map(
                  (job) => (
                    <button
                      key={
                        job.job_id
                      }
                      type="button"
                      onClick={() =>
                        openJob(
                          job
                        )
                      }
                      className="group rounded-[20px] border border-[#E3E6EB] bg-white p-5 text-left shadow-[0_8px_26px_rgba(27,37,58,0.035)] transition hover:-translate-y-0.5 hover:border-[#C9CDF3] sm:p-6"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#EAE5F9] text-[#7862C8]">
                            <FileText
                              size={
                                19
                              }
                            />
                          </div>

                          <div className="min-w-0">
                            <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-[#8A94A8]">
                              Published job
                            </p>

                            <h3 className="mt-1 truncate text-[21px] font-semibold text-[#202938]">
                              {
                                job.job_title
                              }
                            </h3>

                            <p className="mt-1 truncate text-[11px] text-[#98A2B3]">
                              {
                                job.question_set_name
                              }
                            </p>
                          </div>
                        </div>

                        <ChevronRight
                          size={
                            18
                          }
                          className="mt-1 shrink-0 text-[#98A2B3] group-hover:text-[#5658E8]"
                        />
                      </div>

                      <div className="mt-5 grid gap-3 sm:grid-cols-3">
                        <MetaCard
                          label="Assessment sets"
                          value={
                            job.sets
                              .length
                          }
                        />

                        <MetaCard
                          label={
                            reviewMode ===
                            "completed"
                              ? "Completed"
                              : "Submitted"
                          }
                          value={
                            job.sets.filter(
                              (
                                item
                              ) =>
                                item.is_openable
                            ).length
                          }
                        />

                        <MetaCard
                          label={
                            reviewMode ===
                            "completed"
                              ? "History"
                              : "Review"
                          }
                          value={
                            reviewMode ===
                            "completed"
                              ? job.sets.some(
                                  (
                                    item
                                  ) =>
                                    item.status ===
                                    "rejected"
                                )
                                ? "Includes rejection"
                                : "Completed"
                              : job.sets.some(
                                  (
                                    item
                                  ) =>
                                    item.is_openable
                                )
                                ? "Available"
                                : "Waiting"
                          }
                        />
                      </div>
                    </button>
                  )
                )}
              </div>
            )}
          </section>
        )}

        {stage ===
          "sets" &&
          selectedJob && (
            <section className="space-y-5">
              <div className="rounded-[18px] border border-[#E3E6EB] bg-white p-5 shadow-[0_8px_26px_rgba(27,37,58,0.035)] sm:p-6">
                <button
                  type="button"
                  onClick={
                    backToJobs
                  }
                  className="inline-flex items-center gap-2 text-xs font-semibold text-[#5658E8] hover:underline"
                >
                  <ArrowLeft
                    size={
                      14
                    }
                  />

                  Back to jobs
                </button>

                <div className="mt-5">
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#5658E8]">
                    {reviewMode ===
                    "completed"
                      ? "Completed review history"
                      : "Published job"}
                  </p>

                  <h2 className="mt-1.5 text-[30px] font-semibold tracking-[-0.025em] text-[#182033]">
                    {
                      selectedJob.job_title
                    }
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-[#667085]">
                    {reviewMode ===
                    "completed"
                      ? "Choose the completed assessment variant you want to inspect."
                      : "Choose the assessment variant you want to review."}
                  </p>
                </div>
              </div>

              <div className="grid gap-5 xl:grid-cols-2">
                {selectedJob.sets.map(
                  (setItem) => {
                    const state =
                      reviewMode ===
                      "completed"
                        ? getCompletedSetState(
                            setItem
                          )
                        : getSetState(
                            setItem
                          );

                    return (
                      <article
                        key={
                          setItem.id
                        }
                        className={`rounded-[20px] border bg-white p-5 shadow-[0_8px_26px_rgba(27,37,58,0.035)] sm:p-6 ${
                          state.openable
                            ? "border-[#DDDFF7]"
                            : "border-[#E3E6EB]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <div
                              className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                                state.openable
                                  ? "bg-[#EAE5F9] text-[#5658E8]"
                                  : "bg-[#F4F5F8] text-[#98A2B3]"
                              }`}
                            >
                              {state.openable ? (
                                reviewMode ===
                                "completed" ? (
                                  <History
                                    size={
                                      20
                                    }
                                  />
                                ) : (
                                  <FileText
                                    size={
                                      20
                                    }
                                  />
                                )
                              ) : (
                                <Lock
                                  size={
                                    19
                                  }
                                />
                              )}
                            </div>

                            <div>
                              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#8A94A8]">
                                Assessment
                                set
                              </p>

                              <h3 className="mt-1 text-[27px] font-semibold text-[#202938]">
                                {
                                  getSetLabel(
                                    setItem
                                  )
                                }
                              </h3>

                              <p className="mt-1 text-xs text-[#98A2B3]">
                                Variant{" "}
                                {
                                  setItem.variant_number ??
                                  "—"
                                }
                              </p>
                            </div>
                          </div>

                          <StatusBadge
                            status={
                              setItem.status
                            }
                          />
                        </div>

                        <div className="mt-5 grid gap-3 sm:grid-cols-3">
                          <MetaCard
                            label="Questions"
                            value={
                              setItem.question_count ??
                              0
                            }
                          />

                          <MetaCard
                            label="Pending"
                            value={
                              setItem.pending_review_count ??
                              0
                            }
                          />

                          <MetaCard
                            label="Approved"
                            value={
                              setItem.approved_count ??
                              0
                            }
                          />
                        </div>

                        <div className="mt-5 rounded-[16px] border border-[#EEF0F3] bg-[#FCFCFD] p-4">
                          <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#8A94A8]">
                            {
                              state.title
                            }
                          </p>

                          <p className="mt-1.5 text-sm leading-6 text-[#667085]">
                            {
                              state.reason
                            }
                          </p>
                        </div>

                        <button
                          type="button"
                          disabled={
                            !state.openable
                          }
                          onClick={() =>
                            reviewMode ===
                            "completed"
                              ? openCompletedSet(
                                  setItem
                                )
                              : openSet(
                                  setItem
                                )
                          }
                          className={`mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold ${
                            state.openable
                              ? "bg-[#5658E8] text-white hover:bg-[#494BD8]"
                              : "cursor-not-allowed border border-[#D4DAE4] bg-[#F8F9FB] text-[#98A2B3]"
                          }`}
                        >
                          {state.openable ? (
                            <>
                              {
                                state.button
                              }

                              <ChevronRight
                                size={
                                  15
                                }
                              />
                            </>
                          ) : (
                            <>
                              <Lock
                                size={
                                  14
                                }
                              />

                              {
                                state.button
                              }
                            </>
                          )}
                        </button>
                      </article>
                    );
                  }
                )}
              </div>
            </section>
          )}

        {stage ===
          "set-detail" &&
          selectedSet && (
            <section className="space-y-5">
              <div className="rounded-[18px] border border-[#E3E6EB] bg-white p-5 shadow-[0_8px_26px_rgba(27,37,58,0.035)] sm:p-6">
                <button
                  type="button"
                  onClick={
                    backToSets
                  }
                  className="inline-flex items-center gap-2 text-xs font-semibold text-[#5658E8] hover:underline"
                >
                  <ArrowLeft
                    size={
                      14
                    }
                  />

                  Back to assessment sets
                </button>

                <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[#EAE5F9] px-3 py-1.5 text-[10px] font-bold text-[#5658E8]">
                        {
                          getSetLabel(
                            selectedSet
                          )
                        }
                      </span>

                      <StatusBadge
                        status={
                          selectedSet.status
                        }
                      />
                    </div>

                    <h2 className="mt-3 text-[30px] font-semibold tracking-[-0.025em] text-[#182033]">
                      {
                        currentJobTitle
                      }
                    </h2>

                    <p className="mt-1 text-sm text-[#667085]">
                      {
                        selectedSet.title ||
                        "Submitted Assessment Set"
                      }
                    </p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3">
                    <MetaCard
                      label="Total slots"
                      value={
                        selectedSummary.total_slots ??
                        0
                      }
                    />

                    <MetaCard
                      label="Pending"
                      value={
                        selectedSummary.pending_review ??
                        0
                      }
                    />

                    <MetaCard
                      label="Approved"
                      value={
                        selectedSummary.approved ??
                        0
                      }
                    />
                  </div>
                </div>
              </div>

              {reviewMode ===
                "completed" && (
                <section className="rounded-[20px] border border-[#DDDFF7] bg-[#F9F9FF] p-5 sm:p-6">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#5658E8]">
                        <History
                          size={
                            18
                          }
                        />
                      </div>

                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-[#7862C8]">
                          Persisted review decision
                        </p>

                        <h3 className="mt-1 text-lg font-semibold text-[#36386E]">
                          {String(
                            selectedSet?.review_status ||
                              selectedSet?.status ||
                              ""
                          ).toLowerCase() ===
                          "approved"
                            ? "Assessment Set approved"
                            : "Assessment Set rejected"}
                        </h3>

                        <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[#667085]">
                          This record is read-only. The displayed decision,
                          reviewer metadata, checklist, and comment come from
                          the completed review.
                        </p>
                      </div>
                    </div>

                    <div className="grid w-full gap-3 sm:grid-cols-3 lg:w-auto">
                      <MetaCard
                        label="Decision"
                        value={
                          selectedSet?.review_status ||
                          selectedSet?.status ||
                          "—"
                        }
                      />

                      <MetaCard
                        label="Reviewer"
                        value={
                          selectedSet?.reviewer_id ??
                          "—"
                        }
                      />

                      <MetaCard
                        label="Reviewed at"
                        value={
                          selectedSet?.reviewed_at
                            ? new Date(
                                selectedSet.reviewed_at
                              ).toLocaleString()
                            : "—"
                        }
                      />
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                    <div className="rounded-[16px] border border-[#E4E0F4] bg-white p-4">
                      <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#8A94A8]">
                        Review comment
                      </p>

                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#475467]">
                        {selectedSet?.review_comment ||
                          "No review comment was recorded."}
                      </p>
                    </div>

                    <div className="rounded-[16px] border border-[#E4E0F4] bg-white p-4">
                      <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#8A94A8]">
                        Review checklist
                      </p>

                      {selectedSet?.review_checklist &&
                      Object.keys(
                        selectedSet.review_checklist
                      ).length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {Object.entries(
                            selectedSet.review_checklist
                          ).map(
                            ([
                              key,
                              value,
                            ]) => (
                              <div
                                key={
                                  key
                                }
                                className="flex items-center justify-between gap-3 rounded-md border border-[#E7E9EE] bg-[#FCFCFD] px-3 py-2.5 text-xs"
                              >
                                <span className="text-[#475467]">
                                  {String(
                                    key
                                  ).replace(
                                    /_/g,
                                    " "
                                  )}
                                </span>

                                <span
                                  className={
                                    value
                                      ? "font-bold text-[#28734E]"
                                      : "font-bold text-[#A83E3E]"
                                  }
                                >
                                  {value
                                    ? "Pass"
                                    : "Fail"}
                                </span>
                              </div>
                            )
                          )}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm leading-6 text-[#98A2B3]">
                          No checklist values were recorded.
                        </p>
                      )}
                    </div>
                  </div>
                </section>
              )}

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
                <section className="rounded-[20px] border border-[#E3E6EB] bg-white p-5 sm:p-6">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#5658E8]">
                      <FileText
                        size={
                          18
                        }
                      />
                    </div>

                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-[#5658E8]">
                        Job context
                      </p>

                      <h3 className="mt-1 text-lg font-semibold text-[#202938]">
                        {
                          selectedSet
                            ?.job
                            ?.title ||
                          currentJobTitle
                        }
                      </h3>
                    </div>
                  </div>

                  <div className="mt-5 rounded-[16px] border border-[#EEF0F3] bg-[#FCFCFD] p-4">
                    <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#8A94A8]">
                      Job description
                    </p>

                    <div className="mt-2 max-h-[260px] overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-[#475467]">
                      {
                        selectedSet
                          ?.job
                          ?.description ||
                        "No job description returned."
                      }
                    </div>
                  </div>
                </section>

                <section className="rounded-[20px] border border-[#E3E6EB] bg-white p-5 sm:p-6">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F4F5F8] text-[#667085]">
                      <CalendarDays
                        size={
                          18
                        }
                      />
                    </div>

                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-[#8A94A8]">
                        Question Set
                      </p>

                      <h3 className="mt-1 text-lg font-semibold text-[#202938]">
                        Configuration
                      </h3>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <MetaCard
                      label="Hiring year"
                      value={
                        selectedSet
                          ?.question_set
                          ?.hiring_year
                      }
                    />

                    <MetaCard
                      label="Hiring cycle"
                      value={
                        selectedSet
                          ?.question_set
                          ?.hiring_cycle
                      }
                    />

                    <MetaCard
                      label="Configured questions"
                      value={
                        selectedSet
                          ?.configuration
                          ?.total_questions
                      }
                    />

                    <MetaCard
                      label="Duration"
                      value={
                        selectedSet
                          ?.configuration
                          ?.duration_minutes
                          ? `${selectedSet.configuration.duration_minutes} min`
                          : "—"
                      }
                    />
                  </div>
                </section>
              </div>

              <section className="rounded-[20px] border border-[#DDDFF7] bg-[#F9F9FF] p-5 sm:p-6">
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#7862C8]">
                  Coverage
                </p>

                <h3 className="mt-1.5 text-[22px] font-semibold text-[#36386E]">
                  Review section by section
                </h3>

                <p className="mt-1.5 text-sm leading-6 text-[#667085]">
                  Open a section to inspect its current questions.
                </p>
              </section>

              {(setIsSubmitted || setIsApproved) && (
                <section className="rounded-[20px] border border-[#E3E6EB] bg-white p-5 shadow-[0_8px_26px_rgba(27,37,58,0.035)] sm:p-6">
                  {setIsSubmitted ? (
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#5658E8]">
                          Final decision
                        </p>

                        <h3 className="mt-1.5 text-[22px] font-semibold text-[#202938]">
                          Complete the independent review
                        </h3>

                        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[#667085]">
                          Approve the complete set only when every slot is
                          filled and every current question has been approved.
                          A rejection sends the set back for revision.
                        </p>

                        {!setApprovalReady && (
                          <div className="mt-3 rounded-md border border-[#F0E0BE] bg-[#FFFBF3] px-3 py-2.5 text-xs font-semibold leading-5 text-[#916C22]">
                            Approval is currently blocked:{" "}
                            {Number(
                              selectedSummary.remaining_slots ??
                                0
                            )}{" "}
                            slot(s) remaining, {" "}
                            {Number(
                              selectedSummary.pending_review ??
                                0
                            )}{" "}
                            pending, and {" "}
                            {Number(
                              selectedSummary.rejected ??
                                0
                            )}{" "}
                            rejected.
                          </div>
                        )}
                      </div>

                      <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                        <button
                          type="button"
                          onClick={approveSet}
                          disabled={
                            !setApprovalReady ||
                            approvingSetId !== null ||
                            rejectingSetId !== null
                          }
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#28734E] px-5 text-sm font-semibold text-white transition hover:bg-[#216240] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <CheckCircle2 size={16} />

                          {approvingSetId !== null
                            ? "Approving..."
                            : "Approve Set"}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setRejectingSet(true);
                            setRejectionReason("");
                            setActionError("");
                          }}
                          disabled={
                            approvingSetId !== null ||
                            rejectingSetId !== null
                          }
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[#D9B5B5] bg-white px-5 text-sm font-semibold text-[#A83E3E] transition hover:bg-[#FFF8F8] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <XCircle size={16} />

                          Reject Set
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#E2F3EA] text-[#28734E]">
                          <Send size={18} />
                        </div>

                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#28734E]">
                            Reviewer → HR handoff
                          </p>

                          <h3 className="mt-1.5 text-[22px] font-semibold text-[#202938]">
                            {sentToHr
                              ? "Assessment sent to HR"
                              : "Assessment ready for HR"}
                          </h3>

                          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[#667085]">
                            {sentToHr
                              ? "The reviewer decision is complete and this approved assessment is now available in the HR workspace for availability and candidate-delivery configuration."
                              : "The reviewer decision is complete. Hand the approved assessment to HR so HR can configure availability and candidate delivery."}
                          </p>

                                                    <div className="mt-4 w-full max-w-xl rounded-2xl border border-[#DDE3F0] bg-white p-4 shadow-sm">
                            <div className="flex items-start gap-3">
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#EEF0FF] text-sm font-bold text-[#5146D8]">
                                {selectedHrRecipient?.name
                                  ? selectedHrRecipient.name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join("").toUpperCase()
                                  : "HR"}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#667085]">
                                  {sentToHr ? "Sent to HR recipient" : "Choose HR recipient"}
                                </p>
                                <p className="mt-1 truncate text-sm font-semibold text-[#202938]">
                                  {selectedHrRecipient?.name || "Select an HR contact"}
                                </p>
                                <p className="mt-0.5 break-all text-xs text-[#667085]">
                                  {selectedHrRecipient?.email || "No recipient selected"}
                                </p>
                              </div>
                              <span className="shrink-0 rounded-full bg-[#EEF0FF] px-2.5 py-1 text-[10px] font-semibold text-[#5146D8]">
                                {sentToHr ? "Sent" : "Recipient"}
                              </span>
                            </div>

                            <label
                              htmlFor="assessment-hr-recipient"
                              className="mt-4 block text-xs font-semibold text-[#344054]"
                            >
                              Send assessment to
                            </label>
                            <select
                              id="assessment-hr-recipient"
                              value={selectedHrUserId}
                              onChange={(event) => setSelectedHrUserId(event.target.value)}
                              disabled={hrRecipientsLoading || hrRecipients.length === 0 || sentToHr || sendingToHrSetId !== null}
                              className="mt-2 min-h-11 w-full rounded-xl border border-[#D0D5DD] bg-white px-3 text-sm text-[#202938] outline-none transition focus:border-[#5658E8] focus:ring-2 focus:ring-[#5658E8]/15 disabled:cursor-not-allowed disabled:bg-[#F8FAFC] disabled:text-[#667085]"
                            >
                              <option value="">
                                {hrRecipientsLoading ? "Loading HR contacts..." : "Select an HR contact"}
                              </option>
                              {hrRecipients.map((contact) => (
                                <option key={contact.id} value={String(contact.id)}>
                                  {contact.name} — {contact.email}
                                </option>
                              ))}
                            </select>
                            {hrRecipientsError && !hrRecipientsLoading && (
                              <p role="alert" className="mt-2 text-xs text-[#B42318]">
                                {hrRecipientsError}
                              </p>
                            )}
                          </div>

                          {sentToHr && selectedSet?.sent_to_hr_at && (
                            <p className="mt-2 text-xs font-semibold text-[#28734E]">
                              Sent to HR on {new Date(
                                selectedSet.sent_to_hr_at
                              ).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="w-full lg:w-auto">
                        {sentToHr ? (
                          <div className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[#B9DEC9] bg-[#F3FBF6] px-5 text-sm font-semibold text-[#28734E] lg:w-auto">
                            <CheckCircle2 size={16} />
                            Sent to HR
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={sendSetToHr}
                            disabled={
                              sendingToHrSetId !== null ||
                              hrRecipientsLoading ||
                              !selectedHrUserId ||
                              hrRecipients.length === 0
                            }
                            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[#5658E8] px-5 text-sm font-semibold text-white shadow-[0_7px_20px_rgba(86,88,232,0.18)] transition hover:bg-[#494BD8] disabled:cursor-not-allowed disabled:opacity-60 lg:w-auto"
                          >
                            {sendingToHrSetId !== null ? (
                              <RefreshCw
                                size={16}
                                className="animate-spin"
                              />
                            ) : (
                              <Send size={16} />
                            )}

                            {sendingToHrSetId !== null
                              ? "Sending to HR..."
                              : "Send to HR"}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              )}

              {loadingSet ? (
                <LoadingPanel
                  text={
                      reviewMode ===
                      "completed"
                        ? "Loading completed assessment-set review..."
                        : "Loading submitted assessment set..."
                    }
                />
              ) : sections.length ===
                0 ? (
                <EmptyPanel
                  title="No reviewable sections"
                  description="The submitted Assessment Set does not contain reviewable questions or slots."
                />
              ) : (
                <div className="grid gap-4 xl:grid-cols-3">
                  {sections.map(
                    (
                      section
                    ) => (
                      <button
                        key={
                          section.key
                        }
                        type="button"
                        onClick={() =>
                          openSection(
                            section
                          )
                        }
                        className="rounded-[20px] border border-[#E3E6EB] bg-white p-5 text-left shadow-[0_8px_26px_rgba(27,37,58,0.035)] transition hover:-translate-y-0.5 hover:border-[#C9CDF3] sm:p-6"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#7862C8]">
                              Section
                            </p>

                            <h3 className="mt-1.5 text-[20px] font-semibold text-[#202938]">
                              {
                                section.name
                              }
                            </h3>

                            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#98A2B3]">
                              {
                                section.section_type
                              }
                            </p>
                          </div>

                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EAE5F9] text-[#7862C8]">
                            <ChevronRight
                              size={
                                18
                              }
                            />
                          </span>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <MetaCard
                            label="Slots"
                            value={
                              section.slotCount
                            }
                          />

                          <MetaCard
                            label="Questions"
                            value={
                              section.questionCount
                            }
                          />

                          <MetaCard
                            label="Pending"
                            value={
                              section.pendingCount
                            }
                          />

                          <MetaCard
                            label="Approved"
                            value={
                              section.approvedCount
                            }
                          />
                        </div>

                        {section.rejectedCount >
                          0 && (
                          <div className="mt-4 rounded-md border border-[#E9C8C8] bg-[#FFF8F8] px-3 py-2.5 text-xs font-semibold text-[#A83E3E]">
                            {
                              section.rejectedCount
                            }{" "}
                            rejected question
                            {
                              section.rejectedCount ===
                              1
                                ? ""
                                : "s"
                            }
                          </div>
                        )}
                      </button>
                    )
                  )}
                </div>
              )}
            </section>
          )}

        {stage ===
          "questions" &&
          selectedSet &&
          selectedSection && (
            <section className="space-y-5">
              <div className="rounded-[18px] border border-[#E3E6EB] bg-white p-5 sm:p-6">
                <button
                  type="button"
                  onClick={
                    backToSetDetail
                  }
                  className="inline-flex items-center gap-2 text-xs font-semibold text-[#5658E8] hover:underline"
                >
                  <ArrowLeft
                    size={
                      14
                    }
                  />

                  Back to set review
                </button>

                <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-[#EAE5F9] px-3 py-1.5 text-[10px] font-bold text-[#5658E8]">
                        {
                          getSetLabel(
                            selectedSet
                          )
                        }
                      </span>

                      <span className="rounded-full bg-[#F4F5F8] px-3 py-1.5 text-[10px] font-bold text-[#667085]">
                        {
                          selectedSection.name
                        }
                      </span>
                    </div>

                    <h2 className="mt-2 text-[27px] font-semibold text-[#182033]">
                      Question review
                    </h2>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {reviewMode ===
                      "completed" && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EAE5F9] px-3 py-1.5 text-[10px] font-bold text-[#5658E8]">
                        <Lock
                          size={
                            12
                          }
                        />
                        Read-only history
                      </span>
                    )}

                    <span className="rounded-full bg-[#F4F5F8] px-3 py-1.5 text-[10px] font-bold text-[#667085]">
                      {
                        visibleQuestions.length
                      }{" "}
                      shown
                    </span>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_170px_180px]">
                  <div className="relative">
                    <Search
                      size={
                        15
                      }
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#98A2B3]"
                    />

                    <input
                      value={
                        questionSearch
                      }
                      onChange={(
                        event
                      ) =>
                        setQuestionSearch(
                          event.target
                            .value
                        )
                      }
                      placeholder="Search questions..."
                      className="h-10 w-full rounded-md border border-[#D4DAE4] bg-white pl-10 pr-3 text-sm outline-none focus:border-[#5658E8]"
                    />
                  </div>

                  <select
                    value={
                      statusFilter
                    }
                    onChange={(
                      event
                    ) =>
                      setStatusFilter(
                        event.target
                          .value
                      )
                    }
                    className="h-10 rounded-md border border-[#D4DAE4] bg-white px-3 text-sm outline-none focus:border-[#5658E8]"
                  >
                    <option value="all">
                      All statuses
                    </option>

                    <option value="pending_review">
                      Pending review
                    </option>

                    <option value="approved">
                      Approved
                    </option>

                    <option value="rejected">
                      Rejected
                    </option>
                  </select>

                  <select
                    value={
                      sourceFilter
                    }
                    onChange={(
                      event
                    ) =>
                      setSourceFilter(
                        event.target
                          .value
                      )
                    }
                    className="h-10 rounded-md border border-[#D4DAE4] bg-white px-3 text-sm outline-none focus:border-[#5658E8]"
                  >
                    <option value="all">
                      All sources
                    </option>

                    <option value="ai_generated">
                      AI generated
                    </option>

                    <option value="manual">
                      Manual
                    </option>
                  </select>
                </div>
              </div>

              {visibleQuestions.length ===
              0 ? (
                <EmptyPanel
                  title="No questions match"
                  description="Try another search or filter."
                />
              ) : (
                <div className="space-y-4">
                  {visibleQuestions.map(
                    (
                      question
                    ) => {
                      const id =
                        getQuestionId(
                          question
                        );

                      const checks = [
                        [
                          "Question text",
                          Boolean(
                            String(
                              question?.question_text ||
                                ""
                            ).trim()
                          ),
                        ],

                        [
                          "Question type",
                          [
                            "MCQ",
                            "FREE_TEXT",
                          ].includes(
                            String(
                              question?.question_type ||
                                ""
                            ).toUpperCase()
                          ),
                        ],

                        [
                          "Skill mapping",
                          Number(
                            question?.skill_id
                          ) > 0,
                        ],

                        [
                          "Difficulty",
                          [
                            "easy",
                            "medium",
                            "hard",
                          ].includes(
                            String(
                              question?.difficulty ||
                                ""
                            ).toLowerCase()
                          ),
                        ],
                      ];

                      const passed =
                        checks.filter(
                          (
                            item
                          ) =>
                            item[1]
                        ).length;

                      const isMcq =
                        String(
                          question?.question_type ||
                            ""
                        ).toUpperCase() ===
                        "MCQ";

                      const options =
                        Array.isArray(
                          question?.options
                        )
                          ? question.options
                          : [];

                      const busy =
                        approvingId ===
                          id ||
                        rejectingId ===
                          id;

                      return (
                        <article
                          key={`${id}-${question.slot_id}`}
                          className="overflow-hidden rounded-[20px] border border-[#E3E6EB] bg-white shadow-[0_8px_26px_rgba(27,37,58,0.035)]"
                        >
                          <div className="grid lg:grid-cols-[minmax(0,1fr)_310px]">
                            <div className="p-5 sm:p-6">
                              <div className="flex flex-wrap gap-2">
                                <StatusBadge
                                  status={
                                    question.status
                                  }
                                />

                                <span className="rounded-full bg-[#F4F5F8] px-2.5 py-1 text-[10px] font-semibold uppercase text-[#667085]">
                                  {
                                    question.question_type
                                  }
                                </span>

                                <span className="rounded-full bg-[#EAE5F9] px-2.5 py-1 text-[10px] font-semibold capitalize text-[#7862C8]">
                                  {
                                    question.difficulty
                                  }
                                </span>

                                <span className="inline-flex items-center gap-1 rounded-full bg-[#F3E3F2] px-2.5 py-1 text-[10px] font-semibold text-[#AA5E9C]">
                                  {question.source ===
                                  "ai_generated" ? (
                                    <Bot
                                      size={
                                        11
                                      }
                                    />
                                  ) : (
                                    <FileText
                                      size={
                                        11
                                      }
                                    />
                                  )}

                                  {question.source ===
                                  "ai_generated"
                                    ? "AI Generated"
                                    : "Manual"}
                                </span>
                              </div>

                              <h3 className="mt-4 text-[17px] font-semibold leading-7 text-[#202938]">
                                {
                                  question.question_text ||
                                  "No question text"
                                }
                              </h3>

                              <p className="mt-2 text-[11px] text-[#98A2B3]">
                                Question #
                                {id ??
                                  "—"}{" "}
                                · Slot{" "}
                                {
                                  question.slot_number
                                }{" "}
                                · Skill{" "}
                                {
                                  question.skill_name ||
                                  question.skill_id ||
                                  "—"
                                }{" "}
                                · Version{" "}
                                {
                                  question.version ||
                                  1
                                }
                              </p>

                              {isMcq &&
                                options.length >
                                  0 && (
                                  <div className="mt-5 grid gap-2 md:grid-cols-2">
                                    {options.map(
                                      (
                                        option,
                                        index
                                      ) => {
                                        const correct =
                                          option ===
                                          question.correct_answer;

                                        return (
                                          <div
                                            key={`${id}-${index}`}
                                            className={`rounded-md border px-3 py-2.5 text-sm ${
                                              correct
                                                ? "border-[#BFE0CC] bg-[#F5FAF7] text-[#28734E]"
                                                : "border-[#E3E6EB] bg-[#FCFCFD] text-[#475467]"
                                            }`}
                                          >
                                            <span className="mr-2 font-semibold">
                                              {
                                                String.fromCharCode(
                                                  65 +
                                                    index
                                                )
                                              }
                                              .
                                            </span>

                                            {
                                              option
                                            }

                                            {correct && (
                                              <span className="ml-2 text-[10px] font-bold uppercase">
                                                Correct
                                              </span>
                                            )}
                                          </div>
                                        );
                                      }
                                    )}
                                  </div>
                                )}

                              {question.explanation && (
                                <div className="mt-5 rounded-md border border-[#DDDFF7] bg-[#F9F9FF] p-4">
                                  <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#7862C8]">
                                    Explanation
                                  </p>

                                  <p className="mt-1.5 text-xs leading-5 text-[#667085]">
                                    {
                                      question.explanation
                                    }
                                  </p>
                                </div>
                              )}

                              {question.rejection_reason && (
                                <div className="mt-5 rounded-md border border-[#E9C8C8] bg-[#FFF8F8] p-4">
                                  <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#A83E3E]">
                                    Rejection reason
                                  </p>

                                  <p className="mt-1.5 text-xs leading-5 text-[#A83E3E]">
                                    {
                                      question.rejection_reason
                                    }
                                  </p>
                                </div>
                              )}

                              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                                <MetaCard
                                  label="Manager rating"
                                  value={
                                    question.manager_rating ??
                                    "Not rated"
                                  }
                                />

                                <MetaCard
                                  label="Reviewer rating"
                                  value={
                                    question.reviewer_rating ??
                                    "Not rated"
                                  }
                                />
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  openVersionHistory(
                                    question
                                  )
                                }
                                className="mt-5 inline-flex items-center gap-2 rounded-md border border-[#D4DAE4] bg-white px-3 py-2 text-xs font-semibold text-[#475467] hover:border-[#5658E8] hover:text-[#5658E8]"
                              >
                                <History
                                  size={
                                    14
                                  }
                                />

                                Version history
                              </button>
                            </div>

                            <aside className="border-t border-[#EEF0F3] bg-[#FCFCFD] p-5 lg:border-l lg:border-t-0">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#8A94A8]">
                                    System checks
                                  </p>

                                  <p className="mt-1 text-sm font-semibold text-[#202938]">
                                    {
                                      passed
                                    }
                                    /
                                    {
                                      checks.length
                                    }{" "}
                                    passed
                                  </p>
                                </div>

                                <ShieldCheck
                                  size={
                                    18
                                  }
                                  className="text-[#28734E]"
                                />
                              </div>

                              <div className="mt-4 space-y-2">
                                {checks.map(
                                  ([
                                    label,
                                    ok,
                                  ]) => (
                                    <div
                                      key={
                                        label
                                      }
                                      className="flex items-center justify-between rounded-md border border-[#E7E9EE] bg-white px-3 py-2.5 text-[10px]"
                                    >
                                      <span className="text-[#475467]">
                                        {
                                          label
                                        }
                                      </span>

                                      <span
                                        className={
                                          ok
                                            ? "font-bold text-[#28734E]"
                                            : "font-bold text-[#A83E3E]"
                                        }
                                      >
                                        {ok
                                          ? "Pass"
                                          : "Fix"}
                                      </span>
                                    </div>
                                  )
                                )}
                              </div>

                              <div className="mt-5 rounded-md border border-[#DDDFF7] bg-white p-4">
                                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#8A94A8]">
                                  Answer key
                                </p>

                                <p className="mt-1.5 text-sm font-semibold text-[#5658E8]">
                                  {
                                    question.correct_answer ||
                                    "—"
                                  }
                                </p>
                              </div>

                              {question.status === "approved" && reviewMode === "active" ? (
                                <div className="mt-5">
                                  <button
                                    type="button"
                                    disabled
                                    aria-label="Question approved"
                                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#28734E] text-sm font-semibold text-white opacity-90 cursor-default"
                                  >
                                    <CheckCircle2 size={16} />
                                    Approved
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRejectingQuestion(question);
                                      setRejectionReason("");
                                      setActionError("");
                                    }}
                                    disabled={busy}
                                    className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-[#D9B5B5] bg-white text-sm font-semibold text-[#A83E3E] disabled:opacity-60"
                                  >
                                    Reject
                                  </button>
                                </div>
                              ) : question.status === "pending_review" &&
                              reviewMode === "active" ? (
                                <div className="mt-5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      approveQuestion(
                                        question
                                      )
                                    }
                                    disabled={
                                      busy
                                    }
                                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#28734E] text-sm font-semibold text-white disabled:opacity-60"
                                  >
                                    <CheckCircle2
                                      size={
                                        16
                                      }
                                    />

                                    {approvingId ===
                                    id
                                      ? "Approving..."
                                      : "Approve"}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRejectingQuestion(
                                        question
                                      );

                                      setRejectionReason(
                                        ""
                                      );

                                      setActionError(
                                        ""
                                      );
                                    }}
                                    disabled={
                                      busy
                                    }
                                    className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-[#D9B5B5] bg-white text-sm font-semibold text-[#A83E3E] disabled:opacity-60"
                                  >
                                    <XCircle
                                      size={
                                        16
                                      }
                                    />

                                    Reject
                                  </button>
                                </div>
                              ) : (
                                <div className="mt-5 rounded-md border border-[#E7E9EE] bg-white p-3 text-xs leading-5 text-[#667085]">
                                  {reviewMode ===
                                    "completed"
                                    ? "Completed review history is read-only. No question decision can be changed here."
                                    : "This question is read-only in its current state."}
                                </div>
                              )}
                            </aside>
                          </div>
                        </article>
                      );
                    }
                  )}
                </div>
              )}
            </section>
          )}
      </div>

      {rejectingSet && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#101828]/35 p-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              rejectSet();
            }}
            className="w-full max-w-lg rounded-[20px] bg-white p-6 shadow-[0_24px_70px_rgba(16,24,40,0.20)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-[#A83E3E]">
                  Reject assessment set
                </p>

                <h3 className="mt-1 text-xl font-semibold text-[#202938]">
                  {
                    selectedSet
                      ? getSetLabel(
                          selectedSet
                        )
                      : "Assessment Set"
                  }
                </h3>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (
                    rejectingSetId !==
                    null
                  ) {
                    return;
                  }

                  setRejectingSet(
                    false
                  );

                  setRejectionReason(
                    ""
                  );
                }}
                className="rounded-md p-2 text-[#667085] hover:bg-[#F4F5F8]"
              >
                <X size={18} />
              </button>
            </div>

            <p className="mt-4 text-sm leading-6 text-[#667085]">
              Enter a clear reason so the Assessment Manager knows exactly
              what must be revised before resubmission.
            </p>

            <textarea
              value={
                rejectionReason
              }
              onChange={(
                event
              ) =>
                setRejectionReason(
                  event.target
                    .value
                )
              }
              rows={5}
              placeholder="Example: Several questions do not match the required difficulty or skill coverage."
              className="mt-4 w-full rounded-md border border-[#D4DAE4] p-3 text-sm outline-none focus:border-[#5658E8] focus:ring-4 focus:ring-[#5658E8]/10"
            />

            {actionError && (
              <p className="mt-2 text-xs font-semibold text-[#A83E3E]">
                {
                  actionError
                }
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (
                    rejectingSetId !==
                    null
                  ) {
                    return;
                  }

                  setRejectingSet(
                    false
                  );

                  setRejectionReason(
                    ""
                  );
                }}
                className="rounded-md border border-[#D4DAE4] bg-white px-4 py-2.5 text-sm font-semibold text-[#475467]"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={
                  rejectingSetId !==
                    null ||
                  !rejectionReason.trim()
                }
                className="rounded-md bg-[#A83E3E] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {rejectingSetId !==
                null
                  ? "Rejecting..."
                  : "Reject Set"}
              </button>
            </div>
          </form>
        </div>
      )}

      {rejectingQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#101828]/35 p-4">
          <form
            onSubmit={
              rejectQuestion
            }
            className="w-full max-w-lg rounded-[20px] bg-white p-6 shadow-[0_24px_70px_rgba(16,24,40,0.20)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-[#A83E3E]">
                  Reject question
                </p>

                <h3 className="mt-1 text-xl font-semibold text-[#202938]">
                  Question #
                  {
                    getQuestionId(
                      rejectingQuestion
                    )
                  }
                </h3>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (
                    rejectingId !==
                    null
                  ) {
                    return;
                  }

                  setRejectingQuestion(
                    null
                  );

                  setRejectionReason(
                    ""
                  );
                }}
                className="rounded-md p-2 text-[#667085] hover:bg-[#F4F5F8]"
              >
                <X size={18} />
              </button>
            </div>

            <p className="mt-4 text-sm leading-6 text-[#667085]">
              Enter a clear reason so the Assessment Manager knows what must
              be corrected.
            </p>

            <textarea
              value={
                rejectionReason
              }
              onChange={(
                event
              ) =>
                setRejectionReason(
                  event.target
                    .value
                )
              }
              rows={5}
              placeholder="Example: The answer key is ambiguous."
              className="mt-4 w-full rounded-md border border-[#D4DAE4] p-3 text-sm outline-none focus:border-[#5658E8] focus:ring-4 focus:ring-[#5658E8]/10"
            />

            {actionError && (
              <p className="mt-2 text-xs font-semibold text-[#A83E3E]">
                {
                  actionError
                }
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (
                    rejectingId !==
                    null
                  ) {
                    return;
                  }

                  setRejectingQuestion(
                    null
                  );

                  setRejectionReason(
                    ""
                  );
                }}
                className="rounded-md border border-[#D4DAE4] bg-white px-4 py-2.5 text-sm font-semibold text-[#475467]"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={
                  rejectingId !==
                  null
                }
                className="rounded-md bg-[#A83E3E] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {
                  rejectingId !==
                  null
                    ? "Rejecting..."
                    : "Reject question"
                }
              </button>
            </div>
          </form>
        </div>
      )}

      {versionQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#101828]/35 p-4">
          <div className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-[20px] bg-white shadow-[0_24px_70px_rgba(16,24,40,0.20)]">
            <div className="flex items-center justify-between border-b border-[#EAECF0] px-5 py-4">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-[#7862C8]">
                  Version history
                </p>

                <h3 className="mt-1 text-lg font-semibold text-[#202938]">
                  Question #
                  {
                    getQuestionId(
                      versionQuestion
                    )
                  }
                </h3>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (
                    versionsLoading
                  ) {
                    return;
                  }

                  setVersionQuestion(
                    null
                  );

                  setVersions(
                    []
                  );

                  setVersionsError(
                    ""
                  );
                }}
                className="rounded-md p-2 text-[#667085] hover:bg-[#F4F5F8]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-5">
              {versionsLoading ? (
                <LoadingPanel
                  text="Loading version history..."
                />
              ) : versionsError ? (
                <div className="rounded-md border border-[#E9C8C8] bg-[#FFF8F8] p-4 text-sm text-[#A83E3E]">
                  {
                    versionsError
                  }
                </div>
              ) : versions.length ===
                0 ? (
                <div className="rounded-md border border-dashed border-[#CBD2DD] p-8 text-center text-sm text-[#98A2B3]">
                  No version history available.
                </div>
              ) : (
                <div className="space-y-4">
                  {versions.map(
                    (
                      version,
                      index
                    ) => (
                      <article
                        key={
                          version.id ||
                          `${version.version}-${index}`
                        }
                        className="rounded-[16px] border border-[#E3E6EB] bg-[#FCFCFD] p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <span className="rounded-full bg-[#EAE5F9] px-2.5 py-1 text-[10px] font-semibold text-[#7862C8]">
                            v
                            {
                              version.version ||
                              index +
                                1
                            }
                          </span>

                          <span className="text-[10px] text-[#98A2B3]">
                            {version.created_at
                              ? new Date(
                                  version.created_at
                                ).toLocaleString()
                              : ""}
                          </span>
                        </div>

                        <p className="mt-4 text-sm font-semibold leading-6 text-[#202938]">
                          {
                            version.question_text
                          }
                        </p>

                        <div className="mt-4 grid gap-3 sm:grid-cols-3">
                          <MetaCard
                            label="Skill"
                            value={
                              version.skill_id
                            }
                          />

                          <MetaCard
                            label="Answer"
                            value={
                              version.correct_answer ||
                              "—"
                            }
                          />

                          <MetaCard
                            label="Source"
                            value={
                              version.source ||
                              "—"
                            }
                          />
                        </div>
                      </article>
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </RecruiterLayout>
  );
}

export default ReviewerWorkspace;