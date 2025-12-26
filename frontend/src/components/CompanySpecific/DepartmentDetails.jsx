import { useEffect, useState } from "react";
import CompanySidebar from "../../components/CompanySpecific/CompanySidebar";
import { collection, getDocs, setDoc, doc, addDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../../firebase";
import { useLocation, useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import jsPDF from "jspdf";

export default function DepartmentDetails() {
  const location = useLocation();
  const navigate = useNavigate();
  const { companyId, companyName, deptId, deptName } = location.state || {};

  const [users, setUsers] = useState([]);
  const [docs, setDocs] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [showAddUserModal, setShowAddUserModal] = useState(false);

  const [newUser, setNewUser] = useState({ name: "", phone: "", trainingOn: "", cvFile: null });
  const [newDocName, setNewDocName] = useState("");
  const [lastAddedUser, setLastAddedUser] = useState(null);

  const storage = getStorage();

  // Safety redirect
  useEffect(() => {
    if (!companyId || !deptId) navigate(-1);
  }, [companyId, deptId, navigate]);

  // Fetch Users
  const fetchUsers = async () => {
    setLoadingUsers(true);
    const usersRef = collection(db, "freshers", companyId, "departments", deptId, "users");
    const snap = await getDocs(usersRef);
    setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    setLoadingUsers(false);
  };

  useEffect(() => {
    fetchUsers();
  }, [companyId, deptId]);

  // Fetch Documents
  useEffect(() => {
    const fetchDocs = async () => {
      setLoadingDocs(true);
      const docsRef = collection(db, "companies", companyId, "departments", deptId, "documents");
      const snap = await getDocs(docsRef);
      setDocs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
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
    const snap = await getDocs(collection(db, "companies", companyId, "departments", deptId, "documents"));
    setDocs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  // Password Generator
  const generatePassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#!";
    return Array.from({ length: 8 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join("");
  };

  // Add User
  const handleAddUser = async () => {
    const { name, phone, trainingOn, cvFile } = newUser;
    if (!name || !phone) return alert("Enter name & phone");
    if (!/^[0-9]{11}$/.test(phone)) return alert("Phone must be 11 digits");

    const firstName = name.split(" ")[0];
    const deptShort = deptName.replace(/\s+/g, "").toUpperCase();
    const companyShort = companyName.split(" ").map(w => w[0]).join("").toUpperCase();
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const userId = `${firstName}-${deptShort}-${companyShort}-${randomNum}`;
    const companyDomain = companyName.toLowerCase().replace(/\s+/g, "") + ".com";
    const userEmail = `${userId}@${companyDomain}`;
    const password = generatePassword();

    try {
      const usersRef = collection(db, "freshers", companyId, "departments", deptId, "users");
      const snap = await getDocs(usersRef);
      if (snap.docs.some(d => d.data().email.toLowerCase() === userEmail.toLowerCase())) {
        return alert("Email already exists");
      }

      // 1️⃣ Firebase Auth
      await createUserWithEmailAndPassword(auth, userEmail, password);

      // 2️⃣ Upload CV to Firebase Storage
      let cvUrl = "";
      if (cvFile) {
        const storageRef = ref(storage, `cvs/${companyId}/${deptId}/${userId}.pdf`);
        await uploadBytes(storageRef, cvFile);
        cvUrl = await getDownloadURL(storageRef);
      }

      // 3️⃣ Firestore
      await setDoc(doc(db, "freshers", companyId, "departments", deptId, "users", userId), {
        userId,
        name,
        email: userEmail,
        phone,
        trainingOn,
        progress: 0,
        companyId,
        companyName,
        deptId,
        deptName,
        onboarding: { onboardingCompleted: false },
        createdAt: serverTimestamp(),
        cvUrl,
      });

      await fetchUsers();

      setLastAddedUser({ name, userId, userEmail, password, companyName, deptName, cvUrl });

      setNewUser({ name: "", phone: "", trainingOn: "", cvFile: null });
    } catch (err) {
      console.error("❌ Add user failed:", err);
      alert("Failed to add user");
    }
  };

  // Download PDF of credentials
  const downloadUserPDF = () => {
    if (!lastAddedUser) return;
    const pdf = new jsPDF();
    pdf.setFontSize(18);
    pdf.text("User Credentials", 20, 20);
    pdf.setFontSize(12);
    pdf.text(`Name: ${lastAddedUser.name}`, 20, 40);
    pdf.text(`User ID: ${lastAddedUser.userId}`, 20, 50);
    pdf.text(`Email: ${lastAddedUser.userEmail}`, 20, 60);
    pdf.text(`Password: ${lastAddedUser.password}`, 20, 70);
    pdf.text(`Company: ${lastAddedUser.companyName}`, 20, 80);
    pdf.text(`Department: ${lastAddedUser.deptName}`, 20, 90);
    if (lastAddedUser.cvUrl) pdf.text(`CV URL: ${lastAddedUser.cvUrl}`, 20, 100);
    pdf.save(`${lastAddedUser.userId}_credentials.pdf`);
  };

  return (
    <div className="flex min-h-screen bg-[#031C3A] text-white">
      <CompanySidebar companyId={companyId} companyName={companyName} />

      <div className="flex-1 p-6">
        <button onClick={() => navigate(-1)} className="mb-4 text-[#00FFFF]">← Back</button>
        <h1 className="text-3xl font-bold mb-6">{deptName} Department</h1>

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
                  <th className="p-2">Email</th>
                  <th className="p-2">Training</th>
                  <th className="p-2">CV</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-t border-[#00FFFF20]">
                    <td className="p-2">{u.name}</td>
                    <td className="p-2">{u.email}</td>
                    <td className="p-2">{u.trainingOn}</td>
                    <td className="p-2">
                      {u.cvUrl ? (
                        <a href={u.cvUrl} target="_blank" rel="noopener noreferrer" className="text-[#00FFFF] underline">
                          View CV
                        </a>
                      ) : "No CV"}
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
              onChange={e => setNewUser({ ...newUser, name: e.target.value })}
            />
            <input
              placeholder="Phone"
              className="w-full p-2 mb-2 bg-[#031C3A]"
              value={newUser.phone}
              onChange={e => setNewUser({ ...newUser, phone: e.target.value })}
            />
            <input
              placeholder="Training On"
              className="w-full p-2 mb-2 bg-[#031C3A]"
              value={newUser.trainingOn}
              onChange={e => setNewUser({ ...newUser, trainingOn: e.target.value })}
            />
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              className="w-full mb-4"
              onChange={e => setNewUser({ ...newUser, cvFile: e.target.files[0] })}
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
