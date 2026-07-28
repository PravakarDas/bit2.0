"use client";

import { Search } from "lucide-react";
import { NotificationChannel, NotificationJobStatus } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";

export type NotificationTabFilter = "inbox" | "unread" | "read" | "archived";

export interface NotificationFiltersState {
    tab: NotificationTabFilter;
    channel: NotificationChannel | "ALL";
    deliveryStatus: NotificationJobStatus | "ALL";
    dateFrom: string;
    dateTo: string;
    search: string;
}

export const DEFAULT_NOTIFICATION_FILTERS: NotificationFiltersState = {
    tab: "inbox",
    channel: "ALL",
    deliveryStatus: "ALL",
    dateFrom: "",
    dateTo: "",
    search: "",
};

interface NotificationFiltersBarProps {
    value: NotificationFiltersState;
    onChange: (value: NotificationFiltersState) => void;
}

export function NotificationFiltersBar({ value, onChange }: NotificationFiltersBarProps) {
    return (
        <Card>
            <CardContent className="p-4 space-y-3">
                <Tabs value={value.tab} onValueChange={(tab) => onChange({ ...value, tab: tab as NotificationTabFilter })}>
                    <TabsList>
                        <TabsTrigger value="inbox">Inbox</TabsTrigger>
                        <TabsTrigger value="unread">Unread</TabsTrigger>
                        <TabsTrigger value="read">Read</TabsTrigger>
                        <TabsTrigger value="archived">Archived</TabsTrigger>
                    </TabsList>
                </Tabs>

                <div className="grid gap-3 md:grid-cols-5">
                    <div className="md:col-span-2 relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by title or body..."
                            className="pl-8"
                            value={value.search}
                            onChange={(e) => onChange({ ...value, search: e.target.value })}
                        />
                    </div>

                    <Select
                        value={value.channel}
                        onValueChange={(channel) => onChange({ ...value, channel: channel as NotificationChannel | "ALL" })}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Channel" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">All Channels</SelectItem>
                            {Object.values(NotificationChannel).map((channel) => (
                                <SelectItem key={channel} value={channel}>
                                    {channel}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select
                        value={value.deliveryStatus}
                        onValueChange={(status) => onChange({ ...value, deliveryStatus: status as NotificationJobStatus | "ALL" })}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Delivery status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">All Statuses</SelectItem>
                            {Object.values(NotificationJobStatus).map((status) => (
                                <SelectItem key={status} value={status}>
                                    {status.replace(/_/g, " ")}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Input type="date" value={value.dateFrom} onChange={(e) => onChange({ ...value, dateFrom: e.target.value })} />
                    <Input type="date" value={value.dateTo} onChange={(e) => onChange({ ...value, dateTo: e.target.value })} />
                </div>
            </CardContent>
        </Card>
    );
}
