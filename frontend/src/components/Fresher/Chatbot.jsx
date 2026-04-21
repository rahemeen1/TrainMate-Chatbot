//chatbot.jsx
import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import FresherShellLayout from "./FresherShellLayout";
import { db } from "../../firebase";
import { apiUrl } from "../../services/api";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { PaperAirplaneIcon, ArrowLeftIcon } from "@heroicons/react/24/solid";
import { UserCircleIcon, CpuChipIcon } from "@heroicons/react/24/solid";
import { FEATURE_FLAGS, isFeatureAvailable } from "../../services/featureAccess";
import { getCompanyLicensePlan } from "../../services/companyLicense";
import CompanyPageLoader from "../CompanySpecific/CompanyPageLoader";


export default function FresherChatbot() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state || {};
  const messagesScrollRef = useRef(null);

  const userId = state.userId || localStorage.getItem("userId");
  const companyId = state.companyId || localStorage.getItem("companyId");
  const deptId = state.deptId || localStorage.getItem("deptId");
  const companyName = state.companyName || localStorage.getItem("companyName");

  const [userData, setUserData] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);

  const [activeModuleId, setActiveModuleId] = useState(null);
  const [availableDates, setAvailableDates] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);

  const [mode, setMode] = useState("new"); // new | read
  const [selectedDate, setSelectedDate] = useState(null);
  const todayDate = new Date().toISOString().split("T")[0];

  const [licenseCheckLoading, setLicenseCheckLoading] = useState(true);
  const [hasChatbotAccess, setHasChatbotAccess] = useState(false);

  /* Check license access */
  useEffect(() => {
    const checkChatbotAccess = async () => {
      if (!companyId) {
        setLicenseCheckLoading(false);
        return;
      }

      try {
        const licensePlan = await getCompanyLicensePlan(companyId);
        const hasAccess = isFeatureAvailable(licensePlan, FEATURE_FLAGS.CHATBOT);
        setHasChatbotAccess(hasAccess);
      } catch (err) {
        console.error("Error checking chatbot access:", err);
      } finally {
        setLicenseCheckLoading(false);
      }
    };

    checkChatbotAccess();
  }, [companyId]);


  /* ---------------- USER LOAD ---------------- */
  useEffect(() => {
    if (!userId || !companyId || !deptId) {
      navigate("/", { replace: true });
      return;
    }

    const fetchUser = async () => {
      const userRef = doc(
        db,
        "freshers",
        companyId,
        "departments",
        deptId,
        "users",
        userId
      );
      const snap = await getDoc(userRef);
      if (snap.exists()) setUserData(snap.data());
    };

    fetchUser();
  }, []);
  
  useEffect(() => {
  if (!userId || !companyId || !deptId) {
    navigate("/", { replace: true });
    return;
  }

  const fetchUser = async () => {
    const userRef = doc(
      db,
      "freshers",
      companyId,
      "departments",
      deptId,
      "users",
      userId
    );
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const data = snap.data();
      // Fetch company name separately
      const companyRef = doc(db, "companies", companyId);
      const companySnap = await getDoc(companyRef);
      const companyName = companySnap.exists() ? companySnap.data().name : "Unknown Company";

      setUserData({ ...data, companyName }); // override with correct name
    }
  };

  fetchUser();
}, []);


  /* ---------------- ACTIVE MODULE ---------------- */
  useEffect(() => {
    const fetchActiveModule = async () => {
      const roadmapRef = collection(
        db,
        "freshers",
        companyId,
        "departments",
        deptId,
        "users",
        userId,
        "roadmap"
      );

      const snap = await getDocs(roadmapRef);
      // Sort by order and find first in-progress module, fallback to pending
      const sortedDocs = snap.docs
        .map((d) => ({ id: d.id, data: d.data() }))
        .sort((a, b) => (a.data.order || 0) - (b.data.order || 0));
      
      let active = sortedDocs.find(m => m.data.status === "in-progress");
      
      // Fallback to pending module if no in-progress module
      if (!active) {
        active = sortedDocs.find(m => m.data.status === "pending");
      }
      
      if (active) setActiveModuleId(active.id);
    };

    fetchActiveModule();
  }, []);

  // 🔄 Refresh active module after calling /chat/init to pick up auto-unlocked modules
  const refreshActiveModule = async () => {
    const roadmapRef = collection(
      db,
      "freshers",
      companyId,
      "departments",
      deptId,
      "users",
      userId,
      "roadmap"
    );

    const snap = await getDocs(roadmapRef);
    const sortedDocs = snap.docs
      .map((d) => ({ id: d.id, data: d.data() }))
      .sort((a, b) => (a.data.order || 0) - (b.data.order || 0));
    
    let active = sortedDocs.find(m => m.data.status === "in-progress");
    
    if (!active) {
      active = sortedDocs.find(m => m.data.status === "pending");
    }
    
    if (active && active.id !== activeModuleId) {
      console.log(`🔄 Module auto-upgraded: ${activeModuleId} → ${active.id}`);
      setActiveModuleId(active.id);
      return true; // Module was changed
    }
    return false; // Module unchanged
  };


