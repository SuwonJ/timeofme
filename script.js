let chartInstance = null;
let currentRange = 'daily';
let currentChartType = 'bar';

Chart.register(ChartDataLabels);

async function fetchLogFile() {
  const res = await fetch("./backups/log.json");
  if (!res.ok) throw new Error(`Failed to fetch log.json: ${res.statusText}`);
  return await res.json();
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
  const summaryEl = document.getElementById("summary");
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

    summaryEl.innerHTML = `
      <b>Displaying data for:</b> ${range.start.toLocaleDateString()} - ${range.end.toLocaleDateString()}
    `;

    const activities = Array.isArray(backup.activities)
      ? backup.activities
      : [];
    const activityMap = new Map(
      activities.map((a) => [a[0], { name: a[1], color: a[5], icon: a[6] }]),
    );

    const sleepActivity = activities.find((a) => a[1].includes("Sleep"));
    const sleepActivityId = sleepActivity ? sleepActivity[0] : null;

    let rawIntervals = (
      Array.isArray(backup.intervals) ? backup.intervals : []
    ).reverse();
    let intervals = [];
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

    const rangeIntervals = intervals.filter(i => {
        const intervalDate = new Date(i.start * 1000);
        return intervalDate >= range.start && intervalDate <= range.end;
    });
    
    const restSeconds = rangeIntervals
      .filter((i) => i.title && i.title.includes("Break"))
      .reduce((sum, i) => sum + i.duration, 0);

    const sleepIntervals = rangeIntervals.filter((i) => i.activityId === sleepActivityId);
    const sleepSeconds = sleepIntervals.reduce((sum, i) => sum + i.duration, 0);

    // Dashboard
    dashboardEl.innerHTML = `
      <div class="stat-card">
        <h3>Rest Time</h3>
        <p>${formatHms(restSeconds)}</p>
      </div>
      <div class="stat-card">
        <h3>Sleep Time</h3>
        <p>${formatHms(sleepSeconds)}</p>
      </div>
      <div class="stat-card">
        <h3>Intervals</h3>
        <p>${rangeIntervals.length}</p>
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
                backgroundColor: `rgba(${activities.find(a => a[1] === name)[5]})` || '#ccc',
                icons: [activityMap.get(activities.find(a => a[1] === name)[0]).icon]
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
                (name) =>
                `rgba(${
                    activities.find((a) => a[1] === name)[5]
                })` || "#ccc",
            ),
            icons: [...activityDurations.keys()].map(name => activityMap.get(activities.find(a => a[1] === name)[0]).icon)
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
          },
          title: {
            display: true,
            text: "Activity Duration (in hours) for ${range.start.toLocaleDateString()} - ${range.end.toLocaleDateString()}",
          },
          datalabels: {
            anchor: 'end',
            align: 'end',
            formatter: function(value, context) {
              return context.dataset.icons[context.dataIndex];
            },
            font: {
                size: 16
            },
            offset: 8
          }
        },
      },
    });

    // Details
    if (timeRange === 'daily') {
        detailsEl.style.display = 'block';
        detailsEl.innerHTML = `
        <h2 class="text-2xl font-bold mt-6 mb-4 text-gray-800">Timeline for ${targetDate.toLocaleDateString()}</h2>
        <ul class="interval-list">
        ${rangeIntervals
            .map((i, idx, arr) => {
            const activity = activityMap.get(i.activityId);
            const activityName = activity ? activity.name : "Unknown";
            const activityIcon = activity ? activity.icon : "💡";
            const activityColor = activity ? `rgba(${activity.color})` : "#ccc";

            if (i.duration < 300) {
                return `
                    <li class="line-item">
                        <div class="time-label">
                            ${new Date(i.start * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        </div>
                        <div class="timeline-line" style="background-color: ${activityColor};"></div>
                        <div class="activity-details">
                            <div class="activity-name">${ i.title ? i.title.replace(/\s*#{1,2}[\w_]+/g, "").trim() : activityName}</div>
                            <div class="duration-info"><small>Tracked: ${formatHms(i.duration)}</small></div>
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
                    ${new Date(i.start * 1000).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                    })}
                </div>
                <div class="timeline-visual">
                    <div class="timeline-blob ${blobClass}" style="border-color: ${activityColor}; height: ${
                    isShort ? 45 : 45 + (i.duration / 60) * 0.2
                    }px;">
                    <span class="activity-icon">${activityIcon}</span>
                    </div>
                    ${showPath ? '<div class="timeline-path"></div>' : ""}
                </div>
                <div class="activity-details">
                    <div class="activity-name">${
                    i.title
                        ? i.title
                            .replace(/\s*#{1,2}[\w_]+/g, "")
                            .trim()
                            .replace(/\s*#{1,2}[\w_]+/g, "")
                            .trim()
                            .replace(/\s*#{1,2}[\w_]+/g, "")
                            .trim()
                        : activityName
                    }</div>
                    <div class="duration-info">
                    <small>Tracked: ${formatHms(
                        i.duration,
                    )} | Set: ${formatHms(i.settedDuration)}</small>
                    </div>
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

    // Tasks
    const tasks = Array.isArray(backup.tasks) ? backup.tasks : [];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayYMD = yesterday.toISOString().slice(0, 10);
    const remainingTasks = tasks.filter((t) => {
      if (typeof t.date === "string") return t.date.startsWith(yesterdayYMD);
      if (typeof t.due === "string") return t.due.startsWith(yesterdayYMD);
      return false;
    });

    tasksSectionEl.innerHTML = `
        <h2 class="text-2xl font-bold mt-8 mb-4 text-gray-800">Left Tasks</h2>
        <ul class="task-list">
            ${remainingTasks
            .map((t) => {
                const raw = t[1] || "Untitled Task";
                const cleaned = raw
                .replace(/\s*#{1,2}[\w_]+/g, "")
                .trim();
                return `<li>${cleaned}</li>`;
            })
            .join("")}
        </ul>
    `;

  } catch (err) {
    summaryEl.innerHTML = `<b class="text-red-500">Error:</b> ${err.message}`;
    detailsEl.innerHTML = "";
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