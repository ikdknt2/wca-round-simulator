class Rule {
  static formats = {
    'Best of 1': { attempts: 1, type: 'best' },
    'Best of 2': { attempts: 2, type: 'best' },
    'Best of 3': { attempts: 3, type: 'best' },
    'Mean of 3': { attempts: 3, type: 'mean' },
    'Average of 5': { attempts: 5, type: 'average' },
    'Best of 2 / Average of 5': { attempts: 5, type: 'average', cutoffAttempts: 2 },
    'Best of 3 / Mean of 3': { attempts: 3, type: 'mean', cutoffAttempts: 3 },
  };

  constructor(formatName) {
    this.formatName = formatName;
    this.format = Rule.formats[formatName] ?? Rule.formats['Average of 5'];
  }

  getAttemptCount() {
    return this.format.attempts;
  }

  getResultType() {
    return this.format.type;
  }

  getEffectiveTime(attempt) {
    if (!attempt || attempt.penalty === 'DNF') {
      return Infinity;
    }

    return attempt.timeMs + (attempt.penalty === '+2' ? 2000 : 0);
  }

  calculate(attempts) {
    const effectiveTimes = attempts.map((attempt) => this.getEffectiveTime(attempt));

    return {
      mean: this.calculateMean(effectiveTimes),
      average: this.calculateAverage(effectiveTimes),
      best: this.calculateBest(effectiveTimes),
      worst: this.calculateWorst(effectiveTimes),
      result: this.calculateResult(effectiveTimes),
    };
  }

  calculateResult(effectiveTimes) {
    if (this.format.type === 'mean') {
      return this.calculateMean(effectiveTimes);
    }

    if (this.format.type === 'average') {
      return this.calculateAverage(effectiveTimes);
    }

    return this.calculateBest(effectiveTimes);
  }

  calculateMean(effectiveTimes) {
    if (effectiveTimes.length === 0 || effectiveTimes.includes(Infinity)) {
      return null;
    }

    return Math.round(effectiveTimes.reduce((sum, time) => sum + time, 0) / effectiveTimes.length);
  }

  calculateAverage(effectiveTimes) {
    if (effectiveTimes.length < 3) {
      return null;
    }

    const sortedTimes = [...effectiveTimes].sort((a, b) => a - b);
    const middleTimes = sortedTimes.slice(1, -1);

    if (middleTimes.includes(Infinity)) {
      return Infinity;
    }

    return Math.round(middleTimes.reduce((sum, time) => sum + time, 0) / middleTimes.length);
  }

  calculateBest(effectiveTimes) {
    if (effectiveTimes.length === 0) {
      return null;
    }

    return Math.min(...effectiveTimes);
  }

  calculateWorst(effectiveTimes) {
    if (effectiveTimes.length === 0) {
      return null;
    }

    return Math.max(...effectiveTimes);
  }
}

const attempts = [];

const attemptDialog = document.querySelector('#attempt-dialog');
const attemptForm = document.querySelector('#attempt-form');
const attemptList = document.querySelector('#attempt-list');
const emptyAttempts = document.querySelector('#empty-attempts');
const formError = document.querySelector('#form-error');
const formatSelect = document.querySelector('#format-select');
const formatSummary = document.querySelector('#format-summary');
const attemptProgress = document.querySelector('#attempt-progress');
const resultType = document.querySelector('#result-type');
const meanValue = document.querySelector('#mean-value');
const averageValue = document.querySelector('#average-value');
const bestValue = document.querySelector('#best-value');
const worstValue = document.querySelector('#worst-value');
const openDialogButton = document.querySelector('#open-attempt-dialog');
const closeDialogButton = document.querySelector('#close-attempt-dialog');
const cancelAttemptButton = document.querySelector('#cancel-attempt');

const timeLimitEnabled = document.querySelector('#time-limit-enabled');
const timeLimitInput = document.querySelector('#time-limit-input');
const timeLimitSummary = document.querySelector('#time-limit-summary');
const timeLimitCaption = document.querySelector('#time-limit-caption');
const practiceMode = document.querySelector('#practice-mode');
const remainingTime = document.querySelector('#remaining-time');
const remainingTimeBar = document.querySelector('#remaining-time-bar');
const timeLimitModeText = document.querySelector('#time-limit-mode-text');

const timePattern = /^(?:(\d{1,2}):)?(\d{1,2})(?:\.(\d{1,3}))?$/;

let currentRule = new Rule(formatSelect.value);
let timeLimitTimer = null;
let timeLimitDeadline = null;

