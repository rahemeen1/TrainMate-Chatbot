import React, { useEffect, useRef, useState } from "react"; 
import { useLocation, useNavigate } from "react-router-dom";
import CompanyPageLoader from "./CompanyPageLoader";
import CompanyShellLayout from "./CompanyShellLayout";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { db } from "../../firebase";

import {
  fetchDepartmentUsers,
  fetchDepartmentDocs,
  addDepartmentDoc,
  addFresherUser,
  deleteDepartmentDoc,
} from "../services/departmentHandlers";

const normalizeId = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (["undefined", "null", "nan"].includes(normalized.toLowerCase())) return "";
  return normalized;
};

export default function DepartmentDetails() {

  // inside component
const fileInputRef = useRef(null);
const [docFile, setDocFile] = useState(null);
const [docs, setDocs] = useState([]);
const [uploadingDoc, setUploadingDoc] = useState(false);
const [addingUser, setAddingUser] = useState(false);
const [userAddedSuccess, setUserAddedSuccess] = useState(false);
const [lastAddedUser, setLastAddedUser] = useState(null);
const [deletingDocId, setDeletingDocId] = useState(null);
const [companyLicense, setCompanyLicense] = useState("License Pro");
const [totalCompanyFreshers, setTotalCompanyFreshers] = useState(0);
const [quotaStatus, setQuotaStatus] = useState(null);
const [quotaLoading, setQuotaLoading] = useState(false);
const isActionInProgress = uploadingDoc || addingUser;


  const { state } = useLocation();
  const navigate = useNavigate();

  const { companyName, deptId, deptName } = state || {};
  const companyId = normalizeId(state?.companyId || localStorage.getItem("companyId"));

  const [users, setUsers] = useState([]);
  
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [showAddUserModal, setShowAddUserModal] = useState(false);

  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    phone: "",
    trainingOn: "",
    trainingLevel: "basic",
    cvFile: null,
  });

  const BASIC_MAX_FRESHERS = 15;
  const isBasicLicense = companyLicense === "License Basic";
  
  // Check quota: use quotaStatus if available, otherwise fall back to totalCompanyFreshers
  const isLimitReached = quotaStatus ? !quotaStatus.canAdd : (isBasicLicense && totalCompanyFreshers >= BASIC_MAX_FRESHERS);
  const quotaMessage = quotaStatus?.message || "";

  // Safety
  useEffect(() => {
    if (!companyId || !deptId) navigate(-1);
  }, [companyId, deptId, navigate]);

  // Load Users
  useEffect(() => {
    const load = async () => {
      setLoadingUsers(true);
      setUsers(await fetchDepartmentUsers(companyId, deptId));
      setLoadingUsers(false);
    };
    load();
  }, [companyId, deptId]);

  // Fetch quota status
  useEffect(() => {
    const fetchQuota = async () => {
      if (!companyId) return;
      try {
        setQuotaLoading(true);
        const res = await fetch(`http://localhost:5000/api/company/${companyId}/user-quota`);
        if (res.ok) {
          const quotaData = await res.json();
          setQuotaStatus(quotaData);
        } else {
          console.error("Failed to fetch quota status:", res.status);
        }
      } catch (err) {
        console.error("Error fetching quota:", err);
      } finally {
        setQuotaLoading(false);
      }
    };

    fetchQuota();
    // Refetch quota every 30 seconds to stay up-to-date
    const quotaInterval = setInterval(fetchQuota, 30000);
    return () => clearInterval(quotaInterval);
  }, [companyId]);

  useEffect(() => {
    const loadCompanyLicenseAndFresherCount = async () => {
      if (!companyId) return;

      try {
        const answersRef = collection(db, "companies", companyId, "onboardingAnswers");
        const answersSnap = await getDocs(
          query(answersRef, orderBy("createdAt", "desc"), limit(1))
        );

        if (!answersSnap.empty) {
          const latestAnswers = answersSnap.docs[0].data()?.answers;
          const savedLicense = latestAnswers?.[2] ?? latestAnswers?.["2"];

          if (savedLicense === "License Basic" || savedLicense === "License Pro") {
            setCompanyLicense(savedLicense);
          }
        }

        const departmentSnap = await getDocs(collection(db, "companies", companyId, "departments"));
        let totalFreshers = 0;

        for (const departmentDoc of departmentSnap.docs) {
          const usersSnap = await getDocs(
            collection(db, "freshers", companyId, "departments", departmentDoc.id, "users")
          );
          totalFreshers += usersSnap.size;
        }

        setTotalCompanyFreshers(totalFreshers);
      } catch (err) {
        console.error("Error loading company license limits:", err);
      }
    };

    loadCompanyLicenseAndFresherCount();
  }, [companyId, users.length]);

  // Load Documents
  useEffect(() => {
    const load = async () => {
      setLoadingDocs(true);
      setDocs(await fetchDepartmentDocs(companyId, deptId));
      setLoadingDocs(false);
    };
    load();
  }, [companyId, deptId]);

  // Add User
  const handleAddUser = async () => {
    if (isActionInProgress) return;

    if (isLimitReached) {
      if (quotaStatus) {
        alert(quotaStatus.message || "Cannot add more users. Plan limit reached.");
      } else if (isBasicLicense) {
        alert("Basic license allows up to 15 freshers. Please upgrade to Pro license to add more freshers.");
      }
      return;
    }

    try {
      setAddingUser(true); // 🔵 start
      const result = await addFresherUser({
        companyId,
        companyName,
        deptId,
        deptName,
        newUser,
      });

      setUserAddedSuccess(true);
      setLastAddedUser(result);
      setNewUser({
        name: "",
        email: "",
        phone: "",
        trainingOn: "",
        trainingLevel: "basic",
        cvFile: null,
      });
      setUsers(await fetchDepartmentUsers(companyId, deptId));
      // Refetch quota after adding user
      const res = await fetch(`http://localhost:5000/api/company/${companyId}/user-quota`);
      if (res.ok) {
        const quotaData = await res.json();
        setQuotaStatus(quotaData);
      }
    } catch (err) {
      alert(err.message);
      
    }
    finally {
    setAddingUser(false); // 🟢 stop
  }
  };
