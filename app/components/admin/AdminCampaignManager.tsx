"use client";

import { useMemo, useState } from "react";
import { Mail, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { normalizeCampaignEmail } from "../../../lib/campaignEmail";
import { supabase } from "../../lib/supabase";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Textarea } from "../ui/textarea";

type CustomerRecord = {
  account_status?: string | null;
  campaign_opt_out?: boolean | null;
  deleted_at?: string | null;
  email?: string | null;
  full_name?: string | null;
  id: string;
  phone?: string | null;
};

type NewsletterCampaignRecord = {
  campaign_type?: string | null;
  created_at: string;
  id: string;
  recipient_count: number;
  sent_at?: string | null;
  status: string;
  subject: string;
};

export type CampaignContactRecord = {
  created_at?: string | null;
  email: string;
  full_name?: string | null;
  id: string;
  is_active: boolean;
  last_sent_at?: string | null;
  unsubscribed_at?: string | null;
};

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

export function AdminCampaignManager({
  campaigns,
  contacts,
  customers,
  getAdminAccessToken,
  onReload,
}: {
  campaigns: NewsletterCampaignRecord[];
  contacts: CampaignContactRecord[];
  customers: CustomerRecord[];
  getAdminAccessToken: () => Promise<string | null>;
  onReload: () => Promise<void>;
}) {
  const [campaignSubject, setCampaignSubject] = useState("");
  const [campaignBody, setCampaignBody] = useState("");
  const [manualContactEmail, setManualContactEmail] = useState("");
  const [manualContactName, setManualContactName] = useState("");
  const [sendingCampaign, setSendingCampaign] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);

  const eligibleCustomers = useMemo(() => {
    return customers.filter((customer) => {
      const email = customer.email?.trim();
      const isDisabled = customer.account_status === "disabled" || Boolean(customer.deleted_at);
      return Boolean(email) && !isDisabled && !customer.campaign_opt_out;
    });
  }, [customers]);

  const optedOutCustomers = useMemo(() => {
    return customers.filter((customer) => Boolean(customer.campaign_opt_out));
  }, [customers]);

  const activeManualContacts = useMemo(() => {
    return contacts.filter((contact) => contact.is_active);
  }, [contacts]);

  const mergedRecipients = useMemo(() => {
    const recipientMap = new Map<
      string,
      { email: string; label: string; name: string; phone: string; source: string }
    >();

    for (const customer of eligibleCustomers) {
      const email = normalizeCampaignEmail(customer.email ?? "");
      if (!email) {
        continue;
      }

      recipientMap.set(email, {
        email,
        label: customer.full_name?.trim() || "Customer",
        name: customer.full_name?.trim() || "Customer",
        phone: customer.phone?.trim() || "N/A",
        source: "Customer account",
      });
    }

    for (const contact of activeManualContacts) {
      const email = normalizeCampaignEmail(contact.email);
      if (!email) {
        continue;
      }

      const existing = recipientMap.get(email);
      if (existing) {
        recipientMap.set(email, {
          ...existing,
          source: "Customer + manual contact",
        });
        continue;
      }

      recipientMap.set(email, {
        email,
        label: contact.full_name?.trim() || "Manual contact",
        name: contact.full_name?.trim() || "Manual contact",
        phone: "N/A",
        source: "Manual contact",
      });
    }

    return Array.from(recipientMap.values());
  }, [activeManualContacts, eligibleCustomers]);

  const customerCampaignHistory = useMemo(() => {
    return campaigns.filter((campaign) => (campaign.campaign_type ?? "newsletter") === "customer");
  }, [campaigns]);

  const handleSendCampaign = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!campaignSubject.trim() || !campaignBody.trim()) {
      toast.error("Add a subject and message before sending.");
      return;
    }

    const accessToken = await getAdminAccessToken();
    if (!accessToken) {
      toast.error("Sign in again to send campaigns.");
      return;
    }

    setSendingCampaign(true);

    try {
      const response = await fetch("/api/campaigns/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          subject: campaignSubject,
          body: campaignBody,
        }),
      });

      const result = (await response.json().catch(() => null)) as
        | { message?: string; recipientCount?: number; sandbox?: boolean }
        | null;

      if (!response.ok) {
        toast.error(result?.message ?? "Failed to send campaign.");
        return;
      }

      toast.success(
        result?.sandbox
          ? `Brevo sandbox accepted the campaign for ${result?.recipientCount ?? mergedRecipients.length} recipients.`
          : `Campaign sent to ${result?.recipientCount ?? mergedRecipients.length} recipients.`,
      );
      setCampaignSubject("");
      setCampaignBody("");
      await onReload();
    } catch (error) {
      console.error("Failed to send campaign.", error);
      toast.error("Failed to send campaign.");
    } finally {
      setSendingCampaign(false);
    }
  };

  const handleSaveContact = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const email = normalizeCampaignEmail(manualContactEmail);
    if (!email) {
      toast.error("Add an email address first.");
      return;
    }

    setSavingContact(true);

    const { error } = await supabase.from("campaign_contacts").upsert(
      {
        email,
        full_name: manualContactName.trim() || null,
        is_active: true,
        unsubscribed_at: null,
      },
      { onConflict: "email" },
    );

    setSavingContact(false);

    if (error) {
      toast.error("Could not save this campaign contact.");
      return;
    }

    toast.success("Campaign contact saved.");
    setManualContactEmail("");
    setManualContactName("");
    setShowContactModal(false);
    await onReload();
  };

  const handleToggleContact = async (contact: CampaignContactRecord, nextActive: boolean) => {
    const { error } = await supabase
      .from("campaign_contacts")
      .update({
        is_active: nextActive,
        unsubscribed_at: nextActive ? null : new Date().toISOString(),
      })
      .eq("id", contact.id);

    if (error) {
      toast.error(nextActive ? "Could not reactivate this contact." : "Could not remove this contact.");
      return;
    }

    toast.success(nextActive ? "Contact reactivated." : "Contact removed from active campaigns.");
    await onReload();
  };

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Send Customer Campaign</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div className="rounded-lg border p-4">
                <div className="text-sm text-gray-500">Eligible Customers</div>
                <div className="mt-2 text-3xl font-bold">{eligibleCustomers.length}</div>
              </div>
              <div className="rounded-lg border p-4">
                <div className="text-sm text-gray-500">Manual Contacts</div>
                <div className="mt-2 text-3xl font-bold">{activeManualContacts.length}</div>
              </div>
              <div className="rounded-lg border p-4">
                <div className="text-sm text-gray-500">Total Reach</div>
                <div className="mt-2 text-3xl font-bold">{mergedRecipients.length}</div>
              </div>
              <div className="rounded-lg border p-4">
                <div className="text-sm text-gray-500">Opted Out</div>
                <div className="mt-2 text-3xl font-bold">{optedOutCustomers.length}</div>
              </div>
            </div>

            <form onSubmit={handleSendCampaign} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="campaign-subject">Subject</Label>
                <Input
                  id="campaign-subject"
                  value={campaignSubject}
                  onChange={(event) => setCampaignSubject(event.target.value)}
                  placeholder="A special update for Nana's Baby Essentials customers"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="campaign-body">Message</Label>
                <Textarea
                  id="campaign-body"
                  value={campaignBody}
                  onChange={(event) => setCampaignBody(event.target.value)}
                  placeholder={"Write the campaign here.\n\nThis sends to active customers and manual campaign contacts."}
                  className="min-h-56"
                  required
                />
              </div>
              <Button type="submit" disabled={sendingCampaign || mergedRecipients.length === 0}>
                <Mail className="mr-2 h-4 w-4" />
                {sendingCampaign ? "Sending..." : "Send Campaign"}
              </Button>
              <p className="text-sm text-gray-500">
                Customers can opt out by clicking the unsubscribe link in the email or by turning off campaign emails in the dashboard security tab.
              </p>
            </form>
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Manual Campaign Contacts</CardTitle>
              <Button type="button" variant="outline" onClick={() => setShowContactModal(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Email
              </Button>
            </CardHeader>
            <CardContent>
              {contacts.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Add manual campaign contacts here to reach people who are not registered customers.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last Sent</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contacts.map((contact) => (
                        <TableRow key={contact.id}>
                          <TableCell>{contact.full_name?.trim() || "Manual contact"}</TableCell>
                          <TableCell>{contact.email}</TableCell>
                          <TableCell>{contact.is_active ? "Active" : "Inactive"}</TableCell>
                          <TableCell>{formatDateTime(contact.last_sent_at ?? contact.created_at)}</TableCell>
                          <TableCell>
                            {contact.is_active ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => void handleToggleContact(contact, false)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Remove
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => void handleToggleContact(contact, true)}
                              >
                                <RefreshCcw className="mr-2 h-4 w-4" />
                                Reactivate
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Campaign Reach</CardTitle>
            </CardHeader>
            <CardContent>
              {mergedRecipients.length === 0 ? (
                <p className="text-sm text-gray-500">No campaign recipients are available yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Source</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mergedRecipients.slice(0, 10).map((recipient) => (
                        <TableRow key={recipient.email}>
                          <TableCell>{recipient.name}</TableCell>
                          <TableCell>{recipient.email}</TableCell>
                          <TableCell>{recipient.source}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Campaign History</CardTitle>
            </CardHeader>
            <CardContent>
              {customerCampaignHistory.length === 0 ? (
                <p className="text-sm text-gray-500">No customer campaigns sent yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Subject</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Recipients</TableHead>
                        <TableHead>Sent</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customerCampaignHistory.slice(0, 6).map((campaign) => (
                        <TableRow key={campaign.id}>
                          <TableCell>{campaign.subject}</TableCell>
                          <TableCell>{campaign.status}</TableCell>
                          <TableCell>{campaign.recipient_count}</TableCell>
                          <TableCell>{formatDateTime(campaign.sent_at ?? campaign.created_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={showContactModal} onOpenChange={setShowContactModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Manual Campaign Contact</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveContact} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="manual-contact-name">Name</Label>
              <Input
                id="manual-contact-name"
                value={manualContactName}
                onChange={(event) => setManualContactName(event.target.value)}
                placeholder="Optional"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="manual-contact-email">Email</Label>
              <Input
                id="manual-contact-email"
                type="email"
                value={manualContactEmail}
                onChange={(event) => setManualContactEmail(event.target.value)}
                placeholder="contact@example.com"
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={savingContact}>
              {savingContact ? "Saving..." : "Save Campaign Contact"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
