//CompanyDashboard.jsx
import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, serverTimestamp, query, orderBy, limit, getDoc } from "firebase/firestore";
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
    maxDepartments: 3,
    usdPrice: "$59/month",
    inrPrice: "Rs 15,500/month",
    facilities: [
      "Customized roadmap",
      "Email updates",
      "Google Calendar integration",
      "Basic completion certificate",
      "Admin progress view",
      "10 to 15 freshers",
      "Up to 3 different departments/plans",
    ],
  },
  {
    title: "Pro",
    subtitle: "Adaptive Training Suite",
    value: "License Pro",
    capacity: "20 to 40 freshers",
    maxDepartments: 5,
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
      "5+ different departments/plans",
    ],
  },
];

const MAX_DEPARTMENTS_BASIC = 3;
const MAX_DEPARTMENTS_PRO = 5;

const BATCH_SIZE_OPTIONS = ["10-15 freshers", "20-40 freshers"];

const PAYMENT_METHODS = ["Credit Card", "Debit Card", "Bank Transfer"];

const PAYMENT_PROVIDER = "internal-demo";
const PAYMENT_STATUS = "success";
const PAYMENT_CURRENCY = "USD/INR";

const normalizeId = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (["undefined", "null", "nan"].includes(normalized.toLowerCase())) return "";
  return normalized;
};

