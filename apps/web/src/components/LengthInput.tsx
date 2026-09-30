import { type DisplayUnit, parseLength } from '@rta/core';
import { useEffect, useId, useRef, useState } from 'react';
import { lengthFieldValue } from '../format';

/**
 * Length field for numeric (non-drag) editing. Accepts fractional inches such as
 * "35 1/2", feet-inches such as 2' 11", or metric with a suffix ("900mm").
 * Commits on blur or Enter; invalid input is announced and never committed.
 */
export function LengthInput({
  label, valueMm, unit, onCommit, hideLabel = false, id: idProp, min,
}: {
  label: string;
  valueMm: number;
  unit: DisplayUnit;
  onCommit: (mm: number) => void;
  hideLabel?: boolean;
  id?: string;
  min?: number;
}) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const [text, setText] = useState(() => lengthFieldValue(valueMm, unit));
  const focused = useRef(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync from the model when it changes externally (undo, drag, unit switch).
  useEffect(() => {
    if (!focused.current) {
      setText(lengthFieldValue(valueMm, unit));
      setError(null);
    }
  }, [valueMm, unit]);

  const commit = () => {
    try {
      const mm = parseLength(text, unit);
      if (min !== undefined && mm < min) throw new Error(`Must be at least ${min}`);
      setError(null);
      if (Math.abs(mm - valueMm) > 1e-6) onCommit(mm);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid length');
    }
  };

  return (
    <div className="field field-length">
      <label htmlFor={id} className={hideLabel ? 'visually-hidden' : undefined}>
        {label}
      </label>
      <div className="input-with-unit">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          onFocus={() => (focused.current = true)}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            focused.current = false;
            commit();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
        />
        <span className="unit" aria-hidden="true">{unit === 'in' ? 'in' : 'mm'}</span>
      </div>
      {error && (
        <span id={`${id}-err`} className="field-error" role="alert">
          ⛔ {error}
        </span>
      )}
    </div>
  );
}
