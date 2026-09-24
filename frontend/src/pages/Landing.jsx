import { useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  ArrowRight,
  BrainCircuit,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  FileQuestion,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  WandSparkles,
  Clock3,
  MonitorCheck,
  MousePointer2,
} from "lucide-react";

import evalynLogo from "../assets/evalyn-logo.png";

function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen scroll-smooth bg-white text-[#172033]">

      {/* =====================================================
          NAVBAR
      ===================================================== */}
      <header className="sticky top-0 z-50 border-b border-[#3B3D63] bg-[#26284F]">
        <div className="mx-auto flex h-[68px] max-w-[1280px] items-center justify-between px-5 sm:px-8">

          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex items-center"
            aria-label="Evalyn home"
          >
            <LogoCrop backgroundColor="#26284F" />
          </button>

          <nav className="hidden items-center gap-9 md:flex">

            <a
              href="#how-it-works"
              className="text-[13px] font-medium text-[#E2E4F2] transition duration-200 hover:text-white"
            >
              How it works
            </a>

            <a
              href="#features"
              className="text-[13px] font-medium text-[#E2E4F2] transition duration-200 hover:text-white"
            >
              Features
            </a>

            <a
              href="#why-evalyn"
              className="text-[13px] font-medium text-[#E2E4F2] transition duration-200 hover:text-white"
            >
              Why Evalyn
            </a>

          </nav>

          <div className="flex items-center gap-4">

            <button
              type="button"
              onClick={() => navigate("/login")}
              className="hidden text-[13px] font-medium text-white transition hover:text-[#C9CBFF] sm:block"
            >
              Sign in
            </button>

            <button
              type="button"
              onClick={() => navigate("/login")}
              className="group inline-flex items-center gap-2 rounded-md bg-white px-4 py-2.5 text-[13px] font-semibold text-[#171717] shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-[#EEEEEE]"
            >
              Get started

              <ArrowRight
                size={14}
                className="transition-transform duration-200 group-hover:translate-x-1"
              />
            </button>

          </div>
        </div>
      </header>

      <main>

        {/* =====================================================
            HERO
        ===================================================== */}
        <section className="relative overflow-hidden border-b border-[#E5E7EB] bg-white">

          <div className="pointer-events-none absolute -left-40 -top-32 h-[500px] w-[500px] rounded-full bg-[#CFDEFC]/45 blur-[120px]" />

          <div className="pointer-events-none absolute right-[-130px] top-[-100px] h-[520px] w-[520px] rounded-full bg-[#EAE5F9]/55 blur-[130px]" />

          <div className="pointer-events-none absolute bottom-[-170px] right-[15%] h-[420px] w-[420px] rounded-full bg-[#F3E3F2]/40 blur-[120px]" />

          <div className="pointer-events-none absolute bottom-[-220px] left-[8%] h-[400px] w-[400px] rounded-full bg-[#FAEDEA]/45 blur-[120px]" />

          <div className="pointer-events-none absolute left-[16%] top-[18%] h-2 w-2 rounded-full bg-[#9FB1FE]" />

          <div className="pointer-events-none absolute left-[44%] top-[12%] h-1.5 w-1.5 rounded-full bg-[#EDBFE5]" />

          <div className="pointer-events-none absolute right-[18%] top-[30%] h-2 w-2 rounded-full bg-[#D4C6F8]" />

          <div className="pointer-events-none absolute right-[10%] bottom-[18%] h-1.5 w-1.5 rounded-full bg-[#FFD8C7]" />

          <div className="relative mx-auto grid max-w-[1280px] grid-cols-1 gap-16 px-5 pb-24 pt-20 sm:px-8 sm:pb-28 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:gap-16 lg:pt-24">

            <div className="relative z-10 max-w-[650px]">

              <div className="inline-flex items-center gap-2 border border-[#C8CFD9] bg-white px-4 py-2.5 shadow-[0_8px_22px_rgba(30,38,60,0.05)]">

                <span className="h-2 w-2 rounded-full bg-[#5658E8] shadow-[0_0_12px_rgba(86,88,232,0.45)]" />

                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#46515F]">
                  Smarter screening
                </span>

                <span className="h-3.5 w-px bg-[#D7DBE1]" />

                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#5658E8]">
                  Human-led decisions
                </span>

              </div>

              <h1 className="mt-8 max-w-[680px] text-[52px] font-medium leading-[0.99] tracking-[-0.05em] text-[#111827] sm:text-[66px] lg:text-[78px]">

                Screen smarter.

                <br />

                <span className="text-[#5658E8]">
                  Hire with clarity.
                </span>

              </h1>

              <p className="mt-8 max-w-[620px] text-base leading-8 text-[#667085] sm:text-[18px]">

                <strong className="font-semibold text-[#202938]">
                  Evalyn
                </strong>{" "}
                transforms job requirements into structured,
                role-specific screening assessments — combining{" "}
                <strong className="font-semibold text-[#5658E8]">
                  AI assistance
                </strong>{" "}
                with{" "}
                <strong className="font-semibold text-[#202938]">
                  human review
                </strong>
                .

              </p>

              <div className="mt-10 flex flex-wrap gap-3">

                <button
                  type="button"
                  onClick={() => navigate("/login")}
                  className="group inline-flex items-center gap-3 rounded-md bg-[#5658E8] px-6 py-4 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(86,88,232,0.21)] transition duration-200 hover:-translate-y-1 hover:bg-[#494BD8]"
                >
                  Start screening

                  <ArrowRight
                    size={16}
                    className="transition-transform duration-200 group-hover:translate-x-1"
                  />
                </button>

                <a
                  href="#how-it-works"
                  className="group inline-flex items-center gap-2 rounded-md border border-[#B8C0CB] bg-white px-6 py-4 text-sm font-semibold text-[#202733] shadow-[0_6px_16px_rgba(20,30,50,0.04)] transition duration-200 hover:-translate-y-1 hover:border-[#8C96A3]"
                >
                  See how it works

                  <ChevronRight
                    size={16}
                    className="transition-transform duration-200 group-hover:translate-x-1"
                  />
                </a>

              </div>

              <div className="mt-10 flex flex-wrap gap-x-7 gap-y-4">

                <TrustPoint
                  icon={<Sparkles size={14} />}
                  text="AI-assisted"
                />

                <TrustPoint
                  icon={<Users size={14} />}
                  text="Human-reviewed"
                />

                <TrustPoint
                  icon={<ShieldCheck size={14} />}
                  text="Structured workflow"
                />

              </div>

            </div>

            <div className="relative z-10 mx-auto w-full max-w-[600px]">

              <div className="absolute -right-5 -top-5 h-[88%] w-[82%] bg-[#EAE5F9]/50" />

              <div className="absolute -bottom-5 -left-5 h-[82%] w-[78%] bg-[#CFDEFC]/45" />

              <div className="group relative overflow-hidden border border-[#D5DBE4] bg-white shadow-[0_32px_80px_rgba(27,37,58,0.14)] transition duration-500 hover:-translate-y-2 hover:shadow-[0_40px_95px_rgba(27,37,58,0.18)]">

                <div className="flex items-center justify-between border-b border-[#E4E7EC] bg-[#FAFBFC] px-5 py-4">

                  <div className="flex items-center gap-3">

                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#EAE5F9] text-[#5658E8]">
                      <BrainCircuit size={18} />
                    </div>

                    <div>

                      <p className="text-[11px] font-semibold text-[#202938]">
                        Evalyn Screening
                      </p>

                      <p className="text-[8px] text-[#98A2B3]">
                        AI-powered screening platform
                      </p>

                    </div>

                  </div>

                  <div className="flex items-center gap-1.5 rounded-full bg-[#EAF7F0] px-2.5 py-1">

                    <span className="h-1.5 w-1.5 rounded-full bg-[#35A66D]" />

                    <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-[#28734E]">
                      Active
                    </span>

                  </div>

                </div>

                <div className="p-5 sm:p-6">

                  <div className="flex items-start justify-between gap-4">

                    <div>

                      <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-[#98A2B3]">
                        SCREENING OVERVIEW
                      </p>

                      <h3 className="mt-2 text-[21px] font-semibold tracking-[-0.03em] text-[#111827]">
                        Smart screening, structured workflow.
                      </h3>

                      <p className="mt-1 max-w-md text-[9px] leading-5 text-[#7C8794]">
                        Bring role requirements, AI assistance and recruiter
                        review together in one screening journey.
                      </p>

                    </div>

                    <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-[#CFDEFC] text-[#4A61C8]">
                      <Target size={18} />
                    </div>

                  </div>

                  <div className="mt-6 grid grid-cols-3 gap-2.5">

                    <HeroStat
                      label="Roles"
                      value="12"
                      background="#CFDEFC"
                      color="#4A61C8"
                    />

                    <HeroStat
                      label="Skills"
                      value="48"
                      background="#EAE5F9"
                      color="#7862C8"
                    />

                    <HeroStat
                      label="Questions"
                      value="96"
                      background="#F3E3F2"
                      color="#AA5E9C"
                    />

                  </div>

                  <div className="mt-5 overflow-hidden border border-[#E0E4EA] bg-white">

                    <div className="flex items-center justify-between border-b border-[#E7E9ED] px-4 py-3">

                      <div>

                        <p className="text-[10px] font-semibold text-[#344054]">
                          Screening pipeline
                        </p>

                        <p className="mt-0.5 text-[8px] text-[#98A2B3]">
                          From requirements to assessment
                        </p>

                      </div>

                      <span className="text-[8px] font-semibold text-[#5658E8]">
                        3 / 4 complete
                      </span>

                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2">

                      <HeroPipelineStage
                        number="01"
                        title="Role"
                        subtitle="Requirements"
                        icon={<BriefcaseBusiness size={16} />}
                        background="#CFDEFC"
                        color="#4A61C8"
                        complete
                      />

                      <HeroPipelineStage
                        number="02"
                        title="AI"
                        subtitle="Skill analysis"
                        icon={<Sparkles size={16} />}
                        background="#EAE5F9"
                        color="#7862C8"
                        complete
                      />

                      <HeroPipelineStage
                        number="03"
                        title="Prepare"
                        subtitle="Questions"
                        icon={<FileQuestion size={16} />}
                        background="#F3E3F2"
                        color="#AA5E9C"
                        complete
                      />

                      <HeroPipelineStage
                        number="04"
                        title="Review"
                        subtitle="Recruiter approval"
                        icon={<Users size={16} />}
                        background="#FAEDEA"
                        color="#A76D5B"
                      />

                    </div>

                  </div>

                  <div className="mt-5 flex items-center justify-between border border-[#E2E6EB] bg-[#FAFBFC] px-4 py-3">

                    <div className="flex items-center gap-3">

                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FFE6DB] text-[#A76D5B]">
                        <ShieldCheck size={15} />
                      </div>

                      <div>

                        <p className="text-[9px] font-semibold text-[#344054]">
                          Human-in-the-loop
                        </p>

                        <p className="mt-0.5 text-[8px] text-[#98A2B3]">
                          Recruiter controls final progression
                        </p>

                      </div>

                    </div>

                    <ChevronRight
                      size={14}
                      className="text-[#98A2B3]"
                    />

                  </div>

                </div>
              </div>

              <div className="absolute -right-4 top-[24%] hidden border border-[#D7DDE6] bg-white px-3.5 py-3 shadow-[0_14px_32px_rgba(20,30,50,0.10)] sm:block">

                <div className="flex items-center gap-2.5">

                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#D4C6F8] text-[#7862C8]">
                    <Sparkles size={14} />
                  </div>

                  <div>

                    <p className="text-[9px] font-bold text-[#273244]">
                      AI assistance
                    </p>

                    <p className="mt-0.5 text-[8px] text-[#98A2B3]">
                      Processing screening data
                    </p>

                  </div>

                </div>

              </div>

              <div className="absolute -bottom-5 -left-5 hidden border border-[#D7DDE6] bg-white px-3.5 py-3 shadow-[0_16px_34px_rgba(20,30,50,0.12)] sm:block">

                <div className="flex items-center gap-2.5">

                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FFD8C7] text-[#A76D5B]">
                    <Users size={14} />
                  </div>

                  <div>

                    <p className="text-[9px] font-bold text-[#273244]">
                      Human review
                    </p>

                    <p className="mt-0.5 text-[8px] text-[#98A2B3]">
                      Recruiter approval
                    </p>

                  </div>

                </div>

              </div>

            </div>

          </div>
        </section>

        {/* =====================================================
            VALUE STRIP
        ===================================================== */}
        <section className="border-b border-[#E2E5E9] bg-white">

          <div className="mx-auto grid max-w-[1280px] grid-cols-1 md:grid-cols-3">

            <ValueBlock
              icon={<Target size={20} />}
              eyebrow="01 / ROLE INTELLIGENCE"
              title="Start with the role"
              text="Turn job requirements into structured screening requirements."
              background="#CFDEFC"
              iconColor="#4A61C8"
              hoverBackground="#B9C9FF"
            />

            <ValueBlock
              icon={<WandSparkles size={20} />}
              eyebrow="02 / AI ASSISTANCE"
              title="Automate repetitive work"
              text="Use AI assistance for skill and question preparation."
              background="#EAE5F9"
              iconColor="#7862C8"
              hoverBackground="#DCCFF5"
            />

            <ValueBlock
              icon={<Users size={20} />}
              eyebrow="03 / HUMAN CONTROL"
              title="Keep recruiters in control"
              text="Review, refine and approve what moves into assessment."
              background="#F3E3F2"
              iconColor="#AA5E9C"
              hoverBackground="#EBC9E5"
            />

          </div>
        </section>

        {/* =====================================================
            HOW IT WORKS
        ===================================================== */}
        <section
          id="how-it-works"
          className="relative overflow-hidden bg-[#F8F9FC] py-24 sm:py-28"
        >

          <div className="pointer-events-none absolute -left-24 top-32 h-80 w-80 rounded-full bg-[#9FB1FE]/20 blur-[110px]" />

          <div className="pointer-events-none absolute -right-24 bottom-10 h-80 w-80 rounded-full bg-[#FFD8C7]/25 blur-[110px]" />

          <div
            className="pointer-events-none absolute inset-0 opacity-[0.16]"
            style={{
              backgroundImage:
                "linear-gradient(#DDE1E7 1px, transparent 1px), linear-gradient(90deg, #DDE1E7 1px, transparent 1px)",
              backgroundSize: "64px 64px",
            }}
          />

          <div className="relative mx-auto max-w-[1280px] px-5 sm:px-8">

            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#5658E8]">
              HOW IT WORKS
            </p>

            <h2 className="mt-5 max-w-4xl text-[42px] font-medium leading-[1.04] tracking-[-0.04em] text-[#111827] sm:text-[58px]">

              From job description

              <span className="text-[#5658E8]">
                {" "}to assessment.
              </span>

            </h2>

            <p className="mt-6 max-w-2xl text-base leading-8 text-[#667085]">
              Hover over a stage to see the workflow come together.
            </p>

            <div className="mt-14 overflow-hidden rounded-[16px] border border-[#DDE1E6] bg-white shadow-[0_20px_50px_rgba(24,34,52,0.06)]">

              <WorkflowStageRow
                number="01"
                label="Role"
                title="Define the job"
                description="Create the role and establish the requirements that drive the screening process."
                leftColor="#9FB1FE"
                rightColor="#CFDEFC"
                hoverColor="#9FB1FE"
                icon={<BriefcaseBusiness size={21} />}
                active
              />

              <WorkflowStageRow
                number="02"
                label="Screen"
                title="Extract skills"
                description="Identify the relevant skills from the role using AI-assisted processing."
                leftColor="#D4C6F8"
                rightColor="#EAE5F9"
                hoverColor="#D4C6F8"
                icon={<Sparkles size={21} />}
              />

              <WorkflowStageRow
                number="03"
                label="Prepare"
                title="Prepare questions"
                description="Build structured, role-specific questions aligned with the selected skills."
                leftColor="#EDBFE5"
                rightColor="#F3E3F2"
                hoverColor="#EDBFE5"
                icon={<FileQuestion size={21} />}
              />

              <WorkflowStageRow
                number="04"
                label="Review"
                title="Human review"
                description="Recruiters review and refine the content before it moves into assessment."
                leftColor="#FFD8C7"
                rightColor="#FAEDEA"
                hoverColor="#FFD8C7"
                icon={<Users size={21} />}
              />

              <WorkflowStageRow
                number="05"
                label="Assess"
                title="Candidate assessment"
                description="Approved screening content becomes part of the candidate assessment workflow."
                leftColor="#FFE6DB"
                rightColor="#FAF2F0"
                hoverColor="#FFE6DB"
                icon={<ShieldCheck size={21} />}
                last
              />

            </div>

          </div>
        </section>

        {/* =====================================================
            FEATURES
        ===================================================== */}
        <section
          id="features"
          className="relative overflow-hidden bg-white py-24 sm:py-28"
        >

          <div className="pointer-events-none absolute right-[-140px] top-[-80px] h-80 w-80 rounded-full bg-[#D4C6F8]/20 blur-[110px]" />

          <div className="pointer-events-none absolute left-[-120px] bottom-[-100px] h-80 w-80 rounded-full bg-[#CFDEFC]/20 blur-[110px]" />

          <div className="relative mx-auto max-w-[1280px] px-5 sm:px-8">

            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#5658E8]">
              FEATURES
            </p>

            <h2 className="mt-5 max-w-4xl text-[42px] font-medium leading-[1.04] tracking-[-0.04em] text-[#111827] sm:text-[58px]">

              Built around the way

              <span className="text-[#5658E8]">
                {" "}screening actually works.
              </span>

            </h2>

            <p className="mt-6 max-w-2xl text-base leading-8 text-[#667085]">
              Each capability supports a distinct part of the screening journey.
            </p>

            <div className="mt-14 grid grid-cols-1 overflow-hidden rounded-[16px] border border-[#DCE0E5] bg-white lg:grid-cols-3">

              <FeatureCard
                icon={<BrainCircuit size={22} />}
                title="AI-assisted"
                description="Accelerate repetitive preparation while keeping the workflow transparent."
                points={[
                  "Skill extraction",
                  "Role-aware assistance",
                  "Question preparation",
                ]}
                background="#CFDEFC"
                iconColor="#4A61C8"
              />

              <FeatureCard
                icon={<ShieldCheck size={22} />}
                title="Human-reviewed"
                description="Keep recruiters in control of important screening handoffs."
                points={[
                  "Recruiter approval",
                  "Visible handoffs",
                  "Controlled progression",
                ]}
                background="#EAE5F9"
                iconColor="#7862C8"
              />

              <FeatureCard
                icon={<Target size={22} />}
                title="Role-specific"
                description="Keep every screening decision aligned with the role requirements."
                points={[
                  "Relevant skills",
                  "Structured questions",
                  "Assessment-ready content",
                ]}
                background="#F3E3F2"
                iconColor="#AA5E9C"
              />

            </div>

          </div>
        </section>

        {/* =====================================================
            WHY EVALYN
        ===================================================== */}
        <section
          id="why-evalyn"
          className="relative overflow-hidden bg-[#F8F9FC] py-24 sm:py-28"
        >

          <div className="pointer-events-none absolute left-[-120px] top-10 h-80 w-80 rounded-full bg-[#EDBFE5]/25 blur-[110px]" />

          <div className="pointer-events-none absolute right-[-120px] bottom-0 h-80 w-80 rounded-full bg-[#9FB1FE]/25 blur-[110px]" />

          <div className="relative mx-auto max-w-[1280px] px-5 sm:px-8">

            <div className="grid grid-cols-1 gap-14 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">

              <div>

                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#5658E8]">
                  WHY EVALYN
                </p>

                <h2 className="mt-5 max-w-xl text-[42px] font-medium leading-[1.05] tracking-[-0.04em] text-[#111827] sm:text-[54px]">

                  AI assistance without losing

                  <span className="text-[#5658E8]">
                    {" "}human control.
                  </span>

                </h2>

                <p className="mt-6 max-w-xl text-base leading-8 text-[#667085]">
                  Evalyn accelerates repetitive screening work while keeping
                  recruiters responsible for the final content and progression.
                </p>

                <button
                  type="button"
                  onClick={() => navigate("/login")}
                  className="group mt-8 inline-flex items-center gap-2 rounded-md bg-[#5658E8] px-5 py-3.5 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(86,88,232,0.18)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#494BD8]"
                >
                  Explore Evalyn

                  <ArrowRight
                    size={15}
                    className="transition-transform duration-200 group-hover:translate-x-1"
                  />
                </button>

              </div>

              <div className="overflow-hidden rounded-[16px] border border-[#DCE0E5] bg-white shadow-[0_20px_45px_rgba(24,34,52,0.06)]">

                <PrincipleCard
                  number="01"
                  icon={<BriefcaseBusiness size={19} />}
                  title="Role-aware"
                  text="Start from the actual requirements of the role."
                  background="#CFDEFC"
                  iconColor="#4A61C8"
                />

                <PrincipleCard
                  number="02"
                  icon={<Sparkles size={19} />}
                  title="AI-assisted"
                  text="Automate repetitive preparation work."
                  background="#EAE5F9"
                  iconColor="#7862C8"
                />

                <PrincipleCard
                  number="03"
                  icon={<Users size={19} />}
                  title="Human-led"
                  text="Keep recruiters involved at critical handoffs."
                  background="#F3E3F2"
                  iconColor="#AA5E9C"
                />

                <PrincipleCard
                  number="04"
                  icon={<ShieldCheck size={19} />}
                  title="Structured"
                  text="Move through a clear screening process."
                  background="#FAEDEA"
                  iconColor="#B97967"
                  last
                />

              </div>

            </div>

          </div>
        </section>

        {/* =====================================================
            RECRUITER WORKFLOW
        ===================================================== */}
        <section className="relative overflow-hidden bg-white py-24 sm:py-28">

          <div className="pointer-events-none absolute left-[-120px] top-20 h-80 w-80 rounded-full bg-[#CFDEFC]/30 blur-[120px]" />

          <div className="pointer-events-none absolute right-[-120px] bottom-20 h-80 w-80 rounded-full bg-[#EAE5F9]/30 blur-[120px]" />

          <div className="relative mx-auto max-w-[1280px] px-5 sm:px-8">

            <div className="grid grid-cols-1 gap-14 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">

              <div>

                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#5658E8]">
                  FOR RECRUITERS
                </p>

                <h2 className="mt-5 max-w-xl text-[42px] font-medium leading-[1.05] tracking-[-0.04em] text-[#111827] sm:text-[54px]">

                  Less repetitive work.

                  <br />

                  <span className="text-[#5658E8]">
                    More control.
                  </span>

                </h2>

                <p className="mt-6 max-w-xl text-base leading-8 text-[#667085]">
                  Evalyn gives recruiters a structured path from job creation
                  to candidate assessment, while keeping important decisions
                  inside the recruiter workflow.
                </p>

                <div className="mt-8">

                  <button
                    type="button"
                    onClick={() => navigate("/login")}
                    className="group inline-flex items-center gap-2 rounded-md border border-[#B9C2CD] bg-white px-5 py-3.5 text-sm font-semibold text-[#202733] transition hover:-translate-y-0.5 hover:border-[#5658E8]"
                  >
                    Start building

                    <ArrowRight
                      size={15}
                      className="transition-transform duration-200 group-hover:translate-x-1"
                    />

                  </button>

                </div>

              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

                <RecruiterStep
                  number="01"
                  title="Create the role"
                  text="Define the job and establish the requirements."
                  icon={<BriefcaseBusiness size={18} />}
                  background="#CFDEFC"
                  color="#4A61C8"
                />

                <RecruiterStep
                  number="02"
                  title="Review skills"
                  text="Use AI assistance to identify role-specific skills."
                  icon={<Sparkles size={18} />}
                  background="#EAE5F9"
                  color="#7862C8"
                />

                <RecruiterStep
                  number="03"
                  title="Prepare questions"
                  text="Build structured screening questions for the role."
                  icon={<FileQuestion size={18} />}
                  background="#F3E3F2"
                  color="#AA5E9C"
                />

                <RecruiterStep
                  number="04"
                  title="Approve content"
                  text="Review the final screening content before assessment."
                  icon={<ShieldCheck size={18} />}
                  background="#FAEDEA"
                  color="#A76D5B"
                />

              </div>

            </div>

          </div>
        </section>

        {/* =====================================================
            CANDIDATE EXPERIENCE
        ===================================================== */}
        <section className="relative overflow-hidden bg-[#F8F9FC] py-24 sm:py-28">

          <div className="pointer-events-none absolute right-[-120px] top-10 h-80 w-80 rounded-full bg-[#EDBFE5]/30 blur-[120px]" />

          <div className="pointer-events-none absolute left-[-120px] bottom-0 h-80 w-80 rounded-full bg-[#FFD8C7]/30 blur-[120px]" />

          <div className="relative mx-auto max-w-[1280px] px-5 sm:px-8">

            <div className="grid grid-cols-1 gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">

              <div className="relative order-2 lg:order-1">

                <div className="absolute -left-5 -top-5 h-full w-[92%] bg-[#F3E3F2]/55" />

                <div className="absolute -bottom-5 -right-5 h-[88%] w-[88%] bg-[#FAEDEA]/55" />

                <div className="relative border border-[#D9DEE6] bg-white p-4 shadow-[0_24px_60px_rgba(24,34,52,0.08)]">

                  <div className="border border-[#E3E6EB]">

                    <div className="flex items-center justify-between border-b border-[#E7E9ED] bg-[#FCFCFD] px-5 py-4">

                      <div>

                        <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#98A2B3]">
                          CANDIDATE ASSESSMENT
                        </p>

                        <p className="mt-1 text-[13px] font-semibold text-[#202938]">
                          Screening assessment
                        </p>

                      </div>

                      <span className="rounded-full bg-[#EAF7F0] px-2.5 py-1 text-[8px] font-bold text-[#28734E]">
                        In progress
                      </span>

                    </div>

                    <div className="p-5">

                      <div className="flex items-center justify-between">

                        <div>

                          <p className="text-[9px] text-[#98A2B3]">
                            Progress
                          </p>

                          <p className="mt-1 text-[24px] font-semibold text-[#111827]">
                            18 / 24
                          </p>

                        </div>

                        <div className="flex h-16 w-16 items-center justify-center rounded-full border-[7px] border-[#CFDEFC] text-[11px] font-bold text-[#4A61C8]">
                          75%
                        </div>

                      </div>

                      <div className="mt-5 h-2 overflow-hidden bg-[#EEF0F3]">

                        <div className="h-full w-[75%] bg-[#7D91E8]" />

                      </div>

                      <div className="mt-7 space-y-3">

                        <CandidateFeature
                          icon={<Check size={13} />}
                          title="Role-specific questions"
                          text="Questions aligned with the assessment."
                          background="#CFDEFC"
                          color="#4A61C8"
                        />

                        <CandidateFeature
                          icon={<Clock3 size={13} />}
                          title="Question-level timing"
                          text="Track time spent throughout the assessment."
                          background="#EAE5F9"
                          color="#7862C8"
                        />

                        <CandidateFeature
                          icon={<ShieldCheck size={13} />}
                          title="Structured experience"
                          text="A clear and consistent candidate journey."
                          background="#F3E3F2"
                          color="#AA5E9C"
                        />

                      </div>

                    </div>

                  </div>

                </div>

              </div>

              <div className="order-1 lg:order-2">

                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#AA5E9C]">
                  FOR CANDIDATES
                </p>

                <h2 className="mt-5 max-w-xl text-[42px] font-medium leading-[1.05] tracking-[-0.04em] text-[#111827] sm:text-[54px]">

                  A clearer assessment

                  <span className="text-[#AA5E9C]">
                    {" "}experience.
                  </span>

                </h2>

                <p className="mt-6 max-w-xl text-base leading-8 text-[#667085]">
                  Candidates move through a structured assessment built around
                  the requirements of the role, with a consistent workflow
                  from start to completion.
                </p>

                <div className="mt-8 space-y-4">

                  <CandidatePoint
                    icon={<Target size={17} />}
                    title="Role-aligned screening"
                    text="Assess skills that actually matter for the role."
                    background="#CFDEFC"
                    color="#4A61C8"
                  />

                  <CandidatePoint
                    icon={<Clock3 size={17} />}
                    title="Clear progress"
                    text="Understand where you are in the assessment."
                    background="#EAE5F9"
                    color="#7862C8"
                  />

                  <CandidatePoint
                    icon={<ShieldCheck size={17} />}
                    title="Structured process"
                    text="Complete a consistent, organized screening journey."
                    background="#F3E3F2"
                    color="#AA5E9C"
                  />

                </div>

              </div>

            </div>

          </div>
        </section>

        {/* =====================================================
            CONTROL & TRANSPARENCY
        ===================================================== */}
        <section className="relative overflow-hidden bg-white py-24 sm:py-28">

          <div className="pointer-events-none absolute left-[30%] top-[-100px] h-72 w-72 rounded-full bg-[#CFDEFC]/25 blur-[110px]" />

          <div className="pointer-events-none absolute right-[-100px] bottom-[-100px] h-80 w-80 rounded-full bg-[#FFE6DB]/30 blur-[110px]" />

          <div className="relative mx-auto max-w-[1280px] px-5 sm:px-8">

            <div className="text-center">

              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#5658E8]">
                CONTROL & TRANSPARENCY
              </p>

              <h2 className="mx-auto mt-5 max-w-4xl text-[42px] font-medium leading-[1.05] tracking-[-0.04em] text-[#111827] sm:text-[56px]">

                Intelligent assistance.

                <span className="text-[#5658E8]">
                  {" "}Visible control.
                </span>

              </h2>

              <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-[#667085]">
                Automation supports the workflow, while recruiters remain
                responsible for review and progression.
              </p>

            </div>

            <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3">

              <ControlCard
                icon={<Users size={21} />}
                title="Human review"
                text="AI-assisted outputs stay inside a recruiter-controlled workflow before they reach assessment."
                background="#CFDEFC"
                color="#4A61C8"
                tag="REVIEW"
              />

              <ControlCard
                icon={<Clock3 size={21} />}
                title="Timing signals"
                text="Capture question-level timing to give recruiters additional assessment context."
                background="#EAE5F9"
                color="#7862C8"
                tag="SIGNALS"
              />

              <ControlCard
                icon={<MonitorCheck size={21} />}
                title="Integrity signals"
                text="Track basic interaction signals such as tab switches and fullscreen exits."
                background="#F3E3F2"
                color="#AA5E9C"
                tag="VISIBILITY"
              />

            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">

              <SignalCard
                icon={<MousePointer2 size={18} />}
                title="Interaction visibility"
                text="Basic interaction patterns can provide additional context around an assessment attempt."
                background="#FAEDEA"
                color="#A76D5B"
              />

              <SignalCard
                icon={<ShieldCheck size={18} />}
                title="Structured progression"
                text="The screening workflow makes important handoffs visible instead of hiding them behind automation."
                background="#FAF2F0"
                color="#9D7568"
              />

            </div>

          </div>
        </section>

        {/* =====================================================
            PALETTE STRIP
        ===================================================== */}
        <section className="relative overflow-hidden border-y border-[#E2E5EA] bg-white">

          <div className="mx-auto max-w-[1280px] px-5 py-12 sm:px-8">

            <p className="mb-5 text-center text-[9px] font-bold uppercase tracking-[0.2em] text-[#98A2B3]">
              THE EVALYN WORKFLOW
            </p>

            <div className="grid grid-cols-1 overflow-hidden rounded-[14px] sm:grid-cols-5">

              <PaletteBlock
                label="ROLE"
                background="#CFDEFC"
                color="#4A61C8"
              />

              <PaletteBlock
                label="SCREEN"
                background="#EAE5F9"
                color="#7862C8"
              />

              <PaletteBlock
                label="PREPARE"
                background="#F3E3F2"
                color="#AA5E9C"
              />

              <PaletteBlock
                label="REVIEW"
                background="#FAEDEA"
                color="#A76D5B"
              />

              <PaletteBlock
                label="ASSESS"
                background="#FAF2F0"
                color="#9D7568"
              />

            </div>

          </div>
        </section>

      </main>

      {/* =====================================================
          FOOTER
      ===================================================== */}
      <footer className="border-t border-[#3B3D63] bg-[#26284F]">

        <div className="mx-auto max-w-[1280px] px-5 py-9 sm:px-8">

          <div className="flex flex-col gap-7 sm:flex-row sm:items-center sm:justify-between">

            <div className="flex items-center gap-4">

              <LogoCrop backgroundColor="#26284F" />

              <div className="hidden h-6 w-px bg-[#484B78] sm:block" />

              <div>

                <p className="text-xs font-semibold text-white">
                  Evalyn
                </p>

                <p className="mt-0.5 text-[10px] text-[#B9BCE0]">
                  AI Screening Platform
                </p>

              </div>

            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">

              <a
                href="#how-it-works"
                className="text-[11px] text-[#C2C5E0] transition hover:text-white"
              >
                How it works
              </a>

              <a
                href="#features"
                className="text-[11px] text-[#C2C5E0] transition hover:text-white"
              >
                Features
              </a>

              <a
                href="#why-evalyn"
                className="text-[11px] text-[#C2C5E0] transition hover:text-white"
              >
                Why Evalyn
              </a>

            </div>

          </div>

          <div className="mt-7 border-t border-[#3B3D63] pt-5">

            <p className="text-[10px] text-[#A8ACD0]">
              © 2026 Evalyn. All rights reserved.
            </p>

          </div>

        </div>
      </footer>

    </div>
  );
}

/* ============================================================
   LOGO CROP
============================================================ */

function LogoCrop({
  backgroundColor = "#26284F",
}) {
  return (
    <div
      className="relative h-10 w-[154px] shrink-0 overflow-hidden"
      style={{
        backgroundColor,
      }}
      aria-hidden="true"
    >
      <img
        src={evalynLogo}
        alt="Evalyn"
        className="absolute left-[-49px] top-[-23px] max-w-none object-contain"
        style={{
          width: "246px",
          clipPath: "inset(10% 5% 12% 5%)",
        }}
      />
    </div>
  );
}

/* ============================================================
   HERO STAT
============================================================ */

function HeroStat({
  label,
  value,
  background,
  color,
}) {
  return (
    <div
      className="border border-white px-3 py-3"
      style={{
        backgroundColor: background,
      }}
    >
      <p
        className="text-[8px] font-bold uppercase tracking-[0.12em]"
        style={{
          color,
        }}
      >
        {label}
      </p>

      <p className="mt-1 text-[19px] font-semibold text-[#202938]">
        {value}
      </p>
    </div>
  );
}

/* ============================================================
   HERO PIPELINE STAGE
============================================================ */

function HeroPipelineStage({
  number,
  title,
  subtitle,
  icon,
  background,
  color,
  complete = false,
}) {
  return (
    <div className="group flex items-center gap-3 border-b border-r border-[#E7E9ED] px-4 py-4 transition duration-200 hover:bg-[#FAFBFC]">

      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition duration-200 group-hover:scale-105"
        style={{
          backgroundColor: background,
          color,
        }}
      >
        {complete ? <Check size={12} /> : icon}
      </div>

      <div className="min-w-0 flex-1">

        <div className="flex items-center gap-2">

          <span className="text-[8px] font-bold text-[#98A2B3]">
            {number}
          </span>

          <p className="text-[10px] font-semibold text-[#344054]">
            {title}
          </p>

        </div>

        <p className="mt-0.5 text-[8px] text-[#98A2B3]">
          {subtitle}
        </p>

      </div>

      {complete && (
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{
            backgroundColor: color,
          }}
        />
      )}

    </div>
  );
}

/* ============================================================
   TRUST POINT
============================================================ */

function TrustPoint({
  icon,
  text,
}) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-semibold text-[#667085]">

      <span className="text-[#5658E8]">
        {icon}
      </span>

      {text}

    </div>
  );
}

/* ============================================================
   VALUE BLOCK
============================================================ */

function ValueBlock({
  icon,
  eyebrow,
  title,
  text,
  background,
  iconColor,
  hoverBackground,
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="group border-b border-[#E5E7EB] p-8 transition-all duration-300 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"
      style={{
        backgroundColor: isHovered
          ? hoverBackground
          : "#FFFFFF",
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >

      <div
        className="flex h-12 w-12 items-center justify-center rounded-lg transition duration-300 group-hover:scale-105"
        style={{
          backgroundColor: background,
          color: iconColor,
        }}
      >
        {icon}
      </div>

      <p className="mt-5 text-[9px] font-bold uppercase tracking-[0.18em] text-[#7E8997]">
        {eyebrow}
      </p>

      <h3 className="mt-2 text-[19px] font-semibold text-[#202938]">
        {title}
      </h3>

      <p className="mt-3 max-w-md text-xs font-medium leading-6 text-[#667085]">
        {text}
      </p>

      <div
        className={`mt-5 flex items-center gap-1 text-[10px] font-semibold transition-all duration-300 ${
          isHovered
            ? "translate-x-1 text-[#5658E8]"
            : "text-[#98A2B3]"
        }`}
      >
        Learn more

        <ArrowRight size={11} />
      </div>

    </div>
  );
}

/* ============================================================
   WORKFLOW STAGE ROW
============================================================ */

function WorkflowStageRow({
  number,
  label,
  title,
  description,
  leftColor,
  rightColor,
  hoverColor,
  icon,
  active = false,
  last = false,
}) {
  const [isHovered, setIsHovered] = useState(false);

  const currentBackground = isHovered
    ? hoverColor
    : rightColor;

  const currentLeftBackground = isHovered
    ? hoverColor
    : leftColor;

  return (
    <div
      className={`relative grid grid-cols-1 transition-all duration-300 sm:grid-cols-[155px_1fr] ${
        !last
          ? "border-b border-white"
          : ""
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >

      <div
        className="relative flex min-h-[125px] items-center justify-center px-5 py-7 transition-all duration-300 sm:min-h-[155px]"
        style={{
          backgroundColor: currentLeftBackground,
        }}
      >

        <div
          className={`text-center transition-transform duration-300 ${
            isHovered
              ? "scale-110"
              : "scale-100"
          }`}
        >

          <div className="mx-auto flex h-10 w-10 items-center justify-center text-[#172033]">
            {icon}
          </div>

          <p
            className={`mt-3 text-[11px] text-[#172033] transition-all duration-300 ${
              active || isHovered
                ? "font-bold"
                : "font-semibold"
            }`}
          >
            {label}
          </p>

        </div>

        <span
          className="absolute -bottom-[9px] left-1/2 hidden h-[18px] w-[18px] -translate-x-1/2 rotate-45 transition-all duration-300 sm:block"
          style={{
            backgroundColor: currentLeftBackground,
          }}
        />

      </div>

      <div
        className="flex min-h-[125px] items-center px-6 py-7 transition-all duration-300 sm:min-h-[155px] sm:px-9"
        style={{
          backgroundColor: currentBackground,
        }}
      >

        <div
          className={`max-w-3xl transition-all duration-300 ${
            isHovered
              ? "translate-x-2"
              : "translate-x-0"
          }`}
        >

          <div className="flex items-center gap-3">

            <span
              className={`text-[9px] font-bold transition-colors duration-300 ${
                isHovered
                  ? "text-[#172033]"
                  : "text-[#697586]"
              }`}
            >
              {number}
            </span>

            <h3 className="text-base font-bold text-[#172033] sm:text-[19px]">
              {title}
            </h3>

          </div>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#596676]">
            {description}
          </p>

          <div
            className={`mt-4 flex items-center gap-1 text-[10px] font-semibold transition-all duration-300 ${
              isHovered
                ? "translate-x-1 text-[#172033]"
                : "text-[#2563EB]"
            }`}
          >
            Explore stage

            <ChevronRight
              size={12}
              className="transition-transform duration-300"
              style={{
                transform: isHovered
                  ? "translateX(4px)"
                  : "translateX(0)",
              }}
            />

          </div>

        </div>

      </div>

    </div>
  );
}

/* ============================================================
   FEATURE CARD
============================================================ */

function FeatureCard({
  icon,
  title,
  description,
  points,
  background,
  iconColor,
}) {
  return (
    <div className="group relative border-b border-[#DCE0E5] p-8 transition-all duration-300 last:border-b-0 hover:bg-[#FAFAFC] md:border-b-0 md:border-r md:last:border-r-0">

      <div
        className="flex h-12 w-12 items-center justify-center rounded-lg transition-all duration-300 group-hover:scale-110"
        style={{
          backgroundColor: background,
          color: iconColor,
        }}
      >
        {icon}
      </div>

      <h3 className="mt-7 text-[21px] font-semibold text-[#202938]">
        {title}
      </h3>

      <p className="mt-3 text-sm leading-7 text-[#667085]">
        {description}
      </p>

      <div className="mt-7 space-y-3">

        {points.map((point) => (
          <div
            key={point}
            className="flex items-center gap-3 text-xs font-semibold text-[#475467]"
          >

            <span
              className="flex h-6 w-6 items-center justify-center rounded-full"
              style={{
                backgroundColor: background,
                color: iconColor,
              }}
            >
              <Check size={11} />
            </span>

            {point}

          </div>
        ))}

      </div>

      <div className="mt-8 flex items-center gap-1 text-[11px] font-semibold text-[#5658E8]">

        Explore feature

        <ArrowRight
          size={12}
          className="transition-transform duration-200 group-hover:translate-x-1"
        />

      </div>

    </div>
  );
}

/* ============================================================
   PRINCIPLE CARD
============================================================ */

function PrincipleCard({
  number,
  icon,
  title,
  text,
  background,
  iconColor,
  last = false,
}) {
  return (
    <div
      className={`group p-7 transition-all duration-300 hover:bg-[#FAFAFC] ${
        !last
          ? "border-b border-[#DCE0E5]"
          : ""
      }`}
    >

      <div className="flex items-start justify-between">

        <div
          className="flex h-11 w-11 items-center justify-center rounded-lg transition duration-300 group-hover:scale-105"
          style={{
            backgroundColor: background,
            color: iconColor,
          }}
        >
          {icon}
        </div>

        <span className="text-[10px] font-bold text-[#98A2B3]">
          {number}
        </span>

      </div>

      <h3 className="mt-6 text-base font-semibold text-[#202938]">
        {title}
      </h3>

      <p className="mt-2 max-w-md text-xs leading-6 text-[#667085]">
        {text}
      </p>

    </div>
  );
}

/* ============================================================
   RECRUITER STEP
============================================================ */

function RecruiterStep({
  number,
  title,
  text,
  icon,
  background,
  color,
}) {
  return (
    <div className="group border border-[#DCE0E5] bg-white p-6 transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_38px_rgba(24,34,52,0.08)]">

      <div className="flex items-start justify-between">

        <div
          className="flex h-11 w-11 items-center justify-center rounded-lg transition duration-300 group-hover:scale-105"
          style={{
            backgroundColor: background,
            color,
          }}
        >
          {icon}
        </div>

        <span className="text-[10px] font-bold text-[#98A2B3]">
          {number}
        </span>

      </div>

      <h3 className="mt-6 text-[18px] font-semibold text-[#202938]">
        {title}
      </h3>

      <p className="mt-2 text-sm leading-6 text-[#667085]">
        {text}
      </p>

      <div
        className="mt-6 h-px w-10 transition-all duration-300 group-hover:w-16"
        style={{
          backgroundColor: color,
        }}
      />

    </div>
  );
}

/* ============================================================
   CANDIDATE FEATURE
============================================================ */

function CandidateFeature({
  icon,
  title,
  text,
  background,
  color,
}) {
  return (
    <div className="flex items-center gap-3">

      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{
          backgroundColor: background,
          color,
        }}
      >
        {icon}
      </div>

      <div>

        <p className="text-[10px] font-semibold text-[#344054]">
          {title}
        </p>

        <p className="mt-0.5 text-[8px] leading-4 text-[#98A2B3]">
          {text}
        </p>

      </div>

    </div>
  );
}

/* ============================================================
   CANDIDATE POINT
============================================================ */

function CandidatePoint({
  icon,
  title,
  text,
  background,
  color,
}) {
  return (
    <div className="group flex items-start gap-4">

      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition duration-200 group-hover:scale-105"
        style={{
          backgroundColor: background,
          color,
        }}
      >
        {icon}
      </div>

      <div>

        <p className="text-sm font-semibold text-[#202938]">
          {title}
        </p>

        <p className="mt-1 text-xs leading-6 text-[#667085]">
          {text}
        </p>

      </div>

    </div>
  );
}

/* ============================================================
   CONTROL CARD
============================================================ */

function ControlCard({
  icon,
  title,
  text,
  background,
  color,
  tag,
}) {
  return (
    <div className="group relative overflow-hidden border border-[#DCE0E5] bg-white p-7 transition duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(24,34,52,0.08)]">

      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{
          backgroundColor: color,
        }}
      />

      <div className="flex items-start justify-between">

        <div
          className="flex h-11 w-11 items-center justify-center rounded-lg transition duration-300 group-hover:scale-105"
          style={{
            backgroundColor: background,
            color,
          }}
        >
          {icon}
        </div>

        <span
          className="text-[8px] font-bold tracking-[0.16em]"
          style={{
            color,
          }}
        >
          {tag}
        </span>

      </div>

      <h3 className="mt-7 text-[19px] font-semibold text-[#202938]">
        {title}
      </h3>

      <p className="mt-3 text-sm leading-7 text-[#667085]">
        {text}
      </p>

      <div className="mt-7 flex items-center gap-1 text-[10px] font-semibold text-[#5658E8]">

        Learn more

        <ChevronRight
          size={12}
          className="transition-transform duration-200 group-hover:translate-x-1"
        />

      </div>

    </div>
  );
}

/* ============================================================
   SIGNAL CARD
============================================================ */

function SignalCard({
  icon,
  title,
  text,
  background,
  color,
}) {
  return (
    <div className="group flex items-start gap-4 border border-[#E0E4E9] bg-[#FBFCFD] p-6 transition duration-300 hover:bg-white hover:shadow-[0_14px_32px_rgba(24,34,52,0.06)]">

      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition duration-200 group-hover:scale-105"
        style={{
          backgroundColor: background,
          color,
        }}
      >
        {icon}
      </div>

      <div>

        <p className="text-sm font-semibold text-[#202938]">
          {title}
        </p>

        <p className="mt-2 text-xs leading-6 text-[#667085]">
          {text}
        </p>

      </div>

    </div>
  );
}

/* ============================================================
   PALETTE BLOCK
============================================================ */

function PaletteBlock({
  label,
  background,
  color,
}) {
  return (
    <div
      className="flex h-[84px] items-center justify-center border-r border-white last:border-r-0 transition duration-300 hover:brightness-[0.97]"
      style={{
        backgroundColor: background,
      }}
    >
      <span
        className="text-[10px] font-bold tracking-[0.2em]"
        style={{
          color,
        }}
      >
        {label}
      </span>
    </div>
  );
}

export default Landing;