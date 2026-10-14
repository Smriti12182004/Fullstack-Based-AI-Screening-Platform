import { createPortal } from "react-dom";
import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Bell,
  CheckCheck,
  ChevronDown,
  Mail,
  Search,
  UserCheck,
  BriefcaseBusiness,
  Archive,
  FileQuestion,
  ArrowRight,
  X,
} from "lucide-react";

import { useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";

import api from "../services/api";
import { useTheme } from "../context/ThemeContext";

const NOTIFICATION_REFRESH_MS = 30000;

/* ============================================================
   NOTIFICATION HELPERS
============================================================ */

function formatNotificationTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const diffMs =
    Date.now() - date.getTime();

  const diffMinutes = Math.floor(
    diffMs / 60000
  );

  if (diffMinutes < 1) {
    return "Just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(
    diffMinutes / 60
  );

  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(
    diffHours / 24
  );

  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return date.toLocaleDateString(
    undefined,
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  );
}

function getNotificationIcon(
  notificationType
) {
  switch (notificationType) {
    case "JOB_COLLABORATION_ASSIGNED":
      return UserCheck;

    default:
      return Mail;
  }
}

function getNotificationIconStyles(
  notificationType
) {
  switch (notificationType) {
    case "JOB_COLLABORATION_ASSIGNED":
      return {
        background: "#EAE5F9",
        color: "#7862C8",
      };

    default:
      return {
        background: "#CFDEFC",
        color: "#4A61C8",
      };
  }
}

function getRoleLabel(role) {
  const labels = {
    recruiter: "HR",

    organization_admin:
      "Organization Administrator",

    assessment_manager:
      "Assessment Manager",

    assessment_reviewer:
      "Assessment Reviewer",

    candidate: "Candidate",
  };

  return (
    labels[role] ||
    role
      ?.replace(/_/g, " ")
      ?.replace(
        /\b\w/g,
        (character) =>
          character.toUpperCase()
      ) ||
    "User"
  );
}

/* ============================================================
   SEARCH HELPERS
============================================================ */

function getSearchSources(role) {
  if (role === "recruiter") {
    return [
      "jobs",
      "question_banks",
    ];
  }

  if (
    role === "assessment_manager"
  ) {
    return [
      "assigned_jobs",
      "question_banks",
    ];
  }

  if (
    role === "assessment_reviewer"
  ) {
    return [
      "question_banks",
    ];
  }

  return [];
}

function normalizeSearchResponse(
  data
) {
  return Array.isArray(data)
    ? data
    : [];
}

function buildSearchResults(
  source,
  records,
  role
) {
  if (!Array.isArray(records)) {
    return [];
  }

  if (source === "jobs") {
    return records.map((job) => ({
      type: "job",
      id: job.id,
      title:
        job.title ||
        "Untitled Job",
      meta:
        job.description
          ?.replace(/\s+/g, " ")
          ?.slice(0, 70) ||
        `Job #${job.id}`,
      icon: BriefcaseBusiness,
      iconBackground: "#EAF2FF",
      iconColor: "#4A61C8",
      path:
        `/jobs/${job.id}`,
    }));
  }

  if (
    source === "assigned_jobs"
  ) {
    return records.map((job) => ({
      type: "assigned_job",
      id: job.id,
      title:
        job.title ||
        "Untitled Job",
      meta:
        `Job #${job.id} • Assigned by HR`,
      icon: BriefcaseBusiness,
      iconBackground: "#F0EBFB",
      iconColor: "#7862C8",
      path:
        `/manager/jobs/${job.id}/review`,
    }));
  }

  if (
    source === "question_banks"
  ) {
    return records.map((bank) => ({
      type: "question_bank",
      id: bank.id,
      title:
        bank.name ||
        `Question Bank ${bank.hiring_year || ""}`.trim(),
      meta:
        bank.hiring_year
          ? `Hiring year ${bank.hiring_year}`
          : `Question Bank #${bank.id}`,
      icon: Archive,
      iconBackground: "#F3E3F2",
      iconColor: "#AA5E9C",
      path:
        `/question-banks`,
    }));
  }

  if (
    source === "questions"
  ) {
    return records.map(
      (question) => ({
        type: "question",
        id: question.id,
        title:
          question.question_text ||
          question.text ||
          `Question #${question.id}`,
        meta:
          question.skill_name ||
          question.skill?.name ||
          question.difficulty ||
          "Question Library",
        icon: FileQuestion,
        iconBackground: "#EAE5F9",
        iconColor: "#7862C8",
        path: "/questions",
      })
    );
  }

  return [];
}

function matchesSearch(
  item,
  query
) {
  const normalizedQuery =
    query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  const haystack = [
    item.title,
    item.meta,
    item.id,
  ]
    .filter(
      (value) =>
        value !== undefined &&
        value !== null
    )
    .join(" ")
    .toLowerCase();

  return haystack.includes(
    normalizedQuery
  );
}

/* ============================================================
   TOPBAR
============================================================ */

