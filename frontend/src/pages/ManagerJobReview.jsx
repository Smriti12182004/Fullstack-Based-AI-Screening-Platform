import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import RecruiterLayout from "../layouts/RecruiterLayout";

function normalizeSkillItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((skill) => ({
      name: String(skill?.name || "").trim(),
      category:
        skill?.category === "non_technical" ? "non_technical" : "technical",
      is_mandatory: skill?.is_mandatory !== false,
    }))
    .filter((skill) => skill.name);
}

function parseJobDescription(description) {
  const text = String(description || "").replace(/\r\n?/g, "\n").trim();
  if (!text) return [];

  const knownHeadings = new Set([
    "role overview",
    "key responsibilities",
    "responsibilities",
    "required skills",
    "skills required",
    "preferred qualifications",
    "qualifications",
    "required qualifications",
    "about the role",
    "about role",
    "job summary",
    "overview",
    "requirements",
    "what you'll do",
    "what you’ll do",
    "what we're looking for",
    "what we’re looking for",
    "technical skills",
    "experience",
    "education",
    "benefits",
    "job details",
    "summary",
  ]);

  const blocks = [];
  let paragraph = [];
  let bullets = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: "paragraph", text: paragraph.join(" ") });
      paragraph = [];
    }
  };

  const flushBullets = () => {
    if (bullets.length) {
      blocks.push({ type: "list", items: [...bullets] });
      bullets = [];
    }
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushBullets();
      continue;
    }

    const bulletMatch = line.match(/^(?:[•●▪◦*-]|\d+[.)])\s+(.*)$/);
    const headingText = line.replace(/:\s*$/, "").trim();
    const normalizedHeading = headingText.toLowerCase();

    const looksLikeHeading =
      knownHeadings.has(normalizedHeading) ||
      (line.endsWith(":") && line.length <= 80) ||
      (
        headingText.length <= 48 &&
        headingText.split(/\s+/).length <= 6 &&
        /^[A-Z][A-Za-z0-9 /&()'’,-]*$/.test(headingText) &&
        !/[.!?]$/.test(headingText)
      );

    if (looksLikeHeading && !bulletMatch) {
      flushParagraph();
      flushBullets();
      blocks.push({ type: "heading", text: headingText });
      continue;
    }

    if (bulletMatch) {
      flushParagraph();
      bullets.push(bulletMatch[1].trim());
      continue;
    }

    // Preserve wrapped lines that belong to the previous bullet.
    if (bullets.length) {
      bullets[bullets.length - 1] += ` ${line}`;
    } else {
      paragraph.push(line);
    }
  }

  flushParagraph();
  flushBullets();
  return blocks;
}

