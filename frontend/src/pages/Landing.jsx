import { useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  ArrowRight,
  Award,
  BrainCircuit,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  FileQuestion,
  Filter,
  History,
  Layers3,
  LockKeyhole,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  WandSparkles,
  Zap,
} from "lucide-react";

import evalynLogo from "../assets/evalyn-logo.png";


function Landing() {
  const navigate = useNavigate();
  const [openFaq, setOpenFaq] = useState(null);

  const faqs = [
    {
      question: "What does Evalyn automate?",
      answer:
        "Evalyn assists with job-to-skill analysis, assessment blueprinting, question generation and reuse, validation, review handoffs, and movement into assessment preparation. Human decisions remain explicit where quality matters.",
    },
    {
      question: "Who is responsible for approving questions?",
      answer:
        "The Assessment Reviewer owns the independent quality gate. The person who creates or generates the content should not approve the same content themselves.",
    },
    {
      question: "Can managers use existing questions?",
      answer:
        "Yes. Assessment Managers can prepare questions using AI generation, existing Question Bank content, or manual creation while keeping the question slot constraints visible.",
    },
    {
      question: "What happens after a question is generated?",
      answer:
        "AI output is treated as a candidate first. The system validates the candidate, preserves generation history, and lets the manager explicitly accept the question before it becomes part of the authored assessment content.",
    },
    {
      question: "Does Evalyn replace the recruiter or reviewer?",
      answer:
        "No. Evalyn is designed around human-in-the-loop screening. AI accelerates repetitive work, while managers and reviewers retain responsibility for authoring, quality, approval, and progression.",
    },
  ];


  return (
    <div className="min-h-screen bg-[#F4F6FA] text-[#172033] selection:bg-[#DCD8F7] selection:text-[#30266B]">

      {/* =====================================================
          NAVBAR
      ===================================================== */}

      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#171936]/95 text-white shadow-[0_8px_30px_rgba(23,25,54,0.12)] backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-[1320px] items-center justify-between px-5 sm:px-8">

          <button
            type="button"
            onClick={() => navigate("/")}
            className="group flex items-center"
            aria-label="Evalyn home"
          >
            <img
              src={evalynLogo}
              alt="Evalyn"
              className="h-10 w-auto transition duration-300 group-hover:scale-[1.03]"
            />
          </button>


          <nav className="hidden items-center gap-8 lg:flex">

            <a
              href="#how-it-works"
              className="text-[13.5px] font-medium text-[#D4D7EA] transition hover:text-white"
            >
              How it works
            </a>

            <a
              href="#features"
              className="text-[13.5px] font-medium text-[#D4D7EA] transition hover:text-white"
            >
              Features
            </a>

            <a
              href="#roles"
              className="text-[13.5px] font-medium text-[#D4D7EA] transition hover:text-white"
            >
              For your team
            </a>

            <a
              href="#faq"
              className="text-[13.5px] font-medium text-[#D4D7EA] transition hover:text-white"
            >
              FAQ
            </a>

          </nav>


          <div className="flex items-center gap-3">

            <button
              type="button"
              onClick={() => navigate("/login")}
              className="hidden px-3 py-2 text-[13.5px] font-medium text-white transition hover:text-[#CFCBFF] sm:block"
            >
              Sign in
            </button>


            <button
              type="button"
              onClick={() => navigate("/login")}
              className="group inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[13px] font-bold text-[#171936] shadow-[0_10px_25px_rgba(0,0,0,0.16)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#F2F1FF]"
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

        <section className="relative overflow-hidden bg-[#171936] text-white">

          <div className="pointer-events-none absolute inset-0 opacity-25">

            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.055) 1px, transparent 1px)",
                backgroundSize: "56px 56px",
              }}
            />

          </div>


          <div className="pointer-events-none absolute -left-40 -top-28 h-[480px] w-[480px] rounded-full bg-[#6355C9]/30 blur-[120px]" />

          <div className="pointer-events-none absolute right-[-120px] top-[-100px] h-[520px] w-[520px] rounded-full bg-[#A65B95]/24 blur-[130px]" />

          <div className="pointer-events-none absolute bottom-[-180px] left-[30%] h-[420px] w-[420px] rounded-full bg-[#2D978E]/15 blur-[120px]" />


          <DecorativeStars />


          <div className="relative mx-auto grid max-w-[1320px] grid-cols-1 gap-16 px-5 pb-20 pt-16 sm:px-8 sm:pb-24 sm:pt-20 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-14 lg:pt-24">

            <div className="relative z-10 max-w-[660px]">

              <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-3.5 py-2 text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#D9D7F8] shadow-[0_8px_24px_rgba(0,0,0,0.08)]">

                <span className="h-2 w-2 rounded-full bg-[#8BD8CA] shadow-[0_0_14px_rgba(139,216,202,0.55)]" />

                AI-assisted assessment authoring

              </div>


              <h1 className="mt-7 max-w-[700px] text-[48px] font-semibold leading-[0.99] tracking-[-0.055em] sm:text-[64px] lg:text-[76px]">

                Turn hiring needs into

                <span className="text-[#BEB8FF]">
                  {" "}better assessments.
                </span>

              </h1>


              <p className="mt-7 max-w-[630px] text-[16px] leading-7 text-[#D2D6E6] sm:text-[18px] sm:leading-8">

                Evalyn turns job requirements and confirmed skills into structured,
                role-specific screening content — with AI assistance, backend
                validation, reusable question banks, and an independent review gate.

              </p>


              <div className="mt-9 flex flex-wrap gap-3">

                <button
                  type="button"
                  onClick={() => navigate("/login")}
                  className="group inline-flex h-12 items-center gap-2.5 rounded-xl bg-[#7165E8] px-5 text-[14.5px] font-bold text-white shadow-[0_16px_32px_rgba(113,101,232,0.25)] transition duration-200 hover:-translate-y-1 hover:bg-[#6659DA]"
                >

                  Start with Evalyn

                  <ArrowRight
                    size={16}
                    className="transition-transform duration-200 group-hover:translate-x-1"
                  />

                </button>


                <a
                  href="#how-it-works"
                  className="group inline-flex h-12 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-5 text-[14.5px] font-semibold text-white transition duration-200 hover:-translate-y-1 hover:bg-white/[0.10]"
                >

                  See how it works

                  <ChevronRight
                    size={16}
                    className="transition-transform duration-200 group-hover:translate-x-1"
                  />

                </a>

              </div>


              <div className="mt-9 flex flex-wrap gap-x-7 gap-y-3">

                <HeroProof
                  icon={<Sparkles size={14} />}
                  text="AI-assisted"
                />

                <HeroProof
                  icon={<ShieldCheck size={14} />}
                  text="Validated"
                />

                <HeroProof
                  icon={<Users size={14} />}
                  text="Human-reviewed"
                />

                <HeroProof
                  icon={<History size={14} />}
                  text="Version-aware"
                />

              </div>

            </div>


            {/* =================================================
                HERO PRODUCT VISUAL
            ================================================= */}

            <div className="relative z-10 mx-auto w-full max-w-[650px]">

              <div className="pointer-events-none absolute -right-6 -top-6 h-[84%] w-[82%] rounded-[28px] bg-[#5F55C9]/20 blur-[2px]" />

              <div className="pointer-events-none absolute -bottom-7 -left-6 h-[78%] w-[82%] rounded-[28px] bg-[#A65B95]/18 blur-[2px]" />


              <div className="landing-float relative overflow-hidden rounded-[24px] border border-white/12 bg-[#FBFCFF] shadow-[0_40px_100px_rgba(0,0,0,0.35)]">

                <div className="flex items-center justify-between border-b border-[#E5E7EC] bg-[#F8F9FC] px-5 py-4 sm:px-6">

                  <div className="flex items-center gap-3">

                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E8E5FA] text-[#5E52B8]">
                      <BrainCircuit size={17} />
                    </div>

                    <div>

                      <p className="text-[12px] font-bold text-[#202938]">
                        Evalyn Assessment Workspace
                      </p>

                      <p className="mt-0.5 text-[9px] text-[#8993A3]">
                        Backend Developer · Assessment preparation
                      </p>

                    </div>

                  </div>


                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF7F0] px-2.5 py-1.5 text-[9px] font-bold text-[#28734E]">

                    <span className="h-1.5 w-1.5 rounded-full bg-[#35A66D]" />

                    READY

                  </span>

                </div>


                <div className="p-5 sm:p-6">

                  <div className="grid grid-cols-[1fr_auto] gap-5">

                    <div>

                      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#95A0AF]">
                        QUESTION SET
                      </p>

                      <h3 className="mt-2 text-[23px] font-semibold tracking-[-0.03em] text-[#172033]">
                        Backend Developer Screening
                      </h3>

                      <p className="mt-1 text-[11px] leading-5 text-[#778294]">
                        Structured around confirmed role requirements.
                      </p>

                    </div>


                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EEEAFB] text-[#6154BA]">
                      <Target size={19} />
                    </div>

                  </div>


                  <div className="mt-5 grid grid-cols-3 gap-3">

                    <DashboardStat
                      label="Skills"
                      value="7"
                      tint="#E8F0FF"
                      color="#356DC5"
                    />

                    <DashboardStat
                      label="Slots"
                      value="12"
                      tint="#F0EBFB"
                      color="#6A57B7"
                    />

                    <DashboardStat
                      label="Review"
                      value="Live"
                      tint="#F8EAF1"
                      color="#B85C87"
                    />

                  </div>


                  <div className="mt-5 overflow-hidden rounded-[18px] border border-[#DEE2E9] bg-white">

                    <div className="flex items-center justify-between border-b border-[#E8EBEF] px-4 py-3.5">

                      <div>

                        <p className="text-[11px] font-bold text-[#344054]">
                          Authoring workflow
                        </p>

                        <p className="mt-0.5 text-[9px] text-[#98A2B3]">
                          Every slot keeps its constraints visible
                        </p>

                      </div>


                      <span className="text-[9px] font-bold text-[#6A57B7]">
                        4 / 5 stages
                      </span>

                    </div>


                    <MiniPipelineStage
                      number="01"
                      title="Role + skills"
                      description="Confirmed job requirements"
                      color="#4A61C8"
                      background="#EAF2FF"
                      complete
                    />

                    <MiniPipelineStage
                      number="02"
                      title="Question slots"
                      description="Section · skill · difficulty · type"
                      color="#6756B8"
                      background="#F0EBFB"
                      complete
                    />

                    <MiniPipelineStage
                      number="03"
                      title="AI / Bank / Manual"
                      description="Choose how each slot is authored"
                      color="#B85C87"
                      background="#F8EAF1"
                      complete
                    />

                    <MiniPipelineStage
                      number="04"
                      title="Validation + review"
                      description="Candidate → reviewer quality gate"
                      color="#C58A32"
                      background="#FBF2DE"
                    />

                  </div>


                  <div className="mt-5 rounded-[18px] border border-[#E3E6EC] bg-gradient-to-r from-[#F7F7FF] to-[#FCFAFD] p-4">

                    <div className="flex items-start gap-3">

                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#E7E4FA] text-[#6254B7]">
                        <ShieldCheck size={16} />
                      </div>

                      <div className="min-w-0">

                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#6C5DB8]">
                          Maker-checker
                        </p>

                        <p className="mt-1 text-[12px] font-semibold text-[#344054]">
                          AI proposes. Humans decide.
                        </p>

                        <p className="mt-0.5 text-[9px] leading-5 text-[#7E8997]">
                          Content remains reviewable before it becomes assessment-ready.
                        </p>

                      </div>

                    </div>

                  </div>

                </div>
              </div>


              <div className="absolute -right-5 top-[25%] hidden rounded-2xl border border-[#DCE0E6] bg-white px-4 py-3 shadow-[0_18px_36px_rgba(22,31,51,0.14)] sm:block">

                <div className="flex items-center gap-2.5">

                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F0EBFB] text-[#6756B8]">
                    <Sparkles size={14} />
                  </span>

                  <div>

                    <p className="text-[10px] font-bold text-[#344054]">
                      AI generation
                    </p>

                    <p className="mt-0.5 text-[8px] text-[#98A2B3]">
                      Candidate content only
                    </p>

                  </div>

                </div>

              </div>


              <div className="absolute -bottom-5 -left-5 hidden rounded-2xl border border-[#DCE0E6] bg-white px-4 py-3 shadow-[0_18px_36px_rgba(22,31,51,0.14)] sm:block">

                <div className="flex items-center gap-2.5">

                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F8EAF1] text-[#B85C87]">
                    <ClipboardCheck size={14} />
                  </span>

                  <div>

                    <p className="text-[10px] font-bold text-[#344054]">
                      Reviewer gate
                    </p>

                    <p className="mt-0.5 text-[8px] text-[#98A2B3]">
                      Independent decision
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

        <section className="border-b border-[#DDE2E9] bg-white">

          <div className="mx-auto grid max-w-[1320px] grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">

            <ProofBlock
              icon={<BriefcaseBusiness size={19} />}
              eyebrow="01 · ROLE"
              title="Start from real requirements"
              text="Job description first. Screening scope follows."
              color="#4A61C8"
              background="#EAF2FF"
            />

            <ProofBlock
              icon={<Sparkles size={19} />}
              eyebrow="02 · AI"
              title="Automate repetitive preparation"
              text="Use AI where it saves time without hiding control."
              color="#6756B8"
              background="#F0EBFB"
            />

            <ProofBlock
              icon={<Layers3 size={19} />}
              eyebrow="03 · STRUCTURE"
              title="Keep question intent explicit"
              text="Every slot carries skill, section, difficulty and type."
              color="#B85C87"
              background="#F8EAF1"
            />

            <ProofBlock
              icon={<ShieldCheck size={19} />}
              eyebrow="04 · REVIEW"
              title="Finish with human judgment"
              text="Prepared content moves through an independent quality gate."
              color="#C58A32"
              background="#FBF2DE"
            />

          </div>

        </section>


        {/* =====================================================
            HOW IT WORKS
        ===================================================== */}

        <section
          id="how-it-works"
          className="relative overflow-hidden bg-[#F4F6FA] py-24 sm:py-28"
        >

          <SectionTexture />

          <div className="relative mx-auto max-w-[1320px] px-5 sm:px-8">

            <div className="max-w-3xl">

              <Eyebrow text="HOW IT WORKS" />

              <h2 className="mt-5 text-[42px] font-semibold leading-[1.03] tracking-[-0.045em] text-[#172033] sm:text-[58px]">

                From job description

                <span className="text-[#6355C9]">
                  {" "}to candidate-ready assessment.
                </span>

              </h2>


              <p className="mt-6 text-[16px] leading-8 text-[#687486] sm:text-[17px]">
                A clear authoring journey with explicit checkpoints instead of a single prompt-and-save step.
              </p>

            </div>


            <div className="mt-14 overflow-hidden rounded-[24px] border border-[#D7DCE4] bg-white shadow-[0_24px_60px_rgba(28,36,56,0.07)]">

              <FlowRow
                number="01"
                label="Configure"
                title="Confirm the role"
                text="Start from the job description and the skills that define what the role actually needs."
                icon={<BriefcaseBusiness size={20} />}
                background="#EAF2FF"
                color="#4A61C8"
              />

              <FlowRow
                number="02"
                label="Blueprint"
                title="Create question slots"
                text="Set section, skill, difficulty, slot number and preferred question type before authoring content."
                icon={<Target size={20} />}
                background="#F0EBFB"
                color="#6756B8"
              />

              <FlowRow
                number="03"
                label="Author"
                title="Generate, reuse or create"
                text="Fill each slot using AI generation, existing Question Bank content, or manual creation."
                icon={<WandSparkles size={20} />}
                background="#F8EAF1"
                color="#B85C87"
              />

              <FlowRow
                number="04"
                label="Validate"
                title="Control the candidate"
                text="Validate structure, skill fit, difficulty, answer keys, duplicates and generation constraints."
                icon={<Filter size={20} />}
                background="#FBF2DE"
                color="#C58A32"
              />

              <FlowRow
                number="05"
                label="Review"
                title="Let an independent reviewer decide"
                text="Move prepared content through a maker-checker workflow before it becomes assessment-ready."
                icon={<ClipboardCheck size={20} />}
                background="#EAF7F3"
                color="#0F9D8A"
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

          <div className="pointer-events-none absolute right-[-120px] top-20 h-80 w-80 rounded-full bg-[#EAE5F9]/55 blur-[120px]" />

          <div className="pointer-events-none absolute left-[-120px] bottom-10 h-72 w-72 rounded-full bg-[#CFDEFC]/40 blur-[120px]" />


          <div className="relative mx-auto max-w-[1320px] px-5 sm:px-8">

            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">

              <div className="max-w-3xl">

                <Eyebrow text="THE EVALYN TOOLKIT" />

                <h2 className="mt-5 text-[42px] font-semibold leading-[1.03] tracking-[-0.045em] text-[#172033] sm:text-[58px]">

                  More than generation.

                  <span className="text-[#6355C9]">
                    {" "}A complete authoring loop.
                  </span>

                </h2>

              </div>


              <p className="max-w-md text-[15.5px] leading-7 text-[#687486]">
                The product separates preparation, validation and approval so the assessment is structured before it reaches the candidate.
              </p>

            </div>


            <div className="mt-14 grid grid-cols-1 overflow-hidden rounded-[24px] border border-[#D9DEE6] bg-white md:grid-cols-2 lg:grid-cols-3">

              <FeatureCard
                icon={<BrainCircuit size={22} />}
                eyebrow="AI"
                title="AI-assisted question generation"
                description="Generate role-aware question candidates while keeping the slot constraints and manager guidance visible."
                points={[
                  "Scenario and application focus",
                  "Manager guidance",
                  "Candidate generation workflow",
                ]}
                color="#6756B8"
                background="#F0EBFB"
              />

              <FeatureCard
                icon={<Search size={22} />}
                eyebrow="REUSE"
                title="Question Bank retrieval"
                description="Reuse existing questions intentionally instead of rebuilding every role from scratch."
                points={[
                  "Year-specific context",
                  "Structured filtering",
                  "Historical content reuse",
                ]}
                color="#4A61C8"
                background="#EAF2FF"
              />

              <FeatureCard
                icon={<Target size={22} />}
                eyebrow="BLUEPRINT"
                title="Constraint-driven authoring"
                description="Each question slot makes the intended assessment coverage explicit before content is written."
                points={[
                  "Skill",
                  "Section + difficulty",
                  "MCQ / Free Text",
                ]}
                color="#B85C87"
                background="#F8EAF1"
              />

              <FeatureCard
                icon={<Filter size={22} />}
                eyebrow="CONTROL"
                title="Validation before approval"
                description="AI candidates are checked before the manager treats them as assessment content."
                points={[
                  "Structure validation",
                  "Duplicate detection",
                  "Quality guardrails",
                ]}
                color="#C58A32"
                background="#FBF2DE"
              />

              <FeatureCard
                icon={<History size={22} />}
                eyebrow="TRACEABILITY"
                title="Version-aware questions"
                description="Keep history visible when questions change instead of silently replacing previous content."
                points={[
                  "Question versions",
                  "Generation attempts",
                  "Review history",
                ]}
                color="#0F9D8A"
                background="#EAF7F3"
              />

              <FeatureCard
                icon={<ShieldCheck size={22} />}
                eyebrow="GOVERNANCE"
                title="Independent reviewer gate"
                description="Separate the person who prepares the content from the person who approves it."
                points={[
                  "Approve / reject",
                  "Recorded decisions",
                  "Maker-checker workflow",
                ]}
                color="#A76D5B"
                background="#FAEDEA"
              />

            </div>

          </div>

        </section>


        {/* =====================================================
            AUTHORING VISUAL
        ===================================================== */}

        <section className="relative overflow-hidden bg-[#F4F6FA] py-24 sm:py-28">

          <div className="pointer-events-none absolute right-[-160px] top-0 h-[380px] w-[380px] rounded-full bg-[#D4C6F8]/30 blur-[120px]" />

          <div className="pointer-events-none absolute left-[-150px] bottom-0 h-[360px] w-[360px] rounded-full bg-[#EDBFE5]/24 blur-[120px]" />


          <div className="relative mx-auto grid max-w-[1320px] grid-cols-1 gap-14 px-5 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">

            <div>

              <Eyebrow text="ASSESSMENT AUTHORING" />

              <h2 className="mt-5 max-w-xl text-[42px] font-semibold leading-[1.04] tracking-[-0.045em] text-[#172033] sm:text-[55px]">
                Give every question a reason to exist.
              </h2>

              <p className="mt-6 max-w-xl text-[16px] leading-8 text-[#687486]">
                Evalyn is built around QuestionSlots, so the platform knows what each question is supposed to measure before it asks AI to produce one.
              </p>


              <div className="mt-8 space-y-4">

                <BulletLine
                  icon={<Target size={16} />}
                  title="Intent first"
                  text="Define the skill, section, difficulty and type before content is generated."
                  color="#6756B8"
                />

                <BulletLine
                  icon={<Sparkles size={16} />}
                  title="AI as an authoring assistant"
                  text="Generate candidates without turning generation into automatic approval."
                  color="#B85C87"
                />

                <BulletLine
                  icon={<ShieldCheck size={16} />}
                  title="Validation and review"
                  text="Keep automated checks and human governance as distinct stages."
                  color="#0F9D8A"
                />

              </div>

            </div>


            <AuthoringMockup />

          </div>

        </section>


        {/* =====================================================
            ROLES
        ===================================================== */}

        <section
          id="roles"
          className="relative overflow-hidden bg-[#171936] py-24 text-white sm:py-28"
        >

          <div className="pointer-events-none absolute -left-32 top-10 h-80 w-80 rounded-full bg-[#6756B8]/22 blur-[120px]" />

          <div className="pointer-events-none absolute right-[-100px] bottom-0 h-80 w-80 rounded-full bg-[#A65B95]/18 blur-[120px]" />


          <div className="relative mx-auto max-w-[1320px] px-5 sm:px-8">

            <div className="max-w-3xl">

              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#AFA9F5]">
                FOR YOUR TEAM
              </p>


              <h2 className="mt-5 text-[42px] font-semibold leading-[1.04] tracking-[-0.045em] sm:text-[57px]">

                One screening system.

                <span className="text-[#BEB8FF]">
                  {" "}Clear ownership.
                </span>

              </h2>


              <p className="mt-6 text-[16px] leading-8 text-[#C5C9D9] sm:text-[17px]">
                Evalyn keeps the roles distinct so the system can automate work without blurring accountability.
              </p>

            </div>


            <div className="mt-14 grid grid-cols-1 gap-5 lg:grid-cols-3">

              <RoleCard
                role="HR"
                title="What do we need?"
                description="Own the hiring requirement, job description and confirmed skill scope before handing assessment preparation forward."
                icon={<BriefcaseBusiness size={21} />}
                background="#CFDEFC"
                color="#4A61C8"
                points={[
                  "Create or upload JD",
                  "AI-assisted skill extraction",
                  "Review and confirm skills",
                ]}
              />


              <RoleCard
                role="Assessment Manager"
                title="How do we test it?"
                description="Design the assessment, create question slots, generate or reuse content, and prepare the question set."
                icon={<WandSparkles size={21} />}
                background="#EAE5F9"
                color="#6756B8"
                points={[
                  "Blueprint assessment",
                  "Generate / reuse / create",
                  "Prepare assessment content",
                ]}
              />


              <RoleCard
                role="Assessment Reviewer"
                title="Is this ready?"
                description="Review the prepared content independently and make the approval or rejection decision."
                icon={<ClipboardCheck size={21} />}
                background="#F8EAF1"
                color="#B85C87"
                points={[
                  "Validate question quality",
                  "Inspect history and context",
                  "Approve or reject",
                ]}
              />

            </div>

          </div>

        </section>


        {/* =====================================================
            CANDIDATE EXPERIENCE
        ===================================================== */}

        <section className="relative overflow-hidden bg-white py-24 sm:py-28">

          <div className="pointer-events-none absolute left-[-130px] top-20 h-80 w-80 rounded-full bg-[#CFDEFC]/35 blur-[120px]" />

          <div className="pointer-events-none absolute right-[-110px] bottom-0 h-80 w-80 rounded-full bg-[#F3E3F2]/45 blur-[120px]" />


          <div className="relative mx-auto grid max-w-[1320px] grid-cols-1 gap-14 px-5 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">

            <CandidateMockup />


            <div>

              <Eyebrow text="CANDIDATE EXPERIENCE" />

              <h2 className="mt-5 max-w-xl text-[42px] font-semibold leading-[1.04] tracking-[-0.045em] text-[#172033] sm:text-[54px]">

                Clear questions.

                <span className="text-[#B85C87]">
                  {" "}Consistent experience.
                </span>

              </h2>


              <p className="mt-6 max-w-xl text-[16px] leading-8 text-[#687486]">
                Candidates receive the approved screening content in a structured assessment journey designed around the requirements of the role.
              </p>


              <div className="mt-8 space-y-4">

                <BulletLine
                  icon={<Target size={16} />}
                  title="Role-aligned content"
                  text="Assess skills that were intentionally selected for the role."
                  color="#4A61C8"
                />

                <BulletLine
                  icon={<Zap size={16} />}
                  title="Structured flow"
                  text="Keep the assessment organized around the configured question set."
                  color="#6756B8"
                />

                <BulletLine
                  icon={<ShieldCheck size={16} />}
                  title="Ready for evaluation"
                  text="Move from approved assessment content into candidate delivery and evaluation."
                  color="#0F9D8A"
                />

              </div>

            </div>

          </div>

        </section>


        {/* =====================================================
            CONTROL / TRANSPARENCY
        ===================================================== */}

        <section className="relative overflow-hidden bg-[#F4F6FA] py-24 sm:py-28">

          <div className="relative mx-auto max-w-[1320px] px-5 sm:px-8">

            <div className="mx-auto max-w-3xl text-center">

              <Eyebrow
                text="CONTROL & TRANSPARENCY"
                center
              />


              <h2 className="mt-5 text-[42px] font-semibold leading-[1.04] tracking-[-0.045em] text-[#172033] sm:text-[56px]">

                Intelligent assistance.

                <span className="text-[#6355C9]">
                  {" "}Visible decisions.
                </span>

              </h2>


              <p className="mt-6 text-[16px] leading-8 text-[#687486]">
                Automation should reduce repetitive work — not make important decisions disappear into a black box.
              </p>

            </div>


            <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">

              <ControlCard
                icon={<Sparkles size={21} />}
                title="AI proposes"
                text="Generation is an assistive step, not an approval event."
                tag="AI"
                background="#EAE5F9"
                color="#6756B8"
              />

              <ControlCard
                icon={<Filter size={21} />}
                title="Backend validates"
                text="Question candidates pass through structured validation and guardrails."
                tag="CONTROL"
                background="#EAF2FF"
                color="#4A61C8"
              />

              <ControlCard
                icon={<Users size={21} />}
                title="Manager accepts"
                text="The Assessment Manager decides what becomes authored content."
                tag="AUTHOR"
                background="#F8EAF1"
                color="#B85C87"
              />

              <ControlCard
                icon={<ShieldCheck size={21} />}
                title="Reviewer approves"
                text="A separate reviewer makes the final quality decision."
                tag="GATE"
                background="#FBF2DE"
                color="#C58A32"
              />

            </div>

          </div>

        </section>


        {/* =====================================================
            FAQ
        ===================================================== */}

        <section
          id="faq"
          className="relative overflow-hidden bg-white py-24 sm:py-28"
        >

          <div className="pointer-events-none absolute left-1/2 top-[-160px] h-80 w-80 -translate-x-1/2 rounded-full bg-[#EAE5F9]/55 blur-[120px]" />


          <div className="relative mx-auto max-w-[1000px] px-5 sm:px-8">

            <div className="text-center">

              <Eyebrow
                text="FAQ"
                center
              />

              <h2 className="mt-5 text-[42px] font-semibold leading-[1.04] tracking-[-0.045em] text-[#172033] sm:text-[54px]">
                Built for a governed workflow.
              </h2>


              <p className="mx-auto mt-6 max-w-2xl text-[16px] leading-8 text-[#687486]">
                The important part is not only what AI can generate. It is what the system does with the output next.
              </p>

            </div>


            <div className="mt-12 overflow-hidden rounded-[22px] border border-[#DCE1E8] bg-white shadow-[0_16px_40px_rgba(24,34,52,0.045)]">

              {faqs.map((faq, index) => {

                const isOpen =
                  openFaq === index;


                return (
                  <div
                    key={faq.question}
                    className={
                      index !== faqs.length - 1
                        ? "border-b border-[#E8EBEF]"
                        : ""
                    }
                  >

                    <button
                      type="button"
                      onClick={() =>
                        setOpenFaq(
                          isOpen
                            ? null
                            : index
                        )
                      }
                      className="flex w-full items-center justify-between gap-5 px-5 py-5 text-left transition hover:bg-[#FAFBFC] sm:px-7"
                    >

                      <span className="text-[15px] font-semibold text-[#273244] sm:text-[16px]">
                        {faq.question}
                      </span>


                      <ChevronDown
                        size={18}
                        className={`shrink-0 text-[#7B8492] transition-transform duration-200 ${
                          isOpen
                            ? "rotate-180"
                            : "rotate-0"
                        }`}
                      />

                    </button>


                    {isOpen && (
                      <div className="px-5 pb-6 sm:px-7">

                        <p className="max-w-3xl text-[14px] leading-7 text-[#667085]">
                          {faq.answer}
                        </p>

                      </div>
                    )}

                  </div>
                );

              })}

            </div>

          </div>

        </section>


        {/* =====================================================
            CTA
        ===================================================== */}

        <section className="relative overflow-hidden bg-[#171936] py-24 text-white sm:py-28">

          <div className="pointer-events-none absolute inset-0">

            <div className="absolute left-[-120px] top-[-100px] h-80 w-80 rounded-full bg-[#6756B8]/25 blur-[110px]" />

            <div className="absolute right-[-100px] bottom-[-80px] h-80 w-80 rounded-full bg-[#A65B95]/22 blur-[110px]" />

          </div>


          <div className="relative mx-auto max-w-[980px] px-5 text-center sm:px-8">

            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-[#D8D4FF]">
              <Award size={24} />
            </div>


            <p className="mt-7 text-[10px] font-bold uppercase tracking-[0.22em] text-[#AFA9F5]">
              START WITH THE ROLE
            </p>


            <h2 className="mt-5 text-[44px] font-semibold leading-[1.04] tracking-[-0.045em] sm:text-[62px]">

              Build the right assessment.

              <br />

              <span className="text-[#BEB8FF]">
                Then review it with confidence.
              </span>

            </h2>


            <p className="mx-auto mt-6 max-w-2xl text-[16px] leading-8 text-[#C7CBDD] sm:text-[17px]">
              Evalyn brings role requirements, AI assistance, structured authoring, validation and independent review into one workflow.
            </p>


            <div className="mt-9 flex flex-wrap justify-center gap-3">

              <button
                type="button"
                onClick={() => navigate("/login")}
                className="group inline-flex h-12 items-center gap-2.5 rounded-xl bg-white px-5 text-[14px] font-bold text-[#171936] shadow-[0_15px_35px_rgba(0,0,0,0.22)] transition duration-200 hover:-translate-y-1 hover:bg-[#F3F1FF]"
              >

                Get started with Evalyn

                <ArrowRight
                  size={16}
                  className="transition-transform duration-200 group-hover:translate-x-1"
                />

              </button>


              <a
                href="#how-it-works"
                className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-5 text-[14px] font-semibold text-white transition hover:-translate-y-1 hover:bg-white/[0.10]"
              >

                Revisit the workflow

                <ChevronRight size={16} />

              </a>

            </div>


            <div className="mt-9 flex flex-wrap justify-center gap-x-7 gap-y-3 text-[11px] font-medium text-[#BFC3D5]">

              <span>
                Role-specific
              </span>

              <span>
                AI-assisted
              </span>

              <span>
                MCQ + Free Text
              </span>

              <span>
                Question Bank
              </span>

              <span>
                Maker-checker
              </span>

            </div>

          </div>

        </section>

      </main>


      {/* =====================================================
          FOOTER
      ===================================================== */}

      <footer className="border-t border-[#303252] bg-[#10122A] text-white">

        <div className="mx-auto max-w-[1320px] px-5 py-10 sm:px-8">

          <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">

            <div>

              <img
                src={evalynLogo}
                alt="Evalyn"
                className="h-9 w-auto"
              />

              <p className="mt-3 max-w-md text-[12.5px] leading-6 text-[#AEB3C8]">
                AI-powered, role-specific assessment authoring and screening workflow.
              </p>

            </div>


            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">

              <a
                href="#how-it-works"
                className="text-[12.5px] text-[#C0C4D8] transition hover:text-white"
              >
                How it works
              </a>

              <a
                href="#features"
                className="text-[12.5px] text-[#C0C4D8] transition hover:text-white"
              >
                Features
              </a>

              <a
                href="#roles"
                className="text-[12.5px] text-[#C0C4D8] transition hover:text-white"
              >
                For your team
              </a>

              <a
                href="#faq"
                className="text-[12.5px] text-[#C0C4D8] transition hover:text-white"
              >
                FAQ
              </a>


              <button
                type="button"
                onClick={() => navigate("/login")}
                className="rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-[12px] font-semibold text-white transition hover:bg-white/[0.09]"
              >
                Sign in
              </button>

            </div>

          </div>


          <div className="mt-9 border-t border-[#2B2D47] pt-5">

            <div className="flex flex-col gap-2 text-[10.5px] text-[#8D93AD] sm:flex-row sm:items-center sm:justify-between">

              <span>
                © 2026 Evalyn. All rights reserved.
              </span>

              <span>
                AI proposes · system validates · humans decide
              </span>

            </div>

          </div>

        </div>

      </footer>

    </div>
  );
}


