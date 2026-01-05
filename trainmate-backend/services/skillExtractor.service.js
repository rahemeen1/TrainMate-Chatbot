export const extractSkillsFromText = async (cvText) => {
  console.log("[SKILLS] Skill extraction started");

  if (!cvText) {
    console.warn("[SKILLS][WARN] Empty CV text received");
    return {};
  }

  // TEMP SIMPLE LOGIC (later LLM)
  const skills = [];

  const knownSkills = [
    "javascript",
    "react",
    "node",
    "express",
    "mongodb",
    "html",
    "css",
    "git"
  ];

  const lowerText = cvText.toLowerCase();

  knownSkills.forEach(skill => {
    if (lowerText.includes(skill)) {
      skills.push(skill);
    }
  });

  console.log("[SKILLS] Skills detected:", skills);

  return {
    skills,
    level: "Medium" // placeholder
  };
};
