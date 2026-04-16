//CompanyDashboard.jsx
import { useState, useEffect, useRef } from "react";
import { collection, getDocs, addDoc, serverTimestamp, query, orderBy, limit, getDoc, updateDoc } from "firebase/firestore";
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
import { CreditCard, Menu, X, Wallet } from "lucide-react";
import CompanySidebar from "../../components/CompanySpecific/CompanySidebar";
import CompanyPageLoader from "../../components/CompanySpecific/CompanyPageLoader";
import CompanyFresherChatbot from "../../components/CompanySpecific/CompanyFresherChatbot";
import { getCompanyLicenseStatus } from "../../services/companyLicenseStatus";


const DEPARTMENT_OPTIONS = ["HR", "SOFTWAREDEVELOPMENT", "AI", "ACCOUNTING", "MARKETING", "OPERATIONS", "DATASCIENCE","IT"];


const PLAN_OPTIONS = [
  {
    title: "Basic",
    subtitle: "Core Training",
    value: "License Basic",
    capacity: "10 to 15 freshers",
    maxDepartments: 3,
    usdPrice: "$59/month",
    inrPrice: "PKR 15,500/month",
    facilities: [
      "Customized roadmap",
      "Email updates",
      "Google Calendar Integration",
      "Admin Progress View",
      "Certification based on completion of all modules",
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
    inrPrice: "PKR 52,500/month",
    facilities: [
      "Module Quizzes with performance-based progression and recommendations",
      "Regular Email Updates",
      "Google Calendar Automation",
      "Regeneration of roadmap based on weak areas",
      "Agentic Quiz Scoring and Feedback",
      "Certification with skill tagging based on performance",  
      "Final Quiz after completion of all modules",
      "Admin chatbot assistant",
      "20 to 40 freshers",
      "5+ different departments/plans",
    ],
  },
];

const MAX_DEPARTMENTS_BASIC = 3;
const MAX_DEPARTMENTS_PRO = 5;

const BATCH_SIZE_OPTIONS = ["10-15 freshers", "20-40 freshers"];

const PAYMENT_METHODS = ["Credit Card", "Debit Card"];

const PAYMENT_PROVIDER = "internal-demo";
const PAYMENT_STATUS = "success";
const PAYMENT_CURRENCY = "USD/PKR";

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

function AnimatedCounter({ value, duration = 900 }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const target = Number.isFinite(Number(value)) ? Number(value) : 0;

    if (target <= 0) {
      setDisplayValue(0);
      return;
    }

    let rafId;
    const start = performance.now();

    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(target * eased));

      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [value, duration]);

  return <>{displayValue}</>;
}

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
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [companyLicense, setCompanyLicense] = useState("License Pro");
  const [showUpgradeNotice, setShowUpgradeNotice] = useState(false);
  const [savingOnboarding, setSavingOnboarding] = useState(false);
  const [googleAuthUrl, setGoogleAuthUrl] = useState(null);
  const [googleAuthLoading, setGoogleAuthLoading] = useState(false);
  const [calendarConnectionAttempted, setCalendarConnectionAttempted] = useState(false);
  const [showCalendarPrompt, setShowCalendarPrompt] = useState(true);
  const [pendingNotificationCount, setPendingNotificationCount] = useState(0);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const [licenseStatus, setLicenseStatus] = useState({
    plan: "License Basic",
    renewalDate: null,
    daysRemaining: null,
    isExpired: false,
    statusLabel: "Unknown",
  });
  const preloadedAnalyticsKeyRef = useRef("");

  const selectedPlan = answers[0];
  const effectiveLicense = selectedPlan || companyLicense;
  const isBasicLicense = effectiveLicense === "License Basic";
  const currentPlanConfig = PLAN_OPTIONS.find((plan) => plan.value === effectiveLicense);
  const currentPlanLabel = currentPlanConfig?.title || "Pro";
  const renewalDateLabel = licenseStatus.renewalDate
    ? licenseStatus.renewalDate.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "Not set";

  const licenseCountdownLabel = (() => {
    if (licenseStatus.daysRemaining === null) return "Renewal date unavailable";
    if (licenseStatus.daysRemaining < 0) {
      const overdue = Math.abs(licenseStatus.daysRemaining);
      return `Expired ${overdue} day${overdue === 1 ? "" : "s"} ago`;
    }
    if (licenseStatus.daysRemaining === 0) return "Renews today";
    return `Renews in ${licenseStatus.daysRemaining} day${licenseStatus.daysRemaining === 1 ? "" : "s"}`;
  })();

  const getDepartmentsKey = (departments) => [...departments].sort().join("|");

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setShowMobileSidebar(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const fetchAnalyticsForDepartments = async (departments, options = {}) => {
    const { rememberAsPreloaded = false } = options;

    if (!companyId) return;

    if (!departments.length) {
      setTotalUsers(0);
      setActiveUsers(0);
      setChartData([]);
      setPieData([]);
      if (rememberAsPreloaded) preloadedAnalyticsKeyRef.current = "";
      return;
    }

    const trainingLevelCounts = {
      basic: 0,
      medium: 0,
      hard: 0,
    };

    const deptSnapshots = await Promise.all(
      departments.map(async (dept) => {
        const usersRef = collection(
          db,
          "freshers",
          companyId,
          "departments",
          dept,
          "users"
        );

        const snap = await getDocs(usersRef);
        let activeCount = 0;

        snap.forEach((userDoc) => {
          const userData = userDoc.data();

          if (userData.status === "active") activeCount++;

          const normalizedLevel = String(userData.trainingLevel || "")
            .trim()
            .toLowerCase();

          if (normalizedLevel === "basic" || normalizedLevel === "medium" || normalizedLevel === "hard") {
            trainingLevelCounts[normalizedLevel] += 1;
          }
        });

        return {
          department: dept,
          totalCount: snap.size,
          activeCount,
        };
      })
    );

    const total = deptSnapshots.reduce((sum, item) => sum + item.totalCount, 0);
    const active = deptSnapshots.reduce((sum, item) => sum + item.activeCount, 0);

    const chart = deptSnapshots.map((item) => ({
      department: item.department,
      users: item.totalCount,
    }));

    setTotalUsers(total);
    setActiveUsers(active);
    setChartData(chart);
    setPieData([
      { name: "Basic", value: trainingLevelCounts.basic },
      { name: "Medium", value: trainingLevelCounts.medium },
      { name: "Hard", value: trainingLevelCounts.hard },
    ]);

    if (rememberAsPreloaded) {
      preloadedAnalyticsKeyRef.current = getDepartmentsKey(departments);
    }
  };

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

  useEffect(() => {
    const fetchLicenseStatus = async () => {
      if (!companyId) return;

      try {
        const status = await getCompanyLicenseStatus(companyId);
        setLicenseStatus(status);
      } catch (err) {
        console.error("Error loading license status:", err);
      }
    };

    fetchLicenseStatus();
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
          await fetchAnalyticsForDepartments(existing, { rememberAsPreloaded: true });
          setHasDepartments(true); // skip onboarding
        } else {
          setHasDepartments(false); // first login, show onboarding
          await fetchAnalyticsForDepartments([], { rememberAsPreloaded: true });
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
          `http://localhost:5000/api/company/notifications/${companyId}?status=pending&types=module_lock,training_completion`
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

  // Refresh analytics when selected departments change (skip one duplicate call after preload).
  useEffect(() => {
    const fetchAnalytics = async () => {
      if (!companyId || !hasDepartments) return;

      const depts = selectedDepts.length ? selectedDepts : [];

      if (!depts.length) {
        await fetchAnalyticsForDepartments([]);
        return;
      }

      const key = getDepartmentsKey(depts);
      if (preloadedAnalyticsKeyRef.current && preloadedAnalyticsKeyRef.current === key) {
        preloadedAnalyticsKeyRef.current = "";
        return;
      }

      try {
        await fetchAnalyticsForDepartments(depts);
      } catch (err) {
        console.error("Error building analytics:", err);
      }
    };

    fetchAnalytics();
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

      const billingPeriodDays = 30;
      const licenseRenewalDate = new Date(Date.now() + billingPeriodDays * 24 * 60 * 60 * 1000);

      await updateDoc(doc(db, "companies", companyId), {
        licensePlan: selectedLicense,
        billingPeriodDays,
        licenseRenewalDate,
        licenseStatus: "active",
        upgradedAt: serverTimestamp(),
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
       <div className="company-page-shell min-h-screen lg:relative">
         <div className="flex min-h-screen flex-col lg:flex-row">
           <aside className="hidden lg:block lg:w-64 lg:flex-shrink-0 lg:fixed lg:inset-y-0 lg:left-0 lg:overflow-hidden">
             <CompanySidebar companyId={companyId} companyName={companyName} className="min-h-screen" />
           </aside>
         <div className="company-main-content flex-1 min-w-0 p-4 sm:p-6 lg:p-8 lg:ml-64">
           <CompanyPageLoader layout="content" message="Loading Company Dashboard..." />
         </div>
         </div>
       </div>
     );
   }
  const progressPercent = (step / QUESTIONS.length) * 100;

  return (
    <div className="company-page-shell min-h-screen lg:relative">
      <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block lg:w-64 lg:flex-shrink-0 lg:fixed lg:inset-y-0 lg:left-0 lg:overflow-hidden">
        <CompanySidebar companyId={companyId} companyName={companyName} className="min-h-screen" />
      </aside>

      {/* Mobile Sidebar Drawer */}
      <div
        className={`fixed inset-0 z-[70] bg-black/50 transition-opacity duration-300 lg:hidden ${
          showMobileSidebar ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setShowMobileSidebar(false)}
      />
      <aside
        className={`fixed top-0 left-0 z-[75] h-screen w-72 max-w-[85vw] transform transition-transform duration-300 lg:hidden ${
          showMobileSidebar ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="h-full bg-[#021B36] shadow-2xl border-r border-[#00FFFF2A]">
          <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-[#00FFFF1E]">
            <span className="text-sm font-semibold tracking-wide text-[#AFCBE3] uppercase">Menu</span>
            <button
              type="button"
              onClick={() => setShowMobileSidebar(false)}
              className="p-2 rounded-lg text-[#AFCBE3] hover:bg-[#00FFFF1A]"
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
          </div>
          <CompanySidebar
            companyId={companyId}
            companyName={companyName}
            className="h-[calc(100vh-57px)] overflow-y-auto"
            onItemClick={() => setShowMobileSidebar(false)}
          />
        </div>
      </aside>

      {/* Main Content */}
      <div className="company-main-content flex-1 min-w-0 p-4 sm:p-6 lg:p-8 lg:ml-64">
        <div className="mb-4 flex items-center justify-between lg:hidden">
          <button
            type="button"
            onClick={() => setShowMobileSidebar(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-[#00FFFF3A] bg-[#021B36]/85 px-3 py-2 text-[#AFCBE3] shadow-sm"
            aria-label="Open menu"
          >
            <Menu size={18} />
            <span className="text-sm font-semibold">Menu</span>
          </button>
          <span className="text-xs uppercase tracking-[0.14em] text-[#8EB6D3]">Company Dashboard</span>
        </div>
        <style>{`
          @keyframes dashFadeUp {
            0% { opacity: 0; transform: translateY(14px); }
            100% { opacity: 1; transform: translateY(0); }
          }

          @keyframes dashGlowDrift {
            0%, 100% { transform: translate3d(0, 0, 0) scale(1); opacity: 0.35; }
            50% { transform: translate3d(8px, -10px, 0) scale(1.08); opacity: 0.55; }
          }

          .dash-enter {
            animation: dashFadeUp 520ms ease-out both;
          }

          .dash-delay-1 { animation-delay: 80ms; }
          .dash-delay-2 { animation-delay: 150ms; }
          .dash-delay-3 { animation-delay: 220ms; }

          .dash-kpi-card {
            position: relative;
            overflow: hidden;
            backdrop-filter: blur(4px);
            transition: transform 240ms ease, border-color 240ms ease, box-shadow 240ms ease;
          }

          .dash-kpi-card::after {
            content: "";
            position: absolute;
            inset: -1px;
            background: linear-gradient(120deg, rgba(0,255,255,0.0), rgba(0,255,255,0.10), rgba(0,123,255,0.0));
            opacity: 0;
            transition: opacity 240ms ease;
            pointer-events: none;
          }

          .dash-kpi-card:hover {
            transform: translateY(-4px);
            border-color: rgba(0, 255, 255, 0.5);
            box-shadow: 0 14px 28px rgba(0, 255, 255, 0.14);
          }

          .dash-kpi-card:hover::after {
            opacity: 1;
          }

          .dash-hero-orb {
            animation: dashGlowDrift 5s ease-in-out infinite;
          }
        `}</style>

        <div className="company-container">
          <div className="company-card dash-enter mb-8 p-6 md:p-8 relative overflow-hidden border-[#00FFFF40] bg-[radial-gradient(circle_at_12%_20%,rgba(0,255,255,0.16),transparent_34%),radial-gradient(circle_at_88%_14%,rgba(0,123,255,0.24),transparent_38%),rgba(2,27,54,0.88)]">
            <div className="dash-hero-orb absolute -top-10 -right-6 w-40 h-40 rounded-full bg-[#00FFFF1A] blur-2xl pointer-events-none" />
            <div className="dash-hero-orb absolute -bottom-14 left-10 w-44 h-44 rounded-full bg-[#007BFF26] blur-3xl pointer-events-none" />
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
              <div className="space-y-2">
                <p className="text-xs tracking-[0.18em] uppercase text-[#8EB6D3]">Company Workspace</p>
                <h1 className="company-title text-2xl sm:text-4xl text-[#E8F7FF] tracking-tight">
                  Welcome, <span className="text-[#00FFFF]">{companyName}</span>
                </h1>
                <p className="company-subtitle pt-1">
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
                  <span
                    className={`px-3 py-1 rounded-lg text-sm font-semibold border ${
                      licenseStatus.isExpired
                        ? "bg-[#7FA3BF]/20 text-[#FFB3B3] border-[#FF9E9E55]"
                        : "bg-[#00FFFF]/20 text-[#00FFFF] border-[#00FFFF66]"
                    }`}
                  >
                    {licenseCountdownLabel}
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
      const amountInr = planConfig?.inrPrice || "PKR 0/month";
      
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
) : QUESTIONS[step - 1].type === "single-select" &&
  QUESTIONS[step - 1].text === "Payment method for licensing" ? (
  <div className="w-full flex justify-center">
    <div className="flex justify-center items-center gap-5 flex-wrap w-full max-w-xl">
      {QUESTIONS[step - 1].options.map((opt) => (
        (() => {
          const PaymentIcon = opt === "Credit Card" ? CreditCard : Wallet;
          return (
        <div
          key={opt}
          onClick={() => setAnswers((prev) => ({ ...prev, [step - 1]: opt }))}
          className={`cursor-pointer flex flex-col items-center justify-center w-[45%] sm:w-[200px] h-[130px]
            rounded-xl border transition-all duration-300
            ${
              answers[step - 1] === opt
                ? "border-[#00FFFF] bg-[#032A4A]/70 scale-105"
                : "border-[#00FFFF30] bg-[#021B36]/70"
            }`}
        >
          <PaymentIcon size={30} className="mb-3 text-[#00FFFF]" />
          <p className="font-semibold text-[#AFCBE3]">{opt}</p>
        </div>
          );
        })()
      ))}
    </div>
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
          <div className="company-container space-y-6 mt-8">
            {/* Google Calendar Connection Prompt - Only show if not connected */}
            {showCalendarPrompt && !calendarConnectionAttempted && (
              <div className="company-card dash-enter dash-delay-1 bg-gradient-to-r from-[#00FFFF]/20 to-[#007BFF]/20 border-[#00FFFF] p-6 relative">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
              <div className="company-kpi-card dash-kpi-card dash-enter dash-delay-1">
                <h3 className="company-kpi-label">Current Plan</h3>
                <p className="company-kpi-value text-[#E8F7FF]">{currentPlanLabel}</p>
                <p className="text-xs text-[#7FA3BF] mt-1">{currentPlanConfig?.capacity || "Plan details available"}</p>
              </div>
              <div className="company-kpi-card dash-kpi-card dash-enter dash-delay-1">
                <h3 className="company-kpi-label">License Renewal</h3>
                <p
                  className={`company-kpi-value ${
                    licenseStatus.isExpired ? "text-[#FF9E9E]" : "text-[#E8F7FF]"
                  }`}
                >
                  {licenseStatus.daysRemaining === null
                    ? "N/A"
                    : licenseStatus.daysRemaining < 0
                      ? `${Math.abs(licenseStatus.daysRemaining)}d overdue`
                      : `${licenseStatus.daysRemaining}d left`}
                </p>
                <p className="text-xs text-[#7FA3BF] mt-1">{renewalDateLabel}</p>
              </div>
              <div className="company-kpi-card dash-kpi-card dash-enter dash-delay-1">
                <h3 className="company-kpi-label">Total Departments</h3>
                <p className="company-kpi-value text-[#E8F7FF]"><AnimatedCounter value={selectedDepts.length} /></p>
              </div>
              <div className="company-kpi-card dash-kpi-card dash-enter dash-delay-2">
                <h3 className="company-kpi-label">Total Users</h3>
                <p className="company-kpi-value text-[#E8F7FF]"><AnimatedCounter value={totalUsers} /></p>
              </div>
              <div className="company-kpi-card dash-kpi-card dash-enter dash-delay-2">
                <h3 className="company-kpi-label">Active Users</h3>
                <p className="company-kpi-value text-[#E8F7FF]"><AnimatedCounter value={activeUsers} /></p>
              </div>
              <div className="company-kpi-card dash-kpi-card dash-enter dash-delay-3">
                <h3 className="company-kpi-label">Onboarding Completion</h3>
                <p className="company-kpi-value text-[#E8F7FF]">
                  <AnimatedCounter value={completedFreshers} /> / <AnimatedCounter value={totalUsers} />
                </p>
              </div>

            </div>

            {chartData && chartData.length > 0 && (
              <div className="company-card dash-enter dash-delay-3 max-w-5xl mx-auto mt-6 p-6 border-[#00FFFF3A] bg-[linear-gradient(180deg,rgba(2,27,54,0.92),rgba(3,28,58,0.85))]">
                <h2 className="text-lg font-semibold text-[#00FFFF] mb-4">Department Analytics</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="h-[360px] p-4 rounded-xl border border-[#00FFFF40] bg-[#021B36]/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
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

                  <div className="h-[360px] p-4 rounded-xl border border-[#00FFFF40] bg-[#021B36]/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={{ fill: '#AFCBE3' }}>
                          {pieData.map((entry, idx) => (
                            <Cell key={`cell-${idx}`} fill={["#8EC5FF", "#7CFFEA", "#FF7AB6"][idx % 3]} />
                          ))}
                        </Pie>
                        <Legend wrapperStyle={{ color: '#AFCBE3' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <p className="mt-4 text-sm italic text-[#AFCBE3]">
                  Bar chart shows users per department, and pie chart shows how many users are in Basic, Medium, and Hard training levels.
                </p>
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
    </div>
  );
}
