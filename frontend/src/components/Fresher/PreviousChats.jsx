import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FresherSideMenu } from "./FresherSideMenu";
import { db } from "../../firebase";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { ArrowLeftIcon, ChatBubbleLeftRightIcon } from "@heroicons/react/24/solid";

export default function PreviousChats() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const { userId, companyId, deptId, companyName, activeModuleId } = state;

  const [chatSessions, setChatSessions] = useState([]);
  const [messages, setMessages] = useState([]);
  const [activeDate, setActiveDate] = useState(null);

  // Fetch chat sessions
  useEffect(() => {
    const fetchSessions = async () => {
      const ref = collection(
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

      const snap = await getDocs(ref);
      const sessions = snap.docs
        .map(d => ({
          id: d.id,
          lastMessage: d.data().messages?.[d.data().messages.length - 1]?.text || "No messages",
        }))
        .sort((a, b) => (a.id < b.id ? 1 : -1)); // latest first

      setChatSessions(sessions);
    };

    fetchSessions();
  }, []);

  // Load chat by date
  const loadChat = async (date) => {
    const ref = doc(
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

    const snap = await getDoc(ref);
    if (snap.exists()) {
      setMessages(snap.data().messages || []);
      setActiveDate(date);
    }
  };

  // Group chats by Today / Yesterday / Older (Vanilla JS)
  const groupedChats = { Today: [], Yesterday: [], Older: [] };
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  chatSessions.forEach(session => {
    const sessionDate = new Date(session.id); // assuming id is ISO string
    if (sessionDate.toDateString() === today.toDateString()) groupedChats.Today.push(session);
    else if (sessionDate.toDateString() === yesterday.toDateString()) groupedChats.Yesterday.push(session);
    else groupedChats.Older.push(session);
  });

  // Format date to readable string
  const formatDate = (d) => {
    const dateObj = new Date(d);
    return dateObj.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#031C3A] text-white">

     

      {/* MAIN */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* HEADER */}
        <div className="bg-[#021B36]/90 p-4 border-b border-[#00FFFF50] flex justify-between items-center flex-none">
          <div>
            <h2 className="text-2xl text-[#00FFFF]">TrainMate Chatbot</h2>
            <p className="text-sm text-[#AFCBE3]">Previous Chats</p>
          </div>
          <button
            onClick={() => navigate("/chatbot")}
            className="flex items-center gap-1 border border-cyan-400/40 px-3 py-1 rounded"
          >
            <ArrowLeftIcon className="w-4 h-4" /> Back
          </button>
        </div>

        {/* CONTENT */}
        <div className="flex flex-1 overflow-hidden">

          {/* CHAT LIST / SIDEBAR */}
          <div className="w-72 bg-[#021B36]/70 border-r border-cyan-400/20 overflow-y-auto p-3">
            
            {["Today", "Yesterday", "Older"].map(group => (
              groupedChats[group].length > 0 && (
                <div key={group} className="mb-4">
                  <h3 className="text-cyan-400 font-semibold mb-2">{group}</h3>
                  <div className="space-y-2">
                    {groupedChats[group].map(session => (
                      <div
                        key={session.id}
                        onClick={() => loadChat(session.id)}
                        className={`
                          p-3 rounded-xl cursor-pointer
                          flex items-start gap-2
                          ${activeDate === session.id ? "border-cyan-400 bg-cyan-400/10" : "border border-cyan-400/20"}
                          hover:border-cyan-400/60 hover:bg-cyan-400/10
                          transition
                        `}
                      >
                        <ChatBubbleLeftRightIcon className="w-5 h-5 text-cyan-400 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="text-sm text-cyan-400 font-semibold">{formatDate(session.id)}</div>
                          <div className="text-xs text-[#AFCBE3] line-clamp-2">{session.lastMessage}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            ))}

          </div>

          {/* CHAT VIEW */}
          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
            {messages.length === 0 && (
              <div className="text-gray-400 text-center mt-20">Select a chat from the left</div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.from === "user" ? "justify-end" : "justify-start"} opacity-50`}
              >
                <div className="px-4 py-2 rounded-xl max-w-[65%] bg-[#021B36] border border-cyan-400/30 text-[#AFCBE3]">
                  {msg.text}
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
