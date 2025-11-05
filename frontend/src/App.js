import { BrowserRouter, Routes, Route } from "react-router-dom";
import SuperAdmin from "./components/superadminpanel/SuperAdmin";
import AdminDashboard from "./components/superadminpanel/AdminDashboard";
import Home from "./components/landingpage/Home";
import CompanyDashboard from "./components/CompanyDashboard";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
               {/* <Route path="/" element={<SuperAdmin />} />
        <Route path="/admin-dashboard" element={<AdminDashboard />} /> */}
         <Route path="/company-dashboard" element={<CompanyDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}
