import { useEffect, useState } from "react";

import { useLocation, useNavigate } from "react-router-dom";

import {
  MailCheck,
  ArrowRight,
  RefreshCw,
} from "lucide-react";

import api from "../services/api";

import AuthLayout from "../layouts/AuthLayout";

const PRIMARY = "#5658E8";
const DARK = "#26284F";

function VerifyEmail() {
  const location = useLocation();
  const navigate = useNavigate();

  const registeredEmail = location.state?.email || "";

  const [email, setEmail] = useState(registeredEmail);
  const [otp, setOtp] = useState("");

  const [message, setMessage] = useState("");

  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const [verified, setVerified] = useState(false);

  const [resendCooldown, setResendCooldown] = useState(0);

  const [otpCountdown, setOtpCountdown] = useState(60);

  const [otpExpired, setOtpExpired] = useState(false);

  // ---------------------------------------------------------
  // OTP COUNTDOWN
  // ---------------------------------------------------------
  useEffect(() => {
    if (verified) {
      return;
    }

    if (otpCountdown <= 0) {
      setOtpExpired(true);
      setOtp("");

      return;
    }

    const timer = setInterval(() => {
      setOtpCountdown((current) => {
        if (current <= 1) {
          clearInterval(timer);
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [otpCountdown, verified]);

  // ---------------------------------------------------------
  // RESEND COOLDOWN
  // ---------------------------------------------------------
  useEffect(() => {
    if (resendCooldown <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setResendCooldown((current) => {
        if (current <= 1) {
          clearInterval(timer);
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [resendCooldown]);

  // ---------------------------------------------------------
  // COUNTDOWN FORMAT
  // ---------------------------------------------------------
  const formatCountdown = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(
      remainingSeconds
    ).padStart(2, "0")}`;
  };

  // ---------------------------------------------------------
  // VERIFY EMAIL
  // ---------------------------------------------------------
  const handleVerify = async (e) => {
    e.preventDefault();

    if (otpExpired) {
      setMessage(
        "This verification code has expired. Please request a new OTP."
      );

      return;
    }

    setMessage("");
    setLoading(true);

    try {
      const response = await api.post(
        "/auth/verify-email",
        {
          email,
          otp,
        }
      );

      setMessage(
        response.data?.message ||
          "Email verified successfully."
      );

      setVerified(true);
      setOtp("");
      setOtpExpired(false);
    } catch (error) {
      console.error(error);

      setMessage(
        error.response?.data?.detail ||
          "Unable to verify the email."
      );
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------
  // RESEND OTP
  // ---------------------------------------------------------
  const handleResend = async () => {
    if (
      !email ||
      resendCooldown > 0 ||
      resending ||
      verified
    ) {
      return;
    }

    setMessage("");
    setResending(true);

    try {
      const response = await api.post(
        "/auth/resend-verification-otp",
        {
          email,
        }
      );

      setMessage(
        response.data?.message ||
          "A new verification OTP has been sent to your email."
      );

      setOtp("");

      setOtpCountdown(60);
      setOtpExpired(false);

      setResendCooldown(30);
    } catch (error) {
      console.error(error);

      setMessage(
        error.response?.data?.detail ||
          "Unable to resend the verification OTP."
      );
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthLayout>
      <div className="w-full">

        {/* =====================================================
            VERIFICATION CARD
        ===================================================== */}
        <div className="relative overflow-hidden rounded-[28px] border border-[#DDE1EA] bg-white shadow-[0_24px_70px_rgba(38,40,79,0.10)]">

          {/* Top accent */}
          <div className="h-1.5 w-full bg-[#5658E8]" />

          <div className="px-7 py-8 sm:px-10 sm:py-10">

            {/* =================================================
                HEADER
            ================================================= */}
            <div className="mb-9">

              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#EAE5F9] text-[#7862C8]">
                <MailCheck size={21} />
              </div>

              <p className="mt-6 text-[9px] font-bold uppercase tracking-[0.2em] text-[#7862C8]">
                Email verification
              </p>

              <h1 className="mt-3 text-[34px] font-semibold leading-tight tracking-[-0.035em] text-[#182033] sm:text-[40px]">
                Verify your email
              </h1>

              <p className="mt-3 max-w-md text-sm leading-7 text-[#667085]">
                Enter the 6-digit verification code sent to
                your email address to activate your account.
              </p>

            </div>

            {/* =================================================
                FORM
            ================================================= */}
            <form
              onSubmit={handleVerify}
              className="space-y-6"
            >

              {/* EMAIL */}
              <div>
                <label
                  htmlFor="email"
                  className="mb-2.5 block text-xs font-semibold text-[#344054]"
                >
                  Email address
                </label>

                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) =>
                    setEmail(e.target.value)
                  }
                  placeholder="you@company.com"
                  autoComplete="email"
                  required
                  disabled={verified}
                  className="h-[52px] w-full rounded-xl border border-[#D6DAE3] bg-[#FBFCFE] px-4 text-sm text-[#182033] outline-none transition duration-200 placeholder:text-[#A4ACB9] focus:border-[#5658E8] focus:bg-white focus:ring-4 focus:ring-[#5658E8]/10 disabled:cursor-not-allowed disabled:bg-[#F5F6F9] disabled:opacity-60"
                />
              </div>

              {/* OTP */}
              <div>

                <div className="mb-2.5 flex items-center justify-between gap-4">

                  <label
                    htmlFor="otp"
                    className="block text-xs font-semibold text-[#344054]"
                  >
                    Verification code
                  </label>

                  {!verified && (
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                        otpExpired
                          ? "bg-[#FCE7E7] text-[#B42318]"
                          : "bg-[#EAE5F9] text-[#7862C8]"
                      }`}
                    >
                      {otpExpired
                        ? "OTP expired"
                        : `Expires in ${formatCountdown(
                            otpCountdown
                          )}`}
                    </span>
                  )}

                </div>

                <input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(e) =>
                    setOtp(
                      e.target.value
                        .replace(/\D/g, "")
                        .slice(0, 6)
                    )
                  }
                  placeholder="Enter 6-digit OTP"
                  autoComplete="one-time-code"
                  required
                  disabled={
                    verified ||
                    otpExpired
                  }
                  className="h-[58px] w-full rounded-xl border border-[#D6DAE3] bg-[#FBFCFE] px-4 text-center text-xl font-semibold tracking-[0.4em] text-[#182033] outline-none transition duration-200 placeholder:text-xs placeholder:font-normal placeholder:tracking-normal placeholder:text-[#A4ACB9] focus:border-[#5658E8] focus:bg-white focus:ring-4 focus:ring-[#5658E8]/10 disabled:cursor-not-allowed disabled:bg-[#F5F6F9] disabled:opacity-60"
                />

                <p className="mt-2 text-[11px] leading-5 text-[#98A2B3]">
                  Your verification code is valid for 1 minute.
                </p>

              </div>

              {/* =================================================
                  MESSAGE
              ================================================= */}
              {message && (
                <div
                  role="alert"
                  className={`rounded-xl border px-4 py-3.5 text-sm leading-6 ${
                    verified
                      ? "border-[#CFE4DC] bg-[#F0F9F5] text-[#176B59]"
                      : otpExpired
                        ? "border-[#F0CACA] bg-[#FFF5F5] text-[#B42318]"
                        : "border-[#DCD7F0] bg-[#F8F7FD] text-[#6454A8]"
                  }`}
                >
                  <div className="flex items-start gap-3">

                    <span
                      className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                        verified
                          ? "bg-[#238A72]"
                          : otpExpired
                            ? "bg-[#B42318]"
                            : "bg-[#7862C8]"
                      }`}
                    />

                    <span>
                      {message}
                    </span>

                  </div>
                </div>
              )}

              {/* =================================================
                  VERIFY BUTTON
              ================================================= */}
              <button
                type="submit"
                disabled={
                  loading ||
                  verified ||
                  otpExpired ||
                  otp.length !== 6
                }
                className="group flex h-[53px] w-full items-center justify-center gap-2 rounded-xl bg-[#5658E8] text-sm font-semibold text-white shadow-[0_10px_24px_rgba(86,88,232,0.20)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#4B4DD8] hover:shadow-[0_14px_30px_rgba(86,88,232,0.24)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading
                  ? "Verifying..."
                  : verified
                    ? "Email verified"
                    : "Verify email"}

                {!loading &&
                  !verified &&
                  !otpExpired && (
                    <ArrowRight
                      size={17}
                      className="transition-transform duration-200 group-hover:translate-x-1"
                    />
                  )}
              </button>

              {/* =================================================
                  RESEND
              ================================================= */}
              {!verified && (
                <div className="rounded-xl border border-[#EAECF0] bg-[#F8F9FC] px-5 py-5 text-center">

                  <p className="text-xs text-[#667085]">
                    Didn't receive the code?
                  </p>

                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={
                      resending ||
                      resendCooldown > 0 ||
                      !email
                    }
                    className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-[#5658E8] transition duration-200 hover:text-[#494BD8] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCw
                      size={14}
                      className={
                        resending
                          ? "animate-spin"
                          : ""
                      }
                    />

                    {resending
                      ? "Sending..."
                      : resendCooldown > 0
                        ? `Resend OTP in ${resendCooldown}s`
                        : "Resend OTP"}
                  </button>

                </div>
              )}

              {/* =================================================
                  SUCCESS ACTION
              ================================================= */}
              {verified && (
                <button
                  type="button"
                  onClick={() => navigate("/login")}
                  className="h-[52px] w-full rounded-xl border border-[#D2D6E0] bg-white text-sm font-semibold text-[#5658E8] transition duration-200 hover:border-[#5658E8] hover:bg-[#F8F8FF]"
                >
                  Continue to sign in
                </button>
              )}

            </form>

          </div>
        </div>

        {/* =====================================================
            SECURITY NOTE
        ===================================================== */}
        <div className="mt-6 flex items-center justify-center gap-2.5 text-[10px] font-medium text-[#98A2B3]">

          <span className="h-1.5 w-1.5 rounded-full bg-[#5658E8]" />

          Secure email verification

        </div>

      </div>
    </AuthLayout>
  );
}

export default VerifyEmail;