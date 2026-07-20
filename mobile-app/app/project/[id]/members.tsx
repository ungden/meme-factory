import { useCallback, useState } from "react";
import { Alert, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { apiFetch } from "@/lib/api";
import type { ProjectMember } from "@/types/models";
import { Button, Card, InputField, Screen, Subtle, Title } from "@/components/ui";
import { useDeferredTask } from "@/hooks/use-deferred-task";

type MembersResponse = {
  isOwner: boolean;
  members: ProjectMember[];
  invitations: Array<{ id: string; invitee_email: string; status: string; created_at: string }>;
};

export default function MembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [email, setEmail] = useState("");
  const [data, setData] = useState<MembersResponse | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await apiFetch<MembersResponse>(`/api/projects/${id}/members`);
      setData(response);
    } catch (error) {
      Alert.alert("Không thể tải thành viên", error instanceof Error ? error.message : "Có lỗi xảy ra");
    }
  }, [id]);

  useDeferredTask(load);

  const invite = async () => {
    try {
      await apiFetch(`/api/projects/${id}/members`, {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setEmail("");
      void load();
    } catch (error) {
      Alert.alert("Không thể gửi lời mời", error instanceof Error ? error.message : "Có lỗi xảy ra");
    }
  };

  const removeMember = async (userId: string) => {
    try {
      await apiFetch(`/api/projects/${id}/members?userId=${encodeURIComponent(userId)}`, { method: "DELETE" });
      void load();
    } catch (error) {
      Alert.alert("Không thể xoá thành viên", error instanceof Error ? error.message : "Có lỗi xảy ra");
    }
  };

  const cancelInvite = async (invitationId: string) => {
    try {
      await apiFetch(`/api/projects/${id}/members?invitationId=${encodeURIComponent(invitationId)}`, { method: "DELETE" });
      void load();
    } catch (error) {
      Alert.alert("Không thể huỷ lời mời", error instanceof Error ? error.message : "Có lỗi xảy ra");
    }
  };

  return (
    <Screen>
      <Card>
        <Title right={<Button variant="ghost" onPress={() => void load()}>Làm mới</Button>}>Thành viên dự án</Title>
        <Subtle>Owner quản lý lời mời tại đây. Member vẫn xem được danh sách để theo dõi cộng tác.</Subtle>
      </Card>

      {data?.isOwner ? (
        <Card>
          <Title>Mời thành viên</Title>
          <InputField label="Email" value={email} onChangeText={setEmail} placeholder="member@example.com" />
          <Button onPress={() => void invite()}>Gửi lời mời</Button>
        </Card>
      ) : null}

      <Card>
        <Title>Danh sách thành viên</Title>
        {(data?.members || []).map((member) => (
          <View key={member.user_id} style={{ gap: 6, borderBottomWidth: 1, borderBottomColor: "#f4f4f5", paddingBottom: 10 }}>
            <Text selectable style={{ color: "#18181b", fontWeight: "700" }}>{member.email}</Text>
            <Subtle>{member.is_owner ? "owner" : member.role}</Subtle>
            {data?.isOwner && !member.is_owner ? <Button variant="ghost" onPress={() => void removeMember(member.user_id)}>Xoá quyền</Button> : null}
          </View>
        ))}
      </Card>

      {data?.isOwner ? (
        <Card>
          <Title>Lời mời đang chờ</Title>
          {(data.invitations || []).map((invitation) => (
            <View key={invitation.id} style={{ gap: 6, borderBottomWidth: 1, borderBottomColor: "#f4f4f5", paddingBottom: 10 }}>
              <Text selectable style={{ color: "#18181b", fontWeight: "700" }}>{invitation.invitee_email}</Text>
              <Subtle>{invitation.status}</Subtle>
              <Button variant="ghost" onPress={() => void cancelInvite(invitation.id)}>Huỷ lời mời</Button>
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