function parseTimeToMilliseconds(timeText) {
  const normalizedTime = timeText.trim();
  const match = normalizedTime.match(timePattern);

  if (!match) {
    return null;
  }

  const minutes = Number(match[1] ?? 0);
  const seconds = Number(match[2]);
  const fractionText = match[3] ?? '';

  if (seconds >= 60 && match[1]) {
    return null;
  }

  const milliseconds = Number(fractionText.padEnd(3, '0')) || 0;

  return (minutes * 60 * 1000) + (seconds * 1000) + milliseconds;
}

function formatMilliseconds(value) {
  if (value === null) {
    return '—';
  }

  if (value === Infinity) {
    return 'DNF';
  }

  const minutes = Math.floor(value / 60000);
  const seconds = Math.floor((value % 60000) / 1000);
  const centiseconds = Math.floor((value % 1000) / 10);
  const secondsText = minutes > 0 ? String(seconds).padStart(2, '0') : String(seconds);

  return `${minutes > 0 ? `${minutes}:` : ''}${secondsText}.${String(centiseconds).padStart(2, '0')}`;
}


function getTimeLimitMilliseconds() {
  if (!timeLimitEnabled.checked) {
    return null;
  }

  return parseTimeToMilliseconds(timeLimitInput.value);
}

function getTimeLimitText() {
  const limitMs = getTimeLimitMilliseconds();
  return limitMs === null ? 'OFF' : formatMilliseconds(limitMs);
}

function getBarClassName(percentRemaining) {
  if (percentRemaining < 20) {
    return 'danger';
  }

  if (percentRemaining < 50) {
    return 'warning';
  }

  return '';
}

function updateTimeLimitSummary() {
  const limitMs = getTimeLimitMilliseconds();
  const isCompetitionMode = !practiceMode.checked;

  timeLimitSummary.textContent = getTimeLimitText();
  timeLimitCaption.textContent = limitMs === null
    ? 'Time Limit OFF'
    : `${isCompetitionMode ? 'Competition' : 'Practice'} Mode`;
  timeLimitModeText.textContent = isCompetitionMode
    ? 'Competition Mode: 超過時はDNFで保存されます。'
    : 'Practice Mode: 超過時も保存し、Warningを表示します。';

  updateRemainingTime(limitMs, limitMs);
}

function updateRemainingTime(remainingMs, limitMs) {
  const safeLimitMs = limitMs ?? 0;
  const safeRemainingMs = Math.max(remainingMs ?? 0, 0);
  const percentRemaining = safeLimitMs > 0 ? (safeRemainingMs / safeLimitMs) * 100 : 0;

  remainingTime.textContent = safeLimitMs > 0 ? formatMilliseconds(safeRemainingMs) : 'OFF';
  remainingTimeBar.style.width = `${Math.max(0, Math.min(100, percentRemaining))}%`;
  remainingTimeBar.className = getBarClassName(percentRemaining);
}

function stopTimeLimitCountdown() {
  if (timeLimitTimer !== null) {
    clearInterval(timeLimitTimer);
    timeLimitTimer = null;
  }

  timeLimitDeadline = null;
}

function startTimeLimitCountdown() {
  stopTimeLimitCountdown();

  const limitMs = getTimeLimitMilliseconds();
  if (limitMs === null) {
    updateRemainingTime(null, null);
    return;
  }

  timeLimitDeadline = Date.now() + limitMs;
  updateRemainingTime(limitMs, limitMs);

  timeLimitTimer = setInterval(() => {
    const remainingMs = timeLimitDeadline - Date.now();
    updateRemainingTime(remainingMs, limitMs);

    if (remainingMs <= 0) {
      saveAutomaticDnf(limitMs);
    }
  }, 100);
}

function saveAutomaticDnf(limitMs) {
  stopTimeLimitCountdown();

  if (!attemptDialog.open) {
    return;
  }

  attempts.push({
    timeText: formatMilliseconds(limitMs),
    timeMs: limitMs,
    penalty: 'DNF',
    comment: 'Time Limit exceeded: auto DNF',
    warning: '',
  });

  renderAttempts();
  closeAttemptDialog();
}

function applyTimeLimitToAttempt(attempt) {
  const limitMs = getTimeLimitMilliseconds();

  if (limitMs === null || attempt.timeMs <= limitMs) {
    return attempt;
  }

  if (practiceMode.checked) {
    return {
      ...attempt,
      warning: 'Warning: Time Limitを超過しています。',
    };
  }

  return {
    ...attempt,
    penalty: 'DNF',
    warning: '',
    comment: attempt.comment || 'Time Limit exceeded',
  };
}

