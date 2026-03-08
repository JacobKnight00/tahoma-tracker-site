const PACIFIC_TIME_ZONE = 'America/Los_Angeles';
const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const PACIFIC_CLOCK_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: PACIFIC_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const PACIFIC_DISPLAY_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: PACIFIC_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
});

const PACIFIC_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: PACIFIC_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function getPart(parts, type) {
  return parts.find((part) => part.type === type)?.value || '';
}

function parseDateString(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') {
    return null;
  }

  const [year, month, day] = dateStr.split('-').map((value) => Number.parseInt(value, 10));
  if (!year || !month || !day) {
    return null;
  }

  return { year, month, day };
}

function getEntryMinutes(entry) {
  if (!entry?.time || entry.time.length !== 4) {
    return null;
  }

  const hours = Number.parseInt(entry.time.slice(0, 2), 10);
  const minutes = Number.parseInt(entry.time.slice(2, 4), 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

function getPacificMinutesFromIso(isoString) {
  if (!isoString) {
    return null;
  }

  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = PACIFIC_CLOCK_FORMATTER.formatToParts(date);
  const hour = Number.parseInt(getPart(parts, 'hour'), 10);
  const minute = Number.parseInt(getPart(parts, 'minute'), 10);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return null;
  }

  return hour * 60 + minute;
}

function formatMonthDay(dateStr) {
  const parts = parseDateString(dateStr);
  if (!parts) {
    return '--';
  }

  return `${MONTH_NAMES_SHORT[parts.month - 1]} ${parts.day}`;
}

function summarizeImages(images = []) {
  let outCount = 0;
  let partiallyOutCount = 0;

  for (const image of images) {
    if (image.visibility === 'out') {
      outCount += 1;
    } else if (image.visibility === 'partially_out') {
      partiallyOutCount += 1;
    }
  }

  const total = images.length;
  const weightedVisible = outCount + (partiallyOutCount * 0.5);
  const visiblePct = total > 0
    ? Math.round((weightedVisible / total) * 100)
    : null;

  return {
    total,
    outCount,
    partiallyOutCount,
    visiblePct,
  };
}

function findBestDayInMonth(monthlyManifest, year, month) {
  const days = monthlyManifest?.days;
  if (!days) {
    return null;
  }

  let bestDay = null;
  let bestScore = -1;

  for (const [dayStr, dayInfo] of Object.entries(days)) {
    const score = (dayInfo.out_count || 0) * 100 + (dayInfo.partially_out_count || 0);
    if (score > bestScore && (dayInfo.out_count || 0) > 0) {
      bestScore = score;
      bestDay = Number.parseInt(dayStr, 10);
    }
  }

  if (!bestDay) {
    return null;
  }

  return `${MONTH_NAMES_SHORT[month - 1]} ${bestDay}`;
}

function countDaysOut(monthlyManifest) {
  const days = monthlyManifest?.days;
  if (!days) {
    return null;
  }

  let count = 0;
  for (const dayInfo of Object.values(days)) {
    if (dayInfo?.had_out || dayInfo?.had_partially_out) {
      count += 1;
    }
  }

  return count;
}

function findLongestVisibilityStreak(monthlyManifest) {
  const days = monthlyManifest?.days;
  if (!days) {
    return null;
  }

  const dayNumbers = Object.keys(days)
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => !Number.isNaN(value))
    .sort((a, b) => a - b);

  let longestStreak = 0;
  let currentStreak = 0;
  let previousDay = null;

  for (const dayNumber of dayNumbers) {
    const dayInfo = days[String(dayNumber).padStart(2, '0')];
    const hasVisibility = Boolean(dayInfo?.had_out || dayInfo?.had_partially_out);

    if (!hasVisibility) {
      currentStreak = 0;
      previousDay = null;
      continue;
    }

    if (previousDay === null || dayNumber === previousDay + 1) {
      currentStreak += 1;
    } else {
      currentStreak = 1;
    }

    previousDay = dayNumber;
    longestStreak = Math.max(longestStreak, currentStreak);
  }

  return longestStreak > 0 ? longestStreak : null;
}

export function getCurrentPacificDateString(now = new Date()) {
  const parts = PACIFIC_DATE_FORMATTER.formatToParts(now);
  const year = getPart(parts, 'year');
  const month = getPart(parts, 'month');
  const day = getPart(parts, 'day');
  return `${year}-${month}-${day}`;
}

