import {
    getPendingMedicalClaims,
    getAllMedicalClaimsHistory,
    getAllEmployeeMedicalEntitlements
} from "@/actions/medical.actions";
import MedicalClaimsClient from "@/components/admin/MedicalClaimsClient";

export default async function AdminMedicalClaimsPage() {
    const pendingClaims = await getPendingMedicalClaims();
    const allClaimsData = await getAllMedicalClaimsHistory();
    const employeeEntitlements = await getAllEmployeeMedicalEntitlements();

    return (
        <MedicalClaimsClient 
            initialPendingClaims={pendingClaims}
            allClaimsData={allClaimsData}
            employeeEntitlements={employeeEntitlements}
        />
    );
}
