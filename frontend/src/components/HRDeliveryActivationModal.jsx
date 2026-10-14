import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  RefreshCw,
  Search,
  UserPlus,
  Plus,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import api from "../services/api";

function getErrorMessage(error, fallback) {
  const detail = error?.response?.data?.detail;

  if (Array.isArray(detail)) {
    return detail
      .map((item) => (typeof item === "string" ? item : item?.msg || JSON.stringify(item)))
      .filter(Boolean)
      .join(" ");
  }

  return typeof detail === "string" ? detail : fallback;
}

function HRDeliveryActivationModal({ item, onClose, onActivated }) {
  const assessmentId = item?.assessment_id;
  const isAddCandidatesMode = item?.delivery_mode === "add-candidates";
  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidateFormOpen, setCandidateFormOpen] = useState(false);
  const [newCandidateName, setNewCandidateName] = useState("");
  const [newCandidateEmail, setNewCandidateEmail] = useState("");
  const [addingCandidate, setAddingCandidate] = useState(false);
  const [revokingCandidateId, setRevokingCandidateId] = useState(null);
  const [candidateNotice, setCandidateNotice] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState([]);
  const [selectedCandidates, setSelectedCandidates] = useState([]);
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [activating, setActivating] = useState(false);
  const [candidateError, setCandidateError] = useState("");
  const [activationError, setActivationError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const search = candidateSearch.trim();
    setLoadingCandidates(true);
    setCandidateError("");

    const timer = window.setTimeout(async () => {
      try {
        const response = await api.get("/assessment-delivery/hr/candidates", {
          params: {
            limit: 100,
            ...(search ? { search } : {}),
            ...(isAddCandidatesMode ? { exclude_assessment_id: assessmentId } : {}),
          },
        });
        if (!cancelled) {
          const nextCandidates = response.data?.items;
          setCandidates(Array.isArray(nextCandidates) ? nextCandidates : []);
        }
      } catch (error) {
        if (!cancelled) {
          setCandidateError(
            getErrorMessage(error, "Unable to load candidate accounts right now.")
          );
        }
      } finally {
        if (!cancelled) setLoadingCandidates(false);
      }
    }, search ? 250 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [assessmentId, candidateSearch, isAddCandidatesMode]);

  const selectedCount = selectedCandidateIds.length;
  const visibleCandidateIds = useMemo(
    () => candidates.map((candidate) => Number(candidate.id)),
    [candidates]
  );
  const allVisibleSelected =
    visibleCandidateIds.length > 0 &&
    visibleCandidateIds.every((id) => selectedCandidateIds.includes(id));

  const removeCandidateFromSelection = (candidateId) => {
    const id = Number(candidateId);
    setSelectedCandidateIds((current) => current.filter((value) => value !== id));
    setSelectedCandidates((current) =>
      current.filter((candidate) => Number(candidate.id) !== id)
    );
  };

  const toggleCandidate = (candidate) => {
    const id = Number(candidate.id);
    if (selectedCandidateIds.includes(id)) {
      removeCandidateFromSelection(id);
      return;
    }

    setSelectedCandidateIds((current) =>
      current.includes(id) ? current : [...current, id]
    );
    setSelectedCandidates((current) => [
      candidate,
      ...current.filter((value) => Number(value.id) !== id),
    ]);
  };

  const toggleVisibleCandidates = () => {
    if (allVisibleSelected) {
      const visible = new Set(visibleCandidateIds);
      setSelectedCandidateIds((current) =>
        current.filter((id) => !visible.has(id))
      );
      setSelectedCandidates((current) =>
        current.filter((candidate) => !visible.has(Number(candidate.id)))
      );
      return;
    }

    setSelectedCandidateIds((current) =>
      Array.from(new Set([...current, ...visibleCandidateIds]))
    );
    setSelectedCandidates((current) => {
      const currentIds = new Set(current.map((candidate) => Number(candidate.id)));
      return [
        ...current,
        ...candidates.filter((candidate) => !currentIds.has(Number(candidate.id))),
      ];
    });
  };

  const handleAddCandidate = async (event) => {
    event.preventDefault();
    setCandidateError("");
    setCandidateNotice("");

    const fullName = newCandidateName.trim().replace(/\s+/g, " ");
    const email = newCandidateEmail.trim().toLowerCase();

    if (fullName.length < 2) {
      setCandidateError("Enter the candidate's full name.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setCandidateError("Enter a valid email address.");
      return;
    }

    setAddingCandidate(true);
    try {
      const response = await api.post("/assessment-delivery/hr/candidates", {
        full_name: fullName,
        email,
      });
      const candidate = response.data?.candidate;
      if (!candidate?.id) {
        throw new Error("The server did not return the new candidate.");
      }

      setCandidates((current) => [
        candidate,
        ...current.filter((existing) => Number(existing.id) !== Number(candidate.id)),
      ]);
      setSelectedCandidateIds((current) =>
        current.includes(Number(candidate.id))
          ? current
          : [...current, Number(candidate.id)]
      );
      setSelectedCandidates((current) => [
        candidate,
        ...current.filter((value) => Number(value.id) !== Number(candidate.id)),
      ]);
      setCandidateSearch("");
      setNewCandidateName("");
      setNewCandidateEmail("");
      setCandidateFormOpen(false);
      setCandidateNotice(
        response.data?.message ||
          "Candidate added. An account activation email has been sent."
      );
    } catch (error) {
      setCandidateError(
        getErrorMessage(
          error,
          "Unable to add this candidate. Check the email address and try again."
        )
      );
    } finally {
      setAddingCandidate(false);
    }
  };


  const handleRevokeInvitation = async (candidate) => {
    const candidateId = Number(candidate?.id);
    if (!candidateId || !candidate?.can_revoke_invitation) return;

    const candidateName =
      candidate.full_name || candidate.username || candidate.email || "this candidate";
    const confirmed = window.confirm(
      `Revoke the account-setup invitation for ${candidateName}? This invalidates the setup link and removes the candidate from the eligible list. Their account record and any existing assessment assignments will be retained.`
    );

    if (!confirmed) return;

    setCandidateError("");
    setCandidateNotice("");
    setRevokingCandidateId(candidateId);

    try {
      const response = await api.delete(
        `/assessment-delivery/hr/candidates/${candidateId}/invitation`
      );

      setCandidates((current) =>
        current.filter((item) => Number(item.id) !== candidateId)
      );
      setSelectedCandidateIds((current) =>
        current.filter((id) => Number(id) !== candidateId)
      );
      setSelectedCandidates((current) =>
        current.filter((value) => Number(value.id) !== candidateId)
      );
      setCandidateNotice(
        response.data?.message ||
          "Invitation revoked. The candidate account and any existing assignments were retained."
      );
    } catch (error) {
      setCandidateError(
        getErrorMessage(
          error,
          "Unable to revoke this invitation. Refresh the candidate list and try again."
        )
      );
    } finally {
      setRevokingCandidateId(null);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setActivationError("");

    if (!assessmentId) {
      setActivationError("This assessment has not been materialized yet.");
      return;
    }
    if (selectedCandidateIds.length === 0) {
      setActivationError("Select at least one candidate.");
      return;
    }

    let endpoint = `/assessment-delivery/hr/assessments/${assessmentId}/activate`;
    let payload = { candidate_ids: selectedCandidateIds };

    if (isAddCandidatesMode) {
      endpoint = `/assessment-delivery/hr/assessments/${assessmentId}/add-candidates`;
    } else {
      if (!opensAt || !closesAt) {
        setActivationError("Choose both an opening and a closing date/time.");
        return;
      }

      const openingDate = new Date(opensAt);
      const closingDate = new Date(closesAt);
      if (
        Number.isNaN(openingDate.getTime()) ||
        Number.isNaN(closingDate.getTime()) ||
        openingDate.getTime() >= closingDate.getTime()
      ) {
        setActivationError("The closing date/time must be later than the opening date/time.");
        return;
      }

      payload = {
        ...payload,
        // Convert browser-local datetime inputs to timezone-aware UTC ISO strings.
        opens_at: openingDate.toISOString(),
        closes_at: closingDate.toISOString(),
      };
    }

    setActivating(true);
    try {
      const response = await api.post(endpoint, payload);
      onActivated?.(response.data);
    } catch (error) {
      setActivationError(
        getErrorMessage(
          error,
          isAddCandidatesMode
            ? "Unable to add candidates. Check that they are not already assigned and the assessment window is still open."
            : "Unable to activate delivery. Please review the details and try again."
        )
      );
    } finally {
      setActivating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[#17192F]/55 p-3 backdrop-blur-[3px] sm:p-6"
      role="presentation"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="hr-delivery-title"
        className="my-auto flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-[26px] border border-[#E1E4EB] bg-white shadow-[0_30px_100px_rgba(20,22,48,0.28)]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-[#E7E9EF] px-5 py-5 sm:px-7">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full bg-[#ECECFF] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#5658E8]">
              <CalendarClock size={13} /> {isAddCandidatesMode ? "Add candidates" : "HR delivery setup"}
            </span>
            <h2 id="hr-delivery-title" className="mt-3 text-xl font-bold text-[#26284F] sm:text-2xl">
              {isAddCandidatesMode ? "Add missed candidates" : "Configure assessment delivery"}
            </h2>
            <p className="mt-1 text-sm text-[#667085]">
              {item?.title || `Assessment #${assessmentId}`} · {item?.job_title || "Assessment"}
            </p>
            <p className="mt-1 text-xs text-[#98A2B3]">
              Assessment Set #{item?.assessment_set_id} · Candidate Assessment #{assessmentId}
            </p>
            {isAddCandidatesMode && (
              <p className="mt-2 max-w-xl text-xs leading-5 text-[#667085]">
                New candidates inherit the existing assessment availability window. Existing assignments, attempts, scores, and invitation links will not be changed.
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="Close delivery setup"
            onClick={onClose}
            disabled={activating}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#E1E4EB] text-[#667085] transition hover:bg-[#F7F8FC] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-7">
            {!isAddCandidatesMode && (
              <section>
              <div className="mb-3 flex items-center gap-2">
                <CalendarClock size={17} className="text-[#5658E8]" />
                <h3 className="text-sm font-bold text-[#26284F]">Availability window</h3>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-[#4A4D68]">Opens at</span>
                  <input
                    type="datetime-local"
                    required
                    value={opensAt}
                    onChange={(event) => setOpensAt(event.target.value)}
                    disabled={activating}
                    className="w-full rounded-xl border border-[#DCE0E8] bg-white px-3 py-3 text-sm text-[#1B2430] outline-none focus:border-[#5658E8] focus:ring-2 focus:ring-[#5658E8]/10 disabled:bg-[#F7F8FC]"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-[#4A4D68]">Closes at</span>
                  <input
                    type="datetime-local"
                    required
                    value={closesAt}
                    onChange={(event) => setClosesAt(event.target.value)}
                    disabled={activating}
                    className="w-full rounded-xl border border-[#DCE0E8] bg-white px-3 py-3 text-sm text-[#1B2430] outline-none focus:border-[#5658E8] focus:ring-2 focus:ring-[#5658E8]/10 disabled:bg-[#F7F8FC]"
                  />
                </label>
              </div>
              <p className="mt-2 text-xs leading-5 text-[#98A2B3]">
                Times are entered in your browser’s local timezone and sent to the server with an explicit timezone.
              </p>
              </section>
            )}

            <section>
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <UserRound size={17} className="text-[#5658E8]" />
                    <h3 className="text-sm font-bold text-[#26284F]">Select candidates</h3>
                  </div>
                  <p className="mt-1 text-xs text-[#667085]">
                    {isAddCandidatesMode
                      ? "Only candidates not already assigned to this assessment are listed."
                      : "Verified accounts and candidates with a valid account-setup invitation are listed."}
                  </p>
                </div>
                <span className="inline-flex w-fit items-center rounded-full bg-[#ECECFF] px-3 py-1.5 text-xs font-bold text-[#5658E8]">
                  {selectedCount} selected
                </span>
              </div>

              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#98A2B3]" />
                <input
                  type="search"
                  value={candidateSearch}
                  onChange={(event) => setCandidateSearch(event.target.value)}
                  placeholder="Search by username or email"
                  aria-label="Search verified candidates"
                  disabled={activating}
                  className="w-full rounded-xl border border-[#DCE0E8] bg-[#FAFBFD] py-3 pl-10 pr-3 text-sm text-[#1B2430] outline-none focus:border-[#5658E8] focus:bg-white focus:ring-2 focus:ring-[#5658E8]/10 disabled:bg-[#F7F8FC]"
                />
              </div>

              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => {
                    setCandidateFormOpen((open) => !open);
                    setCandidateError("");
                    setCandidateNotice("");
                  }}
                  disabled={activating || addingCandidate}
                  className="inline-flex items-center gap-2 rounded-xl border border-[#D8D9FB] bg-[#F8F8FF] px-3.5 py-2.5 text-sm font-bold text-[#5658E8] transition hover:bg-[#ECECFF] disabled:opacity-50"
                >
                  <UserPlus size={16} />
                  {candidateFormOpen ? "Cancel add candidate" : "Add candidate by name and email"}
                </button>
              </div>

              {candidateFormOpen && (
                <div className="mt-3 rounded-2xl border border-[#D8D9FB] bg-[#FBFBFF] p-4">
                  <div className="mb-3">
                    <h4 className="text-sm font-bold text-[#26284F]">New candidate</h4>
                    <p className="mt-1 text-xs leading-5 text-[#667085]">
                      We will create a pending candidate account and email a single-use link to set their password. The email address is verified only after they use that link.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-bold text-[#4A4D68]">Full name</span>
                      <input
                        type="text"
                        required
                        minLength={2}
                        maxLength={100}
                        value={newCandidateName}
                        onChange={(event) => setNewCandidateName(event.target.value)}
                        disabled={addingCandidate || activating}
                        placeholder="e.g. Aditi Sharma"
                        autoComplete="name"
                        className="w-full rounded-xl border border-[#DCE0E8] bg-white px-3 py-3 text-sm text-[#1B2430] outline-none focus:border-[#5658E8] focus:ring-2 focus:ring-[#5658E8]/10 disabled:bg-[#F7F8FC]"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-bold text-[#4A4D68]">Email address</span>
                      <input
                        type="email"
                        required
                        maxLength={255}
                        value={newCandidateEmail}
                        onChange={(event) => setNewCandidateEmail(event.target.value)}
                        disabled={addingCandidate || activating}
                        placeholder="candidate@example.com"
                        autoComplete="email"
                        className="w-full rounded-xl border border-[#DCE0E8] bg-white px-3 py-3 text-sm text-[#1B2430] outline-none focus:border-[#5658E8] focus:ring-2 focus:ring-[#5658E8]/10 disabled:bg-[#F7F8FC]"
                      />
                    </label>
                  </div>

                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={handleAddCandidate}
                      disabled={addingCandidate || activating || !newCandidateName.trim() || !newCandidateEmail.trim()}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#5658E8] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#4648C9] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {addingCandidate ? <RefreshCw size={15} className="animate-spin" /> : <Plus size={16} />}
                      {addingCandidate ? "Adding candidate…" : "Add and select candidate"}
                    </button>
                  </div>
                </div>
              )}

              {candidateNotice && (
                <div role="status" className="mt-3 rounded-xl border border-[#D8F0E4] bg-[#F1FBF6] px-3 py-2.5 text-xs leading-5 text-[#226747]">
                  {candidateNotice}
                </div>
              )}

              {selectedCandidateIds.length > 0 && (
                <div className="mt-3 rounded-xl border border-[#D8D9FB] bg-[#F8F8FF] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-bold text-[#34365F]">
                      Selected for this delivery
                    </p>
                    <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-[#5658E8]">
                      {selectedCandidateIds.length}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedCandidates
                      .filter((candidate) => selectedCandidateIds.includes(Number(candidate.id)))
                      .map((candidate) => {
                        const candidateId = Number(candidate.id);
                        const name = candidate.full_name || candidate.username || candidate.email;
                        return (
                          <span
                            key={candidate.id}
                            className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-[#E1E2FA] bg-white py-1.5 pl-2.5 pr-1.5 text-xs text-[#414365]"
                          >
                            <span className="max-w-[180px] truncate">{name}</span>
                            <button
                              type="button"
                              onClick={() => removeCandidateFromSelection(candidateId)}
                              disabled={activating || revokingCandidateId !== null}
                              aria-label={`Remove ${name} from this delivery`}
                              title="Remove from this delivery"
                              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#667085] transition hover:bg-[#FDEEEE] hover:text-[#A43E45] disabled:opacity-50"
                            >
                              <X size={13} />
                            </button>
                          </span>
                        );
                      })}
                  </div>
                  <p className="mt-2 text-[11px] leading-4 text-[#777A9C]">
                    Removing here only changes this delivery selection. It does not delete the candidate or revoke their account invitation.
                  </p>
                </div>
              )}

              {candidates.length > 0 && !loadingCandidates && (
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-[#667085]">{candidates.length} result{candidates.length === 1 ? "" : "s"}</p>
                  <button
                    type="button"
                    onClick={toggleVisibleCandidates}
                    disabled={activating}
                    className="text-xs font-bold text-[#5658E8] hover:text-[#4648C9] disabled:opacity-50"
                  >
                    {allVisibleSelected ? "Clear visible selection" : "Select all visible"}
                  </button>
                </div>
              )}

              {candidateError && (
                <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-[#F1C9C9] bg-[#FFF7F7] p-3 text-sm text-[#9B4444]">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{candidateError}</span>
                </div>
              )}

              <div className="mt-3 max-h-64 overflow-y-auto rounded-2xl border border-[#E1E4EB]">
                {loadingCandidates ? (
                  <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-[#667085]">
                    <RefreshCw size={16} className="animate-spin" /> Loading candidate accounts…
                  </div>
                ) : candidates.length === 0 ? (
                  <div className="px-4 py-10 text-center">
                    <UserRound size={24} className="mx-auto text-[#B0B5C2]" />
                    <p className="mt-2 text-sm font-semibold text-[#384052]">
                      {candidateSearch.trim() ? "No candidates match this search" : "No candidates available"}
                    </p>
                    <p className="mt-1 text-xs text-[#98A2B3]">
                      {candidateSearch.trim()
                        ? "Try a different username or email address."
                        : "Add a candidate by name and email, or verify an existing account before assigning."}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-[#EEF0F4]">
                    {candidates.map((candidate) => {
                      const id = Number(candidate.id);
                      const checked = selectedCandidateIds.includes(id);
                      const isRevoking = revokingCandidateId === id;
                      const displayName =
                        candidate.full_name || candidate.username || candidate.email || `Candidate #${candidate.id}`;

                      return (
                        <div
                          key={candidate.id}
                          className={`flex items-center gap-3 px-3 py-3 transition sm:px-4 ${checked ? "bg-[#F5F5FF]" : "bg-white"}`}
                        >
                          <label
                            htmlFor={`hr-candidate-${id}`}
                            className="flex min-w-0 flex-1 cursor-pointer items-center gap-3"
                          >
                            <input
                              id={`hr-candidate-${id}`}
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleCandidate(candidate)}
                              disabled={activating || isRevoking}
                              className="h-4 w-4 shrink-0 accent-[#5658E8]"
                            />
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EEF0FF] text-[#5658E8]">
                              <UserRound size={16} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-[#26284F]">
                                {displayName}
                              </span>
                              <span className="block truncate text-xs text-[#667085]">{candidate.email}</span>
                              {candidate.account_status === "pending_activation" ? (
                                <span className="mt-1 inline-flex rounded-full bg-[#FBF2DE] px-2 py-0.5 text-[10px] font-bold text-[#8C641D]">
                                  Account setup pending · Invitation sent
                                </span>
                              ) : (
                                <span className="mt-1 inline-flex rounded-full bg-[#EAF8F0] px-2 py-0.5 text-[10px] font-bold text-[#28734D]">
                                  Email verified
                                </span>
                              )}
                            </span>
                          </label>

                          {checked && (
                            <CheckCircle2
                              size={17}
                              className="shrink-0 text-[#5658E8]"
                              aria-label="Selected"
                            />
                          )}

                          {candidate.can_revoke_invitation && (
                            <button
                              type="button"
                              onClick={() => handleRevokeInvitation(candidate)}
                              disabled={activating || addingCandidate || revokingCandidateId !== null}
                              title={`Revoke invitation for ${displayName}`}
                              aria-label={`Revoke invitation for ${displayName}`}
                              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#F2D5D5] px-2.5 py-2 text-xs font-semibold text-[#A43E45] transition hover:bg-[#FFF4F4] disabled:cursor-not-allowed disabled:opacity-50 sm:px-3"
                            >
                              {isRevoking ? (
                                <RefreshCw size={14} className="animate-spin" />
                              ) : (
                                <Trash2 size={14} />
                              )}
                              <span className="hidden sm:inline">
                                {isRevoking ? "Revoking…" : "Revoke invite"}
                              </span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            {activationError && (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-[#F1C9C9] bg-[#FFF7F7] p-3 text-sm text-[#9B4444]">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{activationError}</span>
              </div>
            )}

            <div className="rounded-xl border border-[#E4E5FD] bg-[#F8F8FF] px-4 py-3 text-xs leading-5 text-[#5658A0]">
              {isAddCandidatesMode
                ? "Only the selected new assignments will be created. Assessment invitations will be emailed to the added candidates. Existing candidate assignments, attempts, scores, and invitation links remain unchanged. Candidates with new accounts must also complete their account-setup email before signing in."
                : "Activating publishes this approved assessment and creates assignments for selected candidates. New candidates must complete the emailed account-setup link before they can sign in. Candidate attempts do not start during activation."}
            </div>
          </div>

          <footer className="flex flex-col-reverse gap-3 border-t border-[#E7E9EF] bg-[#FAFBFD] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <p className="text-xs text-[#98A2B3]">{selectedCount} candidate{selectedCount === 1 ? "" : "s"} selected</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={onClose}
                disabled={activating}
                className="rounded-xl border border-[#DCE0E8] bg-white px-4 py-3 text-sm font-semibold text-[#4A4D68] transition hover:bg-[#F7F8FC] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  activating ||
                  loadingCandidates ||
                  revokingCandidateId !== null ||
                  selectedCount === 0 ||
                  (!isAddCandidatesMode && (!opensAt || !closesAt))
                }
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#5658E8] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#4648C9] focus:outline-none focus:ring-2 focus:ring-[#5658E8]/30 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {activating ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : isAddCandidatesMode ? (
                  <UserPlus size={16} />
                ) : (
                  <CalendarClock size={16} />
                )}
                {activating
                  ? isAddCandidatesMode ? "Adding candidates…" : "Activating delivery…"
                  : isAddCandidatesMode ? "Add candidates & send invitations" : "Activate delivery"}
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  );
}

export default HRDeliveryActivationModal;
