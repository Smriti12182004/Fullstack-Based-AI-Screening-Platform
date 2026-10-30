import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Lightbulb,
  ListChecks,
  MessageCircle,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";

const ROLE_NAMES = {
  recruiter: "HR / Recruiter",
  assessment_manager: "Assessment Manager",
  assessment_reviewer: "Assessment Reviewer",
  candidate: "Candidate",
  organization_admin: "Organization Administrator",
};

const ROLE_GUIDES = {
  recruiter: {
    responsibility:
      "You coordinate the hiring workflow. You create jobs, confirm required skills, assign the assessment team, and track candidates. The assessment team prepares and reviews questions.",
    pages: [
      {
        test: (path) => path === "/dashboard",
        title: "HR Dashboard",
        what: "This is your starting point for coordinating jobs and screening workflows.",
        why: "The dashboard helps you understand the process before you open a specific job.",
        actions: [
          "Create a job if this is a new vacancy.",
          "Open Jobs to continue an existing vacancy.",
          "Use the job's current status to identify your next responsibility.",
        ],
        next: "Create a job or open an existing one to review its requirements.",
      },
      {
        test: (path) => path === "/jobs/new",
        title: "Create a job",
        what: "Enter the vacancy details and prepare the job description.",
        why: "Evalyn uses the role requirements to identify skills and support relevant assessment preparation.",
        actions: [
          "Enter the job title and required details.",
          "Review the generated or entered job description.",
          "Save the job and continue to skill review.",
        ],
        next: "Review and confirm the skills extracted from the job description.",
      },
      {
        test: (path) => /\/jobs\/\d+\/skills/.test(path),
        title: "Review job skills",
        what: "Review the skills extracted from the job description and correct the list.",
        why: "The confirmed skills guide the assessment content and expected coverage.",
        actions: [
          "Check the extracted skills and their categories.",
          "Add, edit, or remove skills where necessary.",
          "Save your changes before confirming the skill set.",
        ],
        next: "Confirm the skills, then assign an Assessment Manager and a different Assessment Reviewer.",
      },
      {
        test: (path) => path === "/jobs",
        title: "Manage jobs",
        what: "Find and open a vacancy to continue its screening workflow.",
        why: "Each job may be at a different stage, so continue from the job you need to work on.",
        actions: [
          "Search for the relevant job.",
          "Review its displayed status and details.",
          "Open the job to access its available next actions.",
        ],
        next: "Follow the job's requirements, assign the assessment team after skill confirmation, and track progress.",
      },
      {
        test: (path) => /^\/jobs\/\d+$/.test(path),
        title: "Job details",
        what: "Review the information and workflow actions for this vacancy.",
        why: "The job's saved state determines which tasks can be completed next.",
        actions: [
          "Review the job details and current status.",
          "Look for any outstanding setup or assessment tasks.",
          "Use the available actions on the page rather than repeating completed steps.",
        ],
        next: "Complete the outstanding job tasks or monitor the assigned assessment team.",
      },
      {
        test: (path) => path.startsWith("/assessments"),
        title: "Assessments",
        what: "Review the assessment information available to your recruiter role.",
        why: "Candidate assignments and finalized scoring are different stages of the workflow.",
        actions: [
          "Find the assessment associated with your vacancy.",
          "Check its publication and candidate progress information.",
          "Follow any available assignment or result-review action.",
        ],
        next: "Track candidate submissions and outstanding scoring until the workflow is complete.",
      },
    ],
    fallback: {
      title: "HR workspace",
      what: "This page is part of your recruiter workspace.",
      why: "Your role coordinates the hiring workflow but does not replace the Manager's preparation or the Reviewer's quality check.",
      actions: [
        "Read the page heading and current status.",
        "Complete the HR action available on this page.",
        "If blocked, check the reason before proceeding.",
      ],
      next: "Return to Jobs to locate the vacancy and identify the next available task.",
    },
  },

  assessment_manager: {
    responsibility:
      "You prepare assessments for jobs assigned to you. You review the confirmed requirements, prepare questions, resolve quality issues, and follow the available review handoff.",
    pages: [
      {
        test: (path) => path === "/manager/dashboard",
        title: "Assessment Manager Dashboard",
        what: "Your starting point for work assigned to you.",
        why: "It helps you prioritize assessment preparation and identify work that needs attention.",
        actions: [
          "Review the jobs assigned to you.",
          "Open the job that needs assessment preparation.",
          "Check its confirmed skills and outstanding work.",
        ],
        next: "Open an assigned job and continue its assessment preparation.",
      },
      {
        test: (path) => path.startsWith("/manager/jobs"),
        title: "Assigned jobs",
        what: "Find the jobs for which you are responsible for preparing assessments.",
        why: "Preparation should follow the approved job requirements and confirmed skills.",
        actions: [
          "Open the assigned job.",
          "Review the requirements and assessment status.",
          "Follow the preparation actions available to you.",
        ],
        next: "Prepare and validate the questions, then follow the supported review handoff.",
      },
      {
        test: (path) =>
          /question-bank|assessment-set|question-set/i.test(path),
        title: "Assessment preparation",
        what: "Work with assessment content and questions available to your role.",
        why: "Questions need to be relevant, clear, and aligned with the required skills.",
        actions: [
          "Review the question or assessment requirements.",
          "Create or edit questions as allowed by this page.",
          "Resolve validation issues before handing the assessment over for review.",
        ],
        next: "Use the workflow action available on this page to submit or hand over the prepared assessment.",
      },
    ],
    fallback: {
      title: "Assessment Manager workspace",
      what: "This workspace supports your assigned assessment work.",
      why: "Your responsibility is assessment preparation, not recruiter-only job ownership or independent final quality approval.",
      actions: [
        "Check the page purpose and assigned work.",
        "Review the job requirements before preparing questions.",
        "Resolve outstanding preparation or validation tasks.",
      ],
      next: "Open your assigned jobs or assessment sets to continue preparation.",
    },
  },

  assessment_reviewer: {
    responsibility:
      "You independently check assessment quality. You review questions and answers, record a review decision, and communicate specific changes where needed.",
    pages: [
      {
        test: (path) => path === "/reviewer/dashboard",
        title: "Assessment Reviewer Dashboard",
        what: "Your starting point for review work assigned to you.",
        why: "It helps you identify assessments that need an independent quality decision.",
        actions: [
          "Check for assessments awaiting your review.",
          "Open the assessment requiring attention.",
          "Review its content against the job requirements.",
        ],
        next: "Inspect the questions and record the supported review decision.",
      },
      {
        test: (path) => /review|assessment-set|question-bank/i.test(path),
        title: "Assessment review",
        what: "Inspect assessment content and evaluate its quality.",
        why: "Independent review helps identify incorrect, unclear, or irrelevant questions before candidates take the assessment.",
        actions: [
          "Check the questions and answers.",
          "Check relevance and coverage against requirements.",
          "Approve or request changes using the controls provided on the page.",
        ],
        next: "If changes are requested, the Assessment Manager needs to address them before resubmission.",
      },
    ],
    fallback: {
      title: "Assessment Reviewer workspace",
      what: "This workspace supports independent assessment quality review.",
      why: "Your review helps ensure that the assessment is ready before it reaches candidates.",
      actions: [
        "Find the assessment assigned for review.",
        "Review its questions and requirements.",
        "Record a decision and give specific feedback when changes are needed.",
      ],
      next: "Return to your reviewer dashboard to find pending review work.",
    },
  },

  candidate: {
    responsibility:
      "You complete assessments assigned to you. Read the instructions, answer the questions, submit your attempt, and check its submission status.",
    pages: [
      {
        test: (path) => path === "/candidate/dashboard",
        title: "Candidate Dashboard",
        what: "Your starting point for assessments assigned to you.",
        why: "It helps you find available work and understand what needs to be completed.",
        actions: [
          "Review your available assessments and instructions.",
          "Check availability and deadline information when shown.",
          "Open an available assessment to continue.",
        ],
        next: "Read the instructions before starting an available assessment.",
      },
      {
        test: (path) => /candidate.*assessment|assessment.*candidate/i.test(path),
        title: "Candidate assessment",
        what: "Complete the assessment assigned to you.",
        why: "Your submitted answers are used for assessment evaluation.",
        actions: [
          "Read the instructions before beginning.",
          "Answer the questions and monitor progress.",
          "Review and submit your attempt using the provided controls.",
        ],
        next: "Check the submission confirmation and review results when they become available.",
      },
    ],
    fallback: {
      title: "Candidate workspace",
      what: "This area supports your candidate assessment journey.",
      why: "Following the instructions helps you complete and submit your attempt correctly.",
      actions: [
        "Open your candidate dashboard.",
        "Read the assessment instructions.",
        "Follow the available action for your current attempt.",
      ],
      next: "Check your assessment status for the next available step.",
    },
  },

  organization_admin: {
    responsibility:
      "You administer organization-level access and configuration. Use administrative controls for account and organization tasks rather than performing another role's assessment work.",
    pages: [
      {
        test: (path) => path === "/admin",
        title: "Organization administration",
        what: "Manage the organization-level controls available to your administrator role.",
        why: "Correct access and account configuration help each person use the right workspace.",
        actions: [
          "Review the available administration tasks.",
          "Confirm the account or access details before changing them.",
          "Use the relevant administrative action provided on the page.",
        ],
        next: "Return to the administrative workspace to review any outstanding organization tasks.",
      },
    ],
    fallback: {
      title: "Administrator workspace",
      what: "This page is within your authenticated organization workspace.",
      why: "Administrative tasks and assessment tasks have different responsibilities.",
      actions: [
        "Check the page purpose.",
        "Use only the administrative controls available to you.",
        "Return to the administrator workspace if you need account or access management.",
      ],
      next: "Continue with the relevant organization-level task.",
    },
  },
};

