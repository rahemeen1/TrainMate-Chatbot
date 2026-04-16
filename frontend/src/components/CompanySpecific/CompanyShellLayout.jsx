import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import CompanySidebar from "./CompanySidebar";

export default function CompanyShellLayout({
  companyId,
  companyName,
  headerLabel = "Company Workspace",
  children,
  contentClassName = "",
}) {
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setShowMobileSidebar(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="company-page-shell min-h-screen lg:relative">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside className="hidden lg:block lg:w-64 lg:flex-shrink-0 lg:fixed lg:inset-y-0 lg:left-0 lg:overflow-hidden">
          <CompanySidebar companyId={companyId} companyName={companyName} className="min-h-screen" />
        </aside>

        <div
          className={`fixed inset-0 z-[70] bg-black/50 transition-opacity duration-300 lg:hidden ${
            showMobileSidebar ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          }`}
          onClick={() => setShowMobileSidebar(false)}
        />

        <aside
          className={`fixed top-0 left-0 z-[75] h-screen w-72 max-w-[85vw] transform transition-transform duration-300 lg:hidden ${
            showMobileSidebar ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="h-full bg-[#021B36] shadow-2xl border-r border-[#00FFFF2A]">
            <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-[#00FFFF1E]">
              <span className="text-sm font-semibold tracking-wide text-[#AFCBE3] uppercase">Menu</span>
              <button
                type="button"
                onClick={() => setShowMobileSidebar(false)}
                className="p-2 rounded-lg text-[#AFCBE3] hover:bg-[#00FFFF1A]"
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </div>
            <CompanySidebar
              companyId={companyId}
              companyName={companyName}
              className="h-[calc(100vh-57px)] overflow-y-auto"
              onItemClick={() => setShowMobileSidebar(false)}
            />
          </div>
        </aside>

        <main className={`company-main-content flex-1 min-w-0 p-4 sm:p-6 lg:p-8 lg:ml-64 ${contentClassName}`}>
          <div className="mb-4 flex items-center justify-between lg:hidden">
            <button
              type="button"
              onClick={() => setShowMobileSidebar(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-[#00FFFF3A] bg-[#021B36]/85 px-3 py-2 text-[#AFCBE3] shadow-sm"
              aria-label="Open menu"
            >
              <Menu size={18} />
              <span className="text-sm font-semibold">Menu</span>
            </button>
            <span className="text-xs uppercase tracking-[0.14em] text-[#8EB6D3]">{headerLabel}</span>
          </div>

          {children}
        </main>
      </div>
    </div>
  );
}
