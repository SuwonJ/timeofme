let chartInstance = null;
let currentRange = 'daily';
let currentChartType = 'bar';
const GIST_ID_DEFAULT = "YOUR_GIST_ID";
const GIST_FILE = "timetome_backup.json";
const gistIdFromUrl = new URLSearchParams(window.location.search).get("gist");
const GIST_ID = gistIdFromUrl || GIST_ID_DEFAULT;

Chart.register(ChartDataLabels);

async function fetchLogFile() {
  const urlParams = new URLSearchParams(window.location.search);
  const useLocal = urlParams.get("local") === "true";

  if (useLocal) {
    const res = await fetch("./backups/timetome_backup.json");
    if (res.ok) return await res.json();
    const fallbackRes = await fetch("./backups/log.json");
    if (fallbackRes.ok) return await fallbackRes.json();
    throw new Error("Local backup file backups/timetome_backup.json or backups/log.json not found");
  }

  try {
    if (!GIST_ID || GIST_ID === "YOUR_GIST_ID") {
      throw new Error("Set GIST_ID_DEFAULT or open the page with ?gist=<your_gist_id>");
    }
    const res = await fetch(`https://api.github.com/gists/${GIST_ID}`);
    if (!res.ok) {
      if (res.status === 403) {
        console.warn("GitHub Gist rate limit reached. Falling back to local ./backups/timetome_backup.json");
        const localRes = await fetch("./backups/timetome_backup.json");
        if (localRes.ok) return await localRes.json();
        const fallbackRes = await fetch("./backups/log.json");
        if (fallbackRes.ok) return await fallbackRes.json();
      }
      throw new Error(`Failed to fetch gist: ${res.status} ${res.statusText}`);
    }

    const gist = await res.json();
    const file = gist.files?.[GIST_FILE];
    if (!file) throw new Error(`Missing ${GIST_FILE} in gist`);

    if (file.content) {
      return JSON.parse(file.content);
    }

    const rawRes = await fetch(file.raw_url);
    if (!rawRes.ok) throw new Error(`Failed to fetch gist raw file: ${rawRes.status} ${rawRes.statusText}`);
    return await rawRes.json();
  } catch (err) {
    console.error("Gist fetch error, trying local fallback:", err);
    const localRes = await fetch("./backups/timetome_backup.json");
    if (localRes.ok) {
      console.log("Successfully loaded local fallback: ./backups/timetome_backup.json");
      return await localRes.json();
    }
    const fallbackRes = await fetch("./backups/log.json");
    if (fallbackRes.ok) {
      console.log("Successfully loaded local fallback: ./backups/log.json");
      return await fallbackRes.json();
    }
    throw err;
  }
}

function extractEmoji(text) {
  const match = String(text || "").match(/^(\p{Extended_Pictographic}|\p{Emoji_Presentation})/u);
  return match ? match[0] : "";
}