function roleName(role) {
  return ROLE_NAMES[role] || "Workspace user";
}

function getPageGuide(role, pathname) {
  const config = ROLE_GUIDES[role] || ROLE_GUIDES.recruiter;
  return config.pages.find((item) => item.test(pathname)) || config.fallback;
}

function CompassMark({ size = 28 }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className="shrink-0"
    >
      <circle cx="30" cy="35" r="23" stroke="#E0DEFF" strokeWidth="1.7" />
      <circle cx="30" cy="35" r="16" stroke="#FFFFFF" strokeWidth="1" opacity=".35" />
      <path d="M42 14 34 37 16 47 25 28Z" fill="#FFFFFF" />
      <path d="M42 14 34 37 25 28Z" fill="#BFC8FF" />
      <circle cx="30" cy="35" r="3.3" fill="#8DE5DB" stroke="#FFFFFF" strokeWidth="1.2" />
      <path d="m48 5 2.2 5.1 5.2 2.2-5.2 2.1L48 20l-2.1-5.6-5.2-2.1 5.2-2.2Z" fill="#FFFFFF" />
      <circle cx="10" cy="18" r="2.1" fill="#A8F0E5" />
    </svg>
  );
}


function renderInlineMarkdown(text, keyPrefix) {
  const tokenPattern = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*]+\*)/g;

  return String(text || "").split(tokenPattern).map((part, index) => {
    const key = `${keyPrefix}-${index}`;

    if (
      (part.startsWith("**") && part.endsWith("**")) ||
      (part.startsWith("__") && part.endsWith("__"))
    ) {
      return (
        <strong key={key} className="font-semibold text-[#29334B]">
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={key}
          className="rounded-md border border-[#E5E2F5] bg-[#F1EFFB] px-1.5 py-0.5 font-mono text-[11px] text-[#5B4BA2]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return (
        <em key={key} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }

    return part;
  });
}

