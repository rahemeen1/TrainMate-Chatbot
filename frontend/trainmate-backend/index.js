import express from "express";
import { db } from "./firebase.js";

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.send("TrainMate backend connected ✅");
});

app.post("/add-user", async (req, res) => {
  const { name, email } = req.body;
  try {
    await db.collection("users").add({ name, email, createdAt: new Date() });
    res.send("User added successfully ✅");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.listen(3000, () => console.log("Server running on port 3000 🚀"));
