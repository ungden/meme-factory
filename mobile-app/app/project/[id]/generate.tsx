import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Image, Switch, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { Character, ContentVariation, MemeContent, MemeFormat, Project, SelectedCharacter } from "@/types/models";
import { Button, Card, Chip, InputField, Screen, Subtle, Title } from "@/components/ui";

const formats: MemeFormat[] = ["1:1", "9:16", "16:9", "4:5"];

type ImageResult = {
  image?: string;
  generation_request_id?: string;
  pointsUsed?: number;
  error?: string;
};

export default function GenerateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [idea, setIdea] = useState("");
  const [oneOff, setOneOff] = useState("");
  const [oneOffCharacters, setOneOffCharacters] = useState<string[]>([]);
  const [noCharacters, setNoCharacters] = useState(false);
  const [format, setFormat] = useState<MemeFormat>("1:1");
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>([]);
  const [variations, setVariations] = useState<ContentVariation[]>([]);
  const [selectedVariationIndex, setSelectedVariationIndex] = useState(0);
  const [customPrompt, setCustomPrompt] = useState("");
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [loadingImage, setLoadingImage] = useState(false);

  const load = useCallback(async () => {
    const [projectRes, characterRes] = await Promise.all([
      supabase.from("projects").select("*").eq("id", id).maybeSingle(),
      supabase.from("characters").select("*, character_poses(*)").eq("project_id", id).order("created_at", { ascending: false }),
    ]);

    if (projectRes.data) setProject(projectRes.data as Project);
    if (characterRes.data) {
      setCharacters(
        (characterRes.data as Array<Record<string, unknown>>).map((item) => ({
          ...(item as unknown as Character),
          poses: (item.character_poses as Character["poses"]) || [],
        }))
      );
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const selectedVariation = variations[selectedVariationIndex];

  const selectedCharacters = useMemo(() => characters.filter((item) => selectedCharacterIds.includes(item.id)), [characters, selectedCharacterIds]);

  const generateContent = async () => {
    if (!idea.trim()) return;
    try {
      setLoadingContent(true);
      const result = await apiFetch<{ variations: Array<Record<string, unknown>> }>("/api/ai/generate-content", {
        method: "POST",
        body: JSON.stringify({
          project_id: id,
          idea: idea.trim(),
          noCharacters,
          adHocCharacters: noCharacters ? [] : oneOffCharacters,
          num_variations: 3,
        }),
      });

      const mapped = (result.variations || []).map((item) => ({
        content: (item.content as MemeContent) || {
          headline: String(item.headline || ""),
          subtext: item.subtext ? String(item.subtext) : undefined,
          caption: item.caption ? String(item.caption) : undefined,
          image_prompt: item.image_prompt ? String(item.image_prompt) : undefined,
          text_rendering_notes: item.text_rendering_notes ? String(item.text_rendering_notes) : undefined,
          tone: String(item.tone || ""),
          layout_suggestion: { text_position: (item.text_position as MemeContent["layout_suggestion"]["text_position"]) || "top", character_positions: [] },
        },
        suggested_characters: ((item.suggested_characters as SelectedCharacter[]) || []).map((char) => ({
          ...char,
          reasoning: (char as SelectedCharacter & { reasoning?: string }).reasoning,
        })),
        headline: String(item.headline || (item.content as MemeContent)?.headline || ""),
        subtext: item.subtext ? String(item.subtext) : (item.content as MemeContent)?.subtext,
        caption: item.caption ? String(item.caption) : (item.content as MemeContent)?.caption,
        image_prompt: item.image_prompt ? String(item.image_prompt) : (item.content as MemeContent)?.image_prompt,
        text_rendering_notes: item.text_rendering_notes ? String(item.text_rendering_notes) : (item.content as MemeContent)?.text_rendering_notes,
        tone: String(item.tone || (item.content as MemeContent)?.tone || ""),
        text_position: ((item.text_position as ContentVariation["text_position"]) || (item.content as MemeContent)?.layout_suggestion?.text_position || "top"),
      })) as ContentVariation[];

      setVariations(mapped);
      setSelectedVariationIndex(0);
      setImageBase64(null);
      setRequestId(null);
    } catch (error) {
      Alert.alert("Không thể tạo nội dung", error instanceof Error ? error.message : "Có lỗi xảy ra");
    } finally {
      setLoadingContent(false);
    }
  };

  const generateImage = async () => {
    if (!selectedVariation) return;
    try {
      setLoadingImage(true);

      const charPayload = noCharacters
        ? []
        : (selectedCharacters.length > 0 ? selectedCharacters : characters.filter((item) => selectedVariation.suggested_characters.some((suggested) => suggested.character_id === item.id))).map((character) => ({
            name: character.name,
            emotion: "neutral",
            description: [character.description, character.personality ? `Tính cách: ${character.personality}` : ""].filter(Boolean).join(". "),
          }));

      const result = await apiFetch<ImageResult>("/api/ai/generate-image", {
        method: "POST",
        body: JSON.stringify({
          project_id: id,
          type: "meme",
          headline: selectedVariation.headline,
          subtext: selectedVariation.subtext,
          tone: selectedVariation.tone,
          textPosition: selectedVariation.text_position,
          characters: charPayload,
          format,
          style: project?.style_prompt || undefined,
          customPrompt: customPrompt.trim() || undefined,
          watermark: {
            enabled: true,
            text: project?.name || undefined,
          },
        }),
      });

      if (result.error || !result.image) {
        throw new Error(result.error || "Không thể tạo ảnh");
      }

      setImageBase64(result.image);
      setRequestId(result.generation_request_id || null);
    } catch (error) {
      Alert.alert("Không thể tạo ảnh", error instanceof Error ? error.message : "Có lỗi xảy ra");
    } finally {
      setLoadingImage(false);
    }
  };

  const saveMeme = async () => {
    if (!selectedVariation || !imageBase64) return;
    try {
      await apiFetch("/api/meme/save", {
        method: "POST",
        body: JSON.stringify({
          project_id: id,
          original_idea: idea,
          generated_content: selectedVariation.content,
          selected_characters: selectedVariation.suggested_characters,
          format,
          has_watermark: true,
          image_base64: `data:image/png;base64,${imageBase64}`,
          generation_request_id: requestId,
        }),
      });
      Alert.alert("Đã lưu", "Meme đã được lưu vào gallery của dự án.");
    } catch (error) {
      Alert.alert("Không thể lưu meme", error instanceof Error ? error.message : "Có lỗi xảy ra");
    }
  };

  return (
    <Screen>
      <Card>
        <Title>Tạo meme</Title>
        <InputField label="Ý tưởng" value={idea} onChangeText={setIdea} placeholder="Nhập brief meme, dữ liệu, ticker, punchline..." multiline />
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text selectable style={{ color: "#18181b", fontWeight: "700" }}>Không dùng nhân vật thư viện</Text>
            <Subtle>Dùng cho meme về người nổi tiếng, template, hoặc scene tự do.</Subtle>
          </View>
          <Switch value={noCharacters} onValueChange={setNoCharacters} />
        </View>
        {!noCharacters ? (
          <>
            <InputField label="Nhân vật dùng 1 lần" value={oneOff} onChangeText={setOneOff} placeholder="Donald Trump, Elon Musk..." />
            <Button variant="ghost" onPress={() => {
              const value = oneOff.trim();
              if (!value) return;
              setOneOffCharacters((current) => current.includes(value) ? current : [...current, value]);
              setOneOff("");
            }}>Thêm nhân vật dùng 1 lần</Button>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {oneOffCharacters.map((item) => <Chip key={item} label={item} active />)}
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {characters.map((character) => (
                <Chip
                  key={character.id}
                  label={character.name}
                  active={selectedCharacterIds.includes(character.id)}
                  onPress={() => setSelectedCharacterIds((current) => current.includes(character.id) ? current.filter((value) => value !== character.id) : [...current, character.id])}
                />
              ))}
            </View>
          </>
        ) : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {formats.map((item) => <Chip key={item} label={item} active={format === item} onPress={() => setFormat(item)} />)}
        </View>
        <Button onPress={() => void generateContent()} loading={loadingContent}>Tạo 3 phương án nội dung</Button>
      </Card>

      {variations.map((variation, index) => (
        <Card key={`${variation.headline}-${index}`}>
          <Title right={<Button variant="ghost" onPress={() => setSelectedVariationIndex(index)}>{selectedVariationIndex === index ? "Đang chọn" : "Chọn"}</Button>}>Phương án {index + 1}</Title>
          <Text selectable style={{ color: "#18181b", fontSize: 20, fontWeight: "800" }}>{variation.headline || "(Không có headline)"}</Text>
          <Subtle>{variation.subtext || variation.caption || variation.image_prompt || "Không có mô tả thêm"}</Subtle>
        </Card>
      ))}

      {selectedVariation ? (
        <Card>
          <Title>Prompt bổ sung cho ảnh</Title>
          <Subtle>Nếu project để phong cách illustration thì mobile app sẽ dùng đúng style đó. Khi chọn không dùng character library, output vẫn là comic/illustration.</Subtle>
          <InputField label="Prompt bổ sung" value={customPrompt} onChangeText={setCustomPrompt} placeholder="VD: bố cục như market board, không photorealistic" multiline />
          <Button onPress={() => void generateImage()} loading={loadingImage}>Tạo ảnh AI</Button>
        </Card>
      ) : null}

      {imageBase64 ? (
        <Card>
          <Title>Ảnh kết quả</Title>
          <Image alt="Ảnh AI vừa tạo" source={{ uri: `data:image/png;base64,${imageBase64}` }} style={{ width: "100%", height: 440, borderRadius: 24 }} resizeMode="contain" />
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}><Button onPress={() => void saveMeme()}>Lưu vào gallery</Button></View>
            <View style={{ flex: 1 }}><Button variant="ghost" onPress={() => setImageBase64(null)}>Xoá preview</Button></View>
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}
