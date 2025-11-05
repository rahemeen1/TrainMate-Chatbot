import { BrowserRouter, Routes, Route } from "react-router-dom";
import SuperAdmin from "./components/superadminpanel/SuperAdmin";
import AdminDashboard from "./components/superadminpanel/AdminDashboard";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
               <Route path="/" element={<SuperAdmin />} />
        <Route path="/admin-dashboard" element={<AdminDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}
