import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function LoadingScreen({ onFinish }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onFinish?.(); // ✅ Safe optional call
    }, 2500); // 2.5 sec loading duration

    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-[#020617] via-[#0a0f2c] to-[#000000] z-50"
        initial={{ opacity: 1 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 1 }}
      >
        {/* Neon TM Box */}
        <motion.div
          className="w-20 h-20 bg-[#00FFFF]/20 rounded-2xl flex items-center justify-center shadow-[0_0_25px_#00FFFF] border border-[#00FFFF]/50"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{
            scale: [1, 1.1, 1],
            opacity: 1,
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            repeatType: "mirror",
          }}
        >
          <span className="text-[#00FFFF] font-extrabold text-2xl tracking-widest drop-shadow-[0_0_15px_#00FFFF]">
            TM
          </span>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