/* ============================================================
   EYEBROW
============================================================ */

function Eyebrow({
  text,
  center = false,
}) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full bg-[#ECEBFA] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#5A4DB4] ${
        center
          ? "mx-auto"
          : ""
      }`}
    >

      <span className="h-1.5 w-1.5 rounded-full bg-[#6756B8]" />

      {text}

    </div>
  );
}


/* ============================================================
   DECORATIVE STARS
============================================================ */

function DecorativeStars() {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      aria-hidden="true"
    >

      <span className="absolute left-[9%] top-[23%] h-2 w-2 rounded-full bg-[#8FA4FF] opacity-80" />

      <span className="absolute left-[27%] top-[13%] h-1.5 w-1.5 rounded-full bg-[#E9B2DE] opacity-80" />

      <span className="absolute right-[34%] top-[17%] h-2 w-2 rounded-full bg-[#B9AFFF] opacity-75" />

      <span className="absolute right-[11%] top-[32%] h-1.5 w-1.5 rounded-full bg-[#89D5C8] opacity-75" />

      <span className="absolute right-[18%] bottom-[20%] h-2 w-2 rounded-full bg-[#F0C6A8] opacity-75" />

    </div>
  );
}


/* ============================================================
   HERO PROOF
============================================================ */

function HeroProof({
  icon,
  text,
}) {
  return (
    <div className="flex items-center gap-2 text-[11.5px] font-medium text-[#C9CDDF]">

      <span className="text-[#9D98F0]">
        {icon}
      </span>

      {text}

    </div>
  );
}


/* ============================================================
   DASHBOARD STAT
============================================================ */

function DashboardStat({
  label,
  value,
  tint,
  color,
}) {
  return (
    <div
      className="rounded-xl border border-[#E5E8EF] p-3"
      style={{
        backgroundColor: tint,
      }}
    >

      <p
        className="text-[8px] font-bold uppercase tracking-[0.14em]"
        style={{
          color,
        }}
      >
        {label}
      </p>

      <p className="mt-1 text-[20px] font-semibold text-[#202938]">
        {value}
      </p>

    </div>
  );
}


/* ============================================================
   MINI PIPELINE
============================================================ */

function MiniPipelineStage({
  number,
  title,
  description,
  color,
  background,
  complete = false,
}) {
  return (
    <div className="flex items-center gap-3 border-b border-[#EEF0F3] px-4 py-3.5 last:border-b-0">

      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{
          backgroundColor: background,
          color,
        }}
      >
        {complete ? (
          <Check size={13} />
        ) : (
          number
        )}
      </span>


      <div className="min-w-0 flex-1">

        <div className="flex items-center gap-2">

          <span className="text-[8px] font-bold text-[#98A2B3]">
            {number}
          </span>

          <p className="text-[10.5px] font-semibold text-[#344054]">
            {title}
          </p>

        </div>


        <p className="mt-0.5 truncate text-[8.5px] text-[#98A2B3]">
          {description}
        </p>

      </div>


      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{
          backgroundColor: color,
        }}
      />

    </div>
  );
}


/* ============================================================
   PROOF BLOCK
============================================================ */

function ProofBlock({
  icon,
  eyebrow,
  title,
  text,
  color,
  background,
}) {
  return (
    <div className="border-b border-[#E5E8ED] p-7 last:border-b-0 sm:p-8 lg:border-b-0 lg:border-r lg:last:border-r-0">

      <div
        className="flex h-11 w-11 items-center justify-center rounded-xl"
        style={{
          backgroundColor: background,
          color,
        }}
      >
        {icon}
      </div>


      <p className="mt-5 text-[9px] font-bold uppercase tracking-[0.16em] text-[#8B95A4]">
        {eyebrow}
      </p>


      <h3 className="mt-2 text-[18px] font-semibold tracking-[-0.015em] text-[#273244]">
        {title}
      </h3>


      <p className="mt-2 text-[13.5px] leading-6 text-[#707B8A]">
        {text}
      </p>

    </div>
  );
}


/* ============================================================
   SECTION TEXTURE
============================================================ */

function SectionTexture() {
  return (
    <div
      className="pointer-events-none absolute inset-0 opacity-30"
      aria-hidden="true"
    >

      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(208,213,222,0.55) 1px, transparent 1px), linear-gradient(90deg, rgba(208,213,222,0.55) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

    </div>
  );
}


/* ============================================================
   FLOW ROW
============================================================ */

function FlowRow({
  number,
  label,
  title,
  text,
  icon,
  background,
  color,
  last = false,
}) {
  const [
    hovered,
    setHovered,
  ] = useState(false);


  return (
    <div
      className={`group grid grid-cols-1 transition duration-300 sm:grid-cols-[170px_1fr] ${
        !last
          ? "border-b border-[#E6E9EE]"
          : ""
      }`}
      onMouseEnter={() =>
        setHovered(true)
      }
      onMouseLeave={() =>
        setHovered(false)
      }
    >

      <div
        className="relative flex min-h-[150px] items-center justify-center p-7 transition duration-300 sm:min-h-[180px]"
        style={{
          backgroundColor: hovered
            ? background
            : "#F9FAFB",
        }}
      >

        <div
          className={`text-center transition duration-300 ${
            hovered
              ? "scale-105"
              : "scale-100"
          }`}
        >

          <div
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl"
            style={{
              backgroundColor:
                background,
              color,
            }}
          >
            {icon}
          </div>


          <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#6F7887]">
            {label}
          </p>

        </div>


        <span
          className="absolute -bottom-[9px] left-1/2 hidden h-[18px] w-[18px] -translate-x-1/2 rotate-45 border-r border-b sm:block"
          style={{
            backgroundColor:
              hovered
                ? background
                : "#F9FAFB",
            borderColor:
              hovered
                ? background
                : "#E6E9EE",
          }}
        />

      </div>


      <div className="flex min-h-[150px] items-center px-7 py-7 sm:min-h-[180px] sm:px-10">

        <div
          className={`max-w-3xl transition duration-300 ${
            hovered
              ? "translate-x-1.5"
              : "translate-x-0"
          }`}
        >

          <div className="flex items-center gap-3">

            <span className="text-[9px] font-bold text-[#98A2B3]">
              {number}
            </span>

            <h3 className="text-[20px] font-semibold tracking-[-0.02em] text-[#202938]">
              {title}
            </h3>

          </div>


          <p className="mt-2.5 max-w-2xl text-[14px] leading-7 text-[#697586]">
            {text}
          </p>


          <span
            className={`mt-4 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] transition ${
              hovered
                ? "translate-x-1"
                : "translate-x-0"
            }`}
            style={{
              color,
            }}
          >

            Explore stage

            <ChevronRight size={11} />

          </span>

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
  eyebrow,
  title,
  description,
  points,
  color,
  background,
}) {
  return (
    <div className="group relative border-b border-[#DCE1E7] p-8 transition duration-300 hover:bg-[#FAFBFC] lg:border-r">

      <div
        className="absolute inset-x-0 top-0 h-1 opacity-60"
        style={{
          backgroundColor: color,
        }}
      />


      <div
        className="flex h-12 w-12 items-center justify-center rounded-xl transition duration-300 group-hover:scale-105"
        style={{
          backgroundColor:
            background,
          color,
        }}
      >
        {icon}
      </div>


      <p
        className="mt-6 text-[10px] font-bold uppercase tracking-[0.16em]"
        style={{
          color,
        }}
      >
        {eyebrow}
      </p>


      <h3 className="mt-2 text-[20px] font-semibold tracking-[-0.02em] text-[#273244]">
        {title}
      </h3>


      <p className="mt-3 text-[14px] leading-7 text-[#6C7787]">
        {description}
      </p>


      <div className="mt-6 space-y-2.5">

        {points.map(
          (point) => (
            <div
              key={point}
              className="flex items-center gap-2.5 text-[12.5px] font-semibold text-[#4A5565]"
            >

              <span
                className="flex h-6 w-6 items-center justify-center rounded-full"
                style={{
                  backgroundColor:
                    background,
                  color,
                }}
              >
                <Check size={11} />
              </span>

              {point}

            </div>
          )
        )}

      </div>


      <div className="mt-7 flex items-center gap-1 text-[10.5px] font-bold text-[#5A4DB4]">

        See capability

        <ArrowRight
          size={12}
          className="transition-transform duration-200 group-hover:translate-x-1"
        />

      </div>

    </div>
  );
}


/* ============================================================
   BULLET LINE
============================================================ */

function BulletLine({
  icon,
  title,
  text,
  color,
}) {
  return (
    <div className="group flex items-start gap-3.5">

      <div
        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition duration-200 group-hover:scale-105"
        style={{
          backgroundColor:
            `${color}16`,
          color,
        }}
      >
        {icon}
      </div>


      <div>

        <p className="text-[14.5px] font-semibold text-[#344054]">
          {title}
        </p>

        <p className="mt-1 text-[13.5px] leading-6 text-[#737E8D]">
          {text}
        </p>

      </div>

    </div>
  );
}


/* ============================================================
   AUTHORING MOCKUP
============================================================ */

function AuthoringMockup() {
  const rows = [
    {
      type: "MCQ",
      skill: "PostgreSQL",
      difficulty: "Medium",
      status: "Candidate",
      color: "#6756B8",
      background: "#F0EBFB",
    },
    {
      type: "FREE TEXT",
      skill: "FastAPI",
      difficulty: "Hard",
      status: "Accepted",
      color: "#0F9D8A",
      background: "#EAF7F3",
    },
    {
      type: "MCQ",
      skill: "Python",
      difficulty: "Easy",
      status: "Pending",
      color: "#B85C87",
      background: "#F8EAF1",
    },
  ];


  return (
    <div className="landing-float rounded-[24px] border border-[#D9DEE6] bg-white p-4 shadow-[0_24px_60px_rgba(24,34,52,0.10)] sm:p-5">

      <div className="flex items-center justify-between rounded-[18px] bg-[#202142] px-5 py-4 text-white">

        <div>

          <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#A8ACD0]">
            Assessment manager
          </p>

          <p className="mt-1 text-[15px] font-semibold">
            Question authoring
          </p>

        </div>


        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-[#C8C3FF]">
          <Layers3 size={17} />
        </div>

      </div>


      <div className="mt-4 grid grid-cols-3 gap-2.5">

        <WorkspaceChip
          label="12 slots"
          color="#4A61C8"
          background="#EAF2FF"
        />

        <WorkspaceChip
          label="7 skills"
          color="#6756B8"
          background="#F0EBFB"
        />

        <WorkspaceChip
          label="2 types"
          color="#B85C87"
          background="#F8EAF1"
        />

      </div>


      <div className="mt-4 overflow-hidden rounded-[18px] border border-[#DFE3E8]">

        <div className="grid grid-cols-[1fr_0.8fr_0.72fr_0.8fr] gap-2 border-b border-[#E8EBEF] bg-[#F8F9FB] px-3.5 py-3 text-[8.5px] font-bold uppercase tracking-[0.11em] text-[#9099A7]">

          <span>
            Question
          </span>

          <span>
            Skill
          </span>

          <span>
            Level
          </span>

          <span>
            Status
          </span>

        </div>


        {rows.map(
          (row, index) => (
            <div
              key={`${row.skill}-${index}`}
              className="grid grid-cols-[1fr_0.8fr_0.72fr_0.8fr] items-center gap-2 border-b border-[#EEF1F4] px-3.5 py-3.5 last:border-b-0"
            >

              <div className="flex min-w-0 items-center gap-2">

                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[8px] font-bold"
                  style={{
                    backgroundColor:
                      row.background,
                    color:
                      row.color,
                  }}
                >
                  {row.type ===
                  "MCQ"
                    ? "A"
                    : "T"}
                </span>


                <div className="min-w-0">

                  <p className="truncate text-[9.5px] font-semibold text-[#344054]">
                    Practical scenario question
                  </p>

                  <p className="mt-0.5 text-[7.5px] text-[#98A2B3]">
                    Slot {index + 1}
                  </p>

                </div>

              </div>


              <span className="truncate text-[9px] font-medium text-[#596575]">
                {row.skill}
              </span>


              <span className="text-[9px] font-semibold text-[#687486]">
                {row.difficulty}
              </span>


              <span
                className="justify-self-start rounded-full px-2 py-1 text-[7.5px] font-bold"
                style={{
                  backgroundColor:
                    row.background,
                  color:
                    row.color,
                }}
              >
                {row.status}
              </span>

            </div>
          )
        )}

      </div>


      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">

        <div className="rounded-[18px] border border-[#E1E4EA] bg-[#FAFBFC] p-4">

          <div className="flex items-center gap-2">

            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F0EBFB] text-[#6756B8]">
              <Sparkles size={14} />
            </span>

            <div>

              <p className="text-[10px] font-bold text-[#344054]">
                Generate with AI
              </p>

              <p className="mt-0.5 text-[8px] text-[#98A2B3]">
                Candidate drafts
              </p>

            </div>

          </div>

        </div>


        <div className="rounded-[18px] border border-[#E1E4EA] bg-[#FAFBFC] p-4">

          <div className="flex items-center gap-2">

            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EAF2FF] text-[#4A61C8]">
              <Search size={14} />
            </span>

            <div>

              <p className="text-[10px] font-bold text-[#344054]">
                Choose from Bank
              </p>

              <p className="mt-0.5 text-[8px] text-[#98A2B3]">
                Reuse intentionally
              </p>

            </div>

          </div>

        </div>

      </div>

    </div>
  );
}


/* ============================================================
   WORKSPACE CHIP
============================================================ */

function WorkspaceChip({
  label,
  color,
  background,
}) {
  return (
    <div
      className="rounded-xl border border-white px-3 py-2 text-center"
      style={{
        backgroundColor:
          background,
      }}
    >

      <span
        className="text-[9px] font-bold"
        style={{
          color,
        }}
      >
        {label}
      </span>

    </div>
  );
}


/* ============================================================
   ROLE CARD
============================================================ */

function RoleCard({
  role,
  title,
  description,
  icon,
  background,
  color,
  points,
}) {
  return (
    <div className="group relative overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.055] p-7 transition duration-300 hover:-translate-y-1 hover:bg-white/[0.08] hover:shadow-[0_22px_45px_rgba(0,0,0,0.18)]">

      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{
          backgroundColor: color,
        }}
      />


      <div className="flex items-start justify-between gap-3">

        <div
          className="flex h-12 w-12 items-center justify-center rounded-xl transition duration-300 group-hover:scale-105"
          style={{
            backgroundColor:
              background,
            color,
          }}
        >
          {icon}
        </div>


        <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#9197B8]">
          {role}
        </span>

      </div>


      <h3 className="mt-6 text-[22px] font-semibold tracking-[-0.02em]">
        {title}
      </h3>


      <p className="mt-3 text-[14px] leading-7 text-[#C4C9DA]">
        {description}
      </p>


      <div className="mt-7 space-y-3">

        {points.map(
          (point) => (
            <div
              key={point}
              className="flex items-center gap-2.5 text-[12.5px] font-medium text-[#D2D5E1]"
            >

              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                style={{
                  backgroundColor:
                    `${color}22`,
                  color,
                }}
              >
                <Check size={11} />
              </span>

              {point}

            </div>
          )
        )}

      </div>

    </div>
  );
}


/* ============================================================
   CANDIDATE MOCKUP
============================================================ */

function CandidateMockup() {
  return (
    <div className="relative mx-auto w-full max-w-[620px]">

      <div className="pointer-events-none absolute -left-5 -top-5 h-[90%] w-[84%] bg-[#CFDEFC]/55" />

      <div className="pointer-events-none absolute -bottom-5 -right-5 h-[82%] w-[86%] bg-[#F3E3F2]/55" />


      <div className="relative rounded-[24px] border border-[#D9DEE6] bg-white p-4 shadow-[0_28px_60px_rgba(24,34,52,0.09)] sm:p-5">

        <div className="rounded-[18px] border border-[#E4E7EB] bg-[#FCFCFD]">

          <div className="flex items-center justify-between border-b border-[#E8EBEF] px-5 py-4">

            <div>

              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#98A2B3]">
                CANDIDATE ASSESSMENT
              </p>

              <p className="mt-1 text-[13px] font-semibold text-[#273244]">
                Backend Developer Screening
              </p>

            </div>


            <span className="rounded-full bg-[#EAF7F0] px-2.5 py-1 text-[8px] font-bold text-[#28734E]">
              In progress
            </span>

          </div>


          <div className="p-5">

            <div className="flex items-start justify-between gap-5">

              <div>

                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#98A2B3]">
                  QUESTION 18 OF 24
                </p>

                <h3 className="mt-3 max-w-xl text-[22px] font-semibold leading-8 tracking-[-0.02em] text-[#18212F]">
                  An API starts returning duplicate records after a pagination change. What would you inspect first, and why?
                </h3>

              </div>


              <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#EAE5F9] text-[#6756B8] sm:flex">
                <FileQuestion size={19} />
              </div>

            </div>


            <div className="mt-7 flex items-center justify-between gap-4">

              <div className="flex items-center gap-2 text-[10px] font-semibold text-[#7A8697]">

                <ClockBadge />

                04:18 remaining

              </div>


              <div className="flex items-center gap-2 text-[10px] font-semibold text-[#7A8697]">

                <span className="h-2 w-2 rounded-full bg-[#6756B8]" />

                PostgreSQL

              </div>

            </div>


            <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#EEF0F3]">

              <div className="h-full w-[75%] rounded-full bg-[#7D91E8]" />

            </div>


            <div className="mt-7 rounded-[18px] border border-[#E2E6EB] bg-white p-4">

              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#98A2B3]">
                YOUR RESPONSE
              </p>


              <div className="mt-3 h-[102px] rounded-xl border border-[#E7E9EE] bg-[#FBFCFD] px-4 py-3 text-[11px] leading-6 text-[#B0B7C3]">
                Type your answer here...
              </div>

            </div>


            <div className="mt-5 flex items-center justify-between">

              <span className="inline-flex items-center gap-2 text-[10px] font-semibold text-[#7D8796]">

                <LockKeyhole size={12} />

                Your response is autosaved

              </span>


              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl bg-[#5148B9] px-4 py-2.5 text-[11px] font-bold text-white"
              >

                Save & continue

                <ArrowRight size={12} />

              </button>

            </div>

          </div>

        </div>

      </div>


      <div className="absolute -right-5 top-[18%] hidden rounded-2xl border border-[#DCE0E6] bg-white px-3.5 py-3 shadow-[0_16px_32px_rgba(24,34,52,0.11)] sm:block">

        <div className="flex items-center gap-2.5">

          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#E5F7F3] text-[#0F9D8A]">
            <ShieldCheck size={14} />
          </span>


          <div>

            <p className="text-[9px] font-bold text-[#344054]">
              Structured
            </p>

            <p className="mt-0.5 text-[8px] text-[#98A2B3]">
              Role-aligned assessment
            </p>

          </div>

        </div>

      </div>

    </div>
  );
}


/* ============================================================
   CLOCK BADGE
============================================================ */

function ClockBadge() {
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#F3F0FC] text-[#6756B8]">

      <span className="h-2.5 w-2.5 rounded-full border-2 border-[#6756B8]" />

    </span>
  );
}


/* ============================================================
   CONTROL CARD
============================================================ */

function ControlCard({
  icon,
  title,
  text,
  tag,
  background,
  color,
}) {
  return (
    <div className="group relative overflow-hidden rounded-[22px] border border-[#DCE1E8] bg-white p-6 transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_38px_rgba(24,34,52,0.08)]">

      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{
          backgroundColor: color,
        }}
      />


      <div className="flex items-start justify-between gap-3">

        <div
          className="flex h-11 w-11 items-center justify-center rounded-xl transition duration-300 group-hover:scale-105"
          style={{
            backgroundColor:
              background,
            color,
          }}
        >
          {icon}
        </div>


        <span
          className="text-[9px] font-bold tracking-[0.15em]"
          style={{
            color,
          }}
        >
          {tag}
        </span>

      </div>


      <h3 className="mt-6 text-[18px] font-semibold tracking-[-0.015em] text-[#273244]">
        {title}
      </h3>


      <p className="mt-2.5 text-[13.5px] leading-6 text-[#6E7887]">
        {text}
      </p>


      <div className="mt-6 flex items-center gap-1 text-[10px] font-bold text-[#5A4DB4]">

        Learn more

        <ArrowRight
          size={11}
          className="transition-transform duration-200 group-hover:translate-x-1"
        />

      </div>

    </div>
  );
}


export default Landing;