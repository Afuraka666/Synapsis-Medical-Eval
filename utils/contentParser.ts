
export interface TableData {
    header: string[];
    data: string[][];
}

export interface ContentBlock {
    type: 'text' | 'table' | 'illustration' | 'diagram' | 'graph';
    content: string;
    tableData?: TableData;
    tag?: string;
}

export function parseMarkdownTable(text: string): TableData | null {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return null;
    
    // Improved parsing to handle empty cells and varying pipe configurations
    const rows = lines
        .filter(line => line.trim().includes('|'))
        .map(line => {
            let trimmed = line.trim();
            // Remove leading and trailing pipes if they exist
            if (trimmed.startsWith('|')) {
                trimmed = trimmed.substring(1);
            }
            if (trimmed.endsWith('|')) {
                trimmed = trimmed.substring(0, trimmed.length - 1);
            }
            
            const parts = trimmed.split('|');
            return parts.map(cell => cell.trim());
        });
        
    if (rows.length < 2) return null;
    
    const header = rows[0];
    // rows[1] is the separator row
    const data = rows.slice(2);
    
    if (header.length === 0) return null;
    return { header, data };
}

export function splitMessageContent(text: string): ContentBlock[] {
    const blocks: ContentBlock[] = [];
    
    // First, split by visual tags
    const parts = text.split(/(\[\s*(?:GRAPH|ILLUSTRATE|DIAGRAM):\s*.*?\s*\])/gi);
    
    for (const part of parts) {
        if (!part) continue;
        
        const graphMatch = part.match(/\[GRAPH:\s*(.*?)\s*\]/i);
        const illustrateMatch = part.match(/\[ILLUSTRATE:\s*(.*?)\s*\]/i);
        const diagramMatch = part.match(/\[DIAGRAM:\s*(.*?)\s*\]/i);

        if (graphMatch) {
            blocks.push({ type: 'graph', content: part, tag: graphMatch[1].trim() });
            continue;
        }
        if (illustrateMatch) {
            blocks.push({ type: 'illustration', content: part, tag: illustrateMatch[1].trim() });
            continue;
        }
        if (diagramMatch) {
            blocks.push({ type: 'diagram', content: part, tag: diagramMatch[1].trim() });
            continue;
        }
        
        // Now handle text and tables
        // Regex for markdown table - more robust version
        const tableRegex = /(?:\n|^)(\|.*\|.*\n\|(?:\s*\|?\s*:?-+:?\s*\|?)+\s*\|\n(?:\|.*\|.*\n?)*)/g;
        let lastIndex = 0;
        let match;
        
        while ((match = tableRegex.exec(part)) !== null) {
            // Text before table
            const textBefore = part.substring(lastIndex, match.index).trim();
            if (textBefore) {
                blocks.push({ type: 'text', content: textBefore });
            }
            
            // The table itself
            const tableText = match[1].trim();
            const tableData = parseMarkdownTable(tableText);
            if (tableData) {
                blocks.push({ type: 'table', content: tableText, tableData });
            } else {
                blocks.push({ type: 'text', content: tableText });
            }
            
            lastIndex = tableRegex.lastIndex;
        }
        
        // Remaining text after last table
        const textAfter = part.substring(lastIndex).trim();
        if (textAfter) {
            blocks.push({ type: 'text', content: textAfter });
        }
    }
    
    return blocks;
}
