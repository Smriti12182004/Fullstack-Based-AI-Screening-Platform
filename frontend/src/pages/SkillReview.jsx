import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  Edit3,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
  Users,
  Send,
} from "lucide-react";

import api from "../services/api";
import RecruiterLayout from "../layouts/RecruiterLayout";

const BRAND = "#004040";
const MAX_SKILL_NAME_LENGTH = 100;

const JOB_DESCRIPTION_HEADINGS = [
  "Responsibilities and Duties",
  "Preferred Qualifications",
  "Required Qualifications",
  "What We're Looking For",
  "What We’re Looking For",
  "What We Are Looking For",
  "What You'll Bring",
  "What You’ll Bring",
  "What You Will Bring",
  "Key Responsibilities",
  "Professional Experience",
  "Technical Skills",
  "Non-Technical Skills",
  "Nontechnical Skills",
  "About the Role",
  "Role Overview",
  "Role Summary",
  "Job Summary",
  "Key Requirements",
  "Required Skills",
  "Preferred Skills",
  "Nice to Have",
  "What You'll Do",
  "What You’ll Do",
  "What You Will Do",
  "What We Offer",
  "Key Qualifications",
  "Qualifications",
  "Responsibilities",
  "Requirements",
  "Education",
  "Benefits",
  "Compensation",
  "About Us",
  "Overview",
];

const HEADING_LOOKUP = new Map(
  JOB_DESCRIPTION_HEADINGS.map((heading) => [
    heading.toLowerCase().replace(/[’]/g, "'"),
    heading.replace(/[’]/g, "'"),
  ])
);

function isAuthError(error) {
  const status = error?.response?.status;
  return status === 401 || status === 403;
}

function getErrorMessage(error, fallback) {
  const detail = error?.response?.data?.detail;

  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item?.msg) return item.msg;
        return null;
      })
      .filter(Boolean);

    if (messages.length > 0) return messages.join(". ");
  }

  return fallback;
}

/*
 * Format existing job descriptions for display without changing the stored
 * text. Handles actual Markdown as well as older saved descriptions whose
 * headings and bullets were flattened into a single line.
 */
