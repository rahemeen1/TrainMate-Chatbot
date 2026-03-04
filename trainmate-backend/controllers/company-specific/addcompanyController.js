import { db, admin } from "../../config/firebase.js";
import { sendCompanyCredentialsEmail } from "../../services/emailService.js";

// ✅ Add Company (Auth + Firestore)
export const addCompany = async (req, res) => {
  console.log("✅ Request body:", req.body);

  const { name, email, phone, address, status, createdAt } = req.body;

  if (!name || !email || !phone || !address) {
    console.log("❌ Missing fields");
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    // 🔹 Firebase Auth: create user
    const tempPassword = Math.random().toString(36).slice(-8);
    console.log("Creating Firebase Auth user:", email);

    const userRecord = await admin.auth().createUser({
      email,
      password: tempPassword,
      displayName: name,
    });

    console.log("✅ Auth user created:", userRecord.uid);

    // 🔹 Firestore: add company doc
    await db.collection("companies").doc(userRecord.uid).set({
      name,
      email,
      phone,
      address,
      status: status || "active",
      createdAt: createdAt ? new Date(createdAt) : new Date(),
    });
    console.log("✅ Firestore doc created for:", userRecord.uid);

    // 🔹 Send credentials email
    try {
      await sendCompanyCredentialsEmail({
        companyEmail: email,
        companyName: name,
        tempPassword: tempPassword,
      });
      console.log("✅ Credentials email sent to:", email);
    } catch (emailError) {
      console.error("⚠️ Failed to send credentials email:", emailError.message);
      // Don't fail the entire request if email fails, just log it
    }

    res.status(201).json({
      uid: userRecord.uid,
      username: name,
      email,
      password: tempPassword,
      message: "Company created successfully. Credentials sent to email.",
    });
  } catch (err) {
    console.error("❌ /add-company error:", err);
    res.status(500).json({ message: err.message });
  }
};
