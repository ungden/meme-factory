import { useCallback, useState } from "react";
import { Alert, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { apiFetch } from "@/lib/api";
import type { ProjectWalletResponse } from "@/types/models";
import { Button, Card, InputField, Screen, StatRow, Subtle, Title } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { useDeferredTask } from "@/hooks/use-deferred-task";

export default function ProjectWalletScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [wallet, setWallet] = useState<ProjectWalletResponse | null>(null);
  const [points, setPoints] = useState("50");

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<ProjectWalletResponse>(`/api/projects/${id}/wallet`);
      setWallet(data);
    } catch (error) {
      Alert.alert("Không thể tải ví dự án", error instanceof Error ? error.message : "Có lỗi xảy ra");
    }
  }, [id]);

  useDeferredTask(load);

  const deposit = async () => {
    try {
      await apiFetch(`/api/projects/${id}/wallet`, {
        method: "POST",
        body: JSON.stringify({ points: Number(points) }),
      });
      setPoints("50");
      void load();
    } catch (error) {
      Alert.alert("Không thể nạp ví dự án", error instanceof Error ? error.message : "Có lỗi xảy ra");
    }
  };

  return (
    <Screen>
      <Card>
        <Title right={<Button variant="ghost" onPress={() => void load()}>Làm mới</Button>}>Ví dự án</Title>
        <StatRow label="Project points" value={wallet?.points || 0} />
      </Card>

      <Card>
        <Title>Nạp từ ví cá nhân</Title>
        <InputField label="Số points" value={points} onChangeText={setPoints} placeholder="50" />
        <Button onPress={() => void deposit()}>Nạp points vào dự án</Button>
      </Card>

      <Card>
        <Title>Giao dịch gần đây</Title>
        {(wallet?.transactions || []).map((transaction) => (
          <View key={transaction.id} style={{ gap: 4, borderBottomWidth: 1, borderBottomColor: "#f4f4f5", paddingBottom: 10 }}>
            <StatRow label={transaction.type} value={transaction.amount} />
            <Text selectable style={{ color: "#18181b" }}>{transaction.description || "Không có mô tả"}</Text>
            <Subtle>{formatDate(transaction.created_at)}</Subtle>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
