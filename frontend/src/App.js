import { BrowserRouter, Routes, Route } from "react-router-dom";
import AdminDashboard from "./components/superadminpanel/AdminDashboard";
import Home from "./components/landingpage/Home";
import CompanyDashboard from "./components/CompanySpecific/CompanyDashboard";
import ManageDepartments from "./components/CompanySpecific/ManageDepartments";
import DepartmentDetails from "./components/CompanySpecific/DepartmentDetails";
import FresherDashboard from "./components/Fresher/FresherDashboard";
import FresherSettings from "./components/Fresher/FresherSettings";
import UserProfile from "./components/CompanySpecific/UserProfile";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/super-admin-dashboard" element={<AdminDashboard />} /> 
        <Route path="/company-dashboard" element={<CompanyDashboard />} />  
        <Route path="/manage-departments" element={<ManageDepartments />} /> 
        <Route path="/departments/:deptId" element={<DepartmentDetails />} />
        <Route path="/fresher-dashboard" element={<FresherDashboard />} /> 
        <Route path="/fresher-settings" element={<FresherSettings />} />
        <Route path="/user-profile/:companyId/:deptId/:userId" element={<UserProfile />} />

      </Routes>
    </BrowserRouter>
  );
}
