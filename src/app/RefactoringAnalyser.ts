import cytoscape from "cytoscape";
import { RefactoringChangeSet } from "../refactoring/IRefactoringStrategy";
import { RefactorSuggestion } from "../refactoring/refactorEngine";
import { CycleAnalyser } from "./cycleAnalyser";
import { composedInteractions, EdgeData } from "../graphPreProcessing/graphPreprocessor";
import { RefactoringDescription } from "./RefactoringDescription";

/**
 * This class analyses the refactored codebase and provides an explanation as to why a cyclic dependency is resolved or remains
 */
export class RefactoringAnalyser {
    private refactoredCodebase;
    private cycleAnalyer = new CycleAnalyser()
    private scc;
    private newSccs;

    constructor(refactoredCodebase: cytoscape.Core, scc: string[], newSccs: string[][]) {
        this.refactoredCodebase = refactoredCodebase
        this.scc = scc
        this.newSccs = newSccs
    }

    private groupBy<T>(list: Array<T>, fn: any): T[][] {
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

    private addChangeSetDescription(refactoringDescription: RefactoringDescription, changeSet: RefactoringChangeSet) {
         const getSimpleName = (nodeId: string) => {
            const nodeCy = this.refactoredCodebase.getElementById(nodeId)
            if (nodeCy) { return nodeCy.data("properties.simpleName")}
            return nodeId
        }
        const edgeChangeDescription = (type: 'added' | 'removed') => {
            const edgeList = type === 'added' ? changeSet.addedEdges : changeSet.removeEdges;
            let ed: {interest: EdgeData[], noInterest: EdgeData[]} = {interest: [], noInterest: []}
            edgeList.forEach((e) => {
                const ofInterest = (this.scc.includes(e.source) || changeSet.addedNodes.map((n) => n.id).includes(e.source)) && (this.scc.includes(e.target) || changeSet.addedNodes.map((n) => n.id).includes(e.target))
                if (composedInteractions.includes(e.interaction) && ofInterest) {
                    ed.interest.push(e);

                } 
                if (composedInteractions.includes(e.interaction) && !ofInterest) {
                    ed.noInterest.push(e);
                }
            })
            const grouped = this.groupBy(ed.interest, (item: EdgeData) => [item.source, item.target])
            for (const group in grouped) {
                const interactions = grouped[group].map((item) => item.interaction)
                refactoringDescription.appendChangeDescription(type, {
                    source: getSimpleName(grouped[group][0].source),
                    target: getSimpleName(grouped[group][0].target),
                    types: interactions,
                })
            }
            const groupedNoInterest = this.groupBy(ed.noInterest, (item: EdgeData) => [item.source, item.target])
            for (const group in groupedNoInterest) {
                const interactions = groupedNoInterest[group].map((item) => item.interaction)
                refactoringDescription.appendChangeDescription(type, {
                    source: getSimpleName(groupedNoInterest[group][0].source),
                    target: getSimpleName(groupedNoInterest[group][0].target),
                    types: interactions,
                }, false)
            }
        }
        edgeChangeDescription('added')
        edgeChangeDescription('removed')
    }

    analyseRefactoringResult2(refactoring: RefactorSuggestion, changeSet: RefactoringChangeSet): RefactoringDescription {
        const refactoringDescription = new RefactoringDescription(refactoring.kind, refactoring.description)
        if (changeSet.description) {refactoringDescription.addDetailsDesription(changeSet.description)}
        const overlappingSCCs = this.newSccs.filter((sccn) => sccn.some((c) => this.scc.includes(c)))
        
        if (overlappingSCCs.length === 0) {
            refactoringDescription.addCycleImpact('resolved', "")
        }

        const cycleRemains = overlappingSCCs.some((overlappingSCC) => this.scc.every((c) => overlappingSCC.includes(c)));
        const extraCycles = overlappingSCCs.length >= 2 ? `+ ${overlappingSCCs.length} extra cycles` : ""
        
        refactoringDescription.addResultingCycle(this.cycleAnalyer.getCycleDescription(this.refactoredCodebase, overlappingSCCs[0]))

        this.addChangeSetDescription(refactoringDescription, changeSet)

        if (cycleRemains) {
            console.log(changeSet.removeEdgeIds)
            refactoringDescription.addCycleImpact('remains', "")
            // return "Cycle remains" + extraCycles + "\n" + d +changeDescription
        } else {
            const overlapSCC = overlappingSCCs[0];
            const noMoreInCycle = this.scc.filter((n) => !overlapSCC.includes(n))
            const newInCycle = overlapSCC.filter((n) => !this.scc.includes(n))
            // When cycle is shifted which includes an added node, the output should tell the new dependencies, for example
            // cycle is shifted to added node IOrder, because it depends on og class due to method declaration.
            const shiftExplanation = noMoreInCycle[0] + " is no longer part of the cycle. Shifted cycle contains new node " + newInCycle[0]
            refactoringDescription.addCycleImpact('shifted', shiftExplanation)
            // return "Cycle shifted" + extraCycles + "\n" + d + "\n" + shiftExplanation + changeDescription
        }
        return refactoringDescription
    }
}