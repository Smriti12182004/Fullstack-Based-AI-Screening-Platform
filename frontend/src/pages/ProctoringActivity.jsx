import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ChevronDown,
  ChevronUp,
  Clock3,
  Eye,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  Users,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import RecruiterLayout from "../layouts/RecruiterLayout";

const REFRESH_INTERVAL_MS = 20_000;

const EMPTY_ACTIVITY = {
  items: [],
  total: 0,
  active_attempts: 0,
  candidates_with_events: 0,
};

function getRecordKey(record) {
  return `${record.assessment_id}-${record.candidate_id}`;
}

function getAssessmentGroupKey(record) {
  const assessmentIdentity =
    record.assessment_id ?? record.assessment_title ?? "assessment";
  const jobIdentity = record.job_id ?? record.job_title ?? "job";

  return `${jobIdentity}::${assessmentIdentity}`;
}

function formatDateTime(value) {
  if (!value) {
    return "Not recorded";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function getEventLabel(value) {
  if (!value) {
    return "No event recorded";
  }

  const labels = {
    tab_hidden: "Tab hidden",
    fullscreen_exit: "Fullscreen exited",
    fullscreen_unavailable: "Fullscreen unavailable",
    copy_attempt: "Copy attempted",
    cut_attempt: "Cut attempted",
    paste_attempt: "Paste attempted",
    context_menu: "Context menu opened",
    contextmenu: "Context menu opened",
    window_blur: "Assessment window lost focus",
  };

  return (
    labels[value] ||
    String(value)
      .replace(/^proctor_/, "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase())
  );
}

function getStatusPresentation(status) {
  switch (String(status || "").toLowerCase()) {
    case "in_progress":
    case "started":
      return {
        label: "In progress",
        classes: "border-[#F4D5A4] bg-[#FFF7E8] text-[#96621B]",
      };

    case "submitted":
    case "completed":
      return {
        label: status === "submitted" ? "Submitted" : "Completed",
        classes: "border-[#CDE9D7] bg-[#ECF8F0] text-[#28784B]",
      };

    case "expired":
      return {
        label: "Expired",
        classes: "border-[#F2D1D1] bg-[#FFF0F0] text-[#A54141]",
      };

    case "assigned":
      return {
        label: "Awaiting start",
        classes: "border-[#DADCFB] bg-[#F0F0FF] text-[#5658B8]",
      };

    case "cancelled":
    case "revoked":
      return {
        label: status,
        classes: "border-[#E2E4EA] bg-[#F4F5F8] text-[#667085]",
      };

    default:
      return {
        label: status || "Not started",
        classes: "border-[#E2E4EA] bg-[#F4F5F8] text-[#667085]",
      };
  }
}

function StatusPill({ status }) {
  const presentation = getStatusPresentation(status);

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-4 ${presentation.classes}`}
      title={`Attempt status: ${presentation.label}`}
    >
      {presentation.label}
    </span>
  );
}

function MetricCard({
  icon,
  label,
  value,
  description,
  tone = "purple",
  onClick,
  selected = false,
  doodle = "assignments",
}) {
  const tones = {
    purple: {
      accent: "#655FC2",
      tile: "bg-[#F1EFFF]",
      selected: "border-[#C8C3F3] bg-[#FAF9FF]",
    },
    blue: {
      accent: "#4772C7",
      tile: "bg-[#EDF4FF]",
      selected: "border-[#B9D1FA] bg-[#F8FAFF]",
    },
    amber: {
      accent: "#B17A2A",
      tile: "bg-[#FFF3DB]",
      selected: "border-[#EDD1A4] bg-[#FFFCF6]",
    },
  };

  const style = tones[tone] || tones.purple;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={Boolean(selected)}
      aria-label={`${label}: ${value}. ${
        selected
          ? "This activity filter is selected."
          : "Filter candidate activity."
      }`}
      className={`group relative flex min-h-[148px] w-full flex-col overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6565CB] focus-visible:ring-offset-2 motion-reduce:transform-none motion-reduce:transition-none ${
        selected
          ? `${style.selected} shadow-[0_5px_16px_rgba(38,40,79,0.06)]`
          : "border-[#E0E4EC] bg-white hover:-translate-y-1 hover:border-[#C9D1E0] hover:shadow-[0_14px_28px_rgba(38,40,79,0.09)]"
      }`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-1 -top-3 h-28 w-32 opacity-20 transition-all duration-300 group-hover:rotate-3 group-hover:scale-110 group-hover:opacity-55 motion-reduce:transition-none"
      >
        <svg
          viewBox="0 0 128 112"
          fill="none"
          stroke={style.accent}
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-full w-full"
        >
          {doodle === "assignments" && (
            <>
              <rect x="43" y="26" width="42" height="48" rx="7" />
              <path d="M55 26v-6h18v6" />
              <path d="M52 43h23 M52 52h17 M52 61h13" />
              <path d="M22 67c7-9 14 9 21 0s14 9 21 0" />
              <circle cx="96" cy="30" r="4" />
              <path d="m92 82 5-5 5 5" />
            </>
          )}

          {doodle === "active" && (
            <>
              <circle cx="69" cy="49" r="25" strokeDasharray="4 5" />
              <path d="M69 33v16l12 7" strokeWidth="2.3" />
              <path d="M17 36c8-8 15 8 23 0s15 8 23 0" />
              <circle cx="100" cy="82" r="4" />
              <path d="m24 84 6-5 6 5" />
            </>
          )}

          {doodle === "events" && (
            <>
              <path d="M67 25 95 76H39L67 25Z" />
              <path d="M67 43v14 M67 65v1" strokeWidth="2.4" />
              <path d="M15 42c8-8 15 8 23 0s15 8 23 0" />
              <circle cx="100" cy="25" r="4" />
              <path d="m20 83 5 5 10-12" />
            </>
          )}
        </svg>
      </span>

      <span className="relative z-10 flex w-full items-start justify-between gap-4">
        <span className="min-w-0">
          <span className="block text-sm font-medium text-[#667085]">
            {label}
          </span>

          <span
            className="mt-3 block text-[32px] font-semibold leading-none tracking-[-0.045em] text-[#26284F]"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {value}
          </span>
        </span>

        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:rotate-[-4deg] group-hover:scale-105 motion-reduce:transition-none ${style.tile}`}
          style={{ color: style.accent }}
        >
          {icon}
        </span>
      </span>

      <span className="relative z-10 mt-3 block text-xs leading-5 text-[#7A8196]">
        {description}
      </span>

      <span
        className={`relative z-10 mt-auto flex items-center justify-between gap-2 pt-3 text-[11px] font-semibold transition-colors ${
          selected
            ? "text-[#5457B8]"
            : "text-[#9198A8] group-hover:text-[#5559B7]"
        }`}
      >
        <span>{selected ? "Showing this view" : "Explore activity"}</span>
        <span
          aria-hidden="true"
          className="inline-block transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none"
        >
          →
        </span>
      </span>

      {selected && (
        <span
          aria-hidden="true"
          className="absolute inset-x-5 bottom-0 h-[3px] rounded-t-full"
          style={{ backgroundColor: style.accent }}
        />
      )}
    </button>
  );
}

