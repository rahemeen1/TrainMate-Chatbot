import FresherShellLayout from "./FresherShellLayout";
import TrainingLockedScreen from "./TrainingLockedScreen";
import { useState, useEffect } from "react";
import { db } from "../../firebase";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { getCompanyLicensePlan } from "../../services/companyLicense";

export default function About() {
  const [companyName, setCompanyName] = useState("");
  const [userId, setUserId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [deptId, setDeptId] = useState("");
  const [licensePlan, setLicensePlan] = useState("License Basic");
  const [roadmapGenerated, setRoadmapGenerated] = useState(false);
  const [userData, setUserData] = useState(null);

  useEffect(() => {
    const name = localStorage.getItem("companyName");
    const uId = localStorage.getItem("userId");
    const cId = localStorage.getItem("companyId");
    const dId = localStorage.getItem("deptId");

    if (name) setCompanyName(name);
    if (uId) setUserId(uId);
    if (cId) setCompanyId(cId);
    if (dId) setDeptId(dId);
  }, []);

  useEffect(() => {
    if (!userId || !companyId || !deptId) return;

    const checkRoadmapAndLock = async () => {
      try {
        const detectedPlan = await getCompanyLicensePlan(companyId);
        setLicensePlan(detectedPlan);

        // Check if roadmap exists
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
        setRoadmapGenerated(!roadmapSnap.empty);

        // Fetch user data to check training lock
        const userRef = doc(db, "freshers", companyId, "departments", deptId, "users", userId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          setUserData(userSnap.data());
        }
      } catch (err) {
        console.error("Error checking roadmap and lock status:", err);
      }
    };

    checkRoadmapAndLock();
  }, [userId, companyId, deptId]);

  const proSteps = [
    {
      id: 1,
      title: "Complete Onboarding",
      description: "Upload your CV and tell us your expertise level (1-5) in the required domain. This helps us understand your current skills and create a personalized learning roadmap tailored to your skill gaps."
    },
    {
      id: 2,
      title: "Generate Personalized Roadmap",
      description: "Based on your CV, onboarding answers, and company requirements, an AI-powered roadmap is generated with custom learning modules tailored to your skill gaps."
    },
    {
      id: 3,
      title: "Learn & Master Modules",
      description: "Work through each module at your own pace within the allocated time frame. Each module contains learning resources, topics, and estimated duration for completion."
    },
    {
      id: 4,
      title: "Attempt Module Quizzes",
      description: "Test your understanding with MCQs, one-liner questions, and coding challenges for each module. You need to pass the quiz to unlock the next module."
    },
    {
      id: 5,
      title: "Complete All Modules",
      description: "Successfully complete all modules in your roadmap and pass their respective quizzes. Track your progress on the dashboard."
    },
    {
      id: 6,
      title: "Final Certification Quiz",
      description: "Once all modules are completed, attempt the comprehensive final quiz that covers all concepts and skills you've learned throughout the training program."
    },
    {
      id: 7,
      title: "Receive Certificate",
      description: "Pass the final quiz and receive your official Certificate of Training Completion. This certifies your mastery of all required skills and successful completion of the training program."
    }
  ];

  const basicSteps = [
    {
      id: 1,
      title: "Complete Onboarding",
      description: "Upload your CV and share your expertise level. This helps TrainMate understand your current skill level and generate the right learning path for you."
    },
    {
      id: 2,
      title: "Generate Personalized Roadmap",
      description: "TrainMate creates a role-specific roadmap using your onboarding details, company requirements, and skill gaps."
    },
    {
      id: 3,
      title: "Learn Module by Module",
      description: "Work through each module in sequence within the allocated duration and complete all required learning tasks."
    },
    {
      id: 4,
      title: "Use Training Assistant",
      description: "Use the AI training assistant for concept explanations, guidance, and daily support while completing modules."
    },
    {
      id: 5,
      title: "Complete All Modules",
      description: "Finish every module in your roadmap and maintain consistent progress within the training timeline."
    },
    {
      id: 6,
      title: "Completion Verification",
      description: "After all modules are completed, TrainMate verifies your completion status and unlocks certificate eligibility."
    },
    {
      id: 7,
      title: "Receive Certificate",
      description: "Claim your training completion certificate once all required modules are successfully completed."
    }
  ];

  const steps = licensePlan === "License Pro" ? proSteps : basicSteps;

  // Show training locked screen if training is locked and roadmap is generated
  if (licensePlan === "License Pro" && userData?.trainingLocked && roadmapGenerated) {
    return <TrainingLockedScreen userData={userData} />;
  }

  return (
    <FresherShellLayout
      userId={userId}
      companyId={companyId}
      deptId={deptId}
      companyName={companyName}
      roadmapGenerated={roadmapGenerated}
      headerLabel="About"
      contentClassName="p-0 sm:p-0 lg:p-0"
    >
      <div>
        <div className="min-h-screen px-6 py-8 md:px-10 md:py-10 lg:px-12 lg:py-12 bg-[#031C3A]">
          {/* Header */}
          <div className="mb-8 md:mb-10">
            <h1 className="text-3xl md:text-4xl font-bold text-[#00FFFF] mb-3">
              Training Flow
            </h1>
            <p className="text-[#AFCBE3] text-base md:text-lg mb-5">
              Follow these {steps.length} steps to complete your training and earn your certificate
            </p>
            <div className="bg-[#021B36]/60 border border-[#00FFFF]/30 rounded-xl p-5 md:p-6 mb-8 md:mb-10">
              <p className="text-[#AFCBE3] text-sm leading-relaxed">
                {companyName && (
                  <>
                    We at <span className="text-[#00FFFF] font-semibold">{companyName}</span> have provided you with <span className="text-[#00FFFF] font-semibold">TrainMate</span> — an AI-powered training platform designed to help you successfully complete your professional development journey. TrainMate analyzes your CV, understands company requirements, and creates a personalized learning roadmap specifically tailored to your skill gaps and career goals. Below are the 7 essential steps that make up the TrainMate training methodology:
                  </>
                )}
                {!companyName && (
                  <>
                    We have provided you with <span className="text-[#00FFFF] font-semibold">TrainMate</span> — an AI-powered training platform designed to help you successfully complete your professional development journey. TrainMate analyzes your CV, understands company requirements, and creates a personalized learning roadmap specifically tailored to your skill gaps and career goals. Below are the 7 essential steps that make up the TrainMate training methodology:
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Timeline Container */}
          <div className="relative pl-1 md:pl-0">
            {/* Vertical Line */}
            <div className="absolute left-7 md:left-8 top-0 bottom-0 w-1 bg-gradient-to-b from-[#00FFFF] via-[#00FFFF] to-[#00FFC2]"></div>

            {/* Steps */}
            <div className="space-y-6 md:space-y-8">
              {steps.map((step, index) => (
                <div key={step.id} className="relative flex gap-6 md:gap-20">
                  {/* Dot */}
                  <div className="absolute left-0 top-4 w-14 h-14 md:w-16 md:h-16 flex items-center justify-center">
                    <div className="w-14 h-14 md:w-16 md:h-16 bg-[#031C3A] rounded-full border-4 border-[#00FFFF] flex items-center justify-center shadow-lg shadow-[#00FFFF]/50 z-10">
                      <span className="text-[#00FFFF] font-bold text-lg">{step.id}</span>
                    </div>
                  </div>

                  {/* Info Card - Full Width */}
                  <div className="flex-1 mt-1 md:mt-2 ml-16 md:ml-16">
                    <div className="bg-[#021B36]/80 border border-[#00FFFF]/40 rounded-xl p-5 md:p-6 hover:border-[#00FFFF]/70 hover:shadow-lg hover:shadow-[#00FFFF]/20 transition-all duration-300 backdrop-blur-sm h-full">
                      <h3 className="text-lg md:text-xl font-bold text-[#00FFFF] mb-2 md:mb-3">
                        {step.title}
                      </h3>
                      <p className="text-[#AFCBE3] text-sm leading-relaxed">
                        {step.description}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer Note */}
          <div className="mt-10 md:mt-14 lg:mt-16 pb-4">
            <div className="bg-[#021B36]/60 border border-[#00FFFF]/30 rounded-xl p-5 md:p-6 hover:border-[#00FFFF]/70 transition-all duration-300">
              <h3 className="text-[#00FFFF] font-bold mb-3">Key Reminder</h3>
              <p className="text-[#AFCBE3] text-sm">
                {licensePlan === "License Pro"
                  ? "Complete each step in order. Stay consistent with your training schedule, master each module quiz, and use the Training Assistant whenever you need clarification. Your dedication will lead to successful completion and certification."
                  : "Complete each step in order, stay consistent with your training schedule, and use the Training Assistant whenever needed. Finishing all modules on time will unlock your certificate."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </FresherShellLayout>
    );
}