function ManagerJobReview() {
  const { jobId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [job, setJob] = useState(location.state?.job || null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [draftSkills, setDraftSkills] = useState([]);
  const [newSkillName, setNewSkillName] = useState("");
  const [savingSkills, setSavingSkills] = useState(false);
  const [skillsMessage, setSkillsMessage] = useState("");

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

    return typeof detail === "string" ? detail : fallback;
  };

  const handleUnauthorized = (err) => {
    if (err.response?.status === 401) {
      logout();
      navigate("/login", { replace: true });
      return true;
    }

    return false;
  };

  const loadJob = async (showRefresh = false) => {
    try {
      setError("");

      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const response = await api.get("/question-sets/assigned-jobs");
      const assignedJobs = Array.isArray(response.data)
        ? response.data
        : [];

      const matched = assignedJobs.find(
        (item) => Number(item.id) === Number(jobId)
      );

      if (!matched) {
        setJob(null);
        setError("This job is not assigned to the current Assessment Manager.");
        return;
      }

      const reviewResponse = await api.get(`/jobs/${jobId}/skills/review`);
      const loadedSkills = normalizeSkillItems(reviewResponse.data?.skills);

      setDraftSkills(loadedSkills);
      setJob({
        ...matched,
        skills: loadedSkills,
        skill_review_status:
          reviewResponse.data?.status || matched.skill_review_status || "pending",
      });
    } catch (err) {
      console.error("Failed to load assigned job:", err);

      if (handleUnauthorized(err)) {
        return;
      }

      setError(
        getErrorMessage(
          err,
          "Unable to load the shared job for review."
        )
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadJob();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const skills = draftSkills;

  const reviewStatus = String(
    job?.skill_review_status || "pending"
  ).toLowerCase();

  const statusLabel =
    reviewStatus === "confirmed" ? "HR confirmed" : "Pending confirmation";

  const addSkill = () => {
    const name = newSkillName.trim();

    if (!name) {
      setSkillsMessage("Enter a skill name first.");
      return;
    }
    if (name.length > 100) {
      setSkillsMessage("Skill names must be 100 characters or fewer.");
      return;
    }
    if (skills.some((skill) => skill.name.toLowerCase() === name.toLowerCase())) {
      setSkillsMessage("That skill is already in the list.");
      return;
    }

    setDraftSkills((current) => [
      ...current,
      { name, category: "technical", is_mandatory: true },
    ]);
    setNewSkillName("");
    setSkillsMessage("");
  };

  const updateSkill = (index, changes) => {
    setDraftSkills((current) =>
      current.map((skill, currentIndex) =>
        currentIndex === index ? { ...skill, ...changes } : skill
      )
    );
    setSkillsMessage("");
  };

  const removeSkill = (index) => {
    setDraftSkills((current) =>
      current.filter((_, currentIndex) => currentIndex !== index)
    );
    setSkillsMessage("");
  };

  const saveSkills = async () => {
    if (!job) return;

    const payload = skills.map((skill) => ({
      name: String(skill.name || "").trim(),
      category:
        skill.category === "non_technical" ? "non_technical" : "technical",
      is_mandatory: skill.is_mandatory !== false,
    }));

    if (!payload.length) {
      setSkillsMessage("Add at least one skill before saving.");
      return;
    }
    if (payload.some((skill) => !skill.name)) {
      setSkillsMessage("Complete or remove blank skill names before saving.");
      return;
    }
    if (payload.some((skill) => skill.name.length > 100)) {
      setSkillsMessage("Skill names must be 100 characters or fewer.");
      return;
    }
    if (
      new Set(payload.map((skill) => skill.name.toLowerCase())).size !==
      payload.length
    ) {
      setSkillsMessage("Remove duplicate skill names before saving.");
      return;
    }

    try {
      setSavingSkills(true);
      setSkillsMessage("");

      const response = await api.put(`/jobs/${jobId}/skills/review`, {
        skills: payload,
      });
      const savedSkills = normalizeSkillItems(response.data?.skills ?? payload);

      setDraftSkills(savedSkills);
      setJob((current) =>
        current
          ? {
              ...current,
              skills: savedSkills,
              skill_review_status: response.data?.status || "pending",
            }
          : current
      );
      setSkillsMessage(
        response.data?.status === "confirmed"
          ? "Skills saved. You can continue configuring the assessment."
          : "Skills saved. HR confirmation is now pending so the updated scope can be reviewed."
      );
    } catch (err) {
      console.error("Failed to save assigned-job skills:", err);
      if (handleUnauthorized(err)) return;
      setSkillsMessage(
        getErrorMessage(err, "Unable to save skills for this assigned job.")
      );
    } finally {
      setSavingSkills(false);
    }
  };

  if (loading) {
    return (
      <RecruiterLayout
        title="Job Review"
        breadcrumb="Assessment Manager / Assigned Jobs / Review"
      >
        <main className="mx-auto max-w-[1400px] space-y-6 pb-12">
          <section className="rounded-[22px] border border-[#E3E6EB] bg-white p-8">
            <div className="h-4 w-32 animate-pulse rounded bg-[#EEF2F0]" />
            <div className="mt-4 h-8 w-2/5 animate-pulse rounded bg-[#EEF2F0]" />
            <div className="mt-3 h-4 w-4/5 animate-pulse rounded bg-[#F3F6F4]" />
          </section>
        </main>
      </RecruiterLayout>
    );
  }

  return (
    <RecruiterLayout
      title="Job Review"
      breadcrumb="Assessment Manager / Assigned Jobs / Review"
    >
      <main className="mx-auto max-w-[1400px] space-y-6 pb-12 text-[#202938]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => navigate("/manager/jobs")}
            className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-[#667085] transition hover:text-[#5658E8]"
          >
            <ArrowLeft size={16} />
            Back to Assigned Jobs
          </button>

          <button
            type="button"
            onClick={() => loadJob(true)}
            disabled={refreshing}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#D9DEE7] bg-white px-4 text-xs font-semibold text-[#475467] transition hover:border-[#5658E8] hover:text-[#5658E8] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {error && (
          <div className="rounded-[18px] border border-[#E9C8C8] bg-[#FBF2F2] px-4 py-3 text-sm text-[#A83E3E]">
            {error}
          </div>
        )}

        {job && (
          <>
            <section className="group relative overflow-hidden rounded-[24px] border border-[#E1DDF7] bg-gradient-to-br from-white via-[#FCFBFF] to-[#F1FBF8] p-6 shadow-[0_10px_34px_rgba(86,88,232,0.07)] transition-all duration-500 hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(86,88,232,0.12)] sm:p-8">
          <div
            data-job-header-doodle
            aria-hidden="true"
            className="pointer-events-none absolute bottom-3 right-4 z-0 hidden h-20 w-36 sm:block"
          >
            <div className="absolute bottom-2 right-3 h-12 w-24 rotate-[-8deg] rounded-[18px] border border-[#7862C8]/20 transition-transform duration-700 group-hover:rotate-0" />
            <div className="absolute bottom-4 right-8 h-9 w-20 rotate-[7deg] rounded-xl border border-dashed border-[#0F9D8A]/30 transition-transform duration-700 group-hover:rotate-[12deg]" />
            <div className="absolute bottom-2 right-5 h-10 w-16 rounded-full bg-[#DCD7FF]/35 blur-xl animate-pulse" />
            <Sparkles size={17} className="absolute bottom-8 right-12 text-[#7862C8]/55 animate-pulse" />
            <span className="absolute bottom-3 right-2 h-2 w-2 rounded-full bg-[#0F9D8A]/65 animate-pulse" />
            <span className="absolute bottom-10 right-28 h-1.5 w-1.5 rounded-full bg-[#7862C8]/65 animate-ping" />
            <div className="absolute bottom-5 right-14 h-px w-12 bg-gradient-to-r from-[#7862C8]/40 to-[#0F9D8A]/40" />
          </div>






              <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#EAE5F9] text-[#7862C8]">
                    <BriefcaseBusiness size={24} />
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-[#D9DEE7] bg-[#FAFBFC] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#667085]">
                        Assigned job
                      </span>
                      <span className="rounded-full border border-[#CFE4D9] bg-[#F5FAF7] px-2.5 py-1 text-[10px] font-bold text-[#28734E]">
                        Manager access granted
                      </span>
                    </div>

                    <h1 className="mt-3 text-[30px] font-semibold tracking-[-0.035em] text-[#182033] sm:text-[38px]">
                      {job.title}
                    </h1>

                    <p className="mt-2 max-w-3xl text-sm leading-6 text-[#667085]">
                      Review the HR-provided job description and confirmed skill scope before creating or configuring the assessment.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#E3E6EB] bg-[#FAFBFC] px-3 py-2 text-xs font-semibold text-[#667085]">
                    <CalendarDays size={14} />
                    Job #{job.id}
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#CFE4D9] bg-[#F5FAF7] px-3 py-2 text-xs font-semibold text-[#28734E]">
                    <CheckCircle2 size={14} />
                    {statusLabel}
                  </div>
                </div>
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.75fr)]">
              <section className="relative overflow-hidden rounded-[22px] border border-[#E3E6EB] bg-white shadow-[0_8px_24px_rgba(27,37,58,0.035)] transition-all duration-500 hover:shadow-[0_16px_38px_rgba(86,88,232,0.08)]">

                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute right-5 top-2 z-0 hidden h-24 w-32 opacity-70 sm:block"
                >
                  <div className="absolute right-0 top-1 h-16 w-16 rounded-2xl border border-[#7862C8]/20 rotate-12 transition-transform duration-700 group-hover:rotate-45" />
                  <div className="absolute right-4 top-5 h-10 w-10 rounded-xl border border-dashed border-[#0F9D8A]/30" />
                  <Sparkles size={19} className="absolute right-5 top-4 text-[#7862C8]/50 animate-pulse" />
                  <span className="absolute right-2 top-16 h-1.5 w-1.5 rounded-full bg-[#0F9D8A]/60 animate-pulse" />
                  <span className="absolute right-24 top-12 h-1 w-1 rounded-full bg-[#7862C8]/60 animate-pulse" />
                </div>

                <div className="relative z-10 border-b border-[#EEF0F3] px-6 py-5 sm:px-8">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EAF1FC] text-[#4A61C8]">
                      <FileText size={19} />
                    </div>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#8A94A8]">
                        Job description
                      </p>
                      <h2 className="mt-1 text-xl font-semibold text-[#202938]">
                        HR-provided JD
                      </h2>
                    </div>
                  </div>
                </div>

                <div className="relative z-10 px-6 py-6 sm:px-8 sm:py-8">
                  <div className="rounded-2xl border border-[#EEF0F3] bg-[#FBFCFD] p-5 sm:p-6">
                    {String(job.description || "").trim() ? (
                      <div className="space-y-5 break-words text-sm leading-7 text-[#475467]">
                        {parseJobDescription(job.description).map((block, index) => {
                          if (block.type === "heading") {
                            return (
                              <h3
                                key={`heading-${index}`}
                                className="border-b border-[#E8ECF2] pb-2 pt-1 text-sm font-semibold tracking-wide text-[#202938] first:pt-0"
                              >
                                {block.text}
                              </h3>
                            );
                          }

                          if (block.type === "list") {
                            return (
                              <ul
                                key={`list-${index}`}
                                className="space-y-2.5"
                              >
                                {block.items.map((item, itemIndex) => (
                                  <li
                                    key={`item-${index}-${itemIndex}`}
                                    className="!bg-transparent flex items-start gap-3 rounded-md px-1 py-1 leading-7 text-[#475467]"
                                  >
                                    <span
                                      aria-hidden="true"
                                      className="mt-[0.8em] h-1.5 w-1.5 shrink-0 rounded-full bg-[#8A94A8]"
                                    />
                                    <span className="min-w-0 flex-1 bg-transparent">
                                      {item}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            );
                          }

                          return (
                            <p
                              key={`paragraph-${index}`}
                              className="whitespace-normal leading-7"
                            >
                              {block.text}
                            </p>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm leading-7 text-[#667085]">
                        No job description is available.
                      </p>
                    )}
                  </div>
                </div>
              </section>

              <aside className="space-y-6">
                <section className="group relative overflow-hidden rounded-[22px] border border-[#E3E6EB] bg-white p-6 shadow-[0_8px_24px_rgba(27,37,58,0.035)] transition-all duration-500 hover:shadow-[0_16px_38px_rgba(15,157,138,0.09)]">

                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute right-3 top-2 z-0 h-24 w-24 opacity-60"
                  >
                    <div className="absolute right-0 top-0 h-16 w-16 rounded-full border border-[#0F9D8A]/25" style={{ animation: "spin 32s linear infinite" }} />
                    <div className="absolute right-3 top-3 h-10 w-10 rounded-full border border-dashed border-[#7862C8]/30" />
                    <Sparkles size={17} className="absolute right-5 top-5 text-[#0F9D8A]/70 animate-pulse" />
                    <span className="absolute right-2 top-20 h-1.5 w-1.5 rounded-full bg-[#7862C8]/60 animate-pulse" />
                  </div>

                  <div className="relative z-10 flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E2F3EA] text-[#28734E]">
                      <ShieldCheck size={19} />
                    </div>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#8A94A8]">
                        Skill governance
                      </p>
                      <h2 className="mt-1 text-lg font-semibold text-[#202938]">
                        Confirmed skill scope
                      </h2>
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-[#667085]">
                    These skills came from the HR job workflow. Use them as the assessment scope when configuring sections and question generation.
                  </p>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {skills.length > 0 ? (
                      skills.map((skill) => (
                        <span
                          key={skill.id || skill.name}
                          className="inline-flex items-center gap-2 rounded-full border border-[#DDD6F3] bg-[#FBFAFF] px-3 py-1.5 text-xs font-semibold text-[#5E4DA3]"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-[#7862C8]" />
                          {skill.name}
                        </span>
                      ))
                    ) : (
                      <div className="w-full rounded-xl border border-[#E7DEBF] bg-[#FCFAF1] px-4 py-3 text-xs leading-5 text-[#896C1A]">
                        No skills are currently attached to this assigned job.
                      </div>
                    )}
                  </div>

                  <div className="mt-6 border-t border-[#EEF0F3] pt-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-[#202938]">Manage assigned skills</h3>
                      <span className="rounded-full bg-[#F0EDFF] px-2.5 py-1 text-[10px] font-semibold text-[#5E4DA3]">
                        {skills.length} skills
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-[#667085]">
                      Add or update this assigned job's skill scope. Saving sends changes back for HR confirmation.
                    </p>

                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                      <input
                        type="text"
                        value={newSkillName}
                        maxLength={100}
                        onChange={(event) => setNewSkillName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addSkill();
                          }
                        }}
                        placeholder="Type a skill to add"
                        aria-label="New skill name"
                        className="h-10 min-w-0 flex-1 rounded-lg border border-[#D9DEE7] bg-white px-3 text-sm text-[#202938] outline-none focus:border-[#5658E8] focus:ring-2 focus:ring-[#5658E8]/10"
                      />
                      <button
                        type="button"
                        onClick={addSkill}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#D9D5F5] bg-[#F7F5FF] px-4 text-xs font-semibold text-[#5E4DA3] hover:bg-[#EEEBFF]"
                      >
                        <Plus size={14} />
                        Add Skill
                      </button>
                    </div>

                    <div className="mt-4 space-y-3">
                      {skills.map((skill, index) => (
                        <div
                          key={`${skill.name}-${index}`}
                          className="rounded-xl border border-[#E7E9F0] bg-[#FCFCFE] p-3"
                        >
                          <input
                            type="text"
                            value={skill.name}
                            maxLength={100}
                            onChange={(event) =>
                              updateSkill(index, { name: event.target.value })
                            }
                            aria-label={`Skill ${index + 1} name`}
                            className="h-9 w-full rounded-lg border border-[#D9DEE7] bg-white px-3 text-xs text-[#202938] outline-none focus:border-[#5658E8]"
                          />
                          <div className="mt-2 flex flex-wrap items-center gap-3">
                            <select
                              value={skill.category}
                              onChange={(event) =>
                                updateSkill(index, { category: event.target.value })
                              }
                              aria-label={`Skill ${index + 1} category`}
                              className="h-9 min-w-0 flex-1 rounded-lg border border-[#D9DEE7] bg-white px-2 text-xs text-[#475467]"
                            >
                              <option value="technical">Technical</option>
                              <option value="non_technical">Non-technical</option>
                            </select>
                            <label className="inline-flex items-center gap-2 text-xs text-[#475467]">
                              <input
                                type="checkbox"
                                checked={skill.is_mandatory !== false}
                                onChange={(event) =>
                                  updateSkill(index, {
                                    is_mandatory: event.target.checked,
                                  })
                                }
                                className="h-4 w-4 accent-[#5658E8]"
                              />
                              Mandatory
                            </label>
                            <button
                              type="button"
                              onClick={() => removeSkill(index)}
                              aria-label={`Remove skill ${index + 1}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#A83E3E] hover:bg-[#FBF2F2]"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {skillsMessage && (
                      <div role="status" className="mt-3 rounded-lg border border-[#DAD7F3] bg-[#F8F7FF] px-3 py-2 text-xs leading-5 text-[#51458D]">
                        {skillsMessage}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={saveSkills}
                      disabled={savingSkills}
                      className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#5658E8] px-4 text-xs font-semibold text-white hover:bg-[#4648C9] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Save size={14} />
                      {savingSkills ? "Saving skills..." : "Save Skills"}
                    </button>
                  </div>
                </section>

                <section className="rounded-[22px] border border-[#D9DEE7] bg-[#FAFBFC] p-6">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EAE5F9] text-[#7862C8]">
                      <ClipboardCheck size={19} />
                    </div>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#8A94A8]">
                        Next step
                      </p>
                      <h2 className="mt-1 text-lg font-semibold text-[#202938]">
                        Assessment preparation
                      </h2>
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-[#667085]">
                    Once the JD and skill scope are understood, the next stage is assessment configuration and question-set preparation.
                  </p>

                  <button
                    type="button"
                    onClick={() => navigate("/manager/jobs")}
                    className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#5658E8] px-4 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(86,88,232,0.15)] transition hover:bg-[#494BD8]"
                  >
                    Continue to Assessment Setup
                    <ArrowRight size={14} />
                  </button>
                </section>
              </aside>
            </div>
          </>
        )}
      </main>
    </RecruiterLayout>
  );
}

export default ManagerJobReview;
