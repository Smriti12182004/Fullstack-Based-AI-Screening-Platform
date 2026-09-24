import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  FileText,
  ListChecks,
  RefreshCw,
  Rocket,
  Save,
  Settings2,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import RecruiterLayout from "../layouts/RecruiterLayout";


function AssessmentConfig() {
  const { questionSetId } = useParams();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [totalQuestions, setTotalQuestions] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [candidateInstructions, setCandidateInstructions] = useState("");

  const [configuration, setConfiguration] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [assembling, setAssembling] = useState(false);

  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [assemblyError, setAssemblyError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [assemblySuccess, setAssemblySuccess] = useState("");

  const [assembledAssessment, setAssembledAssessment] = useState(null);

  const [notConfigured, setNotConfigured] = useState(false);

  const difficultyTotal = useMemo(() => {
    if (!configuration) {
      return 0;
    }

    return (
      Number(configuration.easy_count || 0) +
      Number(configuration.medium_count || 0) +
      Number(configuration.hard_count || 0)
    );
  }, [configuration]);

  const assemblyReady = useMemo(() => {
    if (!configuration) {
      return false;
    }

    if (configuration.warnings?.length > 0) {
      return false;
    }

    return (
      Number(configuration.total_questions) === difficultyTotal
    );
  }, [configuration, difficultyTotal]);

  const handleAuthError = (err) => {
    if (
      err.response?.status === 401 ||
      err.response?.status === 403
    ) {
      logout();
      navigate("/login", { replace: true });
      return true;
    }

    return false;
  };

  const loadConfiguration = async (showRefreshState = false) => {
    if (!questionSetId) {
      setError("Unable to determine the question set.");
      setLoading(false);
      return;
    }

    try {
      setError("");
      setAssemblyError("");

      if (showRefreshState) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const response = await api.get(
        `/question-sets/${questionSetId}/configuration`
      );

      const data = response.data;

      setConfiguration(data);

      setTotalQuestions(
        data.total_questions != null
          ? String(data.total_questions)
          : ""
      );

      setDurationMinutes(
        data.duration_minutes != null
          ? String(data.duration_minutes)
          : ""
      );

      setCandidateInstructions(
        data.candidate_instructions || ""
      );

      setNotConfigured(false);
      setSuccessMessage("");
    } catch (err) {
      console.error(
        "Failed to load assessment configuration:",
        err
      );

      if (handleAuthError(err)) {
        return;
      }

      if (err.response?.status === 404) {
        setConfiguration(null);
        setNotConfigured(true);
        setTotalQuestions("");
        setDurationMinutes("");
        setCandidateInstructions("");
        setError("");
        return;
      }

      setError(
        err.response?.data?.detail ||
          "Unable to load the assessment configuration."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadConfiguration();
  }, [questionSetId]);

  const handleSave = async (event) => {
    event.preventDefault();

    setSaveError("");
    setSuccessMessage("");
    setAssemblyError("");
    setAssemblySuccess("");

    const parsedTotalQuestions = Number(totalQuestions);
    const parsedDurationMinutes = Number(durationMinutes);

    if (
      !Number.isInteger(parsedTotalQuestions) ||
      parsedTotalQuestions <= 0
    ) {
      setSaveError(
        "Total questions must be a positive whole number."
      );
      return;
    }

    if (
      !Number.isInteger(parsedDurationMinutes) ||
      parsedDurationMinutes <= 0
    ) {
      setSaveError(
        "Duration must be a positive whole number."
      );
      return;
    }

    try {
      setSaving(true);

      const response = await api.put(
        `/question-sets/${questionSetId}/configuration`,
        {
          total_questions: parsedTotalQuestions,
          duration_minutes: parsedDurationMinutes,
          candidate_instructions:
            candidateInstructions.trim() || null,
        }
      );

      setConfiguration(response.data);

      setTotalQuestions(
        String(response.data.total_questions)
      );

      setDurationMinutes(
        String(response.data.duration_minutes)
      );

      setCandidateInstructions(
        response.data.candidate_instructions || ""
      );

      setNotConfigured(false);

      setSuccessMessage(
        "Assessment configuration saved successfully."
      );
    } catch (err) {
      console.error(
        "Failed to save assessment configuration:",
        err
      );

      if (handleAuthError(err)) {
        return;
      }

      setSaveError(
        err.response?.data?.detail ||
          "Unable to save the assessment configuration."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleAssemble = async () => {
    setAssemblyError("");
    setAssemblySuccess("");
    setSuccessMessage("");

    if (!configuration) {
      setAssemblyError(
        "Save the assessment configuration before assembling the assessment."
      );
      return;
    }

    if (!assemblyReady) {
      setAssemblyError(
        "The approved question inventory does not currently satisfy the configured assessment requirements."
      );
      return;
    }

    try {
      setAssembling(true);

      const response = await api.post(
        "/assessments/assemble",
        {
          question_set_id: Number(questionSetId),
          title: `Assessment - Question Set #${questionSetId}`,
        }
      );

      const assessment = response.data;

      setAssembledAssessment(assessment);

      setAssemblySuccess(
        `Assessment #${assessment.id} assembled successfully with the configured question distribution.`
      );
    } catch (err) {
      console.error(
        "Failed to assemble assessment:",
        err
      );

      if (handleAuthError(err)) {
        return;
      }

      setAssemblyError(
        err.response?.data?.detail ||
          "Unable to assemble the assessment."
      );
    } finally {
      setAssembling(false);
    }
  };

  if (loading) {
    return (
      <RecruiterLayout
        title="Assessment Configuration"
        breadcrumb="Workspace / Question Sets / Configuration"
      >
        <main className="mx-auto flex min-h-[65vh] max-w-[1240px] items-center justify-center px-5 sm:px-8">
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAE5F9]">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#D9D9EA] border-t-[#5658E8]" />
            </div>

            <p className="mt-5 text-sm font-semibold text-[#344054]">
              Loading assessment configuration
            </p>

            <p className="mt-1.5 text-xs text-[#98A2B3]">
              Fetching the current question-set configuration.
            </p>
          </div>
        </main>
      </RecruiterLayout>
    );
  }

  if (error) {
    return (
      <RecruiterLayout
        title="Assessment Configuration"
        breadcrumb="Workspace / Question Sets / Configuration"
      >
        <main className="mx-auto flex min-h-[65vh] max-w-[1240px] items-center justify-center px-5 sm:px-8">
          <div className="w-full max-w-2xl rounded-[22px] border border-[#F0D5D5] bg-white p-8 shadow-[0_18px_45px_rgba(38,40,79,0.05)] sm:p-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#FCE7E7] text-[#B42318]">
              <AlertCircle size={20} />
            </div>

            <p className="mt-6 text-[9px] font-bold uppercase tracking-[0.2em] text-[#B42318]">
              Assessment configuration
            </p>

            <h1 className="mt-3 text-[32px] font-semibold tracking-[-0.03em] text-[#182033]">
              Configuration unavailable
            </h1>

            <p className="mt-3 text-sm leading-7 text-[#667085]">
              {error}
            </p>

            <div className="mt-7 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => loadConfiguration()}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#5658E8] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#494BD8]"
              >
                <RefreshCw size={15} />
                Try again
              </button>

              <button
                type="button"
                onClick={() => navigate("/questions")}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#D7DCE5] bg-white px-5 py-3 text-sm font-semibold text-[#475467] transition hover:border-[#5658E8] hover:text-[#5658E8]"
              >
                <ArrowLeft size={15} />
                Back to Question Bank
              </button>
            </div>
          </div>
        </main>
      </RecruiterLayout>
    );
  }

  return (
    <RecruiterLayout
      title="Assessment Configuration"
      breadcrumb={`Workspace / Question Sets / Set #${questionSetId}`}
    >
      <main className="mx-auto max-w-[1240px] px-4 pb-12 sm:px-8">
        {/* =====================================================
            PAGE HEADER
        ===================================================== */}
        <section className="relative overflow-hidden rounded-[24px] border border-[#DDE1E9] bg-white shadow-[0_12px_34px_rgba(38,40,79,0.04)]">
          <div className="h-1 bg-gradient-to-r from-[#CFDEFC] via-[#EAE5F9] to-[#F3E3F2]" />

          <div className="pointer-events-none absolute right-[-80px] top-[-80px] h-56 w-56 rounded-full bg-[#EAE5F9]/65 blur-[70px]" />

          <div className="relative p-6 sm:p-8 lg:p-9">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <button
                  type="button"
                  onClick={() => navigate("/questions")}
                  className="group inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#667085] transition hover:-translate-x-0.5 hover:bg-[#F7F8FC] hover:text-[#5658E8]"
                >
                  <ArrowLeft
                    size={14}
                    className="transition-transform duration-200 group-hover:-translate-x-0.5"
                  />
                  Back to Question Bank
                </button>

                <div className="mt-6 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EAE5F9] text-[#7862C8]">
                    <Settings2 size={20} />
                  </div>

                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#7862C8]">
                      Assessment authoring
                    </p>

                    <p className="mt-1 text-[10px] text-[#98A2B3]">
                      Question Set #{questionSetId}
                    </p>
                  </div>
                </div>

                <h1 className="mt-5 text-[34px] font-semibold tracking-[-0.035em] text-[#182033] sm:text-[42px]">
                  Assessment Configuration
                </h1>

                <p className="mt-3 max-w-2xl text-sm leading-7 text-[#667085]">
                  Define the assessment size, candidate time limit,
                  instructions, and the required difficulty
                  distribution for this question set.
                </p>
              </div>

              <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => loadConfiguration(true)}
                  disabled={refreshing || assembling}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#CBD1DC] bg-white px-4 text-xs font-semibold text-[#475467] transition hover:border-[#5658E8] hover:bg-[#FAFAFF] hover:text-[#5658E8] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw
                    size={14}
                    className={
                      refreshing ? "animate-spin" : ""
                    }
                  />
                  {refreshing ? "Refreshing..." : "Refresh"}
                </button>

                <button
                  type="button"
                  onClick={handleAssemble}
                  disabled={
                    !assemblyReady ||
                    assembling ||
                    saving
                  }
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#5658E8] px-4 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(86,88,232,0.16)] transition hover:-translate-y-0.5 hover:bg-[#494BD8] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {assembling ? (
                    <>
                      <RefreshCw
                        size={14}
                        className="animate-spin"
                      />
                      Assembling...
                    </>
                  ) : (
                    <>
                      <Rocket size={14} />
                      Assemble Assessment
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* =====================================================
            SUCCESS / ERROR STATE
        ===================================================== */}
        {(assemblySuccess || assemblyError) && (
          <section className="mt-6">
            {assemblySuccess && (
              <div
                className="flex items-start gap-3 rounded-xl border border-[#CFE6DD] bg-[#F2FAF7] px-4 py-3.5"
                role="status"
              >
                <CheckCircle2
                  size={17}
                  className="mt-0.5 shrink-0 text-[#17655E]"
                />

                <div>
                  <p className="text-sm font-semibold text-[#17655E]">
                    Assessment ready
                  </p>

                  <p className="mt-1 text-xs leading-5 text-[#4B7D63]">
                    {assemblySuccess}
                  </p>

                  {assembledAssessment && (
                    <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#17655E]">
                      Status: {assembledAssessment.status}
                    </p>
                  )}
                </div>
              </div>
            )}

            {assemblyError && (
              <div
                className="flex items-start gap-3 rounded-xl border border-[#E9C8C8] bg-[#FBF2F2] px-4 py-3.5"
                role="alert"
              >
                <AlertCircle
                  size={17}
                  className="mt-0.5 shrink-0 text-[#A83E3E]"
                />

                <div>
                  <p className="text-sm font-semibold text-[#8F3636]">
                    Assessment assembly failed
                  </p>

                  <p className="mt-1 text-xs leading-5 text-[#A83E3E]">
                    {assemblyError}
                  </p>
                </div>
              </div>
            )}
          </section>
        )}

        {/* =====================================================
            CURRENT DISTRIBUTION
        ===================================================== */}
        {configuration && (
          <section className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              icon={<ListChecks size={18} />}
              label="Total questions"
              value={configuration.total_questions}
              description="Configured assessment size."
              background="#EAF2FF"
              color="#3B64C8"
            />

            <SummaryCard
              icon={<Clock3 size={18} />}
              label="Duration"
              value={`${configuration.duration_minutes} min`}
              description="Candidate time limit."
              background="#EAE5F9"
              color="#7862C8"
            />

            <SummaryCard
              icon={<CheckCircle2 size={18} />}
              label="Configured mix"
              value={difficultyTotal}
              description="Sum of easy, medium and hard."
              background="#E8F2EF"
              color="#17655E"
            />

            <SummaryCard
              icon={<Settings2 size={18} />}
              label="Question set"
              value={`#${questionSetId}`}
              description={
                notConfigured
                  ? "Configuration not saved yet."
                  : "Configuration loaded."
              }
              background="#F3E3F2"
              color="#AA5E9C"
              valueSmall
            />
          </section>
        )}

        {/* =====================================================
            FORM + DISTRIBUTION
        ===================================================== */}
        <section className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <article className="rounded-[22px] border border-[#DDE1E9] bg-white shadow-[0_12px_34px_rgba(38,40,79,0.035)]">
            <div className="border-b border-[#EAECF0] px-6 py-5 sm:px-7">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#CFDEFC] text-[#4A61C8]">
                  <Settings2 size={17} />
                </div>

                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#4A61C8]">
                    Configuration
                  </p>

                  <h2 className="mt-1 text-[19px] font-semibold tracking-[-0.02em] text-[#202938]">
                    Assessment rules
                  </h2>
                </div>
              </div>
            </div>

            <form
              onSubmit={handleSave}
              className="space-y-6 px-6 py-7 sm:px-7 sm:py-8"
            >
              {saveError && (
                <div
                  className="flex items-start gap-3 rounded-xl border border-[#E9C8C8] bg-[#FBF2F2] px-4 py-3 text-[12.5px] leading-5 text-[#A83E3E]"
                  role="alert"
                >
                  <AlertCircle
                    size={17}
                    className="mt-0.5 shrink-0"
                  />
                  <span>{saveError}</span>
                </div>
              )}

              {successMessage && (
                <div
                  className="flex items-start gap-3 rounded-xl border border-[#CFE6DD] bg-[#F2FAF7] px-4 py-3 text-[12.5px] leading-5 text-[#17655E]"
                  role="status"
                >
                  <CheckCircle2
                    size={17}
                    className="mt-0.5 shrink-0"
                  />
                  <span>{successMessage}</span>
                </div>
              )}

              {notConfigured && (
                <div className="flex items-start gap-3 rounded-xl border border-[#D8DBF7] bg-[#F7F7FF] px-4 py-3 text-[12.5px] leading-5 text-[#5658E8]">
                  <Settings2
                    size={17}
                    className="mt-0.5 shrink-0"
                  />

                  <div>
                    <p className="font-semibold">
                      No saved configuration yet
                    </p>

                    <p className="mt-1 text-[#667085]">
                      Set the assessment rules below and save them
                      to create the configuration.
                    </p>
                  </div>
                </div>
              )}

              {/* Total questions */}
              <div>
                <label
                  htmlFor="total-questions"
                  className="mb-2 block text-[12.5px] font-semibold text-[#344054]"
                >
                  Total questions
                </label>

                <div className="relative">
                  <ListChecks
                    size={16}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#98A2B3]"
                  />

                  <input
                    id="total-questions"
                    type="number"
                    min="1"
                    step="1"
                    value={totalQuestions}
                    onChange={(event) =>
                      setTotalQuestions(event.target.value)
                    }
                    placeholder="e.g. 10"
                    className="h-11 w-full rounded-lg border border-[#D7DDE6] bg-white pl-10 pr-3 text-sm text-[#202938] outline-none transition placeholder:text-[#98A2B3] focus:border-[#5658E8] focus:ring-4 focus:ring-[#5658E8]/10"
                  />
                </div>

                <p className="mt-2 text-[11px] leading-5 text-[#98A2B3]">
                  Must equal the sum of the configured section
                  difficulty counts.
                </p>
              </div>

              {/* Duration */}
              <div>
                <label
                  htmlFor="duration-minutes"
                  className="mb-2 block text-[12.5px] font-semibold text-[#344054]"
                >
                  Duration
                </label>

                <div className="relative">
                  <Clock3
                    size={16}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#98A2B3]"
                  />

                  <input
                    id="duration-minutes"
                    type="number"
                    min="1"
                    step="1"
                    value={durationMinutes}
                    onChange={(event) =>
                      setDurationMinutes(event.target.value)
                    }
                    placeholder="e.g. 30"
                    className="h-11 w-full rounded-lg border border-[#D7DDE6] bg-white pl-10 pr-3 text-sm text-[#202938] outline-none transition placeholder:text-[#98A2B3] focus:border-[#5658E8] focus:ring-4 focus:ring-[#5658E8]/10"
                  />
                </div>

                <p className="mt-2 text-[11px] leading-5 text-[#98A2B3]">
                  Candidate time limit in minutes.
                </p>
              </div>

              {/* Instructions */}
              <div>
                <label
                  htmlFor="candidate-instructions"
                  className="mb-2 block text-[12.5px] font-semibold text-[#344054]"
                >
                  Candidate instructions
                </label>

                <div className="relative">
                  <FileText
                    size={16}
                    className="pointer-events-none absolute left-3.5 top-3.5 text-[#98A2B3]"
                  />

                  <textarea
                    id="candidate-instructions"
                    value={candidateInstructions}
                    onChange={(event) =>
                      setCandidateInstructions(
                        event.target.value
                      )
                    }
                    maxLength={5000}
                    rows={6}
                    placeholder="Enter instructions shown to candidates before they begin the assessment..."
                    className="w-full resize-y rounded-lg border border-[#D7DDE6] bg-white py-3 pl-10 pr-3 text-sm leading-6 text-[#202938] outline-none transition placeholder:text-[#98A2B3] focus:border-[#5658E8] focus:ring-4 focus:ring-[#5658E8]/10"
                  />
                </div>

                <div className="mt-2 flex justify-end text-[10px] text-[#98A2B3]">
                  {candidateInstructions.length}/5000
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-[#EAECF0] pt-6 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => navigate("/questions")}
                  disabled={saving || assembling}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#CBD1DC] bg-white px-5 text-sm font-semibold text-[#475467] transition hover:border-[#5658E8] hover:bg-[#FAFAFF] hover:text-[#5658E8] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving || assembling}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#5658E8] px-5 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(86,88,232,0.17)] transition hover:-translate-y-0.5 hover:bg-[#494BD8] focus:outline-none focus:ring-4 focus:ring-[#5658E8]/15 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? (
                    <>
                      <RefreshCw
                        size={16}
                        className="animate-spin"
                      />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      Save configuration
                    </>
                  )}
                </button>
              </div>
            </form>
          </article>

          {/* =====================================================
              DISTRIBUTION PANEL
          ===================================================== */}
          <aside className="rounded-[22px] border border-[#DDE1E9] bg-white shadow-[0_12px_34px_rgba(38,40,79,0.035)] lg:sticky lg:top-24">
            <div className="h-1 rounded-t-[22px] bg-[#EAE5F9]" />

            <div className="p-6 sm:p-7">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EAE5F9] text-[#7862C8]">
                <ListChecks size={19} />
              </div>

              <p className="mt-5 text-[9px] font-bold uppercase tracking-[0.18em] text-[#7862C8]">
                Required distribution
              </p>

              <h2 className="mt-2 text-[20px] font-semibold tracking-[-0.02em] text-[#202938]">
                Difficulty mix
              </h2>

              {configuration ? (
                <div className="mt-6 space-y-3">
                  <DistributionRow
                    label="Easy"
                    count={configuration.easy_count}
                  />

                  <DistributionRow
                    label="Medium"
                    count={configuration.medium_count}
                  />

                  <DistributionRow
                    label="Hard"
                    count={configuration.hard_count}
                  />

                  <div className="border-t border-[#EAECF0] pt-4">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-xs font-semibold text-[#667085]">
                        Distribution total
                      </span>

                      <span
                        className={`text-sm font-bold ${
                          difficultyTotal ===
                          Number(configuration.total_questions)
                            ? "text-[#17655E]"
                            : "text-[#B42318]"
                        }`}
                      >
                        {difficultyTotal}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-6 rounded-xl border border-dashed border-[#D7DDE6] bg-[#FAFBFC] p-4">
                  <p className="text-xs leading-5 text-[#98A2B3]">
                    Save the configuration to display the current
                    section and difficulty distribution.
                  </p>
                </div>
              )}

              {configuration?.warnings?.length > 0 && (
                <div className="mt-6 rounded-xl border border-[#ECD9B5] bg-[#FFFBF2] p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle
                      size={17}
                      className="mt-0.5 shrink-0 text-[#9C6A1F]"
                    />

                    <div>
                      <p className="text-xs font-semibold text-[#7C5519]">
                        Question inventory warning
                      </p>

                      <div className="mt-2 space-y-2">
                        {configuration.warnings.map(
                          (warning, index) => (
                            <p
                              key={`${warning}-${index}`}
                              className="text-[11px] leading-5 text-[#806B45]"
                            >
                              {warning}
                            </p>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!configuration?.warnings?.length &&
                configuration && (
                  <div className="mt-6 rounded-xl border border-[#CFE6DD] bg-[#F2FAF7] p-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle2
                        size={17}
                        className="mt-0.5 shrink-0 text-[#17655E]"
                      />

                      <p className="text-[11px] leading-5 text-[#17655E]">
                        Current approved question inventory satisfies
                        the configured difficulty requirements.
                      </p>
                    </div>
                  </div>
                )}

              {assembledAssessment && (
                <div className="mt-6 rounded-xl border border-[#D8DBF7] bg-[#F7F7FF] p-4">
                  <div className="flex items-start gap-3">
                    <Rocket
                      size={17}
                      className="mt-0.5 shrink-0 text-[#5658E8]"
                    />

                    <div>
                      <p className="text-xs font-semibold text-[#4346C8]">
                        Final assessment assembled
                      </p>

                      <p className="mt-1 text-[11px] leading-5 text-[#667085]">
                        Assessment #{assembledAssessment.id} is ready
                        with the configured question set.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </section>

        {/* =====================================================
            WORKFLOW FOOTER
        ===================================================== */}
        <section className="mt-7 rounded-[20px] border border-[#DDE1E9] bg-[#F8F9FC] px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#EAE5F9] text-[#7862C8]">
                <Rocket size={15} />
              </div>

              <div>
                <p className="text-xs font-semibold text-[#344054]">
                  Automated assessment workflow
                </p>

                <p className="mt-1 text-[11px] leading-5 text-[#667085]">
                  Configure → validate inventory → automatically
                  assemble approved questions → ready for delivery.
                </p>
              </div>
            </div>

            <span
              className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${
                assembledAssessment
                  ? "text-[#17655E]"
                  : assemblyReady
                    ? "text-[#5658E8]"
                    : "text-[#98A2B3]"
              }`}
            >
              {assembledAssessment
                ? "Stage: Assessment Ready"
                : assemblyReady
                  ? "Stage: Ready for Assembly"
                  : "Stage: Configuration"}
            </span>
          </div>
        </section>
      </main>
    </RecruiterLayout>
  );
}


/* ============================================================
   SUMMARY CARD
============================================================ */

function SummaryCard({
  icon,
  label,
  value,
  description,
  background,
  color,
  valueSmall = false,
}) {
  return (
    <div className="group relative overflow-hidden rounded-[20px] border border-[#DDE1E9] bg-white p-5 shadow-[0_10px_28px_rgba(38,40,79,0.035)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(38,40,79,0.06)]">
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{ backgroundColor: color }}
      />

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#98A2B3]">
            {label}
          </p>

          <p
            className={`mt-3 font-semibold tracking-[-0.03em] text-[#1B2430] ${
              valueSmall ? "text-xl" : "text-[28px]"
            }`}
          >
            {value}
          </p>

          <p className="mt-2 text-[11px] leading-5 text-[#98A2B3]">
            {description}
          </p>
        </div>

        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{
            backgroundColor: background,
            color,
          }}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}


/* ============================================================
   DISTRIBUTION ROW
============================================================ */

function DistributionRow({
  label,
  count,
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-[#EEF0F3] bg-[#FAFBFC] px-4 py-3">
      <span className="text-xs font-semibold text-[#475467]">
        {label}
      </span>

      <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#5658E8] shadow-sm">
        {count}
      </span>
    </div>
  );
}


export default AssessmentConfig;