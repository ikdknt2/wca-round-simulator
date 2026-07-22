const attempts = [];

const attemptDialog = document.querySelector('#attempt-dialog');
const attemptForm = document.querySelector('#attempt-form');
const attemptList = document.querySelector('#attempt-list');
const emptyAttempts = document.querySelector('#empty-attempts');
const formError = document.querySelector('#form-error');
const openDialogButton = document.querySelector('#open-attempt-dialog');
const closeDialogButton = document.querySelector('#close-attempt-dialog');
const cancelAttemptButton = document.querySelector('#cancel-attempt');

const timePattern = /^(?:(\d{1,2}):)?(\d{1,2})(?:\.(\d{1,3}))?$/;

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

function renderAttempts() {
  emptyAttempts.hidden = attempts.length > 0;

  const renderedRows = attempts.map((attempt, index) => {
    const row = document.createElement('div');
    row.className = 'attempt-row';
    row.dataset.timeMs = String(attempt.timeMs);

    const number = document.createElement('span');
    number.className = 'attempt-number';
    number.textContent = String(index + 1).padStart(2, '0');

    const name = document.createElement('span');
    name.className = 'attempt-name';
    name.textContent = attempt.timeText;

    const penalty = document.createElement('span');
    penalty.className = `attempt-status${attempt.penalty === 'None' ? ' muted' : ''}`;
    penalty.textContent = attempt.penalty;

    const comment = document.createElement('span');
    comment.className = 'attempt-comment';
    comment.textContent = attempt.comment || 'No comment';

    row.append(number, name, penalty, comment);
    return row;
  });

  attemptList.querySelectorAll('.attempt-row').forEach((row) => row.remove());
  attemptList.append(...renderedRows);
}

function openAttemptDialog() {
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

openDialogButton.addEventListener('click', openAttemptDialog);
closeDialogButton.addEventListener('click', closeAttemptDialog);
cancelAttemptButton.addEventListener('click', closeAttemptDialog);
attemptForm.addEventListener('submit', saveAttempt);
