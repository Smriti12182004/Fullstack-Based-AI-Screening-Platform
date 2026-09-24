import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";

function RecruiterLayout({
  children,
  title = "Dashboard",
  breadcrumb = "Workspace",
}) {
  return (
    <div className="min-h-screen bg-[#F5F8FC] flex">

      {/* Sidebar */}
      <Sidebar />

      {/* Main Application Area */}
      <div className="min-w-0 flex-1">

        {/* Topbar */}
        <Topbar
          title={title}
          breadcrumb={breadcrumb}
        />

        {/* Page Content */}
        <main className="p-6 lg:p-8">
          {children}
        </main>

      </div>
    </div>
  );
}

export default RecruiterLayout;