import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Archive,
  CheckCircle2,
  ClipboardCheck,
  FileQuestion,
  FileCheck2,
  History,
  BriefcaseBusiness,
  CalendarDays,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  WandSparkles,
  Clock3,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import RecruiterLayout from "../layouts/RecruiterLayout";


const ROLE_CONFIG = {
  assessment_manager: {
    workspaceLabel: "Evalyn Assessment Manager Workspace",
    title: "Assessment Manager",
    description:
      "Prepare role-specific assessment sets, manage reusable question content, and send sets through reviewer approval.",

    heroTags: [
      {
        icon: <Sparkles size={11} />,
        label: "AI-assisted",
        className: "bg-[#7A61D8]/15 text-[#E8E0FF]",
      },
      {
        icon: <Archive size={11} />,
        label: "Year-specific",
        className: "bg-[#AA5E9C]/15 text-[#F6DCE9]",
      },
      {
        icon: <Target size={11} />,
        label: "Role-specific",
        className: "bg-[#3B82F6]/15 text-[#DCE9FF]",
      },
      {
        icon: <ShieldCheck size={11} />,
        label: "Human-reviewed",
        className: "bg-[#C58A32]/15 text-[#FFECC4]",
      },
    ],

    heroDescription:
      "Turn confirmed job requirements into traceable question content and assessment sets ready for reviewer approval.",

    statuses: [
      {
        icon: <CheckCircle2 size={14} />,
        title: "Assessment Sets",
        value: "Ready",
        accent: "teal",
      },
      {
        icon: <Sparkles size={14} />,
        title: "AI Generation",
        value: "Ready",
        accent: "violet",
      },
      {
        icon: <Users size={14} />,
        title: "Governance",
        value: "Reviewer-led",
        accent: "rose",
      },
    ],

    cards: [
      {
        icon: <Archive size={19} />,
        eyebrow: "Content",
        label: "Assessment Sets",
        description: "Assessment sets for reviewer approval",
        accent: "blue",
        key: "banks",
        doodle: <Archive size={72} strokeWidth={1.2} />,
      },
      {
        icon: <FileQuestion size={19} />,
        eyebrow: "Library",
        label: "Questions",
        description: "Available screening content",
        accent: "violet",
        key: "questions",
        doodle: <FileQuestion size={72} strokeWidth={1.2} />,
      },
      {
        icon: <ClipboardCheck size={19} />,
        eyebrow: "Review",
        label: "Pending Review",
        description: "Questions awaiting approval",
        accent: "rose",
        key: "pending",
        doodle: <Clock3 size={70} strokeWidth={1.2} />,
      },
      {
        icon: <CheckCircle2 size={19} />,
        eyebrow: "Quality",
        label: "Approved",
        description: "Approved questions",
        accent: "teal",
        key: "approved",
        doodle: <ShieldCheck size={72} strokeWidth={1.2} />,
      },
    ],

    actions: [
      {
        icon: <Archive size={16} />,
        title: "Open Assessment Sets",
        description: "Prepare and hand off assessment sets for review",
        path: "/question-banks",
        accent: "violet",
      },
      {
        icon: <FileQuestion size={16} />,
        title: "Open Question Library",
        description: "Create and manage screening questions",
        path: "/questions",
        accent: "teal",
      },
    ],

    workflowTitle: "From confirmed skills to assessment content",
    workflowDescription:
      "Manage the content preparation stage before a reviewer makes the final quality decision.",
    workflow: [
      {
        number: "01",
        title: "Prepare Sets",
        status: "Ready",
        description:
          "Open the question bank for the current hiring cycle.",
        accent: "blue",
        path: "/question-banks",
      },
      {
        number: "02",
        title: "Question Preparation",
        status: "Manager",
        description:
          "Create, edit, and generate role-specific questions.",
        accent: "violet",
        path: "/questions",
      },
      {
        number: "03",
        title: "Version History",
        status: "Tracked",
        description:
          "Maintain content history as questions evolve.",
        accent: "rose",
        path: "/questions",
      },
      {
        number: "04",
        title: "Review Queue",
        status: "Reviewer",
        description:
          "Questions move to independent reviewer validation.",
        accent: "amber",
        path: "/review",
      },
      {
        number: "05",
        title: "Assessment Build",
        status: "Next",
        description:
          "Approved content can be assembled into assessments.",
        accent: "teal",
        path: "/questions",
      },
    ],
  },

  assessment_reviewer: {
    workspaceLabel: "Evalyn Assessment Reviewer Workspace",
    title: "Assessment Reviewer",
    description:
      "Review screening content, inspect version history, and maintain the independent quality gate before assessments move forward.",

    heroTags: [
      {
        icon: <ShieldCheck size={11} />,
        label: "Independent review",
        className: "bg-[#C58A32]/15 text-[#FFECC4]",
      },
      {
        icon: <Archive size={11} />,
        label: "Historical context",
        className: "bg-[#AA5E9C]/15 text-[#F6DCE9]",
      },
      {
        icon: <ClipboardCheck size={11} />,
        label: "Quality gate",
        className: "bg-[#B85C87]/15 text-[#F6DCE9]",
      },
      {
        icon: <History size={11} />,
        label: "Version-aware",
        className: "bg-[#7A61D8]/15 text-[#E8E0FF]",
      },
    ],

    heroDescription:
      "Review annual question-bank content, validate questions, inspect historical versions, and make the independent approval or rejection decision.",

    statuses: [
      {
        icon: <ClipboardCheck size={14} />,
        title: "Review Queue",
        value: "Active",
        accent: "teal",
      },
      {
        icon: <Archive size={14} />,
        title: "Assessment Sets",
        value: "Traceable",
        accent: "violet",
      },
      {
        icon: <ShieldCheck size={14} />,
        title: "Governance",
        value: "Independent",
        accent: "rose",
      },
    ],

    cards: [
      {
        icon: <Archive size={19} />,
        eyebrow: "Content",
        label: "Assessment Sets",
        description: "Assessment sets for reviewer approval",
        accent: "blue",
        key: "banks",
        doodle: <Archive size={72} strokeWidth={1.2} />,
      },
      {
        icon: <ClipboardCheck size={19} />,
        eyebrow: "Queue",
        label: "Pending Review",
        description: "Questions awaiting your decision",
        accent: "rose",
        key: "pending",
        doodle: <Clock3 size={70} strokeWidth={1.2} />,
      },
      {
        icon: <CheckCircle2 size={19} />,
        eyebrow: "Quality",
        label: "Approved",
        description: "Questions approved",
        accent: "teal",
        key: "approved",
        doodle: <ShieldCheck size={72} strokeWidth={1.2} />,
      },
      {
        icon: <FileQuestion size={19} />,
        eyebrow: "Library",
        label: "All Questions",
        description: "Reviewable screening content",
        accent: "violet",
        key: "questions",
        doodle: <FileQuestion size={72} strokeWidth={1.2} />,
      },
    ],

    actions: [
      {
        icon: <ClipboardCheck size={16} />,
        title: "Open Review Queue",
        description: "Review and decide on pending questions",
        path: "/review",
        accent: "violet",
      },
      {
        icon: <Archive size={16} />,
        title: "Open Assessment Sets",
        description: "Review assessment-set context for reviewer approval",
        path: "/question-banks",
        accent: "teal",
      },
    ],

    workflowTitle: "Independent content-quality workflow",
    workflowDescription:
      "The reviewer receives prepared content and makes the independent quality decision before assessment assembly continues.",
    workflow: [
      {
        number: "01",
        title: "Question Bank",
        status: "Context",
        description:
          "Inspect the annual bank and hiring-cycle content.",
        accent: "blue",
        path: "/question-banks",
      },
      {
        number: "02",
        title: "Pending Review",
        status: "Active",
        description:
          "Open questions waiting for reviewer action.",
        accent: "violet",
        path: "/review",
      },
      {
        number: "03",
        title: "Validation",
        status: "Automated",
        description:
          "Check structure, skill mapping, difficulty, and answer keys.",
        accent: "rose",
        path: "/review",
      },
      {
        number: "04",
        title: "Decision",
        status: "Human",
        description:
          "Approve or reject with recorded review information.",
        accent: "amber",
        path: "/review",
      },
      {
        number: "05",
        title: "Assessment Build",
        status: "Next",
        description:
          "Approved questions become eligible for assembly.",
        accent: "teal",
        path: "/review",
      },
    ],
  },
};


