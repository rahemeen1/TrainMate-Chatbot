import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { FresherSideMenu } from "./FresherSideMenu";

export default function FresherShellLayout({
  userId,
  companyId,
  deptId,
  companyName,
  roadmapGenerated = false,
  isTrainingLocked = false,
  headerLabel = "Fresher Workspace",
  contentClassName = "",
  children,
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
    <div className="min-h-screen bg-[#031C3A] text-white">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside className="hidden lg:block lg:w-64 lg:flex-shrink-0">
          <div className="h-full min-h-screen bg-[#021B36]/90 border-r border-[#00FFFF]/20 p-4 overflow-x-hidden">
            <FresherSideMenu
              userId={userId}
              companyId={companyId}
              deptId={deptId}
              companyName={companyName}
              roadmapGenerated={roadmapGenerated}
              isTrainingLocked={isTrainingLocked}
              className="h-full"
            />
          </div>
        </aside>

        <div
          className={`fixed inset-0 z-[70] bg-black/55 transition-opacity duration-300 lg:hidden ${
            showMobileSidebar ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          }`}
          onClick={() => setShowMobileSidebar(false)}
        />

        <aside
          className={`fixed top-0 left-0 z-[75] h-screen w-72 max-w-[85vw] transform transition-transform duration-300 lg:hidden ${
            showMobileSidebar ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="h-full bg-[#021B36] border-r border-[#00FFFF2A] shadow-2xl p-4 overflow-x-hidden">
            <div className="mb-3 flex items-center justify-between border-b border-[#00FFFF1E] pb-2">
              <span className="text-sm font-semibold uppercase tracking-wide text-[#AFCBE3]">Menu</span>
              <button
                type="button"
                onClick={() => setShowMobileSidebar(false)}
                className="rounded-lg p-2 text-[#AFCBE3] hover:bg-[#00FFFF1A]"
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </div>
            <FresherSideMenu
              userId={userId}
              companyId={companyId}
              deptId={deptId}
              companyName={companyName}
              roadmapGenerated={roadmapGenerated}
              isTrainingLocked={isTrainingLocked}
              className="h-[calc(100vh-64px)]"
              onItemClick={() => setShowMobileSidebar(false)}
            />
          </div>
        </aside>

        <main className={`flex-1 min-w-0 ${contentClassName}`}>
          <div className="mb-2 flex items-center justify-between px-4 pt-4 lg:hidden">
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
