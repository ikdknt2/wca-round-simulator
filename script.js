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

  getDefaultCutoffAttempts() {
    return Math.min(this.format.cutoffAttempts ?? this.format.attempts, this.format.attempts, 3);
  }

  hasDefaultCutoff() {
    return Boolean(this.format.cutoffAttempts);
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

const cutoffStatus = document.querySelector('#cutoff-status');
const cutoffEnabled = document.querySelector('#cutoff-enabled');
const cutoffTimeInput = document.querySelector('#cutoff-time-input');
const cutoffAttemptsSelect = document.querySelector('#cutoff-attempts-select');
const timeLimitEnabled = document.querySelector('#time-limit-enabled');
const timeLimitInput = document.querySelector('#time-limit-input');
const timeLimitSummary = document.querySelector('#time-limit-summary');
const timeLimitCaption = document.querySelector('#time-limit-caption');
const practiceMode = document.querySelector('#practice-mode');

const timePattern = /^(?:(\d{1,2}):)?(\d{1,2})(?:\.(\d{1,3}))?$/;

let currentRule = new Rule(formatSelect.value);

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


function updateTimeLimitSummary() {
  const limitMs = getTimeLimitMilliseconds();
  timeLimitSummary.textContent = getTimeLimitText();
  timeLimitCaption.textContent = limitMs === null ? 'Time Limit OFF' : 'Time Limit ON';
}

function applyTimeLimitToAttempt(attempt) {
  const limitMs = getTimeLimitMilliseconds();

  if (limitMs === null || attempt.timeMs < limitMs) {
    return attempt;
  }

  return {
    ...attempt,
    penalty: 'DNF',
    warning: '',
    comment: attempt.comment || 'Time Limit reached or exceeded',
  };
}


function getCutoffTimeMilliseconds() {
  if (!cutoffEnabled.checked) {
    return null;
  }

  return parseTimeToMilliseconds(cutoffTimeInput.value);
}

function getCutoffAttemptCount() {
  const selectedAttempts = Number(cutoffAttemptsSelect.value);
  const fallbackAttempts = currentRule.getDefaultCutoffAttempts();
  const cutoffAttempts = Number.isFinite(selectedAttempts) && selectedAttempts > 0
    ? selectedAttempts
    : fallbackAttempts;

  return Math.min(cutoffAttempts, currentRule.getAttemptCount(), 3);
}

function getCutoffState(filledAttempts = attempts.slice(0, currentRule.getAttemptCount())) {
  const cutoffMs = getCutoffTimeMilliseconds();
  const cutoffAttemptCount = getCutoffAttemptCount();

  if (cutoffMs === null) {
    return { enabled: false, passed: false, failed: false, cutoffMs, cutoffAttemptCount };
  }

  const cutoffAttempts = filledAttempts.slice(0, cutoffAttemptCount);
  const passed = cutoffAttempts.some((attempt) => currentRule.getEffectiveTime(attempt) <= cutoffMs);
  const failed = cutoffAttempts.length >= cutoffAttemptCount && !passed;

  return { enabled: true, passed, failed, cutoffMs, cutoffAttemptCount };
}

function getAllowedAttemptCount(filledAttempts = attempts.slice(0, currentRule.getAttemptCount())) {
  const cutoffState = getCutoffState(filledAttempts);
  return cutoffState.failed ? cutoffState.cutoffAttemptCount : currentRule.getAttemptCount();
}

function updateCutoffSummary(filledAttempts = attempts.slice(0, currentRule.getAttemptCount())) {
  const cutoffState = getCutoffState(filledAttempts);

  cutoffStatus.className = '';

  if (!cutoffState.enabled) {
    cutoffStatus.textContent = 'OFF';
    return;
  }

  if (cutoffState.failed) {
    cutoffStatus.textContent = 'Cutoff Failed';
    cutoffStatus.classList.add('failed');
    return;
  }

  if (cutoffState.passed) {
    cutoffStatus.textContent = 'Cutoff Passed';
    cutoffStatus.classList.add('passed');
    return;
  }

  cutoffStatus.textContent = `${formatMilliseconds(cutoffState.cutoffMs)} / Best of ${cutoffState.cutoffAttemptCount}`;
}

function syncCutoffDefaults({ updateEnabled = false } = {}) {
  const defaultAttempts = String(currentRule.getDefaultCutoffAttempts());
  cutoffAttemptsSelect.value = defaultAttempts;

  if (updateEnabled) {
    cutoffEnabled.checked = currentRule.hasDefaultCutoff();
  }
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
  const cutoffState = getCutoffState(filledAttempts);
  const allowedAttemptCount = getAllowedAttemptCount(filledAttempts);

  emptyAttempts.hidden = true;
  attemptList.querySelectorAll('.attempt-row').forEach((row) => row.remove());

  const rows = Array.from({ length: attemptCount }, (_, index) => {
    const attempt = filledAttempts[index];
    const isCutoffEnded = cutoffState.failed && index >= allowedAttemptCount;
    const row = document.createElement('div');
    row.className = `attempt-row${attempt ? '' : ' pending'}${isCutoffEnded ? ' cutoff-ended' : ''}`;

    if (attempt) {
      row.dataset.timeMs = String(attempt.timeMs);
      row.dataset.effectiveTimeMs = String(currentRule.getEffectiveTime(attempt));
    }

    const number = document.createElement('span');
    number.className = 'attempt-number';
    number.textContent = String(index + 1).padStart(2, '0');

    const name = document.createElement('span');
    name.className = 'attempt-name';
    name.textContent = isCutoffEnded ? 'Cutoff Failed' : getAttemptDisplay(attempt);

    const penalty = document.createElement('span');
    penalty.className = `attempt-status${!attempt || attempt.penalty === 'None' ? ' muted' : ''}`;
    penalty.textContent = isCutoffEnded ? 'Ended' : attempt?.penalty ?? 'Pending';

    const comment = document.createElement('span');
    comment.className = 'attempt-comment';
    comment.textContent = isCutoffEnded ? '残りAttemptは自動終了しました。' : [attempt?.comment || 'No comment', attempt?.warning].filter(Boolean).join(' / ');

    row.append(number, name, penalty, comment);
    return row;
  });

  attemptList.append(...rows);
  renderSummary(filledAttempts.slice(0, allowedAttemptCount));
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
  updateCutoffSummary(filledAttempts);
}

function openAttemptDialog() {
  if (attempts.length >= getAllowedAttemptCount()) {
    formError.textContent = '';
    return;
  }

  formError.textContent = '';
  attemptForm.reset();
  attemptDialog.showModal();
  document.querySelector('#attempt-time').focus();
}

function closeAttemptDialog() {
  attemptDialog.close();
  updateTimeLimitSummary();
}

function saveAttempt(event) {
  event.preventDefault();

  if (attempts.length >= getAllowedAttemptCount()) {
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
  syncCutoffDefaults({ updateEnabled: true });
  attempts.splice(currentRule.getAttemptCount());
  renderAttempts();
}

formatSelect.addEventListener('change', changeFormat);
cutoffEnabled.addEventListener('change', renderAttempts);
cutoffTimeInput.addEventListener('input', renderAttempts);
cutoffAttemptsSelect.addEventListener('change', renderAttempts);
timeLimitEnabled.addEventListener('change', updateTimeLimitSummary);
timeLimitInput.addEventListener('input', updateTimeLimitSummary);
practiceMode.addEventListener('change', updateTimeLimitSummary);
openDialogButton.addEventListener('click', openAttemptDialog);
closeDialogButton.addEventListener('click', closeAttemptDialog);
cancelAttemptButton.addEventListener('click', closeAttemptDialog);
attemptForm.addEventListener('submit', saveAttempt);

syncCutoffDefaults();
updateTimeLimitSummary();
renderAttempts();
