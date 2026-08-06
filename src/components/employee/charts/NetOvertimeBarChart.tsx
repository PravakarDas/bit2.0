"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface NetOvertimeBarChartProps {
  data: Array<{ label: string; overtimeMinutes: number }>;
}

export function NetOvertimeBarChart({ data }: NetOvertimeBarChartProps) {
  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No data for this period.</p>;
  }

  const chartData = data.map((d) => ({ label: d.label, hours: Number((d.overtimeMinutes / 60).toFixed(2)) }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip formatter={(value) => [`${value}h`, "Net OT/UT"]} />
        <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
          {chartData.map((entry, index) => (
            <Cell key={index} fill={entry.hours >= 0 ? "#10b981" : "#ef4444"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
