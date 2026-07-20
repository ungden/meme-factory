import { useCallback, useState } from "react";
import { Alert, Image, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import type { Meme } from "@/types/models";
import { Button, Card, EmptyState, Screen, Subtle, Title } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { useDeferredTask } from "@/hooks/use-deferred-task";

export default function GalleryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [memes, setMemes] = useState<Meme[]>([]);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("memes").select("*").eq("project_id", id).order("created_at", { ascending: false });
    if (error) {
      Alert.alert("Không thể tải gallery", error.message);
      return;
    }
    setMemes((data || []) as Meme[]);
  }, [id]);

  useDeferredTask(load);

  const remove = async (memeId: string) => {
    const { error } = await supabase.from("memes").delete().eq("id", memeId);
    if (error) {
      Alert.alert("Không thể xoá meme", error.message);
      return;
    }
    void load();
  };

  return (
    <Screen>
      <Card>
        <Title right={<Button variant="ghost" onPress={() => void load()}>Làm mới</Button>}>Bộ sưu tập</Title>
        <Subtle>Tất cả meme đã lưu của dự án trên web và mobile đều xuất hiện ở đây.</Subtle>
      </Card>

      {memes.length === 0 ? <EmptyState title="Chưa có meme" description="Tạo ảnh từ màn hình Generate rồi lưu lại để xuất hiện ở gallery." /> : null}

      {memes.map((meme) => (
        <Card key={meme.id}>
          {meme.image_url ? <Image alt={meme.generated_content?.headline || meme.original_idea} source={{ uri: meme.image_url }} style={{ width: "100%", height: 320, borderRadius: 20 }} resizeMode="cover" /> : null}
          <Title>{meme.generated_content?.headline || meme.original_idea}</Title>
          <Subtle>{meme.generated_content?.caption || meme.original_idea}</Subtle>
          <View style={{ gap: 4 }}>
            <Text selectable style={{ color: "#71717a" }}>{formatDate(meme.created_at)}</Text>
            <Text selectable style={{ color: "#71717a" }}>{meme.format}</Text>
          </View>
          <Button variant="ghost" onPress={() => void remove(meme.id)}>Xoá khỏi gallery</Button>
        </Card>
      ))}
    </Screen>
  );
}
