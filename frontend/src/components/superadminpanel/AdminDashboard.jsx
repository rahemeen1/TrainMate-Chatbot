import { useState, useEffect } from "react";
import { Users, Building2, UserPlus, LogOut } from "lucide-react";
import { collection, collectionGroup, getDocs, query, where } from "firebase/firestore";
import { db } from "../../firebase"; // <-- fixed path
import SuperAdminSettings from "./SuperAdminSettings";
import AddCompany from "./AddCompany";
import { useNavigate } from "react-router-dom";
import ViewCompanies from "./ViewCompanies";
import ManageCompanies from "./ManageCompanies";
import SuperAdminAnalytics from "./SuperAdminAnalytics";


export default function AdminDashboard() {
  const [activeSection, setActiveSection] = useState("overview");
  const [stats, setStats] = useState({
  companies: 0,        // ACTIVE
  totalCompanies: 0,   // ALL
  users: 0,
  admins: 1
});

  const navigate = useNavigate();
  const fetchStats = async () => {
  try {
    // 1️⃣ Count active companies
    const companiesSnap = await getDocs(
      query(collection(db, "companies"), where("status", "==", "active"))
    );
    const activeCompanies = companiesSnap.size;

    // 2️⃣ Count total companies
    const totalCompaniesSnap = await getDocs(collection(db, "companies"));
    const totalCompanies = totalCompaniesSnap.size;

    // 3️⃣ Count total freshers (all users in all departments)
    const freshersSnap = await getDocs(collectionGroup(db, "users"));
    const totalUsers = freshersSnap.size;

    setStats({
      companies: activeCompanies,
      totalCompanies: totalCompanies,
      users: totalUsers,
      admins: 1,
    });
  } catch (err) {
    console.error("❌ Error fetching stats from Firestore:", err);
  }
};
  useEffect(() => {
    fetchStats();
  }, []);


  return (
    <div className="flex min-h-screen bg-[#02142B] text-white">
      <div className="w-64 bg-[#031C3A] border-r border-[#00FFFF30] shadow-lg p-6">
        <h2 className="text-xl font-bold text-[#00FFFF] mb-8">Super Admin</h2>

        <ul className="space-y-4 text-[#AFCBE3]">
          <li
            className={`cursor-pointer p-2 rounded-lg ${
              activeSection === "overview" ? "bg-[#00FFFF]/20" : ""
            }`}
            onClick={() => setActiveSection("overview")}
          >
            Dashboard Overview
          </li>

          <li
            className={`cursor-pointer p-2 rounded-lg ${
              activeSection === "addCompany" ? "bg-[#00FFFF]/20" : ""
            }`}
            onClick={() => setActiveSection("addCompany")}
          >
            Add New Company
          </li>

          <li
            className={`cursor-pointer p-2 rounded-lg ${
              activeSection === "viewCompanies" ? "bg-[#00FFFF]/20" : ""
            }`}
            onClick={() => setActiveSection("viewCompanies")}
          >
            View Companies
          </li>

           <li
            className={`cursor-pointer p-2 rounded-lg ${
              activeSection === "manageCompanies" ? "bg-[#00FFFF]/20" : ""
            }`}
            onClick={() => setActiveSection("manageCompanies")}
          >
            Manage Companies
          </li>

          <li
            className={`cursor-pointer p-2 rounded-lg ${
              activeSection === "manageAdmins" ? "bg-[#00FFFF]/20" : ""
            }`}
            onClick={() => setActiveSection("manageAdmins")}
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

      {/* ✅ Main Content */}
      <div className="flex-1 p-10">
        <h1 className="text-3xl font-bold mb-6 text-[#E8F7FF]">
          {activeSection === "overview" && "Dashboard Overview"}
          {activeSection === "addCompany" && "Add New Company"}
          {activeSection === "viewCompanies" && "Registered Companies"}
          {activeSection === "addAdmin" && "Add Super Admin"}
          {activeSection === "manageAdmins" && "Super Admin Settings"}
        </h1>

        {/* ✅ Overview Stats */}
       {/* {activeSection === "overview" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <StatCard title="Companies Onboard" value={stats.companies} icon={<Building2 />} />
            <StatCard title="Total Users" value={stats.users} icon={<Users />} />
            <StatCard title="Super Admins" value={stats.admins} icon={<UserPlus />} />
          </div>
          
        )} */}
        {activeSection === "overview" && (
  <>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      <StatCard title="Companies Onboard" value={stats.companies} icon={<Building2 />} />
      <StatCard title="Total Users" value={stats.users} icon={<Users />} />
      <StatCard title="Super Admins" value={stats.admins} icon={<UserPlus />} />
    </div>

    <SuperAdminAnalytics stats={stats} />
  </>
)}


        {/* ✅ Add Company Page */}
        {activeSection === "addCompany" && <AddCompany />}

        {/* ✅ Manage Super Admins */}
        {activeSection === "manageAdmins" && <SuperAdminSettings />}
        {activeSection === "viewCompanies" && <ViewCompanies />}
        {activeSection === "manageCompanies" && <ManageCompanies />}
      </div>
    </div>
  );
}

/* ✅ Stat Card Component */
function StatCard({ title, value, icon }) {
  return (
    <div className="bg-[#031C3A]/70 border border-[#00FFFF30] rounded-xl p-6 shadow-[0_0_15px_rgba(0,255,255,0.15)] hover:shadow-[0_0_25px_rgba(0,255,255,0.25)] transition-all">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-[#AFCBE3]">{title}</h2>
        <span className="text-[#00FFFF]">{icon}</span>
      </div>
      <p className="text-3xl font-bold text-[#E8F7FF]">{value}</p>
    </div>
  );
}