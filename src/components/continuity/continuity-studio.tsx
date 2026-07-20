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
import { POINT_COSTS, POINT_ACTION_QUOTES } from "@/lib/point-pricing";

type View = "studio" | "assets" | "character" | "review" | "workflow";
type Toast = { title: string; detail: string } | null;

const navItems = [
  { id: "studio" as View, label: "Dựng cảnh", icon: FilmSlateIcon },
  { id: "assets" as View, label: "Tài nguyên", icon: ArchiveBoxIcon },
  { id: "character" as View, label: "Nhân vật", icon: UserFocusIcon },
  { id: "review" as View, label: "Duyệt ảnh", icon: MaskHappyIcon },
  { id: "workflow" as View, label: "Quy trình", icon: GitBranchIcon },
];

const assetKindLabels: Record<AssetKind, string> = {
  character: "Nhân vật",
  look: "Trang phục",
  item: "Vật phẩm",
  environment: "Bối cảnh",
  style: "Phong cách",
};

const policyLabels: Record<ContinuityPolicy, string> = {
  strict: "Nghiêm ngặt",
  balanced: "Cân bằng",
  creative: "Sáng tạo",
};

const assetColors: Record<AssetKind, string> = {
  character: "cyan",
  look: "amber",
  item: "orange",
  environment: "green",
  style: "violet",
};

const variants = [
  "/continuity/scene-02d-variant-1.webp?v=quiet-luxury-20260720",
  "/continuity/scene-02d-variant-2.webp?v=quiet-luxury-20260720",
  "/continuity/scene-02d-variant-3.webp?v=quiet-luxury-20260720",
  "/continuity/scene-02d-variant-4.webp?v=quiet-luxury-20260720",
];

export function ContinuityStudio({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [view, setView] = useState<View>("studio");
  const [selectedVariant, setSelectedVariant] = useState(0);
  const [policy, setPolicy] = useState<ContinuityPolicy>("balanced");
  const [model, setModel] = useState("gemini-3.1-flash-image");
  const [prompt, setPrompt] = useState("Buổi sáng dịu sau mưa trong một con hẻm Sài Gòn thanh lịch. Linh đứng gần cổng xanh ngọc và quay nhẹ về phía Minh; Minh giữ chiếc điện thoại đỏ bằng tay phải. Phong cách quiet luxury editorial, ánh sáng ngọc trai, da thật, bảng màu than chì và xanh patina, hạt phim tinh tế.");
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
      setToast({ title: "Mô hình chưa được mở chính thức", detail: "Nano Banana 2 đang là tuyến tạo ảnh thật; Pro và GPT Image 2 sẽ mở sau khi đánh giá." });
      return;
    }
    const selectedCharacters = characters.slice(0, 2);
    if (selectedCharacters.length === 0) {
      setToast({ title: "Chưa có nhân vật", detail: "Tạo ít nhất một nhân vật có ảnh tham chiếu trước khi tạo ảnh." });
      return;
    }

    const missingReference = selectedCharacters.find((character) => !(character.avatar_url || character.poses[0]?.image_url));
    if (missingReference) {
      setToast({ title: "Thiếu ảnh tham chiếu", detail: `${missingReference.name} chưa có ảnh đại diện hoặc dáng mẫu để giữ tính nhất quán.` });
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
      estimatedCostUsd: POINT_ACTION_QUOTES.meme.providerCostUsd,
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
      setToast({ title: "Đã tạo cú máy", detail: `Hệ thống đã khóa ${result.reference_manifest?.selected ?? sourceCharacters.length} ảnh tham chiếu cho lần tạo này.` });
    } catch (error) {
      setJob((current) => current ? { ...current, status: "failed", progress: current.progress } : current);
      setToast({ title: "Không thể tạo cú máy", detail: error instanceof Error ? error.message : "Vui lòng thử lại." });
    }
  }

  async function saveCurrentShot() {
    const image = generatedVariants[selectedVariant];
    if (!image.startsWith("data:image/")) {
      setToast({ title: "Đây là cú máy mẫu", detail: "Bấm Tạo ảnh để tạo đầu ra thật của dự án trước khi lưu." });
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
      setToast({ title: "Đã lưu cú máy", detail: "Ảnh đầu ra và lịch sử tạo ảnh đã được lưu vào Thư viện." });
    } catch (error) {
      setToast({ title: "Không thể lưu cú máy", detail: error instanceof Error ? error.message : "Vui lòng thử lại." });
    } finally {
      setSaving(false);
    }
  }

  function navigate(next: View) {
    if (next === "workflow" && !expert) {
      setToast({ title: "Quy trình chuyên gia đang khóa", detail: "Bật chế độ Chuyên gia trên thanh đầu để xem sơ đồ xử lý." });
      return;
    }
    setView(next);
  }

  return (
    <main className="app-shell continuity-studio-root">
      <Sidebar active={view} onNavigate={navigate} projectId={projectId} onToast={setToast} />
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
            projectId={projectId}
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
        {view === "workflow" && <ExpertWorkflow onToast={setToast} />}
      </section>
      {toast && <div className="toast" role="status" aria-live="polite"><CheckCircleIcon size={20} weight="fill" /><div><strong>{toast.title}</strong><span>{toast.detail}</span></div></div>}
    </main>
  );
}

