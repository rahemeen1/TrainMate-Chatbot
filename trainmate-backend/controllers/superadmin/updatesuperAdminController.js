import { db } from "../../config/firebase.js";


// ✅ Update Super Admin by ID
export const updateSuperAdmin = async (req, res) => {
  const { id } = req.params;
  const { email, oldPassword, newPassword } = req.body;

  try {
    const docRef = db.collection("super_admins").doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ message: "Admin not found" });
    }

    const adminData = docSnap.data();

    // Check old password if changing password
    if (newPassword) {
      if (!oldPassword || oldPassword !== adminData.password) {
        return res.status(400).json({ message: "Old password is incorrect" });
      }
    }

    // Prepare update object
    const updateData = {};
    if (email) updateData.email = email;
    if (newPassword) updateData.password = newPassword;

    await docRef.update(updateData);

    res.status(200).json({ message: "Super Admin updated successfully" });
  } catch (err) {
    console.error("Update Super Admin Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

