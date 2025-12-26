import { useEffect, useState } from "react";
import CompanySidebar from "../../components/CompanySpecific/CompanySidebar";
import {
  collection,
  getDocs,
  setDoc,
  doc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "../../firebase";
import { useLocation, useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword } from "firebase/auth";
import jsPDF from "jspdf";
import bcrypt from "bcryptjs";

export default function DepartmentDetails() {
  const location = useLocation();
  const navigate = useNavigate();
  const { companyId, companyName, deptId, deptName } = location.state;

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
  const [lastAddedUser, setLastAddedUser] = useState(null); // store last added user

  // Fetch Users
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

  // Fetch Documents
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

  // Add Document
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

  // Generate random password
  const generatePassword = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$!";
    let password = "";
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  };

// Add User
const handleAddUser = async () => {
  const { name, phone, trainingOn } = newUser;
  if (!name || !phone) return alert("Enter name and phone");

  // Validate phone
  const phoneRegex = /^[0-9]{11}$/;
  if (!phoneRegex.test(phone)) return alert("Phone must be 11 digits");

  // Generate userId
  const firstName = name.trim().split(" ")[0];
  const deptShort = deptName.replace(/\s+/g, "").toUpperCase();
  const companyShort = companyName.split(" ").map(w => w[0]).join("").toUpperCase();
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const userId = `${firstName}-${deptShort}-${companyShort}-${randomNum}`;

  const password = generatePassword();

  // Generate company email domain
  const companyDomain = companyName.toLowerCase().replace(/\s+/g, "") + ".com";
  const userEmail = `${userId}@${companyDomain}`;

  try {
    // Check if email already exists in this department
    const usersRef = collection(db, "companies", companyId, "departments", deptId, "users");
    const snap = await getDocs(usersRef);
    const emailExists = snap.docs.some(doc => doc.data().email.toLowerCase() === userEmail.toLowerCase());
    if (emailExists) {
      alert("❌ Email already exists in this department.");
      return;
    }

    // Firebase Auth
    await createUserWithEmailAndPassword(auth, userEmail, password);


    // 2️⃣ Firestore - global freshers collection
    await setDoc(
      doc(db, "freshers", userId),
      {
        name,
        email: userEmail,
        phone,
        trainingOn,
        createdAt: serverTimestamp(),
        progress: 0,
        userId,
        companyName,
        deptName,
          deptId,
        companyId,
      }
    );

    // Refresh user list
    const updatedSnap = await getDocs(usersRef);
    setUsers(updatedSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

    // Keep password only for PDF
    setLastAddedUser({ userId, password, name, userEmail, companyName, deptName });
    setNewUser({ name: "", email: "", phone: "", trainingOn: "" });
  } catch (err) {
    console.error("❌ Error adding user:", err);
    alert("Failed to add user. Check console for details.");
  }
};


  // Download PDF
  const downloadUserPDF = () => {
    if (!lastAddedUser) return;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("User Credentials", 20, 20);
    doc.setLineWidth(0.5);
    doc.line(20, 25, 190, 25);
    doc.setFontSize(14);
    doc.setFont("helvetica", "normal");
    doc.text(`Full Name: ${lastAddedUser.name}`, 20, 40);
    doc.text(`User ID: ${lastAddedUser.userId}`, 20, 50);
    doc.text(`Email: ${lastAddedUser.userEmail}`, 20, 60);
    doc.text(`Password: ${lastAddedUser.password}`, 20, 70);
    doc.text(`Company: ${lastAddedUser.companyName}`, 20, 80);
    doc.text(`Department: ${lastAddedUser.deptName}`, 20, 90);
    doc.save(`${lastAddedUser.userId}_credentials.pdf`);
  };

  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      <CompanySidebar companyId={companyId} companyName={companyName} />
      <div className="flex-1 p-4 md:p-8">
        <div className="flex items-center mb-4">
          <button onClick={() => navigate(-1)} className="text-white text-xl font-bold mr-2 hover:text-[#00FFFF] transition" title="Go Back">←</button>
          <h1 className="text-2xl md:text-3xl font-bold">{deptName} Department</h1>
        </div>

        {/* Documents Section */}
        <div className="mb-6 md:mb-8">
          <h2 className="text-lg md:text-xl font-semibold mb-2">Documents</h2>
          <div className="flex flex-col sm:flex-row gap-2 mb-2">
            <input type="text" placeholder="Document Name" value={newDocName} onChange={e => setNewDocName(e.target.value)} className="p-2 rounded bg-[#031C3A] border border-[#00FFFF30] flex-1" />
            <button className="px-4 py-2 bg-[#00FFFF] text-[#031C3A] rounded-lg font-semibold" onClick={handleAddDoc}>Add Document</button>
          </div>
          {loadingDocs ? <p>Loading documents...</p> : docs.length === 0 ? <p>No documents found</p> : (
            <ul className="space-y-1">{docs.map(docItem => <li key={docItem.id} className="bg-[#021B36]/50 p-2 rounded">{docItem.name}</li>)}</ul>
          )}
        </div>

        {/* Users Section */}
        <div className="mb-6 md:mb-8">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-lg md:text-xl font-semibold">Users ({users.length})</h2>
            <button className="px-4 py-2 bg-[#00FFFF] text-[#031C3A] rounded-lg font-semibold" onClick={() => setShowAddUserModal(true)}>Add User</button>
          </div>
          {loadingUsers ? <p>Loading users...</p> : users.length === 0 ? <p>No users found</p> : (
            <div className="overflow-x-auto">
              <table className="w-full border border-[#00FFFF30] rounded-lg min-w-[600px]">
                <thead>
                  <tr className="bg-[#021B36] text-[#00FFFF]">
                    <th className="p-2 text-left">Name</th>
                    <th className="p-2 text-left">Email</th>
                    <th className="p-2 text-left">Phone</th>
                    <th className="p-2 text-left">Training</th>
                    <th className="p-2 text-center">Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="border-t border-[#00FFFF20]">
                      <td className="p-2">{u.name}</td>
                      <td className="p-2">{u.email}</td>
                      <td className="p-2">{u.phone}</td>
                      <td className="p-2">{u.trainingOn}</td>
                      <td className="p-2 text-center">View</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add User Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-[#021B36] p-6 rounded-xl w-full max-w-md space-y-4">
            <h3 className="text-xl font-bold text-[#00FFFF]">Add User</h3>
            <input type="text" placeholder="Name" value={newUser.name} onChange={e => setNewUser(prev => ({ ...prev, name: e.target.value }))} className="w-full p-2 rounded bg-[#031C3A] border border-[#00FFFF30]" />
            <input type="text" placeholder="Phone" value={newUser.phone} onChange={e => setNewUser(prev => ({ ...prev, phone: e.target.value }))} className="w-full p-2 rounded bg-[#031C3A] border border-[#00FFFF30]" />
            <input type="text" placeholder="Training On" value={newUser.trainingOn} onChange={e => setNewUser(prev => ({ ...prev, trainingOn: e.target.value }))} className="w-full p-2 rounded bg-[#031C3A] border border-[#00FFFF30]" />

            {lastAddedUser && (
              <button className="px-4 py-2 bg-green-500 text-white rounded" onClick={downloadUserPDF}>
                Download PDF
              </button>
            )}

            <div className="flex justify-end gap-2 mt-2">
              <button className="px-4 py-2 bg-red-500 rounded text-sm" onClick={() => setShowAddUserModal(false)}>Cancel</button>
              <button className="px-4 py-2 bg-[#00FFFF] text-[#031C3A] rounded font-semibold text-sm" onClick={handleAddUser}>Add User</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
