import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  FileText,
  Plus,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

import api from "../services/api";
import RecruiterLayout from "../layouts/RecruiterLayout";

const COLORS = {
  dark: "#25264A",
  indigo: "#5658E8",
  indigoDark: "#4648C9",
  indigoLight: "#ECECFF",

  blue: "#3B82F6",
  blueDark: "#2F68C5",
  blueLight: "#EAF2FF",

  violet: "#7A61D8",
  violetDark: "#654DBD",
  violetLight: "#F0EBFB",

  teal: "#0F9D8A",
  tealDark: "#08786B",
  tealLight: "#E5F7F3",

  rose: "#B85C87",
  roseDark: "#944668",
  roseLight: "#F8EAF1",

  amber: "#C58A32",
  amberDark: "#9C6A1F",
  amberLight: "#FBF2DE",

  peach: "#B87562",
  peachDark: "#955847",
  peachLight: "#FAECE8",

  text: "#1B2430",
  textSecondary: "#667085",
  textMuted: "#98A2B3",

  border: "#E1E4EB",
  background: "#F7F8FC",
};

function NewJob() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [manualExperienceRequired, setManualExperienceRequired] =
    useState("");
  const [file, setFile] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // ---------------------------------------------------------
  // AI JOB DESCRIPTION GENERATION
  // ---------------------------------------------------------
  const [aiTitle, setAiTitle] = useState("");
  const [skillInput, setSkillInput] = useState("");
  const [aiSkills, setAiSkills] = useState([]);
  const [experienceRequired, setExperienceRequired] =
    useState("");

  const [maxWords, setMaxWords] = useState("300");

  const [outputFormat, setOutputFormat] =
    useState("mixed");

  const [additionalInstructions, setAdditionalInstructions] =
    useState("");

  const [generatedDescription, setGeneratedDescription] =
    useState("");

  const [generatedWordCount, setGeneratedWordCount] =
    useState(0);

  const [generating, setGenerating] = useState(false);

  const [creatingGeneratedJob, setCreatingGeneratedJob] =
    useState(false);

  // ---------------------------------------------------------
  // MANUAL JOB CREATION
  // ---------------------------------------------------------
  const handleCreateJob = async (event) => {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!title.trim()) {
      setError("Please enter a job title.");
      return;
    }

    if (!description.trim()) {
      setError("Please enter a job description.");
      return;
    }

    if (
      manualExperienceRequired.trim().length > 100
    ) {
      setError(
        "Experience requirement must be 100 characters or fewer."
      );
      return;
    }

    setLoading(true);

    try {
      const response = await api.post("/jobs", {
        title: title.trim(),
        description: description.trim(),
        experience_required:
          manualExperienceRequired.trim() || null,
      });

      const createdJob = response.data;

      setSuccess("Job created successfully.");

      navigate(`/jobs/${createdJob.id}/skills`);
    } catch (err) {
      console.error("Create job failed:", err);

      const detail = err.response?.data?.detail;
      const message = Array.isArray(detail)
        ? detail
            .map((item) =>
              item?.msg ||
              (typeof item === "string"
                ? item
                : JSON.stringify(item))
            )
            .join(" ")
        : typeof detail === "string"
          ? detail
          : "Unable to create the job. Please try again.";

      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------
  // FILE SELECTION
  // ---------------------------------------------------------
  const handleFileChange = (event) => {
    const selectedFile =
      event.target.files?.[0] || null;

    setError("");
    setSuccess("");

    if (!selectedFile) {
      setFile(null);
      return;
    }

    const allowedTypes = [
      "application/pdf",
      "text/plain",
    ];

    const fileName =
      selectedFile.name.toLowerCase();

    const validExtension =
      fileName.endsWith(".pdf") ||
      fileName.endsWith(".txt");

    const validType =
      allowedTypes.includes(selectedFile.type);

    if (!validType && !validExtension) {
      setFile(null);

      setError(
        "Only PDF and TXT files are supported."
      );

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      return;
    }

    setFile(selectedFile);
  };

  // ---------------------------------------------------------
  // REMOVE SELECTED FILE
  // ---------------------------------------------------------
  const handleRemoveFile = () => {
    setFile(null);
    setError("");
    setSuccess("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // ---------------------------------------------------------
  // UPLOAD JOB DESCRIPTION
  // ---------------------------------------------------------
  const handleUpload = async () => {
    setError("");
    setSuccess("");

    if (!file) {
      setError("Please select a PDF or TXT file.");
      return;
    }

    const fileName =
      file.name.toLowerCase();

    const validExtension =
      fileName.endsWith(".pdf") ||
      fileName.endsWith(".txt");

    const allowedTypes = [
      "application/pdf",
      "text/plain",
    ];

    const validType =
      allowedTypes.includes(file.type);

    if (!validType && !validExtension) {
      setError(
        "Only PDF and TXT files are supported."
      );
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();

      formData.append("file", file);

      const response = await api.post(
        "/jobs/upload",
        formData,
        {
          headers: {
            "Content-Type": undefined,
          },
        }
      );

      const createdJob = response.data;

      setSuccess(
        "Job description uploaded successfully."
      );

      navigate(`/jobs/${createdJob.id}/skills`);
    } catch (err) {
      console.error("Upload failed:", err);

      const detail = err.response?.data?.detail;
      const message = Array.isArray(detail)
        ? detail
            .map((item) =>
              item?.msg ||
              (typeof item === "string"
                ? item
                : JSON.stringify(item))
            )
            .join(" ")
        : typeof detail === "string"
          ? detail
          : "Unable to upload the job description.";

      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------
  // ADD AI SKILL
  // ---------------------------------------------------------
  const handleAddSkill = () => {
    const normalizedSkill =
      skillInput.trim();

    if (!normalizedSkill) {
      return;
    }

    if (normalizedSkill.length > 100) {
      setError(
        "Each skill must be 100 characters or fewer."
      );
      return;
    }

    const alreadyExists = aiSkills.some(
      (skill) =>
        skill.toLowerCase() ===
        normalizedSkill.toLowerCase()
    );

    if (alreadyExists) {
      setError(
        "This skill has already been added."
      );
      return;
    }

    if (aiSkills.length >= 50) {
      setError(
        "You can add a maximum of 50 skills."
      );
      return;
    }

    setError("");

    setAiSkills((currentSkills) => [
      ...currentSkills,
      normalizedSkill,
    ]);

    setSkillInput("");
  };

  // ---------------------------------------------------------
  // ADD AI SKILL USING ENTER
  // ---------------------------------------------------------
  const handleSkillInputKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAddSkill();
    }
  };

  // ---------------------------------------------------------
  // REMOVE AI SKILL
  // ---------------------------------------------------------
  const handleRemoveSkill = (
    skillToRemove
  ) => {
    setAiSkills((currentSkills) =>
      currentSkills.filter(
        (skill) =>
          skill !== skillToRemove
      )
    );
  };

  // ---------------------------------------------------------
  // GENERATE JOB DESCRIPTION
  // ---------------------------------------------------------
  const handleGenerateDescription =
    async () => {
      setError("");
      setSuccess("");

      if (!aiTitle.trim()) {
        setError(
          "Please enter a job title for AI generation."
        );
        return;
      }

      if (aiSkills.length === 0) {
        setError(
          "Please add at least one skill."
        );
        return;
      }

      if (!experienceRequired.trim()) {
        setError(
          "Please enter the required experience."
        );
        return;
      }

      const parsedMaxWords =
        Number(maxWords);

      if (
        !Number.isInteger(parsedMaxWords) ||
        parsedMaxWords < 50 ||
        parsedMaxWords > 2000
      ) {
        setError(
          "Maximum words must be between 50 and 2000."
        );
        return;
      }

      if (
        additionalInstructions.length >
        1000
      ) {
        setError(
          "Additional instructions must be 1000 characters or fewer."
        );
        return;
      }

      setGenerating(true);

      try {
        const response = await api.post(
          "/jobs/generate-description",
          {
            title: aiTitle.trim(),
            skills: aiSkills,
            experience_required:
              experienceRequired.trim(),
            max_words: parsedMaxWords,
            output_format: outputFormat,
            additional_instructions:
              additionalInstructions.trim() ||
              null,
          }
        );

        setGeneratedDescription(
          response.data.description || ""
        );

        setGeneratedWordCount(
          response.data.word_count || 0
        );

        setSuccess(
          "Job description generated successfully. Review and edit it before creating the job."
        );
      } catch (err) {
        console.error(
          "Job description generation failed:",
          err
        );

        setError(
          err.response?.data?.detail ||
            "Unable to generate the job description."
        );
      } finally {
        setGenerating(false);
      }
    };

  // ---------------------------------------------------------
  // UPDATE GENERATED WORD COUNT AFTER EDITING
  // ---------------------------------------------------------
  const handleGeneratedDescriptionChange =
    (event) => {
      const newDescription =
        event.target.value;

      setGeneratedDescription(
        newDescription
      );

      const words = newDescription
        .trim()
        .split(/\s+/)
        .filter(Boolean);

      setGeneratedWordCount(
        newDescription.trim()
          ? words.length
          : 0
      );
    };

  // ---------------------------------------------------------
  // CREATE GENERATED JOB
  // ---------------------------------------------------------
  const handleCreateGeneratedJob =
    async () => {
      setError("");
      setSuccess("");

      if (!aiTitle.trim()) {
        setError(
          "Please enter a job title."
        );
        return;
      }

      if (!generatedDescription.trim()) {
        setError(
          "Please generate or enter a job description."
        );
        return;
      }

      if (!experienceRequired.trim()) {
        setError(
          "Please enter the required experience."
        );
        return;
      }

      if (experienceRequired.trim().length > 100) {
        setError(
          "Experience requirement must be 100 characters or fewer."
        );
        return;
      }

      if (generatedWordCount > 2000) {
        setError(
          "The job description cannot exceed 2000 words."
        );
        return;
      }

      setCreatingGeneratedJob(true);

      try {
        const response = await api.post(
          "/jobs",
          {
            title: aiTitle.trim(),
            description:
              generatedDescription.trim(),
            experience_required:
              experienceRequired.trim(),
          }
        );

        const createdJob = response.data;

        setSuccess(
          "Job created successfully."
        );

        navigate(
          `/jobs/${createdJob.id}/skills`
        );
      } catch (err) {
        console.error(
          "Generated job creation failed:",
          err
        );

        const detail = err.response?.data?.detail;
        const message = Array.isArray(detail)
          ? detail
              .map((item) =>
                item?.msg ||
                (typeof item === "string"
                  ? item
                  : JSON.stringify(item))
              )
              .join(" ")
          : typeof detail === "string"
            ? detail
            : "Unable to create the generated job.";

        setError(message);
      } finally {
        setCreatingGeneratedJob(false);
      }
    };

  return (
    <RecruiterLayout
      title="Create New Job"
      breadcrumb="Jobs / New Job"
    >
      <div className="mx-auto max-w-[1440px] pb-16">

        {/* =====================================================
            PAGE HEADER
        ===================================================== */}
        <section className="relative overflow-hidden rounded-[30px] border border-[#DDE1EA] bg-white px-7 py-9 shadow-[0_20px_55px_rgba(38,40,79,0.06)] sm:px-9 sm:py-11 lg:px-11 lg:py-12">

          <div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-[#EAF2FF] blur-[85px] opacity-80" />

          <div className="pointer-events-none absolute right-[16%] top-8 h-32 w-32 rounded-full bg-[#F0EBFB] blur-[42px] opacity-80" />

          <div className="pointer-events-none absolute bottom-[-75px] right-[28%] h-48 w-48 rounded-full bg-[#F8EAF1] blur-[55px] opacity-65" />

          <div className="relative">

            <button
              type="button"
              onClick={() =>
                navigate("/dashboard")
              }
              className="group mb-7 inline-flex items-center gap-2 text-xs font-semibold text-[#667085] transition duration-200 hover:-translate-x-0.5 hover:text-[#5658E8]"
            >
              <ArrowLeft
                size={14}
                className="transition-transform duration-200 group-hover:-translate-x-0.5"
              />

              Back to dashboard
            </button>

            <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">

              <div className="max-w-3xl">

                <div className="inline-flex items-center gap-2 rounded-full border border-[#E0E3EA] bg-[#FAFBFD] px-3.5 py-2">

                  <span className="h-2 w-2 rounded-full bg-[#5658E8]" />

                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#667085]">
                    Job & requirement management
                  </span>

                </div>

                <h1 className="mt-5 text-[40px] font-semibold leading-[1.04] tracking-[-0.04em] text-[#1B2430] sm:text-[50px]">
                  Create a new job.
                </h1>

                <p className="mt-4 max-w-2xl text-sm leading-7 text-[#667085] sm:text-[15px]">
                  Add a job description manually,
                  upload an existing document, or
                  generate one from role-specific
                  skills and experience.
                </p>

              </div>

              <div className="hidden shrink-0 lg:block">

                <div className="rounded-[18px] border border-[#E1E4EB] bg-[#FAFBFD] px-5 py-4">

                  <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#98A2B3]">
                    Workflow
                  </p>

                  <div className="mt-3 flex items-center gap-2">

                    <WorkflowDot
                      number="01"
                      label="Job"
                      background={
                        COLORS.blueLight
                      }
                      color={
                        COLORS.blueDark
                      }
                      active
                    />

                    <WorkflowLine />

                    <WorkflowDot
                      number="02"
                      label="Skills"
                      background={
                        COLORS.violetLight
                      }
                      color={
                        COLORS.violetDark
                      }
                    />

                    <WorkflowLine />

                    <WorkflowDot
                      number="03"
                      label="Questions"
                      background={
                        COLORS.roseLight
                      }
                      color={
                        COLORS.roseDark
                      }
                    />

                  </div>

                </div>

              </div>

            </div>

          </div>
        </section>

        {/* =====================================================
            MESSAGES
        ===================================================== */}
        <div className="mt-8 space-y-4">

          {error && (
            <div className="rounded-[18px] border border-[#F0D2D2] bg-[#FFF9F9] px-5 py-4 shadow-[0_8px_22px_rgba(180,35,24,0.025)]">

              <div className="flex items-start gap-3">

                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#FCE7E7] text-[#B42318]">
                  <X size={17} />
                </div>

                <div>

                  <p className="text-xs font-semibold text-[#B42318]">
                    Unable to continue
                  </p>

                  <p className="mt-1 text-sm leading-6 text-[#B42318]/80">
                    {error}
                  </p>

                </div>

              </div>

            </div>
          )}

          {success && (
            <div className="rounded-[18px] border border-[#CDE7D9] bg-[#F3FAF6] px-5 py-4">

              <div className="flex items-start gap-3">

                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#E5F5EB] text-[#28734E]">
                  <CheckCircle2 size={17} />
                </div>

                <div>

                  <p className="text-xs font-semibold text-[#28734E]">
                    Success
                  </p>

                  <p className="mt-1 text-sm leading-6 text-[#28734E]/80">
                    {success}
                  </p>

                </div>

              </div>

            </div>
          )}

        </div>

        {/* =====================================================
            CREATION OPTIONS
        ===================================================== */}
        <section className="mt-10 grid grid-cols-1 gap-7 xl:grid-cols-2">

          {/* =================================================
              MANUAL CREATION
          ================================================= */}
          <section className="group overflow-hidden rounded-[26px] border border-[#DDE1EA] bg-white shadow-[0_14px_38px_rgba(38,40,79,0.045)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_48px_rgba(38,40,79,0.075)]">

            <div className="h-1.5 bg-[#3B82F6]" />

            <div className="border-b border-[#EAECF0] bg-gradient-to-r from-[#F8FBFF] to-white px-7 py-7 sm:px-8">

              <div className="flex items-start gap-4">

                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#EAF2FF] text-[#3B82F6] transition duration-300 group-hover:scale-105">
                  <Plus size={19} />
                </div>

                <div>

                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#3B82F6]">
                    Option 01
                  </p>

                  <h2 className="mt-1.5 text-[20px] font-semibold tracking-[-0.02em] text-[#202938]">
                    Create manually
                  </h2>

                  <p className="mt-2 max-w-md text-xs leading-6 text-[#667085]">
                    Enter the role details directly
                    into the screening workspace.
                  </p>

                </div>

              </div>

            </div>

            <form
              onSubmit={handleCreateJob}
              className="px-7 py-8 sm:px-8 sm:py-9"
            >

              <div>

                <label
                  htmlFor="job-title"
                  className="mb-2.5 block text-xs font-semibold text-[#344054]"
                >
                  Job title
                </label>

                <div className="relative">

                  <BriefcaseIcon />

                  <input
                    id="job-title"
                    type="text"
                    value={title}
                    onChange={(event) =>
                      setTitle(
                        event.target.value
                      )
                    }
                    placeholder="e.g. Machine Learning Engineer"
                    disabled={loading}
                    className="h-12 w-full rounded-xl border border-[#D4D9E2] bg-[#FBFCFE] pl-11 pr-4 text-sm text-[#202938] outline-none transition duration-200 placeholder:text-[#A0A7B2] focus:border-[#3B82F6] focus:bg-white focus:ring-4 focus:ring-[#3B82F6]/10 disabled:cursor-not-allowed disabled:bg-[#F5F6F8]"
                  />

                </div>

              </div>

              <div className="mt-7">

                <div className="flex items-center justify-between gap-4">

                  <label
                    htmlFor="manual-experience-required"
                    className="block text-xs font-semibold text-[#344054]"
                  >
                    Experience required
                  </label>

                  <span className="rounded-full bg-[#F8EAF1] px-2.5 py-1 text-[9px] font-semibold text-[#944668]">
                    Optional
                  </span>

                </div>

                <input
                  id="manual-experience-required"
                  type="text"
                  value={manualExperienceRequired}
                  onChange={(event) =>
                    setManualExperienceRequired(
                      event.target.value
                    )
                  }
                  placeholder="e.g. 0 years, 2-4 years, 5+ years, Fresher"
                  maxLength={100}
                  disabled={loading}
                  className="mt-2.5 h-12 w-full rounded-xl border border-[#D4D9E2] bg-[#FBFCFE] px-4 text-sm text-[#202938] outline-none transition duration-200 placeholder:text-[#A0A7B2] focus:border-[#B85C87] focus:bg-white focus:ring-4 focus:ring-[#B85C87]/10 disabled:cursor-not-allowed disabled:bg-[#F5F6F8]"
                />

              </div>

              <div className="mt-7">

                <div className="flex items-center justify-between gap-4">

                  <label
                    htmlFor="job-description"
                    className="block text-xs font-semibold text-[#344054]"
                  >
                    Job description
                  </label>

                  <span className="rounded-full bg-[#EAF2FF] px-2.5 py-1 text-[9px] font-semibold text-[#2F68C5]">
                    Required
                  </span>

                </div>

                <textarea
                  id="job-description"
                  value={description}
                  onChange={(event) =>
                    setDescription(
                      event.target.value
                    )
                  }
                  placeholder="Add responsibilities, required skills, qualifications, experience, and other role requirements..."
                  rows={12}
                  disabled={loading}
                  className="mt-2.5 w-full resize-none rounded-xl border border-[#D4D9E2] bg-[#FBFCFE] px-4 py-3.5 text-sm leading-7 text-[#202938] outline-none transition duration-200 placeholder:text-[#A0A7B2] focus:border-[#3B82F6] focus:bg-white focus:ring-4 focus:ring-[#3B82F6]/10 disabled:cursor-not-allowed disabled:bg-[#F5F6F8]"
                />

              </div>

              <div className="mt-8 border-t border-[#EEF0F3] pt-6">

                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">

                  <div className="max-w-sm">

                    <div className="flex items-center gap-2">

                      <span className="h-1.5 w-1.5 rounded-full bg-[#3B82F6]" />

                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#98A2B3]">
                        Next stage
                      </p>

                    </div>

                    <p className="mt-1.5 text-xs leading-5 text-[#667085]">
                      The job description will
                      be used for skill extraction.
                    </p>

                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="group/button inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#5658E8] px-5 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(86,88,232,0.17)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#4648C9] disabled:cursor-not-allowed disabled:opacity-50"
                  >

                    <Plus size={15} />

                    {loading
                      ? "Creating..."
                      : "Create Job"}

                    {!loading && (
                      <ArrowRight
                        size={14}
                        className="transition-transform duration-200 group-hover/button:translate-x-1"
                      />
                    )}

                  </button>

                </div>

              </div>

            </form>

          </section>

          {/* =================================================
              UPLOAD
          ================================================= */}
          <section className="group overflow-hidden rounded-[26px] border border-[#DDD7F0] bg-white shadow-[0_14px_38px_rgba(38,40,79,0.045)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_48px_rgba(38,40,79,0.075)]">

            <div className="h-1.5 bg-[#7A61D8]" />

            <div className="border-b border-[#EAECF0] bg-gradient-to-r from-[#FBF9FF] to-white px-7 py-7 sm:px-8">

              <div className="flex items-start gap-4">

                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#F0EBFB] text-[#7A61D8] transition duration-300 group-hover:scale-105">
                  <Upload size={19} />
                </div>

                <div>

                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#7A61D8]">
                    Option 02
                  </p>

                  <h2 className="mt-1.5 text-[20px] font-semibold tracking-[-0.02em] text-[#202938]">
                    Upload job description
                  </h2>

                  <p className="mt-2 max-w-md text-xs leading-6 text-[#667085]">
                    Use an existing PDF or plain-text
                    job description.
                  </p>

                </div>

              </div>

            </div>

            <div className="px-7 py-8 sm:px-8 sm:py-9">

              <label
                htmlFor="job-file"
                className="group/upload flex min-h-[315px] cursor-pointer flex-col items-center justify-center rounded-[20px] border border-dashed border-[#C7C3D8] bg-[#FBFAFE] px-6 py-12 text-center transition duration-300 hover:border-[#7A61D8] hover:bg-[#F8F5FD]"
              >

                <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F0EBFB] text-[#7A61D8] transition duration-300 group-hover/upload:scale-105">

                  <div className="absolute inset-0 rounded-2xl bg-[#C7BAF0]/20 blur-lg" />

                  <Upload
                    size={25}
                    className="relative"
                  />

                </div>

                <p className="mt-6 text-sm font-semibold text-[#202938]">
                  {file
                    ? "Replace selected file"
                    : "Choose a job description"}
                </p>

                <p className="mt-2 max-w-sm text-xs leading-6 text-[#667085]">
                  Click to browse your device.
                  Supported formats are PDF and
                  TXT.
                </p>

                <span className="mt-6 inline-flex items-center gap-2 rounded-xl border border-[#D4D0E4] bg-white px-4 py-2.5 text-xs font-semibold text-[#6754B7] transition duration-200 group-hover/upload:border-[#BDB4DE] group-hover/upload:text-[#7A61D8]">
                  <Upload size={14} />
                  Browse files
                </span>

                <input
                  ref={fileInputRef}
                  id="job-file"
                  type="file"
                  accept=".pdf,.txt,application/pdf,text/plain"
                  onChange={handleFileChange}
                  disabled={loading}
                  className="hidden"
                />

              </label>

              {file && (
                <div className="mt-5 rounded-[18px] border border-[#DCD7EB] bg-[#FBFAFE] p-4">

                  <div className="flex items-center gap-3">

                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F0EBFB] text-[#7A61D8]">
                      <FileText size={18} />
                    </div>

                    <div className="min-w-0 flex-1">

                      <div className="flex items-center gap-2">

                        <p className="truncate text-sm font-semibold text-[#273244]">
                          {file.name}
                        </p>

                        <span className="shrink-0 rounded-full bg-[#E5F7F3] px-2 py-1 text-[8px] font-bold text-[#08786B]">
                          Ready
                        </span>

                      </div>

                      <p className="mt-1 text-[10px] text-[#98A2B3]">
                        {(file.size / 1024).toFixed(1)} KB
                      </p>

                    </div>

                    <button
                      type="button"
                      onClick={handleRemoveFile}
                      disabled={loading}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#7A8492] transition duration-200 hover:bg-[#FFF0F0] hover:text-[#C84C4C] disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Remove selected file"
                    >
                      <X size={15} />
                    </button>

                  </div>

                </div>
              )}

              <div className="mt-7 border-t border-[#EEF0F3] pt-6">

                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">

                  <div className="max-w-sm">

                    <div className="flex items-center gap-2">

                      <span className="h-1.5 w-1.5 rounded-full bg-[#7A61D8]" />

                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#98A2B3]">
                        Automatic processing
                      </p>

                    </div>

                    <p className="mt-1.5 text-xs leading-5 text-[#667085]">
                      The document will be processed
                      into a job description
                      automatically.
                    </p>

                  </div>

                  <button
                    type="button"
                    onClick={handleUpload}
                    disabled={
                      !file || loading
                    }
                    className="group/button inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#7A61D8] px-5 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(122,97,216,0.17)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#654DBD] disabled:cursor-not-allowed disabled:opacity-50"
                  >

                    <Upload size={15} />

                    {loading
                      ? "Uploading..."
                      : "Upload & Create Job"}

                    {!loading && (
                      <ArrowRight
                        size={14}
                        className="transition-transform duration-200 group-hover/button:translate-x-1"
                      />
                    )}

                  </button>

                </div>

              </div>

            </div>

          </section>

        </section>

        {/* =====================================================
            AI JOB DESCRIPTION GENERATION
        ===================================================== */}
        <section className="mt-8 overflow-hidden rounded-[26px] border border-[#D8D6F2] bg-white shadow-[0_14px_38px_rgba(38,40,79,0.045)]">

          <div className="h-1.5 bg-gradient-to-r from-[#5658E8] via-[#7A61D8] to-[#B85C87]" />

          <div className="border-b border-[#EAECF0] bg-gradient-to-r from-[#F8F8FF] via-[#FBFAFE] to-white px-7 py-7 sm:px-8">

            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">

              <div className="flex items-start gap-4">

                <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#ECECFF] text-[#5658E8]">

                  <div className="absolute inset-0 rounded-xl bg-[#5658E8]/10 blur-md" />

                  <Sparkles
                    size={20}
                    className="relative"
                  />

                </div>

                <div>

                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#5658E8]">
                    Option 03
                  </p>

                  <h2 className="mt-1.5 text-[20px] font-semibold tracking-[-0.02em] text-[#202938]">
                    Generate with AI
                  </h2>

                  <p className="mt-2 max-w-2xl text-xs leading-6 text-[#667085]">
                    Provide the role title, required
                    skills, experience, length, and
                    formatting preferences. Evalyn
                    generates an editable description.
                  </p>

                </div>

              </div>

              <div className="hidden rounded-xl border border-[#E4E2F4] bg-white px-4 py-3 lg:block">

                <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#98A2B3]">
                  AI workflow
                </p>

                <p className="mt-1 text-xs font-semibold text-[#5658E8]">
                  Skills + Experience → JD
                </p>

              </div>

            </div>

          </div>

          <div className="grid grid-cols-1 gap-0 lg:grid-cols-[0.9fr_1.1fr]">

            {/* =================================================
                AI INPUTS
            ================================================= */}
            <div className="border-b border-[#EAECF0] px-7 py-8 lg:border-b-0 lg:border-r sm:px-8">

              {/* Job title */}
              <div>

                <label
                  htmlFor="ai-job-title"
                  className="mb-2.5 block text-xs font-semibold text-[#344054]"
                >
                  Job title
                </label>

                <div className="relative">

                  <BriefcaseIcon />

                  <input
                    id="ai-job-title"
                    type="text"
                    value={aiTitle}
                    onChange={(event) =>
                      setAiTitle(
                        event.target.value
                      )
                    }
                    placeholder="e.g. Machine Learning Engineer"
                    disabled={
                      generating ||
                      creatingGeneratedJob
                    }
                    className="h-12 w-full rounded-xl border border-[#D4D9E2] bg-[#FBFCFE] pl-11 pr-4 text-sm text-[#202938] outline-none transition duration-200 placeholder:text-[#A0A7B2] focus:border-[#5658E8] focus:bg-white focus:ring-4 focus:ring-[#5658E8]/10 disabled:cursor-not-allowed disabled:bg-[#F5F6F8]"
                  />

                </div>

              </div>

              {/* Skills */}
              <div className="mt-7">

                <label
                  htmlFor="skill-input"
                  className="mb-2.5 block text-xs font-semibold text-[#344054]"
                >
                  Required skills
                </label>

                <div className="flex gap-2">

                  <input
                    id="skill-input"
                    type="text"
                    value={skillInput}
                    onChange={(event) =>
                      setSkillInput(
                        event.target.value
                      )
                    }
                    onKeyDown={
                      handleSkillInputKeyDown
                    }
                    placeholder="e.g. Python"
                    disabled={
                      generating ||
                      creatingGeneratedJob
                    }
                    className="h-11 min-w-0 flex-1 rounded-xl border border-[#D4D9E2] bg-[#FBFCFE] px-4 text-sm text-[#202938] outline-none transition duration-200 placeholder:text-[#A0A7B2] focus:border-[#7A61D8] focus:bg-white focus:ring-4 focus:ring-[#7A61D8]/10 disabled:cursor-not-allowed disabled:bg-[#F5F6F8]"
                  />

                  <button
                    type="button"
                    onClick={handleAddSkill}
                    disabled={
                      generating ||
                      creatingGeneratedJob ||
                      !skillInput.trim()
                    }
                    className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[#D6D1EB] bg-[#F8F6FD] px-4 text-xs font-semibold text-[#654DBD] transition duration-200 hover:border-[#BEB4E1] hover:bg-[#F3EFFC] disabled:cursor-not-allowed disabled:opacity-50"
                  >

                    <Plus size={14} />

                    Add

                  </button>

                </div>

                <p className="mt-2 text-[10px] leading-5 text-[#98A2B3]">
                  Press Enter or use Add to include
                  a skill.
                </p>

                {aiSkills.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">

                    {aiSkills.map(
                      (skill) => (
                        <div
                          key={skill}
                          className="inline-flex items-center gap-2 rounded-full border border-[#D8D3EA] bg-[#F7F5FD] px-3 py-1.5"
                        >

                          <span className="text-[10px] font-semibold text-[#5548A8]">
                            {skill}
                          </span>

                          <button
                            type="button"
                            onClick={() =>
                              handleRemoveSkill(
                                skill
                              )
                            }
                            disabled={
                              generating ||
                              creatingGeneratedJob
                            }
                            className="text-[#7A8492] transition hover:text-[#C84C4C] disabled:cursor-not-allowed"
                            aria-label={`Remove ${skill}`}
                          >
                            <X size={12} />
                          </button>

                        </div>
                      )
                    )}

                  </div>
                )}

              </div>

              {/* Experience */}
              <div className="mt-7">

                <div className="flex items-center justify-between gap-3">

                  <label
                    htmlFor="experience-required"
                    className="block text-xs font-semibold text-[#344054]"
                  >
                    Experience required
                  </label>

                  <span className="rounded-full bg-[#F8EAF1] px-2.5 py-1 text-[9px] font-semibold text-[#944668]">
                    Required
                  </span>

                </div>

                <input
                  id="experience-required"
                  type="text"
                  value={experienceRequired}
                  onChange={(event) =>
                    setExperienceRequired(
                      event.target.value
                    )
                  }
                  placeholder="e.g. 2-4 years, 5+ years, Fresher"
                  disabled={
                    generating ||
                    creatingGeneratedJob
                  }
                  className="mt-2.5 h-12 w-full rounded-xl border border-[#D4D9E2] bg-[#FBFCFE] px-4 text-sm text-[#202938] outline-none transition duration-200 placeholder:text-[#A0A7B2] focus:border-[#B85C87] focus:bg-white focus:ring-4 focus:ring-[#B85C87]/10 disabled:cursor-not-allowed disabled:bg-[#F5F6F8]"
                />

              </div>

              {/* Generation controls */}
              <div className="mt-7 grid grid-cols-1 gap-5 sm:grid-cols-2">

                <div>

                  <label
                    htmlFor="max-words"
                    className="mb-2.5 block text-xs font-semibold text-[#344054]"
                  >
                    Maximum words
                  </label>

                  <input
                    id="max-words"
                    type="number"
                    min="50"
                    max="2000"
                    step="10"
                    value={maxWords}
                    onChange={(event) =>
                      setMaxWords(
                        event.target.value
                      )
                    }
                    disabled={
                      generating ||
                      creatingGeneratedJob
                    }
                    className="h-11 w-full rounded-xl border border-[#D4D9E2] bg-[#FBFCFE] px-4 text-sm text-[#202938] outline-none transition duration-200 placeholder:text-[#A0A7B2] focus:border-[#5658E8] focus:bg-white focus:ring-4 focus:ring-[#5658E8]/10 disabled:cursor-not-allowed disabled:bg-[#F5F6F8]"
                  />

                  <p className="mt-2 text-[10px] text-[#98A2B3]">
                    Choose between 50 and 2000 words.
                  </p>

                </div>

                <div>

                  <label
                    htmlFor="output-format"
                    className="mb-2.5 block text-xs font-semibold text-[#344054]"
                  >
                    Output format
                  </label>

                  <select
                    id="output-format"
                    value={outputFormat}
                    onChange={(event) =>
                      setOutputFormat(
                        event.target.value
                      )
                    }
                    disabled={
                      generating ||
                      creatingGeneratedJob
                    }
                    className="h-11 w-full rounded-xl border border-[#D4D9E2] bg-[#FBFCFE] px-4 text-sm text-[#202938] outline-none transition duration-200 focus:border-[#5658E8] focus:bg-white focus:ring-4 focus:ring-[#5658E8]/10 disabled:cursor-not-allowed disabled:bg-[#F5F6F8]"
                  >

                    <option value="mixed">
                      Mixed
                    </option>

                    <option value="paragraphs">
                      Paragraphs
                    </option>

                    <option value="bullets">
                      Bullet points
                    </option>

                  </select>

                  <p className="mt-2 text-[10px] text-[#98A2B3]">
                    Controls how the generated JD is
                    structured.
                  </p>

                </div>

              </div>

              {/* Additional instructions */}
              <div className="mt-7">

                <div className="flex items-center justify-between gap-3">

                  <label
                    htmlFor="additional-instructions"
                    className="block text-xs font-semibold text-[#344054]"
                  >
                    Additional instructions
                  </label>

                  <span className="text-[10px] text-[#98A2B3]">
                    {additionalInstructions.length}
                    /1000
                  </span>

                </div>

                <textarea
                  id="additional-instructions"
                  value={additionalInstructions}
                  onChange={(event) =>
                    setAdditionalInstructions(
                      event.target.value
                    )
                  }
                  placeholder="e.g. Keep responsibilities concise and focus on backend development."
                  rows={4}
                  maxLength={1000}
                  disabled={
                    generating ||
                    creatingGeneratedJob
                  }
                  className="mt-2.5 w-full resize-none rounded-xl border border-[#D4D9E2] bg-[#FBFCFE] px-4 py-3 text-sm leading-6 text-[#202938] outline-none transition duration-200 placeholder:text-[#A0A7B2] focus:border-[#7A61D8] focus:bg-white focus:ring-4 focus:ring-[#7A61D8]/10 disabled:cursor-not-allowed disabled:bg-[#F5F6F8]"
                />

                <p className="mt-2 text-[10px] leading-5 text-[#98A2B3]">
                  Formatting and content preference only.
                  Core job requirements remain controlled
                  by the structured fields above.
                </p>

              </div>

              {/* Generate action */}
              <div className="mt-8 border-t border-[#EEF0F3] pt-6">

                <button
                  type="button"
                  onClick={
                    handleGenerateDescription
                  }
                  disabled={
                    generating ||
                    creatingGeneratedJob
                  }
                  className="group/button inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#5658E8] px-5 text-sm font-semibold text-white shadow-[0_12px_25px_rgba(86,88,232,0.17)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#4648C9] disabled:cursor-not-allowed disabled:opacity-50"
                >

                  <Sparkles size={16} />

                  {generating
                    ? "Generating..."
                    : "Generate Job Description"}

                  {!generating && (
                    <ArrowRight
                      size={14}
                      className="transition-transform duration-200 group-hover/button:translate-x-1"
                    />
                  )}

                </button>

                <p className="mt-3 text-center text-[10px] leading-5 text-[#98A2B3]">
                  The generated content remains editable
                  before saving.
                </p>

              </div>

            </div>

            {/* =================================================
                GENERATED DESCRIPTION
            ================================================= */}
            <div className="px-7 py-8 sm:px-8">

              <div className="flex items-start justify-between gap-4">

                <div>

                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#7A61D8]">
                    Generated output
                  </p>

                  <h3 className="mt-1.5 text-base font-semibold text-[#202938]">
                    Job description
                  </h3>

                </div>

                {generatedDescription && (
                  <div className="flex shrink-0 flex-col items-end gap-1.5">

                    <span className="rounded-full bg-[#E5F7F3] px-2.5 py-1 text-[9px] font-semibold text-[#08786B]">
                      Editable
                    </span>

                    <span
                      className={`text-[10px] font-semibold ${
                        generatedWordCount >
                        Number(maxWords)
                          ? "text-[#B42318]"
                          : "text-[#667085]"
                      }`}
                    >
                      {generatedWordCount} /
                      {maxWords || 0} words
                    </span>

                  </div>
                )}

              </div>

              <textarea
                id="generated-description"
                value={generatedDescription}
                onChange={
                  handleGeneratedDescriptionChange
                }
                placeholder="Your generated job description will appear here..."
                rows={18}
                disabled={
                  creatingGeneratedJob
                }
                className="mt-4 w-full resize-none rounded-2xl border border-[#D9D6EA] bg-[#FBFAFE] px-4 py-4 text-sm leading-7 text-[#202938] outline-none transition duration-200 placeholder:text-[#A0A7B2] focus:border-[#7A61D8] focus:bg-white focus:ring-4 focus:ring-[#7A61D8]/10 disabled:cursor-not-allowed disabled:bg-[#F5F6F8]"
              />

              {generatedWordCount >
                Number(maxWords) && (
                <div className="mt-3 rounded-xl border border-[#F0D2D2] bg-[#FFF9F9] px-3.5 py-3 text-xs leading-5 text-[#B42318]">
                  The edited description exceeds the
                  requested word limit. Reduce the content
                  before creating the job.
                </div>
              )}

              <div className="mt-7 border-t border-[#EEF0F3] pt-6">

                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

                  <div>

                    <div className="flex items-center gap-2">

                      <span className="h-1.5 w-1.5 rounded-full bg-[#0F9D8A]" />

                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#98A2B3]">
                        Recruiter review
                      </p>

                    </div>

                    <p className="mt-1.5 text-xs leading-5 text-[#667085]">
                      Review or edit the generated
                      description before saving the job.
                    </p>

                  </div>

                  <button
                    type="button"
                    onClick={
                      handleCreateGeneratedJob
                    }
                    disabled={
                      !generatedDescription.trim() ||
                      creatingGeneratedJob ||
                      generating ||
                      generatedWordCount >
                        Number(maxWords)
                    }
                    className="group/button inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#0F9D8A] px-5 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(15,157,138,0.17)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#08786B] disabled:cursor-not-allowed disabled:opacity-50"
                  >

                    <Plus size={15} />

                    {creatingGeneratedJob
                      ? "Creating..."
                      : "Create Job"}

                    {!creatingGeneratedJob && (
                      <ArrowRight
                        size={14}
                        className="transition-transform duration-200 group-hover/button:translate-x-1"
                      />
                    )}

                  </button>

                </div>

              </div>

            </div>

          </div>

        </section>

        {/* =====================================================
            WORKFLOW EXPLANATION
        ===================================================== */}
        <section className="mt-10 overflow-hidden rounded-[24px] border border-[#DDE1EA] bg-white shadow-[0_10px_30px_rgba(38,40,79,0.035)]">

          <div className="border-b border-[#EAECF0] bg-[#FAFBFD] px-6 py-6 sm:px-7">

            <div className="flex items-center gap-3">

              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E5F7F3] text-[#0F9D8A]">
                <Sparkles size={17} />
              </div>

              <div>

                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#0F9D8A]">
                  Screening workflow
                </p>

                <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-[#344054]">
                  What happens after job creation
                </h2>

              </div>

            </div>

          </div>

          <div className="grid md:grid-cols-3">

            <ProcessStep
              number="01"
              title="Create job"
              description="Define the role using manual entry, an uploaded document, or AI-assisted generation."
              accent="blue"
            />

            <ProcessStep
              number="02"
              title="Review skills"
              description="Continue to AI-assisted skill extraction and recruiter review."
              accent="violet"
            />

            <ProcessStep
              number="03"
              title="Prepare screening"
              description="Move toward role-specific screening question preparation."
              accent="rose"
            />

          </div>

        </section>

        <div className="h-8" />

      </div>
    </RecruiterLayout>
  );
}

/* ============================================================
   BRIEFCASE ICON
============================================================ */

function BriefcaseIcon() {
  return (
    <BriefcaseBusiness
      size={16}
      className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-[#98A2B3]"
    />
  );
}

/* ============================================================
   WORKFLOW DOT
============================================================ */

function WorkflowDot({
  number,
  label,
  background,
  color,
  active = false,
}) {
  return (
    <div className="flex items-center gap-2">

      <div
        className={`flex h-7 w-7 items-center justify-center rounded-lg text-[8px] font-bold ${
          active
            ? "ring-2 ring-[#5658E8]/15"
            : ""
        }`}
        style={{
          backgroundColor: background,
          color,
        }}
      >
        {number}
      </div>

      <span className="text-[9px] font-semibold text-[#667085]">
        {label}
      </span>

    </div>
  );
}

/* ============================================================
   WORKFLOW LINE
============================================================ */

function WorkflowLine() {
  return (
    <div className="h-px w-5 bg-[#DDE1EA]" />
  );
}

/* ============================================================
   PROCESS STEP
============================================================ */

function ProcessStep({
  number,
  title,
  description,
  accent,
}) {
  const styles = {
    blue: {
      background: COLORS.blueLight,
      color: COLORS.blueDark,
    },

    violet: {
      background: COLORS.violetLight,
      color: COLORS.violetDark,
    },

    rose: {
      background: COLORS.roseLight,
      color: COLORS.roseDark,
    },
  };

  const style = styles[accent];

  return (
    <div className="border-b border-[#EAECF0] p-6 last:border-b-0 sm:p-7 md:border-b-0 md:border-r md:last:border-r-0">

      <div className="flex items-start gap-3.5">

        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[9px] font-bold"
          style={{
            backgroundColor:
              style.background,
            color: style.color,
          }}
        >
          {number}
        </div>

        <div>

          <h3 className="text-sm font-semibold text-[#344054]">
            {title}
          </h3>

          <p className="mt-2 text-xs leading-6 text-[#667085]">
            {description}
          </p>

        </div>

      </div>

    </div>
  );
}

export default NewJob;