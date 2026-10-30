import { useState } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Compass,
  Lightbulb,
  ListChecks,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

const STEPS = [
  {
    title: "Create a job",
    short: "Set up the vacancy",
    icon: BriefcaseBusiness,
    what: "Create the vacancy and enter the job description and requirements.",
    why: "Evalyn uses the job requirements to identify relevant skills and support assessment preparation.",
    actions: [
      "Enter the job title and requirements.",
      "Review the job description.",
      "Save the job and open it to continue.",
    ],
    next: "Review the extracted skills and confirm what candidates should be assessed on.",
    owner: "You · HR / Recruiter",
  },
  {
    title: "Confirm job skills",
    short: "Check what candidates need",
    icon: Sparkles,
    what: "Review the skills extracted from the job description. Correct the list wherever necessary.",
    why: "The confirmed skills guide assessment content and help keep questions relevant to the vacancy.",
    actions: [
      "Check the extracted skills and categories.",
      "Correct, add, or remove skills if needed.",
      "Save your edits before confirming the list.",
    ],
    next: "Assign an Assessment Manager and a different Assessment Reviewer.",
    owner: "You · HR / Recruiter",
  },
  {
    title: "Assign the assessment team",
    short: "Hand over preparation and review",
    icon: Users,
    what: "Choose the people responsible for preparing and independently reviewing the assessment.",
    why: "The Manager prepares the assessment; the Reviewer checks its quality before publication.",
    actions: [
      "Choose an Assessment Manager.",
      "Choose a different Assessment Reviewer.",
      "Submit the assignments and check the confirmation.",
    ],
    next: "The assessment team takes over preparation and review. You monitor progress and handle any HR actions.",
    owner: "You assign the team",
  },
  {
    title: "Monitor assessment readiness",
    short: "Follow progress and handoffs",
    icon: ClipboardCheck,
    what: "Track whether the assessment is being prepared, reviewed, or returned for changes.",
    why: "You can see whether the work is progressing or whether someone needs to take action.",
    actions: [
      "Open the relevant job and inspect its current status.",
      "Follow up on blockers that require HR action.",
      "Wait until the assessment is approved and published before assigning candidates.",
    ],
    next: "Assign candidates when the published assessment is ready and available.",
    owner: "You monitor · The assessment team prepares and reviews",
  },
  {
    title: "Track candidates and results",
    short: "Follow submissions and scoring",
    icon: Target,
    what: "Assign candidates to the published assessment and track their progress through submission and scoring.",
    why: "An assignment or submission alone does not mean that the assessment workflow is complete.",
    actions: [
      "Assign the intended candidates.",
      "Monitor starts and submissions.",
      "Check for outstanding scoring or review work.",
    ],
    next: "The workflow is complete when the required submissions and scoring are finalized.",
    owner: "You · HR / Recruiter",
  },
];

function BookIllustration() {
  return (
    <div className="relative flex h-[150px] w-[160px] items-center justify-center sm:h-[178px] sm:w-[180px]">
      <div className="absolute h-32 w-32 rounded-full border border-white/10 sm:h-40 sm:w-40" />
      <div className="absolute h-24 w-24 rounded-full border border-white/10 sm:h-32 sm:w-32" />

      <div className="absolute left-4 top-7 h-[100px] w-[64px] -rotate-[11deg] rounded-lg border border-white/20 bg-[#A9A0F5] shadow-xl sm:left-5 sm:top-8 sm:h-[116px] sm:w-[73px]" />

      <div className="absolute left-1/2 top-1/2 flex h-[112px] w-[140px] -translate-x-1/2 -translate-y-1/2 rotate-[3deg] overflow-hidden rounded-lg border border-white/70 bg-[#F8F7FF] shadow-[0_18px_35px_rgba(10,8,45,0.35)] sm:h-[130px] sm:w-[158px]">
        <div className="flex flex-1 flex-col items-center justify-center gap-2 border-r border-[#D8D2FA] bg-gradient-to-br from-white to-[#E8E4FF] px-2">
          <BookOpen size={33} strokeWidth={1.6} className="text-[#6554C0]" />
          <span className="text-[8px] font-extrabold tracking-[0.15em] text-[#6554C0] sm:text-[9px]">
            EVALYN
          </span>
          <span className="h-0.5 w-7 rounded-full bg-[#ABA2E7]" />
          <span className="text-[7px] font-semibold tracking-wide text-[#8981BB]">
            HR PLAYBOOK
          </span>
        </div>
        <div className="flex flex-1 flex-col justify-center gap-3 bg-[#F4F1FF] px-3">
          <span className="h-1 w-9 rounded-full bg-[#A39AE4]" />
          <span className="h-1 w-12 rounded-full bg-[#D4CFF4]" />
          <span className="h-1 w-10 rounded-full bg-[#D4CFF4]" />
          <span className="h-1 w-12 rounded-full bg-[#D4CFF4]" />
          <span className="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#E0DBFF] text-[#6554C0]">
            <Compass size={14} />
          </span>
        </div>
      </div>

      <Sparkles
        size={21}
        className="absolute right-1 top-1 text-[#A6F0E3] drop-shadow-sm"
      />
      <span className="absolute bottom-2 left-2 h-2 w-2 rounded-full bg-[#A6F0E3]" />
    </div>
  );
}

