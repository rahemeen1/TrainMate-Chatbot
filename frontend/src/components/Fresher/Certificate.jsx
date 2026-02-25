import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { db } from "../../firebase";
import TrainingLockedScreen from "./TrainingLockedScreen";

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
  const certificateRef = useRef(null);

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

        let totalScore = 0;
        let modulesChecked = 0;

        for (const moduleDoc of roadmapSnap.docs) {
          try {
            const resultsRef = doc(
              db,
              "freshers",
              companyId,
              "departments",
              deptId,
              "users",
              userId,
              "roadmap",
              moduleDoc.id,
              "quiz",
              "current",
              "results",
              "latest"
            );
            const resultsSnap = await getDoc(resultsRef);

            if (resultsSnap.exists()) {
              const results = resultsSnap.data();
              const score = results.score || 0;
              totalScore += score;
              modulesChecked++;
            }
          } catch (err) {
            console.warn("Error fetching module score:", err);
          }
        }

        const avgScore = modulesChecked > 0 ? Math.round(totalScore / modulesChecked) : 0;
        setOverallScore(avgScore);

        let title = "Trainee";
        if (avgScore >= 90) {
          title = "Distinguished Excellence Award";
        } else if (avgScore >= 80) {
          title = "Advanced Master Practitioner";
        } else if (avgScore >= 70) {
          title = "Certified Professional";
        } else if (avgScore >= 60) {
          title = "Competent Learner";
        } else {
          title = "Course Completer";
        }
        setCertificateTitle(title);
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

  const downloadPDF = async () => {
    try {
      const canvas = await html2canvas(certificateRef.current, {
        scale: 2,
        backgroundColor: "#031C3A",
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${userData?.name || "Certificate"}_Certificate.pdf`);
    } catch (err) {
      console.error("Error downloading PDF:", err);
      alert("Failed to download PDF");
    }
  };

  const downloadPNG = async () => {
    try {
      const canvas = await html2canvas(certificateRef.current, {
        scale: 2,
        backgroundColor: "#031C3A",
      });

      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = `${userData?.name || "Certificate"}_Certificate.png`;
      link.click();
    } catch (err) {
      console.error("Error downloading PNG:", err);
      alert("Failed to download PNG");
    }
  };

  const Loader = () => (
    <div className="flex min-h-screen bg-[#031C3A] text-white items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-[#00FFFF]" />
        <p className="text-lg font-semibold">Loading your certificate...</p>
        <p className="text-sm text-[#AFCBE3]">Please wait, this may take a few seconds.</p>
      </div>
    </div>
  );

  if (loading) return <Loader />;

  if (!roadmapGenerated) {
    return (
      <div className="flex min-h-screen bg-[#031C3A] text-white items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3">🔒</div>
          <h2 className="text-2xl font-bold text-[#00FFFF] mb-3">Certificate Locked</h2>
          <p className="text-[#AFCBE3]">Generate your roadmap to unlock the certificate</p>
        </div>
      </div>
    );
  }

  const programName = trainingOn || companyName || "Training";

  return (
    <div className="min-h-screen bg-[#031C3A] text-white overflow-y-auto">
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
          className="w-full max-w-[1000px] aspect-[297/180] bg-gradient-to-br from-[#021B36] via-[#031C3A] to-[#021B36] border border-[#00FFFF]/35 rounded-xl p-6 relative overflow-hidden shadow-2xl"
        >
          <div className="absolute inset-0">
            <div className="absolute -top-8 -left-8 w-48 h-24 bg-[#00FFFF]/20 rotate-6"></div>
            <div className="absolute -top-6 right-10 w-40 h-20 bg-[#00FFC2]/25 -rotate-3"></div>
            <div className="absolute -bottom-8 -right-10 w-56 h-28 bg-[#00FFFF]/20 rotate-3"></div>
            <div className="absolute -bottom-6 left-8 w-44 h-20 bg-[#00FFC2]/25 -rotate-6"></div>
          </div>

          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[110px] font-semibold tracking-[0.25em] uppercase text-[#00FFFF]/4 select-none">
              TrainMate
            </span>
          </div>

          <div className="relative z-10 h-full bg-white rounded-lg border border-[#00FFFF]/40 p-10 text-[#031C3A]">
            <div className="h-full border border-[#031C3A]/20 rounded-md p-12 flex flex-col justify-between relative">
              <div className="absolute top-6 right-6 rounded-full bg-[#00FFFF] px-4 py-1 text-xs font-semibold text-[#031C3A] shadow-[0_0_18px_#00FFFF70]">
                Awarded: {certificateTitle} · {overallScore}%
              </div>
              <div className="text-center">
                   <p className="text-[#00AFC2] tracking-[0.3em] text-4xl font-semibold -mt-1">CERTIFICATE</p>
               <p className="uppercase tracking-[0.35em] text-[#031C3A]/80 text-1xl mt-0.5">of Training</p>
              </div>

              <div className="text-center flex-1 flex flex-col items-center justify-start mt-16 gap-2">
                <p className="text-sm text-[#031C3A]/80 -mt-6">This certificate is proudly awarded to</p>
                <h2 className="text-4xl md:text-5xl font-semibold text-[#031C3A] mt-1">
                  {userData?.name || "Trainee"}
                </h2>
                <div className="w-48 h-px bg-[#031C3A]/40 mx-auto my-1.5"></div>
                
                <p className="text-sm text-[#031C3A]/80 max-w-[720px] mx-auto leading-5 mt-0.5">
                  for successfully completed the program and demonstrated the skills and competencies required for 
                 
                </p>
                <p className="text-base font-semibold text-[#00AFC2]">
                  {programName} Training Program
                </p>
                <p className="text-xs text-[#031C3A]/70 mt-0.5">Date: {new Date().toLocaleDateString()}</p>
              </div>

              <div className="flex items-end justify-center gap-20 text-xs text-[#031C3A]/80">
                <div className="text-center">
                  <div className="w-40 h-px bg-[#031C3A]/40 mb-1"></div>
                  <p className="uppercase tracking-widest">Program Coordinator</p>
                  <p className="font-serif italic text-[#031C3A]">TrainMate Academy</p>
                </div>
                <div className="text-center">
                  <div className="w-40 h-px bg-[#031C3A]/40 mb-1"></div>
                  <p className="uppercase tracking-widest">Training Director</p>
                  <p className="font-serif italic text-[#031C3A]">{companyName || "TrainMate"}</p>
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
