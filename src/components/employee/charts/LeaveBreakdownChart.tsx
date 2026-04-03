"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

interface LeaveBreakdownChartProps {
  leaves: Array<{
    name: string;
    remaining: number;
    total: number;
    used: number;
  }>;
}

export function LeaveBreakdownChart({ leaves }: LeaveBreakdownChartProps) {
  const data = leaves.map(leave => ({
    name: leave.name,
    value: leave.remaining
  })).filter(d => d.value > 0);

  const COLORS = ["#3b82f6", "#ec4899", "#14b8a6", "#f59e0b"];

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={45}
          outerRadius={70}
          paddingAngle={2}
          dataKey="value"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index]} />
          ))}
        </Pie>
        <Tooltip formatter={(value) => `${value} days`} />
        <Legend wrapperStyle={{ fontSize: "12px" }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
