import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";

function RecruiterLayout({
  children,
  title = "Dashboard",
  breadcrumb = "Workspace",
}) {
  return (
    <div className="min-h-screen bg-[#F5F8FC] flex">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <Topbar title={title} breadcrumb={breadcrumb} />
        <main className="p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

export default RecruiterLayout;