function MarkdownMessage({ content }) {
  const lines = String(content || "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let paragraph = [];
  let listType = null;
  let listItems = [];
  let codeLines = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({
        type: "paragraph",
        text: paragraph.join(" ").trim(),
      });
      paragraph = [];
    }
  };

  const flushList = () => {
    if (listItems.length) {
      blocks.push({
        type: listType,
        items: [...listItems],
      });
      listItems = [];
      listType = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.startsWith("```")) {
      if (codeLines !== null) {
        blocks.push({ type: "code", text: codeLines.join("\n") });
        codeLines = null;
      } else {
        flushParagraph();
        flushList();
        codeLines = [];
      }
      continue;
    }

    if (codeLines !== null) {
      codeLines.push(rawLine);
      continue;
    }

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "heading",
        level: heading[1].length,
        text: heading[2].replace(/\s+#+\s*$/, "").trim(),
      });
      continue;
    }

    const unordered = line.match(/^[-*+]\s+(.+)$/);
    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    const item = unordered || ordered;
    const nextListType = unordered ? "unordered" : "ordered";

    if (item) {
      flushParagraph();

      if (listType && listType !== nextListType) {
        flushList();
      }

      listType = nextListType;
      listItems.push(item[1].trim());
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  if (codeLines !== null) {
    blocks.push({ type: "code", text: codeLines.join("\n") });
  }

  flushParagraph();
  flushList();

  return (
    <div className="space-y-3 break-words text-[12px] leading-[1.7] text-[#465066]">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return (
            <h3
              key={`heading-${index}`}
              className={`border-b border-[#E9E7F5] pb-1.5 font-semibold text-[#30305F] ${
                block.level === 1
                  ? "text-[14px]"
                  : block.level === 2
                    ? "text-[13px]"
                    : "text-[12px]"
              }`}
            >
              {renderInlineMarkdown(block.text, `heading-${index}`)}
            </h3>
          );
        }

        if (block.type === "unordered" || block.type === "ordered") {
          const ListTag = block.type === "ordered" ? "ol" : "ul";

          return (
            <ListTag
              key={`list-${index}`}
              className={`space-y-1.5 pl-5 marker:text-[#7862C8] ${
                block.type === "ordered" ? "list-decimal" : "list-disc"
              }`}
            >
              {block.items.map((item, itemIndex) => (
                <li key={`item-${index}-${itemIndex}`} className="pl-1">
                  {renderInlineMarkdown(item, `item-${index}-${itemIndex}`)}
                </li>
              ))}
            </ListTag>
          );
        }

        if (block.type === "code") {
          return (
            <pre
              key={`code-${index}`}
              className="overflow-x-auto rounded-lg border border-[#E4E5EF] bg-[#F5F6FA] p-3 font-mono text-[11px] leading-5 text-[#344054]"
            >
              <code>{block.text}</code>
            </pre>
          );
        }

        return (
          <p key={`paragraph-${index}`} className="whitespace-pre-wrap">
            {renderInlineMarkdown(block.text, `paragraph-${index}`)}
          </p>
        );
      })}
    </div>
  );
}

