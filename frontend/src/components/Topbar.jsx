import {
  Bell,
  ChevronDown,
  Search,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";

function Topbar({
  title = "Dashboard",
  breadcrumb = "Workspace",
}) {
  const { auth } = useAuth();

  const role = auth?.role || "user";

  const displayRole =
    role.charAt(0).toUpperCase() + role.slice(1);

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-[#D7E5EC] bg-white/95 backdrop-blur">
      <div className="flex h-full items-center justify-between gap-5 px-5 lg:px-8">

        {/* Breadcrumb */}
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

        {/* Search */}
        <div className="hidden max-w-[440px] flex-1 md:block">
          <div className="flex h-10 items-center rounded-xl border border-[#D7E5EC] bg-[#F8FBFD] px-3.5 transition focus-within:border-[#1E6F8C] focus-within:bg-white focus-within:ring-4 focus-within:ring-[#1E6F8C]/10">
            <Search
              size={17}
              className="shrink-0 text-[#7F98A5]"
            />

            <input
              type="search"
              placeholder="Search jobs, candidates, questions..."
              className="ml-3 min-w-0 flex-1 bg-transparent text-sm text-[#142B3A] outline-none placeholder:text-[#9AAAB3]"
            />

            <kbd className="hidden rounded-md border border-[#D7E5EC] bg-white px-2 py-1 text-[10px] text-[#718894] lg:block">
              Ctrl K
            </kbd>
          </div>
        </div>

        {/* Right */}
        <div className="flex items-center gap-2">

          {/* Notifications */}
          <button
            type="button"
            className="relative flex h-10 w-10 items-center justify-center rounded-xl text-[#536D7A] transition hover:bg-[#EEF5F8] hover:text-[#123B5D]"
            aria-label="Notifications"
          >
            <Bell size={18} />

            <span className="absolute right-2.5 top-2 h-1.5 w-1.5 rounded-full bg-[#D65A4A]" />
          </button>

          {/* Profile */}
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl px-2 py-1.5 transition hover:bg-[#EEF5F8]"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#123B5D] text-xs font-semibold text-white">
              {displayRole.charAt(0)}
            </div>

            <div className="hidden text-left sm:block">
              <p className="text-xs font-semibold text-[#1F3544]">
                {displayRole}
              </p>

              <p className="text-[10px] text-[#718894]">
                {role}
              </p>
            </div>

            <ChevronDown
              size={15}
              className="text-[#718894]"
            />
          </button>
        </div>
      </div>
    </header>
  );
}

export default Topbar;