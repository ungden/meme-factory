"use client";

import { useEffect, useState } from "react";
import { Download, KeyRound, Mail, Trash2, User as UserIcon } from "lucide-react";
import Sidebar from "@/components/layout/sidebar";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";

const DELETE_CONFIRMATION = "XOA TAI KHOAN";

function Section({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description: string;
  icon: typeof UserIcon;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border p-5" style={{ borderColor: "var(--border-primary)", background: "var(--bg-card)" }}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl th-bg-accent-light th-text-accent">
          <Icon size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold th-text-primary">{title}</h2>
          <p className="mt-1 text-sm th-text-tertiary">{description}</p>
          <div className="mt-4 space-y-3">{children}</div>
        </div>
      </div>
    </section>
  );
}

export default function SettingsPage() {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState<"name" | "email" | "password" | "delete" | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await createClient().auth.getUser();
      if (!active) return;
      setEmail(data.user?.email ?? "");
      setName(String((data.user?.user_metadata as Record<string, unknown> | undefined)?.full_name ?? ""));
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  async function saveName() {
    setBusy("name");
    const { error } = await createClient().auth.updateUser({ data: { full_name: name.trim() } });
    setBusy(null);
    if (error) toast.error("Chưa lưu được tên hiển thị.");
    else toast.success("Đã lưu tên hiển thị.");
  }

  async function changeEmail() {
    if (!newEmail.trim()) return;
    setBusy("email");
    const { error } = await createClient().auth.updateUser({ email: newEmail.trim() });
    setBusy(null);
    if (error) {
      toast.error("Chưa đổi được email. Kiểm tra lại địa chỉ nhé.");
      return;
    }
    setNewEmail("");
    toast.success("Đã gửi email xác nhận tới địa chỉ mới. Email chỉ đổi sau khi bạn bấm xác nhận.");
  }

  async function changePassword() {
    if (password.length < 6) {
      toast.error("Mật khẩu cần ít nhất 6 ký tự.");
      return;
    }
    setBusy("password");
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(null);
    if (error) {
      toast.error("Chưa đổi được mật khẩu.");
      return;
    }
    setPassword("");
    toast.success("Đã đổi mật khẩu.");
  }

  async function downloadData() {
    const { data } = await createClient().auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    const response = await fetch("/api/account/export", { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      toast.error("Chưa tải được dữ liệu. Thử lại sau nhé.");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `aida-du-lieu-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function deleteAccount() {
    setBusy("delete");
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const response = await fetch("/api/account/delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
      },
      body: JSON.stringify({ confirm: confirmText }),
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) {
      toast.error(payload.error || "Chưa xoá được tài khoản.");
      return;
    }
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <div className="flex">
      <Sidebar />
      <main className="ml-0 min-h-screen flex-1 p-4 pt-16 lg:ml-56 md:p-8 lg:p-10">
        <div className="mx-auto max-w-2xl space-y-5">
          <header>
            <h1 className="text-2xl font-bold th-text-primary">Cài đặt tài khoản</h1>
            <p className="mt-2 th-text-tertiary">{loaded ? email : "Đang tải…"}</p>
          </header>

          <Section title="Tên hiển thị" description="Tên này xuất hiện khi bạn làm việc cùng người khác trong một dự án." icon={UserIcon}>
            <Input id="display-name" label="Tên hiển thị" value={name} onChange={(event) => setName(event.target.value)} placeholder="Tên của bạn" />
            <Button onClick={saveName} loading={busy === "name"}>Lưu</Button>
          </Section>

          <Section title="Email đăng nhập" description="Đổi email cần xác nhận ở địa chỉ mới; email cũ vẫn dùng được cho tới lúc đó." icon={Mail}>
            <Input id="new-email" label="Email mới" type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} placeholder="ban@example.com" />
            <Button onClick={changeEmail} loading={busy === "email"} disabled={!newEmail.trim()}>Gửi xác nhận</Button>
          </Section>

          <Section title="Mật khẩu" description="Đặt mật khẩu mới cho lần đăng nhập sau." icon={KeyRound}>
            <Input id="new-password" label="Mật khẩu mới" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" minLength={6} />
            <Button onClick={changePassword} loading={busy === "password"} disabled={!password}>Đổi mật khẩu</Button>
          </Section>

          <Section title="Dữ liệu của bạn" description="Tải về tệp JSON gồm dự án, nhân vật, nội dung và lịch sử giao dịch." icon={Download}>
            <Button variant="outline" onClick={downloadData}>Tải dữ liệu</Button>
          </Section>

          <Section
            title="Xoá tài khoản"
            description="Xoá vĩnh viễn tài khoản, mọi dự án bạn sở hữu và toàn bộ ảnh, video, phim bên trong. Điểm còn lại không được hoàn tiền. Không thể khôi phục."
            icon={Trash2}
          >
            <Input
              id="delete-confirm"
              label={`Gõ "${DELETE_CONFIRMATION}" để xác nhận`}
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder={DELETE_CONFIRMATION}
            />
            <Button
              variant="danger"
              onClick={deleteAccount}
              loading={busy === "delete"}
              disabled={confirmText.trim().toUpperCase() !== DELETE_CONFIRMATION}
            >
              Xoá tài khoản vĩnh viễn
            </Button>
          </Section>
        </div>
      </main>
    </div>
  );
}
