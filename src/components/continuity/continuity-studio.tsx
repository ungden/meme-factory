"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArchiveBoxIcon,
  ArrowCounterClockwiseIcon,
  ArrowLeftIcon,
  ArrowsClockwiseIcon,
  CaretDownIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  CopyIcon,
  DownloadSimpleIcon,
  FilmSlateIcon,
  GearSixIcon,
  GitBranchIcon,
  GridFourIcon,
  LockSimpleIcon,
  MagicWandIcon,
  MagnifyingGlassIcon,
  MaskHappyIcon,
  PlusIcon,
  QueueIcon,
  RobotIcon,
  SlidersHorizontalIcon,
  SparkleIcon,
  SquaresFourIcon,
  UserFocusIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { assets, continuityFindings, shots } from "@/lib/continuity/studio-data";
import type { Asset, AssetKind, ContinuityPolicy, GenerationJob } from "@/lib/continuity/studio-types";
import { WorkflowGraph } from "./workflow-graph";
import { generateImage, useCharacters, useMemes } from "@/lib/use-store";
import { compressImageToBase64 } from "@/lib/image-utils";

type View = "studio" | "assets" | "character" | "review" | "workflow";
type Toast = { title: string; detail: string } | null;

const navItems = [
  { id: "studio" as View, label: "Studio", icon: FilmSlateIcon },
  { id: "assets" as View, label: "Assets", icon: ArchiveBoxIcon },
  { id: "character" as View, label: "Characters", icon: UserFocusIcon },
  { id: "review" as View, label: "Review", icon: MaskHappyIcon },
  { id: "workflow" as View, label: "Workflow", icon: GitBranchIcon },
];

const assetColors: Record<AssetKind, string> = {
  character: "cyan",
  look: "amber",
  item: "orange",
  environment: "green",
  style: "violet",
};

const variants = [
  "/continuity/scene-02d-variant-1.webp",
  "/continuity/scene-02d-variant-2.webp",
  "/continuity/scene-02d-variant-3.webp",
  "/continuity/scene-02d-variant-4.webp",
];