const QUESTIONS = [
  { text: "Which plan do you want to proceed with?", description: "Select a plan based on your training needs and fresher capacity", type: "plan-select", options: PLAN_OPTIONS },
  { text: "Select your departments", type: "multi-select", options: DEPARTMENT_OPTIONS },
  { text: "Training duration", type: "single-select", options: ["1 month", "3 months", "6 months"] },
  { text: "Batch size", description: "This will be auto-selected based on your license plan", type: "batch-size", options: BATCH_SIZE_OPTIONS, autoSelect: true },
  { text: "Tell us about your company", type: "text" },
  { text: "Payment method for licensing", type: "single-select", options: PAYMENT_METHODS },
  { text: "Card Details", description: "Enter your card information to complete payment setup", type: "card-details" },
];
export default function CompanyDashboard() {
  const navigate = useNavigate();
  const location = useLocation();

  const companyId = normalizeId(location?.state?.companyId || localStorage.getItem("companyId"));
  const [companyName, setCompanyName] = useState(
    location?.state?.companyName || localStorage.getItem("companyName") || "Company"
  );

  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [selectedDepts, setSelectedDepts] = useState([]);
  const [answers, setAnswers] = useState({});
  const [cardDetails, setCardDetails] = useState({
    cardNumber: '',
    cardholderName: '',
    expiryMonth: '',
    expiryYear: '',
    cvc: ''
  });
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
  const [calendarConnectionAttempted, setCalendarConnectionAttempted] = useState(false);
  const [showCalendarPrompt, setShowCalendarPrompt] = useState(true);
  const [pendingNotificationCount, setPendingNotificationCount] = useState(0);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);

  const selectedPlan = answers[0];
  const effectiveLicense = selectedPlan || companyLicense;
  const isBasicLicense = effectiveLicense === "License Basic";
  const currentPlanConfig = PLAN_OPTIONS.find((plan) => plan.value === effectiveLicense);
  const currentPlanLabel = currentPlanConfig?.title || "Pro";

  // Handle returning from Google OAuth
  useEffect(() => {
    if (location?.state?.calendarConnected) {
      setCalendarConnectionAttempted(true);
      setShowCalendarPrompt(false);
      alert("Google Calendar connected successfully! ✅");
      // Clear the state
      navigate(location.pathname, { replace: true, state: { companyId, companyName } });
    }
  }, [location]);

  // Check if Google Calendar is already connected
  useEffect(() => {
    const checkCalendarConnection = async () => {
      if (!companyId) return;
      
      try {
        const companyDoc = await getDoc(doc(db, "companies", companyId));
        if (companyDoc.exists()) {
          const data = companyDoc.data();
          // If googleOAuth exists and has tokens, calendar is connected
          if (data.googleOAuth && data.googleOAuth.refreshToken) {
            setCalendarConnectionAttempted(true);
            setShowCalendarPrompt(false);
          }
        }
      } catch (err) {
        console.error("Error checking calendar connection:", err);
      }
    };

    if (hasDepartments) {
      checkCalendarConnection();
    }
  }, [companyId, hasDepartments]);

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
          const savedLicense = latestAnswers?.[0] ?? latestAnswers?.["0"];

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

  // Fetch company name from database if not available
  useEffect(() => {
    const fetchCompanyName = async () => {
      if (!companyId) return;
      
      try {
        const companyDoc = await getDoc(doc(db, "companies", companyId));
        if (companyDoc.exists()) {
          const fetchedName = companyDoc.data().name;
          if (fetchedName) {
            setCompanyName(fetchedName);
            localStorage.setItem("companyName", fetchedName);
          }
        }
      } catch (err) {
        console.error("Error fetching company name:", err);
      }
    };

    if (companyId && (!companyName || companyName === "Company")) {
      fetchCompanyName();
    }
  }, [companyId]);

  useEffect(() => {
    if (companyId) {
      localStorage.setItem("companyId", companyId);
      localStorage.setItem("companyName", companyName);
    } else {
      localStorage.removeItem("companyId");
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

  useEffect(() => {
    if (!companyId || !hasDepartments) return;

    let mounted = true;

    const loadPendingNotifications = async () => {
      try {
        const res = await fetch(
          `http://localhost:5000/api/company/notifications/module-lock/${companyId}?status=pending`
        );
        const data = await res.json();
        if (!res.ok) return;

        const count = Array.isArray(data.notifications) ? data.notifications.length : 0;
        if (!mounted) return;

        setPendingNotificationCount(count);

        if (count > 0) {
          const promptKey = `company-notification-prompt-shown-${companyId}`;
          const alreadyShown = sessionStorage.getItem(promptKey) === "1";
          if (!alreadyShown) {
            setShowNotificationPrompt(true);
            sessionStorage.setItem(promptKey, "1");
          }
        }
      } catch (err) {
      }
    };

    loadPendingNotifications();

    return () => {
      mounted = false;
    };
  }, [companyId, hasDepartments]);

  const toggleDept = (dept) => {
    const selectedPlan = answers[0];
    const maxDepts = selectedPlan === "License Basic" ? MAX_DEPARTMENTS_BASIC : MAX_DEPARTMENTS_PRO;
    
    setSelectedDepts(prev => {
      if (prev.includes(dept)) {
        return prev.filter(d => d !== dept);
      } else {
        if (prev.length >= maxDepts) {
          alert(`Your ${selectedPlan === "License Basic" ? "Basic" : "Pro"} license allows up to ${maxDepts} departments. Please remove a department to add a new one.`);
          return prev;
        }
        return [...prev, dept];
      }
    });
  };

  // Generate Google Calendar Auth URL
  const generateGoogleAuthUrl = async () => {
    console.log("Connecting to Google Calendar for company:", companyId);
    setCalendarConnectionAttempted(true);
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
        // Store current location to return after OAuth
        sessionStorage.setItem('oauth_return_url', window.location.pathname);
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
    const currentQuestion = QUESTIONS[step - 1];
    
    // Validation logic
    if (currentQuestion.type === "plan-select" && !answers[0]) {
      alert("Please select a license plan to continue");
      return;
    }
    
    if (currentQuestion.type === "multi-select" && selectedDepts.length === 0) {
      alert("Please select at least one department to continue");
      return;
    }

    // Validate department count based on plan
    if (currentQuestion.type === "multi-select") {
      const selectedPlan = answers[0];
      const maxDepts = selectedPlan === "License Basic" ? MAX_DEPARTMENTS_BASIC : MAX_DEPARTMENTS_PRO;
      const planName = selectedPlan === "License Basic" ? "Basic" : "Pro";
      
      if (selectedDepts.length > maxDepts) {
        alert(`Your ${planName} license allows up to ${maxDepts} departments. You have selected ${selectedDepts.length}.`);
        return;
      }
    }
    
    if (currentQuestion.type === "single-select" && !answers[step - 1]) {
      alert("Please select an option to continue");
      return;
    }
    
    if (currentQuestion.type === "text" && !answers[step - 1]?.trim()) {
      alert("Please provide information about your company to continue");
      return;
    }
    
    if (currentQuestion.type === "batch-size" && !answers[3]) {
      alert("Batch size is auto-selected. Please wait or refresh.");
      return;
    }

    if (currentQuestion.type === "card-details") {
      if (!cardDetails.cardNumber?.trim() || cardDetails.cardNumber.replace(/\s/g, '').length < 13) {
        alert("Please enter a valid card number (at least 13 digits)");
        return;
      }
      if (!cardDetails.cardholderName?.trim()) {
        alert("Please enter the cardholder name");
        return;
      }
      if (!cardDetails.expiryMonth || !cardDetails.expiryYear) {
        alert("Please enter the expiry date");
        return;
      }
      if (!cardDetails.cvc?.trim() || cardDetails.cvc.length < 3) {
        alert("Please enter a valid CVC (3-4 digits)");
        return;
      }
    }

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

// Simple SHA-256 like hash function for card details
const generateHash = async (input) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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

  // Auto-select batch size based on plan
  useEffect(() => {
    if (answers[0]) {
      let batchSize = "20-40 freshers";
      if (answers[0] === "License Basic") {
        batchSize = "10-15 freshers";
      }
      setAnswers(prev => ({ ...prev, 3: batchSize }));
    }
  }, [answers[0]]);

  // Adjust department selection if plan changes and selected departments exceed new limit
  useEffect(() => {
    if (answers[0]) {
      const maxDepts = answers[0] === "License Basic" ? MAX_DEPARTMENTS_BASIC : MAX_DEPARTMENTS_PRO;
      if (selectedDepts.length > maxDepts) {
        const adjustedDepts = selectedDepts.slice(0, maxDepts);
        setSelectedDepts(adjustedDepts);
        alert(`You selected ${selectedDepts.length} departments, but your ${answers[0] === "License Basic" ? "Basic" : "Pro"} license allows ${maxDepts}. Automatically adjusted to ${maxDepts} departments.`);
      }
    }
  }, [answers[0]]);

  // Save answers and departments
  const saveAnswersToDB = async () => {
    if (!companyId) return;

    try {
      // Validate all required fields
      if (!answers[0]) {
        alert("License plan is required");
        return;
      }
      if (selectedDepts.length === 0) {
        alert("At least one department is required");
        return;
      }

      // Validate department count based on plan
      const selectedPlan = answers[0];
      const maxDepts = selectedPlan === "License Basic" ? MAX_DEPARTMENTS_BASIC : MAX_DEPARTMENTS_PRO;
      const planName = selectedPlan === "License Basic" ? "Basic" : "Pro";
      
      if (selectedDepts.length > maxDepts) {
        alert(`Your ${planName} license allows up to ${maxDepts} departments. You have selected ${selectedDepts.length}. Please adjust your selection.`);
        return;
      }

      if (!answers[2]) {
        alert("Training duration is required");
        return;
      }
      if (!answers[3]) {
        alert("Batch size selection is required");
        return;
      }
      if (!answers[4]?.trim()) {
        alert("Company information is required");
        return;
      }
      if (!answers[5]) {
        alert("Payment method is required");
        return;
      }
      if (!cardDetails.cardNumber?.trim() || cardDetails.cardNumber.replace(/\s/g, '').length < 13) {
        alert("Please enter a valid card number (at least 13 digits)");
        return;
      }
      if (!cardDetails.cardholderName?.trim()) {
        alert("Please enter the cardholder name");
        return;
      }
      if (!cardDetails.expiryMonth || !cardDetails.expiryYear) {
        alert("Please enter the expiry date");
        return;
      }
      if (!cardDetails.cvc?.trim() || cardDetails.cvc.length < 3) {
        alert("Please enter a valid CVC (3-4 digits)");
        return;
      }

      setSavingOnboarding(true);
      const selectedLicense = answers[0] || "License Basic";

      // Save onboarding answers
      const answersRef = collection(db, "companies", companyId, "onboardingAnswers");
      const savedOnboardingDoc = await addDoc(answersRef, {
        answers: {
          ...answers,
          0: selectedLicense,
        },
        cardDetails: {
          cardholderName: cardDetails.cardholderName,
          cardNumber: cardDetails.cardNumber.slice(-4).padStart(cardDetails.cardNumber.replace(/\s/g, '').length, '*'),
          expiryMonth: cardDetails.expiryMonth,
          expiryYear: cardDetails.expiryYear,
          // CVC is not stored for security
        },
        paymentMethod: answers[5],
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

      // Save billing payment information
      const planConfig = PLAN_OPTIONS.find(p => p.value === selectedLicense);
      
      if (!planConfig) {
        console.error("Plan configuration not found for:", selectedLicense);
        alert("Error: Invalid plan selected. Please try again.");
        setSavingOnboarding(false);
        return;
      }

      const amountUsdStr = planConfig.usdPrice;
      const amountInrStr = planConfig.inrPrice;
      
      const amountUsd = parseInt(amountUsdStr.replace(/\D/g, ''));
      const amountInr = parseInt(amountInrStr.replace(/\D/g, ''));
      
      // Create simple hashes for card details (Note: In production, use proper crypto library)
      const cardNumberDigits = cardDetails.cardNumber.replace(/\s/g, '');
      const cardHashInput = cardNumberDigits + cardDetails.expiryMonth + cardDetails.expiryYear + cardDetails.cvc;
      const cardHash = await generateHash(cardHashInput);
      const paymentFingerprint = await generateHash(cardNumberDigits + cardDetails.cardholderName);
      
      const billingPaymentsRef = collection(db, "companies", companyId, "billingPayments");
      const billingPaymentDoc = await addDoc(billingPaymentsRef, {
        amountInr: amountInr,
        amountUsd: amountUsd,
        cardHash: cardHash,
        cardHolderName: cardDetails.cardholderName,
        cardLast4: cardNumberDigits.slice(-4),
        createdAt: serverTimestamp(),
        currency: PAYMENT_CURRENCY,
        expiryMonth: cardDetails.expiryMonth,
        expiryYear: cardDetails.expiryYear,
        paymentFingerprint: paymentFingerprint,
        plan: selectedLicense,
        provider: PAYMENT_PROVIDER,
        status: PAYMENT_STATUS,
        paymentMethod: answers[5],
      });

      // Mark onboarding as done and show dashboard
      setHasDepartments(true);
      alert("Onboarding completed successfully! Please connect your Google Calendar to enhance your training experience.");
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
                  Welcome, {companyName}
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
                <p className="text-[#00FFFF] font-semibold text-lg mb-2">{QUESTIONS[step - 1].text}</p>
                {QUESTIONS[step - 1].description && (
                  <p className="text-[#AFCBE3] text-sm mb-4">{QUESTIONS[step - 1].description}</p>
                )}
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
) : QUESTIONS[step - 1].type === "batch-size" ? (
  <div className="w-full">
    <div className="bg-[#021B36]/50 border border-[#00FFFF30] rounded-xl p-6 mb-4">
      <p className="text-[#AFCBE3] text-sm mb-3">Selected batch size based on your plan:</p>
      <div className="bg-[#00FFFF]/10 border-2 border-[#00FFFF] rounded-lg p-4">
        <p className="text-lg font-bold text-[#00FFFF]">{answers[step - 1] || "Auto-selecting..."}</p>
        <p className="text-xs text-[#AFCBE3] mt-2">This is automatically determined by your selected license plan.</p>
      </div>
    </div>
  </div>
) : QUESTIONS[step - 1].type === "card-details" ? (
  <div className="w-full max-w-2xl mx-auto">
    {(() => {
      const planConfig = PLAN_OPTIONS.find(p => p.value === answers[0]);
      const amountUsd = planConfig?.usdPrice || "$0/month";
      const amountInr = planConfig?.inrPrice || "Rs 0/month";
      
      return (
        <>
          <div className="mb-6 p-4 bg-[#00FFFF]/10 border-2 border-[#00FFFF] rounded-xl">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-[#AFCBE3] text-sm">Payment Amount</p>
                <p className="text-[#00FFFF] text-xl font-bold mt-1">{answers[0] === "License Basic" ? "Basic" : "Pro"} License</p>
              </div>
              <div className="text-right">
                <p className="text-[#AFCBE3] text-sm">Monthly Cost</p>
                <p className="text-[#00FFFF] text-2xl font-bold mt-1">{amountUsd}</p>
                <p className="text-[#9FC2DA] text-xs">{amountInr}</p>
              </div>
            </div>
          </div>
          <div className="bg-[#021B36]/50 border border-[#00FFFF30] rounded-xl p-6 space-y-4">
      <div>
        <label className="block text-[#AFCBE3] text-sm font-semibold mb-2">Cardholder Name</label>
        <input
          type="text"
          placeholder="John Doe"
          value={cardDetails.cardholderName}
          onChange={(e) => setCardDetails(prev => ({ ...prev, cardholderName: e.target.value }))}
          className="w-full p-3 rounded-lg border transition-all bg-[#021B36]/50 border-[#00FFFF30] placeholder-[#AFCBE3] text-white focus:outline-none focus:border-[#00FFFF] hover:border-[#00FFFF60]"
        />
      </div>

      <div>
        <label className="block text-[#AFCBE3] text-sm font-semibold mb-2">Card Number</label>
        <input
          type="text"
          placeholder="1234 5678 9012 3456"
          maxLength="19"
          value={cardDetails.cardNumber}
          onChange={(e) => {
            const numericOnly = e.target.value.replace(/\D/g, '').slice(0, 16);
            const formatted = numericOnly.replace(/(\d{4})/g, '$1 ').trim();
            setCardDetails(prev => ({ ...prev, cardNumber: formatted }));
          }}
          className="w-full p-3 rounded-lg border transition-all bg-[#021B36]/50 border-[#00FFFF30] placeholder-[#AFCBE3] text-white focus:outline-none focus:border-[#00FFFF] hover:border-[#00FFFF60]"
        />
        <p className="text-xs text-[#7FA3BF] mt-1">Format: XXXX XXXX XXXX XXXX (16 digits)</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-[#AFCBE3] text-sm font-semibold mb-2">Expiry Month</label>
          <select
            value={cardDetails.expiryMonth}
            onChange={(e) => setCardDetails(prev => ({ ...prev, expiryMonth: e.target.value }))}
            className="w-full p-3 rounded-lg border transition-all bg-[#021B36]/50 border-[#00FFFF30] text-white focus:outline-none focus:border-[#00FFFF] hover:border-[#00FFFF60]"
          >
            <option value="">Month</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(month => (
              <option key={month} value={month.toString().padStart(2, '0')}>
                {month.toString().padStart(2, '0')}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[#AFCBE3] text-sm font-semibold mb-2">Expiry Year</label>
          <select
            value={cardDetails.expiryYear}
            onChange={(e) => setCardDetails(prev => ({ ...prev, expiryYear: e.target.value }))}
            className="w-full p-3 rounded-lg border transition-all bg-[#021B36]/50 border-[#00FFFF30] text-white focus:outline-none focus:border-[#00FFFF] hover:border-[#00FFFF60]"
          >
            <option value="">Year</option>
            {Array.from({ length: 20 }, (_, i) => new Date().getFullYear() + i).map(year => (
              <option key={year} value={year.toString()}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[#AFCBE3] text-sm font-semibold mb-2">CVC</label>
          <input
            type="text"
            placeholder="123"
            maxLength="4"
            value={cardDetails.cvc}
            onChange={(e) => setCardDetails(prev => ({ ...prev, cvc: e.target.value.replace(/\D/g, '') }))}
            className="w-full p-3 rounded-lg border transition-all bg-[#021B36]/50 border-[#00FFFF30] placeholder-[#AFCBE3] text-white focus:outline-none focus:border-[#00FFFF] hover:border-[#00FFFF60]"
          />
          <p className="text-xs text-[#7FA3BF] mt-1">3-4 digits</p>
        </div>
      </div>

      <div className="bg-[#00FFFF]/10 border border-[#00FFFF30] rounded-lg p-4 mt-6">
        <p className="text-xs text-[#AFCBE3]">
          <span className="text-[#00FFFF] font-semibold">🔒 Secure Payment</span><br/>
          Your card details are encrypted and processed securely. TrainMate does not store full card details on our servers.
        </p>
      </div>
          </div>
        </>
      );
    })()}
  </div>
) : QUESTIONS[step - 1].type === "multi-select" ? (
  <div className="w-full">
    {(() => {
      const selectedPlan = answers[0];
      const maxDepts = selectedPlan === "License Basic" ? MAX_DEPARTMENTS_BASIC : MAX_DEPARTMENTS_PRO;
      const planName = selectedPlan === "License Basic" ? "Basic" : "Pro";
      const isAtLimit = selectedDepts.length >= maxDepts;

      return (
        <>
          <div className="bg-[#021B36]/50 border border-[#00FFFF30] rounded-xl p-4 mb-4">
            <div className="flex justify-between items-center mb-2">
              <p className="text-[#AFCBE3] text-sm font-semibold">Department Selection</p>
              <span className={`px-3 py-1 rounded-lg text-xs font-bold ${
                isAtLimit 
                  ? "bg-[#FF7AB6]/20 text-[#FF7AB6] border border-[#FF7AB6]/50"
                  : "bg-[#00FFFF]/20 text-[#00FFFF] border border-[#00FFFF]/50"
              }`}>
                {selectedDepts.length} / {maxDepts} ({planName} License)
              </span>
            </div>
            <p className="text-xs text-[#9FC2DA]">
              Your {planName} license allows up to {maxDepts} different department{maxDepts > 1 ? 's' : ''}
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {QUESTIONS[step - 1].options.map((opt) => {
              const isSelected = selectedDepts.includes(opt);
              const isDisabled = isAtLimit && !isSelected;

              return (
                <div
                  key={opt}
                  onClick={() => {
                    if (!isDisabled) toggleDept(opt);
                  }}
                  className={`p-4 text-center rounded-xl border transition-all ${
                    isDisabled
                      ? "cursor-not-allowed opacity-50 bg-[#021B36]/30 border-[#AFCBE3]/20"
                      : "cursor-pointer"
                  } ${
                    isSelected
                      ? "bg-[#00FFFF]/20 border-[#00FFFF]"
                      : "bg-[#021B36]/50 border-[#00FFFF30] hover:border-[#00FFFF60]"
                  }`}
                  title={isDisabled ? `${maxDepts} department limit reached` : undefined}
                >
                  {opt}
                </div>
              );
            })}
          </div>
        </>
      );
    })()}
  </div>
) : (
  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
    {QUESTIONS[step - 1].options.map((opt) => (
      <div
        key={opt}
        onClick={() => setAnswers((prev) => ({ ...prev, [step - 1]: opt }))}
        className={`cursor-pointer p-4 text-center rounded-xl border transition-all
          ${
            answers[step - 1] === opt
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
                <div className={`flex gap-3 mt-6 ${step === 1 ? 'justify-end' : 'justify-between'}`}>
                  {step > 1 && step <= QUESTIONS.length && (
                    <button
                      onClick={handlePrevStep}
                      className="px-6 py-2 bg-[#021B36] rounded-lg hover:bg-[#032A4A] transition-colors"
                    >
                      &larr; Back
                    </button>
                  )}

                  {/* Next or Save & Continue */}
                  {step === QUESTIONS.length ? (
                    <button
                      onClick={saveAnswersToDB}
                      disabled={savingOnboarding}
                      className="px-6 py-2 bg-[#00FFFF] text-[#031C3A] rounded-lg font-semibold hover:opacity-90 transition disabled:opacity-70 disabled:cursor-not-allowed ml-auto"
                    >
                      {savingOnboarding ? "Saving..." : "Save & Continue"}
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
            {/* Google Calendar Connection Prompt - Only show if not connected */}
            {showCalendarPrompt && !calendarConnectionAttempted && (
              <div className="bg-gradient-to-r from-[#00FFFF]/20 to-[#007BFF]/20 border border-[#00FFFF] rounded-xl p-6 relative">
                <button
                  onClick={() => setShowCalendarPrompt(false)}
                  className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
                >
                  ✕
                </button>
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-[#00FFFF]/30 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-2xl">📅</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-white mb-2">Connect Your Google Calendar</h3>
                    <p className="text-[#AFCBE3] mb-4">
                      Enhance your training process with TrainMate - sync schedules, reminders, and quiz deadlines automatically for better fresher engagement and tracking.
                    </p>
                    <button
                      onClick={generateGoogleAuthUrl}
                      disabled={googleAuthLoading}
                      className="px-6 py-2.5 bg-[#00FFFF] text-[#031C3A] font-semibold rounded-lg hover:opacity-90 transition disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {googleAuthLoading ? "Connecting..." : "Connect Google Calendar"}
                    </button>
                  </div>
                </div>
              </div>
            )}

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

        {hasDepartments && showNotificationPrompt && pendingNotificationCount > 0 && (
          <div className="fixed right-8 bottom-28 z-50 max-w-sm bg-[#021B36] border border-[#00FFFF50] rounded-xl px-4 py-3 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[#00FFFF] font-semibold text-sm">New Admin Notifications</p>
                <p className="text-[#AFCBE3] text-sm mt-1">
                  You have {pendingNotificationCount} pending notification{pendingNotificationCount > 1 ? "s" : ""}.
                </p>
              </div>
              <button
                onClick={() => setShowNotificationPrompt(false)}
                className="text-[#AFCBE3] hover:text-[#00FFFF]"
                aria-label="Close notification prompt"
              >
                ✕
              </button>
            </div>
            <button
              onClick={() => {
                setShowNotificationPrompt(false);
                navigate("/CompanySpecific/CompanyNotifications", {
                  state: { companyId, companyName },
                });
              }}
              className="mt-3 w-full px-3 py-2 rounded-lg bg-[#00FFFF] text-[#031C3A] font-semibold hover:opacity-90"
            >
              View Notifications
            </button>
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
