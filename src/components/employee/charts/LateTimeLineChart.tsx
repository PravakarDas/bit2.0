"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface LateTimeLineChartProps {
  data: Array<{ label: string; lateMinutes: number }>;
}

export function LateTimeLineChart({ data }: LateTimeLineChartProps) {
  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No data for this period.</p>;
  }

  const chartData = data.map((d) => ({ label: d.label, minutes: d.lateMinutes }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip formatter={(value) => [`${value} min`, "Late Time"]} />
        <Line type="monotone" dataKey="minutes" stroke="#f43f5e" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
