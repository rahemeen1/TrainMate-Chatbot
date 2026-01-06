//Chatbot.jsx
import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FresherSideMenu } from "./FresherSideMenu";
import { db } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";
import { PaperAirplaneIcon } from "@heroicons/react/24/solid";

export default function FresherChatbot() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state || {};

  const [userData, setUserData] = useState(null);
  const [messages, setMessages] = useState([
    { from: "bot", text: "Hi! I'm your assistant. How can I help you today?", id: 0 },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false); // bot typing indicator
  const chatEndRef = useRef(null);

  const userId = state.userId || localStorage.getItem("userId");
  const companyId = state.companyId || localStorage.getItem("companyId");
  const deptId = state.deptId || localStorage.getItem("deptId");
  const companyName = state.companyName || localStorage.getItem("companyName");

  useEffect(() => {
    if (!userId || !companyId || !deptId) {
      navigate("/", { replace: true });
      return;
    }

    const fetchUser = async () => {
      try {
        const userRef = doc(db, "freshers", companyId, "departments", deptId, "users", userId);
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          alert("User not found");
          navigate("/", { replace: true });
          return;
        }
        setUserData(snap.data());
      } catch (err) {
        console.error(err);
        alert("Error loading user data");
        navigate("/", { replace: true });
      }
    };

    fetchUser();
  }, [userId, companyId, deptId, navigate]);

  // Scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const handleSend = () => {
    if (!input.trim()) return;

    const userMessage = { from: "user", text: input, id: Date.now() };
    setMessages([...messages, userMessage]);
    setInput("");

    // Bot typing simulation
    setTyping(true);
    setTimeout(() => {
      const botMessage = {
        from: "bot",
        text: "Thanks for your message! I'm learning to assist you better.",
        id: Date.now() + 1,
      };
      setMessages((prev) => [...prev, botMessage]);
      setTyping(false);
    }, 1500);
  };

  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">

      {/* Left Side Menu */}
      <div className="w-64 bg-[#021B36]/90 p-4">
        <FresherSideMenu
          userId={userId}
          companyId={companyId}
          deptId={deptId}
          companyName={companyName}
        />
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">

        {/* Header with neon/glass style */}
        <div className="bg-[#021B36]/90 p-4 border-b border-[#00FFFF50] flex flex-col md:flex-row justify-between items-start md:items-center gap-2 md:gap-0 shadow-lg">
          <div>
            <h2 className="text-2xl font-bold text-[#00FFFF]">
              Welcome to TrainMate Chatbot!
            </h2>
            <p className="text-[#AFCBE3] text-sm mt-1">
              {userData?.name || "Fresher"} | <span className="text-[#00FFFF]">{userData?.deptName}</span> | <span className="text-[#00FFFF]">{userData?.companyName}</span>
            </p>
          </div>
          <button
            onClick={() => navigate(-1)}
            className="text-[#00FFFF] font-bold hover:text-white border border-[#00FFFF50] rounded px-3 py-1 hover:scale-105 transition-transform shadow-md"
          >
            ← Back
          </button>
        </div>

        {/* Chat History */}
          <div className="flex-1 px-8 py-6 overflow-y-auto bg-gradient-to-b from-[#021B36] to-[#031C3A] space-y-6">
  {messages.map((msg) => (
    <div
      key={msg.id}
      className={`flex items-end gap-3 ${
        msg.from === "user" ? "justify-end" : "justify-start"
      }`}
    >
      {/* Bot Avatar */}
      {msg.from === "bot" && (
        <div className="w-9 h-9 rounded-full bg-[#00FFFF20] flex items-center justify-center border border-[#00FFFF40] shadow-md">
          💬
        </div>
      )}

      {/* Message Bubble */}
      <div
        className={`px-5 py-3 max-w-[65%] text-sm leading-relaxed backdrop-blur-md
        ${
          msg.from === "user"
            ? "bg-gradient-to-r from-[#00FFFF] to-[#00FFC2] text-[#031C3A] rounded-2xl rounded-br-md shadow-lg"
            : "bg-[#031C3A]/70 text-[#AFCBE3] rounded-2xl rounded-bl-md border border-[#00FFFF30] shadow-md"
        }`}
      >
        {msg.text}
      </div>
    </div>
  ))}

  {/* Typing Indicator */}
  {typing && (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-full bg-[#00FFFF20] flex items-center justify-center border border-[#00FFFF40] shadow-md">
        💬
      </div>

      <div className="px-4 py-2 rounded-2xl bg-[#031C3A]/70 border border-[#00FFFF30] flex gap-1 shadow-md">
        <span className="animate-bounce">•</span>
        <span className="animate-bounce delay-150">•</span>
        <span className="animate-bounce delay-300">•</span>
      </div>
    </div>
  )}

  <div ref={chatEndRef} />
</div>


        {/* Input Box */}
        <div className="bg-[#021B36]/90 p-4 border-t border-[#00FFFF50] flex gap-2 items-center">
          <input
            type="text"
            placeholder="Type a message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            className="flex-1 px-4 py-2 rounded-xl bg-[#031C3A]/80 text-white focus:outline-none border border-[#00FFFF50] placeholder:text-[#AFCBE3]"
          />
          <button
            onClick={handleSend}
            className="bg-gradient-to-r from-[#00FFFF] to-[#00FFC2] p-3 rounded-xl hover:scale-105 transition-transform shadow-lg"
          >
            <PaperAirplaneIcon className="w-5 h-5 text-[#031C3A]" />
          </button>
        </div>
      </div>

      {/* Tailwind Animations */}
      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px);}
            to { opacity: 1; transform: translateY(0);}
          }
          .animate-fadeIn {
            animation: fadeIn 0.4s ease-in-out;
          }

          @keyframes bounce {
            0%, 80%, 100% { transform: translateY(0); }
            40% { transform: translateY(-4px); }
          }
          .animate-bounce { animation: bounce 1s infinite; }
          .delay-150 { animation-delay: 0.15s; }
          .delay-300 { animation-delay: 0.3s; }
        `}
      </style>
    </div>
  );
}
