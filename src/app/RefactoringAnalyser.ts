import cytoscape from "cytoscape";
import { RefactoringChangeSet } from "../refactoring/IRefactoringStrategy";
import { RefactorSuggestion } from "../refactoring/refactorEngine";
import { CycleAnalyser } from "./cycleAnalyser";
import { composedInteractions, EdgeData } from "../graphPreProcessing/graphPreprocessor";
import { DependencyList, RefactoringDescription } from "./RefactoringDescription";


interface SCCStatus {
    status: 'resolved' | 'remains' | 'partially-resolved' | "shifted",
    description: string,
}
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
        this.newSccs = JSON.parse(JSON.stringify(newSccs)) as string[][]
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

    getSCCImpact(originalSCC: string[], resultingSCCs: string[][], changeSet: RefactoringChangeSet): SCCStatus {
        const overlappingSCCs = this.findRelatedSCCs(originalSCC, changeSet.addedNodes.map((n) => n.id), resultingSCCs);
        if (overlappingSCCs.length === 0) {
            return {status: "resolved", description: ""}
        }

        const resultingSCCNodeSize = overlappingSCCs.reduce((acc, a) => acc + a.length, 0)
        const noMoreInCycle = originalSCC.filter((n) => !resultingSCCs.flat().includes(n))
        const newInCycle = resultingSCCs.flat().filter((n) => !originalSCC.includes(n))
        const shift = noMoreInCycle.length > 0 && newInCycle.length > 0

        const sccRemains = overlappingSCCs.some((overlappingSCC) => originalSCC.every((c) => overlappingSCC.includes(c)));
        const overflowDesc = (arr: any[]): string => `${arr.length > 1 ? "+ " + (arr.length -1) + " more": ""}`

        if (sccRemains && newInCycle.length > 0) {
            return {status: "remains", description: `Cycle expanded with ${newInCycle[0]} ${overflowDesc(newInCycle)}`}
        } else if (sccRemains) {
            return {status: "remains", description: ""}
        }

        const sccSplit = overlappingSCCs.length > 1
        if (resultingSCCNodeSize < originalSCC.length || sccSplit) {
            let description = resultingSCCNodeSize < originalSCC.length ? `SCC size reduced from ${originalSCC.length} to ${resultingSCCNodeSize}.` : "";
            if (sccSplit) {description += `Original scc split in ${overlappingSCCs.length}`}
            return {status: "partially-resolved", description: description}
        } else if (shift) {
            const description = noMoreInCycle[0] + overflowDesc(noMoreInCycle) + " is no longer part of the cycle. Shifted cycle contains new node " + newInCycle[0] + overflowDesc(newInCycle)
            return {status: "shifted", description: description}
        }

        return {status: "remains", description: ""}
    }

    findRelatedSCCs(originalSCC: string[], addedNodeIds: string[], refactoredSCCs: string[][]) {
        const relevantNodes = new Set([
            ...originalSCC,
            ...addedNodeIds
        ]);

        return refactoredSCCs.filter(scc =>
            scc.some(nodeId => relevantNodes.has(nodeId))
        );
    }

    analyseRefactoringResult(refactoring: RefactorSuggestion, changeSet: RefactoringChangeSet): RefactoringDescription {
        const refactoringDescription = new RefactoringDescription(refactoring.kind, refactoring.description)
        if (changeSet.description) {refactoringDescription.addDetailsDesription(changeSet.description)}
        this.addChangeSetDescription(refactoringDescription, changeSet)
        
        const overlappingSCCs = this.newSccs.filter((sccn) => sccn.some((c) => this.scc.includes(c)))
        const sccImpact = this.getSCCImpact(this.scc, overlappingSCCs, changeSet)
        if (sccImpact.status === 'resolved') {
            refactoringDescription.addCycleImpact(sccImpact.status, sccImpact.description)
            return refactoringDescription
        }
        
        refactoringDescription.addResultingSCCs(overlappingSCCs.map((overlappingSCC) => new DependencyList(this.cycleAnalyer.getSCCDependencies(this.refactoredCodebase, overlappingSCC))))
        refactoringDescription.addCycleImpact(sccImpact.status, sccImpact.description)

        return refactoringDescription
    }
}