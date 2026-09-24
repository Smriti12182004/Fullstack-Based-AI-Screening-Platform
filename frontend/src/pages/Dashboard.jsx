import { useEffect, useState } from "react";

import { NavLink, useNavigate } from "react-router-dom";

import {
  ArrowRight,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronRight,
  FileQuestion,
  MoreHorizontal,
  Plus,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  WandSparkles,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import RecruiterLayout from "../layouts/RecruiterLayout";

const COLORS = {
  dark: "#25264A",
  darkSecondary: "#34366A",
  darkAccent: "#4548A0",

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

  green: "#2E8B62",
  greenLight: "#E9F7EF",

  text: "#1B2430",
  textSecondary: "#667085",
  textMuted: "#98A2B3",

  border: "#E1E4EB",
  background: "#F7F8FC",
};

function Dashboard() {
  const navigate = useNavigate();
  const { auth } = useAuth();

  const [jobs, setJobs] = useState([]);
  const [questionCount, setQuestionCount] = useState(null);

  const [loading, setLoading] = useState(true);
  const [jobsError, setJobsError] = useState(false);
  const [questionsError, setQuestionsError] = useState(false);

  const [extractingSkills, setExtractingSkills] = useState(false);
  const [skillMessage, setSkillMessage] = useState("");
  const [skillSuccess, setSkillSuccess] = useState(false);

  const [currentTime, setCurrentTime] = useState(new Date());

  // ---------------------------------------------------------
  // CLOCK
  // ---------------------------------------------------------
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  // ---------------------------------------------------------
  // GREETING
  // ---------------------------------------------------------
  const getGreeting = () => {
    const hour = currentTime.getHours();

    if (hour >= 5 && hour < 12) {
      return "Good morning";
    }

    if (hour >= 12 && hour < 17) {
      return "Good afternoon";
    }

    return "Good evening";
  };

  const greeting = getGreeting();
  const displayName = auth?.username || "there";

  // ---------------------------------------------------------
  // DASHBOARD DATA
  // ---------------------------------------------------------
  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true);

      const [jobsResult, questionsResult] =
        await Promise.allSettled([
          api.get("/jobs"),
          api.get("/questions"),
        ]);

      if (jobsResult.status === "fulfilled") {
        setJobs(
          Array.isArray(jobsResult.value.data)
            ? jobsResult.value.data
            : []
        );

        setJobsError(false);
      } else {
        console.error(jobsResult.reason);
        setJobsError(true);
      }

      if (questionsResult.status === "fulfilled") {
        const data = Array.isArray(
          questionsResult.value.data
        )
          ? questionsResult.value.data
          : [];

        setQuestionCount(data.length);
        setQuestionsError(false);
      } else {
        console.error(questionsResult.reason);
        setQuestionsError(true);
      }

      setLoading(false);
    };

    loadDashboard();
  }, []);

  // ---------------------------------------------------------
  // CURRENT JOB
  // ---------------------------------------------------------
  const latestJob = jobs[0] ?? null;

  const jobDetailsPath = latestJob
    ? `/jobs/${latestJob.id}`
    : "/jobs";

  const skillsPath = latestJob
    ? `/jobs/${latestJob.id}/skills`
    : "/jobs";

  // ---------------------------------------------------------
  // EXTRACT SKILLS
  // ---------------------------------------------------------
  const handleExtractSkills = async () => {
    if (!latestJob) {
      setSkillSuccess(false);
      setSkillMessage(
        "Create a job before extracting skills."
      );

      return;
    }

    setExtractingSkills(true);
    setSkillMessage("");
    setSkillSuccess(false);

    try {
      await api.post(
        `/jobs/${latestJob.id}/skills/extract`
      );

      setSkillSuccess(true);

      setSkillMessage(
        "Skills extracted successfully. Review the AI suggestions before continuing."
      );
    } catch (error) {
      console.error(error);

      setSkillSuccess(false);

      setSkillMessage(
        error.response?.data?.detail ||
          "Skill extraction failed. Please try again."
      );
    } finally {
      setExtractingSkills(false);
    }
  };

  return (
    <RecruiterLayout
      title="Dashboard"
      breadcrumb="Workspace"
    >
      <div className="mx-auto max-w-[1440px] space-y-11 pb-16">

        {/* =====================================================
            HERO
        ===================================================== */}
        <section className="relative overflow-hidden rounded-[30px] border border-[#40426C] bg-[#25264A] text-white shadow-[0_24px_65px_rgba(37,38,74,0.18)]">

          {/* Dark background layers */}
          <div className="pointer-events-none absolute -right-24 -top-24 h-[360px] w-[360px] rounded-full bg-[#5658E8]/20 blur-[90px]" />

          <div className="pointer-events-none absolute right-[22%] top-[-70px] h-[270px] w-[270px] rounded-full bg-[#7A61D8]/18 blur-[85px]" />

          <div className="pointer-events-none absolute bottom-[-120px] left-[32%] h-[320px] w-[320px] rounded-full bg-[#3B82F6]/10 blur-[100px]" />

          <div className="pointer-events-none absolute bottom-[-80px] right-[16%] h-[220px] w-[220px] rounded-full bg-[#0F9D8A]/10 blur-[80px]" />

          <div className="relative z-10 grid lg:grid-cols-[minmax(0,1fr)_390px]">

            {/* -------------------------------------------------
                HERO CONTENT
            ------------------------------------------------- */}
            <div className="px-7 py-10 sm:px-9 sm:py-12 lg:px-12 lg:py-14">

              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.19em] text-[#E1E4FF]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#8CDCCF]" />
                Evalyn recruiter workspace
              </div>

              <h1 className="mt-7 max-w-[720px] text-[40px] font-semibold leading-[1.03] tracking-[-0.04em] sm:text-[52px]">
                {greeting},{" "}
                <span className="text-[#C9CBFF]">
                  {displayName}.
                </span>
              </h1>

              <p className="mt-6 max-w-[670px] text-sm leading-7 text-[#D8DAEA] sm:text-[15px]">
                Create roles, identify relevant skills, prepare
                screening content, and move each assessment
                through a recruiter-controlled workflow.
              </p>

              {/* Hero tags */}
              <div className="mt-8 flex flex-wrap gap-2.5">

                <HeroTag
                  icon={<Sparkles size={11} />}
                  label="AI-assisted"
                  className="bg-[#7A61D8]/15 text-[#E8E0FF]"
                />

                <HeroTag
                  icon={<Users size={11} />}
                  label="Human-reviewed"
                  className="bg-[#B85C87]/15 text-[#F6DCE9]"
                />

                <HeroTag
                  icon={<Target size={11} />}
                  label="Role-specific"
                  className="bg-[#3B82F6]/15 text-[#DCE9FF]"
                />

                <HeroTag
                  icon={<ShieldCheck size={11} />}
                  label="Controlled"
                  className="bg-[#C58A32]/15 text-[#FFECC4]"
                />

              </div>

              {/* Buttons */}
              <div className="mt-9 flex flex-wrap gap-3">

                <button
                  type="button"
                  onClick={() => navigate("/jobs/new")}
                  className="group inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-[#25264A] shadow-[0_12px_28px_rgba(0,0,0,0.20)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_17px_38px_rgba(0,0,0,0.26)]"
                >
                  <Plus size={17} />

                  Create New Job

                  <ArrowRight
                    size={15}
                    className="transition-transform duration-200 group-hover:translate-x-1"
                  />
                </button>

                <button
                  type="button"
                  onClick={() => navigate("/jobs")}
                  className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-5 text-sm font-semibold text-white transition duration-200 hover:bg-white/[0.11]"
                >
                  Explore Jobs
                  <ArrowRight size={15} />
                </button>

              </div>

              {/* Hero status */}
              <div className="mt-11 grid gap-5 border-t border-white/10 pt-7 sm:grid-cols-3">

                <HeroStatus
                  icon={<CheckCircle2 size={14} />}
                  title="Platform"
                  value="Operational"
                  accent="teal"
                />

                <HeroStatus
                  icon={<Sparkles size={14} />}
                  title="AI services"
                  value="Ready"
                  accent="violet"
                />

                <HeroStatus
                  icon={<Users size={14} />}
                  title="Review"
                  value="Human-led"
                  accent="rose"
                />

              </div>

            </div>

            {/* -------------------------------------------------
                HERO VISUAL
            ------------------------------------------------- */}
            <div className="relative hidden min-h-[390px] lg:block">

              <div className="absolute left-1/2 top-1/2 h-[310px] w-[310px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />

              <div className="absolute left-1/2 top-1/2 h-[235px] w-[235px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />

              <div className="absolute left-1/2 top-1/2 flex h-[150px] w-[150px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-white/[0.07] shadow-[0_30px_65px_rgba(0,0,0,0.22)] backdrop-blur-md">

                <div className="flex h-[94px] w-[94px] items-center justify-center rounded-full bg-gradient-to-br from-[#EEF0FF] via-[#E7EEFF] to-[#F0E9FB] text-[#5757B9] shadow-[0_16px_38px_rgba(0,0,0,0.18)]">
                  <Sparkles
                    size={31}
                    strokeWidth={1.7}
                  />
                </div>

              </div>

              <FloatingHeroCard
                position="left"
                icon={<BriefcaseBusiness size={14} />}
                label="Roles"
                value="Role-specific"
                accent="blue"
              />

              <FloatingHeroCard
                position="right"
                icon={<FileQuestion size={14} />}
                label="Questions"
                value="AI-assisted"
                accent="violet"
              />

              <FloatingHeroCard
                position="bottom"
                icon={<Users size={14} />}
                label="Governance"
                value="Human approval"
                accent="rose"
              />

              <span className="absolute left-[19%] top-[32%] h-2.5 w-2.5 rounded-full bg-[#8BA8FF] shadow-[0_0_18px_rgba(139,168,255,0.65)]" />

              <span className="absolute right-[20%] top-[38%] h-2.5 w-2.5 rounded-full bg-[#C5B8F5] shadow-[0_0_18px_rgba(197,184,245,0.60)]" />

              <span className="absolute bottom-[24%] left-[35%] h-2.5 w-2.5 rounded-full bg-[#7FD6C6] shadow-[0_0_18px_rgba(127,214,198,0.55)]" />

            </div>

          </div>
        </section>

        {/* =====================================================
            SNAPSHOT
        ===================================================== */}
        <section>

          <SectionHeading
            eyebrow="Workspace snapshot"
            title="Your screening workspace"
            description="A quick view of the resources currently available to you."
          />

          <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">

            <Metric
              icon={<BriefcaseBusiness size={19} />}
              label="Jobs"
              value={
                loading || jobsError
                  ? "—"
                  : jobs.length
              }
              description="Role descriptions"
              eyebrow="Workspace"
              accent="blue"
            />

            <Metric
              icon={<FileQuestion size={19} />}
              label="Question Bank"
              value={
                loading || questionsError
                  ? "—"
                  : questionCount
              }
              description="Available questions"
              eyebrow="Content"
              accent="violet"
            />

            <Metric
              icon={<Sparkles size={19} />}
              label="AI Workflow"
              value="Ready"
              description="Skill extraction & generation"
              eyebrow="Intelligence"
              accent="teal"
            />

            <Metric
              icon={<Users size={19} />}
              label="Review Model"
              value="Human"
              description="Recruiter approval"
              eyebrow="Governance"
              accent="rose"
            />

          </div>
        </section>

        {/* =====================================================
            WORKFLOW
        ===================================================== */}
        <section className="overflow-hidden rounded-[28px] border border-[#DDE1EA] bg-white shadow-[0_15px_42px_rgba(38,40,79,0.05)]">

          <div className="border-b border-[#EAECF0] bg-gradient-to-r from-[#FAFBFF] via-[#FBFBFE] to-[#FFFDFC] px-7 py-8 sm:px-8">

            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">

              <div>

                <div className="inline-flex items-center gap-2 rounded-full bg-[#ECECFF] px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-[#5658E8]">
                  <WandSparkles size={11} />
                  Hiring workflow
                </div>

                <h2 className="mt-3 text-[24px] font-semibold tracking-[-0.025em] text-[#1B2430]">
                  From job to assessment
                </h2>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#667085]">
                  Follow the screening journey from role
                  creation through recruiter approval.
                </p>

              </div>

              <div className="flex flex-wrap gap-3">

                <div className="rounded-xl border border-[#E1E4EB] bg-white px-4 py-3">

                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#98A2B3]">
                    Current journey
                  </p>

                  <div className="mt-2 flex items-center gap-3">

                    <div className="h-1.5 w-28 overflow-hidden rounded-full bg-[#ECEEF4]">
                      <div className="h-full w-[40%] rounded-full bg-[#5658E8]" />
                    </div>

                    <span className="text-[10px] font-bold text-[#5658E8]">
                      40%
                    </span>

                  </div>

                </div>

                <button
                  type="button"
                  onClick={() => navigate("/jobs")}
                  className="inline-flex h-[58px] items-center gap-2 rounded-xl border border-[#DDE1EA] bg-white px-4 text-xs font-semibold text-[#475467] transition duration-200 hover:border-[#5658E8] hover:text-[#5658E8]"
                >
                  All Jobs
                  <ArrowRight size={13} />
                </button>

              </div>

            </div>
          </div>

          <div className="p-6 sm:p-7">

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">

              <WorkflowCard
                to={jobDetailsPath}
                number="01"
                title="Job Created"
                status="Complete"
                description="Role and job description are ready."
                accent="blue"
                completed
              />

              <WorkflowCard
                to={jobDetailsPath}
                number="02"
                title="Skills Extracted"
                status="AI-assisted"
                description="Relevant skills are identified from the role."
                accent="violet"
                active
              />

              <WorkflowCard
                to={skillsPath}
                number="03"
                title="Skills Review"
                status="Recruiter review"
                description="Refine and confirm the extracted skill set."
                accent="rose"
              />

              <WorkflowCard
                to="/questions"
                number="04"
                title="Generate Questions"
                status="Pending"
                description="Create role-specific screening content."
                accent="amber"
              />

              <WorkflowCard
                to="/assessments"
                number="05"
                title="Build Assessment"
                status="Pending"
                description="Assemble the candidate assessment."
                accent="teal"
              />

            </div>

            <div className="mt-6 flex flex-col gap-4 rounded-[20px] border border-[#E4E7ED] bg-[#F8F9FC] p-5 lg:flex-row lg:items-center lg:justify-between">

              <div className="flex items-start gap-4">

                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F8EAF1] text-[#B85C87]">
                  <Users size={17} />
                </div>

                <div>

                  <p className="text-xs font-semibold text-[#344054]">
                    Human-in-the-loop by design
                  </p>

                  <p className="mt-1 text-[11px] leading-5 text-[#667085]">
                    AI assists repetitive screening preparation
                    while the recruiter retains control over
                    the final content.
                  </p>

                </div>

              </div>

              {latestJob && (
                <button
                  type="button"
                  onClick={() =>
                    navigate(jobDetailsPath)
                  }
                  className="group inline-flex items-center gap-2 rounded-xl border border-[#DDE1EA] bg-white px-4 py-2.5 text-xs font-semibold text-[#475467] transition duration-200 hover:border-[#5658E8] hover:text-[#5658E8]"
                >
                  <span className="max-w-[240px] truncate">
                    {latestJob.title}
                  </span>

                  <ChevronRight
                    size={14}
                    className="transition-transform duration-200 group-hover:translate-x-0.5"
                  />
                </button>
              )}

            </div>

          </div>
        </section>

        {/* =====================================================
            AI + RECENT JOBS
        ===================================================== */}
        <section className="grid gap-6 xl:grid-cols-[390px_minmax(0,1fr)]">

          {/* ---------------------------------------------------
              AI CONTROL CENTER
          --------------------------------------------------- */}
          <section className="relative overflow-hidden rounded-[28px] border border-[#DDD7F0] bg-white shadow-[0_15px_42px_rgba(38,40,79,0.05)]">

            <div className="h-1.5 bg-[#7A61D8]" />

            <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-[#C9BBF3] blur-[70px] opacity-45" />

            <div className="pointer-events-none absolute -left-20 bottom-0 h-44 w-44 rounded-full bg-[#B9D7FF] blur-[70px] opacity-35" />

            <div className="relative p-7">

              <div className="flex items-start justify-between gap-4">

                <div>

                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#7A61D8]">
                    Intelligence
                  </p>

                  <h2 className="mt-2 text-[23px] font-semibold tracking-[-0.025em] text-[#1B2430]">
                    AI Control Center
                  </h2>

                  <p className="mt-2 text-sm text-[#667085]">
                    Assisted screening operations
                  </p>

                </div>

                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F0EBFB] text-[#7A61D8]">
                  <WandSparkles size={18} />
                </div>

              </div>

              {/* AI status */}
              <div className="mt-7 rounded-[18px] border border-[#E4E7ED] bg-[#FAFBFD] p-4">

                <div className="flex items-center justify-between gap-4">

                  <div className="flex items-center gap-3">

                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E5F7F3] text-[#0F9D8A]">
                      <CheckCircle2 size={17} />
                    </div>

                    <div>

                      <p className="text-xs font-semibold text-[#344054]">
                        AI services ready
                      </p>

                      <p className="mt-0.5 text-[10px] text-[#98A2B3]">
                        Extraction and generation available
                      </p>

                    </div>

                  </div>

                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E9F7EF] px-2.5 py-1.5 text-[9px] font-bold text-[#27734F]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#2E8B62]" />
                    Online
                  </span>

                </div>

              </div>

              {/* AI actions */}
              <div className="mt-6 space-y-3">

                <WorkspaceAction
                  title={
                    extractingSkills
                      ? "Extracting skills..."
                      : "Extract skills"
                  }
                  description={
                    extractingSkills
                      ? "AI is analyzing the latest job description"
                      : "Analyze the latest job description"
                  }
                  onClick={handleExtractSkills}
                  disabled={extractingSkills}
                  accent="teal"
                  icon={<Sparkles size={15} />}
                />

                <WorkspaceAction
                  title="Generate questions"
                  description="Create role-specific screening content"
                  onClick={() => navigate("/questions")}
                  accent="violet"
                  icon={<FileQuestion size={15} />}
                />

                <WorkspaceAction
                  title="Review output"
                  description="Validate AI-generated content"
                  onClick={() => navigate("/questions")}
                  accent="amber"
                  icon={<Check size={15} />}
                />

              </div>

              {/* Skill message */}
              {skillMessage && (
                <div
                  className={`mt-4 rounded-[18px] border px-4 py-3.5 text-xs leading-5 ${
                    skillSuccess
                      ? "border-[#CDE7D9] bg-[#F2FAF5] text-[#176B59]"
                      : "border-[#DDE1EA] bg-[#F8F9FC] text-[#475467]"
                  }`}
                >

                  <div className="flex items-start gap-2.5">

                    <div className="mt-0.5 shrink-0">
                      {skillSuccess ? (
                        <CheckCircle2 size={15} />
                      ) : (
                        <Sparkles size={15} />
                      )}
                    </div>

                    <div className="min-w-0">

                      <p>
                        {skillMessage}
                      </p>

                      {skillSuccess && latestJob && (
                        <button
                          type="button"
                          onClick={() =>
                            navigate(skillsPath)
                          }
                          className="mt-2 font-semibold text-[#5658E8] underline underline-offset-2 hover:no-underline"
                        >
                          Review extracted skills
                        </button>
                      )}

                    </div>

                  </div>

                </div>
              )}

              {/* Latest job */}
              <div className="mt-7 border-t border-[#EAECF0] pt-6">

                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#98A2B3]">
                  Latest job
                </p>

                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      latestJob
                        ? jobDetailsPath
                        : "/jobs"
                    )
                  }
                  className="group mt-3 flex w-full items-center justify-between gap-3 rounded-xl border border-[#E3E6EC] bg-white px-4 py-3.5 text-left transition duration-200 hover:border-[#C2C4EF] hover:shadow-[0_8px_22px_rgba(38,40,79,0.05)]"
                >

                  <div className="min-w-0">

                    <p className="truncate text-xs font-semibold text-[#344054] group-hover:text-[#5658E8]">
                      {latestJob?.title ||
                        "No job created yet"}
                    </p>

                    <p className="mt-1 text-[10px] text-[#98A2B3]">
                      {latestJob
                        ? "Open current role"
                        : "Create your first role"}
                    </p>

                  </div>

                  <ArrowRight
                    size={14}
                    className="shrink-0 text-[#98A2B3] transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-[#5658E8]"
                  />

                </button>

              </div>

            </div>
          </section>

          {/* ---------------------------------------------------
              RECENT JOBS
          --------------------------------------------------- */}
          <section className="overflow-hidden rounded-[28px] border border-[#DDE1EA] bg-white shadow-[0_15px_42px_rgba(38,40,79,0.05)]">

            <div className="flex flex-col gap-4 border-b border-[#EAECF0] bg-[#FAFBFD] px-7 py-7 sm:flex-row sm:items-center sm:justify-between">

              <div className="flex items-center gap-3">

                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EAF2FF] text-[#3B82F6]">
                  <BriefcaseBusiness size={18} />
                </div>

                <div>

                  <h2 className="text-[23px] font-semibold tracking-[-0.025em] text-[#1B2430]">
                    Recent Jobs
                  </h2>

                  <p className="mt-1 text-xs text-[#667085]">
                    Latest roles in your recruiter workspace.
                  </p>

                </div>

              </div>

              <button
                type="button"
                onClick={() => navigate("/jobs")}
                className="inline-flex items-center gap-1.5 self-start rounded-xl border border-[#DDE1EA] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#475467] transition duration-200 hover:border-[#5658E8] hover:text-[#5658E8] sm:self-auto"
              >
                View all
                <ArrowRight size={13} />
              </button>

            </div>

            {loading ? (
              <div className="grid gap-4 p-6 lg:grid-cols-2">

                {[1, 2, 3, 4].map((item) => (
                  <div
                    key={item}
                    className="h-[178px] animate-pulse rounded-[20px] bg-[#F3F4F8]"
                  />
                ))}

              </div>
            ) : jobsError ? (
              <EmptyState
                icon={<BriefcaseBusiness size={24} />}
                title="Unable to load jobs"
                description="Check that the FastAPI backend is running."
              />
            ) : jobs.length === 0 ? (
              <EmptyState
                icon={<BriefcaseBusiness size={24} />}
                title="No jobs yet"
                description="Create your first job description to begin the screening workflow."
                actionLabel="Create Job"
                onAction={() =>
                  navigate("/jobs/new")
                }
              />
            ) : (
              <div className="grid gap-4 p-6 lg:grid-cols-2">

                {jobs
                  .slice(0, 6)
                  .map((job, index) => (
                    <RecentJobCard
                      key={job.id}
                      job={job}
                      index={index}
                      onView={() =>
                        navigate(
                          `/jobs/${job.id}`
                        )
                      }
                    />
                  ))}

              </div>
            )}

          </section>

        </section>

        {/* =====================================================
            PRODUCT PRINCIPLES
        ===================================================== */}
        <section>

          <SectionHeading
            eyebrow="Evalyn principles"
            title="Built around controlled screening"
            description="Different parts of the platform use different visual cues while remaining within the same design system."
          />

          <div className="mt-6 grid gap-5 md:grid-cols-3">

            <PrincipleCard
              icon={<Sparkles size={19} />}
              eyebrow="AI assistance"
              title="Automation with visibility"
              description="AI-assisted actions are clearly represented so recruiters can understand where automation is being used."
              accent="violet"
            />

            <PrincipleCard
              icon={<Users size={19} />}
              eyebrow="Human review"
              title="Recruiter control"
              description="Review remains a first-class stage of the screening workflow before content moves forward."
              accent="rose"
            />

            <PrincipleCard
              icon={<ShieldCheck size={19} />}
              eyebrow="Governance"
              title="Controlled progression"
              description="The workflow moves through defined stages instead of treating screening as one disconnected action."
              accent="amber"
            />

          </div>

        </section>

        {/* =====================================================
            PLATFORM CAPABILITIES
        ===================================================== */}
        <section className="overflow-hidden rounded-[28px] border border-[#DDE1EA] bg-white shadow-[0_12px_36px_rgba(38,40,79,0.045)]">

          <div className="bg-gradient-to-r from-[#F7FAFF] via-[#FBFAFE] to-[#FFF9F4] px-7 py-8 sm:px-8">

            <div className="flex items-start justify-between gap-4">

              <div>

                <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-[#667085] shadow-sm">
                  <Target size={11} />
                  Platform
                </div>

                <h2 className="mt-3 text-[23px] font-semibold tracking-[-0.025em] text-[#1B2430]">
                  One connected screening workspace
                </h2>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#667085]">
                  Role definition, AI assistance, screening
                  content, and recruiter review stay connected
                  within one workflow.
                </p>

              </div>

              <div className="hidden h-12 w-12 items-center justify-center rounded-xl bg-[#ECECFF] text-[#5658E8] sm:flex">
                <Target size={19} />
              </div>

            </div>

          </div>

          <div className="grid md:grid-cols-3">

            <Capability
              number="01"
              title="Role intelligence"
              description="Start with the job description and role-specific requirements."
              accent="blue"
            />

            <Capability
              number="02"
              title="AI assistance"
              description="Accelerate skill extraction and screening-question preparation."
              accent="violet"
            />

            <Capability
              number="03"
              title="Recruiter control"
              description="Review and refine important content before it moves forward."
              accent="rose"
            />

          </div>

        </section>

      </div>
    </RecruiterLayout>
  );
}

