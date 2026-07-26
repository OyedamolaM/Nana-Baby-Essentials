"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { formatNairaAmount } from "../../../lib/commerce";
import {
  formatDueMonth,
  getRegistryItemFundedAmount,
  getRegistryItemRemainingAmount,
  getRemainingRegistryQuantity,
  type RegistryItem,
  type RegistryPaymentActivity,
  type RegistrySummary,
} from "../../../lib/registry";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

type CustomerRecord = {
  email?: string | null;
  full_name?: string | null;
  id: string;
  phone?: string | null;
};

type RegistryRecord = {
  baby_gender?: string | null;
  created_at: string;
  due_month?: string | null;
  id: string;
  name: string;
  share_code: string;
  user_id: string;
};

function formatBabyGender(value?: string | null) {
  if (!value) {
    return "N/A";
  }

  if (value === "neutral") {
    return "Surprise";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "N/A";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(value?: string | null) {
  if (!value) {
    return "N/A";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function AdminRegistryAccountsManager({
  customers,
  registries,
  registryItemsByRegistry,
  registryPaymentActivities,
  registrySummaries,
}: {
  customers: CustomerRecord[];
  registries: RegistryRecord[];
  registryItemsByRegistry: Record<string, RegistryItem[]>;
  registryPaymentActivities: Record<string, RegistryPaymentActivity[]>;
  registrySummaries: Record<string, RegistrySummary>;
}) {
  const [expandedAccountIds, setExpandedAccountIds] = useState<string[]>([]);

  const customerLookup = useMemo(() => {
    return Object.fromEntries(customers.map((customer) => [customer.id, customer])) as Record<
      string,
      CustomerRecord
    >;
  }, [customers]);

  const groupedAccounts = useMemo(() => {
    const grouped = new Map<
      string,
      {
        customer: CustomerRecord | null;
        registries: RegistryRecord[];
      }
    >();

    for (const registry of registries) {
      const existing = grouped.get(registry.user_id);
      if (existing) {
        existing.registries.push(registry);
        continue;
      }

      grouped.set(registry.user_id, {
        customer: customerLookup[registry.user_id] ?? null,
        registries: [registry],
      });
    }

    return Array.from(grouped.entries())
      .map(([userId, group]) => ({
        userId,
        customer: group.customer,
        registries: group.registries.sort((left, right) => {
          return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
        }),
      }))
      .sort((left, right) => right.registries.length - left.registries.length);
  }, [customerLookup, registries]);

  const toggleAccount = (accountId: string) => {
    setExpandedAccountIds((current) =>
      current.includes(accountId)
        ? current.filter((id) => id !== accountId)
        : [...current, accountId],
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registry Accounts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {groupedAccounts.length === 0 ? (
          <p className="text-sm text-gray-500">No registry accounts yet.</p>
        ) : (
          groupedAccounts.map((account) => {
            const isExpanded = expandedAccountIds.includes(account.userId);
            const totalRegistries = account.registries.length;
            const totalRequested = account.registries.reduce((sum, registry) => {
              return sum + (registrySummaries[registry.id]?.requested ?? 0);
            }, 0);

            return (
              <div key={account.userId} className="rounded-2xl border p-4">
                <button
                  type="button"
                  className="flex w-full flex-col gap-4 text-left md:flex-row md:items-center md:justify-between"
                  onClick={() => toggleAccount(account.userId)}
                >
                  <div>
                    <p className="text-lg font-semibold text-gray-900">
                      {account.customer?.full_name || account.customer?.email || "Customer account"}
                    </p>
                    <p className="text-sm text-gray-500">
                      {account.customer?.email || "No email"} {account.customer?.phone ? `| ${account.customer.phone}` : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                    <span className="rounded-full bg-gray-50 px-3 py-2">
                      Registries: {totalRegistries}
                    </span>
                    <span className="rounded-full bg-gray-50 px-3 py-2">
                      Requested: {totalRequested}
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-2 font-medium text-pink-700">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      {isExpanded ? "Hide details" : "Show details"}
                    </span>
                  </div>
                </button>

                {isExpanded ? (
                  <div className="mt-5 space-y-4">
                    {account.registries.map((registry) => {
                      const summary = registrySummaries[registry.id] ?? {
                        fundedAmount: 0,
                        purchased: 0,
                        remainingAmount: 0,
                        remainingQuantity: 0,
                        requested: 0,
                        totalNeededAmount: 0,
                      };
                      const registryItems = registryItemsByRegistry[registry.id] ?? [];
                      const payments = registryPaymentActivities[registry.id] ?? [];

                      return (
                        <div key={registry.id} className="rounded-2xl border bg-white p-4">
                          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                            <div>
                              <p className="text-lg font-semibold text-gray-900">
                                {registry.name?.trim() || "Unnamed registry"}
                              </p>
                              <p className="text-sm text-gray-500">
                                Due: {formatDueMonth(registry.due_month)} / {formatBabyGender(registry.baby_gender)}
                              </p>
                              <p className="text-sm text-gray-500">
                                Created: {formatDate(registry.created_at)}
                              </p>
                            </div>
                            <div className="rounded-lg bg-gray-50 px-4 py-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                                Share Code
                              </p>
                              <p className="mt-1 font-mono text-lg font-bold text-pink-600">
                                {registry.share_code}
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3 xl:grid-cols-6">
                            <div className="rounded-xl bg-gray-50 px-3 py-2">
                              <span className="font-semibold text-gray-900">Requested:</span> {summary.requested}
                            </div>
                            <div className="rounded-xl bg-gray-50 px-3 py-2">
                              <span className="font-semibold text-gray-900">Covered:</span> {summary.purchased}
                            </div>
                            <div className="rounded-xl bg-gray-50 px-3 py-2">
                              <span className="font-semibold text-gray-900">Units Left:</span> {summary.remainingQuantity}
                            </div>
                            <div className="rounded-xl bg-gray-50 px-3 py-2">
                              <span className="font-semibold text-gray-900">Needed:</span> {formatNairaAmount(summary.totalNeededAmount)}
                            </div>
                            <div className="rounded-xl bg-gray-50 px-3 py-2">
                              <span className="font-semibold text-gray-900">Funded:</span> {formatNairaAmount(summary.fundedAmount)}
                            </div>
                            <div className="rounded-xl bg-gray-50 px-3 py-2">
                              <span className="font-semibold text-gray-900">Amount Left:</span> {formatNairaAmount(summary.remainingAmount)}
                            </div>
                          </div>

                          <Tabs defaultValue="funding" className="mt-4 space-y-4">
                            <TabsList className="grid w-full grid-cols-2">
                              <TabsTrigger value="funding" className="cursor-pointer">
                                Item Funding
                              </TabsTrigger>
                              <TabsTrigger value="payments" className="cursor-pointer">
                                Payment Activity
                              </TabsTrigger>
                            </TabsList>

                            <TabsContent value="funding" className="space-y-3">
                              {registryItems.length === 0 ? (
                                <p className="text-sm text-gray-500">No registry items yet.</p>
                              ) : (
                                registryItems.map((item) => (
                                  <div key={item.id} className="rounded-xl border border-gray-200 px-3 py-3">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                      <div>
                                        <p className="font-medium text-gray-900">
                                          {item.product?.name ?? "Registry item"}
                                        </p>
                                        <p className="text-sm text-gray-500">
                                          {item.purchasedQuantity} covered, {getRemainingRegistryQuantity(item)} units left
                                        </p>
                                      </div>
                                      <div className="text-sm text-gray-600 sm:text-right">
                                        <p>Funded: {formatNairaAmount(getRegistryItemFundedAmount(item))}</p>
                                        <p>Left: {formatNairaAmount(getRegistryItemRemainingAmount(item))}</p>
                                      </div>
                                    </div>
                                  </div>
                                ))
                              )}
                            </TabsContent>

                            <TabsContent value="payments" className="space-y-3">
                              {payments.length === 0 ? (
                                <p className="text-sm text-gray-500">No payments for this registry yet.</p>
                              ) : (
                                payments.map((payment) => (
                                  <div key={payment.id} className="rounded-xl border border-gray-200 px-3 py-3">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                      <div>
                                        <p className="font-medium text-gray-900">{payment.buyerName}</p>
                                        <p className="text-sm text-gray-500">
                                          {payment.buyerEmail}
                                          {payment.buyerPhone ? ` | ${payment.buyerPhone}` : ""}
                                        </p>
                                        <p className="mt-2 text-sm text-gray-700">
                                          {payment.type === "item"
                                            ? "Paid toward selected registry items"
                                            : "General registry cash gift"}
                                        </p>
                                        <ul className="mt-2 space-y-1 text-sm text-gray-600">
                                          {payment.itemLabels.map((label) => (
                                            <li key={`${payment.id}-${label}`}>{label}</li>
                                          ))}
                                        </ul>
                                        {payment.buyerMessage ? (
                                          <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
                                            &quot;{payment.buyerMessage}&quot;
                                          </p>
                                        ) : null}
                                      </div>
                                      <div className="text-sm text-gray-600 sm:text-right">
                                        <p className="font-semibold text-gray-900">
                                          {formatNairaAmount(payment.totalAmount)}
                                        </p>
                                        <p>{payment.status}</p>
                                        <p>{formatDateTime(payment.paidAt ?? payment.createdAt)}</p>
                                        {payment.paystackReference ? (
                                          <p className="font-mono text-xs text-gray-500">
                                            {payment.paystackReference}
                                          </p>
                                        ) : null}
                                      </div>
                                    </div>
                                  </div>
                                ))
                              )}
                            </TabsContent>
                          </Tabs>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