export function getCurrentPacificMinutes(now = new Date()) {
  const parts = PACIFIC_CLOCK_FORMATTER.formatToParts(now);
  const hour = Number.parseInt(getPart(parts, 'hour'), 10);
  const minute = Number.parseInt(getPart(parts, 'minute'), 10);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return null;
  }

  return hour * 60 + minute;
}

export function formatPacificTime(isoString) {
  if (!isoString) {
    return '--';
  }

  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return PACIFIC_DISPLAY_TIME_FORMATTER.format(date);
}

export function getDisplayWindowMinutes(daylight) {
  const sunriseMinutes = getPacificMinutesFromIso(daylight?.sunrise_at);
  const sunsetMinutes = getPacificMinutesFromIso(daylight?.sunset_at);

  if (sunriseMinutes == null || sunsetMinutes == null) {
    return null;
  }

  return {
    startMinutes: Math.max(0, sunriseMinutes - 60),
    endMinutes: sunsetMinutes + 60,
  };
}

export function createDateFromManifestEntry(dateStr, time) {
  const dateParts = parseDateString(dateStr);
  if (!dateParts || !time || time.length !== 4) {
    return null;
  }

  const hours = Number.parseInt(time.slice(0, 2), 10);
  const minutes = Number.parseInt(time.slice(2, 4), 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  return new Date(dateParts.year, dateParts.month - 1, dateParts.day, hours, minutes, 0, 0);
}

export function filterManifestImagesForDisplayWindow(dailyManifest) {
  const images = Array.isArray(dailyManifest?.images) ? dailyManifest.images : [];
  if (images.length === 0) {
    return [];
  }

  const displayWindow = getDisplayWindowMinutes(dailyManifest.daylight);
  if (!displayWindow) {
    return images;
  }

  let startIndex = 0;
  for (let index = images.length - 1; index >= 0; index -= 1) {
    const entryMinutes = getEntryMinutes(images[index]);
    if (entryMinutes != null && entryMinutes <= displayWindow.startMinutes) {
      startIndex = index;
      break;
    }
  }

  let endIndex = images.length - 1;
  for (let index = 0; index < images.length; index += 1) {
    const entryMinutes = getEntryMinutes(images[index]);
    if (entryMinutes != null && entryMinutes >= displayWindow.endMinutes) {
      endIndex = index;
      break;
    }
  }

  if (endIndex < startIndex) {
    return images.slice(startIndex, startIndex + 1);
  }

  return images.slice(startIndex, endIndex + 1);
}

export function buildSidebarStats(dailyManifest, monthlyManifest = null) {
  if (!dailyManifest?.date) {
    return null;
  }

  const filteredImages = filterManifestImagesForDisplayWindow(dailyManifest);
  const summary = summarizeImages(filteredImages);
  const isToday = dailyManifest.date === getCurrentPacificDateString();
  const dateLabel = formatMonthDay(dailyManifest.date);
  const title = isToday ? "Today's Stats" : `Stats for ${dateLabel}`;

  const dateParts = parseDateString(dailyManifest.date);
  const bestDay = dateParts
    ? findBestDayInMonth(monthlyManifest, dateParts.year, dateParts.month)
    : null;
  const longestStreak = findLongestVisibilityStreak(monthlyManifest);
  const daysOut = countDaysOut(monthlyManifest);
  const monthLabel = dateParts ? MONTH_NAMES_SHORT[dateParts.month - 1] : '';

  let visibilityTone = null;
  if (summary.outCount > 0) {
    visibilityTone = 'out';
  } else if (summary.partiallyOutCount > 0) {
    visibilityTone = 'partial';
  }

  return {
    date: dailyManifest.date,
    title,
    kind: 'stats',
    filteredImages,
    summary,
    items: [
      {
        label: 'Visible',
        value: summary.visiblePct != null ? `${summary.visiblePct}%` : '--',
        tone: visibilityTone,
      },
      {
        label: `${monthLabel} Days Out`,
        value: daysOut != null ? `${daysOut} day${daysOut === 1 ? '' : 's'}` : '--',
      },
      {
        label: `${monthLabel} Best Day`,
        value: bestDay || '--',
      },
      {
        label: `${monthLabel} Longest Streak`,
        value: longestStreak ? `${longestStreak} day${longestStreak === 1 ? '' : 's'}` : '--',
      },
      {
        label: 'Sunrise',
        value: formatPacificTime(dailyManifest?.daylight?.sunrise_at),
      },
      {
        label: 'Sunset',
        value: formatPacificTime(dailyManifest?.daylight?.sunset_at),
      },
    ],
  };
}
