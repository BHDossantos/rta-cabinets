import {
  type Appliance, type DesignDocument, type DesignInstance, type Opening, type DisplayUnit, type Severity, type Sku, createCatalog, formatLength,
  validateDesign, wallsOf,
} from '@rta/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ApiError, type PublicSku, api, errorMessage } from '../api';
import { AddCabinetForm } from '../components/AddCabinetForm';
import { nextInstanceId } from '../components/cabinetParts';
import { Dialog } from '../components/Dialog';
import { ElevationView } from '../components/ElevationView';
import { FixturesPanel } from '../components/FixturesPanel';
import { EstimatePanel } from '../components/EstimatePanel';
import { InstanceTable } from '../components/InstanceTable';
import { PlanView } from '../components/PlanView';
import { PrintSummary } from '../components/PrintSummary';
import { RoomForm } from '../components/RoomForm';
import { ErrorState, Loading, Notice } from '../components/States';
import { ValidationPanel } from '../components/ValidationPanel';
import { navigate } from '../router';
import {
  type DemoAccount, getProjectId, readJson, readStore, setCartId, setGuestToken, setProjectId, writeJson, writeStore,
} from '../storage';

type Step = 'room' | 'editor' | 'estimate';
type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error' | 'offline' | 'conflict';
interface History { past: DesignDocument[]; present: DesignDocument | null; future: DesignDocument[] }
interface ProjectRef { id: string; revision: number }
interface Recovery { doc: DesignDocument; name: string; at: string }

const SEVERITY_RANK: Record<Severity, number> = { blocker: 0, review_required: 1, advisory: 2 };
const AUTOSAVE_MS = 1200;

