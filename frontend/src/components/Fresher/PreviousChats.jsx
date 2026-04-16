import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { db } from "../../firebase";
import {
  collection,
  getDocs,
  doc,
  getDoc
} from "firebase/firestore";
import {
  ArrowLeftIcon,
  ChatBubbleLeftRightIcon
} from "@heroicons/react/24/solid";

export default function PreviousChats() {
  const navigate = useNavigate();
  const { state } = useLocation();

  // ALWAYS define hooks first
  const [activeModuleId, setActiveModuleId] = useState(null);
  const [chatSessions, setChatSessions] = useState([]);
  const [messages, setMessages] = useState([]);
  const [activeDate, setActiveDate] = useState(null);

  const userId = state?.userId;
  const companyId = state?.companyId;
  const deptId = state?.deptId;

  /* ----------------------------------
     HANDLE MISSING STATE SAFELY
  -----------------------------------*/
  useEffect(() => {
    if (!state || !userId || !companyId || !deptId) {
      navigate("/chatbot");
    }
  }, [state, userId, companyId, deptId, navigate]);

  /* ----------------------------------
     FETCH ACTIVE MODULE
  -----------------------------------*/
  useEffect(() => {
    if (!userId || !companyId || !deptId) return;

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

      let active = snap.docs.find(
        d => d.data().status === "in-progress"
      );

      // Fallback to pending module if no in-progress module
      if (!active) {
        active = snap.docs.find(
          d => d.data().status === "pending"
        );
      }

      if (active) {
        setActiveModuleId(active.id);
      }
    };

    fetchActiveModule();
  }, [userId, companyId, deptId]);

  /* ----------------------------------
     FETCH CHAT SESSIONS
  -----------------------------------*/
  useEffect(() => {
    if (!activeModuleId) return;

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
          lastMessage:
            d.data().messages?.at(-1)?.text || "No messages"
        }))
        .sort((a, b) => (a.id < b.id ? 1 : -1));

      setChatSessions(sessions);
    };

    fetchSessions();
  }, [activeModuleId, userId, companyId, deptId]);

  /* ----------------------------------
     LOAD CHAT
  -----------------------------------*/
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

  /* ----------------------------------
     GROUP CHATS
  -----------------------------------*/
  const groupedChats = { Today: [], Yesterday: [], Older: [] };
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  chatSessions.forEach(session => {
    const sessionDate = new Date(session.id + "T00:00:00");

    if (sessionDate.toDateString() === today.toDateString())
      groupedChats.Today.push(session);
    else if (
      sessionDate.toDateString() === yesterday.toDateString()
    )
      groupedChats.Yesterday.push(session);
    else groupedChats.Older.push(session);
  });

  const formatDate = (d) =>
    new Date(d + "T00:00:00").toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });

  /* ----------------------------------
     UI
  -----------------------------------*/
  return (
    <div className="flex h-screen bg-[#031C3A] text-white">

      <div className="flex-1 flex flex-col">

        {/* HEADER */}
        <div className="bg-gradient-to-r from-[#021B36] via-[#031C3A] to-[#021B36] p-5 md:p-6 border-b border-cyan-400/30 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl text-cyan-300 font-semibold">
              Previous Learning Chats
            </h2>
            <p className="text-sm text-[#AFCBE3]">
              Review and revisit your past conversations
            </p>
          </div>
          <button
            onClick={() => navigate("/chatbot")}
            className="flex items-center gap-2 border border-cyan-400/60 px-4 py-2 rounded-lg text-sm text-cyan-300 hover:bg-cyan-400/10 transition"
          >
            <ArrowLeftIcon className="w-4 h-4" /> Back to Chat
          </button>
        </div>

        {/* BODY */}
        <div className="flex flex-1 overflow-hidden">

          {/* SIDEBAR */}
          <div className="w-80 bg-[#021B36]/90 border-r border-cyan-400/20 overflow-y-auto p-4">
            {["Today", "Yesterday", "Older"].map(group =>
              groupedChats[group].length > 0 && (
                <div key={group} className="mb-6">
                  <h3 className="text-cyan-300 mb-3 font-semibold uppercase tracking-wide text-xs">
                    {group}
                  </h3>

                  {groupedChats[group].map(session => (
                    <div
                      key={session.id}
                      onClick={() => loadChat(session.id)}
                      className={`p-3 rounded-2xl cursor-pointer border transition shadow-sm
                        ${
                          activeDate === session.id
                            ? "border-cyan-400 bg-cyan-400/10 shadow-[0_0_12px_rgba(0,255,255,0.15)]"
                            : "border-cyan-400/20 bg-[#031C3A]/60"
                        }
                        hover:border-cyan-400 hover:bg-cyan-400/5`}
                    >
                      <div className="flex gap-2">
                        <ChatBubbleLeftRightIcon className="w-5 h-5 text-cyan-300" />
                        <div>
                          <div className="text-sm text-cyan-300 font-medium">
                            {formatDate(session.id)}
                          </div>
                          <div className="text-xs text-[#AFCBE3] line-clamp-2 mt-1">
                            {session.lastMessage}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>

          {/* CHAT VIEW */}
          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4 bg-[#031C3A]">
            {messages.length === 0 && (
              <div className="text-center text-[#AFCBE3] mt-20">
                Select a chat from the left to view details
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${
                  msg.from === "user"
                    ? "justify-end"
                    : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[70%] px-4 py-3 rounded-2xl border text-sm leading-relaxed shadow-sm
                    ${
                      msg.from === "user"
                        ? "bg-cyan-400/15 border-cyan-400/40 text-[#CFE8FF]"
                        : "bg-[#021B36] border-cyan-400/20 text-[#AFCBE3]"
                    }`}
                >
                  {typeof msg.text === "string" && msg.text.includes("<") ? (
                    <div dangerouslySetInnerHTML={{ __html: msg.text }} />
                  ) : (
                    msg.text
                  )}
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
