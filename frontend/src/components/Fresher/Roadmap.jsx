import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { db } from "../../firebase";
import {
  collection,
  getDocs
} from "firebase/firestore";
import axios from "axios";

export default function Roadmap() {
  const { companyId, deptId, userId } = useParams();

  const [roadmap, setRoadmap] = useState([]);
  const [loading, setLoading] = useState(true);

  console.log("📍 Roadmap page loaded for:", {
    companyId,
    deptId,
    userId
  });

  useEffect(() => {
    const loadRoadmap = async () => {
      try {
        console.log("🔍 Checking if roadmap exists...");

        // 1️⃣ Check Firestore first
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

        const snapshot = await getDocs(roadmapRef);

        if (!snapshot.empty) {
          console.log("✅ Roadmap already exists");

          const modules = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));

          setRoadmap(modules);
          setLoading(false);
          return;
        }

        // 2️⃣ If not exists → generate
        console.log("🧠 Roadmap not found. Triggering backend...");

        await axios.post("http://localhost:5000/api/roadmap/generate", {
          companyId,
          deptId,
          userId
        });

        console.log("⏳ Waiting for roadmap to be generated...");

        // 3️⃣ Fetch again
        const newSnapshot = await getDocs(roadmapRef);

        const newModules = newSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        setRoadmap(newModules);
      } catch (err) {
        console.error("❌ Error loading roadmap:", err);
      } finally {
        setLoading(false);
      }
    };

    loadRoadmap();
  }, [companyId, deptId, userId]);

  // ---------------- UI ----------------

  // if (loading) {
  //   return (
  //     <div className="flex justify-center items-center h-screen text-xl">
  //       🔄 Generating your personalized roadmap...
  //     </div>
  //   );
  // }

  // return (
  //   <div className="p-6 space-y-4">
  //     <h2 className="text-2xl font-bold">Your Learning Roadmap</h2>

  //     {roadmap.map(module => (
  //       <div
  //         key={module.id}
  //         className="p-4 border rounded shadow bg-[#031C3A] text-white"
  //       >
  //         <h3 className="text-lg font-semibold">
  //           {module.order}. {module.moduleTitle}
  //         </h3>
  //         <p className="text-sm opacity-80">
  //           {module.description}
  //         </p>
  //         <p className="text-xs mt-1">
  //           ⏱ {module.estimatedDays} days
  //         </p>
  //       </div>
  //     ))}
  //   </div>
  // );
  // ---------------- UI ----------------

if (loading) {
  return (
    <div className="min-h-screen bg-[#031C3A] flex justify-center items-center text-xl text-[#00FFFF]">
      🔄 Generating your personalized roadmap...
    </div>
  );
}

return (
  <div className="min-h-screen bg-[#031C3A] text-white p-10">
    {/* HEADER */}
    <div className="mb-10">
      <h2 className="text-3xl font-bold text-[#00FFFF]">
        Your Learning Roadmap
      </h2>
      <p className="text-[#AFCBE3] mt-2">
        Follow these phases step by step to complete your training
      </p>
    </div>

    {/* TIMELINE */}
    <div className="relative border-l-2 border-[#00FFFF40] ml-6 space-y-10">
      {roadmap
        .sort((a, b) => a.order - b.order)
        .map((module, index) => (
          <div key={module.id} className="relative pl-10">
            {/* DOT */}
            <div className="absolute -left-[11px] top-2 w-5 h-5 rounded-full bg-[#00FFFF] shadow-[0_0_10px_#00FFFF]" />

            {/* CARD */}
            <div className="bg-[#021B36]/80 border border-[#00FFFF30] rounded-xl p-6 shadow-lg hover:shadow-[0_0_20px_#00FFFF20] transition">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm px-3 py-1 rounded-full bg-[#00FFFF] text-[#031C3A] font-semibold">
                  Phase {module.order}
                </span>

                <span className="text-xs text-[#AFCBE3]">
                  ⏱ {module.estimatedDays} days
                </span>
              </div>

              <h3 className="text-xl font-semibold text-[#00FFFF] mb-2">
                {module.moduleTitle}
              </h3>

              <p className="text-[#AFCBE3] text-sm leading-relaxed">
                {module.description}
              </p>
            </div>
          </div>
        ))}
    </div>

    {/* FOOTER */}
    <p className="text-center text-xs text-[#AFCBE3] mt-16">
      Powered by TrainMate
    </p>
  </div>
);

}
