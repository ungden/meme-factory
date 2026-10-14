"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Search, Shield, User, UserCog } from "lucide-react";
import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import { PageContainer, PageHeader } from "@/components/ui/page";
import { formatDate, formatNumber } from "@/lib/format";
import { roleLabel } from "@/components/admin/admin-labels";
import { Badge, EmptyRow, Pagination, SkeletonRows, TableCard, TableHead, Th, adminFetch, readError } from "@/components/admin/admin-ui";

interface UserRow {
  user_id: string;
  email: string;
  role: string;
  balance: number;
  points: number;
  projects_count: number;
  memes_count: number;
  created_at: string;
}

const ROLE_ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  admin: Shield,
  moderator: UserCog,
  user: User,
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (search) params.set("search", search);
      const res = await adminFetch(`/api/admin/users?${params}`);
      if (!res.ok) throw new Error(await readError(res, "Chưa tải được danh sách người dùng."));
      const data = await res.json();
      setUsers(data.users);
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chưa tải được danh sách người dùng.");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchUsers();
  };

  return (
    <PageContainer width="wide">
      <PageHeader title="Người dùng" description={`${formatNumber(total)} người dùng.`} />

      <form onSubmit={handleSearch} className="relative mb-6 max-w-md" role="search">
        <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 th-text-muted" />
        <Input
          type="search"
          aria-label="Tìm người dùng"
          placeholder="Tìm theo email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 text-sm"
        />
      </form>

      {error && (
        <Alert
          className="mb-4"
          action={
            <Button size="sm" variant="outline" onClick={fetchUsers}>
              Thử lại
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      <TableCard footer={<Pagination page={page} totalPages={totalPages} onChange={setPage} />}>
        <TableHead>
          <Th>Email</Th>
          <Th>Quyền</Th>
          <Th align="right">Điểm</Th>
          <Th align="right">Số dư</Th>
          <Th align="right">Kênh</Th>
          <Th align="right">Meme</Th>
          <Th>Ngày tạo</Th>
        </TableHead>
        <tbody>
          {loading ? (
            <SkeletonRows cols={7} />
          ) : users.length === 0 ? (
            <EmptyRow cols={7}>{search ? "Không có ai khớp email này." : "Chưa có người dùng."}</EmptyRow>
          ) : (
            users.map((u) => {
              const role = roleLabel(u.role);
              const RoleIcon = ROLE_ICONS[u.role] || User;
              return (
                <tr key={u.user_id} className="border-t th-border th-bg-hover">
                  <td className="px-4 py-3">
                    <Link href={`/admin/users/${u.user_id}`} className="font-medium th-text-accent hover:underline">
                      {u.email}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={role.tone}>
                      <RoleIcon size={12} />
                      {role.label}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-medium th-text-primary">{formatNumber(u.points)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right th-text-secondary">{formatNumber(u.balance)}đ</td>
                  <td className="px-4 py-3 text-right th-text-secondary">{formatNumber(u.projects_count)}</td>
                  <td className="px-4 py-3 text-right th-text-secondary">{formatNumber(u.memes_count)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs th-text-muted">{formatDate(u.created_at)}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </TableCard>
    </PageContainer>
  );
}