function Topbar({
  title = "Dashboard",
  breadcrumb = "Workspace",
}) {
  const {
    auth,
    logout,
    updateProfile,
  } = useAuth();

  const { theme, setTheme } = useTheme();

  const navigate =
    useNavigate();

  const role =
    auth?.role || "user";

  const displayRole =
    getRoleLabel(role);

  const [profileOpen, setProfileOpen] = useState(false);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [profile, setProfile] = useState({
    full_name: auth?.full_name || "",
    username: auth?.username || "",
    email: auth?.email || "",
  });
  const [profileForm, setProfileForm] = useState({
    full_name: "",
    username: "",
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState("");
  const [profilePhotoVersion, setProfilePhotoVersion] = useState(0);
  const [profilePhotoBusy, setProfilePhotoBusy] = useState(false);
  const profilePhotoInputRef = useRef(null);


  const displayName =
    profile.full_name?.trim() ||
    auth?.full_name?.trim() ||
    profile.username ||
    auth?.username ||
    "User";

  useEffect(() => {
    let active = true;
    const fallback = {
      full_name: auth?.full_name || "",
      username: auth?.username || "",
      email: auth?.email || "",
    };

    if (!auth?.access_token) {
      setProfile(fallback);
      return () => { active = false; };
    }

    api.get("/auth/me")
      .then((response) => {
        if (active) {
          setProfile(response.data);
          updateProfile(response.data);
        }
      })
      .catch(() => {
        if (active) setProfile(fallback);
      });

    return () => { active = false; };
  }, [
    auth?.access_token,
    auth?.user_id,
    auth?.username,
    auth?.full_name,
    auth?.email,
  ]);


  useEffect(() => {
    if (!auth?.access_token || !profile?.has_profile_photo) {
      setProfilePhotoUrl("");
      return undefined;
    }

    let active = true;
    let createdObjectUrl = "";

    api.get("/auth/me/avatar", { responseType: "blob" })
      .then(({ data }) => {
        if (!active || !data || data.size === 0) return;

        createdObjectUrl = URL.createObjectURL(data);
        if (active) {
          setProfilePhotoUrl(createdObjectUrl);
        }
      })
      .catch(() => {
        if (active) setProfilePhotoUrl("");
      });

    return () => {
      active = false;
      if (createdObjectUrl) URL.revokeObjectURL(createdObjectUrl);
    };
  }, [auth?.access_token, auth?.user_id, profile?.has_profile_photo, profilePhotoVersion]);

  const openProfileEditor = () => {
    setProfileForm({
      full_name: profile.full_name || auth?.full_name || "",
      username: profile.username || auth?.username || "",
    });
    setProfileError("");
    setProfileSaved(false);
    setProfileEditorOpen(true);
    setProfileOpen(false);
  };

  const handleProfileSave = async (event) => {
    event.preventDefault();
    setProfileSaving(true);
    setProfileError("");
    setProfileSaved(false);

    try {
      const response = await api.patch("/auth/me", {
        full_name: profileForm.full_name.trim(),
        username: profileForm.username.trim(),
      });
      setProfile(response.data);
      updateProfile(response.data);
      setProfileSaved(true);
    } catch (error) {
      const detail = error?.response?.data?.detail;
      setProfileError(
        typeof detail === "string"
          ? detail
          : "Unable to save your profile. Please try again."
      );
    } finally {
      setProfileSaving(false);
    }
  };



  const handleProfilePhotoChange = async (event) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";

    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setProfileError("Choose an image that is 5 MB or smaller.");
      return;
    }

    setProfilePhotoBusy(true);
    setProfileError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      await api.post("/auth/me/avatar", formData);
      setProfile((current) => ({
        ...current,
        has_profile_photo: true,
      }));
      setProfilePhotoVersion((version) => version + 1);
    } catch (error) {
      const detail = error?.response?.data?.detail;
      setProfileError(
        typeof detail === "string"
          ? detail
          : "Unable to upload the profile photo. Please try again."
      );
    } finally {
      setProfilePhotoBusy(false);
    }
  };

  const handleProfilePhotoRemove = async () => {
    setProfilePhotoBusy(true);
    setProfileError("");

    try {
      await api.delete("/auth/me/avatar");
      setProfile((current) => ({
        ...current,
        has_profile_photo: false,
      }));
      setProfilePhotoVersion((version) => version + 1);
    } catch (error) {
      const detail = error?.response?.data?.detail;
      setProfileError(
        typeof detail === "string"
          ? detail
          : "Unable to remove the profile photo. Please try again."
      );
    } finally {
      setProfilePhotoBusy(false);
    }
  };

  /* ==========================================================
     NOTIFICATIONS
  ========================================================== */

  const [
    notifications,
    setNotifications,
  ] = useState([]);

  const [
    unreadCount,
    setUnreadCount,
  ] = useState(0);

  const [
    notificationOpen,
    setNotificationOpen,
  ] = useState(false);

  const [
    notificationsLoading,
    setNotificationsLoading,
  ] = useState(false);

  const [
    notificationActionLoading,
    setNotificationActionLoading,
  ] = useState(false);

  const [
    notificationError,
    setNotificationError,
  ] = useState("");

  /* ==========================================================
     SEARCH
  ========================================================== */

  const [
    searchQuery,
    setSearchQuery,
  ] = useState("");

  const [
    searchResults,
    setSearchResults,
  ] = useState([]);

  const [
    searchOpen,
    setSearchOpen,
  ] = useState(false);

  const [
    searchLoading,
    setSearchLoading,
  ] = useState(false);

  const [
    searchError,
    setSearchError,
  ] = useState("");

  const [
    searchFocused,
    setSearchFocused,
  ] = useState(false);

  const notificationRef =
    useRef(null);

  const searchRef =
    useRef(null);

  /* ==========================================================
     AUTH ERROR HANDLER
  ========================================================== */

  const handleAuthError = (
    error
  ) => {
    if (
      error?.response?.status ===
      401
    ) {
      logout();

      return true;
    }

    return false;
  };

  /* ==========================================================
     LOAD UNREAD COUNT
  ========================================================== */

  const loadUnreadCount =
    async () => {
      if (
        !auth?.access_token
      ) {
        setUnreadCount(0);
        return;
      }

      try {
        const response =
          await api.get(
            "/notifications/unread-count"
          );

        setUnreadCount(
          Number(
            response.data
              ?.unread_count || 0
          )
        );
      } catch (error) {
        console.error(
          "Failed to load notification count:",
          error
        );

        handleAuthError(
          error
        );
      }
    };

  /* ==========================================================
     LOAD NOTIFICATIONS
  ========================================================== */

  const loadNotifications =
    async (
      showLoading = true
    ) => {
      if (
        !auth?.access_token
      ) {
        setNotifications([]);
        setUnreadCount(0);
        return;
      }

      try {
        if (showLoading) {
          setNotificationsLoading(
            true
          );
        }

        setNotificationError("");

        const response =
          await api.get(
            "/notifications?limit=20"
          );

        const data =
          Array.isArray(
            response.data
          )
            ? response.data
            : [];

        setNotifications(data);

        const unread =
          data.filter(
            (item) =>
              item?.is_read ===
              false
          ).length;

        setUnreadCount(
          unread
        );
      } catch (error) {
        console.error(
          "Failed to load notifications:",
          error
        );

        if (
          handleAuthError(
            error
          )
        ) {
          return;
        }

        setNotificationError(
          error?.response?.data
            ?.detail ||
            "Unable to load notifications."
        );
      } finally {
        if (showLoading) {
          setNotificationsLoading(
            false
          );
        }
      }
    };

  /* ==========================================================
     NOTIFICATION REFRESH
  ========================================================== */

  useEffect(() => {
    if (
      !auth?.access_token
    ) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    loadUnreadCount();

    const intervalId =
      window.setInterval(
        () => {
          loadUnreadCount();
        },
        NOTIFICATION_REFRESH_MS
      );

    return () => {
      window.clearInterval(
        intervalId
      );
    };
  }, [
    auth?.access_token,
  ]);

  /* ==========================================================
     CLOSE NOTIFICATION ON OUTSIDE CLICK
  ========================================================== */

  useEffect(() => {
    const handleOutsideClick =
      (event) => {
        if (
          notificationRef.current &&
          !notificationRef.current.contains(
            event.target
          )
        ) {
          setNotificationOpen(
            false
          );
        }
      };

    document.addEventListener(
      "mousedown",
      handleOutsideClick
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutsideClick
      );
    };
  }, []);

  /* ==========================================================
     CLOSE SEARCH ON OUTSIDE CLICK
  ========================================================== */

  useEffect(() => {
    const handleOutsideClick =
      (event) => {
        if (
          searchRef.current &&
          !searchRef.current.contains(
            event.target
          )
        ) {
          setSearchOpen(false);
          setSearchFocused(false);
        }
      };

    document.addEventListener(
      "mousedown",
      handleOutsideClick
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutsideClick
      );
    };
  }, []);

  /* ==========================================================
     SEARCH
  ========================================================== */

  useEffect(() => {
    const query =
      searchQuery.trim();

    if (query.length < 2) {
      setSearchResults([]);
      setSearchError("");
      setSearchLoading(false);
      return undefined;
    }

    const timerId =
      window.setTimeout(
        async () => {
          const sources =
            getSearchSources(
              role
            );

          if (
            sources.length === 0
          ) {
            setSearchResults([]);
            return;
          }

          setSearchLoading(true);
          setSearchError("");

          try {
            const requests =
              sources.map(
                async (source) => {
                  try {
                    let endpoint =
                      "";

                    if (
                      source === "jobs"
                    ) {
                      endpoint =
                        "/jobs";
                    }

                    if (
                      source ===
                      "assigned_jobs"
                    ) {
                      endpoint =
                        "/question-sets/assigned-jobs";
                    }

                    if (
                      source ===
                      "question_banks"
                    ) {
                      endpoint =
                        "/question-banks";
                    }

                    if (
                      !endpoint
                    ) {
                      return [];
                    }

                    const response =
                      await api.get(
                        endpoint,
                        {
                          timeout: 8000,
                        }
                      );

                    const records =
                      normalizeSearchResponse(
                        response.data
                      );

                    return buildSearchResults(
                      source,
                      records,
                      role
                    );
                  } catch (error) {
                    if (
                      error?.response
                        ?.status === 401
                    ) {
                      throw error;
                    }

                    return [];
                  }
                }
              );

            const settled =
              await Promise.allSettled(
                requests
              );

            const combined =
              settled.flatMap(
                (result) =>
                  result.status ===
                  "fulfilled"
                    ? result.value
                    : []
              );

            const filtered =
              combined
                .filter(
                  (item) =>
                    matchesSearch(
                      item,
                      query
                    )
                )
                .slice(0, 8);

            setSearchResults(
              filtered
            );
          } catch (error) {
            console.error(
              "Global search failed:",
              error
            );

            if (
              handleAuthError(
                error
              )
            ) {
              return;
            }

            setSearchError(
              "Search is temporarily unavailable."
            );
          } finally {
            setSearchLoading(
              false
            );
          }
        },
        300
      );

    return () => {
      window.clearTimeout(
        timerId
      );
    };
  }, [
    searchQuery,
    role,
  ]);

  const handleSearchFocus =
    () => {
      setSearchFocused(true);

      if (
        searchQuery.trim()
          .length >= 2
      ) {
        setSearchOpen(true);
      }
    };

  const handleSearchChange =
    (event) => {
      const value =
        event.target.value;

      setSearchQuery(value);
      setSearchOpen(
        value.trim().length >=
          2
      );
      setSearchError("");
    };

  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
    setSearchError("");
    setSearchOpen(false);
  };

  const openSearchResult =
    (result) => {
      setSearchOpen(false);
      setSearchFocused(false);
      setSearchQuery("");

      navigate(
        result.path
      );
    };

  const handleSearchKeyDown =
    (event) => {
      if (
        event.key === "Escape"
      ) {
        clearSearch();
        return;
      }

      if (
        event.key === "Enter"
      ) {
        event.preventDefault();

        if (
          searchResults.length >
          0
        ) {
          openSearchResult(
            searchResults[0]
          );
        }
      }
    };

  /* ==========================================================
     NOTIFICATION ACTIONS
  ========================================================== */

  const toggleNotifications =
    async () => {
      const nextState =
        !notificationOpen;

      setNotificationOpen(
        nextState
      );

      if (nextState) {
        await loadNotifications();
      }
    };

  const markNotificationRead =
    async (
      notificationId
    ) => {
      try {
        setNotificationActionLoading(
          true
        );

        await api.post(
          `/notifications/${notificationId}/read`
        );

        setNotifications(
          (current) =>
            current.map(
              (notification) => {
                if (
                  notification.id !==
                  notificationId
                ) {
                  return notification;
                }

                return {
                  ...notification,
                  is_read: true,
                  read_at:
                    new Date().toISOString(),
                };
              }
            )
        );

        setUnreadCount(
          (current) =>
            Math.max(
              0,
              current - 1
            )
        );
      } catch (error) {
        console.error(
          "Failed to mark notification as read:",
          error
        );

        if (
          handleAuthError(
            error
          )
        ) {
          return;
        }

        setNotificationError(
          error?.response?.data
            ?.detail ||
            "Unable to update the notification."
        );
      } finally {
        setNotificationActionLoading(
          false
        );
      }
    };

  const markAllNotificationsRead =
    async () => {
      if (
        unreadCount === 0
      ) {
        return;
      }

      try {
        setNotificationActionLoading(
          true
        );

        await api.post(
          "/notifications/read-all"
        );

        setNotifications(
          (current) =>
            current.map(
              (notification) => ({
                ...notification,
                is_read: true,
                read_at:
                  notification.read_at ||
                  new Date().toISOString(),
              })
            )
        );

        setUnreadCount(0);
      } catch (error) {
        console.error(
          "Failed to mark all notifications as read:",
          error
        );

        if (
          handleAuthError(
            error
          )
        ) {
          return;
        }

        setNotificationError(
          error?.response?.data
            ?.detail ||
            "Unable to mark notifications as read."
        );
      } finally {
        setNotificationActionLoading(
          false
        );
      }
    };

  const handleNotificationClick =
    async (
      notification
    ) => {
      if (
        !notification?.is_read
      ) {
        await markNotificationRead(
          notification.id
        );
      }
    };

  const unreadNotifications =
    notifications.filter(
      (notification) =>
        notification?.is_read ===
        false
    );

  /* ==========================================================
     RENDER
  ========================================================== */

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-[#D7E5EC] bg-white/95 backdrop-blur">

      <div className="flex h-full items-center justify-between gap-5 px-5 lg:px-8">

        {/* ===================================================
            BREADCRUMB
        =================================================== */}

        <div className="min-w-0">

          <div className="hidden items-center gap-2 text-xs sm:flex">

            <span className="text-[#6F8794]">
              {breadcrumb}
            </span>

            <span className="text-[#A9BCC7]">
              /
            </span>

            <span className="font-medium text-[#294252]">
              {title}
            </span>

          </div>

          <h1 className="text-sm font-semibold text-[#142B3A] sm:hidden">
            {title}
          </h1>

        </div>

        {/* ===================================================
            GLOBAL SEARCH
        =================================================== */}

        <div
          ref={searchRef}
          className="relative hidden max-w-[440px] flex-1 md:block"
        >

          <div
            className={`flex h-10 items-center rounded-xl border bg-[#F8FBFD] px-3.5 transition duration-200 ${
              searchFocused ||
              searchOpen
                ? "border-[#5658E8] bg-white ring-4 ring-[#5658E8]/10"
                : "border-[#D7E5EC]"
            }`}
          >

            <Search
              size={17}
              className={`shrink-0 transition-colors duration-200 ${
                searchFocused
                  ? "text-[#5658E8]"
                  : "text-[#7F98A5]"
              }`}
            />

            <input
              type="search"
              value={searchQuery}
              onFocus={
                handleSearchFocus
              }
              onChange={
                handleSearchChange
              }
              onKeyDown={
                handleSearchKeyDown
              }
              placeholder="Search jobs, candidates, questions..."
              className="ml-3 min-w-0 flex-1 bg-transparent text-sm text-[#142B3A] outline-none placeholder:text-[#9AAAB3]"
              aria-label="Search jobs, candidates and questions"
              autoComplete="off"
            />

            {searchQuery && (
              <button
                type="button"
                onClick={
                  clearSearch
                }
                className="mr-1 flex h-6 w-6 items-center justify-center rounded-md text-[#98A2B3] transition hover:bg-[#EEF2F5] hover:text-[#475467]"
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            )}

          </div>

          {/* =================================================
              SEARCH RESULTS
          ================================================= */}

          {searchOpen && (
            <div className="absolute left-0 right-0 top-12 overflow-hidden rounded-[18px] border border-[#DDE1E9] bg-white shadow-[0_22px_55px_rgba(38,40,79,0.15)]">

              {/* SEARCH HEADER */}

              <div className="border-b border-[#EAECF0] px-4 py-3">

                <div className="flex items-center justify-between gap-3">

                  <div>

                    <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#7A61D8]">
                      Global search
                    </p>

                    <p className="mt-0.5 text-[10px] text-[#98A2B3]">
                      {searchQuery.trim().length < 2
                        ? "Type at least 2 characters."
                        : "Matching workspace content"}
                    </p>

                  </div>

                  {searchLoading && (

                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F0EBFB]">

                      <RefreshSmall />

                    </div>
                  )}

                </div>

              </div>

              {/* RESULTS */}

              <div className="max-h-[360px] overflow-y-auto">

                {searchLoading &&
                searchResults.length ===
                  0 ? (

                  <div className="px-5 py-10 text-center">

                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-[#F0EBFB] text-[#7A61D8]">

                      <Search size={17} />

                    </div>

                    <p className="mt-3 text-xs font-semibold text-[#344054]">
                      Searching...
                    </p>

                  </div>

                ) : searchError ? (

                  <div className="px-5 py-9 text-center">

                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF5F5] text-[#B42318]">

                      <X size={17} />

                    </div>

                    <p className="mt-3 text-xs font-semibold text-[#344054]">
                      Search unavailable
                    </p>

                    <p className="mt-1 text-[10px] leading-5 text-[#98A2B3]">
                      {searchError}
                    </p>

                  </div>

                ) : searchQuery.trim().length >=
                    2 &&
                  searchResults.length ===
                    0 ? (

                  <div className="px-5 py-10 text-center">

                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-[#F3F4F8] text-[#98A2B3]">

                      <Search size={17} />

                    </div>

                    <p className="mt-3 text-xs font-semibold text-[#344054]">
                      No results found
                    </p>

                    <p className="mt-1 text-[10px] leading-5 text-[#98A2B3]">
                      Try a different job title, question bank, or keyword.
                    </p>

                  </div>

                ) : (

                  <div className="py-1.5">

                    {searchResults.map(
                      (result) => {

                        const ResultIcon =
                          result.icon;

                        return (
                          <button
                            key={`${result.type}-${result.id}`}
                            type="button"
                            onClick={() =>
                              openSearchResult(
                                result
                              )
                            }
                            className="group/result flex w-full items-center gap-3 px-4 py-3 text-left transition duration-150 hover:bg-[#FAFBFD]"
                          >

                            <span
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover/result:scale-105 group-hover/result:-rotate-3"
                              style={{
                                backgroundColor:
                                  result.iconBackground,
                                color:
                                  result.iconColor,
                              }}
                            >
                              <ResultIcon size={15} />
                            </span>

                            <span className="min-w-0 flex-1">

                              <span className="block truncate text-[11px] font-semibold text-[#344054] group-hover/result:text-[#5658E8]">
                                {result.title}
                              </span>

                              <span className="mt-0.5 block truncate text-[9px] text-[#98A2B3]">
                                {result.meta}
                              </span>

                            </span>

                            <ArrowRight
                              size={13}
                              className="shrink-0 text-[#C0C7D2] transition duration-150 group-hover/result:translate-x-0.5 group-hover/result:text-[#5658E8]"
                            />

                          </button>
                        );
                      }
                    )}

                  </div>
                )}

              </div>

              {/* SEARCH FOOTER */}

              {searchResults.length >
                0 && (

                <div className="border-t border-[#EAECF0] bg-[#FAFBFC] px-4 py-2.5">

                  <p className="text-[9px] text-[#98A2B3]">
                    Showing {searchResults.length} matching result
                    {searchResults.length === 1
                      ? ""
                      : "s"}
                  </p>

                </div>
              )}

            </div>
          )}

        </div>

        {/* ===================================================
            RIGHT SIDE
        =================================================== */}

        <div className="flex items-center gap-2">

          {/* =================================================
              NOTIFICATIONS
          ================================================= */}

          <div
            ref={notificationRef}
            className="relative"
          >

            <button
              type="button"
              onClick={
                toggleNotifications
              }
              className="relative flex h-10 w-10 items-center justify-center rounded-xl text-[#536D7A] transition hover:bg-[#EEF5F8] hover:text-[#123B5D] focus:outline-none focus:ring-4 focus:ring-[#5658E8]/10"
              aria-label="Notifications"
              aria-expanded={
                notificationOpen
              }
              aria-haspopup="dialog"
            >

              <Bell
                size={18}
                strokeWidth={1.9}
              />

              {unreadCount > 0 && (
                <>
                  <span className="absolute right-2 top-1.5 h-2 w-2 animate-pulse rounded-full bg-[#D65A4A]" />

                  <span className="absolute -right-1 -top-1 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#5658E8] px-1 text-[9px] font-bold leading-none text-white shadow-sm">
                    {unreadCount >
                    99
                      ? "99+"
                      : unreadCount}
                  </span>
                </>
              )}

            </button>

            {/* =============================================
                NOTIFICATION PANEL
            ============================================= */}

            {notificationOpen && (

              <div className="absolute right-0 top-12 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[18px] border border-[#DDE1E9] bg-white shadow-[0_24px_60px_rgba(38,40,79,0.16)]">

                <div className="border-b border-[#EAECF0] px-4 py-4">

                  <div className="flex items-start justify-between gap-3">

                    <div>

                      <div className="flex items-center gap-2">

                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EAE5F9] text-[#7862C8]">

                          <Bell size={14} />

                        </div>

                        <div>

                          <h2 className="text-sm font-semibold text-[#202938]">
                            Notifications
                          </h2>

                          <p className="mt-0.5 text-[9px] text-[#98A2B3]">

                            {unreadCount >
                            0
                              ? `${unreadCount} unread`
                              : "All caught up"}

                          </p>

                        </div>

                      </div>

                    </div>

                    {unreadCount >
                      0 && (

                      <button
                        type="button"
                        onClick={
                          markAllNotificationsRead
                        }
                        disabled={
                          notificationActionLoading
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[9px] font-bold text-[#5658E8] transition hover:bg-[#F4F3FF] disabled:cursor-not-allowed disabled:opacity-50"
                      >

                        <CheckCheck
                          size={12}
                        />

                        Mark all read

                      </button>
                    )}

                  </div>

                </div>

                {notificationError && (

                  <div className="border-b border-[#F0D5D5] bg-[#FFF9F9] px-4 py-3">

                    <div className="flex items-start justify-between gap-3">

                      <p className="text-[10px] leading-5 text-[#B42318]">
                        {notificationError}
                      </p>

                      <button
                        type="button"
                        onClick={() =>
                          setNotificationError(
                            ""
                          )
                        }
                        className="shrink-0 text-[#B42318]/70 hover:text-[#B42318]"
                        aria-label="Dismiss notification error"
                      >
                        <X size={13} />
                      </button>

                    </div>

                  </div>
                )}

                <div className="max-h-[430px] overflow-y-auto">

                  {notificationsLoading ? (

                    <div className="px-5 py-12 text-center">

                      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-[#F3E3F2]">

                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#DCD8ED] border-t-[#5658E8]" />

                      </div>

                      <p className="mt-4 text-xs font-semibold text-[#344054]">
                        Loading notifications
                      </p>

                    </div>

                  ) : notifications.length ===
                    0 ? (

                    <div className="px-5 py-12 text-center">

                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#F8F9FB] text-[#98A2B3]">

                        <Bell size={19} />

                      </div>

                      <p className="mt-4 text-xs font-semibold text-[#344054]">
                        No notifications
                      </p>

                      <p className="mt-1.5 text-[10px] leading-5 text-[#98A2B3]">
                        New assignments and workflow updates will appear here.
                      </p>

                    </div>

                  ) : (

                    <div>

                      {notifications.map(
                        (
                          notification
                        ) => {

                          const Icon =
                            getNotificationIcon(
                              notification.notification_type
                            );

                          const iconStyle =
                            getNotificationIconStyles(
                              notification.notification_type
                            );

                          return (
                            <button
                              key={
                                notification.id
                              }
                              type="button"
                              onClick={() =>
                                handleNotificationClick(
                                  notification
                                )
                              }
                              className={`flex w-full items-start gap-3 border-b border-[#F0F2F4] px-4 py-3.5 text-left transition hover:bg-[#FAFBFD] ${
                                notification.is_read
                                  ? "bg-white"
                                  : "bg-[#FAFAFF]"
                              }`}
                            >

                              <span
                                className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                                style={{
                                  backgroundColor:
                                    iconStyle.background,
                                  color:
                                    iconStyle.color,
                                }}
                              >

                                <Icon
                                  size={15}
                                />

                                {!notification.is_read && (

                                  <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[#5658E8] ring-2 ring-white" />

                                )}

                              </span>

                              <span className="min-w-0 flex-1">

                                <span className="flex items-start justify-between gap-2">

                                  <span className="text-[11px] font-semibold text-[#344054]">
                                    {
                                      notification.title
                                    }
                                  </span>

                                  <span className="shrink-0 text-[9px] text-[#98A2B3]">
                                    {formatNotificationTime(
                                      notification.created_at
                                    )}
                                  </span>

                                </span>

                                <span className="mt-1 block text-[10px] leading-5 text-[#667085]">
                                  {
                                    notification.message
                                  }
                                </span>

                                {notification.entity_type ===
                                  "job" && (

                                  <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#F3F4F8] px-2 py-1 text-[8px] font-semibold text-[#7A8495]">

                                    <BriefcaseBusiness
                                      size={9}
                                    />

                                    Job #
                                    {
                                      notification.entity_id
                                    }

                                  </span>
                                )}

                              </span>

                              {!notification.is_read && (

                                <span className="mt-1.5 shrink-0">

                                  <span className="block h-2 w-2 rounded-full bg-[#5658E8]" />

                                </span>
                              )}

                            </button>
                          );
                        }
                      )}

                    </div>
                  )}

                </div>

                {notifications.length >
                  0 && (

                  <div className="border-t border-[#EAECF0] bg-[#FAFBFC] px-4 py-3">

                    <div className="flex items-center justify-between gap-3">

                      <p className="text-[9px] text-[#98A2B3]">

                        Showing latest{" "}
                        {
                          notifications.length
                        }{" "}
                        notifications

                      </p>

                      <button
                        type="button"
                        onClick={() =>
                          loadNotifications()
                        }
                        disabled={
                          notificationsLoading
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[9px] font-bold text-[#5658E8] transition hover:bg-[#F0EFFF] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Refresh
                      </button>

                    </div>

                  </div>
                )}

              </div>
            )}

          </div>

          {/* PROFILE MENU */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setProfileOpen((open) => !open)}
              className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-left transition hover:bg-[#EEF5F8] focus:outline-none focus:ring-4 focus:ring-[#5658E8]/10"
              aria-label="Open profile menu"
              aria-expanded={profileOpen}
              aria-haspopup="menu"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#123B5D] text-xs font-semibold text-white">
                {profilePhotoUrl ? (
                  <img
                    src={profilePhotoUrl}
                    alt={`${displayName}'s profile`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  displayName.charAt(0).toUpperCase()
                )}
              </div>
              <div className="hidden min-w-0 text-left sm:block">
                <p className="max-w-[160px] truncate text-xs font-semibold text-[#1F3544]" title={displayName}>
                  {displayName}
                </p>
                <p className="mt-0.5 max-w-[160px] truncate text-[10px] text-[#718894]">
                  {displayRole}
                </p>
              </div>
              <ChevronDown
                size={15}
                className={`text-[#718894] transition-transform ${profileOpen ? "rotate-180" : ""}`}
              />
            </button>

            {profileOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-50 mt-2 w-[280px] overflow-hidden rounded-2xl border border-[#DDE5EA] bg-white shadow-[0_20px_55px_rgba(18,59,93,0.18)]"
              >
                <div className="border-b border-[#EDF1F4] p-4">
                  <p className="truncate text-sm font-semibold text-[#1F3544]">{displayName}</p>
                  <p className="mt-1 text-xs font-medium text-[#5658E8]">{displayRole}</p>
                  <p className="mt-2 truncate text-xs text-[#718894]">{profile.email || auth?.email || ""}</p>
                </div>
                <div className="p-2">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={openProfileEditor}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[#344B5A] transition hover:bg-[#F3F6F8]"
                  >
                    Edit profile <span aria-hidden="true">?</span>
                  </button>
                </div>
                <div className="border-t border-[#EDF1F4] p-3">
                  <p className="px-1 text-xs font-semibold text-[#718894]">
                    Appearance
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-1">
                    <button
                      type="button"
                      aria-pressed={theme === "light"}
                      onClick={() => setTheme("light")}
                      className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${
                        theme === "light"
                          ? "bg-[#123B5D] text-white"
                          : "text-[#718894] hover:bg-[#F3F6F8]"
                      }`}
                    >
                      Light
                    </button>
                    <button
                      type="button"
                      aria-pressed={theme === "dark"}
                      onClick={() => setTheme("dark")}
                      className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${
                        theme === "dark"
                          ? "bg-[#123B5D] text-white"
                          : "text-[#718894] hover:bg-[#F3F6F8]"
                      }`}
                    >
                      Dark
                    </button>
                    <button
                      type="button"
                      aria-pressed={theme === "system"}
                      onClick={() => setTheme("system")}
                      className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${
                        theme === "system"
                          ? "bg-[#123B5D] text-white"
                          : "text-[#718894] hover:bg-[#F3F6F8]"
                      }`}
                    >
                      System
                    </button>
                  </div>
                </div>

                <div className="border-t border-[#EDF1F4] p-2">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setProfileOpen(false);
                      logout();
                      navigate("/login");
                    }}
                    className="w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[#B42318] transition hover:bg-[#FFF1F0]"
                  >
                    Log out
                  </button>
                </div>
              </div>
            )}
          </div>

          {profileEditorOpen && (
            createPortal(
<div
              className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-[#142B3A]/45 p-4 sm:items-center"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  setProfileEditorOpen(false);
                }
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="profile-editor-title"
                className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-[#DDE5EA] bg-white shadow-2xl"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4 border-b border-[#EDF1F4] px-6 py-5">
                  <div>
                    <h2 id="profile-editor-title" className="text-lg font-semibold text-[#1F3544]">
                      Edit your profile
                    </h2>
                    <p className="mt-1 text-sm text-[#718894]">Update your personal details.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setProfileEditorOpen(false)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[#718894] hover:bg-[#F1F4F6]"
                    aria-label="Close profile editor"
                  >
                    <X size={16} />
                  </button>
                </div>

                <form onSubmit={handleProfileSave} className="space-y-4 px-6 py-5">
                  <div className="flex items-center gap-4 rounded-xl border border-[#DDE5EA] p-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#123B5D] text-lg font-semibold text-white">
                      {profilePhotoUrl ? (
                        <img
                          src={profilePhotoUrl}
                          alt={`${displayName}'s profile`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        displayName.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[#1F3544]">
                        Profile photo
                      </p>
                      <p className="mt-1 text-xs text-[#718894]">
                        JPG, PNG or WebP. Maximum 5 MB.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={profilePhotoBusy}
                          onClick={() => profilePhotoInputRef.current?.click()}
                          className="rounded-lg bg-[#123B5D] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#194B73] disabled:opacity-60"
                        >
                          {profilePhotoBusy ? "Working..." : profilePhotoUrl ? "Change photo" : "Upload photo"}
                        </button>
                        {profilePhotoUrl && (
                          <button
                            type="button"
                            disabled={profilePhotoBusy}
                            onClick={handleProfilePhotoRemove}
                            className="rounded-lg border border-[#D7E0E6] px-3 py-2 text-xs font-semibold text-[#536D7A] transition hover:bg-[#F3F6F8] disabled:opacity-60"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <input
                        ref={profilePhotoInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={handleProfilePhotoChange}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="profile-full-name" className="mb-1.5 block text-xs font-semibold text-[#344B5A]">
                      Full name
                    </label>
                    <input
                      id="profile-full-name"
                      type="text"
                      required
                      minLength={2}
                      maxLength={100}
                      autoComplete="name"
                      value={profileForm.full_name}
                      onChange={(event) => {
                        setProfileForm((current) => ({ ...current, full_name: event.target.value }));
                        setProfileSaved(false);
                      }}
                      className="w-full rounded-xl border border-[#D7E0E6] px-3.5 py-2.5 text-sm text-[#1F3544] outline-none focus:border-[#5658E8] focus:ring-4 focus:ring-[#5658E8]/10"
                    />
                  </div>

                  <div>
                    <label htmlFor="profile-username" className="mb-1.5 block text-xs font-semibold text-[#344B5A]">
                      Username
                    </label>
                    <input
                      id="profile-username"
                      type="text"
                      required
                      minLength={3}
                      maxLength={50}
                      pattern="[a-zA-Z0-9_]+"
                      autoComplete="username"
                      value={profileForm.username}
                      onChange={(event) => {
                        setProfileForm((current) => ({ ...current, username: event.target.value }));
                        setProfileSaved(false);
                      }}
                      className="w-full rounded-xl border border-[#D7E0E6] px-3.5 py-2.5 text-sm text-[#1F3544] outline-none focus:border-[#5658E8] focus:ring-4 focus:ring-[#5658E8]/10"
                    />
                    <p className="mt-1.5 text-[11px] text-[#718894]">
                      Use 3?50 letters, numbers, or underscores.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="profile-email" className="mb-1.5 block text-xs font-semibold text-[#344B5A]">
                      Email address
                    </label>
                    <input
                      id="profile-email"
                      type="email"
                      value={profile.email || auth?.email || ""}
                      disabled
                      className="w-full cursor-not-allowed rounded-xl border border-[#E1E7EB] bg-[#F5F7F8] px-3.5 py-2.5 text-sm text-[#718894]"
                    />
                    <p className="mt-1.5 text-[11px] text-[#718894]">
                      Email changes require a separate verification flow.
                    </p>
                  </div>

                  <div className="rounded-xl bg-[#F5F7F9] px-3.5 py-3">
                    <p className="text-xs font-semibold text-[#344B5A]">Account role</p>
                    <p className="mt-1 text-sm text-[#718894]">{displayRole}</p>
                    <p className="mt-1 text-[11px] text-[#718894]">
                      Role and permissions cannot be edited here.
                    </p>
                  </div>

                  {profileError && (
                    <p role="alert" className="rounded-xl bg-[#FFF1F0] px-3.5 py-2.5 text-sm text-[#B42318]">
                      {profileError}
                    </p>
                  )}
                  {profileSaved && (
                    <p role="status" className="rounded-xl bg-[#ECFDF3] px-3.5 py-2.5 text-sm text-[#027A48]">
                      Profile saved successfully.
                    </p>
                  )}

                  <div className="flex justify-end gap-2 border-t border-[#EDF1F4] pt-4">
                    <button
                      type="button"
                      onClick={() => setProfileEditorOpen(false)}
                      className="rounded-xl border border-[#D7E0E6] px-4 py-2.5 text-sm font-semibold text-[#536D7A] hover:bg-[#F5F7F8]"
                    >
                      {profileSaved ? "Done" : "Cancel"}
                    </button>
                    <button
                      type="submit"
                      disabled={profileSaving}
                      className="rounded-xl bg-[#123B5D] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#194B73] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {profileSaving ? "Saving..." : "Save changes"}
                    </button>
                  </div>
                </form>
              </div>
            </div>, document.body)
          )}

        </div>

      </div>

    </header>
  );
}

/* ============================================================
   SMALL SEARCH LOADER
============================================================ */

function RefreshSmall() {
  return (
    <span className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#DCD8ED] border-t-[#5658E8]" />
  );
}

export default Topbar;