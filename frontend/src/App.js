import { BrowserRouter, Routes, Route } from "react-router-dom";
import SuperAdmin from "./components/SuperAdmin";
import AdminDashboard from "./components/AdminDashboard";
import Home from "./components/landingpage/Home";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* <Route path="/" element={<Home />} /> */}
        <Route path="/" element={<SuperAdmin />} />
        <Route path="/admin-dashboard" element={<AdminDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}
