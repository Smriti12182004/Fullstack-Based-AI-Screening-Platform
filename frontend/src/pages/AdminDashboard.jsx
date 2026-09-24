import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  ShieldCheck,
  Users,
  RefreshCw,
  LogOut,
  UserCog,
  ClipboardCheck,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";

const PRIMARY = "#5658E8";
const DARK = "#26284F";
const PAGE_BG = "#F7F8FC";
const BORDER = "#E4E7EC";
const TEXT = "#182033";
const MUTED = "#667085";

const ROLE_LABELS = {
  organization_admin: "Organization Administrator",
  recruiter: "Recruiter",
  assessment_manager: "Assessment Manager",
  assessment_reviewer: "Assessment Reviewer",
  candidate: "Candidate",
};

function AdminDashboard() {
  const navigate = useNavigate();
  const { auth, logout } = useAuth();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [currentTime, setCurrentTime] = useState(
    new Date()
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  const getGreeting = () => {
    const hour = currentTime.getHours();

    if (hour >= 5 && hour < 12) {
      return "Good morning";
    }

    if (hour >= 12 && hour < 17) {
      return "Good afternoon";
    }

    return "Good evening";
  };

  const getDisplayName = () => {
    const email = auth?.email || "";

    if (!email) {
      return "there";
    }

    const username = email.split("@")[0];

    return username
      .replace(/[._-]+/g, " ")
      .split(" ")
      .filter(Boolean)
      .map(
        (word) =>
          word.charAt(0).toUpperCase() +
          word.slice(1).toLowerCase()
      )
      .join(" ");
  };

  const getRoleLabel = (role) => {
    return (
      ROLE_LABELS[role] ||
      role
        ?.replace(/_/g, " ")
        ?.replace(/\b\w/g, (character) =>
          character.toUpperCase()
        ) ||
      "Unknown"
    );
  };

  const greeting = getGreeting();
  const displayName = getDisplayName();

  const loadUsers = async (showRefreshState = false) => {
    try {
      setError("");

      if (showRefreshState) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const response = await api.get("/admin/users");

      setUsers(
        Array.isArray(response.data)
          ? response.data
          : []
      );
    } catch (err) {
      console.error("Failed to load organization users:", err);

      if (
        err.response?.status === 401 ||
        err.response?.status === 403
      ) {
        logout();
        navigate("/login", { replace: true });
        return;
      }

      setError(
        err.response?.data?.detail ||
          "Unable to load organization users right now."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const organizationAdminCount = users.filter(
    (user) =>
      user.role === "organization_admin"
  ).length;

  const recruiterCount = users.filter(
    (user) => user.role === "recruiter"
  ).length;

  const assessmentManagerCount = users.filter(
    (user) =>
      user.role === "assessment_manager"
  ).length;

  const assessmentReviewerCount = users.filter(
    (user) =>
      user.role === "assessment_reviewer"
  ).length;

  const candidateCount = users.filter(
    (user) => user.role === "candidate"
  ).length;

  return (
    <div className="min-h-screen bg-[#F7F8FC] text-[#182033]">

      {/* =====================================================
          HEADER
      ===================================================== */}
      <header className="border-b border-[#E4E7EC] bg-white">
        <div className="mx-auto flex min-h-[72px] max-w-[1400px] items-center justify-between px-5 sm:px-8">

          <div className="flex items-center gap-3">

            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#5658E8] text-white shadow-[0_8px_18px_rgba(86,88,232,0.20)]">
              <ShieldCheck size={20} />
            </div>

            <div>
              <div className="font-display text-xl font-semibold text-[#26284F]">
                Evalyn
              </div>

              <p className="text-xs text-[#98A2B3]">
                Organization Administration
              </p>
            </div>

          </div>

          <div className="flex items-center gap-3">

            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-[#182033]">
                {displayName}
              </p>

              <p className="text-xs text-[#667085]">
                Organization Administrator
              </p>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#D6DAE3] bg-white px-3 text-sm font-medium text-[#52607A] transition hover:border-[#5658E8] hover:text-[#5658E8]"
            >
              <LogOut size={16} />

              <span className="hidden sm:inline">
                Logout
              </span>
            </button>

          </div>

        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-5 py-8 sm:px-8">

        {/* =====================================================
            HERO
        ===================================================== */}
        <section className="relative overflow-hidden rounded-[28px] border border-[#E4E7EC] bg-white p-6 shadow-[0_18px_50px_rgba(38,40,79,0.07)] sm:p-8">

          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full border-[22px] border-[#ECECFF]" />

          <div className="pointer-events-none absolute -bottom-24 right-24 h-40 w-40 rounded-full border-[16px] border-[#F1F1FF]" />

          <div className="relative max-w-3xl">

            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-[#5658E8]">
              Organization Administration
            </p>

            <h1 className="font-display text-4xl leading-tight text-[#26284F] sm:text-5xl">
              {greeting}, {displayName}.
            </h1>

            <p className="mt-4 max-w-2xl text-sm leading-7 text-[#667085] sm:text-base">
              Manage organization users and review the current
              distribution of platform roles across your Evalyn
              workspace.
            </p>

          </div>

        </section>

        {/* =====================================================
            ROLE SUMMARY
        ===================================================== */}
        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">

          {/* TOTAL USERS */}
          <div className="rounded-2xl border border-[#E4E7EC] bg-white p-5 shadow-[0_8px_25px_rgba(38,40,79,0.03)]">

            <div className="flex items-center justify-between">

              <div>
                <p className="text-sm text-[#98A2B3]">
                  Total Users
                </p>

                <p className="mt-1 text-3xl font-semibold text-[#182033]">
                  {users.length}
                </p>
              </div>

              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F0F0FF] text-[#5658E8]">
                <Users size={20} />
              </div>

            </div>

          </div>

          {/* RECRUITERS */}
          <div className="rounded-2xl border border-[#E4E7EC] bg-white p-5 shadow-[0_8px_25px_rgba(38,40,79,0.03)]">

            <div className="flex items-center justify-between">

              <div>
                <p className="text-sm text-[#98A2B3]">
                  Recruiters
                </p>

                <p className="mt-1 text-3xl font-semibold text-[#182033]">
                  {recruiterCount}
                </p>
              </div>

              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F0F0FF] text-[#5658E8]">
                <Activity size={20} />
              </div>

            </div>

          </div>

          {/* ASSESSMENT MANAGERS */}
          <div className="rounded-2xl border border-[#E4E7EC] bg-white p-5 shadow-[0_8px_25px_rgba(38,40,79,0.03)]">

            <div className="flex items-center justify-between">

              <div>
                <p className="text-sm text-[#98A2B3]">
                  Assessment Managers
                </p>

                <p className="mt-1 text-3xl font-semibold text-[#182033]">
                  {assessmentManagerCount}
                </p>
              </div>

              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F0F0FF] text-[#5658E8]">
                <ClipboardCheck size={20} />
              </div>

            </div>

          </div>

          {/* ASSESSMENT REVIEWERS */}
          <div className="rounded-2xl border border-[#E4E7EC] bg-white p-5 shadow-[0_8px_25px_rgba(38,40,79,0.03)]">

            <div className="flex items-center justify-between">

              <div>
                <p className="text-sm text-[#98A2B3]">
                  Assessment Reviewers
                </p>

                <p className="mt-1 text-3xl font-semibold text-[#182033]">
                  {assessmentReviewerCount}
                </p>
              </div>

              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F0F0FF] text-[#5658E8]">
                <UserCog size={20} />
              </div>

            </div>

          </div>

          {/* CANDIDATES */}
          <div className="rounded-2xl border border-[#E4E7EC] bg-white p-5 shadow-[0_8px_25px_rgba(38,40,79,0.03)]">

            <div className="flex items-center justify-between">

              <div>
                <p className="text-sm text-[#98A2B3]">
                  Candidates
                </p>

                <p className="mt-1 text-3xl font-semibold text-[#182033]">
                  {candidateCount}
                </p>
              </div>

              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F0F0FF] text-[#5658E8]">
                <Users size={20} />
              </div>

            </div>

          </div>

        </section>

        {/* =====================================================
            ORGANIZATION USERS
        ===================================================== */}
        <section className="mt-8">

          <div className="mb-4 flex items-center justify-between gap-4">

            <div>
              <h2 className="font-display text-2xl font-semibold text-[#26284F]">
                Organization users
              </h2>

              <p className="mt-1 text-sm text-[#667085]">
                Users currently registered in your Evalyn organization.
              </p>
            </div>

            <button
              type="button"
              onClick={() => loadUsers(true)}
              disabled={refreshing}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#D6DAE3] bg-white px-3 text-sm font-medium text-[#52607A] transition hover:border-[#5658E8] hover:text-[#5658E8] disabled:opacity-60"
            >
              <RefreshCw
                size={16}
                className={
                  refreshing
                    ? "animate-spin"
                    : ""
                }
              />

              <span className="hidden sm:inline">
                Refresh
              </span>
            </button>

          </div>

          {/* =================================================
              LOADING
          ================================================= */}
          {loading ? (

            <div className="rounded-2xl border border-[#E4E7EC] bg-white p-8 text-center">

              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#E4E7EC] border-t-[#5658E8]" />

              <p className="mt-4 text-sm text-[#667085]">
                Loading organization users...
              </p>

            </div>

          ) : error ? (

            /* =================================================
               ERROR
            ================================================= */
            <div className="rounded-2xl border border-[#F0CACA] bg-[#FFF5F5] p-6">

              <p className="text-sm font-medium text-[#B42318]">
                {error}
              </p>

              <button
                type="button"
                onClick={() => loadUsers()}
                className="mt-4 rounded-xl bg-[#5658E8] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#4B4DD8]"
              >
                Try again
              </button>

            </div>

          ) : (

            /* =================================================
               USER TABLE
            ================================================= */
            <div className="overflow-hidden rounded-2xl border border-[#E4E7EC] bg-white shadow-[0_8px_25px_rgba(38,40,79,0.04)]">

              <div className="overflow-x-auto">

                <table className="min-w-full text-left">

                  <thead className="border-b border-[#E4E7EC] bg-[#F8F9FC]">

                    <tr>

                      <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.12em] text-[#98A2B3]">
                        ID
                      </th>

                      <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.12em] text-[#98A2B3]">
                        Email
                      </th>

                      <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.12em] text-[#98A2B3]">
                        Role
                      </th>

                      <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.12em] text-[#98A2B3]">
                        Created
                      </th>

                    </tr>

                  </thead>

                  <tbody>

                    {users.map((user) => (

                      <tr
                        key={user.id}
                        className="border-b border-[#F0F2F5] last:border-b-0"
                      >

                        <td className="px-5 py-4 text-sm font-medium text-[#182033]">
                          {user.id}
                        </td>

                        <td className="px-5 py-4 text-sm text-[#52607A]">
                          {user.email}
                        </td>

                        <td className="px-5 py-4">

                          <span className="inline-flex rounded-full border border-[#DDDFFE] bg-[#F5F5FF] px-2.5 py-1 text-xs font-semibold text-[#5658E8]">
                            {getRoleLabel(user.role)}
                          </span>

                        </td>

                        <td className="px-5 py-4 text-sm text-[#667085]">
                          {user.created_at
                            ? new Date(
                                user.created_at
                              ).toLocaleString()
                            : "—"}
                        </td>

                      </tr>

                    ))}

                  </tbody>

                </table>

              </div>

            </div>

          )}

        </section>

      </main>
    </div>
  );
}

export default AdminDashboard;