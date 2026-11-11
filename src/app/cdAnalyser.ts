import cytoscape from "cytoscape";
import { RefactoringChangeSet } from "../refactoring/IRefactoringStrategy";
import { RefactorSuggestion } from "../refactoring/refactorEngine";

/**
 * This class analyses the refactored codebase and provides an explanation as to why a cyclic dependency is resolved or remains
 */
export class CDAnalyser {
    private refactoredCodebase;
    private scc;
    private newSccs;

    constructor(refactoredCodebase: cytoscape.Core, scc: string[], newSccs: string[][]) {
        this.refactoredCodebase = refactoredCodebase
        this.scc = scc
        this.newSccs = newSccs
    }

    analyseRefactoringResult(refactoring: RefactorSuggestion, changeSet: RefactoringChangeSet): string {
        const overlappingSCCs = this.newSccs.filter((sccn) => sccn.some((c) => this.scc.includes(c)))
        if (overlappingSCCs.length === 0) {
            return "\n Cycle resolved"
        }

        // const overlappingSCC = overlappingSCCs[0];
        const cycleRemains = overlappingSCCs.some((overlappingSCC) => this.scc.every((c) => overlappingSCC.includes(c)));
        const extraCycles = overlappingSCCs.length >= 2 ? `+ ${overlappingSCCs.length} extra cycles` : ""
        
        // List dependencies that got added (should be easy, look for composed edges in added)
        if (cycleRemains) {
            // List dependencies that got removed (removing a dependency doesnt remove dependency altogether so list which dependencies still exist)
            // For move method output should be. Cycle still exists since original class has other methods that have dependencies, or og class has parameterizes edges
            // For extract class it should be cycle exits
            console.log(changeSet.removeEdgeIds)
            return "Cycle remains" + extraCycles
        } else {
            // When cycle is shifted which includes an added node, the output should tell the new dependencies, for example
            // cycle is shifted to added node IOrder, because it depends on og class due to method declaration.
            return "Cycle shifted" + extraCycles
        }
    }
}