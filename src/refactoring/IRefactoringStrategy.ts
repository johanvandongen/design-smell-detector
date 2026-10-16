import cytoscape from "cytoscape";
import { RefactorSuggestion } from "./refactorEngine";
import { NodeData, EdgeData } from "../graphPreProcessing/graphPreprocessor";

export interface RefactoringChangeSet {
    addedNodes: NodeData[];
    addedEdges: EdgeData[];

    removeEdgeIds: string[];

    updatedNodes: EdgeUpdate[];
    focus: string;
}

interface EdgeUpdate {
    id: string;
    newLabel: string;
}

export interface IRefactoringStrategy<T extends RefactorSuggestion> {
    apply(graph: cytoscape.Core, suggestion: T): RefactoringChangeSet;
}