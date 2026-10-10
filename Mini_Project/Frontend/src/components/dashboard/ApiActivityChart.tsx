import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ChartPoint } from "@/types/dashboard";

type ApiActivityChartProps = {
  data: ChartPoint[];
};

export function ApiActivityChart({ data }: ApiActivityChartProps) {
  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
          <Tooltip
            cursor={{ stroke: "#cbd5e1", strokeDasharray: "4 4" }}
            contentStyle={{
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 18px 40px -24px rgba(15, 23, 42, 0.35)",
            }}
          />
          <Legend iconType="circle" />
          <Line
            type="monotone"
            dataKey="requests"
            stroke="#2563eb"
            strokeWidth={2.5}
            dot={{ r: 3, fill: "#2563eb" }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="errors"
            stroke="#7c3aed"
            strokeWidth={2.5}
            dot={{ r: 3, fill: "#7c3aed" }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