export default function ECompass() {
  const { auth, isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState("");
  const chatScrollRef = useRef(null);
  const chatEndRef = useRef(null);

  const role = String(auth?.role || "").toLowerCase();
  const path = location.pathname;
  const guide = getPageGuide(role, path);

  useEffect(() => {
    setMessages([]);
    setQuestion("");
    setChatError("");
    setSending(false);
  }, [path, role]);

  useEffect(() => {
    if (!open) return;

    // Keep the reading position when an AI answer arrives.
    // The user can scroll through a long answer manually.
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.type === "assistant") return;


    const scrollToEnd = () => {
      const container = chatScrollRef.current;
      if (!container) return;

      // Scroll only inside the chat panel, never the page behind it.
      container.scrollTop = container.scrollHeight;
    };

    let firstFrame = 0;
    let secondFrame = 0;

    // Scroll now, after the browser's next layout, and once more after
    // long answer text has been laid out inside the fixed-height panel.
    scrollToEnd();

    firstFrame = window.requestAnimationFrame(() => {
      scrollToEnd();

      secondFrame = window.requestAnimationFrame(() => {
        scrollToEnd();
      });
    });

    const finalCheck = window.setTimeout(scrollToEnd, 180);

    return () => {
      if (firstFrame) window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(finalCheck);
    };
  }, [messages, sending, chatError, open]);

  if (!isAuthenticated || !ROLE_GUIDES[role]) {
    return null;
  }

  const submitQuestion = async (value) => {
    const text = String(value || "").trim();
    if (!text || sending) return;

    const requestPath = path;
    const userMessage = {
      id: `${Date.now()}-user`,
      type: "user",
      text,
    };

    setMessages((current) => [...current, userMessage]);
    setQuestion("");
    setChatError("");
    setSending(true);

    try {
      const response = await api.post("/ecompass/chat", {
        question: text,
        current_path: path,
        page_title: guide.title,
        page_what: guide.what,
        page_why: guide.why,
        page_actions: guide.actions,
        page_next: guide.next,
        history: messages.slice(-8).map((message) => ({
          role: message.type === "user" ? "user" : "assistant",
          content: String(message.text || "").slice(0, 1500),
        })),
      });

      // Do not show a late response from a page the user has already left.
      if (window.location.pathname !== requestPath) return;

      const answer = String(response.data?.answer || "").trim();
      if (!answer) {
        throw new Error("E-Compass returned an empty answer.");
      }

      setMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-assistant`,
          type: "assistant",
          text: answer,
        },
      ]);
    } catch (error) {
      if (window.location.pathname !== requestPath) return;

      setChatError(
        error.response?.data?.detail ||
          "I couldn't reach E-Compass AI just now. Please try again."
      );
    } finally {
      setSending(false);
    }
  };

  const quickQuestions = [
    "I'm on this page. What should I do now?",
    "Why does this step matter?",
    "Explain my role and responsibilities",
  ];

  return (
    <div className="fixed bottom-5 right-5 z-[100] font-sans sm:bottom-6 sm:right-6">
      {open && (
        <section
          role="dialog"
          aria-label="E-Compass help"
          className="mb-3 flex w-[min(410px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-[22px] border border-[#E1DDF8] bg-white shadow-[0_24px_80px_rgba(37,38,74,0.22)]"
          style={{
            height: "min(620px, calc(100dvh - 112px))",
            maxHeight: "calc(100dvh - 112px)",
          }}
        >
          <header className="flex shrink-0 items-center gap-3 bg-gradient-to-r from-[#292950] via-[#403B91] to-[#5658E8] px-4 py-3.5 text-white">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/20 bg-white/10 shadow-inner">
              <span
                aria-hidden="true"
                className="absolute inset-1 rounded-lg border border-dashed border-[#C8F5EC]/45 animate-spin"
                style={{ animationDuration: "18s" }}
              />
              <span className="relative z-10 drop-shadow-[0_1px_4px_rgba(200,245,236,0.35)]">
                <CompassMark size={30} />
              </span>
              <span aria-hidden="true" className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#A6F0E3] shadow-[0_0_8px_rgba(166,240,227,0.75)]" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold tracking-wide">E-Compass</h2>
              <p className="mt-0.5 text-[10px] text-white/75">
                Your guide through Evalyn
              </p>
              <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#C8F5EC]">
                {roleName(role)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close E-Compass"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/80 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/50"
            >
              <X size={17} />
            </button>
          </header>

          <div ref={chatScrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-[#F8F9FD] p-3.5">
            <div className="rounded-xl border border-[#E3E0F7] bg-white p-3.5">
              <div className="flex items-start gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#EEEBFF] text-[#6554C0]">
                  <BookOpen size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#7669B7]">
                    Your guide · Current page
                  </p>
                  <h3 className="mt-1 text-sm font-bold text-[#252642]">
                    {guide.title}
                  </h3>
                  <p className="mt-1.5 text-[11px] leading-5 text-[#626A7C]">
                    {guide.what}
                  </p>
                </div>
              </div>

              <div className="mt-3 rounded-lg bg-[#F5F3FF] p-2.5">
                <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[#6554C0]">
                  <Lightbulb size={12} />
                  Why it matters
                </p>
                <p className="mt-1 text-[11px] leading-5 text-[#595D76]">
                  {guide.why}
                </p>
              </div>

              <div className="mt-3">
                <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[#6554C0]">
                  <ListChecks size={12} />
                  What to do now
                </p>
                <ol className="mt-2 space-y-2">
                  {guide.actions.map((item, index) => (
                    <li
                      key={`${guide.title}-${index}`}
                      className="flex items-start gap-2 text-[11px] leading-5 text-[#4F596B]"
                    >
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#ECE9FF] text-[9px] font-bold text-[#6554C0]">
                        {index + 1}
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="mt-3 rounded-lg border border-[#D8EBE4] bg-[#F0F9F5] p-2.5">
                <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[#16745F]">
                  <ArrowDownRight size={13} />
                  What happens next
                </p>
                <p className="mt-1 text-[11px] leading-5 text-[#48695F]">
                  {guide.next}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-[#E3E6EF] bg-white p-3">
              <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold text-[#596176]">
                <MessageCircle size={13} />
                Ask E-Compass
              </p>
              <div className="flex flex-wrap gap-1.5">
                {quickQuestions.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    disabled={sending}
                    onClick={() => submitQuestion(prompt)}
                    className="rounded-full border border-[#E4E1F4] bg-[#FAF9FF] px-2.5 py-1.5 text-[9px] font-medium leading-4 text-[#6554A9] transition hover:border-[#BDB5EB] hover:bg-[#F0EDFF] focus:outline-none focus:ring-2 focus:ring-[#7A61D8]/20"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              {messages.length > 0 && (
                <div className="mt-3 space-y-2.5 border-t border-[#EEF0F5] pt-3">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[92%] break-words rounded-xl px-3 py-2 text-[11px] leading-5 ${
                          message.type === "user"
                            ? "bg-[#5658E8] text-white"
                            : "border border-[#E7E4F5] bg-[#F8F7FF] text-[#465066]"
                        }`}
                      >
                        {message.type === "assistant" ? (
                          <MarkdownMessage content={message.text} />
                        ) : (
                          message.text
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {sending && (
                <div
                  role="status"
                  aria-live="polite"
                  className="mt-3 flex items-center gap-2 rounded-lg bg-[#F3F1FF] px-3 py-2.5 text-[11px] text-[#5F568D]"
                >
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[#6554C0]" />
                  E-Compass is thinking about your question…
                </div>
              )}

              {chatError && (
                <div
                  role="alert"
                  className="mt-3 rounded-lg border border-[#EBCACA] bg-[#FFF5F5] px-3 py-2.5 text-[11px] leading-5 text-[#A83E3E]"
                >
                  {chatError}
                  <button
                    type="button"
                    onClick={() => submitQuestion(messages.at(-1)?.text || question)}
                    disabled={sending || !(messages.at(-1)?.text || question).trim()}
                    className="ml-2 font-bold underline disabled:opacity-50"
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Composer moved to the fixed footer below. */}
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    navigate("/handbook");
                  }}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-[#DDD8F7] bg-[#FAF9FF] px-3 text-[10px] font-semibold text-[#5A50B8] transition hover:border-[#BDB6EB] hover:bg-[#F0EDFF] focus:outline-none focus:ring-2 focus:ring-[#7A61D8]/20"
                >
                  <BookOpen size={12} />
                  Open my role handbook
                  <ArrowRight size={12} />
                </button>
              </div>

              <p className="mt-2 text-[9px] leading-4 text-[#9299A9]">
                Answers use this page and your role's workflow guide. E-Compass
                cannot inspect unsaved form values or diagnose private server
                errors.
              </p>
            </div>
            <div
              ref={chatEndRef}
              aria-hidden="true"
              className="h-px w-full shrink-0"
            />
          </div>

          <div className="shrink-0 border-t border-[#E6E8F1] bg-white px-3.5 pb-3.5 pt-2.5">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                submitQuestion(question);
              }}
              className="flex items-center gap-2 rounded-xl border border-[#DDE1EA] bg-[#FBFCFE] p-1.5 transition focus-within:border-[#8D82E5] focus-within:ring-2 focus-within:ring-[#7A61D8]/10"
            >
              <input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                disabled={sending}
                aria-label="Ask E-Compass a question"
                placeholder="Ask what to do on this page…"
                className="min-w-0 flex-1 bg-transparent px-2 py-2 text-xs text-[#344054] outline-none placeholder:text-[#98A2B3]"
              />
              <button
                type="submit"
                disabled={!question.trim() || sending}
                aria-label="Send question"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#5658E8] text-white shadow-sm transition hover:bg-[#4648C9] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send size={15} />
              </button>
            </form>
            {sending && (
              <p role="status" aria-live="polite" className="mt-2 flex items-center gap-2 px-1 text-[10px] text-[#6554C0]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#6554C0]" />
                E-Compass is preparing your answer…
              </p>
            )}
          </div>
        </section>
      )}

      <div className="group relative flex justify-end">
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full right-0 mb-3 hidden w-max max-w-[250px] rounded-xl border border-[#E4E1F5] bg-white px-3.5 py-2.5 text-left shadow-[0_10px_30px_rgba(37,38,74,0.14)] group-hover:block group-focus-within:block"
        >
          <span className="block text-xs font-bold text-[#302D68]">
            Need a little direction?
          </span>
          <span className="mt-0.5 block text-[10px] text-[#697086]">
            Ask E-Compass what to do next.
          </span>
        </span>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={open ? "Close E-Compass help" : "Open E-Compass help"}
          className={`flex h-[58px] items-center gap-2.5 rounded-full border px-4 shadow-[0_10px_32px_rgba(59,52,151,0.27)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_15px_40px_rgba(59,52,151,0.34)] focus:outline-none focus:ring-4 focus:ring-[#7A61D8]/25 ${
            open
              ? "border-[#4840B8] bg-[#39348D] text-white"
              : "border-white/50 bg-gradient-to-br from-[#7168F4] via-[#5952E1] to-[#4038B4] text-white"
          }`}
        >
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/25 bg-white/10 shadow-inner">
            <span
              aria-hidden="true"
              className="absolute inset-[3px] rounded-full border border-dashed border-white/60 animate-spin"
              style={{ animationDuration: "14s" }}
            />
            <span className="relative z-10 drop-shadow-[0_1px_4px_rgba(255,255,255,0.25)]">
              <CompassMark size={27} />
            </span>
            <span aria-hidden="true" className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[#A6F0E3] shadow-[0_0_7px_rgba(166,240,227,0.8)]" />
          </span>
          <span className="text-left">
            <span className="block text-sm font-bold tracking-wide">E-Compass</span>
            <span className="mt-0.5 block text-[9px] font-medium text-white/80">
              Your Evalyn guide
            </span>
          </span>
          {!open && (
            <span className="ml-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#A6F0E3] text-[#26356D]">
              <Sparkles size={12} />
            </span>
          )}
          {open && <ChevronRight size={15} className="rotate-90" />}
        </button>
      </div>
    </div>
  );
}
