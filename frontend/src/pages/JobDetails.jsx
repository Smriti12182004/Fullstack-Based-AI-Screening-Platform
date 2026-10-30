import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Mail,
  RefreshCw,
  Share2,
  Sparkles,
  UserCheck,
  Users,
  X,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import RecruiterLayout from "../layouts/RecruiterLayout";

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

const JOB_DESCRIPTION_HEADING_LOOKUP = new Map(
  JOB_DESCRIPTION_HEADINGS.map((heading) => [
    heading.toLowerCase().replace(/[’]/g, "'"),
    heading.replace(/[’]/g, "'"),
  ])
);

function normalizeJobDescriptionText(value) {
  if (value == null) {
    return "";
  }

  let text = String(value)
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .trim();

  if (!text) {
    return "";
  }

  // Remove code-fence and horizontal-rule markers without removing their content.
  text = text
    .replace(/^\s*```[^\n]*$/gm, "")
    .replace(/^\s*(?:---+|___+|\*\*\*+)\s*$/gm, "");

  // Render Markdown links as readable text instead of displaying raw syntax.
  text = text.replace(
    /!?\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_, label, url) => (label === url ? url : `${label} (${url})`)
  );

  // Remove common inline Markdown markers while preserving the text.
  text = text
    .replace(/\*\*([\s\S]+?)\*\*/g, "$1")
    .replace(/__([\s\S]+?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1$2")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\s+#+\s*$/gm, "");

  // Reintroduce line breaks before common section titles. This also handles
  // saved JDs where headings and content have been flattened into one line.
  const escapedHeadings = [...JOB_DESCRIPTION_HEADINGS]
    .sort((a, b) => b.length - a.length)
    .map((heading) => heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  const headingPattern = new RegExp(
    `\\b(${escapedHeadings.join("|")})\\b\\s*:?[ \\t]*(?=\\S)`,
    "gi"
  );

  text = text.replace((headingPattern), (match, heading) => {
    const canonicalKey = String(heading)
      .toLowerCase()
      .replace(/[’]/g, "'");

    const canonicalHeading =
      JOB_DESCRIPTION_HEADING_LOOKUP.get(canonicalKey) || heading;

    return `\n\n${canonicalHeading}\n`;
  });

  // Turn inline bullets into separate list rows.
  text = text
    .replace(/\s*[•·]\s*/g, "\n• ")
    .replace(/(^|\n)\s*[-*+]\s+/gm, "$1• ")
    .replace(/([.!?;])\s+[-*+]\s+(?=\S)/g, "$1\n• ")
    .replace(/(^|\n)\s*(\d+)[.)]\s+/gm, "$1$2. ");

  // Remove Markdown table-divider rows and make remaining cells readable.
  text = text
    .split("\n")
    .filter(
      (line) =>
        !/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)
    )
    .map((line) => {
      const trimmed = line.trim();

      if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
        return trimmed
          .slice(1, -1)
          .split("|")
          .map((cell) => cell.trim())
          .filter(Boolean)
          .join(" — ");
      }

      return line.trimEnd();
    })
    .join("\n");

  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseJobDescription(value) {
  const normalizedText = normalizeJobDescriptionText(value);

  if (!normalizedText) {
    return [];
  }

  const lines = normalizedText.split("\n");
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

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const normalizedHeading = line
      .replace(/:$/, "")
      .trim()
      .toLowerCase()
      .replace(/[’]/g, "'");

    const heading = JOB_DESCRIPTION_HEADING_LOOKUP.get(
      normalizedHeading
    );

    if (heading) {
      flushParagraph();
      flushList();

      blocks.push({
        type: "heading",
        text: heading,
      });

      continue;
    }

    const bulletMatch = line.match(/^•\s*(.+)$/);

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

function JobDescriptionContent({ value }) {
  const blocks = parseJobDescription(value);

  if (!blocks.length) {
    return (
      <p className="text-sm leading-7 text-[#7B8794]">
        No job description is available.
      </p>
    );
  }

  return (
    <div className="space-y-5 break-words text-sm leading-7 text-[#4F5F70]">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return (
            <h3
              key={`heading-${index}`}
              className="border-b border-[#EEF0F3] pb-2 text-[12px] font-bold uppercase tracking-[0.1em] text-[#344054] first:mt-0"
            >
              {block.text}
            </h3>
          );
        }

        if (block.type === "ul") {
          return (
            <ul
              key={`list-${index}`}
              className="list-disc space-y-2 pl-5 marker:text-[#7A61D8]"
            >
              {block.items.map((item, itemIndex) => (
                <li
                  key={`item-${index}-${itemIndex}`}
                  className="pl-1 leading-7"
                >
                  {item}
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === "ol") {
          return (
            <ol
              key={`ordered-${index}`}
              className="list-decimal space-y-2 pl-5 marker:font-semibold marker:text-[#7A61D8]"
            >
              {block.items.map((item, itemIndex) => (
                <li
                  key={`ordered-item-${index}-${itemIndex}`}
                  className="pl-1 leading-7"
                >
                  {item}
                </li>
              ))}
            </ol>
          );
        }

        return (
          <p
            key={`paragraph-${index}`}
            className="whitespace-pre-line leading-7 text-[#4F5F70]"
          >
            {block.text}
          </p>
        );
      })}
    </div>
  );
}

function JobDetails() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [refreshError, setRefreshError] = useState("");

  // Collaboration
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [collaborators, setCollaborators] = useState([]);
  const [collaboration, setCollaboration] = useState({
    assessment_manager: null,
    assessment_reviewer: null,
  });

  const [selectedManager, setSelectedManager] = useState("");
  const [selectedReviewer, setSelectedReviewer] = useState("");
  const [collaborationLoading, setCollaborationLoading] =
    useState(false);
  const [collaborationSaving, setCollaborationSaving] =
    useState(false);
  const [collaborationError, setCollaborationError] = useState("");
  const [collaborationSuccess, setCollaborationSuccess] =
    useState("");

  // Activity
  const [activity, setActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState("");

  const loadJob = async (showRefreshState = false) => {
    try {
      if (showRefreshState) {
        setRefreshing(true);
        setRefreshError("");
      } else {
        setLoading(true);
        setError("");
        setRefreshError("");
        setJob(null);
      }

      const response = await api.get(`/jobs/${jobId}`);

      setJob(response.data);
      setRefreshError("");
    } catch (err) {
      console.error("Failed to load job:", err);

      if (
        err.response?.status === 401 ||
        err.response?.status === 403
      ) {
        logout();
        navigate("/login", { replace: true });
        return;
      }

      const message =
        err.response?.data?.detail || "Unable to load this job.";

      if (showRefreshState && job) {
        setRefreshError(message);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadCollaboration = async () => {
    if (!jobId) {
      return;
    }

    try {
      setCollaborationLoading(true);
      setCollaborationError("");

      const [collaboratorsResponse, collaborationResponse] =
        await Promise.all([
          api.get("/jobs/collaborators"),
          api.get(`/jobs/${jobId}/collaboration`),
        ]);

      const availableCollaborators =
        Array.isArray(collaboratorsResponse.data)
          ? collaboratorsResponse.data
          : [];

      const currentCollaboration =
        collaborationResponse.data || {
          assessment_manager: null,
          assessment_reviewer: null,
        };

      setCollaborators(availableCollaborators);
      setCollaboration(currentCollaboration);

      setSelectedManager(
        currentCollaboration.assessment_manager?.id
          ? String(currentCollaboration.assessment_manager.id)
          : ""
      );

      setSelectedReviewer(
        currentCollaboration.assessment_reviewer?.id
          ? String(currentCollaboration.assessment_reviewer.id)
          : ""
      );
    } catch (err) {
      console.error("Failed to load collaboration:", err);

      if (
        err.response?.status === 401 ||
        err.response?.status === 403
      ) {
        logout();
        navigate("/login", { replace: true });
        return;
      }

      setCollaborationError(
        err.response?.data?.detail ||
          "Unable to load collaboration details."
      );
    } finally {
      setCollaborationLoading(false);
    }
  };

  const loadActivity = async () => {
    if (!jobId) {
      return;
    }

    try {
      setActivityLoading(true);
      setActivityError("");

      const response = await api.get(`/jobs/${jobId}/activity`);

      setActivity(
        Array.isArray(response.data) ? response.data : []
      );
    } catch (err) {
      console.error("Failed to load job activity:", err);

      if (
        err.response?.status === 401 ||
        err.response?.status === 403
      ) {
        logout();
        navigate("/login", { replace: true });
        return;
      }

      setActivityError(
        err.response?.data?.detail || "Unable to load job activity."
      );
    } finally {
      setActivityLoading(false);
    }
  };

  useEffect(() => {
    if (!jobId) {
      setError("Unable to determine which job to load.");
      setJob(null);
      setLoading(false);
      return;
    }

    loadJob();
    loadCollaboration();
    loadActivity();

    // Load these records again when the selected job changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const openShareModal = () => {
    setCollaborationError("");
    setCollaborationSuccess("");
    setShareModalOpen(true);
  };

  const closeShareModal = () => {
    if (collaborationSaving) {
      return;
    }

    setShareModalOpen(false);
    setCollaborationError("");
    setCollaborationSuccess("");
  };

  const handleShareJob = async () => {
    setCollaborationError("");
    setCollaborationSuccess("");

    if (!selectedManager) {
      setCollaborationError("Please select an Assessment Manager.");
      return;
    }

    if (!selectedReviewer) {
      setCollaborationError("Please select an Assessment Reviewer.");
      return;
    }

    if (selectedManager === selectedReviewer) {
      setCollaborationError(
        "Assessment Manager and Assessment Reviewer must be different users."
      );
      return;
    }

    try {
      setCollaborationSaving(true);

      const response = await api.put(
        `/jobs/${job.id}/collaboration`,
        {
          assessment_manager_id: Number(selectedManager),
          assessment_reviewer_id: Number(selectedReviewer),
        }
      );

      setCollaboration(
        response.data || {
          assessment_manager: null,
          assessment_reviewer: null,
        }
      );

      setCollaborationSuccess(
        "Job successfully shared with the selected Assessment Manager and Assessment Reviewer."
      );

      await loadActivity();

      window.setTimeout(() => {
        setShareModalOpen(false);
        setCollaborationSuccess("");
      }, 1000);
    } catch (err) {
      console.error("Failed to assign collaborators:", err);

      if (
        err.response?.status === 401 ||
        err.response?.status === 403
      ) {
        logout();
        navigate("/login", { replace: true });
        return;
      }

      setCollaborationError(
        err.response?.data?.detail || "Unable to share this job."
      );
    } finally {
      setCollaborationSaving(false);
    }
  };

  const formatDate = (value) => {
    if (!value) {
      return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return date.toLocaleString();
  };

  const formatAction = (action) => {
    if (!action) {
      return "Activity";
    }

    return action
      .replaceAll("_", " ")
      .toLowerCase()
      .replace(/\b\w/g, (character) => character.toUpperCase());
  };

  const formatDetails = (details) => {
    if (!details) {
      return "";
    }

    try {
      return JSON.stringify(JSON.parse(details), null, 2);
    } catch {
      return details;
    }
  };

  if (loading) {
    return (
      <RecruiterLayout
        title="Job Details"
        breadcrumb="Workspace / Jobs / Details"
      >
        <div className="mx-auto flex min-h-[65vh] max-w-[1240px] items-center justify-center px-5 sm:px-8">
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAE5F9]">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#D9D9EA] border-t-[#5658E8]" />
            </div>

            <p className="mt-5 text-sm font-semibold text-[#344054]">
              Loading job details
            </p>

            <p className="mt-1.5 text-xs text-[#98A2B3]">
              Fetching the selected job.
            </p>
          </div>
        </div>
      </RecruiterLayout>
    );
  }

  if (error) {
    return (
      <RecruiterLayout
        title="Job Details"
        breadcrumb="Workspace / Jobs / Details"
      >
        <div className="mx-auto flex min-h-[65vh] max-w-[1240px] items-center justify-center px-5 sm:px-8">
          <div className="w-full max-w-2xl rounded-[22px] border border-[#F0D5D5] bg-white p-8 shadow-[0_18px_45px_rgba(38,40,79,0.05)] sm:p-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#FCE7E7] text-[#B42318]">
              <BriefcaseBusiness size={20} />
            </div>

            <p className="mt-6 text-[9px] font-bold uppercase tracking-[0.2em] text-[#B42318]">
              Job management
            </p>

            <h1 className="mt-3 text-[32px] font-semibold tracking-[-0.03em] text-[#182033]">
              Job unavailable
            </h1>

            <p className="mt-3 text-sm leading-7 text-[#667085]">
              {error}
            </p>

            <div className="mt-7 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => loadJob()}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#5658E8] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(86,88,232,0.16)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#494BD8] focus:outline-none focus:ring-4 focus:ring-[#5658E8]/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw
                  size={15}
                  className={loading ? "animate-spin" : ""}
                />
                {loading ? "Retrying..." : "Try again"}
              </button>

              <button
                type="button"
                onClick={() => navigate("/jobs")}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#D7DCE5] bg-white px-5 py-3 text-sm font-semibold text-[#475467] transition duration-200 hover:border-[#B9C2D0] hover:bg-[#FAFBFC] focus:outline-none focus:ring-4 focus:ring-[#5658E8]/10"
              >
                <ArrowLeft size={15} />
                Back to Jobs
              </button>
            </div>
          </div>
        </div>
      </RecruiterLayout>
    );
  }

  return (
    <RecruiterLayout
      title="Job Details"
      breadcrumb={`Workspace / Jobs / ${job?.title || "Details"}`}
    >
      <main
        className="mx-auto max-w-[1240px] px-4 pb-12 sm:px-8"
        aria-labelledby="job-details-title"
        aria-busy={refreshing}
      >
        {refreshing && (
          <div
            className="sr-only"
            role="status"
            aria-live="polite"
          >
            Refreshing job details.
          </div>
        )}

        {refreshError && (
          <div
            className="mb-5 flex flex-col gap-3 rounded-xl border border-[#F0D5D5] bg-[#FFF9F9] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            role="alert"
            aria-live="polite"
          >
            <div>
              <p className="text-xs font-semibold text-[#B42318]">
                Refresh failed
              </p>

              <p className="mt-1 text-xs leading-5 text-[#B42318]/80">
                {refreshError}
              </p>
            </div>

            <button
              type="button"
              onClick={() => loadJob(true)}
              disabled={refreshing}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#E7BDBD] bg-white px-3 text-xs font-semibold text-[#A83E3E] transition hover:border-[#C98E8E] hover:bg-[#FFF5F5] focus:outline-none focus:ring-4 focus:ring-[#A83E3E]/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                size={13}
                className={refreshing ? "animate-spin" : ""}
              />
              Retry refresh
            </button>
          </div>
        )}

        <div className="flex flex-col gap-4 border-b border-[#E7E9EF] pb-5 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => navigate("/jobs")}
            className="group inline-flex min-h-9 w-fit items-center gap-2 rounded-lg px-2 text-xs font-semibold text-[#667085] transition duration-200 hover:-translate-x-0.5 hover:bg-[#F7F8FC] hover:text-[#5658E8] focus:outline-none focus:ring-4 focus:ring-[#5658E8]/10"
          >
            <ArrowLeft
              size={15}
              className="transition-transform duration-200 group-hover:-translate-x-0.5"
            />
            Back to Jobs
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#D9DCE7] bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#7A8495]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#5658E8]" />
              Job details
            </span>

            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#DDE1EA] bg-[#FAFBFC] px-3 py-1.5 text-[10px] font-semibold text-[#667085]">
              <Activity size={11} />
              Audit enabled
            </span>
          </div>
        </div>

        <section
          className="mt-6 overflow-hidden rounded-[22px] border border-[#DDE1E9] bg-white shadow-[0_12px_34px_rgba(38,40,79,0.04)]"
          aria-labelledby="job-overview-heading"
        >
          <div className="relative overflow-hidden rounded-[22px]">
            <div className="h-1 bg-gradient-to-r from-[#CFDEFC] via-[#EAE5F9] to-[#F3E3F2]" />
            <div className="pointer-events-none absolute right-[-90px] top-[-100px] h-64 w-64 rounded-full bg-[#CFDEFC]/45 blur-[75px]" />

            <div className="relative p-6 sm:p-8">
              <div className="flex flex-col gap-7 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#CFDEFC] text-[#4A61C8]">
                      <BriefcaseBusiness size={19} />
                    </div>

                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#4A61C8]">
                        Job profile
                      </p>

                      <p className="mt-1 text-[10px] text-[#98A2B3]">
                        Job ID: {job?.id}
                      </p>
                    </div>
                  </div>

                  <h2 id="job-overview-heading" className="sr-only">
                    Job overview
                  </h2>

                  <h1
                    id="job-details-title"
                    className="mt-5 max-w-4xl text-[34px] font-semibold leading-[1.08] tracking-[-0.035em] text-[#182033] sm:text-[44px]"
                  >
                    {job?.title}
                  </h1>

                  <p className="mt-3 max-w-2xl text-sm leading-6 text-[#667085]">
                    Review the role, collaboration assignments, and workflow activity for this job.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        `/assessments?job_id=${encodeURIComponent(job.id)}`
                      )
                    }
                    disabled={job?.id == null}
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#D8D9FB] bg-[#F8F8FF] px-4 text-xs font-semibold text-[#5658E8] transition duration-200 hover:-translate-y-0.5 hover:bg-[#ECECFF] focus:outline-none focus:ring-4 focus:ring-[#5658E8]/15 disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label={`View assessments and candidate results for ${
                      job?.title || "this job"
                    }`}
                  >
                    <Users size={14} />
                    Candidates & Results
                  </button>

                  <button
                    type="button"
                    onClick={openShareModal}
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#5658E8] px-4 text-xs font-semibold text-white shadow-[0_10px_22px_rgba(86,88,232,0.17)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#494BD8] focus:outline-none focus:ring-4 focus:ring-[#5658E8]/15"
                  >
                    <Share2 size={14} />
                    Share With Team
                  </button>

                  <button
                    type="button"
                    onClick={() => loadJob(true)}
                    disabled={refreshing}
                    aria-label="Refresh job details"
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#CBD1DC] bg-white px-4 text-xs font-semibold text-[#475467] transition duration-200 hover:border-[#5658E8] hover:bg-[#FAFAFF] hover:text-[#5658E8] focus:outline-none focus:ring-4 focus:ring-[#5658E8]/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RefreshCw
                      size={14}
                      className={refreshing ? "animate-spin" : ""}
                    />
                    {refreshing ? "Refreshing..." : "Refresh"}
                  </button>
                </div>
              </div>

              <div className="mt-8 grid gap-3 border-t border-[#EEF0F3] pt-6 sm:grid-cols-2 xl:grid-cols-4">
                <JobMeta
                  label="Created by"
                  value={job?.created_by}
                  background="#CFDEFC"
                  color="#4A61C8"
                />

                <JobMeta
                  label="Experience"
                  value={job?.experience_required || "Not specified"}
                  background="#E8F2EF"
                  color="#17655E"
                />

                <JobMeta
                  label="Created"
                  value={formatDate(job?.created_at)}
                  background="#EAE5F9"
                  color="#7862C8"
                  icon={<CalendarDays size={14} />}
                />

                <JobMeta
                  label="Last updated"
                  value={formatDate(job?.updated_at)}
                  background="#F3E3F2"
                  color="#AA5E9C"
                  icon={<CalendarDays size={14} />}
                />
              </div>
            </div>
          </div>
        </section>

        <section
          className="mt-7 rounded-[22px] border border-[#DDE1E9] bg-white shadow-[0_12px_34px_rgba(38,40,79,0.035)]"
          aria-labelledby="collaboration-heading"
        >
          <div className="border-b border-[#EAECF0] px-6 py-5 sm:px-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E5F7F3] text-[#0F9D8A]">
                  <Users size={17} />
                </div>

                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#0F9D8A]">
                    Team assignment
                  </p>

                  <h2
                    id="collaboration-heading"
                    className="mt-1 text-[19px] font-semibold tracking-[-0.02em] text-[#202938]"
                  >
                    Assessment Team
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={openShareModal}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#D8E8E4] bg-[#FAFFFD] px-3.5 text-[10px] font-semibold text-[#08786B] transition hover:border-[#9ED7CD] hover:bg-[#F3FCF9]"
              >
                <Share2 size={13} />
                {collaboration.assessment_manager ||
                collaboration.assessment_reviewer
                  ? "Update Assignment"
                  : "Assign Team"}
              </button>
            </div>
          </div>

          <div className="p-6 sm:p-7">
            {collaborationLoading ? (
              <div className="flex items-center gap-3 rounded-xl border border-dashed border-[#DDE1E8] bg-[#FAFBFC] px-4 py-6">
                <RefreshCw
                  size={15}
                  className="animate-spin text-[#5658E8]"
                />
                <p className="text-xs text-[#667085]">
                  Loading assigned team...
                </p>
              </div>
            ) : collaborationError ? (
              <div className="flex items-start gap-3 rounded-xl border border-[#F0D5D5] bg-[#FFF9F9] px-4 py-4">
                <AlertCircle
                  size={16}
                  className="mt-0.5 shrink-0 text-[#B42318]"
                />

                <div>
                  <p className="text-xs font-semibold text-[#B42318]">
                    Collaboration unavailable
                  </p>
                  <p className="mt-1 text-[11px] leading-5 text-[#B42318]/80">
                    {collaborationError}
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <CollaboratorCard
                  icon={<UserCheck size={17} />}
                  eyebrow="Assessment Manager"
                  emptyText="No Assessment Manager assigned"
                  user={collaboration.assessment_manager}
                  accent="violet"
                />

                <CollaboratorCard
                  icon={<CheckCircle2 size={17} />}
                  eyebrow="Assessment Reviewer"
                  emptyText="No Assessment Reviewer assigned"
                  user={collaboration.assessment_reviewer}
                  accent="rose"
                />
              </div>
            )}

            <div className="mt-5 flex items-start gap-3 rounded-xl border border-[#E7E9EF] bg-[#FAFBFC] px-4 py-3.5">
              <Mail
                size={14}
                className="mt-0.5 shrink-0 text-[#7A8495]"
              />
              <p className="text-[10px] leading-5 text-[#667085]">
                Assigning a new Assessment Manager or Assessment Reviewer
                creates an in-app notification and sends an email to the newly
                assigned collaborator.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-7 lg:items-start">
          <article
            className="min-w-0 rounded-[22px] border border-[#DDE1E9] bg-white shadow-[0_12px_34px_rgba(38,40,79,0.035)]"
            aria-labelledby="job-description-heading"
          >
            <div className="border-b border-[#EAECF0] px-6 py-5 sm:px-7">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#CFDEFC] text-[#4A61C8]">
                  <BriefcaseBusiness size={17} />
                </div>

                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#4A61C8]">
                    Role information
                  </p>
                  <h2
                    id="job-description-heading"
                    className="mt-1 text-[19px] font-semibold tracking-[-0.02em] text-[#202938]"
                  >
                    Job Description
                  </h2>
                </div>
              </div>
            </div>

            <div className="px-6 py-7 sm:px-7 sm:py-8">
              <div className="mb-5 flex items-center justify-between gap-3 border-b border-[#F0F2F4] pb-4">
                <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#A0A8B4]">
                  Role content
                </p>
                <p className="text-[10px] font-medium text-[#A0A8B4]">
                  Full description
                </p>
              </div>

              <JobDescriptionContent value={job?.description} />
            </div>
          </article>

          <aside
            className="rounded-[22px] border border-[#DDE1E9] bg-white shadow-[0_12px_34px_rgba(38,40,79,0.035)] lg:sticky lg:top-24"
            aria-labelledby="next-stage-heading"
          >
            <div className="h-1 rounded-t-[22px] bg-[#EAE5F9]" />

            <div className="p-6 sm:p-7">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EAE5F9] text-[#7862C8]">
                <Sparkles size={19} />
              </div>

              <div className="mt-5 flex items-center gap-2">
                <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#7862C8]">
                  Next stage
                </span>
                <span className="rounded-full bg-[#F3E3F2] px-2 py-0.5 text-[9px] font-bold text-[#AA5E9C]">
                  02
                </span>
              </div>

              <h2
                id="next-stage-heading"
                className="mt-2 text-[20px] font-semibold tracking-[-0.02em] text-[#202938]"
              >
                Skill review
              </h2>

              <p className="mt-3 text-sm leading-6 text-[#667085]">
                Continue to AI-assisted skill extraction and recruiter review
                for this job.
              </p>

              <div className="mt-6 rounded-xl border border-[#EEF0F3] bg-[#FAFBFC] p-3.5">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F3E3F2] text-[#AA5E9C]">
                    <Sparkles size={14} />
                  </span>

                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold text-[#344054]">
                      Review extracted skills
                    </p>
                    <p className="mt-0.5 text-[9px] leading-4 text-[#98A2B3]">
                      Inspect, refine, save, and confirm the role skill set.
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (job?.id != null) {
                    navigate(`/jobs/${job.id}/skills`);
                  }
                }}
                disabled={refreshing}
                className="group/button mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#5658E8] px-4 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(86,88,232,0.17)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#494BD8] focus:outline-none focus:ring-4 focus:ring-[#5658E8]/15 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label={`Review skills for ${job?.title || "this job"}`}
              >
                Review Skills
                <ArrowRight
                  size={15}
                  className="transition-transform duration-200 group-hover/button:translate-x-1"
                />
              </button>
            </div>
          </aside>
        </section>

        <section
          className="mt-7 rounded-[22px] border border-[#DDE1E9] bg-white shadow-[0_12px_34px_rgba(38,40,79,0.035)]"
          aria-labelledby="activity-heading"
        >
          <div className="border-b border-[#EAECF0] px-6 py-5 sm:px-7">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F0EBFB] text-[#7A61D8]">
                <Activity size={17} />
              </div>

              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#7A61D8]">
                  Audit trail
                </p>
                <h2
                  id="activity-heading"
                  className="mt-1 text-[19px] font-semibold tracking-[-0.02em] text-[#202938]"
                >
                  Activity Timeline
                </h2>
              </div>
            </div>
          </div>

          <div className="px-6 py-6 sm:px-7">
            {activityLoading ? (
              <div className="flex items-center gap-3 py-6">
                <RefreshCw
                  size={16}
                  className="animate-spin text-[#5658E8]"
                />
                <p className="text-xs text-[#667085]">
                  Loading activity...
                </p>
              </div>
            ) : activityError ? (
              <div className="rounded-xl border border-[#F0D5D5] bg-[#FFF9F9] px-4 py-4">
                <div className="flex items-start gap-3">
                  <AlertCircle
                    size={16}
                    className="mt-0.5 shrink-0 text-[#B42318]"
                  />
                  <div>
                    <p className="text-xs font-semibold text-[#B42318]">
                      Activity unavailable
                    </p>
                    <p className="mt-1 text-[11px] leading-5 text-[#B42318]/80">
                      {activityError}
                    </p>
                  </div>
                </div>
              </div>
            ) : activity.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#D8DDE5] bg-[#FAFBFC] px-4 py-10 text-center">
                <Clock3
                  size={18}
                  className="mx-auto text-[#98A2B3]"
                />
                <p className="mt-3 text-xs font-semibold text-[#667085]">
                  No recorded activity yet
                </p>
                <p className="mx-auto mt-1 max-w-sm text-[10px] leading-5 text-[#98A2B3]">
                  Job workflow events will appear here as the role moves
                  through the screening lifecycle.
                </p>
              </div>
            ) : (
              <div className="relative">
                <div className="absolute bottom-2 left-[15px] top-2 w-px bg-[#E5E7EB]" />

                <div className="space-y-7">
                  {activity.map((item) => (
                    <div key={item.id} className="relative flex gap-4">
                      <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EAE5F9] text-[#7862C8] ring-4 ring-white">
                        <Activity size={13} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-xs font-semibold text-[#344054]">
                            {formatAction(item.action)}
                          </p>
                          <p className="text-[9px] text-[#98A2B3]">
                            {formatDate(item.created_at)}
                          </p>
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-[#F4F5F8] px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.08em] text-[#667085]">
                            {item.entity_type || "job"}
                          </span>

                          {item.user_id && (
                            <span className="text-[9px] text-[#98A2B3]">
                              User #{item.user_id}
                            </span>
                          )}
                        </div>

                        {item.details && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-[9px] font-semibold text-[#5658E8]">
                              View event details
                            </summary>
                            <pre className="mt-2 overflow-x-auto rounded-lg bg-[#F8F9FC] p-3 text-[9px] leading-5 text-[#667085]">
                              {formatDetails(item.details)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <section
          className="mt-7 rounded-[20px] border border-[#DDE1E9] bg-[#F8F9FC] px-4 py-4 sm:px-6 sm:py-5"
          aria-label="Screening workflow context"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#CFDEFC] text-[#4A61C8]">
                <ArrowRight size={16} />
              </div>
              <div>
                <p className="text-xs font-semibold text-[#344054]">
                  Screening workflow
                </p>
                <p className="mt-1 text-[11px] leading-5 text-[#667085]">
                  Job creation → team assignment → skill review → question
                  preparation → assessment.
                </p>
              </div>
            </div>

            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#98A2B3]">
              Current stage: Job details
            </p>
          </div>
        </section>
      </main>

      {shareModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#11152B]/45 px-4 py-6 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="share-job-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeShareModal();
            }
          }}
        >
          <div className="w-full max-w-xl overflow-hidden rounded-[24px] border border-[#DDE1EA] bg-white shadow-[0_30px_90px_rgba(21,24,52,0.25)]">
            <div className="flex items-start justify-between border-b border-[#EAECF0] px-6 py-5 sm:px-7">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E5F7F3] text-[#0F9D8A]">
                  <Share2 size={17} />
                </div>

                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#0F9D8A]">
                    Job collaboration
                  </p>
                  <h2
                    id="share-job-title"
                    className="mt-1 text-[20px] font-semibold tracking-[-0.025em] text-[#202938]"
                  >
                    Share this job
                  </h2>
                  <p className="mt-1 text-[10px] text-[#98A2B3]">
                    {job?.title}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeShareModal}
                disabled={collaborationSaving}
                aria-label="Close share job dialog"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#98A2B3] transition hover:bg-[#F4F5F8] hover:text-[#344054] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-6 py-6 sm:px-7">
              <div className="rounded-xl border border-[#E4E7ED] bg-[#F8F9FC] px-4 py-3.5">
                <div className="flex items-start gap-3">
                  <Users
                    size={15}
                    className="mt-0.5 shrink-0 text-[#5658E8]"
                  />
                  <p className="text-[10px] leading-5 text-[#667085]">
                    Assign one Assessment Manager to prepare the assessment
                    and one independent Assessment Reviewer to perform the
                    quality gate.
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-5">
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#667085]">
                    Assessment Manager
                  </span>
                  <select
                    value={selectedManager}
                    onChange={(event) =>
                      setSelectedManager(event.target.value)
                    }
                    disabled={collaborationSaving}
                    className="mt-2 h-11 w-full rounded-xl border border-[#D8DDE6] bg-white px-3.5 text-xs font-medium text-[#344054] outline-none transition focus:border-[#5658E8] focus:ring-4 focus:ring-[#5658E8]/10 disabled:cursor-not-allowed disabled:bg-[#F8F9FC]"
                  >
                    <option value="">Select Assessment Manager</option>
                    {collaborators
  .filter((user) => user.role === "assessment_manager")
  .map((user) => (
    <option key={user.id} value={user.id}>
      {user.username || user.email}
    </option>
  ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#667085]">
                    Assessment Reviewer
                  </span>
                  <select
                    value={selectedReviewer}
                    onChange={(event) =>
                      setSelectedReviewer(event.target.value)
                    }
                    disabled={collaborationSaving}
                    className="mt-2 h-11 w-full rounded-xl border border-[#D8DDE6] bg-white px-3.5 text-xs font-medium text-[#344054] outline-none transition focus:border-[#5658E8] focus:ring-4 focus:ring-[#5658E8]/10 disabled:cursor-not-allowed disabled:bg-[#F8F9FC]"
                  >
                    <option value="">Select Assessment Reviewer</option>
                    {collaborators
  .filter((user) => user.role === "assessment_reviewer")
  .map((user) => (
    <option key={user.id} value={user.id}>
      {user.username || user.email}
    </option>
  ))}
                  </select>
                </label>
              </div>

              {collaborationError && (
                <div className="mt-5 flex items-start gap-3 rounded-xl border border-[#F0D5D5] bg-[#FFF9F9] px-4 py-3.5">
                  <AlertCircle
                    size={15}
                    className="mt-0.5 shrink-0 text-[#B42318]"
                  />
                  <p className="text-[10px] leading-5 text-[#B42318]">
                    {collaborationError}
                  </p>
                </div>
              )}

              {collaborationSuccess && (
                <div className="mt-5 flex items-start gap-3 rounded-xl border border-[#CDE8DB] bg-[#F7FCF9] px-4 py-3.5">
                  <CheckCircle2
                    size={15}
                    className="mt-0.5 shrink-0 text-[#2E8B62]"
                  />
                  <p className="text-[10px] leading-5 text-[#256F4D]">
                    {collaborationSuccess}
                  </p>
                </div>
              )}

              <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeShareModal}
                  disabled={collaborationSaving}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-[#D7DCE5] bg-white px-4 text-xs font-semibold text-[#475467] transition hover:border-[#B9C2D0] hover:bg-[#FAFBFC] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleShareJob}
                  disabled={collaborationSaving}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#5658E8] px-5 text-xs font-semibold text-white shadow-[0_10px_22px_rgba(86,88,232,0.16)] transition hover:-translate-y-0.5 hover:bg-[#494BD8] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {collaborationSaving && (
                    <RefreshCw size={13} className="animate-spin" />
                  )}
                  {collaborationSaving ? "Saving..." : "Save Assignment"}
                </button>
              </div>

              <p className="mt-4 text-[9px] leading-5 text-[#98A2B3]">
                Newly assigned collaborators receive an in-app notification
                and an email. Existing assignments are not notified again
                unless the assignment changes.
              </p>
            </div>
          </div>
        </div>
      )}
    </RecruiterLayout>
  );
}

function JobMeta({ label, value, background, color, icon }) {
  return (
    <div className="rounded-[15px] border border-[#EEF0F3] bg-[#FAFBFC] p-3.5 transition duration-200 hover:bg-white hover:shadow-[0_8px_20px_rgba(38,40,79,0.04)]">
      <div className="flex items-center gap-2">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ backgroundColor: background, color }}
        >
          {icon || <BriefcaseBusiness size={13} />}
        </span>

        <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-[#98A2B3]">
          {label}
        </p>
      </div>

      <p className="mt-2.5 break-words text-sm font-semibold text-[#344054]">
        {value}
      </p>
    </div>
  );
}

function CollaboratorCard({
  icon,
  eyebrow,
  emptyText,
  user,
  accent,
}) {
  const accents = {
    violet: {
      icon: "bg-[#F0EBFB] text-[#7A61D8]",
      badge: "bg-[#F5F1FD] text-[#654DBD]",
      border: "border-[#E2DDF0]",
    },
    rose: {
      icon: "bg-[#F8EAF1] text-[#B85C87]",
      badge: "bg-[#FCF1F6] text-[#944668]",
      border: "border-[#E8D7E0]",
    },
  };

  const style = accents[accent] || accents.violet;

  return (
    <div
      className={`rounded-[18px] border ${style.border} bg-[#FCFCFE] p-5`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${style.icon}`}
        >
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <span
            className={`inline-flex rounded-full px-2 py-1 text-[8px] font-bold uppercase tracking-[0.08em] ${style.badge}`}
          >
            {eyebrow}
          </span>

          {user ? (
            <>
              <p className="mt-3 truncate text-sm font-semibold text-[#344054]">
                {user.username}
              </p>
              <p className="mt-1 truncate text-[10px] text-[#667085]">
                {user.email}
              </p>
            </>
          ) : (
            <>
              <p className="mt-3 text-xs font-semibold text-[#667085]">
                {emptyText}
              </p>
              <p className="mt-1 text-[9px] text-[#98A2B3]">
                Use "Assign Team" to add this role.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default JobDetails;