import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { db } from "../../firebase";
import {
  collection,
  getDocs,
  doc,
  getDoc,
} from "firebase/firestore";
import axios from "axios";

export default function Roadmap() {
  const { companyId, deptId, userId } = useParams();

  const [roadmap, setRoadmap] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadRoadmap = async () => {
      try {
        /* --------------------------------
           1️⃣ Check existing roadmap
        --------------------------------- */
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

        if (!roadmapSnap.empty) {
          const modules = roadmapSnap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));

          setRoadmap(modules);
          setLoading(false);
          return;
        }

        /* --------------------------------
           2️⃣ Fetch fresher profile
        --------------------------------- */
        const userRef = doc(
          db,
          "freshers",
          companyId,
          "departments",
          deptId,
          "users",
          userId
        );

        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          throw new Error("Fresher profile not found");
        }

        const userData = userSnap.data();

        const expertiseScore =
          userData.onboarding?.expertise ?? 1;

        const expertiseLevel =
          userData.onboarding?.level ?? "Beginner";

        const trainingOn =
          userData.trainingOn ?? "General";

        /* --------------------------------
           3️⃣ Fetch training time
        --------------------------------- */
        let trainingTime = "1 month";

        const answersCol = collection(
          db,
          "companies",
          companyId,
          "onboardingAnswers"
        );

        const answersSnap = await getDocs(answersCol);

        if (!answersSnap.empty) {
          const answersDoc = answersSnap.docs[0].data();

          trainingTime =
            answersDoc.answers?.["1"] ??
            answersDoc.answers?.[1] ??
            "1 month";
        }

        /* --------------------------------
           4️⃣ Generate roadmap (API)
        --------------------------------- */
        const payload = {
          companyId,
          deptId,
          userId,
          trainingTime,
          expertiseScore,
          expertiseLevel,
          trainingOn,
        };

        console.log("📦 Roadmap payload:", payload);

        await axios.post(
          "http://localhost:5000/api/roadmap/generate",
          payload
        );

        /* --------------------------------
           5️⃣ Fetch generated roadmap
        --------------------------------- */
        const newSnap = await getDocs(roadmapRef);

        const newModules = newSnap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        setRoadmap(newModules);
      } catch (error) {
        console.error("❌ Roadmap error:", error);
      } finally {
        setLoading(false);
      }
    };

    loadRoadmap();
  }, [companyId, deptId, userId]);

  /* --------------------------------
     UI
  --------------------------------- */
  if (loading) {
    return (
      <p className="text-white p-10">
        Generating roadmap based on your profile...
      </p>
    );
  }

  if (!roadmap.length) {
    return (
      <p className="text-white p-10">
        No roadmap found.
      </p>
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
          .map((module) => (
            <div key={module.id} className="relative pl-10">
              {/* DOT */}
              <div className="absolute -left-[11px] top-2 w-5 h-5 rounded-full bg-[#00FFFF] shadow-[0_0_10px_#00FFFF]" />

              {/* CARD */}
              <div className="bg-[#021B36]/80 border border-[#00FFFF30] rounded-xl p-6 shadow-lg">
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

                <p className="text-[#AFCBE3] text-sm">
                  {module.description}
                </p>
              </div>
            </div>
          ))}
      </div>

      <p className="text-center text-xs text-[#AFCBE3] mt-16">
        Powered by TrainMate
      </p>
    </div>
  );
}
