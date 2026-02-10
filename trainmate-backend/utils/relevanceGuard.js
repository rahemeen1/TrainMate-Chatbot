// utils/relevanceGuard.js
export const isDocAllowed = ({
  similarityScore,
  docDepartment,
  docModule,
  userDepartment,
  userModule,
}) => {
  // 1. HARD FILTER: department & module must match
  if (
    docDepartment !== userDepartment ||
    docModule !== userModule
  ) {
    return false;
  }

  // 2. Soft similarity (don’t block concepts)
  if (similarityScore >= 0.25) return true;

  // 3. Allow conceptual content inside module
  return true;
};
