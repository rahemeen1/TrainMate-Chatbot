//CompanyDashboard.jsx
import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { db } from "../../firebase";
import { useNavigate, useLocation } from "react-router-dom";
import { doc, setDoc } from "firebase/firestore";
import CompanySidebar from "../../components/CompanySpecific/CompanySidebar";


const DEPARTMENT_OPTIONS = ["HR", "SOFTWAREDEVELOPMENT", "AI", "ACCOUNTING", "MARKETING", "OPERATIONS", "DATASCIENCE","IT"];

const QUESTIONS = [
  { text: "Select your departments", type: "multi-select", options: DEPARTMENT_OPTIONS },
  { text: "Training duration", type: "single-select", options: ["1 month", "3 months", "6 months"] },
  { text: "Batch size", type: "single-select", options: ["Small (5-10)", "Medium (10-20)", "Large (20+)"] },
   { text: "Tell us about your company", type: "text" },
];


export default function CompanyDashboard() {
  

  const navigate = useNavigate();
  const location = useLocation();

  const companyName = location?.state?.companyName || "Company";
  const companyId = location?.state?.companyId;

  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [selectedDepts, setSelectedDepts] = useState([]);
  const [answers, setAnswers] = useState({});
  const [hasDepartments, setHasDepartments] = useState(false); // checks if onboarding is needed
  const [totalUsers, setTotalUsers] = useState(0);
  const [activeUsers, setActiveUsers] = useState(0);
  const [chartData, setChartData] = useState([]);
  const [pieData, setPieData] = useState([]);
  

  useEffect(() => {
    if (companyId) {
      localStorage.setItem("companyId", companyId);
      localStorage.setItem("companyName", companyName);
    }
  }, [companyId, companyName]);

  // Redirect if no companyId
  useEffect(() => {
  const storedCompanyId = localStorage.getItem("companyId");
  if (!companyId && !storedCompanyId) {
    navigate("/", { replace: true });
  }
}, [companyId, navigate]);
console.log("companyId:", companyId);


  // Check if company already has departments
  useEffect(() => {
    const checkDepartments = async () => {
      try {
        const deptRef = collection(db, "companies", companyId, "departments");
        const snapshot = await getDocs(deptRef);
        if (!snapshot.empty) {
          const existing = snapshot.docs.map(doc => doc.data().name);
          setSelectedDepts(existing);
          setHasDepartments(true); // skip onboarding
        } else {
          setHasDepartments(false); // first login, show onboarding
        }
      } catch (err) {
        console.error("Error checking departments:", err);
      } finally {
        setLoading(false);
      }
    };
    if (companyId) checkDepartments();
  }, [companyId]);

  const toggleDept = (dept) => {
    setSelectedDepts(prev =>
      prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept]
    );
  };

  const handleNextStep = () => setStep(prev => prev + 1);
  const handlePrevStep = () => setStep(prev => (prev > 1 ? prev - 1 : prev));

  // Fetch total users
