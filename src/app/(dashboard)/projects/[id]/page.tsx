"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { notFound, useParams } from "next/navigation";
import { ArrowRight, CalendarClock, Users } from "lucide-react";
import Alert from "@/components/ui/alert";
import Button, { buttonClasses } from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import { PageContainer, Skeleton } from "@/components/ui/page";
import { useProject } from "@/lib/use-store";
import HomeComposer, { type ComposerPreset } from "../_components/home-composer";
import HomeFeedList from "../_components/home-feed-list";
import { useHomeFeed } from "../_components/use-home-feed";

export default function ProjectOverviewPage() {
  const params = useParams();
  const projectId = params.id as string;
  const { project, loading: projectLoading } = useProject(projectId);
  const feed = useHomeFeed();
  const [preset, setPreset] = useState<ComposerPreset | null>(null);
  const [overview, setOverview] = useState<{
    characterCount: number;
    outputCount: number;
    weeklyOutputCount: number;
    characters: {
      id: string;
      name: string;
      avatar_url: string | null;
      poses: { id: string; image_url: string }[];
    }[];
    recentOutputs: {
      id: string;
      title: string | null;
      original_idea: string;
      generated_content: { headline?: string };
      image_url: string | null;
    }[];
    activeJobs: { id: string; status: string }[];
    productionRuns: {
      id: string;
      status: string;
      phase: string;
      error: string | null;
      source: string;
    }[];
  } | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  // Trước đây mọi lỗi tải đều rơi về `null`, mà `null` lại không phân biệt được
  // với "kênh trống" — nên chỉ cần một lần chập mạng là một kênh đang có
  // nhân vật và bài lại hiện thẻ "Bắt đầu với nhân vật đầu tiên".
  const [overviewFailed, setOverviewFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/projects/${projectId}/overview`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setOverview(data);
          setOverviewFailed(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setOverview(null);
          setOverviewFailed(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setOverviewLoading(false);
      });
    return () => controller.abort();
  }, [projectId, reloadToken]);

  const characters = overview?.characters ?? [];
  const loading = projectLoading || overviewLoading;

  if (projectLoading) {
    return (
      <PageContainer width="wide">
        <div role="status" aria-label="Đang tải" className="mx-auto max-w-3xl space-y-4 pt-4 sm:pt-12">
          <Skeleton className="mx-auto h-10 w-80 rounded-lg" />
          <Skeleton className="h-44 rounded-3xl" />
        </div>
      </PageContainer>
    );
  }

  if (!project) notFound();

  const channelItems = feed.items.filter((item) => item.projectId === project.id);
  const retryOverview = () => {
    setOverviewLoading(true);
    setOverviewFailed(false);
    setReloadToken((token) => token + 1);
  };

  return (
    <PageContainer width="wide">
      <div className="relative mx-auto mb-14 max-w-3xl pt-4 sm:pt-12">
        <div aria-hidden className="pointer-events-none absolute inset-x-[-30%] -top-24 h-[420px] th-glow" />
        <div className="relative">
          <HomeComposer projects={[project]} onStarted={feed.reload} preset={preset} lockChannel />
          {feed.autopilot[project.id] && (
            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs th-text-tertiary">
              <CalendarClock size={12} className="th-text-accent" /> {feed.autopilot[project.id]}
            </p>
          )}
        </div>
      </div>

      <div className="mb-10">
        <HomeFeedList
          items={channelItems}
          loading={feed.loading}
          failed={feed.failed}
          onRemix={(item) => setPreset({ kind: item.kind, projectId: item.projectId, format: item.format, nonce: Date.now() })}
        />
      </div>

      <section aria-labelledby="cast-title">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="cast-title" className="text-base font-semibold th-text-primary">Nhân vật</h2>
          {characters.length > 0 && (
            <Link href={`/projects/${projectId}/characters`} className={buttonClasses("ghost", "sm")}>
              Xem tất cả <ArrowRight size={14} />
            </Link>
          )}
        </div>
        {overviewFailed ? (
          <Alert
            action={<Button variant="outline" size="sm" onClick={retryOverview}>Thử lại</Button>}
          >
            Chưa tải được danh sách nhân vật.
          </Alert>
        ) : loading ? (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {[1, 2, 3].map((item) => <Skeleton key={item} className="aspect-square" />)}
          </div>
        ) : characters.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Kênh chưa có nhân vật"
            hint="Có nhân vật thì bài nào cũng đúng một gương mặt. AIDA vẽ giúp, hoặc dùng ảnh của bạn."
            action={
              <Link href={`/projects/${projectId}/characters`} className={buttonClasses("primary", "sm")}>
                Tạo nhân vật
              </Link>
            }
          />
        ) : (
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {characters.map((character) => {
              const image = character.avatar_url || character.poses[0]?.image_url;
              return (
                <li key={character.id}>
                  <Link href={`/projects/${projectId}/characters/${character.id}`} className="group block">
                    <span className="relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl border th-border th-bg-tertiary text-lg font-semibold th-text-muted">
                      {image && !image.startsWith("/mock/") ? (
                        <Image src={image} alt="" fill sizes="160px" className="object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
                      ) : (
                        character.name.slice(0, 1).toUpperCase()
                      )}
                    </span>
                    <span className="mt-1.5 block truncate text-center text-sm font-medium th-text-primary">{character.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </PageContainer>
  );
}
