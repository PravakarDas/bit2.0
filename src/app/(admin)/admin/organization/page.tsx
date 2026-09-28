import { getAllDepartments } from "@/actions/department.actions";
import { getAllDesignations } from "@/actions/designation.actions";
import { getBranches } from "@/actions/branch.actions";
import { getBonusTypes } from "@/actions/bonus.actions";
import { getAllowanceTypes, getSystemSettings } from "@/actions/settings.actions";
import { getAllLeaveTypes } from "@/actions/leave.actions";
import { getPdfTemplates } from "@/actions/pdf-template.actions";
import { UnifiedOrganizationClient } from "@/components/admin/UnifiedOrganizationClient";

export default async function OrganizationPage() {
  const [departments, designations, branches, bonuses, allowances, systemSettings, leaveTypes, pdfTemplates] = await Promise.all([
    getAllDepartments(),
    getAllDesignations(),
    getBranches(),
    getBonusTypes(),
    getAllowanceTypes(),
    getSystemSettings(),
    getAllLeaveTypes(),
    getPdfTemplates(),
  ]);

  return (
    <UnifiedOrganizationClient
      departments={departments}
      designations={designations}
      branches={branches}
      bonuses={bonuses}
      allowances={allowances}
      systemSettings={systemSettings}
      leaveTypes={leaveTypes}
      pdfTemplates={pdfTemplates}
    />
  );
}
