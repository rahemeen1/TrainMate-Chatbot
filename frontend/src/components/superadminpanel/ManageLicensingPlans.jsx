import { useEffect, useState } from "react";
import {
  DEFAULT_LICENSING_PLANS,
  getLicensingPlans,
  saveLicensingPlans,
} from "../../services/licensingConfig";

const PLAN_KEYS = ["basic", "pro"];

const createEditableState = (plans) => {
  const source = plans || DEFAULT_LICENSING_PLANS;
  return {
    basic: {
      ...source.basic,
      includesText: (source.basic.includes || []).join("\n"),
    },
    pro: {
      ...source.pro,
      includesText: (source.pro.includes || []).join("\n"),
    },
  };
};

export default function ManageLicensingPlans() {
  const [plans, setPlans] = useState(createEditableState(DEFAULT_LICENSING_PLANS));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const fetchedPlans = await getLicensingPlans();
        setPlans(createEditableState(fetchedPlans));
      } catch (err) {
        console.error("Failed to load licensing plans:", err);
        setMessage("Could not load saved licensing plans. Showing defaults.");
      } finally {
        setLoading(false);
      }
    };

    fetchPlans();
  }, []);

  const handleFieldChange = (planKey, field, value) => {
    setPlans((prev) => ({
      ...prev,
      [planKey]: {
        ...prev[planKey],
        [field]: value,
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage("");

    try {
      const payload = PLAN_KEYS.reduce((acc, key) => {
        const currentPlan = plans[key];
        acc[key] = {
          name: currentPlan.name,
          label: currentPlan.label,
          subtitle: currentPlan.subtitle,
          capacity: currentPlan.capacity,
          departments: currentPlan.departments,
          usdPrice: Number(currentPlan.usdPrice) || 0,
          inrPrice: Number(currentPlan.inrPrice) || 0,
          includes: currentPlan.includesText
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
        };
        return acc;
      }, {});

      const savedPlans = await saveLicensingPlans(payload);
      setPlans(createEditableState(savedPlans));
      setMessage("Licensing plans updated successfully. Changes now reflect on public plan pages.");
    } catch (err) {
      console.error("Failed to save licensing plans:", err);
      setMessage("Failed to save licensing plans. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="bg-[#031C3A]/70 border border-[#00FFFF30] rounded-2xl p-5 sm:p-6">
        <p className="text-xs tracking-[0.18em] uppercase text-[#8EB6D3]">License Management</p>
        <h2 className="text-2xl sm:text-3xl font-bold text-[#E8F7FF] mt-1">Manage Licensing Plans</h2>
        <p className="text-sm text-[#9FC2DA] mt-2">
          Update both plans from one place. These values drive the License and Compare Plans pages.
        </p>
      </div>

      {message ? (
        <p
          className={`rounded-lg px-3 py-2 text-sm border ${
            message.toLowerCase().includes("failed") || message.toLowerCase().includes("could not")
              ? "bg-red-500/15 text-red-300 border-red-500/30"
              : "bg-green-500/15 text-green-300 border-green-500/30"
          }`}
        >
          {message}
        </p>
      ) : null}

      {loading ? (
        <div className="bg-[#031C3A]/70 border border-[#00FFFF30] rounded-2xl p-6 text-[#AFCBE3]">
          Loading licensing plans...
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {PLAN_KEYS.map((planKey) => {
            const plan = plans[planKey];
            return (
              <div key={planKey} className="bg-[#031C3A]/70 border border-[#00FFFF30] rounded-2xl p-5 space-y-4">
                <h3 className="text-xl font-semibold text-[#00FFFF]">{planKey === "basic" ? "Basic Plan" : "Pro Plan"}</h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <InputField label="Plan Name" value={plan.name} onChange={(v) => handleFieldChange(planKey, "name", v)} />
                  <InputField label="Tagline" value={plan.label} onChange={(v) => handleFieldChange(planKey, "label", v)} />
                  <InputField label="Subtitle" value={plan.subtitle} onChange={(v) => handleFieldChange(planKey, "subtitle", v)} />
                  <InputField label="Capacity" value={plan.capacity} onChange={(v) => handleFieldChange(planKey, "capacity", v)} />
                  <InputField label="Departments" value={plan.departments} onChange={(v) => handleFieldChange(planKey, "departments", v)} />
                  <InputField
                    label="USD Price"
                    type="number"
                    value={plan.usdPrice}
                    onChange={(v) => handleFieldChange(planKey, "usdPrice", v)}
                  />
                  <InputField
                    label="PKR Price"
                    type="number"
                    value={plan.inrPrice}
                    onChange={(v) => handleFieldChange(planKey, "inrPrice", v)}
                  />
                </div>

                <div>
                  <label className="text-sm text-[#AFCBE3] mb-1 block">Features (one per line)</label>
                  <textarea
                    rows={8}
                    value={plan.includesText}
                    onChange={(e) => handleFieldChange(planKey, "includesText", e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-[#00FFFF30] bg-[#021B36]/70 text-white focus:outline-none"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={loading || saving}
          className="px-5 py-2 rounded-lg bg-[#00FFFF] text-[#031C3A] font-semibold disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Licensing Plans"}
        </button>
      </div>
    </div>
  );
}

function InputField({ label, value, onChange, type = "text" }) {
  return (
    <div>
      <label className="text-sm text-[#AFCBE3] mb-1 block">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full p-2.5 rounded-lg border border-[#00FFFF30] bg-[#021B36]/70 text-white focus:outline-none"
      />
    </div>
  );
}