function normalizeActivityName(text) {
  return String(text || "")
    .replace(/#\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRgbaString(rgbaString) {
  if (!rgbaString) return "rgba(204, 204, 204, 1)";
  const parts = rgbaString.split(",").map((v) => Number(v.trim()));
  if (parts.length < 3 || parts.some(Number.isNaN)) {
    return "rgba(204, 204, 204, 1)";
  }
  const [r, g, b, a = 255] = parts;
  return `rgba(${r}, ${g}, ${b}, ${a / 255})`;
}

function formatTime(unixSec) {
  return new Date(unixSec * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function cleanTitle(title, activityMap) {
  if (!title) return null;
  let cleaned = String(title).replace(/\{\{goal_(\d+)\}\}/g, (match, idStr) => {
    const act = activityMap.get(Number(idStr));
    return act ? act.name : "";
  });
  cleaned = cleaned.replace(/\s*#{1,2}[\w_]+/g, "");
  cleaned = cleaned.trim();
  return cleaned.length > 0 ? cleaned : null;
}

const EMOJI_TO_MATERIAL = {
  "🍻": "sports_bar",
  "🙁": "sentiment_dissatisfied",
  "🙄": "sentiment_neutral",
  "⏰": "alarm",
  "🏛️": "account_balance",
  "🧪": "science",
  "📄": "description",
  "➕": "add",
  "✏️": "edit",
  "📐": "square_foot",
  "📗": "book",
  "📔": "auto_stories",
  "😴": "bedtime",
  "💡": "lightbulb",
  "👍": "thumb_up",
  "🧹": "cleaning_services",
  "📚": "library_books",
  "🍳": "dinner_dining",
  "🧘": "self_improvement"
};

const ICON_TO_MATERIAL = {
  "book": "book",
  "case": "work",
  "timer": "timer",
  "exercise": "fitness_center",
  "piano": "piano",
  "music_note": "music_note",
  "rocket": "rocket_launch",
  "bus": "directions_bus",
  "bulb": "lightbulb",
  "bolt": "bolt",
  "option": "settings",
  "graduationcap": "school",
  "megaphone": "campaign",
  "instruments": "music_note",
  "meditation": "self_improvement",
  "flask": "science",
  "compass": "explore",
  "gamecontroller": "sports_esports",
  "soccerball": "sports_soccer",
  "hiking": "hiking",
  "inbox": "inbox",
  "sun": "light_mode",
  "moon": "dark_mode",
  "moon_stars": "nightlight",
  "film": "movie",
  "coffee": "local_cafe",
  "tennis": "sports_tennis",
  "surfing": "surfing",
  "skiing": "downhill_skiing",
  "fork_knife": "restaurant",
  "hockey": "sports_hockey",
  "pencil_note": "edit",
  "question": "help"
};

function parseSymbol(symbolRaw, activityName) {
  if (symbolRaw && typeof symbolRaw === "string") {
    if (symbolRaw.startsWith("emoji--")) {
      const emoji = symbolRaw.substring(7);
      return EMOJI_TO_MATERIAL[emoji] || "star";
    }
    if (symbolRaw.startsWith("letter--")) {
      return symbolRaw.substring(8);
    }
    if (symbolRaw.startsWith("icon--")) {
      const iconCode = symbolRaw.substring(6);
      return ICON_TO_MATERIAL[iconCode] || "help";
    }
    const rawEmoji = extractEmoji(symbolRaw);
    if (rawEmoji) return EMOJI_TO_MATERIAL[rawEmoji] || "star";
  }
  
  const extracted = extractEmoji(activityName);
  if (extracted) return EMOJI_TO_MATERIAL[extracted] || "star";
  
  return "lightbulb";
}

function renderTimelineIcon(activity) {
  if (!activity) return `<span class="material-symbols-rounded" style="font-size: 1.4em; color: #ccc; vertical-align: middle;">help</span>`;
  const icon = activity.icon || "lightbulb";
  const color = activity.color || "#ccc";
  
  if (icon && icon.length === 1 && /^[a-zA-Z가-힣0-9]$/.test(icon)) {
    return `<span class="letter-icon" style="font-size: 1.1em; font-weight: 800; color: ${color};">${icon}</span>`;
  }
  
  return `<span class="material-symbols-rounded" style="font-size: 1.4em; color: ${color}; vertical-align: middle;">${icon}</span>`;
}

function buildActivityMap(backup) {
  if (Array.isArray(backup.activities) && backup.activities.length > 0) {
    const isNewFormat = backup.activities[0].length > 12;
    if (isNewFormat) {
      return new Map(
        backup.activities.map((a) => {
          const rawName = a[3] || "";
          return [
            a[0],
            {
              name: normalizeActivityName(rawName),
              color: parseRgbaString(a[9]),
              icon: parseSymbol(a[7], rawName),
              symbolRaw: a[7],
            },
          ];
        }),
      );
    } else {
      // Old format activities mapping: [id, name, seconds, type_id, parent_id, color_rgba, symbol_raw, ...]
      return new Map(
        backup.activities.map((a) => {
          const rawName = a[1] || "";
          return [
            a[0],
            {
              name: normalizeActivityName(rawName),
              color: parseRgbaString(a[5]),
              icon: parseSymbol(a[6], rawName),
              symbolRaw: a[6],
            },
          ];
        }),
      );
    }
  }

  if (Array.isArray(backup.goals) && backup.goals.length > 0) {
    return new Map(
      backup.goals.map((g) => {
        const rawName = g[3] || "";
        return [
          g[0],
          {
            name: normalizeActivityName(rawName),
            color: parseRgbaString(g[9]),
            icon: parseSymbol(g[7], rawName),
            symbolRaw: g[7],
          },
        ];
      }),
    );
  }

  return new Map();
}

function formatHms(seconds) {
  const h = Math.floor(seconds / 3600)
    .toString()
    .padStart(2, "0");
  const m = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function formatHoursMinutes(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) {
    return `${h}h ${m}m`;
  }
  return `${m}m`;
}

function getDayRange(date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return { start, end };
}

function getWeekRange(date) {
    const start = new Date(date);
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    start.setDate(diff);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
}

function getMonthRange(date) {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
}


async function main(targetDate, timeRange = 'daily', chartType = 'bar') {

  const detailsEl = document.getElementById("details");
  const dashboardEl = document.getElementById("dashboard");
  const chartEl = document.getElementById("activityChart").getContext("2d");
  const sleepAnalysisEl = document.getElementById("sleep-analysis");
  const tasksSectionEl = document.getElementById("tasks-section");
  const excludeCommonEl = document.getElementById("exclude-common");

  if (chartInstance) {
    chartInstance.destroy();
  }

  try {
    const backup = await fetchLogFile();

    if (!targetDate) {
        targetDate = new Date();
        targetDate.setDate(targetDate.getDate() - 1);
    }

    let range;
    if (timeRange === 'weekly') {
        range = getWeekRange(targetDate);
    } else if (timeRange === 'monthly') {
        range = getMonthRange(targetDate);
    } else {
        range = getDayRange(targetDate);
    }

    // summaryEl will be populated later with focus metrics and headline

    const activityMap = buildActivityMap(backup);
    const activities = [...activityMap.entries()].map(([id, activity]) => ({
      id,
      ...activity,
    }));

    const sleepActivity = activities.find((a) => a.name.includes("Sleep"));
    const sleepActivityId = sleepActivity ? sleepActivity.id : null;

    let rawIntervals = (
      Array.isArray(backup.intervals) ? backup.intervals : []
    ).reverse();
    let intervals = [];
    if (rawIntervals.length > 0) {
      const isNewFormat = rawIntervals[0][0] < 10000000;
      if (isNewFormat) {
        for (let i = 0; i < rawIntervals.length - 1; i++) {
          const current = rawIntervals[i];
          const start = current[1];
          const next = rawIntervals[i + 1];
          const end = next[1];
          const duration = end - start;
          if (duration <= 0) continue;
          intervals.push({
            start: start,
            end: end,
            duration: duration,
            settedDuration: duration,
            title: current[3],
            activityId: current[2],
          });
        }
      } else {
        for (let i = 0; i < rawIntervals.length - 1; i++) {
          const start = rawIntervals[i][0];
          const end = rawIntervals[i + 1][0];
          const duration = end - start;
          if (duration <= 0) continue;
          intervals.push({
            start: start,
            end: end,
            duration: duration,
            settedDuration: rawIntervals[i][1],
            title: rawIntervals[i][2],
            activityId: rawIntervals[i][3],
          });
        }
      }
    }

    const rangeIntervals = intervals.filter(i => {
        const intervalDate = new Date(i.start * 1000);
        return intervalDate >= range.start && intervalDate <= range.end;
    });
    
    const sleepIntervals = rangeIntervals.filter((i) => i.activityId === sleepActivityId);
    const sleepSeconds = sleepIntervals.reduce((sum, i) => sum + i.duration, 0);

    const focusIntervals = rangeIntervals.filter((i) => {
      const act = activityMap.get(i.activityId);
      if (!act) return false;
      const name = act.name.toLowerCase();
      // Exclude Sleep/Rest
      if (name.includes("sleep") || name.includes("rest")) return false;
      // Exclude Break/Other/Routines
      if (name.includes("break") || name.includes("other") || name.includes("routines")) return false;
      // Exclude specific Break titles
      if (i.title && i.title.toLowerCase().includes("break")) return false;
      return true;
    });
    const focusSeconds = focusIntervals.reduce((sum, i) => sum + i.duration, 0);

    const awakeSeconds = Math.max(3600, 24 * 3600 - sleepSeconds);
    const focusDensity = (focusSeconds / awakeSeconds) * 100;

    // Remaining Tasks count for the day
    const tasks = Array.isArray(backup.tasks) ? backup.tasks : [];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayYMD = yesterday.toISOString().slice(0, 10);
    const leftTasksCount = tasks.filter((t) => {
      if (typeof t.date === "string") return t.date.startsWith(yesterdayYMD);
      if (typeof t.due === "string") return t.due.startsWith(yesterdayYMD);
      return false;
    }).length;

    // Gazette Dynamic Editorial Headline
    const focusHours = (focusSeconds / 3600).toFixed(1);
    const focusDensityPercent = focusDensity.toFixed(0);

    const startStr = range.start.toLocaleDateString();
    const endStr = range.end.toLocaleDateString();
    const dateText = (startStr === endStr) ? startStr : `${startStr} - ${endStr}`;
    const chronologyHeader = document.querySelector(".panel-header h2");
    if (chronologyHeader) {
        chronologyHeader.innerHTML = `Chronology <span style="font-size: 0.6em; font-weight: normal; font-style: italic; color: var(--subtle-text-color); margin-left: 0.6em;">(${dateText})</span>`;
    }

    // Dashboard
    dashboardEl.innerHTML = `
      <div class="stat-card">
        <h3>Focus Time</h3>
        <p>${formatHoursMinutes(focusSeconds)}</p>
      </div>
      <div class="stat-card">
        <h3>Focus Density</h3>
        <p>${focusDensityPercent}%</p>
      </div>
      <div class="stat-card">
        <h3>Sleep Time</h3>
        <p>${formatHoursMinutes(sleepSeconds)}</p>
      </div>
      <div class="stat-card">
        <h3>Pending Tasks</h3>
        <p>${leftTasksCount} left</p>
      </div>
    `;

    // Sleep Analysis
    if (timeRange === 'daily' && sleepIntervals.length > 0) {
        const sleepStart = new Date(sleepIntervals[0].start * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        const sleepEnd = new Date(sleepIntervals[sleepIntervals.length - 1].end * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        sleepAnalysisEl.innerHTML = `
            <p><strong>Went to bed at:</strong> ${sleepStart}</p>
            <p><strong>Woke up at:</strong> ${sleepEnd}</p>
        `;
        document.getElementById('sleep-analysis-container').style.display = 'block';
    } else {
        document.getElementById('sleep-analysis-container').style.display = 'none';
    }

    // Chart
    let activityDurations = new Map();
    rangeIntervals.forEach((i) => {
      const activity = activityMap.get(i.activityId);
      if (activity) {
        const currentDuration = activityDurations.get(activity.name) || 0;
        activityDurations.set(activity.name, currentDuration + i.duration);
      }
    });

    if (excludeCommonEl.checked) {
        activityDurations.delete('ROUTINES');
        activityDurations.delete('Sleep / Rest');
    }

    let chartData;
    if (chartType === 'bar') {
        chartData = {
            labels: ["Time Spent"],
            datasets: [...activityDurations.entries()].map(([name, duration]) => ({
                label: name,
                data: [duration / 3600],
                backgroundColor: activities.find((a) => a.name === name)?.color || '#ccc',
                icons: [activities.find((a) => a.name === name)?.icon || ""]
            }))
        };
    } else {
        chartData = {
        labels: [...activityDurations.keys()],
        datasets: [
            {
            label: "Time Spent",
            data: [...activityDurations.values()].map(d => d/3600), // in hours
            backgroundColor: [...activityDurations.keys()].map(
                (name) => activities.find((a) => a.name === name)?.color || "#ccc",
            ),
            icons: [...activityDurations.keys()].map(name => activities.find((a) => a.name === name)?.icon || "")
            },
        ],
        };
    }

    chartInstance = new Chart(chartEl, {
      type: chartType,
      data: chartData,
      options: {
        indexAxis: chartType === 'bar' ? 'y' : 'x',
        responsive: true,
        plugins: {
          legend: {
            display: true,
            labels: {
              font: {
                family: "'Source Serif 4', 'Pretendard', serif",
                size: 12
              },
              color: '#1c1917'
            }
          },
          title: {
            display: true,
            text: `Activity Duration (in hours) for ${range.start.toLocaleDateString()} - ${range.end.toLocaleDateString()}`,
            font: {
              family: "'Source Serif 4', 'Pretendard', serif",
              size: 13,
              weight: 'bold'
            },
            color: '#1c1917'
          },
          datalabels: {
            anchor: 'end',
            align: 'end',
            formatter: function(value, context) {
              return context.dataset.icons[context.dataIndex];
            },
            font: {
                family: "'Material Symbols Rounded'",
                size: 18
            },
            offset: 8
          }
        },
        scales: {
          x: {
            ticks: {
              font: {
                family: "'Source Serif 4', 'Pretendard', serif",
                size: 11
              },
              color: '#1c1917'
            }
          },
          y: {
            ticks: {
              font: {
                family: "'Source Serif 4', 'Pretendard', serif",
                size: 11
              },
              color: '#1c1917'
            }
          }
        }
      },
    });

    // Details
    if (timeRange === 'daily') {
        detailsEl.style.display = 'block';
        detailsEl.innerHTML = `
        <h2>Timeline for ${targetDate.toLocaleDateString()}</h2>
        <ul class="interval-list">
        ${rangeIntervals
            .map((i, idx, arr) => {
            const activity = activityMap.get(i.activityId);
            const activityName = activity ? activity.name : "Unknown";
            const activityIconHtml = renderTimelineIcon(activity);
            const activityColor = activity ? activity.color : "#ccc";

            // Resolve clean title and format notes nicely
            const cleanedTitle = cleanTitle(i.title, activityMap);
            let displayNameHtml = `<span class="activity-name-text">${activityName}</span>`;
            if (cleanedTitle && cleanedTitle.toLowerCase() !== activityName.toLowerCase()) {
                displayNameHtml = `<span class="activity-name-text">${activityName}</span> <span class="activity-note-text">(${cleanedTitle})</span>`;
            }

            // Duration calculations and labels
            const durationLabel = formatHoursMinutes(i.duration);
            let targetText = "";
            if (i.settedDuration && Math.abs(i.settedDuration - i.duration) > 5) {
                targetText = `Target: ${formatHoursMinutes(i.settedDuration)}`;
            }

            if (i.duration < 300) {
                return `
                    <li class="line-item">
                        <div class="time-label">
                            <div>${formatTime(i.start)}</div>
                            <div style="font-size: 0.8em; opacity: 0.6; margin-top: 1px;">${durationLabel}</div>
                        </div>
                        <div class="timeline-line" style="background-color: ${activityColor};"></div>
                        <div class="activity-details">
                            <div class="activity-name">${displayNameHtml}</div>
                            ${targetText ? `<div class="duration-info"><small>${targetText}</small></div>` : ""}
                        </div>
                    </li>
                `;
            }

            const isShort = i.duration < 600;
            let blobClass = isShort ? "blob-circle" : "blob-pill";
            if (!isShort) {
                if (idx === 0) blobClass += " first";
                else if (idx === arr.length - 1) blobClass += " last";
            }

            const showPath = idx !== arr.length - 1;

            return `
                <li>
                <div class="time-label">
                    <div>${formatTime(i.start)}</div>
                    <div style="font-size: 0.8em; opacity: 0.6; margin-top: 1px;">${durationLabel}</div>
                </div>
                <div class="timeline-visual">
                    <div class="timeline-blob ${blobClass}" style="border-color: ${activityColor}; height: ${
                    isShort ? 36 : 36 + (i.duration / 60) * 0.15
                    }px;">
                    <span class="activity-icon">${activityIconHtml}</span>
                    </div>
                    ${showPath ? '<div class="timeline-path"></div>' : ""}
                </div>
                <div class="activity-details">
                    <div class="activity-name">${displayNameHtml}</div>
                    ${targetText ? `<div class="duration-info"><small>${targetText}</small></div>` : ""}
                </div>
                </li>
            `;
            })
            .join("")}
        </ul>
        `;
    } else {
        detailsEl.style.display = 'none';
    }

    // Tasks (tasks, yesterday, and yesterdayYMD are already declared above)
    const remainingTasks = tasks.filter((t) => {
      if (typeof t.date === "string") return t.date.startsWith(yesterdayYMD);
      if (typeof t.due === "string") return t.due.startsWith(yesterdayYMD);
      return false;
    });

    tasksSectionEl.innerHTML = `
        <h2>Left Tasks</h2>
        <ul class="task-list">
            ${remainingTasks
            .map((t) => {
                const raw = (typeof t[1] === "string") ? t[1] : (t[2] || "Untitled Task");
                const cleaned = String(raw)
                .replace(/\s*#{1,2}[\w_]+/g, "")
                .trim();
                return `<li>${cleaned}</li>`;
            })
            .join("")}
        </ul>
    `;

  } catch (err) {
    detailsEl.innerHTML = `<div class="error-text" style="padding: 1em; border: 1px solid var(--border-color); margin-bottom: 1em;"><b>Error:</b> ${err.message}</div>`;
  }
}


document.addEventListener("DOMContentLoaded", () => {
    const datePicker = document.getElementById("date-picker");
    const yesterdayBtn = document.getElementById("yesterday-btn");
    const prevDayBtn = document.getElementById("prev-day-btn");
    const nextDayBtn = document.getElementById("next-day-btn");
    const tabs = document.querySelectorAll('.tab-link');
    const chartTypeButtons = document.querySelectorAll('.chart-type-btn');
    const excludeCommonEl = document.getElementById("exclude-common");

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    datePicker.valueAsDate = yesterday;

    main(yesterday, currentRange, currentChartType);

    datePicker.addEventListener("change", (event) => {
        const selectedDate = event.target.valueAsDate;
        if(selectedDate) {
            main(selectedDate, currentRange, currentChartType);
        }
    });

    yesterdayBtn.addEventListener('click', () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        datePicker.valueAsDate = yesterday;
        main(yesterday, currentRange, currentChartType);
    });

    prevDayBtn.addEventListener('click', () => {
        const currentDate = datePicker.valueAsDate;
        currentDate.setDate(currentDate.getDate() - 1);
        datePicker.valueAsDate = currentDate;
        main(currentDate, currentRange, currentChartType);
    });

    nextDayBtn.addEventListener('click', () => {
        const currentDate = datePicker.valueAsDate;
        currentDate.setDate(currentDate.getDate() + 1);
        datePicker.valueAsDate = currentDate;
        main(currentDate, currentRange, currentChartType);
    });

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentRange = tab.dataset.range;
            const selectedDate = datePicker.valueAsDate;
            main(selectedDate, currentRange, currentChartType);
        });
    });

    chartTypeButtons.forEach(button => {
        button.addEventListener('click', () => {
            chartTypeButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            currentChartType = button.dataset.charttype;
            const selectedDate = datePicker.valueAsDate;
            main(selectedDate, currentRange, currentChartType);
        });
    });

    excludeCommonEl.addEventListener('change', () => {
        const selectedDate = datePicker.valueAsDate;
        main(selectedDate, currentRange, currentChartType);
    });
});
