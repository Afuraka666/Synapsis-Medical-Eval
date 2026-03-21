
import React, { useEffect, useRef, useCallback, useState, useMemo, forwardRef, useImperativeHandle } from 'react';
import { 
    ZoomIn, 
    ZoomOut, 
    Maximize, 
    Minimize, 
    RotateCcw, 
    Save, 
    Activity,
    Brain,
    Stethoscope,
    FlaskConical,
    Network,
    Info
} from 'lucide-react';
import { Discipline } from '../types';
import type { KnowledgeMapData, KnowledgeNode, KnowledgeLink } from '../types';
import { ConceptCard } from './ConceptCard';
import { useAnalytics } from '../contexts/analytics';
import { useCollaboration } from '../contexts/CollaborationContext';

declare const d3: any;

export const DisciplineColors: Record<string, string> = {
    [Discipline.BIOCHEMISTRY]: '#2563EB',
    [Discipline.PHARMACOLOGY]: '#059669',
    [Discipline.PHYSIOLOGY]: '#7C3AED',
    [Discipline.PSYCHOLOGY]: '#D97706',
    [Discipline.SOCIOLOGY]: '#DB2777',
    [Discipline.PATHOLOGY]: '#DC2626',
    [Discipline.IMMUNOLOGY]: '#0891B2',
    [Discipline.GENETICS]: '#EA580C',
    [Discipline.DIAGNOSTICS]: '#475569',
    [Discipline.TREATMENT]: '#16A34A',
    [Discipline.PHYSIOTHERAPY]: '#06B6D4',
    [Discipline.OCCUPATIONAL_THERAPY]: '#9333EA',
    [Discipline.ANAESTHESIA]: '#334155',
    [Discipline.PAIN_MANAGEMENT]: '#9A3412',
    [Discipline.NURSING]: '#BE185D',
    [Discipline.NUTRITION]: '#B45309',
    [Discipline.SOCIAL_WORK]: '#374151',
    [Discipline.SPEECH_LANGUAGE_THERAPY]: '#4338CA',
};

// Use DisciplineColors if available, otherwise fallback to randomized color
const getNodeColor = (discipline: string, id: string, index: number) => {
    if (discipline && DisciplineColors[discipline]) {
        return DisciplineColors[discipline];
    }
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = (Math.abs(hash) + (index * 137)) % 360; 
    return `hsl(${hue}, 65%, 45%)`;
};

const svgToDataURL = async (svgEl: SVGSVGElement): Promise<string> => {
    const g = svgEl.querySelector('g');
    if (!g) return '';
    const bbox = g.getBBox();
    if (bbox.width === 0 || bbox.height === 0) return '';
    const padding = 40;
    const width = bbox.width + padding * 2;
    const height = bbox.height + padding * 2;
    const svgClone = svgEl.cloneNode(true) as SVGSVGElement;
    svgClone.setAttribute('width', width.toString());
    svgClone.setAttribute('height', height.toString());
    svgClone.setAttribute('viewBox', `${bbox.x - padding} ${bbox.y - padding} ${width} ${height}`);
    const gClone = svgClone.querySelector('g');
    if (gClone) gClone.removeAttribute('transform');
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('width', width.toString());
    bgRect.setAttribute('height', height.toString());
    bgRect.setAttribute('fill', 'white');
    bgRect.setAttribute('x', `${bbox.x - padding}`);
    bgRect.setAttribute('y', `${bbox.y - padding}`);
    svgClone.prepend(bgRect);
    const xml = new XMLSerializer().serializeToString(svgClone);
    const svg64 = btoa(unescape(encodeURIComponent(xml)));
    const image64 = `data:image/svg+xml;base64,${svg64}`;
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const scale = 2;
            canvas.width = width * scale;
            canvas.height = height * scale;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.scale(scale, scale);
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/png', 1.0));
            } else resolve('');
        };
        img.onerror = () => resolve('');
        img.src = image64;
    });
};

