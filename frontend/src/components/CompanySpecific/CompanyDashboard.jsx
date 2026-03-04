//CompanyDashboard.jsx
import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, serverTimestamp, query, orderBy, limit } from "firebase/firestore";
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
import CompanyFresherChatbot from "../../components/CompanySpecific/CompanyFresherChatbot";


const DEPARTMENT_OPTIONS = ["HR", "SOFTWAREDEVELOPMENT", "AI", "ACCOUNTING", "MARKETING", "OPERATIONS", "DATASCIENCE","IT"];

const PLAN_OPTIONS = [
  {
    title: "Basic",
    subtitle: "Core Training",
    value: "License Basic",
    capacity: "10 to 15 freshers",
    usdPrice: "$59/month",
    inrPrice: "Rs 15,500/month",
    facilities: [
      "Customized roadmap",
      "Email updates",
      "Google Calendar integration",
      "Basic completion certificate",
      "Admin progress view",
      "10 to 15 freshers",
    ],
  },
  {
    title: "Pro",
    subtitle: "Adaptive Training Suite",
    value: "License Pro",
    capacity: "20 to 40 freshers",
    usdPrice: "$199/month",
    inrPrice: "Rs 52,500/month",
    facilities: [
      "Full quiz suite",
      "Agentic emails",
      "Google Calendar automation",
      "Weak-area roadmap",
      "Agentic scores",
      "Final unlock quiz",
      "Admin chatbot",
      "20 to 40 freshers",
    ],
  },
];

