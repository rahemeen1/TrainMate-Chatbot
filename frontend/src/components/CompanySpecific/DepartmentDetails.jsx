import React, { useEffect, useRef, useState } from "react"; 
import { useLocation, useNavigate } from "react-router-dom";
import CompanySidebar from "./CompanySidebar";
import jsPDF from "jspdf";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { db } from "../../firebase";

import {
  fetchDepartmentUsers,
  fetchDepartmentDocs,
  addDepartmentDoc,
  addFresherUser,
  deleteDepartmentDoc,
} from "../services/departmentHandlers";

export default function DepartmentDetails() {

  // inside component
const fileInputRef = useRef(null);
const [docFile, setDocFile] = useState(null);
const [docs, setDocs] = useState([]);
const [uploadingDoc, setUploadingDoc] = useState(false);
const [addingUser, setAddingUser] = useState(false);
const [userAddedSuccess, setUserAddedSuccess] = useState(false);
const [deletingDocId, setDeletingDocId] = useState(null);
const [companyLicense, setCompanyLicense] = useState("License Pro");
const [totalCompanyFreshers, setTotalCompanyFreshers] = useState(0);


  const { state } = useLocation();
  const navigate = useNavigate();

  const { companyId, companyName, deptId, deptName } = state || {};

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

  const [lastAddedUser, setLastAddedUser] = useState(null);
  const BASIC_MAX_FRESHERS = 15;
  const isBasicLicense = companyLicense === "License Basic";
  const isBasicLimitReached = isBasicLicense && totalCompanyFreshers >= BASIC_MAX_FRESHERS;

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
    if (isBasicLimitReached) {
      alert("Basic license allows up to 15 freshers. Please upgrade to Pro license to add more freshers.");
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

      setLastAddedUser(result);
      setUserAddedSuccess(true);
      setNewUser({
        name: "",
        email: "",
        phone: "",
        trainingOn: "",
        trainingLevel: "basic",
        cvFile: null,
      });
      setUsers(await fetchDepartmentUsers(companyId, deptId));
    } catch (err) {
      alert(err.message);
      
    }
    finally {
    setAddingUser(false); // 🟢 stop
  }
  };
