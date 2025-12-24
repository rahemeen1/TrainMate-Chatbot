import { useState, useEffect } from "react";
import { Users, Building2, UserPlus, LogOut } from "lucide-react";
import NewSuperAdmin from "./NewSuperAdmin";
import ManageSuperAdmins from "./ManageSuperAdmins";
import AddCompany from "./AddCompany";
import { useNavigate } from "react-router-dom";
import ViewCompanies from "./ViewCompanies";
import ManageCompanies from "./ManageCompanies";

export default function AdminDashboard() {
  const [activeSection, setActiveSection] = useState("overview");
  const [stats, setStats] = useState({
    companies: 0,
    users: 0,
    admins: 0
  });
  const navigate = useNavigate();
   const fetchStats = async () => {
    try {
      const comp = await fetch("http://localhost:5000/stats/companies").then(r => r.json());
      const users = await fetch("http://localhost:5000/stats/users").then(r => r.json());
      const admins = await fetch("http://localhost:5000/stats/superadmins").then(r => r.json());

      setStats({
        companies: comp.count,
        users: users.count,
        admins: admins.count
      });
    } catch (error) {
      console.error("❌ Error fetching stats", error);
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
              activeSection === "addAdmin" ? "bg-[#00FFFF]/20" : ""
            }`}
            onClick={() => setActiveSection("addAdmin")}
          >
            Add Super Admin
          </li>

          <li
            className={`cursor-pointer p-2 rounded-lg ${
              activeSection === "manageAdmins" ? "bg-[#00FFFF]/20" : ""
            }`}
            onClick={() => setActiveSection("manageAdmins")}
          >
            Manage Super Admins
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
          {activeSection === "manageAdmins" && "Manage Super Admins"}
        </h1>

        {/* ✅ Overview Stats */}
       {activeSection === "overview" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <StatCard title="Companies Onboard" value={stats.companies} icon={<Building2 />} />
            <StatCard title="Total Users" value={stats.users} icon={<Users />} />
            <StatCard title="Super Admins" value={stats.admins} icon={<UserPlus />} />
          </div>
        )}

        {/* ✅ Add Company Page */}
        {activeSection === "addCompany" && <AddCompany />}

        {/* ✅ Add Super Admin Form */}
        {activeSection === "addAdmin" && <NewSuperAdmin />}

        {/* ✅ Manage Super Admins */}
        {activeSection === "manageAdmins" && <ManageSuperAdmins />}
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
