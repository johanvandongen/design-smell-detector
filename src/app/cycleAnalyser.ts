import cytoscape from "cytoscape";
import { CytoscapeToNumericAdapter, GraphService } from '../smell-detection/graphService';
import { edgeIsComposed } from "../graphPreProcessing/graphPreprocessor";
import { DependencyList, DependencyItem, InspectDescription } from "./RefactoringDescription";

export class CycleAnalyser {
    /** @deprecated use getInspectDescription */
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

    /** @deprecated use getCycleDescription */
    public cycleDescription(codebase: cytoscape.Core, cycle: string[]): string {
        let description = ""
        cycle.push(cycle[0])
        for (let i=0; i<cycle.length - 1; i++) {
            const current = codebase.getElementById(cycle[i])
            const next = codebase.getElementById(cycle[i+1])
            const interactions: string[] = []
            current.edgesTo(next).forEach((e) => {
                if (edgeIsComposed(e)) {
                    interactions.push(e.data("interaction"))
                }
            })

            description += `\n ${current.data("properties.simpleName")} -> ${next.data("properties.simpleName")} (${interactions.join(",")})`;
        }

        return description + "\n"
    }

    /** 
     * Follows the cycle and returns a list of dependencies when following the cycle 
     * @param cycle a list of class ids that form a cycle (i.e i should depend on i+1 and last item should depend on first item)
     * */
    private getCycleDespendencies(codebase: cytoscape.Core, cycle: string[]): DependencyList {
        const cycleDescription = new DependencyList();
        cycle.push(cycle[0])
        for (let i=0; i<cycle.length - 1; i++) {
            const current = codebase.getElementById(cycle[i])
            const next = codebase.getElementById(cycle[i+1])
            const interactions: string[] = []
            current.edgesTo(next).forEach((e) => {
                if (edgeIsComposed(e)) {
                    interactions.push(e.data("interaction"))
                }
            })
            cycleDescription.addDependencyDecription({
                source: current.data("properties.simpleName"),
                target: next.data("properties.simpleName"),
                types: interactions
            })
        }

        return cycleDescription
    }

    public getInspectDescription(codebase: cytoscape.Core, scc: string[]): InspectDescription {
        const sccDeps = new DependencyList(this.getSCCDependencies(codebase, scc))
        if (scc.length <= 4) {
            return new InspectDescription(sccDeps, [], scc.length); // Heuristic dont show subcycles if the scc is small
        }

        const [edges, mapToNum, mapToCy, k] = CytoscapeToNumericAdapter.getEdges(codebase)
        const maxSubCyclesShown = 3
        const subCycles = GraphService.getSmallestSubCycles(k, edges, scc.map((n) => mapToNum[n]), maxSubCyclesShown)
        const exampleCycle = subCycles.map((subCycle) => this.getCycleDespendencies(codebase, subCycle.map(n => mapToCy[n])))
        return new InspectDescription(sccDeps, exampleCycle, scc.length);
    }

    /** Returns a list of all the dependencies within the scc */
    public getSCCDependencies(codebase: cytoscape.Core, scc: string[]): DependencyItem[] {
        const dependencies: DependencyItem[] = [];

        for (const sourceId of scc) {
            const source = codebase.getElementById(sourceId);
            for (const targetId of scc) {
                if (sourceId === targetId) continue;

                const target = codebase.getElementById(targetId);
                const types: string[] = [];
                source.edgesTo(target).forEach((edge) => {
                    if (edgeIsComposed(edge)) {
                        types.push(edge.data("interaction"));
                    }
                });

                if (types.length > 0) {
                    dependencies.push({
                        source: source.data("properties.simpleName"),
                        target: target.data("properties.simpleName"),
                        types
                    });
                }
            }
        }

        return dependencies
    }
}