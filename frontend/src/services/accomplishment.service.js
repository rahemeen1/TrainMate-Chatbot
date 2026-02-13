// src/services/accomplishment.service.js

export const generateAccomplishment = async ({
  companyId,
  deptId,
  userId,
  moduleId,
}) => {
  const res = await fetch(
    "http://localhost:5000/api/accomplishments/generate",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId,
        deptId,
        userId,
        moduleId,
      }),
    }
  );

  if (!res.ok) {
    throw new Error("Failed to generate accomplishment");
  }

  return res.json();
};