useEffect(() => {
  const fetchUserCounts = async () => {
    if (!companyId) return;

    try {
      let total = 0;
      let active = 0;

      const departments = selectedDepts.length
        ? selectedDepts
        : ["IT", "HR", "Finance", "Marketing"];

      for (const dept of departments) {
        const usersRef = collection(
          db,
          "freshers",
          companyId,
          "departments",
          dept,
          "users"
        );

        const snap = await getDocs(usersRef);

        total += snap.size;

        snap.forEach(doc => {
          if (doc.data().status === "active") active++;
        });
      }

      setTotalUsers(total);
      setActiveUsers(active);
    } catch (err) {
      console.error("User count error:", err);
    }
  };

  if (hasDepartments) fetchUserCounts();
}, [companyId, hasDepartments, selectedDepts]);

  // Build chart data for departments
  useEffect(() => {
    const fetchChart = async () => {
      if (!companyId || !hasDepartments) return;

      try {
        const depts = selectedDepts.length ? selectedDepts : [];
        const chart = [];

        for (const dept of depts) {
          const usersRef = collection(
            db,
            "freshers",
            companyId,
            "departments",
            dept,
            "users"
          );
          const snap = await getDocs(usersRef);
          chart.push({ department: dept, users: snap.size });
        }

        setChartData(chart);
        // also build pie data
        const pie = chart.map((c) => ({ name: c.department, value: c.users }));
        setPieData(pie);
      } catch (err) {
        console.error("Error building chart data:", err);
      }
    };

    fetchChart();
  }, [companyId, hasDepartments, selectedDepts]);

  // Save answers and departments
  const saveAnswersToDB = async () => {
    try {
      // Save onboarding answers
      const answersRef = collection(db, "companies", companyId, "onboardingAnswers");
      await addDoc(answersRef, { answers, createdAt: serverTimestamp() });

      // Save selected departments only if not already created
     if (!hasDepartments && selectedDepts.length > 0) {
  const deptRef = collection(db, "companies", companyId, "departments");
  for (let dept of selectedDepts) {
    const deptDocRef = doc(deptRef, dept); // use department name as doc ID
    await setDoc(deptDocRef, { name: dept, createdAt: serverTimestamp() });
  }
}

      // Mark onboarding as done
      setHasDepartments(true);
    } catch (err) {
      console.error("Error saving data:", err);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#031C3A] text-white">Loading...</div>;

  const progressPercent = (step / QUESTIONS.length) * 100;

  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      {/* Sidebar */}
      <CompanySidebar companyId={companyId} companyName={companyName} />

      {/* Main Content */}
      <div className="flex-1 p-8">
        {/* Welcome */}
        <div className="max-w-4xl mx-auto text-center mb-6">
          <h1 className="text-3xl font-bold text-[#00FFFF] mb-2">Welcome, {companyName}</h1>
          {!hasDepartments && <p className="text-[#AFCBE3]">To get started, please answer a few questions.</p>}
        </div>

        {/* Show onboarding only if first login */}
        {!hasDepartments && step <= QUESTIONS.length && (
          <>
            {/* Progress Bar */}
            <div className="max-w-4xl mx-auto mb-6">
              <div className="w-full h-3 bg-[#021B36]/50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#00FFFF] to-[#007BFF] transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
              <p className="text-sm text-right text-[#AFCBE3] mt-1">{step} / {QUESTIONS.length}</p>
            </div>

            {/* Question Cards */}
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="p-6 rounded-xl border-2 border-[#00FFFF] bg-[#021B36]/80 shadow-[0_0_20px_rgba(0,255,255,0.3)]">
                <p className="text-[#00FFFF] font-semibold text-lg mb-4">{QUESTIONS[step - 1].text}</p>
                {/* <div className="grid grid-cols-2 md:grid-cols-3 gap-4"> */}
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
                   {QUESTIONS[step - 1].type === "text" ? (
  <div className="w-full">
    <textarea
      rows={6}
      placeholder="Tell us about your company, culture, and goals..."
      value={answers[step - 1] || ""}
      onChange={(e) =>
        setAnswers((prev) => ({ ...prev, [step - 1]: e.target.value }))
      }
      className="w-full p-4 text-white rounded-xl border transition-all
        bg-[#021B36]/50 border-[#00FFFF30] placeholder-[#AFCBE3]
        focus:outline-none focus:border-[#00FFFF] hover:border-[#00FFFF60] resize-none"
    />
  </div>
) : (
  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
    {QUESTIONS[step - 1].options.map((opt) => (
      <div
        key={opt}
        onClick={() => {
          if (QUESTIONS[step - 1].type === "multi-select") toggleDept(opt);
          else setAnswers((prev) => ({ ...prev, [step - 1]: opt }));
        }}
        className={`cursor-pointer p-4 text-center rounded-xl border transition-all
          ${
            (QUESTIONS[step - 1].type === "multi-select"
              ? selectedDepts.includes(opt)
              : answers[step - 1] === opt)
              ? "bg-[#00FFFF]/20 border-[#00FFFF]"
              : "bg-[#021B36]/50 border-[#00FFFF30] hover:border-[#00FFFF60]"
          }`}
      >
        {opt}
      </div>
    ))}
  </div>
)}
                </div>

                {/* Navigation */}
                <div className="flex justify-between mt-6">
                  {step > 1 && step <= QUESTIONS.length && (
                    <button
                      onClick={handlePrevStep}
                      className="px-6 py-2 bg-[#021B36] rounded-lg hover:bg-[#032A4A] transition-colors"
                    >
                      &larr; Back
                    </button>
                  )}

                  {/* Next or Finish */}
                  {step === QUESTIONS.length ? (
                    <button
                      onClick={() => { handleNextStep(); saveAnswersToDB(); }}
                      className="px-6 py-2 bg-[#00FFFF] text-[#031C3A] rounded-lg font-semibold hover:opacity-90 transition"
                    >
                      Finish
                    </button>
                  ) : (
                    <button
                      onClick={handleNextStep}
                      className="px-6 py-2 bg-[#00FFFF] text-[#031C3A] rounded-lg font-semibold hover:opacity-90 transition"
                    >
                      Next &rarr;
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Dashboard + Chart */}
        {hasDepartments && (
          <div className="max-w-5xl mx-auto space-y-6 mt-8">
            <h1 className="text-3xl font-bold text-[#00FFFF] mb-6">Dashboard Overview</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="p-6 bg-[#021B36]/70 rounded-xl border border-[#00FFFF30] shadow-lg hover:scale-105 transition-all">
                <h3 className="text-[#00FFFF] font-semibold mb-2">Total Departments</h3>
                <p className="text-xl font-bold">{selectedDepts.length}</p>
              </div>
              <div className="p-6 bg-[#021B36]/70 rounded-xl border border-[#00FFFF30] shadow-lg hover:scale-105 transition-all">
                <h3 className="text-[#00FFFF] font-semibold mb-2">Total Users</h3>
                <p className="text-xl font-bold">{totalUsers}</p>
              </div>
              <div className="p-6 bg-[#021B36]/70 rounded-xl border border-[#00FFFF30] shadow-lg hover:scale-105 transition-all">
                <h3 className="text-[#00FFFF] font-semibold mb-2">Active Users</h3>
                <p className="text-xl font-bold">{activeUsers}</p>
              </div>
              <div className="p-6 bg-[#021B36]/70 rounded-xl border border-[#00FFFF30] shadow-lg hover:scale-105 transition-all">
                <h3 className="text-[#00FFFF] font-semibold mb-2">Progress</h3>
                <p className="text-xl font-bold">—</p>
              </div>
            </div>

            {chartData && chartData.length > 0 && (
              <div className="max-w-5xl mx-auto mt-6 bg-[#021B36]/70 border border-[#00FFFF30] rounded-xl p-6">
                <h2 className="text-lg font-semibold text-[#00FFFF] mb-4">Department Analytics</h2>
                <p className="text-[#AFCBE3] mb-4">View user distribution and activity across departments</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="h-[360px] p-4 rounded-lg border-2 border-[#00FFFF40] bg-[#021B36]/60">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(13, 88, 200, 0.13)" />
                        <XAxis dataKey="department" stroke="#AFCBE3" />
                        <YAxis stroke="#AFCBE3" allowDecimals={false} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#021B36", border: "1px solid #00FFFF50", color: "#fff" }}
                        />
                        <Bar dataKey="users" fill="#00FFFF" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="h-[360px] p-4 rounded-lg border-2 border-[#00FFFF40] bg-[#021B36]/60">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={{ fill: '#AFCBE3' }}>
                          {pieData.map((entry, idx) => (
                            <Cell key={`cell-${idx}`} fill={["#00FFFF", "#007BFF", "#7CFFEA", "#FFD36E", "#FF7AB6"][idx % 5]} />
                          ))}
                        </Pie>
                        <Legend wrapperStyle={{ color: '#AFCBE3' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