useEffect(() => {
  if (!activeModuleId) return;

  const loadTodayChat = async () => {
    const chatRef = doc(
      db,
      "freshers",
      companyId,
      "departments",
      deptId,
      "users",
      userId,
      "roadmap",
      activeModuleId,
      "chatSessions",
      todayDate
    );

    const snap = await getDoc(chatRef);

    // ✅ IF TODAY CHAT EXISTS → LOAD IT
    if (snap.exists()) {
      setMessages(snap.data().messages || []);
      setMode("new");
    }
    // ❌ ELSE → CREATE CHAT → THEN LOAD
    else {
      const res = await fetch(apiUrl("/api/chat/init"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, companyId, deptId })
      });

      const data = await res.json();
      const initMessages = [{ from: "bot", text: data.reply }];

      await setDoc(chatRef, {
        messages: initMessages,
        createdAt: new Date()
      });

      setMessages(initMessages);
      setMode("new");

      // 🔄 Refresh active module if backend auto-unlocked next module
      const moduleChanged = await refreshActiveModule();
      if (moduleChanged) {
        console.log("✅ Module updated after /chat/init, user will see new module on next init");
      }
    }
  };

  loadTodayChat();
}, [activeModuleId]);

  /* ---------------- LOAD CHAT BY DATE ---------------- */
  const loadChatByDate = async (date, readOnly = true) => {
    const chatDoc = doc(
      db,
      "freshers",
      companyId,
      "departments",
      deptId,
      "users",
      userId,
      "roadmap",
      activeModuleId,
      "chatSessions",
      date
    );

    const snap = await getDoc(chatDoc);
    if (snap.exists()) {
      setMessages(snap.data().messages || []);
      //setMode(readOnly ? "read" : "new");
      setMode(date === todayDate ? "new" : "read");
      setSelectedDate(date);
      setShowDropdown(false);
    }
  };

  /* ---------------- INIT NEW CHAT ---------------- */
  const initNewChat = async () => {
    const res = await fetch(apiUrl("/api/chat/init"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, companyId, deptId })
    });

    const data = await res.json();
    setMessages([{ from: "bot", text: data.reply }]);
    setMode("new");
    setSelectedDate(todayDate);

    // 🔄 Refresh active module if backend auto-unlocked next module
    const moduleChanged = await refreshActiveModule();
    if (moduleChanged) {
      console.log("✅ Module updated after initNewChat");
    }
  };

  /* ---------------- SEND MESSAGE ---------------- */
  const handleSend = async () => {
    if (!input.trim() || mode === "read") return;

    const userMsg = { from: "user", text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setTyping(true);

    try {
      const res = await fetch(apiUrl("/api/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, companyId, deptId, newMessage: input })
      });

      const data = await res.json();
      setMessages(prev => [...prev, { from: "bot", text: data.reply }]);

      if (data?.askForFeedback) {
        setShowFeedbackModal(true);
      }
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { from: "bot", text: "Unable to respond at the moment." }
      ]);
    } finally {
      setTyping(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key !== "Enter" || mode === "read") return;

    if (e.ctrlKey || e.metaKey) {
      const target = e.target;
      const start = target.selectionStart ?? input.length;
      const end = target.selectionEnd ?? input.length;
      const nextValue = `${input.slice(0, start)}\n${input.slice(end)}`;

      e.preventDefault();
      setInput(nextValue);

      requestAnimationFrame(() => {
        target.selectionStart = target.selectionEnd = start + 1;
        target.style.height = "auto";
        target.style.height = Math.min(target.scrollHeight, 120) + "px";
      });
      return;
    }

    // Send on Enter
    if (!e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSubmitFeedback = async () => {
    if (feedbackSubmitting || (!feedbackRating && !feedbackText.trim())) return;

    try {
      setFeedbackSubmitting(true);
      const res = await fetch(apiUrl("/api/chat/feedback"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          companyId,
          deptId,
          moduleId: activeModuleId,
          rating: feedbackRating,
          feedbackText,
        }),
      });

      const data = await res.json();
      if (res.ok && data?.acknowledgement) {
        setMessages((prev) => [...prev, { from: "bot", text: data.acknowledgement }]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { from: "bot", text: "I could not save feedback right now, but I will keep helping you." },
      ]);
    } finally {
      setFeedbackSubmitting(false);
      setShowFeedbackModal(false);
      setFeedbackRating(0);
      setFeedbackText("");
    }
  };

  useEffect(() => {
    const panel = messagesScrollRef.current;
    if (!panel) return;

    panel.scrollTo({
      top: panel.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, typing]);

  if (licenseCheckLoading) {
    return <CompanyPageLoader message="Verifying chatbot access..." layout="page" />;
  }

  if (!hasChatbotAccess) {
    return (
      <div className="flex min-h-screen bg-[#031C3A] text-white items-center justify-center p-6">
        <div className="max-w-md rounded-2xl bg-[#021B36] border-2 border-[#00FFFF]/30 p-8 text-center space-y-6">
          <div className="text-6xl">🔒</div>
          <div>
            <h1 className="text-2xl font-bold text-[#00FFFF] mb-2">Feature Locked</h1>
            <p className="text-[#AFCBE3]">AI chatbot is not available on your current plan.</p>
            <p className="text-sm text-[#9FC2DA] mt-2">Please upgrade to Pro to unlock chatbot features.</p>
          </div>
          <button
            onClick={() => navigate(-1)}
            className="w-full px-4 py-2 rounded-lg bg-[#00FFFF]/20 text-[#00FFFF] border border-[#00FFFF]/40 hover:bg-[#00FFFF]/30 transition"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <FresherShellLayout
      userId={userId}
      companyId={companyId}
      deptId={deptId}
      companyName={companyName}
      roadmapGenerated={true}
      headerLabel="Training Assistant"
      contentClassName="p-0 overflow-hidden"
    >
    <div className="h-[calc(100dvh-110px)] sm:h-[calc(100dvh-96px)] lg:h-screen bg-[#031C3A] text-white overflow-hidden">
      
      {/* Add CSS for proper HTML rendering in chat */}
      <style>
        {`
          .chat-message {
            line-height: 1.6;
            font-size: 0.95rem;
          }
          .chat-message ul {
            list-style-type: disc;
            margin-left: 1.5rem;
            margin-top: 0.5rem;
            margin-bottom: 0.5rem;
          }
          .chat-message ol {
            list-style-type: decimal;
            margin-left: 1.5rem;
            margin-top: 0.5rem;
            margin-bottom: 0.5rem;
          }
          .chat-message li {
            margin-bottom: 0.35rem;
            line-height: 1.5;
          }
          .chat-message li:last-child {
            margin-bottom: 0;
          }
          .chat-message p {
            margin-bottom: 0.75rem;
            line-height: 1.6;
          }
          .chat-message p:last-child {
            margin-bottom: 0;
          }
          .chat-message b, .chat-message strong {
            font-weight: 600;
            color: #00FFFF;
          }
          .chat-message i, .chat-message em {
            font-style: italic;
          }
          .chat-message h3 {
            font-size: 1.125rem;
            font-weight: 600;
            margin-top: 1rem;
            margin-bottom: 0.5rem;
            color: #00FFFF;
          }
          .chat-message h3:first-child {
            margin-top: 0;
          }
          .chat-message code {
            background-color: rgba(0, 255, 255, 0.15);
            padding: 0.2rem 0.4rem;
            border-radius: 0.25rem;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
          }
          .chat-message pre {
            background-color: rgba(0, 255, 255, 0.05);
            padding: 0.75rem;
            border-radius: 0.5rem;
            overflow-x: auto;
            margin: 0.75rem 0;
          }
          .chat-message pre code {
            background-color: transparent;
            padding: 0;
          }
          
          /* Scrollbar Styling */
          ::-webkit-scrollbar {
            width: 12px;
          }
          
          ::-webkit-scrollbar-track {
            background: rgba(2, 27, 54, 0.5);
          }
          
          ::-webkit-scrollbar-thumb {
            background: #00FFFF;
            border-radius: 6px;
          }
          
          ::-webkit-scrollbar-thumb:hover {
            background: #00e0e0;
          }
        `}
      </style>

      {/* MAIN */}
      <div className="h-full min-h-0 flex flex-col overflow-hidden">

        {/* HEADER */}
        <div className="bg-gradient-to-r from-[#021B36]/95 via-[#031C3A]/90 to-[#021B36]/95 p-3 sm:p-4 md:p-5 border-b border-[#00FFFF40] flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center flex-none">
          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl md:text-3xl text-[#00FFFF] font-semibold leading-tight">
              {companyName ? `${companyName}'s Training Assistant` : "Chatbot"}
            </h2>
            <div className="flex flex-wrap items-center gap-3 text-xs text-[#AFCBE3]">
              <div className="flex items-center gap-2">
                <span className="uppercase tracking-wide text-[10px] text-[#7FB6C8]">User</span>
                <span className="text-[#CFE8FF] font-medium">{userData?.name || "User"}</span>
              </div>
              <span className="hidden sm:block h-4 w-px bg-[#00FFFF30]" />
              <div className="flex items-center gap-2">
                <span className="uppercase tracking-wide text-[10px] text-[#7FB6C8]">Department</span>
                <span className="text-[#CFE8FF] font-medium">{userData?.deptName || "Department"}</span>
              </div>
              <span className="hidden sm:block h-4 w-px bg-[#00FFFF30]" />
              <div className="flex items-center gap-2">
                <span className="uppercase tracking-wide text-[10px] text-[#7FB6C8]">Company</span>
                <span className="text-[#CFE8FF] font-medium">{userData?.companyName || "Company"}</span>
              </div>
            </div>
          </div>

          <div className="flex w-full sm:w-auto items-center gap-2 relative">
            <button
              onClick={() =>
                navigate("/previous-chats", {
                  state: { userId, companyId, deptId, activeModuleId }
                })
              }
               className="w-full sm:w-auto justify-center flex items-center gap-2 border border-cyan-400/60 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm text-cyan-300 hover:bg-cyan-400/10 transition"
          >
              View Previous Chats
            </button>

            {showDropdown && (
              <div className="absolute right-0 mt-2 bg-[#021B36] border border-cyan-400/30 rounded w-44 z-10">
                {availableDates.length === 0 && (
                  <div className="p-3 text-sm text-gray-400">No previous chats</div>
                )}
                {availableDates.map(date => (
                  <div
                    key={date}
                    onClick={() => loadChatByDate(date, true)}
                    className="px-4 py-2 cursor-pointer hover:bg-cyan-400/10"
                  >
                    {date}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      
     
{/* CHAT CONTAINER */}
<div className="flex-1 min-h-0 flex flex-col overflow-hidden">

  {/* CHAT MESSAGES - SCROLLABLE */}
  <div ref={messagesScrollRef} className="flex-1 min-h-0 overflow-y-auto scroll-smooth px-3 sm:px-5 md:px-8 py-4 sm:py-6 md:py-8">
   {messages.map((msg, i) => (
  <div key={i} className="mb-6">
    <div className={`flex items-start gap-3 ${msg.from === "user" ? "justify-end" : "justify-start"}`}>
      {msg.from === "bot" && (
        <CpuChipIcon className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-400 flex-shrink-0 mt-1" />
      )}

      <div
        className={`
          chat-message
          px-3 sm:px-4 md:px-5 py-3 sm:py-4 rounded-lg
          max-w-[88%] sm:max-w-[80%] lg:max-w-[75%]
          text-sm sm:text-base
          break-words overflow-wrap-anywhere
          shadow-lg
          transition-all duration-200
          ${msg.from === "user"
            ? "bg-cyan-600/40 text-white border border-cyan-400/40"
            : "bg-[#021B36] border border-cyan-400/30 text-[#E0EAF5]"}
          ${mode === "read" ? "opacity-50" : ""}
        `}
        style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
        dangerouslySetInnerHTML={{ __html: msg.text }}
      />

      {msg.from === "user" && (
        <UserCircleIcon className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-400 flex-shrink-0 mt-1" />
      )}
    </div>
  </div>
))}
{typing && (
  <div className="mb-6 animate-pulse">
    <div className="flex items-start gap-3">
      {/* BOT ICON */}
      <CpuChipIcon className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-400 flex-shrink-0 mt-1" />

      {/* TYPING BUBBLE */}
      <div className="px-3 sm:px-5 py-3 sm:py-4 rounded-lg bg-[#021B36] border border-cyan-400/30 text-[#E0EAF5] shadow-lg">
        <span className="flex gap-1.5">
          <span className="w-2.5 h-2.5 bg-cyan-400 rounded-full animate-bounce [animation-delay:0ms]" />
          <span className="w-2.5 h-2.5 bg-cyan-400 rounded-full animate-bounce [animation-delay:150ms]" />
          <span className="w-2.5 h-2.5 bg-cyan-400 rounded-full animate-bounce [animation-delay:300ms]" />
        </span>
      </div>
    </div>
  </div>
) }

        </div>

        {/* INPUT */}
        <div className="px-3 sm:px-5 md:px-8 py-3 sm:py-4 border-t border-[#00FFFF50] flex gap-2 items-end bg-[#021B36]/90 flex-none">
          <textarea
            disabled={mode === "read"}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={mode === "read" ? "Read only chat" : "Type a message... (Enter to send, Ctrl+Enter for a new line)"}
            rows={1}
            className="flex-1 px-3 sm:px-4 py-2 rounded bg-[#021B36] border border-cyan-400/40 resize-none overflow-hidden min-h-[42px] max-h-[120px] text-sm sm:text-base"
            style={{
              height: 'auto',
              overflowY: input.split('\n').length > 3 ? 'auto' : 'hidden'
            }}
            onInput={(e) => {
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
          />
          <button
            onClick={handleSend}
            disabled={mode === "read"}
            className="bg-cyan-400 p-2.5 sm:p-3 rounded disabled:opacity-40 flex-shrink-0"
          >
            <PaperAirplaneIcon className="w-5 h-5 text-[#031C3A]" />
          </button>
        </div>

      </div>
    </div>

    {showFeedbackModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
        <div className="w-full max-w-md rounded-2xl border border-cyan-400/40 bg-[#021B36] p-6 shadow-2xl">
          <h3 className="text-xl font-bold text-cyan-300 mb-2">Quick Feedback Check-in</h3>
          <p className="text-sm text-[#AFCBE3] mb-4">
            I want to improve daily. How helpful were the last few responses?
          </p>

          <div className="flex gap-2 mb-4">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                onClick={() => setFeedbackRating(value)}
                className={`h-10 w-10 rounded-full border font-semibold transition ${
                  feedbackRating >= value
                    ? "border-cyan-300 bg-cyan-400/20 text-cyan-200"
                    : "border-cyan-400/30 text-[#AFCBE3] hover:bg-cyan-400/10"
                }`}
              >
                {value}
              </button>
            ))}
          </div>

          <textarea
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            rows={3}
            placeholder="Optional: tell me how I should improve (clarity, pace, depth, examples)..."
            className="w-full rounded-lg border border-cyan-400/30 bg-[#031C3A] px-3 py-2 text-sm text-white placeholder:text-[#8EB2CA]"
          />

          <div className="mt-4 flex gap-3">
            <button
              onClick={() => {
                setShowFeedbackModal(false);
                setFeedbackRating(0);
                setFeedbackText("");
              }}
              className="flex-1 rounded-lg border border-cyan-400/40 px-4 py-2 text-cyan-200 hover:bg-cyan-400/10"
            >
              Skip
            </button>
            <button
              onClick={handleSubmitFeedback}
              disabled={feedbackSubmitting || (!feedbackRating && !feedbackText.trim())}
              className="flex-1 rounded-lg bg-cyan-300 px-4 py-2 font-semibold text-[#031C3A] disabled:opacity-50"
            >
              {feedbackSubmitting ? "Saving..." : "Submit"}
            </button>
          </div>
        </div>
      </div>
    )}
    </div>
    </FresherShellLayout>
  );
}