function getAttemptDisplay(attempt) {
  if (!attempt) {
    return 'Pending';
  }

  return attempt.penalty === 'DNF' ? `${attempt.timeText} DNF` : `${attempt.timeText}${attempt.penalty === '+2' ? ' +2' : ''}`;
}

function renderAttempts() {
  const attemptCount = currentRule.getAttemptCount();
  const filledAttempts = attempts.slice(0, attemptCount);

  emptyAttempts.hidden = true;
  attemptList.querySelectorAll('.attempt-row').forEach((row) => row.remove());

  const rows = Array.from({ length: attemptCount }, (_, index) => {
    const attempt = filledAttempts[index];
    const row = document.createElement('div');
    row.className = `attempt-row${attempt ? '' : ' pending'}`;

    if (attempt) {
      row.dataset.timeMs = String(attempt.timeMs);
      row.dataset.effectiveTimeMs = String(currentRule.getEffectiveTime(attempt));
    }

    const number = document.createElement('span');
    number.className = 'attempt-number';
    number.textContent = String(index + 1).padStart(2, '0');

    const name = document.createElement('span');
    name.className = 'attempt-name';
    name.textContent = getAttemptDisplay(attempt);

    const penalty = document.createElement('span');
    penalty.className = `attempt-status${!attempt || attempt.penalty === 'None' ? ' muted' : ''}`;
    penalty.textContent = attempt?.penalty ?? 'Pending';

    const comment = document.createElement('span');
    comment.className = 'attempt-comment';
    comment.textContent = [attempt?.comment || 'No comment', attempt?.warning].filter(Boolean).join(' / ');

    row.append(number, name, penalty, comment);
    return row;
  });

  attemptList.append(...rows);
  renderSummary(filledAttempts);
}

function renderSummary(filledAttempts) {
  const statistics = currentRule.calculate(filledAttempts);
  const attemptCount = currentRule.getAttemptCount();

  formatSummary.textContent = currentRule.formatName;
  attemptProgress.textContent = `${filledAttempts.length} / ${attemptCount}`;
  resultType.textContent = currentRule.getResultType().toUpperCase();
  meanValue.textContent = formatMilliseconds(statistics.mean);
  averageValue.textContent = formatMilliseconds(statistics.average);
  bestValue.textContent = formatMilliseconds(statistics.best);
  worstValue.textContent = formatMilliseconds(statistics.worst);
}

function openAttemptDialog() {
  if (attempts.length >= currentRule.getAttemptCount()) {
    formError.textContent = '';
    return;
  }

  formError.textContent = '';
  attemptForm.reset();
  attemptDialog.showModal();
  startTimeLimitCountdown();
  document.querySelector('#attempt-time').focus();
}

function closeAttemptDialog() {
  stopTimeLimitCountdown();
  attemptDialog.close();
  updateTimeLimitSummary();
}

function saveAttempt(event) {
  event.preventDefault();

  if (attempts.length >= currentRule.getAttemptCount()) {
    closeAttemptDialog();
    return;
  }

  const formData = new FormData(attemptForm);
  const timeText = String(formData.get('time') ?? '').trim();
  const timeMs = parseTimeToMilliseconds(timeText);

  if (timeMs === null) {
    formError.textContent = 'Timeは 12.35、1:23.45、12:34.56 の形式で入力してください。';
    return;
  }

  const attempt = applyTimeLimitToAttempt({
    timeText,
    timeMs,
    penalty: String(formData.get('penalty')),
    comment: String(formData.get('comment') ?? '').trim(),
    warning: '',
  });

  attempts.push(attempt);

  renderAttempts();
  closeAttemptDialog();
}

function changeFormat() {
  currentRule = new Rule(formatSelect.value);
  attempts.splice(currentRule.getAttemptCount());
  renderAttempts();
}

formatSelect.addEventListener('change', changeFormat);
timeLimitEnabled.addEventListener('change', updateTimeLimitSummary);
timeLimitInput.addEventListener('input', updateTimeLimitSummary);
practiceMode.addEventListener('change', updateTimeLimitSummary);
openDialogButton.addEventListener('click', openAttemptDialog);
closeDialogButton.addEventListener('click', closeAttemptDialog);
cancelAttemptButton.addEventListener('click', closeAttemptDialog);
attemptForm.addEventListener('submit', saveAttempt);

updateTimeLimitSummary();
renderAttempts();
