export function HomePage() {
  return (
    <div className="page home">
      <section className="hero">
        <div className="container hero-inner">
          <h1>Plan, price and order ready-to-assemble cabinets from the factory</h1>
          <p className="lead">
            Measure your room, place standard cabinet bodies, choose fronts, and get an itemized estimate calculated from
            the current price book. Save your plan, then order when you are ready.
          </p>
          <div className="cta-row">
            <a className="btn btn-primary btn-lg" href="#/design">Start Your Design</a>
            <a className="btn btn-secondary btn-lg" href="#/shop">Shop Materials</a>
          </div>
        </div>
      </section>

      <section className="container section" aria-labelledby="how-h">
        <h2 id="how-h">How ordering works</h2>
        <ol className="steps">
          <li><strong>Measure.</strong> Enter wall lengths and ceiling height. Fractional inches such as 35 1/2 are accepted.</li>
          <li><strong>Design.</strong> Place standard bodies on each wall by number or by dragging, and resolve any design checks.</li>
          <li><strong>Estimate.</strong> Get itemized pricing from the server. Freight and tax are shown as pending until your address is known.</li>
          <li><strong>Order.</strong> Review your cart, accept the final total, and pay through the hosted payment provider.</li>
        </ol>
      </section>

      <section className="section surface" aria-labelledby="stages-h">
        <div className="container">
          <h2 id="stages-h">Standard bodies first, fronts later</h2>
          <div className="grid-2">
            <div className="card">
              <h3>Stage A: cabinet bodies and hardware</h3>
              <p>
                Cabinet bodies are built in standard sizes from the factory's approved size matrix and ship with hinges and
                other required hardware in the first delivery, so installation can begin.
              </p>
            </div>
            <div className="card">
              <h3>Stage B: fronts and finish parts</h3>
              <p>
                Doors, drawer fronts, fillers and finish parts ship as a separate stage. Your order shows each stage and its
                status separately; lead times are confirmed at checkout.
              </p>
            </div>
          </div>
          <p className="small muted">Finish images are visual approximations. Order a physical sample before choosing a finish.</p>
        </div>
      </section>

      <section className="container section grid-3" aria-label="More services">
        <div className="card">
          <h2 className="h3">Pro membership</h2>
          <p>Contractors and designers can apply for a Pro plan with trade pricing and project tools. Plan pricing is set by the business and is pending approval.</p>
          <a href="#/pro" className="btn btn-secondary">View Pro plans</a>
        </div>
        <div className="card">
          <h2 className="h3">Find an installer</h2>
          <p>Search verified installers who serve your ZIP code. You choose who receives your request; it is not broadcast to everyone.</p>
          <a href="#/installers" className="btn btn-secondary">Search installers</a>
        </div>
        <div className="card">
          <h2 className="h3">Financing information</h2>
          <p>Financing is provided by an external partner. We can pass your contact details to the partner with your consent. A referral is not a credit approval.</p>
          <a href="#/financing" className="btn btn-secondary">Learn about financing</a>
        </div>
      </section>

      <section className="container section" aria-labelledby="support-h">
        <h2 id="support-h">Support</h2>
        <p>
          Not sure about a measurement? Mark it as unverified in the planner and the design checks will tell you what still needs
          confirming before your fit can be verified.
        </p>
      </section>
    </div>
  );
}