export default function WorkflowGuide({
  variant = "jobs",
  jobCount = null,
  onCreateJob,
}) {
  const { auth } = useAuth();

  const userKey = auth?.user_id ?? auth?.id ?? "browser";
  const storageKey = `evalyn-hr-playbook-v3:${userKey}`;

  const [introDismissed, setIntroDismissed] = useState(() => {
    try {
      return window.localStorage.getItem(storageKey) === "true";
    } catch {
      return false;
    }
  });

  const [expanded, setExpanded] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const isHROverview = variant === "jobs";

  const rememberChoice = () => {
    setIntroDismissed(true);
    try {
      window.localStorage.setItem(storageKey, "true");
    } catch {
      // The guide remains usable without browser storage.
    }
  };

  const startGuide = () => {
    rememberChoice();
    setSelectedIndex(0);
    setExpanded(true);
  };

  const dismissWelcome = () => {
    rememberChoice();
    setExpanded(false);
  };

  const activeStep = STEPS[selectedIndex];
  const ActiveIcon = activeStep.icon;

  // On the first visit, show the book instead of an ordinary guide header.
  if (isHROverview && !introDismissed && !expanded) {
    return (
      <section
        aria-label="Welcome to the Evalyn HR Playbook"
        className="relative isolate grid overflow-hidden rounded-[24px] border border-[#DCD7FA] bg-white shadow-[0_16px_44px_rgba(42,39,106,0.12)] transition-shadow duration-300 hover:shadow-[0_20px_50px_rgba(42,39,106,0.16)] sm:grid-cols-[215px_minmax(0,1fr)] lg:grid-cols-[245px_minmax(0,1fr)]"
      >
        <div className="relative flex min-h-[175px] items-center justify-center overflow-hidden bg-gradient-to-br from-[#252448] via-[#403B91] to-[#6558E9] sm:min-h-[270px]">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,rgba(150,139,255,0.28),transparent_65%)]" />
          <div className="relative">
            <BookIllustration />
          </div>
          <span className="absolute bottom-3 left-4 text-[8px] font-bold uppercase tracking-[0.2em] text-white/55">
            Your guide to Evalyn
          </span>
        </div>

        <div className="flex min-w-0 flex-col justify-center bg-gradient-to-br from-white via-[#FBFAFF] to-[#F0F3FF] p-5 sm:p-7 lg:p-9">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-[#E3DEFF] bg-[#F1EEFF] px-2.5 text-[9px] font-extrabold uppercase tracking-[0.14em] text-[#6554C0]">
              <Sparkles size={11} />
              First visit
            </span>
            <span className="text-[10px] text-[#8B90A3]">
              A beginner-friendly guide
            </span>
          </div>

          <h2 className="mt-3 text-2xl font-bold tracking-[-0.035em] text-[#252642] sm:text-3xl">
            Your HR Playbook
          </h2>

          <p className="mt-2 max-w-2xl text-xs leading-6 text-[#697086] sm:text-sm">
            New to Evalyn? This guide walks you through your responsibilities,
            from creating a job to tracking candidate results. You'll know
            what to do, why it matters, and what happens next.
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {[
              ["01", "Create a job"],
              ["02", "Confirm skills"],
              ["03", "Guide the workflow"],
            ].map(([number, label]) => (
              <div
                key={number}
                className="flex items-center gap-2 rounded-xl border border-[#EBE8F8] bg-white/90 px-3 py-2.5"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#F0EDFF] text-[10px] font-bold text-[#6554C0]">
                  {number}
                </span>
                <span className="text-[10px] font-semibold text-[#555D73]">
                  {label}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={startGuide}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#655BE7] to-[#4941BE] px-5 py-2.5 text-xs font-bold text-white shadow-[0_7px_18px_rgba(86,88,232,0.26)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(86,88,232,0.32)] focus:outline-none focus:ring-4 focus:ring-[#7A61D8]/20"
            >
              Open my guide
              <ArrowRight size={15} />
            </button>

            {jobCount === 0 && onCreateJob && (
              <button
                type="button"
                onClick={() => {
                  dismissWelcome();
                  onCreateJob();
                }}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#DDD8F7] bg-white px-4 py-2.5 text-xs font-semibold text-[#554D9E] transition hover:bg-[#F7F5FF]"
              >
                Create my first job
                <ArrowRight size={13} />
              </button>
            )}

            <button
              type="button"
              onClick={dismissWelcome}
              className="inline-flex min-h-10 items-center justify-center rounded-xl px-3 py-2 text-xs font-semibold text-[#8A8FA1] transition hover:bg-white hover:text-[#49418B]"
            >
              Maybe later
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Your HR workflow guide"
      className="overflow-hidden rounded-[20px] border border-[#E0DDF7] bg-white shadow-[0_8px_24px_rgba(38,40,79,0.035)]"
    >
      <div className="flex flex-col gap-3 bg-gradient-to-r from-[#F7F5FF] via-[#FBFAFF] to-[#F2F7FF] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#E2DDFB] bg-white text-[#6554C0] shadow-sm">
            <BookOpen size={19} />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#7669B7]">
              HR workflow guide
            </p>
            <h2 className="mt-1 text-sm font-semibold text-[#252642]">
              Your HR workflow, step by step
            </h2>
            <p className="mt-1 text-xs leading-5 text-[#6D7187]">
              Create jobs, confirm requirements, assign the assessment team,
              and track candidates.
            </p>
          </div>
        </div>

        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-[#DDD9F1] bg-white px-3 text-xs font-semibold text-[#5F568D] transition hover:border-[#BEB6EB] hover:bg-[#FAF9FF] focus:outline-none focus:ring-4 focus:ring-[#7A61D8]/15 sm:self-center"
        >
          {expanded ? "Hide guide" : "Show guide"}
          <ChevronDown
            size={14}
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {expanded && (
        <div className="grid gap-4 p-3.5 sm:p-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="space-y-2">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              const active = index === selectedIndex;

              return (
                <button
                  key={step.title}
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                  aria-pressed={active}
                  className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${
                    active
                      ? "border-[#BEB7EF] bg-[#F7F5FF] shadow-sm"
                      : "border-transparent bg-white hover:border-[#E6E3F4] hover:bg-[#FAFAFE]"
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      active
                        ? "bg-white text-[#6554C0]"
                        : "bg-[#F2F4F7] text-[#70798B]"
                    }`}
                  >
                    {index < selectedIndex ? (
                      <CheckCircle2 size={16} className="text-[#18845D]" />
                    ) : (
                      <Icon size={16} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-[#344054]">
                      {step.title}
                    </span>
                    <span className="mt-1 block text-[10px] leading-4 text-[#7C8495]">
                      {step.short}
                    </span>
                  </span>
                  <ArrowRight
                    size={14}
                    className={`mt-1 shrink-0 ${active ? "text-[#6554C0]" : "text-[#C0C5D0]"}`}
                  />
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl border border-[#E8E7F2] bg-[#FCFCFF] p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EEEBFF] text-[#6554C0]">
                <ActiveIcon size={19} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#8175BC]">
                  Step {selectedIndex + 1} of {STEPS.length}
                </p>
                <h3 className="mt-1 text-base font-semibold text-[#252642]">
                  {activeStep.title}
                </h3>
                <p className="mt-1 text-[11px] leading-5 text-[#757A8D]">
                  {activeStep.owner}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-[#E8E6F6] bg-white p-3">
                <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#6554C0]">
                  <BookOpen size={13} />
                  What is this step?
                </p>
                <p className="mt-1.5 text-xs leading-5 text-[#525B6D]">
                  {activeStep.what}
                </p>
              </div>

              <div className="rounded-xl border border-[#E8E6F6] bg-white p-3">
                <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#6554C0]">
                  <Lightbulb size={13} />
                  Why does it matter?
                </p>
                <p className="mt-1.5 text-xs leading-5 text-[#525B6D]">
                  {activeStep.why}
                </p>
              </div>

              <div className="rounded-xl border border-[#E8E6F6] bg-white p-3">
                <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#6554C0]">
                  <ListChecks size={13} />
                  What do I need to do?
                </p>
                <ol className="mt-2 space-y-2">
                  {activeStep.actions.map((action, index) => (
                    <li
                      key={`${selectedIndex}-${index}`}
                      className="flex items-start gap-2 text-xs leading-5 text-[#525B6D]"
                    >
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#F0EDFF] text-[9px] font-bold text-[#6554C0]">
                        {index + 1}
                      </span>
                      <span>{action}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="rounded-xl border border-[#D9E9E4] bg-[#F2F9F6] p-3">
                <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#17745E]">
                  <ArrowDownRight size={14} />
                  What happens next?
                </p>
                <p className="mt-1.5 text-xs leading-5 text-[#49665F]">
                  {activeStep.next}
                </p>
              </div>

              {selectedIndex > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedIndex((index) => index - 1)}
                  className="mr-2 inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#E0DDF2] bg-white px-3 text-xs font-semibold text-[#6554A9] hover:bg-[#F8F6FF]"
                >
                  Previous
                </button>
              )}

              {selectedIndex < STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setSelectedIndex((index) => index + 1)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#5658E8] px-3 text-xs font-semibold text-white hover:bg-[#4648C9]"
                >
                  Next step
                  <ArrowRight size={13} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#5658E8] px-3 text-xs font-semibold text-white hover:bg-[#4648C9]"
                >
                  Finish guide
                  <CheckCircle2 size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
