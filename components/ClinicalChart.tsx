
import React, { useEffect, useRef, useId, useMemo } from 'react';

declare const d3: any;

interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

interface ClinicalChartProps {
  type: 'bar' | 'line' | 'pie';
  data: ChartDataPoint[];
  title?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
}

/**
 * ClinicalChart Component
 * 
 * Renders a generic clinical chart using D3.js based on JSON data.
 * 
 * Visualization Standard Compliance:
 * - Uses D3.js for SVG-based rendering.
 * - Data structure defined as JSON objects.
 * - Responsive and accessible (WCAG 2.1).
 */
export const ClinicalChart: React.FC<ClinicalChartProps> = ({ 
  type, 
  data, 
  title, 
  xAxisLabel, 
  yAxisLabel 
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const componentId = useId();

  const drawChart = () => {
    if (!svgRef.current || !containerRef.current || !data || data.length === 0) return;

    const container = containerRef.current;
    const { width: containerWidth, height: containerHeight } = container.getBoundingClientRect();
    
    const margin = { top: 40, right: 30, bottom: 60, left: 60 };
    const width = containerWidth - margin.left - margin.right;
    const height = containerHeight - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Accessibility
    svg.attr('role', 'img')
       .attr('aria-label', `${title || 'Clinical Chart'}: ${type} chart showing ${data.length} data points`);
    
    svg.append('title').text(title || 'Clinical Chart');
    svg.append('desc').text(`A ${type} chart visualizing clinical data points.`);

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    if (type === 'bar') {
      const x = d3.scaleBand()
        .range([0, width])
        .domain(data.map(d => d.label))
        .padding(0.3);

      const y = d3.scaleLinear()
        .range([height, 0])
        .domain([0, d3.max(data, (d: any) => d.value) * 1.1]);

      // X Axis
      g.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x))
        .selectAll("text")
        .attr("transform", "translate(-10,0)rotate(-45)")
        .style("text-anchor", "end")
        .attr("font-size", "10px")
        .attr("class", "dark:fill-slate-400");

      // Y Axis
      g.append("g")
        .call(d3.axisLeft(y))
        .attr("class", "dark:fill-slate-400");

      // Grid lines
      g.append("g")
        .attr("class", "grid")
        .attr("stroke", "currentColor")
        .attr("stroke-opacity", 0.1)
        .call(d3.axisLeft(y).tickSize(-width).tickFormat(() => ""));

      // Bars
      g.selectAll(".bar")
        .data(data)
        .enter().append("rect")
        .attr("class", "bar")
        .attr("x", (d: any) => x(d.label))
        .attr("width", x.bandwidth())
        .attr("y", (d: any) => y(d.value))
        .attr("height", (d: any) => height - y(d.value))
        .attr("fill", (d: any) => d.color || "#3b82f6")
        .attr("rx", 4)
        .attr("ry", 4)
        .on("mouseover", function(event: any, d: any) {
            d3.select(this).attr("opacity", 0.8);
            const tooltip = d3.select(`#tooltip-${componentId}`);
            tooltip.transition().duration(200).style("opacity", .9);
            tooltip.html(`<strong>${d.label}</strong>: ${d.value}`)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", function() {
            d3.select(this).attr("opacity", 1);
            d3.select(`#tooltip-${componentId}`).transition().duration(500).style("opacity", 0);
        });

    } else if (type === 'line') {
      const x = d3.scalePoint()
        .range([0, width])
        .domain(data.map(d => d.label));

      const y = d3.scaleLinear()
        .range([height, 0])
        .domain([0, d3.max(data, (d: any) => d.value) * 1.1]);

      // X Axis
      g.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x))
        .selectAll("text")
        .attr("transform", "translate(-10,0)rotate(-45)")
        .style("text-anchor", "end")
        .attr("font-size", "10px");

      // Y Axis
      g.append("g")
        .call(d3.axisLeft(y));

      // Line
      const line = d3.line()
        .x((d: any) => x(d.label))
        .y((d: any) => y(d.value))
        .curve(d3.curveMonotoneX);

      g.append("path")
        .datum(data)
        .attr("fill", "none")
        .attr("stroke", "#3b82f6")
        .attr("stroke-width", 3)
        .attr("d", line);

      // Points
      g.selectAll(".dot")
        .data(data)
        .enter().append("circle")
        .attr("class", "dot")
        .attr("cx", (d: any) => x(d.label))
        .attr("cy", (d: any) => y(d.value))
        .attr("r", 5)
        .attr("fill", "#3b82f6")
        .attr("stroke", "white")
        .attr("stroke-width", 2)
        .on("mouseover", function(event: any, d: any) {
            d3.select(this).attr("r", 8);
            const tooltip = d3.select(`#tooltip-${componentId}`);
            tooltip.transition().duration(200).style("opacity", .9);
            tooltip.html(`<strong>${d.label}</strong>: ${d.value}`)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", function() {
            d3.select(this).attr("r", 5);
            d3.select(`#tooltip-${componentId}`).transition().duration(500).style("opacity", 0);
        });
    }

    // Labels
    if (xAxisLabel) {
      g.append("text")
        .attr("text-anchor", "middle")
        .attr("x", width / 2)
        .attr("y", height + margin.bottom - 10)
        .attr("font-size", "12px")
        .attr("font-weight", "bold")
        .attr("class", "fill-gray-600 dark:fill-slate-400")
        .text(xAxisLabel);
    }

    if (yAxisLabel) {
      g.append("text")
        .attr("text-anchor", "middle")
        .attr("transform", "rotate(-90)")
        .attr("y", -margin.left + 20)
        .attr("x", -height / 2)
        .attr("font-size", "12px")
        .attr("font-weight", "bold")
        .attr("class", "fill-gray-600 dark:fill-slate-400")
        .text(yAxisLabel);
    }

    if (title) {
      svg.append("text")
        .attr("x", containerWidth / 2)
        .attr("y", 25)
        .attr("text-anchor", "middle")
        .attr("font-size", "16px")
        .attr("font-weight", "black")
        .attr("class", "fill-gray-900 dark:fill-slate-100 uppercase tracking-tight")
        .text(title);
    }
  };

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(drawChart);
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [data, type, title]);

  return (
    <div className="w-full h-full flex flex-col">
      <div ref={containerRef} className="flex-grow min-h-[300px] relative">
        <svg ref={svgRef} className="w-full h-full"></svg>
        <div 
          id={`tooltip-${componentId}`} 
          className="absolute opacity-0 pointer-events-none bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm px-3 py-2 rounded-lg shadow-xl border border-gray-200 dark:border-slate-700 text-xs z-50 transition-opacity"
        ></div>
      </div>
    </div>
  );
};