export function ContinuityStudio({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [view, setView] = useState<View>("studio");
  const [selectedVariant, setSelectedVariant] = useState(0);
  const [policy, setPolicy] = useState<ContinuityPolicy>("balanced");
  const [model, setModel] = useState("gemini-3.1-flash-image");
  const [prompt, setPrompt] = useState("Cinematic night in a wet Saigon alley. Linh turns toward Minh while he holds the red phone. Premium fashion editorial, rain reflections, realistic skin, restrained color grade.");
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [expert, setExpert] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset>(assets[0]);
  const [assetFilter, setAssetFilter] = useState<AssetKind | "all">("all");
  const [search, setSearch] = useState("");
  const [generatedVariants, setGeneratedVariants] = useState<string[]>(variants);
  const [generationRequestId, setGenerationRequestId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [manifestSummary, setManifestSummary] = useState<{ selected: number; dropped: number } | null>(null);
  const { characters } = useCharacters(projectId);
  const { saveMeme } = useMemes(projectId);

  const projectAssets = useMemo<Asset[]>(() => {
    const characterAssets = characters.map((character, index) => ({
      id: character.id,
      versionId: character.continuity_asset_id ? `${character.continuity_asset_id}:latest` : `${character.id}:legacy`,
      name: character.name,
      kind: "character" as const,
      status: (character.avatar_url || character.poses.length ? "locked" : "draft") as Asset["status"],
      thumbnail: character.avatar_url || (character.poses[0]?.image_url?.startsWith("/mock/") ? assets[index % 2].thumbnail : character.poses[0]?.image_url) || assets[index % 2].thumbnail,
      coverage: Math.min(100, 35 + character.poses.length * 15 + (character.avatar_url ? 20 : 0)),
      referenceCount: character.poses.length + (character.avatar_url ? 1 : 0),
      notes: [character.description, character.personality].filter(Boolean).join(" · ") || "Chưa có ghi chú continuity.",
    }));
    return characterAssets.length > 0 ? [...characterAssets, ...assets.slice(2)] : assets;
  }, [characters]);

  const visibleAssets = projectAssets.filter((asset) => {
    const matchesKind = assetFilter === "all" || asset.kind === assetFilter;
    return matchesKind && asset.name.toLowerCase().includes(search.toLowerCase());
  });

  useEffect(() => {
    if (!job || job.status === "completed" || job.status === "cancelled" || job.status === "failed") return;
    const timer = window.setTimeout(async () => {
      const response = await fetch(`/api/continuity/jobs/${job.id}`);
      if (response.ok) setJob(await response.json());
    }, 850);
    return () => window.clearTimeout(timer);
  }, [job]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function runGeneration() {
    setView("studio");
    if (model !== "gemini-3.1-flash-image") {
      setToast({ title: "Model chưa được mở cho production", detail: "Nano Banana 2 đang là route thật; Pro và GPT Image 2 sẽ mở sau benchmark." });
      return;
    }
    const selectedCharacters = characters.slice(0, 2);
    if (selectedCharacters.length === 0) {
      setToast({ title: "Chưa có nhân vật", detail: "Tạo ít nhất một nhân vật có ảnh ref trước khi Run shot." });
      return;
    }

    const missingReference = selectedCharacters.find((character) => !(character.avatar_url || character.poses[0]?.image_url));
    if (missingReference) {
      setToast({ title: "Thiếu ảnh reference", detail: `${missingReference.name} chưa có avatar hoặc pose để giữ continuity.` });
      return;
    }

    const startedAt = new Date().toISOString();
    setJob({
      id: crypto.randomUUID(),
      status: "running",
      progress: 44,
      recipe: {
        shotVersionId: "draft",
        provider: "google",
        model,
        prompt,
        references: [],
        droppedReferences: [],
        policy,
        output: { width: 1536, height: 1024, quality: "standard", count: 1 },
      },
      estimatedCostUsd: 0,
      createdAt: startedAt,
    });

    try {
      const sourceCharacters = await Promise.all(selectedCharacters.map(async (character) => {
        const selectedPose = character.poses[0];
        const referenceUrl = character.avatar_url || selectedPose?.image_url;
        const response = await fetch(referenceUrl!);
        if (!response.ok) throw new Error(`Không thể tải ảnh ref của ${character.name}`);
        const inline = await compressImageToBase64(await response.blob());
        return {
          name: character.name,
          emotion: selectedPose?.emotion || "neutral",
          description: [character.description, character.personality].filter(Boolean).join(". "),
          characterId: character.id,
          poseId: selectedPose?.id,
          poseImageBase64: inline.base64,
          poseMimeType: inline.mimeType,
        };
      }));

      const result = await generateImage({
        project_id: projectId,
        type: "meme",
        headline: "",
        tone: "fashion editorial",
        textPosition: "top",
        characters: sourceCharacters,
        format: "16:9",
        customPrompt: prompt,
        watermark: { enabled: false },
      });

      if (result.error || !result.image) throw new Error(result.error || "Không nhận được ảnh từ provider");
      const output = `data:image/png;base64,${result.image}`;
      setGeneratedVariants((current) => [output, ...current].slice(0, 4));
      setSelectedVariant(0);
      setGenerationRequestId(result.generation_request_id || null);
      setManifestSummary({
        selected: result.reference_manifest?.selected ?? sourceCharacters.length,
        dropped: result.reference_manifest?.dropped.length ?? 0,
      });
      setJob((current) => current ? { ...current, status: "completed", progress: 100 } : current);
      setToast({ title: "Shot đã tạo", detail: `Manifest thật đã khóa ${result.reference_manifest?.selected ?? sourceCharacters.length} ảnh reference.` });
    } catch (error) {
      setJob((current) => current ? { ...current, status: "failed", progress: current.progress } : current);
      setToast({ title: "Không thể tạo shot", detail: error instanceof Error ? error.message : "Vui lòng thử lại." });
    }
  }

  async function saveCurrentShot() {
    const image = generatedVariants[selectedVariant];
    if (!image.startsWith("data:image/")) {
      setToast({ title: "Đây là shot mẫu", detail: "Bấm Run shot để tạo output thật của dự án trước khi lưu." });
      return;
    }
    setSaving(true);
    try {
      await saveMeme({
        original_idea: prompt,
        generated_content: {
          headline: "Fashion continuity shot",
          caption: prompt,
          layout_suggestion: { text_position: "top", character_positions: [] },
          tone: "fashion editorial",
        },
        selected_characters: characters.slice(0, 2).map((character) => ({
          character_id: character.id,
          character_name: character.name,
          pose_id: character.poses[0]?.id || "",
          pose_name: character.poses[0]?.name || "Identity master",
          emotion: character.poses[0]?.emotion || "neutral",
        })),
        format: "16:9",
        has_watermark: false,
        image_base64: image,
        generation_request_id: generationRequestId,
      });
      setToast({ title: "Đã lưu shot", detail: "Output và generation lineage đã được lưu vào Gallery." });
    } catch (error) {
      setToast({ title: "Không thể lưu shot", detail: error instanceof Error ? error.message : "Vui lòng thử lại." });
    } finally {
      setSaving(false);
    }
  }

  function navigate(next: View) {
    if (next === "workflow" && !expert) {
      setToast({ title: "Expert Workflow is locked", detail: "Enable Expert mode in the top bar to inspect the typed graph." });
      return;
    }
    setView(next);
  }

  return (
    <main className="app-shell continuity-studio-root">
      <Sidebar active={view} onNavigate={navigate} projectId={projectId} />
      <section className="app-main">
        <Topbar
          view={view}
          projectName={projectName}
          expert={expert}
          setExpert={(value) => { setExpert(value); if (!value && view === "workflow") setView("studio"); }}
          job={job}
        />

        {view === "studio" && (
          <StudioView
            prompt={prompt}
            setPrompt={setPrompt}
            policy={policy}
            setPolicy={setPolicy}
            model={model}
            setModel={setModel}
            selectedVariant={selectedVariant}
            setSelectedVariant={setSelectedVariant}
            routedCount={manifestSummary?.selected ?? (4 + projectAssets.filter((asset) => asset.kind === "character").slice(0, 2).length)}
            droppedCount={manifestSummary?.dropped ?? 0}
            job={job}
            variants={generatedVariants}
            projectAssets={projectAssets}
            onRun={runGeneration}
            onSave={saveCurrentShot}
            saving={saving}
            onReview={() => setView("review")}
            onAsset={(asset) => { setSelectedAsset(asset); setView("assets"); }}
            onToast={setToast}
          />
        )}
        {view === "assets" && (
          <AssetLibrary
            visibleAssets={visibleAssets}
            selectedAsset={selectedAsset}
            setSelectedAsset={setSelectedAsset}
            filter={assetFilter}
            setFilter={setAssetFilter}
            search={search}
            setSearch={setSearch}
            onCreateCharacter={() => setView("character")}
            onToast={setToast}
          />
        )}
        {view === "character" && <CharacterBuilder projectId={projectId} onBack={() => setView("assets")} onToast={setToast} />}
        {view === "review" && <ReviewRepair selectedVariant={selectedVariant} reviewVariants={generatedVariants} reviewAssets={projectAssets} onBack={() => setView("studio")} onToast={setToast} />}
        {view === "workflow" && <ExpertWorkflow />}
      </section>
      {toast && <div className="toast"><CheckCircleIcon size={20} weight="fill" /><div><strong>{toast.title}</strong><span>{toast.detail}</span></div></div>}
    </main>
  );
}

function Sidebar({ active, onNavigate, projectId }: { active: View; onNavigate: (view: View) => void; projectId: string }) {
  return (
    <aside className="sidebar">
      <Link className="brand" href={`/projects/${projectId}`} aria-label="Quay lại tổng quan dự án"><span>C</span></Link>
      <nav>
        {navItems.map((item) => {
          const Icon = item.icon;
          return <button key={item.id} className={active === item.id ? "active" : ""} onClick={() => onNavigate(item.id)}><Icon size={21} weight={active === item.id ? "fill" : "regular"} /><span>{item.label}</span></button>;
        })}
      </nav>
      <div className="sidebar-bottom">
        <button><GearSixIcon size={21} /><span>Settings</span></button>
        <div className="avatar">AL<span /></div>
      </div>
    </aside>
  );
}

function Topbar({ view, projectName, expert, setExpert, job }: { view: View; projectName: string; expert: boolean; setExpert: (value: boolean) => void; job: GenerationJob | null }) {
  const titles: Record<View, string> = { studio: "Scene 02 / Shot 02D", assets: "Project Assets", character: "Character Reference Builder", review: "Output Review & Repair", workflow: "Cinematic Shot Workflow" };
  return (
    <header className="topbar">
      <div className="crumb"><span>{projectName}</span><b>/</b><strong>{titles[view]}</strong><CaretDownIcon size={14} /></div>
      <div className="top-actions">
        <label className="mode-switch"><span>App</span><button className={expert ? "on" : ""} onClick={() => setExpert(!expert)} aria-label="Toggle Expert mode"><i /></button><span className={expert ? "selected" : ""}>Expert</span></label>
        <div className="queue-status"><span className={job?.status === "running" ? "pulse" : ""} /><QueueIcon size={17} /> Queue <b>{job && !["completed", "cancelled"].includes(job.status) ? 1 : 0}</b></div>
      </div>
    </header>
  );
}

function StudioView(props: {
  prompt: string; setPrompt: (value: string) => void; policy: ContinuityPolicy; setPolicy: (value: ContinuityPolicy) => void;
  model: string; setModel: (value: string) => void; selectedVariant: number; setSelectedVariant: (value: number) => void;
  routedCount: number; droppedCount: number; job: GenerationJob | null; variants: string[]; projectAssets: Asset[]; onRun: () => void; onSave: () => void; saving: boolean; onReview: () => void;
  onAsset: (asset: Asset) => void; onToast: (toast: Toast) => void;
}) {
  const imageSrc = props.variants[props.selectedVariant];
  const [drawer, setDrawer] = useState<"assets" | "settings" | "manifest" | null>(null);
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [modeOpen, setModeOpen] = useState(false);
  const [drawerSearch, setDrawerSearch] = useState("");
  const [framing, setFraming] = useState("Medium full");
  const [lens, setLens] = useState("50mm portrait");
  const [aspect, setAspect] = useState("16:9");
  const [resolution, setResolution] = useState("1536 × 1024");
  const selectedIngredients = [
    ...props.projectAssets.filter((asset) => asset.kind === "character").slice(0, 2),
    ...assets.slice(2, 6),
  ];

  return (
    <div className="flow-studio">
      <section className="flow-workspace">
        <div className="flow-canvas-toolbar">
          <div><span className="status-dot" /><strong>Shot 02D</strong><span>{props.job?.status === "completed" ? "Generated just now" : "The red phone"}</span></div>
          <div>
            <button className="flow-toolbar-button" onClick={props.onSave} disabled={props.saving}><DownloadSimpleIcon size={17} />{props.saving ? "Saving…" : "Save"}</button>
            <button className="flow-toolbar-button" onClick={props.onReview}><MagicWandIcon size={17} />Review</button>
            <button className="icon-button" onClick={() => setDrawer(drawer === "manifest" ? null : "manifest")} aria-label="Open reference manifest"><GitBranchIcon size={17} /></button>
          </div>
        </div>

        <div className="flow-canvas">
          <div className="flow-hero-frame">
            <Image src={imageSrc} fill unoptimized={imageSrc.startsWith("data:")} loading="eager" alt="Generated continuity shot" sizes="(max-width: 1400px) 60vw, 1000px" />
            <div className="safe-guides"><i /><i /></div>
            <div className="canvas-badge"><span className="status-dot" />Ready to refine</div>
            {props.job && props.job.status !== "completed" && props.job.status !== "cancelled" && (
              <div className="generation-overlay"><CircleNotchIcon className="spin" size={28} /><strong>{props.job.status === "queued" ? "Preparing references" : "Generating variants"}</strong><span>{props.job.progress}% · manifest locked</span><div><i style={{ width: `${Math.max(props.job.progress, 8)}%` }} /></div></div>
            )}
          </div>
          <div className="flow-variant-strip">
            {props.variants.map((variant, index) => (
              <button key={variant} className={props.selectedVariant === index ? "selected" : ""} onClick={() => props.setSelectedVariant(index)}>
                <Image src={variant} fill unoptimized={variant.startsWith("data:")} loading={index === props.selectedVariant ? "eager" : undefined} alt={`Generated variant ${index + 1}`} sizes="180px" /><span>{String(index + 1).padStart(2, "0")}</span>
              </button>
            ))}
            <button className="regenerate-tile" onClick={props.onRun}><ArrowsClockwiseIcon size={18} /><span>New</span></button>
          </div>
        </div>

        <div className="flow-composer-wrap">
          <div className="flow-composer">
            <div className="composer-heading">
              <button className="composer-mode" onClick={() => setModeOpen(!modeOpen)} aria-expanded={modeOpen}><SparkleIcon size={16} weight="fill" />Ingredients to image<CaretDownIcon size={13} /></button>
              {modeOpen && <div className="composer-mode-menu"><button className="selected" onClick={() => setModeOpen(false)}><SparkleIcon size={15} />Ingredients to image<span>Generate a new shot</span></button><button onClick={() => { setModeOpen(false); props.onReview(); }}><MagicWandIcon size={15} />Edit current output<span>Open Review & Repair</span></button></div>}
              <span>{props.model === "gemini-3.1-flash-image" ? "Nano Banana 2" : props.model === "gemini-3-pro-image" ? "Nano Banana Pro" : "GPT Image 2"}</span>
            </div>
            <div className="ingredient-strip">
              {selectedIngredients.map((asset) => (
                <button key={`${asset.id}-${asset.versionId}`} className={`ingredient-chip ${asset.kind}`} onClick={() => props.onAsset(asset)} title={asset.name}>
                  <span><Image src={asset.thumbnail} fill alt={asset.name} sizes="34px" /></span><strong>{asset.name}</strong>
                </button>
              ))}
              <button className="ingredient-add" onClick={() => setDrawer("assets")}><PlusIcon size={16} /><span>Add</span></button>
            </div>
            <textarea aria-label="Shot direction" value={props.prompt} onChange={(event) => props.setPrompt(event.target.value)} placeholder="Describe the shot, action, camera and mood…" />
            <div className="composer-footer">
              <div>
                <button onClick={() => setDrawer(drawer === "assets" ? null : "assets")}><PlusIcon size={17} />Ingredients</button>
                <button onClick={() => setDrawer(drawer === "settings" ? null : "settings")}><SlidersHorizontalIcon size={17} />Settings</button>
                <button onClick={() => setDrawer(drawer === "manifest" ? null : "manifest")}><GitBranchIcon size={17} />{props.routedCount} refs</button>
              </div>
              <span>{props.model === "gemini-3.1-flash-image" ? "5 project pts" : "Benchmark only"}</span>
              <button className="composer-run" onClick={props.onRun}><SparkleIcon size={18} weight="fill" />Generate</button>
            </div>
          </div>
        </div>

        <ShotTimeline open={timelineOpen} onToggle={() => setTimelineOpen(!timelineOpen)} onToast={props.onToast} />
      </section>

      {drawer && (
        <aside className="flow-context-drawer panel-scroll">
          <div className="drawer-heading">
            <div><span className="eyebrow">SHOT 02D</span><h2>{drawer === "assets" ? "Ingredients" : drawer === "settings" ? "Shot settings" : "Reference manifest"}</h2></div>
            <button className="icon-button" onClick={() => setDrawer(null)} aria-label="Close drawer"><XIcon size={16} /></button>
          </div>

          {drawer === "assets" && (
            <>
              <label className="drawer-search"><MagnifyingGlassIcon size={16} /><input value={drawerSearch} onChange={(event) => setDrawerSearch(event.target.value)} placeholder="Search characters, looks, items…" /></label>
              <p className="drawer-copy">Click an ingredient to inspect its locked master and coverage.</p>
              <div className="drawer-asset-grid">
                {props.projectAssets.filter((asset) => asset.name.toLowerCase().includes(drawerSearch.toLowerCase())).map((asset) => <button key={asset.id} onClick={() => props.onAsset(asset)}><span><Image src={asset.thumbnail} fill alt={asset.name} sizes="110px" /></span><strong>{asset.name}</strong><small>{asset.kind} · {asset.referenceCount} refs</small></button>)}
              </div>
            </>
          )}

          {drawer === "settings" && (
            <>
              <div className="inspector-section"><h3>Continuity</h3><div className="segmented">{(["strict", "balanced", "creative"] as ContinuityPolicy[]).map((item) => <button key={item} className={props.policy === item ? "selected" : ""} onClick={() => props.setPolicy(item)}>{item}</button>)}</div><p>{props.policy === "strict" ? "Prioritize identity and exact items." : props.policy === "balanced" ? "Preserve identity with room for camera and light." : "Allow broader visual reinterpretation."}</p></div>
              <div className="inspector-section"><h3>Camera</h3><label className="drawer-select-row"><span>Framing</span><select value={framing} onChange={(event) => setFraming(event.target.value)}><option>Close up</option><option>Medium full</option><option>Wide shot</option></select></label><label className="drawer-select-row"><span>Lens intent</span><select value={lens} onChange={(event) => setLens(event.target.value)}><option>35mm editorial</option><option>50mm portrait</option><option>85mm compression</option></select></label><label className="drawer-select-row"><span>Aspect ratio</span><select value={aspect} onChange={(event) => setAspect(event.target.value)}><option>16:9</option><option>4:5</option><option>1:1</option></select></label></div>
              <div className="inspector-section"><h3>Output</h3><label className="select-label">Model<select value={props.model} onChange={(event) => props.setModel(event.target.value)}><option value="gemini-3.1-flash-image">Nano Banana 2 · Live</option><option value="gemini-3-pro-image">Nano Banana Pro · Benchmark</option><option value="gpt-image-2">GPT Image 2 · Repair only</option></select></label><label className="drawer-select-row"><span>Resolution</span><select value={resolution} onChange={(event) => setResolution(event.target.value)}><option>1536 × 1024</option><option>2K</option><option>4K</option></select></label></div>
            </>
          )}

          {drawer === "manifest" && (
            <>
              <div className="manifest-summary"><GitBranchIcon size={19} /><div><strong>{props.routedCount} references selected</strong><span>{props.droppedCount ? `${props.droppedCount} dropped with reasons` : "No references dropped"}</span></div></div>
              <div className="manifest-list">{selectedIngredients.map((asset, index) => <button key={asset.id} onClick={() => props.onAsset(asset)}><span><Image src={asset.thumbnail} fill alt={asset.name} sizes="40px" /></span><div><strong>{asset.name}</strong><small>{index < 2 ? "Identity master" : asset.kind === "style" ? "Style reference" : `Exact ${asset.kind}`}</small></div><b>#{index + 1}</b></button>)}</div>
              <button className="secondary full" onClick={() => props.onToast({ title: "Manifest verified", detail: "Every reference is versioned and hash-locked for this run." })}>Verify routing details</button>
            </>
          )}
        </aside>
      )}
    </div>
  );
}

function ShotTimeline({ open, onToggle, onToast }: { open: boolean; onToggle: () => void; onToast: (toast: Toast) => void }) {
  const [selectedShot, setSelectedShot] = useState("02D");
  return (
    <div className={`flow-timeline ${open ? "open" : ""}`}>
      <div className="flow-timeline-heading"><button onClick={onToggle}><CaretDownIcon size={15} /><FilmSlateIcon size={17} /><strong>Scene 02 — The handoff</strong><span>5 shots</span></button><div><button aria-label="Change timeline view" onClick={() => onToast({ title: "Filmstrip view", detail: "Scene 02 is already using the compact creator view." })}><GridFourIcon size={16} /></button><button onClick={() => onToast({ title: "Shot draft created", detail: "A new shot will inherit the approved parent and locked masters." })}><PlusIcon size={16} />Add shot</button></div></div>
      {open && <div className="flow-shot-track">
        {shots.map((shot) => <button key={shot.id} className={`flow-shot-card ${shot.code === selectedShot ? "active" : ""}`} onClick={() => setSelectedShot(shot.code)}><span><Image src={shot.thumbnail} fill alt={shot.title} sizes="132px" /><b>{shot.code}</b></span><div><strong>{shot.title}</strong><small>{shot.camera} · {shot.lens}</small></div><i className={`shot-status ${shot.status}`} /></button>)}
        <button className="flow-add-shot" onClick={() => onToast({ title: "Shot draft created", detail: "A new shot will inherit the approved parent and locked masters." })}><PlusIcon size={18} /><span>Add shot</span></button>
      </div>}
    </div>
  );
}

function SelectRow({ label, value }: { label: string; value: string }) {
  return <button className="drawer-row"><span>{label}</span><strong>{value}</strong><CaretDownIcon size={13} /></button>;
}

function AssetLibrary(props: { visibleAssets: Asset[]; selectedAsset: Asset; setSelectedAsset: (asset: Asset) => void; filter: AssetKind | "all"; setFilter: (filter: AssetKind | "all") => void; search: string; setSearch: (value: string) => void; onCreateCharacter: () => void; onToast: (toast: Toast) => void }) {
  const filters: Array<AssetKind | "all"> = ["all", "character", "look", "item", "environment", "style"];
  return (
    <div className="library-layout">
      <section className="library-main">
        <div className="page-title"><div><span className="eyebrow">MIDNIGHT COURIER</span><h1>Asset Library</h1><p>Locked visual masters that keep every shot on-model.</p></div><div><button className="secondary"><DownloadSimpleIcon size={17} /> Import</button><button className="primary" onClick={props.onCreateCharacter}><PlusIcon size={17} /> New character</button></div></div>
        <div className="library-toolbar"><label><MagnifyingGlassIcon size={17} /><input value={props.search} onChange={(event) => props.setSearch(event.target.value)} placeholder="Search assets" /></label><div className="filter-tabs">{filters.map((filter) => <button key={filter} className={props.filter === filter ? "selected" : ""} onClick={() => props.setFilter(filter)}>{filter === "all" ? "All assets" : filter}</button>)}</div><button className="icon-button"><SlidersHorizontalIcon size={18} /></button></div>
        <div className="asset-grid">{props.visibleAssets.map((asset) => <button key={asset.id} className={`asset-card ${props.selectedAsset.id === asset.id ? "selected" : ""}`} onClick={() => props.setSelectedAsset(asset)}><div className="asset-card-image"><Image src={asset.thumbnail} fill alt={asset.name} sizes="260px" /><span className={`type-dot ${assetColors[asset.kind]}`} />{asset.isSample ? <i>Sample</i> : asset.status === "locked" && <i><LockSimpleIcon size={13} weight="fill" /> Locked</i>}</div><div className="asset-card-copy"><strong>{asset.name}</strong><span>{asset.kind} · {asset.referenceCount} refs</span><div><em style={{ width: `${asset.coverage}%` }} /><small>{asset.coverage}% coverage</small></div></div></button>)}</div>
      </section>
      <aside className="asset-detail panel-scroll"><div className="detail-hero"><Image src={props.selectedAsset.thumbnail} fill alt={props.selectedAsset.name} sizes="340px" /></div><div className="detail-title"><span className={`type-dot ${assetColors[props.selectedAsset.kind]}`} /><div><small>{props.selectedAsset.kind}</small><h2>{props.selectedAsset.name}</h2></div><button><CopyIcon size={17} /></button></div><div className="locked-banner"><LockSimpleIcon size={17} weight="fill" /><div><strong>Identity master locked</strong><span>Used by 6 shot versions</span></div></div><dl><div><dt>Asset ID</dt><dd>{props.selectedAsset.id}</dd></div><div><dt>Version</dt><dd>{props.selectedAsset.versionId}</dd></div><div><dt>References</dt><dd>{props.selectedAsset.referenceCount} images</dd></div><div><dt>Coverage</dt><dd>{props.selectedAsset.coverage}%</dd></div></dl><div className="notes-card"><span>Continuity notes</span><p>{props.selectedAsset.notes}</p></div><div className="detail-actions"><button className="secondary" onClick={() => props.onToast({ title: "Added to Shot 02D", detail: `${props.selectedAsset.name} is now part of the draft manifest.` })}>Add to shot</button><button className="primary" onClick={() => props.onToast({ title: "New version created", detail: "The locked master remains unchanged in approved shots." })}>Create new version</button></div></aside>
    </div>
  );
}

function CharacterBuilder({ projectId, onBack, onToast }: { projectId: string; onBack: () => void; onToast: (toast: Toast) => void }) {
  const [step, setStep] = useState(1);
  const steps = ["Reference pack", "Quality check", "Identity card", "Lock character"];
  function openCharacterLibrary() {
    onToast({ title: "Mở Character Library", detail: "Upload thật và lưu version được thực hiện trong thư viện nhân vật hiện tại." });
    window.location.assign(`/projects/${projectId}/characters`);
  }
  return (
    <div className="builder-page">
      <div className="builder-header"><button className="icon-button" onClick={onBack}><ArrowLeftIcon size={19} /></button><div><span className="eyebrow">REFERENCE BUILDER · GUIDED PREVIEW</span><h1>Build a consistent identity</h1></div></div>
      <div className="stepper">{steps.map((label, index) => <button key={label} className={step === index + 1 ? "active" : step > index + 1 ? "done" : ""} onClick={() => setStep(index + 1)}><span>{step > index + 1 ? <CheckCircleIcon size={16} weight="fill" /> : index + 1}</span><strong>{label}</strong></button>)}</div>
      <div className="builder-content">
        <section className="builder-main">
          {step === 1 && <ReferencePack />}
          {step === 2 && <QualityCheck />}
          {step === 3 && <IdentityCard />}
          {step === 4 && <LockCharacter />}
        </section>
        <aside className="builder-help"><RobotIcon size={24} weight="duotone" /><h3>Reference guidance</h3><p>Use neutral light, minimal filters and distinct camera angles. Original photos remain the identity masters.</p><ul><li><CheckCircleIcon /> Front portrait</li><li><CheckCircleIcon /> Three-quarter view</li><li><CheckCircleIcon /> Side profile</li><li><CheckCircleIcon /> Full body</li></ul><div className="coverage-ring"><strong>92%</strong><span>Coverage</span></div></aside>
      </div>
      <footer className="builder-footer"><button className="secondary" onClick={step === 1 ? onBack : () => setStep(step - 1)}>Back</button><span>Step {step} of 4</span><button className="primary" onClick={() => { if (step < 4) setStep(step + 1); else openCharacterLibrary(); }}>{step === 4 ? <><LockSimpleIcon size={17} /> Open real Character Library</> : <>Continue <CaretDownIcon size={14} className="caret-right" /></>}</button></footer>
    </div>
  );
}

function ReferencePack() {
  const refs = [{ name: "Front portrait", image: "/continuity/linh-master.webp" }, { name: "Three-quarter", image: "/continuity/linh-three-quarter.webp" }, { name: "Side profile", image: "/continuity/linh-profile.webp" }, { name: "Full body", image: "/continuity/linh-full-body.webp" }];
  return <><div className="section-intro"><h2>Upload the reference pack</h2><p>Four distinct angles give the router enough identity evidence without overloading a shot.</p></div><div className="reference-grid">{refs.map((ref) => <button key={ref.name}><span><Image src={ref.image} fill alt={ref.name} sizes="250px" /></span><strong>{ref.name}</strong><small><CheckCircleIcon size={14} weight="fill" /> Ready · 2048px</small></button>)}</div><button className="upload-more"><PlusIcon size={19} /><span>Add supporting reference</span></button></>;
}

function QualityCheck() {
  const checks = [{ label: "Face visibility", value: "Pass" }, { label: "Angle coverage", value: "Pass" }, { label: "Identity match", value: "Pass" }, { label: "Hair consistency", value: "Review" }];
  return <><div className="section-intro"><h2>Reference quality check</h2><p>The system flags likely drift before this character is used in production.</p></div><div className="quality-preview"><div><Image src="/continuity/linh-contact-sheet.webp" fill alt="Linh reference contact sheet" sizes="520px" /></div><ul>{checks.map((check) => <li key={check.label}><span>{check.value === "Pass" ? <CheckCircleIcon weight="fill" /> : <WarningCircleIcon weight="fill" />}{check.label}</span><strong className={check.value === "Pass" ? "pass" : "review"}>{check.value}</strong></li>)}</ul></div><div className="review-callout"><WarningCircleIcon size={20} weight="fill" /><div><strong>Review hairstyle variation</strong><span>The side-profile image has tucked hair. Mark it as allowed styling or replace the image.</span></div><button>Mark allowed</button></div></>;
}

function IdentityCard() {
  return <><div className="section-intro"><h2>Review the Identity Card</h2><p>These constraints will be compiled into every strict and balanced shot.</p></div><div className="identity-layout"><div className="identity-preview"><Image src="/continuity/linh-master.webp" fill alt="Linh identity master" sizes="320px" /></div><div className="identity-fields"><label>Character name<input defaultValue="Linh" /></label><label>Identity summary<textarea defaultValue="Vietnamese woman in her mid-20s with an oval face, warm medium skin, almond-shaped dark eyes and a short black bob." /></label><div className="invariant-columns"><label>Must preserve<textarea defaultValue={"Facial proportions\nEye spacing\nJawline\nSkin tone\nBody proportions"} /></label><label>May change<textarea defaultValue={"Expression\nMakeup\nOutfit\nPose\nHair styling"} /></label></div></div></div></>;
}

function LockCharacter() {
  return <><div className="section-intro"><h2>Lock Linh as Identity Master</h2><p>Future updates create new versions. Existing approved shots always point to the exact master used.</p></div><div className="lock-summary"><div className="lock-image"><Image src="/continuity/linh-contact-sheet.webp" fill alt="Linh contact sheet" sizes="520px" /></div><div><span className="success-icon"><LockSimpleIcon size={26} weight="fill" /></span><h3>Ready to lock</h3><p>4 original references, 1 structured Identity Card and all required rights confirmations are present.</p><label className="consent"><input type="checkbox" defaultChecked /> I confirm the workspace has permission to use these images.</label><dl><div><dt>Master version</dt><dd>char_linh_v1</dd></div><div><dt>Coverage</dt><dd>92%</dd></div><div><dt>Status after lock</dt><dd>Ready</dd></div></dl></div></div></>;
}

function ReviewRepair({ selectedVariant, reviewVariants, reviewAssets, onBack, onToast }: { selectedVariant: number; reviewVariants: string[]; reviewAssets: Asset[]; onBack: () => void; onToast: (toast: Toast) => void }) {
  const [selectedFinding, setSelectedFinding] = useState("f3");
  const [repaired, setRepaired] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [approved, setApproved] = useState(false);
  const [repairAction, setRepairAction] = useState("restore_item");
  const [brush, setBrush] = useState(48);
  const [preserveIdentity, setPreserveIdentity] = useState(true);
  const [preserveComposition, setPreserveComposition] = useState(true);

  async function runRepair() {
    setRepairing(true);
    await new Promise((resolve) => window.setTimeout(resolve, 550));
    setRepairing(false);
    setRepaired(true);
    setApproved(false);
    onToast({ title: "Repair interaction preview", detail: "UI đã sẵn sàng; GPT Image 2 adapter chưa được bật trên production." });
  }

  async function approveOutput() {
    setApproved(true);
    onToast({ title: "Approval interaction preview", detail: "Approval persistence will turn on with shot versioning." });
  }
  return (
    <div className="review-layout">
      <section className="review-main">
        <div className="review-toolbar"><button className="secondary" onClick={onBack}><ArrowLeftIcon size={17} /> Back to shot</button><div><button className="icon-button"><ArrowCounterClockwiseIcon size={17} /></button><button className="icon-button"><ArrowsClockwiseIcon size={17} /></button><span>Variant {selectedVariant + 1} · v3</span></div></div>
        <div className="compare-stage"><div className="compare-image"><Image src={repaired ? "/continuity/scene-02d-repaired.webp" : reviewVariants[selectedVariant]} unoptimized={reviewVariants[selectedVariant]?.startsWith("data:")} fill loading="eager" alt="Current shot output" sizes="900px" /><div className="mask-mark" style={{ width: brush * 1.45, height: brush * 1.15 }} /></div><div className="master-rail"><span>COMPARE MASTERS</span>{reviewAssets.slice(0, 4).map((asset) => <button key={asset.id}><Image src={asset.thumbnail} fill alt={asset.name} sizes="90px" /><b>{asset.name}</b></button>)}</div></div>
        <div className="before-after"><div><span>Before repair</span><Image src={reviewVariants[selectedVariant]} unoptimized={reviewVariants[selectedVariant]?.startsWith("data:")} fill alt="Before repair" sizes="360px" /></div><i><ArrowsClockwiseIcon size={20} /></i><div><span>After repair</span><Image src={repaired ? "/continuity/scene-02d-repaired.webp" : reviewVariants[selectedVariant]} unoptimized={!repaired && reviewVariants[selectedVariant]?.startsWith("data:")} fill alt="After repair preview" sizes="360px" /></div></div>
      </section>
      <aside className="findings-panel panel-scroll"><div className="panel-heading"><div><span className="eyebrow">ASSISTED REVIEW · PREVIEW</span><h2>Continuity findings</h2></div><span className="finding-count">2 issues</span></div><div className="finding-list">{continuityFindings.map((finding) => <button key={finding.id} className={`${finding.status} ${selectedFinding === finding.id ? "selected" : ""}`} onClick={() => setSelectedFinding(finding.id)}><span>{finding.status === "pass" ? <CheckCircleIcon weight="fill" /> : <WarningCircleIcon weight="fill" />}</span><div><strong>{finding.title}</strong><p>{finding.detail}</p><small>{finding.status}</small></div></button>)}</div><div className="repair-tools"><h3>Repair selected issue</h3><label>Action<select value={repairAction} onChange={(event) => setRepairAction(event.target.value)}><option value="restore_item">Restore red phone</option><option value="restore_look">Restore look</option><option value="repair_face">Repair face</option><option value="fix_environment">Fix environment</option></select></label><label>Brush size<div className="range-row"><input type="range" min="24" max="84" value={brush} onChange={(event) => setBrush(Number(event.target.value))} /><b>{brush}</b></div></label><div className="toggle-row"><span><strong>Preserve identity</strong><small>Keep locked facial traits</small></span><button className={preserveIdentity ? "on" : ""} onClick={() => setPreserveIdentity(!preserveIdentity)}><i /></button></div><div className="toggle-row"><span><strong>Preserve composition</strong><small>Keep framing and pose</small></span><button className={preserveComposition ? "on" : ""} onClick={() => setPreserveComposition(!preserveComposition)}><i /></button></div><button className="primary full" disabled={repairing} onClick={() => void runRepair()}>{repairing ? <CircleNotchIcon size={18} className="spin" /> : <MagicWandIcon size={18} />} {repairing ? "Repairing…" : repaired ? "Run repair again" : "Run selected repair"}</button></div><button className={`approve-button ${approved ? "approved" : ""}`} disabled={approved} onClick={() => void approveOutput()}><CheckCircleIcon size={18} weight="fill" /> {approved ? "Approved · continuity parent" : "Approve output"}</button></aside>
    </div>
  );
}

function ExpertWorkflow() {
  return <div className="expert-page"><div className="page-title"><div><span className="eyebrow">EXPERT ONLY</span><h1>Cinematic Shot Workflow</h1><p>Typed, whitelisted nodes. App Mode exposes only the selected input and output fields.</p></div><div><button className="secondary"><SquaresFourIcon size={17} /> Configure App Mode</button><button className="primary"><GitBranchIcon size={17} /> Save workflow v1.0.0</button></div></div><div className="workflow-shell"><aside><div className="workflow-note"><LockSimpleIcon size={18} weight="fill" /><div><strong>Safe graph</strong><span>Custom code and unregistered nodes are disabled.</span></div></div><h3>Exposed inputs</h3>{["Cast", "Look", "Item", "Environment", "Prompt", "Camera", "Output"].map((label) => <label key={label}><input type="checkbox" defaultChecked /> {label}</label>)}<h3>Run policy</h3><SelectRow label="Fallback" value="Manual review" /><SelectRow label="Retry limit" value="1 attempt" /></aside><WorkflowGraph /></div></div>;
}
