import { useCallback, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { Link } from "expo-router";
import { supabase } from "@/lib/supabase";
import { buildProjectSlug, formatDate } from "@/lib/utils";
import type { Project } from "@/types/models";
import { Button, Card, InputField, Screen, Subtle, Title } from "@/components/ui";
import { useDeferredTask } from "@/hooks/use-deferred-task";

export default function ProjectsScreen() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const loadProjects = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("projects").select("*").order("updated_at", { ascending: false });
    if (error) {
      Alert.alert("Không thể tải dự án", error.message);
    } else {
      setProjects((data || []) as Project[]);
    }
    setLoading(false);
  }, []);

  useDeferredTask(loadProjects);

  const createProject = async () => {
    const projectName = name.trim();
    if (!projectName) return;
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) return;

    const { error } = await supabase.from("projects").insert({
      user_id: userId,
      name: projectName,
      slug: buildProjectSlug(projectName),
      description: description.trim() || null,
    });

    if (error) {
      Alert.alert("Không thể tạo dự án", error.message);
      return;
    }

    setName("");
    setDescription("");
    void loadProjects();
  };

  return (
    <Screen>
      <Card>
        <Title right={<Button variant="ghost" onPress={() => void loadProjects()}>{loading ? "..." : "Làm mới"}</Button>}>Tất cả dự án</Title>
        <Subtle>Mobile app dùng chung Supabase với website. Bạn có thể chuyển giữa web và app mà không bị lệch dữ liệu.</Subtle>
      </Card>

      <Card>
        <Title>Tạo dự án mới</Title>
        <InputField label="Tên dự án" value={name} onChangeText={setName} placeholder="VD: Cậu Vàng Finance" />
        <InputField label="Mô tả" value={description} onChangeText={setDescription} placeholder="Mô tả fanpage / brand voice" multiline />
        <Button onPress={() => void createProject()}>Tạo dự án</Button>
      </Card>

      {projects.map((project) => (
        <Link key={project.id} href={`/project/${project.id}`} asChild>
          <Pressable>
            <Card>
              <Title>{project.name}</Title>
              <Subtle>{project.description || "Chưa có mô tả"}</Subtle>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                <Text selectable style={{ color: "#71717a" }}>{project.slug}</Text>
                <Text selectable style={{ color: "#71717a" }}>{formatDate(project.updated_at)}</Text>
              </View>
            </Card>
          </Pressable>
        </Link>
      ))}
    </Screen>
  );
}
