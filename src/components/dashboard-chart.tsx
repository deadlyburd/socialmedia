"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function DashboardChart() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-[350px] w-full bg-muted/20 rounded-3xl">
        <p className="text-sm text-muted-foreground">Loading chart...</p>
      </div>
    );
  }

  return (
    <div className="h-[350px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
        >
          <XAxis
            dataKey="name"
            stroke="hsl(220 9% 46%)"
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="hsl(220 9% 46%)"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
          />
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(48 15% 85%)" />
          <Tooltip
            formatter={(value) => [`${(Number(value) / 1000).toFixed(1)}k`, "Amount"]}
            contentStyle={{
              backgroundColor: "hsl(48 24% 96%)",
              border: "none",
              borderRadius: "16px",
              boxShadow: "none",
            }}
          />
          <Bar
            dataKey="total"
            fill="hsl(3 55% 82%)"
            radius={[8, 8, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const data = [
  { name: "Jan", total: 45000 },
  { name: "Feb", total: 63500 },
  { name: "Mar", total: 58200 },
  { name: "Apr", total: 72800 },
  { name: "May", total: 85600 },
  { name: "Jun", total: 92400 },
  { name: "Jul", total: 105200 },
  { name: "Aug", total: 91000 },
  { name: "Sep", total: 97500 },
  { name: "Oct", total: 110800 },
  { name: "Nov", total: 142500 },
  { name: "Dec", total: 168000 },
];
