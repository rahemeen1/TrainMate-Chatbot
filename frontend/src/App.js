import { BrowserRouter, Routes, Route } from "react-router-dom";
import SuperAdmin from "./components/SuperAdmin";
import AdminDashboard from "./components/AdminDashboard";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
               <Route path="/superadmin" element={<SuperAdmin />} />
        <Route path="/admin-dashboard" element={<AdminDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}
