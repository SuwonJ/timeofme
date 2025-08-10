const BACKUP_DIR = "backups/";

async function fetchBackupFiles() {
  const repo = "SuwonJ/timeofme";
  const api = `https://api.github.com/repos/${repo}/contents/${BACKUP_DIR}`;
  const res = await fetch(api);
  if (!res.ok) throw new Error("Couldn't load backup list");
  const files = await res.json();
  return files
    .filter((f) => f.name.endsWith(".json"))
    .sort((a, b) => b.name.localeCompare(a.name));
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

function isToday(unix) {
  const d = new Date(unix * 1000);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
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
      <small style="color:#888">(showing only today's data below)</small>
    `;

    let intervals = Array.isArray(backup.intervals) ? backup.intervals : [];
    intervals = intervals.filter((i) => isToday(i.start));
    const totalSeconds = intervals.reduce(
      (sum, i) => sum + (i.end - i.start),
      0,
    );

    let tasks = Array.isArray(backup.tasks) ? backup.tasks : [];
    const today = new Date();
    const todayYMD = today.toISOString().slice(0, 10);
    const todayTasks = tasks.filter((t) => {
      if (typeof t.date === "string") return t.date.startsWith(todayYMD);
      if (typeof t.due === "string") return t.due.startsWith(todayYMD);
      return false;
    });

    let activities = Array.isArray(backup.activities) ? backup.activities : [];

    detailsEl.innerHTML = `
      <h2>Summary</h2>
      <ul>
        <li><b>Intervals tracked today:</b> ${intervals.length}</li>
        <li><b>Total time tracked:</b> ${formatHms(totalSeconds)}</li>
        <li><b>Tasks scheduled for today:</b> ${todayTasks.length}</li>
        <li><b>Activities:</b> ${activities.length}</li>
      </ul>
      <h2>Today's Intervals</h2>
      <ul>
        ${intervals
          .map(
            (i) => `
          <li>
            <b>${new Date(i.start * 1000).toLocaleTimeString()} - ${new Date(i.end * 1000).toLocaleTimeString()}</b>
            (${formatHms(i.end - i.start)})
            <br>
            ${i.title ? i.title : ""}
          </li>
        `,
          )
          .join("")}
      </ul>
      <h2>Today's Tasks</h2>
      <ul>
        ${todayTasks.map((t) => `<li>${t.title || t.name || "Untitled Task"}</li>`).join("")}
      </ul>
    `;
  } catch (err) {
    summaryEl.innerHTML = `<b>Error:</b> ${err.message}`;
    detailsEl.innerHTML = "";
  }
}

main();