/* ============================================================
   SECTION HEADING
============================================================ */

function SectionHeading({
  eyebrow,
  title,
  description,
}) {
  return (
    <div>

      <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#5658E8]">
        {eyebrow}
      </p>

      <h2 className="mt-2 text-[23px] font-semibold tracking-[-0.025em] text-[#1B2430]">
        {title}
      </h2>

      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#667085]">
        {description}
      </p>

    </div>
  );
}

/* ============================================================
   HERO TAG
============================================================ */

function HeroTag({
  icon,
  label,
  className,
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-medium backdrop-blur-sm ${className}`}
    >
      {icon}
      {label}
    </span>
  );
}

/* ============================================================
   HERO STATUS
============================================================ */

function HeroStatus({
  icon,
  title,
  value,
  accent,
}) {
  const accents = {
    teal: "bg-[#E5F7F3] text-[#0F9D8A]",
    violet: "bg-[#F0EBFB] text-[#7A61D8]",
    rose: "bg-[#F8EAF1] text-[#B85C87]",
  };

  return (
    <div className="flex items-center gap-2.5">

      <div
        className={`flex h-8 w-8 items-center justify-center rounded-lg ${accents[accent]}`}
      >
        {icon}
      </div>

      <div>

        <p className="text-[9px] uppercase tracking-[0.13em] text-white/45">
          {title}
        </p>

        <p className="mt-0.5 text-[10px] font-semibold text-white">
          {value}
        </p>

      </div>

    </div>
  );
}

/* ============================================================
   FLOATING HERO CARD
============================================================ */

function FloatingHeroCard({
  position,
  icon,
  label,
  value,
  accent,
}) {
  const accents = {
    blue: "bg-[#EAF2FF] text-[#3B82F6]",
    violet: "bg-[#F0EBFB] text-[#7A61D8]",
    rose: "bg-[#F8EAF1] text-[#B85C87]",
  };

  const positions = {
    left: "left-3 top-[72px]",
    right: "right-3 top-[92px]",
    bottom:
      "bottom-[46px] left-1/2 -translate-x-1/2",
  };

  return (
    <div
      className={`absolute ${positions[position]} rounded-[18px] border border-white/10 bg-white/[0.08] px-4 py-3 backdrop-blur-md shadow-[0_14px_30px_rgba(0,0,0,0.12)]`}
    >

      <div className="flex items-center gap-2.5">

        <span
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${accents[accent]}`}
        >
          {icon}
        </span>

        <div>

          <p className="text-[9px] uppercase tracking-[0.14em] text-white/45">
            {label}
          </p>

          <p className="mt-0.5 whitespace-nowrap text-xs font-semibold text-white">
            {value}
          </p>

        </div>

      </div>

    </div>
  );
}

