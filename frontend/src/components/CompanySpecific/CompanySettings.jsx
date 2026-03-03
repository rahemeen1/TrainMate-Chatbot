// CompanySettings.jsx
import { useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { doc, getDoc, setDoc, deleteField } from "firebase/firestore";
import { db, auth } from "../../firebase";
import CompanySidebar from "../../components/CompanySpecific/CompanySidebar";
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

      {/* Main content loading area */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-10">
        {/* Rotating hourglass */}
        <svg
          className="animate-spin h-8 w-8 text-[#00FFFF]"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            fill="currentColor"
            d="M12 2C6.477 2 2 6.477 2 12h2a8 8 0 0116 0h2c0-5.523-4.477-10-10-10zm0 20c5.523 0 10-4.477 10-10h-2a8 8 0 01-16 0H2c0 5.523 4.477 10 10 10z"
          />
        </svg>

        <p className="text-base font-medium text-white">
          Loading Company Settings...
        </p>
      </div>
    </div>
  );
}



  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      <CompanySidebar companyId={companyId} companyName={companyName} />

      <div className="flex-1 p-10">
        <h1 className="text-2xl text-[#00FFFF] font-bold mb-6">
          Company Settings
        </h1>

        <div className="max-w-3xl space-y-6">
          {/* Company ID */}
          <div>
            <p className="text-[#AFCBE3] text-sm">Company ID</p>
            <p className="font-medium">{companyId}</p>
          </div>

          {/* Company Name */}
          <div className="flex items-center justify-between border-b border-[#00FFFF30] py-2">
            <div className="flex-1">
              <p className="text-[#AFCBE3] text-sm">Company Name</p>
              {editMode.name ? (
                <input
                  className="text-black w-full px-2 py-1 rounded"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              ) : (
                <p className="font-medium">{name}</p>
              )}
            </div>
            <button
              onClick={() =>
                editMode.name
                  ? saveField("name")
                  : setEditMode({ ...editMode, name: true })
              }
              className="ml-3 p-2 bg-[#00FFFF] text-[#031C3A] rounded-full"
            >
              {editMode.name ? (
                <CheckIcon className="w-5 h-5" />
              ) : (
                <PencilIcon className="w-5 h-5" />
              )}
            </button>
          </div>

          {/* Email */}
          <div className="flex items-center justify-between border-b border-[#00FFFF30] py-2">
            <div className="flex-1">
              <p className="text-[#AFCBE3] text-sm">Email</p>
              {editMode.email ? (
                <input
                  className="text-black w-full px-2 py-1 rounded"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              ) : (
                <p className="font-medium">{email}</p>
              )}
            </div>
            <button
              onClick={() =>
                editMode.email
                  ? saveField("email")
                  : setEditMode({ ...editMode, email: true })
              }
              className="ml-3 p-2 bg-[#00FFFF] text-[#031C3A] rounded-full"
            >
              {editMode.email ? (
                <CheckIcon className="w-5 h-5" />
              ) : (
                <PencilIcon className="w-5 h-5" />
              )}
            </button>
          </div>

          {/* Password */}
          <div className="flex items-center justify-between border-b border-[#00FFFF30] py-2">
            <div className="flex-1">
              <p className="text-[#AFCBE3] text-sm">Password</p>
              {editMode.password ? (
                <div className="flex flex-col gap-2 mt-1">
                  <input
                    type="password"
                    placeholder="Old Password"
                    className="text-black px-2 py-1 rounded"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                  />
                  <input
                    type="password"
                    placeholder="New Password"
                    className="text-black px-2 py-1 rounded"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
              ) : (
                <p className="font-medium">********</p>
              )}
            </div>
            <button
              onClick={() =>
                editMode.password
                  ? saveField("password")
                  : setEditMode({ ...editMode, password: true })
              }
              className="ml-3 p-2 bg-[#00FFFF] text-[#031C3A] rounded-full"
            >
              {editMode.password ? (
                <CheckIcon className="w-5 h-5" />
              ) : (
                <PencilIcon className="w-5 h-5" />
              )}
            </button>
          </div>

          {error && <p className="text-red-500">{error}</p>}
          {success && <p className="text-green-400">{success}</p>}
        </div>
      </div>
    </div>
  );
}
