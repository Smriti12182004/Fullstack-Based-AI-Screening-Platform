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

function formatJobDescriptionForDisplay(value) {
  if (value == null) {
    return "";
  }

  let text = String(value)
    .replace(/\r\n?/g, "\n")
    .trim();

  // Remove Markdown code-fence markers while preserving the content.
  text = text.replace(/^\s*```[^\n]*$/gm, "");

  // Render Markdown links as readable text.
  text = text.replace(
    /!?\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_, label, url) =>
      label === url ? url : `${label} (${url})`
  );

  // Remove emphasis and inline-code markers.
  text = text
    .replace(/\*\*([\s\S]+?)\*\*/g, "$1")
    .replace(/__([\s\S]+?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1$2");

  const sourceLines = text.split("\n");
  const formattedLines = [];

  for (const sourceLine of sourceLines) {
    let line = sourceLine.trimEnd();
    const trimmed = line.trim();

    // Remove horizontal separators.
    if (/^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line)) {
      continue;
    }

    // Remove Markdown table divider rows.
    if (
      trimmed &&
      trimmed.startsWith("|") &&
      /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/.test(trimmed)
    ) {
      continue;
    }

    // Convert Markdown headings into ordinary section titles.
    const headingMatch = line.match(
      /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/
    );

    if (headingMatch) {
      const heading = headingMatch[1].trim();

      if (
        formattedLines.length &&
        formattedLines[formattedLines.length - 1] !== ""
      ) {
        formattedLines.push("");
      }

      formattedLines.push(heading);
      formattedLines.push("");
      continue;
    }

    // Convert Markdown table rows into readable text.
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const cells = trimmed
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim())
        .filter(Boolean);

      if (cells.length) {
        line = cells.join(" — ");
      }
    }

    // Use a real bullet character instead of Markdown list prefixes.
    line = line.replace(/^\s*[-*+]\s+/, "• ");

    // Keep numbered lists readable.
    line = line.replace(/^\s*(\d+)[.)]\s+/, "$1. ");

    // Remove Markdown blockquote markers.
    line = line.replace(/^\s*>\s?/, "");

    formattedLines.push(line.trimStart());
  }

  return formattedLines
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function countWords(value) {
  const text = String(value || "").trim();

  return text
    ? text.split(/\s+/).filter(Boolean).length
    : 0;
}

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
  const [creationMethod, setCreationMethod] = useState("");

  // ---------------------------------------------------------
  // AI JOB DESCRIPTION GENERATION
  // ---------------------------------------------------------
  const [aiTitle, setAiTitle] = useState("");
  const [technicalSkillInput, setTechnicalSkillInput] = useState("");
  const [nonTechnicalSkillInput, setNonTechnicalSkillInput] = useState("");
  const [technicalSkills, setTechnicalSkills] = useState([]);
  const [nonTechnicalSkills, setNonTechnicalSkills] = useState([]);
  const [experienceRequired, setExperienceRequired] =
    useState("");

  const getSkillMetadata = (
    currentTechnicalSkills = technicalSkills,
    currentNonTechnicalSkills = nonTechnicalSkills,
  ) => [
    ...currentTechnicalSkills.map((skill) => ({
      name: skill.name,
      category: "technical",
      is_mandatory: skill.is_mandatory,
    })),
    ...currentNonTechnicalSkills.map((skill) => ({
      name: skill.name,
      category: "non_technical",
      is_mandatory: skill.is_mandatory,
    })),
  ];

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
  // AUTOMATIC SKILL EXTRACTION AFTER JOB CREATION
  // ---------------------------------------------------------
  const extractSkillsForCreatedJob = async (jobId) => {
    try {
      const response = await api.post(`/jobs/${jobId}/skills/extract`);

      return {
        success: true,
        error: "",
        skills: Array.isArray(response.data?.skills)
          ? response.data.skills
          : [],
      };
    } catch (err) {
      console.error("Automatic skill extraction failed:", err);

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
          : "Unable to extract skills automatically.";

      return {
        success: false,
        error: message,
        skills: [],
      };
    }
  };

  const saveInitialSkillMetadata = async (jobId, extractedSkills = []) => {
    const selectedSkills = getSkillMetadata();

    if (selectedSkills.length === 0) {
      return;
    }

    const selectedByName = new Map(
      selectedSkills.map((skill) => [
        skill.name.trim().toLowerCase(),
        skill,
      ])
    );

    const mergedSkills = [];
    const seenNames = new Set();

    for (const extractedSkill of extractedSkills) {
      const name = String(extractedSkill?.name || "").trim();
      const key = name.toLowerCase();

      if (!name || seenNames.has(key)) {
        continue;
      }

      const recruiterSelection = selectedByName.get(key);

      if (recruiterSelection) {
        mergedSkills.push({
          ...recruiterSelection,
          name,
        });
      } else {
        const extractionCategory = String(
          extractedSkill?.category || ""
        ).trim().toLowerCase();

        const reviewCategory = String(
          extractedSkill?.review_category || ""
        ).trim().toLowerCase();

        const isNonTechnical = [
          "non_technical",
          "nontechnical",
          "professional skill",
          "soft skill",
          "communication",
          "leadership",
          "teamwork",
          "other",
        ].includes(reviewCategory || extractionCategory);

        mergedSkills.push({
          name,
          category: isNonTechnical ? "non_technical" : "technical",
          is_mandatory: extractedSkill?.is_mandatory ?? true,
        });
      }

      seenNames.add(key);
    }

    // Preserve recruiter-entered skills even if AI extraction did not find them.
    for (const selectedSkill of selectedSkills) {
      const key = selectedSkill.name.trim().toLowerCase();

      if (!seenNames.has(key)) {
        mergedSkills.push(selectedSkill);
        seenNames.add(key);
      }
    }

    await api.put(`/jobs/${jobId}/skills/review`, {
      skills: mergedSkills,
    });
  };

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

    if (manualExperienceRequired.trim().length > 100) {
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

      const extraction = await extractSkillsForCreatedJob(
        createdJob.id
      );

      if (!extraction.success) {
        setError(
          `Job was created successfully, but automatic skill extraction failed. ${extraction.error} You can retry from the Skill Review page.`
        );

        setSuccess("");

        navigate(`/jobs/${createdJob.id}/skills`);
        return;
      }

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

    const fileName = selectedFile.name.toLowerCase();

    const validExtension =
      fileName.endsWith(".pdf") ||
      fileName.endsWith(".txt");

    const validType = allowedTypes.includes(selectedFile.type);

    if (!validType && !validExtension) {
      setFile(null);
      setError("Only PDF and TXT files are supported.");

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

    const fileName = file.name.toLowerCase();

    const validExtension =
      fileName.endsWith(".pdf") ||
      fileName.endsWith(".txt");

    const allowedTypes = [
      "application/pdf",
      "text/plain",
    ];

    const validType = allowedTypes.includes(file.type);

    if (!validType && !validExtension) {
      setError("Only PDF and TXT files are supported.");
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

      const extraction = await extractSkillsForCreatedJob(
        createdJob.id
      );

      if (!extraction.success) {
        setError(
          `Job was created successfully, but automatic skill extraction failed. ${extraction.error} You can retry from the Skill Review page.`
        );

        setSuccess("");

        navigate(`/jobs/${createdJob.id}/skills`);
        return;
      }

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
  // SKILL ENTRY HELPERS
  // ---------------------------------------------------------
  const parseSkillInput = (value) => {
    return value
      .split(/[,\n]+/)
      .map((skill) => skill.trim())
      .filter(Boolean);
  };

  const mergeSkillRecords = (
    existingRecords,
    incomingSkillNames,
    otherCategoryRecords = [],
  ) => {
    const merged = [...existingRecords];

    const seen = new Set(
      [...existingRecords, ...otherCategoryRecords].map((skill) =>
        skill.name.trim().toLowerCase()
      )
    );

    for (const rawSkill of incomingSkillNames) {
      const normalizedSkill = rawSkill.trim();

      if (!normalizedSkill) {
        continue;
      }

      if (normalizedSkill.length > 100) {
        throw new Error(
          `Skill "${normalizedSkill.slice(0, 40)}${normalizedSkill.length > 40 ? "…" : ""}" must be 100 characters or fewer.`
        );
      }

      const key = normalizedSkill.toLowerCase();

      if (seen.has(key)) {
        throw new Error(
          `"${normalizedSkill}" is already in your skills list. Keep each skill in only one category.`
        );
      }

      if (merged.length + otherCategoryRecords.length >= 50) {
        throw new Error("You can add a maximum of 50 skills.");
      }

      merged.push({
        name: normalizedSkill,
        is_mandatory: true,
      });

      seen.add(key);
    }

    return merged;
  };

  const handleAddSkill = (category) => {
    const isTechnical = category === "technical";

    const inputValue = isTechnical
      ? technicalSkillInput
      : nonTechnicalSkillInput;

    const currentSkills = isTechnical
      ? technicalSkills
      : nonTechnicalSkills;

    const otherSkills = isTechnical
      ? nonTechnicalSkills
      : technicalSkills;

    try {
      const parsedSkills = parseSkillInput(inputValue);

      if (parsedSkills.length === 0) {
        return;
      }

      const mergedSkills = mergeSkillRecords(
        currentSkills,
        parsedSkills,
        otherSkills,
      );

      if (isTechnical) {
        setTechnicalSkills(mergedSkills);
        setTechnicalSkillInput("");
      } else {
        setNonTechnicalSkills(mergedSkills);
        setNonTechnicalSkillInput("");
      }

      setError("");
      setSuccess("");
    } catch (error) {
      setError(
        error.message || "Unable to add the selected skill."
      );
      setSuccess("");
    }
  };

  const handleSkillInputKeyDown = (event, category) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAddSkill(category);
    }
  };

  const handleRemoveSkill = (category, skillToRemove) => {
    const setter = category === "technical"
      ? setTechnicalSkills
      : setNonTechnicalSkills;

    setter((currentSkills) =>
      currentSkills.filter(
        (skill) => skill.name !== skillToRemove
      )
    );

    setError("");
    setSuccess("");
  };

  const handleSkillRequirementChange = (
    category,
    skillName,
    requirement,
  ) => {
    const setter = category === "technical"
      ? setTechnicalSkills
      : setNonTechnicalSkills;

    setter((currentSkills) =>
      currentSkills.map((skill) =>
        skill.name === skillName
          ? { ...skill, is_mandatory: requirement === "mandatory" }
          : skill
      )
    );

    setError("");
    setSuccess("");
  };

  // ---------------------------------------------------------
  // GENERATE JOB DESCRIPTION
  // ---------------------------------------------------------
  const handleGenerateDescription = async () => {
    setError("");
    setSuccess("");

    if (!aiTitle.trim()) {
      setError("Please enter a job title for AI generation.");
      return;
    }

    // Allow skill fields to be typed or pasted and submitted directly.
    let generationTechnicalSkills = technicalSkills;
    let generationNonTechnicalSkills = nonTechnicalSkills;

    try {
      const typedTechnicalSkills = parseSkillInput(technicalSkillInput);
      const typedNonTechnicalSkills = parseSkillInput(nonTechnicalSkillInput);

      const typedNonTechnicalRecords = typedNonTechnicalSkills.map((name) => ({
        name,
        is_mandatory: true,
      }));

      generationTechnicalSkills = mergeSkillRecords(
        technicalSkills,
        typedTechnicalSkills,
        [...nonTechnicalSkills, ...typedNonTechnicalRecords],
      );

      generationNonTechnicalSkills = mergeSkillRecords(
        nonTechnicalSkills,
        typedNonTechnicalSkills,
        generationTechnicalSkills,
      );

      if (
        generationTechnicalSkills.length !== technicalSkills.length ||
        generationNonTechnicalSkills.length !== nonTechnicalSkills.length
      ) {
        setTechnicalSkills(generationTechnicalSkills);
        setNonTechnicalSkills(generationNonTechnicalSkills);
        setTechnicalSkillInput("");
        setNonTechnicalSkillInput("");
      }
    } catch (error) {
      setError(
        error.message || "Unable to process the required skills."
      );
      return;
    }

    const generationSkills = [
      ...generationTechnicalSkills,
      ...generationNonTechnicalSkills,
    ].map((skill) => skill.name);

    if (generationSkills.length === 0) {
      setError(
        "Add at least one Technical or Non-technical skill before generating the job description."
      );
      return;
    }

    if (!experienceRequired.trim()) {
      setError("Please enter the required experience.");
      return;
    }

    const parsedMaxWords = Number(maxWords);

    if (
      !Number.isInteger(parsedMaxWords) ||
      parsedMaxWords < 50 ||
      parsedMaxWords > 2000
    ) {
      setError("Maximum words must be between 50 and 2000.");
      return;
    }

    if (additionalInstructions.length > 1000) {
      setError("Additional instructions must be 1000 characters or fewer.");
      return;
    }

    setGenerating(true);

    try {
      const response = await api.post(
        "/jobs/generate-description",
        {
          title: aiTitle.trim(),
          skills: generationSkills,
          experience_required: experienceRequired.trim(),
          max_words: parsedMaxWords,
          output_format: outputFormat,
          additional_instructions:
            additionalInstructions.trim() || null,
        },
        {
          // Local Ollama generation can legitimately take several minutes.
          timeout: 420000,
        }
      );

      // Ensure raw Markdown is never shown to the recruiter.
      const readableDescription = formatJobDescriptionForDisplay(
        response.data.description || ""
      );

      setGeneratedDescription(readableDescription);
      setGeneratedWordCount(countWords(readableDescription));

      setSuccess(
        "Job description generated successfully. Review and edit it before creating the job."
      );
    } catch (err) {
      console.error("Job description generation failed:", err);

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
  const handleGeneratedDescriptionChange = (event) => {
    const newDescription = event.target.value;

    setGeneratedDescription(newDescription);
    setGeneratedWordCount(countWords(newDescription));
  };

  // Normalize any Markdown pasted or typed during editing when focus leaves
  // the editor.
  const handleGeneratedDescriptionBlur = () => {
    const readableDescription = formatJobDescriptionForDisplay(
      generatedDescription
    );

    setGeneratedDescription(readableDescription);
    setGeneratedWordCount(countWords(readableDescription));
  };

  // ---------------------------------------------------------
  // CREATE GENERATED JOB
  // ---------------------------------------------------------
  const handleCreateGeneratedJob = async () => {
    setError("");
    setSuccess("");

    if (!aiTitle.trim()) {
      setError("Please enter a job title.");
      return;
    }

    const readableDescription = formatJobDescriptionForDisplay(
      generatedDescription
    );

    const readableWordCount = countWords(readableDescription);

    if (!readableDescription) {
      setError("Please generate or enter a job description.");
      return;
    }

    if (!experienceRequired.trim()) {
      setError("Please enter the required experience.");
      return;
    }

    if (technicalSkillInput.trim() || nonTechnicalSkillInput.trim()) {
      setError("Click Add for each pending skill before creating the job.");
      return;
    }

    if (getSkillMetadata().length === 0) {
      setError(
        "Add at least one Technical or Non-technical skill before creating the job."
      );
      return;
    }

    if (experienceRequired.trim().length > 100) {
      setError(
        "Experience requirement must be 100 characters or fewer."
      );
      return;
    }

    if (readableWordCount > 2000) {
      setError("The job description cannot exceed 2000 words.");
      return;
    }

    setGeneratedDescription(readableDescription);
    setGeneratedWordCount(readableWordCount);
    setCreatingGeneratedJob(true);

    try {
      const response = await api.post(
        "/jobs",
        {
          title: aiTitle.trim(),
          description: readableDescription,
          experience_required: experienceRequired.trim(),
        }
      );

      const createdJob = response.data;

      const extraction = await extractSkillsForCreatedJob(
        createdJob.id
      );

      let classificationSaveError = "";

      try {
        await saveInitialSkillMetadata(
          createdJob.id,
          extraction.skills,
        );
      } catch (saveError) {
        console.error(
          "Failed to save recruiter-selected skill classifications:",
          saveError,
        );

        classificationSaveError =
          saveError.response?.data?.detail ||
          "Unable to save the selected skill classifications.";
      }

      if (!extraction.success) {
        setError(
          `Job was created successfully, but automatic skill extraction failed. ${extraction.error} ${
            classificationSaveError
              ? `Skill selections also need review: ${classificationSaveError}.`
              : "Your manually selected skills have been saved."
          } You can continue from the Skill Review page.`
        );

        setSuccess("");
        navigate(`/jobs/${createdJob.id}/skills`);
        return;
      }

      if (classificationSaveError) {
        setError(
          `Job and extracted skills were created, but saving the initial skill classifications failed. ${classificationSaveError} You can set them again on the Skill Review page.`
        );

        setSuccess("");
        navigate(`/jobs/${createdJob.id}/skills`);
        return;
      }

      navigate(`/jobs/${createdJob.id}/skills`);
    } catch (err) {
      console.error("Generated job creation failed:", err);

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
        {/* PAGE HEADER */}
        <section className="relative overflow-hidden rounded-[30px] border border-[#DDE1EA] bg-white px-7 py-9 shadow-[0_20px_55px_rgba(38,40,79,0.06)] sm:px-9 sm:py-11 lg:px-11 lg:py-12">
          <div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-[#EAF2FF] blur-[85px] opacity-80" />
          <div className="pointer-events-none absolute right-[16%] top-8 h-32 w-32 rounded-full bg-[#F0EBFB] blur-[42px] opacity-80" />
          <div className="pointer-events-none absolute bottom-[-75px] right-[28%] h-48 w-48 rounded-full bg-[#F8EAF1] blur-[55px] opacity-65" />

          <div className="relative">
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
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
                  Add a job description manually, upload an existing document,
                  or generate one from role-specific skills and experience.
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
                      background={COLORS.blueLight}
                      color={COLORS.blueDark}
                      active
                    />
                    <WorkflowLine />
                    <WorkflowDot
                      number="02"
                      label="Skills"
                      background={COLORS.violetLight}
                      color={COLORS.violetDark}
                    />
                    <WorkflowLine />
                    <WorkflowDot
                      number="03"
                      label="Questions"
                      background={COLORS.roseLight}
                      color={COLORS.roseDark}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* MESSAGES */}
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

        {!creationMethod && (
          <section className="mt-6">
            <div className="mb-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#667085]">
                Start here
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-[#202938]">
                How would you like to create this job?
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#667085]">
                Choose one approach. You can return to this screen without losing your entered details.
              </p>
            </div>

            <div className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
              <button
                type="button"
                onClick={() => {
                  setCreationMethod("manual");
                  setError("");
                  setSuccess("");
                }}
                className="group flex min-h-[240px] flex-col rounded-2xl border-2 border-[#8BB4FA] bg-gradient-to-br from-[#E5EFFF] via-[#F3F8FF] to-white p-6 text-left shadow-[0_12px_30px_rgba(59,130,246,0.15)] transition duration-300 hover:-translate-y-1 hover:border-[#3B82F6] hover:shadow-[0_20px_42px_rgba(59,130,246,0.23)] focus:outline-none focus:ring-4 focus:ring-[#3B82F6]/20"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#3478F6] text-white shadow-lg shadow-blue-500/25 ring-4 ring-[#3B82F6]/10 transition duration-300 group-hover:rotate-3 group-hover:scale-110">
                  <Plus size={19} />
                </span>
                <span className="mt-4 block text-sm font-semibold text-[#202938]">
                  Create manually
                </span>
                <span className="mt-2 block text-xs leading-5 text-[#667085]">
                  Write the job title and description yourself.
                </span>
                <span className="mt-auto inline-flex w-fit items-center gap-2 rounded-xl bg-[#3478F6] px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-500/20 transition duration-200 hover:bg-[#245FCC] hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-[#3B82F6]/25">
                  Enter details <ArrowRight size={13} />
                </span>
              </button>

              <div className="flex items-center justify-center text-[10px] font-bold tracking-widest text-[#98A2B3]">
                <span className="rounded-full border border-[#EAECF0] bg-white px-3 py-1.5">
                  OR
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  setCreationMethod("upload");
                  setError("");
                  setSuccess("");
                }}
                className="group flex min-h-[240px] flex-col rounded-2xl border-2 border-[#B9A5EF] bg-gradient-to-br from-[#EEE7FF] via-[#F7F3FF] to-white p-6 text-left shadow-[0_12px_30px_rgba(122,97,216,0.15)] transition duration-300 hover:-translate-y-1 hover:border-[#7A61D8] hover:shadow-[0_20px_42px_rgba(122,97,216,0.23)] focus:outline-none focus:ring-4 focus:ring-[#7A61D8]/20"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#7955D9] text-white shadow-lg shadow-violet-500/25 ring-4 ring-[#7A61D8]/10 transition duration-300 group-hover:-rotate-3 group-hover:scale-110">
                  <Upload size={19} />
                </span>
                <span className="mt-4 block text-sm font-semibold text-[#202938]">
                  Upload a job description
                </span>
                <span className="mt-2 block text-xs leading-5 text-[#667085]">
                  Use an existing PDF or TXT document.
                </span>
                <span className="mt-auto inline-flex w-fit items-center gap-2 rounded-xl bg-[#7955D9] px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-violet-500/20 transition duration-200 hover:bg-[#6543C2] hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-[#7A61D8]/25">
                  Choose a file <ArrowRight size={13} />
                </span>
              </button>

              <div className="flex items-center justify-center text-[10px] font-bold tracking-widest text-[#98A2B3]">
                <span className="rounded-full border border-[#EAECF0] bg-white px-3 py-1.5">
                  OR
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  setCreationMethod("ai");
                  setError("");
                  setSuccess("");
                }}
                className="group flex min-h-[240px] flex-col rounded-2xl border-2 border-[#A9A0F0] bg-gradient-to-br from-[#EAEAFF] via-[#F8F3FF] to-[#FFF0F7] p-6 text-left shadow-[0_12px_30px_rgba(101,82,220,0.17)] transition duration-300 hover:-translate-y-1 hover:border-[#765BEA] hover:shadow-[0_20px_42px_rgba(101,82,220,0.25)] focus:outline-none focus:ring-4 focus:ring-[#5658E8]/20"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6557E8] to-[#9A58D6] text-white shadow-lg shadow-violet-500/30 ring-4 ring-[#8E7CF5]/15 transition duration-300 group-hover:rotate-3 group-hover:scale-110">
                  <Sparkles size={19} />
                </span>
                <span className="mt-4 block text-sm font-semibold text-[#202938]">
                  Generate with AI
                </span>
                <span className="mt-2 block text-xs leading-5 text-[#667085]">
                  Provide skills and experience to create an editable description.
                </span>
                <span className="mt-auto inline-flex w-fit items-center gap-2 rounded-xl bg-gradient-to-r from-[#6557E8] to-[#9A58D6] px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-violet-500/25 transition duration-200 hover:from-[#5546D4] hover:to-[#8147C4] hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-[#765BEA]/25">
                  Start with AI <ArrowRight size={13} />
                </span>
              </button>
            </div>
          </section>
        )}

        {creationMethod && (
          <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                setCreationMethod("");
                setError("");
                setSuccess("");
              }}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#DDE1EA] bg-white px-4 text-xs font-semibold text-[#475467] transition hover:border-[#A8AFBC] hover:bg-[#FAFBFD] focus:outline-none focus:ring-4 focus:ring-[#5658E8]/10"
            >
              <ArrowLeft size={14} />
              Back to options
            </button>
            <span className="rounded-full border border-[#EAECF0] bg-white px-3 py-1.5 text-[10px] font-semibold text-[#667085]">
              {creationMethod === "manual"
                ? "Manual entry"
                : creationMethod === "upload"
                  ? "Document upload"
                  : "AI-assisted creation"}
            </span>
          </div>
        )}

        {/* CREATION OPTIONS */}
        {(creationMethod === "manual" || creationMethod === "upload") && (
          <section className="mt-10 grid grid-cols-1 gap-7 xl:grid-cols-2">
          {/* MANUAL CREATION */}
          {creationMethod === "manual" && (
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
                    Enter the role details directly into the screening workspace.
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
                    onChange={(event) => setTitle(event.target.value)}
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
                    setManualExperienceRequired(event.target.value)
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
                  onChange={(event) => setDescription(event.target.value)}
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
                      The job description will be used for skill extraction.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="group/button inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#5658E8] px-5 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(86,88,232,0.17)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#4648C9] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus size={15} />
                    {loading ? "Creating..." : "Create Job"}
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
          )}

          {/* UPLOAD */}
          {creationMethod === "upload" && (
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
                    Use an existing PDF or plain-text job description.
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
                  <Upload size={25} className="relative" />
                </div>

                <p className="mt-6 text-sm font-semibold text-[#202938]">
                  {file ? "Replace selected file" : "Choose a job description"}
                </p>

                <p className="mt-2 max-w-sm text-xs leading-6 text-[#667085]">
                  Click to browse your device. Supported formats are PDF and TXT.
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
                      The document will be processed into a job description automatically.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleUpload}
                    disabled={!file || loading}
                    className="group/button inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#7A61D8] px-5 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(122,97,216,0.17)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#654DBD] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Upload size={15} />
                    {loading ? "Uploading..." : "Upload & Create Job"}
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
          )}
        </section>
        )}

        {/* AI JOB DESCRIPTION GENERATION */}
        {creationMethod === "ai" && (
          <section className="mt-8 overflow-hidden rounded-[26px] border border-[#D8D6F2] bg-white shadow-[0_14px_38px_rgba(38,40,79,0.045)]">
          <div className="h-1.5 bg-gradient-to-r from-[#5658E8] via-[#7A61D8] to-[#B85C87]" />

          <div className="border-b border-[#EAECF0] bg-gradient-to-r from-[#F8F8FF] via-[#FBFAFE] to-white px-7 py-7 sm:px-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-4">
                <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#ECECFF] text-[#5658E8]">
                  <div className="absolute inset-0 rounded-xl bg-[#5658E8]/10 blur-md" />
                  <Sparkles size={20} className="relative" />
                </div>

                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#5658E8]">
                    Option 03
                  </p>
                  <h2 className="mt-1.5 text-[20px] font-semibold tracking-[-0.02em] text-[#202938]">
                    Generate with AI
                  </h2>
                  <p className="mt-2 max-w-2xl text-xs leading-6 text-[#667085]">
                    Provide the role title, required skills, experience, length, and formatting preferences. Evalyn generates an editable description.
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
            {/* AI INPUTS */}
            <div className="border-b border-[#EAECF0] px-7 py-8 lg:border-b-0 lg:border-r sm:px-8">
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
                    onChange={(event) => setAiTitle(event.target.value)}
                    placeholder="e.g. Machine Learning Engineer"
                    disabled={generating || creatingGeneratedJob}
                    className="h-12 w-full rounded-xl border border-[#D4D9E2] bg-[#FBFCFE] pl-11 pr-4 text-sm text-[#202938] outline-none transition duration-200 placeholder:text-[#A0A7B2] focus:border-[#5658E8] focus:bg-white focus:ring-4 focus:ring-[#5658E8]/10 disabled:cursor-not-allowed disabled:bg-[#F5F6F8]"
                  />
                </div>
              </div>

              {/* Technical and Non-technical Skills */}
              <div className="mt-7">
                <div className="mb-4">
                  <h3 className="text-xs font-semibold text-[#344054]">
                    Skills for this role
                  </h3>
                  <p className="mt-1.5 text-[10px] leading-5 text-[#98A2B3]">
                    Add technical and non-technical skills separately. Mark each skill as mandatory or optional.
                  </p>
                </div>

                <div className="space-y-4">
                  <SkillInputSection
                    category="technical"
                    title="Technical skills"
                    description="Languages, frameworks, databases, cloud, testing and development tools."
                    placeholder="e.g. Python, FastAPI, PostgreSQL"
                    inputValue={technicalSkillInput}
                    onInputChange={setTechnicalSkillInput}
                    onKeyDown={handleSkillInputKeyDown}
                    onAdd={handleAddSkill}
                    skills={technicalSkills}
                    onRemove={handleRemoveSkill}
                    onRequirementChange={handleSkillRequirementChange}
                    disabled={generating || creatingGeneratedJob}
                  />

                  <SkillInputSection
                    category="non_technical"
                    title="Non-technical skills"
                    description="Communication, collaboration, ownership, leadership and problem-solving."
                    placeholder="e.g. Communication, Teamwork"
                    inputValue={nonTechnicalSkillInput}
                    onInputChange={setNonTechnicalSkillInput}
                    onKeyDown={handleSkillInputKeyDown}
                    onAdd={handleAddSkill}
                    skills={nonTechnicalSkills}
                    onRemove={handleRemoveSkill}
                    onRequirementChange={handleSkillRequirementChange}
                    disabled={generating || creatingGeneratedJob}
                  />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-[#7B8794]">
                  <span className="rounded-full bg-[#FBF2DE] px-2.5 py-1 font-semibold text-[#9C6A1F]">
                    {technicalSkills.filter((skill) => skill.is_mandatory).length + nonTechnicalSkills.filter((skill) => skill.is_mandatory).length} mandatory
                  </span>
                  <span className="rounded-full bg-[#F2F4F7] px-2.5 py-1 font-semibold text-[#475467]">
                    {technicalSkills.filter((skill) => !skill.is_mandatory).length + nonTechnicalSkills.filter((skill) => !skill.is_mandatory).length} optional
                  </span>
                  <span className="ml-auto">
                    {technicalSkills.length + nonTechnicalSkills.length}/50 skills
                  </span>
                </div>
              </div>

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
                  onChange={(event) => setExperienceRequired(event.target.value)}
                  placeholder="e.g. 2-4 years, 5+ years, Fresher"
                  disabled={generating || creatingGeneratedJob}
                  className="mt-2.5 h-12 w-full rounded-xl border border-[#D4D9E2] bg-[#FBFCFE] px-4 text-sm text-[#202938] outline-none transition duration-200 placeholder:text-[#A0A7B2] focus:border-[#B85C87] focus:bg-white focus:ring-4 focus:ring-[#B85C87]/10 disabled:cursor-not-allowed disabled:bg-[#F5F6F8]"
                />
              </div>

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
                    onChange={(event) => setMaxWords(event.target.value)}
                    disabled={generating || creatingGeneratedJob}
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
                    onChange={(event) => setOutputFormat(event.target.value)}
                    disabled={generating || creatingGeneratedJob}
                    className="h-11 w-full rounded-xl border border-[#D4D9E2] bg-[#FBFCFE] px-4 text-sm text-[#202938] outline-none transition duration-200 focus:border-[#5658E8] focus:bg-white focus:ring-4 focus:ring-[#5658E8]/10 disabled:cursor-not-allowed disabled:bg-[#F5F6F8]"
                  >
                    <option value="mixed">Mixed</option>
                    <option value="paragraphs">Paragraphs</option>
                    <option value="bullets">Bullet points</option>
                  </select>
                  <p className="mt-2 text-[10px] text-[#98A2B3]">
                    Controls how the generated JD is structured.
                  </p>
                </div>
              </div>

              <div className="mt-7">
                <div className="flex items-center justify-between gap-3">
                  <label
                    htmlFor="additional-instructions"
                    className="block text-xs font-semibold text-[#344054]"
                  >
                    Additional instructions
                  </label>
                  <span className="text-[10px] text-[#98A2B3]">
                    {additionalInstructions.length}/1000
                  </span>
                </div>

                <textarea
                  id="additional-instructions"
                  value={additionalInstructions}
                  onChange={(event) =>
                    setAdditionalInstructions(event.target.value)
                  }
                  placeholder="e.g. Keep responsibilities concise and focus on backend development."
                  rows={4}
                  maxLength={1000}
                  disabled={generating || creatingGeneratedJob}
                  className="mt-2.5 w-full resize-none rounded-xl border border-[#D4D9E2] bg-[#FBFCFE] px-4 py-3 text-sm leading-6 text-[#202938] outline-none transition duration-200 placeholder:text-[#A0A7B2] focus:border-[#7A61D8] focus:bg-white focus:ring-4 focus:ring-[#7A61D8]/10 disabled:cursor-not-allowed disabled:bg-[#F5F6F8]"
                />

                <p className="mt-2 text-[10px] leading-5 text-[#98A2B3]">
                  Formatting and content preference only. Core job requirements remain controlled by the structured fields above.
                </p>
              </div>

              <div className="mt-8 border-t border-[#EEF0F3] pt-6">
                <button
                  type="button"
                  onClick={handleGenerateDescription}
                  disabled={generating || creatingGeneratedJob}
                  className="group/button inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#5658E8] px-5 text-sm font-semibold text-white shadow-[0_12px_25px_rgba(86,88,232,0.17)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#4648C9] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Sparkles size={16} />
                  {generating ? "Generating..." : "Generate Job Description"}
                  {!generating && (
                    <ArrowRight
                      size={14}
                      className="transition-transform duration-200 group-hover/button:translate-x-1"
                    />
                  )}
                </button>

                <p className="mt-3 text-center text-[10px] leading-5 text-[#98A2B3]">
                  The generated content remains editable before saving.
                </p>
              </div>
            </div>

            {/* GENERATED DESCRIPTION */}
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
                        generatedWordCount > Number(maxWords)
                          ? "text-[#B42318]"
                          : "text-[#667085]"
                      }`}
                    >
                      {generatedWordCount} / {maxWords || 0} words
                    </span>
                  </div>
                )}
              </div>

              <textarea
                id="generated-description"
                value={generatedDescription}
                onChange={handleGeneratedDescriptionChange}
                onBlur={handleGeneratedDescriptionBlur}
                placeholder="Your generated job description will appear here..."
                rows={18}
                disabled={creatingGeneratedJob}
                className="mt-4 w-full resize-none rounded-2xl border border-[#D9D6EA] bg-[#FBFAFE] px-4 py-4 text-sm leading-7 text-[#202938] outline-none transition duration-200 placeholder:text-[#A0A7B2] focus:border-[#7A61D8] focus:bg-white focus:ring-4 focus:ring-[#7A61D8]/10 disabled:cursor-not-allowed disabled:bg-[#F5F6F8]"
              />

              {generatedWordCount > Number(maxWords) && (
                <div className="mt-3 rounded-xl border border-[#F0D2D2] bg-[#FFF9F9] px-3.5 py-3 text-xs leading-5 text-[#B42318]">
                  The edited description exceeds the requested word limit. Reduce the content before creating the job.
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
                      Review or edit the generated description before saving the job.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleCreateGeneratedJob}
                    disabled={
                      !generatedDescription.trim() ||
                      creatingGeneratedJob ||
                      generating ||
                      generatedWordCount > Number(maxWords)
                    }
                    className="group/button inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#0F9D8A] px-5 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(15,157,138,0.17)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#08786B] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus size={15} />
                    {creatingGeneratedJob ? "Creating..." : "Create Job"}
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
        )}

        {/* WORKFLOW EXPLANATION */}
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

