// CompanySettings.jsx
import { useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { doc, getDoc, setDoc, deleteField } from "firebase/firestore";
import { db, auth } from "../../firebase";
import CompanySidebar from "../../components/CompanySpecific/CompanySidebar";
import CompanyPageLoader from "../../components/CompanySpecific/CompanyPageLoader";
import { PencilIcon, CheckIcon } from "@heroicons/react/24/solid";
import {
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword,
  verifyBeforeUpdateEmail,
} from "firebase/auth";

export default function CompanySettings() {
  const location = useLocation();
  const { companyId, companyName } = location.state || {};

  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [editMode, setEditMode] = useState({
    name: false,
    email: false,
    password: false,
  });
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const currentUser = auth.currentUser;

  useEffect(() => {
    const fetchCompany = async () => {
      try {
        const ref = doc(db, "companies", companyId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const c = snap.data();
          const authEmail = (auth.currentUser?.email || "").toLowerCase();
          const pendingEmail = (c.pendingEmail || "").toLowerCase();
          const savedEmail = (c.email || "").toLowerCase();

          if (pendingEmail && authEmail && pendingEmail === authEmail) {
            await setDoc(
              ref,
              {
                email: pendingEmail,
                pendingEmail: deleteField(),
                emailChangeRequestedAt: deleteField(),
              },
              { merge: true }
            );

            setSuccess("Email verified and updated successfully.");
            setEmail(pendingEmail);
          } else {
            setEmail(c.email || "");
          }

          setName(c.companyName || c.name || "");

          if (!pendingEmail && authEmail && savedEmail && authEmail !== savedEmail) {
            await setDoc(ref, { email: authEmail }, { merge: true });
            setEmail(authEmail);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    if (companyId) fetchCompany();
    else setLoading(false);
  }, [companyId]);

  const saveField = async (field) => {
    setError("");
    setSuccess("");
    try {
      const ref = doc(db, "companies", companyId);

      if (field === "password") {
        if (!oldPassword || !newPassword)
          return setError("Enter old & new password");
        if (!currentUser) throw new Error("No authenticated user");

        const cred = EmailAuthProvider.credential(
          currentUser.email,
          oldPassword
        );
        await reauthenticateWithCredential(currentUser, cred);
        await updatePassword(currentUser, newPassword);

        await setDoc(
          ref,
          { lastPasswordChange: new Date() },
          { merge: true }
        );

        setOldPassword("");
        setNewPassword("");
        setSuccess("Password updated successfully.");
      }

      if (field === "email") {
        if (!currentUser) throw new Error("No authenticated user");
        const normalizedEmail = (email || "").trim().toLowerCase();
        if (!normalizedEmail) throw new Error("Email is required");

        if ((currentUser.email || "").toLowerCase() === normalizedEmail) {
          setEditMode({ ...editMode, email: false });
          return;
        }

        await verifyBeforeUpdateEmail(currentUser, normalizedEmail);
        await setDoc(
          ref,
          {
            pendingEmail: normalizedEmail,
            emailChangeRequestedAt: new Date(),
          },
          { merge: true }
        );

        setSuccess(
          "Verification email sent to your new address. Please verify it to complete the email change."
        );
      }

      if (field === "name") {
        await setDoc(ref, { companyName: name }, { merge: true });
        setSuccess("Company name updated successfully.");
      }

      setEditMode({ ...editMode, [field]: false });
    } catch (err) {
      if (err?.code === "auth/requires-recent-login") {
        setError("For security, please logout and login again before changing email/password.");
        return;
      }
      setError(err.message || "Failed to update settings");
    }
  };

  if (loading) {
  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      {/* Sidebar stays as it is */}
      <CompanySidebar companyId={companyId} companyName={companyName} />

      <CompanyPageLoader message="Loading Company Settings..." />
    </div>
  );
}



  return (
    <div className="company-page-shell flex min-h-screen">
      <CompanySidebar companyId={companyId} companyName={companyName} />

      <div className="company-main-content flex-1 md:p-8 lg:p-10">
        <div className="company-container space-y-6">
          <div className="company-card p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h1 className="company-title">Company Settings</h1>
                <p className="company-subtitle">Manage account details and security settings.</p>
              </div>
              <div className="px-3 py-2 rounded-lg border border-[#00FFFF30] bg-[#031C3A]/70">
                <p className="text-xs text-[#AFCBE3] uppercase tracking-wide">Company ID</p>
                <p className="text-sm font-semibold text-white">{companyId || "N/A"}</p>
              </div>
            </div>
          </div>

          <div className="company-card p-6 md:p-8 space-y-5">
            <div className="rounded-xl border border-[#00FFFF25] bg-[#031C3A]/45 p-4 md:p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-[#AFCBE3] text-sm">Company Name</p>
                  {editMode.name ? (
                    <input
                      className="w-full mt-2 px-3 py-2 rounded-lg border border-[#00FFFF35] bg-[#021B36]/70 text-white placeholder-[#AFCBE3] focus:outline-none"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  ) : (
                    <p className="font-medium mt-1">{name || "N/A"}</p>
                  )}
                </div>
                <button
                  onClick={() =>
                    editMode.name
                      ? saveField("name")
                      : setEditMode({ ...editMode, name: true })
                  }
                  className="shrink-0 p-2 bg-[#00FFFF] text-[#031C3A] rounded-full hover:opacity-90"
                >
                  {editMode.name ? (
                    <CheckIcon className="w-5 h-5" />
                  ) : (
                    <PencilIcon className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-[#00FFFF25] bg-[#031C3A]/45 p-4 md:p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-[#AFCBE3] text-sm">Email</p>
                  {editMode.email ? (
                    <input
                      className="w-full mt-2 px-3 py-2 rounded-lg border border-[#00FFFF35] bg-[#021B36]/70 text-white placeholder-[#AFCBE3] focus:outline-none"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  ) : (
                    <p className="font-medium mt-1">{email || "N/A"}</p>
                  )}
                </div>
                <button
                  onClick={() =>
                    editMode.email
                      ? saveField("email")
                      : setEditMode({ ...editMode, email: true })
                  }
                  className="shrink-0 p-2 bg-[#00FFFF] text-[#031C3A] rounded-full hover:opacity-90"
                >
                  {editMode.email ? (
                    <CheckIcon className="w-5 h-5" />
                  ) : (
                    <PencilIcon className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-[#00FFFF25] bg-[#031C3A]/45 p-4 md:p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-[#AFCBE3] text-sm">Password</p>
                  {editMode.password ? (
                    <div className="flex flex-col gap-2 mt-2">
                      <input
                        type="password"
                        placeholder="Old Password"
                        className="px-3 py-2 rounded-lg border border-[#00FFFF35] bg-[#021B36]/70 text-white placeholder-[#AFCBE3] focus:outline-none"
                        value={oldPassword}
                        onChange={(e) => setOldPassword(e.target.value)}
                      />
                      <input
                        type="password"
                        placeholder="New Password"
                        className="px-3 py-2 rounded-lg border border-[#00FFFF35] bg-[#021B36]/70 text-white placeholder-[#AFCBE3] focus:outline-none"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                    </div>
                  ) : (
                    <p className="font-medium mt-1">********</p>
                  )}
                </div>
                <button
                  onClick={() =>
                    editMode.password
                      ? saveField("password")
                      : setEditMode({ ...editMode, password: true })
                  }
                  className="shrink-0 p-2 bg-[#00FFFF] text-[#031C3A] rounded-full hover:opacity-90"
                >
                  {editMode.password ? (
                    <CheckIcon className="w-5 h-5" />
                  ) : (
                    <PencilIcon className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-red-400/40 bg-red-500/10 text-red-300 text-sm px-3 py-2">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 text-emerald-300 text-sm px-3 py-2">
                {success}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
