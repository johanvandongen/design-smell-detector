import { RefactoringChangeSet } from "../refactoring/IRefactoringStrategy";
import { RefactorSuggestion } from "../refactoring/refactorEngine";
import { CycleAnalyser } from "./cycleAnalyser";
import { RefactoringAnalyser } from "./RefactoringAnalyser";
import { DependencyItem } from "./RefactoringDescription";

export class RefactorRanker {

    rank(orginalCodebase: cytoscape.Core, refactoredCodebase: cytoscape.Core, scc: string[], newSccs: string[][], refactoring: RefactorSuggestion, changeSet: RefactoringChangeSet) {
        const refactorAnalyser = new RefactoringAnalyser(refactoredCodebase, scc, newSccs)
        const overlappingSCCs = refactorAnalyser.findRelatedSCCs(scc, changeSet.addedNodes.map((n) => n.id), newSccs);
        if (overlappingSCCs.length === 0) {
            return 100;
        }

        const largestResultingSCC = Math.max(...overlappingSCCs.map((s) => s.length))

        const cycleAnalyser = new CycleAnalyser()
        const calcBurden = (dependencies: DependencyItem[]) => dependencies.reduce((sum, dependency) => sum + dependency.types.length, 0)
        const burdenBefore = calcBurden(cycleAnalyser.getSCCDependencies(orginalCodebase, scc))
        const burdenAfter = overlappingSCCs.reduce((sum, curr) => sum + calcBurden(cycleAnalyser.getSCCDependencies(refactoredCodebase, curr)), 0)

        const dependencyImprovement = (burdenBefore - burdenAfter) / Math.max(burdenBefore, 1);
        const cyclicNodesImprovement = (scc.length - overlappingSCCs.reduce((acc, a) => acc + a.length, 0)) / Math.max(scc.length, 1)
        const largestSCCImprovement = (scc.length - largestResultingSCC) / Math.max(scc.length, 1)

        const weights = {
            dependencyBurden: 0.50,
            cyclicNodes: 0.25,
            largestSCC: 0.25,
        };
        
        const weightedImprovement = dependencyImprovement * weights.dependencyBurden + cyclicNodesImprovement * weights.cyclicNodes + largestSCCImprovement * weights.largestSCC
        const score = Math.round(Math.max(0, Math.min(100, 50 + weightedImprovement * 50)));
        return score

    }
}
