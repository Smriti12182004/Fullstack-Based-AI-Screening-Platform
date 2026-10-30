
import { useState } from "react";
import {
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import {
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
  User,
  UserPlus,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import AuthLayout from "../layouts/AuthLayout";

const ROLE_OPTIONS = [
  {
    value: "candidate",
    label: "Candidate",
  },
  {
    value: "recruiter",
    label: "HR / Recruiter",
  },
  {
    value: "assessment_manager",
    label: "Assessment Manager",
  },
  {
    value: "assessment_reviewer",
    label: "Assessment Reviewer",
  },
  {
    value: "organization_admin",
    label: "Organization Administrator",
  },
];

function getWorkspacePath(role) {
  switch (role) {
    case "candidate":
      return "/candidate/dashboard";

    case "recruiter":
      return "/dashboard";

    case "assessment_manager":
      return "/manager/dashboard";

    case "assessment_reviewer":
      return "/reviewer/dashboard";

    case "organization_admin":
    case "admin":
      return "/admin";

    default:
      return "/";
  }
}

function getRoleLabel(role) {
  return (
    ROLE_OPTIONS.find(
      (option) => option.value === role
    )?.label ||
    (
      role === "admin"
        ? "Administrator"
        : role || "Unknown role"
    )
  );
}

function Login() {
  const { auth, login, logout } = useAuth();

  const navigate = useNavigate();

  const [searchParams] = useSearchParams();

  const requestedNext = searchParams.get("next");

  const candidateDestination =
    requestedNext &&
    /^\/assessments\/\d+$/.test(requestedNext)
      ? requestedNext
      : "/candidate/dashboard";

  const [isRegistering, setIsRegistering] =
    useState(false);

  const [username, setUsername] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [role, setRole] =
    useState("candidate");

  const [showPassword, setShowPassword] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [
    emailVerificationRequired,
    setEmailVerificationRequired,
  ] = useState(false);

  const resetForm = () => {
    setUsername("");
    setEmail("");
    setPassword("");
    setRole("candidate");
    setShowPassword(false);
    setMessage("");
    setEmailVerificationRequired(false);
  };

  const switchMode = () => {
    setIsRegistering((value) => !value);
    resetForm();
  };

  const handleLogin = async (event) => {
    event.preventDefault();

    setMessage("");
    setEmailVerificationRequired(false);
    setLoading(true);

    try {
      const response = await api.post(
        "/auth/login",
        {
          email,
          password,
        }
      );

      login(response.data);

      const userRole = response.data?.role;

      if (userRole === "candidate") {
        navigate(candidateDestination, {
          replace: true,
        });
      } else if (
        userRole === "admin" ||
        userRole === "organization_admin"
      ) {
        navigate("/admin", {
          replace: true,
        });
      } else if (
        userRole === "assessment_manager"
      ) {
        navigate("/manager/dashboard", {
          replace: true,
        });
      } else if (
        userRole === "assessment_reviewer"
      ) {
        navigate("/reviewer/dashboard", {
          replace: true,
        });
      } else {
        navigate("/dashboard", {
          replace: true,
        });
      }
    } catch (error) {
      console.error(error);

      const detail =
        error.response?.data?.detail;

      if (
        error.response?.status === 403 &&
        detail ===
          "Please verify your email before logging in."
      ) {
        setMessage(detail);
        setEmailVerificationRequired(true);
      } else {
        setMessage(
          detail || "Invalid email or password"
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();

    setMessage("");
    setLoading(true);

    try {
      const response = await api.post(
        "/auth/register",
        {
          username,
          email,
          password,
          role: "candidate",
        }
      );

      navigate("/auth/verify-email", {
        state: {
          email: response.data?.email || email,
        },
      });
    } catch (error) {
      console.error(error);

      setMessage(
        error.response?.data?.detail ||
          "Unable to complete registration."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoToVerification = () => {
    navigate("/auth/verify-email", {
      state: {
        email,
      },
    });
  };

  const handleLogoutAndSwitchAccount = () => {
    logout();
    resetForm();
    setIsRegistering(false);

    navigate("/login", {
      replace: true,
    });
  };

  // Show the active account instead of offering a second sign-in
  // attempt while another user still owns this browser session.
  if (auth?.access_token) {
    const displayName =
      auth.full_name ||
      auth.username ||
      auth.email ||
      "Signed-in user";

    return (
      <AuthLayout>
        <div className="w-full max-w-[500px]">
          <div className="rounded-[28px] border border-[#DDE1EA] bg-white p-7 shadow-[0_24px_70px_rgba(38,40,79,0.10)] sm:p-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#EAE5F9] text-[#5658E8]">
              <ShieldCheck size={23} />
            </div>

            <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.2em] text-[#5658E8]">
              Active session
            </p>

            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[#182033]">
              You’re already signed in
            </h1>

            <p className="mt-3 text-sm leading-6 text-[#667085]">
              Evalyn is currently using this account.
              To switch users, log out first; the
              sign-in form will then appear here.
            </p>

            <div className="mt-6 rounded-2xl border border-[#E7E9F0] bg-[#FAFBFC] p-4">
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#98A2B3]">
                Signed in as
              </p>

              <p className="mt-2 break-words text-base font-semibold text-[#202938]">
                {displayName}
              </p>

              {auth.email && (
                <p className="mt-1 break-all text-sm text-[#667085]">
                  {auth.email}
                </p>
              )}

              <p className="mt-2 inline-flex rounded-full bg-[#EAE5F9] px-3 py-1 text-xs font-semibold text-[#5658E8]">
                {getRoleLabel(auth.role)}
              </p>
            </div>

            <button
              type="button"
              onClick={handleLogoutAndSwitchAccount}
              className="mt-6 flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#5658E8] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(86,88,232,0.20)] transition hover:bg-[#4B4DD8] focus:outline-none focus:ring-4 focus:ring-[#5658E8]/15"
            >
              Log out and switch account
              <ArrowRight size={17} />
            </button>

            <button
              type="button"
              onClick={() =>
                navigate(
                  getWorkspacePath(auth.role),
                  { replace: true }
                )
              }
              className="mt-3 flex h-[48px] w-full items-center justify-center rounded-xl border border-[#D6DAE3] bg-white px-4 text-sm font-semibold text-[#475467] transition hover:border-[#5658E8] hover:text-[#5658E8]"
            >
              Continue to my workspace
            </button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="w-full max-w-[500px]">
        <div className="group relative overflow-hidden rounded-[28px] border border-[#DDE1EA] bg-white shadow-[0_24px_70px_rgba(38,40,79,0.10)]">
          <div className="pointer-events-none absolute right-5 top-4 hidden text-[#7A61D8]/25 sm:block">
            <div className="relative flex h-24 w-24 items-center justify-center transition-all duration-500 group-hover:rotate-3 group-hover:scale-105">
              <span className="absolute inset-2 rounded-[26px] border border-dashed border-current" />
              <span className="absolute left-1 top-7 h-1.5 w-1.5 rounded-full bg-[#3B82F6]/55 transition-transform duration-500 group-hover:translate-x-1" />
              <span className="absolute right-0 top-3 h-2 w-2 animate-pulse rounded-full bg-[#5658E8]/55" />
              <span className="absolute bottom-6 left-0 h-1.5 w-1.5 rounded-full bg-[#B85C87]/45" />
              <span className="absolute bottom-5 right-1 h-px w-8 rotate-[-22deg] bg-current opacity-50" />
              <span className="absolute left-2 top-12 h-px w-5 rotate-[22deg] bg-current opacity-35" />
              <ShieldCheck size={42} strokeWidth={1.05} />
            </div>
          </div>

          <div className="relative px-7 py-8 sm:px-10 sm:py-10">
            <div className="mb-9">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EAE5F9] text-[#7862C8] transition-all duration-300 group-hover:scale-105 group-hover:-rotate-3">
                  {isRegistering ? (
                    <UserPlus size={19} />
                  ) : (
                    <Lock size={19} />
                  )}
                </div>

                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#5658E8]">
                    {isRegistering
                      ? "Create account"
                      : "Secure access"}
                  </p>

                  <p className="mt-1 text-[10px] text-[#98A2B3]">
                    Evalyn screening platform
                  </p>
                </div>
              </div>

              <h1 className="mt-7 text-[35px] font-semibold leading-tight tracking-[-0.035em] text-[#182033] sm:text-[40px]">
                {isRegistering
                  ? "Create your account"
                  : "Welcome back"}
              </h1>

              <p className="mt-3 max-w-md text-sm leading-7 text-[#667085]">
                {isRegistering
                  ? "Set up your Evalyn account and get started with the screening workspace."
                  : "Sign in to continue to your Evalyn screening workspace."}
              </p>
            </div>

            <div className="mb-8 grid grid-cols-2 rounded-xl bg-[#F3F4F8] p-1">
              <button
                type="button"
                onClick={() => {
                  if (isRegistering) {
                    switchMode();
                  }
                }}
                className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition duration-200 ${
                  !isRegistering
                    ? "bg-white text-[#26284F] shadow-[0_4px_12px_rgba(38,40,79,0.08)]"
                    : "text-[#98A2B3] hover:text-[#667085]"
                }`}
              >
                Sign in
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!isRegistering) {
                    switchMode();
                  }
                }}
                className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition duration-200 ${
                  isRegistering
                    ? "bg-white text-[#26284F] shadow-[0_4px_12px_rgba(38,40,79,0.08)]"
                    : "text-[#98A2B3] hover:text-[#667085]"
                }`}
              >
                Sign up
              </button>
            </div>

            <form
              onSubmit={
                isRegistering
                  ? handleRegister
                  : handleLogin
              }
              className="space-y-6"
            >
              {isRegistering && (
                <div>
                  <label
                    htmlFor="username"
                    className="mb-2.5 block text-xs font-semibold text-[#344054]"
                  >
                    Username
                  </label>

                  <div className="relative">
                    <User
                      size={17}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-[#98A2B3]"
                    />

                    <input
                      id="username"
                      type="text"
                      value={username}
                      onChange={(event) =>
                        setUsername(event.target.value)
                      }
                      placeholder="Choose a username"
                      autoComplete="username"
                      minLength={3}
                      maxLength={50}
                      pattern="^[a-zA-Z0-9_]+$"
                      required
                      className="h-[52px] w-full rounded-xl border border-[#D6DAE3] bg-[#FBFCFE] pl-11 pr-4 text-sm text-[#182033] outline-none transition duration-200 placeholder:text-[#A4ACB9] focus:border-[#5658E8] focus:bg-white focus:ring-4 focus:ring-[#5658E8]/10"
                    />
                  </div>

                  <p className="mt-2 text-[11px] leading-5 text-[#98A2B3]">
                    3–50 characters. Letters, numbers and
                    underscores only.
                  </p>
                </div>
              )}

              <div>
                <label
                  htmlFor="email"
                  className="mb-2.5 block text-xs font-semibold text-[#344054]"
                >
                  Email address
                </label>

                <div className="relative">
                  <Mail
                    size={17}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-[#98A2B3]"
                  />

                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) =>
                      setEmail(event.target.value)
                    }
                    placeholder="you@company.com"
                    autoComplete="email"
                    required
                    className="h-[52px] w-full rounded-xl border border-[#D6DAE3] bg-[#FBFCFE] pl-11 pr-4 text-sm text-[#182033] outline-none transition duration-200 placeholder:text-[#A4ACB9] focus:border-[#5658E8] focus:bg-white focus:ring-4 focus:ring-[#5658E8]/10"
                  />
                </div>
              </div>

              {isRegistering && (
                <p className="rounded-xl border border-[#D6DAE3] bg-[#FBFCFE] px-4 py-3 text-sm leading-6 text-[#667085]">
                  Public signup creates candidate accounts. Other roles must be assigned by an organization administrator.
                </p>
              )}

              <div>
                <label
                  htmlFor="password"
                  className="mb-2.5 block text-xs font-semibold text-[#344054]"
                >
                  Password
                </label>

                <div className="relative">
                  <Lock
                    size={17}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-[#98A2B3]"
                  />

                  <input
                    id="password"
                    type={
                      showPassword
                        ? "text"
                        : "password"
                    }
                    value={password}
                    onChange={(event) =>
                      setPassword(event.target.value)
                    }
                    placeholder="Enter your password"
                    autoComplete={
                      isRegistering
                        ? "new-password"
                        : "current-password"
                    }
                    minLength={8}
                    maxLength={128}
                    required
                    className="h-[52px] w-full rounded-xl border border-[#D6DAE3] bg-[#FBFCFE] pl-11 pr-12 text-sm text-[#182033] outline-none transition duration-200 placeholder:text-[#A4ACB9] focus:border-[#5658E8] focus:bg-white focus:ring-4 focus:ring-[#5658E8]/10"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword((value) => !value)
                    }
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[#98A2B3] transition duration-200 hover:bg-[#F3F4F8] hover:text-[#5658E8]"
                    aria-label={
                      showPassword
                        ? "Hide password"
                        : "Show password"
                    }
                  >
                    {showPassword ? (
                      <EyeOff size={17} />
                    ) : (
                      <Eye size={17} />
                    )}
                  </button>
                </div>
              </div>

              {!isRegistering && (
                <div className="flex items-center justify-between gap-4">
                  <label className="flex cursor-pointer items-center gap-2.5 text-xs text-[#667085]">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer rounded border-[#C8CDD7] accent-[#5658E8]"
                    />
                    Remember me
                  </label>

                  <button
                    type="button"
                    className="text-xs font-semibold text-[#5658E8] transition duration-200 hover:text-[#494BD8]"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {message && (
                <div
                  role="alert"
                  className={`rounded-xl border px-4 py-3.5 text-sm leading-6 ${
                    emailVerificationRequired
                      ? "border-[#E6D7AE] bg-[#FFF9EA] text-[#8A6415]"
                      : "border-[#F0CACA] bg-[#FFF5F5] text-[#B42318]"
                  }`}
                >
                  {message}
                </div>
              )}

              {emailVerificationRequired && (
                <button
                  type="button"
                  onClick={handleGoToVerification}
                  disabled={!email}
                  className="group flex h-[52px] w-full items-center justify-center gap-2 rounded-xl border border-[#D2D6E0] bg-white text-sm font-semibold text-[#5658E8] transition duration-200 hover:border-[#5658E8] hover:bg-[#F8F8FF] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Verify email
                  <ArrowRight
                    size={16}
                    className="transition-transform duration-200 group-hover:translate-x-1"
                  />
                </button>
              )}

              {!emailVerificationRequired && (
                <button
                  type="submit"
                  disabled={loading}
                  className="group flex h-[53px] w-full items-center justify-center gap-2 rounded-xl bg-[#5658E8] text-sm font-semibold text-white shadow-[0_10px_24px_rgba(86,88,232,0.20)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#4B4DD8] hover:shadow-[0_14px_30px_rgba(86,88,232,0.24)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading
                    ? isRegistering
                      ? "Creating account..."
                      : "Signing in..."
                    : isRegistering
                      ? "Create account"
                      : "Sign in"}

                  {!loading && (
                    <ArrowRight
                      size={17}
                      className="transition-transform duration-200 group-hover:translate-x-1"
                    />
                  )}
                </button>
              )}
            </form>

            <div className="mt-9 border-t border-[#EAECF0] pt-7 text-center">
              <p className="text-xs text-[#98A2B3]">
                {isRegistering
                  ? "Already have an account?"
                  : "Don't have an account?"}
              </p>

              <button
                type="button"
                onClick={switchMode}
                className="mt-2 text-sm font-semibold text-[#5658E8] transition duration-200 hover:text-[#494BD8]"
              >
                {isRegistering
                  ? "Sign in instead"
                  : "Create an account"}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-center gap-2.5 text-[10px] font-medium text-[#98A2B3]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#5658E8]" />
          Secure access to your Evalyn workspace
        </div>
      </div>
    </AuthLayout>
  );
}

export default Login;
