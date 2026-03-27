import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { FEATURE_FLAGS, isFeatureAvailable } from "../../services/featureAccess";
import { getCompanyLicensePlan } from "../../services/companyLicense";
import CompanyPageLoader from "../CompanySpecific/CompanyPageLoader";

/**
 * QuizAccessGuard - Checks if company has Pro license before allowing quiz access
 * Wraps quiz components and shows upgrade message for Basic license users
 */
export default function QuizAccessGuard({ companyId, children, onUpgradeNeeded }) {
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [licensePlan, setLicensePlan] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const checkQuizAccess = async () => {
      if (!companyId) {
        setError("Company ID is missing");
        setLoading(false);
        return;
      }

      try {
        const plan = await getCompanyLicensePlan(companyId);
        setLicensePlan(plan);

        const canAccessQuiz = isFeatureAvailable(plan, FEATURE_FLAGS.MODULE_QUIZZES);
        if (!canAccessQuiz) {
          setError(
            "Quizzes are not available on your current plan. Please upgrade to Pro to unlock assessment features."
          );
          if (onUpgradeNeeded) {
            onUpgradeNeeded();
          }
        }
        setHasAccess(canAccessQuiz);
      } catch (err) {
        console.error("Error checking quiz access:", err);
        setError("Failed to verify quiz access. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    checkQuizAccess();
  }, [companyId, onUpgradeNeeded]);

  if (loading) {
    return <CompanyPageLoader message="Verifying quiz access..." layout="page" />;
  }

  if (!hasAccess) {
    return (
      <div className="flex min-h-screen bg-[#031C3A] text-white items-center justify-center p-6">
        <div className="max-w-md rounded-2xl bg-[#021B36] border-2 border-[#00FFFF]/30 p-8 text-center space-y-6">
          <div className="text-6xl">🔒</div>
          <div>
            <h1 className="text-2xl font-bold text-[#00FFFF] mb-2">Feature Locked</h1>
            <p className="text-[#AFCBE3]">{error}</p>
          </div>
          <div className="rounded-lg bg-[#031C3A]/70 border border-[#00FFFF]/20 p-4">
            <p className="text-sm text-[#9FC2DA]">
              Current Plan: <span className="font-semibold text-[#00FFFF]">{licensePlan?.replace("License ", "")}</span>
            </p>
          </div>
          <button
            onClick={() => window.history.back()}
            className="w-full px-4 py-2 rounded-lg bg-[#00FFFF]/20 text-[#00FFFF] border border-[#00FFFF]/40 hover:bg-[#00FFFF]/30 transition"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return children;
}
