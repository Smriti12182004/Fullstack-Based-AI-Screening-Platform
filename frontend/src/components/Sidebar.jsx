import { NavLink } from "react-router-dom";

import {
  BriefcaseBusiness,
  CircleHelp,
  ClipboardCheck,
  FileQuestion,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Sparkles,
  UserCog,
  WandSparkles,
} from "lucide-react";

import evalynLogo from "../assets/evalyn-logo.png";
import evalynLetter from "../assets/evalyn-letter.png";

import { useAuth } from "../context/AuthContext";


const ROLE_LABELS = {
  organization_admin: "Organization Administrator",
  recruiter: "Recruiter",
  assessment_manager: "Assessment Manager",
  assessment_reviewer: "Assessment Reviewer",
  candidate: "Candidate",
};


function Sidebar() {
  const { auth } = useAuth();

  const role = auth?.role || "";

  const roleLabel =
    ROLE_LABELS[role] ||
    role
      .replace(/_/g, " ")
      .replace(/\b\w/g, (character) =>
        character.toUpperCase()
      ) ||
    "Workspace";

  const navItemsByRole = {
    recruiter: [
      {
        name: "Dashboard",
        path: "/dashboard",
        icon: LayoutDashboard,
        accent: "role",
      },
      {
        name: "Jobs",
        path: "/jobs",
        icon: BriefcaseBusiness,
        accent: "screen",
      },
    ],

    assessment_manager: [
      {
        name: "Question Bank",
        path: "/questions",
        icon: FileQuestion,
        accent: "prepare",
      },
    ],

    assessment_reviewer: [
      {
        name: "Assessment Review",
        path: "/review",
        icon: ClipboardCheck,
        accent: "review",
      },
    ],

    organization_admin: [],
  };

  const navItems = navItemsByRole[role] || [];

  const accentStyles = {
    role: {
      icon: "bg-[#CFDEFC] text-[#4A61C8]",
      activeIcon:
        "bg-gradient-to-br from-[#CFDEFC] to-[#DDE5FC] text-[#4A61C8]",
      glow: "bg-[#9FB1FE]",
      dot: "bg-[#4A61C8]",
    },

    screen: {
      icon: "bg-[#EAE5F9] text-[#7862C8]",
      activeIcon:
        "bg-gradient-to-br from-[#EAE5F9] to-[#F0ECFC] text-[#7862C8]",
      glow: "bg-[#D4C6F8]",
      dot: "bg-[#7862C8]",
    },

    prepare: {
      icon: "bg-[#F3E3F2] text-[#AA5E9C]",
      activeIcon:
        "bg-gradient-to-br from-[#F3E3F2] to-[#F8EAF5] text-[#AA5E9C]",
      glow: "bg-[#EDBFE5]",
      dot: "bg-[#AA5E9C]",
    },

    review: {
      icon: "bg-[#FAEDEA] text-[#A76D5B]",
      activeIcon:
        "bg-gradient-to-br from-[#FAEDEA] to-[#FDF3F0] text-[#A76D5B]",
      glow: "bg-[#FFD8C7]",
      dot: "bg-[#A76D5B]",
    },
  };

  return (
    <aside
      className="
        group sticky top-0 flex h-screen w-[78px] shrink-0 flex-col
        overflow-hidden border-r border-[#3B3D63]
        bg-gradient-to-b from-[#26284F] via-[#292B55] to-[#222447]
        text-white
        shadow-[6px_0_30px_rgba(38,40,79,0.08)]
        transition-[width] duration-300 ease-in-out
        hover:w-[250px]
      "
    >
      {/* =====================================================
          DECORATIVE BACKGROUND
      ===================================================== */}

      <div
        className="
          pointer-events-none absolute -right-16 -top-16
          h-40 w-40 rounded-full
          bg-[#9FB1FE]/10 blur-3xl
        "
      />

      <div
        className="
          pointer-events-none absolute -left-16 bottom-24
          h-40 w-40 rounded-full
          bg-[#EDBFE5]/10 blur-3xl
        "
      />

      <div
        className="
          pointer-events-none absolute right-[-40px] top-[42%]
          h-32 w-32 rounded-full
          bg-[#D4C6F8]/10 blur-3xl
        "
      />

      {/* =====================================================
          BRAND
      ===================================================== */}

      <div
        className="
          relative flex h-16 w-full shrink-0
          items-center justify-center
          overflow-hidden
          border-b border-[#3B3D63]
          bg-[#26284F]
        "
      >
        {/* Collapsed brand */}

        <img
          src={evalynLetter}
          alt="Evalyn"
          className="
            h-[42px] w-[42px]
            shrink-0
            object-contain
            transition-all duration-300
            group-hover:scale-75
            group-hover:opacity-0
          "
        />

        {/* Expanded brand */}

        <img
          src={evalynLogo}
          alt="Evalyn - AI Screening Platform"
          className="
            pointer-events-none
            absolute left-1/2
            h-auto w-[150px]
            -translate-x-1/2
            translate-y-[1px]
            object-contain
            opacity-0
            transition-all duration-300
            group-hover:opacity-100
          "
        />
      </div>

      {/* =====================================================
          NAVIGATION
      ===================================================== */}

      <nav
        className="
          relative flex-1 px-2 py-6
          transition-all duration-300
          group-hover:px-4
        "
      >
        <p
          className="
            mb-3 overflow-hidden whitespace-nowrap
            px-3 text-[9px] font-bold uppercase
            tracking-[0.2em] text-[#B9BCE0]
            opacity-0 transition-opacity duration-200
            group-hover:opacity-100
          "
        >
          Workspace
        </p>

        {navItems.length > 0 ? (
          <div className="space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const style = accentStyles[item.accent];

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  title={item.name}
                  className={({ isActive }) =>
                    `
                      group/item relative flex items-center rounded-xl
                      py-3 text-sm font-medium
                      transition-all duration-200

                      ${
                        isActive
                          ? "bg-white text-[#26284F] shadow-[0_10px_24px_rgba(0,0,0,0.16)]"
                          : "text-[#D7D9E8] hover:bg-white/[0.08] hover:text-white"
                      }

                      ${
                        isActive
                          ? "justify-start px-3.5"
                          : "justify-center px-2 group-hover:justify-start group-hover:px-3.5"
                      }
                    `
                  }
                >
                  {({ isActive }) => (
                    <>
                      {/* Active indicator */}

                      {isActive && (
                        <span
                          className="
                            absolute left-0 top-1/2 h-8 w-1
                            -translate-y-1/2 rounded-r-full
                            bg-gradient-to-b
                            from-[#5658E8]
                            via-[#7862C8]
                            to-[#AA5E9C]
                          "
                        />
                      )}

                      {/* Icon */}

                      <span
                        className={`
                          relative flex h-9 w-9 shrink-0
                          items-center justify-center rounded-xl
                          transition-all duration-200

                          ${isActive ? style.activeIcon : style.icon}

                          group-hover/item:scale-105
                        `}
                      >
                        <span
                          className={`
                            absolute inset-0 rounded-xl
                            opacity-0 blur-md
                            transition-opacity duration-200
                            group-hover/item:opacity-30
                            ${style.glow}
                          `}
                        />

                        <Icon
                          size={17}
                          strokeWidth={1.9}
                          className="relative z-10"
                        />
                      </span>

                      {/* Label */}

                      <span
                        className="
                          ml-3 overflow-hidden whitespace-nowrap
                          text-[13px] font-semibold
                          opacity-0 transition-all duration-200
                          group-hover:opacity-100
                        "
                      >
                        {item.name}
                      </span>

                      {/* Active dot */}

                      {isActive && (
                        <span
                          className={`
                            ml-auto mr-1 h-1.5 w-1.5
                            rounded-full
                            ${style.dot}
                            opacity-0
                            transition-opacity duration-200
                            group-hover:opacity-100
                          `}
                        />
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        ) : (
          <div
            className="
              hidden rounded-xl border border-[#484B78]
              bg-white/[0.05] px-3 py-3
              text-[11px] leading-5 text-[#B9BCE0]
              group-hover:block
            "
          >
            Your workspace navigation will appear here.
          </div>
        )}

        {/* =================================================
            AI WORKSPACE
        ================================================= */}

        {(role === "recruiter" ||
          role === "assessment_manager" ||
          role === "assessment_reviewer") && (
          <div className="mt-9">
            <p
              className="
                mb-3 overflow-hidden whitespace-nowrap
                px-3 text-[9px] font-bold uppercase
                tracking-[0.2em] text-[#B9BCE0]
                opacity-0 transition-opacity duration-200
                group-hover:opacity-100
              "
            >
              AI Workspace
            </p>

            <div
              className="
                relative overflow-hidden rounded-2xl
                border border-[#484B78]
                bg-white/[0.05]
                backdrop-blur-sm
                transition-all duration-300
                group-hover:bg-white/[0.08]
              "
            >
              <div
                className="
                  pointer-events-none absolute -right-5 -top-5
                  h-20 w-20 rounded-full
                  bg-[#D4C6F8]/15 blur-2xl
                "
              />

              <div
                className="
                  relative flex items-center gap-2
                  p-2.5 transition-all duration-300
                  group-hover:p-4
                "
              >
                <div
                  className="
                    relative flex h-9 w-9 shrink-0
                    items-center justify-center rounded-xl
                    bg-gradient-to-br
                    from-[#EAE5F9] to-[#F3E3F2]
                    text-[#7862C8]
                    shadow-sm
                  "
                >
                  <Sparkles size={16} strokeWidth={2} />

                  <span
                    className="
                      absolute -right-0.5 -top-0.5
                      h-2 w-2 rounded-full
                      bg-[#35A66D]
                      ring-2 ring-[#26284F]
                    "
                  />
                </div>

                <div
                  className="
                    min-w-0 overflow-hidden whitespace-nowrap
                    opacity-0 transition-opacity duration-200
                    group-hover:opacity-100
                  "
                >
                  <p className="text-xs font-bold text-white">
                    AI Pipeline
                  </p>

                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#35A66D]" />

                    <span className="text-[10px] font-medium text-[#C2C5E0]">
                      Systems ready
                    </span>
                  </div>
                </div>
              </div>

              <div
                className="
                  hidden border-t border-[#3B3D63]
                  px-4 pb-4 pt-3
                  group-hover:block
                "
              >
                <div className="space-y-2">

                  {(role === "recruiter" ||
                    role === "assessment_manager") && (
                    <AIPipelineItem
                      icon={<BriefcaseBusiness size={12} />}
                      label="Skill extraction"
                      color="screen"
                    />
                  )}

                  {role === "assessment_manager" && (
                    <AIPipelineItem
                      icon={<WandSparkles size={12} />}
                      label="Question generation"
                      color="prepare"
                    />
                  )}

                  {role === "assessment_reviewer" && (
                    <AIPipelineItem
                      icon={<ClipboardCheck size={12} />}
                      label="Assessment review"
                      color="review"
                    />
                  )}

                </div>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* =====================================================
          BOTTOM ACTIONS
      ===================================================== */}

      <div
        className="
          relative border-t border-[#3B3D63]
          px-2 py-4
          transition-all duration-300
          group-hover:px-4
        "
      >
        <div className="space-y-1.5">
          <SidebarAction
            icon={<Settings size={16} />}
            label="Settings"
          />

          <SidebarAction
            icon={<CircleHelp size={16} />}
            label="Help & Support"
          />
        </div>

        {/* Workspace status */}

        <div
          className="
            mt-4 hidden overflow-hidden rounded-2xl
            border border-[#484B78]
            bg-[#202244]
            px-3.5 py-3
            group-hover:block
          "
        >
          <div className="flex items-center justify-between">
            <p
              className="
                text-[9px] font-bold uppercase
                tracking-[0.15em] text-[#A8ACD0]
              "
            >
              Workspace
            </p>

            <span
              className="
                flex items-center gap-1.5 rounded-full
                bg-[#303258] px-2 py-1
                text-[8px] font-semibold text-[#B9E8D0]
              "
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#35A66D]" />
              Active
            </span>
          </div>

          <p className="mt-1.5 text-[11px] font-semibold text-white">
            {roleLabel} Workspace
          </p>
        </div>
      </div>
    </aside>
  );
}


/* ============================================================
   AI PIPELINE ITEM
============================================================ */

function AIPipelineItem({
  icon,
  label,
  color,
}) {
  const colors = {
    screen: {
      icon: "bg-[#EAE5F9] text-[#7862C8]",
      dot: "bg-[#7862C8]",
    },

    prepare: {
      icon: "bg-[#F3E3F2] text-[#AA5E9C]",
      dot: "bg-[#AA5E9C]",
    },

    review: {
      icon: "bg-[#FAEDEA] text-[#A76D5B]",
      dot: "bg-[#A76D5B]",
    },
  };

  const style = colors[color];

  return (
    <div
      className="
        flex items-center gap-2.5 rounded-xl
        bg-white/[0.05] px-2.5 py-2
        transition hover:bg-white/[0.09]
      "
    >
      <span
        className={`
          flex h-7 w-7 shrink-0
          items-center justify-center
          rounded-lg
          ${style.icon}
        `}
      >
        {icon}
      </span>

      <span
        className="
          flex-1 truncate
          text-[10px] font-medium
          text-[#D2D3E4]
        "
      >
        {label}
      </span>

      <span
        className={`
          h-1.5 w-1.5 shrink-0 rounded-full
          ${style.dot}
        `}
      />
    </div>
  );
}


/* ============================================================
   SIDEBAR ACTION
============================================================ */

function SidebarAction({
  icon,
  label,
}) {
  return (
    <button
      type="button"
      title={label}
      className="
        group/action flex w-full items-center
        justify-center rounded-xl py-2.5
        text-sm text-[#D7D9E8]
        transition-all duration-200
        hover:bg-white/[0.08]
        hover:text-white
        group-hover:justify-start
        group-hover:px-3.5
      "
    >
      <span
        className="
          flex h-8 w-8 shrink-0
          items-center justify-center
          rounded-lg
          bg-white/[0.05]
          text-[#B9BCE0]
          transition-all duration-200
          group-hover/action:bg-white/[0.10]
          group-hover/action:text-white
        "
      >
        {icon}
      </span>

      <span
        className="
          ml-3 overflow-hidden whitespace-nowrap
          text-xs font-medium
          opacity-0 transition-opacity duration-200
          group-hover:opacity-100
        "
      >
        {label}
      </span>
    </button>
  );
}


export default Sidebar;