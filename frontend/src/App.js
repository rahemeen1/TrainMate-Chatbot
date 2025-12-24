import { BrowserRouter, Routes, Route } from "react-router-dom";
import AdminDashboard from "./components/superadminpanel/AdminDashboard";
import Home from "./components/landingpage/Home";
import CompanyDashboard from "./components/CompanySpecific/CompanyDashboard";
import AuthModal from "./components/AuthModal";
import ManageDepartments from "./components/CompanySpecific/ManageDepartments";
import DepartmentDetails from "./components/CompanySpecific/DepartmentDetails";
import FresherDashboard from "./components/Fresher/FresherDashboard";


export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
       <Route path="/super-admin-dashboard" element={<AdminDashboard />} /> 
          <Route path="/company-dashboard" element={<CompanyDashboard />} />  
           <Route path="/company-dashboard" element={<CompanyDashboard />} />  
           <Route path="/auth" element={<AuthModal />} />  
            <Route path="/manage-departments" element={<ManageDepartments />} /> 
             <Route path="/departments/:deptId" element={<DepartmentDetails />} />
             <Route path="/fresher-dashboard" element={<FresherDashboard />} /> 
           
      </Routes>
    </BrowserRouter>
  );
}
