// frontend/src/components/CompanySpecific/CompanyFresherChatbot.jsx
import { useState, useEffect, useRef } from "react";
import axios from "axios";

function renderStyledBotText(text) {
  if (!text) return null;

  const cleanText = text.replace(/\*\*/g, "").trim();
  const lines = cleanText.split("\n");

  const renderInlineHighlights = (line, lineIndex) => {
    const matches = [...line.matchAll(/\*\*(.*?)\*\*/g)];
    if (matches.length === 0) return <span>{line}</span>;

    const nodes = [];
    let lastIndex = 0;

    matches.forEach((match, idx) => {
      const [fullMatch, content] = match;
      const start = match.index ?? 0;
      const end = start + fullMatch.length;

      if (start > lastIndex) {
        nodes.push(
          <span key={`txt-${lineIndex}-${idx}`}>{line.slice(lastIndex, start)}</span>
        );
      }

      nodes.push(
        <span
          key={`hl-${lineIndex}-${idx}`}
          className="text-[#00FFFF] font-semibold"
        >
          {content}
        </span>
      );

      lastIndex = end;
    });

    if (lastIndex < line.length) {
      nodes.push(<span key={`tail-${lineIndex}`}>{line.slice(lastIndex)}</span>);
    }

    return <>{nodes}</>;
  };

  return (
    <div className="space-y-1.5 text-sm leading-6 whitespace-pre-wrap">
      {lines.map((rawLine, idx) => {
        const line = rawLine.trimEnd();

        if (!line.trim()) {
          return <div key={`empty-${idx}`} className="h-1" />;
        }

        const isBullet = line.startsWith("•") || line.startsWith("-");
        const isLabelLine =
          !isBullet &&
          line.includes(":") &&
          line.split(":")[0].trim().length > 0 &&
          line.split(":")[0].trim().length <= 24;

        if (isBullet) {
          const bulletText = line.replace(/^[•-]\s*/, "");
          return (
            <div key={`line-${idx}`} className="flex gap-2 text-[#CFE8FF]">
              <span className="text-[#00FFFF]">•</span>
              <span>{renderInlineHighlights(bulletText, idx)}</span>
            </div>
          );
        }

        if (isLabelLine) {
          const [label, ...restParts] = line.split(":");
          const value = restParts.join(":").trim();
          return (
            <div key={`line-${idx}`} className="text-[#CFE8FF]">
              <span className="text-[#00FFFF] font-semibold">{label.trim()}:</span>{" "}
              <span>{renderInlineHighlights(value, idx)}</span>
            </div>
          );
        }

        return (
          <div key={`line-${idx}`} className="text-[#CFE8FF]">
            {renderInlineHighlights(line, idx)}
          </div>
        );
      })}
    </div>
  );
}

