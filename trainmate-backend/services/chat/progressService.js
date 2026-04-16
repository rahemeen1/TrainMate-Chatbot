import { db } from "../../config/firebase.js";

function getDateKey(date, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function calculateSkillProgressFromActual(skillData = {}) {
  const { actualSkillsCovered = [], totalCovered = 0, totalSkills = 0, percentage = 0 } = skillData;

  if (totalSkills === 0) {
    return {
      totalSkills: 0,
      masteredSkills: 0,
      remainingSkills: 0,
      progressPercentage: 0,
      usingSkillTracking: false,
      actualSkillsCovered: [],
    };
  }

  const remainingSkills = Math.max(0, totalSkills - totalCovered);

  return {
    totalSkills,
    masteredSkills: totalCovered,
    remainingSkills,
    progressPercentage: percentage,
    usingSkillTracking: true,
    actualSkillsCovered,
  };
}

export async function getActualSkillsCovered(companyId, deptId, userId, moduleId, skillsCovered = []) {
  try {
    const chatSessionsRef = db
      .collection("freshers")
      .doc(companyId)
      .collection("departments")
      .doc(deptId)
      .collection("users")
      .doc(userId)
      .collection("roadmap")
      .doc(moduleId)
      .collection("chatSessions");

    const chatSnap = await chatSessionsRef.get();
    const allSkillsCovered = new Set();

    chatSnap.forEach((sessionDoc) => {
      const sessionData = sessionDoc.data();
      const messages = sessionData.messages || [];
      const conversationText = messages.map((message) => message.text || "").join(" ").toLowerCase();

      skillsCovered.forEach((skill) => {
        if (conversationText.includes(String(skill).toLowerCase())) {
          allSkillsCovered.add(skill);
        }
      });
    });

    const actualSkillsCovered = Array.from(allSkillsCovered);
    const totalCovered = actualSkillsCovered.length;
    const totalSkills = skillsCovered.length;
    const percentage = totalSkills > 0 ? Math.round((totalCovered / totalSkills) * 100) : 0;

    return {
      actualSkillsCovered,
      totalCovered,
      totalSkills,
      percentage,
    };
  } catch (error) {
    console.error("❌ Error getting actual skills covered:", error.message);
    return {
      actualSkillsCovered: [],
      totalCovered: 0,
      totalSkills: skillsCovered.length,
      percentage: 0,
    };
  }
}

export async function getMissedDates(companyId, deptId, userId, activeModuleId, moduleData, startDateOverride, timeZone = "Asia/Karachi") {
  try {
    const chatSessionsRef = db
      .collection("freshers")
      .doc(companyId)
      .collection("departments")
      .doc(deptId)
      .collection("users")
      .doc(userId)
      .collection("roadmap")
      .doc(activeModuleId)
      .collection("chatSessions");

    const chatSnap = await chatSessionsRef.get();
    const activeDates = new Set(chatSnap.docs.map((doc) => doc.id));

    if (!startDateOverride && !moduleData.createdAt) {
      return {
        hasMissedDates: false,
        missedDates: [],
        firstMissedDate: null,
        missedCount: 0,
        activeDays: 0,
        totalExpectedDays: 0,
        streak: 0,
      };
    }

    const startBase = startDateOverride || moduleData.createdAt;
    const startDate = startBase.toDate ? startBase.toDate() : new Date(startBase);
    const now = new Date();
    const today = new Date(now);
    startDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() - 1);

    if (endDate < startDate) {
      return {
        hasMissedDates: false,
        missedDates: [],
        firstMissedDate: null,
        missedCount: 0,
        activeDays: activeDates.size,
        totalExpectedDays: 0,
        streak: activeDates.has(getDateKey(today, timeZone)) ? 1 : 0,
      };
    }

    const missedDates = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dateStr = getDateKey(currentDate, timeZone);
      if (!activeDates.has(dateStr)) {
        missedDates.push(dateStr);
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const totalExpectedDays = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    let streak = 0;
    const streakDate = new Date(activeDates.has(getDateKey(today, timeZone)) ? today : endDate);
    while (true) {
      const dateStr = getDateKey(streakDate, timeZone);
      if (activeDates.has(dateStr)) {
        streak++;
        streakDate.setDate(streakDate.getDate() - 1);
      } else {
        break;
      }
    }

    return {
      hasMissedDates: missedDates.length > 0,
      missedDates,
      firstMissedDate: missedDates.length > 0 ? missedDates[0] : null,
      missedCount: missedDates.length,
      activeDays: activeDates.size,
      totalExpectedDays,
      streak,
    };
  } catch (error) {
    console.error("❌ Error calculating missed dates:", error.message);
    return {
      hasMissedDates: false,
      missedDates: [],
      firstMissedDate: null,
      missedCount: 0,
      activeDays: 0,
      totalExpectedDays: 0,
      streak: 0,
    };
  }
}
