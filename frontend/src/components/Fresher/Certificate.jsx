import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { db } from "../../firebase";
import TrainingLockedScreen from "./TrainingLockedScreen";
import CompanyPageLoader from "../CompanySpecific/CompanyPageLoader";

function Certificate() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state || {};

  const [userId, setUserId] = useState(state.userId || localStorage.getItem("userId"));
  const [companyId, setCompanyId] = useState(state.companyId || localStorage.getItem("companyId"));
  const [deptId, setDeptId] = useState(state.deptId || localStorage.getItem("deptId"));
  const [companyName, setCompanyName] = useState(state.companyName || localStorage.getItem("companyName"));
  const [trainingOn, setTrainingOn] = useState(state.trainingOn || localStorage.getItem("trainingOn"));

  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [overallScore, setOverallScore] = useState(0);
  const [certificateTitle, setCertificateTitle] = useState("");
  const [roadmapGenerated, setRoadmapGenerated] = useState(false);
  const [certificateUnlocked, setCertificateUnlocked] = useState(false);
  const [finalAssessment, setFinalAssessment] = useState(null);
  const certificateRef = useRef(null);
  const coordinatorSignature = "Rahemeen";
  const directorSignature = companyName || "TrainMate";
  const signatureFontFamily = '"Segoe Script", "Lucida Handwriting", "Bradley Hand", cursive';

  useEffect(() => {
    if (!userId || !companyId || !deptId) {
      setLoading(false);
      return;
    }

    const fetchCertificateData = async () => {
      try {
        const userRef = doc(db, "freshers", companyId, "departments", deptId, "users", userId);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          setLoading(false);
          return;
        }

        const user = userSnap.data();
        setUserData(user);
        setCertificateUnlocked(!!user.certificateUnlocked);
        setFinalAssessment(user.finalAssessment || null);
        setTrainingOn(user.trainingOn || state.trainingOn || localStorage.getItem("trainingOn"));

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

        const finalScore = Number(user.certificateFinalQuizScore) || 0;
        setOverallScore(finalScore);

        const fallbackTitle = finalScore >= 90
          ? "Distinguished Excellence Award"
          : finalScore >= 80
          ? "Advanced Master Practitioner"
          : finalScore >= 70
          ? "Certified Professional"
          : "Course Completer";

        // Prefer AI-generated title from final quiz pass; fallback only if missing.
        setCertificateTitle(user.certificateFinalQuizTitle || fallbackTitle);
      } catch (err) {
        console.error("Error fetching certificate data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchCertificateData();
  }, [userId, companyId, deptId, state.trainingOn]);

  if (userData?.trainingLocked && roadmapGenerated) {
    return <TrainingLockedScreen userData={userData} />;
  }

  const captureCertificateCanvas = async () => {
    const target = certificateRef.current;
    if (!target) return null;

    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));

    return html2canvas(target, {
      scale: Math.max(2, window.devicePixelRatio || 1),
      backgroundColor: null,
      useCORS: true,
      logging: false,
      scrollX: 0,
      scrollY: -window.scrollY,
    });
  };

  const downloadPDF = async () => {
    try {
      const canvas = await captureCertificateCanvas();
      if (!canvas) return;

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: canvas.width >= canvas.height ? "landscape" : "portrait",
        unit: "px",
        format: [canvas.width, canvas.height],
        hotfixes: ["px_scaling"],
      });

      pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height, undefined, "FAST");
      pdf.save(`${userData?.name || "Certificate"}_Certificate.pdf`);
    } catch (err) {
      console.error("Error downloading PDF:", err);
      alert("Failed to download PDF");
    }
  };

  const downloadPNG = async () => {
    try {
      const canvas = await captureCertificateCanvas();
      if (!canvas) return;

      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = `${userData?.name || "Certificate"}_Certificate.png`;
      link.click();
    } catch (err) {
      console.error("Error downloading PNG:", err);
      alert("Failed to download PNG");
    }
  };

  if (loading) return <CompanyPageLoader message="Loading your certificate..." layout="page" />;

  if (!roadmapGenerated) {
    return (
      <div className="flex min-h-screen fresher-page-shell text-white items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3">🔒</div>
          <h2 className="text-2xl font-bold text-[#00FFFF] mb-3">Certificate Locked</h2>
          <p className="text-[#AFCBE3]">Generate your roadmap to unlock the certificate</p>
        </div>
      </div>
    );
  }

  if (!certificateUnlocked) {
    return (
      <div className="flex min-h-screen fresher-page-shell text-white items-center justify-center">
        <div className="text-center max-w-xl px-6">
          <div className="text-4xl mb-3">🔒</div>
          <h2 className="text-2xl font-bold text-[#00FFFF] mb-3">Certificate Locked</h2>
          <p className="text-[#AFCBE3] mb-5">
            Pass the final certification quiz to unlock your certificate.
          </p>
          {finalAssessment?.status === "open" && (
            <button
              onClick={() => navigate(`/final-quiz-instructions/${companyId}/${deptId}/${userId}/${companyName}`)}
              className="px-5 py-2 bg-[#00FFFF] text-[#031C3A] rounded font-semibold"
            >
              Go To Final Quiz
            </button>
          )}
          {finalAssessment?.status && finalAssessment?.status !== "open" && (
            <p className="text-sm text-[#AFCBE3] mt-3">
              Current final quiz status: {finalAssessment.status}
            </p>
          )}
        </div>
      </div>
    );
  }

  const programName = trainingOn || companyName || "Training";

  return (
    <div className="min-h-screen fresher-page-shell text-white overflow-y-auto">
      <div className="min-h-screen p-8 bg-[#031C3A] flex flex-col items-center justify-center">
        <div className="w-full flex justify-start mb-4 -ml-2">
          <button
            onClick={() => navigate("/fresher-dashboard", { state: { userId, companyId, deptId, companyName } })}
            className="flex items-center gap-2 text-[#00FFFF] hover:text-[#00FFC2] transition"
          >
            <span className="text-lg">←</span>
            <span className="text-sm font-semibold">Back</span>
          </button>
        </div>
        <div
          ref={certificateRef}
          className="w-full max-w-[1120px] aspect-[297/210] bg-gradient-to-br from-[#021B36] via-[#031C3A] to-[#021B36] border border-[#00FFFF]/35 rounded-xl p-6 relative overflow-hidden shadow-2xl"
        >
          <div className="absolute inset-0">
            <div className="absolute -top-8 -left-8 w-48 h-24 bg-[#00FFFF]/20 rotate-6"></div>
            <div className="absolute -top-6 right-10 w-40 h-20 bg-[#00FFC2]/25 -rotate-3"></div>
            <div className="absolute -bottom-8 -right-10 w-56 h-28 bg-[#00FFFF]/20 rotate-3"></div>
            <div className="absolute -bottom-6 left-8 w-44 h-20 bg-[#00FFC2]/25 -rotate-6"></div>
          </div>

          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[96px] font-semibold tracking-[0.22em] uppercase text-[#00FFFF]/4 select-none">
              TrainMate
            </span>
          </div>

          <div className="relative z-10 h-full bg-white rounded-lg border border-[#00FFFF]/40 p-8 md:p-9 text-[#031C3A]">
            <div className="h-full border border-[#031C3A]/20 rounded-md px-10 py-8 md:px-12 md:py-9 grid grid-rows-[auto_1fr_auto] relative">
              <div className="absolute top-6 right-6 rounded-full bg-[#00FFFF] px-4 py-1 text-[10px] font-semibold text-[#031C3A] shadow-[0_0_18px_#00FFFF70]">
                Awarded: {certificateTitle} · {overallScore}%
              </div>
              <div className="text-center pt-8 md:pt-9">
                <p className="text-[#00AFC2] tracking-[0.28em] text-4xl md:text-[52px] leading-none font-semibold">CERTIFICATE</p>
                <p className="uppercase tracking-[0.33em] text-[#031C3A]/80 text-sm md:text-[15px] mt-2">of Training</p>
              </div>

              <div className="text-center flex flex-col items-center justify-center gap-2 py-4 md:py-4 -mt-5">
                <p className="text-sm md:text-[15px] text-[#031C3A]/80">This certificate is proudly awarded to</p>
                <h2 className="text-4xl md:text-[54px] leading-tight font-semibold text-[#031C3A] mt-1">
                  {userData?.name || "Trainee"}
                </h2>
                <div className="w-56 h-px bg-[#031C3A]/35 mx-auto my-2"></div>

                <p className="text-sm md:text-[15px] text-[#031C3A]/80 max-w-[670px] mx-auto leading-relaxed mt-1">
                  for successfully completed the program and demonstrated the skills and competencies required for
                </p>
                <p className="text-lg md:text-[24px] font-semibold text-[#00AFC2] mt-0.5">
                  {programName} Training Program
                </p>
                <p className="text-xs md:text-[13px] text-[#031C3A]/70 mt-2">Date: {new Date().toLocaleDateString()}</p>
              </div>

              <div className="pt-2 -mt-7">
                <div className="flex items-end justify-center gap-24 text-xs text-[#031C3A]/80">
                  <div className="text-center flex flex-col items-center">
                    <p
                      className="inline-block text-[20px] text-[#031C3A] -rotate-[4deg] leading-tight mb-2.5"
                      style={{ fontFamily: signatureFontFamily, fontWeight: 400, letterSpacing: "0.02em" }}
                    >
                      {coordinatorSignature}
                    </p>
                    <div className="w-44 h-px bg-[#031C3A]/40 mb-1.5 mt-0.5"></div>
                    <p className="uppercase tracking-[0.2em] text-[10px] leading-none">Program Coordinator</p>
                    <p className="font-serif italic text-[13px] text-[#031C3A] mt-1 leading-none">TrainMate</p>
                  </div>
                  <div className="text-center flex flex-col items-center">
                    <p
                      className="inline-block text-[20px] text-[#031C3A] -rotate-[4deg] leading-tight mb-2.5"
                      style={{ fontFamily: signatureFontFamily, fontWeight: 400, letterSpacing: "0.02em" }}
                    >
                      {directorSignature}
                    </p>
                    <div className="w-44 h-px bg-[#031C3A]/40 mb-1.5 mt-0.5"></div>
                    <p className="uppercase tracking-[0.2em] text-[10px] leading-none">Training Director</p>
                    <p className="font-serif italic text-[13px] text-[#031C3A] mt-1 leading-none">{companyName || "TrainMate"}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-4 mt-10">
          <button
            onClick={downloadPDF}
            className="px-8 py-3 bg-gradient-to-r from-[#00FFFF] to-[#00FFC2] text-[#031C3A] font-bold rounded-lg hover:shadow-lg hover:shadow-[#00FFFF]/40 hover:scale-105 transition-all duration-200"
          >
            Download PDF
          </button>
          <button
            onClick={downloadPNG}
            className="px-8 py-3 bg-gradient-to-r from-[#00FFC2] to-[#00FFFF] text-[#031C3A] font-bold rounded-lg hover:shadow-lg hover:shadow-[#00FFFF]/40 hover:scale-105 transition-all duration-200"
          >
            Download PNG
          </button>
        </div>

        <p className="text-center text-[#AFCBE3] text-sm mt-6 max-w-2xl">
          Keep this certificate as proof of your successful completion of the {programName} training program through
          TrainMate.
        </p>
      </div>
    </div>
  );
}

export default Certificate;
