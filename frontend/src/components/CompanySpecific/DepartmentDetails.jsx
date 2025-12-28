import React, { useEffect, useRef, useState } from "react"; 
import { useLocation, useNavigate } from "react-router-dom";
import CompanySidebar from "./CompanySidebar";
import jsPDF from "jspdf";

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

  const { state } = useLocation();
  const navigate = useNavigate();

  const { companyId, companyName, deptId, deptName } = state || {};

  const [users, setUsers] = useState([]);
  
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [showAddUserModal, setShowAddUserModal] = useState(false);

  const [newUser, setNewUser] = useState({
    name: "",
    phone: "",
    trainingOn: "",
    cvFile: null,
  });

  const [lastAddedUser, setLastAddedUser] = useState(null);

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
    try {
      const result = await addFresherUser({
        companyId,
        companyName,
        deptId,
        deptName,
        newUser,
      });

      setLastAddedUser(result);
      setNewUser({ name: "", phone: "", trainingOn: "", cvFile: null });
      setUsers(await fetchDepartmentUsers(companyId, deptId));
    } catch (err) {
      alert(err.message);
    }
  };
const handleAddDoc = async () => {
  if (!docFile) {
    alert("Please select a document");
    return;
  }

  try {
    await addDepartmentDoc({ companyId, deptName, file: docFile });
    
    setDocFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setDocs(await fetchDepartmentDocs(companyId, deptId));
  } catch (err) {
    alert(err.message);
  }
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
        <h1 className="text-3xl font-bold mb-6">{deptName} Department</h1>

        {/* DOCUMENTS */}
        <div className="mb-10">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">
              {deptName} Documents ({docs.length})
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
              className="px-4 py-2 bg-[#00FFFF] text-[#031C3A] rounded-lg font-semibold"
            >
              Upload Document
            </button>
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
                    await deleteDepartmentDoc({ companyId, deptName, docId: doc.id });
                    setDocs(await fetchDepartmentDocs(companyId, deptId));
                  }
                }}
                className="px-3 py-1 bg-red-600 text-white rounded flex items-center gap-1 hover:bg-red-700 transition"
              >
                🗑 Delete
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
            <h2 className="text-xl font-semibold">Users ({users.length})</h2>
            <button
              onClick={() => setShowAddUserModal(true)}
              className="px-4 py-2 bg-[#00FFFF] text-[#031C3A] rounded-lg font-semibold"
            >
              Add User
            </button>
          </div>

          {loadingUsers ? (
            <p>Loading...</p>
          ) : (
            <table className="w-full border border-[#00FFFF30]">
              <thead className="bg-[#021B36] text-[#00FFFF]">
                <tr>
                  <th className="p-2">Name</th>
                  <th className="p-2 text-center">Training Progress</th>
                  <th className="p-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-[#00FFFF20]">
                    <td className="p-2">{u.name}</td>
                    <td className="p-2 text-center">
                      <button className="px-3 py-1 bg-[#00FFFF] text-[#031C3A] rounded">
                        {u.progress || 0}%
                      </button>
                    </td>
                    <td className="p-2 text-center">
                      <button
                        onClick={() =>
                          console.log(`Navigating to user profile for ${u.userId}`) ||
                          navigate(`/user-profile/${companyId}/${deptId}/${u.userId}`)
                        }
                        className="px-3 py-1 bg-[#00FFFF] text-[#031C3A] rounded"
                      >
                        View Details
                      </button>
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
              onChange={(e) =>
                setNewUser({ ...newUser, name: e.target.value })
              }
            />
            <input
              placeholder="Phone"
              className="w-full p-2 mb-2 bg-[#031C3A]"
              value={newUser.phone}
              onChange={(e) =>
                setNewUser({ ...newUser, phone: e.target.value })
              }
            />
            <input
              placeholder="Training On"
              className="w-full p-2 mb-2 bg-[#031C3A]"
              value={newUser.trainingOn}
              onChange={(e) =>
                setNewUser({ ...newUser, trainingOn: e.target.value })
              }
            />

            {lastAddedUser && (
              <button
                onClick={downloadUserPDF}
                className="mb-3 w-full bg-green-500 p-2 rounded"
              >
                Download PDF
              </button>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddUserModal(false)}>Cancel</button>
              <button
                onClick={handleAddUser}
                className="bg-[#00FFFF] text-[#031C3A] px-4 py-2 rounded font-semibold"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
