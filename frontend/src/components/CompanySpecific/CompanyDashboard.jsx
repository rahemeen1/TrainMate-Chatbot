import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import { useNavigate, useLocation } from "react-router-dom";
import { doc, setDoc } from "firebase/firestore";

const DEPARTMENT_OPTIONS = ["HR", "Software Development", "AI", "Finance", "Marketing", "Operations"];

const QUESTIONS = [
  { text: "Select your departments", type: "multi-select", options: DEPARTMENT_OPTIONS },
  { text: "Training duration", type: "single-select", options: ["1 month", "3 months", "6 months"] },
  { text: "Batch size", type: "single-select", options: ["Small (5-10)", "Medium (10-20)", "Large (20+)"] },
];

const MENU_OPTIONS = [
  { label: "Manage Departments", path: "/manage-departments" },
  { label: "Total Users", path: "/total-users" },
  { label: "Active Users", path: "/active-users" },
  { label: "Analytics", path: "/analytics" },
  { label: "Logout", path: "/" },
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
      {/* Vertical Sidebar */}
      <div className="w-64 bg-[#021B36]/90 flex flex-col p-4 shadow-lg">
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto bg-[#00FFFF]/20 rounded-2xl flex items-center justify-center shadow-[0_0_18px_#00FFFF50] border border-[#00FFFF30]">
            <span className="text-[#00FFFF] font-extrabold text-xl tracking-wider">TM</span>
          </div>
          <h1 className="text-[#00FFFF] font-bold text-xl mt-1">TrainMate</h1>
        </div>

        <div className="flex flex-col gap-2">
          {MENU_OPTIONS.map(opt => (
            <button
              key={opt.path}
              className="text-left px-4 py-2 rounded-lg hover:bg-[#00FFFF]/20 transition text-[#AFCBE3] font-medium"
              onClick={() => {
                if (opt.label === "Logout") {
                  const confirmed = window.confirm("Do you really want to logout?");
                  if (confirmed) navigate("/");
                } else {
                 navigate(opt.path, {
  state: { companyId, companyName }
});

                }
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

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
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {QUESTIONS[step - 1].options.map(opt => (
                    <div
                      key={opt}
                      onClick={() => {
                        if (QUESTIONS[step - 1].type === "multi-select") toggleDept(opt);
                        else setAnswers(prev => ({ ...prev, [step - 1]: opt }));
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

        {/* Dashboard */}
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
                <p className="text-xl font-bold">—</p>
              </div>
              <div className="p-6 bg-[#021B36]/70 rounded-xl border border-[#00FFFF30] shadow-lg hover:scale-105 transition-all">
                <h3 className="text-[#00FFFF] font-semibold mb-2">Active Users</h3>
                <p className="text-xl font-bold">—</p>
              </div>
              <div className="p-6 bg-[#021B36]/70 rounded-xl border border-[#00FFFF30] shadow-lg hover:scale-105 transition-all">
                <h3 className="text-[#00FFFF] font-semibold mb-2">Progress</h3>
                <p className="text-xl font-bold">—</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
