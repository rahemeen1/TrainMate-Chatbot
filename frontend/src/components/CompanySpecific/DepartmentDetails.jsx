import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  setDoc,
  doc,
  serverTimestamp,
  addDoc,
} from "firebase/firestore";
import { db, auth } from "../../firebase";
import { useLocation, useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword } from "firebase/auth";

export default function DepartmentDetails() {
  const location = useLocation();
  const navigate = useNavigate();
  const { companyId, companyName, deptId, deptName } = location.state;

  // --- State ---
  const [users, setUsers] = useState([]);
  const [docs, setDocs] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    phone: "",
    trainingOn: "",
  });
  const [newDocName, setNewDocName] = useState("");
  const [generatedPassword, setGeneratedPassword] = useState("");

  // --- Fetch Users ---
  useEffect(() => {
    if (!companyId || !deptId) return;
    const fetchUsers = async () => {
      setLoadingUsers(true);
      const usersRef = collection(db, "companies", companyId, "departments", deptId, "users");
      const snap = await getDocs(usersRef);
      setUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoadingUsers(false);
    };
    fetchUsers();
  }, [companyId, deptId]);

  // --- Fetch Documents ---
  useEffect(() => {
    if (!companyId || !deptId) return;
    const fetchDocs = async () => {
      setLoadingDocs(true);
      const docsRef = collection(db, "companies", companyId, "departments", deptId, "documents");
      const snap = await getDocs(docsRef);
      setDocs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoadingDocs(false);
    };
    fetchDocs();
  }, [companyId, deptId]);

  // --- Add Document ---
  const handleAddDoc = async () => {
    if (!newDocName) return alert("Enter document name");

    await addDoc(collection(db, "companies", companyId, "departments", deptId, "documents"), {
      name: newDocName,
      uploadedAt: serverTimestamp(),
    });

    setNewDocName("");
    const docsRef = collection(db, "companies", companyId, "departments", deptId, "documents");
    const snap = await getDocs(docsRef);
    setDocs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  };

  // --- Generate random password ---
  const generatePassword = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$!";
    let password = "";
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setGeneratedPassword(password);
    return password;
  };

  // --- Add User ---
  const handleAddUser = async () => {
    if (!newUser.name || !newUser.email) return alert("Enter name and email");

    const randomNum = Math.floor(Math.random() * 10000);
    const sanitizedName = newUser.name.toLowerCase().replace(/\s/g, "");
    const sanitizedDept = deptName.toLowerCase().replace(/\s/g, "");
    const sanitizedCompany = companyName.toLowerCase().replace(/\s/g, "");
    const userId = `${sanitizedName}${sanitizedDept}${sanitizedCompany}${randomNum}`;

    const password = generatePassword();

    // 1️⃣ Firebase Auth
    await createUserWithEmailAndPassword(auth, `${userId}@example.com`, password);

    // 2️⃣ Firestore
    await setDoc(doc(db, "companies", companyId, "departments", deptId, "users", userId), {
      name: newUser.name,
      email: newUser.email,
      phone: newUser.phone,
      trainingOn: newUser.trainingOn,
      createdAt: serverTimestamp(),
      progress: 0,
      userId,
      password,
    });

    // Fetch updated users
    const usersRef = collection(db, "companies", companyId, "departments", deptId, "users");
    const snap = await getDocs(usersRef);
    setUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

    setShowAddUserModal(false);
    setNewUser({ name: "", email: "", phone: "", trainingOn: "" });
  };

  return (
    <div className="p-4 md:p-8 min-h-screen bg-[#031C3A] text-white">
      {/* Back button */}
      <div className="flex items-center mb-4">
        <button
          onClick={() => navigate(-1)}
          className="text-white text-xl font-bold mr-2 hover:text-[#00FFFF] transition"
          title="Go Back"
        >
          ←
        </button>
        <h1 className="text-2xl md:text-3xl font-bold text-white">{deptName} Department</h1>
      </div>

      {/* Documents Section */}
      <div className="mb-6 md:mb-8">
        <h2 className="text-lg md:text-xl font-semibold mb-2">Documents</h2>
        <div className="flex flex-col sm:flex-row gap-2 mb-2">
          <input
            type="text"
            placeholder="Document Name"
            value={newDocName}
            onChange={e => setNewDocName(e.target.value)}
            className="p-2 rounded bg-[#031C3A] border border-[#00FFFF30] flex-1"
          />
          <button
            className="px-4 py-2 bg-[#00FFFF] text-[#031C3A] rounded-lg font-semibold flex-shrink-0"
            onClick={handleAddDoc}
          >
            Add Document
          </button>
        </div>

        {loadingDocs ? (
          <p>Loading documents...</p>
        ) : docs.length === 0 ? (
          <p>No documents found</p>
        ) : (
          <ul className="space-y-1">
            {docs.map(docItem => (
              <li
                key={docItem.id}
                className="flex justify-between items-center bg-[#021B36]/50 p-2 rounded text-sm sm:text-base"
              >
                <span>{docItem.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Users Section */}
      <div className="mb-6 md:mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2 gap-2">
          <h2 className="text-lg md:text-xl font-semibold">Users ({users.length})</h2>
          <button
            className="px-4 py-2 bg-[#00FFFF] text-[#031C3A] rounded-lg font-semibold flex-shrink-0"
            onClick={() => setShowAddUserModal(true)}
          >
            Add User
          </button>
        </div>

        {loadingUsers ? (
          <p>Loading users...</p>
        ) : users.length === 0 ? (
          <p>No users found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border border-[#00FFFF30] rounded-lg min-w-[600px]">
              <thead>
                <tr className="bg-[#021B36] text-[#00FFFF] text-sm sm:text-base">
                  <th className="p-2 text-left">Name</th>
                  <th className="p-2 text-left">Email</th>
                  <th className="p-2 text-left">Phone</th>
                  <th className="p-2 text-left">Training On</th>
                  <th className="p-2 text-center">Progress</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr
                    key={u.id}
                    className="border-t border-[#00FFFF20] hover:bg-[#00FFFF10] text-sm sm:text-base"
                  >
                    <td className="p-2">{u.name}</td>
                    <td className="p-2">{u.email}</td>
                    <td className="p-2">{u.phone}</td>
                    <td className="p-2">{u.trainingOn}</td>
                    <td className="p-2 text-center">
                      <button className="px-2 py-1 bg-[#00FFFF]/30 rounded text-xs sm:text-sm">
                        View Progress
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-[#021B36] p-6 rounded-xl w-full max-w-md space-y-4">
            <h3 className="text-xl font-bold text-[#00FFFF]">Add User</h3>
            <input
              type="text"
              placeholder="Name"
              value={newUser.name}
              onChange={e => setNewUser(prev => ({ ...prev, name: e.target.value }))}
              className="w-full p-2 rounded bg-[#031C3A] border border-[#00FFFF30]"
            />
            <input
              type="email"
              placeholder="Email"
              value={newUser.email}
              onChange={e => setNewUser(prev => ({ ...prev, email: e.target.value }))}
              className="w-full p-2 rounded bg-[#031C3A] border border-[#00FFFF30]"
            />
            <input
              type="text"
              placeholder="Phone"
              value={newUser.phone}
              onChange={e => setNewUser(prev => ({ ...prev, phone: e.target.value }))}
              className="w-full p-2 rounded bg-[#031C3A] border border-[#00FFFF30]"
            />
            <input
              type="text"
              placeholder="Training On"
              value={newUser.trainingOn}
              onChange={e => setNewUser(prev => ({ ...prev, trainingOn: e.target.value }))}
              className="w-full p-2 rounded bg-[#031C3A] border border-[#00FFFF30]"
            />

            {generatedPassword && (
              <div className="flex items-center justify-between bg-[#031C3A]/50 p-2 rounded text-sm">
                <span>Password: {generatedPassword}</span>
                <button
                  className="px-2 py-1 bg-[#00FFFF] text-[#031C3A] rounded"
                  onClick={() => navigator.clipboard.writeText(generatedPassword)}
                >
                  Copy
                </button>
              </div>
            )}

            <div className="flex justify-end gap-2 mt-2">
              <button
                className="px-4 py-2 bg-red-500 rounded text-sm"
                onClick={() => {
                  setShowAddUserModal(false);
                  setGeneratedPassword("");
                }}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-[#00FFFF] text-[#031C3A] rounded font-semibold text-sm"
                onClick={handleAddUser}
              >
                Add User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
