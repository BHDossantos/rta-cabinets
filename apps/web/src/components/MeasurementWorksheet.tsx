import { useState } from 'react';
import './measurement-worksheet.css';
import { worksheetCell, worksheetKey } from './measurementWorksheetLogic';

const FIELDS = {offset: 'From starting corner', width: 'Width or length', floor: 'Above floor', height: 'Height'} as const;
type Field = keyof typeof FIELDS;
const ROWS: { name: string; fields: Field[] }[] = [
  ...[1, 2, 3, 4].map((n) => ({ name: `Wall ${n}`, fields: ['width'] as Field[] })),
  { name: 'Ceiling height', fields: ['height'] },
  { name: 'Door', fields: ['offset', 'width', 'height'] },
  { name: 'Window', fields: ['offset', 'width', 'floor', 'height'] },
  { name: 'Sink drain center', fields: ['offset'] },
  { name: 'Range', fields: ['offset', 'width', 'height'] },
  { name: 'Refrigerator', fields: ['offset', 'width', 'height'] },
  { name: 'Dishwasher', fields: ['offset', 'width', 'height'] },
];

export function MeasurementWorksheet() {
  const [values, setValues] = useState<Record<string, string>>({});
  const fields = Object.keys(FIELDS) as Field[];
  return (
    <section className="card worksheet" aria-labelledby="ws-h">
      <h2 id="ws-h" className="h3">Measurement worksheet</h2>
      <div className="screen-only">
        <p>Record measurements in inches. You can use fractions such as 35 3/8.</p>
        <p className="small">These notes stay on this page until you leave or reload. Print or save as PDF to keep a copy. Nothing is submitted, validated, or transferred into the planner.</p>
        <div className="grid-2">
          {ROWS.map(({ name, fields }) => (
            <fieldset className="card" key={name}>
              <legend>{name}</legend>
              {fields.map((field) => {
                const id = worksheetKey(name, field);
                return (
                  <label className="field" key={field}>
                    <span>{FIELDS[field]} (inches)</span>
                    <input type="text" maxLength={40} value={values[id] ?? ''} onChange={(e) => {
                      const value = e.target.value;
                      setValues((previous) => ({ ...previous, [id]: value }));
                    }} />
                  </label>
                );
              })}
            </fieldset>
          ))}
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => window.print()}>Print my worksheet</button>
      </div>
      <table className="table worksheet-print-values">
        <caption>Customer notes in inches; not verified dimensions.</caption>
        <thead><tr><th scope="col">Item</th>{fields.map((field) => <th key={field} scope="col">{FIELDS[field]}</th>)}</tr></thead>
        <tbody>
          {ROWS.map(({ name, fields: applicable }) => (
            <tr key={name}><th scope="row">{name}</th>{fields.map((field) =>
              <td key={field}>{worksheetCell(values, applicable, name, field)}</td>
            )}</tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
