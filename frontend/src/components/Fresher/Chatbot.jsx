//chatbot.jsx
import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FresherSideMenu } from "./FresherSideMenu";
import { db } from "../../firebase";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { PaperAirplaneIcon, ArrowLeftIcon } from "@heroicons/react/24/solid";
import { UserCircleIcon, CpuChipIcon } from "@heroicons/react/24/solid";


export default function FresherChatbot() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state || {};
  const chatEndRef = useRef(null);

  const userId = state.userId || localStorage.getItem("userId");
  const companyId = state.companyId || localStorage.getItem("companyId");
  const deptId = state.deptId || localStorage.getItem("deptId");
  const companyName = state.companyName || localStorage.getItem("companyName");

  const [userData, setUserData] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);

  const [activeModuleId, setActiveModuleId] = useState(null);
  const [availableDates, setAvailableDates] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);

  const [mode, setMode] = useState("new"); // new | read
  const [selectedDate, setSelectedDate] = useState(null);
  const todayDate = new Date().toISOString().split("T")[0];


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
      const res = await fetch("http://localhost:5000/api/chat/init", {
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
    const res = await fetch("http://localhost:5000/api/chat/init", {
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
      const res = await fetch("http://localhost:5000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, companyId, deptId, newMessage: input })
      });

      const data = await res.json();
      setMessages(prev => [...prev, { from: "bot", text: data.reply }]);
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
    // Send on Ctrl+Enter or Command+Enter
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
  chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
}, [messages, typing]);


  return (
    <div className="flex h-screen overflow-hidden bg-[#031C3A] text-white">
      
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

      {/* SIDEBAR */}
     <div className="w-64 bg-[#021B36]/90 p-4 flex-none">
  <FresherSideMenu
    userId={userId}
    companyId={companyId}
    deptId={deptId}
    companyName={companyName}
    roadmapGenerated={true}
  />
</div>


      {/* MAIN */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* HEADER */}
        <div className="bg-[#021B36]/90 p-4 border-b border-[#00FFFF50] flex justify-between items-center flex-none">
          <div>
            <h2 className="text-2xl text-[#00FFFF]">TrainMate Chatbot</h2>
            <p className="text-sm text-[#AFCBE3]">
              {userData?.name} | {userData?.deptName} | {userData?.companyName}
            </p>
          </div>

          <div className="flex items-center gap-2 relative">
            <button
              onClick={() =>
                navigate("/previous-chats", {
                  state: { userId, companyId, deptId, activeModuleId }
                })
              }
              className="border border-cyan-400/40 px-3 py-1 rounded"
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
<div className="flex-1 flex flex-col overflow-hidden">

  {/* CHAT MESSAGES - SCROLLABLE */}
  <div className="flex-1 overflow-y-auto scroll-smooth px-8 py-8">
   {messages.map((msg, i) => (
  <div key={i} className="mb-6">
    <div className={`flex items-start gap-3 ${msg.from === "user" ? "justify-end" : "justify-start"}`}>
      {msg.from === "bot" && (
        <CpuChipIcon className="w-8 h-8 text-cyan-400 flex-shrink-0 mt-1" />
      )}

      <div
        className={`
          chat-message
          px-5 py-4 rounded-lg
          max-w-[75%]
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
        <UserCircleIcon className="w-8 h-8 text-cyan-400 flex-shrink-0 mt-1" />
      )}
    </div>
  </div>
))}
{typing && (
  <div className="mb-6 animate-pulse">
    <div className="flex items-start gap-3">
      {/* BOT ICON */}
      <CpuChipIcon className="w-8 h-8 text-cyan-400 flex-shrink-0 mt-1" />

      {/* TYPING BUBBLE */}
      <div className="px-5 py-4 rounded-lg bg-[#021B36] border border-cyan-400/30 text-[#E0EAF5] shadow-lg">
        <span className="flex gap-1.5">
          <span className="w-2.5 h-2.5 bg-cyan-400 rounded-full animate-bounce [animation-delay:0ms]" />
          <span className="w-2.5 h-2.5 bg-cyan-400 rounded-full animate-bounce [animation-delay:150ms]" />
          <span className="w-2.5 h-2.5 bg-cyan-400 rounded-full animate-bounce [animation-delay:300ms]" />
        </span>
      </div>
    </div>
  </div>
)}

          <div ref={chatEndRef} />
        </div>

        {/* INPUT */}
        <div className="px-8 py-4 border-t border-[#00FFFF50] flex gap-2 items-end bg-[#021B36]/90 flex-none">
          <textarea
            disabled={mode === "read"}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={mode === "read" ? "Read only chat" : "Type a message... (Ctrl+Enter to send)"}
            rows={1}
            className="flex-1 px-4 py-2 rounded bg-[#021B36] border border-cyan-400/40 resize-none overflow-hidden min-h-[42px] max-h-[120px]"
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
            className="bg-cyan-400 p-3 rounded disabled:opacity-40 flex-shrink-0"
          >
            <PaperAirplaneIcon className="w-5 h-5 text-[#031C3A]" />
          </button>
        </div>

      </div>
    </div>
    </div>
  );
}