const LoadingSpinner: React.FC<{ T: Record<string, any> }> = ({ T }) => (
    <div className="flex flex-col items-center justify-center h-full p-4 text-brand-blue dark:text-brand-blue-light">
        <div className="relative">
            <span title={T.iconLabelActivity}>
                <Activity className="h-12 w-12 animate-pulse" />
            </span>
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-4 w-4 bg-brand-blue rounded-full animate-ping"></div>
            </div>
        </div>
        <p className="mt-4 text-xs font-black uppercase tracking-widest animate-pulse">{T.mappingConnections}</p>
    </div>
);

function intersectRect(rect: any, point: any) {
    const cx = rect.x || 0;
    const cy = rect.y || 0;
    const dx = (point.x || 0) - cx;
    const dy = (point.y || 0) - cy;
    const w = (rect.pillWidth || 120) / 2;
    const h = (rect.pillHeight || 46) / 2;
    
    if (dx === 0 && dy === 0) return { x: cx, y: cy };
    
    if (Math.abs(dy * w) < Math.abs(dx * h)) {
        if (dx > 0) return { x: cx + w, y: cy + dy * w / dx };
        else return { x: cx - w, y: cy - dy * w / dx };
    } else {
        if (dy > 0) return { x: cx + dx * h / dy, y: cy + h };
        else return { x: cx - dx * h / dy, y: cy - h };
    }
}

interface MapControlsProps {
    onZoomIn: () => void;
    onZoomOut: () => void;
    onReset: () => void;
    onToggleFullscreen: () => void;
    onSaveMap?: () => void;
    onDownloadMap?: () => void;
    onAddNode?: () => void;
    onAddLink?: () => void;
    isFullscreen: boolean;
    T: Record<string, any>;
}

const MapControls: React.FC<MapControlsProps & { onToggleLegend: () => void; showLegend: boolean }> = ({ onZoomIn, onZoomOut, onReset, onToggleFullscreen, onSaveMap, onDownloadMap, onAddNode, onAddLink, onToggleLegend, showLegend, isFullscreen, T }) => {
    const buttonClasses = "bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 rounded-xl w-10 h-10 flex items-center justify-center transition-all hover:scale-105 active:scale-95 border border-gray-200 dark:border-slate-700 shadow-sm";
    return (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-row gap-2 z-10 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md p-2 rounded-2xl shadow-2xl border border-gray-200/50 dark:border-slate-700/50">
            <button onClick={onZoomIn} title={T.zoomInButton} className={buttonClasses}>
                 <span title={T.zoomInButton}>
                    <ZoomIn className="h-5 w-5" />
                 </span>
            </button>
            <button onClick={onZoomOut} title={T.zoomOutButton} className={buttonClasses}>
                <span title={T.zoomOutButton}>
                    <ZoomOut className="h-5 w-5" />
                </span>
            </button>
            <div className="w-px h-6 bg-gray-200 dark:bg-slate-700 self-center mx-1"></div>
            <button onClick={onReset} title={T.resetViewButton} className={buttonClasses}>
                 <span title={T.resetViewButton}>
                    <RotateCcw className="h-5 w-5" />
                 </span>
            </button>
             <button onClick={onToggleFullscreen} title={isFullscreen ? T.exitFullscreenButton : T.enterFullscreenButton} className={buttonClasses}>
                {isFullscreen ? (
                    <span title={T.exitFullscreenButton}>
                        <Minimize className="h-5 w-5" />
                    </span>
                ) : (
                    <span title={T.enterFullscreenButton}>
                        <Maximize className="h-5 w-5" />
                    </span>
                )}
            </button>
            <div className="w-px h-6 bg-gray-200 dark:bg-slate-700 self-center mx-1"></div>
            <button onClick={onToggleLegend} title={T.toggleLegend} className={`${buttonClasses} ${showLegend ? 'bg-brand-blue/10 dark:bg-brand-blue-light/10 text-brand-blue dark:text-brand-blue-light border-brand-blue/30' : ''}`}>
                <span title={T.toggleLegend}>
                    <Network className="h-5 w-5" />
                </span>
            </button>
            {(onAddNode || onAddLink) && (
                <>
                    <div className="w-px h-6 bg-gray-200 dark:bg-slate-700 self-center mx-1"></div>
                    {onAddNode && (
                        <button onClick={onAddNode} title={T.addNodeButton} className={buttonClasses}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                        </button>
                    )}
                    {onAddLink && (
                        <button onClick={onAddLink} title={T.addLinkButton} className={buttonClasses}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                        </button>
                    )}
                </>
            )}
            {(onSaveMap || onDownloadMap) && (
                <>
                    <div className="w-px h-6 bg-gray-200 dark:bg-slate-700 self-center mx-1"></div>
                    {onSaveMap && (
                        <button onClick={onSaveMap} title={T.saveMapToCollection} className={`${buttonClasses} text-brand-blue dark:text-brand-blue-light`}>
                            <span title={T.saveMapButton}>
                                <Save className="h-5 w-5" />
                            </span>
                        </button>
                    )}
                    {onDownloadMap && (
                        <button onClick={onDownloadMap} title={T.downloadMapAsImage} className={`${buttonClasses} text-brand-blue dark:text-brand-blue-light`}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-download"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                        </button>
                    )}
                </>
            )}
        </div>
    );
};

