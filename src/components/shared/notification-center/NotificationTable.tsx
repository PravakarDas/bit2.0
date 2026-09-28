"use client";

import { Archive, ArchiveRestore, Eye, MoreHorizontal, Trash2 } from "lucide-react";
import type { NotificationChannel, NotificationJobStatus } from "@prisma/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime12 } from "@/lib/utils";
import { NotificationStatusBadge } from "./NotificationStatusBadge";

export interface NotificationRow {
    jobId: string;
    title: string;
    channel: NotificationChannel;
    deliveryStatus: NotificationJobStatus;
    isRead: boolean;
    isArchived: boolean;
    createdAt: Date;
    recipientLabel?: string | null;
}

interface NotificationTableProps {
    items: NotificationRow[];
    /** Shows the "Recipient" column — admin view only. */
    showRecipient?: boolean;
    onView: (jobId: string) => void;
    onToggleRead?: (row: NotificationRow) => void;
    onToggleArchive?: (row: NotificationRow) => void;
    onDelete?: (row: NotificationRow) => void;
}

export function NotificationTable({ items, showRecipient, onView, onToggleRead, onToggleArchive, onDelete }: NotificationTableProps) {
    if (items.length === 0) {
        return (
            <Card>
                <CardContent className="p-6 text-center text-muted-foreground">No notifications found for the selected filters.</CardContent>
            </Card>
        );
    }

    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-8" />
                        <TableHead>Title</TableHead>
                        {showRecipient ? <TableHead>Recipient</TableHead> : null}
                        <TableHead>Channel</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Received</TableHead>
                        <TableHead className="w-10" />
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {items.map((row) => (
                        <TableRow key={row.jobId} className={row.isRead ? "" : "bg-blue-50/60 dark:bg-blue-950/20"}>
                            <TableCell>
                                {!row.isRead && <span className="block h-2 w-2 rounded-full bg-blue-500" aria-label="Unread" />}
                            </TableCell>
                            <TableCell>
                                <button
                                    type="button"
                                    onClick={() => onView(row.jobId)}
                                    className="text-left font-medium hover:underline flex items-center gap-2"
                                >
                                    {row.title}
                                    {row.isArchived && (
                                        <Badge variant="secondary" className="text-[10px]">
                                            Archived
                                        </Badge>
                                    )}
                                </button>
                            </TableCell>
                            {showRecipient ? <TableCell className="text-sm text-muted-foreground">{row.recipientLabel ?? "—"}</TableCell> : null}
                            <TableCell className="text-sm">{row.channel}</TableCell>
                            <TableCell>
                                <NotificationStatusBadge status={row.deliveryStatus} />
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{formatDateTime12(row.createdAt)}</TableCell>
                            <TableCell>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                            <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => onView(row.jobId)}>
                                            <Eye className="mr-2 h-4 w-4" />
                                            View details
                                        </DropdownMenuItem>
                                        {onToggleRead && !row.isRead && (
                                            <DropdownMenuItem onClick={() => onToggleRead(row)}>
                                                <Eye className="mr-2 h-4 w-4" />
                                                Mark as read
                                            </DropdownMenuItem>
                                        )}
                                        {onToggleArchive && (
                                            <DropdownMenuItem onClick={() => onToggleArchive(row)}>
                                                {row.isArchived ? (
                                                    <>
                                                        <ArchiveRestore className="mr-2 h-4 w-4" />
                                                        Unarchive
                                                    </>
                                                ) : (
                                                    <>
                                                        <Archive className="mr-2 h-4 w-4" />
                                                        Archive
                                                    </>
                                                )}
                                            </DropdownMenuItem>
                                        )}
                                        {onDelete && row.isArchived && (
                                            <DropdownMenuItem onClick={() => onDelete(row)} className="text-red-600">
                                                <Trash2 className="mr-2 h-4 w-4" />
                                                Delete
                                            </DropdownMenuItem>
                                        )}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
