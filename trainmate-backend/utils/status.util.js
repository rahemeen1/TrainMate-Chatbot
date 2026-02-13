// utils/status.util.js
export const getModuleStatus = (module) => {
  if (module.completed) return "Completed";
  if (module.quizGenerated) return "In Progress";
  return "Not Started";
};
