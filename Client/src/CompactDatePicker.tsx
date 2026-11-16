import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import './CompactDatePicker.css';

export const validDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const actual = new Date(Date.UTC(year, month - 1, day));
  return actual.getUTCFullYear() === year && actual.getUTCMonth() + 1 === month && actual.getUTCDate() === day;
};

export const addDays = (value: string, amount: number): string => {
  if (!validDate(value)) return '';
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + amount)).toISOString().slice(0, 10);
};

const displayDate = (value: string): string => {
  if (!validDate(value)) return 'Select date';
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'
  });
};

type Props = {
  label: string;
  value: string;
  min?: string;
  strictAfterMin?: boolean;
  onChange: (value: string) => void;
};

export default function CompactDatePicker({label, value, min, strictAfterMin = false, onChange}: Props) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState((validDate(value) ? value : new Date().toISOString().slice(0,10)).slice(0,7));
  const root = useRef<HTMLDivElement>(null);
  const selected = validDate(value) ? value : '';
  useEffect(() => {
    if (open) setMonth((validDate(value) ? value : validDate(min || '') ? min! : new Date().toISOString().slice(0,10)).slice(0,7));
  }, [open, value, min]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  const [year, monthNumber] = month.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const cells = Array.from({length: Math.ceil((weekday + daysInMonth) / 7) * 7}, (_, index) => index - weekday + 1);
  const minMonth = validDate(min || '') ? min!.slice(0,7) : '';
  const isBlocked = (date: string) => Boolean(min && (strictAfterMin ? date <= min : date < min));
  const moveMonth = (difference: number) => {
    setMonth(new Date(Date.UTC(year, monthNumber - 1 + difference, 1)).toISOString().slice(0,7));
  };
  const chooseCurrent = () => {
    const now = new Date();
    const localToday = String(now.getFullYear()) + '-' +
      String(now.getMonth() + 1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
    const target = min && (strictAfterMin ? localToday <= min : localToday < min)
      ? addDays(min, strictAfterMin ? 1 : 0) : localToday;
    onChange(target);
    setOpen(false);
  };
  return <div className="fo-date-picker" ref={root}>
    <span className="fo-date-picker-label">{label} *</span>
    <button type="button" className="fo-date-picker-trigger"
      aria-haspopup="dialog" aria-expanded={open}
      aria-label={label + ': ' + displayDate(value)}
      onClick={() => setOpen(!open)}>
      <CalendarDays size={17} aria-hidden="true"/>
      <span>{displayDate(value)}</span><span className="fo-date-picker-arrow" aria-hidden="true">▾</span>
    </button>
    {open && <div role="dialog" aria-label={label + ' calendar'} className="fo-date-picker-popover">
      <div className="fo-date-picker-toolbar">
        <button type="button" aria-label="Previous month" disabled={Boolean(minMonth && month <= minMonth)} onClick={() => moveMonth(-1)}>
          <ChevronLeft size={17} aria-hidden="true"/>
        </button>
        <strong>{new Date(Date.UTC(year, monthNumber-1, 1)).toLocaleDateString('en-IN', {month:'long', year:'numeric', timeZone:'UTC'})}</strong>
        <button type="button" aria-label="Next month" onClick={() => moveMonth(1)}>
          <ChevronRight size={17} aria-hidden="true"/>
        </button>
      </div>
      <div className="fo-date-picker-grid" role="grid" aria-label={label + ' dates'}>
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(day => <span className="fo-date-picker-weekday" key={day}>{day}</span>)}
        {cells.map((day,index) => {
          if (day < 1 || day > daysInMonth) return <span key={'blank-' + index} aria-hidden="true"/>;
          const date = String(year) + '-' + String(monthNumber).padStart(2,'0') + '-' + String(day).padStart(2,'0');
          return <button type="button" key={date} role="gridcell" aria-label={displayDate(date)}
            aria-selected={date === selected} disabled={isBlocked(date)}
            className={date === selected ? 'selected' : ''}
            onClick={() => {onChange(date);setOpen(false);}}>{day}</button>;
        })}
      </div>
      <div className="fo-date-picker-actions">
        <button type="button" onClick={() => setOpen(false)}>Close</button>
        <button type="button" onClick={chooseCurrent}>{min && isBlocked(new Date().toLocaleDateString('en-CA')) ? 'Next valid date' : 'Today'}</button>
      </div>
    </div>}
  </div>;
}