const NodeTooltip: React.FC<{ node: KnowledgeNode | null; position: { x: number; y: number } | null; T: Record<string, any> }> = ({ node, position, T }) => {
    if (!node || !position) return null;
    return (
        <div 
            className="fixed z-[100] bg-white/95 dark:bg-slate-800/95 backdrop-blur-md border border-brand-blue/20 dark:border-brand-blue-light/10 p-4 rounded-2xl shadow-2xl pointer-events-none max-w-[280px] animate-fade-in"
            style={{ top: position.y + 20, left: position.x + 20 }}
        >
            <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-brand-blue dark:text-brand-blue-light bg-brand-blue/5 dark:bg-brand-blue-light/5 px-2 py-0.5 rounded-full">{node.discipline}</span>
                <span title={T.iconLabelInformation}>
                    <Info className="w-3 h-3 text-gray-500 dark:text-slate-400" />
                </span>
            </div>
            <h4 className="font-black text-sm text-gray-900 dark:text-white mb-2 tracking-tight">{node.label}</h4>
            <div className="h-px w-full bg-gray-100 dark:bg-slate-700 mb-2"></div>
            <p className="text-xs text-gray-700 dark:text-slate-300 leading-relaxed italic line-clamp-4">{node.summary}</p>
        </div>
    );
};

interface KnowledgeMapProps {
    data: KnowledgeMapData;
    onNodeClick: (node: KnowledgeNode) => void;
    selectedNodeInfo: { node: KnowledgeNode; abstract: string; loading: boolean } | null;
    onClearSelection: () => void;
    isMapFullscreen: boolean;
    setIsMapFullscreen: (isFullscreen: boolean) => void;
    caseTitle: string;
    language: string;
    theme: 'light' | 'dark';
    T: Record<string, any>;
    onDiscussNode: (nodeInfo: { node: KnowledgeNode; abstract: string; loading: boolean }) => void;
    onSaveMap?: () => void;
    onDownloadMap?: () => void;
    onAddNode?: (node: KnowledgeNode) => void;
    onAddLink?: (link: KnowledgeLink) => void;
}

