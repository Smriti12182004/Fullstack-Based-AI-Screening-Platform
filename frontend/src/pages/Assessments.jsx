import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  Clock3,
  ClipboardCheck,
  ChevronDown,
  ChevronUp,
  Inbox,
  ListChecks,
  Mail,
  RefreshCw,
  UserPlus,
  Users,
} from "lucide-react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import RecruiterLayout from "../layouts/RecruiterLayout";
import HRDeliveryActivationModal from "../components/HRDeliveryActivationModal";

function getErrorMessage(err, fallback) {
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
}

function Assessments() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const jobFilter = searchParams.get("job_id");
  const { logout } = useAuth();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [expandedJobs, setExpandedJobs] = useState(() => new Set());
  const [activationTarget, setActivationTarget] = useState(null);
  const [deliveryNotice, setDeliveryNotice] = useState("");
  const [invitationNotice, setInvitationNotice] = useState("");
  const [invitationError, setInvitationError] = useState("");
  const [sendingInvitationsFor, setSendingInvitationsFor] = useState(null);

  const loadAssessments = async (showRefreshState = false) => {
    try {
      setError("");

      if (showRefreshState) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const response = await api.get(
        "/assessment-delivery/hr/assessments"
      );

      const nextItems = response.data?.items;

      setItems(
        Array.isArray(nextItems)
          ? nextItems
          : []
      );
    } catch (err) {
      console.error(
        "Failed to load HR assessment inbox:",
        err
      );

      if (
        err.response?.status === 401 ||
        err.response?.status === 403
      ) {
        logout();
        navigate("/login", { replace: true });
        return;
      }

      setError(
        getErrorMessage(
          err,
          "Unable to load the assessment inbox right now."
        )
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleDeliveryActivated = (result) => {
    const isAddingMissedCandidates =
      activationTarget?.delivery_mode === "add-candidates";
    const assessmentId =
      result?.assessment_id ?? activationTarget?.assessment_id;

    const assignmentCount = Number(
      result?.assignment_count ??
      result?.assignments?.length ??
      0
    );

    const sentCount = Number(
      result?.invitation_emails_sent_count || 0
    );

    const failedCount = Number(
      result?.invitation_emails_failed_count || 0
    );

    setActivationTarget(null);

    if (isAddingMissedCandidates) {
      setDeliveryNotice(
        `Added ${assignmentCount} additional candidate ` +
        `${assignmentCount === 1 ? "assignment" : "assignments"} to assessment #${assessmentId}. ` +
        `${sentCount} invitation email(s) sent` +
        `${failedCount ? `; ${failedCount} failed and can be retried below` : ""}. ` +
        "Existing candidate assignments and invitation links were preserved."
      );
    } else {
      setDeliveryNotice(
        `Delivery activated for assessment #${assessmentId}. ` +
        `${assignmentCount} candidate ` +
        `${assignmentCount === 1 ? "assignment was" : "assignments were"} created. ` +
        `${sentCount} invitation email(s) sent` +
        `${failedCount ? `; ${failedCount} failed and can be retried below` : ""}. ` +
        "Candidate attempts have not been started."
      );
    }

    void loadAssessments(true).then(() => {
      if (assessmentId != null) {
        setItems((current) =>
          current.map((item) =>
            Number(item?.assessment_id) === Number(assessmentId)
              ? { ...item, assessment_status: "published" }
              : item
          )
        );
      }
    });
  };

  const handleSendInvitations = async (item) => {
    if (!item?.assessment_id) {
      return;
    }

    const assessmentId = Number(item.assessment_id);

    setSendingInvitationsFor(assessmentId);
    setInvitationError("");
    setInvitationNotice("");

    try {
      const response = await api.post(
        `/assessment-delivery/hr/assessments/${assessmentId}/send-invitations`
      );

      const result = response.data || {};

      setInvitationNotice(
        result.message ||
          `Invitation emails sent: ${result.invitation_emails_sent_count || 0}.`
      );
    } catch (err) {
      setInvitationError(
        getErrorMessage(
          err,
          "Unable to send assessment invitation emails. Please try again."
        )
      );
    } finally {
      setSendingInvitationsFor(null);
    }
  };

  const handleAddCandidates = (item) => {
    if (!item?.assessment_id) {
      return;
    }

    setActivationTarget({
      ...item,
      delivery_mode: "add-candidates",
    });
  };

  useEffect(() => {
    loadAssessments();
  }, []);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    return items.filter((item) => {
      const matchesJob =
        !jobFilter || String(item?.job_id ?? "") === String(jobFilter);

      const haystack = [
        item?.job_title,
        item?.title,
        item?.label,
        `set ${item?.variant_number || ""}`,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !query || haystack.includes(query);
      return matchesJob && matchesSearch;
    });
  }, [items, search, jobFilter]);

  const jobGroups = useMemo(() => {
    const groups = new Map();

    filteredItems.forEach((item) => {
      const key = String(
        item?.job_id ??
          `job-${item?.question_set_id ?? item?.assessment_set_id}`
      );

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          job_id: item?.job_id ?? null,
          job_title: item?.job_title || "Untitled job",
          question_set_id: item?.question_set_id ?? null,
          items: [],
        });
      }

      groups.get(key).items.push(item);
    });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        items: [...group.items].sort(
          (left, right) =>
            Number(left?.variant_number ?? 999) -
            Number(right?.variant_number ?? 999)
        ),
      }))
      .sort((left, right) =>
        String(left.job_title).localeCompare(
          String(right.job_title)
        )
      );
  }, [filteredItems]);

  useEffect(() => {
    setExpandedJobs((current) => {
      const next = new Set(current);

      const visibleKeys = new Set(
        jobGroups.map((group) => group.key)
      );

      jobGroups.forEach((group) => {
        if (!next.has(group.key)) {
          next.add(group.key);
        }
      });

      Array.from(next).forEach((key) => {
        if (!visibleKeys.has(key)) {
          next.delete(key);
        }
      });

      return next;
    });
  }, [jobGroups]);

  const toggleJob = (jobKey) => {
    setExpandedJobs((current) => {
      const next = new Set(current);

      if (next.has(jobKey)) {
        next.delete(jobKey);
      } else {
        next.add(jobKey);
      }

      return next;
    });
  };

  const formatDateTime = (value) => {
    if (!value) {
      return "â€”";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "â€”";
    }

    return new Intl.DateTimeFormat(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  };

  const formatDuration = (minutes) => {
    if (!minutes) {
      return "Not configured";
    }

    const value = Number(minutes);

    if (value < 60) {
      return `${value} min`;
    }

    const hours = Math.floor(value / 60);
    const remaining = value % 60;

    if (!remaining) {
      return `${hours} hr`;
    }

    return `${hours} hr ${remaining} min`;
  };

  const totalQuestions = useMemo(
    () =>
      items.reduce(
        (total, item) =>
          total + Number(item?.question_count || 0),
        0
      ),
    [items]
  );

  const totalJobs = jobGroups.length;

  const readySetCount = items.filter(
    (item) =>
      item?.sent_to_hr !== false &&
      String(item?.assessment_status || "").toLowerCase() !== "published"
  ).length;

  return (
    <RecruiterLayout
      title="Assessments"
      breadcrumb="Workspace / Assessments"
    >
      <div className="mx-auto max-w-[1440px] space-y-6">
        {/* PAGE HERO */}
        <section className="relative overflow-hidden rounded-[26px] border border-[#DCE0E8] bg-white px-7 py-8 shadow-[0_18px_50px_rgba(38,40,79,0.06)] sm:px-9 sm:py-9">
          <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full border-[22px] border-[#ECECFF]" />
          <div className="pointer-events-none absolute right-8 top-16 h-20 w-20 rounded-full bg-[#F1F1FF]" />
          <div className="pointer-events-none absolute -bottom-20 left-1/3 h-44 w-44 rounded-full bg-[#EAF8F1] opacity-60 blur-3xl" />

          <div className="relative flex flex-col gap-7 xl:flex-row xl:items-center xl:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ECECFF] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#5658E8]">
                  <Inbox size={13} />
                  HR assessment inbox
                </span>

                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF8F1] px-3 py-1.5 text-[11px] font-bold text-[#2E9B67]">
                  <CheckCircle2 size={13} />
                  Reviewer approved
                </span>
              </div>

              <h1 className="font-display text-4xl leading-tight text-[#26284F] sm:text-[42px]">
                Assessments ready for HR
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#667085] sm:text-[15px]">
                Review the assessment sets that the Assessment Reviewer has
                approved and handed over for delivery configuration.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
              <SummaryStat
                icon={<BriefcaseBusiness size={17} />}
                label="Jobs"
                value={totalJobs}
                tone="primary"
              />

              <SummaryStat
                icon={<ClipboardCheck size={17} />}
                label="Ready sets"
                value={readySetCount}
                tone="green"
              />

              <SummaryStat
                icon={<ListChecks size={17} />}
                label="Questions"
                value={totalQuestions}
                tone="teal"
              />
            </div>
          </div>
        </section>

        {/* TOOLBAR */}
        <section className="rounded-2xl border border-[#E1E4EB] bg-white p-4 shadow-[0_10px_28px_rgba(38,40,79,0.04)] sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-bold text-[#26284F]">
                Reviewer handoffs
              </p>

              <p className="mt-1 text-xs leading-5 text-[#98A2B3]">
                Only assessments explicitly handed to your HR account appear
                here.
              </p>
              {jobFilter && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-[#F1F1FF] px-3 py-1.5 font-semibold text-[#5658E8]">
                    Showing assessments for Job #{jobFilter}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSearchParams({})}
                    className="font-semibold text-[#667085] underline decoration-[#D0D5DD] underline-offset-2 hover:text-[#5658E8]"
                  >
                    Clear job filter
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label
                className="sr-only"
                htmlFor="assessment-search"
              >
                Search assessments
              </label>

              <div className="relative min-w-0 sm:w-[300px]">
                <svg
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98A2B3]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                    d="m21 21-4.35-4.35m1.35-5.15a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z"
                  />
                </svg>

                <input
                  id="assessment-search"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search job or assessment"
                  className="w-full rounded-xl border border-[#DCE0E8] bg-[#FAFBFD] py-2.5 pl-10 pr-3 text-sm text-[#1B2430] outline-none transition focus:border-[#5658E8] focus:bg-white focus:ring-2 focus:ring-[#5658E8]/10"
                />
              </div>

              <button
                type="button"
                onClick={() => loadAssessments(true)}
                disabled={refreshing || loading}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#DCE0E8] bg-white px-4 py-2.5 text-sm font-semibold text-[#4A4D68] transition hover:border-[#BFC4D4] hover:bg-[#FAFBFD] focus:outline-none focus:ring-2 focus:ring-[#5658E8]/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw
                  size={15}
                  className={refreshing ? "animate-spin" : ""}
                />
                Refresh
              </button>
            </div>
          </div>
        </section>

        {/* DELIVERY NOTICE */}
        {deliveryNotice && (
          <section
            role="status"
            className="flex flex-col gap-3 rounded-2xl border border-[#D8F0E4] bg-[#F1FBF6] p-4 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#DDF5E8] text-[#238657]">
                <CheckCircle2 size={17} />
              </span>

              <p className="text-sm leading-6 text-[#226747]">
                {deliveryNotice}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setDeliveryNotice("")}
              className="self-start rounded-lg px-3 py-1.5 text-xs font-bold text-[#226747] transition hover:bg-[#DDF5E8]"
            >
              Dismiss
            </button>
          </section>
        )}

        {error && (
          <section
            role="alert"
            className="flex items-start gap-3 rounded-2xl border border-[#F1C9C9] bg-[#FFF7F7] p-4"
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#FCE5E5] text-[#BC5050]">
              <AlertCircle size={17} />
            </span>

            <div>
              <p className="text-sm font-bold text-[#7E3030]">
                Assessment inbox could not be loaded
              </p>

              <p className="mt-1 text-sm leading-5 text-[#9B5555]">
                {error}
              </p>
            </div>
          </section>
        )}

        {/* LOADING / EMPTY / JOB PACKAGES */}
        {loading ? (
          <AssessmentLoading />
        ) : filteredItems.length === 0 ? (
          <section className="rounded-[24px] border border-dashed border-[#D4D8E2] bg-white px-6 py-16 text-center shadow-[0_10px_28px_rgba(38,40,79,0.03)]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#ECECFF] text-[#5658E8]">
              <Inbox size={28} strokeWidth={1.8} />
            </div>

            <h2 className="mt-5 text-xl font-bold text-[#26284F]">
              {search.trim()
                ? "No assessments match your search"
                : "No assessments are waiting for HR"}
            </h2>

            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#667085]">
              {search.trim()
                ? "Try a different job title, assessment name, or set label."
                : "Once an Assessment Reviewer hands off any approved variant for your jobs, the complete approved job package appears here."}
            </p>
          </section>
        ) : (
          <section className="space-y-5">
            {jobGroups.map((group) => (
              <JobAssessmentGroup
                key={group.key}
                group={group}
                expanded={expandedJobs.has(group.key)}
                onToggle={() => toggleJob(group.key)}
                formatDateTime={formatDateTime}
                formatDuration={formatDuration}
                onConfigureDelivery={setActivationTarget}
                onSendInvitations={handleSendInvitations}
                onAddCandidates={handleAddCandidates}
                sendingInvitationsFor={sendingInvitationsFor}
              />
            ))}
          </section>
        )}
      </div>

      {(invitationNotice || invitationError) && (
        <div
          role={invitationError ? "alert" : "status"}
          className={`fixed bottom-5 right-5 z-[120] max-w-xl rounded-xl border px-4 py-3 text-sm shadow-xl ${
            invitationError
              ? "border-[#F1C9C9] bg-[#FFF7F7] text-[#9B4444]"
              : "border-[#D8F0E4] bg-[#F1FBF6] text-[#226747]"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <span>{invitationError || invitationNotice}</span>

            <button
              type="button"
              onClick={() => {
                setInvitationNotice("");
                setInvitationError("");
              }}
              aria-label="Dismiss invitation message"
              className="font-bold"
            >
              Ã—
            </button>
          </div>
        </div>
      )}

      {activationTarget && (
        <HRDeliveryActivationModal
          item={activationTarget}
          onClose={() => setActivationTarget(null)}
          onActivated={handleDeliveryActivated}
        />
      )}
    </RecruiterLayout>
  );
}

function SummaryStat({
  icon,
  label,
  value,
  tone,
}) {
  const tones = {
    primary: {
      wrapper: "bg-[#F6F6FF] border-[#E5E5FF]",
      icon: "bg-[#ECECFF] text-[#5658E8]",
    },
    teal: {
      wrapper: "bg-[#F3FBF9] border-[#D8F0EA]",
      icon: "bg-[#E5F7F3] text-[#0F9D8A]",
    },
    green: {
      wrapper: "bg-[#F3FBF6] border-[#DDEFE5]",
      icon: "bg-[#EAF8F1] text-[#2E9B67]",
    },
  };

  const style = tones[tone] || tones.primary;

  return (
    <div
      className={`min-w-[126px] rounded-2xl border px-4 py-3 ${style.wrapper}`}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${style.icon}`}
        >
          {icon}
        </span>

        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#98A2B3]">
            {label}
          </p>

          <p className="mt-0.5 text-xl font-bold text-[#26284F]">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

function JobAssessmentGroup({
  group,
  expanded,
  onToggle,
  formatDateTime,
  formatDuration,
  onConfigureDelivery,
  onSendInvitations,
  onAddCandidates,
  sendingInvitationsFor,
}) {
  const readyCount = group.items.filter(
    (item) =>
      item?.sent_to_hr !== false &&
      String(item?.assessment_status || "").toLowerCase() !== "published"
  ).length;

  const totalQuestions = group.items.reduce(
    (total, item) =>
      total + Number(item?.question_count || 0),
    0
  );

  return (
    <article className="overflow-hidden rounded-[26px] border border-[#DDE1EA] bg-white shadow-[0_14px_40px_rgba(38,40,79,0.05)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full px-5 py-5 text-left transition hover:bg-[#FAFBFD] sm:px-6 sm:py-6"
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#ECECFF] text-[#5658E8]">
              <BriefcaseBusiness size={20} />
            </span>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ECECFF] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#5658E8]">
                  Assessment package
                </span>

                <span className="inline-flex items-center rounded-full bg-[#F3F4F8] px-3 py-1.5 text-xs font-bold text-[#62687A]">
                  {group.items.length}{" "}
                  {group.items.length === 1 ? "set" : "sets"}
                </span>

                <span className="inline-flex items-center rounded-full bg-[#EAF8F1] px-3 py-1.5 text-xs font-bold text-[#2E9B67]">
                  {readyCount} ready for HR
                </span>
              </div>

              <h2 className="mt-3 truncate text-2xl font-bold tracking-[-0.02em] text-[#26284F] sm:text-[28px]">
                {group.job_title}
              </h2>

              <p className="mt-1.5 text-sm leading-6 text-[#667085]">
                All reviewer-approved variants for this job are grouped
                together here.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 lg:shrink-0">
            <div className="hidden gap-3 sm:flex">
              <InfoTile
                icon={<ListChecks size={16} />}
                label="Questions"
                value={`${totalQuestions} total`}
                tone="primary"
              />

              <InfoTile
                icon={<ClipboardCheck size={16} />}
                label="Variants"
                value={`${group.items.length} sets`}
                tone="teal"
              />
            </div>

            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#E1E4EB] bg-white text-[#5658E8]">
              {expanded ? (
                <ChevronUp size={18} />
              ) : (
                <ChevronDown size={18} />
              )}
            </span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[#E7E9EF] bg-[#FAFBFD] p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-4">
            {group.items.map((item) => (
              <AssessmentCard
                key={`${item.assessment_set_id}-${item.assessment_id ?? "unmaterialized"}`}
                item={item}
                formatDateTime={formatDateTime}
                formatDuration={formatDuration}
                onConfigureDelivery={onConfigureDelivery}
                onSendInvitations={onSendInvitations}
                onAddCandidates={onAddCandidates}
                sendingInvitationsFor={sendingInvitationsFor}
              />
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function AssessmentCard({
  item,
  formatDateTime,
  formatDuration,
  onConfigureDelivery,
  onSendInvitations,
  onAddCandidates,
  sendingInvitationsFor,
}) {
  const navigate = useNavigate();
  const handedOff = item?.sent_to_hr !== false;

  const activated =
    String(item?.assessment_status || "").toLowerCase() === "published";

  const canConfigureDelivery =
    handedOff && Boolean(item?.assessment_id) && !activated;

  return (
    <article className="group rounded-[24px] border border-[#E1E4EB] bg-white p-5 shadow-[0_12px_34px_rgba(38,40,79,0.04)] transition duration-200 hover:-translate-y-[1px] hover:border-[#D2D5E1] hover:shadow-[0_18px_44px_rgba(38,40,79,0.07)] sm:p-6">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-stretch xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
                !handedOff
                  ? "bg-[#F3F4F8] text-[#62687A]"
                  : activated
                    ? "bg-[#ECECFF] text-[#5658E8]"
                    : "bg-[#EAF8F1] text-[#2E9B67]"
              }`}
            >
              {!handedOff ? (
                <Clock3 size={13} />
              ) : (
                <CheckCircle2 size={13} />
              )}

              {!handedOff
                ? "Awaiting HR handoff"
                : activated
                  ? "Delivery activated"
                  : "Ready for HR"}
            </span>

            <span className="inline-flex items-center rounded-full bg-[#F3F4F8] px-3 py-1.5 text-xs font-bold text-[#62687A]">
              Set {item.variant_number} Â· {item.label}
            </span>
          </div>

          <h2 className="mt-4 text-xl font-bold text-[#26284F] sm:text-2xl">
            {item.title}
          </h2>

          <p className="mt-1.5 text-sm font-semibold text-[#5658E8]">
            {item.job_title}
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <InfoTile
              icon={<ListChecks size={16} />}
              label="Questions"
              value={`${item.question_count} questions`}
              tone="primary"
            />

            <InfoTile
              icon={<Clock3 size={16} />}
              label="Duration"
              value={formatDuration(item.duration_minutes)}
              tone="teal"
            />

            <InfoTile
              icon={<CalendarClock size={16} />}
              label="Reviewer handoff"
              value={formatDateTime(item.sent_to_hr_at)}
              tone="amber"
            />
          </div>
        </div>

        <aside className="flex w-full flex-col justify-between rounded-2xl border border-[#E5E7EE] bg-[#FAFBFD] p-4 xl:w-[270px] xl:shrink-0">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-[#98A2B3]">
              Governance status
            </p>

            <div className="mt-3 flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#ECECFF] text-[#5658E8]">
                <ClipboardCheck size={17} />
              </span>

              <div>
                <p className="text-sm font-bold text-[#26284F]">
                  {activated
                    ? "Delivery activated"
                    : "Reviewer approval complete"}
                </p>

                <p className="mt-1 text-xs leading-5 text-[#667085]">
                  {!handedOff
                    ? "This approved variant is part of the job package but has not been handed off to HR yet."
                    : activated
                      ? "This assessment is published and candidate assignments have been created. Attempts begin only when candidates start."
                      : !item?.assessment_id
                        ? "This approved set is waiting for its candidate-facing assessment to be materialized before HR can configure delivery."
                        : "This set is in the HR delivery stage. Configure the availability window and select verified candidates to activate it."}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 border-t border-[#E5E7EE] pt-4">
            {canConfigureDelivery && (
              <button
                type="button"
                onClick={() => onConfigureDelivery?.(item)}
                className="mb-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#5658E8] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#4648C9] focus:outline-none focus:ring-2 focus:ring-[#5658E8]/30 focus:ring-offset-2"
              >
                <CalendarClock size={16} />
                Configure delivery
              </button>
            )}

            {activated && (
              <>
                <div className="mb-3 flex items-center gap-2 rounded-xl border border-[#D8F0E4] bg-[#F1FBF6] px-3 py-2.5 text-xs font-semibold text-[#238657]">
                  <CheckCircle2 size={15} />
                  Assignments created
                </div>

                <button
                  type="button"
                  onClick={() =>
                    navigate(`/assessments/${item.assessment_id}/results`)
                  }
                  className="mb-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#5658E8] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#4648C9] focus:outline-none focus:ring-2 focus:ring-[#5658E8]/30"
                >
                  <Users size={16} />
                  View candidates & results
                </button>

                <button
                  type="button"
                  onClick={() => onAddCandidates?.(item)}
                  className="mb-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#D8D9FB] bg-white px-4 py-3 text-sm font-bold text-[#5658E8] transition hover:bg-[#F8F8FF] focus:outline-none focus:ring-2 focus:ring-[#5658E8]/30"
                >
                  <UserPlus size={16} />
                  Add missed candidate(s)
                </button>

                <button
                  type="button"
                  onClick={() => onSendInvitations?.(item)}
                  disabled={
                    sendingInvitationsFor === Number(item.assessment_id)
                  }
                  className="mb-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#D8D9FB] bg-[#F8F8FF] px-4 py-3 text-sm font-bold text-[#5658E8] transition hover:bg-[#ECECFF] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sendingInvitationsFor === Number(item.assessment_id) ? (
                    <RefreshCw
                      size={16}
                      className="animate-spin"
                    />
                  ) : (
                    <Mail size={16} />
                  )}

                  {sendingInvitationsFor === Number(item.assessment_id)
                    ? "Sending invitation emailsâ€¦"
                    : "Send / resend invitation emails"}
                </button>
              </>
            )}

            <p className="text-xs leading-5 text-[#98A2B3]">
              Assessment Set #{item.assessment_set_id}
              {item?.assessment_id
                ? ` Â· Candidate Assessment #${item.assessment_id}`
                : " Â· Candidate Assessment not yet materialized"}
            </p>
          </div>
        </aside>
      </div>
    </article>
  );
}

function InfoTile({
  icon,
  label,
  value,
  tone,
}) {
  const tones = {
    primary: {
      icon: "bg-[#ECECFF] text-[#5658E8]",
    },
    teal: {
      icon: "bg-[#E5F7F3] text-[#0F9D8A]",
    },
    amber: {
      icon: "bg-[#FBF2DE] text-[#C58A32]",
    },
  };

  const style = tones[tone] || tones.primary;

  return (
    <div className="rounded-xl border border-[#E6E8EF] bg-white p-3.5">
      <div className="flex items-center gap-2.5">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${style.icon}`}
        >
          {icon}
        </span>

        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#98A2B3]">
            {label}
          </p>

          <p className="mt-0.5 truncate text-sm font-semibold text-[#384052]">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

function AssessmentLoading() {
  return (
    <section
      className="space-y-4"
      aria-label="Loading assessments"
    >
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="animate-pulse rounded-[24px] border border-[#E1E4EB] bg-white p-6"
        >
          <div className="h-6 w-40 rounded bg-[#EEF0F5]" />
          <div className="mt-4 h-7 w-2/3 rounded bg-[#EEF0F5]" />
          <div className="mt-2 h-4 w-1/3 rounded bg-[#F1F2F6]" />

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="h-16 rounded-xl bg-[#F4F5F8]" />
            <div className="h-16 rounded-xl bg-[#F4F5F8]" />
            <div className="h-16 rounded-xl bg-[#F4F5F8]" />
          </div>
        </div>
      ))}
    </section>
  );
}

export default Assessments;
