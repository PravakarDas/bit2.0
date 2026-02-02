import { getAllDepartments } from "@/actions/department.actions";
import { getAllDesignations } from "@/actions/designation.actions";
import { getBranches } from "@/actions/branch.actions";
import { getBonusTypes } from "@/actions/bonus.actions";
import { getAllowanceTypes } from "@/actions/settings.actions";
import { UnifiedOrganizationClient } from "@/components/admin/UnifiedOrganizationClient";

export default async function OrganizationPage() {
  const [departments, designations, branches, bonuses, allowances] = await Promise.all([
    getAllDepartments(),
    getAllDesignations(),
    getBranches(),
    getBonusTypes(),
    getAllowanceTypes(),
  ]);

  return (
    <UnifiedOrganizationClient
      departments={departments}
      designations={designations}
      branches={branches}
      bonuses={bonuses}
      allowances={allowances}
    />
  );
}
