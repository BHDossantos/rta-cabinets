/**
 * Measuring guide (spec section 4 page inventory). Written for this site; the
 * printable worksheet mirrors the fields the planner and design service ask for.
 */
const STEPS: { title: string; body: string[] }[] = [
  {
    title: 'Get ready',
    body: [
      'Use a steel tape measure, a pencil and the worksheet below. Two people make long walls easier.',
      'Measure in inches to the nearest 1/8". You can type fractions like 35 3/8 in the planner.',
      'Measure the room as it will be after any demolition or wall changes.',
    ],
  },
  {
    title: 'Sketch the room',
    body: [
      'Draw the outline from above. Number the walls clockwise starting from the wall where most cabinets will go (that is wall 1 in the planner).',
      'Mark every door, window, column, soffit and radiator, and where the sink, range and refrigerator go.',
    ],
  },
  {
    title: 'Measure each wall',
    body: [
      'Measure corner to corner at about 36" above the floor, where base cabinets sit. Walls are rarely straight, so also measure near the floor and near the ceiling and write down the smallest number.',
      'Measure the ceiling height in at least two places. If it changes, note where.',
    ],
  },
  {
    title: 'Locate openings',
    body: [
      'For each door and window, measure from the wall’s starting corner to the edge of the trim, then the width including trim.',
      'For windows, also measure from the floor to the bottom of the trim and the height of the window.',
    ],
  },
  {
    title: 'Note utilities and appliances',
    body: [
      'Measure from the starting corner to the center of the sink drain, water lines, gas line and any outlets that must stay.',
      'Use each appliance’s specification sheet for its exact width, depth and height. If you have not chosen one yet, leave it as Unknown in the planner rather than guessing — the design stays “review required” until it is measured.',
    ],
  },
  {
    title: 'Check before you order',
    body: [
      'Measurements you enter are marked “customer measured”. Before production, compare them with the drawing in your design summary.',
      'If you are unsure, request a free design review: a designer checks your numbers and asks about anything that looks off.',
    ],
  },
];

export function MeasurePage() {
  return (
    <div className="container page measure">
      <h1>How to measure your room</h1>
      <p className="lead">Fifteen minutes with a tape measure is the difference between cabinets that fit and cabinets that almost fit.</p>
      <div className="btn-row no-print">
        <button type="button" className="btn btn-secondary" onClick={() => window.print()}>Print guide and worksheet</button>
        <a className="btn btn-primary" href="#/design">Enter measurements in the planner</a>
      </div>
      <ol className="measure-steps">
        {STEPS.map((s) => (
          <li key={s.title} className="card">
            <h2 className="h3">{s.title}</h2>
            <ul>{s.body.map((b) => <li key={b}>{b}</li>)}</ul>
          </li>
        ))}
      </ol>
      <section className="card worksheet" aria-labelledby="ws-h">
        <h2 id="ws-h" className="h3">Worksheet</h2>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Item</th><th>From starting corner</th><th>Width / length</th><th>Above floor</th><th>Height</th></tr></thead>
            <tbody>
              {['Wall 1', 'Wall 2', 'Wall 3', 'Wall 4', 'Ceiling height', 'Door', 'Window', 'Sink drain center', 'Range', 'Refrigerator', 'Dishwasher'].map((r) => (
                <tr key={r}><th scope="row">{r}</th><td /><td /><td /><td /></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
