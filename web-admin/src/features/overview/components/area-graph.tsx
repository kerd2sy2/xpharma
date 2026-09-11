'use client';

import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from '@/components/ui/chart';
import { Badge } from '@/components/ui/badge';
import { Icons } from '@/components/icons';
import React from 'react';

const chartData = [
  { month: 'يناير', desktop: 342, mobile: 245 },
  { month: 'فبراير', desktop: 876, mobile: 654 },
  { month: 'مارس', desktop: 512, mobile: 387 },
  { month: 'أبريل', desktop: 629, mobile: 521 },
  { month: 'مايو', desktop: 458, mobile: 412 },
  { month: 'يونيو', desktop: 781, mobile: 598 },
  { month: 'يوليو', desktop: 394, mobile: 312 },
  { month: 'أغسطس', desktop: 925, mobile: 743 },
  { month: 'سبتمبر', desktop: 647, mobile: 489 },
  { month: 'أكتوبر', desktop: 532, mobile: 476 },
  { month: 'نوفمبر', desktop: 803, mobile: 687 },
  { month: 'ديسمبر', desktop: 271, mobile: 198 }
];

const chartConfig = {
  desktop: {
    label: 'أجهزة الكمبيوتر',
    color: 'var(--chart-1)'
  },
  mobile: {
    label: 'الهواتف الذكية',
    color: 'var(--chart-2)'
  }
} satisfies ChartConfig;

export function AreaGraph() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          معدل تدفق المعاملات والمزامنة
          <Badge variant='outline'>
            <Icons.trendingUp />
            +18.4%
          </Badge>
        </CardTitle>
        <CardDescription>عرض نشاط المنصة وحجم الزيارات على مدار العام</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <AreaChart accessibilityLayer data={chartData}>
            <CartesianGrid vertical={false} strokeDasharray='3 3' />
            <XAxis
              dataKey='month'
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => value.slice(0, 3)}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <defs>
              <DottedBackgroundPattern config={chartConfig} />
            </defs>
            <Area
              dataKey='mobile'
              type='natural'
              fill='url(#dotted-background-pattern-mobile)'
              fillOpacity={0.4}
              stroke='var(--color-mobile)'
              stackId='a'
              strokeWidth={0.8}
            />
            <Area
              dataKey='desktop'
              type='natural'
              fill='url(#dotted-background-pattern-desktop)'
              fillOpacity={0.4}
              stroke='var(--color-desktop)'
              stackId='a'
              strokeWidth={0.8}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

const DottedBackgroundPattern = ({ config }: { config: ChartConfig }) => {
  const items = Object.fromEntries(
    Object.entries(config).map(([key, value]) => [key, value.color])
  );
  return (
    <>
      {Object.entries(items).map(([key, value]) => (
        <pattern
          key={key}
          id={`dotted-background-pattern-${key}`}
          x='0'
          y='0'
          width='7'
          height='7'
          patternUnits='userSpaceOnUse'
        >
          <circle cx='5' cy='5' r='1.5' fill={value} opacity={0.5}></circle>
        </pattern>
      ))}
    </>
  );
};
