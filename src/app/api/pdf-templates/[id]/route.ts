import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDbUser } from "@/actions/user.actions";
import { generatePayslipPdf } from "@/lib/services/payslip-pdf.service";

/**
 * GET /api/pdf-templates/:id          -> the uploaded template PDF (inline)
 * GET /api/pdf-templates/:id?sample=1 -> a sample payslip laid on the template, to check the layout
 * Admin/HR only.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getDbUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "SUPERADMIN" && user.role !== "HR") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const template = await prisma.pdfTemplate.findUnique({ where: { id } });
    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const wantsSample = new URL(request.url).searchParams.get("sample") === "1";
    const body = wantsSample
      ? await generatePayslipPdf(
          {
            employeeName: "Sample Employee",
            employeeEmail: "sample.employee@example.com",
            month: "2026-01",
            baseSalary: 50000,
            totalBonuses: 5000,
            totalAllowances: 3000,
            medicalReimbursement: 1500,
            loanDeduction: 2000,
            walletAdjustment: 0,
            netAmount: 57500,
            customBonus: 2000,
            customBonusNote: "Sample bonus",
            employeeId: "BTCD1042",
            bonusLines: [
              { label: "Performance Bonus", amount: 2000 },
              { label: "Attendance Bonus", amount: 1000 },
            ],
            loanLines: [{ label: "EMI - Loan #a1b2c3 (balance Tk 18,000)", amount: 2000 }],
            walletTransactions: [
              { date: new Date(), description: "Approved Request: Sample reimbursement", amount: 500 },
              { date: new Date(), description: "Sample penalty", amount: -500 },
            ],
          },
          { letterhead: template.data }
        )
      : Buffer.from(template.data);

    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${wantsSample ? "sample-payslip.pdf" : encodeURIComponent(template.fileName)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Error serving PDF template:", error);
    return NextResponse.json({ error: "Failed to load the PDF" }, { status: 500 });
  }
}
