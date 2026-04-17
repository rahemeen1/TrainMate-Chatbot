function calculateTrainingProgress(moduleData, startDateOverride) {
  const totalDays = moduleData?.estimatedDays || 1;
  const baseStart = startDateOverride || moduleData?.createdAt;

  if (!baseStart) {
    return {
      completedDays: 0,
      remainingDays: totalDays,
    };
  }

  const startDate = baseStart.toDate ? baseStart.toDate() : new Date(baseStart);
  const today = new Date();
  startDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((today - startDate) / (1000 * 60 * 60 * 24)) + 1;
  const completedDays = Math.min(diffDays, totalDays);
  const remainingDays = Math.max(totalDays - completedDays, 0);

  return {
    completedDays,
    remainingDays,
  };
}

export function getRoadmapGeneratedAt(userData) {
  const generatedAt = userData?.roadmapAgentic?.generatedAt || userData?.roadmapGeneratedAt;
  if (!generatedAt) return null;
  return generatedAt.toDate ? generatedAt.toDate() : new Date(generatedAt);
}

export function getModuleStartDateByOrder(sortedModules, moduleId, roadmapGeneratedAt) {
  if (!roadmapGeneratedAt || !sortedModules?.length) return null;
  const targetModule = sortedModules.find((module) => module.id === moduleId);
  if (!targetModule) return null;

  const targetOrder = targetModule.data.order || 0;
  const daysOffset = sortedModules
    .filter((module) => (module.data.order || 0) < targetOrder)
    .reduce((sum, module) => sum + (module.data.estimatedDays || 1), 0);

  return new Date(roadmapGeneratedAt.getTime() + daysOffset * 24 * 60 * 60 * 1000);
}

export async function selectActiveModule(sortedModules, roadmapGeneratedAt, roadmapRef = null) {
  const candidates = [...sortedModules];
  let activeModule = candidates.find((doc) => doc.data.status === "in-progress") || null;

  if (!activeModule) {
    activeModule = candidates.find((doc) => doc.data.status === "active") || null;
  }

  if (!activeModule) {
    activeModule = candidates.find((doc) => !doc.data.completed && doc.data.status !== "completed") || null;
  }

  if (!activeModule) {
    return null;
  }

  const moduleStartDate = getModuleStartDateByOrder(candidates, activeModule.id, roadmapGeneratedAt);
  const progress = calculateTrainingProgress(activeModule.data, moduleStartDate);
  const isExpired = progress.remainingDays <= 0;

  if (isExpired) {
    if (roadmapRef) {
      await roadmapRef.doc(activeModule.id).update({
        status: "expired",
        completed: false,
        moduleLocked: true,
        expiredAt: new Date(),
      }).catch(() => null);

      const nextModule = candidates.find((doc) => doc.id !== activeModule.id && !doc.data.completed && doc.data.status !== "completed" && doc.data.status !== "expired") || null;
      if (nextModule) {
        await roadmapRef.doc(nextModule.id).update({
          status: "in-progress",
          startedAt: new Date(),
        }).catch(() => null);
        return {
          activeModule: nextModule,
          moduleStartDate: getModuleStartDateByOrder(candidates, nextModule.id, roadmapGeneratedAt),
          isExpired: false,
        };
      }
    }

    return {
      activeModule,
      moduleStartDate,
      isExpired: true,
    };
  }

  return {
    activeModule,
    moduleStartDate,
    isExpired: false,
  };
}

export function calculateModuleProgress(moduleData, startDateOverride) {
  return calculateTrainingProgress(moduleData, startDateOverride);
}

export function summarizeModule(moduleData = {}) {
  return {
    moduleTitle: moduleData.moduleTitle || "Untitled module",
    description: moduleData.description || "No description available",
    skillsCovered: Array.isArray(moduleData.skillsCovered) ? moduleData.skillsCovered : [],
    estimatedDays: moduleData.estimatedDays || 1,
    status: moduleData.status || "pending",
  };
}
