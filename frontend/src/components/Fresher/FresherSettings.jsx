// FresherSettings.jsx
import { useLocation, useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db, auth } from "../../firebase";
import { jsPDF } from "jspdf";
import { FresherSideMenu } from "./FresherSideMenu";
import { PencilIcon, CheckIcon } from "@heroicons/react/24/solid";
import { reauthenticateWithCredential, EmailAuthProvider, updatePassword, updateEmail } from "firebase/auth";

export default function FresherSettings() {
  const location = useLocation();
  const navigate = useNavigate();
  const { userId, companyId, deptId, companyName } = location.state || {};

  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [editMode, setEditMode] = useState({ name: false, phone: false, password: false });
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [showDownload, setShowDownload] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState("");

  const currentUser = auth.currentUser;
const isValidPhone = (value) => {
  return /^[0-9]{11}$/.test(value);
};

  useEffect(() => {
    console.log("Received props: ", { userId, companyId, deptId });

    const fetchUser = async () => {
      try {
        const userRef = doc(
  db,
  "freshers",
  companyId,
  "departments",
  deptId,
  "users",
  userId
);

        const snap = await getDoc(userRef);
        if (snap.exists()) {
          const u = snap.data();
          setName(u.name || "");
          setPhone(u.phone || "");
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    if (userId && companyId && deptId) fetchUser();
    else setLoading(false);
  }, [userId, companyId, deptId]);

  const checkPasswordStrength = (pwd) => {
    if (pwd.length < 6) return "Weak";
    if (pwd.match(/[a-z]/) && pwd.match(/[A-Z]/) && pwd.match(/[0-9]/) && pwd.length >= 8) return "Strong";
    return "Medium";
  };

  const saveField = async (field) => {
    setError("");
    try {
      const userRef = doc(
  db,
  "freshers",     
  companyId,
  "departments",
  deptId,
  "users",
  userId
);


      if (field === "password") {
        if (!oldPassword || !newPassword) {
          setError("Enter both old and new passwords");
          return;
        }
        if (!currentUser) throw new Error("No authenticated user");

        const credential = EmailAuthProvider.credential(currentUser.email, oldPassword);
        await reauthenticateWithCredential(currentUser, credential);
        await updatePassword(currentUser, newPassword);
        await setDoc(userRef, { lastPasswordChange: new Date() }, { merge: true });

        setOldPassword("");
        setShowDownload(true);
      } else if (field === "phone") {
  if (!phone.trim()) {
    setError("Phone number cannot be empty");
    return;
  }

  if (!isValidPhone(phone)) {
    setError("Phone number must be exactly 11 digits (e.g. 03XXXXXXXXX)");
    return;
  }

  await setDoc(userRef, { phone }, { merge: true });

      } else if (field === "name") {
        await setDoc(userRef, { name }, { merge: true });
      }

      setEditMode({ ...editMode, [field]: false });
    } catch (err) {
      console.error(err);
      setError(err.message);
    }
  };

  const downloadPDF = () => {
    const docPDF = new jsPDF();
    docPDF.text(`User Credentials`, 10, 10);
    docPDF.text(`UserID: ${userId}`, 10, 20);
    docPDF.text(`Name: ${name}`, 10, 30);
    docPDF.text(`Phone: ${phone}`, 10, 40);
    docPDF.text(`Password: ${newPassword || "(Updated)"}`, 10, 50); 
    docPDF.save(`${userId}_credentials.pdf`);
  };

  if (loading) {
  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      {/* Sidebar */}
      <div className="w-64 bg-[#021B36]/90 p-4">
        <FresherSideMenu
          userId={userId}
          companyId={companyId}
          deptId={deptId}
          companyName={companyName}
          roadmapGenerated={true}
        />
      </div>

      {/* Center Loader */}
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          
          {/* ⏳ Hourglass Loader */}
          <div className="hourglass-loader" />

          <p className="text-[#00FFFF] tracking-wide text-sm">
            Preparing your workspace...
          </p>
        </div>
      </div>

      {/* Loader Styles */}
      <style>
        {`
          .hourglass-loader {
            width: 40px;
            height: 40px;
            border: 3px solid #00FFFF30;
            border-top: 3px solid #00FFFF;
            border-bottom: 3px solid #00FFFF;
            border-radius: 50%;
            animation: hourglassSpin 1.2s linear infinite;
            box-shadow: 0 0 12px #00FFFF40;
          }

          @keyframes hourglassSpin {
            0% { transform: rotate(0deg); }
            50% { transform: rotate(180deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
}



  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      {/* Side Menu */}
      <div className="w-64 bg-[#021B36]/90 p-4">
        <FresherSideMenu userId={userId} companyId={companyId} deptId={deptId} companyName={companyName} roadmapGenerated={true} />
      </div>

      {/* Main Content */}
      <div className="flex-1 p-10">
        <h1 className="text-2xl text-[#00FFFF] font-bold mb-6">Fresher Settings</h1>

        <div className="max-w-3xl space-y-6 text-left">
          {/* User ID */}
          <div className="flex flex-col py-2">
            <p className="text-[#AFCBE3] text-sm">User ID</p>
            <p className="text-white font-medium">{userId}</p>
          </div>

         {/* Name */}
<div className="flex items-center justify-between border-b border-[#00FFFF30] py-2">
  <div className="flex-1">
    <p className="text-[#AFCBE3] text-sm">Name</p>
    {editMode.name ? (
      <input
        className="text-black w-full px-2 py-1 rounded"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
    ) : (
      <p className="text-white font-medium">{name}</p>
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
    {editMode.name ? <CheckIcon className="w-5 h-5" /> : <PencilIcon className="w-5 h-5" />}
  </button>
</div>

{/* Phone Number */}
<div className="flex items-center justify-between border-b border-[#00FFFF30] py-2">
  <div className="flex-1">
    <p className="text-[#AFCBE3] text-sm">Phone Number</p>
    {editMode.phone ? (
     <input
  className="text-black w-full px-2 py-1 rounded"
  value={phone}
  maxLength={11}
  inputMode="numeric"
  pattern="[0-9]*"
  onChange={(e) => {
    const onlyDigits = e.target.value.replace(/\D/g, "");
    setPhone(onlyDigits);
  }}
  placeholder="03XXXXXXXXX"
/>

    ) : (
      <p className="text-white font-medium">{phone}</p>
    )}
  </div>

  <button
    onClick={() =>
      editMode.phone
        ? saveField("phone")
        : setEditMode({ ...editMode, phone: true })
    }
    className="ml-3 p-2 bg-[#00FFFF] text-[#031C3A] rounded-full"
  >
    {editMode.phone ? <CheckIcon className="w-5 h-5" /> : <PencilIcon className="w-5 h-5" />}
  </button>
</div>



          {/* Password */}
          <div className="flex flex-col border-b border-[#00FFFF30] py-2">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-[#AFCBE3] text-sm">Password</p>
                {editMode.password ? (
                  <div className="flex flex-col gap-2 mt-1">
                    <input
                      type="password"
                      placeholder="Old Password"
                      className="text-black w-full px-2 py-1 rounded"
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                    />
                    <input
                      type="password"
                      placeholder="New Password"
                      className="text-black w-full px-2 py-1 rounded"
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value);
                        setPasswordStrength(checkPasswordStrength(e.target.value));
                      }}
                    />
                    {newPassword && (
                      <p className={`text-sm ${
                        passwordStrength === "Weak" ? "text-red-500" :
                        passwordStrength === "Medium" ? "text-yellow-400" :
                        "text-green-400"
                      }`}>
                        Strength: {passwordStrength}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-white font-medium">********</p>
                )}
              </div>
              <button
                onClick={() => (editMode.password ? saveField("password") : setEditMode({ ...editMode, password: true }))}
                className="ml-3 p-2 bg-[#00FFFF] text-[#031C3A] rounded-full"
              >
                {editMode.password ? <CheckIcon className="w-5 h-5" /> : <PencilIcon className="w-5 h-5" />}
              </button>
            </div>

            {showDownload && (
              <button
                onClick={downloadPDF}
                className="mt-3 px-3 py-1 bg-[#00FFFF] text-[#031C3A] rounded font-semibold w-48"
              >
                Download Credentials PDF
              </button>
            )}
          </div>

          {error && <p className="text-red-500">{error}</p>}
        </div>
      </div>
    </div>
  );
}
