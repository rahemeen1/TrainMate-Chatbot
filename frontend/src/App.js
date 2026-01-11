import { BrowserRouter, Routes, Route } from "react-router-dom";
import AdminDashboard from "./components/superadminpanel/AdminDashboard";
import Home from "./components/landingpage/Home";
import CompanyDashboard from "./components/CompanySpecific/CompanyDashboard";
import ManageDepartments from "./components/CompanySpecific/ManageDepartments";
import DepartmentDetails from "./components/CompanySpecific/DepartmentDetails";
import FresherDashboard from "./components/Fresher/FresherDashboard";
import FresherSettings from "./components/Fresher/FresherSettings";
import UserProfile from "./components/CompanySpecific/UserProfile";
import Manageuser from "./components/CompanySpecific/Manageuser";
import ActiveUsers from "./components/CompanySpecific/ActiveUsers";
import CompanySettings from "./components/CompanySpecific/CompanySettings";
import CompanyAnalytics from "./components/CompanySpecific/CompanyAnalytics";
import FresherTraining from "./components/Fresher/FresherTraining";
import FresherProgress from "./components/Fresher/FresherProgress";
import TotalUsers from "./components/CompanySpecific/TotalUsers";
import Roadmap from "./components/Fresher/Roadmap";
import Chatbot from "./components/Fresher/Chatbot";
import FresherAccomplishments from "./components/Fresher/FresherAccomplishments";
import PreviousChats from "./components/Fresher/PreviousChats";

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
        <Route path="/CompanySpecific/Manageuser" element={<Manageuser />} />
        <Route path="/CompanySpecific/ActiveUsers" element={<ActiveUsers />} />
        <Route path="/CompanySpecific/CompanyDashboard" element={<CompanyDashboard />} />
        <Route path="/CompanySpecific/CompanySettings" element={<CompanySettings />} />
        <Route path="/CompanySpecific/CompanyAnalytics" element={<CompanyAnalytics />} />
        <Route path="/fresher-training/:companyId/:deptId/:userId" element={<FresherTraining />}  />
        <Route path="/fresher-progress" element={<FresherProgress />} />
        <Route path="/CompanySpecific/TotalUsers" element={<TotalUsers />} />
        <Route path="/roadmap/:companyId/:deptId/:userId/:companyName" element={<Roadmap />} /> 
        <Route path="/chatbot" element={<Chatbot />} />
        <Route path="/accomplishments/:companyId/:deptId/:userId" element={<FresherAccomplishments />} />
        <Route path="/previous-chats" element={<PreviousChats />} />

      </Routes>

    </BrowserRouter>
  );
}
