import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { db } from "../../firebase";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { ArrowLeftIcon, ChatBubbleLeftRightIcon } from "@heroicons/react/24/solid";

export default function PreviousChats() {
  const navigate = useNavigate();
  const { state } = useLocation();

  const [chatSessions, setChatSessions] = useState([]);
  const [messages, setMessages] = useState([]);
  const [activeSession, setActiveSession] = useState(null);

  const userId = state?.userId;
  const companyId = state?.companyId;
  const deptId = state?.deptId;

  const getPreviewText = (value) => {
    const raw = String(value || "");
    if (!raw) return "No messages";

    // Keep previews plain-text so users do not see raw HTML tags in list cards.
    return raw
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, " ")
      .trim() || "No messages";
  };

  useEffect(() => {
    if (!state || !userId || !companyId || !deptId) {
      navigate("/chatbot");
    }
  }, [state, userId, companyId, deptId, navigate]);

  useEffect(() => {
    if (!userId || !companyId || !deptId) return;

    const fetchAllSessions = async () => {
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

      const roadmapSnap = await getDocs(roadmapRef);

      const modules = roadmapSnap.docs
        .map((d) => ({
          id: d.id,
          order: d.data().order || 0,
          title: d.data().moduleTitle || `Module ${d.data().order || ""}`.trim(),
          status: d.data().status || "unknown",
        }))
        .sort((a, b) => a.order - b.order);

      const sessionSnaps = await Promise.all(
        modules.map(async (module) => {
          const ref = collection(
            db,
            "freshers",
            companyId,
            "departments",
            deptId,
            "users",
            userId,
            "roadmap",
            module.id,
            "chatSessions"
          );

          const snap = await getDocs(ref);
          return { module, snap };
        })
      );

      const sessions = sessionSnaps
        .flatMap(({ module, snap }) =>
          snap.docs.map((d) => ({
            id: `${module.id}:${d.id}`,
            moduleId: module.id,
            moduleTitle: module.title,
            moduleOrder: module.order,
            moduleStatus: module.status,
            sessionDate: d.id,
            lastMessage: getPreviewText(d.data().messages?.at(-1)?.text),
          }))
        )
        .sort((a, b) => {
          if (a.sessionDate === b.sessionDate) {
            return (b.moduleOrder || 0) - (a.moduleOrder || 0);
          }
          return a.sessionDate < b.sessionDate ? 1 : -1;
        });

      setChatSessions(sessions);
    };

    fetchAllSessions();
  }, [userId, companyId, deptId]);

  const loadChat = async (session) => {
    if (!session?.moduleId || !session?.sessionDate) return;

    const ref = doc(
      db,
      "freshers",
      companyId,
      "departments",
      deptId,
      "users",
      userId,
      "roadmap",
      session.moduleId,
      "chatSessions",
      session.sessionDate
    );

    const snap = await getDoc(ref);
    if (snap.exists()) {
      setMessages(snap.data().messages || []);
      setActiveSession(session);
    }
  };

  const groupedChats = { Today: [], Yesterday: [], Older: [] };
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  chatSessions.forEach((session) => {
    const sessionDate = new Date(session.sessionDate + "T00:00:00");

    if (sessionDate.toDateString() === today.toDateString()) {
      groupedChats.Today.push(session);
    } else if (sessionDate.toDateString() === yesterday.toDateString()) {
      groupedChats.Yesterday.push(session);
    } else {
      groupedChats.Older.push(session);
    }
  });

  const formatDate = (d) =>
    new Date(d + "T00:00:00").toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  const hasSelectedChat = Boolean(activeSession);
  const mobileListVisibilityClass = hasSelectedChat ? "hidden lg:block" : "block";
  const mobileChatVisibilityClass = hasSelectedChat ? "block" : "hidden lg:block";

  return (
    <div className="flex h-screen bg-[#031C3A] text-white overflow-hidden">
      <div className="flex-1 flex flex-col">
        <div className="bg-gradient-to-r from-[#021B36] via-[#031C3A] to-[#021B36] px-4 py-3 sm:px-5 sm:py-4 md:px-6 md:py-5 border-b border-cyan-400/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl md:text-3xl text-cyan-300 font-semibold leading-tight">
              Previous Learning Chats
            </h2>
            <p className="text-xs sm:text-sm text-[#AFCBE3] mt-1">
              Review your past conversations across all modules.
            </p>
          </div>
          <button
            onClick={() => navigate("/chatbot")}
            className="w-full sm:w-auto justify-center flex items-center gap-2 border border-cyan-400/60 px-4 py-2 rounded-lg text-sm text-cyan-300 hover:bg-cyan-400/10 transition"
          >
            <ArrowLeftIcon className="w-4 h-4" /> Back to Chat
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">
          <div
            className={`w-full h-full lg:h-auto lg:w-80 xl:w-[22rem] bg-[#021B36]/90 lg:border-r border-cyan-400/20 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4 ${mobileListVisibilityClass}`}
          >
            {["Today", "Yesterday", "Older"].map(
              (group) =>
                groupedChats[group].length > 0 && (
                  <div key={group} className="mb-6">
                    <h3 className="text-cyan-300 mb-3 font-semibold uppercase tracking-wide text-xs">
                      {group}
                    </h3>

                    {groupedChats[group].map((session) => (
                      <div
                        key={session.id}
                        onClick={() => loadChat(session)}
                        className={`p-3 rounded-xl cursor-pointer border transition shadow-sm ${
                          activeSession?.id === session.id
                            ? "border-cyan-400 bg-cyan-400/10 shadow-[0_0_12px_rgba(0,255,255,0.15)]"
                            : "border-cyan-400/20 bg-[#031C3A]/60"
                        } hover:border-cyan-400 hover:bg-cyan-400/5`}
                      >
                        <div className="flex gap-2">
                          <ChatBubbleLeftRightIcon className="w-5 h-5 text-cyan-300" />
                          <div>
                            <div className="text-sm text-cyan-300 font-medium">
                              {formatDate(session.sessionDate)}
                            </div>
                            <div className="text-[11px] text-[#7FB6C8] mt-0.5">
                              {session.moduleTitle} ({session.moduleStatus})
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
            {chatSessions.length === 0 && (
              <div className="rounded-xl border border-cyan-400/20 bg-[#031C3A]/60 px-4 py-6 text-center text-sm text-[#AFCBE3]">
                No previous chats available yet.
              </div>
            )}
          </div>

          <div
            className={`flex-1 overflow-y-auto px-3 py-3 sm:px-5 sm:py-5 md:px-7 md:py-6 lg:px-8 lg:py-6 space-y-3 sm:space-y-4 bg-[#031C3A] ${mobileChatVisibilityClass}`}
          >
            <div className="lg:hidden mb-1">
              <button
                onClick={() => {
                  setActiveSession(null);
                  setMessages([]);
                }}
                className="inline-flex items-center gap-1.5 border border-cyan-400/50 px-3 py-1.5 rounded-lg text-xs text-cyan-300 hover:bg-cyan-400/10 transition"
              >
                <ArrowLeftIcon className="w-3.5 h-3.5" /> Back to dates
              </button>
            </div>

            {activeSession && (
              <p className="text-xs text-[#8FC6D8] lg:hidden mb-2">
                Showing chat for {formatDate(activeSession.sessionDate)} ({activeSession.moduleTitle})
              </p>
            )}

            {messages.length === 0 && (
              <div className="text-center text-[#AFCBE3] mt-8 sm:mt-16 rounded-xl border border-cyan-400/20 bg-[#021B36]/50 px-4 py-8">
                Select a chat from the left to view details
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.from === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[92%] sm:max-w-[82%] lg:max-w-[70%] px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border text-sm leading-relaxed shadow-sm ${
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
