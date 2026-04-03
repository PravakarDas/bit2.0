"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface MonthData {
  name: string;
  thisMonth: number;
  lastMonth: number;
}

interface MonthComparisonChartProps {
  data: MonthData[];
}

export function MonthComparisonChart({ data }: MonthComparisonChartProps) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="name" style={{ fontSize: "12px" }} />
        <YAxis style={{ fontSize: "12px" }} />
        <Tooltip formatter={(value) => `${value}`} />
        <Legend wrapperStyle={{ fontSize: "12px" }} />
        <Bar dataKey="thisMonth" fill="#3b82f6" name="This Month" radius={[4, 4, 0, 0]} />
        <Bar dataKey="lastMonth" fill="#d1d5db" name="Last Month" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
