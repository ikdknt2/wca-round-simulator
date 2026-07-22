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

function getAttemptDisplay(attempt) {
  if (!attempt) {
    return 'Pending';
  }

  return attempt.penalty === 'DNF' ? `${attempt.timeText} DNF` : `${attempt.timeText}${attempt.penalty === '+2' ? ' +2' : ''}`;
}

function renderAttempts() {
  const attemptCount = currentRule.getAttemptCount();
  const filledAttempts = attempts.slice(0, attemptCount);

  emptyAttempts.hidden = filledAttempts.length > 0;
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
    comment.textContent = attempt?.comment || 'No comment';

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
  document.querySelector('#attempt-time').focus();
}

function closeAttemptDialog() {
  attemptDialog.close();
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

  attempts.push({
    timeText,
    timeMs,
    penalty: String(formData.get('penalty')),
    comment: String(formData.get('comment') ?? '').trim(),
  });

  renderAttempts();
  closeAttemptDialog();
}

function changeFormat() {
  currentRule = new Rule(formatSelect.value);
  attempts.splice(currentRule.getAttemptCount());
  renderAttempts();
}

formatSelect.addEventListener('change', changeFormat);
openDialogButton.addEventListener('click', openAttemptDialog);
closeDialogButton.addEventListener('click', closeAttemptDialog);
cancelAttemptButton.addEventListener('click', closeAttemptDialog);
attemptForm.addEventListener('submit', saveAttempt);

renderAttempts();
