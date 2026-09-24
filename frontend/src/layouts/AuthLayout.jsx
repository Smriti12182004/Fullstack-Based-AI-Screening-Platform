function AuthLayout({ children }) {
  return (
    <div className="min-h-screen bg-[#F8F9FC] lg:grid lg:grid-cols-[48%_52%]">

      {/* =========================================================
          LEFT BRAND PANEL
      ========================================================== */}
      <section className="relative hidden min-h-screen overflow-hidden bg-[#26284F] lg:flex">

        {/* Background glow */}
        <div className="pointer-events-none absolute -right-32 -top-32 h-[420px] w-[420px] rounded-full bg-[#5658E8]/20 blur-[100px]" />

        <div className="pointer-events-none absolute -bottom-32 -left-32 h-[420px] w-[420px] rounded-full bg-[#7862C8]/15 blur-[100px]" />

        <div className="pointer-events-none absolute left-[35%] top-[45%] h-40 w-40 rounded-full bg-[#CFDEFC]/5 blur-[70px]" />

        <div className="relative z-10 flex min-h-screen w-full flex-col justify-between px-10 py-10 xl:px-14 xl:py-12">

          {/* =====================================================
              BRAND
          ===================================================== */}
          <div className="flex items-center gap-3">

            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-[#26284F] shadow-[0_8px_24px_rgba(0,0,0,0.16)]">
              <span className="text-sm font-bold">
                AI
              </span>
            </div>

            <div>
              <p className="text-sm font-semibold text-white">
                AI Screening Platform
              </p>

              <p className="mt-1 text-[11px] text-white/50">
                Smarter assessments. Better decisions.
              </p>
            </div>

          </div>

          {/* =====================================================
              MAIN MESSAGE
          ===================================================== */}
          <div className="max-w-[620px]">

            <p className="mb-5 text-[9px] font-bold uppercase tracking-[0.22em] text-[#CFDEFC]">
              Intelligent assessment platform
            </p>

            <h1 className="max-w-[560px] text-[42px] font-semibold leading-[1.06] tracking-[-0.035em] text-white xl:text-[54px]">
              Assess skills with confidence.
            </h1>

            <p className="mt-6 max-w-[500px] text-sm leading-7 text-white/65 xl:text-[15px]">
              A secure platform for creating, managing,
              and completing role-specific screening
              assessments.
            </p>

            {/* =================================================
                ABSTRACT PRODUCT VISUAL
            ================================================== */}
            <div className="relative mt-14 h-[210px] max-w-[570px]">

              {/* Back card */}
              <div className="absolute left-2 top-12 h-[142px] w-[290px] -rotate-6 rounded-[22px] border border-white/10 bg-white/[0.035] shadow-[0_25px_60px_rgba(0,0,0,0.2)]" />

              {/* Middle card */}
              <div className="absolute left-12 top-5 h-[142px] w-[290px] rotate-2 rounded-[22px] border border-white/10 bg-[#34365F] shadow-[0_25px_60px_rgba(0,0,0,0.25)]">

                <div className="p-6">

                  <div className="h-2 w-28 rounded-full bg-white/30" />

                  <div className="mt-5 h-2 w-44 rounded-full bg-white/10" />

                  <div className="mt-2.5 h-2 w-36 rounded-full bg-white/10" />

                  <div className="mt-7 flex gap-2.5">

                    <span className="h-6 w-20 rounded-full bg-[#CFDEFC]/15" />

                    <span className="h-6 w-14 rounded-full bg-white/10" />

                  </div>

                </div>

              </div>

              {/* Front card */}
              <div className="absolute left-28 top-12 h-[126px] w-[238px] rounded-[20px] border border-white/15 bg-[#454775]/75 shadow-[0_25px_60px_rgba(0,0,0,0.28)] backdrop-blur-sm">

                <div className="p-5">

                  <div className="flex items-center gap-3">

                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#5658E8]/30">

                      <div className="h-3 w-3 rounded-full bg-[#CFDEFC]" />

                    </div>

                    <div>

                      <div className="h-2 w-24 rounded-full bg-white/35" />

                      <div className="mt-2 h-1.5 w-14 rounded-full bg-white/15" />

                    </div>

                  </div>

                  <div className="mt-6 flex gap-2">

                    <div className="h-1.5 w-16 rounded-full bg-white/20" />

                    <div className="h-1.5 w-10 rounded-full bg-white/10" />

                  </div>

                </div>

              </div>

              {/* Status ring */}
              <div className="absolute right-2 top-16 flex h-[82px] w-[82px] items-center justify-center rounded-full border border-[#CFDEFC]/20 bg-white/[0.035] shadow-[0_15px_40px_rgba(0,0,0,0.2)]">

                <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full border border-[#CFDEFC]/25">

                  <span className="text-xl text-[#CFDEFC]">
                    ✓
                  </span>

                </div>

              </div>

            </div>

          </div>

          {/* =====================================================
              PLATFORM CAPABILITIES
          ====================================================== */}
          <div className="grid max-w-[700px] grid-cols-3 gap-6 border-t border-white/10 pt-6">

            <Capability
              number="01"
              title="Role-specific"
            />

            <Capability
              number="02"
              title="AI-assisted"
            />

            <Capability
              number="03"
              title="Human-reviewed"
            />

          </div>

        </div>
      </section>

      {/* =========================================================
          RIGHT AUTH AREA
      ========================================================== */}
      <section className="flex min-h-screen items-center justify-center overflow-x-hidden px-5 py-10 sm:px-8 lg:px-10 xl:px-14">

        <div className="flex w-full max-w-[560px] items-center justify-center">

          <div className="w-full">
            {children}
          </div>

        </div>

      </section>

    </div>
  );
}


/* =============================================================
   CAPABILITY
============================================================= */

function Capability({ number, title }) {
  return (
    <div>

      <p className="text-[9px] font-semibold tracking-[0.18em] text-white/30">
        {number}
      </p>

      <p className="mt-1.5 text-xs font-medium text-white/70">
        {title}
      </p>

    </div>
  );
}

export default AuthLayout;