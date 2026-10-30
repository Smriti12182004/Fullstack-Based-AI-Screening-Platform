import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bookmark,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  Compass,
  FileCheck2,
  Lightbulb,
  ListChecks,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  Workflow,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

const ROLE_HOME = {
  recruiter: "/dashboard",
  assessment_manager: "/manager/dashboard",
  assessment_reviewer: "/reviewer/dashboard",
  candidate: "/candidate/dashboard",
  organization_admin: "/admin",
};

const ROLE_META = {
  recruiter: {
    title: "HR / Recruiter Handbook",
    subtitle: "From creating a vacancy to tracking finalized candidate results.",
    icon: BriefcaseBusiness,
    welcome:
      "You coordinate the hiring workflow. Your job is to set up the vacancy, confirm what candidates should be assessed on, assign the assessment team, and monitor progress.",
    workflow: [
      {
        title: "Create a job",
        purpose: "Set up the vacancy and its requirements.",
        why: "The job description gives Evalyn the context needed to identify relevant skills.",
        actions: [
          "Enter the job title and requirements.",
          "Review the job description for accuracy.",
          "Save the vacancy and open it for skill review.",
        ],
        next: "Review and confirm the extracted skills.",
      },
      {
        title: "Review and confirm skills",
        purpose: "Check the skills extracted from the job description.",
        why: "These skills guide assessment preparation and help keep the questions relevant to the vacancy.",
        actions: [
          "Review skill names and categories.",
          "Correct, add, or remove skills where necessary.",
          "Save edits before confirming the final skill set.",
        ],
        next: "Assign an Assessment Manager and a different Assessment Reviewer.",
      },
      {
        title: "Assign the assessment team",
        purpose: "Choose who will prepare and independently review the assessment.",
        why: "Clear ownership avoids confusion about who creates questions and who checks their quality.",
        actions: [
          "Select an Assessment Manager.",
          "Select a different Assessment Reviewer.",
          "Submit the assignment and check the confirmation message.",
        ],
        next: "The assessment team prepares and reviews the assessment. You monitor progress.",
      },
      {
        title: "Monitor assessment readiness",
        purpose: "Follow preparation, review, and publication progress.",
        why: "You need to know whether work is progressing or whether an HR action is outstanding.",
        actions: [
          "Open the relevant job and inspect its current status.",
          "Follow up when an issue needs HR attention.",
          "Wait for the required approval and publication before assigning candidates.",
        ],
        next: "Assign the published assessment to candidates.",
      },
      {
        title: "Assign candidates and track results",
        purpose: "Monitor candidate attempts, submissions, and finalized scoring.",
        why: "An assignment or submission alone does not mean the full assessment workflow is complete.",
        actions: [
          "Assign eligible candidates to the published assessment.",
          "Monitor starts and submissions.",
          "Check outstanding scoring or review work and inspect finalized results when available.",
        ],
        next: "The workflow is complete when the required submissions and scoring are finalized.",
      },
    ],
    pages: [
      {
        title: "Dashboard",
        description: "Your starting point for understanding the hiring workflow and opening jobs.",
        when: "Start here when you sign in or need an overview.",
        route: "/dashboard",
      },
      {
        title: "Jobs",
        description: "Find a vacancy and continue from its current stage.",
        when: "Open this page to create a job or continue an existing one.",
        route: "/jobs",
      },
      {
        title: "Skill Review",
        description: "Verify extracted skills before assessment work proceeds.",
        when: "Use the skill-review page associated with the relevant job.",
        route: "/jobs",
      },
      {
        title: "Assessments",
        description: "Review the assessment information and actions available to your recruiter role.",
        when: "Use this page to find available assessment and result workflows.",
        route: "/assessments",
      },
    ],
    trouble: [
      {
        q: "I cannot continue after creating a job.",
        a: "Open the saved job and check whether skills have been extracted and reviewed. Complete the skill-review requirements shown on the page before moving to the next step.",
      },
      {
        q: "Who creates the assessment questions?",
        a: "The Assessment Manager prepares assessment content. The Assessment Reviewer independently checks its quality. HR coordinates the workflow and monitors the handoff.",
      },
      {
        q: "Can I assign candidates before publication?",
        a: "Follow the publication requirements in Evalyn. Candidate assignment should happen only when the relevant assessment is approved, published, and available.",
      },
      {
        q: "Why does a job still show work outstanding?",
        a: "Preparation, review, candidate submission, and scoring are separate stages. Check the current status and identify which stage is still outstanding.",
      },
    ],
  },

  assessment_manager: {
    title: "Assessment Manager Handbook",
    subtitle: "Prepare relevant, validated assessment content for independent review.",
    icon: ClipboardCheck,
    welcome:
      "You prepare assessments for jobs assigned to you. Use the confirmed requirements, create and refine questions, resolve validation issues, and follow the available handoff to the Reviewer.",
    workflow: [
      {
        title: "Open assigned work",
        purpose: "Find the jobs and assessment content assigned to you.",
        why: "Assessment preparation must follow the requirements confirmed for the relevant vacancy.",
        actions: [
          "Open your Manager dashboard.",
          "Find an assigned job or assessment set.",
          "Review the job requirements and confirmed skills.",
        ],
        next: "Prepare assessment content that covers the required skills.",
      },
      {
        title: "Prepare the assessment",
        purpose: "Create or refine the question content for the assessment.",
        why: "Questions must match the required skills, difficulty, and assessment format.",
        actions: [
          "Review the blueprint or question requirements available to you.",
          "Generate, create, or edit questions using the available controls.",
          "Check answer quality and question clarity.",
        ],
        next: "Validate the content and resolve any identified issues.",
      },
      {
        title: "Validate and refine",
        purpose: "Find and correct unsuitable or incomplete question content.",
        why: "Validation helps identify issues before the assessment is reviewed or given to candidates.",
        actions: [
          "Check relevance and skill coverage.",
          "Resolve duplicate, incomplete, or invalid questions.",
          "Review warnings or errors shown by Evalyn.",
        ],
        next: "Use the supported handoff to submit the prepared content for review.",
      },
      {
        title: "Handle review feedback",
        purpose: "Correct issues raised by the Assessment Reviewer.",
        why: "A review request identifies changes needed before the content can proceed.",
        actions: [
          "Read the review comments carefully.",
          "Correct the specified questions or answers.",
          "Resubmit through the available workflow when ready.",
        ],
        next: "The Reviewer checks the resubmitted content.",
      },
    ],
    pages: [
      {
        title: "Manager Dashboard",
        description: "Review the work and assessment preparation tasks assigned to you.",
        when: "Start here to identify what needs attention.",
        route: "/manager/dashboard",
      },
      {
        title: "Assigned Jobs",
        description: "Open a job to inspect its requirements and preparation status.",
        when: "Use this page to find work assigned to you.",
        route: "/manager/jobs",
      },
      {
        title: "Assessment Sets",
        description: "Access the question sets and content workflows available to your role.",
        when: "Use this page to continue assessment preparation.",
        route: "/question-banks",
      },
      {
        title: "Question Library",
        description: "Create and manage reusable screening questions.",
        when: "Use it when question editing or creation is required.",
        route: "/questions",
      },
    ],
    trouble: [
      {
        q: "The required skills are unclear.",
        a: "Return to the assigned job requirements and confirmed skills. If the requirements themselves are unclear or incorrect, raise that with the responsible HR user rather than silently changing the assessment scope.",
      },
      {
        q: "Questions fail validation.",
        a: "Read the individual validation messages, correct the affected content, and run the supported validation again before handing the work to the Reviewer.",
      },
      {
        q: "The Reviewer requested changes.",
        a: "Treat the review comments as a correction checklist. Resolve each issue and resubmit using the available workflow action.",
      },
      {
        q: "Can I approve my own assessment?",
        a: "Preparation and independent quality review are separate responsibilities. Follow the configured review process rather than replacing the Reviewer's decision.",
      },
    ],
  },

  assessment_reviewer: {
    title: "Assessment Reviewer Handbook",
    subtitle: "Make clear, consistent quality decisions before assessment publication.",
    icon: ShieldCheck,
    welcome:
      "You independently review assessment content. Check correctness, clarity, relevance, and coverage, then record a supported decision with specific feedback when changes are needed.",
    workflow: [
      {
        title: "Find pending reviews",
        purpose: "Locate the assessment content awaiting your decision.",
        why: "An independent review helps detect problems before candidates encounter the questions.",
        actions: [
          "Open your Reviewer dashboard or review workspace.",
          "Identify the content assigned for review.",
          "Read the job requirements and review criteria.",
        ],
        next: "Inspect the questions and answer keys.",
      },
      {
        title: "Check quality and coverage",
        purpose: "Evaluate question correctness, clarity, and relevance.",
        why: "A question may be well written but still fail to test the intended skill.",
        actions: [
          "Check whether questions align with the required skills.",
          "Check answer correctness and clarity.",
          "Review coverage and difficulty against the stated requirements.",
        ],
        next: "Record an approval or request changes, according to the available controls.",
      },
      {
        title: "Record your decision",
        purpose: "Document the result of your independent review.",
        why: "A clear decision provides a traceable handoff to the Manager and HR.",
        actions: [
          "Approve only when the applicable review requirements are satisfied.",
          "When changes are required, identify the affected content.",
          "Provide specific, actionable feedback.",
        ],
        next: "If changes were requested, the Manager corrects the content and resubmits it.",
      },
      {
        title: "Review resubmissions",
        purpose: "Verify that requested changes have been addressed.",
        why: "A resubmission needs a fresh check rather than an assumed approval.",
        actions: [
          "Read the updated content.",
          "Check the issues raised in the previous decision.",
          "Record the next supported review decision.",
        ],
        next: "The assessment can proceed only through the configured approval and publication process.",
      },
    ],
    pages: [
      {
        title: "Reviewer Dashboard",
        description: "Find the assessment review work assigned to you.",
        when: "Start here to locate pending decisions.",
        route: "/reviewer/dashboard",
      },
      {
        title: "Assessment Review",
        description: "Inspect assigned content and record your review decision.",
        when: "Use this page to review questions and respond to review tasks.",
        route: "/review",
      },
      {
        title: "Assessment Sets",
        description: "Access question-set content made available to your role.",
        when: "Use it to inspect the content connected to a review.",
        route: "/question-banks",
      },
    ],
    trouble: [
      {
        q: "A question looks correct but does not test the intended skill.",
        a: "Check the question against the confirmed requirement, not just its wording. Explain the mismatch in your feedback so the Manager knows what to change.",
      },
      {
        q: "The assessment needs corrections.",
        a: "Request changes through the available review controls and give precise examples of the issues. The Manager owns the correction work.",
      },
      {
        q: "What should I do with a resubmission?",
        a: "Recheck the content against the prior review comments and the original criteria. Don't assume the requested changes were completed correctly.",
      },
    ],
  },

  candidate: {
    title: "Candidate Handbook",
    subtitle: "Understand your instructions, complete your assessment, and confirm submission.",
    icon: Target,
    welcome:
      "Your task is to complete the assessment assigned to you. Read the instructions carefully, answer the questions, submit your attempt, and check the status afterwards.",
    workflow: [
      {
        title: "Review your assessment",
        purpose: "Open an assessment assigned to you and read its instructions.",
        why: "Instructions explain how the assessment is expected to be completed.",
        actions: [
          "Open your Candidate Dashboard.",
          "Check the assessment instructions and availability information shown.",
          "Check the time limit or deadline if one is displayed.",
        ],
        next: "Start the assessment when you are ready and it is available.",
      },
      {
        title: "Answer the questions",
        purpose: "Complete the questions in your assessment attempt.",
        why: "Your submitted answers form the response that will be evaluated.",
        actions: [
          "Read each question carefully.",
          "Enter or select your answer.",
          "Use any available progress or save indicators to check your work.",
        ],
        next: "Review your answers and submit your attempt using the provided control.",
      },
      {
        title: "Submit your attempt",
        purpose: "Send your completed responses for evaluation.",
        why: "Finishing the questions and submitting them are separate actions.",
        actions: [
          "Review your answers where the interface permits.",
          "Select the submit action.",
          "Wait for the submission confirmation and do not assume submission succeeded without confirmation.",
        ],
        next: "Check your assessment status and wait for results when they become available.",
      },
      {
        title: "Check submission and results",
        purpose: "Understand whether your attempt was submitted and whether results are available.",
        why: "Submitted work may still be undergoing scoring or review.",
        actions: [
          "Return to your Candidate Dashboard.",
          "Check the displayed attempt status.",
          "Review results only when they are made available to you.",
        ],
        next: "Follow any further instructions shown in your workspace.",
      },
    ],
    pages: [
      {
        title: "Candidate Dashboard",
        description: "See the assessments assigned to you and their current status.",
        when: "Start here to find work that is available to you.",
        route: "/candidate/dashboard",
      },
      {
        title: "Assessment Attempt",
        description: "Read instructions, answer questions, and submit your attempt.",
        when: "Open an available assessment from your dashboard.",
        route: "/candidate/dashboard",
      },
    ],
    trouble: [
      {
        q: "I cannot start an assessment.",
        a: "Check whether the assessment is available and read any instructions or messages on the page. If it still cannot be started, contact the responsible recruiting team.",
      },
      {
        q: "I clicked Submit but I'm unsure whether it worked.",
        a: "Look for a submission confirmation and check your dashboard's attempt status. Do not assume the attempt was submitted if no confirmation or updated status appears.",
      },
      {
        q: "Why are my results not visible yet?",
        a: "Submission and scoring are separate stages. Results may not be available until evaluation is finalized and released through the platform.",
      },
    ],
  },

  organization_admin: {
    title: "Organization Administrator Handbook",
    subtitle: "Understand account administration, access controls, and role boundaries.",
    icon: Users,
    welcome:
      "You manage the organization-level administration tasks available to your account. Use the administrative controls provided by Evalyn and keep role responsibilities separate.",
    workflow: [
      {
        title: "Review organization administration",
        purpose: "Open the administration workspace and review its available controls.",
        why: "Organization administration affects account access and should be carried out carefully.",
        actions: [
          "Open the Admin Dashboard.",
          "Review the account or organization details shown.",
          "Identify the specific administration task before making changes.",
        ],
        next: "Use the corresponding supported control for the task.",
      },
      {
        title: "Manage users and roles",
        purpose: "Use the available user-management controls to administer accounts and permissions.",
        why: "Each user needs the correct role to access the appropriate workspace.",
        actions: [
          "Verify which account you intend to change.",
          "Check the target user's current role and the intended change.",
          "Review the result of the supported action.",
        ],
        next: "Verify that the account reflects the expected role or access state.",
      },
      {
        title: "Verify administrative changes",
        purpose: "Check that the change produced the intended result.",
        why: "A confirmation should be followed by verification when access or roles have changed.",
        actions: [
          "Review the updated account information.",
          "Check for any error or failure message.",
          "Follow the available recovery or support process if the change failed.",
        ],
        next: "Return to the Admin Dashboard for any remaining tasks.",
      },
    ],
    pages: [
      {
        title: "Admin Dashboard",
        description: "Access organization-level administration features available to your role.",
        when: "Start here for account or role-management tasks.",
        route: "/admin",
      },
    ],
    trouble: [
      {
        q: "I cannot access an administrative action.",
        a: "Check that you are signed in with the appropriate account and that the action is available to your role. Do not try to bypass authorization controls.",
      },
      {
        q: "A user has the wrong role.",
        a: "Verify the user and intended role, use the supported role-management control if available, and confirm the saved result.",
      },
    ],
  },
};

