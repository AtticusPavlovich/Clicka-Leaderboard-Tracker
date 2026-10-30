const sheetUrl = 'https://api.sheety.co/3e582a60064b005f865329acf6dec902/clickaLeaderboardTracker/dailyBoard';

const formatNumber = (value, digits = 0) => {
  if (!Number.isFinite(value)) {
    return '0';
  }

  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

const toNumber = (value) => {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const cleaned = String(value).replace(/[^0-9.-]/g, '');

  if (!cleaned) {
    return 0;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeKey = (value = '') => String(value).trim().toLowerCase().replace(/[^a-z0-9]/g, '');

const parseSortableDate = (value) => {
  if (value === null || value === undefined || value === '') return Number.MAX_SAFE_INTEGER;
  if (typeof value === 'number') return value;

  const trimmedValue = String(value).trim();

  if (/^\d+(\.\d+)?$/.test(trimmedValue)) {
    return Number(trimmedValue);
  }

  const dateValue = new Date(trimmedValue);
  if (!Number.isNaN(dateValue.getTime())) return dateValue.getTime();

  const monthDayMatch = trimmedValue.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (monthDayMatch) {
    const [, month, day, year = new Date().getFullYear()] = monthDayMatch;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    if (!Number.isNaN(parsed.getTime())) return parsed.getTime();
  }

  return Number.MAX_SAFE_INTEGER;
};

const getDateLabelFromColumn = (columnName) => {
  const match = String(columnName || '').match(/^(?:player|clicks)\s*(.*)$/i);
  return match ? String(match[1]).trim() : '';
};

const matchesDayColumn = (columnName, dateLabel) => {
  const normalizedDate = String(dateLabel || '').trim().toLowerCase();
  const normalizedColumn = String(columnName || '').trim().toLowerCase();
  return normalizedColumn.includes(normalizedDate);
};

const findRowsFromJson = (json) => {
  if (!json) return [];
  if (Array.isArray(json)) return json;

  const values = Object.values(json);
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }

  return [];
};

const normalizeRows = (rows) => {
  const entries = [];

  rows.forEach((row, rowIndex) => {
    const keys = Object.keys(row);
    const positionKey = keys.find((key) => /^(position|rank|leaderboard|place)$/i.test(key));

    const positionValue = positionKey ? toNumber(row[positionKey]) : rowIndex + 1;

    keys.forEach((key) => {
      const normalizedKey = normalizeKey(key);
      if (!normalizedKey.startsWith('player')) return;

      const dateLabel = getDateLabelFromColumn(key);
      if (!dateLabel) return;

      const clicksKey = keys.find((possibleKey) => /^clicks/i.test(possibleKey) && matchesDayColumn(possibleKey, dateLabel));
      const playerValue = row[key];
      const clicksValue = clicksKey ? toNumber(row[clicksKey]) : 0;

      if (String(playerValue || '').trim() && clicksValue > 0) {
        entries.push({
          player: String(playerValue).trim(),
          date: dateLabel,
          clicks: clicksValue,
          position: Number(positionValue) || rowIndex + 1,
        });
      }
    });

    const genericPlayerKey = keys.find((key) => /^player$/i.test(key));
    const genericClicksKey = keys.find((key) => /^clicks$/i.test(key));

    if (genericPlayerKey && genericClicksKey) {
      const playerValue = row[genericPlayerKey];
      const clicksValue = toNumber(row[genericClicksKey]);

      if (String(playerValue || '').trim() && clicksValue > 0) {
        entries.push({
          player: String(playerValue).trim(),
          date: 'Latest',
          clicks: clicksValue,
          position: Number(positionValue) || rowIndex + 1,
        });
      }
    }
  });

  return entries
    .sort((a, b) => Number(a.position) - Number(b.position) || a.player.localeCompare(b.player));
};

const filterLatestRows = (rows) => {
  const latestByPlayer = new Map();

  rows.forEach((entry) => {
    const existing = latestByPlayer.get(entry.player);

    if (!existing || parseSortableDate(entry.date) > parseSortableDate(existing.date)) {
      latestByPlayer.set(entry.player, entry);
    }
  });

  return [...latestByPlayer.values()].sort((a, b) => Number(b.clicks) - Number(a.clicks));
};

const buildTrendData = (rows) => {
  const sorted = getPlayerDailyClickMetrics(rows)
    .filter((entry) => entry.dailyClicks > 0)
    .sort((a, b) => b.dailyClicks - a.dailyClicks)
    .slice(0, 8);

  return {
    labels: sorted.map((item) => item.player),
    datasets: [{
      label: 'Daily click increase',
      data: sorted.map((item) => Math.round(item.dailyClicks)),
      backgroundColor: ['#8b5cf6', '#f6c453', '#3dd598', '#4da3ff', '#f472b6', '#22d3ee', '#f97316', '#10b981'],
      borderRadius: 8,
    }],
  };
};

const buildGrowthData = (rows) => {
  const sorted = getPlayerDailyClickMetrics(rows)
    .filter((item) => item.averageDailyClicks > 0)
    .sort((a, b) => b.averageDailyClicks - a.averageDailyClicks)
    .slice(0, 8);

  return {
    labels: sorted.map((item) => item.player),
    datasets: [{
      label: 'Avg daily increase',
      data: sorted.map((item) => Math.round(item.averageDailyClicks)),
      backgroundColor: ['#4da3ff', '#f472b6', '#22d3ee', '#f97316', '#10b981'],
      borderRadius: 8,
    }],
  };
};

const getPlayerDailyClickMetrics = (rows) => {
  const playerMap = new Map();

  rows
    .filter((entry) => entry.date && entry.date !== 'Latest' && entry.clicks > 0)
    .forEach((entry) => {
      if (!playerMap.has(entry.player)) {
        playerMap.set(entry.player, []);
      }

      playerMap.get(entry.player).push({ date: entry.date, clicks: entry.clicks });
    });

  return [...playerMap.entries()].map(([player, values]) => {
    const sortedValues = values
      .slice()
      .sort((a, b) => parseSortableDate(a.date) - parseSortableDate(b.date));
    const deltas = sortedValues.slice(1).map((value, index) => value.clicks - sortedValues[index].clicks);

    return {
      player,
      dailyClicks: deltas.length ? deltas[deltas.length - 1] : 0,
      averageDailyClicks: deltas.length
        ? deltas.reduce((total, value) => total + value, 0) / deltas.length
        : 0,
    };
  });
};

const getPositionDelta = (player, rows, previousRows) => {
  const currentIndex = rows.findIndex((row) => row.player === player);
  const previousRow = previousRows.find((row) => row.player === player);

  if (currentIndex === -1 || !previousRow) {
    return { label: 'new', className: 'move-new' };
  }

  const previousIndex = previousRows.findIndex((row) => row.player === player);
  const delta = previousIndex - currentIndex;

  if (delta > 0) return { label: `▲ ${delta}`, className: 'move-up' };
  if (delta < 0) return { label: `▼ ${Math.abs(delta)}`, className: 'move-down' };
  return { label: '•', className: 'move-same' };
};

let activeLeaderboardView = 'total';

const renderLeaderboard = (rows) => {
  const tableBody = document.getElementById('leaderboard-body');
  if (!tableBody) return;

  const allRows = Array.isArray(window.__clickaAllRows) ? window.__clickaAllRows : rows;
  const metricKey = activeLeaderboardView === 'average'
    ? 'averageDailyClicks'
    : activeLeaderboardView === 'total' ? 'totalClicks' : 'dailyClicks';
  const metricLabel = activeLeaderboardView === 'average'
    ? 'Average Daily Clicks'
    : activeLeaderboardView === 'total' ? 'Total Clicks' : 'Daily Clicks';
  const previousKey = `leaderboard-previous-${activeLeaderboardView}`;
  const previousRows = JSON.parse(sessionStorage.getItem(previousKey) || '[]');
  const metricsByPlayer = new Map(
    getPlayerDailyClickMetrics(allRows).map((entry) => [entry.player, entry])
  );
  filterLatestRows(allRows).forEach((entry) => {
    const metrics = metricsByPlayer.get(entry.player) || { player: entry.player };
    metricsByPlayer.set(entry.player, { ...metrics, totalClicks: entry.clicks });
  });
  const sortedRows = [...new Set(allRows.map((entry) => entry.player))]
    .map((player) => ({ player, [metricKey]: metricsByPlayer.get(player)?.[metricKey] || 0 }))
    .sort((a, b) => b[metricKey] - a[metricKey] || a.player.localeCompare(b.player));
  const metricHeading = document.getElementById('leaderboard-metric-heading');
  if (metricHeading) metricHeading.textContent = metricLabel;

  tableBody.innerHTML = sortedRows.length
    ? sortedRows
        .map((row, index) => {
          const delta = getPositionDelta(row.player, sortedRows, previousRows);
          const value = row[metricKey];

          return `
            <tr>
              <td>${index + 1}</td>
              <td>${row.player}</td>
              <td>${formatNumber(value, activeLeaderboardView === 'average' ? 1 : 0)}</td>
              <td><span class="move-badge ${delta.className}">${delta.label}</span></td>
            </tr>
          `;
        })
        .join('')
    : '<tr><td colspan="4" class="empty-state">No leaderboard data yet.</td></tr>';

  sessionStorage.setItem(previousKey, JSON.stringify(sortedRows));
};

const initializeLeaderboardTabs = () => {
  document.querySelectorAll('[data-leaderboard-view]').forEach((tab) => {
    tab.addEventListener('click', () => {
      activeLeaderboardView = ['daily', 'average', 'total'].includes(tab.dataset.leaderboardView)
        ? tab.dataset.leaderboardView
        : 'daily';

      document.querySelectorAll('[data-leaderboard-view]').forEach((otherTab) => {
        const isActive = otherTab === tab;
        otherTab.classList.toggle('is-active', isActive);
        otherTab.setAttribute('aria-selected', String(isActive));
      });

      const panel = document.getElementById('leaderboard-panel');
      if (panel) panel.setAttribute('aria-labelledby', tab.id);
      renderLeaderboard(window.__clickaAllRows || []);
    });
  });
};

const updateSummaryCards = (rows) => {
  const latestRows = filterLatestRows(rows);
  const leader = [...latestRows].sort((a, b) => b.clicks - a.clicks)[0];
  const totalClicks = latestRows.reduce((total, row) => total + row.clicks, 0);
  const highestTotal = latestRows.length ? Math.max(...latestRows.map((row) => row.clicks)) : 0;

  const playerDailyGains = new Map();
  rows
    .filter((entry) => entry.date && entry.date !== 'Latest' && entry.clicks > 0)
    .forEach((entry) => {
      if (!playerDailyGains.has(entry.player)) {
        playerDailyGains.set(entry.player, []);
      }

      playerDailyGains.get(entry.player).push({ date: entry.date, clicks: entry.clicks });
    });

  const bestJump = [...playerDailyGains.entries()].reduce((maxValue, [, values]) => {
    const sortedValues = values.slice().sort((a, b) => parseSortableDate(a.date) - parseSortableDate(b.date));
    if (sortedValues.length < 2) return maxValue;

    const delta = sortedValues[sortedValues.length - 1].clicks - sortedValues[sortedValues.length - 2].clicks;
    return Math.max(maxValue, delta);
  }, 0);

  document.getElementById('total-clicks').textContent = formatNumber(totalClicks, 0);
  document.getElementById('highest-total').textContent = formatNumber(highestTotal, 0);
  document.getElementById('best-jump').textContent = formatNumber(bestJump, 0);
  document.getElementById('leader-name').textContent = leader ? leader.player : '-';
};

const getChartThemeValues = () => {
  const styles = getComputedStyle(document.documentElement);
  const accent = (styles.getPropertyValue('--accent') || '#111111').trim();
  const muted = (styles.getPropertyValue('--muted') || '#64748b').trim();
  const border = (styles.getPropertyValue('--border') || 'rgba(148, 163, 184, 0.2)').trim();

  const accentHex = accent.startsWith('#') ? accent : '#111111';
  const barColors = Array.from({ length: 8 }, (_, index) => {
    const alpha = ['cc', 'b3', '99', '80', '66', '4d', '33', '1a'][index % 8];
    return `${accentHex}${alpha}`;
  });

  return {
    accent,
    muted,
    border,
    barColors,
  };
};

const renderCharts = (rows) => {
  if (typeof Chart === 'undefined') return;

  const themeValues = getChartThemeValues();
  const trendData = buildTrendData(rows);
  const growthData = buildGrowthData(rows);

  if (window.clicksChart) window.clicksChart.destroy();
  if (window.growthChart) window.growthChart.destroy();

  const clickCtx = document.getElementById('clicks-chart');
  const growthCtx = document.getElementById('growth-chart');

  if (clickCtx) {
    window.clicksChart = new Chart(clickCtx, {
      type: 'bar',
      data: {
        labels: trendData.labels,
        datasets: trendData.datasets.slice(0, 8).map((dataset, index) => ({
          ...dataset,
          borderColor: themeValues.accent,
          backgroundColor: themeValues.barColors[index] || themeValues.accent,
          borderRadius: 6,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: { ticks: { color: themeValues.muted }, grid: { display: false } },
          y: { ticks: { color: themeValues.muted }, grid: { color: themeValues.border } },
        },
      },
    });
  }

  if (growthCtx) {
    window.growthChart = new Chart(growthCtx, {
      type: 'bar',
      data: {
        ...growthData,
        datasets: growthData.datasets.map((dataset, index) => ({
          ...dataset,
          borderColor: themeValues.accent,
          backgroundColor: themeValues.barColors[index] || themeValues.accent,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: { ticks: { color: themeValues.muted }, grid: { display: false } },
          y: { ticks: { color: themeValues.muted }, grid: { color: themeValues.border } },
        },
      },
    });
  }
};

const applyTheme = (themeName) => {
  const root = document.documentElement;
  const validThemes = ['midnight', 'blue', 'mint', 'beige', 'grayscale', 'mono'];
  const nextTheme = validThemes.includes(themeName) ? themeName : 'midnight';
  const themeSelect = document.getElementById('theme-select');

  root.setAttribute('data-theme', nextTheme);
  localStorage.setItem('clicka-theme', nextTheme);

  if (themeSelect) {
    themeSelect.value = nextTheme;
  }

  if (window.__clickaLatestRows) {
    renderCharts(window.__clickaLatestRows);
  }
};

const initializeTheme = () => {
  const savedTheme = localStorage.getItem('clicka-theme') || 'midnight';
  const themeSelect = document.getElementById('theme-select');

  applyTheme(savedTheme);

  if (themeSelect) {
    themeSelect.addEventListener('change', (event) => applyTheme(event.target.value));
  }
};

const fetchLeaderboard = async () => {
  try {
    const response = await fetch(sheetUrl);

    if (!response.ok) {
      console.error(`Failed to load leaderboard sheet: ${response.status} ${response.statusText}`);
      return;
    }

    const json = await response.json();
    const data = findRowsFromJson(json);

    if (!data.length) {
      console.warn('No rows were returned from the Daily_Board sheet.');
      return;
    }

    const rows = normalizeRows(data);
    const latestRows = filterLatestRows(rows);

    window.__clickaAllRows = rows;
    window.__clickaLatestRows = rows;
    renderLeaderboard(latestRows);
    updateSummaryCards(rows);
    renderCharts(rows);

    const timestamp = new Date();
    const updatedEl = document.getElementById('last-updated');
    if (updatedEl) {
      updatedEl.textContent = `Updated ${timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    }

    console.log('Latest leaderboard rows:', rows);
  } catch (error) {
    console.error('Failed to fetch the Daily_Board leaderboard:', error);
  }
};

initializeTheme();
initializeLeaderboardTabs();
fetchLeaderboard();