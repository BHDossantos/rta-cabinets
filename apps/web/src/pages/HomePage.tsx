const journeys = [
  ['Quick kitchen planning', 'Explore cabinets and build your own combination.', 'Shop cabinets', '#/shop', 'white'],
  ['Free design service', 'Start with your measurements. Create a layout to review.', 'Start your design', '#/design-service', 'gray'],
  ['Contractor program', 'Project tools for contractors and design professionals.', 'Explore Pro', '#/pro', 'espresso'],
];
export function HomePage() {
  return <div className="page home reference-home">
    <section className="kitchen-hero">
      <div className="kitchen-photo hero-photo" aria-hidden="true" />
      <div className="container kitchen-hero-grid">
        <div className="kitchen-intro">
          <p className="eyebrow">RTA CABINET FACTORY</p>
          <h1>Your dream kitchen.<br /><span>Designed around you.</span></h1>
          <ul className="kitchen-benefits"><li>Plan your space, cabinet by cabinet</li><li>Explore finishes and itemized estimates</li><li>Save your design and refine every detail</li></ul>
          <div className="kitchen-actions"><a className="btn btn-primary btn-lg" href="#/design">Start your kitchen plan →</a><a className="btn btn-secondary btn-lg" href="#/design-service">Request a free design</a></div>
        </div>
        <aside className="kitchen-quote" aria-labelledby="quote-heading">
          <h2 id="quote-heading">Let's plan your<br />perfect kitchen.</h2>
          <p>A clear path from your first measurement to an itemized cabinet estimate.</p>
          <ol className="quote-steps"><li><span>01</span><div><strong>Measure your space</strong><small>Wall lengths, ceiling height and openings</small></div></li><li><span>02</span><div><strong>Choose your cabinets</strong><small>Build a layout that works for you</small></div></li><li><span>03</span><div><strong>Review your estimate</strong><small>See each item in your design</small></div></li></ol>
          <a href="#/design" className="btn quote-cta">Open the kitchen planner →</a>
          <p className="quote-disclaimer">Preview experience. Catalog and prices are sample data; ordering is not available.</p>
        </aside>
      </div>
    </section>
    <section className="container kitchen-paths" aria-label="Ways to start">
      {journeys.map(([title, description, label, href, photo]) => <article className="kitchen-path" key={title}><div className="kitchen-path-heading"><h2>{title}</h2><p>{description}</p></div><div className={`kitchen-photo photo-${photo}`}><a className="btn btn-primary" href={href}>{label} →</a></div></article>)}
    </section>
    <section className="container kitchen-collections" aria-labelledby="collections-heading">
      <p className="eyebrow">FIND YOUR INSPIRATION</p><h2 id="collections-heading">A kitchen that feels like home.</h2><p className="muted">Explore the look. Then make it yours in the planner.</p>
      <div className="grid-3">
        {['Modern white', 'Soft neutral', 'Classic espresso'].map((name, i) => <a className="kitchen-style" href="#/collections" key={name}><div className={`kitchen-photo photo-${['white','gray','espresso'][i]}`} role="img" aria-label={`${name} kitchen inspiration`} /><div className="kitchen-style-caption"><h3>{name}</h3><span>Explore door styles <b aria-hidden="true">↗</b></span></div></a>)}
      </div>
      <p className="small muted inspiration-note">AI-generated kitchen concepts for inspiration, not photographs of completed projects or a representation of the available catalog.</p><a className="btn btn-primary btn-lg" href="#/collections">View all door styles →</a>
    </section>
    <section className="kitchen-bottom"><div className="container"><h2>Good design starts with the details.</h2><p>Measure carefully, explore your options and build your plan at your own pace.</p><div className="kitchen-resource-links"><a href="#/measure">Measuring guide →</a><a href="#/quick-order">Order by SKU →</a><a href="#/installers">Find an installer →</a><a href="#/financing">Financing information →</a></div></div></section>
  </div>;
}