/* ============================================================
   METRIC
============================================================ */

function Metric({
  icon,
  label,
  value,
  description,
  eyebrow,
  accent,
}) {
  const accents = {
    blue: {
      icon: "bg-[#EAF2FF] text-[#3B82F6]",
      badge: "bg-[#F0F5FF] text-[#2F68C5]",
      line: "bg-[#3B82F6]",
    },

    violet: {
      icon: "bg-[#F0EBFB] text-[#7A61D8]",
      badge: "bg-[#F5F1FD] text-[#654DBD]",
      line: "bg-[#7A61D8]",
    },

    teal: {
      icon: "bg-[#E5F7F3] text-[#0F9D8A]",
      badge: "bg-[#EDF9F6] text-[#08786B]",
      line: "bg-[#0F9D8A]",
    },

    rose: {
      icon: "bg-[#F8EAF1] text-[#B85C87]",
      badge: "bg-[#FCF1F6] text-[#944668]",
      line: "bg-[#B85C87]",
    },
  };

  const style = accents[accent];

  return (
    <div className="group relative overflow-hidden rounded-[22px] border border-[#E1E4EB] bg-white p-6 shadow-[0_10px_28px_rgba(38,40,79,0.035)] transition duration-200 hover:-translate-y-1 hover:border-[#D0D4DE] hover:shadow-[0_16px_34px_rgba(38,40,79,0.08)]">

      <div
        className={`absolute inset-x-0 top-0 h-1 ${style.line}`}
      />

      <div className="flex items-start justify-between gap-3">

        <div
          className={`flex h-11 w-11 items-center justify-center rounded-xl ${style.icon}`}
        >
          {icon}
        </div>

        <span
          className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${style.badge}`}
        >
          {eyebrow}
        </span>

      </div>

      <p className="mt-5 text-xs font-medium text-[#667085]">
        {label}
      </p>

      <p className="mt-1 text-[29px] font-semibold tracking-[-0.035em] text-[#1B2430]">
        {value}
      </p>

      <p className="mt-1 text-[11px] text-[#98A2B3]">
        {description}
      </p>

    </div>
  );
}

/* ============================================================
   WORKFLOW CARD
============================================================ */

function WorkflowCard({
  number,
  title,
  status,
  description,
  accent,
  to,
  completed = false,
  active = false,
}) {
  const accents = {
    blue: {
      icon: "bg-[#EAF2FF] text-[#3B82F6]",
      badge: "bg-[#F0F5FF] text-[#2F68C5]",
      line: "bg-[#3B82F6]",
    },

    violet: {
      icon: "bg-[#F0EBFB] text-[#7A61D8]",
      badge: "bg-[#F5F1FD] text-[#654DBD]",
      line: "bg-[#7A61D8]",
    },

    rose: {
      icon: "bg-[#F8EAF1] text-[#B85C87]",
      badge: "bg-[#FCF1F6] text-[#944668]",
      line: "bg-[#B85C87]",
    },

    amber: {
      icon: "bg-[#FBF2DE] text-[#C58A32]",
      badge: "bg-[#FDF6E7] text-[#9C6A1F]",
      line: "bg-[#C58A32]",
    },

    teal: {
      icon: "bg-[#E5F7F3] text-[#0F9D8A]",
      badge: "bg-[#EDF9F6] text-[#08786B]",
      line: "bg-[#0F9D8A]",
    },
  };

  const style = accents[accent];

  return (
    <NavLink
      to={to}
      className="group block"
      aria-label={`${title}: ${status}`}
    >
      <div
        className={`relative h-full min-h-[185px] overflow-hidden rounded-[20px] border bg-white p-5 transition duration-200 hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(38,40,79,0.08)] ${
          active
            ? "border-[#B9BAF0] shadow-[0_8px_24px_rgba(86,88,232,0.08)]"
            : "border-[#E3E6EC]"
        }`}
      >

        <div
          className={`absolute inset-x-0 top-0 h-1 ${style.line}`}
        />

        <div className="flex items-start justify-between gap-3">

          <div
            className={`flex h-10 w-10 items-center justify-center rounded-xl ${style.icon}`}
          >
            {completed ? (
              <CheckCircle2 size={18} />
            ) : (
              <span className="text-[10px] font-bold">
                {number}
              </span>
            )}
          </div>

          {active && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ECECFF] px-2.5 py-1.5 text-[8px] font-bold uppercase tracking-[0.09em] text-[#5658E8]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#5658E8]" />
              Current
            </span>
          )}

        </div>

        <div className="mt-6">

          <h3 className="text-sm font-semibold text-[#344054] transition-colors duration-200 group-hover:text-[#5658E8]">
            {title}
          </h3>

          <span
            className={`mt-2 inline-flex rounded-full px-2.5 py-1.5 text-[8px] font-bold ${style.badge}`}
          >
            {status}
          </span>

          <p className="mt-3 text-[11px] leading-5 text-[#667085]">
            {description}
          </p>

        </div>

        <ChevronRight
          size={15}
          className="absolute bottom-5 right-5 text-[#98A2B3] opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100"
        />

      </div>
    </NavLink>
  );
}

/* ============================================================
   WORKSPACE ACTION
============================================================ */

function WorkspaceAction({
  title,
  description,
  onClick,
  disabled = false,
  accent,
  icon,
}) {
  const accents = {
    teal: {
      icon: "bg-[#E5F7F3] text-[#0F9D8A]",
      hover: "hover:border-[#9ED7CD]",
    },

    violet: {
      icon: "bg-[#F0EBFB] text-[#7A61D8]",
      hover: "hover:border-[#CFC4EC]",
    },

    amber: {
      icon: "bg-[#FBF2DE] text-[#C58A32]",
      hover: "hover:border-[#E6D1A5]",
    },
  };

  const style = accents[accent];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group flex w-full items-center justify-between rounded-[18px] border border-[#E0E3EA] bg-white p-3.5 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_23px_rgba(38,40,79,0.07)] disabled:cursor-not-allowed disabled:opacity-60 ${style.hover}`}
    >

      <div className="flex min-w-0 items-center gap-3">

        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${style.icon}`}
        >
          {icon}
        </div>

        <div className="min-w-0">

          <p className="text-xs font-semibold text-[#344054]">
            {title}
          </p>

          <p className="mt-0.5 truncate text-[11px] text-[#98A2B3]">
            {description}
          </p>

        </div>

      </div>

      <ChevronRight
        size={16}
        className="ml-3 shrink-0 text-[#98A2B3] transition-transform duration-200 group-hover:translate-x-0.5"
      />

    </button>
  );
}

/* ============================================================
   RECENT JOB CARD
============================================================ */

function RecentJobCard({
  job,
  index,
  onView,
}) {
  const accents = [
    {
      icon: "bg-[#EAF2FF] text-[#3B82F6]",
      line: "bg-[#3B82F6]",
      badge: "bg-[#F0F5FF] text-[#2F68C5]",
    },

    {
      icon: "bg-[#F0EBFB] text-[#7A61D8]",
      line: "bg-[#7A61D8]",
      badge: "bg-[#F5F1FD] text-[#654DBD]",
    },

    {
      icon: "bg-[#E5F7F3] text-[#0F9D8A]",
      line: "bg-[#0F9D8A]",
      badge: "bg-[#EDF9F6] text-[#08786B]",
    },

    {
      icon: "bg-[#F8EAF1] text-[#B85C87]",
      line: "bg-[#B85C87]",
      badge: "bg-[#FCF1F6] text-[#944668]",
    },
  ];

  const style = accents[index % accents.length];

  return (
    <div className="group relative overflow-hidden rounded-[20px] border border-[#E1E4EB] bg-white p-5 transition duration-200 hover:-translate-y-1 hover:border-[#D0D4DE] hover:shadow-[0_15px_32px_rgba(38,40,79,0.07)]">

      <div
        className={`absolute inset-x-0 top-0 h-1 ${style.line}`}
      />

      <div className="flex items-start gap-3">

        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${style.icon}`}
        >
          <BriefcaseBusiness size={17} />
        </div>

        <div className="min-w-0 flex-1">

          <div className="flex items-start justify-between gap-3">

            <div className="min-w-0">

              <p className="truncate text-sm font-semibold text-[#344054] transition-colors group-hover:text-[#5658E8]">
                {job.title}
              </p>

              <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-[#98A2B3]">
                {job.description}
              </p>

            </div>

            <button
              type="button"
              onClick={onView}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#98A2B3] opacity-60 transition duration-200 hover:bg-[#F3F4F8] hover:text-[#5658E8] group-hover:opacity-100"
              aria-label={`More actions for ${job.title}`}
            >
              <MoreHorizontal size={16} />
            </button>

          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">

            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[9px] font-semibold ${style.badge}`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              Job Created
            </span>

            <span className="rounded-full bg-[#F4F5F8] px-2.5 py-1.5 text-[9px] font-medium text-[#667085]">
              {formatDate(job.created_at)}
            </span>

          </div>

          <div className="mt-5 flex items-center justify-between border-t border-[#EEF0F3] pt-3">

            <div className="flex items-center gap-2">

              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#25264A] text-[9px] font-semibold text-white">
                R
              </div>

              <span className="text-[10px] text-[#667085]">
                Recruiter #{job.created_by}
              </span>

            </div>

            <button
              type="button"
              onClick={onView}
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#5658E8] opacity-0 transition-all group-hover:opacity-100"
            >
              Open
              <ArrowRight size={12} />
            </button>

          </div>

        </div>

      </div>

    </div>
  );
}

/* ============================================================
   PRINCIPLE CARD
============================================================ */

function PrincipleCard({
  icon,
  eyebrow,
  title,
  description,
  accent,
}) {
  const accents = {
    violet: {
      icon: "bg-[#F0EBFB] text-[#7A61D8]",
      background: "bg-[#FCFAFF]",
      border: "border-[#E0D8F0]",
      eyebrow: "text-[#7A61D8]",
    },

    rose: {
      icon: "bg-[#F8EAF1] text-[#B85C87]",
      background: "bg-[#FFFBFD]",
      border: "border-[#E8D7E0]",
      eyebrow: "text-[#B85C87]",
    },

    amber: {
      icon: "bg-[#FBF2DE] text-[#C58A32]",
      background: "bg-[#FFFCF7]",
      border: "border-[#E9DDBF]",
      eyebrow: "text-[#9C6A1F]",
    },
  };

  const style = accents[accent];

  return (
    <section
      className={`rounded-[22px] border ${style.border} ${style.background} p-6 shadow-[0_8px_24px_rgba(38,40,79,0.025)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_13px_30px_rgba(38,40,79,0.06)]`}
    >

      <div
        className={`flex h-11 w-11 items-center justify-center rounded-xl ${style.icon}`}
      >
        {icon}
      </div>

      <p
        className={`mt-5 text-[9px] font-bold uppercase tracking-[0.18em] ${style.eyebrow}`}
      >
        {eyebrow}
      </p>

      <h3 className="mt-2 text-[18px] font-semibold tracking-[-0.02em] text-[#344054]">
        {title}
      </h3>

      <p className="mt-2 text-xs leading-6 text-[#667085]">
        {description}
      </p>

    </section>
  );
}

/* ============================================================
   CAPABILITY
============================================================ */

function Capability({
  number,
  title,
  description,
  accent,
}) {
  const accents = {
    blue: {
      number: "bg-[#EAF2FF] text-[#3B82F6]",
      dot: "bg-[#3B82F6]",
    },

    violet: {
      number: "bg-[#F0EBFB] text-[#7A61D8]",
      dot: "bg-[#7A61D8]",
    },

    rose: {
      number: "bg-[#F8EAF1] text-[#B85C87]",
      dot: "bg-[#B85C87]",
    },
  };

  const style = accents[accent];

  return (
    <div className="border-b border-[#EAECF0] p-7 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">

      <div className="flex items-start gap-3">

        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[10px] font-bold ${style.number}`}
        >
          {number}
        </div>

        <div>

          <div className="flex items-center gap-2">

            <h3 className="text-sm font-semibold text-[#344054]">
              {title}
            </h3>

            <span
              className={`h-1.5 w-1.5 rounded-full ${style.dot}`}
            />

          </div>

          <p className="mt-2 text-xs leading-6 text-[#667085]">
            {description}
          </p>

        </div>

      </div>

    </div>
  );
}

/* ============================================================
   EMPTY STATE
============================================================ */

function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}) {
  return (
    <div className="px-6 py-16 text-center">

      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F0EBFB] text-[#7A61D8]">
        {icon}
      </div>

      <p className="mt-5 text-sm font-semibold text-[#344054]">
        {title}
      </p>

      <p className="mx-auto mt-2 max-w-sm text-xs leading-6 text-[#667085]">
        {description}
      </p>

      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#5658E8] px-4 py-2.5 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(86,88,232,0.16)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#4648C9]"
        >
          <Plus size={14} />
          {actionLabel}
        </button>
      )}

    </div>
  );
}

/* ============================================================
   DATE FORMATTER
============================================================ */

function formatDate(value) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleDateString(
    undefined,
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
}

export default Dashboard;