const QUESTIONS = [
  { text: "Select your departments", type: "multi-select", options: DEPARTMENT_OPTIONS },
  { text: "Training duration", type: "single-select", options: ["1 month", "3 months", "6 months"] },
  { text: "Which plan do you want to proceed with?", type: "plan-select", options: PLAN_OPTIONS },
  { text: "Tell us about your company", type: "text" },
  { text: "Connect Google Calendar (optional)", type: "calendar-connect" },
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
  const [completedFreshers, setCompletedFreshers] = useState(0);
  const [showChatbot, setShowChatbot] = useState(false);
  const [companyLicense, setCompanyLicense] = useState("License Pro");
  const [showUpgradeNotice, setShowUpgradeNotice] = useState(false);
  const [savingOnboarding, setSavingOnboarding] = useState(false);
  const [googleAuthUrl, setGoogleAuthUrl] = useState(null);
  const [googleAuthLoading, setGoogleAuthLoading] = useState(false);

  const selectedPlan = answers[2];
  const effectiveLicense = selectedPlan || companyLicense;
  const isBasicLicense = effectiveLicense === "License Basic";
  const currentPlanConfig = PLAN_OPTIONS.find((plan) => plan.value === effectiveLicense);
  const currentPlanLabel = currentPlanConfig?.title || "Pro";

useEffect(() => {
  const fetchOnboardingCompletion = async () => {
    if (!companyId || !hasDepartments) return;

    try {
      let completed = 0;
      let total = 0;

      for (const dept of selectedDepts) {
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

        snap.forEach((doc) => {
          if (doc.data().onboarding?.onboardingCompleted) completed++;
        });
      }

      setCompletedFreshers(completed);
    } catch (err) {
      console.error("Error fetching onboarding completion:", err);
    }
  };

  fetchOnboardingCompletion();
}, [companyId, hasDepartments, selectedDepts]);

  useEffect(() => {
    const fetchCompanyLicense = async () => {
      if (!companyId) return;

      try {
        const answersRef = collection(db, "companies", companyId, "onboardingAnswers");
        const answersSnap = await getDocs(
          query(answersRef, orderBy("createdAt", "desc"), limit(1))
        );

        if (!answersSnap.empty) {
          const latestAnswers = answersSnap.docs[0].data()?.answers;
          const savedLicense = latestAnswers?.[2] ?? latestAnswers?.["2"];

          if (savedLicense === "License Basic" || savedLicense === "License Pro") {
            setCompanyLicense(savedLicense);
          }
        }
      } catch (err) {
        console.error("Error fetching company license:", err);
      }
    };

    fetchCompanyLicense();
  }, [companyId]);

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

  // Generate Google Calendar Auth URL
  const generateGoogleAuthUrl = async () => {
    console.log("Connecting to Google Calendar for company:", companyId);
    setGoogleAuthLoading(true);
    try {
      const response = await fetch(
        `/api/auth/company-google-auth-url?companyId=${companyId}`
      );
      
      console.log("Response status:", response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Failed to fetch auth URL:", errorText);
        alert(`Failed to connect: ${errorText}`);
        return;
      }
      
      const data = await response.json();
      console.log("Auth URL response:", data);
      
      if (data.authUrl) {
        setGoogleAuthUrl(data.authUrl);
        // Redirect to Google OAuth
        console.log("Redirecting to Google OAuth...");
        window.location.href = data.authUrl;
      } else {
        console.error("No auth URL received:", data);
        alert("Failed to get authorization URL from server");
      }
    } catch (err) {
      console.error("Error generating Google Auth URL:", err);
      alert(`Error: ${err.message}. Make sure the backend server is running.`);
    } finally {
      setGoogleAuthLoading(false);
    }
  };

  const handleNextStep = () => {
    setStep(prev => prev + 1);
  };
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

  const formatDepartmentLabel = (label) => {
  if (!label) return [""];

  // Explicit mappings for known long departments
  const MAP = {
    SOFTWAREDEVELOPMENT: ["Software", "Development"],
    DATASCIENCE: ["Data", "Science"],
  };

  if (MAP[label]) return MAP[label];

  // Short names (HR, AI, IT)
  if (label.length <= 3) return [label];

  // Fully uppercase single-word departments (ACCOUNTING, MARKETING, OPERATIONS)
  if (/^[A-Z]+$/.test(label)) {
    return [
      label.charAt(0) + label.slice(1).toLowerCase()
    ];
  }

  // Fallback (should rarely happen)
  return [label];
};

const CustomXAxisTick = ({ x, y, payload }) => {
  const lines = formatDepartmentLabel(payload.value);

  return (
    <g transform={`translate(${x},${y})`}>
      {lines.map((line, index) => (
        <text
          key={index}
          x={0}
          y={index * 12}
          dy={16}
          textAnchor="middle"
          fill="#AFCBE3"
          fontSize={12}
        >
          {line}
        </text>
      ))}
    </g>
  );
};

  const handleAssistantClick = () => {
    if (isBasicLicense) {
      setShowUpgradeNotice(true);
      setTimeout(() => setShowUpgradeNotice(false), 2600);
      return;
    }

    setShowChatbot((prev) => !prev);
  };

  // Save answers and departments
  const saveAnswersToDB = async () => {
    if (!companyId) return;

    try {
      setSavingOnboarding(true);
      const selectedLicense = answers[2] || "License Basic";

      // Save onboarding answers
      const answersRef = collection(db, "companies", companyId, "onboardingAnswers");
      const savedOnboardingDoc = await addDoc(answersRef, {
        answers: {
          ...answers,
          2: selectedLicense,
        },
        createdAt: serverTimestamp(),
      });

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

      navigate("/company-license-payment", {
        state: {
          companyId,
          companyName,
          targetLicense: selectedLicense,
          onboardingDocId: savedOnboardingDoc.id,
          returnTo: "/CompanySpecific/CompanyDashboard",
        },
      });
    } catch (err) {
      console.error("Error saving data:", err);
    } finally {
      setSavingOnboarding(false);
    }
  };

 if (loading) {
   return (
     <div className="flex min-h-screen bg-[#031C3A] text-white">
       {/* Sidebar stays as it is */}
       <CompanySidebar companyId={companyId}/>
 
       {/* Main content loading area */}
       <div className="flex-1 flex flex-col items-center justify-center gap-4 p-10">
         {/* Rotating hourglass */}
         <svg
           className="animate-spin h-8 w-8 text-[#00FFFF]"
           xmlns="http://www.w3.org/2000/svg"
           fill="none"
           viewBox="0 0 24 24"
         >
           <path
             fill="currentColor"
             d="M12 2C6.477 2 2 6.477 2 12h2a8 8 0 0116 0h2c0-5.523-4.477-10-10-10zm0 20c5.523 0 10-4.477 10-10h-2a8 8 0 01-16 0H2c0 5.523 4.477 10 10 10z"
           />
         </svg>
 
         <p className="text-base font-medium text-white">
           Loading Company Dashboard...
         </p>
       </div>
     </div>
   );
 }
  const progressPercent = (step / QUESTIONS.length) * 100;

  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      {/* Sidebar */}
      <CompanySidebar companyId={companyId} companyName={companyName} />

      {/* Main Content */}
      <div className="flex-1 p-4 sm:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8 pt-2 sm:pt-3 px-1 sm:px-2">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
              <div className="space-y-2">
                <p className="text-xs tracking-[0.18em] uppercase text-[#8EB6D3]">Company Workspace</p>
                <h1 className="text-2xl sm:text-3xl font-bold text-[#E8F7FF]">
                  Welcome back, {companyName}
                </h1>
                <p className="text-sm text-[#AFCBE3] pt-1">
                  {hasDepartments
                    ? "Track fresher progress, department activity, and training completion from one dashboard."
                    : "Complete onboarding to configure your training setup and unlock your dashboard insights."}
                </p>
              </div>

              {hasDepartments && (
                <div className="flex flex-col items-start md:items-end gap-2">
                  <span className="text-xs text-[#8EB6D3] uppercase tracking-wide">Current Plan</span>
                  <span
                    className={`px-3 py-1 rounded-lg text-sm font-semibold border ${
                      isBasicLicense
                        ? "bg-[#7FA3BF]/20 text-[#D8ECFF] border-[#AFCBE355]"
                        : "bg-[#00FFFF]/20 text-[#00FFFF] border-[#00FFFF66]"
                    }`}
                  >
                    {currentPlanLabel} License
                  </span>
                  <span className="text-xs text-[#AFCBE3]">
                    {new Date().toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              )}
            </div>
          </div>
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
) : QUESTIONS[step - 1].type === "plan-select" ? (
  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 w-full">
    {QUESTIONS[step - 1].options.map((plan) => {
      const isSelected = answers[step - 1] === plan.value;

      return (
        <div
          key={plan.value}
          onClick={() => setAnswers((prev) => ({ ...prev, [step - 1]: plan.value }))}
          className={`cursor-pointer rounded-xl border p-5 transition-all ${
            isSelected
              ? "bg-[#00FFFF]/20 border-[#00FFFF]"
              : "bg-[#021B36]/50 border-[#00FFFF30] hover:border-[#00FFFF60]"
          }`}
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h3 className="text-xl font-bold text-[#E8F7FF]">{plan.title}</h3>
              <p className="text-sm text-[#AFCBE3]">{plan.subtitle}</p>
            </div>
            {isSelected ? (
              <span className="text-xs px-2 py-1 rounded-md bg-[#00FFFF] text-[#031C3A] font-semibold">
                Selected
              </span>
            ) : null}
          </div>

          <div className="space-y-1 mb-3">
            <p className="text-sm text-[#AFCBE3]">{plan.capacity}</p>
            <p className="text-base font-semibold text-[#00FFFF]">{plan.usdPrice}</p>
            <p className="text-sm text-[#9FC2DA]">{plan.inrPrice}</p>
          </div>

          <div>
            <p className="text-sm font-semibold text-[#00FFFF] mb-2">Facilities:</p>
            <ul className="space-y-1 text-sm text-[#AFCBE3]">
              {plan.facilities.map((facility) => (
                <li key={facility} className="leading-5">• {facility}</li>
              ))}
            </ul>
          </div>
        </div>
      );
    })}
  </div>
) : QUESTIONS[step - 1].type === "calendar-connect" ? (
  <div className="w-full max-w-2xl mx-auto space-y-6">
    <div className="bg-gradient-to-br from-[#00FFFF]/10 to-[#007BFF]/10 border-2 border-[#00FFFF] rounded-xl p-8 text-center">
      <div className="text-5xl mb-4">📅</div>
      <h2 className="text-2xl font-bold text-[#E8F7FF] mb-2">Connect Google Calendar</h2>
      <p className="text-sm italic text-[#9FC2DA] mb-4">
        We'll sync your freshers' training schedules, reminders, and quiz deadlines directly to your calendar so nothing gets missed.
      </p>
      <p className="text-[#AFCBE3] mb-6">
        Enable automatic calendar event scheduling for your training program. This will allow us to create reminders, module updates, and roadmap notifications directly in your calendar.
      </p>
      <div className="space-y-3 text-sm text-[#9FC2DA] text-left mb-6 bg-[#021B36]/50 p-4 rounded-lg">
        <p className="flex items-center gap-2">
          <span className="text-[#00FFFF]">✓</span> Daily training reminders
        </p>
        <p className="flex items-center gap-2">
          <span className="text-[#00FFFF]">✓</span> Module unlock notifications
        </p>
        <p className="flex items-center gap-2">
          <span className="text-[#00FFFF]">✓</span> Roadmap generation updates
        </p>
        <p className="flex items-center gap-2">
          <span className="text-[#00FFFF]">✓</span> Quiz scheduling
        </p>
      </div>
      <button
        onClick={generateGoogleAuthUrl}
        disabled={googleAuthLoading}
        className={`w-full px-8 py-3 rounded-lg font-semibold transition-all text-[#031C3A] ${
          googleAuthLoading
            ? "bg-[#00FFFF]/50 cursor-not-allowed"
            : "bg-[#00FFFF] hover:bg-[#00FFD1] hover:shadow-lg"
        }`}
      >
        {googleAuthLoading ? "Connecting..." : "🔗 Connect Google Calendar"}
      </button>
      <p className="text-xs text-[#7FA3BF] mt-4">
        You can skip this step and connect later from company settings.
      </p>
    </div>
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
                <div className="flex justify-between items-center gap-3 mt-6">
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
                      onClick={saveAnswersToDB}
                      disabled={savingOnboarding}
                      className="px-6 py-2 bg-[#00FFFF] text-[#031C3A] rounded-lg font-semibold hover:opacity-90 transition disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {savingOnboarding ? "Saving..." : "Finish"}
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
          <div className="max-w-6xl mx-auto space-y-6 mt-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
              <div className="bg-[#031C3A]/70 border border-[#00FFFF30] rounded-xl p-4 sm:p-5">
                <h3 className="text-sm text-[#9FC2DA]">Current Plan</h3>
                <p className="text-2xl font-bold text-[#E8F7FF] mt-1">{currentPlanLabel}</p>
                <p className="text-xs text-[#7FA3BF] mt-1">{currentPlanConfig?.capacity || "Plan details available"}</p>
              </div>
              <div className="bg-[#031C3A]/70 border border-[#00FFFF30] rounded-xl p-4 sm:p-5">
                <h3 className="text-sm text-[#9FC2DA]">Total Departments</h3>
                <p className="text-2xl font-bold text-[#E8F7FF] mt-1">{selectedDepts.length}</p>
              </div>
              <div className="bg-[#031C3A]/70 border border-[#00FFFF30] rounded-xl p-4 sm:p-5">
                <h3 className="text-sm text-[#9FC2DA]">Total Users</h3>
                <p className="text-2xl font-bold text-[#E8F7FF] mt-1">{totalUsers}</p>
              </div>
              <div className="bg-[#031C3A]/70 border border-[#00FFFF30] rounded-xl p-4 sm:p-5">
                <h3 className="text-sm text-[#9FC2DA]">Active Users</h3>
                <p className="text-2xl font-bold text-[#E8F7FF] mt-1">{activeUsers}</p>
              </div>
              <div className="bg-[#031C3A]/70 border border-[#00FFFF30] rounded-xl p-4 sm:p-5">
                <h3 className="text-sm text-[#9FC2DA]">Onboarding Completion</h3>
                <p className="text-2xl font-bold text-[#E8F7FF] mt-1">
                  {completedFreshers} / {totalUsers}
                </p>
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
                        <XAxis
  dataKey="department"
  tick={<CustomXAxisTick />}
  interval={0}
  height={50}
/>
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
                            <Cell key={`cell-${idx}`} fill={["#00FFFF", "#007BFF", "#7CFFEA", "#AFCBE3", "#FF7AB6"][idx % 5]} />
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

        {/* Floating Chat Button */}
        <style>{`
          @keyframes float-pulse {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-10px); }
          }
          @keyframes glow-pulse {
            0%, 100% { box-shadow: 0 0 15px rgba(0, 255, 255, 0.4), 0 0 25px rgba(0, 255, 255, 0.15); }
            50% { box-shadow: 0 0 20px rgba(0, 255, 255, 0.6), 0 0 35px rgba(0, 255, 255, 0.25); }
          }
          .chat-button {
            animation: float-pulse 3s ease-in-out infinite, glow-pulse 2s ease-in-out infinite;
          }
        `}</style>
        
        {hasDepartments && (
          <button
            onClick={handleAssistantClick}
            className={`chat-button fixed bottom-8 right-8 w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transition-transform duration-300 z-40 border-2 ${
              isBasicLicense
                ? "bg-[#7FA3BF] border-[#AFCBE3]/30 hover:scale-110"
                : "bg-gradient-to-br from-[#00FFFF] via-[#00D9FF] to-[#007BFF] border-[#00FFFF]/30 hover:scale-125"
            }`}
            title={isBasicLicense ? "Upgrade to Pro to unlock AI Assistant" : "Ask Fresher Assistant"}
          >
            <span className="text-3xl font-black text-white drop-shadow-lg select-none">
              {isBasicLicense ? "🔒" : "?"}
            </span>
          </button>
        )}

        {hasDepartments && showUpgradeNotice && isBasicLicense && (
          <div className="fixed bottom-28 right-8 max-w-xs bg-[#021B36] border border-[#00FFFF40] rounded-xl px-4 py-3 z-50 shadow-2xl">
            <p className="text-sm text-[#AFCBE3]">
              AI Assistant is available in Pro level license. Please upgrade to Pro to unlock this feature.
            </p>
          </div>
        )}

        {/* Side Panel Chatbot */}
        {!isBasicLicense && hasDepartments && (
        <div
          className={`fixed top-0 right-0 h-screen w-full md:w-96 bg-[#031C3A] border-l border-[#00FFFF30] shadow-2xl transform transition-transform duration-300 z-50 ${
            showChatbot ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {/* Close Button */}
          <div className="absolute top-4 right-4 z-10">
            <button
              onClick={() => setShowChatbot(false)}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#00FFFF]/20 transition"
            >
              <svg className="w-6 h-6 text-[#AFCBE3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Chatbot Component */}
          <CompanyFresherChatbot companyId={companyId} companyName={companyName} />
        </div>
        )}

        {/* Overlay when panel is open */}
        {showChatbot && (
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setShowChatbot(false)}
          ></div>
        )}
      </div>
    </div>
  );
}
