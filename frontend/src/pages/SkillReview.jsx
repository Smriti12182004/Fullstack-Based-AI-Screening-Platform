import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  Edit3,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import api from "../services/api";
import RecruiterLayout from "../layouts/RecruiterLayout";

const BRAND = "#004040";
const MAX_SKILL_NAME_LENGTH = 100;

function isAuthError(error) {
  const status = error?.response?.status;
  return status === 401 || status === 403;
}

function getErrorMessage(error, fallback) {
  const detail = error?.response?.data?.detail;

  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (item?.msg) {
          const location = Array.isArray(item.loc)
            ? item.loc.filter(Boolean).join(" → ")
            : "";

          return location
            ? `${location}: ${item.msg}`
            : item.msg;
        }

        return null;
      })
      .filter(Boolean);

    if (messages.length > 0) {
      return messages.join(". ");
    }
  }

  if (detail && typeof detail === "object" && detail.message) {
    return detail.message;
  }

  if (typeof error?.message === "string" && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

function SkillReview() {
  const { jobId } = useParams();
  const navigate = useNavigate();

  const [job, setJob] = useState(null);
  const [skills, setSkills] = useState([]);
  const [savedSkills, setSavedSkills] = useState([]);
  const [status, setStatus] = useState("pending");

  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [initialLoadFailed, setInitialLoadFailed] = useState(false);

  const [newSkill, setNewSkill] = useState("");
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingValue, setEditingValue] = useState("");

  const normalizedSavedSkills = savedSkills.map((skill) =>
    skill.trim().toLowerCase()
  );
  const normalizedCurrentSkills = skills.map((skill) =>
    skill.trim().toLowerCase()
  );
  const hasUnsavedChanges =
    normalizedSavedSkills.length !== normalizedCurrentSkills.length ||
    normalizedSavedSkills.some(
      (skill, index) => skill !== normalizedCurrentSkills[index]
    );

  useEffect(() => {
    loadSkillReview();
  }, [jobId]);

  /*
   * Load job + existing skill review.
   *
   * If no skills exist yet, automatically run extraction
   * and then reload the review.
   */
  const loadSkillReview = async () => {
    setLoading(true);
    setError("");
    setSuccess("");
    setInitialLoadFailed(false);
    setEditingIndex(null);
    setEditingValue("");

    try {
      const [jobResponse, reviewResponse] = await Promise.all([
        api.get(`/jobs/${jobId}`),
        api.get(`/jobs/${jobId}/skills/review`),
      ]);

      setJob(jobResponse.data);

      let reviewSkills = Array.isArray(reviewResponse.data?.skills)
        ? reviewResponse.data.skills
        : [];

      let reviewStatus =
        reviewResponse.data?.status || "pending";

      /*
       * If the job does not have skills yet,
       * run AI extraction automatically.
       */
      if (reviewSkills.length === 0) {
        setExtracting(true);

        try {
          const extractionResponse = await api.post(
            `/jobs/${jobId}/skills/extract`
          );

          const extractedSkills = Array.isArray(
            extractionResponse.data?.skills
          )
            ? extractionResponse.data.skills
            : [];

          reviewSkills = extractedSkills;
          reviewStatus = "pending";
        } catch (extractError) {
          console.error(extractError);

          throw extractError;
        } finally {
          setExtracting(false);
        }
      }

      const normalizedSkills = reviewSkills
        .map((skill) =>
          typeof skill === "string"
            ? skill
            : skill?.name
        )
        .filter(Boolean);

      setSkills(normalizedSkills);
      setSavedSkills(normalizedSkills);
      setEditingIndex(null);
      setEditingValue("");
      setNewSkill("");
      setStatus(reviewStatus);
    } catch (err) {
      console.error(err);

      if (isAuthError(err)) {
        navigate("/login", { replace: true });
        return;
      }

      setInitialLoadFailed(true);
      setError(
        getErrorMessage(
          err,
          "Unable to load or extract the job skills."
        )
      );
    } finally {
      setExtracting(false);
      setLoading(false);
    }
  };

  /*
   * Explicitly re-run AI skill extraction.
   *
   * Used by the Refresh button.
   */
  const handleRefreshExtraction = async () => {
    if (hasUnsavedChanges || editingIndex !== null || newSkill.trim()) {
      setError(
        "Save your current skill changes before refreshing extraction."
      );
      setSuccess("");
      return;
    }

    setExtracting(true);
    setError("");
    setSuccess("");

    try {
      const response = await api.post(
        `/jobs/${jobId}/skills/extract`
      );

      const extractedSkills = Array.isArray(
        response.data?.skills
      )
        ? response.data.skills
        : [];

      const normalizedSkills = extractedSkills
        .map((skill) =>
          typeof skill === "string"
            ? skill
            : skill?.name
        )
        .filter(Boolean);

      setSkills(normalizedSkills);
      setSavedSkills(normalizedSkills);
      setEditingIndex(null);
      setEditingValue("");
      setNewSkill("");
      setStatus("pending");

      setSuccess(
        extractedSkills.length > 0
          ? `${extractedSkills.length} skills extracted successfully. Please review and confirm them.`
          : "Skill extraction completed, but no skills were found."
      );
    } catch (err) {
      console.error(err);

      if (isAuthError(err)) {
        navigate("/login", { replace: true });
        return;
      }

      setError(
        getErrorMessage(err, "Unable to extract skills.")
      );
    } finally {
      setExtracting(false);
    }
  };

  const handleAddSkill = () => {
    if (isConfirmed || extracting || saving || confirming) {
      return;
    }

    const value = newSkill.trim();

    if (!value) {
      setError("Enter a skill name before adding it.");
      setSuccess("");
      return;
    }

    if (value.length > MAX_SKILL_NAME_LENGTH) {
      setError(`Skill name must be ${MAX_SKILL_NAME_LENGTH} characters or fewer.`);
      setSuccess("");
      return;
    }

    const exists = skills.some(
      (skill) =>
        skill.trim().toLowerCase() ===
        value.toLowerCase()
    );

    if (exists) {
      setError("This skill is already in the list.");
      return;
    }

    setSkills((current) => [...current, value]);
    setNewSkill("");
    setError("");
    setSuccess("");
  };

  const handleRemoveSkill = (index) => {
    if (isConfirmed || extracting || saving || confirming) {
      return;
    }

    setSkills((current) =>
      current.filter(
        (_, skillIndex) => skillIndex !== index
      )
    );

    if (editingIndex === index) {
      setEditingIndex(null);
      setEditingValue("");
    }

    setError("");
    setSuccess("");
  };

  const startEditing = (index) => {
    if (isConfirmed || extracting || saving || confirming) {
      return;
    }

    setEditingIndex(index);
    setEditingValue(skills[index]);
    setError("");
    setSuccess("");
  };

  const cancelEditing = () => {
    setEditingIndex(null);
    setEditingValue("");
  };

  const saveEditing = () => {
    if (isConfirmed || extracting || saving || confirming) {
      return;
    }

    const value = editingValue.trim();

    if (!value) {
      setError("Skill name cannot be empty.");
      return;
    }

    if (value.length > MAX_SKILL_NAME_LENGTH) {
      setError(`Skill name must be ${MAX_SKILL_NAME_LENGTH} characters or fewer.`);
      return;
    }

    const duplicate = skills.some(
      (skill, index) =>
        index !== editingIndex &&
        skill.trim().toLowerCase() ===
          value.toLowerCase()
    );

    if (duplicate) {
      setError("This skill already exists.");
      return;
    }

    setSkills((current) =>
      current.map((skill, index) =>
        index === editingIndex ? value : skill
      )
    );

    cancelEditing();
    setError("");
  };

  const handleSave = async () => {
    if (editingIndex !== null) {
      setError("Finish or cancel the skill edit before saving.");
      setSuccess("");
      return;
    }

    if (skills.length === 0) {
      setError("At least one skill is required.");
      setSuccess("");
      return;
    }

    if (!hasUnsavedChanges) {
      setError("");
      setSuccess("There are no unsaved skill changes.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await api.put(
        `/jobs/${jobId}/skills/review`,
        {
          skills: skills.map((name) => ({
            name,
          })),
        }
      );

      const savedSkills = Array.isArray(
        response.data?.skills
      )
        ? response.data.skills
        : [];

      const normalizedSkills = savedSkills.length > 0
        ? savedSkills
            .map((skill) => skill.name)
            .filter(Boolean)
        : skills;

      setSkills(normalizedSkills);
      setSavedSkills(normalizedSkills);

      setStatus(
        response.data?.status || "pending"
      );

      setSuccess(
        "Skill changes saved successfully."
      );
    } catch (err) {
      console.error(err);

      if (isAuthError(err)) {
        navigate("/login", { replace: true });
        return;
      }

      setError(
        getErrorMessage(err, "Unable to save skill changes.")
      );
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    if (editingIndex !== null) {
      setError("Finish or cancel the skill edit before confirming.");
      setSuccess("");
      return;
    }

    if (hasUnsavedChanges) {
      setError("Save your skill changes before confirming them.");
      setSuccess("");
      return;
    }

    if (skills.length === 0) {
      setError(
        "Add at least one skill before confirming."
      );
      return;
    }

    setConfirming(true);
    setError("");
    setSuccess("");

    try {
      const response = await api.post(
        `/jobs/${jobId}/skills/review/confirm`
      );

      const confirmedSkills = Array.isArray(
        response.data?.skills
      )
        ? response.data.skills
        : [];

      const normalizedConfirmedSkills =
        confirmedSkills.length > 0
          ? confirmedSkills
              .map((skill) => skill.name)
              .filter(Boolean)
          : skills;

      setSkills(normalizedConfirmedSkills);
      setSavedSkills(normalizedConfirmedSkills);

      setStatus(
        response.data?.status || "confirmed"
      );

      setSuccess(
        "Skills confirmed successfully. This role is ready for the next stage."
      );
    } catch (err) {
      console.error(err);

      if (isAuthError(err)) {
        navigate("/login", { replace: true });
        return;
      }

      setError(
        getErrorMessage(
          err,
          "Unable to confirm the skill review."
        )
      );
    } finally {
      setConfirming(false);
    }
  };

  const handleBackToDashboard = () => {
    if (hasUnsavedChanges) {
      setError("Save your current skill changes before leaving this page.");
      setSuccess("");
      return;
    }

    navigate("/dashboard");
  };

  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (!hasUnsavedChanges) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  const isConfirmed = status === "confirmed";

  return (
    <RecruiterLayout
      title="Skill Review"
      breadcrumb="Jobs / Skill Review"
    >
      <div className="mx-auto w-full max-w-[1280px] space-y-6 pb-10 sm:space-y-7 sm:pb-14">

        {/* =====================================================
            PAGE HEADER
        ===================================================== */}
        <section className="relative overflow-hidden rounded-2xl border border-[#DCE5E2] bg-white px-4 py-6 shadow-[0_12px_34px_rgba(15,23,42,0.04)] sm:rounded-[22px] sm:px-6 sm:py-7 lg:px-8 lg:py-8">
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 max-w-3xl">
              <button
                type="button"
                onClick={handleBackToDashboard}
                className="mb-4 inline-flex min-h-9 items-center gap-2 rounded-lg border border-transparent px-2.5 py-1.5 text-xs font-medium text-[#6D7D79] transition hover:border-[#DDE7E3] hover:bg-[#F7FAF9] hover:text-[#004040] focus:outline-none focus:ring-4 focus:ring-[#004040]/10"
              >
                <ArrowLeft size={15} />
                Back to dashboard
              </button>

              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#66807B]">
                AI-assisted workflow
              </p>

              <h1 className="mt-2 text-[34px] font-semibold leading-[1.08] tracking-[-0.03em] text-[#132322] sm:text-[40px]">
                Review extracted skills.
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#687875]">
                Review the skills identified from the job description, make corrections where needed, and confirm the final skill set.
              </p>
            </div>

            <div className="shrink-0 lg:pb-1">
              <StatusBadge
                confirmed={isConfirmed}
                status={status}
              />
            </div>
          </div>
        </section>

        {/* =====================================================
            PAGE MESSAGES
        ===================================================== */}
        {(error || success) && (
          <div className="space-y-3" aria-live="polite">
            {error && (
              <div role="alert" className="flex items-start gap-3 rounded-xl border border-[#E9C8C8] bg-[#FFF6F6] px-3.5 py-3 text-sm text-[#A83E3E] sm:px-4">
                <X
                  size={17}
                  className="mt-0.5 shrink-0"
                />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div role="status" className="flex items-start gap-3 rounded-xl border border-[#BFDDD6] bg-[#F0F8F5] px-3.5 py-3 text-sm text-[#17655E] sm:px-4">
                <CheckCircle2
                  size={17}
                  className="mt-0.5 shrink-0"
                />
                <span>{success}</span>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <LoadingState extracting={extracting} />
        ) : initialLoadFailed ? (
          <section className="rounded-2xl border border-[#DCE5E2] bg-white px-5 py-12 text-center shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:rounded-[22px] sm:px-6">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-[#F4F7F5] text-[#607570]">
              <RefreshCw size={18} />
            </div>

            <h2 className="mt-4 text-sm font-semibold text-[#273633]">
              We couldn&apos;t load this skill review.
            </h2>

            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-[#7C8985]">
              Check your connection or try loading the job again.
            </p>

            <button
              type="button"
              onClick={loadSkillReview}
              className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-xs font-semibold text-white shadow-[0_7px_18px_rgba(0,64,64,0.14)] transition hover:-translate-y-0.5 hover:opacity-95 focus:outline-none focus:ring-4 focus:ring-[#004040]/15"
              style={{ backgroundColor: BRAND }}
            >
              <RefreshCw size={14} />
              Retry
            </button>
          </section>
        ) : (
          <div className="space-y-7">

            {/* =================================================
                JOB CONTEXT
            ================================================= */}
            <section className="rounded-2xl border border-[#DCE5E2] bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:rounded-[22px]">
              <div className="flex flex-col gap-5 px-4 py-5 sm:gap-6 sm:px-6 sm:py-6 lg:px-7">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F0F4F2] text-[#607570]">
                      <BriefcaseBusiness size={15} />
                    </div>

                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#72817E]">
                      Job description
                    </span>
                  </div>

                  <div className="mt-4 grid gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_210px]">
                    <div className="min-w-0">
                      <h2 className="text-xl font-semibold tracking-[-0.015em] text-[#162522]">
                        {job?.title || `Job #${jobId}`}
                      </h2>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded-full border border-[#DCE5E2] bg-[#F8FAF9] px-2.5 py-1 text-[11px] font-semibold text-[#586965]">
                          Experience: {job?.experience_required || "Not specified"}
                        </span>

                        {hasUnsavedChanges && (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E7D7B4] bg-[#FFF9EC] px-2.5 py-1 text-[11px] font-semibold text-[#946718]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#D79A26]" />
                            Unsaved changes
                          </span>
                        )}
                      </div>

                      <div className="mt-4 max-h-[260px] overflow-y-auto pr-1">
                        <p className="text-sm leading-6 text-[#6F7E7A]">
                          {job?.description ||
                            "No job description is available."}
                        </p>
                      </div>
                    </div>

                    <div className="flex w-full flex-col gap-3 rounded-xl border border-[#DCE5E2] bg-[#F8FAF9] px-4 py-3 xl:w-auto xl:self-start">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.14em] text-[#82908C]">
                          Job ID
                        </p>

                        <p className="mt-1 text-sm font-semibold text-[#273633]">
                          #{jobId}
                        </p>
                      </div>

                      <div className="border-t border-[#E3EBE8] pt-3">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-[#82908C]">
                          Review status
                        </p>

                        <p className="mt-1 text-sm font-semibold capitalize text-[#273633]">
                          {isConfirmed ? "Confirmed" : status === "in_review" ? "In review" : "Pending review"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* =================================================
                SKILL REVIEW
            ================================================= */}
            <section className="overflow-hidden rounded-2xl border border-[#DCE5E2] bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:rounded-[22px]">

              {/* Skills Header */}
              <div className="flex flex-col gap-4 border-b border-[#E8EFEC] px-4 py-5 sm:px-6 sm:py-5 lg:flex-row lg:items-center lg:justify-between lg:px-7">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E8F2EF] text-[#17655E]">
                    <Sparkles size={18} />
                  </div>

                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-[#172623]">
                      Extracted skills
                    </h2>

                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <p className="text-xs text-[#788682]">
                        {skills.length} {skills.length === 1 ? "skill" : "skills"} in the current review.
                      </p>

                      {hasUnsavedChanges && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E7D7B4] bg-[#FFF9EC] px-2 py-0.5 text-[10px] font-semibold text-[#946718]">
                          Unsaved
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRefreshExtraction}
                  disabled={
                    loading ||
                    extracting ||
                    saving ||
                    confirming ||
                    hasUnsavedChanges ||
                    editingIndex !== null ||
                    Boolean(newSkill.trim())
                  }
                  title={
                    hasUnsavedChanges ||
                    editingIndex !== null ||
                    Boolean(newSkill.trim())
                      ? "Save or finish your current changes before refreshing"
                      : "Re-run AI skill extraction"
                  }
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#D5E0DC] bg-white px-3 text-xs font-semibold text-[#51615D] transition hover:border-[#A7C5BE] hover:bg-[#F5F9F7] hover:text-[#004040] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw
                    size={14}
                    className={
                      extracting ? "animate-spin" : ""
                    }
                  />

                  {extracting ? "Extracting..." : "Refresh"}
                </button>
              </div>

              <div className="p-4 sm:p-6 lg:p-7">

                {/* Empty state */}
                {skills.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#C9D8D4] bg-[#FAFCFB] px-4 py-10 text-center sm:px-6 sm:py-12">
                    <Sparkles
                      size={26}
                      className="mx-auto text-[#8DA39E]"
                    />

                    <p className="mt-3 text-sm font-semibold text-[#344440]">
                      No skills available
                    </p>

                    <p className="mt-1 text-xs text-[#84918E]">
                      Click Refresh to run skill extraction from the job description.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {skills.map((skill, index) => {
                      const editing =
                        editingIndex === index;

                      return (
                        <div
                          key={`${skill}-${index}`}
                          className="group flex min-h-[58px] items-center gap-3 rounded-xl border border-[#E1E9E6] bg-[#FAFCFB] px-3.5 py-2.5 transition hover:border-[#B9D1CB] hover:bg-white sm:px-4"
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#E8F2EF] text-[#17655E]">
                            <Check size={15} />
                          </div>

                          {editing ? (
                            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                              <input
                                value={editingValue}
                                aria-label="Edit skill name"
                                maxLength={MAX_SKILL_NAME_LENGTH}
                                onChange={(e) =>
                                  setEditingValue(e.target.value)
                                }
                                autoFocus
                                className="h-9 min-w-[180px] flex-1 rounded-lg border border-[#B8CEC8] bg-white px-3 text-sm text-[#1B2927] outline-none focus:border-[#004040] focus:ring-4 focus:ring-[#004040]/10 sm:min-w-0"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    saveEditing();
                                  }

                                  if (e.key === "Escape") {
                                    cancelEditing();
                                  }
                                }}
                              />

                              <button
                                type="button"
                                onClick={saveEditing}
                                aria-label="Save skill edit"
                                title="Save skill edit"
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#E8F2EF] text-[#17655E] transition hover:bg-[#DDEDE9] focus:outline-none focus:ring-4 focus:ring-[#004040]/10"
                              >
                                <Check size={15} />
                              </button>

                              <button
                                type="button"
                                onClick={cancelEditing}
                                aria-label="Cancel skill edit"
                                title="Cancel skill edit"
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F2F5F3] text-[#71807E] transition hover:bg-[#E8EDEB] focus:outline-none focus:ring-4 focus:ring-[#004040]/10"
                              >
                                <X size={15} />
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-[#253431]">
                                  {skill}
                                </p>

                                <p className="mt-0.5 text-[11px] text-[#899591]">
                                  Included in the reviewed skill set
                                </p>
                              </div>

                              {!isConfirmed && (
                                <div className="flex shrink-0 items-center gap-1 opacity-100 transition md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      startEditing(index)
                                    }
                                    disabled={
                                      extracting ||
                                      saving ||
                                      confirming
                                    }
                                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[#74827F] transition hover:bg-[#EAF2EF] hover:text-[#004040] focus:outline-none focus:ring-4 focus:ring-[#004040]/10"
                                    aria-label={`Edit ${skill}`}
                                  >
                                    <Edit3 size={15} />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleRemoveSkill(index)
                                    }
                                    disabled={
                                      extracting ||
                                      saving ||
                                      confirming
                                    }
                                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8C9693] transition hover:bg-[#FFF1F1] hover:text-[#C84C4C] focus:outline-none focus:ring-4 focus:ring-[#004040]/10"
                                    aria-label={`Remove ${skill}`}
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Add Skill */}
                {!isConfirmed && (
                  <div className="mt-5 rounded-xl border border-dashed border-[#C7D7D2] bg-[#FAFCFB] p-3.5 sm:p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs font-semibold text-[#3C4D49]">
                        Add another skill
                      </p>

                      <span className="text-[11px] text-[#8A9693]">
                        Press Enter to add
                      </span>
                    </div>

                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <input
                        value={newSkill}
                        onChange={(e) =>
                          setNewSkill(e.target.value)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleAddSkill();
                          }
                        }}
                        disabled={
                          extracting ||
                          saving ||
                          confirming
                        }
                        aria-label="Skill name"
                        maxLength={MAX_SKILL_NAME_LENGTH}
                        placeholder="e.g. Docker, PostgreSQL, FastAPI"
                        className="h-10 flex-1 rounded-lg border border-[#D5E0DC] bg-white px-3 text-sm text-[#20302D] outline-none placeholder:text-[#A0ABA8] focus:border-[#004040] focus:ring-4 focus:ring-[#004040]/10"
                      />

                      <button
                        type="button"
                        onClick={handleAddSkill}
                        disabled={
                          extracting ||
                          saving ||
                          confirming ||
                          !newSkill.trim()
                        }
                        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg px-4 text-xs font-semibold text-white transition hover:opacity-90 focus:outline-none focus:ring-4 focus:ring-[#004040]/15 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                        style={{
                          backgroundColor: BRAND,
                        }}
                      >
                        <Plus size={15} />
                        Add Skill
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-4 border-t border-[#E8EFEC] bg-[#FCFDFC] px-4 py-5 sm:px-6 sm:py-6 lg:flex-row lg:items-center lg:justify-between lg:px-7">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[#53635F]">
                    {isConfirmed
                      ? "Skill set confirmed."
                      : "Review the AI suggestions before continuing."}
                  </p>

                  <p className="mt-1 max-w-xl text-[11px] leading-5 text-[#8A9693]">
                    {isConfirmed
                      ? "The confirmed skill set is saved to this job."
                      : hasUnsavedChanges
                        ? "You have unsaved changes. Save them before confirming."
                        : "Review the extracted skills, make corrections where needed, then confirm the final skill set."}
                  </p>
                </div>

                <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end lg:w-auto">
                  {!isConfirmed && (
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={
                        saving ||
                        confirming ||
                        extracting ||
                        editingIndex !== null ||
                        !hasUnsavedChanges
                      }
                      title={
                        editingIndex !== null
                          ? "Finish or cancel the active skill edit first"
                          : hasUnsavedChanges
                            ? "Save skill changes"
                            : "There are no unsaved skill changes"
                      }
                      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#C9D8D4] bg-white px-4 text-xs font-semibold text-[#33423F] transition hover:border-[#9DBCB5] hover:bg-[#F5F9F7] hover:text-[#004040] focus:outline-none focus:ring-4 focus:ring-[#004040]/10 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                    >
                      {saving ? (
                        <>
                          <RefreshCw
                            size={14}
                            className="animate-spin"
                          />
                          Saving...
                        </>
                      ) : (
                        "Save Changes"
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={
                      isConfirmed
                        ? () => navigate(`/jobs/${jobId}`)
                        : handleConfirm
                    }
                    disabled={
                      saving ||
                      confirming ||
                      extracting ||
                      editingIndex !== null ||
                      (!isConfirmed && hasUnsavedChanges)
                    }
                    title={
                      isConfirmed
                        ? "Continue to the job"
                        : editingIndex !== null
                          ? "Finish or cancel the active skill edit first"
                          : hasUnsavedChanges
                            ? "Save changes before confirming"
                            : "Confirm the reviewed skill set"
                    }
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg px-5 text-xs font-semibold text-white shadow-[0_7px_18px_rgba(0,64,64,0.16)] transition hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-[#004040]/15 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                    style={{
                      backgroundColor: BRAND,
                    }}
                  >
                    {confirming ? (
                      <>
                        <RefreshCw
                          size={14}
                          className="animate-spin"
                        />
                        Confirming...
                      </>
                    ) : isConfirmed ? (
                      <>
                        Continue
                        <ArrowRight size={14} />
                      </>
                    ) : (
                      <>
                        <Check size={14} />
                        Confirm Skills
                      </>
                    )}
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </RecruiterLayout>
  );
}

function StatusBadge({ confirmed, status }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
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
        ? "Confirmed"
        : status === "pending"
          ? "Pending review"
          : status === "in_review"
            ? "In review"
            : status || "Pending review"}
    </span>
  );
}

function LoadingState({ extracting }) {
  return (
    <section className="space-y-4" aria-busy={extracting}>
      {extracting && (
        <div className="flex items-center gap-2 rounded-xl border border-[#DCE5E2] bg-white px-3.5 py-3 text-sm text-[#51615D] sm:px-4">
          <RefreshCw
            size={15}
            className="animate-spin text-[#004040]"
          />
          Extracting skills from the job description...
        </div>
      )}

      <div className="rounded-[22px] border border-[#DCE5E2] bg-white p-6">
        <div className="h-4 w-32 animate-pulse rounded bg-[#EEF2F0]" />
        <div className="mt-4 h-7 w-2/5 animate-pulse rounded bg-[#EEF2F0]" />
        <div className="mt-3 h-4 w-4/5 animate-pulse rounded bg-[#F3F6F4]" />
      </div>

      <div className="rounded-[22px] border border-[#DCE5E2] bg-white p-6">
        <div className="h-5 w-40 animate-pulse rounded bg-[#EEF2F0]" />
        <div className="mt-5 space-y-3">
          <div className="h-14 animate-pulse rounded-xl bg-[#F3F6F4]" />
          <div className="h-14 animate-pulse rounded-xl bg-[#F3F6F4]" />
          <div className="h-14 animate-pulse rounded-xl bg-[#F3F6F4]" />
        </div>
      </div>
    </section>
  );
}

export default SkillReview;
