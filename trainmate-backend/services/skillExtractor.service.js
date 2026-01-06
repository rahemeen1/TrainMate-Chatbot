// skillExtractor.js

export const extractSkillsFromText = (text) => {
  if (!text || typeof text !== "string" || text.trim() === "") {
    console.warn("[SKILLS][WARN] Empty text received");
    return [];
  }

  console.log("[SKILLS] Skill extraction started");

  const predefinedSkills = [
    "javascript", "react", "node", "mongodb",
    "html", "css", "python", "django", "sql",
    "recruitment", "onboarding", "payroll",
    "interviewing", "training", "hr policies",
    "employee engagement", "performance review"
  ];

  const foundSkills = predefinedSkills.filter(skill =>
    text.toLowerCase().includes(skill.toLowerCase())
  );

  console.log("[SKILLS] Skills detected:", foundSkills);

  return foundSkills;
};