export const KnowledgeMap = forwardRef<any, KnowledgeMapProps>(({ data, onNodeClick, selectedNodeInfo, onClearSelection, isMapFullscreen, setIsMapFullscreen, caseTitle, language, theme, T, onDiscussNode, onSaveMap, onDownloadMap, onAddNode, onAddLink }, ref) => {
    const { logEvent } = useAnalytics();
    const { updateCursor, remoteCursors } = useCollaboration();
    const svgRef = useRef<SVGSVGElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const simulationRef = useRef<any>(null);
    const zoomRef = useRef<any>(null);
    const gRef = useRef<any>(null);
    const [hoveredNode, setHoveredNode] = useState<{ node: KnowledgeNode; position: { x: number; y: number } } | null>(null);
    const [hoveredLink, setHoveredLink] = useState<KnowledgeLink | null>(null);
    const [showLegend, setShowLegend] = useState(false);
    
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    
    const nodes = useMemo(() => (data?.nodes || []).map(n => ({ ...n })), [data?.nodes]);
    const links = useMemo(() => (data?.links || []).map(l => ({ ...l })), [data?.links]);

    useImperativeHandle(ref, () => ({ async captureAsImage() { if (svgRef.current) return await svgToDataURL(svgRef.current); return ''; } }));
    
    const resetZoom = useCallback(() => {
        if (!svgRef.current || !gRef.current || !containerRef.current || !zoomRef.current || typeof d3 === 'undefined') return;
        
        const svg = d3.select(svgRef.current);
        const g = gRef.current;
        const bounds = g.node().getBBox();
        const { width, height } = containerRef.current.getBoundingClientRect();
        
        // Use container dimensions directly, fallback to window
        const effectiveWidth = width || window.innerWidth;
        const effectiveHeight = height || window.innerHeight;
        
        if (effectiveWidth === 0 || effectiveHeight === 0) return;
        
        if (bounds.width === 0 || bounds.height === 0) {
            const transform = d3.zoomIdentity.translate(effectiveWidth / 2, effectiveHeight / 2).scale(1);
            svg.transition().duration(750).call(zoomRef.current.transform, transform);
            return;
        }

        const scale = Math.min(1.2, 0.85 / Math.max(bounds.width / effectiveWidth, bounds.height / effectiveHeight));
        if (isNaN(scale) || !isFinite(scale)) return;
        
        const transform = d3.zoomIdentity
            .translate(effectiveWidth / 2 - scale * (bounds.x + bounds.width / 2), effectiveHeight / 2 - scale * (bounds.y + bounds.height / 2))
            .scale(scale);
            
        svg.transition().duration(750).call(zoomRef.current.transform, transform);
    }, []); // Removed dimensions dependency to stabilize

    useEffect(() => {
        // Safety timeout to ensure loading state is cleared even if D3 simulation hangs or fails to fire events
        const timeout = setTimeout(() => {
            if (isLoading) {
                console.warn('KnowledgeMap loading timeout reached, forcing display.');
                setIsLoading(false);
                // Try a final reset zoom if we have data
                if (nodes.length > 0) {
                    resetZoom();
                }
            }
        }, 3500);
        return () => clearTimeout(timeout);
    }, [isLoading, nodes.length, resetZoom]);

    useEffect(() => {
        if (!containerRef.current || typeof d3 === 'undefined') return;
        
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0) {
                    // Only update if dimensions actually changed to avoid unnecessary re-renders
                    setDimensions(prev => {
                        if (Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1) return prev;
                        return { width, height };
                    });
                    
                    window.requestAnimationFrame(() => {
                        if (simulationRef.current) {
                            simulationRef.current.force('center', d3.forceCenter(width / 2, height / 2));
                            simulationRef.current.alpha(0.3).restart();
                        }
                        
                        setIsLoading(false);
                        resetZoom();
                    });
                }
            }
        });
        
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [resetZoom]); // resetZoom is now stable

    useEffect(() => {
        if (!svgRef.current || !containerRef.current || typeof d3 === 'undefined') return;
        
        if (!nodes || nodes.length === 0) {
            console.warn('No nodes provided to KnowledgeMap.');
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();
        
        // Add defs for patterns and markers
        const defs = svg.append('defs');
        
        // Add grid pattern
        const pattern = defs.append('pattern')
            .attr('id', 'grid')
            .attr('width', 40)
            .attr('height', 40)
            .attr('patternUnits', 'userSpaceOnUse');
        
        pattern.append('path')
            .attr('d', 'M 40 0 L 0 0 0 40')
            .attr('fill', 'none')
            .attr('stroke', 'currentColor')
            .attr('stroke-opacity', 0.05)
            .attr('stroke-width', 0.5);

        // Background grid rect
        svg.append('rect')
            .attr('width', '100%')
            .attr('height', '100%')
            .attr('fill', 'url(#grid)')
            .attr('pointer-events', 'none');

        defs.append('marker')
            .attr('id', 'map-arrowhead')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 8)
            .attr('refY', 0)
            .attr('markerWidth', 7) // Slightly larger
            .attr('markerHeight', 7) // Slightly larger
            .attr('orient', 'auto')
            .append('path')
            .attr('d', 'M0,-5L10,0L0,5')
            .attr('fill', '#94a3b8');

        const { width: initialWidth, height: initialHeight } = containerRef.current.getBoundingClientRect();
        const width = initialWidth || dimensions.width || window.innerWidth; 
        const height = initialHeight || dimensions.height || window.innerHeight; 
        
        if (initialWidth > 0 && initialHeight > 0) {
            setDimensions({ width: initialWidth, height: initialHeight });
        }

        console.log(`KnowledgeMap initializing with size: ${width}x${height} (initial: ${initialWidth}x${initialHeight})`);
        const isMobile = width < 640;
        
        const g = svg.append('g'); gRef.current = g;
        const zoom = d3.zoom().scaleExtent([0.1, 4]).on('zoom', (event: any) => g.attr('transform', event.transform));
        zoomRef.current = zoom; svg.call(zoom);
        
        const linkDistance = isMobile ? 140 : 240;
        const chargeStrength = isMobile ? -1500 : -3000;
        const collideRadius = isMobile ? 90 : 130;

        // Clustering force: pull nodes of same discipline together
        const clusterForce = (alpha: number) => {
            const centers: Record<string, { x: number; y: number }> = {};
            const disciplineCounts: Record<string, number> = {};
            
            nodes.forEach((n: any) => {
                if (!centers[n.discipline]) {
                    centers[n.discipline] = { x: 0, y: 0 };
                    disciplineCounts[n.discipline] = 0;
                }
                centers[n.discipline].x += n.x;
                centers[n.discipline].y += n.y;
                disciplineCounts[n.discipline]++;
            });
            
            Object.keys(centers).forEach(d => {
                centers[d].x /= disciplineCounts[d];
                centers[d].y /= disciplineCounts[d];
            });
            
            nodes.forEach((n: any) => {
                const center = centers[n.discipline];
                if (center) {
                    n.vx += (center.x - n.x) * alpha * 0.1;
                    n.vy += (center.y - n.y) * alpha * 0.1;
                }
            });
        };

        simulationRef.current = d3.forceSimulation(nodes)
            .force('link', d3.forceLink(links).id((d: any) => d.id).distance(linkDistance).strength(0.8))
            .force('charge', d3.forceManyBody().strength(chargeStrength))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('x', d3.forceX(width / 2).strength(0.12))
            .force('y', d3.forceY(height / 2).strength(0.12))
            .force('collide', d3.forceCollide().radius(collideRadius).iterations(4))
            .force('cluster', clusterForce)
            .velocityDecay(0.4) // Smoother movement
            .on('tick.loading', () => {
                setIsLoading(false);
                resetZoom();
                simulationRef.current.on('tick.loading', null);
            })
            .on('end', () => { resetZoom(); });

        const linkPaths = g.append("g").selectAll("path").data(links).join("path")
            .attr("fill", "none")
            .attr("stroke", theme === 'dark' ? '#475569' : '#cbd5e1')
            .attr("stroke-opacity", 0.4)
            .attr("stroke-width", 2.5)
            .attr("marker-end", "url(#map-arrowhead)")
            .attr("class", "link-path transition-all duration-300 cursor-help")
            .on('mouseenter', (event: any, d: any) => {
                d3.select(event.currentTarget).attr("stroke", "#3b82f6").attr("stroke-opacity", 0.8).attr("stroke-width", 3.5);
                setHoveredLink(d);
            })
            .on('mouseleave', (event: any) => {
                d3.select(event.currentTarget).attr("stroke", theme === 'dark' ? '#475569' : '#cbd5e1').attr("stroke-opacity", 0.4).attr("stroke-width", 2.5);
                setHoveredLink(null);
            });

        const node = g.append('g').selectAll('g').data(nodes).join('g').attr('class', 'node-group cursor-pointer')
            .call(d3.drag().on('start', (event: any, d: any) => { if (!event.active) simulationRef.current.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; }).on('drag', (event: any, d: any) => { d.fx = event.x; d.fy = event.y; }).on('end', (event: any, d: any) => { if (!event.active) simulationRef.current.alphaTarget(0); d.fx = null; d.fy = null; }))
            .on('click', (event: MouseEvent, d: any) => { event.stopPropagation(); onNodeClick(d); })
            .on('mouseenter', (event: MouseEvent, d: any) => {
                setHoveredNode({ node: d, position: { x: event.clientX, y: event.clientY } });
                const group = d3.select(event.currentTarget as any);
                group.select('rect').transition().duration(200).attr('stroke-width', 4).attr('stroke', '#3b82f6').attr('transform', 'scale(1.05)');
                group.selectAll('text').transition().duration(200).attr('transform', 'scale(1.05)');
            })
            .on('mousemove', (event: MouseEvent) => {
                setHoveredNode(prev => prev ? { ...prev, position: { x: event.clientX, y: event.clientY } } : null);
            })
            .on('mouseleave', (event: MouseEvent) => {
                setHoveredNode(null);
                const group = d3.select(event.currentTarget as any);
                group.select('rect').transition().duration(200).attr('stroke-width', 2.5).attr('stroke', '#ffffff').attr('transform', 'scale(1)');
                group.selectAll('text').transition().duration(200).attr('transform', 'scale(1)');
            });

        node.append('rect')
            .attr('rx', 14).attr('ry', 14)
            .attr('fill', (d: any, i: number) => getNodeColor(d.discipline, d.id, i))
            .attr('stroke', theme === 'dark' ? '#1e293b' : '#ffffff')
            .attr('stroke-width', 2.5)
            .attr('filter', 'drop-shadow(0px 8px 24px rgba(0,0,0,0.2))')
            .attr('class', 'node-rect transition-all duration-300');
            
        // Add a subtle glow for important nodes
        node.filter((d: any) => (d.importance || 0) > 1.5)
            .append('rect')
            .attr('rx', 16).attr('ry', 16)
            .attr('fill', (d: any, i: number) => getNodeColor(d.discipline, d.id, i))
            .attr('fill-opacity', 0.1)
            .attr('stroke', (d: any, i: number) => getNodeColor(d.discipline, d.id, i))
            .attr('stroke-opacity', 0.2)
            .attr('stroke-width', 4)
            .attr('class', 'animate-pulse pointer-events-none')
            .each(function(d: any) {
                d3.select(this)
                    .attr('width', d.pillWidth + 8)
                    .attr('height', d.pillHeight + 8)
                    .attr('x', - (d.pillWidth + 8) / 2)
                    .attr('y', - (d.pillHeight + 8) / 2);
            });

        node.append('text')
            .text((d: any) => d.label)
            .attr("font-family", "Inter, sans-serif")
            .attr('font-size', isMobile ? '11px' : '13px')
            .attr('font-weight', '800')
            .attr('fill', '#ffffff')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.15em')
            .each(function(d: any) { 
                const bbox = (this as any).getBBox(); 
                d.pillWidth = Math.max(isMobile ? 90 : 120, bbox.width + (isMobile ? 24 : 40)); 
                d.pillHeight = isMobile ? 36 : 46; 
            });

        node.select('rect')
            .attr('width', (d: any) => d.pillWidth)
            .attr('height', (d: any) => d.pillHeight)
            .attr('x', (d: any) => -d.pillWidth / 2)
            .attr('y', (d: any) => -d.pillHeight / 2);

        node.append('text')
            .text((d: any) => (d.discipline || '').toUpperCase())
            .attr("font-family", "'JetBrains Mono', monospace") // Monospace for discipline
            .attr('font-size', isMobile ? '7px' : '8px')
            .attr('font-weight', '900')
            .attr('fill', '#ffffff')
            .attr('opacity', 0.9)
            .attr('letter-spacing', '0.12em')
            .attr('text-anchor', 'middle')
            .attr('dy', isMobile ? '1.8em' : '1.6em');

        simulationRef.current.on('tick', () => { 
            linkPaths.attr('d', (d: any) => {
                if (d.source.x === undefined || d.target.x === undefined) return null;
                const s = intersectRect(d.source, d.target);
                const t = intersectRect(d.target, d.source);
                const dx = t.x - s.x;
                const dy = t.y - s.y;
                const dr = Math.sqrt(dx * dx + dy * dy) * 1.5; 
                if (dr === 0) return null;
                return `M${s.x},${s.y}A${dr},${dr} 0 0,1 ${t.x},${t.y}`;
            }); 
            node.attr('transform', (d: any) => `translate(${d.x || 0}, ${d.y || 0})`); 
        });

        return () => {
            if (simulationRef.current) simulationRef.current.stop();
        };
    }, [nodes, links, onNodeClick, resetZoom, theme]);

    if (typeof d3 === 'undefined') {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 p-8 text-center">
                <span title={T.networkErrorLabel}>
                    <Network className="h-12 w-12 text-red-400 mb-4" />
                </span>
                <h3 className="font-black text-gray-900 dark:text-white mb-2">{T.visualizationError}</h3>
                <p className="text-sm text-gray-500 dark:text-slate-400 max-w-xs">
                    {T.visualizationErrorDetail}
                </p>
                <button 
                    onClick={() => window.location.reload()}
                    className="mt-6 px-6 py-2 bg-brand-blue text-white rounded-xl font-bold text-sm hover:bg-blue-800 transition-all"
                >
                    {T.refreshPage}
                </button>
            </div>
        );
    }

    return (
        <div ref={containerRef} className={`w-full h-full min-h-[400px] bg-slate-50 dark:bg-slate-900 shadow-inner border border-gray-200 dark:border-dark-border overflow-hidden transition-colors duration-300 ${isMapFullscreen ? 'fixed inset-0 z-40' : 'relative rounded-xl'}`}>
            <div className="absolute inset-0 pointer-events-none opacity-50 dark:opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #94a3b8 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
            {isLoading && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-50/80 dark:bg-dark-bg/80 backdrop-blur-sm">
                    <LoadingSpinner T={T} />
                </div>
            )}
            <svg 
                ref={svgRef} 
                className="w-full h-full touch-none relative z-0 block" 
                style={{ minHeight: '400px' }}
                onClick={onClearSelection}
                onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    updateCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                }}
            ></svg>
            
            {/* Remote Cursors */}
            {Object.entries(remoteCursors).map(([id, pos]) => (
                <div 
                    key={id} 
                    className="absolute pointer-events-none transition-all duration-75 z-50"
                    style={{ left: pos.x, top: pos.y }}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M5.65376 12.3773L15.2451 12.9087L11.5312 16.6226L11.5312 21.0835L5.65376 12.3773Z" fill="#3b82f6" stroke="white" strokeWidth="2"/>
                    </svg>
                    <div className="bg-blue-500 text-white text-[8px] px-1 py-0.5 rounded-sm whitespace-nowrap -mt-1 ml-4 shadow-sm">
                        User {id.slice(0, 4)}
                    </div>
                </div>
            ))}
            <MapControls 
                onZoomIn={() => {
                    logEvent('map_zoom_in');
                    if (typeof d3 !== 'undefined' && zoomRef.current && svgRef.current) {
                        d3.select(svgRef.current).transition().call(zoomRef.current.scaleBy, 1.3);
                    }
                }} 
                onZoomOut={() => {
                    logEvent('map_zoom_out');
                    if (typeof d3 !== 'undefined' && zoomRef.current && svgRef.current) {
                        d3.select(svgRef.current).transition().call(zoomRef.current.scaleBy, 0.7);
                    }
                }} 
                onReset={() => {
                    logEvent('map_reset_zoom');
                    resetZoom();
                }} 
                onToggleFullscreen={() => {
                    logEvent('map_toggle_fullscreen', { is_fullscreen: !isMapFullscreen });
                    setIsMapFullscreen(!isMapFullscreen);
                }} 
                onToggleLegend={() => setShowLegend(!showLegend)}
                showLegend={showLegend}
                onSaveMap={onSaveMap} 
                onDownloadMap={onDownloadMap}
                onAddNode={onAddNode ? () => {
                    const label = prompt(T.nodeLabelPrompt);
                    if (label) {
                        onAddNode({
                            id: Math.random().toString(36).substring(7),
                            label,
                            discipline: Discipline.PHYSIOLOGY, // Default
                            summary: T.manuallyAddedConcept
                        });
                    }
                } : undefined}
                onAddLink={onAddLink ? () => {
                    const source = prompt(T.sourceNodeIdPrompt);
                    const target = prompt(T.targetNodeIdPrompt);
                    if (source && target) {
                        onAddLink({
                            source,
                            target,
                            description: T.manuallyAddedConnection
                        });
                    }
                } : undefined}
                isFullscreen={isMapFullscreen} 
                T={T}
            />
            <NodeTooltip node={hoveredNode?.node || null} position={hoveredNode?.position || null} T={T} />
            
            {showLegend && (
                <div className="absolute top-6 right-6 z-10 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md p-4 rounded-2xl shadow-2xl border border-gray-200/50 dark:border-slate-700/50 max-h-[70%] overflow-y-auto animate-fade-in w-64">
                    <div className="flex items-center gap-2 mb-4">
                        <span title={T.legendTitle}>
                            <Network className="w-4 h-4 text-brand-blue dark:text-brand-blue-light" />
                        </span>
                        <h4 className="font-black text-xs uppercase tracking-widest text-gray-900 dark:text-white">{T.legendTitle || 'Knowledge Legend'}</h4>
                    </div>
                    <div className="space-y-3">
                        {Array.from(new Set(nodes.map(n => n.discipline))).filter(Boolean).map(discipline => (
                            <div key={discipline} className="flex items-center gap-3">
                                <div 
                                    className="w-3 h-3 rounded-full flex-shrink-0" 
                                    style={{ backgroundColor: DisciplineColors[discipline] || '#94a3b8' }}
                                ></div>
                                <span className="text-[10px] font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider truncate">{discipline}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {hoveredLink && (
                <div className="absolute bottom-4 right-4 bg-white/90 dark:bg-slate-800/90 p-2 px-3 rounded-lg shadow-lg border border-brand-blue/20 text-[10px] max-w-[200px] animate-fade-in pointer-events-none">
                    <p className="font-black uppercase text-gray-600 dark:text-slate-400 mb-1">{T.relationshipLabel}</p>
                    <p className="text-gray-900 dark:text-slate-100 leading-tight italic font-medium">{hoveredLink.description}</p>
                </div>
            )}

            {selectedNodeInfo && <ConceptCard nodeInfo={selectedNodeInfo} onClose={onClearSelection} onDiscuss={onDiscussNode} T={T} />}
        </div>
    );
});
