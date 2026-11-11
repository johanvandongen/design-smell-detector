import cytoscape from "cytoscape";
import { CytoscapeToNumericAdapter, GraphService } from '../smell-detection/graphService';

export class CycleAnalyser {
    public getDescription(codebase: cytoscape.Core, scc: string[]) {
        const [edges, mapToNum, mapToCy, k] = CytoscapeToNumericAdapter.getEdges(codebase)

        const maxSubCyclesShown = 5
        const subCycles = GraphService.getSmallestSubCycles(k, edges, scc.map((n) => mapToNum[n]), maxSubCyclesShown)

        let description = ""
        for (let i=0; i<subCycles.length; i++) {
            description += subCycles.length > 1 ? `\nSub Cycle ${i+1}\n` : ""
            description += this.cycleDescription(codebase, subCycles[i].map(n => mapToCy[n]))
        }

        return description
    }

    private cycleDescription(codebase: cytoscape.Core, cycle: string[]): string {
        let description = ""
        cycle.push(cycle[0])
        for (let i=0; i<cycle.length - 1; i++) {
            const current = codebase.getElementById(cycle[i])
            const next = codebase.getElementById(cycle[i+1])
            const interactions: string[] = []
            current.edgesTo(next).forEach((e) => {
                interactions.push(e.data("interaction"))
            })

            description += `\n ${current.data("properties.simpleName")} -> ${next.data("properties.simpleName")} (${interactions.join(",")})`;
        }

        return description + "\n"
    }
}