import { useState, useEffect } from "react";
import { Users, Building2, UserPlus, LogOut, Menu, X } from "lucide-react";
import { collection, collectionGroup, getDocs, query, where } from "firebase/firestore";
import { db } from "../../firebase"; 
import SuperAdminSettings from "./SuperAdminSettings";
import AddCompany from "./AddCompany";
import { useNavigate } from "react-router-dom";
import ViewCompanies from "./ViewCompanies";
import ManageCompanies from "./ManageCompanies";
import SuperAdminAnalytics from "./SuperAdminAnalytics";


export default function AdminDashboard() {
  const [activeSection, setActiveSection] = useState("overview");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [stats, setStats] = useState({
    companies: 0,
    totalCompanies: 0,
    users: 0,
    admins: 1,
  });
  const [analytics, setAnalytics] = useState({
    inactiveCompanies: 0,
    newCompaniesThisMonth: 0,
    onboardingCompletionRate: 0,
    profileCompletenessRate: 0,
    cityDistribution: [],
    growthTimeline: [],
    hiringTimelineDistribution: [],
    teamSizeDistribution: [],
    recentCompanies: [],
  });

  const navigate = useNavigate();

  const extractAnswerValue = (answers, preferredKey) => {
    if (!answers) return null;
    if (Array.isArray(answers)) {
      const index = Number(preferredKey) - 1;
      const value = answers[index];
      return typeof value === "string" ? value : null;
    }
    if (typeof answers === "object") {
      const directValue = answers[preferredKey] ?? answers[String(preferredKey)];
      if (typeof directValue === "string") return directValue;
    }
    return null;
  };

  const fetchStats = async () => {
    try {
      const [activeCompaniesSnap, totalCompaniesSnap, freshersSnap] = await Promise.all([
        getDocs(query(collection(db, "companies"), where("status", "==", "active"))),
        getDocs(collection(db, "companies")),
        getDocs(collectionGroup(db, "users")),
      ]);

      const activeCompanies = activeCompaniesSnap.size;
      const totalCompanies = totalCompaniesSnap.size;
      const totalUsers = freshersSnap.size;

      const companiesData = totalCompaniesSnap.docs.map((companyDoc) => ({
        id: companyDoc.id,
        ...companyDoc.data(),
      }));

      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      let newCompaniesThisMonth = 0;
      let onboardingCompleted = 0;
      let profileComplete = 0;
      const cityCountMap = {};
      const growthMap = {};

      const onboardingDetails = await Promise.all(
        companiesData.map(async (company) => {
          const onboardingSnap = await getDocs(
            collection(db, "companies", company.id, "onboardingAnswers")
          );

          const answersDocs = onboardingSnap.docs
            .map((docSnap) => docSnap.data())
            .sort((a, b) => {
              const aTime = a?.createdAt?.seconds || a?.createdAt?._seconds || 0;
              const bTime = b?.createdAt?.seconds || b?.createdAt?._seconds || 0;
              return bTime - aTime;
            });

          const latestAnswers = answersDocs[0]?.answers;

          return {
            companyId: company.id,
            hasOnboarding: onboardingSnap.size > 0,
            hiringTimelineAnswer: extractAnswerValue(latestAnswers, "1"),
            teamSizeAnswer: extractAnswerValue(latestAnswers, "2"),
          };
        })
      );

      const onboardingMap = onboardingDetails.reduce((acc, item) => {
        acc[item.companyId] = item;
        return acc;
      }, {});

      const hiringTimelineMap = {};
      const teamSizeMap = {};

      companiesData.forEach((company) => {
        const createdAtSeconds = company?.createdAt?.seconds || company?.createdAt?._seconds;
        const createdDate = createdAtSeconds ? new Date(createdAtSeconds * 1000) : null;

        if (createdDate) {
          const monthKey = createdDate.toLocaleString("en-US", {
            month: "short",
            year: "2-digit",
          });
          growthMap[monthKey] = (growthMap[monthKey] || 0) + 1;

          if (
            createdDate.getMonth() === currentMonth &&
            createdDate.getFullYear() === currentYear
          ) {
            newCompaniesThisMonth += 1;
          }
        }

        const city = (company.address || "Unknown").split(",")[0].trim() || "Unknown";
        cityCountMap[city] = (cityCountMap[city] || 0) + 1;

        const profileFields = [company.name, company.email, company.phone, company.address, company.status];
        if (profileFields.every(Boolean)) {
          profileComplete += 1;
        }

        const onboarding = onboardingMap[company.id];
        if (onboarding?.hasOnboarding) {
          onboardingCompleted += 1;
          if (onboarding.hiringTimelineAnswer) {
            hiringTimelineMap[onboarding.hiringTimelineAnswer] =
              (hiringTimelineMap[onboarding.hiringTimelineAnswer] || 0) + 1;
          }
          if (onboarding.teamSizeAnswer) {
            teamSizeMap[onboarding.teamSizeAnswer] =
              (teamSizeMap[onboarding.teamSizeAnswer] || 0) + 1;
          }
        }
      });

      const growthTimeline = Object.entries(growthMap).map(([name, value]) => ({
        name,
        value,
      }));

      const cityDistribution = Object.entries(cityCountMap)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6);

      const hiringTimelineDistribution = Object.entries(hiringTimelineMap)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

      const teamSizeDistribution = Object.entries(teamSizeMap)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

      const recentCompanies = [...companiesData]
        .sort((a, b) => {
          const aTime = a?.createdAt?.seconds || a?.createdAt?._seconds || 0;
          const bTime = b?.createdAt?.seconds || b?.createdAt?._seconds || 0;
          return bTime - aTime;
        })
        .slice(0, 8)
        .map((company) => ({
          id: company.id,
          name: company.name || "—",
          status: company.status || "unknown",
          email: company.email || "—",
          address: company.address || "—",
          createdAt: company.createdAt || null,
        }));

      setStats({
        companies: activeCompanies,
        totalCompanies,
        users: totalUsers,
        admins: 1,
      });

      setAnalytics({
        inactiveCompanies: Math.max(0, totalCompanies - activeCompanies),
        newCompaniesThisMonth,
        onboardingCompletionRate: totalCompanies
          ? Math.round((onboardingCompleted / totalCompanies) * 100)
          : 0,
        profileCompletenessRate: totalCompanies
          ? Math.round((profileComplete / totalCompanies) * 100)
          : 0,
        cityDistribution,
        growthTimeline,
        hiringTimelineDistribution,
        teamSizeDistribution,
        recentCompanies,
      });
    } catch (err) {
      console.error("❌ Error fetching stats from Firestore:", err);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleSectionChange = (section) => {
    setActiveSection(section);
    setIsSidebarOpen(false);
  };


  return (
    <div className="min-h-screen bg-[#02142B] text-white md:flex">
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-[#00FFFF30] bg-[#031C3A]">
        <h2 className="text-lg font-bold text-[#00FFFF]">Super Admin</h2>
        <button
          className="text-[#AFCBE3]"
          onClick={() => setIsSidebarOpen((prev) => !prev)}
          aria-label="Toggle sidebar"
        >
          {isSidebarOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      <div
        className={`${isSidebarOpen ? "block" : "hidden"} md:block w-full md:w-64 bg-[#031C3A] border-r border-[#00FFFF30] shadow-lg p-6`}
      >
         {/* Logo */}
      <div className="text-center mb-6">
        <div className="w-16 h-16 mx-auto bg-[#00FFFF]/20 rounded-2xl flex items-center justify-center shadow-[0_0_18px_#00FFFF50] border border-[#00FFFF30]">
          <span className="text-[#00FFFF] font-extrabold text-xl">TM</span>
        </div>
        <h1 className="text-[#00FFFF] font-bold text-xl mt-1">TrainMate</h1>
       </div>
        <ul className="space-y-4 text-[#AFCBE3]">
          <li
            className={`cursor-pointer p-2 rounded-lg ${
              activeSection === "overview" ? "bg-[#00FFFF]/20" : ""
            }`}
            onClick={() => handleSectionChange("overview")}
          >
            Dashboard Overview
          </li>

          <li
            className={`cursor-pointer p-2 rounded-lg ${
              activeSection === "addCompany" ? "bg-[#00FFFF]/20" : ""
            }`}
            onClick={() => handleSectionChange("addCompany")}
          >
            Add New Company
          </li>

          <li
            className={`cursor-pointer p-2 rounded-lg ${
              activeSection === "viewCompanies" ? "bg-[#00FFFF]/20" : ""
            }`}
            onClick={() => handleSectionChange("viewCompanies")}
          >
            View Companies
          </li>

           <li
            className={`cursor-pointer p-2 rounded-lg ${
              activeSection === "manageCompanies" ? "bg-[#00FFFF]/20" : ""
            }`}
            onClick={() => handleSectionChange("manageCompanies")}
          >
            Manage Companies
          </li>

          <li
            className={`cursor-pointer p-2 rounded-lg ${
              activeSection === "manageAdmins" ? "bg-[#00FFFF]/20" : ""
            }`}
            onClick={() => handleSectionChange("manageAdmins")}
          >
            Settings
          </li>

          <li
            className="cursor-pointer p-2 rounded-lg flex items-center gap-2 text-red-400"
            onClick={() => navigate("/")}
          >
            <LogOut size={16} /> Logout
          </li>
        </ul>
      </div>

      <div className="flex-1 p-4 sm:p-6 lg:p-10">
          {activeSection === "overview" }
          {activeSection === "addCompany" }
          {activeSection === "viewCompanies" }
          {activeSection === "manageCompanies" }
          {activeSection === "manageAdmins" }

        {activeSection === "overview" && (
          <div className="max-w-7xl mx-auto space-y-8">
            <div className="bg-[#031C3A]/70 border border-[#00FFFF30] rounded-2xl p-5 sm:p-6">
              <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                  <p className="text-xs tracking-[0.18em] uppercase text-[#8EB6D3]">Dashboard</p>
                  <h2 className="text-2xl sm:text-3xl font-bold text-[#E8F7FF] mt-1">
                    Super Admin Panel
                  </h2>
                </div>
                <div className="text-sm text-[#AFCBE3]">
                  {new Date().toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard title="Companies Onboard" value={stats.companies} icon={<Building2 />} />
              <StatCard title="Total Companies" value={stats.totalCompanies} icon={<Building2 />} />
              <StatCard title="Total Users" value={stats.users} icon={<Users />} />
              <StatCard title="Super Admins" value={stats.admins} icon={<UserPlus />} />
            </div>

            <SuperAdminAnalytics stats={stats} analytics={analytics} />
          </div>
        )}

        {activeSection === "addCompany" && <AddCompany />}
        {activeSection === "manageAdmins" && <SuperAdminSettings />}
        {activeSection === "viewCompanies" && <ViewCompanies />}
        {activeSection === "manageCompanies" && <ManageCompanies />}
      </div>
    </div>
  );
}

function StatCard({ title, value, icon }) {
  return (
    <div className="h-full bg-[#031C3A]/70 border border-[#00FFFF30] rounded-xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-[#9FC2DA]">{title}</p>
        <span className="text-[#00FFFF] shrink-0">{icon}</span>
      </div>
      <p className="text-2xl font-bold text-[#E8F7FF] mt-1">{value}</p>
    </div>
  );
}