const handleAddDoc = async () => {
  if (isActionInProgress) return;

  if (!docFile) {
    alert("Please select a document");
    return;
  }

  try {
    setUploadingDoc(true); // 🔵 start uploading

    await addDepartmentDoc({
      companyId,
      deptName,
      file: docFile,
    });

    setDocFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";

    setDocs(await fetchDepartmentDocs(companyId, deptId));
  } catch (err) {
    alert(err.message);
  } finally {
    setUploadingDoc(false); // 🟢 stop uploading
  }
};

const closeAddUserModal = () => {
  setShowAddUserModal(false);
  setUserAddedSuccess(false);  // 🔴 reset success
};

  if (!companyId || !deptId) {
    return <CompanyPageLoader layout="page" message="Loading department..." />;
  }

  return (
    <CompanyShellLayout companyId={companyId} companyName={companyName} headerLabel="Department Details">
      <div>
        <div className="company-container">
           <div className="company-card p-6 md:p-8 mb-6">
             <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h1 className="company-title">{(deptName || "").toUpperCase()} Department</h1>
                <p className="company-subtitle">
                  Manage documents and freshers for this department.
                </p>
              </div>
              <button
                onClick={() => navigate(-1)}
                disabled={isActionInProgress}
                className={`company-outline-btn ${
                  isActionInProgress
                    ? "bg-gray-600 text-gray-300 cursor-not-allowed"
                    : ""
                }`}
              >
                ← Back
              </button>
            </div>
          </div>

        {/* DOCUMENTS */}
        <div className="company-card mb-8 p-5 md:p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-[#00FFFF]">
              {(deptName || "").toUpperCase()} Documents ({docs.length})
            </h2>
          </div>

         <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
            <input
      type="file"
      ref={fileInputRef} // attach ref here
      className="text-sm flex-1 bg-[#031C3A]/80 border border-[#00FFFF30] rounded-lg p-2"
          disabled={isActionInProgress}
      onChange={(e) => setDocFile(e.target.files[0])}
    />

           <button
  onClick={handleAddDoc}
  disabled={isActionInProgress}
  className={`px-4 py-2 rounded-lg font-semibold transition
    ${
      isActionInProgress
        ? "bg-gray-500 text-white cursor-not-allowed"
        : "bg-[#00FFFF] text-[#031C3A] hover:opacity-90"
    }
  `}
>
  {uploadingDoc ? "Uploading..." : "Upload Document"}
</button>
{uploadingDoc && (
  <p className="text-sm text-[#00FFFF] mt-2 animate-pulse">
    Uploading document, please wait...
  </p>
)}


          </div>

          {loadingDocs ? (
            <div className="py-8 flex items-center justify-center gap-3 text-[#AFCBE3]">
              <svg className="animate-spin h-5 w-5 text-[#00FFFF]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <path fill="currentColor" d="M12 2C6.477 2 2 6.477 2 12h2a8 8 0 0116 0h2c0-5.523-4.477-10-10-10z" />
              </svg>
              Loading documents...
            </div>
          ) : (
              <div className="company-table-wrap mb-2 overflow-x-auto">

  <table className="w-full text-sm">
            <thead className="company-table-head-row">
      <tr>
        <th className="p-3 text-left font-semibold">Document</th>
        <th className="p-3 text-center font-semibold">Actions</th>
      </tr>
    </thead>
    <tbody>
      {docs.length === 0 && (
        <tr>
          <td colSpan="2" className="p-6 text-center text-[#AFCBE3]">
            No documents uploaded
          </td>
        </tr>
      )}

      {docs.map((doc) => (
        <tr key={doc.id} className="company-table-row">
          <td className="p-3">{doc.name}</td>
          <td className="p-3 text-center">
            <div className="flex justify-center items-center gap-2">
              {/* View button */}
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  if (isActionInProgress) e.preventDefault();
                }}
                className={`px-3 py-1 text-white rounded transition ${
                  isActionInProgress
                    ? "bg-green-700 cursor-not-allowed pointer-events-none opacity-60"
                    : "bg-green-600 hover:bg-green-700"
                }`}
              >
                View
              </a>

              {/* Delete button */}
              <button
  onClick={async () => {
    if (window.confirm(`Delete ${doc.name}?`)) {
      try {
        setDeletingDocId(doc.id);
        console.log("Deleting doc with storagePath:", doc.storagePath);
        await deleteDepartmentDoc({
          companyId,
          deptName,
            docId: doc.id,
          storagePath: doc.storagePath,
        });
        await new Promise(resolve => setTimeout(resolve, 800));
        setDocs(await fetchDepartmentDocs(companyId, deptId));
      } finally {
        setDeletingDocId(null);
      }
    }
  }}
   className={`px-3 py-1 rounded flex items-center gap-1 transition text-sm font-semibold ${
     deletingDocId === doc.id || isActionInProgress
       ? "bg-red-700 text-white cursor-not-allowed animate-pulse"
       : "bg-red-600 text-white hover:bg-red-700"
   }`}
   disabled={deletingDocId === doc.id || isActionInProgress}
>
  {deletingDocId === doc.id ? (
    <>
      <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
      Deleting...
    </>
  ) : (
    <>🗑 Delete</>
  )}
</button>
            </div>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
          )}
        </div>

        {/* USERS */}
        <div className="company-card mb-8 p-5 md:p-6">
          <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 mb-3">
            <div>
              <h2 className="text-xl font-semibold text-[#00FFFF]">Users ({users.length})</h2>
              {quotaStatus ? (
                <p className="text-sm text-[#AFCBE3] mt-1">
                  {quotaStatus.plan} plan: {quotaStatus.currentCount} active / {quotaStatus.totalEverAdded} total / {quotaStatus.maxAllowed} max
                </p>
              ) : isBasicLicense ? (
                <p className="text-sm text-[#AFCBE3] mt-1">
                  Basic license usage: {totalCompanyFreshers}/{BASIC_MAX_FRESHERS} freshers
                </p>
              ) : null}
            </div>
            <button
              onClick={() => setShowAddUserModal(true)}
              disabled={isLimitReached || quotaLoading || isActionInProgress}
              className={`px-4 py-2 rounded-lg font-semibold ${
                isLimitReached || quotaLoading || isActionInProgress
                  ? "bg-gray-500 text-white cursor-not-allowed"
                  : "bg-[#00FFFF] text-[#031C3A] hover:opacity-90"
              }`}
              title={
                isLimitReached
                  ? quotaStatus?.message || "Plan limit reached"
                  : "Add User"
              }
            >
              {isLimitReached ? "Limit Reached (🔒)" : quotaLoading ? "Loading..." : "Add User"}
            </button>
          </div>

          {lastAddedUser && (
            <div className="mb-3 rounded-lg border border-green-500/40 bg-green-600/10 p-3">
              <p className="text-xs uppercase tracking-wide text-green-300">Recently Added</p>
              <p className="mt-1 text-sm text-white">{lastAddedUser.name} ({lastAddedUser.userId})</p>
              <p className="text-xs text-[#AFCBE3] mt-1">{lastAddedUser.userEmail}</p>
            </div>
          )}

          {isLimitReached && quotaStatus && (
            <div className="mb-3 p-3 rounded-lg border border-[#00FFFF30] bg-[#021B36]/60 text-sm text-[#AFCBE3]">
              {quotaStatus.message}
            </div>
          )}

          {isLimitReached && !quotaStatus && isBasicLicense && (
            <div className="mb-3 p-3 rounded-lg border border-[#00FFFF30] bg-[#021B36]/60 text-sm text-[#AFCBE3]">
              You have reached the Basic license limit. Upgrade to Pro license to add more than 15 freshers.
            </div>
          )}

          {loadingUsers ? (
            <div className="py-8 flex items-center justify-center gap-3 text-[#AFCBE3]">
              <svg className="animate-spin h-5 w-5 text-[#00FFFF]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <path fill="currentColor" d="M12 2C6.477 2 2 6.477 2 12h2a8 8 0 0116 0h2c0-5.523-4.477-10-10-10z" />
              </svg>
              Loading users...
            </div>
          ) : (
            <div className="company-table-wrap overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="company-table-head-row">
  <tr>
    <th className="p-3 text-center font-semibold">Name</th>
    <th className="p-3 text-center font-semibold">Email</th>
    <th className="p-3 text-center font-semibold">Phone</th>
    <th className="p-3 text-center font-semibold">Training On</th>
    <th className="p-3 text-center font-semibold">Level</th>
  </tr>
</thead>

              <tbody>
      {users.map((u) => (
    <tr key={u.id} className="company-table-row">
      <td className="p-3">{(u.name || "").toUpperCase()}</td>

      <td className="p-3 text-center">
        {u.email || "—"}
      </td>

      <td className="p-3 text-center">
        {u.phone || "—"}
      </td>

      <td className="p-3 text-center capitalize">
        {u.trainingOn || "—"}
      </td>

      <td className="p-3 text-center capitalize">
        {u.trainingLevel || "—"}
      </td>
    </tr>
  ))}
</tbody>

            </table>
            </div>
          )}
        </div>
        </div>
      </div>

      {/* ADD USER MODAL */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center p-4 z-50">
          <div className="bg-[#021B36] border border-[#00FFFF30] p-6 rounded-2xl w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-bold text-[#00FFFF] mb-4">Add Fresher</h3>

            <input
              placeholder="Name"
              className="w-full p-2 mb-2 rounded-lg bg-[#031C3A] border border-[#00FFFF20]"
              value={newUser.name}
              required
              onChange={(e) =>
                setNewUser({ ...newUser, name: e.target.value })
              }
            />
            <input
              placeholder="Email *"
              type="email"
              className="w-full p-2 mb-2 rounded-lg bg-[#031C3A] border border-[#00FFFF20]"
              value={newUser.email}
              required
              onChange={(e) =>
                setNewUser({ ...newUser, email: e.target.value.toLowerCase() })
              }
            />
            <p className="text-xs text-[#AFCBE3] mb-2">
              Credentials will be emailed to this address as a PDF.
            </p>
            <input
              placeholder="Phone"
              className="w-full p-2 mb-2 rounded-lg bg-[#031C3A] border border-[#00FFFF20]"
              value={newUser.phone}
              required
              onChange={(e) =>
                setNewUser({ ...newUser, phone: e.target.value })
              }
            />
            <input
              placeholder="Training On"
              className="w-full p-2 mb-2 rounded-lg bg-[#031C3A] border border-[#00FFFF20]"
              value={newUser.trainingOn}
              required
              onChange={(e) =>
                setNewUser({ ...newUser, trainingOn: e.target.value })
              }
            />
            <select
              className="w-full p-2 mb-2 rounded-lg bg-[#031C3A] border border-[#00FFFF20]"
              value={newUser.trainingLevel}
              required
              onChange={(e) =>
                setNewUser({ ...newUser, trainingLevel: e.target.value })
              }
            >
              <option value="basic">Basic</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
{userAddedSuccess && (
  <div className="mb-4 p-3 bg-green-600/20 border border-green-500 rounded-lg">
    <p className="text-green-400 font-semibold">
      User added successfully. Credentials were emailed to the user.
    </p>
  </div>
)}

            
            <div className="mt-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
             <button 
               onClick={closeAddUserModal}
               disabled={isActionInProgress}
               className={`px-4 py-2 rounded font-semibold transition ${
                 isActionInProgress 
                   ? "bg-gray-600 text-gray-400 cursor-not-allowed" 
                   : "bg-gray-700 text-white hover:bg-gray-600"
               }`}
             >
               Cancel
             </button>

              <div className="flex flex-col items-end gap-2">
                <button
                  onClick={handleAddUser}
                  disabled={isActionInProgress || !newUser.name.trim() || !newUser.email.trim() || !newUser.phone.trim() || !newUser.trainingOn.trim()}
                  className={`px-4 py-2 rounded font-semibold transition
                    ${
                      isActionInProgress || !newUser.name.trim() || !newUser.email.trim() || !newUser.phone.trim() || !newUser.trainingOn.trim()
                        ? "bg-gray-500 text-white cursor-not-allowed"
                        : "bg-[#00FFFF] text-[#031C3A]"
                    }
                  `}
                >
                  {addingUser ? "Adding user..." : "Add"}
                </button>
                {addingUser && (
                  <p className="text-sm text-[#00FFFF] animate-pulse">
                    Creating user account, please wait...
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </CompanyShellLayout>
  );
}