/* BRIEFCASE ICON */
function BriefcaseIcon() {
  return (
    <BriefcaseBusiness
      size={16}
      className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-[#98A2B3]"
    />
  );
}

/* WORKFLOW DOT */
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
          active ? "ring-2 ring-[#5658E8]/15" : ""
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

/* WORKFLOW LINE */
function WorkflowLine() {
  return <div className="h-px w-5 bg-[#DDE1EA]" />;
}

/* PROCESS STEP */
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
            backgroundColor: style.background,
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

function SkillInputSection({
  category,
  title,
  description,
  placeholder,
  inputValue,
  onInputChange,
  onKeyDown,
  onAdd,
  skills,
  onRemove,
  onRequirementChange,
  disabled,
}) {
  const isTechnical = category === "technical";

  const colors = isTechnical
    ? {
        border: "border-[#D8D3EA]",
        heading: "text-[#654DBD]",
        badge: "bg-[#F0EBFB] text-[#654DBD]",
        inputFocus: "focus:border-[#7A61D8] focus:ring-[#7A61D8]/10",
        button:
          "border-[#D6D1EB] bg-[#F8F6FD] text-[#654DBD] hover:border-[#BEB4E1] hover:bg-[#F3EFFC]",
        chip: "border-[#D8D3EA] bg-[#F7F5FD]",
        chipText: "text-[#5548A8]",
      }
    : {
        border: "border-[#CDE9E2]",
        heading: "text-[#08786B]",
        badge: "bg-[#E5F7F3] text-[#08786B]",
        inputFocus: "focus:border-[#0F9D8A] focus:ring-[#0F9D8A]/10",
        button:
          "border-[#BFE5DC] bg-[#F1FBF8] text-[#08786B] hover:border-[#91D3C5] hover:bg-[#E5F7F3]",
        chip: "border-[#CDE9E2] bg-[#F1FBF8]",
        chipText: "text-[#08786B]",
      };

  return (
    <section className={`rounded-xl border ${colors.border} bg-white p-3.5 sm:p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className={`text-[11px] font-bold ${colors.heading}`}>
              {title}
            </h4>
            <span
              className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${colors.badge}`}
            >
              {skills.length} added
            </span>
          </div>
          <p className="mt-1.5 text-[10px] leading-5 text-[#98A2B3]">
            {description}
          </p>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => onKeyDown(event, category)}
          placeholder={placeholder}
          maxLength={500}
          disabled={disabled}
          aria-label={`${title} input`}
          className={`h-10 min-w-0 flex-1 rounded-lg border border-[#D4D9E2] bg-[#FBFCFE] px-3 text-xs text-[#202938] outline-none transition ${colors.inputFocus} focus:bg-white focus:ring-4 disabled:cursor-not-allowed disabled:bg-[#F5F6F8]`}
        />
        <button
          type="button"
          onClick={() => onAdd(category)}
          disabled={disabled || !inputValue.trim()}
          className={`inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-3 text-[10px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${colors.button}`}
        >
          <Plus size={13} />
          Add
        </button>
      </div>

      {skills.length > 0 ? (
        <div className="mt-3 space-y-2">
          {skills.map((skill) => (
            <div
              key={`${category}-${skill.name}`}
              className={`flex flex-col gap-2 rounded-lg border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between ${colors.chip}`}
            >
              <span className={`min-w-0 break-words text-[10px] font-semibold ${colors.chipText}`}>
                {skill.name}
              </span>

              <div className="flex shrink-0 items-center gap-2">
                <label
                  className="sr-only"
                  htmlFor={`${category}-${skill.name.replace(/[^a-zA-Z0-9_-]/g, "-")}-requirement`}
                >
                  Requirement for {skill.name}
                </label>
                <select
                  id={`${category}-${skill.name.replace(/[^a-zA-Z0-9_-]/g, "-")}-requirement`}
                  value={skill.is_mandatory ? "mandatory" : "optional"}
                  onChange={(event) =>
                    onRequirementChange(
                      category,
                      skill.name,
                      event.target.value
                    )
                  }
                  disabled={disabled}
                  className="h-8 rounded-md border border-[#D5DCE1] bg-white px-2 text-[10px] font-medium text-[#475467] outline-none focus:border-[#5658E8] focus:ring-2 focus:ring-[#5658E8]/10 disabled:cursor-not-allowed disabled:bg-[#F5F6F8]"
                >
                  <option value="mandatory">Mandatory</option>
                  <option value="optional">Optional</option>
                </select>

                <button
                  type="button"
                  onClick={() => onRemove(category, skill.name)}
                  disabled={disabled}
                  aria-label={`Remove ${skill.name} from ${title}`}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-[#7A8492] transition hover:bg-[#FFF1F1] hover:text-[#C84C4C] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-lg bg-[#F8F9FB] px-3 py-2.5 text-[10px] text-[#98A2B3]">
          No {isTechnical ? "technical" : "non-technical"} skills added yet.
        </p>
      )}
    </section>
  );
}

export default NewJob;