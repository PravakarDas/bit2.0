"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface OvertimeData {
  name: string;
  hours: number;
}

interface OvertimeTrendChartProps {
  data: OvertimeData[];
}

export function OvertimeTrendChart({ data }: OvertimeTrendChartProps) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="name" style={{ fontSize: "12px" }} />
        <YAxis style={{ fontSize: "12px" }} />
        <Tooltip formatter={(value) => `${value}h`} />
        <Legend wrapperStyle={{ fontSize: "12px" }} />
        <Line
          type="monotone"
          dataKey="hours"
          stroke="#f59e0b"
          dot={{ fill: "#f59e0b", r: 4 }}
          activeDot={{ r: 6 }}
          name="Overtime Hours"
          strokeWidth={2}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