function Sidebar({ active, onNavigate, projectId, onToast }: { active: View; onNavigate: (view: View) => void; projectId: string; onToast: (toast: Toast) => void }) {
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
        <button onClick={() => onToast({ title: "Cài đặt dự án", detail: "Cài đặt riêng của cú máy nằm trong Dựng cảnh; cài đặt workspace sẽ được mở ở giai đoạn tiếp theo." })}><GearSixIcon size={21} /><span>Cài đặt</span></button>
        <div className="avatar">AL<span /></div>
      </div>
    </aside>
  );
}

function Topbar({ view, projectName, expert, setExpert, job }: { view: View; projectName: string; expert: boolean; setExpert: (value: boolean) => void; job: GenerationJob | null }) {
  const titles: Record<View, string> = { studio: "Cảnh 02 / Cú máy 02D", assets: "Tài nguyên dự án", character: "Tạo bộ tham chiếu nhân vật", review: "Duyệt & sửa ảnh đầu ra", workflow: "Quy trình cú máy điện ảnh" };
  return (
    <header className="topbar">
      <div className="crumb"><span>{projectName}</span><b>/</b><strong>{titles[view]}</strong><CaretDownIcon size={14} /></div>
      <div className="top-actions">
        <div className="mode-switch" role="group" aria-label="Chế độ sử dụng"><span>Cơ bản</span><button className={expert ? "on" : ""} onClick={() => setExpert(!expert)} aria-label={expert ? "Tắt chế độ chuyên gia" : "Bật chế độ chuyên gia"} aria-pressed={expert}><i /></button><span className={expert ? "selected" : ""}>Chuyên gia</span></div>
        <div className="queue-status"><span className={job?.status === "running" ? "pulse" : ""} /><QueueIcon size={17} /> Hàng đợi <b>{job && !["completed", "cancelled"].includes(job.status) ? 1 : 0}</b></div>
      </div>
    </header>
  );
}