function RoleDashboard() {
  const navigate = useNavigate();
  const { auth, logout } = useAuth();

  const role =
    auth?.role || "assessment_manager";

  const config =
    ROLE_CONFIG[role] ||
    ROLE_CONFIG.assessment_manager;

  const [currentTime, setCurrentTime] =
    useState(new Date());

  const [questionBanks, setQuestionBanks] =
    useState([]);

  const [questions, setQuestions] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [dataError, setDataError] =
    useState(false);

  const [assignedJobs, setAssignedJobs] =
    useState([]);

  const [assignedJobsLoading, setAssignedJobsLoading] =
    useState(true);


  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);


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

  const displayName = auth?.full_name?.trim() || auth?.username || "there";


  useEffect(() => {
    let cancelled = false;

    const loadDashboardData = async () => {
      setLoading(true);
      setDataError(false);
      setAssignedJobsLoading(true);

      const [
        questionBanksResult,
        questionsResult,
        assignedJobsResult,
      ] = await Promise.allSettled([
        api.get("/question-banks"),
        api.get("/questions"),
        role === "assessment_manager"
          ? api.get("/question-sets/assigned-jobs")
          : Promise.resolve({ data: [] }),
      ]);

      if (cancelled) {
        return;
      }

      let hasError = false;

      if (questionBanksResult.status === "fulfilled") {
        setQuestionBanks(
          Array.isArray(questionBanksResult.value.data)
            ? questionBanksResult.value.data
            : []
        );
      } else {
        console.error(
          "Failed to load question banks:",
          questionBanksResult.reason
        );
        hasError = true;
      }

      if (questionsResult.status === "fulfilled") {
        setQuestions(
          Array.isArray(questionsResult.value.data)
            ? questionsResult.value.data
            : []
        );
      } else {
        console.error(
          "Failed to load questions:",
          questionsResult.reason
        );
        hasError = true;
      }

      if (assignedJobsResult.status === "fulfilled") {
        setAssignedJobs(
          Array.isArray(assignedJobsResult.value.data)
            ? assignedJobsResult.value.data
            : []
        );
      } else if (role === "assessment_manager") {
        console.error(
          "Failed to load assigned jobs:",
          assignedJobsResult.reason
        );
      }

      const unauthorized = [
        questionBanksResult,
        questionsResult,
        assignedJobsResult,
      ].some(
        (result) =>
          result.status === "rejected" &&
          (result.reason?.response?.status === 401 ||
            result.reason?.response?.status === 403)
      );

      if (unauthorized) {
        logout();
        navigate("/login", {
          replace: true,
        });
        return;
      }

      setDataError(hasError);
      setLoading(false);
      setAssignedJobsLoading(false);
    };

    loadDashboardData();

    return () => {
      cancelled = true;
    };
  }, [role]);

  const pendingCount =
    useMemo(
      () =>
        questions.filter(
          (question) =>
            question.status ===
            "pending_review"
        ).length,
      [questions]
    );


  const approvedCount =
    useMemo(
      () =>
        questions.filter(
          (question) =>
            question.status === "approved"
        ).length,
      [questions]
    );


  const metricValues = {
    banks:
      loading
        ? "—"
        : questionBanks.length,

    questions:
      loading
        ? "—"
        : questions.length,

    pending:
      loading
        ? "—"
        : pendingCount,

    approved:
      loading
        ? "—"
        : approvedCount,
  };


  const getMetricAccent = (accent) => {
    const accents = {
      blue: {
        icon:
          "bg-[#EAF2FF] text-[#3B82F6]",
        badge:
          "bg-[#F0F5FF] text-[#2F68C5]",
        doodle:
          "text-[#6D9EF4]",
      },

      violet: {
        icon:
          "bg-[#F0EBFB] text-[#7A61D8]",
        badge:
          "bg-[#F5F1FD] text-[#654DBD]",
        doodle:
          "text-[#9586D7]",
      },

      teal: {
        icon:
          "bg-[#E5F7F3] text-[#0F9D8A]",
        badge:
          "bg-[#EDF9F6] text-[#08786B]",
        doodle:
          "text-[#68BDB1]",
      },

      rose: {
        icon:
          "bg-[#F8EAF1] text-[#B85C87]",
        badge:
          "bg-[#FCF1F6] text-[#944668]",
        doodle:
          "text-[#D28BAA]",
      },
    };

    return accents[accent] ||
      accents.blue;
  };


  return (
    <RecruiterLayout
      title={`${config.title} Dashboard`}
      breadcrumb="Workspace / Dashboard"
    >
      <div className="mx-auto max-w-[1440px] space-y-11 pb-16">

        {/* =====================================================
            HERO
        ===================================================== */}

        <section className="relative overflow-hidden rounded-[30px] border border-[#40426C] bg-[#25264A] text-white shadow-[0_24px_65px_rgba(37,38,74,0.18)]">

          <div className="pointer-events-none absolute -right-24 -top-24 h-[360px] w-[360px] rounded-full bg-[#5658E8]/20 blur-[90px]" />

          <div className="pointer-events-none absolute right-[22%] top-[-70px] h-[270px] w-[270px] rounded-full bg-[#7A61D8]/18 blur-[85px]" />

          <div className="pointer-events-none absolute bottom-[-120px] left-[32%] h-[320px] w-[320px] rounded-full bg-[#3B82F6]/10 blur-[100px]" />

          <div className="pointer-events-none absolute bottom-[-80px] right-[16%] h-[220px] w-[220px] rounded-full bg-[#0F9D8A]/10 blur-[80px]" />


          <div className="relative z-10 grid lg:grid-cols-[minmax(0,1fr)_390px]">

            {/* HERO CONTENT */}

            <div className="px-7 py-10 sm:px-9 sm:py-12 lg:px-12 lg:py-14">

              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.19em] text-[#E1E4FF]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#8CDCCF]" />

                {config.workspaceLabel}
              </div>


              <h1 className="mt-7 max-w-[720px] text-[40px] font-semibold leading-[1.03] tracking-[-0.04em] sm:text-[52px]">

                {greeting},{" "}

                <span className="text-[#C9CBFF]">
                  {displayName}.
                </span>

              </h1>


              <p className="mt-6 max-w-[670px] text-sm leading-7 text-[#D8DAEA] sm:text-[15px]">
                {config.heroDescription}
              </p>


              <div className="mt-8 flex flex-wrap gap-2.5">

                {config.heroTags.map(
                  (tag) => (
                    <HeroTag
                      key={tag.label}
                      icon={tag.icon}
                      label={tag.label}
                      className={tag.className}
                    />
                  )
                )}

              </div>


              <div className="mt-9 flex flex-wrap gap-3">

                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      config.actions[0].path
                    )
                  }
                  className="group inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-[#25264A] shadow-[0_12px_28px_rgba(0,0,0,0.20)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_17px_38px_rgba(0,0,0,0.26)]"
                >
                  <Sparkles size={16} />

                  {config.actions[0].title}

                  <ArrowRight
                    size={15}
                    className="transition-transform duration-200 group-hover:translate-x-1"
                  />
                </button>


                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      config.actions[1].path
                    )
                  }
                  className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-5 text-sm font-semibold text-white transition duration-200 hover:bg-white/[0.11]"
                >
                  {config.actions[1].title}

                  <ArrowRight size={15} />
                </button>

              </div>


              <div className="mt-11 grid gap-5 border-t border-white/10 pt-7 sm:grid-cols-3">

                {config.statuses.map(
                  (item) => (
                    <HeroStatus
                      key={item.title}
                      icon={item.icon}
                      title={item.title}
                      value={item.value}
                      accent={item.accent}
                    />
                  )
                )}

              </div>

            </div>


            {/* HERO VISUAL */}

            <div className="relative hidden min-h-[390px] lg:block">

              <div className="absolute left-1/2 top-1/2 h-[310px] w-[310px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />

              <div className="absolute left-1/2 top-1/2 h-[235px] w-[235px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />

              <div className="absolute left-1/2 top-1/2 flex h-[150px] w-[150px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-white/[0.07] shadow-[0_30px_65px_rgba(0,0,0,0.22)] backdrop-blur-md">

                <div className="flex h-[94px] w-[94px] items-center justify-center rounded-full bg-gradient-to-br from-[#EEF0FF] via-[#E7EEFF] to-[#F0E9FB] text-[#5757B9] shadow-[0_16px_38px_rgba(0,0,0,0.18)]">

                  {role ===
                  "assessment_reviewer" ? (
                    <ClipboardCheck
                      size={31}
                      strokeWidth={1.7}
                    />
                  ) : (
                    <Sparkles
                      size={31}
                      strokeWidth={1.7}
                    />
                  )}

                </div>

              </div>


              <FloatingHeroCard
                position="left"
                icon={<Archive size={14} />}
                label="Assessment Sets"
                value="Year-specific"
                accent="blue"
              />

              <FloatingHeroCard
                position="right"
                icon={<FileQuestion size={14} />}
                label="Content"
                value={
                  role ===
                  "assessment_reviewer"
                    ? "Human-reviewed"
                    : "AI-assisted"
                }
                accent="violet"
              />

              <FloatingHeroCard
                position="bottom"
                icon={<ShieldCheck size={14} />}
                label="Governance"
                value={
                  role ===
                  "assessment_reviewer"
                    ? "Independent review"
                    : "Reviewer gate"
                }
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
            title={`Your ${config.title.toLowerCase()} workspace`}
            description="A quick view of the resources and review state currently available to you."
          />


          <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">

            {config.cards.map(
              (card) => (
                <Metric
                  key={card.label}
                  icon={card.icon}
                  label={card.label}
                  value={
                    metricValues[card.key]
                  }
                  description={
                    card.description
                  }
                  eyebrow={card.eyebrow}
                  accent={card.accent}
                  doodle={card.doodle}
                  getAccent={getMetricAccent}
                />
              )
            )}

          </div>

        </section>


        {/* =====================================================
            QUICK ACTIONS
        ===================================================== */}

        <section>

          <SectionHeading
            eyebrow="Quick actions"
            title="Continue your workflow"
            description="Move directly to the workspace area relevant to your current stage."
          />


          <div className="mt-6 grid gap-4 md:grid-cols-2">

            {config.actions.map(
              (action) => (
                <WorkspaceAction
                  key={action.title}
                  title={action.title}
                  description={
                    action.description
                  }
                  accent={action.accent}
                  icon={action.icon}
                  onClick={() =>
                    navigate(action.path)
                  }
                />
              )
            )}

          </div>

        </section>


        {/* =====================================================
            ASSIGNED JOBS
        ===================================================== */}

        {role === "assessment_manager" && (
          <section>
            <SectionHeading
              eyebrow="Manager workspace"
              title="Jobs shared by HR"
              description="Open a shared job, review the job description and skill scope, then continue into assessment preparation."
            />

            <div className="mt-6">
              {assignedJobsLoading ? (
                <div className="rounded-[22px] border border-[#E1E4EB] bg-white p-6">
                  <div className="h-5 w-48 animate-pulse rounded bg-[#EEF2F0]" />
                  <div className="mt-3 h-4 w-3/5 animate-pulse rounded bg-[#F3F6F4]" />
                </div>
              ) : assignedJobs.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-[#CBD2DD] bg-white p-7 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#F0EBFB] text-[#7A61D8]">
                    <BriefcaseBusiness size={19} />
                  </div>
                  <p className="mt-4 text-sm font-semibold text-[#344054]">
                    No jobs have been shared with you yet
                  </p>
                  <p className="mx-auto mt-1 max-w-xl text-xs leading-5 text-[#98A2B3]">
                    Once HR confirms a job's skills and shares the job, it will appear here.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {assignedJobs.map((job) => {
                    const skills = Array.isArray(job.skills)
                      ? job.skills
                      : [];

                    const confirmed =
                      String(job.skill_review_status || "").toLowerCase() ===
                      "confirmed";

                    return (
                      <article
                        key={job.id}
                        className="group relative overflow-hidden rounded-[22px] border border-[#E1E4EB] bg-white p-6 shadow-[0_10px_28px_rgba(38,40,79,0.035)] transition-all duration-300 hover:-translate-y-1 hover:border-[#D4D8E3] hover:shadow-[0_20px_42px_rgba(38,40,79,0.09)]"
                      >
                        <div className="pointer-events-none absolute -right-2 -top-2 opacity-35 transition-all duration-500 group-hover:scale-110 group-hover:rotate-3 group-hover:opacity-70">
                          <CardDoodle
                            icon={
                              <BriefcaseBusiness
                                size={58}
                                strokeWidth={1.25}
                              />
                            }
                            accent="blue"
                          />
                        </div>

                        <div className="relative z-10 flex items-start justify-between gap-4">
                          <div className="flex min-w-0 items-start gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#EAF2FF] text-[#3B82F6] transition-all duration-300 group-hover:scale-110 group-hover:rotate-3">
                              <BriefcaseBusiness size={18} />
                            </div>

                            <div className="min-w-0">
                              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#98A2B3]">
                                Assigned job
                              </p>
                              <h3 className="mt-1 truncate text-lg font-semibold tracking-[-0.02em] text-[#202938] transition-colors duration-200 group-hover:text-[#5658E8]">
                                {job.title}
                              </h3>
                            </div>
                          </div>

                          <span
                            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-bold ${
                              confirmed
                                ? "border-[#BBDDD5] bg-[#EFF8F5] text-[#17655E]"
                                : "border-[#E7D7B4] bg-[#FFF9EC] text-[#9A6917]"
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                confirmed
                                  ? "bg-[#2E8A81]"
                                  : "bg-[#D79A26]"
                              }`}
                            />
                            {confirmed
                              ? "Skills confirmed"
                              : "Skills pending"}
                          </span>
                        </div>

                        <div className="relative z-10 mt-5 flex flex-wrap gap-2">
                          {skills.length > 0 ? (
                            skills.slice(0, 6).map((skill) => (
                              <span
                                key={`${job.id}-${skill.id || skill.name}`}
                                className="rounded-full border border-[#E4E1F4] bg-[#FBFAFF] px-2.5 py-1 text-[10px] font-semibold text-[#6657A9] transition-colors duration-200 group-hover:border-[#D9D1EE]"
                              >
                                {skill.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-[#98A2B3]">
                              No skill list available
                            </span>
                          )}

                          {skills.length > 6 && (
                            <span className="rounded-full border border-[#E3E6EC] bg-[#FAFBFC] px-2.5 py-1 text-[10px] font-semibold text-[#667085]">
                              +{skills.length - 6} more
                            </span>
                          )}
                        </div>

                        <div className="relative z-10 mt-5 flex flex-col gap-3 border-t border-[#EEF0F3] pt-5 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-2 text-xs text-[#98A2B3]">
                            <CalendarDays size={14} />
                            {formatDashboardDate(job.created_at)}
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              navigate(
                                `/manager/jobs/${job.id}/review`,
                                { state: { job } }
                              )
                            }
                            className="group/button inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#5658E8] px-4 text-xs font-semibold text-white transition hover:bg-[#494BD8]"
                          >
                            Review JD & Skills
                            <ArrowRight
                              size={14}
                              className="transition-transform duration-200 group-hover/button:translate-x-0.5"
                            />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}


        {/* =====================================================
            WORKFLOW
        ===================================================== */}

        <section className="group relative overflow-hidden rounded-[28px] border border-[#DDE1EA] bg-white shadow-[0_15px_42px_rgba(38,40,79,0.05)] transition-all duration-300 hover:border-[#D8DCE6] hover:shadow-[0_20px_46px_rgba(38,40,79,0.075)]">

          <div className="pointer-events-none absolute -right-8 -top-8 opacity-25 transition-all duration-500 group-hover:scale-110 group-hover:opacity-60">
            <CardDoodle
              icon={
                <WandSparkles
                  size={78}
                  strokeWidth={1.1}
                />
              }
              accent="violet"
            />
          </div>

          <div className="relative z-10 border-b border-[#EAECF0] bg-gradient-to-r from-[#FAFBFF] via-[#FBFBFE] to-[#FFFDFC] px-7 py-8 sm:px-8">

            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">

              <div>

                <div className="inline-flex items-center gap-2 rounded-full bg-[#ECECFF] px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-[#5658E8]">

                  <WandSparkles size={11} />

                  Workflow
                </div>

                <h2 className="mt-3 text-[24px] font-semibold tracking-[-0.025em] text-[#1B2430]">
                  {config.workflowTitle}
                </h2>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#667085]">
                  {config.workflowDescription}
                </p>

              </div>

              <div className="hidden h-12 w-12 items-center justify-center rounded-xl bg-[#ECECFF] text-[#5658E8] transition-transform duration-300 group-hover:rotate-6 sm:flex">
                <Target size={20} />
              </div>

            </div>

          </div>


          <div className="relative z-10 p-6 sm:p-7">

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">

              {config.workflow.map(
                (item) => (
                  <WorkflowCard
                    key={item.number}
                    number={item.number}
                    title={item.title}
                    status={item.status}
                    description={
                      item.description
                    }
                    accent={item.accent}
                    path={item.path}
                    navigate={navigate}
                  />
                )
              )}

            </div>


            <div className="group/responsibility relative mt-6 flex flex-col gap-4 overflow-hidden rounded-[20px] border border-[#E4E7ED] bg-[#F8F9FC] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#D9DCE5] hover:shadow-[0_12px_28px_rgba(38,40,79,0.05)] lg:flex-row lg:items-center lg:justify-between">

              <div className="pointer-events-none absolute -right-2 -top-5 opacity-25 transition-all duration-500 group-hover/responsibility:scale-110 group-hover/responsibility:opacity-55">
                <CardDoodle
                  icon={
                    role ===
                    "assessment_reviewer" ? (
                      <ShieldCheck
                        size={68}
                        strokeWidth={1.2}
                      />
                    ) : (
                      <Users
                        size={68}
                        strokeWidth={1.2}
                      />
                    )
                  }
                  accent="rose"
                />
              </div>

              <div className="relative z-10 flex items-start gap-4">

                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F8EAF1] text-[#B85C87] transition-transform duration-300 group-hover/responsibility:scale-110">
                  {role ===
                  "assessment_reviewer" ? (
                    <ShieldCheck
                      size={17}
                    />
                  ) : (
                    <Users size={17} />
                  )}
                </div>

                <div>

                  <p className="text-xs font-semibold text-[#344054]">
                    Role responsibility stays explicit
                  </p>

                  <p className="mt-1 text-[11px] leading-5 text-[#667085]">
                    {role ===
                    "assessment_reviewer"
                      ? "Reviewers validate prepared content independently; they do not edit the source question."
                      : "Assessment Managers prepare content while independent reviewers retain the final approval gate."}
                  </p>

                </div>

              </div>

            </div>

          </div>

        </section>


        {/* =====================================================
            ROLE PRINCIPLES
        ===================================================== */}

        <section>

          <SectionHeading
            eyebrow="Workspace principles"
            title="Built around traceability and controlled handoffs"
            description="Each role sees the information needed for its stage without collapsing the responsibility boundaries between teams."
          />


          <div className="mt-6 grid gap-5 lg:grid-cols-3">

            <PrincipleCard
              icon={
                <Archive size={18} />
              }
              eyebrow="Historical continuity"
              title="Annual question banks"
              description="Questions remain associated with hiring-cycle context so historical content can be revisited intentionally."
              accent="violet"
            />

            <PrincipleCard
              icon={
                <History size={18} />
              }
              eyebrow="Content history"
              title="Version-aware questions"
              description="Edits create version history so reviewers can inspect how question content changed over time."
              accent="rose"
            />

            <PrincipleCard
              icon={
                <ShieldCheck size={18} />
              }
              eyebrow="Quality control"
              title="Independent review"
              description="Prepared content moves through a separate reviewer decision before it becomes assessment-ready."
              accent="amber"
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
    <div className="relative">

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
    teal:
      "bg-[#E5F7F3] text-[#0F9D8A]",

    violet:
      "bg-[#F0EBFB] text-[#7A61D8]",

    rose:
      "bg-[#F8EAF1] text-[#B85C87]",
  };

  return (
    <div className="flex items-center gap-2.5">

      <div
        className={`flex h-8 w-8 items-center justify-center rounded-lg ${
          accents[accent] ||
          accents.teal
        }`}
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
    blue:
      "bg-[#EAF2FF] text-[#3B82F6]",

    violet:
      "bg-[#F0EBFB] text-[#7A61D8]",

    rose:
      "bg-[#F8EAF1] text-[#B85C87]",
  };

  const positions = {
    left:
      "left-3 top-[72px]",

    right:
      "right-3 top-[92px]",

    bottom:
      "bottom-[46px] left-1/2 -translate-x-1/2",
  };

  return (
    <div
      className={`absolute ${
        positions[position]
      } rounded-[18px] border border-white/10 bg-white/[0.08] px-4 py-3 backdrop-blur-md shadow-[0_14px_30px_rgba(0,0,0,0.12)] transition-all duration-300 hover:-translate-y-1`}
    >

      <div className="flex items-center gap-2.5">

        <span
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${
            accents[accent] ||
            accents.blue
          }`}
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
  doodle,
  getAccent,
}) {
  const style = getAccent(
    accent
  );

  return (
    <div className="group relative min-h-[190px] overflow-hidden rounded-[22px] border border-[#E1E4EB] bg-white p-6 shadow-[0_10px_28px_rgba(38,40,79,0.035)] transition-all duration-300 hover:-translate-y-1 hover:border-[#D0D4DE] hover:shadow-[0_20px_42px_rgba(38,40,79,0.09)]">

      <div
        className={`pointer-events-none absolute -right-2 -top-2 h-28 w-28 rounded-full ${style.icon.split(" ")[0]} opacity-20 blur-2xl transition-all duration-500 group-hover:scale-125 group-hover:opacity-35`}
      />

      <div
        className={`pointer-events-none absolute right-3 top-3 ${style.doodle} opacity-55 transition-all duration-500 group-hover:scale-110 group-hover:rotate-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-95`}
      >
        {doodle}
      </div>

      <div
        className={`pointer-events-none absolute right-12 top-[76px] h-px w-10 rotate-[-18deg] bg-current ${style.doodle} opacity-45 transition-all duration-500 group-hover:w-14 group-hover:rotate-[-10deg]`}
      />

      <div
        className={`pointer-events-none absolute right-5 top-[92px] h-1.5 w-1.5 rounded-full bg-current ${style.doodle} opacity-55 transition-transform duration-500 group-hover:scale-150`}
      />

      <div className="relative z-10 flex items-start justify-between gap-3">

        <div
          className={`flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-300 group-hover:scale-110 group-hover:rotate-3 ${style.icon}`}
        >
          {icon}
        </div>

        <span
          className={`rounded-full px-2.5 py-1 text-[9px] font-bold transition-transform duration-300 group-hover:-translate-x-1 ${style.badge}`}
        >
          {eyebrow}
        </span>

      </div>

      <p className="relative z-10 mt-5 text-xs font-medium text-[#667085]">
        {label}
      </p>

      <p className="relative z-10 mt-1 text-[29px] font-semibold tracking-[-0.035em] text-[#1B2430] transition-transform duration-300 group-hover:translate-x-1">
        {value}
      </p>

      <p className="relative z-10 mt-1 max-w-[235px] text-[11px] leading-5 text-[#98A2B3]">
        {description}
      </p>

      <div className="pointer-events-none absolute bottom-5 left-6 flex items-center gap-1.5 opacity-35 transition-all duration-300 group-hover:translate-x-1 group-hover:opacity-80">
        <span
          className={`h-1.5 w-1.5 rounded-full ${style.icon.split(" ")[1]}`}
        />
        <span className="h-px w-8 bg-[#D9DEE7] transition-all duration-300 group-hover:w-12" />
      </div>
    </div>
  );
}


/* ============================================================
   CARD DOODLE
============================================================ */

function CardDoodle({
  icon,
  accent = "violet",
}) {
  const tones = {
    blue: {
      main: "text-[#75A4F6]",
      soft: "bg-[#EEF4FF]",
    },
    violet: {
      main: "text-[#9B8BDC]",
      soft: "bg-[#F1EDFB]",
    },
    teal: {
      main: "text-[#73C5B9]",
      soft: "bg-[#EAF7F4]",
    },
    rose: {
      main: "text-[#D797B4]",
      soft: "bg-[#FAEEF4]",
    },
    amber: {
      main: "text-[#D6B66D]",
      soft: "bg-[#FBF3E2]",
    },
  };

  const tone =
    tones[accent] ||
    tones.violet;

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none relative h-[105px] w-[112px] ${tone.main} transition-all duration-500`}
    >
      <div
        className={`absolute right-0 top-0 h-20 w-20 rounded-full ${tone.soft} opacity-60 blur-xl transition-transform duration-500`}
      />

      <div className="absolute right-1 top-1 transition-transform duration-500">
        {icon}
      </div>

      <span className="absolute right-20 top-5 h-2 w-2 rounded-full bg-current opacity-60 transition-transform duration-500" />

      <span className="absolute right-7 bottom-4 h-2 w-2 rounded-full bg-current opacity-45 transition-transform duration-500" />

      <span className="absolute right-15 top-[65px] h-px w-10 rotate-[-20deg] rounded-full bg-current opacity-50 transition-all duration-500" />

      <span className="absolute right-0 top-[76px] h-px w-8 rotate-[-8deg] rounded-full bg-current opacity-40" />
    </div>
  );
}


/* ============================================================
   WORKSPACE ACTION
============================================================ */

function WorkspaceAction({
  title,
  description,
  onClick,
  accent,
  icon,
}) {
  const accents = {
    teal: {
      icon:
        "bg-[#E5F7F3] text-[#0F9D8A]",
      hover:
        "hover:border-[#9ED7CD]",
    },

    violet: {
      icon:
        "bg-[#F0EBFB] text-[#7A61D8]",
      hover:
        "hover:border-[#CFC4EC]",
    },
  };

  const style =
    accents[accent] ||
    accents.teal;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex min-h-[92px] w-full items-center justify-between overflow-hidden rounded-[20px] border border-[#E0E3EA] bg-white p-4 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_32px_rgba(38,40,79,0.08)] ${style.hover}`}
    >
      <div className="pointer-events-none absolute -right-2 -top-7 opacity-25 transition-all duration-500 group-hover:scale-110 group-hover:opacity-60">
        <CardDoodle
          icon={icon}
          accent={accent}
        />
      </div>

      <div className="relative z-10 flex min-w-0 items-center gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-300 group-hover:scale-110 group-hover:rotate-3 ${style.icon}`}
        >
          {icon}
        </div>

        <div className="min-w-0">
          <p className="text-xs font-semibold text-[#344054] transition-colors duration-200 group-hover:text-[#5658E8]">
            {title}
          </p>

          <p className="mt-0.5 truncate text-[11px] text-[#98A2B3]">
            {description}
          </p>
        </div>
      </div>

      <span className="relative z-10 ml-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F5F6FA] text-[#98A2B3] transition-all duration-300 group-hover:bg-[#ECECFF] group-hover:text-[#5658E8]">
        <ArrowRight
          size={16}
          className="transition-transform duration-300 group-hover:translate-x-0.5"
        />
      </span>
    </button>
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
  path,
  navigate,
}) {
  const accents = {
    blue: {
      icon:
        "bg-[#EAF2FF] text-[#3B82F6]",
      badge:
        "bg-[#F0F5FF] text-[#2F68C5]",
    },

    violet: {
      icon:
        "bg-[#F0EBFB] text-[#7A61D8]",
      badge:
        "bg-[#F5F1FD] text-[#654DBD]",
    },

    rose: {
      icon:
        "bg-[#F8EAF1] text-[#B85C87]",
      badge:
        "bg-[#FCF1F6] text-[#944668]",
    },

    amber: {
      icon:
        "bg-[#FBF2DE] text-[#C58A32]",
      badge:
        "bg-[#FDF6E7] text-[#9C6A1F]",
    },

    teal: {
      icon:
        "bg-[#E5F7F3] text-[#0F9D8A]",
      badge:
        "bg-[#EDF9F6] text-[#08786B]",
    },
  };

  const style =
    accents[accent] ||
    accents.blue;

  return (
    <button
      type="button"
      onClick={() =>
        navigate(path)
      }
      className="group block h-full w-full text-left"
      aria-label={`${title}: ${status}`}
    >

      <div className="relative h-full min-h-[185px] overflow-hidden rounded-[20px] border border-[#E3E6EC] bg-white p-5 transition-all duration-300 hover:-translate-y-1 hover:border-[#D6DAE5] hover:shadow-[0_16px_32px_rgba(38,40,79,0.08)]">

        <div className="pointer-events-none absolute -right-2 -top-3 opacity-20 transition-all duration-500 group-hover:scale-110 group-hover:opacity-60">
          <CardDoodle
            icon={
              <FileCheck2
                size={55}
                strokeWidth={1.2}
              />
            }
            accent={accent}
          />
        </div>

        <div className="relative z-10 flex items-start justify-between gap-3">

          <div
            className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-300 group-hover:scale-110 group-hover:rotate-3 ${style.icon}`}
          >
            <span className="text-[10px] font-bold">
              {number}
            </span>
          </div>

        </div>

        <div className="relative z-10 mt-6">

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

        <ArrowRight
          size={15}
          className="absolute bottom-5 right-5 text-[#98A2B3] opacity-0 transition-all duration-300 group-hover:translate-x-0.5 group-hover:opacity-100"
        />

        <div className="pointer-events-none absolute bottom-5 left-5 h-px w-8 bg-[#E1E4EB] transition-all duration-300 group-hover:w-12 group-hover:bg-[#CFC8E8]" />
      </div>
    </button>
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
      icon:
        "bg-[#F0EBFB] text-[#7A61D8]",
      background:
        "bg-[#FCFAFF]",
      border:
        "border-[#E0D8F0]",
      eyebrow:
        "text-[#7A61D8]",
    },

    rose: {
      icon:
        "bg-[#F8EAF1] text-[#B85C87]",
      background:
        "bg-[#FFFBFD]",
      border:
        "border-[#E8D7E0]",
      eyebrow:
        "text-[#B85C87]",
    },

    amber: {
      icon:
        "bg-[#FBF2DE] text-[#C58A32]",
      background:
        "bg-[#FFFCF7]",
      border:
        "border-[#E9DDBF]",
      eyebrow:
        "text-[#9C6A1F]",
    },
  };

  const style =
    accents[accent] ||
    accents.violet;

  return (
    <section
      className={`group relative overflow-hidden rounded-[22px] border ${style.border} ${style.background} p-6 shadow-[0_8px_24px_rgba(38,40,79,0.025)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_34px_rgba(38,40,79,0.07)]`}
    >
      <div className="pointer-events-none absolute -right-1 -top-5 opacity-20 transition-all duration-500 group-hover:scale-110 group-hover:rotate-3 group-hover:opacity-55">
        <CardDoodle
          icon={icon}
          accent={accent}
        />
      </div>

      <div
        className={`relative z-10 flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-300 group-hover:scale-110 group-hover:rotate-3 ${style.icon}`}
      >
        {icon}
      </div>

      <p
        className={`relative z-10 mt-5 text-[9px] font-bold uppercase tracking-[0.18em] ${style.eyebrow}`}
      >
        {eyebrow}
      </p>

      <h3 className="relative z-10 mt-2 text-[18px] font-semibold tracking-[-0.02em] text-[#344054] transition-colors duration-200 group-hover:text-[#5658E8]">
        {title}
      </h3>

      <p className="relative z-10 mt-2 text-xs leading-6 text-[#667085]">
        {description}
      </p>

      <ArrowRight
        size={15}
        className="absolute bottom-6 right-6 text-[#A5AAB6] opacity-0 transition-all duration-300 group-hover:translate-x-1 group-hover:opacity-100"
      />
    </section>
  );
}


function formatDashboardDate(value) {
  if (!value) {
    return "Date unavailable";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default RoleDashboard;