export function PlannerPage({ account }: { account: DemoAccount }) {
  const [catalog, setCatalog] = useState<{ status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; version: string; items: PublicSku[] }>({ status: 'loading' });
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const [trade, setTrade] = useState(false);
  const [hist, setHist] = useState<History>({ past: [], present: null, future: [] });
  const doc = hist.present;
  const [step, setStep] = useState<Step>('room');
  const [projectName, setProjectName] = useState('My kitchen');
  const [project, setProject] = useState<ProjectRef | null>(null);
  const [loadingProject, setLoadingProject] = useState(() => !!getProjectId());
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<{ message: string; notFound: boolean } | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [unit, setUnitState] = useState<DisplayUnit>(() => (readStore('rta.unit') === 'mm' ? 'mm' : 'in'));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [elevWall, setElevWall] = useState('w1');
  const [preview, setPreview] = useState<{ id: string; offsetMm: number } | null>(null);
  const [printedAt, setPrintedAt] = useState<string | null>(null);
  const [access, setAccess] = useState<{ access: 'edit' | 'read_only'; endsAt: string | null } | null>(null);
  const readOnlyRef = useRef(false);
  readOnlyRef.current = access?.access === 'read_only';
  const [cartState, setCartState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const recoveryKey = `rta.recovery.${account}`;
  const [recovery] = useState(() => (getProjectId() ? null : readJson<Recovery>(recoveryKey)));

  // Refs mirror state for the async save pipeline.
  const docRef = useRef<DesignDocument | null>(null);
  const projectRef = useRef<ProjectRef | null>(null);
  const nameRef = useRef(projectName);
  const savedJson = useRef<string | null>(null);
  const conflictRef = useRef(false);
  const inflight = useRef<Promise<ProjectRef | null> | null>(null);
  docRef.current = doc;
  nameRef.current = projectName;

  const setUnit = (u: DisplayUnit) => {
    setUnitState(u);
    writeStore('rta.unit', u);
  };

  // --- load catalog + entitlement (server data) ---
  useEffect(() => {
    let live = true;
    setCatalog({ status: 'loading' });
    Promise.all([api.skus(), api.me().catch(() => null)])
      .then(([c, me]) => {
        if (!live) return;
        setCatalog({ status: 'ready', version: c.catalogVersion, items: c.items });
        setTrade(!!me?.entitlement.proOnlySkus);
      })
      .catch((e) => live && setCatalog({ status: 'error', message: errorMessage(e) }));
    return () => { live = false; };
  }, [catalogAttempt]);

  // --- load the saved project for this account, if any ---
  useEffect(() => {
    const id = getProjectId();
    if (!id) return;
    let live = true;
    api.getProject(id)
      .then((p) => {
        if (!live) return;
        setHist({ past: [], present: p.document, future: [] });
        savedJson.current = JSON.stringify(p.document);
        projectRef.current = { id: p.id, revision: p.latestRevision };
        setProject(projectRef.current);
        setProjectName(p.name);
        setAccess(p.access ?? null);
        setSaveStatus('saved');
        setStep('editor');
      })
      .catch((e) => {
        if (!live) return;
        if (e instanceof ApiError && e.status === 404) setProjectId(null);
        else setSaveError({ message: `Could not load your saved project: ${errorMessage(e)}`, notFound: false });
      })
      .finally(() => live && setLoadingProject(false));
    return () => { live = false; };
  }, []);

  const skus = useMemo(() => new Map((catalog.status === 'ready' ? catalog.items : []).map((s) => [s.code, s])), [catalog]);
  const items = useMemo(() => (catalog.status === 'ready' ? catalog.items : []), [catalog]);
  const clientCatalog = useMemo(
    () => (catalog.status === 'ready' ? createCatalog(catalog.version, catalog.items as Sku[]) : null),
    [catalog],
  );

  // The drawn and validated document includes any in-progress drag preview.
  const viewDoc = useMemo(() => {
    if (!doc || !preview) return doc;
    return { ...doc, instances: doc.instances.map((i) => (i.id === preview.id ? { ...i, offsetMm: preview.offsetMm } : i)) };
  }, [doc, preview]);

  const report = useMemo(
    () => (viewDoc && clientCatalog ? validateDesign(viewDoc, clientCatalog, { tradeEntitled: trade }) : null),
    [viewDoc, clientCatalog, trade],
  );
  const issues = useMemo(() => {
    const m = new Map<string, Severity>();
    for (const r of report?.results ?? []) {
      for (const id of r.objectIds) {
        const prev = m.get(id);
        if (!prev || SEVERITY_RANK[r.severity] < SEVERITY_RANK[prev]) m.set(id, r.severity);
      }
    }
    return m;
  }, [report]);

  // --- history ---
  const commit = useCallback((fn: (d: DesignDocument) => DesignDocument) => {
    setHist((h) => (h.present ? { past: [...h.past, h.present].slice(-100), present: fn(h.present), future: [] } : h));
  }, []);
  const undo = useCallback(() => setHist((h) => (h.past.length && h.present
    ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1]!, future: [h.present, ...h.future] } : h)), []);
  const redo = useCallback(() => setHist((h) => (h.future.length && h.present
    ? { past: [...h.past, h.present], present: h.future[0]!, future: h.future.slice(1) } : h)), []);

  const updateInstance = (id: string, patch: Partial<DesignInstance>) =>
    commit((d) => ({ ...d, instances: d.instances.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
  const deleteInstance = (id: string) => {
    commit((d) => ({ ...d, instances: d.instances.filter((i) => i.id !== id) }));
    if (selectedId === id) setSelectedId(null);
  };
  const duplicateInstance = (id: string) => commit((d) => {
    const src = d.instances.find((i) => i.id === id);
    const sku = src && skus.get(src.skuCode);
    if (!src || !sku) return d;
    return { ...d, instances: [...d.instances, { ...src, id: nextInstanceId(d), offsetMm: src.offsetMm + sku.dimensions.widthMm }] };
  });
  const addOpening = (o: Opening) => commit((d) => ({ ...d, openings: [...d.openings, o] }));
  const addAppliance = (a: Appliance) => commit((d) => ({ ...d, appliances: [...d.appliances, a] }));
  const updateOpening = (id: string, patch: Partial<Opening>) =>
    commit((d) => ({ ...d, openings: d.openings.map((o) => (o.id === id ? { ...o, ...patch } : o)) }));
  const updateAppliance = (id: string, patch: Partial<Appliance>) =>
    commit((d) => ({ ...d, appliances: d.appliances.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  const deleteFixture = (id: string) =>
    commit((d) => ({ ...d, openings: d.openings.filter((o) => o.id !== id), appliances: d.appliances.filter((a) => a.id !== id) }));
  const select = (id: string | null) => {
    setSelectedId(id);
    const inst = id ? docRef.current?.instances.find((i) => i.id === id) : undefined;
    if (inst) setElevWall(inst.wallId);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // --- saving (optimistic concurrency with baseRevision) ---
  const save = useCallback(async (): Promise<ProjectRef | null> => {
    if (inflight.current) await inflight.current;
    const d = docRef.current;
    if (!d || conflictRef.current || readOnlyRef.current) return projectRef.current && readOnlyRef.current ? projectRef.current : null;
    const json = JSON.stringify(d);
    const p = projectRef.current;
    if (p && json === savedJson.current) return p;
    const run = (async (): Promise<ProjectRef | null> => {
      setSaveStatus('saving');
      try {
        let next: ProjectRef;
        if (!p) {
          const r = await api.createProject(nameRef.current, d);
          if (r.guestToken) setGuestToken(r.guestToken);
          setProjectId(r.id);
          next = { id: r.id, revision: r.latestRevision };
        } else {
          const r = await api.saveRevision(p.id, p.revision, d);
          next = { id: p.id, revision: r.revision };
        }
        projectRef.current = next;
        setProject(next);
        savedJson.current = json;
        setSavedAt(new Date());
        setSaveError(null);
        setSaveStatus(JSON.stringify(docRef.current) === json ? 'saved' : 'unsaved');
        return next;
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          conflictRef.current = true;
          setSaveStatus('conflict');
          setConflictOpen(true);
        } else if (e instanceof ApiError && e.details?.reason === 'access_expired') {
          setAccess({ access: 'read_only', endsAt: (e.details.endsAt as string | null) ?? null });
          setSaveStatus('error');
          setSaveError({ message: e.message, notFound: false });
        } else {
          setSaveStatus(e instanceof ApiError && e.status === 0 ? 'offline' : 'error');
          setSaveError({ message: errorMessage(e), notFound: e instanceof ApiError && e.status === 404 });
        }
        return null;
      }
    })();
    inflight.current = run;
    const result = await run;
    inflight.current = null;
    return result;
  }, []);

  // Autosave after a short idle interval; keep a local recovery snapshot too.
  useEffect(() => {
    if (!doc) return;
    writeJson(recoveryKey, { doc, name: nameRef.current, at: new Date().toISOString() } satisfies Recovery);
    if (JSON.stringify(doc) === savedJson.current || conflictRef.current || readOnlyRef.current) return;
    setSaveStatus('unsaved');
    const t = setTimeout(() => void save(), AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [doc, save, recoveryKey]);

  useEffect(() => {
    const dirty = saveStatus === 'unsaved' || saveStatus === 'saving' || saveStatus === 'error' || saveStatus === 'offline' || saveStatus === 'conflict';
    if (!dirty) return;
    const onBefore = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', onBefore);
    return () => window.removeEventListener('beforeunload', onBefore);
  }, [saveStatus]);

  const resolveLoadLatest = async () => {
    const p = projectRef.current;
    if (!p) return;
    try {
      const latest = await api.getProject(p.id);
      setHist((h) => ({ past: h.present ? [...h.past, h.present] : h.past, present: latest.document, future: [] }));
      savedJson.current = JSON.stringify(latest.document);
      projectRef.current = { id: p.id, revision: latest.latestRevision };
      setProject(projectRef.current);
      conflictRef.current = false;
      setSaveStatus('saved');
      setConflictOpen(false);
    } catch (e) {
      setSaveError({ message: errorMessage(e), notFound: false });
    }
  };
  const resolveKeepMine = async () => {
    const p = projectRef.current;
    if (!p) return;
    try {
      const latest = await api.getProject(p.id);
      projectRef.current = { id: p.id, revision: latest.latestRevision };
      conflictRef.current = false;
      setConflictOpen(false);
      await save();
    } catch (e) {
      setSaveError({ message: errorMessage(e), notFound: false });
    }
  };
  const saveAsNew = async () => {
    projectRef.current = null;
    setProject(null);
    setProjectId(null);
    savedJson.current = null;
    await save();
  };

  const startNew = () => {
    if (doc && saveStatus !== 'saved' && !window.confirm('Start a new design? Unsaved changes to the current design will be lost.')) return;
    setProjectId(null);
    writeStore(recoveryKey, null);
    projectRef.current = null;
    savedJson.current = null;
    conflictRef.current = false;
    setProject(null);
    setHist({ past: [], present: null, future: [] });
    setSaveStatus('idle');
    setSelectedId(null);
    setStep('room');
  };

  // --- export ---
  const revisionId = project ? `${project.id}@r${project.revision}` : null;
  const downloadJson = () => {
    if (!doc) return;
    const payload = {
      format: 'rta-design-export', exportedAt: new Date().toISOString(), projectName, revisionId,
      units: { canonical: 'mm', display: unit }, validation: report ? { fitStatus: report.fitStatus, rulesetVersion: report.rulesetVersion, results: report.results } : null,
      document: doc,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'design'}${project ? `-r${project.revision}` : '-draft'}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const printSummary = () => {
    flushSync(() => setPrintedAt(new Date().toISOString()));
    window.print();
  };

  const buildCart = async () => {
    setCartState({ busy: true, error: null });
    const p = await save();
    if (!p) {
      setCartState({ busy: false, error: 'Save the design first. Resolve the save problem shown above, then try again.' });
      return;
    }
    try {
      const cart = await api.cartFromDesign(p.id, p.revision);
      setCartId(cart.id);
      navigate('/cart');
    } catch (e) {
      setCartState({ busy: false, error: errorMessage(e) });
    }
  };

  // --- render ---
  if (catalog.status === 'loading' || loadingProject) return <div className="container page"><Loading label="Loading planner…" /></div>;
  if (catalog.status === 'error') {
    return <div className="container page"><h1>Design planner</h1><ErrorState message={catalog.message} onRetry={() => setCatalogAttempt((a) => a + 1)} /></div>;
  }

  const walls = doc ? wallsOf(doc.room.outline) : [];
  const steps: { id: Step; label: string }[] = [
    { id: 'room', label: '1. Room' },
    { id: 'editor', label: '2. Layout' },
    { id: 'estimate', label: '3. Estimate' },
  ];

  return (
    <>
      <div className="container page planner screen-only">
        <div className="planner-head">
          <div>
            <h1>Design planner</h1>
            {doc && <p className="muted small">{projectName}{revisionId ? ` · revision ${revisionId}` : ' · not saved yet'}</p>}
          </div>
          {doc && <SaveIndicator status={saveStatus} savedAt={savedAt} revision={project?.revision ?? null} error={saveError?.message ?? null}
            onRetry={() => void save()} onResolve={() => setConflictOpen(true)} onSaveAsNew={saveError?.notFound ? () => void saveAsNew() : undefined} />}
        </div>

        {access?.access === 'read_only' && (
          <Notice tone="warning" title="This project is now view-only">
            The editing period for this account ended{access.endsAt ? ` on ${new Date(access.endsAt).toLocaleDateString()}` : ''}. You can still view,
            download and print the plan. Your orders and support requests are not affected.
          </Notice>
        )}
        {access?.access === 'edit' && access.endsAt && account !== 'guest' && (
          <p className="small muted">You can edit this project until {new Date(access.endsAt).toLocaleDateString()}.</p>
        )}
        {account === 'guest' && (
          <Notice tone="info" title="Guest design">Create an account to save and return to this project. Download your plan before leaving.</Notice>
        )}

        <nav aria-label="Planner steps" className="stepper">
          <ol>
            {steps.map((s) => (
              <li key={s.id}>
                <button type="button" className="step-btn" aria-current={step === s.id ? 'step' : undefined}
                  disabled={s.id !== 'room' && !doc} onClick={() => setStep(s.id)}>
                  {s.label}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        {step === 'room' && (
          <>
            {!doc && recovery && (
              <Notice tone="info" title="Unsaved draft found in this browser">
                <p>From {new Date(recovery.at).toLocaleString()}.</p>
                <button type="button" className="btn btn-secondary" onClick={() => {
                  setHist({ past: [], present: recovery.doc, future: [] });
                  setProjectName(recovery.name);
                  setStep('editor');
                }}>Restore draft</button>
              </Notice>
            )}
            <RoomForm
              initial={doc}
              projectName={projectName}
              unit={unit}
              catalogVersion={catalog.version}
              onUnitChange={setUnit}
              onCancel={doc ? () => setStep('editor') : undefined}
              onSubmit={(d, name) => {
                setProjectName(name);
                nameRef.current = name;
                if (doc) commit(() => d);
                else setHist({ past: [], present: d, future: [] });
                setStep('editor');
              }}
            />
          </>
        )}

        {step !== 'room' && doc && viewDoc && (
          <>
            <div className="toolbar" role="toolbar" aria-label="Design tools">
              <button type="button" className="btn btn-secondary btn-sm" onClick={undo} disabled={hist.past.length === 0} aria-keyshortcuts="Control+Z">↶ Undo</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={redo} disabled={hist.future.length === 0} aria-keyshortcuts="Control+Y">↷ Redo</button>
              <div className="segmented" role="group" aria-label="Display units">
                <button type="button" className="btn btn-sm" aria-pressed={unit === 'in'} onClick={() => setUnit('in')}>in</button>
                <button type="button" className="btn btn-sm" aria-pressed={unit === 'mm'} onClick={() => setUnit('mm')}>mm</button>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={downloadJson}>Download plan (JSON)</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={printSummary}>Print summary</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={startNew}>New design</button>
            </div>

            <p className="room-summary small">
              Room: {walls.map((w) => `${w.id} ${formatLength(w.lengthMm, unit)}`).join(' · ')} · Ceiling{' '}
              {doc.room.ceilingHeightMm === null ? 'unknown' : `${formatLength(doc.room.ceilingHeightMm, unit)} (${doc.room.ceilingSource === 'measured' ? 'measured' : 'suggested, not measured'})`}{' '}
              <button type="button" className="link-btn" onClick={() => setStep('room')}>Edit room</button>
            </p>

            {step === 'editor' && (
              <>
                <div className="editor-grid">
                  <div className="canvas-col">
                    <section className="card" aria-labelledby="plan-h">
                      <h2 id="plan-h" className="h3">Plan view</h2>
                      <div className="plan-wrap">
                        <PlanView doc={viewDoc} skus={skus} unit={unit} selectedId={selectedId} issues={issues} preview={null}
                          onSelect={select}
                          onDrag={(id, offsetMm) => setPreview({ id, offsetMm })}
                          onDragEnd={(id, offsetMm) => { setPreview(null); updateInstance(id, { offsetMm }); }}
                          onNudge={(id, delta) => {
                            const inst = doc.instances.find((i) => i.id === id);
                            if (inst) updateInstance(id, { offsetMm: Math.max(0, inst.offsetMm + delta) });
                          }}
                          onDelete={deleteInstance}
                        />
                      </div>
                      <p className="small muted">
                        Dashed outlines are wall-mounted units. Hatched units have a blocker. Drag a cabinet along its wall, or focus it and use the
                        arrow keys (1 in steps, Shift for 1/8 in). Every action is also available in the table below.
                      </p>
                    </section>
                    <section className="card" aria-labelledby="elev-h">
                      <div className="card-head">
                        <h2 id="elev-h" className="h3">Wall elevation</h2>
                        <label className="inline-field">
                          <span>Wall</span>
                          <select value={elevWall} onChange={(e) => setElevWall(e.target.value)}>
                            {walls.map((w) => <option key={w.id} value={w.id}>{w.id}</option>)}
                          </select>
                        </label>
                      </div>
                      <ElevationView doc={viewDoc} skus={skus} wallId={elevWall} unit={unit} selectedId={selectedId} onSelect={select} />
                    </section>
                  </div>
                  <aside className="side-col">
                    <AddCabinetForm doc={doc} skus={skus} items={items} unit={unit} onAdd={(inst) => {
                      commit((d) => ({ ...d, instances: [...d.instances, inst] }));
                      select(inst.id);
                    }} />
                    <section className="card">
                      <ValidationPanel report={report} source="preview" selectedId={selectedId} onSelectObject={select} />
                    </section>
                  </aside>
                </div>
                <section className="card" aria-label="Object list">
                  <InstanceTable doc={doc} skus={skus} items={items} unit={unit} selectedId={selectedId} issues={issues}
                    onSelect={select} onChange={updateInstance} onDelete={deleteInstance} onDuplicate={duplicateInstance} />
                </section>
                <FixturesPanel doc={doc} unit={unit} issues={issues} onAddOpening={addOpening} onAddAppliance={addAppliance}
                  onChangeOpening={updateOpening} onChangeAppliance={updateAppliance} onDelete={deleteFixture} />
                <div className="btn-row">
                  <button type="button" className="btn btn-secondary" onClick={() => setStep('room')}>Back to room</button>
                  <button type="button" className="btn btn-primary" onClick={() => setStep('estimate')}>Continue to estimate</button>
                </div>
              </>
            )}

            {step === 'estimate' && (
              <section className="card" aria-labelledby="est-h">
                <h2 id="est-h">Step 3: Itemized estimate</h2>
                <EstimatePanel doc={doc} onSelectObject={(id) => { select(id); setStep('editor'); }} />
                {cartState.error && <Notice tone="error" title="Could not build cart">{cartState.error}</Notice>}
                <div className="btn-row">
                  <button type="button" className="btn btn-secondary" onClick={() => setStep('editor')}>Back to layout</button>
                  <button type="button" className="btn btn-primary" onClick={() => void buildCart()} disabled={cartState.busy || doc.instances.length === 0}>
                    {cartState.busy ? 'Building cart…' : 'Build cart from this design'}
                  </button>
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {doc && (
        <PrintSummary doc={doc} skus={skus} unit={unit} projectName={projectName} revisionId={revisionId} report={report} generatedAt={printedAt} />
      )}

      <Dialog open={conflictOpen} title="This design was changed elsewhere" onClose={() => setConflictOpen(false)}
        footer={(
          <>
            <button type="button" className="btn btn-secondary" onClick={() => void resolveLoadLatest()}>Load the latest saved version</button>
            <button type="button" className="btn btn-primary" onClick={() => void resolveKeepMine()}>Keep my version as the newest</button>
          </>
        )}>
        <p>
          Another tab or device saved a newer revision of this project, so your changes were not saved. Nothing has been lost yet.
        </p>
        <ul>
          <li><strong>Load the latest saved version</strong> replaces what you see (you can still Undo back to your version).</li>
          <li><strong>Keep my version</strong> saves your current design as a new revision after the other one.</li>
        </ul>
        <button type="button" className="btn btn-ghost" onClick={downloadJson}>Download my version first (JSON)</button>
      </Dialog>
    </>
  );
}

function SaveIndicator({
  status, savedAt, revision, error, onRetry, onResolve, onSaveAsNew,
}: {
  status: SaveStatus;
  savedAt: Date | null;
  revision: number | null;
  error: string | null;
  onRetry: () => void;
  onResolve: () => void;
  onSaveAsNew?: () => void;
}) {
  let content;
  switch (status) {
    case 'saving': content = <><span aria-hidden="true">⏳ </span>Saving…</>; break;
    case 'saved': content = <><span aria-hidden="true">✓ </span>Saved{savedAt ? ` at ${savedAt.toLocaleTimeString()}` : ''}{revision ? ` (revision ${revision})` : ''}</>; break;
    case 'unsaved': content = <><span aria-hidden="true">● </span>Unsaved changes</>; break;
    case 'offline': content = <><span aria-hidden="true">⚠ </span>Offline: changes kept in this browser <button type="button" className="link-btn" onClick={onRetry}>Retry</button></>; break;
    case 'error': content = (
      <>
        <span aria-hidden="true">⛔ </span>Error saving: {error}{' '}
        <button type="button" className="link-btn" onClick={onRetry}>Retry</button>
        {onSaveAsNew && <> · <button type="button" className="link-btn" onClick={onSaveAsNew}>Save as a new project</button></>}
      </>
    ); break;
    case 'conflict': content = <><span aria-hidden="true">⚠ </span>Save conflict <button type="button" className="link-btn" onClick={onResolve}>Resolve</button></>; break;
    default: content = <>Not saved yet</>;
  }
  return <p className={`save-indicator save-${status}`} role="status" aria-live="polite">{content}</p>;
}