function StudioView(props: {
  projectId: string;
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
  const [framing, setFraming] = useState("Trung cảnh toàn thân");
  const [lens, setLens] = useState("Chân dung 50mm");
  const [aspect, setAspect] = useState("16:9");
  const [resolution, setResolution] = useState("1536 × 1024");
  const [promptAssisting, setPromptAssisting] = useState(false);
  const selectedIngredients = [
    ...props.projectAssets.filter((asset) => asset.kind === "character").slice(0, 2),
    ...assets.slice(2, 6),
  ];

  async function assistPrompt() {
    if (promptAssisting) return;
    setPromptAssisting(true);
    try {
      const response = await fetch("/api/continuity/prompt-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: props.projectId,
          currentPrompt: props.prompt,
          policy: props.policy,
          framing,
          lens,
          aspect,
          ingredients: selectedIngredients.map((asset) => ({
            name: asset.name,
            kind: asset.kind,
            notes: asset.notes,
          })),
        }),
      });
      const result = (await response.json()) as { prompt?: string; summary?: string; error?: string };
      if (!response.ok || !result.prompt) throw new Error(result.error || "AI không trả về chỉ đạo cảnh quay.");
      props.setPrompt(result.prompt);
      props.onToast({
        title: "AI đã tối ưu chỉ đạo cảnh quay",
        detail: result.summary || "Kiểm tra lại nội dung rồi bấm Tạo ảnh.",
      });
    } catch (error) {
      props.onToast({
        title: "Chưa thể dùng trợ lý AI",
        detail: error instanceof Error ? error.message : "Vui lòng thử lại.",
      });
    } finally {
      setPromptAssisting(false);
    }
  }

  return (
    <div className="flow-studio">
      <section className="flow-workspace">
        <div className="flow-canvas-toolbar">
          <div><span className="status-dot" /><strong>Cú máy 02D</strong><span>{props.job?.status === "completed" ? "Vừa tạo xong" : "Chiếc điện thoại đỏ"}</span></div>
          <div>
            <button className="flow-toolbar-button" onClick={props.onSave} disabled={props.saving}><DownloadSimpleIcon size={17} />{props.saving ? "Đang lưu…" : "Lưu"}</button>
            <button className="flow-toolbar-button" onClick={props.onReview}><MagicWandIcon size={17} />Kiểm tra</button>
            <button className="icon-button" onClick={() => setDrawer(drawer === "manifest" ? null : "manifest")} aria-label="Mở danh sách ảnh tham chiếu"><GitBranchIcon size={17} /></button>
          </div>
        </div>

        <div className="flow-canvas">
          <div className="flow-hero-frame">
            <Image src={imageSrc} fill unoptimized={imageSrc.startsWith("data:")} loading="eager" alt="Cú máy giữ nhân vật nhất quán" sizes="(max-width: 1400px) 60vw, 1000px" />
            <div className="safe-guides"><i /><i /></div>
            <div className="canvas-badge"><span className="status-dot" />Sẵn sàng tinh chỉnh</div>
            {props.job && props.job.status !== "completed" && props.job.status !== "cancelled" && (
              <div className="generation-overlay" role="status" aria-live="polite"><CircleNotchIcon className="spin" size={28} /><strong>{props.job.status === "queued" ? "Đang chuẩn bị ảnh tham chiếu" : "Đang tạo các phương án"}</strong><span>{props.job.progress}% · đã khóa danh sách tham chiếu</span><div role="progressbar" aria-label="Tiến độ tạo ảnh" aria-valuemin={0} aria-valuemax={100} aria-valuenow={props.job.progress}><i style={{ width: `${Math.max(props.job.progress, 8)}%` }} /></div></div>
            )}
          </div>
          <div className="flow-variant-strip">
            {props.variants.map((variant, index) => (
              <button key={variant} className={props.selectedVariant === index ? "selected" : ""} onClick={() => props.setSelectedVariant(index)}>
                <Image src={variant} fill unoptimized={variant.startsWith("data:")} loading={index === props.selectedVariant ? "eager" : undefined} alt={`Phương án ${index + 1}`} sizes="180px" /><span>{String(index + 1).padStart(2, "0")}</span>
              </button>
            ))}
            <button className="regenerate-tile" onClick={props.onRun}><ArrowsClockwiseIcon size={18} /><span>Tạo mới</span></button>
          </div>
        </div>

        <div className="flow-composer-wrap">
          <div className="flow-composer">
            <div className="composer-heading">
              <button className="composer-mode" onClick={() => setModeOpen(!modeOpen)} aria-expanded={modeOpen}><SparkleIcon size={16} weight="fill" />Ghép tài nguyên thành ảnh<CaretDownIcon size={13} /></button>
              {modeOpen && <div className="composer-mode-menu"><button className="selected" onClick={() => setModeOpen(false)}><SparkleIcon size={15} />Ghép tài nguyên thành ảnh<span>Tạo một cú máy mới</span></button><button onClick={() => { setModeOpen(false); props.onReview(); }}><MagicWandIcon size={15} />Chỉnh ảnh hiện tại<span>Mở Duyệt & Sửa</span></button></div>}
              <span>{props.model === "gemini-3.1-flash-image" ? "Nano Banana 2" : props.model === "gemini-3-pro-image" ? "Nano Banana Pro" : "GPT Image 2"}</span>
            </div>
            <div className="ingredient-strip">
              {selectedIngredients.map((asset) => (
                <button key={`${asset.id}-${asset.versionId}`} className={`ingredient-chip ${asset.kind}`} onClick={() => props.onAsset(asset)} title={asset.name}>
                  <span><Image src={asset.thumbnail} fill alt={asset.name} sizes="34px" /></span><strong>{asset.name}</strong>
                </button>
              ))}
              <button className="ingredient-add" onClick={() => setDrawer("assets")}><PlusIcon size={16} /><span>Thêm</span></button>
            </div>
            <div className="prompt-assist-row"><strong>Chỉ đạo cảnh quay</strong><button onClick={() => void assistPrompt()} disabled={promptAssisting}>{promptAssisting ? <CircleNotchIcon className="spin" size={14} /> : <RobotIcon size={14} weight="fill" />}{promptAssisting ? "Đang tối ưu…" : "AI hỗ trợ"}</button></div>
            <textarea aria-label="Chỉ đạo cảnh quay" value={props.prompt} onChange={(event) => props.setPrompt(event.target.value)} placeholder="Mô tả hành động, bố cục, góc máy, ánh sáng và cảm xúc…" />
            <div className="composer-footer">
              <div>
                <button onClick={() => setDrawer(drawer === "assets" ? null : "assets")}><PlusIcon size={17} />Tài nguyên</button>
                <button onClick={() => setDrawer(drawer === "settings" ? null : "settings")}><SlidersHorizontalIcon size={17} />Cài đặt</button>
                <button onClick={() => setDrawer(drawer === "manifest" ? null : "manifest")}><GitBranchIcon size={17} />{props.routedCount} ảnh tham chiếu</button>
              </div>
              <span>{props.model === "gemini-3.1-flash-image" ? `${POINT_COSTS.meme} điểm dự án` : "Chỉ thử nghiệm"}</span>
              <button className="composer-run" onClick={props.onRun}><SparkleIcon size={18} weight="fill" />Tạo ảnh</button>
            </div>
          </div>
        </div>

        <ShotTimeline open={timelineOpen} onToggle={() => setTimelineOpen(!timelineOpen)} onToast={props.onToast} />
      </section>

      {drawer && (
        <aside className="flow-context-drawer panel-scroll">
          <div className="drawer-heading">
            <div><span className="eyebrow">CÚ MÁY 02D</span><h2>{drawer === "assets" ? "Tài nguyên" : drawer === "settings" ? "Cài đặt cú máy" : "Danh sách ảnh tham chiếu"}</h2></div>
            <button className="icon-button" onClick={() => setDrawer(null)} aria-label="Đóng bảng"><XIcon size={16} /></button>
          </div>

          {drawer === "assets" && (
            <>
              <label className="drawer-search"><MagnifyingGlassIcon size={16} /><input value={drawerSearch} onChange={(event) => setDrawerSearch(event.target.value)} placeholder="Tìm nhân vật, trang phục, vật phẩm…" /></label>
              <p className="drawer-copy">Chọn một tài nguyên để xem ảnh chuẩn đã khóa và mức độ bao phủ.</p>
              <div className="drawer-asset-grid">
                {props.projectAssets.filter((asset) => asset.name.toLowerCase().includes(drawerSearch.toLowerCase())).map((asset) => <button key={asset.id} onClick={() => props.onAsset(asset)}><span><Image src={asset.thumbnail} fill alt={asset.name} sizes="110px" /></span><strong>{asset.name}</strong><small>{assetKindLabels[asset.kind]} · {asset.referenceCount} ảnh</small></button>)}
              </div>
            </>
          )}

          {drawer === "settings" && (
            <>
              <div className="inspector-section"><h3>Độ nhất quán</h3><div className="segmented">{(["strict", "balanced", "creative"] as ContinuityPolicy[]).map((item) => <button key={item} className={props.policy === item ? "selected" : ""} onClick={() => props.setPolicy(item)}>{policyLabels[item]}</button>)}</div><p>{props.policy === "strict" ? "Ưu tiên nhận diện và vật phẩm đúng tuyệt đối." : props.policy === "balanced" ? "Giữ nhận diện nhưng vẫn linh hoạt về góc máy và ánh sáng." : "Cho phép diễn giải hình ảnh sáng tạo hơn."}</p></div>
              <div className="inspector-section"><h3>Máy quay</h3><label className="drawer-select-row"><span>Cỡ cảnh</span><select value={framing} onChange={(event) => setFraming(event.target.value)}><option value="Cận cảnh">Cận cảnh</option><option value="Trung cảnh toàn thân">Trung cảnh toàn thân</option><option value="Toàn cảnh">Toàn cảnh</option></select></label><label className="drawer-select-row"><span>Ý đồ ống kính</span><select value={lens} onChange={(event) => setLens(event.target.value)}><option value="Biên tập 35mm">Biên tập 35mm</option><option value="Chân dung 50mm">Chân dung 50mm</option><option value="Nén cảnh 85mm">Nén cảnh 85mm</option></select></label><label className="drawer-select-row"><span>Tỷ lệ khung hình</span><select value={aspect} onChange={(event) => setAspect(event.target.value)}><option>16:9</option><option>4:5</option><option>1:1</option></select></label></div>
              <div className="inspector-section"><h3>Đầu ra</h3><label className="select-label">Mô hình<select value={props.model} onChange={(event) => props.setModel(event.target.value)}><option value="gemini-3.1-flash-image">Nano Banana 2 · Đang dùng</option><option value="gemini-3-pro-image">Nano Banana Pro · Đang thử nghiệm</option><option value="gpt-image-2">GPT Image 2 · Chỉ sửa ảnh</option></select></label><label className="drawer-select-row"><span>Độ phân giải</span><select value={resolution} onChange={(event) => setResolution(event.target.value)}><option>1536 × 1024</option><option>2K</option><option>4K</option></select></label></div>
            </>
          )}

          {drawer === "manifest" && (
            <>
              <div className="manifest-summary"><GitBranchIcon size={19} /><div><strong>Đã chọn {props.routedCount} ảnh tham chiếu</strong><span>{props.droppedCount ? `${props.droppedCount} ảnh bị loại kèm lý do` : "Không có ảnh nào bị loại"}</span></div></div>
              <div className="manifest-list">{selectedIngredients.map((asset, index) => <button key={asset.id} onClick={() => props.onAsset(asset)}><span><Image src={asset.thumbnail} fill alt={asset.name} sizes="40px" /></span><div><strong>{asset.name}</strong><small>{index < 2 ? "Ảnh chuẩn nhận diện" : asset.kind === "style" ? "Tham chiếu phong cách" : `${assetKindLabels[asset.kind]} chính xác`}</small></div><b>#{index + 1}</b></button>)}</div>
              <button className="secondary full" onClick={() => props.onToast({ title: "Đã xác minh danh sách", detail: "Mỗi ảnh tham chiếu đều được khóa phiên bản và mã băm cho lần tạo này." })}>Kiểm tra chi tiết định tuyến</button>
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
      <div className="flow-timeline-heading"><button onClick={onToggle}><CaretDownIcon size={15} /><FilmSlateIcon size={17} /><strong>Cảnh 02 — Cuộc bàn giao</strong><span>5 cú máy</span></button><div><button aria-label="Đổi kiểu hiển thị dòng thời gian" onClick={() => onToast({ title: "Dạng dải phim", detail: "Cảnh 02 đang dùng chế độ sáng tạo gọn." })}><GridFourIcon size={16} /></button><button onClick={() => onToast({ title: "Đã tạo bản nháp cú máy", detail: "Cú máy mới sẽ kế thừa ảnh đã duyệt và các ảnh chuẩn đã khóa." })}><PlusIcon size={16} />Thêm cú máy</button></div></div>
      {open && <div className="flow-shot-track">
        {shots.map((shot) => <button key={shot.id} className={`flow-shot-card ${shot.code === selectedShot ? "active" : ""}`} aria-label={`${shot.code} · ${shot.title} · ${shot.status === "approved" ? "Đã duyệt" : shot.status === "needs_review" ? "Cần duyệt" : "Bản nháp"}`} onClick={() => setSelectedShot(shot.code)}><span><Image src={shot.thumbnail} fill alt={shot.title} sizes="132px" /><b>{shot.code}</b></span><div><strong>{shot.title}</strong><small>{shot.camera} · {shot.lens}</small></div><i className={`shot-status ${shot.status}`} /></button>)}
        <button className="flow-add-shot" onClick={() => onToast({ title: "Đã tạo bản nháp cú máy", detail: "Cú máy mới sẽ kế thừa ảnh đã duyệt và các ảnh chuẩn đã khóa." })}><PlusIcon size={18} /><span>Thêm cú máy</span></button>
      </div>}
    </div>
  );
}

function SelectRow({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
  return <button className="drawer-row" onClick={onClick}><span>{label}</span><strong>{value}</strong><CaretDownIcon size={13} /></button>;
}

function AssetLibrary(props: { visibleAssets: Asset[]; selectedAsset: Asset; setSelectedAsset: (asset: Asset) => void; filter: AssetKind | "all"; setFilter: (filter: AssetKind | "all") => void; search: string; setSearch: (value: string) => void; onCreateCharacter: () => void; onToast: (toast: Toast) => void }) {
  const filters: Array<AssetKind | "all"> = ["all", "character", "look", "item", "environment", "style"];
  return (
    <div className="library-layout">
      <section className="library-main">
        <div className="page-title"><div><span className="eyebrow">MIDNIGHT COURIER</span><h1>Thư viện tài nguyên</h1><p>Ảnh chuẩn đã khóa giúp mọi cú máy giữ đúng nhân vật và vật phẩm.</p></div><div><button className="secondary" onClick={props.onCreateCharacter}><DownloadSimpleIcon size={17} /> Nhập ảnh tham chiếu</button><button className="primary" onClick={props.onCreateCharacter}><PlusIcon size={17} /> Thêm nhân vật</button></div></div>
        <div className="library-toolbar"><label><MagnifyingGlassIcon size={17} /><input value={props.search} onChange={(event) => props.setSearch(event.target.value)} placeholder="Tìm tài nguyên" aria-label="Tìm tài nguyên" /></label><div className="filter-tabs">{filters.map((filter) => <button key={filter} className={props.filter === filter ? "selected" : ""} onClick={() => props.setFilter(filter)}>{filter === "all" ? "Tất cả" : assetKindLabels[filter]}</button>)}</div></div>
        <div className="asset-grid">{props.visibleAssets.map((asset) => <button key={asset.id} className={`asset-card ${props.selectedAsset.id === asset.id ? "selected" : ""}`} onClick={() => props.setSelectedAsset(asset)}><div className="asset-card-image"><Image src={asset.thumbnail} fill alt={asset.name} sizes="260px" /><span className={`type-dot ${assetColors[asset.kind]}`} />{asset.isSample ? <i>Mẫu</i> : asset.status === "locked" && <i><LockSimpleIcon size={13} weight="fill" /> Đã khóa</i>}</div><div className="asset-card-copy"><strong>{asset.name}</strong><span>{assetKindLabels[asset.kind]} · {asset.referenceCount} ảnh</span><div><em style={{ width: `${asset.coverage}%` }} /><small>{asset.coverage}% bao phủ</small></div></div></button>)}</div>
      </section>
      <aside className="asset-detail panel-scroll"><div className="detail-hero"><Image src={props.selectedAsset.thumbnail} fill alt={props.selectedAsset.name} sizes="340px" /></div><div className="detail-title"><span className={`type-dot ${assetColors[props.selectedAsset.kind]}`} /><div><small>{assetKindLabels[props.selectedAsset.kind]}</small><h2>{props.selectedAsset.name}</h2></div><button aria-label="Sao chép mã tài nguyên" onClick={() => { void navigator.clipboard.writeText(props.selectedAsset.id); props.onToast({ title: "Đã sao chép mã tài nguyên", detail: props.selectedAsset.id }); }}><CopyIcon size={17} /></button></div><div className="locked-banner"><LockSimpleIcon size={17} weight="fill" /><div><strong>Ảnh chuẩn nhận diện đã khóa</strong><span>Đang dùng trong 6 phiên bản cú máy</span></div></div><dl><div><dt>Mã tài nguyên</dt><dd>{props.selectedAsset.id}</dd></div><div><dt>Phiên bản</dt><dd>{props.selectedAsset.versionId}</dd></div><div><dt>Ảnh tham chiếu</dt><dd>{props.selectedAsset.referenceCount} ảnh</dd></div><div><dt>Bao phủ</dt><dd>{props.selectedAsset.coverage}%</dd></div></dl><div className="notes-card"><span>Ghi chú nhất quán</span><p>{props.selectedAsset.notes}</p></div><div className="detail-actions"><button className="secondary" onClick={() => props.onToast({ title: "Đã thêm vào Cú máy 02D", detail: `${props.selectedAsset.name} đã được thêm vào danh sách nháp.` })}>Thêm vào cú máy</button><button className="primary" onClick={() => props.onToast({ title: "Đã tạo phiên bản mới", detail: "Ảnh chuẩn đã khóa vẫn giữ nguyên trong các cú máy đã duyệt." })}>Tạo phiên bản mới</button></div></aside>
    </div>
  );
}

function CharacterBuilder({ projectId, onBack, onToast }: { projectId: string; onBack: () => void; onToast: (toast: Toast) => void }) {
  const [step, setStep] = useState(1);
  const steps = ["Bộ ảnh tham chiếu", "Kiểm tra chất lượng", "Hồ sơ nhận diện", "Khóa nhân vật"];
  function openCharacterLibrary() {
    onToast({ title: "Mở Thư viện nhân vật", detail: "Tải ảnh thật và lưu phiên bản được thực hiện trong thư viện nhân vật hiện tại." });
    window.location.assign(`/projects/${projectId}/characters`);
  }
  return (
    <div className="builder-page">
      <div className="builder-header"><button className="icon-button" onClick={onBack} aria-label="Quay lại"><ArrowLeftIcon size={19} /></button><div><span className="eyebrow">TẠO BỘ THAM CHIẾU · BẢN HƯỚNG DẪN</span><h1>Tạo nhân vật nhất quán</h1></div></div>
      <div className="stepper">{steps.map((label, index) => <button key={label} className={step === index + 1 ? "active" : step > index + 1 ? "done" : ""} onClick={() => setStep(index + 1)}><span>{step > index + 1 ? <CheckCircleIcon size={16} weight="fill" /> : index + 1}</span><strong>{label}</strong></button>)}</div>
      <div className="builder-content">
        <section className="builder-main">
          {step === 1 && <ReferencePack onToast={onToast} />}
          {step === 2 && <QualityCheck />}
          {step === 3 && <IdentityCard />}
          {step === 4 && <LockCharacter />}
        </section>
        <aside className="builder-help"><RobotIcon size={24} weight="duotone" /><h3>Hướng dẫn ảnh tham chiếu</h3><p>Dùng ánh sáng trung tính, ít bộ lọc và các góc máy khác nhau. Ảnh gốc luôn là ảnh chuẩn nhận diện.</p><ul><li><CheckCircleIcon /> Chân dung chính diện</li><li><CheckCircleIcon /> Góc ba phần tư</li><li><CheckCircleIcon /> Góc nghiêng</li><li><CheckCircleIcon /> Toàn thân</li></ul><div className="coverage-ring"><strong>92%</strong><span>Bao phủ</span></div></aside>
      </div>
      <footer className="builder-footer"><button className="secondary" onClick={step === 1 ? onBack : () => setStep(step - 1)}>Quay lại</button><span>Bước {step}/4</span><button className="primary" onClick={() => { if (step < 4) setStep(step + 1); else openCharacterLibrary(); }}>{step === 4 ? <><LockSimpleIcon size={17} /> Mở Thư viện nhân vật thật</> : <>Tiếp tục <CaretDownIcon size={14} className="caret-right" /></>}</button></footer>
    </div>
  );
}

function ReferencePack({ onToast }: { onToast: (toast: Toast) => void }) {
  const refs = [{ name: "Chân dung chính diện", image: "/continuity/linh-master.webp?v=quiet-luxury-20260720" }, { name: "Góc ba phần tư", image: "/continuity/linh-three-quarter.webp?v=quiet-luxury-20260720" }, { name: "Góc nghiêng", image: "/continuity/linh-profile.webp?v=quiet-luxury-20260720" }, { name: "Toàn thân", image: "/continuity/linh-full-body.webp?v=quiet-luxury-20260720" }];
  return <><div className="section-intro"><h2>Tải bộ ảnh tham chiếu</h2><p>Bốn góc khác nhau cung cấp đủ bằng chứng nhận diện mà không làm quá tải một cú máy.</p></div><div className="reference-grid">{refs.map((ref) => <button key={ref.name} onClick={() => onToast({ title: ref.name, detail: "Đây là ảnh mẫu trong bản hướng dẫn. Mở Thư viện nhân vật thật ở bước 4 để thay ảnh." })}><span><Image src={ref.image} fill alt={ref.name} sizes="250px" /></span><strong>{ref.name}</strong><small><CheckCircleIcon size={14} weight="fill" /> Sẵn sàng · 2048px</small></button>)}</div><button className="upload-more" onClick={() => onToast({ title: "Ảnh tham chiếu phụ", detail: "Mở Thư viện nhân vật thật ở bước 4 để tải ảnh của dự án." })}><PlusIcon size={19} /><span>Thêm ảnh tham chiếu phụ</span></button></>;
}

function QualityCheck() {
  const [hairAllowed, setHairAllowed] = useState(false);
  const checks = [{ label: "Khuôn mặt rõ", value: "Đạt" }, { label: "Đủ góc chụp", value: "Đạt" }, { label: "Khớp nhận diện", value: "Đạt" }, { label: "Tóc nhất quán", value: hairAllowed ? "Đạt" : "Cần xem" }];
  return <><div className="section-intro"><h2>Kiểm tra chất lượng ảnh</h2><p>Hệ thống đánh dấu nguy cơ sai lệch trước khi nhân vật được dùng để tạo ảnh.</p></div><div className="quality-preview"><div><Image src="/continuity/linh-contact-sheet.webp?v=quiet-luxury-20260720" fill alt="Bảng ảnh tham chiếu của Linh" sizes="520px" /></div><ul>{checks.map((check) => <li key={check.label}><span>{check.value === "Đạt" ? <CheckCircleIcon weight="fill" /> : <WarningCircleIcon weight="fill" />}{check.label}</span><strong className={check.value === "Đạt" ? "pass" : "review"}>{check.value}</strong></li>)}</ul></div><div className="review-callout"><WarningCircleIcon size={20} weight="fill" /><div><strong>Kiểm tra khác biệt kiểu tóc</strong><span>{hairAllowed ? "Tóc vén sau tai đã được ghi nhận là thay đổi được phép." : "Ảnh góc nghiêng có tóc vén sau tai. Đánh dấu đây là thay đổi được phép hoặc thay ảnh khác."}</span></div><button disabled={hairAllowed} onClick={() => setHairAllowed(true)}>{hairAllowed ? "Đã cho phép" : "Cho phép"}</button></div></>;
}

function IdentityCard() {
  return <><div className="section-intro"><h2>Duyệt hồ sơ nhận diện</h2><p>Các ràng buộc này sẽ được đưa vào mọi cú máy ở chế độ Nghiêm ngặt và Cân bằng.</p></div><div className="identity-layout"><div className="identity-preview"><Image src="/continuity/linh-master.webp?v=quiet-luxury-20260720" fill alt="Ảnh chuẩn nhận diện của Linh" sizes="320px" /></div><div className="identity-fields"><label>Tên nhân vật<input defaultValue="Linh" /></label><label>Tóm tắt nhận diện<textarea defaultValue="Phụ nữ Việt Nam khoảng 25 tuổi, khuôn mặt trái xoan, da trung bình tông ấm, mắt đen hình hạnh nhân và tóc bob ngắn màu đen." /></label><div className="invariant-columns"><label>Phải giữ nguyên<textarea defaultValue={"Tỷ lệ khuôn mặt\nKhoảng cách hai mắt\nĐường hàm\nMàu da\nTỷ lệ cơ thể"} /></label><label>Được thay đổi<textarea defaultValue={"Biểu cảm\nTrang điểm\nTrang phục\nTư thế\nKiểu tóc"} /></label></div></div></div></>;
}

function LockCharacter() {
  return <><div className="section-intro"><h2>Khóa Linh làm ảnh chuẩn nhận diện</h2><p>Mọi cập nhật sau này sẽ tạo phiên bản mới. Các cú máy đã duyệt luôn trỏ về đúng ảnh chuẩn từng dùng.</p></div><div className="lock-summary"><div className="lock-image"><Image src="/continuity/linh-contact-sheet.webp?v=quiet-luxury-20260720" fill alt="Bảng ảnh của Linh" sizes="520px" /></div><div><span className="success-icon"><LockSimpleIcon size={26} weight="fill" /></span><h3>Sẵn sàng khóa</h3><p>Đã có 4 ảnh gốc, 1 Hồ sơ nhận diện có cấu trúc và đủ xác nhận quyền sử dụng.</p><label className="consent"><input type="checkbox" defaultChecked /> Tôi xác nhận dự án có quyền sử dụng các hình ảnh này.</label><dl><div><dt>Phiên bản chuẩn</dt><dd>char_linh_v1</dd></div><div><dt>Bao phủ</dt><dd>92%</dd></div><div><dt>Trạng thái sau khi khóa</dt><dd>Sẵn sàng</dd></div></dl></div></div></>;
}

function ReviewRepair({ selectedVariant, reviewVariants, reviewAssets, onBack, onToast }: { selectedVariant: number; reviewVariants: string[]; reviewAssets: Asset[]; onBack: () => void; onToast: (toast: Toast) => void }) {
  const [selectedFinding, setSelectedFinding] = useState("f2");
  const [repaired, setRepaired] = useState(false);
  const [hasRepair, setHasRepair] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [approved, setApproved] = useState(false);
  const [repairAction, setRepairAction] = useState("restore_look");
  const [brush, setBrush] = useState(48);
  const [preserveIdentity, setPreserveIdentity] = useState(true);
  const [preserveComposition, setPreserveComposition] = useState(true);

  async function runRepair() {
    setRepairing(true);
    await new Promise((resolve) => window.setTimeout(resolve, 550));
    setRepairing(false);
    setRepaired(true);
    setHasRepair(true);
    setApproved(false);
    onToast({ title: "Bản thử thao tác sửa ảnh", detail: "Giao diện đã sẵn sàng; bộ kết nối GPT Image 2 chưa được bật chính thức." });
  }

  async function approveOutput() {
    setApproved(true);
    onToast({ title: "Bản thử thao tác duyệt ảnh", detail: "Dữ liệu duyệt sẽ được lưu khi hệ thống phiên bản cú máy được bật." });
  }
  return (
    <div className="review-layout">
      <section className="review-main">
        <div className="review-toolbar"><button className="secondary" onClick={onBack}><ArrowLeftIcon size={17} /> Quay lại cú máy</button><div><button className="icon-button" aria-label="Hoàn tác bản sửa" disabled={!repaired} onClick={() => setRepaired(false)}><ArrowCounterClockwiseIcon size={17} /></button><button className="icon-button" aria-label="Làm lại bản sửa" disabled={!hasRepair || repaired} onClick={() => setRepaired(true)}><ArrowsClockwiseIcon size={17} /></button><span>Phương án {selectedVariant + 1} · v3</span></div></div>
        <div className="compare-stage"><div className="compare-image"><Image src={repaired ? "/continuity/scene-02d-repaired.webp?v=quiet-luxury-20260720" : reviewVariants[selectedVariant]} unoptimized={reviewVariants[selectedVariant]?.startsWith("data:")} fill loading="eager" alt="Ảnh đầu ra hiện tại" sizes="900px" /><div className="mask-mark" style={{ width: brush * 1.45, height: brush * 1.15 }} /></div><div className="master-rail"><span>SO VỚI ẢNH CHUẨN</span>{reviewAssets.slice(0, 4).map((asset) => <button key={asset.id}><Image src={asset.thumbnail} fill alt={asset.name} sizes="90px" /><b>{asset.name}</b></button>)}</div></div>
        <div className="before-after"><div><span>Trước khi sửa</span><Image src={reviewVariants[selectedVariant]} unoptimized={reviewVariants[selectedVariant]?.startsWith("data:")} fill alt="Trước khi sửa" sizes="360px" /></div><i><ArrowsClockwiseIcon size={20} /></i><div><span>Sau khi sửa</span><Image src={repaired ? "/continuity/scene-02d-repaired.webp?v=quiet-luxury-20260720" : reviewVariants[selectedVariant]} unoptimized={!repaired && reviewVariants[selectedVariant]?.startsWith("data:")} fill alt="Bản xem trước sau khi sửa" sizes="360px" /></div></div>
      </section>
      <aside className="findings-panel panel-scroll"><div className="panel-heading"><div><span className="eyebrow">AI HỖ TRỢ KIỂM TRA · BẢN THỬ</span><h2>Phát hiện về tính nhất quán</h2></div><span className="finding-count">{continuityFindings.filter((finding) => finding.status !== "pass").length} vấn đề</span></div><div className="finding-list">{continuityFindings.map((finding) => <button key={finding.id} className={`${finding.status} ${selectedFinding === finding.id ? "selected" : ""}`} onClick={() => setSelectedFinding(finding.id)}><span>{finding.status === "pass" ? <CheckCircleIcon weight="fill" /> : <WarningCircleIcon weight="fill" />}</span><div><strong>{finding.title}</strong><p>{finding.detail}</p><small>{finding.status === "pass" ? "Đạt" : finding.status === "review" ? "Cần xem" : "Lỗi"}</small></div></button>)}</div><div className="repair-tools"><h3>Sửa vấn đề đã chọn</h3><label>Thao tác<select value={repairAction} onChange={(event) => setRepairAction(event.target.value)}><option value="restore_look">Khôi phục trang phục</option><option value="restore_item">Khôi phục điện thoại đỏ</option><option value="repair_face">Sửa khuôn mặt</option><option value="fix_environment">Sửa bối cảnh</option></select></label><label>Cỡ cọ<div className="range-row"><input type="range" min="24" max="84" value={brush} onChange={(event) => setBrush(Number(event.target.value))} aria-label={`Cỡ cọ ${brush}`} /><b>{brush}</b></div></label><div className="toggle-row"><span><strong>Giữ nhận diện</strong><small>Giữ các đặc điểm khuôn mặt đã khóa</small></span><button className={preserveIdentity ? "on" : ""} onClick={() => setPreserveIdentity(!preserveIdentity)} aria-label="Giữ nhận diện" aria-pressed={preserveIdentity}><i /></button></div><div className="toggle-row"><span><strong>Giữ bố cục</strong><small>Giữ cỡ cảnh và tư thế</small></span><button className={preserveComposition ? "on" : ""} onClick={() => setPreserveComposition(!preserveComposition)} aria-label="Giữ bố cục" aria-pressed={preserveComposition}><i /></button></div><button className="primary full" disabled={repairing} onClick={() => void runRepair()}>{repairing ? <CircleNotchIcon size={18} className="spin" /> : <MagicWandIcon size={18} />} {repairing ? "Đang sửa…" : repaired ? "Sửa lại lần nữa" : "Sửa vùng đã chọn"}</button></div><button className={`approve-button ${approved ? "approved" : ""}`} disabled={approved} onClick={() => void approveOutput()}><CheckCircleIcon size={18} weight="fill" /> {approved ? "Đã duyệt · ảnh cha continuity" : "Duyệt ảnh đầu ra"}</button></aside>
    </div>
  );
}

function ExpertWorkflow({ onToast }: { onToast: (toast: Toast) => void }) {
  return <div className="expert-page"><div className="page-title"><div><span className="eyebrow">CHỈ DÀNH CHO CHUYÊN GIA</span><h1>Quy trình cú máy điện ảnh</h1><p>Các nút xử lý có kiểu dữ liệu và được cho phép sẵn. Chế độ Cơ bản chỉ hiển thị những trường đầu vào, đầu ra đã chọn.</p></div><div><button className="secondary" onClick={() => onToast({ title: "Đã mở cấu hình Cơ bản", detail: "Các checkbox bên trái quyết định trường nào xuất hiện trong Dựng cảnh." })}><SquaresFourIcon size={17} /> Cấu hình chế độ Cơ bản</button><button className="primary" onClick={() => onToast({ title: "Đã lưu quy trình v1.0.0", detail: "Bản thử giữ nguyên sơ đồ an toàn và các đầu vào đang hiển thị." })}><GitBranchIcon size={17} /> Lưu quy trình v1.0.0</button></div></div><div className="workflow-shell"><aside><div className="workflow-note"><LockSimpleIcon size={18} weight="fill" /><div><strong>Sơ đồ an toàn</strong><span>Đã tắt mã tùy ý và các nút chưa đăng ký.</span></div></div><h3>Đầu vào hiển thị</h3>{["Dàn nhân vật", "Trang phục", "Vật phẩm", "Bối cảnh", "Chỉ đạo", "Máy quay", "Đầu ra"].map((label) => <label key={label}><input type="checkbox" defaultChecked /> {label}</label>)}<h3>Chính sách chạy</h3><SelectRow label="Khi có lỗi" value="Duyệt thủ công" onClick={() => onToast({ title: "Chính sách khi có lỗi", detail: "Bản MVP luôn yêu cầu duyệt thủ công trước khi tiếp tục." })} /><SelectRow label="Số lần thử lại" value="1 lần" onClick={() => onToast({ title: "Số lần thử lại", detail: "Worker thử lại tối đa một lần để tránh phát sinh chi phí ngoài dự kiến." })} /></aside><WorkflowGraph /></div></div>;
}
