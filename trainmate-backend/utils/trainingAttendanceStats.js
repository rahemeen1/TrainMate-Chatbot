const DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE || "Asia/Karachi";

export function getDateKey(date, timeZone = DEFAULT_TIMEZONE) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function calculateAttendanceStats({
  attendanceDateKeys = [],
  startDate = null,
  timeZone = DEFAULT_TIMEZONE,
  strictTodayStreak = true,
}) {
  const normalizedAttendanceDates = new Set(
    Array.from(attendanceDateKeys)
      .filter((value) => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean)
  );

  const activeDays = normalizedAttendanceDates.size;
  const today = new Date();
  const todayKey = getDateKey(today, timeZone);

  const missedDates = [];
  let totalExpectedDays = 0;

  if (startDate) {
    const start = startDate.toDate ? startDate.toDate() : new Date(startDate);
    if (!Number.isNaN(start.getTime())) {
      start.setHours(0, 0, 0, 0);

      const endDate = new Date(today);
      endDate.setHours(0, 0, 0, 0);
      endDate.setDate(endDate.getDate() - 1);

      if (endDate >= start) {
        const currentDate = new Date(start);
        while (currentDate <= endDate) {
          const dateKey = getDateKey(currentDate, timeZone);
          if (!normalizedAttendanceDates.has(dateKey)) {
            missedDates.push(dateKey);
          }
          currentDate.setDate(currentDate.getDate() + 1);
        }
        totalExpectedDays = Math.floor((endDate - start) / (1000 * 60 * 60 * 24)) + 1;
      }
    }
  }

  let currentStreak = 0;
  const hasAttendanceToday = normalizedAttendanceDates.has(todayKey);

  if (!strictTodayStreak || hasAttendanceToday) {
    const cursor = new Date(today);
    cursor.setHours(0, 0, 0, 0);

    while (normalizedAttendanceDates.has(getDateKey(cursor, timeZone))) {
      currentStreak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
  }

  return {
    activeDays,
    hasMissedDates: missedDates.length > 0,
    missedDates,
    firstMissedDate: missedDates.length > 0 ? missedDates[0] : null,
    missedCount: missedDates.length,
    totalExpectedDays,
    currentStreak,
  };
}
