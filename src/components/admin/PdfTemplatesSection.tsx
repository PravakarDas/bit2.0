"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { deletePdfTemplate, uploadPdfTemplate, type getPdfTemplates } from "@/actions/pdf-template.actions";
import { MAX_PDF_TEMPLATE_BYTES, LETTERHEAD_MARGINS } from "@/lib/pdf-letterhead-constants";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type PdfTemplateSummary = Awaited<ReturnType<typeof getPdfTemplates>>;

interface PdfTemplatesSectionProps {
    templates: PdfTemplateSummary;
    branches: Array<{ id: string; name: string; isActive?: boolean }>;
}

const formatSize = (bytes: number) =>
    bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

type TemplateRowData = PdfTemplateSummary["defaultTemplate"];

function TemplateRow({
    label,
    hint,
    branchId,
    template,
}: {
    label: string;
    hint: string;
    branchId: string;
    template: TemplateRowData;
}) {
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState<null | "upload" | "delete">(null);
    const [confirmRemove, setConfirmRemove] = useState(false);

    const handleFile = async (file: File | undefined) => {
        if (!file) return;
        if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
            toast.error("Please choose a PDF file.");
            return;
        }
        if (file.size > MAX_PDF_TEMPLATE_BYTES) {
            toast.error("The PDF is larger than 5 MB.");
            return;
        }

        setBusy("upload");
        try {
            const formData = new FormData();
            formData.set("file", file);
            formData.set("branchId", branchId);
            const result = await uploadPdfTemplate(formData);
            if (result.success) {
                toast.success(result.message ?? "Template saved.");
                router.refresh();
            } else {
                toast.error(result.error ?? "Upload failed.");
            }
        } catch {
            toast.error("Upload failed. Please try again.");
        } finally {
            setBusy(null);
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    const handleRemove = async () => {
        if (!template) return;
        setBusy("delete");
        try {
            const result = await deletePdfTemplate(template.id);
            if (result.success) {
                toast.success("Template removed.");
                router.refresh();
            } else {
                toast.error(result.error ?? "Failed to remove the template.");
            }
        } finally {
            setBusy(null);
            setConfirmRemove(false);
        }
    };

    return (
        <TableRow className="hover:bg-muted/30 transition-colors">
            <TableCell className="font-medium">
                {label}
                <div className="text-xs font-normal text-muted-foreground">{hint}</div>
            </TableCell>
            <TableCell>
                {template ? (
                    <div className="flex items-start gap-2">
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                        <div className="leading-tight">
                            <div className="text-sm font-medium break-all">{template.fileName}</div>
                            <div className="text-xs text-muted-foreground">
                                {formatSize(template.sizeBytes)} · updated {formatDate(template.updatedAt)}
                            </div>
                        </div>
                    </div>
                ) : (
                    <Badge variant="outline" className="text-muted-foreground">No template</Badge>
                )}
            </TableCell>
            <TableCell className="text-right pr-6">
                <div className="flex flex-wrap items-center justify-end gap-2">
                    <input
                        ref={inputRef}
                        type="file"
                        accept="application/pdf,.pdf"
                        className="hidden"
                        onChange={(e) => void handleFile(e.target.files?.[0])}
                    />
                    <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => inputRef.current?.click()}>
                        {busy === "upload" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
                        {template ? "Replace" : "Upload"}
                    </Button>
                    {template && (
                        <>
                            <Button size="sm" variant="outline" asChild>
                                <a href={`/api/pdf-templates/${template.id}`} target="_blank" rel="noopener noreferrer">
                                    <Eye className="mr-1 h-4 w-4" /> View
                                </a>
                            </Button>
                            <Button size="sm" variant="outline" asChild>
                                <a href={`/api/pdf-templates/${template.id}?sample=1`} target="_blank" rel="noopener noreferrer">
                                    <FileText className="mr-1 h-4 w-4" /> Sample payslip
                                </a>
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                className="text-destructive"
                                disabled={busy !== null}
                                onClick={() => setConfirmRemove(true)}
                                aria-label={`Remove ${label} template`}
                            >
                                {busy === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            </Button>
                        </>
                    )}
                </div>

                <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Remove the {label} template?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Payslips that used it will fall back to the default template, or the plain design if there is none.
                                Payslips already sent are not affected.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleRemove}>Remove</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </TableCell>
        </TableRow>
    );
}

export function PdfTemplatesSection({ templates, branches }: PdfTemplatesSectionProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>PDF Templates</CardTitle>
                <CardDescription>
                    Upload a blank letterhead PDF (max 5 MB) for each branch. It is used as the background of that branch&apos;s
                    payslip PDFs sent by email. Branches without their own template use the Default one; if neither exists, the
                    plain design is used.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                    Only the first page of the PDF is used. Payslip content is placed inside a safe area: {LETTERHEAD_MARGINS.top} pt
                    below the top edge and stopping {LETTERHEAD_MARGINS.bottom} pt above the bottom edge, with {LETTERHEAD_MARGINS.left} pt
                    side margins. Keep your logo and footer inside those top and bottom areas, then use <strong>Sample payslip</strong> to check.
                </div>

                <div className="border rounded-lg overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/50">
                                <TableHead className="font-semibold">Applies to</TableHead>
                                <TableHead className="font-semibold">Template</TableHead>
                                <TableHead className="font-semibold text-right pr-6">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TemplateRow
                                label="Default (all branches)"
                                hint="Used when a branch has no template of its own"
                                branchId="default"
                                template={templates.defaultTemplate}
                            />
                            {branches.map((branch) => (
                                <TemplateRow
                                    key={branch.id}
                                    label={branch.name}
                                    hint={branch.isActive === false ? "Inactive branch" : "Branch template"}
                                    branchId={branch.id}
                                    template={templates.byBranch[branch.id] ?? null}
                                />
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}
