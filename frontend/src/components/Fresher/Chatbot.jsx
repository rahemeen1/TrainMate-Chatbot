import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FresherSideMenu } from "./FresherSideMenu";
import { db } from "../../firebase";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
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
      const active = snap.docs.find(d => d.data().status === "in-progress");
      if (active) setActiveModuleId(active.id);
    };

    fetchActiveModule();
  }, []);

  /* ---------------- FETCH PREVIOUS CHAT DATES ---------------- */
  useEffect(() => {
    if (!activeModuleId) return;

    const fetchPreviousChats = async () => {
      const chatRef = collection(
        db,
        "freshers",
        companyId,
        "departments",
        deptId,
        "users",
        userId,
        "roadmap",
        activeModuleId,
        "chatSessions"
      );

      const snap = await getDocs(chatRef);
      const dates = snap.docs.map(d => d.id).sort().reverse();
      setAvailableDates(dates);

      // show current server date chat by default
      const today = dates[0];
      if (today) loadChatByDate(today, false);
    };

    fetchPreviousChats();
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
      setMode(readOnly ? "read" : "new");
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
    setSelectedDate(null);
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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  return (
    <div className="flex h-screen overflow-hidden bg-[#031C3A] text-white">

      {/* SIDEBAR */}
     <div className="w-64 bg-[#021B36]/90 p-4 flex-none">
  <FresherSideMenu
    userId={userId}
    companyId={companyId}
    deptId={deptId}
    companyName={companyName}
  />
</div>


      {/* MAIN */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* HEADER */}
       <div className="bg-[#021B36]/90 p-4 border-b border-[#00FFFF50] flex justify-between items-center flex-none">

          <div className="bg-[#021B36]/90 p-4 border-b border-[#00FFFF50] flex justify-between items-center flex-none">
  <div>
    <h2 className="text-2xl text-[#00FFFF]">TrainMate Chatbot</h2>
    <p className="text-sm text-[#AFCBE3]">
      {userData?.name} | {userData?.deptName} | {userData?.companyName}
    </p>
  </div>
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
<div className="flex-1 flex flex-col px-8 py-6 overflow-hidden">

  {/* ONLY THIS SCROLLS */}
  <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">

   {messages.map((msg, i) => (
  <div
    key={i}
    className={`flex items-end gap-2 ${
      msg.from === "user" ? "justify-end" : "justify-start"
    }`}
  >
    {/* BOT ICON */}
    {msg.from === "bot" && (
      <CpuChipIcon className="w-7 h-7 text-cyan-400 flex-shrink-0" />
    )}

    {/* MESSAGE BUBBLE */}
    <div
      className={`
        px-4 py-2 rounded-xl max-w-[65%]
        ${msg.from === "user"
          ? "bg-[#00FFFF] text-[#031C3A]"
          : "bg-[#021B36] border border-cyan-400/30 text-[#AFCBE3]"}
        ${mode === "read" ? "opacity-50" : ""}
      `}
    >
      {msg.text}
    </div>

    {/* USER ICON */}
    {msg.from === "user" && (
      <UserCircleIcon className="w-7 h-7 text-[#00FFFF] flex-shrink-0" />
    )}
  </div>
))}

{typing && <div className="text-sm text-gray-400">Typing...</div>}

<div ref={chatEndRef} />

  </div>


</div>


        {/* INPUT */}
       <div className="p-4 border-t border-[#00FFFF50] flex gap-2 items-center bg-[#021B36]/90 flex-none">
  <input
    disabled={mode === "read"}
    value={input}
    onChange={e => setInput(e.target.value)}
    onKeyDown={e => e.key === "Enter" && handleSend()}
    placeholder={mode === "read" ? "Read only chat" : "Type a message..."}
    className="flex-1 px-4 py-2 rounded bg-[#021B36] border border-cyan-400/40"
  />
  <button
    onClick={handleSend}
    disabled={mode === "read"}
    className="bg-cyan-400 p-3 rounded disabled:opacity-40"
  >
    <PaperAirplaneIcon className="w-5 h-5 text-[#031C3A]" />
  </button>
</div>

      </div>
    </div>
  );
}