const handleAddDoc = async () => {
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
  setLastAddedUser(null);       // 🔴 reset PDF data
  setUserAddedSuccess(false);  // 🔴 reset success
};



  // PDF
  const downloadUserPDF = () => {
    if (!lastAddedUser) return;
    const pdf = new jsPDF();
    pdf.text(`User ID: ${lastAddedUser.userId}`, 20, 30);
    pdf.text(`Email: ${lastAddedUser.userEmail}`, 20, 40);
    pdf.text(`Password: ${lastAddedUser.password}`, 20, 50);
    pdf.save(`${lastAddedUser.userId}.pdf`);
  };

  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      <CompanySidebar companyId={companyId} companyName={companyName} />

      <div className="flex-1 p-6">
        <button onClick={() => navigate(-1)} className="mb-4 text-[#00FFFF]">
          ← Back
        </button>
        <h1 className="text-3xl font-bold mb-6">{(deptName || "").toUpperCase()} Department</h1>

        {/* DOCUMENTS */}
        <div className="mb-10">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">
              {(deptName || "").toUpperCase()} Documents ({docs.length})
            </h2>
          </div>

         <div className="flex items-center justify-between gap-3 mb-4">
            <input
      type="file"
      ref={fileInputRef} // attach ref here
      className="text-sm flex-1"
      onChange={(e) => setDocFile(e.target.files[0])}
    />

           <button
  onClick={handleAddDoc}
  disabled={uploadingDoc}
  className={`px-4 py-2 rounded-lg font-semibold transition
    ${
      uploadingDoc
        ? "bg-gray-500 text-white cursor-not-allowed"
        : "bg-[#00FFFF] text-[#031C3A]"
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
            <p>Loading documents...</p>
          ) : (
          <div className="mb-10">

  <table className="w-full border border-[#00FFFF30]">
    <thead className="bg-[#021B36] text-[#00FFFF]">
      <tr>
        <th className="p-2 text-left">Document</th>
        <th className="p-2 text-center">Actions</th>
      </tr>
    </thead>
    <tbody>
      {docs.length === 0 && (
        <tr>
          <td colSpan="2" className="p-3 text-center text-gray-400">
            No documents uploaded
          </td>
        </tr>
      )}

      {docs.map((doc) => (
        <tr key={doc.id} className="border-t border-[#00FFFF20]">
          <td className="p-2">{doc.name}</td>
          <td className="p-2 text-center">
            <div className="flex justify-center items-center gap-2">
              {/* View button */}
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition"
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
     deletingDocId === doc.id
       ? "bg-red-700 text-white cursor-not-allowed animate-pulse"
       : "bg-red-600 text-white hover:bg-red-700"
   }`}
   disabled={deletingDocId === doc.id}
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
        <div className="mb-8">
          <div className="flex justify-between mb-3">
            <div>
              <h2 className="text-xl font-semibold">Users ({users.length})</h2>
              {isBasicLicense && (
                <p className="text-sm text-[#AFCBE3] mt-1">
                  Basic license usage: {totalCompanyFreshers}/{BASIC_MAX_FRESHERS} freshers
                </p>
              )}
            </div>
            <button
              onClick={() => setShowAddUserModal(true)}
              disabled={isBasicLimitReached}
              className={`px-4 py-2 rounded-lg font-semibold ${
                isBasicLimitReached
                  ? "bg-gray-500 text-white cursor-not-allowed"
                  : "bg-[#00FFFF] text-[#031C3A]"
              }`}
              title={
                isBasicLimitReached
                  ? "Upgrade to Pro license to add more freshers"
                  : "Add User"
              }
            >
              {isBasicLimitReached ? "Limit Reached (🔒)" : "Add User"}
            </button>
          </div>

          {isBasicLimitReached && (
            <div className="mb-3 p-3 rounded-lg border border-[#00FFFF30] bg-[#021B36]/60 text-sm text-[#AFCBE3]">
              You have reached the Basic license limit. Upgrade to Pro license to add more than 15 freshers.
            </div>
          )}

          {loadingUsers ? (
            <p>Loading...</p>
          ) : (
            <table className="w-full border border-[#00FFFF30]">
              <thead className="bg-[#021B36] text-[#00FFFF]">
  <tr>
    <th className="p-2 text-center">Name</th>
    <th className="p-2 text-center">Email</th>
    <th className="p-2 text-center">Phone</th>
    <th className="p-2 text-center">Training On</th>
    <th className="p-2 text-center">Level</th>
  </tr>
</thead>

              <tbody>
      {users.map((u) => (
    <tr key={u.id} className="border-t border-[#00FFFF20]">
      <td className="p-2">{(u.name || "").toUpperCase()}</td>

      <td className="p-2 text-center">
        {u.email || "—"}
      </td>

      <td className="p-2 text-center">
        {u.phone || "—"}
      </td>

      <td className="p-2 text-center capitalize">
        {u.trainingOn || "—"}
      </td>

      <td className="p-2 text-center capitalize">
        {u.trainingLevel || "—"}
      </td>
    </tr>
  ))}
</tbody>

            </table>
          )}
        </div>
      </div>

      {/* ADD USER MODAL */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-black/60 flex justify-center items-center">
          <div className="bg-[#021B36] p-6 rounded-xl w-full max-w-md">
            <h3 className="text-xl font-bold text-[#00FFFF] mb-4">Add Fresher</h3>

            <input
              placeholder="Name"
              className="w-full p-2 mb-2 bg-[#031C3A]"
              value={newUser.name}
              required
              onChange={(e) =>
                setNewUser({ ...newUser, name: e.target.value })
              }
            />
            <input
              placeholder="Email"
              type="email"
              className="w-full p-2 mb-2 bg-[#031C3A]"
              value={newUser.email}
              required
              onChange={(e) =>
                setNewUser({ ...newUser, email: e.target.value.toLowerCase() })
              }
            />
            <input
              placeholder="Phone"
              className="w-full p-2 mb-2 bg-[#031C3A]"
              value={newUser.phone}
              required
              onChange={(e) =>
                setNewUser({ ...newUser, phone: e.target.value })
              }
            />
            <input
              placeholder="Training On"
              className="w-full p-2 mb-2 bg-[#031C3A]"
              value={newUser.trainingOn}
              required
              onChange={(e) =>
                setNewUser({ ...newUser, trainingOn: e.target.value })
              }
            />
            <select
              className="w-full p-2 mb-2 bg-[#031C3A]"
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
      User added successfully
    </p>

    <button
      onClick={downloadUserPDF}
      className="mt-2 w-full bg-green-500 text-black p-2 rounded font-semibold hover:bg-green-600 transition"
    >
      Download Credentials PDF
    </button>
  </div>
)}

            
            <div className="flex justify-end gap-2">
             <button onClick={closeAddUserModal}>Cancel</button>

              <button
  onClick={handleAddUser}
  disabled={addingUser || !newUser.name.trim() || !newUser.email.trim() || !newUser.phone.trim() || !newUser.trainingOn.trim()}
  className={`px-4 py-2 rounded font-semibold transition
    ${
      addingUser || !newUser.name.trim() || !newUser.email.trim() || !newUser.phone.trim() || !newUser.trainingOn.trim()
        ? "bg-gray-500 text-white cursor-not-allowed"
        : "bg-[#00FFFF] text-[#031C3A]"
    }
  `}
>
  {addingUser ? "Adding user..." : "Add"}
</button>
{addingUser && (
  <p className="text-sm text-[#00FFFF] mb-2 animate-pulse">
    Creating user account, please wait...
  </p>
)}

            </div>
          </div>
        </div>
      )}
    </div>
  );
}