import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Eye,
  LoaderCircle,
  LogOut,
  Send,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import QuestionText from "../components/QuestionText";

const FOCUS_EVENT_DEDUP_MS = 1200;
const SAME_EVENT_DEDUP_MS = 700;

const PROCTOR_WARNING_MESSAGES = {
  tab_hidden:
    "You switched away from the assessment tab. Return to this page and keep it open until you submit.",
  fullscreen_exit:
    "You exited fullscreen mode. Restore fullscreen to continue your assessment.",
  window_blur:
    "The assessment window lost focus. Keep the assessment window active while you work.",
  copy_attempt:
    "A copy action was detected. This event has been recorded under the assessment monitoring rules.",
  cut_attempt:
    "A cut action was detected. This event has been recorded under the assessment monitoring rules.",
  paste_attempt:
    "A paste action was detected. This event has been recorded under the assessment monitoring rules.",
  context_menu:
    "A browser context-menu action was detected. This event has been recorded under the assessment monitoring rules.",
};

function formatDuration(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function formatDate(value) {
  if (!value) return "Not scheduled";

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Not scheduled";
  }

  return parsed.toLocaleString();
}

function CandidateAssessment() {
  const { assessmentId } = useParams();
  const navigate = useNavigate();
  const { auth, logout } = useAuth();

  const [assessment, setAssessment] = useState(null);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState("idle");
  const [fullscreenWarning, setFullscreenWarning] = useState("");
  const [now, setNow] = useState(Date.now());

  const [proctoringWarningCount, setProctoringWarningCount] = useState(0);
  const [latestWarning, setLatestWarning] = useState(null);
  const [fullscreenLock, setFullscreenLock] = useState(false);
  const [monitoringSyncError, setMonitoringSyncError] = useState("");

  const submitInFlight = useRef(false);
  const isInFullscreen = useRef(false);
  const violationCountRef = useRef(0);
  const lastEventTimesRef = useRef({});
  const lastFocusEventAtRef = useRef(0);

  const loadAssessment = async ({ showLoader = true } = {}) => {
    try {
      if (showLoader) setLoading(true);

      setError("");

      const response = await api.get(`/assessments/${assessmentId}`);

      setAssessment(response.data);
      setAnswers(response.data?.answers || {});
    } catch (err) {
      console.error("Failed to load assessment:", err);

      if (err.response?.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }

      setError(
        err.response?.data?.detail ||
          "Unable to load this assessment."
      );
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  useEffect(() => {
    void loadAssessment();

    // Initial load follows the current assessment route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentId]);

  const isAttemptActive =
    assessment?.attempt_status === "in_progress" &&
    Boolean(assessment?.attempt_id);

  const isSubmitted =
    Boolean(assessment?.attempt_id) &&
    ["submitted", "completed"].includes(assessment?.attempt_status);

  const isExpired =
    Boolean(assessment?.attempt_id) &&
    assessment?.attempt_status === "expired";

  const canStart =
    assessment?.attempt_status === "assigned" &&
    assessment?.window_status === "open";

  const remainingSeconds =
    isAttemptActive && assessment?.expires_at
      ? Math.max(
          0,
          Math.ceil(
            (new Date(assessment.expires_at).getTime() - now) / 1000
          )
        )
      : 0;

  useEffect(() => {
    if (!isAttemptActive || !assessment?.expires_at) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isAttemptActive, assessment?.expires_at]);

  // Prevent page scrolling when a warning or fullscreen lock is active.
  useEffect(() => {
    if (!latestWarning && !fullscreenLock) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [latestWarning, fullscreenLock]);

  const recordProctoringEvent = useCallback(
    async (eventType) => {
      try {
        await api.post(
          `/assessments/${assessmentId}/proctor-events`,
          {
            event_type: eventType,
          }
        );

        setMonitoringSyncError("");
        return true;
      } catch (err) {
        console.warn(
          "Unable to record proctoring event:",
          eventType,
          err
        );

        setMonitoringSyncError(
          "A monitoring event could not be saved to the server. Keep this page open and contact your recruiter if the problem continues."
        );

        return false;
      }
    },
    [assessmentId]
  );

  const registerViolation = useCallback(
    (eventType) => {
      const eventTime = Date.now();

      const isFocusEvent = [
        "tab_hidden",
        "window_blur",
        "fullscreen_exit",
      ].includes(eventType);

      // Avoid counting near-simultaneous browser focus signals twice.
      if (
        isFocusEvent &&
        eventTime - lastFocusEventAtRef.current <
          FOCUS_EVENT_DEDUP_MS
      ) {
        return;
      }

      if (isFocusEvent) {
        lastFocusEventAtRef.current = eventTime;
      }

      const previousEventTime =
        lastEventTimesRef.current[eventType] || 0;

      if (
        !isFocusEvent &&
        eventTime - previousEventTime < SAME_EVENT_DEDUP_MS
      ) {
        return;
      }

      lastEventTimesRef.current[eventType] = eventTime;

      const nextCount = violationCountRef.current + 1;
      violationCountRef.current = nextCount;
      setProctoringWarningCount(nextCount);

      setLatestWarning({
        id: `${eventType}-${eventTime}`,
        eventType,
        count: nextCount,
        message:
          PROCTOR_WARNING_MESSAGES[eventType] ||
          "An assessment monitoring rule was triggered.",
        occurredAt: new Date(eventTime).toISOString(),
      });

      void recordProctoringEvent(eventType);
    },
    [recordProctoringEvent]
  );

  // Restore the warning count for this attempt from the server.
  useEffect(() => {
    if (!isAttemptActive) return undefined;

    let cancelled = false;

    const loadPersistedWarningCount = async () => {
      try {
        const response = await api.get(
          `/assessments/${assessmentId}/proctor-events`
        );

        if (cancelled) return;

        const serverCount = Math.max(
          0,
          Number(response.data?.violation_count || 0)
        );

        const count = Math.max(
          violationCountRef.current,
          serverCount
        );

        violationCountRef.current = count;
        setProctoringWarningCount(count);
      } catch (err) {
        if (!cancelled) {
          console.warn(
            "Unable to load the saved proctoring warning count:",
            err
          );
        }
      }
    };

    void loadPersistedWarningCount();

    return () => {
      cancelled = true;
    };
  }, [assessmentId, isAttemptActive]);

  // Try to activate fullscreen automatically for an active attempt.
  useEffect(() => {
    if (!isAttemptActive) return undefined;

    let cancelled = false;

    const ensureFullscreen = async () => {
      if (document.fullscreenElement) {
        isInFullscreen.current = true;
        setFullscreenLock(false);
        setFullscreenWarning("");
        return;
      }

      isInFullscreen.current = false;
      setFullscreenLock(true);

      setLatestWarning((current) => {
        if (current) return current;

        return {
          id: `fullscreen-required-${Date.now()}`,
          eventType: "fullscreen_required",
          count: violationCountRef.current,
          message:
            "Fullscreen mode is not active. Restore fullscreen to continue the assessment.",
          occurredAt: new Date().toISOString(),
        };
      });

      try {
        if (
          typeof document.documentElement.requestFullscreen !== "function"
        ) {
          throw new Error("Fullscreen API is unavailable.");
        }

        // Browsers may require an explicit user gesture for this request.
        await document.documentElement.requestFullscreen();

        if (cancelled) return;

        isInFullscreen.current = Boolean(document.fullscreenElement);

        if (isInFullscreen.current) {
          setFullscreenLock(false);
          setFullscreenWarning("");

          setLatestWarning((current) =>
            current?.eventType === "fullscreen_required"
              ? null
              : current
          );
        }
      } catch {
        if (!cancelled) {
          setFullscreenLock(true);
        }
      }
    };

    void ensureFullscreen();

    return () => {
      cancelled = true;
    };
  }, [isAttemptActive, assessmentId]);

  // Listen for tab, focus, fullscreen, copy, cut, paste and context-menu events.
  useEffect(() => {
    if (!isAttemptActive) return undefined;

    if (document.fullscreenElement) {
      isInFullscreen.current = true;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        registerViolation("tab_hidden");
      }
    };

    const handleFullscreenChange = () => {
      if (document.fullscreenElement) {
        isInFullscreen.current = true;
        setFullscreenLock(false);
        return;
      }

      if (!isInFullscreen.current) return;

      isInFullscreen.current = false;

      // Leaving fullscreen during submission is intentional.
      if (submitInFlight.current) return;

      setFullscreenLock(true);
      registerViolation("fullscreen_exit");

      // Attempt automatic recovery, then retain the lock if the browser
      // requires the candidate to make a direct gesture.
      try {
        const request =
          document.documentElement.requestFullscreen();

        Promise.resolve(request)
          .then(() => {
            isInFullscreen.current = Boolean(document.fullscreenElement);

            if (document.fullscreenElement) {
              setFullscreenLock(false);
              setFullscreenWarning("");
            }
          })
          .catch(() => {
            setFullscreenLock(true);
          });
      } catch {
        setFullscreenLock(true);
      }
    };

    const handleWindowBlur = () => {
      if (document.visibilityState !== "hidden") {
        registerViolation("window_blur");
      }
    };

    const handleCopy = () => registerViolation("copy_attempt");
    const handleCut = () => registerViolation("cut_attempt");
    const handlePaste = () => registerViolation("paste_attempt");
    const handleContextMenu = () => registerViolation("context_menu");

    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    window.addEventListener("blur", handleWindowBlur);
    document.addEventListener("copy", handleCopy, true);
    document.addEventListener("cut", handleCut, true);
    document.addEventListener("paste", handlePaste, true);
    document.addEventListener("contextmenu", handleContextMenu, true);

    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
      document.removeEventListener(
        "fullscreenchange",
        handleFullscreenChange
      );
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("copy", handleCopy, true);
      document.removeEventListener("cut", handleCut, true);
      document.removeEventListener("paste", handlePaste, true);
      document.removeEventListener("contextmenu", handleContextMenu, true);
    };
  }, [isAttemptActive, registerViolation]);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const handleStart = async () => {
    if (!canStart || starting) return;

    setStarting(true);
    setError("");
    setFullscreenWarning("");
    setLatestWarning(null);

    try {
      // Do not create the timed attempt if fullscreen cannot be enabled.
      try {
        if (
          typeof document.documentElement.requestFullscreen !== "function"
        ) {
          throw new Error("Fullscreen API is unavailable.");
        }

        await document.documentElement.requestFullscreen();
        isInFullscreen.current = true;
        setFullscreenLock(false);
      } catch {
        setFullscreenLock(true);

        setFullscreenWarning(
          "Fullscreen could not be enabled. Your assessment has not started. Click Restore fullscreen and allow the browser to enter fullscreen."
        );

        setLatestWarning({
          id: `fullscreen-start-${Date.now()}`,
          eventType: "fullscreen_required",
          count: violationCountRef.current,
          message:
            "Fullscreen is required before the timed assessment can begin.",
          occurredAt: new Date().toISOString(),
        });

        return;
      }

      const started = await api.post(
        `/assessments/${assessmentId}/start`
      );

      if (started.data?.status === "submitted") {
        await loadAssessment({ showLoader: false });
        return;
      }

      await loadAssessment({ showLoader: false });
      setNow(Date.now());
    } catch (err) {
      console.error("Failed to start assessment:", err);

      if (document.fullscreenElement && document.exitFullscreen) {
        try {
          await document.exitFullscreen();
        } catch {
          // Preserve the original start error.
        }
      }

      setError(
        err.response?.data?.detail ||
          "Unable to start this assessment."
      );
    } finally {
      setStarting(false);
    }
  };

  const handleReturnToFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (
          typeof document.documentElement.requestFullscreen !== "function"
        ) {
          throw new Error("Fullscreen API is unavailable.");
        }

        await document.documentElement.requestFullscreen();
      }

      isInFullscreen.current = Boolean(document.fullscreenElement);

      if (!isInFullscreen.current) {
        throw new Error("Fullscreen was not activated.");
      }

      setFullscreenLock(false);
      setFullscreenWarning("");
      setLatestWarning(null);
    } catch {
      setFullscreenLock(true);

      setFullscreenWarning(
        "The browser did not allow fullscreen to be restored. Click the button again and allow fullscreen. The assessment remains blocked until fullscreen is restored."
      );
    }
  };

  const handleWarningAcknowledge = () => {
    if (fullscreenLock && !document.fullscreenElement) {
      setFullscreenWarning(
        "Fullscreen must be restored before you can continue answering."
      );
      return;
    }

    setLatestWarning(null);
    setFullscreenWarning("");
  };

  const handleAnswerChange = async (questionId, answerText) => {
    setAnswers((current) => ({
      ...current,
      [String(questionId)]: answerText,
    }));

    setSaveState("saving");

    try {
      await api.put(
        `/assessments/${assessmentId}/answers/${questionId}`,
        { answer_text: answerText }
      );

      setSaveState("saved");
    } catch (err) {
      console.error("Failed to save answer:", err);
      setSaveState("unsaved");
    }
  };

  const handleSubmit = async (automatic = false) => {
    if (!isAttemptActive || submitInFlight.current) return;

    if (
      !automatic &&
      !window.confirm(
        "Submit your assessment now? You cannot change your answers after submission."
      )
    ) {
      return;
    }

    submitInFlight.current = true;
    setSubmitting(true);
    setError("");

    try {
      // Save current answers before a manual submission.
      if (!automatic && remainingSeconds > 0) {
        for (const [questionId, answerText] of Object.entries(answers)) {
          await api.put(
            `/assessments/${assessmentId}/answers/${questionId}`,
            { answer_text: answerText }
          );
        }
      }

      await api.post(`/assessments/${assessmentId}/submit`);
      await loadAssessment({ showLoader: false });

      if (document.fullscreenElement && document.exitFullscreen) {
        try {
          await document.exitFullscreen();
        } catch {
          // Submission already completed.
        }
      }
    } catch (err) {
      console.error("Failed to submit assessment:", err);

      setError(
        err.response?.data?.detail ||
          "Unable to submit the assessment. Your saved answers remain available; please retry."
      );

      submitInFlight.current = false;
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (
      isAttemptActive &&
      remainingSeconds <= 0 &&
      !submitInFlight.current
    ) {
      void handleSubmit(true);
    }

    // Submit when the server-provided deadline is reached.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAttemptActive, remainingSeconds]);

  const handleBack = () => navigate("/candidate/dashboard");

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F8FC]">
        <div className="text-center">
          <LoaderCircle
            size={32}
            className="mx-auto animate-spin text-[#5658E8]"
          />
          <p className="mt-3 text-sm text-[#697087]">
            Loading assessment...
          </p>
        </div>
      </div>
    );
  }

  if (error && !assessment) {
    return (
      <div className="min-h-screen bg-[#F5F8FC] px-5 py-10">
        <div className="mx-auto max-w-2xl rounded-2xl border border-[#DDE1EF] bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-semibold text-[#26284F]">
            Assessment unavailable
          </h1>

          <p className="mt-3 text-sm leading-6 text-[#697087]">
            {error}
          </p>

          <button
            type="button"
            onClick={handleBack}
            className="mt-6 rounded-xl bg-[#5658E8] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#4547B7]"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  const questions = Array.isArray(assessment?.questions)
    ? assessment.questions
    : [];

  const showWarningModal =
    Boolean(latestWarning) ||
    (fullscreenLock && (isAttemptActive || canStart));

  const fullscreenRequired =
    fullscreenLock && (isAttemptActive || canStart);

  const modalWarning = latestWarning || {
    id: "fullscreen-required",
    eventType: "fullscreen_required",
    count: violationCountRef.current,
    message: "Fullscreen is required to continue the assessment.",
    occurredAt: new Date().toISOString(),
  };

  return (
    <div className="min-h-screen bg-[#F5F8FC] text-[#26284F]">
      {/* Evalyn candidate header */}
      <header className="border-b border-[#E1E4EF] bg-white">
        <div className="mx-auto flex min-h-[72px] max-w-[1200px] items-center justify-between gap-3 px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#26284F] to-[#5658E8] text-white shadow-sm">
              <ClipboardCheck size={20} />
            </div>

            <div>
              <div className="text-xl font-bold tracking-tight text-[#26284F]">
                Evalyn
              </div>
              <p className="text-xs text-[#7C8499]">
                Candidate Workspace
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isAttemptActive && (
              <div
                className={`flex items-center gap-2 rounded-xl px-3 py-2 font-mono text-sm font-bold ${
                  remainingSeconds <= 300
                    ? "border border-[#F1D2D8] bg-[#FFF1F3] text-[#AE405A]"
                    : "border border-[#E2E1FC] bg-[#F4F3FF] text-[#5658E8]"
                }`}
                aria-live="polite"
              >
                <Clock3 size={16} />
                {formatDuration(remainingSeconds)}
              </div>
            )}

            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-[#26284F]">
                {auth?.username || "Candidate"}
              </p>
              <p className="text-xs text-[#7C8499]">
                ID: {auth?.user_id ?? "—"}
              </p>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E1E4EF] bg-white px-3 text-sm font-medium text-[#555D79] transition hover:border-[#B7B8F2] hover:text-[#5658E8]"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1000px] px-5 py-8 sm:px-8">
        <button
          type="button"
          onClick={handleBack}
          disabled={isAttemptActive}
          className="inline-flex items-center gap-2 text-sm font-medium text-[#737B93] transition hover:text-[#5658E8] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowLeft size={16} />
          Back to dashboard
        </button>

        {error && (
          <div
            role="alert"
            className="mt-5 rounded-xl border border-[#F0D2D7] bg-[#FFF5F6] p-4 text-sm text-[#A44157]"
          >
            {error}
          </div>
        )}

        {fullscreenWarning &&
          !isSubmitted &&
          !isExpired &&
          !fullscreenLock && (
            <div
              role="status"
              className="mt-5 rounded-xl border border-[#DCD9FB] bg-[#F6F5FF] p-4 text-sm text-[#5550A8]"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle
                  size={18}
                  className="mt-0.5 shrink-0 text-[#5658E8]"
                />
                <p>{fullscreenWarning}</p>
              </div>
            </div>
          )}

        {isSubmitted ? (
          <section className="mt-6 rounded-[28px] border border-[#E1E4EF] bg-white p-8 shadow-[0_12px_36px_rgba(38,40,79,0.06)] sm:p-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F0EFFF] text-[#5658E8]">
              <CheckCircle2 size={28} />
            </div>

            <h1 className="mt-5 text-3xl font-bold tracking-tight text-[#26284F]">
              Assessment submitted
            </h1>

            <p className="mt-3 text-sm leading-7 text-[#697087]">
              Your responses have been submitted successfully. You can
              return to your candidate dashboard.
            </p>

            {assessment?.submitted_at && (
              <p className="mt-2 text-xs text-[#838AA0]">
                Submitted: {formatDate(assessment.submitted_at)}
              </p>
            )}

            <button
              type="button"
              onClick={handleBack}
              className="mt-7 rounded-xl bg-[#5658E8] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#4547B7] focus:outline-none focus:ring-4 focus:ring-[#5658E8]/20"
            >
              Return to dashboard
            </button>
          </section>
        ) : isExpired ? (
          <section className="mt-6 rounded-[28px] border border-[#E1E4EF] bg-white p-8 shadow-[0_12px_36px_rgba(38,40,79,0.06)]">
            <h1 className="text-3xl font-bold text-[#26284F]">
              Assessment attempt expired
            </h1>

            <p className="mt-3 text-sm leading-7 text-[#697087]">
              This attempt has expired. Please contact your recruiter if
              you believe you need assistance.
            </p>
          </section>
        ) : isAttemptActive ? (
          <>
            {/* Assessment overview */}
            <section className="mt-6 rounded-[28px] border border-[#E1E4EF] bg-white p-6 shadow-[0_12px_36px_rgba(38,40,79,0.055)] sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#5658E8]">
                    Assessment in progress
                  </p>

                  <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight text-[#26284F]">
                    {assessment?.title}
                  </h1>

                  <p className="mt-2 text-sm leading-6 text-[#697087]">
                    Your responses are saved as you answer. Your deadline
                    is based on the server-side timer.
                  </p>
                </div>

                <div className="flex items-center gap-2 rounded-xl border border-[#E2E1FC] bg-[#F4F3FF] px-3 py-2 text-xs font-semibold text-[#5658E8]">
                  <ShieldCheck size={16} />
                  Browser monitoring active
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-[#ECEEF5] pt-4 text-xs text-[#7C8499]">
                <span>{questions.length} questions</span>

                <span aria-live="polite">
                  {saveState === "saving"
                    ? "Saving answer..."
                    : saveState === "saved"
                      ? "Answers saved"
                      : saveState === "unsaved"
                        ? "Answer save failed — change your answer to retry"
                        : "Autosave ready"}
                </span>
              </div>
            </section>

            {/* Candidate warning count */}
            <section
              className={`mt-5 rounded-2xl border p-4 sm:p-5 ${
                proctoringWarningCount > 0
                  ? "border-[#DCD9FB] bg-[#F7F6FF]"
                  : "border-[#E1E4EF] bg-white"
              }`}
              aria-live="polite"
            >
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    proctoringWarningCount > 0
                      ? "bg-[#EAE8FF] text-[#5658E8]"
                      : "bg-[#F0EFFF] text-[#5658E8]"
                  }`}
                >
                  {proctoringWarningCount > 0 ? (
                    <ShieldAlert size={19} />
                  ) : (
                    <ShieldCheck size={19} />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-bold text-[#26284F]">
                      Recorded monitoring events
                    </h2>

                    <span className="inline-flex min-w-8 items-center justify-center rounded-full bg-[#EAE8FF] px-2.5 py-1 text-xs font-bold text-[#5658E8]">
                      {proctoringWarningCount}
                    </span>
                  </div>

                  <p className="mt-1 text-xs leading-5 text-[#737B93]">
                    Events are saved for this attempt and made available to
                    authorized reviewers. A recorded signal is context for
                    review, not proof of misconduct.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full border border-[#D9E7E2] bg-white px-2.5 py-1 text-[10px] font-medium text-[#536A64]">
                      Tab &amp; window focus
                    </span>
                    <span className="rounded-full border border-[#D9E7E2] bg-white px-2.5 py-1 text-[10px] font-medium text-[#536A64]">
                      Fullscreen changes
                    </span>
                    <span className="rounded-full border border-[#D9E7E2] bg-white px-2.5 py-1 text-[10px] font-medium text-[#536A64]">
                      Copy / cut / paste attempts
                    </span>
                  </div>

                  {monitoringSyncError && (
                    <p
                      role="status"
                      className="mt-2 text-xs font-medium text-[#A44157]"
                    >
                      {monitoringSyncError}
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* Questions */}
            <section className="mt-5 space-y-4">
              {questions.length === 0 ? (
                <div className="rounded-2xl border border-[#E8DDF6] bg-white p-6 text-sm text-[#697087]">
                  No questions are available for this assessment. Please
                  contact your recruiter.
                </div>
              ) : (
                questions.map((question, index) => {
                  const key = String(question.question_id);
                  const value = answers[key] ?? "";

                  const isMcq = String(question.question_type || "")
                    .toUpperCase()
                    .includes("MCQ");

                  const options = Array.isArray(question.options)
                    ? question.options
                    : [];

                  return (
                    <article
                      key={question.id || question.question_id}
                      className="rounded-2xl border border-[#E1E4EF] bg-white p-6 shadow-[0_8px_24px_rgba(38,40,79,0.035)] sm:p-7"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#5658E8]">
                          Question {index + 1} of {questions.length}
                        </p>

                        <span className="rounded-full bg-[#F1F2F8] px-3 py-1 text-xs font-medium text-[#68708A]">
                          {question.difficulty || question.question_type}
                        </span>
                      </div>

                      <QuestionText
                        text={question.question_text}
                        className="mt-3 text-lg font-semibold leading-7 text-[#26284F]"
                      />

                      {isMcq && options.length > 0 ? (
                        <div className="mt-5 space-y-3">
                          {options.map((option, optionIndex) => {
                            const optionValue = String(option);
                            const selected = value === optionValue;

                            return (
                              <label
                                key={`${question.question_id}-${optionIndex}`}
                                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
                                  selected
                                    ? "border-[#7778EE] bg-[#F3F2FF] shadow-[0_0_0_1px_rgba(86,88,232,0.06)]"
                                    : "border-[#E1E4EF] hover:border-[#B8B9F2] hover:bg-[#FAFAFF]"
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`question-${question.question_id}`}
                                  value={optionValue}
                                  checked={selected}
                                  onChange={(event) =>
                                    handleAnswerChange(
                                      question.question_id,
                                      event.target.value
                                    )
                                  }
                                  className="mt-1 accent-[#5658E8]"
                                />

                                <span className="text-sm leading-6 text-[#424967]">
                                  {optionValue}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <textarea
                          value={value}
                          onChange={(event) =>
                            handleAnswerChange(
                              question.question_id,
                              event.target.value
                            )
                          }
                          rows={5}
                          maxLength={10000}
                          placeholder="Write your answer here..."
                          className="mt-5 w-full rounded-xl border border-[#E1E4EF] bg-white p-4 text-sm leading-6 text-[#26284F] outline-none transition placeholder:text-[#9AA0B2] focus:border-[#7778EE] focus:ring-4 focus:ring-[#5658E8]/10"
                        />
                      )}
                    </article>
                  );
                })
              )}
            </section>

            {/* Submit */}
            <div className="mt-6 flex flex-col items-start justify-between gap-4 rounded-2xl border border-[#E1E4EF] bg-white p-5 sm:flex-row sm:items-center">
              <p className="max-w-xl text-xs leading-5 text-[#7C8499]">
                Monitoring logs observable tab visibility, fullscreen exits,
                window focus, copy, cut, paste, and context-menu events. It
                does not record clipboard contents or webcam video.
              </p>

              <button
                type="button"
                onClick={() => void handleSubmit(false)}
                disabled={submitting}
                className="inline-flex min-w-[170px] items-center justify-center gap-2 rounded-xl bg-[#5658E8] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#4547B7] focus:outline-none focus:ring-4 focus:ring-[#5658E8]/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? (
                  <LoaderCircle size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}

                {submitting ? "Submitting..." : "Submit assessment"}
              </button>
            </div>
          </>
        ) : (
          /* Candidate invitation */
          <section className="mt-6 rounded-[28px] border border-[#E1E4EF] bg-white p-6 shadow-[0_16px_45px_rgba(38,40,79,0.06)] sm:p-8">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#5658E8]">
              Assessment invitation
            </p>

            <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-[#26284F]">
              {assessment?.title || "Your assessment"}
            </h1>

            <p className="mt-3 text-sm leading-7 text-[#697087]">
              Review the details below. Opening this page does not start
              an attempt or timer. The timed attempt begins only when
              you select <strong>Start Assessment</strong>.
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-2xl border border-[#E8E7FB] bg-[#F7F6FF] p-4">
                <p className="text-xs font-medium text-[#737B93]">
                  Questions
                </p>
                <p className="mt-1 text-xl font-bold text-[#26284F]">
                  {assessment?.question_count ?? 0}
                </p>
              </div>

              <div className="rounded-2xl border border-[#E8E7FB] bg-[#F7F6FF] p-4">
                <p className="text-xs font-medium text-[#737B93]">
                  Time limit
                </p>
                <p className="mt-1 text-xl font-bold text-[#26284F]">
                  {assessment?.duration_minutes
                    ? `${assessment.duration_minutes} minutes`
                    : "Not configured"}
                </p>
              </div>

              <div className="rounded-2xl border border-[#E8E7FB] bg-[#F7F6FF] p-4">
                <p className="text-xs font-medium text-[#737B93]">
                  Availability
                </p>
                <p className="mt-1 text-sm font-bold text-[#26284F]">
                  {assessment?.window_status === "not_open"
                    ? "Not open yet"
                    : assessment?.window_status === "closed"
                      ? "Window closed"
                      : "Open"}
                </p>
              </div>
            </div>

            {(assessment?.opens_at || assessment?.closes_at) && (
              <div className="mt-5 grid gap-3 rounded-2xl border border-[#E1E4EF] p-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-[#7C8499]">Opens</p>
                  <p className="mt-1 text-sm font-medium text-[#424967]">
                    {formatDate(assessment?.opens_at)}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-[#7C8499]">Closes</p>
                  <p className="mt-1 text-sm font-medium text-[#424967]">
                    {formatDate(assessment?.closes_at)}
                  </p>
                </div>
              </div>
            )}

            {assessment?.candidate_instructions && (
              <div className="mt-5 rounded-2xl border border-[#E1E4EF] p-5">
                <h2 className="font-bold text-[#26284F]">
                  Instructions
                </h2>

                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#697087]">
                  {assessment.candidate_instructions}
                </p>
              </div>
            )}

            <section className="mt-6 overflow-hidden rounded-2xl border border-[#D9E6E1] bg-white">
              <div className="flex items-start gap-3 bg-[#F5F9F7] p-5 sm:p-6">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E2F0EB] text-[#17655E]">
                  <ShieldCheck size={19} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#17655E]">
                    Assessment integrity
                  </p>
                  <h2 className="mt-1 text-lg font-bold text-[#263B36]">
                    What this assessment monitors
                  </h2>
                  <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[#647570]">
                    Evalyn records a limited set of browser events while your timed attempt is active. The events can be reviewed by authorized assessment staff.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 border-b border-[#E9EFEC] p-4 sm:grid-cols-3 sm:p-5">
                <div className="rounded-xl border border-[#E1EBE7] bg-white p-3.5">
                  <div className="flex items-center gap-2 text-[#17655E]">
                    <Eye size={15} />
                    <h3 className="text-xs font-bold">Focus &amp; visibility</h3>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[#71807B]">
                    Tab visibility changes and assessment-window focus loss.
                  </p>
                </div>

                <div className="rounded-xl border border-[#E1EBE7] bg-white p-3.5">
                  <div className="flex items-center gap-2 text-[#17655E]">
                    <ShieldCheck size={15} />
                    <h3 className="text-xs font-bold">Fullscreen</h3>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[#71807B]">
                    Fullscreen exits are recorded, and fullscreen must be restored before continuing.
                  </p>
                </div>

                <div className="rounded-xl border border-[#E1EBE7] bg-white p-3.5">
                  <div className="flex items-center gap-2 text-[#17655E]">
                    <ClipboardCheck size={15} />
                    <h3 className="text-xs font-bold">Clipboard actions</h3>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[#71807B]">
                    Copy, cut, paste, and context-menu attempts are recorded as events only.
                  </p>
                </div>
              </div>

              <div className="p-5 sm:p-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={17} className="mt-0.5 shrink-0 text-[#A8752B]" />
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-[#34433F]">
                      Before you start
                    </h3>
                    <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs leading-5 text-[#697A75]">
                      <li>Choose a place where you can work without interruption and keep a stable connection.</li>
                      <li>Keep this assessment tab and browser window active. Fullscreen must be enabled before the timer starts.</li>
                      <li>The timer continues if you refresh the page after the attempt has started.</li>
                    </ul>
                    <p className="mt-3 rounded-lg bg-[#F6F8F7] px-3 py-2.5 text-[11px] leading-5 text-[#6B7975]">
                      Privacy note: this browser monitoring does not capture webcam video, record the screen, or save clipboard contents. Events are signals for human review and do not independently establish misconduct.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={handleStart}
                disabled={
                  !canStart ||
                  starting ||
                  !assessment?.duration_minutes
                }
                className="inline-flex min-h-[50px] items-center justify-center gap-2 rounded-xl bg-[#5658E8] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#4547B7] focus:outline-none focus:ring-4 focus:ring-[#5658E8]/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {starting ? (
                  <LoaderCircle size={17} className="animate-spin" />
                ) : (
                  <ClipboardCheck size={17} />
                )}

                {starting ? "Starting..." : "Start Assessment"}
              </button>

              {assessment?.window_status === "not_open" && (
                <p className="text-sm text-[#7C8499]">
                  This assessment is not open yet.
                </p>
              )}

              {assessment?.window_status === "closed" && (
                <p className="text-sm text-[#A44157]">
                  The assessment availability window has closed.
                </p>
              )}

              {!assessment?.duration_minutes && (
                <p className="text-sm text-[#A44157]">
                  The assessment time limit is not configured. Contact your
                  recruiter.
                </p>
              )}
            </div>
          </section>
        )}
      </main>

      {/* Fixed center-screen warning in Evalyn's navy/indigo/purple palette. */}
      {showWarningModal && !isSubmitted && !isExpired && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center overflow-y-auto bg-[#1C1D36]/80 p-4 backdrop-blur-sm sm:p-6"
          role="presentation"
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="proctoring-warning-title"
            aria-describedby="proctoring-warning-message"
            className="my-auto w-full max-w-lg overflow-hidden rounded-3xl border border-[#DCDCF0] bg-white shadow-[0_30px_100px_rgba(20,20,50,0.35)]"
          >
            <div className="h-2 bg-gradient-to-r from-[#26284F] via-[#5658E8] to-[#9C568E]" />

            <div className="p-6 sm:p-8">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#F0EFFF] text-[#5658E8]">
                  {fullscreenRequired ? (
                    <ShieldAlert size={27} />
                  ) : (
                    <AlertTriangle size={27} />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#5658E8]">
                    Assessment monitoring
                  </p>

                  <h2
                    id="proctoring-warning-title"
                    className="mt-1 text-2xl font-bold text-[#26284F]"
                  >
                    {fullscreenRequired
                      ? "Fullscreen required"
                      : "Rule violation detected"}
                  </h2>

                  <p className="mt-2 text-sm text-[#697087]">
                    {fullscreenRequired
                      ? "The assessment is covered until fullscreen is restored."
                      : "This action has been recorded for review."}
                  </p>
                </div>

                {!fullscreenRequired && (
                  <button
                    type="button"
                    onClick={handleWarningAcknowledge}
                    aria-label="Dismiss warning"
                    className="rounded-lg p-1.5 text-[#7C8499] transition hover:bg-[#F1F2FA] hover:text-[#26284F]"
                  >
                    <X size={19} />
                  </button>
                )}
              </div>

              <div className="mt-6 rounded-2xl border border-[#DCD9FB] bg-[#F7F6FF] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {!fullscreenRequired && (
                    <span className="rounded-full bg-[#EAE8FF] px-3 py-1 text-xs font-bold text-[#5658E8]">
                      Warning #{modalWarning.count}
                    </span>
                  )}

                  <span className="rounded-full border border-[#DCD9FB] bg-white px-3 py-1 text-xs font-semibold text-[#5F55A8]">
                    Total warnings: {proctoringWarningCount}
                  </span>
                </div>

                <p
                  id="proctoring-warning-message"
                  className="mt-3 text-sm leading-6 text-[#424967]"
                >
                  {fullscreenRequired
                    ? "Fullscreen mode is not active. Click the button below to enter fullscreen. Your assessment timer continues while you restore it."
                    : modalWarning.message}
                </p>

                {!fullscreenRequired && (
                  <p className="mt-3 text-xs text-[#7C8499]">
                    Recorded at {formatDate(modalWarning.occurredAt)}
                  </p>
                )}
              </div>

              {fullscreenLock && (
                <div className="mt-4 rounded-2xl border border-[#E2E1FC] bg-white p-4">
                  <div className="flex items-start gap-3">
                    <ShieldAlert
                      size={19}
                      className="mt-0.5 shrink-0 text-[#5658E8]"
                    />

                    <div>
                      <p className="text-sm font-bold text-[#26284F]">
                        Fullscreen is required to continue
                      </p>

                      <p className="mt-1 text-xs leading-5 text-[#697087]">
                        The assessment is blocked until fullscreen is
                        restored. Your timer continues running.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {monitoringSyncError && (
                <p
                  role="status"
                  className="mt-3 text-xs leading-5 text-[#A44157]"
                >
                  {monitoringSyncError}
                </p>
              )}

              <div className="mt-6 flex flex-col gap-3">
                {fullscreenRequired ? (
                  <button
                    type="button"
                    onClick={() => void handleReturnToFullscreen()}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#26284F] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#363963] focus:outline-none focus:ring-4 focus:ring-[#5658E8]/25"
                  >
                    <ShieldCheck size={17} />
                    Restore fullscreen to continue
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleWarningAcknowledge}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#5658E8] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#4547B7] focus:outline-none focus:ring-4 focus:ring-[#5658E8]/25"
                  >
                    I understand — continue assessment
                  </button>
                )}

                <p className="text-center text-xs leading-5 text-[#7C8499]">
                  Monitoring events are review signals and do not, by
                  themselves, prove misconduct.
                </p>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default CandidateAssessment;