function normalizeJobDescriptionForDisplay(value) {
  if (value == null) return "";

  let text = String(value)
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .trim();

  if (!text) return "";

  text = text
    .replace(/^\s*```[^\n]*$/gm, "")
    .replace(/^\s*(?:---+|___+|\*\*\*+)\s*$/gm, "");

  text = text.replace(
    /!?\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_, label, url) => (label === url ? url : `${label} (${url})`)
  );

  // Split known headings even when they appear in the middle of a flattened
  // paragraph, for example: "... team. Key Responsibilities • Build ...".
  const escapedHeadings = [...JOB_DESCRIPTION_HEADINGS]
    .sort((a, b) => b.length - a.length)
    .map((heading) => heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  const headingPattern = new RegExp(
    `(^|[.!?;:]\\s+|\\n|\\s[•·]\\s*)(${escapedHeadings.join("|")})(?=\\s|:|$)`,
    "gim"
  );

  text = text.replace(headingPattern, (match, boundary, heading) => {
    const key = String(heading).toLowerCase().replace(/[’]/g, "'");
    const canonical = HEADING_LOOKUP.get(key) || heading;
    const prefix =
      boundary && /[.!?;:]\s+$/.test(boundary)
        ? boundary.trimEnd() + " "
        : "";

    return `${prefix}\n\n${canonical}\n`;
  });

  // Convert inline bullets into separate rows without splitting hyphenated
  // words such as "front-end" or "problem-solving".
  text = text
    .replace(/\s*[•·]\s*/g, "\n• ")
    .replace(/(^|\n)\s*[-*+]\s+/gm, "$1• ")
    .replace(/([.!?;])\s+[-*+]\s+(?=\S)/g, "$1\n• ")
    .replace(/(^|\n)\s*(\d+)[.)]\s+/gm, "$1$2. ");

  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function renderInlineFormatting(text, keyPrefix) {
  const pattern =
    /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`]+`)/g;

  const parts = String(text).split(pattern);

  return parts.map((part, index) => {
    if (!part) return null;

    const key = `${keyPrefix}-${index}`;

    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong
          key={key}
          className="font-semibold text-[#26332F]"
        >
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (part.startsWith("__") && part.endsWith("__")) {
      return (
        <strong
          key={key}
          className="font-semibold text-[#26332F]"
        >
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (
      part.startsWith("*") &&
      part.endsWith("*") &&
      !part.startsWith("**")
    ) {
      return (
        <em key={key} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }

    if (
      part.startsWith("_") &&
      part.endsWith("_") &&
      !part.startsWith("__")
    ) {
      return (
        <em key={key} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }

    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={key}
          className="rounded bg-[#EEF2F0] px-1.5 py-0.5 font-mono text-[0.92em] text-[#17655E]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    return part;
  });
}

function parseJobDescription(value) {
  const normalizedText = normalizeJobDescriptionForDisplay(value);
  if (!normalizedText) return [];

  const blocks = [];
  let paragraphLines = [];
  let listItems = [];
  let listType = null;

  const flushParagraph = () => {
    const paragraph = paragraphLines
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" ")
      .trim();

    if (paragraph) {
      blocks.push({
        type: "paragraph",
        text: paragraph,
      });
    }

    paragraphLines = [];
  };

  const flushList = () => {
    if (listItems.length) {
      blocks.push({
        type: listType || "ul",
        items: listItems,
      });
    }

    listItems = [];
    listType = null;
  };

  for (const rawLine of normalizedText.split("\n")) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const markdownHeading = line.match(
      /^\s{0,3}(#{1,6})\s+(.+?)\s*#*$/
    );

    const possibleHeading = (
      markdownHeading ? markdownHeading[2] : line
    )
      .replace(/:$/, "")
      .trim();

    const headingKey = possibleHeading
      .toLowerCase()
      .replace(/[’]/g, "'");

    const heading = HEADING_LOOKUP.get(headingKey);

    if (heading || markdownHeading) {
      flushParagraph();
      flushList();

      blocks.push({
        type: "heading",
        text: heading || possibleHeading,
      });

      continue;
    }

    const bulletMatch = line.match(/^(?:•|·|[-*+])\s*(.+)$/);

    if (bulletMatch) {
      flushParagraph();

      if (listType && listType !== "ul") {
        flushList();
      }

      listType = "ul";
      listItems.push(bulletMatch[1].trim());
      continue;
    }

    const numberedMatch = line.match(/^\d+[.)]\s+(.+)$/);

    if (numberedMatch) {
      flushParagraph();

      if (listType && listType !== "ol") {
        flushList();
      }

      listType = "ol";
      listItems.push(numberedMatch[1].trim());
      continue;
    }

    flushList();
    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();

  return blocks;
}

function JobDescriptionRenderer({ value }) {
  const blocks = parseJobDescription(value);

  if (!blocks.length) {
    return (
      <p className="text-sm leading-7 text-[#7B8985]">
        No job description is available.
      </p>
    );
  }

  return (
    <div className="space-y-4 break-words text-sm leading-7 text-[#53635F]">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return (
            <h3
              key={`jd-heading-${index}`}
              className="mt-2 border-b border-[#E8EFEC] pb-1.5 text-[12px] font-bold italic tracking-[0.02em] text-[#23433D] first:mt-0"
            >
              {renderInlineFormatting(block.text, `heading-${index}`)}
            </h3>
          );
        }

        if (block.type === "ul") {
          return (
            <ul
              key={`jd-list-${index}`}
              className="list-disc space-y-1.5 pl-5 marker:text-[#0F9D8A]"
            >
              {block.items.map((item, itemIndex) => (
                <li
                  key={`jd-item-${index}-${itemIndex}`}
                  className="pl-1 leading-7"
                >
                  {renderInlineFormatting(
                    item,
                    `list-${index}-${itemIndex}`
                  )}
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === "ol") {
          return (
            <ol
              key={`jd-ordered-${index}`}
              className="list-decimal space-y-1.5 pl-5 marker:font-semibold marker:text-[#0F9D8A]"
            >
              {block.items.map((item, itemIndex) => (
                <li
                  key={`jd-numbered-${index}-${itemIndex}`}
                  className="pl-1 leading-7"
                >
                  {renderInlineFormatting(
                    item,
                    `ordered-${index}-${itemIndex}`
                  )}
                </li>
              ))}
            </ol>
          );
        }

        return (
          <p
            key={`jd-paragraph-${index}`}
            className="whitespace-pre-line leading-7 text-[#53635F]"
          >
            {renderInlineFormatting(
              block.text,
              `paragraph-${index}`
            )}
          </p>
        );
      })}
    </div>
  );
}

const NON_TECHNICAL_EXTRACTION_CATEGORIES = new Set([
  "professional skill",
  "soft skill",
  "communication",
  "leadership",
  "teamwork",
  "other",
]);

function normalizeSkillCategory(category) {
  const normalized = String(category || "technical")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (
    ["non_technical", "nontechnical", "soft_skill"].includes(
      normalized
    )
  ) {
    return "non_technical";
  }

  if (
    NON_TECHNICAL_EXTRACTION_CATEGORIES.has(
      normalized.replace(/_/g, " ")
    )
  ) {
    return "non_technical";
  }

  return "technical";
}

function normalizeReviewSkill(skill) {
  const name = typeof skill === "string" ? skill : skill?.name;

  if (typeof name !== "string" || !name.trim()) {
    return null;
  }

  const suppliedMandatory =
    typeof skill === "object" && skill !== null
      ? typeof skill.is_mandatory === "boolean"
        ? skill.is_mandatory
        : typeof skill.mandatory === "boolean"
          ? skill.mandatory
          : true
      : true;

  return {
    name: name.trim(),
    category: normalizeSkillCategory(
      typeof skill === "object" && skill !== null
        ? skill.review_category || skill.category
        : "technical"
    ),
    is_mandatory: suppliedMandatory,
  };
}

function normalizeReviewSkills(items) {
  return (Array.isArray(items) ? items : [])
    .map(normalizeReviewSkill)
    .filter(Boolean);
}

function skillStateForComparison(items) {
  return items.map((skill) => ({
    name: skill.name.trim().toLowerCase(),
    category: skill.category,
    is_mandatory: skill.is_mandatory,
  }));
}

function SkillReview() {
  const { jobId } = useParams();
  const navigate = useNavigate();

  const [job, setJob] = useState(null);
  const [skills, setSkills] = useState([]);
  const [savedSkills, setSavedSkills] = useState([]);
  const [status, setStatus] = useState("pending");

  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [managers, setManagers] = useState([]);
  const [selectedManagerId, setSelectedManagerId] = useState("");
  const [loadingManagers, setLoadingManagers] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareStatus, setShareStatus] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [initialLoadFailed, setInitialLoadFailed] = useState(false);

  const [newSkill, setNewSkill] = useState("");
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingValue, setEditingValue] = useState("");

  const normalizedSavedSkills = skillStateForComparison(savedSkills);
  const normalizedCurrentSkills = skillStateForComparison(skills);

  const hasUnsavedChanges =
    JSON.stringify(normalizedSavedSkills) !==
    JSON.stringify(normalizedCurrentSkills);

  const isConfirmed = status === "confirmed";

  const loadSkillReview = async () => {
    setLoading(true);
    setError("");
    setSuccess("");
    setInitialLoadFailed(false);
    setEditingIndex(null);
    setEditingValue("");

    try {
      const [jobResponse, reviewResponse] = await Promise.all([
        api.get(`/jobs/${jobId}`),
        api.get(`/jobs/${jobId}/skills/review`),
      ]);

      setJob(jobResponse.data);

      let reviewSkills = Array.isArray(reviewResponse.data?.skills)
        ? reviewResponse.data.skills
        : [];

      let reviewStatus = reviewResponse.data?.status || "pending";

      if (reviewSkills.length === 0) {
        setExtracting(true);

        try {
          const extractionResponse = await api.post(
            `/jobs/${jobId}/skills/extract`
          );

          reviewSkills = Array.isArray(
            extractionResponse.data?.skills
          )
            ? extractionResponse.data.skills
            : [];

          reviewStatus = "pending";
        } finally {
          setExtracting(false);
        }
      }

      const normalizedSkills = normalizeReviewSkills(reviewSkills);

      setSkills(normalizedSkills);
      setSavedSkills(normalizedSkills);
      setEditingIndex(null);
      setEditingValue("");
      setNewSkill("");
      setStatus(reviewStatus);
    } catch (err) {
      console.error(err);

      if (isAuthError(err)) {
        navigate("/login", { replace: true });
        return;
      }

      setInitialLoadFailed(true);
      setError(
        getErrorMessage(
          err,
          "Unable to load or extract the job skills."
        )
      );
    } finally {
      setExtracting(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSkillReview();
    // This request is intentionally tied to the route's job ID.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const handleRefreshExtraction = async () => {
    if (
      hasUnsavedChanges ||
      editingIndex !== null ||
      newSkill.trim()
    ) {
      setError(
        "Save your current skill changes before refreshing extraction."
      );
      setSuccess("");
      return;
    }

    setExtracting(true);
    setError("");
    setSuccess("");

    try {
      const response = await api.post(
        `/jobs/${jobId}/skills/extract`
      );

      const normalizedSkills = normalizeReviewSkills(
        response.data?.skills
      );

      setSkills(normalizedSkills);
      setSavedSkills(normalizedSkills);
      setEditingIndex(null);
      setEditingValue("");
      setNewSkill("");
      setStatus("pending");

      setSuccess(
        normalizedSkills.length
          ? `${normalizedSkills.length} skills extracted successfully. Please review and confirm them.`
          : "Skill extraction completed, but no skills were found."
      );
    } catch (err) {
      console.error(err);

      if (isAuthError(err)) {
        navigate("/login", { replace: true });
        return;
      }

      setError(
        getErrorMessage(err, "Unable to extract skills.")
      );
    } finally {
      setExtracting(false);
    }
  };

  const handleAddSkill = () => {
    if (
      isConfirmed ||
      extracting ||
      saving ||
      confirming
    ) {
      return;
    }

    const value = newSkill.trim();

    if (!value) {
      setError("Enter a skill name before adding it.");
      setSuccess("");
      return;
    }

    if (value.length > MAX_SKILL_NAME_LENGTH) {
      setError(
        `Skill name must be ${MAX_SKILL_NAME_LENGTH} characters or fewer.`
      );
      setSuccess("");
      return;
    }

    const exists = skills.some(
      (skill) =>
        skill.name.trim().toLowerCase() ===
        value.toLowerCase()
    );

    if (exists) {
      setError("This skill is already in the list.");
      return;
    }

    setSkills((current) => [
      ...current,
      {
        name: value,
        category: "technical",
        is_mandatory: true,
      },
    ]);

    setNewSkill("");
    setError("");
    setSuccess("");
  };

  const handleRemoveSkill = (index) => {
    if (
      isConfirmed ||
      extracting ||
      saving ||
      confirming
    ) {
      return;
    }

    setSkills((current) =>
      current.filter(
        (_, skillIndex) => skillIndex !== index
      )
    );

    if (editingIndex === index) {
      setEditingIndex(null);
      setEditingValue("");
    }

    setError("");
    setSuccess("");
  };

  const handleSkillMetadataChange = (index, field, value) => {
    if (
      isConfirmed ||
      extracting ||
      saving ||
      confirming
    ) {
      return;
    }

    setSkills((current) =>
      current.map((skill, skillIndex) => {
        if (skillIndex !== index) return skill;

        if (field === "category") {
          return { ...skill, category: value };
        }

        if (field === "is_mandatory") {
          return {
            ...skill,
            is_mandatory: value === "mandatory",
          };
        }

        return skill;
      })
    );

    setError("");
    setSuccess("");
  };

  const startEditing = (index) => {
    if (
      isConfirmed ||
      extracting ||
      saving ||
      confirming
    ) {
      return;
    }

    setEditingIndex(index);
    setEditingValue(skills[index].name);
    setError("");
    setSuccess("");
  };

  const cancelEditing = () => {
    setEditingIndex(null);
    setEditingValue("");
  };

  const saveEditing = () => {
    if (
      isConfirmed ||
      extracting ||
      saving ||
      confirming
    ) {
      return;
    }

    const value = editingValue.trim();

    if (!value) {
      setError("Skill name cannot be empty.");
      return;
    }

    if (value.length > MAX_SKILL_NAME_LENGTH) {
      setError(
        `Skill name must be ${MAX_SKILL_NAME_LENGTH} characters or fewer.`
      );
      return;
    }

    const duplicate = skills.some(
      (skill, index) =>
        index !== editingIndex &&
        skill.name.trim().toLowerCase() ===
          value.toLowerCase()
    );

    if (duplicate) {
      setError("This skill already exists.");
      return;
    }

    setSkills((current) =>
      current.map((skill, index) =>
        index === editingIndex
          ? { ...skill, name: value }
          : skill
      )
    );

    cancelEditing();
    setError("");
  };

  const handleSave = async () => {
    if (editingIndex !== null) {
      setError(
        "Finish or cancel the skill edit before saving."
      );
      setSuccess("");
      return;
    }

    if (skills.length === 0) {
      setError("At least one skill is required.");
      setSuccess("");
      return;
    }

    if (!hasUnsavedChanges) {
      setError("");
      setSuccess("There are no unsaved skill changes.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await api.put(
        `/jobs/${jobId}/skills/review`,
        {
          skills: skills.map((skill) => ({
            name: skill.name,
            category: skill.category,
            is_mandatory: skill.is_mandatory,
          })),
        }
      );

      const returnedSkills = Array.isArray(
        response.data?.skills
      )
        ? response.data.skills
        : [];

      const normalizedSkills = returnedSkills.length
        ? normalizeReviewSkills(returnedSkills)
        : skills;

      setSkills(normalizedSkills);
      setSavedSkills(normalizedSkills);
      setStatus(response.data?.status || "pending");

      setSuccess("Skill changes saved successfully.");
    } catch (err) {
      console.error(err);

      if (isAuthError(err)) {
        navigate("/login", { replace: true });
        return;
      }

      setError(
        getErrorMessage(err, "Unable to save skill changes.")
      );
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    if (editingIndex !== null) {
      setError(
        "Finish or cancel the skill edit before confirming."
      );
      setSuccess("");
      return;
    }

    if (hasUnsavedChanges) {
      setError(
        "Save your skill changes before confirming them."
      );
      setSuccess("");
      return;
    }

    if (skills.length === 0) {
      setError(
        "Add at least one skill before confirming."
      );
      setSuccess("");
      return;
    }

    setConfirming(true);
    setError("");
    setSuccess("");

    try {
      const response = await api.post(
        `/jobs/${jobId}/skills/review/confirm`
      );

      const returnedSkills = Array.isArray(
        response.data?.skills
      )
        ? response.data.skills
        : [];

      const normalizedSkills = returnedSkills.length
        ? normalizeReviewSkills(returnedSkills)
        : skills;

      setSkills(normalizedSkills);
      setSavedSkills(normalizedSkills);
      setStatus(response.data?.status || "confirmed");

      setSuccess(
        "Skills confirmed successfully. This role is ready for the next stage."
      );
    } catch (err) {
      console.error(err);

      if (isAuthError(err)) {
        navigate("/login", { replace: true });
        return;
      }

      setError(
        getErrorMessage(
          err,
          "Unable to confirm the skill review."
        )
      );
    } finally {
      setConfirming(false);
    }
  };

  const loadAssessmentManagers = async () => {
    setLoadingManagers(true);

    try {
      const response = await api.get("/jobs/collaborators");

      const availableManagers = (
        Array.isArray(response.data)
          ? response.data
          : []
      ).filter(
        (user) =>
          String(user.role || "")
            .trim()
            .toLowerCase()
            .replace(/[\s-]+/g, "_") ===
          "assessment_manager"
      );

      setManagers(availableManagers);

      if (
        availableManagers.length > 0 &&
        !selectedManagerId
      ) {
        setSelectedManagerId(
          String(availableManagers[0].id)
        );
      }
    } catch (err) {
      console.error(
        "Failed to load assessment managers:",
        err
      );

      if (isAuthError(err)) {
        navigate("/login", { replace: true });
        return;
      }

      setError(
        getErrorMessage(
          err,
          "Unable to load available Assessment Managers."
        )
      );
    } finally {
      setLoadingManagers(false);
    }
  };

  useEffect(() => {
    if (status === "confirmed") {
      loadAssessmentManagers();
    }
    // The manager list is loaded when the review reaches confirmed status.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, jobId]);

  const handleShareWithManager = async () => {
    if (status !== "confirmed") {
      setError("Confirm the skills before sharing this job.");
      setSuccess("");
      return;
    }

    if (!selectedManagerId) {
      setError("Select an Assessment Manager first.");
      setSuccess("");
      return;
    }

    setSharing(true);
    setError("");
    setSuccess("");
    setShareStatus("");

    try {
      const response = await api.post(
        `/jobs/${jobId}/share`,
        {
          manager_user_id: Number(selectedManagerId),
        }
      );

      const result = response.data || {};
      const alreadyShared =
        result.status === "already_shared";

      const managerName =
        result.manager_username ||
        managers.find(
          (manager) =>
            String(manager.id) === String(selectedManagerId)
        )?.username ||
        "Assessment Manager";

      setShareStatus(result.status || "shared");

      setSuccess(
        alreadyShared
          ? `${managerName} already has access to this job.`
          : `Job shared successfully with ${managerName}.`
      );
    } catch (err) {
      console.error(
        "Failed to share job with Assessment Manager:",
        err
      );

      if (isAuthError(err)) {
        navigate("/login", { replace: true });
        return;
      }

      setError(
        getErrorMessage(
          err,
          "Unable to share this job with the Assessment Manager."
        )
      );
    } finally {
      setSharing(false);
    }
  };

  const handleBackToDashboard = () => {
    if (hasUnsavedChanges) {
      setError(
        "Save your current skill changes before leaving this page."
      );
      setSuccess("");
      return;
    }

    navigate("/dashboard");
  };

  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (!hasUnsavedChanges) return;

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener(
      "beforeunload",
      handleBeforeUnload
    );

    return () => {
      window.removeEventListener(
        "beforeunload",
        handleBeforeUnload
      );
    };
  }, [hasUnsavedChanges]);

  return (
    <RecruiterLayout
      title="Skill Review"
      breadcrumb="Jobs / Skill Review"
    >
      <div className="mx-auto w-full max-w-[1280px] space-y-6 pb-10 sm:space-y-7 sm:pb-14">
        <section className="relative overflow-hidden rounded-2xl border border-[#DCE5E2] bg-white px-4 py-6 shadow-[0_12px_34px_rgba(15,23,42,0.04)] sm:rounded-[22px] sm:px-6 sm:py-7 lg:px-8 lg:py-8">
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 max-w-3xl">
              <button
                type="button"
                onClick={handleBackToDashboard}
                className="mb-4 inline-flex min-h-9 items-center gap-2 rounded-lg border border-transparent px-2.5 py-1.5 text-xs font-medium text-[#6D7D79] transition hover:border-[#DDE7E3] hover:bg-[#F7FAF9] hover:text-[#004040] focus:outline-none focus:ring-4 focus:ring-[#004040]/10"
              >
                <ArrowLeft size={15} />
                Back to dashboard
              </button>

              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#66807B]">
                AI-assisted workflow
              </p>

              <h1 className="mt-2 text-[34px] font-semibold leading-[1.08] tracking-[-0.03em] text-[#132322] sm:text-[40px]">
                Review extracted skills.
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#687875]">
                Review the skills identified from the job description, make
                corrections where needed, and confirm the final skill set.
              </p>
            </div>

            <div className="shrink-0 lg:pb-1">
              <StatusBadge
                confirmed={isConfirmed}
                status={status}
              />
            </div>
          </div>
        </section>

        {(error || success) && (
          <div className="space-y-3" aria-live="polite">
            {error && (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-xl border border-[#E9C8C8] bg-[#FFF6F6] px-3.5 py-3 text-sm text-[#A83E3E] sm:px-4"
              >
                <X size={17} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div
                role="status"
                className="flex items-start gap-3 rounded-xl border border-[#BFDDD6] bg-[#F0F8F5] px-3.5 py-3 text-sm text-[#17655E] sm:px-4"
              >
                <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
                <span>{success}</span>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <LoadingState extracting={extracting} />
        ) : initialLoadFailed ? (
          <section className="rounded-2xl border border-[#DCE5E2] bg-white px-5 py-12 text-center shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:rounded-[22px] sm:px-6">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-[#F4F7F5] text-[#607570]">
              <RefreshCw size={18} />
            </div>

            <h2 className="mt-4 text-sm font-semibold text-[#273633]">
              We couldn&apos;t load this skill review.
            </h2>

            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-[#7C8985]">
              Check your connection or try loading the job again.
            </p>

            <button
              type="button"
              onClick={loadSkillReview}
              className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-xs font-semibold text-white shadow-[0_7px_18px_rgba(0,64,64,0.14)] transition hover:-translate-y-0.5 hover:opacity-95 focus:outline-none focus:ring-4 focus:ring-[#004040]/15"
              style={{ backgroundColor: BRAND }}
            >
              <RefreshCw size={14} />
              Retry
            </button>
          </section>
        ) : (
          <div className="space-y-7">
            {/* JOB DESCRIPTION */}
            <section className="rounded-2xl border border-[#DCE5E2] bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:rounded-[22px]">
              <div className="flex flex-col gap-5 px-4 py-5 sm:gap-6 sm:px-6 sm:py-6 lg:px-7">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F0F4F2] text-[#607570]">
                      <BriefcaseBusiness size={15} />
                    </div>

                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#72817E]">
                      Job description
                    </span>
                  </div>

                  <div className="mt-4 grid gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_210px]">
                    <div className="min-w-0">
                      <h2 className="text-xl font-semibold tracking-[-0.015em] text-[#162522]">
                        {job?.title || `Job #${jobId}`}
                      </h2>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded-full border border-[#DCE5E2] bg-[#F8FAF9] px-2.5 py-1 text-[11px] font-semibold text-[#586965]">
                          Experience: {job?.experience_required || "Not specified"}
                        </span>

                        {hasUnsavedChanges && (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E7D7B4] bg-[#FFF9EC] px-2.5 py-1 text-[11px] font-semibold text-[#946718]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#D79A26]" />
                            Unsaved changes
                          </span>
                        )}
                      </div>

                      <div className="mt-4 max-h-[360px] overflow-y-auto rounded-xl border border-[#E8EFEC] bg-[#FCFDFC] p-4 pr-3 sm:p-5">
                        <JobDescriptionRenderer value={job?.description} />
                      </div>
                    </div>

                    <div className="flex w-full flex-col gap-3 rounded-xl border border-[#DCE5E2] bg-[#F8FAF9] px-4 py-3 xl:w-auto xl:self-start">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.14em] text-[#82908C]">
                          Job ID
                        </p>
                        <p className="mt-1 text-sm font-semibold text-[#273633]">
                          #{jobId}
                        </p>
                      </div>

                      <div className="border-t border-[#E3EBE8] pt-3">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-[#82908C]">
                          Review status
                        </p>
                        <p className="mt-1 text-sm font-semibold capitalize text-[#273633]">
                          {isConfirmed
                            ? "Confirmed"
                            : status === "in_review"
                              ? "In review"
                              : "Pending Review"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* SKILL REVIEW */}
            <section className="overflow-hidden rounded-2xl border border-[#DCE5E2] bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:rounded-[22px]">
              <div className="flex flex-col gap-4 border-b border-[#E8EFEC] px-4 py-5 sm:px-6 sm:py-5 lg:flex-row lg:items-center lg:justify-between lg:px-7">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E8F2EF] text-[#17655E]">
                    <Sparkles size={18} />
                  </div>

                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-[#172623]">
                      Extracted skills
                    </h2>

                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <p className="text-xs text-[#788682]">
                        {skills.length} {skills.length === 1 ? "skill" : "skills"} in
                        the current review. Classify each skill and set whether it is
                        mandatory or optional.
                      </p>

                      {hasUnsavedChanges && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E7D7B4] bg-[#FFF9EC] px-2 py-0.5 text-[10px] font-semibold text-[#946718]">
                          Unsaved
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRefreshExtraction}
                  disabled={
                    loading ||
                    extracting ||
                    saving ||
                    confirming ||
                    hasUnsavedChanges ||
                    editingIndex !== null ||
                    Boolean(newSkill.trim())
                  }
                  title={
                    hasUnsavedChanges ||
                    editingIndex !== null ||
                    Boolean(newSkill.trim())
                      ? "Save or finish your current changes before refreshing"
                      : "Re-run AI skill extraction"
                  }
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#D5E0DC] bg-white px-3 text-xs font-semibold text-[#51615D] transition hover:border-[#A7C5BE] hover:bg-[#F5F9F7] hover:text-[#004040] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw
                    size={14}
                    className={extracting ? "animate-spin" : ""}
                  />
                  {extracting ? "Extracting..." : "Refresh"}
                </button>
              </div>

              <div className="p-4 sm:p-6 lg:p-7">
                {skills.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#C9D8D4] bg-[#FAFCFB] px-4 py-10 text-center sm:px-6 sm:py-12">
                    <Sparkles size={26} className="mx-auto text-[#8DA39E]" />
                    <p className="mt-3 text-sm font-semibold text-[#344440]">
                      No skills available
                    </p>
                    <p className="mt-1 text-xs text-[#84918E]">
                      Click Refresh to run skill extraction from the job description.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {skills.map((skill, index) => {
                      const editing = editingIndex === index;

                      return (
                        <div
                          key={`${skill.name}-${index}`}
                          className="group flex min-h-[58px] items-center gap-3 rounded-xl border border-[#E1E9E6] bg-[#FAFCFB] px-3.5 py-2.5 transition hover:border-[#B9D1CB] hover:bg-white sm:px-4"
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#E8F2EF] text-[#17655E]">
                            <Check size={15} />
                          </div>

                          {editing ? (
                            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                              <input
                                value={editingValue}
                                aria-label="Edit skill name"
                                maxLength={MAX_SKILL_NAME_LENGTH}
                                onChange={(event) =>
                                  setEditingValue(event.target.value)
                                }
                                autoFocus
                                className="h-9 min-w-[180px] flex-1 rounded-lg border border-[#B8CEC8] bg-white px-3 text-sm text-[#1B2927] outline-none focus:border-[#004040] focus:ring-4 focus:ring-[#004040]/10 sm:min-w-0"
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") saveEditing();
                                  if (event.key === "Escape") cancelEditing();
                                }}
                              />

                              <button
                                type="button"
                                onClick={saveEditing}
                                aria-label="Save skill edit"
                                title="Save skill edit"
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#E8F2EF] text-[#17655E] transition hover:bg-[#DDEDE9]"
                              >
                                <Check size={15} />
                              </button>

                              <button
                                type="button"
                                onClick={cancelEditing}
                                aria-label="Cancel skill edit"
                                title="Cancel skill edit"
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F2F5F3] text-[#71807E] transition hover:bg-[#E8EDEB]"
                              >
                                <X size={15} />
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-[#253431]">
                                  {skill.name}
                                </p>

                                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                  <span
                                    className={`rounded-md px-2 py-1 text-[10px] font-semibold ${
                                      skill.category === "technical"
                                        ? "bg-[#E8F2EF] text-[#17655E]"
                                        : "bg-[#F0EBFB] text-[#654DBD]"
                                    }`}
                                  >
                                    {skill.category === "technical"
                                      ? "Technical"
                                      : "Non-technical"}
                                  </span>

                                  <span
                                    className={`rounded-md px-2 py-1 text-[10px] font-semibold ${
                                      skill.is_mandatory
                                        ? "bg-[#FFF4E8] text-[#B54708]"
                                        : "bg-[#F2F4F7] text-[#475467]"
                                    }`}
                                  >
                                    {skill.is_mandatory
                                      ? "Mandatory"
                                      : "Optional"}
                                  </span>
                                </div>
                              </div>

                              <div className="flex shrink-0 flex-wrap items-center gap-2">
                                <label
                                  className="sr-only"
                                  htmlFor={`skill-category-${index}`}
                                >
                                  Skill category for {skill.name}
                                </label>

                                <select
                                  id={`skill-category-${index}`}
                                  value={skill.category}
                                  onChange={(event) =>
                                    handleSkillMetadataChange(
                                      index,
                                      "category",
                                      event.target.value
                                    )
                                  }
                                  disabled={
                                    isConfirmed ||
                                    extracting ||
                                    saving ||
                                    confirming
                                  }
                                  className="h-9 max-w-[145px] rounded-lg border border-[#D5E0DC] bg-white px-2 text-[10px] font-medium text-[#33423F] outline-none focus:border-[#004040] focus:ring-2 focus:ring-[#004040]/10 disabled:cursor-not-allowed disabled:bg-[#F6F8F7]"
                                >
                                  <option value="technical">Technical</option>
                                  <option value="non_technical">
                                    Non-technical
                                  </option>
                                </select>

                                <label
                                  className="sr-only"
                                  htmlFor={`skill-requirement-${index}`}
                                >
                                  Requirement for {skill.name}
                                </label>

                                <select
                                  id={`skill-requirement-${index}`}
                                  value={
                                    skill.is_mandatory
                                      ? "mandatory"
                                      : "optional"
                                  }
                                  onChange={(event) =>
                                    handleSkillMetadataChange(
                                      index,
                                      "is_mandatory",
                                      event.target.value
                                    )
                                  }
                                  disabled={
                                    isConfirmed ||
                                    extracting ||
                                    saving ||
                                    confirming
                                  }
                                  className="h-9 max-w-[125px] rounded-lg border border-[#D5E0DC] bg-white px-2 text-[10px] font-medium text-[#33423F] outline-none focus:border-[#004040] focus:ring-2 focus:ring-[#004040]/10 disabled:cursor-not-allowed disabled:bg-[#F6F8F7]"
                                >
                                  <option value="mandatory">Mandatory</option>
                                  <option value="optional">Optional</option>
                                </select>

                                {!isConfirmed && (
                                  <div className="flex shrink-0 items-center gap-1 opacity-100 transition md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
                                    <button
                                      type="button"
                                      onClick={() => startEditing(index)}
                                      disabled={
                                        extracting ||
                                        saving ||
                                        confirming
                                      }
                                      className="flex h-8 w-8 items-center justify-center rounded-lg text-[#74827F] transition hover:bg-[#EAF2EF] hover:text-[#004040]"
                                      aria-label={`Edit ${skill.name}`}
                                    >
                                      <Edit3 size={15} />
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleRemoveSkill(index)}
                                      disabled={
                                        extracting ||
                                        saving ||
                                        confirming
                                      }
                                      className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8C9693] transition hover:bg-[#FFF1F1] hover:text-[#C84C4C]"
                                      aria-label={`Remove ${skill.name}`}
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {!isConfirmed && (
                  <div className="mt-5 rounded-xl border border-dashed border-[#C7D7D2] bg-[#FAFCFB] p-3.5 sm:p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs font-semibold text-[#3C4D49]">
                        Add another skill
                      </p>
                      <span className="text-[11px] text-[#8A9693]">
                        Press Enter to add
                      </span>
                    </div>

                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <input
                        value={newSkill}
                        onChange={(event) => setNewSkill(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleAddSkill();
                          }
                        }}
                        disabled={extracting || saving || confirming}
                        aria-label="Skill name"
                        maxLength={MAX_SKILL_NAME_LENGTH}
                        placeholder="e.g. Docker, PostgreSQL, FastAPI"
                        className="h-10 flex-1 rounded-lg border border-[#D5E0DC] bg-white px-3 text-sm text-[#20302D] outline-none placeholder:text-[#A0ABA8] focus:border-[#004040] focus:ring-4 focus:ring-[#004040]/10"
                      />

                      <button
                        type="button"
                        onClick={handleAddSkill}
                        disabled={
                          extracting ||
                          saving ||
                          confirming ||
                          !newSkill.trim()
                        }
                        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg px-4 text-xs font-semibold text-white transition hover:opacity-90 focus:outline-none focus:ring-4 focus:ring-[#004040]/15 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                        style={{ backgroundColor: BRAND }}
                      >
                        <Plus size={15} />
                        Add Skill
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-4 border-t border-[#E8EFEC] bg-[#FCFDFC] px-4 py-5 sm:px-6 sm:py-6 lg:flex-row lg:items-center lg:justify-between lg:px-7">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[#53635F]">
                    {isConfirmed
                      ? "Skill set confirmed."
                      : "Review the AI suggestions before continuing."}
                  </p>

                  <p className="mt-1 max-w-xl text-[11px] leading-5 text-[#8A9693]">
                    {isConfirmed
                      ? "The confirmed skill set is saved to this job."
                      : hasUnsavedChanges
                        ? "You have unsaved changes. Save them before confirming."
                        : "Review the extracted skills, make corrections where needed, then confirm the final skill set."}
                  </p>
                </div>

                <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end lg:w-auto">
                  {!isConfirmed && (
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={
                        saving ||
                        confirming ||
                        extracting ||
                        editingIndex !== null ||
                        !hasUnsavedChanges
                      }
                      title={
                        editingIndex !== null
                          ? "Finish or cancel the active skill edit first"
                          : hasUnsavedChanges
                            ? "Save skill changes"
                            : "There are no unsaved skill changes"
                      }
                      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#C9D8D4] bg-white px-4 text-xs font-semibold text-[#33423F] transition hover:border-[#9DBCB5] hover:bg-[#F5F9F7] hover:text-[#004040] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                    >
                      {saving ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" />
                          Saving...
                        </>
                      ) : (
                        "Save Changes"
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={
                      isConfirmed
                        ? () => navigate(`/jobs/${jobId}`)
                        : handleConfirm
                    }
                    disabled={
                      saving ||
                      confirming ||
                      extracting ||
                      editingIndex !== null ||
                      (!isConfirmed && hasUnsavedChanges)
                    }
                    title={
                      isConfirmed
                        ? "Continue to the job"
                        : editingIndex !== null
                          ? "Finish or cancel the active skill edit first"
                          : hasUnsavedChanges
                            ? "Save changes before confirming"
                            : "Confirm the reviewed skill set"
                    }
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg px-5 text-xs font-semibold text-white shadow-[0_7px_18px_rgba(0,64,64,0.16)] transition hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-[#004040]/15 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                    style={{ backgroundColor: BRAND }}
                  >
                    {confirming ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        Confirming...
                      </>
                    ) : isConfirmed ? (
                      <>
                        Continue
                        <ArrowRight size={14} />
                      </>
                    ) : (
                      <>
                        <Check size={14} />
                        Confirm Skills
                      </>
                    )}
                  </button>
                </div>
              </div>

              {isConfirmed && (
                <div className="border-t border-[#E8EFEC] bg-white px-4 py-6 sm:px-6 lg:px-7">
                  <div className="rounded-2xl border border-[#D9DDF5] bg-[#FAFAFF] p-4 sm:p-5">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EAE5F9] text-[#5D5FE8]">
                          <Users size={18} />
                        </div>

                        <div className="min-w-0">
                          <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#5658E8]">
                            Next stage
                          </p>
                          <h3 className="mt-1 text-base font-semibold text-[#202938]">
                            Send this job to Assessment Manager
                          </h3>
                          <p className="mt-1.5 max-w-2xl text-xs leading-5 text-[#667085]">
                            The job and confirmed skills will become available
                            in the selected manager&apos;s assessment workspace.
                          </p>
                        </div>
                      </div>

                      <div className="w-full lg:max-w-[420px]">
                        <label
                          htmlFor="assessment-manager"
                          className="mb-2 block text-[10px] font-bold uppercase tracking-[0.13em] text-[#7B8794]"
                        >
                          Assessment Manager
                        </label>

                        <div className="flex flex-col gap-2 sm:flex-row">
                          <select
                            id="assessment-manager"
                            value={selectedManagerId}
                            onChange={(event) => {
                              setSelectedManagerId(event.target.value);
                              setShareStatus("");
                            }}
                            disabled={
                              loadingManagers ||
                              sharing ||
                              managers.length === 0
                            }
                            className="h-10 min-w-0 flex-1 rounded-lg border border-[#CDD3E0] bg-white px-3 text-xs font-medium text-[#344054] outline-none transition focus:border-[#5658E8] focus:ring-4 focus:ring-[#5658E8]/10 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {loadingManagers ? (
                              <option value="">Loading managers...</option>
                            ) : managers.length === 0 ? (
                              <option value="">
                                No Assessment Managers available
                              </option>
                            ) : (
                              managers.map((manager) => (
                                <option
                                  key={manager.id}
                                  value={manager.id}
                                >
                                  {manager.username} — {manager.email}
                                </option>
                              ))
                            )}
                          </select>

                          <button
                            type="button"
                            onClick={handleShareWithManager}
                            disabled={
                              loadingManagers ||
                              sharing ||
                              !selectedManagerId ||
                              managers.length === 0
                            }
                            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#5658E8] px-4 text-xs font-semibold text-white shadow-[0_7px_16px_rgba(86,88,232,0.16)] transition hover:-translate-y-0.5 hover:bg-[#494BD8] focus:outline-none focus:ring-4 focus:ring-[#5658E8]/15 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {sharing ? (
                              <>
                                <RefreshCw size={14} className="animate-spin" />
                                Sending...
                              </>
                            ) : shareStatus === "shared" ? (
                              <>
                                <CheckCircle2 size={14} />
                                Shared
                              </>
                            ) : (
                              <>
                                <Send size={14} />
                                Send Job
                              </>
                            )}
                          </button>
                        </div>

                        <p className="mt-2 text-[10px] leading-4 text-[#98A2B3]">
                          Only confirmed skills can be handed off for assessment preparation.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </RecruiterLayout>
  );
}

function StatusBadge({ confirmed, status }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
        confirmed
          ? "border-[#BBDDD5] bg-[#EFF8F5] text-[#17655E]"
          : "border-[#E7D7B4] bg-[#FFF9EC] text-[#9A6917]"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          confirmed ? "bg-[#2E8A81]" : "bg-[#D79A26]"
        }`}
      />
      {confirmed
        ? "Confirmed"
        : status === "pending"
          ? "Pending review"
          : status === "in_review"
            ? "In review"
            : status || "Pending review"}
    </span>
  );
}

function LoadingState({ extracting }) {
  return (
    <section className="space-y-4" aria-busy={extracting}>
      {extracting && (
        <div className="flex items-center gap-2 rounded-xl border border-[#DCE5E2] bg-white px-3.5 py-3 text-sm text-[#51615D] sm:px-4">
          <RefreshCw size={15} className="animate-spin text-[#004040]" />
          Extracting skills from the job description...
        </div>
      )}

      <div className="rounded-[22px] border border-[#DCE5E2] bg-white p-6">
        <div className="h-4 w-32 animate-pulse rounded bg-[#EEF2F0]" />
        <div className="mt-4 h-7 w-2/5 animate-pulse rounded bg-[#EEF2F0]" />
        <div className="mt-3 h-4 w-4/5 animate-pulse rounded bg-[#F3F6F4]" />
      </div>

      <div className="rounded-[22px] border border-[#DCE5E2] bg-white p-6">
        <div className="h-5 w-40 animate-pulse rounded bg-[#EEF2F0]" />
        <div className="mt-5 space-y-3">
          <div className="h-14 animate-pulse rounded-xl bg-[#F3F6F4]" />
          <div className="h-14 animate-pulse rounded-xl bg-[#F3F6F4]" />
          <div className="h-14 animate-pulse rounded-xl bg-[#F3F6F4]" />
        </div>
      </div>
    </section>
  );
}

export default SkillReview;