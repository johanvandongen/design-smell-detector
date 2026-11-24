import cytoscape from "cytoscape";
import { RefactoringChangeSet } from "../refactoring/IRefactoringStrategy";
import { RefactorSuggestion } from "../refactoring/refactorEngine";
import { CycleAnalyser } from "./cycleAnalyser";
import { composedInteractions, EdgeData } from "../graphPreProcessing/graphPreprocessor";

/**
 * This class analyses the refactored codebase and provides an explanation as to why a cyclic dependency is resolved or remains
 * @deprecated Use new class {@code RefactoringAnalyser}
 */
export class CDAnalyser {
    private refactoredCodebase;
    private cycleAnalyer = new CycleAnalyser()
    private scc;
    private newSccs;

    constructor(refactoredCodebase: cytoscape.Core, scc: string[], newSccs: string[][]) {
        this.refactoredCodebase = refactoredCodebase
        this.scc = scc
        this.newSccs = newSccs
    }

    private changeSetDescription(changeSet: RefactoringChangeSet) {
        function groupBy<T>(list: Array<T>, fn: any): T[][] {
            let groups: {[key: string]: Array<T>} = {};
            for (let i=0; i<list.length; i++) {
                let group = JSON.stringify(fn(list[i]))
                if (!(group in groups)) {
                    groups[group] = []
                }
                groups[group].push(list[i])
            }
            
            // Convert back to array
            const result = [];
            for (const group in groups) {
                result.push(groups[group])
            }
            return result;
        }

        let changeDescription = "\n"
        let ed: {interest: EdgeData[], noInterest: EdgeData[]} = {interest: [], noInterest: []}
        changeSet.addedEdges.forEach((e) => {
            const ofInterest = (this.scc.includes(e.source) || changeSet.addedNodes.map((n) => n.id).includes(e.source)) && (this.scc.includes(e.target) || changeSet.addedNodes.map((n) => n.id).includes(e.target))
            if (composedInteractions.includes(e.interaction) && ofInterest) {
                ed.interest.push(e);

            } 
            if (composedInteractions.includes(e.interaction) && !ofInterest) {
                ed.noInterest.push(e);
            }
        })

        const getSimpleName = (nodeId: string) => {
            const nodeCy = this.refactoredCodebase.getElementById(nodeId)
            if (nodeCy) { return nodeCy.data("properties.simpleName")}
            return nodeId
        }
        const grouped = groupBy(ed.interest, (item: EdgeData) => [item.source, item.target])
        for (const group in grouped) {
            const interactions = grouped[group].map((item) => item.interaction).join(",")
            changeDescription += `Added ${getSimpleName(grouped[group][0].source)} -> ${getSimpleName(grouped[group][0].target)} (${interactions}) \n`
        }
        changeDescription += ed.noInterest.length > 0 ? `+ ${ed.noInterest.length} more dependencies outside focus set\n` : "\n"

        
        ed = {interest: [], noInterest: []}
        changeSet.removeEdges.forEach((e) => {
            const ofInterest = (this.scc.includes(e.source) || changeSet.addedNodes.map((n) => n.id).includes(e.source)) && (this.scc.includes(e.target) || changeSet.addedNodes.map((n) => n.id).includes(e.target))
            if (composedInteractions.includes(e.interaction) && ofInterest) {
                ed.interest.push(e);

            } 
            if (composedInteractions.includes(e.interaction) && !ofInterest) {
                ed.noInterest.push(e);
            }
        })
        const groupedRemoveEdges = groupBy(ed.interest, (item: EdgeData) => [item.source, item.target])
        for (const group in groupedRemoveEdges) {
            const interactions = groupedRemoveEdges[group].map((item) => item.interaction).join(",")
            changeDescription += `Removed ${getSimpleName(groupedRemoveEdges[group][0].source)} -> ${getSimpleName(groupedRemoveEdges[group][0].target)} (${interactions}) \n`
        }
        changeDescription += ed.noInterest.length > 0 ? `- ${ed.noInterest.length} more dependencies outside focus set` : ""
        return changeDescription
    }

    analyseRefactoringResult(refactoring: RefactorSuggestion, changeSet: RefactoringChangeSet): string {
        const overlappingSCCs = this.newSccs.filter((sccn) => sccn.some((c) => this.scc.includes(c)))
        if (overlappingSCCs.length === 0) {
            return "\n Cycle resolved"
        }

        // const overlappingSCC = overlappingSCCs[0];
        const cycleRemains = overlappingSCCs.some((overlappingSCC) => this.scc.every((c) => overlappingSCC.includes(c)));
        const extraCycles = overlappingSCCs.length >= 2 ? `+ ${overlappingSCCs.length} extra cycles` : ""
        
        const d = this.cycleAnalyer.cycleDescription(this.refactoredCodebase, overlappingSCCs[0])

        const changeDescription = this.changeSetDescription(changeSet)

        // Investigate if its worth checking/explaining why the cycle remains or shifted instead of just listing the new cycle description (maybe analyis with remains but imrpoved because less edges)
        // List dependencies that got added (should be easy, look for composed edges in added)
        if (cycleRemains) {
            // List dependencies that got removed (removing a dependency doesnt remove dependency altogether so list which dependencies still exist)
            // For move method output should be. Cycle still exists since original class has other methods that have dependencies, or og class has parameterizes edges
            // For extract class it should be cycle exits
            console.log(changeSet.removeEdgeIds)
            return "Cycle remains" + extraCycles + "\n" + d +changeDescription
        } else {
            const overlapSCC = overlappingSCCs[0];
            const noMoreInCycle = this.scc.filter((n) => !overlapSCC.includes(n))
            const newInCycle = overlapSCC.filter((n) => !this.scc.includes(n))
            // When cycle is shifted which includes an added node, the output should tell the new dependencies, for example
            // cycle is shifted to added node IOrder, because it depends on og class due to method declaration.
            const shiftExplanation = noMoreInCycle[0] + " is no longer part of the cycle. Shifted cycle contains new node " + newInCycle[0]
            return "Cycle shifted" + extraCycles + "\n" + d + "\n" + shiftExplanation + changeDescription
        }
    }
}