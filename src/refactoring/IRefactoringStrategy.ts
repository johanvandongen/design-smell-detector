import cytoscape from "cytoscape";
import { RefactorSuggestion } from "./refactorEngine";
import { NodeData, EdgeData } from "../graphPreProcessing/graphPreprocessor";

export interface RefactoringChangeSet {
    addedNodes: NodeData[];
    addedEdges: EdgeData[];

    removeEdgeIds: string[];
    removeNodeIds: string[];

    updatedNodes: EdgeUpdate[];
    focus: string;
    description?: string;
}

interface EdgeUpdate {
    id: string;
    newLabel: string;
}

export abstract class IRefactoringStrategy<T extends RefactorSuggestion> {
    static addEdge2(cy: cytoscape.Core, changeSet: RefactoringChangeSet, interaction: string, source: string, sourceClass: string, target: string, targetClass: string) {
        //TODO
    }
    /** Adds the edge source-target, and also adds the composed edge between the parent classes */
    static addEdge(cy: cytoscape.Core, changeSet: RefactoringChangeSet, edge: cytoscape.SingularElementReturnValue, source: string, sourceClass: string, target: string, targetClass: string) {
        if (source && target) {
            changeSet.addedEdges.push({
                interaction: edge.data("interaction"),
                group: "edges",
                label: edge.data("label"),
                source: source,
                target: target
            })
        }

        // Add composed edge
        const interactions: { [key: string]: string } = {
            "returns": "produces",
            "parameterizes": "accepts",
            "typed": "holds",
            "invokes": "calls"
        }

        const interaction:string = edge.data("interaction")
        if (!Object.hasOwn(interactions, interaction)) {
            throw Error ("unknown interaction")
        }
        
        // No self composed edges
        if (sourceClass === targetClass) {
            return
        }
        const classLevelInteraction: string = interactions[interaction]
        const newEdgeId = sourceClass + "-" + classLevelInteraction + "-" + targetClass;
        const sourceCy = cy.getElementById(sourceClass)
        const targetCy = cy.getElementById(sourceClass)
        const composedEdgeAlreadyInGraph = sourceCy && targetCy && cy.edges().filter((e) => e.source().id() === sourceClass && e.target().id() === targetClass).length > 0
        if (!changeSet.addedEdges.some((e) => e.id === newEdgeId) && !composedEdgeAlreadyInGraph) {
            changeSet.addedEdges.push({
                id: newEdgeId,
                interaction: classLevelInteraction,
                group: "edges",
                label: classLevelInteraction,
                source: sourceClass,
                target: targetClass
            })
            changeSet.description += `Added ${sourceCy ? sourceCy.data("properties.simpleName") : sourceClass} ${classLevelInteraction} ${targetCy ? targetCy.data("properties.simpleName") : targetClass}`
        }
    }

    abstract apply(graph: cytoscape.Core, suggestion: T): RefactoringChangeSet;
}