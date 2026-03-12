import { getPendingProfileUpdateRequestsForManager } from "@/actions/manager.actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ManagerProfileRequestsList } from "@/components/manager/ManagerProfileRequestsList";
import { Bell, ClipboardList } from "lucide-react";

export default async function ManagerProfileRequestsPage() {
    const requests = await getPendingProfileUpdateRequestsForManager();

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">Profile Update Requests</h1>
                    <p className="text-gray-600 mt-1">
                        Review and approve employee profile update requests
                    </p>
                </div>
            </div>

            <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 shadow-sm">
                <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-blue-700">
                        <Bell className="h-5 w-5" />
                        Pending Requests
                    </CardTitle>
                    <CardDescription className="text-blue-600">
                        {requests.length === 0 
                            ? "No pending profile update requests" 
                            : `${requests.length} pending profile update${requests.length === 1 ? '' : 's'} awaiting your review`
                        }
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {requests.length === 0 ? (
                        <div className="text-center py-12">
                            <ClipboardList className="h-16 w-16 text-blue-300 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-blue-800 mb-2">
                                No Pending Requests
                            </h3>
                            <p className="text-blue-600">
                                All profile update requests have been processed.
                            </p>
                        </div>
                    ) : (
                        <ManagerProfileRequestsList 
                            initialRequests={requests}
                        />
                    )}
                </CardContent>
            </Card>
        </div>
    );
}