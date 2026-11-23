import { useState } from 'react';

type Banner = {
  title: string;
  description: string;
  action: string;
  href: string;
  icon: 'measure' | 'cabinet' | 'layout';
};

const EVERGREEN_BANNERS = [
  { title: 'Measure first. Build with confidence.', description: 'Start with your room dimensions before choosing cabinets.', action: 'Open measuring guide', href: '#/measure', icon: 'measure' },
  { title: 'Find a cabinet style you like.', description: 'Compare cabinet collections before you make a plan.', action: 'Explore cabinet collections', href: '#/collections', icon: 'cabinet' },
  { title: 'Need another set of eyes?', description: 'See how our design service reviews layouts and clearances.', action: 'Explore design help', href: '#/design-service', icon: 'layout' },
] as const satisfies readonly Banner[];

function BannerIcon({ icon }: { icon: Banner['icon'] }) {
  return (
    <svg className="storefront-banner-icon" width="42" height="38" viewBox="0 0 42 38" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="40" height="36" rx="9" fill="currentColor" />
      <g fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {icon === 'measure' && <path d="M8 15h26v10H8zM13 15v4m5-4v6m5-6v4m5-4v6" />}
        {icon === 'cabinet' && <path d="M10 9h22v20H10zM21 9v20M13 12h5v14h-5zM24 12h5v14h-5zM18 18v2m6-2v2M8 31h26" />}
        {icon === 'layout' && <path d="M9 10h24v18H9zM15 10v18m0-12h18m-9 0v12m4-6h2" />}
      </g>
    </svg>
  );
}

/** An evergreen, manual carousel. No campaign data is accepted from outside the bundle. */
export function StorefrontBanner() {
  const [index, setIndex] = useState(0);
  const banner = EVERGREEN_BANNERS[index]!;
  const length = EVERGREEN_BANNERS.length;
  const move = (delta: number) => setIndex((current) => (current + delta + length) % length);

  return (
    <aside className="storefront-banner no-print" aria-label="Project planning" aria-roledescription="carousel">
      <div className="container storefront-banner-inner">
        <div className="storefront-banner-slide" role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${length}`}>
          <BannerIcon icon={banner.icon} />
          <div className="storefront-banner-copy">
            <strong>{banner.title}</strong>
            <span>{banner.description}</span>
          </div>
          <a className="storefront-banner-link" href={banner.href}>
            {banner.action} <span aria-hidden="true">→</span>
          </a>
        </div>
        <div className="storefront-banner-controls" role="group" aria-label="Banner controls">
          <button type="button" onClick={() => move(-1)} aria-label="Previous banner"><span aria-hidden="true">‹</span></button>
          <span className="storefront-banner-count" aria-hidden="true">{index + 1} / {length}</span>
          <button type="button" onClick={() => move(1)} aria-label="Next banner"><span aria-hidden="true">›</span></button>
        </div>
        <span className="visually-hidden" role="status">{`${index + 1} of ${length}: ${banner.title}`}</span>
      </div>
    </aside>
  );
}
