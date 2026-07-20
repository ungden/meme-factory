import { useCallback, useState } from "react";
import { Alert, Image, Switch, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import type { Character, CharacterPose } from "@/types/models";
import { Button, Card, InputField, Screen, Subtle, Title } from "@/components/ui";
import { buildPoseUploadPath } from "@/lib/utils";
import { useDeferredTask } from "@/hooks/use-deferred-task";

export default function CharactersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [form, setForm] = useState({ name: "", description: "", personality: "" });
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [poseName, setPoseName] = useState("");
  const [poseDescription, setPoseDescription] = useState("");
  const [transparent, setTransparent] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("characters")
      .select("*, character_poses(*)")
      .eq("project_id", id)
      .order("created_at", { ascending: false });

    if (error) {
      Alert.alert("Không thể tải nhân vật", error.message);
      return;
    }

    setCharacters(
      ((data || []) as Array<Record<string, unknown>>).map((item) => ({
        ...(item as unknown as Character),
        poses: (item.character_poses as CharacterPose[]) || [],
      }))
    );
  }, [id]);

  useDeferredTask(load);

  const createCharacter = async () => {
    const { error } = await supabase.from("characters").insert({
      project_id: id,
      name: form.name.trim(),
      description: form.description.trim(),
      personality: form.personality.trim(),
    });

    if (error) {
      Alert.alert("Không thể tạo nhân vật", error.message);
      return;
    }

    setForm({ name: "", description: "", personality: "" });
    void load();
  };

  const addPose = async (characterId: string) => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const response = await fetch(asset.uri);
    const blob = await response.blob();
    const extension = (asset.fileName?.split(".").pop() || "png").toLowerCase();
    const filePath = buildPoseUploadPath(id, characterId, extension);

    const upload = await supabase.storage.from("character-poses").upload(filePath, blob, {
      contentType: asset.mimeType || "image/png",
      upsert: false,
    });

    if (upload.error) {
      Alert.alert("Không thể upload pose", upload.error.message);
      return;
    }

    const publicUrl = supabase.storage.from("character-poses").getPublicUrl(filePath).data.publicUrl;
    const inserted = await supabase.from("character_poses").insert({
      character_id: characterId,
      name: poseName.trim() || asset.fileName || "Pose",
      emotion: "neutral",
      image_url: publicUrl,
      description: poseDescription.trim() || null,
      is_transparent: transparent,
    });

    if (inserted.error) {
      Alert.alert("Không thể lưu pose", inserted.error.message);
      return;
    }

    const character = characters.find((item) => item.id === characterId);
    if (character && !character.avatar_url) {
      await supabase.from("characters").update({ avatar_url: publicUrl }).eq("id", characterId);
    }

    setPoseName("");
    setPoseDescription("");
    setTransparent(false);
    void load();
  };

  return (
    <Screen>
      <Card>
        <Title right={<Button variant="ghost" onPress={() => void load()}>Làm mới</Button>}>Nhân vật</Title>
        <Subtle>Tạo character mới và thêm pose từ thư viện ảnh điện thoại.</Subtle>
      </Card>

      <Card>
        <Title>Tạo nhân vật</Title>
        <InputField label="Tên" value={form.name} onChangeText={(value) => setForm((prev) => ({ ...prev, name: value }))} placeholder="VD: Cậu Vàng" />
        <InputField label="Mô tả" value={form.description} onChangeText={(value) => setForm((prev) => ({ ...prev, description: value }))} placeholder="Ngoại hình / concept" multiline />
        <InputField label="Tính cách" value={form.personality} onChangeText={(value) => setForm((prev) => ({ ...prev, personality: value }))} placeholder="Giọng điệu, hành vi" multiline />
        <Button onPress={() => void createCharacter()}>Tạo nhân vật</Button>
      </Card>

      <Card>
        <Title>Tên pose mặc định</Title>
        <InputField label="Tên pose" value={poseName} onChangeText={setPoseName} placeholder="Base pose / pose neutral" />
        <InputField label="Mô tả pose" value={poseDescription} onChangeText={setPoseDescription} placeholder="Mô tả ngắn để AI hiểu" multiline />
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text selectable style={{ color: "#18181b" }}>Ảnh trong suốt</Text>
          <Switch value={transparent} onValueChange={setTransparent} />
        </View>
      </Card>

      {characters.map((character) => (
        <Card key={character.id}>
          <Title right={<Button variant="ghost" onPress={() => setSelectedCharacterId((current) => current === character.id ? null : character.id)}>{selectedCharacterId === character.id ? "Ẩn" : "Mở"}</Button>}>{character.name}</Title>
          <Subtle>{character.description}</Subtle>
          {character.avatar_url ? <Image alt={`Ảnh đại diện ${character.name}`} source={{ uri: character.avatar_url }} style={{ width: "100%", height: 220, borderRadius: 20 }} resizeMode="contain" /> : null}
          <Text selectable style={{ color: "#71717a" }}>{character.poses.length} poses</Text>
          <Button onPress={() => void addPose(character.id)}>Thêm pose từ điện thoại</Button>
          {selectedCharacterId === character.id ? (
            <View style={{ gap: 10 }}>
              {character.poses.map((pose) => (
                <View key={pose.id} style={{ gap: 8, borderTopWidth: 1, borderTopColor: "#f4f4f5", paddingTop: 10 }}>
                  <Text selectable style={{ fontWeight: "700", color: "#18181b" }}>{pose.name}</Text>
                  {pose.image_url ? <Image alt={`Tư thế ${pose.name}`} source={{ uri: pose.image_url }} style={{ width: "100%", height: 180, borderRadius: 18 }} resizeMode="contain" /> : null}
                  <Subtle>{pose.description || "Không có mô tả"}</Subtle>
                </View>
              ))}
            </View>
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}
