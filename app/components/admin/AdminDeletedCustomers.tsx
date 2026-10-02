"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";

type DeletedCustomer = {
  id: string;
  full_name: string | null;
  email: string | null;
  deleted_at: string;
  permanently_deleted_at: string | null;
};
const PAGE_SIZE = 20;

export function AdminDeletedCustomers({ onClose, onRestored, getAdminAccessToken }: {
  onClose: () => void;
  onRestored: () => void;
  getAdminAccessToken: () => Promise<string | null>;
}) {
  const [customers, setCustomers] = useState<DeletedCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [reload, setReload] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data, error, count } = await supabase.from("user_profiles")
          .select("id, full_name, email, deleted_at, permanently_deleted_at", { count: "exact" })
          .or("is_admin.eq.false,is_admin.is.null")
          .not("deleted_at", "is", null)
          .order("deleted_at", { ascending: false }).order("id")
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (error) throw new Error("Could not load deleted customers.");
        if (cancelled) return;
        setCustomers((current) => page === 0 ? data as DeletedCustomer[] : [...current, ...data as DeletedCustomer[]]);
        setHasMore((page + 1) * PAGE_SIZE < (count ?? 0));
        setError("");
      } catch (error) {
        if (!cancelled) setError(error instanceof Error ? error.message : "Could not load deleted customers.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [page, reload]);

  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent aria-describedby={undefined} className="flex max-h-[90dvh] min-w-0 flex-col overflow-hidden sm:max-w-2xl">
      <DialogHeader><DialogTitle>Deleted customers</DialogTitle></DialogHeader>
      <div className="min-h-0 space-y-3 overflow-y-auto [overflow-wrap:anywhere]">
        {error ? <div><p role="alert" className="text-red-600">{error}</p><Button variant="outline" disabled={loading} onClick={() => { setLoading(true); setReload((current) => current + 1); }}>Retry</Button></div> : null}
        {customers.map((customer) => <div key={customer.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium">{customer.full_name || customer.email}</p>
            <p className="text-sm text-gray-500">{customer.email}</p>
            <p className="text-sm text-gray-500">{customer.permanently_deleted_at ? "Permanently deleted" : `Deleted ${new Date(customer.deleted_at).toLocaleDateString()}`}</p>
          </div>
          {!customer.permanently_deleted_at ? <Button variant="outline" disabled={Boolean(restoringId)} onClick={async () => {
            setRestoringId(customer.id);
            try {
              const token = await getAdminAccessToken();
              if (!token) throw new Error("Sign in again to manage customers.");
              const response = await fetch(`/api/admin/customers/${customer.id}`, {
                method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ action: "restore" }),
              });
              const data = await response.json();
              if (!response.ok) throw new Error(data.message || "Could not restore customer.");
              setCustomers((current) => current.filter((item) => item.id !== customer.id));
              setLoading(true);
              setPage(0);
              setReload((current) => current + 1);
              onRestored();
              toast.success("Customer restored.");
            } catch (error) { toast.error(error instanceof Error ? error.message : "Could not restore customer."); }
            finally { setRestoringId(null); }
          }}>{restoringId === customer.id ? "Restoring..." : "Restore"}</Button> : null}
        </div>)}
        {loading ? <p role="status" className="py-4 text-center text-gray-500">Loading customers...</p> : null}
        {!loading && !error && customers.length === 0 ? <p className="py-4 text-center text-gray-500">No deleted customers.</p> : null}
        {hasMore ? <Button variant="outline" disabled={loading} onClick={() => { setLoading(true); setPage((current) => current + 1); }}>Load more</Button> : null}
      </div>
    </DialogContent>
  </Dialog>;
}
