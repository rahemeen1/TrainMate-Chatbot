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

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen text-xl">
        🔄 Generating your personalized roadmap...
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-2xl font-bold">Your Learning Roadmap</h2>

      {roadmap.map(module => (
        <div
          key={module.id}
          className="p-4 border rounded shadow bg-[#031C3A] text-white"
        >
          <h3 className="text-lg font-semibold">
            {module.order}. {module.moduleTitle}
          </h3>
          <p className="text-sm opacity-80">
            {module.description}
          </p>
          <p className="text-xs mt-1">
            ⏱ {module.estimatedDays} days
          </p>
        </div>
      ))}
    </div>
  );
}
