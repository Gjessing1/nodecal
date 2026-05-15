import { esc } from '../app/utils.js';

const DAYS_SHORT = ['SU','MO','TU','WE','TH','FR','SA'];
const DAYS_LONG  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function ordinal(n) { return n + (n===1?'st':n===2?'nd':n===3?'rd':'th'); }

export function repeatOptionsHtml(date, currentRrule) {
  const dow   = date.getDay();
  const dom   = date.getDate();
  const weeklyVal  = `FREQ=WEEKLY;BYDAY=${DAYS_SHORT[dow]}`;
  const monthlyVal = `FREQ=MONTHLY;BYMONTHDAY=${dom}`;

  // "Nth weekday of month" — e.g. "3rd Thursday" or "Last Thursday"
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const isLastWeek  = dom + 7 > daysInMonth;
  const weekOrdinal = isLastWeek ? -1 : Math.ceil(dom / 7);
  const nthDayVal   = `FREQ=MONTHLY;BYDAY=${weekOrdinal}${DAYS_SHORT[dow]}`;
  const ordLabels   = ['', 'First', 'Second', 'Third', 'Fourth'];
  const nthDayLabel = `Monthly (${weekOrdinal === -1 ? 'Last' : ordLabels[weekOrdinal]} ${DAYS_LONG[dow]})`;

  function matchPreset(r) {
    if (!r) return '';
    const norm = r.toUpperCase();
    if (/FREQ=DAILY/.test(norm) && !/INTERVAL=[2-9]|INTERVAL=\d{2}/.test(norm)) return 'FREQ=DAILY';
    if (/FREQ=WEEKLY/.test(norm) && !/INTERVAL=[2-9]|INTERVAL=\d{2}/.test(norm)) return weeklyVal;
    if (/FREQ=MONTHLY;BYDAY=/.test(norm) && !/INTERVAL=[2-9]|INTERVAL=\d{2}/.test(norm)) return nthDayVal;
    if (/FREQ=MONTHLY/.test(norm) && !/INTERVAL=[2-9]|INTERVAL=\d{2}/.test(norm)) return monthlyVal;
    if (/FREQ=YEARLY/.test(norm)) return 'FREQ=YEARLY';
    return '__custom__';
  }

  const sel = matchPreset(currentRrule);
  const opts = [
    ['', 'None'],
    ['FREQ=DAILY', 'Daily'],
    [weeklyVal, 'Weekly'],
    [monthlyVal, 'Monthly'],
    ['FREQ=YEARLY', 'Yearly'],
    [nthDayVal, nthDayLabel],
  ];
  if (sel === '__custom__') opts.push(['__custom__', `Custom (${currentRrule.split(';')[0]})`]);
  return opts.map(([v, l]) => `<option value="${esc(v)}"${sel===v?' selected':''}>${esc(l)}</option>`).join('');
}
