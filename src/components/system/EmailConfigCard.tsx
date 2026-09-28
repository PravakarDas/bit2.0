"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateEmailConfig, sendTestEmail } from "@/actions/email-config.actions";

type EmailConfigState = {
  provider: string;
  smtpHost: string;
  smtpPort: number;
  secure: boolean;
  senderEmail: string;
  hasAppPassword: boolean;
};

interface EmailConfigCardProps {
  initialConfig: EmailConfigState;
}

const PROVIDER_PRESETS: Record<string, { label: string; host: string; port: number; secure: boolean }> = {
  GMAIL: { label: "Gmail", host: "smtp.gmail.com", port: 587, secure: false },
  OFFICE365: { label: "Office 365", host: "smtp.office365.com", port: 587, secure: false },
  SENDGRID: { label: "SendGrid", host: "smtp.sendgrid.net", port: 587, secure: false },
  SMTP2GO: { label: "SMTP2GO", host: "mail.smtp2go.com", port: 587, secure: false },
  SES: { label: "Amazon SES", host: "email-smtp.us-east-1.amazonaws.com", port: 587, secure: false },
  MAILGUN: { label: "Mailgun", host: "smtp.mailgun.org", port: 587, secure: false },
  CUSTOM: { label: "Custom SMTP", host: "", port: 587, secure: false },
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EmailConfigCard({ initialConfig }: EmailConfigCardProps) {
  const [form, setForm] = useState({
    provider: initialConfig.provider,
    smtpHost: initialConfig.smtpHost,
    smtpPort: initialConfig.smtpPort,
    secure: initialConfig.secure,
    senderEmail: initialConfig.senderEmail,
    appPassword: "",
  });
  const [hasAppPassword, setHasAppPassword] = useState(initialConfig.hasAppPassword);
  const [receiverEmail, setReceiverEmail] = useState("");
  const [isSaving, startSave] = useTransition();
  const [isSendingTest, startSendTest] = useTransition();

  const passwordLabel = form.provider === "GMAIL" ? "Google App Password" : "SMTP Password / API Key";

  const handleProviderChange = (value: string) => {
    const preset = PROVIDER_PRESETS[value];
    setForm((prev) => ({
      ...prev,
      provider: value,
      smtpHost: preset?.host || prev.smtpHost,
      smtpPort: preset?.port ?? prev.smtpPort,
      secure: preset?.secure ?? prev.secure,
    }));
  };

  const handleSave = () => {
    if (!form.smtpHost.trim()) {
      toast.error("SMTP Host is required.");
      return;
    }
    if (!Number.isInteger(form.smtpPort) || form.smtpPort < 1 || form.smtpPort > 65535) {
      toast.error("SMTP Port must be a whole number between 1 and 65535.");
      return;
    }
    if (!EMAIL_REGEX.test(form.senderEmail.trim())) {
      toast.error("Sender Email must be a valid email address.");
      return;
    }
    if (!form.appPassword.trim() && !hasAppPassword) {
      toast.error(`${passwordLabel} is required.`);
      return;
    }

    startSave(async () => {
      try {
        const result = await updateEmailConfig(form);
        if (result.success) {
          toast.success(result.message);
          if (form.appPassword.trim()) {
            setHasAppPassword(true);
          }
          setForm((prev) => ({ ...prev, appPassword: "" }));
        } else {
          toast.error(result.message || "Failed to save email configuration");
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save email configuration");
      }
    });
  };

  const handleSendTest = () => {
    if (!EMAIL_REGEX.test(receiverEmail.trim())) {
      toast.error("Please enter a valid receiver email address.");
      return;
    }

    startSendTest(async () => {
      try {
        const result = await sendTestEmail(receiverEmail);
        if (result.success) {
          toast.success(result.message);
        } else {
          toast.error(result.message || "Failed to send test email");
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to send test email");
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email Configuration</CardTitle>
        <CardDescription>
          Configure the SMTP settings used to send all system notification emails (attendance, leave, payroll, and more).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="email-provider">SMTP Provider</Label>
            <Select value={form.provider} onValueChange={handleProviderChange}>
              <SelectTrigger id="email-provider" className="w-full">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PROVIDER_PRESETS).map(([value, preset]) => (
                  <SelectItem key={value} value={value}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email-sender">Sender Email Address</Label>
            <Input
              id="email-sender"
              type="email"
              value={form.senderEmail}
              onChange={(e) => setForm((prev) => ({ ...prev, senderEmail: e.target.value }))}
              placeholder="notifications@yourcompany.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email-host">SMTP Host</Label>
            <Input
              id="email-host"
              value={form.smtpHost}
              onChange={(e) => setForm((prev) => ({ ...prev, smtpHost: e.target.value }))}
              placeholder="smtp.gmail.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email-port">SMTP Port</Label>
            <Input
              id="email-port"
              type="number"
              min={1}
              max={65535}
              value={form.smtpPort}
              onChange={(e) => setForm((prev) => ({ ...prev, smtpPort: Number(e.target.value) }))}
              placeholder="587"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email-password">{passwordLabel}</Label>
            <Input
              id="email-password"
              type="password"
              value={form.appPassword}
              onChange={(e) => setForm((prev) => ({ ...prev, appPassword: e.target.value }))}
              placeholder={hasAppPassword ? "Leave blank to keep current password" : "Enter password"}
              autoComplete="new-password"
            />
          </div>

          <div className="space-y-1 pt-6">
            <div className="flex items-center gap-3">
              <Switch
                id="email-secure"
                checked={form.secure}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, secure: checked }))}
              />
              <Label htmlFor="email-secure">Secure (SSL/TLS)</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Port 587 (STARTTLS) → keep this off. Port 465 (implicit SSL) → turn this on. A mismatch here causes
              &quot;connection timed out&quot; errors.
            </p>
          </div>
        </div>

        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Email Configuration"}
        </Button>

        <Separator />

        <div className="space-y-3">
          <Label>Send Test Email</Label>
          <p className="text-xs text-muted-foreground">
            Uses the saved SMTP configuration above. Save your settings first if you just changed them.
          </p>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <Input
              type="email"
              value={receiverEmail}
              onChange={(e) => setReceiverEmail(e.target.value)}
              placeholder="Receiver email address"
              className="md:max-w-xs"
            />
            <Button variant="outline" onClick={handleSendTest} disabled={isSendingTest}>
              {isSendingTest ? "Sending..." : "Send Test Email"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
