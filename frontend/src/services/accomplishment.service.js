// src/services/accomplishment.service.js
import { apiUrl } from "./api";

export const generateAccomplishment = async ({
  companyId,
  deptId,
  userId,
  moduleId,
}) => { 
  const res = await fetch(
    apiUrl("/api/accomplishments/generate"),
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
