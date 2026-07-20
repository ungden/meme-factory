import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Link, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import type { Project } from "@/types/models";
import { Card, Screen, Subtle, Title } from "@/components/ui";
import { useDeferredTask } from "@/hooks/use-deferred-task";

const actions = [
  { href: "generate", title: "Tạo Meme", description: "Brief, generate content, render ảnh, lưu gallery" },
  { href: "gallery", title: "Bộ sưu tập", description: "Xem ảnh đã lưu và ý tưởng cũ" },
  { href: "characters", title: "Nhân vật", description: "Tạo mascot, pose, avatar và upload ảnh" },
  { href: "members", title: "Thành viên", description: "Mời cộng tác viên và quản lý lời mời" },
  { href: "wallet", title: "Ví dự án", description: "Xem points và nạp từ ví cá nhân" },
];

export default function ProjectHomeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
    setProject((data as Project | null) || null);
  }, [id]);

  useDeferredTask(load);

  return (
    <Screen>
      <Card>
        <Title>{project?.name || "Dự án"}</Title>
        <Subtle>{project?.description || "Quản lý meme, nhân vật, ví và cộng tác trên mobile."}</Subtle>
      </Card>

      {actions.map((action) => (
        <Link key={action.href} href={`/project/${id}/${action.href}` as never} asChild>
          <Pressable>
            <Card>
              <Title>{action.title}</Title>
              <Text selectable style={{ color: "#71717a" }}>{action.description}</Text>
              <View style={{ alignItems: "flex-end" }}>
                <Text selectable style={{ color: "#6d28d9", fontWeight: "700" }}>Mở</Text>
              </View>
            </Card>
          </Pressable>
        </Link>
      ))}
    </Screen>
  );
}
