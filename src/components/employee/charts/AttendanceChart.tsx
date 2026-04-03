"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

interface AttendanceChartProps {
  present: number;
  absent: number;
  onLeave: number;
  weeklyOff: number;
}

export function AttendanceChart({ present, absent, onLeave, weeklyOff }: AttendanceChartProps) {
  const data = [
    { name: "Present", value: present },
    { name: "Absent", value: absent },
    { name: "On Leave", value: onLeave },
    { name: "Weekly Off", value: weeklyOff },
  ];

  const COLORS = ["#10b981", "#ef4444", "#f59e0b", "#8b5cf6"];

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
