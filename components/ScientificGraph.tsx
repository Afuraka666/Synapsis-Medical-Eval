
import React, { useEffect, useRef, useCallback } from 'react';

declare const d3: any;

type GraphType = 'oxygen_dissociation' | 'frank_starling' | 'pressure_volume_loop' | 'cerebral_pressure_volume' | 'cerebral_autoregulation' | 'capnography' | 'spirometry' | 'respiratory_flow_volume' | 'other';

interface ScientificGraphProps {
    type: GraphType;
    title: string;
    className?: string;
}

export const ScientificGraph: React.FC<ScientificGraphProps> = ({ type, title, className }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    
    const isSupportedType = ['oxygen_dissociation', 'frank_starling', 'pressure_volume_loop', 'cerebral_pressure_volume', 'cerebral_autoregulation', 'capnography', 'spirometry', 'respiratory_flow_volume'].includes(type);

    const renderGraph = useCallback(() => {
        if (!containerRef.current || !isSupportedType) return;
        
        const container = d3.select(containerRef.current);
        container.selectAll('*').remove();

        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width === 0) return;

        const isMobile = rect.width < 640;
        const margin = isMobile 
            ? { top: 50, right: 20, bottom: 50, left: 50 }
            : { top: 60, right: 60, bottom: 60, left: 75 };
            
        const width = rect.width - margin.left - margin.right;
        const height = (isMobile ? 300 : 400) - margin.top - margin.bottom;

        if (width <= 0 || height <= 0) return;

        const isDark = document.documentElement.classList.contains('dark');
        const textColor = isDark ? '#f1f5f9' : '#0f172a';
        const gridColor = isDark ? '#334155' : '#cbd5e1';
        const labelFontSize = isMobile ? '10px' : '13px';
        const axisFontSize = isMobile ? '10px' : '12px';
        const titleFontSize = isMobile ? '16px' : '20px';

        const svg = container.append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom)
            .attr('class', 'overflow-visible font-sans')
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        const x = d3.scaleLinear().range([0, width]);
        const y = d3.scaleLinear().range([height, 0]);

        // Tooltip Marker Helper
        const addMarker = (xVal: number, yVal: number, color: string, infoTitle: string, infoDesc: string) => {
            const markerSize = isMobile ? 8 : 10;
            const marker = svg.append('g')
                .attr('class', 'info-marker cursor-help transition-all')
                .attr('transform', `translate(${x(xVal)}, ${y(yVal)})`);

            marker.append('circle')
                .attr('r', markerSize)
                .attr('fill', color)
                .attr('stroke', '#fff')
                .attr('stroke-width', isMobile ? 1.5 : 2.5)
                .attr('filter', 'drop-shadow(0px 2px 4px rgba(0,0,0,0.2))');

            marker.append('text')
                .attr('text-anchor', 'middle')
                .attr('dy', '0.35em')
                .attr('fill', '#fff')
                .attr('font-size', isMobile ? '9px' : '12px')
                .attr('font-weight', '900')
                .text('i');

            const tooltip = marker.append('g')
                .attr('class', 'marker-tooltip')
                .style('opacity', 0)
                .style('pointer-events', 'none');

            const tooltipWidth = isMobile ? 160 : 220;
            const tooltipHeight = isMobile ? 80 : 100;

            tooltip.append('rect')
                .attr('x', 15)
                .attr('y', -45)
                .attr('width', tooltipWidth)
                .attr('height', tooltipHeight)
                .attr('rx', 12)
                .attr('fill', isDark ? '#1e293b' : '#ffffff')
                .attr('stroke', color)
                .attr('stroke-width', 2)
                .style('filter', 'drop-shadow(0 10px 20px rgba(0,0,0,0.2))');

            const text = tooltip.append('text')
                .attr('x', 25)
                .attr('y', -22)
                .attr('font-size', isMobile ? '11px' : '13px')
                .attr('fill', textColor);

            text.append('tspan')
                .attr('font-weight', '900')
                .attr('fill', color)
                .attr('text-transform', 'uppercase')
                .attr('letter-spacing', '0.08em')
                .text(infoTitle);

            infoDesc.split('\n').forEach((line, i) => {
                text.append('tspan')
                    .attr('x', 25)
                    .attr('dy', i === 0 ? '1.6em' : '1.4em')
                    .attr('font-weight', '600')
                    .text(line);
            });

            marker.on('mouseenter', function() {
                d3.select(this).select('circle').transition().duration(200).attr('r', markerSize + 2).attr('stroke-width', isMobile ? 2 : 3);
                tooltip.transition().duration(300).style('opacity', 1).attr('transform', 'translate(8, 0)');
            }).on('mouseleave', function() {
                d3.select(this).select('circle').transition().duration(200).attr('r', markerSize).attr('stroke-width', isMobile ? 1.5 : 2.5);
                tooltip.transition().duration(300).style('opacity', 0).attr('transform', 'translate(0, 0)');
            });
        };

        let activeData: any[] = [];
        let bisect = d3.bisector((d: any) => d.x).left;
        let xLabel = "";
        let yLabel = "";
        let xUnit = "";
        let yUnit = "";

        if (type === 'oxygen_dissociation') {
            const n = 2.8;
            const calcSaO2 = (p: number, p50: number) => (Math.pow(p, n) / (Math.pow(p, n) + Math.pow(p50, n))) * 100;
            const gen = (p50Val: number) => {
                const arr = [];
                for (let p = 0; p <= 110; p += 0.5) arr.push({ x: p, y: calcSaO2(p, p50Val) });
                return arr;
            };
            x.domain([0, 110]); y.domain([0, 105]);
            activeData = gen(26.6);
            xLabel = "Partial Pressure (PaO₂)"; yLabel = "Saturation (SaO₂)";
            xUnit = " mmHg"; yUnit = "%";
            const line = d3.line().x((d: any) => x(d.x)).y((d: any) => y(d.y)).curve(d3.curveBasis);
            svg.append('path').datum(gen(18.6)).attr('fill', 'none').attr('stroke', '#0ea5e9').attr('stroke-width', 2.5).attr('stroke-dasharray', '6,4').attr('d', line).attr('opacity', 0.4);
            svg.append('path').datum(gen(34.6)).attr('fill', 'none').attr('stroke', '#f43f5e').attr('stroke-width', 2.5).attr('stroke-dasharray', '6,4').attr('d', line).attr('opacity', 0.4);
            svg.append('path').datum(activeData).attr('fill', 'none').attr('stroke', isDark ? '#3b82f6' : '#1e3a8a').attr('stroke-width', 5).attr('d', line);
            
            addMarker(26.6, 50, isDark ? '#3b82f6' : '#1e3a8a', 'P50 Value', 'The PaO₂ at which Hb is\n50% saturated (~26.6 mmHg).\nA marker of Hb-O₂ affinity.');
            addMarker(15, 88, '#0ea5e9', 'Left Shift', 'Increased O₂ affinity.\nCaused by ↓Temp, ↓H⁺, ↓CO₂,\nand ↓2,3-BPG.');
            addMarker(80, 60, '#f43f5e', 'Right Shift', 'Decreased O₂ affinity.\nAssists tissue unloading.\nCaused by ↑Temp, ↑H⁺, ↑CO₂.');
        } else if (type === 'frank_starling') {
            x.domain([0, 200]); y.domain([0, 150]);
            xLabel = "End-Diastolic Volume"; yLabel = "Stroke Volume";
            xUnit = " mL"; yUnit = " mL";
            const gen = (k: number) => {
                const arr = [];
                for (let v = 0; v <= 200; v += 2) arr.push({ x: v, y: k * (1 - Math.exp(-0.02 * v)) * 100 });
                return arr;
            };
            activeData = gen(1.2);
            const line = d3.line().x((d: any) => x(d.x)).y((d: any) => y(d.y)).curve(d3.curveBasis);
            svg.append('path').datum(gen(1.7)).attr('fill', 'none').attr('stroke', '#10b981').attr('stroke-width', 2.5).attr('stroke-dasharray', '4,2').attr('d', line).attr('opacity', 0.4);
            svg.append('path').datum(gen(0.6)).attr('fill', 'none').attr('stroke', '#f43f5e').attr('stroke-width', 2.5).attr('stroke-dasharray', '4,2').attr('d', line).attr('opacity', 0.4);
            svg.append('path').datum(activeData).attr('fill', 'none').attr('stroke', '#3b82f6').attr('stroke-width', 5).attr('d', line);
            
            addMarker(30, 105, '#10b981', 'Hypercontractility', 'Enhanced SV for same EDV.\nOccurs with sympathetic\nstimulation or Inotropes.');
            addMarker(160, 55, '#f43f5e', 'Heart Failure', 'Curve flattens. SV fails to\nincrease with preload.\nLeads to pulmonary edema.');
        } else if (type === 'pressure_volume_loop') {
            x.domain([40, 165]); y.domain([0, 145]);
            xLabel = "LV Volume"; yLabel = "LV Pressure";
            xUnit = " mL"; yUnit = " mmHg";
            activeData = [
                {x: 50, y: 10}, {x: 150, y: 12}, // Filling
                {x: 150, y: 80}, // Isovolumetric contraction
                {x: 110, y: 125}, {x: 50, y: 85}, // Ejection
                {x: 50, y: 10} // Isovolumetric relaxation
            ];
            const line = d3.line().x((d: any) => x(d.x)).y((d: any) => y(d.y)).curve(d3.curveCatmullRomClosed.alpha(0.5));
            svg.append('path').datum(activeData).attr('fill', 'url(#loop-gradient-fid)').attr('stroke', '#3b82f6').attr('stroke-width', 5).attr('d', line);
            
            const defs = svg.append('defs');
            const gradient = defs.append('linearGradient').attr('id', 'loop-gradient-fid').attr('x1', '0%').attr('y1', '0%').attr('x2', '0%').attr('y2', '100%');
            gradient.append('stop').attr('offset', '0%').attr('stop-color', '#3b82f6').attr('stop-opacity', 0.25);
            gradient.append('stop').attr('offset', '100%').attr('stop-color', '#3b82f6').attr('stop-opacity', 0.05);

            addMarker(150, 45, '#94a3b8', 'End-Diastolic Point', 'Mitral valve closure.\nRepresents Maximum Preload\nbefore contraction begins.');
            addMarker(50, 45, '#94a3b8', 'End-Systolic Point', 'Aortic valve closure.\nReflects residual volume\nafter ventricular ejection.');
        } else if (type === 'cerebral_pressure_volume') {
            x.domain([0, 100]); y.domain([0, 100]);
            xLabel = "Intracranial Volume Addition"; yLabel = "ICP";
            xUnit = " %"; yUnit = " mmHg";
            for (let v = 0; v <= 100; v += 1) activeData.push({ x: v, y: 4 * Math.exp(0.032 * v) });
            const line = d3.line().x((d: any) => x(d.x)).y((d: any) => y(d.y)).curve(d3.curveBasis);
            svg.append('path').datum(activeData).attr('fill', 'none').attr('stroke', '#ef4444').attr('stroke-width', 5).attr('d', line);
            
            addMarker(20, 12, '#10b981', 'Monro-Kellie Phase', 'CSF and Venous blood are\ndisplaced to keep ICP stable\ndespite mass addition.');
            addMarker(85, 65, '#dc2626', 'Herniation Risk', 'Low Compliance point.\nSmall volume increases cause\nlethal pressure spikes.');
        } else if (type === 'cerebral_autoregulation') {
            x.domain([0, 200]); y.domain([0, 100]);
            xLabel = "Mean Arterial Pressure (MAP)"; yLabel = "Cerebral Blood Flow (CBF)";
            xUnit = " mmHg"; yUnit = " %";
            for (let map = 0; map <= 200; map += 2) {
                let cbf = 50;
                if (map < 50) cbf = map; 
                else if (map > 150) cbf = 50 + (map - 150) * 0.9;
                activeData.push({ x: map, y: cbf });
            }
            const line = d3.line().x((d: any) => x(d.x)).y((d: any) => y(d.y)).curve(d3.curveBasis);
            svg.append('path').datum(activeData).attr('fill', 'none').attr('stroke', '#10b981').attr('stroke-width', 5).attr('d', line);
            
            addMarker(50, 50, '#94a3b8', 'Lower Limit', 'Below 50mmHg, vessels are\nfully dilated; CBF drops\nleading to cerebral ischemia.');
            addMarker(150, 50, '#94a3b8', 'Upper Limit', 'Above 150mmHg, vessels are\nfully constricted; flow rises\nrisking BBB disruption.');
        } else if (type === 'capnography') {
            x.domain([0, 10]); y.domain([0, 50]);
            xLabel = "Time (seconds)"; yLabel = "Partial Pressure (EtCO₂)";
            xUnit = "s"; yUnit = " mmHg";
            activeData = [
                {x: 0, y: 0}, {x: 1, y: 0}, 
                {x: 1.5, y: 38}, 
                {x: 4.5, y: 40}, 
                {x: 5, y: 0}, 
                {x: 10, y: 0} 
            ];
            const line = d3.line().x((d: any) => x(d.x)).y((d: any) => y(d.y)).curve(d3.curveLinear);
            svg.append('path').datum(activeData).attr('fill', 'none').attr('stroke', '#16a34a').attr('stroke-width', 5).attr('d', line);
            
            addMarker(1.2, 20, '#94a3b8', 'Phase II', 'Rapid rise as alveolar gas\nmixes with anatomical dead\nspace gas.');
            addMarker(4.5, 40, '#dc2626', 'EtCO₂ Peak', 'The maximum CO₂ value at\nthe end of exhalation.\nReflects cardiac output.');
            addMarker(6, 10, '#3b82f6', 'Inspiration', 'Fresh gas wash-in rapidly\nlowers CO₂ back to baseline.');
        } else if (type === 'spirometry') {
            x.domain([0, 10]); y.domain([0, 6]);
            xLabel = "Time (seconds)"; yLabel = "Volume (Liters)";
            xUnit = "s"; yUnit = " L";
            for (let t = 0; t <= 10; t += 0.1) {
                let v = 2.5 + 0.5 * Math.sin(Math.PI * t / 2);
                if (t > 4 && t < 6) v = 3.0 + 2.5 * Math.sin(Math.PI * (t-4) / 2);
                activeData.push({ x: t, y: v });
            }
            const line = d3.line().x((d: any) => x(d.x)).y((d: any) => y(d.y)).curve(d3.curveBasis);
            svg.append('path').datum(activeData).attr('fill', 'none').attr('stroke', '#7c3aed').attr('stroke-width', 5).attr('d', line);
            
            addMarker(2, 3, '#94a3b8', 'Tidal Volume', 'Normal volume of air\ndisplaced between normal\ninhalation and exhalation.');
            addMarker(5, 5.5, '#7c3aed', 'Inspiratory Capacity', 'Maximum volume of air that\ncan be inhaled after a\nnormal tidal expiration.');
            addMarker(8, 2, '#3b82f6', 'FRC Baseline', 'Functional Residual Capacity.\nVolume remaining in lungs\nafter normal expiration.');
        } else if (type === 'respiratory_flow_volume') {
            x.domain([0, 7]); y.domain([-8, 12]);
            xLabel = "Volume (L)"; yLabel = "Flow (L/s)";
            xUnit = " L"; yUnit = " L/s";
            // Normal loop approximation
            activeData = [
                {x: 6, y: 0}, // TLC
                {x: 5.5, y: 10}, // PEFR
                {x: 4.5, y: 6},
                {x: 3.5, y: 4},
                {x: 2.5, y: 2.5},
                {x: 1.5, y: 1}, // RV
                {x: 2.5, y: -3}, // Inspiratory phase
                {x: 4, y: -4},
                {x: 5.5, y: -3},
                {x: 6, y: 0}
            ];
            const line = d3.line().x((d: any) => x(d.x)).y((d: any) => y(d.y)).curve(d3.curveCatmullRomClosed.alpha(0.5));
            svg.append('path').datum(activeData).attr('fill', 'url(#resp-gradient-fid)').attr('stroke', '#06b6d4').attr('stroke-width', 5).attr('d', line);
            
            const defs = svg.append('defs');
            const gradient = defs.append('linearGradient').attr('id', 'resp-gradient-fid').attr('x1', '0%').attr('y1', '0%').attr('x2', '0%').attr('y2', '100%');
            gradient.append('stop').attr('offset', '0%').attr('stop-color', '#06b6d4').attr('stop-opacity', 0.2);
            gradient.append('stop').attr('offset', '100%').attr('stop-color', '#06b6d4').attr('stop-opacity', 0.05);

            addMarker(5.5, 10, '#ec4899', 'PEFR', 'Peak Expiratory Flow Rate.\nA sensitive indicator of\nlarge airway patency.');
            addMarker(6, 0, '#94a3b8', 'TLC', 'Total Lung Capacity.\nThe point of maximum\ninspiration.');
            addMarker(1.5, 0, '#94a3b8', 'RV', 'Residual Volume.\nVolume remaining after\nmaximal exhalation.');
        }

        // --- AXES & GRID ---
        svg.append('g').attr('class', 'grid').attr('transform', `translate(0,${height})`).call(d3.axisBottom(x).ticks(isMobile ? 5 : 8).tickSize(-height).tickFormat('')).attr('stroke', gridColor).attr('stroke-opacity', 0.1);
        svg.append('g').attr('class', 'grid').call(d3.axisLeft(y).ticks(isMobile ? 5 : 8).tickSize(-width).tickFormat('')).attr('stroke', gridColor).attr('stroke-opacity', 0.1);
        
        const xAxis = svg.append('g').attr('transform', `translate(0,${height})`).call(d3.axisBottom(x).ticks(isMobile ? 5 : 8));
        xAxis.selectAll('text').attr('fill', textColor).attr('font-size', axisFontSize).attr('font-weight', '600');
        
        const yAxis = svg.append('g').call(d3.axisLeft(y).ticks(isMobile ? 5 : 8));
        yAxis.selectAll('text').attr('fill', textColor).attr('font-size', axisFontSize).attr('font-weight', '600');

        svg.append('text').attr('x', width/2).attr('y', height + (isMobile ? 35 : 45)).attr('text-anchor', 'middle').attr('fill', textColor).attr('font-weight', '900').attr('font-size', labelFontSize).attr('text-transform', 'uppercase').attr('letter-spacing', '0.08em').text(xLabel);
        svg.append('text').attr('transform', 'rotate(-90)').attr('y', isMobile ? -35 : -60).attr('x', -height/2).attr('text-anchor', 'middle').attr('fill', textColor).attr('font-weight', '900').attr('font-size', labelFontSize).attr('text-transform', 'uppercase').attr('letter-spacing', '0.08em').text(yLabel);
        svg.append('text').attr('x', width / 2).attr('y', -30).attr('text-anchor', 'middle').attr('font-weight', '900').attr('fill', textColor).attr('font-size', titleFontSize).attr('letter-spacing', '-0.03em').text(title);

        // --- INTERACTIVE CROSSHAIR ---
        const focus = svg.append('g').style('display', 'none');
        focus.append('line').attr('class', 'x-hover-line').attr('y1', 0).attr('y2', height).attr('stroke', textColor).attr('stroke-width', 1.5).attr('stroke-dasharray', '5,5');
        focus.append('line').attr('class', 'y-hover-line').attr('x1', 0).attr('x2', width).attr('stroke', textColor).attr('stroke-width', 1.5).attr('stroke-dasharray', '5,5');
        focus.append('circle').attr('r', 8).attr('fill', '#1e3a8a').attr('stroke', '#fff').attr('stroke-width', 2.5).style('filter', 'drop-shadow(0 0 8px rgba(30,58,138,0.5))');
        
        const tooltipGroup = focus.append('g').attr('class', 'value-tooltip');
        tooltipGroup.append('rect').attr('width', 130).attr('height', 60).attr('rx', 10).attr('fill', isDark ? '#0f172a' : '#ffffff').attr('stroke', '#3b82f6').attr('stroke-width', 2).style('filter', 'drop-shadow(0 4px 10px rgba(0,0,0,0.2))');
        const tooltipText = tooltipGroup.append('text').attr('x', 15).attr('y', 24).attr('font-size', '12px').attr('font-weight', 'bold').attr('fill', textColor);
        const tSpanX = tooltipText.append('tspan').attr('x', 15).attr('dy', '0em');
        const tSpanY = tooltipText.append('tspan').attr('x', 15).attr('dy', '1.6em');

        svg.append('rect')
            .attr('width', width)
            .attr('height', height)
            .attr('fill', 'none')
            .attr('pointer-events', 'all')
            .on('mouseover', () => focus.style('display', null))
            .on('mouseout', () => focus.style('display', 'none'))
            .on('mousemove', function(event: any) {
                const mouseX = d3.pointer(event)[0];
                const x0 = x.invert(mouseX);
                const i = bisect(activeData, x0, 1);
                if (!activeData[i] || !activeData[i-1]) return;
                const d0 = activeData[i - 1];
                const d1 = activeData[i];
                const d = x0 - d0.x > d1.x - x0 ? d1 : d0;

                const posX = x(d.x);
                const posY = y(d.y);

                focus.select('circle').attr('transform', `translate(${posX},${posY})`);
                focus.select('.x-hover-line').attr('transform', `translate(${posX},0)`);
                focus.select('.y-hover-line').attr('transform', `translate(0,${posY})`);
                
                tSpanX.text(`${xLabel.split('(')[0].trim()}: ${d.x.toFixed(1)}${xUnit}`);
                tSpanY.text(`${yLabel.split('(')[0].trim()}: ${d.y.toFixed(1)}${yUnit}`);

                let tx = posX + 18;
                let ty = posY - 70;
                if (tx + 130 > width) tx = posX - 148;
                if (ty < -40) ty = posY + 20;
                tooltipGroup.attr('transform', `translate(${tx}, ${ty})`);
            });

    }, [type, title, isSupportedType]);

    useEffect(() => {
        if (!containerRef.current || !isSupportedType) return;
        const observer = new ResizeObserver(() => {
            window.requestAnimationFrame(() => renderGraph());
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [renderGraph, isSupportedType]);

    if (!isSupportedType) return null;

    return (
        <div className={`bg-white dark:bg-slate-900 p-6 sm:p-8 border-2 border-gray-100 dark:border-dark-border rounded-3xl shadow-xl overflow-hidden transition-all group ${className || ''}`}>
            <div ref={containerRef} className="w-full min-h-[300px] sm:min-h-[400px] select-none"></div>
            <div className="flex flex-col items-center mt-6 pt-6 border-t border-gray-50 dark:border-dark-border">
                <div className="flex items-center gap-3 text-[12px] text-gray-700 dark:text-slate-300 font-black uppercase tracking-widest text-center">
                    <svg className="w-5 h-5 animate-pulse flex-shrink-0 text-brand-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"></path></svg>
                    <span>High-Fidelity Model: Hover for Real-Time Physiological Values</span>
                </div>
            </div>
        </div>
    );
};
