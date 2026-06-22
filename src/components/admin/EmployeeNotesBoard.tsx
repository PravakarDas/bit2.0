"use client";

import Link from "next/link";
import React, { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime12 } from "@/lib/utils";

interface Employee {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  branch?: { id: string; name: string } | null;
}

interface Note {
  id: string;
  note: string;
  createdAt: string;
  createdByUser?: { id: string; firstName?: string | null; lastName?: string | null; email?: string | null } | null;
}

interface Props {
  users: Employee[];
  employeeProfileBasePath: string;
}

export function EmployeeNotesBoard({ users, employeeProfileBasePath }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [notesByUser, setNotesByUser] = useState<Record<string, Note[]>>({});
  const [newNote, setNewNote] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const toggle = async (id: string) => {
    setExpanded((p) => ({ ...p, [id]: !p[id] }));
    if (!notesByUser[id]) {
      await loadNotes(id);
    }
  };

  async function loadNotes(userId: string) {
    try {
      const res = await fetch(`/api/employee-notes?employeeId=${encodeURIComponent(userId)}`);
      const json = await res.json();
      if (res.ok) setNotesByUser((p) => ({ ...p, [userId]: json.notes }));
    } catch (err) {
      console.error(err);
    }
  }

  async function handleAdd(userId: string) {
    const text = newNote[userId]?.trim();
    if (!text) return;
    try {
      const res = await fetch(`/api/employee-notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: userId, note: text }),
      });
      const json = await res.json();
      if (res.ok && json.note) {
        setNotesByUser((p) => ({ ...p, [userId]: [json.note, ...(p[userId] || [])] }));
        setNewNote((p) => ({ ...p, [userId]: "" }));
      } else {
        console.error(json);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDelete(id: string, userId: string) {
    try {
      const res = await fetch(`/api/employee-notes`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setNotesByUser((p) => ({ ...p, [userId]: (p[userId] || []).filter((n) => n.id !== id) }));
      } else {
        console.error(json);
      }
    } catch (err) {
      console.error(err);
    }
  }

  const sortedUsers = [...users].sort((a, b) => {
    const aName = `${a.firstName || ""} ${a.lastName || ""}`.trim() || a.email;
    const bName = `${b.firstName || ""} ${b.lastName || ""}`.trim() || b.email;
    return aName.localeCompare(bName);
  });

  const branches = Array.from(
    new Map(
      users
        .filter((u) => u.branch?.id && u.branch?.name)
        .map((u) => [u.branch!.id, { id: u.branch!.id, name: u.branch!.name }])
    ).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

  const normalizedSearch = search.trim().toLowerCase();
  const filteredUsers = sortedUsers.filter((u) => {
    const name = `${u.firstName || ""} ${u.lastName || ""}`.trim().toLowerCase();
    const email = u.email.toLowerCase();
    const matchesSearch =
      normalizedSearch.length === 0 ||
      name.includes(normalizedSearch) ||
      email.includes(normalizedSearch);
    const matchesBranch = branchFilter === "all" || u.branch?.id === branchFilter;
    return matchesSearch && matchesBranch;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Employee Notes Board</h1>
        <p className="text-muted-foreground">Notes visible only to Admins and Managers.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full max-w-xs space-y-2">
              <label htmlFor="employee-search" className="text-sm font-medium">
                Search Employee
              </label>
              <Input
                id="employee-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email"
              />
            </div>

            <div className="w-full max-w-xs space-y-2">
              <label htmlFor="employee-branch" className="text-sm font-medium">
                Branch
              </label>
              <select
                id="employee-branch"
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                <option value="all">All Branches</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>

            <Button type="button" variant="outline" onClick={() => {
              setSearch("");
              setBranchFilter("all");
            }}>
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Employees</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {filteredUsers.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">No employees found for selected filters.</div>
          ) : filteredUsers.map((u) => (
            <div key={u.id} className="border rounded p-2">
              <div className="flex items-center gap-3">
                <button aria-label="toggle" onClick={() => toggle(u.id)} className="p-1">
                  {expanded[u.id] ? <ChevronDown /> : <ChevronRight />}
                </button>
                <div className="flex-1">
                  <Link
                    href={`${employeeProfileBasePath}/${u.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    {`${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email}
                  </Link>
                  <div className="text-sm text-muted-foreground">{u.branch?.name ?? ""}</div>
                </div>
              </div>

              {expanded[u.id] && (
                <div className="mt-3 space-y-3">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Write a note..."
                      value={newNote[u.id] ?? ""}
                      onChange={(e) => setNewNote((p) => ({ ...p, [u.id]: e.target.value }))}
                    />
                    <Button onClick={() => handleAdd(u.id)}>
                      <Plus className="mr-2" size={14} /> Add
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {(notesByUser[u.id] || []).map((n) => (
                      <div key={n.id} className="p-2 border rounded">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="whitespace-pre-wrap">{n.note}</div>
                            <div className="text-xs text-muted-foreground">
                              {n.createdByUser ? `${n.createdByUser.firstName ?? ""} ${n.createdByUser.lastName ?? ""}`.trim() || "Unknown" : "Unknown"}
                              {" • "}
                              {formatDateTime12(n.createdAt)}
                            </div>
                          </div>
                          <div>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(n.id, u.id)}>
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default EmployeeNotesBoard;
