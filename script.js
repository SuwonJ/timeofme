const BACKUP_DIR = "backups/";

/**
 * Fetches a list of backup files from a GitHub repository, with a 24-hour cache.
 * The cache is stored in localStorage to avoid hitting API rate limits on every page load.
 */
async function fetchBackupFiles() {
  const repo = "SuwonJ/timeofme";
  const api = `https://api.github.com/repos/${repo}/contents/${BACKUP_DIR}`;

  // Caching configuration
  const CACHE_KEY = "backupFilesCache";
  const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  // 1. Try to get cached data from localStorage
  const cachedData = localStorage.getItem(CACHE_KEY);
  if (cachedData) {
    try {
      const { files, timestamp } = JSON.parse(cachedData);
      const now = new Date().getTime();

      // 2. Check if the cache is still valid
      if (now - timestamp < CACHE_EXPIRY_MS) {
        console.log("Using cached backup file list.");
        return files;
      } else {
        console.log("Cached data is stale. Attempting to fetch new list...");
      }
    } catch (e) {
      console.error("Failed to parse cached data.", e);
      // Continue to fetch new data if cache is corrupt
    }
  }

  // 3. If cache is invalid or doesn't exist, make the API call
  try {
    const res = await fetch(api);
    if (!res.ok) {
      throw new Error(`Couldn't load backup list: ${res.statusText}`);
    }
    const files = await res.json();

    // Filter and sort the files as before
    const filteredFiles = files
      .filter((f) => f.name.endsWith(".json"))
      .sort((a, b) => b.name.localeCompare(a.name));

    // 4. Cache the new data with a timestamp
    const newCache = {
      files: filteredFiles,
      timestamp: new Date().getTime(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(newCache));
    console.log("Successfully fetched and cached new backup file list.");

    return filteredFiles;
  } catch (error) {
    console.error(
      "Failed to fetch new data. Trying to use stale cache if available.",
    );
    // If the network fails, but we have stale data, use that instead of showing an error.
    if (cachedData) {
      const { files } = JSON.parse(cachedData);
      return files;
    }
    throw error; // Re-throw if no data is available at all.
  }
}

async function fetchBackupJson(file) {
  const res = await fetch(file.download_url);
  if (!res.ok) throw new Error(`Failed to fetch backup: ${file.name}`);
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

function isYesterday(unix) {
  const d = new Date(unix * 1000);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  );
}

async function main() {
  const summaryEl = document.getElementById("summary");
  const detailsEl = document.getElementById("details");

  try {
    const files = await fetchBackupFiles();
    if (files.length === 0) {
      summaryEl.innerHTML = "<b>No backup files found.</b>";
      return;
    }
    const latest = files[0];
    const backup = await fetchBackupJson(latest);

    summaryEl.innerHTML = `
                    <b>Backup:</b> ${latest.name} <br>
                    <b>Created:</b> ${new Date(backup.time * 1000).toLocaleString()} <br>
                `;

    let activities = Array.isArray(backup.activities) ? backup.activities : [];
    const activityMap = new Map(
      activities.map((a) => [a[0], { name: a[1], color: a[5], icon: a[6] }]),
    );

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

    const yesterdayIntervals = intervals.filter((i) => isYesterday(i.start));
    const totalSeconds = yesterdayIntervals.reduce(
      (sum, i) => sum + i.duration,
      0,
    );

    let tasks = Array.isArray(backup.tasks) ? backup.tasks : [];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayYMD = yesterday.toISOString().slice(0, 10);
    const yesterdayTasks = tasks.filter((t) => {
      if (typeof t.date === "string") return t.date.startsWith(yesterdayYMD);
      if (typeof t.due === "string") return t.due.startsWith(yesterdayYMD);
      return false;
    });

    detailsEl.innerHTML = `
                    <h2 class="text-2xl font-bold mt-6 mb-4 text-gray-800">Summary</h2>
                    <ul class="list-none p-0 mb-6">
                        <li class="bg-gray-50 p-3 rounded-md mb-2 flex justify-between items-center shadow-sm">
                            <span class="font-medium text-gray-700">Intervals tracked yesterday:</span>
                            <span class="text-indigo-600 font-bold">${yesterdayIntervals.length}</span>
                        </li>
                        <li class="bg-gray-50 p-3 rounded-md mb-2 flex justify-between items-center shadow-sm">
                            <span class="font-medium text-gray-700">Tasks left from yesterday:</span>
                            <span class="text-indigo-600 font-bold">${yesterdayTasks.length}</span>
                        </li>
                    </ul>

                    <h2 class="text-2xl font-bold mb-4 text-gray-800">Yesterday's Timeline</h2>
                    <ul class="interval-list">
                    ${yesterdayIntervals
                      .map((i, idx, arr) => {
                        const activity = activityMap.get(i.activityId);
                        const activityName = activity
                          ? activity.name
                          : "Unknown";
                        const activityIcon = activity ? activity.icon : "💡";
                        const activityColor = activity
                          ? `rgba(${activity.color})`
                          : "#ccc";

                        const isShort = i.duration < 600;
                        let blobClass = isShort ? "blob-circle" : "blob-pill";
                        if (!isShort) {
                          if (idx === 0) blobClass += " first";
                          else if (idx === arr.length - 1) blobClass += " last";
                        }

                        // Only show timeline-path if not the last interval
                        const showPath = idx !== arr.length - 1;

                        return `
                          <li>
                            <div class="time-label">
                              ${new Date(i.start * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                            </div>
                            <div class="timeline-visual">
                              <div class="timeline-blob ${blobClass}" style="border-color: ${activityColor}; height: ${isShort ? 45 : 45 + (i.duration / 60) * 0.2}px;">
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
                                <small>Tracked: ${formatHms(i.duration)} | Set: ${formatHms(i.settedDuration)}</small>
                              </div>
                            </div>
                          </li>
                        `;
                      })
                      .join("")}

                    </ul>

                    <h2 class="text-2xl font-bold mt-8 mb-4 text-gray-800">Left Tasks</h2>
                    <ul class="task-list">
                      ${tasks
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

main();