export default function CompanyFresherChatbot({ companyId, companyName }) {
  const [messages, setMessages] = useState([
    {
      id: 1,
      type: "bot",
      text: `Hello! I'm your AI assistant for ${companyName}. I can help you understand your freshers' performance, progress, and training status. Feel free to ask questions like:
      
      • "Show me a summary of all freshers"
      • "Who are the top performers?"
      • "Which freshers need attention?"
      • "How is [fresher name] doing?"`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const messagesEndRef = useRef(null);
  const [suggestions, setSuggestions] = useState([
    "Show me a summary",
    "Who are top performers?",
    "Which freshers need attention?",
    "How is training progressing?",
  ]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async (messageText = input) => {
    if (!messageText.trim()) return;

    // Add user message
    const userMessage = {
      id: Date.now(),
      type: "user",
      text: messageText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setError("");

    try {
      const response = await axios.post(
        "http://localhost:5000/api/company-chat/chat",
        {
          companyId,
          message: messageText,
        }
      );

      const botMessage = {
        id: Date.now() + 1,
        type: "bot",
        text: response.data.reply,
        timestamp: new Date(),
        dataContext: response.data.dataContext,
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (err) {
      console.error("Chat error:", err);
      setError("Failed to get response. Please try again.");

      const errorMessage = {
        id: Date.now() + 1,
        type: "bot",
        text: "Sorry, I encountered an error while processing your request. Please try again.",
        timestamp: new Date(),
        isError: true,
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    sendMessage(suggestion);
  };

  return (
    <div className="flex flex-col h-full bg-[#031C3A] text-white rounded-2xl border border-[#00FFFF22] overflow-hidden">
      {/* Header */}
      <div className="bg-[#021B36]/80 border-b border-[#00FFFF30] p-4 md:p-6">
        <h3 className="text-xl font-semibold text-[#00FFFF]">
          AI Assistant
        </h3>
        <p className="text-sm text-[#AFCBE3] mt-1">
          Ask about your freshers' progress and performance
        </p>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.type === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-xs md:max-w-md lg:max-w-lg px-4 py-3 rounded-xl ${
                msg.type === "user"
                  ? "bg-[#00FFFF]/20 border border-[#00FFFF30] text-[#AFCBE3]"
                  : msg.isError
                  ? "bg-red-500/20 border border-red-500/30 text-red-300"
                  : "bg-[#031C3A]/70 border border-[#00FFFF30] text-[#AFCBE3]"
              }`}
            >
              {msg.type === "bot" && !msg.isError ? (
                renderStyledBotText(msg.text)
              ) : (
                <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
              )}

              {/* Display data context if available */}
              {msg.dataContext && msg.type === "bot" && (
                <div className="mt-3 pt-3 border-t border-[#00FFFF20] text-xs">
                  {msg.dataContext?.totalFreshers && (
                    <div className="space-y-1">
                      <p className="text-[#00FFFF] font-semibold">
                        📊 Quick Stats
                      </p>
                      <p>
                        Total Freshers:{" "}
                        <strong>{msg.dataContext.totalFreshers}</strong>
                      </p>
                      <p>
                        Active:{" "}
                        <strong className="text-green-400">
                          {msg.dataContext.activeFreshers}
                        </strong>
                      </p>
                      <p>
                        Average Progress:{" "}
                        <strong>{msg.dataContext.avgProgress}%</strong>
                      </p>
                    </div>
                  )}
                </div>
              )}

              <p className="text-xs text-[#AFCBE3]/60 mt-2">
                {msg.timestamp.toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-[#031C3A]/70 border border-[#00FFFF30] px-4 py-3 rounded-xl">
              <div className="flex gap-2">
                <div className="w-2 h-2 bg-[#00FFFF] rounded-full animate-bounce"></div>
                <div
                  className="w-2 h-2 bg-[#00FFFF] rounded-full animate-bounce"
                  style={{ animationDelay: "0.2s" }}
                ></div>
                <div
                  className="w-2 h-2 bg-[#00FFFF] rounded-full animate-bounce"
                  style={{ animationDelay: "0.4s" }}
                ></div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-start">
            <div className="bg-red-500/20 border border-red-500/30 px-4 py-3 rounded-xl text-red-300 text-sm">
              {error}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggestions */}
      {messages.length === 1 && (
        <div className="px-4 md:px-6 pb-4 space-y-2">
          <p className="text-xs text-[#AFCBE3] uppercase tracking-wide">
            Quick Questions
          </p>
          <div className="grid grid-cols-1 gap-2">
            {suggestions.map((suggestion, idx) => (
              <button
                key={idx}
                onClick={() => handleSuggestionClick(suggestion)}
                className="text-left px-3 py-2 bg-[#031C3A]/70 hover:bg-[#00FFFF]/10 border border-[#00FFFF30] rounded-lg text-sm text-[#AFCBE3] transition"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="border-t border-[#00FFFF30] bg-[#021B36]/50 p-4 md:p-6">
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Ask about freshers performance..."
            className="flex-1 px-4 py-2 bg-[#031C3A]/70 border border-[#00FFFF30] rounded-lg text-white placeholder-[#AFCBE3]/60 focus:outline-none focus:border-[#00FFFF]"
            disabled={loading}
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            className="px-4 py-2 bg-[#00FFFF] text-[#031C3A] rounded-lg font-semibold hover:opacity-90 transition disabled:opacity-50"
          >
            {loading ? "..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
