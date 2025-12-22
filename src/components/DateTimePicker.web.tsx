import React from 'react';

type Props = {
  value: Date;
  mode?: 'date' | 'time' | 'datetime';
  onChange?: (event: unknown, date?: Date) => void;
  // ignore native-only props (display, etc.) for web
  display?: unknown;
};

function toDateTimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  // Use local time for datetime-local
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function fromDateTimeLocalValue(v: string): Date | undefined {
  // v like "2025-12-21T09:00"
  const ms = Date.parse(v);
  if (!Number.isFinite(ms)) return undefined;
  return new Date(ms);
}

export default function DateTimePickerWeb(props: Props) {
  const mode = props.mode ?? 'datetime';

  if (mode !== 'datetime') {
    // Keep it simple for now; app uses datetime.
    return null;
  }

  return (
    <input
      type="datetime-local"
      value={toDateTimeLocalValue(props.value)}
      onChange={(e) => {
        const next = fromDateTimeLocalValue(e.currentTarget.value);
        if (next) props.onChange?.(e, next);
      }}
      style={{
        padding: 8,
        borderRadius: 10,
        border: '1px solid #ddd',
        font: 'inherit',
      }}
    />
  );
}