function HandbookSection({ title, children, id }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="text-lg font-bold tracking-tight text-[#252642] sm:text-xl">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function Handbook() {
  const { auth } = useAuth();
  const navigate = useNavigate();
  const role = String(auth?.role || "").toLowerCase();
  const guide = ROLE_META[role] || ROLE_META.recruiter;
  const RoleIcon = guide.icon;

  const [activeChapter, setActiveChapter] = useState("getting-started");
  const [search, setSearch] = useState("");
  const [openTrouble, setOpenTrouble] = useState(0);

  const searchable = useMemo(
    () => search.trim().toLowerCase(),
    [search],
  );

  const filteredPages = guide.pages.filter((page) =>
    `${page.title} ${page.description} ${page.when}`
      .toLowerCase()
      .includes(searchable),
  );

  const filteredSteps = guide.workflow
    .map((step, index) => ({ ...step, index }))
    .filter((step) =>
      `${step.title} ${step.purpose} ${step.why} ${step.actions.join(" ")} ${step.next}`
        .toLowerCase()
        .includes(searchable),
    );

  const filteredTrouble = guide.trouble.filter((item) =>
    `${item.q} ${item.a}`.toLowerCase().includes(searchable),
  );

  const selectChapter = (chapter) => {
    setActiveChapter(chapter);
    const element = document.getElementById(chapter);
    element?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-[#F5F7FC]">
      <header className="border-b border-[#E4E7F0] bg-white">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 py-4 sm:px-7 lg:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#655BE7] to-[#4038B4] text-white shadow-sm">
              <BookOpen size={21} />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#7A70BF]">
                Evalyn documentation
              </p>
              <h1 className="mt-0.5 text-sm font-bold text-[#252642] sm:text-base">
                My Handbook
              </h1>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate(ROLE_HOME[role] || "/")}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-[#DFE3EC] bg-white px-3 text-xs font-semibold text-[#555E73] transition hover:border-[#BDB6EA] hover:bg-[#FAF9FF] hover:text-[#5147B7]"
          >
            <ArrowLeft size={14} />
            <span className="hidden sm:inline">Back to workspace</span>
            <span className="sm:hidden">Back</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 py-5 sm:px-7 sm:py-8 lg:px-10">
        <section className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#252448] via-[#39357C] to-[#5D54D9] p-5 text-white shadow-[0_14px_38px_rgba(42,39,106,0.16)] sm:p-8">
          <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full border border-white/10" />
          <div className="pointer-events-none absolute -bottom-32 right-24 h-72 w-72 rounded-full border border-white/10" />

          <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-center">
            <div className="max-w-3xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.15em] text-[#DFDBFF]">
                <Bookmark size={12} />
                Role-specific handbook
              </span>
              <h2 className="mt-4 text-2xl font-bold tracking-[-0.03em] sm:text-3xl">
                {guide.title}
              </h2>
              <p className="mt-2 max-w-2xl text-xs leading-6 text-white/75 sm:text-sm">
                {guide.subtitle}
              </p>
            </div>

            <div className="flex h-[94px] w-[94px] shrink-0 items-center justify-center self-start rounded-[25px] border border-white/15 bg-white/10 shadow-inner md:self-center">
              <RoleIcon size={42} strokeWidth={1.45} />
            </div>
          </div>

          <div className="relative mt-5 max-w-4xl rounded-xl border border-white/10 bg-white/[0.08] p-4">
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.13em] text-[#C9C2FF]">
              <Lightbulb size={14} />
              Your responsibility
            </p>
            <p className="mt-2 text-xs leading-6 text-white/90 sm:text-sm">
              {guide.welcome}
            </p>
          </div>
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
          <aside className="h-fit rounded-2xl border border-[#E3E6EF] bg-white p-3 shadow-sm lg:sticky lg:top-5">
            <label
              htmlFor="handbook-search"
              className="mb-2 block px-1 text-[10px] font-bold uppercase tracking-[0.13em] text-[#838BA0]"
            >
              Find in handbook
            </label>
            <div className="flex h-10 items-center gap-2 rounded-lg border border-[#E0E4ED] bg-[#FAFBFD] px-3 focus-within:border-[#9A91E7]">
              <Search size={14} className="shrink-0 text-[#9299AA]" />
              <input
                id="handbook-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search instructions..."
                className="min-w-0 flex-1 bg-transparent text-xs text-[#344054] outline-none placeholder:text-[#A0A6B5]"
              />
            </div>

            <nav aria-label="Handbook chapters" className="mt-4 space-y-1.5">
              {[
                ["getting-started", "Getting started", Compass],
                ["workflow", "My workflow", Workflow],
                ["pages", "Using Evalyn", BookOpen],
                ["troubleshooting", "Troubleshooting", CircleHelp],
              ].map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => selectChapter(id)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition ${
                    activeChapter === id
                      ? "bg-[#F0EDFF] text-[#5548BC]"
                      : "text-[#596276] hover:bg-[#F7F8FC] hover:text-[#4540A5]"
                  }`}
                >
                  <Icon size={15} />
                  <span className="flex-1">{label}</span>
                  <ArrowRight size={12} className="opacity-60" />
                </button>
              ))}
            </nav>

            <div className="mt-4 rounded-xl border border-[#E5E0FA] bg-gradient-to-br from-[#FBFAFF] to-[#F3F2FF] p-3">
              <div className="flex items-center gap-2 text-[#6554C0]">
                <Sparkles size={15} />
                <span className="text-xs font-bold">Need more help?</span>
              </div>
              <p className="mt-2 text-[10px] leading-5 text-[#70758C]">
                Open E-Compass for a conversational explanation of your role
                and the workflow.
              </p>
              <button
                type="button"
                onClick={() => {
                  navigate(ROLE_HOME[role] || "/");
                }}
                className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-bold text-[#5E52C3] hover:underline"
              >
                Return to workspace
                <ArrowRight size={12} />
              </button>
            </div>
          </aside>

          <div className="min-w-0 space-y-6">
            <HandbookSection title="Getting started" id="getting-started">
              <div className="rounded-2xl border border-[#E3E6EF] bg-white p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EEEBFF] text-[#6554C0]">
                    <RoleIcon size={19} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-[#252642]">
                      Start with your role
                    </h3>
                    <p className="mt-1 text-xs leading-6 text-[#626B7F]">
                      Read the responsibility statement above, then follow the
                      steps in order. Each step explains what you need to do,
                      why it matters, and what happens next.
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {[
                    {
                      icon: ListChecks,
                      title: "What to do",
                      text: "Follow the actions listed for each step.",
                    },
                    {
                      icon: Lightbulb,
                      title: "Why it matters",
                      text: "Understand the purpose before taking action.",
                    },
                    {
                      icon: ArrowRight,
                      title: "What happens next",
                      text: "Know the next handoff or prerequisite.",
                    },
                  ].map(({ icon: Icon, title, text }) => (
                    <div
                      key={title}
                      className="rounded-xl border border-[#EAECF3] bg-[#FBFCFE] p-3"
                    >
                      <Icon size={17} className="text-[#6554C0]" />
                      <h4 className="mt-2 text-xs font-bold text-[#344054]">
                        {title}
                      </h4>
                      <p className="mt-1 text-[10px] leading-5 text-[#778094]">
                        {text}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </HandbookSection>

            <HandbookSection title="My workflow" id="workflow">
              <div className="space-y-3">
                {filteredSteps.map((step) => {
                  const Icon = STEPS_ICON(step.index, guide);
                  return (
                    <article
                      key={step.title}
                      className="overflow-hidden rounded-2xl border border-[#E2E5EF] bg-white shadow-[0_4px_14px_rgba(38,40,79,0.025)]"
                    >
                      <div className="flex items-start gap-3 p-4 sm:p-5">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F0EDFF] text-[#6554C0]">
                          <Icon size={18} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#8278C4]">
                            Step {step.index + 1} of {guide.workflow.length}
                          </p>
                          <h3 className="mt-1 text-sm font-bold text-[#252642]">
                            {step.title}
                          </h3>
                          <p className="mt-1 text-xs leading-5 text-[#667085]">
                            {step.purpose}
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-3 border-t border-[#EEF0F5] bg-[#FCFCFE] p-4 sm:grid-cols-2 sm:p-5">
                        <div>
                          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#6554C0]">
                            <Lightbulb size={12} />
                            Why it matters
                          </p>
                          <p className="mt-1.5 text-xs leading-5 text-[#626B7F]">
                            {step.why}
                          </p>
                        </div>
                        <div>
                          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#6554C0]">
                            <ListChecks size={12} />
                            Actions to complete
                          </p>
                          <ol className="mt-2 space-y-2">
                            {step.actions.map((action, index) => (
                              <li
                                key={action}
                                className="flex items-start gap-2 text-xs leading-5 text-[#626B7F]"
                              >
                                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#EFECFF] text-[9px] font-bold text-[#6554C0]">
                                  {index + 1}
                                </span>
                                {action}
                              </li>
                            ))}
                          </ol>
                        </div>
                      </div>

                      <div className="flex items-start gap-2.5 border-t border-[#DCEBE5] bg-[#F2F9F6] px-4 py-3.5 sm:px-5">
                        <ArrowRight size={15} className="mt-0.5 shrink-0 text-[#17745E]" />
                        <p className="text-xs leading-5 text-[#49695F]">
                          <strong>What happens next:</strong> {step.next}
                        </p>
                      </div>
                    </article>
                  );
                })}

                {filteredSteps.length === 0 && (
                  <p className="rounded-xl border border-dashed border-[#D9DDEA] bg-white p-5 text-xs text-[#7C8495]">
                    No workflow steps match this search.
                  </p>
                )}
              </div>
            </HandbookSection>

            <HandbookSection title="Using Evalyn" id="pages">
              <div className="grid gap-3 sm:grid-cols-2">
                {filteredPages.map((page) => (
                  <article
                    key={page.title}
                    className="flex flex-col rounded-xl border border-[#E2E5EF] bg-white p-4"
                  >
                    <h3 className="text-sm font-bold text-[#252642]">
                      {page.title}
                    </h3>
                    <p className="mt-1.5 text-xs leading-5 text-[#667085]">
                      {page.description}
                    </p>
                    <p className="mt-2 text-[10px] leading-5 text-[#7C8495]">
                      <strong>Use it when:</strong> {page.when}
                    </p>
                    <button
                      type="button"
                      onClick={() => navigate(page.route)}
                      className="mt-4 inline-flex min-h-9 items-center justify-center gap-2 self-start rounded-lg border border-[#DDD8F7] bg-[#FAF9FF] px-3 text-[11px] font-semibold text-[#5A50B8] transition hover:bg-[#F0EDFF]"
                    >
                      Open page
                      <ArrowRight size={13} />
                    </button>
                  </article>
                ))}

                {filteredPages.length === 0 && (
                  <p className="rounded-xl border border-dashed border-[#D9DDEA] bg-white p-5 text-xs text-[#7C8495]">
                    No pages match this search.
                  </p>
                )}
              </div>
              <p className="mt-3 text-[10px] leading-5 text-[#8A90A2]">
                Page descriptions explain the intended use. The available
                controls and permissions depend on your role and the current
                saved workflow state.
              </p>
            </HandbookSection>

            <HandbookSection title="Troubleshooting" id="troubleshooting">
              <div className="space-y-2">
                {filteredTrouble.map((item, index) => (
                  <article
                    key={item.q}
                    className="overflow-hidden rounded-xl border border-[#E2E5EF] bg-white"
                  >
                    <button
                      type="button"
                      aria-expanded={openTrouble === index}
                      onClick={() =>
                        setOpenTrouble((current) => current === index ? -1 : index)
                      }
                      className="flex w-full items-center gap-3 p-4 text-left"
                    >
                      <CircleHelp size={16} className="shrink-0 text-[#6554C0]" />
                      <span className="flex-1 text-xs font-semibold leading-5 text-[#344054]">
                        {item.q}
                      </span>
                      <ChevronDown
                        size={15}
                        className={`shrink-0 text-[#8A90A2] transition-transform ${openTrouble === index ? "rotate-180" : ""}`}
                      />
                    </button>
                    {openTrouble === index && (
                      <p className="border-t border-[#EEF0F5] bg-[#FBFCFE] px-4 py-3 text-xs leading-6 text-[#667085]">
                        {item.a}
                      </p>
                    )}
                  </article>
                ))}

                {filteredTrouble.length === 0 && (
                  <p className="rounded-xl border border-dashed border-[#D9DDEA] bg-white p-5 text-xs text-[#7C8495]">
                    No troubleshooting topics match this search.
                  </p>
                )}
              </div>
            </HandbookSection>

            <div className="rounded-2xl border border-[#DDD8F7] bg-gradient-to-r from-[#F7F5FF] to-[#F0F5FF] p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#6554C0] shadow-sm">
                  <Compass size={19} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-[#302D68]">
                    Need an explanation for your current page?
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-[#6F7390]">
                    Open E-Compass to ask questions about your role, the
                    current screen, or the next workflow step.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate(ROLE_HOME[role] || "/")}
                className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#5658E8] px-4 text-xs font-semibold text-white transition hover:bg-[#4648C9]"
              >
                Return to workspace and ask E-Compass
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function STEPS_ICON(index, guide) {
  const icons = [BriefcaseBusiness, Sparkles, Users, ClipboardCheck, Target];
  // Reviewer and Candidate role handbooks have different step meanings.
  if (guide.title.includes("Reviewer")) {
    return [ClipboardCheck, ShieldCheck, FileCheck2, CheckCircle2][index % 4];
  }
  if (guide.title.includes("Candidate")) {
    return [BookOpen, ListChecks, FileCheck2, CheckCircle2][index % 4];
  }
  if (guide.title.includes("Administrator")) {
    return [Users, ShieldCheck, CheckCircle2][index % 3];
  }
  return icons[index % icons.length];
}
