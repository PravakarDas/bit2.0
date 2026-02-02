"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { UserCheck } from "lucide-react";
import { getActiveBranches } from "@/actions/branch.actions";
import { approveEmployeeWithDetails } from "@/actions/employee.actions";
import { toast } from "sonner";

interface Branch {
  id: string;
  name: string;
}

export function ApproveEmployeeDialog({ userId }: { userId: string }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string>("");
  const [baseSalary, setBaseSalary] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadBranches = async () => {
      const data = await getActiveBranches();
      setBranches(data);
    };
    loadBranches();
  }, []);

  const handleApprove = async () => {
    if (!branchId) {
      toast.error("Branch is required");
      return;
    }
    if (!baseSalary || Number(baseSalary) <= 0) {
      toast.error("Base salary is required");
      return;
    }

    setLoading(true);
    try {
      const result = await approveEmployeeWithDetails(userId, branchId, Number(baseSalary));
      if (result.success) {
        toast.success("Employee approved successfully");
      } else {
        toast.error(result.error || "Failed to approve employee");
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to approve employee");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-green-600 hover:bg-green-700">
          <UserCheck className="mr-1 h-4 w-4" />
          Approve
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve Employee</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Branch</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger>
                <SelectValue placeholder="Select branch" />
              </SelectTrigger>
              <SelectContent>
                {branches.map(branch => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Base Salary</Label>
            <Input
              type="number"
              min="0"
              placeholder="Enter base salary"
              value={baseSalary}
              onChange={(e) => setBaseSalary(e.target.value)}
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={handleApprove} disabled={loading}>
              {loading ? "Approving..." : "Approve"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