function EventHistory({
  history,
  loading,
  error,
  onRefresh,
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-[#F7F7FC] px-4 py-6 text-sm text-[#676D85]">
        <LoaderCircle size={17} className="animate-spin" />
        Loading event history...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-[#F0D6D6] bg-[#FFF7F7] p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[#9B4141]">{error}</p>

        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-[#E7C9C9] bg-white px-3 py-2 text-sm font-semibold text-[#8D3D3D] hover:bg-[#FFF0F0]"
        >
          <RefreshCw size={14} />
          Retry
        </button>
      </div>
    );
  }

  const events = Array.isArray(history?.events)
    ? history.events
    : [];

  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[#D9DCE9] bg-[#FAFAFE] px-4 py-8 text-center">
        <CheckCircle2
          size={25}
          className="mx-auto text-[#777CC4]"
        />

        <p className="mt-3 text-sm font-semibold text-[#3C4167]">
          No proctoring events recorded
        </p>

        <p className="mt-1 text-xs leading-5 text-[#7C8499]">
          This attempt does not have any recorded proctoring events.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-[#32365D]">
            Recorded event history
          </p>

          <p className="mt-1 text-xs text-[#7D8498]">
            {events.length} event{events.length === 1 ? "" : "s"} for
            this attempt
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-2 rounded-lg border border-[#E1E3EF] bg-white px-3 py-2 text-xs font-semibold text-[#555A80] transition hover:bg-[#F7F7FD]"
        >
          <RefreshCw size={13} />
          Refresh events
        </button>
      </div>

      <div className="space-y-3">
        {events.map((event, index) => {
          const detailEntries = Object.entries(event.details || {})
            .filter(([key]) => key !== "assessment_id");

          return (
            <article
              key={event.id ?? `${event.event_type}-${index}`}
              className="relative rounded-xl border border-[#E6E7F0] bg-white p-4"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F1EEFF] text-[#6558B9]">
                  <ShieldAlert size={17} />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-[#30345A]">
                      {getEventLabel(event.event_type)}
                    </p>

                    <span className="rounded-full border border-[#E3E0F6] bg-[#F7F5FF] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#6D61AC]">
                      Browser event
                    </span>
                  </div>

                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-[#747B90]">
                    <Clock3 size={13} />
                    {formatDateTime(event.created_at)}
                  </p>

                  {detailEntries.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {detailEntries.map(([key, value]) => (
                        <span
                          key={key}
                          className="break-all rounded-lg bg-[#F6F7FB] px-2.5 py-1.5 text-[11px] text-[#666E84]"
                        >
                          <span className="font-semibold">
                            {key.replace(/_/g, " ")}:
                          </span>{" "}
                          {typeof value === "object" && value !== null
                            ? JSON.stringify(value)
                            : String(value)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <p className="text-xs leading-5 text-[#858BA0]">
        Events are monitoring signals for review, not proof of misconduct
        by themselves.
      </p>
    </div>
  );
}

function SignalCount({ label, value, tone = "neutral" }) {
  const tones = {
    blue: "border-[#D6E4F8] bg-[#F4F8FE] text-[#426AA5]",
    violet: "border-[#E1DCF5] bg-[#F8F6FD] text-[#6C5CA6]",
    amber: "border-[#F0E1C5] bg-[#FFFBF2] text-[#9A702C]",
    neutral: "border-[#E1E6E3] bg-white text-[#65736E]",
  };

  const count = Number(value || 0);

  return (
    <span className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[10px] font-medium ${tones[tone] || tones.neutral}`}>
      <span>{label}</span>
      <span className="font-bold tabular-nums">{count}</span>
    </span>
  );
}

function ProctoringActivity() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [activity, setActivity] = useState(EMPTY_ACTIVITY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [assessmentFilter, setAssessmentFilter] = useState("all");
  const [expandedAssessmentGroups, setExpandedAssessmentGroups] = useState(
    () => new Set()
  );
  const [lastUpdated, setLastUpdated] = useState(null);

  const [expandedKey, setExpandedKey] = useState("");
  const [historyByKey, setHistoryByKey] = useState({});
  const [historyLoadingKey, setHistoryLoadingKey] = useState("");
  const [historyError, setHistoryError] = useState("");

  const loadActivity = useCallback(
    async (isRefresh = false) => {
      try {
        setError("");

        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        const response = await api.get("/proctoring/activity", {
          params: {
            limit: 500,
            offset: 0,
          },
        });

        const data = response.data || {};

        setActivity({
          items: Array.isArray(data.items) ? data.items : [],
          total: Number(data.total || 0),
          active_attempts: Number(data.active_attempts || 0),
          candidates_with_events: Number(
            data.candidates_with_events || 0
          ),
        });

        setLastUpdated(new Date());
      } catch (err) {
        console.error("Failed to load proctoring activity:", err);

        if (err.response?.status === 401) {
          logout();
          navigate("/login", { replace: true });
          return;
        }

        if (err.response?.status === 403) {
          setError(
            "Your account does not have permission to view proctoring activity."
          );
        } else {
          setError(
            err.response?.data?.detail ||
              "Unable to load proctoring activity right now."
          );
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [logout, navigate]
  );

  useEffect(() => {
    void loadActivity();

    const timer = window.setInterval(() => {
      void loadActivity(true);
    }, REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [loadActivity]);

  const assessmentOptions = useMemo(() => {
    const optionsByKey = new Map();

    activity.items.forEach((item) => {
      const key = getAssessmentGroupKey(item);

      if (!optionsByKey.has(key)) {
        optionsByKey.set(key, {
          key,
          jobTitle: item.job_title || "Untitled job",
          assessmentTitle: item.assessment_title || "Untitled assessment",
          assessmentId: item.assessment_id,
        });
      }
    });

    return Array.from(optionsByKey.values()).sort((a, b) => {
      const jobComparison = a.jobTitle.localeCompare(b.jobTitle);
      return jobComparison || a.assessmentTitle.localeCompare(b.assessmentTitle);
    });
  }, [activity.items]);

  const scopedItems = useMemo(
    () =>
      activity.items.filter(
        (item) =>
          assessmentFilter === "all" ||
          getAssessmentGroupKey(item) === assessmentFilter
      ),
    [activity.items, assessmentFilter]
  );

  const scopedSummary = useMemo(
    () => ({
      total: scopedItems.length,
      active: scopedItems.filter((item) =>
        ["in_progress", "started"].includes(
          String(item.attempt_status || "").toLowerCase()
        )
      ).length,
      withEvents: scopedItems.filter(
        (item) => Number(item.event_count || 0) > 0
      ).length,
    }),
    [scopedItems]
  );

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    return activity.items.filter((item) => {
      const matchesAssessment =
        assessmentFilter === "all" ||
        getAssessmentGroupKey(item) === assessmentFilter;

      const matchesSearch =
        !query ||
        [
          item.candidate_name,
          item.candidate_username,
          item.candidate_email,
          item.assessment_title,
          item.job_title,
          item.assessment_id,
          item.job_id,
        ]
          .filter((value) => value !== null && value !== undefined)
          .join(" ")
          .toLowerCase()
          .includes(query);

      const hasEvents = Number(item.event_count || 0) > 0;

      const matchesFilter =
        filter === "all" ||
        (filter === "active" &&
          ["in_progress", "started"].includes(
            String(item.attempt_status || "").toLowerCase()
          )) ||
        (filter === "events" && hasEvents);

      return matchesAssessment && matchesSearch && matchesFilter;
    });
  }, [activity.items, search, filter, assessmentFilter]);

  const groupedItems = useMemo(() => {
    const groups = new Map();

    filteredItems.forEach((item) => {
      const key = getAssessmentGroupKey(item);

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          jobTitle: item.job_title || "Untitled job",
          jobId: item.job_id,
          assessmentTitle: item.assessment_title || "Untitled assessment",
          assessmentId: item.assessment_id,
          items: [],
          activeCount: 0,
          candidatesWithEvents: 0,
        });
      }

      const group = groups.get(key);
      group.items.push(item);

      if (["in_progress", "started"].includes(
        String(item.attempt_status || "").toLowerCase()
      )) {
        group.activeCount += 1;
      }

      const eventCount = Number(item.event_count || 0);
      if (eventCount > 0) group.candidatesWithEvents += 1;
    });

    return Array.from(groups.values()).sort((a, b) => {
      const jobComparison = a.jobTitle.localeCompare(b.jobTitle);
      if (jobComparison) return jobComparison;
      return a.assessmentTitle.localeCompare(b.assessmentTitle);
    });
  }, [filteredItems]);

  const toggleAssessmentGroup = (groupKey) => {
    setExpandedAssessmentGroups((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  const toggleAllAssessmentGroups = () => {
    setExpandedAssessmentGroups((current) => {
      const allExpanded = groupedItems.length > 0 &&
        groupedItems.every((group) => current.has(group.key));
      return allExpanded
        ? new Set()
        : new Set(groupedItems.map((group) => group.key));
    });
  };

  const loadHistory = async (record, forceRefresh = false) => {
    const key = getRecordKey(record);

    if (expandedKey === key && !forceRefresh) {
      setExpandedKey("");
      setHistoryError("");
      return;
    }

    setExpandedKey(key);
    setHistoryLoadingKey(key);
    setHistoryError("");

    try {
      const response = await api.get(
        `/proctoring/activity/${record.assessment_id}/${record.candidate_id}/events`
      );

      setHistoryByKey((current) => ({
        ...current,
        [key]: response.data || { events: [] },
      }));
    } catch (err) {
      console.error("Failed to load candidate event history:", err);

      setHistoryError(
        err.response?.data?.detail ||
          "Unable to load this candidate's event history."
      );
    } finally {
      setHistoryLoadingKey("");
    }
  };

  const filters = [
    { value: "all", label: "All candidates" },
    { value: "active", label: "Active attempts" },
    { value: "events", label: "With events" },
  ];

  return (
    <RecruiterLayout
      title="Proctoring & Activity"
      breadcrumb="Workspace / Proctoring & Activity"
    >
      <div className="mx-auto max-w-[1480px] space-y-6">
        <section className="relative overflow-hidden rounded-[26px] border border-[#DCDDF1] bg-white px-6 py-7 shadow-[0_16px_44px_rgba(38,40,79,0.055)] sm:px-8 sm:py-8">
          <div className="pointer-events-none absolute -right-14 -top-20 h-56 w-56 rounded-full bg-[#EDEBFF] opacity-70 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-24 right-1/3 h-48 w-48 rounded-full bg-[#F8E9F5] opacity-60 blur-3xl" />

          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
            <div className="max-w-3xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#E4E1FB] bg-[#F5F3FF] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#6155B5]">
                <Activity size={14} />
                Assessment monitoring
              </span>

              <h1 className="mt-4 font-display text-3xl leading-tight text-[#26284F] sm:text-[40px]">
                Proctoring & Activity
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#687087] sm:text-[15px]">
                Follow candidate assessment progress and review recorded
                browser events from assigned assessments. Monitoring is
                limited to the jobs you are authorized to access.
              </p>
            </div>

            <div className="flex shrink-0 flex-col items-start gap-3 sm:flex-row sm:items-center">
              <div className="text-xs text-[#747B91] sm:text-right">
                <p className="font-semibold text-[#515775]">
                  Automatic refresh: 20 seconds
                </p>

                <p className="mt-1">
                  Last updated:{" "}
                  {lastUpdated
                    ? lastUpdated.toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                        second: "2-digit",
                      })
                    : "Waiting for data"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => void loadActivity(true)}
                disabled={refreshing}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#5658C9] px-4 py-3 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(86,88,201,0.2)] transition hover:bg-[#4547B7] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw
                  size={16}
                  className={refreshing ? "animate-spin" : ""}
                />
                Refresh now
              </button>
            </div>
          </div>
        </section>

        {error && (
          <section className="flex items-start gap-3 rounded-2xl border border-[#EFD3D3] bg-[#FFF6F6] p-4">
            <AlertTriangle
              size={19}
              className="mt-0.5 shrink-0 text-[#AD4545]"
            />

            <div>
              <p className="text-sm font-bold text-[#873737]">
                Monitoring data could not be loaded
              </p>

              <p className="mt-1 text-sm leading-5 text-[#9B5555]">
                {error}
              </p>

              <button
                type="button"
                onClick={() => void loadActivity(true)}
                className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-[#873737] underline underline-offset-4"
              >
                <RefreshCw size={13} />
                Try again
              </button>
            </div>
          </section>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard
            icon={<Users size={21} />}
            label="Candidate assignments"
            value={scopedSummary.total}
            description={
              assessmentFilter === "all"
                ? "Across all accessible assessment sets"
                : "In the selected assessment set"
            }
            tone="purple"
            doodle="assignments"
            selected={filter === "all"}
            onClick={() => {
              setFilter("all");
              setExpandedAssessmentGroups(
                assessmentFilter === "all"
                  ? new Set()
                  : new Set([assessmentFilter])
              );
            }}
          />

          <MetricCard
            icon={<Clock3 size={21} />}
            label="Active attempts"
            value={scopedSummary.active}
            description="Active attempts in the selected scope"
            tone="blue"
            doodle="active"
            selected={filter === "active"}
            onClick={() => {
              setFilter("active");
              setExpandedAssessmentGroups(
                new Set(activity.items.map(getAssessmentGroupKey))
              );
            }}
          />

          <MetricCard
            icon={<ShieldAlert size={21} />}
            label="Candidates with events"
            value={scopedSummary.withEvents}
            description="Candidates with events in the selected scope"
            tone="amber"
            doodle="events"
            selected={filter === "events"}
            onClick={() => {
              setFilter("events");
              setExpandedAssessmentGroups(
                new Set(activity.items.map(getAssessmentGroupKey))
              );
            }}
          />
        </section>

        <section
          className="rounded-2xl border border-[#DDE6E2] bg-white p-4 sm:p-5"
          aria-labelledby="monitoring-scope-title"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E8F2EF] text-[#17655E]">
              <ShieldAlert size={17} />
            </div>

            <div className="min-w-0">
              <h2
                id="monitoring-scope-title"
                className="text-sm font-bold text-[#293B36]"
              >
                What monitoring records
              </h2>

              <p className="mt-1 text-xs leading-5 text-[#72817D]">
                These are browser-event signals from the latest attempt, not
                an automated misconduct verdict.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[#E2EBE7] bg-[#FAFCFB] p-3.5">
              <p className="text-xs font-semibold text-[#31564D]">
                Focus &amp; visibility
              </p>
              <p className="mt-1 text-[11px] leading-5 text-[#7A8984]">
                Tab hidden and assessment window focus loss.
              </p>
            </div>

            <div className="rounded-xl border border-[#E2EBE7] bg-[#FAFCFB] p-3.5">
              <p className="text-xs font-semibold text-[#31564D]">
                Fullscreen
              </p>
              <p className="mt-1 text-[11px] leading-5 text-[#7A8984]">
                Fullscreen exit or availability events.
              </p>
            </div>

            <div className="rounded-xl border border-[#E2EBE7] bg-[#FAFCFB] p-3.5">
              <p className="text-xs font-semibold text-[#31564D]">
                Clipboard &amp; context menu
              </p>
              <p className="mt-1 text-[11px] leading-5 text-[#7A8984]">
                Copy, cut, paste and context-menu attempts.
              </p>
            </div>
          </div>

          <p className="mt-3 text-[10px] leading-5 text-[#899590]">
            This implementation does not capture webcam video, record the
            screen, or save clipboard contents. Review each event in context
            before drawing conclusions.
          </p>
        </section>

        <section className="overflow-hidden rounded-[24px] border border-[#DDE1EA] bg-white shadow-[0_12px_36px_rgba(38,40,79,0.04)]">
          <div className="border-b border-[#ECECF3] p-5 sm:p-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-lg font-bold text-[#292D52]">
                  Assessment sets
                </h2>

                <p className="mt-1 text-sm text-[#7A8196]">
                  Activity is grouped by job and assessment set. Open one set
                  to see only its candidates and recorded events.
                </p>
              </div>

              <div className="relative w-full xl:max-w-sm">
                <Search
                  size={17}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9299AC]"
                />

                <input
                  type="search"
                  value={search}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSearch(value);
                    setExpandedAssessmentGroups(
                      value.trim()
                        ? new Set(activity.items.map(getAssessmentGroupKey))
                        : assessmentFilter !== "all"
                          ? new Set([assessmentFilter])
                          : filter !== "all"
                            ? new Set(
                                activity.items.map(getAssessmentGroupKey)
                              )
                            : new Set()
                    );
                  }}
                  placeholder="Search candidate, job, or assessment..."
                  className="w-full rounded-xl border border-[#DFE2EC] bg-[#FCFCFE] py-3 pl-10 pr-4 text-sm text-[#30345A] outline-none transition placeholder:text-[#A1A6B6] focus:border-[#8889E2] focus:ring-4 focus:ring-[#8889E2]/10"
                />
              </div>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(240px,1fr)_auto] lg:items-end">
              <label className="block min-w-0">
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#858BA0]">
                  Show assessment set
                </span>

                <select
                  value={assessmentFilter}
                  onChange={(event) => {
                    const value = event.target.value;
                    setAssessmentFilter(value);
                    setExpandedAssessmentGroups(
                      value === "all" ? new Set() : new Set([value])
                    );
                  }}
                  className="h-11 w-full rounded-xl border border-[#DFE2EC] bg-white px-3.5 text-sm text-[#39405E] outline-none focus:border-[#8889E2] focus:ring-4 focus:ring-[#8889E2]/10"
                >
                  <option value="all">
                    All assessment sets ({assessmentOptions.length})
                  </option>

                  {assessmentOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.jobTitle} — {option.assessmentTitle}
                      {option.assessmentId != null
                        ? ` (#${option.assessmentId})`
                        : ""}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex flex-wrap items-center gap-2">
                {filters.map((item) => {
                  const selected = filter === item.value;

                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => {
                        setFilter(item.value);
                        setExpandedAssessmentGroups(
                          item.value === "all"
                            ? assessmentFilter !== "all"
                              ? new Set([assessmentFilter])
                              : new Set()
                            : new Set(
                                activity.items.map(getAssessmentGroupKey)
                              )
                        );
                      }}
                      className={`rounded-xl border px-3.5 py-2.5 text-xs font-bold transition ${
                        selected
                          ? "border-[#D8D6FB] bg-[#F0EFFF] text-[#5658B8]"
                          : "border-[#E4E6EF] bg-white text-[#727990] hover:bg-[#F8F8FD]"
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#ECECF3] pt-4">
              <p className="text-xs text-[#858BA0]">
                Showing {filteredItems.length} candidate assignment
                {filteredItems.length === 1 ? "" : "s"}
                {assessmentFilter === "all"
                  ? ` across ${groupedItems.length} set${
                      groupedItems.length === 1 ? "" : "s"
                    }`
                  : " in this set"}.
              </p>

              <button
                type="button"
                onClick={toggleAllAssessmentGroups}
                disabled={groupedItems.length === 0}
                className="inline-flex items-center gap-2 rounded-lg border border-[#E0E4EC] bg-white px-3 py-2 text-xs font-semibold text-[#606983] transition hover:bg-[#F7F8FC] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {groupedItems.length > 0 &&
                groupedItems.every((group) =>
                  expandedAssessmentGroups.has(group.key)
                )
                  ? "Collapse all sets"
                  : "Expand all sets"}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <LoaderCircle
                size={29}
                className="animate-spin text-[#6567CC]"
              />

              <p className="mt-4 text-sm font-semibold text-[#454A70]">
                Loading candidate activity...
              </p>

              <p className="mt-1 text-xs text-[#8990A4]">
                Retrieving assignments and recent monitoring events.
              </p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F2F0FF] text-[#6865C6]">
                <Eye size={25} />
              </span>

              <h3 className="mt-4 text-base font-bold text-[#30345A]">
                {activity.items.length === 0
                  ? "No candidate activity yet"
                  : "No candidates match this view"}
              </h3>

              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#7C8398]">
                {activity.items.length === 0
                  ? "Candidate assignments within your access scope will appear here. Browser events will be listed after they are recorded during an attempt."
                  : "Try a different search term or select another activity filter."}
              </p>

              {(search || filter !== "all" || assessmentFilter !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setFilter("all");
                    setAssessmentFilter("all");
                    setExpandedAssessmentGroups(new Set());
                  }}
                  className="mt-4 rounded-xl border border-[#DDDEF2] bg-white px-4 py-2.5 text-sm font-semibold text-[#5559B7] hover:bg-[#F6F5FF]"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3 bg-[#FBFBFE] p-3 sm:p-4">
              {groupedItems.map((group) => {
                const groupExpanded = expandedAssessmentGroups.has(group.key);
                const groupId = `assessment-group-${group.key.replace(
                  /[^a-zA-Z0-9_-]/g,
                  "-"
                )}`;

                return (
                  <section
                    key={group.key}
                    className="overflow-hidden rounded-2xl border border-[#DDE2EB] bg-white"
                  >
                    <button
                      type="button"
                      aria-expanded={groupExpanded}
                      aria-controls={groupId}
                      onClick={() => toggleAssessmentGroup(group.key)}
                      className="flex w-full flex-col gap-4 px-4 py-4 text-left transition-colors hover:bg-[#FAFAFE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7778D6] sm:flex-row sm:items-center sm:justify-between sm:px-5"
                    >
                      <span className="flex min-w-0 items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#E0E2F5] bg-[#F4F3FF] text-[#5D60B9]">
                          <ClipboardCheck size={17} />
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[10px] font-bold uppercase tracking-[0.13em] text-[#8A91A5]">
                            {group.jobTitle}
                            {group.jobId != null ? ` · Job #${group.jobId}` : ""}
                          </span>

                          <span className="mt-1 block break-words text-sm font-bold leading-5 text-[#2E3354]">
                            {group.assessmentTitle}
                          </span>

                          <span className="mt-1 block text-xs text-[#81889C]">
                            {group.assessmentId != null
                              ? `Assessment #${group.assessmentId} · `
                              : ""}
                            {group.items.length} candidate assignment
                            {group.items.length === 1 ? "" : "s"} in this view
                          </span>
                        </span>
                      </span>

                      <span className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                        <span className="rounded-full border border-[#E2E5EE] bg-[#F8F9FC] px-2.5 py-1.5 text-[10px] font-semibold text-[#667085]">
                          {group.activeCount} active
                        </span>

                        <span
                          className={`rounded-full border px-2.5 py-1.5 text-[10px] font-semibold ${
                            group.candidatesWithEvents > 0
                              ? "border-[#F0DFC6] bg-[#FFFAF1] text-[#956322]"
                              : "border-[#E2E5EE] bg-white text-[#7A8193]"
                          }`}
                        >
                          {group.candidatesWithEvents} with events
                        </span>

                        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E1E4ED] bg-white text-[#737B91]">
                          {groupExpanded ? (
                            <ChevronUp size={16} />
                          ) : (
                            <ChevronDown size={16} />
                          )}
                        </span>
                      </span>
                    </button>

                    {groupExpanded && (
                      <div
                        id={groupId}
                        className="space-y-3 border-t border-[#ECEEF4] bg-[#F8F9FC] p-3 sm:p-4"
                      >
                        {group.items.map((record) => {
                          const key = getRecordKey(record);
                          const expanded = expandedKey === key;
                          const eventCount = Number(record.event_count || 0);

                          return (
                            <article
                              key={key}
                              className="overflow-hidden rounded-2xl border border-[#E1E3EE] bg-white shadow-[0_6px_20px_rgba(38,40,79,0.025)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#D0D6E2] hover:shadow-[0_10px_24px_rgba(38,40,79,0.07)] motion-reduce:transform-none"
                            >
                              <div className="p-4 sm:p-5">
                                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                  <div className="flex min-w-0 items-start gap-3">
                                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#E6E6FF] to-[#F5E7F5] text-sm font-bold text-[#5B55AE]">
                                      {String(
                                        record.candidate_name ||
                                          record.candidate_username ||
                                          "C"
                                      )
                                        .trim()
                                        .slice(0, 2)
                                        .toUpperCase()}
                                    </div>

                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <h3 className="break-words text-base font-bold text-[#292D52]">
                                          {record.candidate_name ||
                                            record.candidate_username ||
                                            "Unnamed candidate"}
                                        </h3>

                                        <StatusPill
                                          status={
                                            record.attempt_status ||
                                            record.assignment_status
                                          }
                                        />
                                      </div>

                                      <p className="mt-1 break-all text-sm text-[#7A8196]">
                                        {record.candidate_email ||
                                          "No email recorded"}
                                      </p>

                                      <p className="mt-2 text-xs leading-5 text-[#8A90A3]">
                                        Candidate ID: {record.candidate_id}
                                        {record.attempt_id
                                          ? ` · Attempt ID: ${record.attempt_id}`
                                          : ""}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                                    <span
                                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                                        eventCount > 0
                                          ? "border-[#F0DFC6] bg-[#FFFAF1] text-[#956322]"
                                          : "border-[#E2E5EE] bg-[#F8F9FC] text-[#7A8193]"
                                      }`}
                                    >
                                      {eventCount > 0 ? (
                                        <AlertTriangle size={13} />
                                      ) : (
                                        <CheckCircle2 size={13} />
                                      )}

                                      {eventCount} event
                                      {eventCount === 1 ? "" : "s"}
                                    </span>

                                    <button
                                      type="button"
                                      onClick={() => void loadHistory(record)}
                                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#DADAF3] bg-white px-3.5 py-2.5 text-xs font-bold text-[#575AB6] transition hover:bg-[#F6F5FF]"
                                    >
                                      {expanded ? (
                                        <>
                                          Hide history
                                          <ChevronUp size={15} />
                                        </>
                                      ) : (
                                        <>
                                          View event history
                                          <ChevronDown size={15} />
                                        </>
                                      )}
                                    </button>
                                  </div>
                                </div>

                                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                  <InfoCell
                                    label="Attempt started"
                                    value={formatDateTime(record.started_at)}
                                    icon={<CalendarClock size={14} />}
                                  />

                                  <InfoCell
                                    label="Latest recorded event"
                                    value={
                                      record.latest_event_at
                                        ? `${getEventLabel(
                                            record.latest_event_type
                                          )} · ${formatDateTime(
                                            record.latest_event_at
                                          )}`
                                        : "No event recorded"
                                    }
                                    icon={<Activity size={14} />}
                                  />
                                </div>

                                {eventCount > 0 && (
                                  <div className="mt-4 rounded-xl border border-[#E5EBE8] bg-[#FAFCFB] p-3.5">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#71817B]">
                                        Signal summary · latest attempt
                                      </p>

                                      <span className="text-[10px] font-semibold text-[#71817B]">
                                        {eventCount} recorded event
                                        {eventCount === 1 ? "" : "s"}
                                      </span>
                                    </div>

                                    <div className="mt-2.5 flex flex-wrap gap-2">
                                      <SignalCount
                                        label="Focus & visibility"
                                        value={
                                          record.event_summary?.focus_visibility
                                        }
                                        tone="blue"
                                      />

                                      <SignalCount
                                        label="Fullscreen"
                                        value={record.event_summary?.fullscreen}
                                        tone="violet"
                                      />

                                      <SignalCount
                                        label="Clipboard & context"
                                        value={
                                          record.event_summary?.clipboard_context
                                        }
                                        tone="amber"
                                      />

                                      {Number(record.event_summary?.other || 0) >
                                        0 && (
                                        <SignalCount
                                          label="Other"
                                          value={record.event_summary?.other}
                                          tone="neutral"
                                        />
                                      )}
                                    </div>

                                    <p className="mt-2 text-[10px] leading-5 text-[#899590]">
                                      These counts group browser signals; they
                                      are not a finding of misconduct.
                                    </p>
                                  </div>
                                )}
                              </div>

                              {expanded && (
                                <div className="border-t border-[#ECECF3] bg-[#FDFDFF] p-4 sm:p-5">
                                  <EventHistory
                                    history={historyByKey[key]}
                                    loading={historyLoadingKey === key}
                                    error={historyError}
                                    onRefresh={() =>
                                      void loadHistory(record, true)
                                    }
                                  />
                                </div>
                              )}
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </section>

        <div className="flex items-start gap-2 rounded-xl border border-[#E4E3F3] bg-[#F8F7FF] px-4 py-3 text-xs leading-5 text-[#6D7191]">
          <ShieldAlert
            size={16}
            className="mt-0.5 shrink-0 text-[#7772C5]"
          />

          <p>
            Monitoring records show events captured by the assessment
            interface. They do not establish intent or prove misconduct;
            review the event context before drawing conclusions.
          </p>
        </div>
      </div>
    </RecruiterLayout>
  );
}

function InfoCell({ label, value, icon }) {
  return (
    <div className="min-w-0 rounded-xl border border-[#ECECF3] bg-[#FCFCFE] px-3.5 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#969BAE]">
        {label}
      </p>

      <p className="mt-1.5 flex items-start gap-1.5 break-words text-xs leading-5 text-[#515773]">
        {icon && (
          <span className="mt-0.5 shrink-0 text-[#8589C6]">
            {icon}
          </span>
        )}
        <span>{value}</span>
      </p>
    </div>
  );
}

export default ProctoringActivity;