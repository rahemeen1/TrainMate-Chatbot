// import { BrowserRouter, Routes, Route } from "react-router-dom";
// import SuperAdmin from "./components/SuperAdmin";
// import AdminDashboard from "./components/AdminDashboard";

// export default function App() {
//   return (
//     <BrowserRouter>
//       <Routes>
//                <Route path="/superadmin" element={<SuperAdmin />} />
//         <Route path="/admin-dashboard" element={<AdminDashboard />} />
//       </Routes>
//     </BrowserRouter>
//   );
// }
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import SuperAdmin from "./components/SuperAdmin";
import AdminDashboard from "./components/AdminDashboard";
import Home from "./components/landingpage/Home";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Default route will now show Home page */}
        {/* <Route path="/" element={<Home />} /> */}
        {/* Default route (redirect to superadmin or admin-dashboard) */}
        <Route path="/" element={<Navigate to="/superadmin" />} />

        <Route path="/superadmin" element={<SuperAdmin />} />
        <Route path="/admin-dashboard" element={<AdminDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}

