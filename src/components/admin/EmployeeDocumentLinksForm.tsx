"use client";

import { useState } from "react";
import { updateEmployeeDocumentLinks } from "@/actions/employee.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface EmployeeDocumentLinksFormProps {
  employeeId: string;
  initialValues: {
    loanPapersLink: string | null;
    nomineesPapersLink: string | null;
    emergencyContactLink: string | null;
    personalInfoLink: string | null;
  };
}

function isValidHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function EmployeeDocumentLinksForm({ employeeId, initialValues }: EmployeeDocumentLinksFormProps) {
  const [loanPapersLink, setLoanPapersLink] = useState(initialValues.loanPapersLink || "");
  const [nomineesPapersLink, setNomineesPapersLink] = useState(initialValues.nomineesPapersLink || "");
  const [emergencyContactLink, setEmergencyContactLink] = useState(initialValues.emergencyContactLink || "");
  const [personalInfoLink, setPersonalInfoLink] = useState(initialValues.personalInfoLink || "");
  const [isSaving, setIsSaving] = useState(false);

  const validateLink = (label: string, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return true;
    if (!isValidHttpUrl(trimmed)) {
      toast.error(`${label} must be a valid URL (http/https)`);
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validateLink("Loan papers link", loanPapersLink)) return;
    if (!validateLink("Nominees papers link", nomineesPapersLink)) return;
    if (!validateLink("Emergency contact link", emergencyContactLink)) return;
    if (!validateLink("Personal info link", personalInfoLink)) return;

    setIsSaving(true);
    try {
      const result = await updateEmployeeDocumentLinks(employeeId, {
        loanPapersLink: loanPapersLink.trim() || null,
        nomineesPapersLink: nomineesPapersLink.trim() || null,
        emergencyContactLink: emergencyContactLink.trim() || null,
        personalInfoLink: personalInfoLink.trim() || null,
      });

      if (result.success) {
        toast.success("Document links updated");
      } else {
        toast.error(result.error || "Failed to update document links");
      }
    } catch (error) {
      console.error("Failed to update document links:", error);
      toast.error("Failed to update document links");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium text-muted-foreground">Loan Papers Link</label>
        <Input
          type="url"
          placeholder="https://..."
          value={loanPapersLink}
          onChange={(event) => setLoanPapersLink(event.target.value)}
        />
      </div>

      <div>
        <label className="text-sm font-medium text-muted-foreground">Nominees Papers Link</label>
        <Input
          type="url"
          placeholder="https://..."
          value={nomineesPapersLink}
          onChange={(event) => setNomineesPapersLink(event.target.value)}
        />
      </div>

      <div>
        <label className="text-sm font-medium text-muted-foreground">Emergency Contact Link</label>
        <Input
          type="url"
          placeholder="https://..."
          value={emergencyContactLink}
          onChange={(event) => setEmergencyContactLink(event.target.value)}
        />
      </div>

      <div>
        <label className="text-sm font-medium text-muted-foreground">Personal Info Link</label>
        <Input
          type="url"
          placeholder="https://..."
          value={personalInfoLink}
          onChange={(event) => setPersonalInfoLink(event.target.value)}
        />
      </div>

      <Button onClick={handleSave} disabled={isSaving} size="sm">
        {isSaving ? "Saving..." : "Save Links"}
      </Button>
    </div>
  );
}
